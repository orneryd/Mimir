import * as vscode from 'vscode';

export class PortalPanel {
  public static currentPanel: PortalPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _apiUrl: string;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, apiUrl: string) {
    this._panel = panel;
    this._apiUrl = apiUrl;

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, extensionUri);
    
    // Send initial config with auth headers
    this._sendConfig();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'ready': {
            this._sendConfig();
            break;
          }
          case 'saveVectorSettings':
            // Save to workspace configuration
            await vscode.workspace.getConfiguration('mimir').update(
              'vectorSearch',
              message.settings,
              vscode.ConfigurationTarget.Workspace
            );
            vscode.window.showInformationMessage('✅ Vector search settings saved');
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _sendConfig() {
    let authHeaders = {};
    try {
      // Check if server has security enabled
      const configResponse = await fetch(`${this._apiUrl}/auth/config`);
      const serverConfig: any = await configResponse.json();
      
      const securityEnabled = serverConfig.devLoginEnabled || (serverConfig.oauthProviders && serverConfig.oauthProviders.length > 0);
      
      if (securityEnabled) {
        // Use the global authManager instance (has OAuth resolver)
        const authManager = (global as any).mimirAuthManager;
        if (authManager) {
          await authManager.authenticate();
          authHeaders = await authManager.getAuthHeaders();
        }
      }
    } catch (error) {
      console.error('[PortalPanel] Failed to check security status:', error);
    }

    this._panel.webview.postMessage({
      command: 'config',
      apiUrl: this._apiUrl,
      model: vscode.workspace.getConfiguration('mimir').get('model', 'gpt-4.1'),
      authHeaders: authHeaders
    });
  }

  public static createOrShow(extensionUri: vscode.Uri, apiUrl: string) {
    // If we already have a panel, show it
    if (PortalPanel.currentPanel) {
      PortalPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'mimirPortal',
      '💬 Mimir Chat',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist')
        ]
      }
    );

    PortalPanel.currentPanel = new PortalPanel(panel, extensionUri, apiUrl);
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, state: any, apiUrl: string) {
    PortalPanel.currentPanel = new PortalPanel(panel, extensionUri, apiUrl);
  }

  public static updateAllPanels(config: { apiUrl: string }) {
    if (PortalPanel.currentPanel) {
      PortalPanel.currentPanel._apiUrl = config.apiUrl;
      PortalPanel.currentPanel._sendConfig();
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'portal.js')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; 
          script-src 'nonce-${nonce}' 'unsafe-eval'; 
          style-src ${webview.cspSource} 'unsafe-inline'; 
          connect-src ${webview.cspSource} http://localhost:* http://127.0.0.1:*;
          font-src ${webview.cspSource};">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mimir Chat</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  public dispose() {
    PortalPanel.currentPanel = undefined;
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
