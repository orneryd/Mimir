import * as vscode from 'vscode';
import { PreambleManager } from './preambleManager';
import { StudioPanel } from './studioPanel';
import { PortalPanel } from './portalPanel';
import { IntelligencePanel } from './intelligencePanel';
import { NodeManagerPanel } from './nodeManagerPanel';
import { AuthManager } from './authManager';
import type { ChatMessage, MimirConfig, ToolParameters } from './types';

let preambleManager: PreambleManager;
let authManager: AuthManager;

/**
 * Parses command-line style arguments from the prompt
 * Supports both long (--flag) and short (-f) forms
 * Returns parsed flags and the remaining prompt text
 */
function parseArguments(prompt: string): {
  use?: string;           // -u, --use: preamble name
  model?: string;         // -m, --model: model name
  depth?: number;         // -d, --depth: vector search depth
  limit?: number;         // -l, --limit: vector search limit
  similarity?: number;    // -s, --similarity: similarity threshold
  maxTools?: number;      // -t, --max-tools: max tool calls
  enableTools?: boolean;  // --no-tools: disable tools
  prompt: string;         // Remaining text after parsing flags
} {
  const args: any = { prompt: '' };
  const tokens = prompt.trim().split(/\s+/);
  const remaining: string[] = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Long form flags with values
    if (token === '--use' || token === '-u') {
      args.use = tokens[++i];
    } else if (token === '--model' || token === '-m') {
      args.model = tokens[++i];
    } else if (token === '--depth' || token === '-d') {
      args.depth = parseInt(tokens[++i], 10);
    } else if (token === '--limit' || token === '-l') {
      args.limit = parseInt(tokens[++i], 10);
    } else if (token === '--similarity' || token === '-s') {
      args.similarity = parseFloat(tokens[++i]);
    } else if (token === '--max-tools' || token === '-t') {
      args.maxTools = parseInt(tokens[++i], 10);
    } else if (token === '--no-tools') {
      args.enableTools = false;
    } else {
      // Not a flag, part of the actual prompt
      remaining.push(token);
    }
  }
  
  args.prompt = remaining.join(' ');
  return args;
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('🚀 Mimir Chat Assistant activating...');

  // Store context globally so panels can access it
  (global as any).mimirExtensionContext = context;

  // Get initial configuration
  const config = getConfig();
  authManager = new AuthManager(context, config.apiUrl);
  preambleManager = new PreambleManager(config.apiUrl, () => authManager.getAuthHeaders());
  
  // Store authManager globally so URI handler can access it
  (global as any).mimirAuthManager = authManager;

  // Register URI handler for OAuth callbacks
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        console.log('[Extension] Received URI:', uri.toString());
        
        if (uri.path === '/oauth-callback') {
          // Decode query string once (it comes double-encoded from browser redirect)
          const decodedQuery = decodeURIComponent(uri.query);
          console.log('[Extension] Decoded query:', decodedQuery);
          const query = new URLSearchParams(decodedQuery);
          const auth = (global as any).mimirAuthManager as AuthManager;
          if (auth) {
            await auth.handleOAuthCallback(query);
          } else {
            console.error('[Extension] authManager not available for OAuth callback');
          }
        }
      }
    })
  );

  // Authentication is handled via explicit login command only
  // No auto-login on extension activation

  // Load available preambles
  try {
    const preambles = await preambleManager.loadAvailablePreambles();
    console.log(`✅ Loaded ${preambles.length} preambles`);
  } catch (error) {
    vscode.window.showWarningMessage(`Mimir: Could not connect to server at ${config.apiUrl}`);
  }

  // Register chat participant
  const participant = vscode.chat.createChatParticipant('mimir.chat', async (request, context, response, token) => {
    try {
      await handleChatRequest(request, context, response, token);
    } catch (error: any) {
      response.markdown(`❌ Error: ${error.message}`);
      console.error('Chat request error:', error);
    }
  });

  // Set participant metadata (icon optional - only set if file exists)
  const iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
  try {
    await vscode.workspace.fs.stat(iconPath);
    participant.iconPath = iconPath;
  } catch {
    console.log('ℹ️  No icon.png found, using default icon');
  }

  // ========================================
  // AUTHENTICATION: Register login/logout commands
  // ========================================
  context.subscriptions.push(
    vscode.commands.registerCommand('mimir.login', async () => {
      // Prompt for username and password, then save to configuration
      const username = await vscode.window.showInputBox({
        prompt: 'Mimir Username',
        placeHolder: 'Enter your username',
        ignoreFocusOut: true
      });

      if (!username) {
        return;
      }

      const password = await vscode.window.showInputBox({
        prompt: 'Mimir Password',
        placeHolder: 'Enter your password',
        password: true,
        ignoreFocusOut: true
      });

      if (!password) {
        return;
      }

      // Save to global user settings
      const config = vscode.workspace.getConfiguration('mimir');
      await config.update('auth.username', username, vscode.ConfigurationTarget.Global);
      await config.update('auth.password', password, vscode.ConfigurationTarget.Global);
      
      console.log('[Mimir] Saved credentials to global user settings');

      // Clear any cached auth state and re-authenticate
      await authManager.logout();
      const authenticated = await authManager.authenticate();
      
      if (authenticated) {
        vscode.window.showInformationMessage(`Mimir: Configured credentials for ${username}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mimir.logout', async () => {
      // Clear global user settings
      const config = vscode.workspace.getConfiguration('mimir');
      await config.update('auth.username', undefined, vscode.ConfigurationTarget.Global);
      await config.update('auth.password', undefined, vscode.ConfigurationTarget.Global);
      
      // Clear cached auth state
      await authManager.logout();
      
      vscode.window.showInformationMessage('Mimir: Logged out and cleared credentials');
    })
  );

  // ========================================
  // CHAT UI: Register chat commands (Cursor/Windsurf compatible)
  // ========================================
  context.subscriptions.push(
    vscode.commands.registerCommand('mimir.askQuestion', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Ask Mimir a question',
        placeHolder: 'e.g., Explain this function, summarize these files, etc.',
        ignoreFocusOut: true
      });
      
      if (prompt && prompt.trim()) {
        // Show output channel for response
        const outputChannel = vscode.window.createOutputChannel('Mimir Response');
        outputChannel.clear();
        outputChannel.show(true);
        
        outputChannel.appendLine('🤔 Thinking...\n');
        
        try {
          // Get authentication headers
          const authHeaders = await authManager.getAuthHeaders();
          
          const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...authHeaders
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
              model: config.model,
              stream: false
            })
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
          }
          
          const data = await response.json() as any;
          const answer = data.choices?.[0]?.message?.content || 'No response';
          
          outputChannel.clear();
          outputChannel.appendLine(`📝 Question: ${prompt}\n`);
          outputChannel.appendLine(`💬 Answer:\n${answer}\n`);
        } catch (error: any) {
          outputChannel.clear();
          outputChannel.appendLine(`❌ Error: ${error.message}\n`);
          outputChannel.appendLine(`💡 Make sure Mimir server is running at ${config.apiUrl}`);
        }
      }
    })
  );

  // ========================================
  // PORTAL UI: Register chat interface command
  // ========================================
  context.subscriptions.push(
    vscode.commands.registerCommand('mimir.openChat', () => {
      console.log('💬 Opening Mimir Chat...');
      PortalPanel.createOrShow(context.extensionUri, config.apiUrl);
    })
  );

  // ========================================
  // INTELLIGENCE UI: Register code intelligence command
  // ========================================
  context.subscriptions.push(
    vscode.commands.registerCommand('mimir.openIntelligence', () => {
      console.log('🧠 Opening Mimir Code Intelligence...');
      IntelligencePanel.createOrShow(context.extensionUri, config.apiUrl);
    })
  );

  // ========================================
  // NODE MANAGER UI: Browse and manage Neo4j nodes
  // ========================================
  context.subscriptions.push(
    vscode.commands.registerCommand('mimir.openNodeManager', () => {
      console.log('📊 Opening Mimir Node Manager...');
      NodeManagerPanel.createOrShow(context.extensionUri);
    })
  );

  // ========================================
  // STUDIO UI: Register workflow commands
  // ========================================
  context.subscriptions.push(
    vscode.commands.registerCommand('mimir.openStudio', () => {
      console.log('🎨 Opening Mimir Studio...');
      StudioPanel.createOrShow(context.extensionUri, config.apiUrl, () => authManager.getAuthHeaders());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mimir.createWorkflow', async () => {
      // Open Studio and prompt for new workflow
      StudioPanel.createOrShow(context.extensionUri, config.apiUrl, () => authManager.getAuthHeaders());
      vscode.window.showInformationMessage('Drag agents to the canvas to create your workflow');
    })
  );

  // Register webview panel serializers for state restoration
  vscode.window.registerWebviewPanelSerializer('mimirPortal', {
    async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
      console.log('🔄 Restoring Portal panel from state');
      PortalPanel.revive(webviewPanel, context.extensionUri, state, config.apiUrl);
    }
  });

  vscode.window.registerWebviewPanelSerializer('mimirIntelligence', {
    async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
      console.log('🔄 Restoring Intelligence panel from state');
      IntelligencePanel.revive(webviewPanel, context.extensionUri, state, config.apiUrl);
    }
  });

  vscode.window.registerWebviewPanelSerializer('mimirStudio', {
    async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
      console.log('🔄 Restoring Studio panel from state');
      StudioPanel.revive(webviewPanel, context.extensionUri, state, config.apiUrl, () => authManager.getAuthHeaders());
    }
  });

  // Listen for configuration changes (chat, Portal, Intelligence, and Studio)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('mimir')) {
        const newConfig = getConfig();
        preambleManager.updateBaseUrl(newConfig.apiUrl);
        authManager.updateBaseUrl(newConfig.apiUrl);
        preambleManager.loadAvailablePreambles().then(preambles => {
          console.log(`🔄 Configuration updated, reloaded ${preambles.length} preambles`);
        });
        // Update Portal, Intelligence, and Studio panels with new config
        PortalPanel.updateAllPanels({ apiUrl: newConfig.apiUrl });
        IntelligencePanel.updateAllPanels({ apiUrl: newConfig.apiUrl });
        StudioPanel.updateAllPanels({ apiUrl: newConfig.apiUrl });
      }
    })
  );

  context.subscriptions.push(participant);
  console.log('✅ Mimir Extension activated (Chat + Studio)!');
}

async function handleChatRequest(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  response: vscode.ChatResponseStream,
  token: vscode.CancellationToken
) {
  const config = getConfig();
  
  // Parse arguments from prompt
  const args = parseArguments(request.prompt);
  
  // Check if this is a follow-up message (has history)
  const isFollowUp = context.history.length > 0;
  
  // Build messages array from history first
  const messages: ChatMessage[] = [];
  
  // Extract messages from history
  for (const turn of context.history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push({ role: 'user', content: turn.prompt });
    } else if (turn instanceof vscode.ChatResponseTurn) {
      const content = turn.response.map(r => {
        if (r instanceof vscode.ChatResponseMarkdownPart) {
          return r.value.value;
        }
        return '';
      }).join('');
      if (content) {
        messages.push({ role: 'assistant', content });
      }
    }
  }
  
  // For first message: determine and add preamble
  // For follow-ups: check if we should use a NEW preamble (explicit -u/--use flag) or keep existing
  let preambleName: string;
  let preambleContent: string;
  
  if (!isFollowUp || args.use) {
    // First message OR explicit -u/--use flag: load preamble
    preambleName = args.use || config.defaultPreamble;
    
    if (config.customPreamble) {
      preambleContent = config.customPreamble;
      console.log(`Using custom preamble (${preambleContent.length} chars)`);
    } else {
      try {
        preambleContent = await preambleManager.fetchPreambleContent(preambleName);
      } catch (error: any) {
        response.markdown(`⚠️ Could not load preamble '${preambleName}': ${error.message}\n\nUsing minimal default.`);
        preambleContent = 'You are a helpful AI assistant with access to a graph-based knowledge system.';
      }
    }
    
    // Add system message at the start
    messages.unshift({ role: 'system', content: preambleContent });
  } else {
    // Follow-up message: reuse existing system message (already in messages from history)
    // The system message was included in the history, so we don't add it again
    preambleName = 'from conversation';
  }

  // Add current user message (with flags parsed out)
  messages.push({ role: 'user', content: args.prompt });

  // Build tool parameters from config, overridden by parsed args
  const toolParameters: ToolParameters = {
    vector_search_nodes: {
      depth: args.depth ?? config.vectorSearchDepth,
      limit: args.limit ?? config.vectorSearchLimit,
      min_similarity: args.similarity ?? config.vectorSearchMinSimilarity
    }
  };

  // Determine model priority:
  // 1. Explicit -m flag (args.model)
  // 2. VS Code Chat dropdown selection (request.model)
  // 3. Extension settings default (config.model)
  
  // Debug: Log the model object structure
  console.log(`🔍 request.model type: ${typeof request.model}`);
  
  // Try to stringify the object to see its properties
  let modelStr = '';
  try {
    modelStr = JSON.stringify(request.model, null, 2);
    console.log(`🔍 request.model JSON:`, modelStr);
  } catch (e) {
    console.log(`🔍 request.model (cannot stringify):`, request.model);
  }
  
  // Log all enumerable properties
  if (request.model && typeof request.model === 'object') {
    console.log(`🔍 request.model keys:`, Object.keys(request.model));
    console.log(`🔍 request.model properties:`, Object.getOwnPropertyNames(request.model));
  }
  
  // Extract model ID from VS Code's LanguageModelChat object
  let vscodeModelId = '';
  if (request.model) {
    // Try various properties that might contain the model ID
    const modelObj = request.model as any;
    vscodeModelId = modelObj.id 
                 || modelObj.model 
                 || modelObj.name
                 || modelObj.vendor
                 || modelObj.modelId
                 || modelObj.modelName
                 || '';
    
    console.log(`🔍 Extracted model ID: ${vscodeModelId || '(empty)'}`);
  }
  
  // If we couldn't extract model from dropdown, fall back to settings
  const rawModel = args.model || (vscodeModelId || config.model);
  const modelSource = args.model ? 'flag' : (vscodeModelId ? 'dropdown' : 'settings');
  
  // Warn if dropdown model couldn't be extracted
  if (!args.model && request.model && !vscodeModelId) {
    console.warn(`⚠️  Could not extract model ID from VS Code dropdown. Using settings default: ${config.model}`);
    console.warn(`⚠️  Please report this issue with the debug output above.`);
  }
  
  // Pass through model name as-is (fully dynamic - no hardcoded mapping)
  // The backend will use whatever model name is provided from VS Code or settings
  const selectedModel = rawModel;
  
  // Log for debugging
  console.log(`🔍 Model from VS Code: ${vscodeModelId || '(none)'}`);
  console.log(`📝 Selected model: ${selectedModel} (source: ${modelSource})`);

  // Get workspace folder for tool execution context
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workingDirectory = workspaceFolder?.uri.fsPath;
  
  if (workingDirectory) {
    console.log(`📁 Workspace folder: ${workingDirectory}`);
  } else {
    console.warn(`⚠️  No workspace folder open - tools will use server's working directory`);
  }

  // Make request to Mimir with overrides from parsed args
  const requestBody = {
    messages,
    model: selectedModel,
    stream: true,
    enable_tools: args.enableTools ?? config.enableTools,
    max_tool_calls: args.maxTools ?? config.maxToolCalls,
    working_directory: workingDirectory, // Pass workspace path for tool execution
    tool_parameters: toolParameters
  };

  console.log(`💬 Sending request to Mimir: ${args.prompt.substring(0, 100)}...`);
  console.log(`🎭 Preamble: ${preambleName}, Model: ${selectedModel} (from ${modelSource}), Depth: ${toolParameters.vector_search_nodes?.depth}`);
  console.log(`📦 Request body:`, JSON.stringify(requestBody, null, 2));

  try {
    // Convert VSCode CancellationToken to AbortSignal
    const abortController = new AbortController();
    token.onCancellationRequested(() => abortController.abort());

    // Get authentication headers
    const authHeaders = await authManager.getAuthHeaders();

    const fetchResponse = await fetch(`${config.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    });

    if (!fetchResponse.ok) {
      // Try to get detailed error message from server
      let errorDetails = fetchResponse.statusText;
      try {
        const errorBody = await fetchResponse.text();
        if (errorBody) {
          console.error(`❌ Server error response:`, errorBody);
          const errorJson = JSON.parse(errorBody);
          errorDetails = errorJson.error || errorJson.message || errorBody.substring(0, 200);
        }
      } catch (e) {
        // Ignore parsing errors, use statusText
      }
      throw new Error(`HTTP ${fetchResponse.status}: ${errorDetails}`);
    }

    if (!fetchResponse.body) {
      throw new Error('No response body');
    }

    // Stream response
    const reader = fetchResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (token.isCancellationRequested) {
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        if (line.includes('[DONE]')) continue;

        try {
          const data = JSON.parse(line.substring(6));
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            response.markdown(content);
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      response.markdown('\n\n_Cancelled_');
    } else {
      throw error;
    }
  }
}

// Removed updateSlashCommands - we now use flags instead of slash commands
// Users can specify preamble with: -u research OR --use research

function getConfig(): MimirConfig {
  const config = vscode.workspace.getConfiguration('mimir');
  return {
    apiUrl: config.get('apiUrl', 'http://localhost:9042'),
    defaultPreamble: config.get('defaultPreamble', 'mimir-v2'),
    model: config.get('model', 'gpt-4.1'),
    vectorSearchDepth: config.get('vectorSearch.depth', 1),
    vectorSearchLimit: config.get('vectorSearch.limit', 10),
    vectorSearchMinSimilarity: config.get('vectorSearch.minSimilarity', 0.75),
    enableTools: config.get('enableTools', true),
    maxToolCalls: config.get('maxToolCalls', 3),
    customPreamble: config.get('customPreamble', '')
  };
}

export function deactivate() {
  console.log('👋 Mimir Extension deactivated (Chat + Studio)');
}
