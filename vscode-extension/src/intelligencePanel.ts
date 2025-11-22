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
          case 'ready': {
            // Webview is loaded and ready - check security status first
            let authHeaders = {};
            
            try {
              // Check if server has security enabled
              console.log('[IntelligencePanel] Checking server security status...');
              const configResponse = await fetch(`${this._apiUrl}/auth/config`);
              const serverConfig: any = await configResponse.json();
              
              const securityEnabled = serverConfig.devLoginEnabled || (serverConfig.oauthProviders && serverConfig.oauthProviders.length > 0);
              console.log('[IntelligencePanel] Server security enabled:', securityEnabled);
              
              if (securityEnabled) {
                // Use the global authManager instance (has OAuth resolver)
                const authManager = (global as any).mimirAuthManager;
                
                if (authManager) {
                  // First authenticate (will use cached credentials if available)
                  console.log('[IntelligencePanel] Authenticating...');
                  const authenticated = await authManager.authenticate();
                  console.log('[IntelligencePanel] Authentication result:', authenticated);
                  
                  // Then get auth headers
                  authHeaders = await authManager.getAuthHeaders();
                  console.log('[IntelligencePanel] Auth headers:', Object.keys(authHeaders).length > 0 ? 'Present' : 'Empty');
                } else {
                  console.error('[IntelligencePanel] No authManager available');
                }
              } else {
                console.log('[IntelligencePanel] Security disabled - no auth needed');
              }
            } catch (error) {
              console.error('[IntelligencePanel] Failed to check security status:', error);
              // On error, fall back to trying auth
            }
            
            console.log('[IntelligencePanel] Sending config to webview');
            this._panel.webview.postMessage({
              command: 'config',
              apiUrl: this._apiUrl,
              authHeaders: authHeaders
            });
            break;
          }
          case 'selectFolder':
            await this._handleSelectFolder();
            break;
          case 'showMessage':
            this._showMessage(message.type, message.message);
            break;
          case 'confirmRemoveFolder':
            await this._handleConfirmRemoveFolder(message.id, message.path);
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
    // Get workspace folders (may be empty if using HOST_WORKSPACE_ROOT)
    const workspaceFolders = vscode.workspace.workspaceFolders || [];

    // Show folder picker
    const folderUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Folder to Index',
      defaultUri: workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined
    });

    if (!folderUri || folderUri.length === 0) {
      return; // User cancelled
    }

    const selectedPath = folderUri[0].fsPath;

    // Show progress indicator
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Indexing Folder',
      cancellable: false
    }, async (progress) => {
      progress.report({ message: 'Sending request to Mimir server...' });

      try {
        // Get auth headers
        const { AuthManager } = require('./authManager');
        const context = (global as any).mimirExtensionContext;
        let authHeaders = {};
        if (context) {
          const authManager = new AuthManager(context, this._apiUrl);
          await authManager.authenticate();
          authHeaders = await authManager.getAuthHeaders();
        }

        // Call API to add folder - server handles ALL validation and translation
        const response = await fetch(`${this._apiUrl}/api/index-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            path: selectedPath, // Send path as-is, server will handle everything
            recursive: true
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        progress.report({ message: 'Folder added successfully!' });

        vscode.window.showInformationMessage(
          `✅ Folder added to indexing:\n\n${selectedPath}\n\nIndexing will begin shortly.`
        );

        // Refresh the webview
        this._panel.webview.postMessage({ command: 'refresh' });

      } catch (error: any) {
        vscode.window.showErrorMessage(`❌ Failed to add folder: ${error.message}`);
      }
    });
  }

  private async _handleConfirmRemoveFolder(id: string, path: string) {
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
        id: id,
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
          connect-src ${this._apiUrl} http://localhost:* http://127.0.0.1:*;
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
