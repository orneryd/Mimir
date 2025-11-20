import * as vscode from 'vscode';
import * as path from 'path';

export class IntelligencePanel {
  public static currentPanel: IntelligencePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _apiUrl: string;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, apiUrl: string) {
    this._panel = panel;
    this._apiUrl = apiUrl;

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, extensionUri);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'ready':
            // Webview is loaded and ready - send config
            this._panel.webview.postMessage({
              command: 'config',
              apiUrl: this._apiUrl
            });
            break;
          case 'selectFolder':
            await this._handleSelectFolder();
            break;
          case 'showMessage':
            this._showMessage(message.type, message.message);
            break;
          case 'confirmRemoveFolder':
            await this._handleConfirmRemoveFolder(message.path);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public static createOrShow(extensionUri: vscode.Uri, apiUrl: string) {
    // If we already have a panel, show it
    if (IntelligencePanel.currentPanel) {
      IntelligencePanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'mimirIntelligence',
      '🧠 Mimir Code Intelligence',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist')
        ]
      }
    );

    IntelligencePanel.currentPanel = new IntelligencePanel(panel, extensionUri, apiUrl);
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, state: any, apiUrl: string) {
    IntelligencePanel.currentPanel = new IntelligencePanel(panel, extensionUri, apiUrl);
  }

  public static updateAllPanels(config: { apiUrl: string }) {
    if (IntelligencePanel.currentPanel) {
      IntelligencePanel.currentPanel._apiUrl = config.apiUrl;
      IntelligencePanel.currentPanel._panel.webview.postMessage({
        command: 'config',
        apiUrl: config.apiUrl
      });
    }
  }

  private async _handleSelectFolder() {
    // Get workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('❌ No workspace folder is open');
      return;
    }

    // Show folder picker
    const folderUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Folder to Index',
      defaultUri: workspaceFolders[0].uri
    });

    if (!folderUri || folderUri.length === 0) {
      return; // User cancelled
    }

    const selectedPath = folderUri[0].fsPath;

    // Fetch environment config from Mimir server
    let serverConfig: { hostWorkspaceRoot: string; workspaceRoot: string; home: string } | null = null;
    try {
      const response = await fetch(`${this._apiUrl}/api/index-config`);
      if (response.ok) {
        serverConfig = await response.json() as { hostWorkspaceRoot: string; workspaceRoot: string; home: string };
        console.log('[IntelligencePanel] Fetched server config:', serverConfig);
      }
    } catch (error) {
      console.error('[IntelligencePanel] Failed to fetch server config:', error);
    }

    // Validate path is within workspace
    const validation = this._validateAndTranslatePath(selectedPath, workspaceFolders, serverConfig);
    
    if (!validation.isValid) {
      vscode.window.showErrorMessage(
        `❌ Cannot index folder: ${validation.error}\n\nFolder: ${selectedPath}\n\nOnly folders within your mounted workspace can be indexed.`,
        { modal: true }
      );
      return;
    }

    // Show progress indicator
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Indexing Folder',
      cancellable: false
    }, async (progress) => {
      progress.report({ message: 'Sending request to Mimir server...' });

      try {
        // Call API to add folder
        const response = await fetch(`${this._apiUrl}/api/index-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: validation.containerPath, // Use translated container path
            hostPath: selectedPath, // Also send original host path for reference
            recursive: true,
            generate_embeddings: true
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        progress.report({ message: 'Folder added successfully!' });

        vscode.window.showInformationMessage(
          `✅ Folder added to indexing:\n\nHost: ${selectedPath}\nContainer: ${validation.containerPath}\n\nIndexing will begin shortly.`
        );

        // Refresh the webview
        this._panel.webview.postMessage({ command: 'refresh' });

      } catch (error: any) {
        vscode.window.showErrorMessage(`❌ Failed to add folder: ${error.message}`);
      }
    });
  }

  private _validateAndTranslatePath(
    hostPath: string, 
    workspaceFolders: readonly vscode.WorkspaceFolder[],
    serverConfig: { hostWorkspaceRoot: string; workspaceRoot: string; home: string } | null = null
  ): {
    isValid: boolean;
    error?: string;
    containerPath?: string;
  } {
    // Get environment variables for path translation
    // Use server's HOST_WORKSPACE_ROOT value, but LOCAL HOME for expansion
    let hostWorkspaceRoot = serverConfig?.hostWorkspaceRoot || process.env.HOST_WORKSPACE_ROOT || '';
    const containerWorkspaceRoot = serverConfig?.workspaceRoot || process.env.WORKSPACE_ROOT || '/workspace';
    // ALWAYS use local HOME directory (VSCode runs on host, not in container)
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    console.log('[IntelligencePanel] HOST_WORKSPACE_ROOT:', hostWorkspaceRoot || '(not set)');
    console.log('[IntelligencePanel] HOME (local):', homeDir || '(not set)');
    console.log('[IntelligencePanel] HOME (server):', serverConfig?.home || '(not set)');
    console.log('[IntelligencePanel] Selected path:', hostPath);
    console.log('[IntelligencePanel] Using server config:', serverConfig ? 'yes' : 'no');

    // Expand tilde (~) in HOST_WORKSPACE_ROOT if present
    // Use LOCAL HOME directory for expansion (not container's)
    if (hostWorkspaceRoot.startsWith('~/') || hostWorkspaceRoot === '~') {
      if (homeDir) {
        hostWorkspaceRoot = hostWorkspaceRoot.replace(/^~/, homeDir);
        console.log('[IntelligencePanel] Expanded HOST_WORKSPACE_ROOT to:', hostWorkspaceRoot);
      }
    }

    // Normalize paths
    const normalizedHostPath = path.normalize(hostPath);
    console.log('[IntelligencePanel] Normalized path:', normalizedHostPath);

    // Detect Windows (case-insensitive filesystem)
    const isWindows = process.platform === 'win32';

    // If HOST_WORKSPACE_ROOT is set, validate against it (Docker/container scenario)
    if (hostWorkspaceRoot) {
      const normalizedHostRoot = path.normalize(hostWorkspaceRoot);
      
      // Check if the selected path is within the mounted workspace (case-insensitive on Windows)
      const pathToCheck = isWindows ? normalizedHostPath.toLowerCase() : normalizedHostPath;
      const rootToCheck = isWindows ? normalizedHostRoot.toLowerCase() : normalizedHostRoot;
      
      if (!pathToCheck.startsWith(rootToCheck)) {
        return {
          isValid: false,
          error: `Folder is outside the mounted workspace.\n\nMounted workspace: ${hostWorkspaceRoot} (expanded)\nSelected folder: ${hostPath}\n\nOnly folders within the mounted workspace can be indexed.`
        };
      }

      // Translate path from host to container
      const relativePath = path.relative(normalizedHostRoot, normalizedHostPath);
      const containerPath = path.posix.join(containerWorkspaceRoot, relativePath.split(path.sep).join(path.posix.sep));

      return {
        isValid: true,
        containerPath
      };
    }

    // No HOST_WORKSPACE_ROOT set - validate against VSCode workspace folders (local development)
    let isWithinWorkspace = false;

    for (const folder of workspaceFolders) {
      const folderPath = path.normalize(folder.uri.fsPath);
      
      // Case-insensitive comparison on Windows
      const pathToCheck = isWindows ? normalizedHostPath.toLowerCase() : normalizedHostPath;
      const workspacePathToCheck = isWindows ? folderPath.toLowerCase() : folderPath;
      
      if (pathToCheck.startsWith(workspacePathToCheck)) {
        isWithinWorkspace = true;
        break;
      }
    }

    if (!isWithinWorkspace) {
      return {
        isValid: false,
        error: 'Selected folder is not within the current workspace'
      };
    }

    // No translation needed (local development, no Docker)
    return {
      isValid: true,
      containerPath: normalizedHostPath
    };
  }

  private async _handleConfirmRemoveFolder(path: string) {
    // Extract folder name for cleaner display
    const folderName = path.split('/').pop() || path;
    
    const confirmed = await vscode.window.showWarningMessage(
      `Remove folder from indexing?`,
      {
        modal: true,
        detail: `This will delete all indexed files, chunks, and embeddings for:\n\n${path}\n\nThis action cannot be undone.`
      },
      'Remove Folder'
    );

    if (confirmed === 'Remove Folder') {
      // Send confirmation back to webview to proceed with deletion
      this._panel.webview.postMessage({
        command: 'removeFolderConfirmed',
        path: path
      });
    }
  }

  private _showMessage(type: 'info' | 'warning' | 'error', message: string) {
    switch (type) {
      case 'info':
        vscode.window.showInformationMessage(message);
        break;
      case 'warning':
        vscode.window.showWarningMessage(message);
        break;
      case 'error':
        vscode.window.showErrorMessage(message);
        break;
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'intelligence.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; 
          script-src 'nonce-${nonce}' 'unsafe-eval'; 
          style-src ${webview.cspSource} 'unsafe-inline'; 
          connect-src http: https:;
          font-src ${webview.cspSource};">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mimir Code Intelligence</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  public dispose() {
    IntelligencePanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
