import * as vscode from 'vscode';

/**
 * Authentication Manager for Mimir VSCode Extension
 * 
 * Supports three modes:
 * 1. No Auth Mode (MIMIR_ENABLE_SECURITY=false)
 * 2. Dev Auth Mode (local username/password or API key)
 * 3. OAuth Mode (browser-based login, then API key)
 */

export interface AuthConfig {
  enabled: boolean;
  devMode: boolean;
  devUsername?: string;
  devPassword?: string;
  oauthEnabled: boolean;
}

export interface AuthState {
  authenticated: boolean;
  apiKey?: string;
  username?: string;
  expiresAt?: string;
}

export class AuthManager {
  private context: vscode.ExtensionContext;
  private baseUrl: string;
  private authState: AuthState | null = null;
  private oauthResolver: { resolve: (value: any) => void; state: string } | null = null;
  private instanceId: string;

  constructor(context: vscode.ExtensionContext, baseUrl: string) {
    this.context = context;
    this.baseUrl = baseUrl;
    this.instanceId = Math.random().toString(36).substring(7);
    console.log(`[Auth] AuthManager instance created: ${this.instanceId}`);
  }

  /**
   * Update base URL when configuration changes
   */
  updateBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * Check authentication status from server
   */
  async checkAuthStatus(): Promise<AuthConfig> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/config`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const serverConfig: any = await response.json();
      
      // Map server response to our AuthConfig interface
      // Server returns: {devLoginEnabled: boolean, oauthProviders: array}
      // We need: {enabled: boolean, devMode: boolean, oauthEnabled: boolean}
      const enabled = serverConfig.devLoginEnabled || (serverConfig.oauthProviders && serverConfig.oauthProviders.length > 0);
      const devMode = serverConfig.devLoginEnabled || false;
      const oauthEnabled = serverConfig.oauthProviders && serverConfig.oauthProviders.length > 0;
      
      return {
        enabled,
        devMode,
        oauthEnabled
      };
    } catch (error) {
      console.error('[Auth] Failed to check auth status:', error);
      // Default to no auth if server unreachable
      return {
        enabled: false,
        devMode: false,
        oauthEnabled: false
      };
    }
  }

  /**
   * Get stored authentication state from configuration
   */
  async getAuthState(): Promise<AuthState | null> {
    if (this.authState) {
      return this.authState;
    }

    // Load from configuration
    const config = vscode.workspace.getConfiguration('mimir');
    const apiKey = config.get<string>('auth.apiKey');
    const username = config.get<string>('auth.username');
    const expiresAt = config.get<string>('auth.expiresAt');

    if (apiKey) {
      this.authState = {
        authenticated: true,
        apiKey,
        username,
        expiresAt
      };
      return this.authState;
    }

    return null;
  }

  /**
   * Save authentication state to configuration
   */
  private async saveAuthState(state: AuthState): Promise<void> {
    this.authState = state;
    
    const config = vscode.workspace.getConfiguration('mimir');
    
    if (state.apiKey) {
      await config.update('auth.apiKey', state.apiKey, vscode.ConfigurationTarget.Global);
    }
    if (state.username) {
      await config.update('auth.username', state.username, vscode.ConfigurationTarget.Global);
    }
    if (state.expiresAt) {
      await config.update('auth.expiresAt', state.expiresAt, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Clear authentication state from configuration
   */
  async clearAuthState(): Promise<void> {
    this.authState = null;
    
    const config = vscode.workspace.getConfiguration('mimir');
    await config.update('auth.apiKey', undefined, vscode.ConfigurationTarget.Global);
    await config.update('auth.username', undefined, vscode.ConfigurationTarget.Global);
    await config.update('auth.expiresAt', undefined, vscode.ConfigurationTarget.Global);
  }

  /**
   * Authenticate with the server
   * Handles all three modes automatically
   * Reuses existing valid tokens instead of creating new ones
   */
  async authenticate(): Promise<boolean> {
    // First, check if we already have a valid cached token
    const existingState = await this.getAuthState();
    if (existingState?.authenticated && existingState.apiKey) {
      // Check if token is expired
      if (existingState.expiresAt) {
        const expiresAt = new Date(existingState.expiresAt);
        if (expiresAt > new Date()) {
          console.log('[Auth] Using cached valid token');
          return true;
        }
        console.log('[Auth] Cached token expired, getting new one');
      } else {
        // No expiration, token is valid indefinitely
        console.log('[Auth] Using cached token (no expiration)');
        return true;
      }
    }

    const config = await this.checkAuthStatus();

    // Mode 1: No Auth
    if (!config.enabled) {
      console.log('[Auth] Security disabled, no authentication required');
      this.authState = { authenticated: true };
      return true;
    }

    // Mode 2: Dev Auth Mode
    if (config.devMode) {
      return await this.authenticateDev(config);
    }

    // Mode 3: OAuth Mode
    if (config.oauthEnabled) {
      return await this.authenticateOAuth();
    }

    vscode.window.showErrorMessage('Mimir: Unknown authentication configuration');
    return false;
  }

  /**
   * Dev Auth Mode: Username/Password from configuration
   */
  private async authenticateDev(config: AuthConfig): Promise<boolean> {
    // Get credentials from VSCode configuration
    const workspaceConfig = vscode.workspace.getConfiguration('mimir');
    const username = workspaceConfig.get<string>('auth.username');
    const password = workspaceConfig.get<string>('auth.password');

    if (!username || !password) {
      vscode.window.showErrorMessage(
        'Mimir: Please configure mimir.auth.username and mimir.auth.password in settings',
        'Open Settings'
      ).then(selection => {
        if (selection === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'mimir.auth');
        }
      });
      return false;
    }

    return await this.loginWithCredentials(username, password);
  }

  /**
   * Login with username/password using OAuth 2.0 token endpoint (RFC 6749)
   */
  private async loginWithCredentials(username: string, password: string): Promise<boolean> {
    try {
      // Use OAuth 2.0 RFC 6749 compliant /auth/token endpoint
      // grant_type=password (Resource Owner Password Credentials)
      const response = await fetch(`${this.baseUrl}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'password',
          username,
          password
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'invalid_grant' })) as any;
        const errorMsg = error.error_description || error.error || 'Login failed';
        vscode.window.showErrorMessage(`Mimir: ${errorMsg}`);
        return false;
      }

      const data = await response.json() as any;
      
      // Calculate expiration date from expires_in (seconds)
      const expiresAt = data.expires_in 
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined;
      
      // Save access token as API key
      await this.saveAuthState({
        authenticated: true,
        apiKey: data.access_token,
        username,
        expiresAt
      });

      vscode.window.showInformationMessage(`Mimir: Authenticated as ${username}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Mimir: Authentication failed - ${errorMessage}`);
      return false;
    }
  }

  /**
   * OAuth Mode: Browser-based login with automatic callback
   */
  private async authenticateOAuth(): Promise<boolean> {
    console.log(`[Auth] authenticateOAuth called on instance: ${this.instanceId}`);
    
    // Generate state token for CSRF protection
    const state = Math.random().toString(36).substring(7);
    
    // Create promise that will resolve when OAuth callback is received
    const authPromise = new Promise<{ apiKey: string; username: string } | null>((resolve) => {
      // Store resolver in instance variable for URI handler to use
      this.oauthResolver = { resolve, state };
      console.log(`[Auth] OAuth resolver set on instance ${this.instanceId} with state: ${state}`);
      
      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.oauthResolver) {
          console.log(`[Auth] OAuth resolver timed out on instance ${this.instanceId}`);
          this.oauthResolver = null;
          resolve(null);
        }
      }, 5 * 60 * 1000);
    });
    
    // Build auth URL with VSCode redirect
    const redirectUri = encodeURIComponent(`vscode://mimir.mimir-chat/oauth-callback`);
    const authUrl = `${this.baseUrl}/auth/oauth/login?vscode_redirect=true&state=${state}&redirect_uri=${redirectUri}`;
    
    console.log('[Auth] Opening OAuth login:', authUrl);
    const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl));
    
    if (!opened) {
      vscode.window.showErrorMessage('Mimir: Failed to open browser for authentication');
      this.oauthResolver = null;
      return false;
    }

    // Show progress while waiting for OAuth
    const result = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Mimir: Waiting for OAuth login...',
      cancellable: true
    }, async (progress, token) => {
      token.onCancellationRequested(() => {
        this.oauthResolver = null;
      });
      
      return await authPromise;
    });

    if (!result) {
      vscode.window.showWarningMessage('Mimir: OAuth login cancelled or timed out');
      return false;
    }

    // Save authentication state
    await this.saveAuthState({
      authenticated: true,
      apiKey: result.apiKey,
      username: result.username
    });

    vscode.window.showInformationMessage(`Mimir: Authenticated as ${result.username}`);
    return true;
  }
  
  /**
   * Handle OAuth callback from URI
   * Called by extension.ts URI handler
   */
  async handleOAuthCallback(query: URLSearchParams): Promise<void> {
    console.log(`[Auth] handleOAuthCallback called on instance: ${this.instanceId}`);
    console.log(`[Auth] oauthResolver status: ${this.oauthResolver ? 'present' : 'null'}`);
    
    if (!this.oauthResolver) {
      console.error(`[Auth] No OAuth resolver found on instance ${this.instanceId}`);
      return;
    }
    
    const state = query.get('state');
    const accessToken = query.get('access_token');
    const username = query.get('username');
    const error = query.get('error');
    
    // Verify state matches
    if (state !== this.oauthResolver.state) {
      console.error('[Auth] State mismatch in OAuth callback');
      this.oauthResolver.resolve(null);
      this.oauthResolver = null;
      return;
    }
    
    if (error) {
      console.error('[Auth] OAuth error:', error);
      this.oauthResolver.resolve(null);
      this.oauthResolver = null;
      return;
    }
    
    if (!accessToken) {
      console.error('[Auth] No access token in OAuth callback');
      this.oauthResolver.resolve(null);
      this.oauthResolver = null;
      return;
    }
    
    // Resolve with OAuth access token (stateless - no DB storage)
    this.oauthResolver.resolve({
      apiKey: accessToken,  // Store OAuth token in apiKey field
      username: username || 'OAuth user'
    });
    this.oauthResolver = null;
  }

  /**
   * Verify API key works
   */
  private async verifyApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/nodes?limit=1`, {
        headers: { 'X-API-Key': apiKey }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get authentication headers for API requests
   * Returns OAuth 2.0 RFC 6750 compliant Authorization: Bearer header
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const state = await this.getAuthState();
    
    if (state?.apiKey) {
      // OAuth 2.0 RFC 6750 compliant header
      return { 'Authorization': `Bearer ${state.apiKey}` };
    }
    
    return {};
  }

  /**
   * Logout and clear authentication
   */
  async logout(): Promise<void> {
    await this.clearAuthState();
    vscode.window.showInformationMessage('Mimir: Logged out successfully');
  }
}
