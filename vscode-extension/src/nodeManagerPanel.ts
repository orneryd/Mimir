import * as vscode from 'vscode';
import * as path from 'path';

export class NodeManagerPanel {
  public static currentPanel: NodeManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.ViewColumn.One;

    // If we already have a panel, show it
    if (NodeManagerPanel.currentPanel) {
      NodeManagerPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'mimirNodeManager',
      'Node Manager',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist')
        ]
      }
    );

    NodeManagerPanel.currentPanel = new NodeManagerPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'ready': {
            // Webview is loaded and ready - check security status first
            let authHeaders = {};
            const workspaceConfig = vscode.workspace.getConfiguration('mimir');
            const apiUrl = workspaceConfig.get<string>('apiUrl', 'http://localhost:9042');
            
            try {
              // Check if server has security enabled
              console.log('[NodeManagerPanel] Checking server security status...');
              const configResponse = await fetch(`${apiUrl}/auth/config`);
              const serverConfig: any = await configResponse.json();
              
              const securityEnabled = serverConfig.devLoginEnabled || (serverConfig.oauthProviders && serverConfig.oauthProviders.length > 0);
              console.log('[NodeManagerPanel] Server security enabled:', securityEnabled);
              
              if (securityEnabled) {
                // Use the global authManager instance (has OAuth resolver)
                const authManager = (global as any).mimirAuthManager;
                
                if (authManager) {
                  console.log('[NodeManagerPanel] Authenticating...');
                  const authenticated = await authManager.authenticate();
                  console.log('[NodeManagerPanel] Authentication result:', authenticated);
                  
                  authHeaders = await authManager.getAuthHeaders();
                  console.log('[NodeManagerPanel] Auth headers:', Object.keys(authHeaders).length > 0 ? 'Present' : 'Empty');
                } else {
                  console.error('[NodeManagerPanel] No authManager available');
                }
              } else {
                console.log('[NodeManagerPanel] Security disabled - no auth needed');
              }
            } catch (error) {
              console.error('[NodeManagerPanel] Failed to check security status:', error);
            }
            
            // Send configuration when webview is ready
            this._panel.webview.postMessage({
              command: 'config',
              config: {
                apiUrl: vscode.workspace.getConfiguration('mimir').get('apiUrl', 'http://localhost:9042')
              },
              authHeaders: authHeaders
            });
            break;
          }

          case 'confirmDelete': {
            // Show native confirmation dialog
            const result = await vscode.window.showWarningMessage(
              `Are you sure you want to delete this node?\n\nType: ${message.nodeType}\nID: ${message.nodeId}\n\nThis will also delete all edges connected to this node.`,
              { modal: true },
              'Delete'
            );

            if (result === 'Delete') {
              this._panel.webview.postMessage({
                command: 'deleteConfirmed',
                nodeId: message.nodeId
              });
            }
            break;
          }

          case 'downloadNode': {
            // Save node as JSON to .mimir/nodes/
            try {
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
              }

              const fs = await import('fs');
              const path = await import('path');
              const workspaceRoot = workspaceFolders[0].uri.fsPath;
              const mimirDir = path.join(workspaceRoot, '.mimir', 'nodes');

              // Create directory if it doesn't exist
              if (!fs.existsSync(mimirDir)) {
                fs.mkdirSync(mimirDir, { recursive: true });
              }

              // Create filename: type_displayName_id.json
              const safeDisplayName = message.node.displayName
                .replace(/[^a-z0-9]/gi, '_')
                .toLowerCase()
                .substring(0, 50);
              const filename = `${message.node.type}_${safeDisplayName}_${message.node.id}.json`;
              const filePath = path.join(mimirDir, filename);

              // Write JSON file
              fs.writeFileSync(filePath, JSON.stringify(message.node, null, 2), 'utf8');

              vscode.window.showInformationMessage(`Node saved to ${filename}`);
            } catch (error: any) {
              vscode.window.showErrorMessage(`Failed to save node: ${error.message}`);
            }
            break;
          }

          case 'showError':
            vscode.window.showErrorMessage(message.message);
            break;

          case 'showInfo':
            vscode.window.showInformationMessage(message.message);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'nodeManager.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} http://localhost:* http://127.0.0.1:*;">
      <title>Node Manager</title>
    </head>
    <body>
      <div id="root"></div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }

  public dispose() {
    NodeManagerPanel.currentPanel = undefined;

    // Clean up our resources
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
