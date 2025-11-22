import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import passport from '../config/passport.js';

const router = Router();

// JWT secret from environment
// Only required when security is enabled
const JWT_SECRET: string = process.env.MIMIR_JWT_SECRET || (() => {
  if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
    throw new Error('MIMIR_JWT_SECRET must be set when MIMIR_ENABLE_SECURITY=true');
  }
  return 'dev-only-secret-not-for-production';
})();

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
  passport.authenticate('local', async (err: any, user: any, info: any) => {
    if (err) {
      return res.status(500).json({ error: 'Authentication error', details: err.message });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials', message: info?.message || 'Authentication failed' });
    }
    
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
      
      // Set JWT in HTTP-only cookie (same cookie name as OAuth for consistency)
      res.cookie('mimir_oauth_token', jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: expiresInDays * 24 * 60 * 60 * 1000
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
      res.cookie('mimir_oauth_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
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
    // Clear the OAuth/JWT cookie
    res.clearCookie('mimir_oauth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
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
    // If security is disabled, always return authenticated
    if (process.env.MIMIR_ENABLE_SECURITY !== 'true') {
      return res.json({ 
        authenticated: true,
        securityEnabled: false
      });
    }

    // Extract OAuth/JWT token from cookie (STATELESS)
    const token = req.cookies?.mimir_oauth_token;
    if (!token) {
      return res.json({ authenticated: false });
    }

    // Try JWT validation first (for dev login)
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
      return res.json({ 
        authenticated: true,
        user: {
          id: decoded.sub,
          email: decoded.email,
          username: decoded.email,
          roles: decoded.roles || ['viewer']
        }
      });
    } catch (jwtError) {
      // Not a JWT, try OAuth token validation
      const OAUTH_USERINFO_URL = process.env.MIMIR_OAUTH_USERINFO_URL || 
        (process.env.MIMIR_OAUTH_ISSUER ? `${process.env.MIMIR_OAUTH_ISSUER}/oauth2/v1/userinfo` : null);
      
      if (!OAUTH_USERINFO_URL) {
        return res.json({ authenticated: false, error: 'Invalid token' });
      }

      try {
        const response = await fetch(OAUTH_USERINFO_URL, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
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
        return res.json({ authenticated: false, error: 'Token validation failed' });
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
