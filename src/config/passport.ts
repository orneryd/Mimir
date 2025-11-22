// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { createSecureFetchOptions, validateOAuthTokenFormat, validateOAuthUserinfoUrl } from '../utils/fetch-helper.js';

// Development: Local username/password (configurable via env vars)
// Supports multiple dev users with different roles for RBAC testing
// Format: MIMIR_DEV_USER_<NAME>=username:password:role1,role2,role3
if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
  
  // Parse all MIMIR_DEV_USER_* environment variables
  const devUsers: Array<{ username: string; password: string; roles: string[]; id: string }> = [];
  
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('MIMIR_DEV_USER_')) {
      const value = process.env[key];
      if (value) {
        const [username, password, rolesStr] = value.split(':');
        if (username && password) {
          const roles = rolesStr ? rolesStr.split(',').map(r => r.trim()) : ['viewer'];
          const userId = key.replace('MIMIR_DEV_USER_', '').toLowerCase();
          devUsers.push({ username, password, roles, id: userId });
          console.log(`[Auth] Dev user registered: ${username} with roles [${roles.join(', ')}]`);
        }
      }
    }
  });
  
  // Fallback: If no MIMIR_DEV_USER_* vars, check legacy MIMIR_DEV_USERNAME/PASSWORD
  if (devUsers.length === 0 && process.env.MIMIR_DEV_USERNAME && process.env.MIMIR_DEV_PASSWORD) {
    devUsers.push({
      username: process.env.MIMIR_DEV_USERNAME,
      password: process.env.MIMIR_DEV_PASSWORD,
      roles: ['admin'],
      id: 'legacy-admin'
    });
    console.log(`[Auth] Legacy dev user registered: ${process.env.MIMIR_DEV_USERNAME} with roles [admin]`);
  }
  
  if (devUsers.length > 0) {
    passport.use(new LocalStrategy((username, password, done) => {
      // Find matching dev user
      const user = devUsers.find(u => u.username === username && u.password === password);
      if (user) {
        return done(null, { 
          id: user.id, 
          email: `${username}@localhost`,
          roles: user.roles,
          username: user.username
        });
      }
      return done(null, false, { message: 'Invalid credentials' });
    }));
  }
}

// Production: OAuth
if (process.env.MIMIR_ENABLE_SECURITY === 'true' && 
    process.env.MIMIR_AUTH_PROVIDER) {
  
  console.log(`[Auth] OAuth enabled with provider: ${process.env.MIMIR_AUTH_PROVIDER}`);
  
  // OAuth endpoint URLs - MUST be explicitly configured (no hardcoded paths)
  const authorizationURL = process.env.MIMIR_OAUTH_AUTHORIZATION_URL;
  const tokenURL = process.env.MIMIR_OAUTH_TOKEN_URL;
  
  if (!authorizationURL || !tokenURL) {
    throw new Error(
      'OAuth configuration incomplete: MIMIR_OAUTH_AUTHORIZATION_URL and MIMIR_OAUTH_TOKEN_URL are required. ' +
      'Do not use hardcoded paths - each provider has different endpoints:\n' +
      '  - Okta: /oauth2/v1/authorize, /oauth2/v1/token\n' +
      '  - Auth0: /authorize, /oauth/token\n' +
      '  - Azure AD: /oauth2/v2.0/authorize, /oauth2/v2.0/token\n' +
      '  - Google: /o/oauth2/v2/auth, /token\n' +
      'See docs/security/README.md for provider-specific examples.'
    );
  }
  
  console.log(`[Auth] Authorization URL: ${authorizationURL}`);
  console.log(`[Auth] Token URL: ${tokenURL}`);
  
  // Custom state store for OAuth with proper CSRF protection
  // Stores state parameters in memory with expiration for validation
  class SecureStateStore {
    private states: Map<string, { timestamp: number; vscodeData?: any }> = new Map();
    private readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
    
    constructor() {
      // Clean up expired states every minute
      setInterval(() => this.cleanupExpiredStates(), 60 * 1000);
    }
    
    private cleanupExpiredStates() {
      const now = Date.now();
      for (const [state, data] of this.states.entries()) {
        if (now - data.timestamp > this.STATE_EXPIRY_MS) {
          this.states.delete(state);
        }
      }
    }
    
    store(req: any, callbackOrMeta: any, maybeCallback?: any) {
      // Handle both signatures: store(req, callback) and store(req, meta, callback)
      const callback = maybeCallback || callbackOrMeta;
      
      // Generate cryptographically secure random state
      const state = crypto.randomBytes(32).toString('hex');
      
      // Check if this is a VSCode redirect request
      const vscodeState = (req as any)._vscodeState;
      
      // Store state with timestamp for validation
      this.states.set(state, {
        timestamp: Date.now(),
        vscodeData: vscodeState
      });
      
      console.log(`[OAuth] Generated state: ${state.substring(0, 8)}... (expires in ${this.STATE_EXPIRY_MS / 1000}s)`);
      callback(null, state);
    }
    
    verify(req: any, state: string, callbackOrMeta: any, maybeCallback?: any) {
      // Handle both signatures: verify(req, state, callback) and verify(req, state, meta, callback)
      const callback = maybeCallback || callbackOrMeta;
      
      if (!state) {
        console.error('[OAuth] CSRF: No state parameter provided');
        return callback(new Error('Missing state parameter'), false);
      }
      
      const storedState = this.states.get(state);
      
      if (!storedState) {
        console.error(`[OAuth] CSRF: Invalid or expired state: ${state.substring(0, 8)}...`);
        return callback(new Error('Invalid or expired state parameter'), false);
      }
      
      // Check if state has expired
      const now = Date.now();
      if (now - storedState.timestamp > this.STATE_EXPIRY_MS) {
        console.error(`[OAuth] CSRF: Expired state: ${state.substring(0, 8)}...`);
        this.states.delete(state);
        return callback(new Error('Expired state parameter'), false);
      }
      
      // State is valid - remove it (one-time use)
      this.states.delete(state);
      
      // If this was a VSCode redirect, restore the data
      if (storedState.vscodeData) {
        (req as any)._vscodeState = storedState.vscodeData;
      }
      
      console.log(`[OAuth] State validated successfully: ${state.substring(0, 8)}...`);
      callback(null, true);
    }
  }
  
  passport.use('oauth', new OAuth2Strategy({
    authorizationURL: authorizationURL,
    tokenURL: tokenURL,
    clientID: process.env.MIMIR_OAUTH_CLIENT_ID!,
    clientSecret: process.env.MIMIR_OAUTH_CLIENT_SECRET!,
    callbackURL: process.env.MIMIR_OAUTH_CALLBACK_URL!,
    store: new SecureStateStore(),
    passReqToCallback: false,
  }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      // Fetch user profile from userinfo endpoint - MUST be explicitly configured
      const userinfoURL = process.env.MIMIR_OAUTH_USERINFO_URL;
      
      if (!userinfoURL) {
        return done(new Error(
          'MIMIR_OAUTH_USERINFO_URL is required. Each provider has different userinfo endpoints:\n' +
          '  - Okta: https://your-domain.okta.com/oauth2/v1/userinfo\n' +
          '  - Auth0: https://your-domain.auth0.com/userinfo\n' +
          '  - Azure AD: https://graph.microsoft.com/oidc/userinfo\n' +
          '  - Google: https://openidconnect.googleapis.com/v1/userinfo'
        ));
      }
      
      // SECURITY: Validate access token format to prevent SSRF and injection attacks
      try {
        validateOAuthTokenFormat(accessToken);
      } catch (validationError: any) {
        console.error('[OAuth] Invalid access token format:', validationError.message);
        return done(new Error('Invalid access token format'));
      }
      
      // SECURITY: Validate userinfo URL to prevent SSRF attacks
      try {
        validateOAuthUserinfoUrl(userinfoURL);
      } catch (validationError: any) {
        console.error('[OAuth] Invalid userinfo URL:', validationError.message);
        return done(new Error('Invalid OAuth configuration'));
      }
      
      // Configure timeout for userinfo fetch (default 10s, configurable via env)
      const timeoutMs = parseInt(process.env.MIMIR_OAUTH_TIMEOUT_MS || '10000', 10);
      
      const fetchOptions = createSecureFetchOptions(
        userinfoURL,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        },
        undefined, // no API key env var
        timeoutMs  // explicit timeout
      );
      
      console.log(`[OAuth] Fetching userinfo from ${userinfoURL} (timeout: ${timeoutMs}ms)`);
      
      const response = await fetch(userinfoURL, fetchOptions);
      
      if (!response.ok) {
        const errorMsg = `Failed to fetch user profile: ${response.status} ${response.statusText}`;
        console.error(`[OAuth] ${errorMsg}`);
        return done(new Error(errorMsg));
      }
      
      const userProfile = await response.json();
      
      // Extract roles from profile (configurable claim path)
      const roles = userProfile.roles || userProfile.groups || [];
      
      const user = {
        id: userProfile.sub || userProfile.id || userProfile.email,
        email: userProfile.email,
        username: userProfile.preferred_username || userProfile.username || userProfile.email,
        roles: Array.isArray(roles) ? roles : [roles],
        // Preserve original profile for custom claim extraction
        ...userProfile
      };
      
      console.log(`[OAuth] User profile fetched successfully: ${user.email}`);
      
      // Pass access token as authInfo so it's available in the callback route
      return done(null, user, { accessToken });
    } catch (error: any) {
      // Handle timeout specifically
      if (error.name === 'AbortError') {
        const timeoutMsg = `OAuth userinfo request timed out after ${process.env.MIMIR_OAUTH_TIMEOUT_MS || '10000'}ms`;
        console.error(`[OAuth] ${timeoutMsg}`);
        return done(new Error(timeoutMsg));
      }
      
      // Handle other fetch errors
      console.error('[OAuth] Error fetching user profile:', error.message || error);
      return done(error);
    }
  }));
}

// Serialize user to session
passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((user: any, done) => done(null, user));

export default passport;
