import { Router } from 'express';
import jwt from 'jsonwebtoken';
import passport from '../config/passport.js';
import { JWT_SECRET } from '../utils/jwt-secret.js';

const router = Router();

/**
 * POST /auth/token
 * OAuth 2.0 RFC 6749 compliant token endpoint
 * Supports grant_type: password (Resource Owner Password Credentials)
 * Returns access_token in response body (not cookies)
 */
router.post('/auth/token', async (req, res) => {
  const { grant_type, username, password, scope } = req.body;

  // Only support password grant type for now
  if (grant_type !== 'password') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only "password" grant type is supported'
    });
  }

  if (!username || !password) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'username and password are required'
    });
  }

  // Authenticate using passport's local strategy
  passport.authenticate('local', async (err: any, user: any, info: any) => {
    if (err) {
      return res.status(500).json({
        error: 'server_error',
        error_description: err.message
      });
    }
    if (!user) {
      return res.status(401).json({
        error: 'invalid_grant',
        error_description: info?.message || 'Invalid username or password'
      });
    }

    try {
      // Generate JWT access token (stateless, no database storage needed)
      const expiresInDays = 90; // 90 days for programmatic access
      const expiresInSeconds = expiresInDays * 24 * 60 * 60;
      
      const payload = {
        sub: user.id,           // Subject (user ID)
        email: user.email,      // User email
        roles: user.roles || ['viewer'], // User roles/permissions
        iat: Math.floor(Date.now() / 1000), // Issued at
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds // Expiration
      };

      const accessToken = jwt.sign(payload, JWT_SECRET, {
        algorithm: 'HS256'
      });

      // RFC 6749 compliant response
      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresInSeconds, // seconds
        scope: scope || 'default'
      });
    } catch (error: any) {
      console.error('[Auth] Token generation error:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: error.message
      });
    }
  })(req, res);
});

// Development: Login with username/password - STATELESS JWT (for browser UI)
router.post('/auth/login', async (req, res, next) => {
  console.log('[Auth] /auth/login POST - credentials received');
  
  passport.authenticate('local', async (err: any, user: any, info: any) => {
    if (err) {
      console.error('[Auth] Login authentication error:', err);
      return res.status(500).json({ error: 'Authentication error', details: err.message });
    }
    if (!user) {
      console.warn('[Auth] Login failed - invalid credentials:', info?.message);
      return res.status(401).json({ error: 'Invalid credentials', message: info?.message || 'Authentication failed' });
    }
    
    console.log(`[Auth] User authenticated: ${user.email} (${user.id})`);
    
    try {
      // STATELESS: Generate JWT token (no database storage)
      const expiresInDays = 7;
      const expiresInSeconds = expiresInDays * 24 * 60 * 60;
      
      const payload = {
        sub: user.id,
        email: user.email,
        roles: user.roles || ['viewer'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds
      };

      const jwtToken = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
      console.log(`[Auth] JWT generated for ${user.email}, expires in ${expiresInDays} days`);
      
      // Set JWT in HTTP-only cookie (same cookie name as OAuth for consistency)
      // Safari-compatible settings: use 'none' for sameSite in dev, explicitly set path
      const isProduction = process.env.NODE_ENV === 'production';
      const sameSiteValue: 'lax' | 'none' = isProduction ? 'lax' : 'none';
      const secureValue = isProduction || sameSiteValue === 'none'; // Safari requires secure=true when sameSite=none
      
      res.cookie('mimir_oauth_token', jwtToken, {
        httpOnly: true,
        secure: secureValue,
        sameSite: sameSiteValue,
        path: '/',
        maxAge: expiresInDays * 24 * 60 * 60 * 1000
      });
      
      console.log('[Auth] Cookie set with options:', { 
        httpOnly: true, 
        secure: secureValue, 
        sameSite: sameSiteValue,
        path: '/' 
      });
      return res.json({ 
        success: true,
        user: { 
          id: user.id, 
          email: user.email, 
          roles: user.roles || [] 
        } 
      });
    } catch (error: any) {
      console.error('[Auth] Error generating JWT:', error);
      return res.status(500).json({ error: 'Failed to generate token', details: error.message });
    }
  })(req, res, next);
});

// Production: OAuth login - returns API key
router.get('/auth/oauth/login', (req, res, next) => {
  // Encode VSCode redirect info into OAuth state parameter (stateless)
  // This preserves the info through the OAuth flow without sessions
  if (req.query.vscode_redirect === 'true') {
    const vscodeState = {
      vscode: true,
      state: req.query.state || ''
    };
    const encodedState = Buffer.from(JSON.stringify(vscodeState)).toString('base64url');
    
    // Set on request for our custom state store to use
    (req as any)._vscodeState = encodedState;
  }
  
  // Passport will use our custom stateless state store
  passport.authenticate('oauth', { session: false })(req, res, next);
});

router.get('/auth/oauth/callback', 
  passport.authenticate('oauth', { session: false }), 
  async (req: any, res) => {
    try {
      const user = req.user;
      
      // STATELESS: Use the OAuth access token directly, don't generate or store anything
      const accessToken = (req as any).authInfo?.accessToken || (req as any).account?.accessToken;
      
      if (!accessToken) {
        console.error('[Auth] No access token available from OAuth provider');
        return res.redirect('/login?error=no_token');
      }
      
      console.log('[Auth] OAuth callback successful, user:', user.username || user.email);
      
      // Set OAuth token in HTTP-only cookie for browser clients
      // Safari-compatible settings: use 'none' for sameSite in dev, explicitly set path
      const isProduction = process.env.NODE_ENV === 'production';
      const sameSiteValue: 'lax' | 'none' = isProduction ? 'lax' : 'none';
      const secureValue = isProduction || sameSiteValue === 'none'; // Safari requires secure=true when sameSite=none
      
      res.cookie('mimir_oauth_token', accessToken, {
        httpOnly: true,
        secure: secureValue,
        sameSite: sameSiteValue,
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      // Check if this is a VSCode extension OAuth flow
      // Decode the state parameter to check for VSCode redirect info
      let vscodeRedirect = false;
      let originalState = '';
      
      const stateParam = req.query.state as string;
      if (stateParam) {
        try {
          const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
          if (decoded.vscode === true) {
            vscodeRedirect = true;
            originalState = decoded.state;
          }
        } catch (e) {
          // Not a VSCode state, continue as normal browser flow
        }
      }
      
      if (vscodeRedirect) {
        // Build VSCode URI with OAuth access token and user info
        const vscodeUri = new URL('vscode://mimir.mimir-chat/oauth-callback');
        vscodeUri.searchParams.set('access_token', accessToken);
        vscodeUri.searchParams.set('username', user.username || user.email);
        if (originalState) {
          vscodeUri.searchParams.set('state', originalState);
        }
        
        console.log('[Auth] Redirecting to VSCode with OAuth token');
        return res.redirect(vscodeUri.toString());
      }
      
      // Regular browser redirect
      res.redirect('/');
    } catch (error: any) {
      console.error('[Auth] OAuth callback error:', error);
      
      // Check if VSCode redirect from state parameter
      let vscodeRedirect = false;
      let originalState = '';
      
      const stateParam = req.query.state as string;
      if (stateParam) {
        try {
          const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
          if (decoded.vscode === true) {
            vscodeRedirect = true;
            originalState = decoded.state;
          }
        } catch (e) {
          // Not a VSCode state
        }
      }
      
      if (vscodeRedirect) {
        const vscodeUri = new URL('vscode://mimir.mimir-chat/oauth-callback');
        vscodeUri.searchParams.set('error', 'oauth_failed');
        if (originalState) {
          vscodeUri.searchParams.set('state', originalState);
        }
        return res.redirect(vscodeUri.toString());
      }
      
      res.redirect('/login?error=oauth_failed');
    }
  }
);

// Logout - STATELESS: just clear cookie (no database operations)
router.post('/auth/logout', async (req, res) => {
  try {
    // Clear the OAuth/JWT cookie with Safari-compatible settings
    const isProduction = process.env.NODE_ENV === 'production';
    const sameSiteValue: 'lax' | 'none' = isProduction ? 'lax' : 'none';
    const secureValue = isProduction || sameSiteValue === 'none';
    
    res.clearCookie('mimir_oauth_token', {
      httpOnly: true,
      secure: secureValue,
      sameSite: sameSiteValue,
      path: '/'
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Logout failed', details: error.message });
  }
});

// Check auth status - verify API key
router.get('/auth/status', async (req, res) => {
  try {
    console.log('[Auth] /auth/status endpoint hit');
    
    // If security is disabled, always return authenticated
    if (process.env.MIMIR_ENABLE_SECURITY !== 'true') {
      console.log('[Auth] Security disabled, returning authenticated=true');
      return res.json({ 
        authenticated: true,
        securityEnabled: false
      });
    }

    console.log('[Auth] Security enabled, checking token...');
    
    // Extract OAuth/JWT token from cookie (STATELESS)
    const token = req.cookies?.mimir_oauth_token;
    if (!token) {
      console.log('[Auth] No mimir_oauth_token cookie found');
      console.log('[Auth] Available cookies:', Object.keys(req.cookies || {}));
      return res.json({ authenticated: false });
    }

    console.log('[Auth] Token found in cookie, attempting JWT validation...');

    // Try JWT validation first (for dev login)
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
      console.log(`[Auth] JWT valid for user: ${decoded.email}`);
      return res.json({ 
        authenticated: true,
        user: {
          id: decoded.sub,
          email: decoded.email,
          username: decoded.email,
          roles: decoded.roles || ['viewer']
        }
      });
    } catch (jwtError: any) {
      console.log('[Auth] JWT validation failed:', jwtError.message);
      
      // Not a JWT, try OAuth token validation
      const OAUTH_USERINFO_URL = process.env.MIMIR_OAUTH_USERINFO_URL || 
        (process.env.MIMIR_OAUTH_ISSUER ? `${process.env.MIMIR_OAUTH_ISSUER}/oauth2/v1/userinfo` : null);
      
      if (!OAUTH_USERINFO_URL) {
        console.log('[Auth] No OAuth userinfo URL configured, returning unauthenticated');
        return res.json({ authenticated: false, error: 'Invalid token' });
      }

      console.log('[Auth] Attempting OAuth token validation...');
      
      try {
        // SECURITY: Validate token format to prevent SSRF and injection attacks
        const { validateOAuthTokenFormat, validateOAuthUserinfoUrl, createSecureFetchOptions } = await import('../utils/fetch-helper.js');
        
        try {
          validateOAuthTokenFormat(token);
        } catch (validationError: any) {
          console.error('[Auth] Invalid token format:', validationError.message);
          return res.json({ authenticated: false, error: 'Invalid token format' });
        }
        
        // SECURITY: Validate userinfo URL to prevent SSRF attacks
        try {
          validateOAuthUserinfoUrl(OAUTH_USERINFO_URL);
        } catch (validationError: any) {
          console.error('[Auth] Invalid userinfo URL:', validationError.message);
          return res.json({ authenticated: false, error: 'Invalid OAuth configuration' });
        }
        
        // Configure timeout for OAuth validation (default 10s, configurable via env)
        const timeoutMs = parseInt(process.env.MIMIR_OAUTH_TIMEOUT_MS || '10000', 10);
        
        // Use createSecureFetchOptions for timeout support
        const fetchOptions = createSecureFetchOptions(
          OAUTH_USERINFO_URL,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          },
          undefined, // no API key env var
          timeoutMs  // explicit timeout
        );
        
        const response = await fetch(OAUTH_USERINFO_URL, fetchOptions);
        
        if (!response.ok) {
          console.log(`[Auth] OAuth token validation failed: ${response.status}`);
          return res.json({ authenticated: false, error: 'Invalid OAuth token' });
        }
        
        const userProfile = await response.json();
        const roles = userProfile.roles || userProfile.groups || ['viewer'];
        
        return res.json({ 
          authenticated: true,
          user: {
            id: userProfile.sub || userProfile.id || userProfile.email,
            email: userProfile.email,
            username: userProfile.preferred_username || userProfile.username || userProfile.email,
            roles: Array.isArray(roles) ? roles : [roles]
          }
        });
      } catch (oauthError: any) {
        // Handle timeout specifically
        if (oauthError.name === 'AbortError') {
          console.error(`[Auth] OAuth token validation timed out after ${process.env.MIMIR_OAUTH_TIMEOUT_MS || '10000'}ms`);
          return res.json({ authenticated: false, error: 'OAuth validation timed out' });
        }
        
        console.error('[Auth] OAuth token validation error:', oauthError);
        return res.json({ authenticated: false, error: 'OAuth validation failed', details: oauthError.message });
      }
    }
  } catch (error: any) {
    console.error('[Auth] Status check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get auth configuration for frontend
router.get('/auth/config', (req, res) => {
  console.log('[Auth] /auth/config endpoint hit');
  
  const securityEnabled = process.env.MIMIR_ENABLE_SECURITY === 'true';
  
  if (!securityEnabled) {
    return res.json({
      devLoginEnabled: false,
      oauthProviders: []
    });
  }

  // Check if dev mode is enabled (MIMIR_DEV_USER_* vars present)
  const hasDevUsers = Object.keys(process.env).some(key => 
    key.startsWith('MIMIR_DEV_USER_') && process.env[key]
  );

  // Check if OAuth is configured
  const oauthEnabled = !!(
    process.env.MIMIR_OAUTH_CLIENT_ID &&
    process.env.MIMIR_OAUTH_CLIENT_SECRET &&
    process.env.MIMIR_OAUTH_ISSUER
  );

  // Build OAuth providers array
  const oauthProviders = [];
  if (oauthEnabled) {
    oauthProviders.push({
      name: 'oauth',
      url: '/auth/oauth/login',
      displayName: process.env.MIMIR_OAUTH_PROVIDER_NAME || 'OAuth 2.0'
    });
  }

  const config = {
    devLoginEnabled: hasDevUsers,
    oauthProviders
  };

  console.log('[Auth] Sending config:', JSON.stringify(config));
  res.json(config);
});

export default router;
