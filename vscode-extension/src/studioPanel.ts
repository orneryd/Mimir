import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages the Studio webview panel lifecycle
 */
export class StudioPanel {
  public static currentPanel: StudioPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _apiUrl: string; // Not readonly - can be updated via config changes
  private _disposables: vscode.Disposable[] = [];
  private _getAuthHeaders: () => Promise<Record<string, string>>;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, apiUrl: string, getAuthHeaders: () => Promise<Record<string, string>>) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._apiUrl = apiUrl;
    this._getAuthHeaders = getAuthHeaders;

    // Set HTML content
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      message => this._handleMessage(message),
      null,
      this._disposables
    );

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Note: Preambles are loaded after webview sends 'ready' message
  }

  /**
   * Create or show the Studio panel
   */
  public static createOrShow(extensionUri: vscode.Uri, apiUrl: string, getAuthHeaders: () => Promise<Record<string, string>>) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If panel exists, reveal it
    if (StudioPanel.currentPanel) {
      StudioPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      'mimirStudio',
      'Mimir Workflow Studio',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist')
        ]
      }
    );

    StudioPanel.currentPanel = new StudioPanel(panel, extensionUri, apiUrl, getAuthHeaders);
  }

  /**
   * Revive panel from serialization (after VSCode restart)
   */
  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, state: any, apiUrl: string, getAuthHeaders: () => Promise<Record<string, string>>) {
    StudioPanel.currentPanel = new StudioPanel(panel, extensionUri, apiUrl, getAuthHeaders);
  }

  /**
   * Update configuration for all panels
   */
  public static updateAllPanels(config: { apiUrl: string }) {
    if (StudioPanel.currentPanel) {
      StudioPanel.currentPanel._apiUrl = config.apiUrl;
      // Optionally notify webview of config change
      StudioPanel.currentPanel._panel.webview.postMessage({
        command: 'configUpdated',
        config
      });
    }
  }

  /**
   * Handle messages from webview
   */
  private async _handleMessage(message: any) {
    console.log('📨 Studio message:', message.command);

    switch (message.command) {
      case 'ready':
        // Webview is ready - load preambles
        console.log('✅ Studio webview ready - loading preambles');
        await this._loadPreambles();
        break;

      case 'generatePlan':
        await this._generatePlan(message.prompt);
        break;

      case 'saveWorkflow':
        await this._saveWorkflow(message.workflow);
        break;

      case 'importWorkflow':
        await this._importWorkflow();
        break;

      case 'executeWorkflow':
        await this._executeWorkflow(message.workflow);
        break;

      case 'downloadDeliverables':
        await this._downloadDeliverables(message.executionId, message.deliverables);
        break;

      case 'loadWorkflow':
        await this._loadWorkflow(message.filePath);
        break;

      case 'createAgent':
        await this._createAgent(message.roleDescription, message.agentType, message.useAgentinator);
        break;

      case 'error':
        vscode.window.showErrorMessage(`Studio Error: ${message.error}`);
        break;

      default:
        console.warn('Unknown message command:', message.command);
    }
  }

  /**
   * Get .mimir/workflows directory path
   */
  private _getWorkflowsDir(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }
    return path.join(workspaceFolder.uri.fsPath, '.mimir', 'workflows');
  }

  /**
   * Ensure .mimir/workflows directory exists
   */
  private _ensureWorkflowsDir(): string | null {
    const workflowsDir = this._getWorkflowsDir();
    if (!workflowsDir) {
      vscode.window.showErrorMessage('No workspace folder open');
      return null;
    }

    try {
      if (!fs.existsSync(workflowsDir)) {
        fs.mkdirSync(workflowsDir, { recursive: true });
        console.log(`✅ Created workflows directory: ${workflowsDir}`);
      }
      return workflowsDir;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create workflows directory: ${error.message}`);
      return null;
    }
  }

  /**
   * List all workflows in .mimir/workflows with metadata
   */
  private _listWorkflows(): Array<{ label: string; description: string; detail: string; fileName: string }> {
    const workflowsDir = this._getWorkflowsDir();
    if (!workflowsDir || !fs.existsSync(workflowsDir)) {
      console.log('📁 Workflows directory not found:', workflowsDir);
      return [];
    }

    try {
      const files = fs.readdirSync(workflowsDir)
        .filter(file => file.endsWith('.json'))
        .sort();
      
      console.log(`📋 Found ${files.length} workflow files in ${workflowsDir}:`, files);
      
      return files.map(fileName => {
        const filePath = path.join(workflowsDir, fileName);
        let taskCount = 0;
        let modified = '';
        
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const workflow = JSON.parse(content);
          taskCount = workflow.tasks?.length || 0;
          
          const stats = fs.statSync(filePath);
          modified = stats.mtime.toLocaleDateString();
        } catch (error) {
          console.warn(`Failed to read workflow metadata for ${fileName}:`, error);
        }
        
        return {
          label: `📄 ${fileName}`,
          description: `${taskCount} task(s)`,
          detail: `Modified: ${modified}`,
          fileName
        };
      });
    } catch (error: any) {
      console.error('❌ Failed to list workflows:', error);
      return [];
    }
  }

  /**
   * Save workflow to .mimir/workflows directory
   */
  private async _saveWorkflow(workflow: any) {
    const workflowsDir = this._ensureWorkflowsDir();
    if (!workflowsDir) {
      return;
    }

    const fileName = await vscode.window.showInputBox({
      prompt: 'Workflow file name',
      value: 'my-workflow.json',
      placeHolder: 'e.g., feature-implementation.json',
      validateInput: (value) => {
        if (!value) {
          return 'File name is required';
        }
        if (!value.endsWith('.json')) {
          return 'File must end with .json';
        }
        return null;
      }
    });

    if (!fileName) {
      return;
    }

    const filePath = path.join(workflowsDir, fileName);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2), 'utf-8');
      vscode.window.showInformationMessage(`✅ Workflow saved to .mimir/workflows/${fileName}`);
      
      // Open the file
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to save workflow: ${error.message}`);
    }
  }

  /**
   * Import/Load workflow from .mimir/workflows directory
   */
  private async _importWorkflow() {
    console.log('🔍 Import workflow requested');
    
    const workflowsDir = this._getWorkflowsDir();
    if (!workflowsDir) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    console.log(`📂 Workflows directory: ${workflowsDir}`);

    const workflows = this._listWorkflows();
    
    if (workflows.length === 0) {
      vscode.window.showInformationMessage('No workflows found in .mimir/workflows/. Save a workflow first.');
      return;
    }

    console.log(`📋 Showing QuickPick with ${workflows.length} workflows`);

    // Show quick pick menu with enhanced metadata
    const selected = await vscode.window.showQuickPick(workflows, {
      placeHolder: 'Select a workflow to load',
      title: `📁 Load Workflow (${workflows.length} available)`,
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (!selected) {
      console.log('❌ User cancelled workflow selection');
      return;
    }

    console.log(`✅ User selected: ${selected.fileName}`);
    const filePath = path.join(workflowsDir, selected.fileName);
    await this._loadWorkflow(filePath);
  }

  /**
   * Generate plan using PM agent
   */
  private async _generatePlan(prompt: string) {
    try {
      vscode.window.showInformationMessage('🤖 PM Agent generating task plan...');
      
      const authHeaders = await this._getAuthHeaders();
      const response = await fetch(`${this._apiUrl}/api/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const plan = await response.json() as { tasks?: Array<any> };
      
      // Send plan to webview
      this._panel.webview.postMessage({
        command: 'planGenerated',
        plan
      });
      
      vscode.window.showInformationMessage(`✅ Generated ${plan?.tasks?.length || 0} tasks!`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`❌ Plan generation failed: ${error.message}`);
      this._panel.webview.postMessage({
        command: 'planGenerationFailed',
        error: error.message
      });
    }
  }

  /**
   * Execute workflow
   */
  private async _executeWorkflow(workflow: any) {
    try {
      // Notify webview that execution is starting
      this._panel.webview.postMessage({
        command: 'executionStarted'
      });
      
      vscode.window.showInformationMessage(`🚀 Executing workflow with ${workflow.tasks?.length || 0} tasks...`);
      
      // Get workspace folder for execution context
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const workingDirectory = workspaceFolder?.uri.fsPath;
      
      // Call the orchestration API
      const authHeaders = await this._getAuthHeaders();
      const response = await fetch(`${this._apiUrl}/api/execute-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          tasks: workflow.tasks || [],
          working_directory: workingDirectory
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      const result = await response.json() as { executionId?: string };
      
      if (result.executionId) {
        // Connect to SSE stream for real-time updates
        this._connectToExecutionStream(result.executionId);
      }
      
      vscode.window.showInformationMessage(`✅ Workflow started! Execution ID: ${result.executionId || 'N/A'}`);
    } catch (error: any) {
      // Notify webview that execution failed
      this._panel.webview.postMessage({
        command: 'executionComplete',
        success: false,
        error: error.message
      });
      
      vscode.window.showErrorMessage(`❌ Workflow execution failed: ${error.message}`);
    }
  }

  /**
   * Download deliverables from a workflow execution
   */
  private async _downloadDeliverables(executionId: string, deliverables: any[]) {
    try {
      if (!deliverables || deliverables.length === 0) {
        vscode.window.showWarningMessage('No deliverables to download');
        return;
      }

      // Ask user where to save deliverables
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const defaultUri = workspaceFolder 
        ? vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'deliverables'))
        : undefined;

      const saveLocation = await vscode.window.showSaveDialog({
        defaultUri,
        saveLabel: 'Save Deliverables To',
        filters: {
          'All Files': ['*']
        }
      });

      if (!saveLocation) {
        return; // User cancelled
      }

      const saveDir = saveLocation.fsPath;

      // Create deliverables directory if needed
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      // Download each deliverable
      let successCount = 0;
      let failCount = 0;

      for (const deliverable of deliverables) {
        try {
          const authHeaders = await this._getAuthHeaders();
          const response = await fetch(
            `${this._apiUrl}/api/execution-deliverable/${executionId}/${encodeURIComponent(deliverable.filename)}`,
            { headers: authHeaders }
          );

          if (!response.ok) {
            console.error(`Failed to download ${deliverable.filename}: ${response.status}`);
            failCount++;
            continue;
          }

          const content = await response.text();
          const filePath = path.join(saveDir, deliverable.filename);
          
          // Ensure subdirectories exist
          const fileDir = path.dirname(filePath);
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }

          fs.writeFileSync(filePath, content, 'utf-8');
          successCount++;
        } catch (error: any) {
          console.error(`Error downloading ${deliverable.filename}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        vscode.window.showInformationMessage(
          `✅ Downloaded ${successCount} deliverable${successCount !== 1 ? 's' : ''} to ${saveDir}${failCount > 0 ? ` (${failCount} failed)` : ''}`
        );
      } else {
        vscode.window.showErrorMessage(`❌ Failed to download deliverables`);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to download deliverables: ${error.message}`);
    }
  }

  /**
   * Connect to the execution SSE stream for real-time updates
   */
  private async _connectToExecutionStream(executionId: string) {
    console.log(`🔌 Connecting to SSE stream: ${this._apiUrl}/api/execution-stream/${executionId}`);
    
    // Get auth headers
    const authHeaders = await this._getAuthHeaders();
    const authHeader = authHeaders['Authorization'];
    let streamUrl = `${this._apiUrl}/api/execution-stream/${executionId}`;
    
    // For SSE, we need to pass the token as a query parameter since EventSource doesn't support custom headers
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      streamUrl += `?access_token=${encodeURIComponent(token)}`;
    }
    
    // Use fetch to get the response stream
    fetch(streamUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        const processStream = () => {
          reader?.read().then(({ done, value }) => {
            if (done) {
              console.log('✅ SSE stream closed');
              return;
            }
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            let eventType = '';
            let eventData = '';
            
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                eventData = line.substring(5).trim();
              } else if (line === '') {
                // Empty line = end of message
                if (eventType && eventData) {
                  this._handleSSEEvent(eventType, eventData, executionId);
                  eventType = '';
                  eventData = '';
                }
              }
            }
            
            processStream();
          }).catch((error: any) => {
            console.error('❌ SSE stream error:', error);
          });
        };
        
        processStream();
      })
      .catch((error: any) => {
        console.error('❌ Failed to connect to SSE stream:', error);
      });
  }

  /**
   * Handle SSE events from execution stream
   */
  private _handleSSEEvent(eventType: string, eventData: string, executionId: string) {
    try {
      const data = JSON.parse(eventData);
      console.log(`📡 SSE Event [${eventType}]:`, data);
      
      switch (eventType) {
        case 'init':
          // Initial state
          if (data.taskStatuses) {
            Object.entries(data.taskStatuses).forEach(([taskId, status]) => {
              this._panel.webview.postMessage({
                command: 'taskStatusUpdate',
                taskId,
                status
              });
            });
          }
          break;
          
        case 'task-start':
          this._panel.webview.postMessage({
            command: 'taskStatusUpdate',
            taskId: data.taskId,
            status: 'executing'
          });
          break;
          
        case 'worker-start':
          // Show notification for worker phase start
          vscode.window.showInformationMessage(data.message || `🤖 Worker executing: ${data.taskTitle}`);
          break;
          
        case 'worker-complete':
          // Show notification for worker phase complete
          vscode.window.showInformationMessage(data.message || `✅ Worker completed: ${data.taskTitle}`);
          break;
          
        case 'qc-start':
          // Show notification for QC verification start
          vscode.window.showInformationMessage(data.message || `🔍 QC verifying: ${data.taskTitle}`);
          break;
          
        case 'qc-complete':
          // Show notification for QC verification result
          if (data.passed) {
            vscode.window.showInformationMessage(data.message || `✅ QC passed: ${data.taskTitle} (Score: ${data.score}/100)`);
          } else {
            // Show error with gap information
            const gapSummary = data.gap ? `\n\n📋 Issues:\n${data.gap.issues.join('\n')}\n\n🔧 Required fixes:\n${data.gap.requiredFixes.join('\n')}` : '';
            vscode.window.showWarningMessage(
              data.message || `❌ QC failed: ${data.taskTitle} (Score: ${data.score}/100)${gapSummary}`
            );
          }
          break;
          
        case 'task-complete':
          this._panel.webview.postMessage({
            command: 'taskStatusUpdate',
            taskId: data.taskId,
            status: 'completed'
          });
          break;
          
        case 'task-fail':
          this._panel.webview.postMessage({
            command: 'taskStatusUpdate',
            taskId: data.taskId,
            status: 'failed'
          });
          break;
          
        case 'execution-complete':
          this._panel.webview.postMessage({
            command: 'executionComplete',
            success: data.status === 'completed',
            executionId,
            deliverables: data.deliverables || []
          });
          vscode.window.showInformationMessage(
            `✅ Workflow completed! Success: ${data.successful || 0}, Failed: ${data.failed || 0}${data.deliverables?.length > 0 ? `, Deliverables: ${data.deliverables.length}` : ''}`
          );
          break;
          
        case 'error':
          this._panel.webview.postMessage({
            command: 'executionComplete',
            success: false,
            error: data.message
          });
          vscode.window.showErrorMessage(`❌ Execution error: ${data.message}`);
          break;
      }
    } catch (error) {
      console.error('Failed to parse SSE event data:', error);
    }
  }

  /**
   * Load workflow from file
   */
  private async _loadWorkflow(filePath: string) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const workflow = JSON.parse(content);
      
      const fileName = path.basename(filePath);
      const taskCount = workflow.tasks?.length || 0;
      
      // Send workflow to webview
      this._panel.webview.postMessage({
        command: 'workflowLoaded',
        workflow
      });
      
      vscode.window.showInformationMessage(`✅ Loaded workflow: ${fileName} (${taskCount} tasks)`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to load workflow: ${error.message}`);
    }
  }

  /**
   * Load available preambles from server (Neo4j agent templates)
   */
  private async _loadPreambles() {
    try {
      console.log(`🔍 Fetching agents from: ${this._apiUrl}/api/agents?limit=100&offset=0`);
      const authHeaders = await this._getAuthHeaders();
      const response = await fetch(`${this._apiUrl}/api/agents?limit=100&offset=0`, { headers: authHeaders });
      
      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to load agents (${response.status}):`, errorText);
        vscode.window.showErrorMessage(`Failed to load agents: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json() as { agents: Array<{ id: string; name: string; role: string; agentType: string }> };
      console.log(`📚 Raw API response:`, JSON.stringify(data, null, 2));
      
      // Convert agent templates to preamble format for dropdown
      const preambles = (data.agents || []).map(agent => ({
        name: agent.id,
        title: agent.name,
        description: agent.role,
        agentType: agent.agentType || 'worker' // Include agent type for filtering
      }));
      
      console.log(`🔄 Converted ${preambles.length} preambles:`, preambles.map(p => `${p.name} (${p.agentType})`));
      
      // Send preambles to webview
      this._panel.webview.postMessage({
        command: 'preamblesLoaded',
        preambles
      });
      
      console.log(`✅ Sent ${preambles.length} agent templates to webview`);
    } catch (error: any) {
      console.error('❌ Exception loading agents:', error);
      vscode.window.showErrorMessage(`Failed to load agents: ${error.message}`);
    }
  }

  /**
   * Create a new agent using Agentinator
   */
  private async _createAgent(roleDescription: string, agentType: 'worker' | 'qc', useAgentinator: boolean) {
    try {
      console.log(`🤖 Creating ${agentType} agent: ${roleDescription.substring(0, 50)}...`);
      vscode.window.showInformationMessage(`🤖 Creating ${agentType} agent...`);
      
      const authHeaders = await this._getAuthHeaders();
      const response = await fetch(`${this._apiUrl}/api/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          roleDescription,
          agentType,
          useAgentinator
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to create agent (${response.status}):`, errorText);
        vscode.window.showErrorMessage(`Failed to create agent: ${response.status} ${response.statusText}`);
        return;
      }

      const result = await response.json() as any;
      console.log(`✅ Agent created:`, result);
      
      vscode.window.showInformationMessage(`✅ Agent created: ${result.agent?.name || 'New Agent'}`);
      
      // Reload agents to update the library
      await this._loadPreambles();
      
    } catch (error: any) {
      console.error('❌ Exception creating agent:', error);
      vscode.window.showErrorMessage(`Failed to create agent: ${error.message}`);
    }
  }

  /**
   * Dispose the panel
   */
  public dispose() {
    StudioPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Generate HTML for webview
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'studio.js')
    );

    // Use nonce for security
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mimir Studio</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate random nonce for CSP
   */
  private _getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
