/**
 * Minimal Local OAuth 2.0 Provider for Testing
 * 
 * Implements OAuth 2.0 Authorization Code Flow:
 * - Authorization endpoint (user consent)
 * - Token exchange endpoint
 * - Userinfo endpoint
 * 
 * Run: npx tsx testing/local-oauth-provider.ts
 */

import express from 'express';
import crypto from 'crypto';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// In-memory storage
const authCodes = new Map<string, { clientId: string; redirectUri: string; userId: string; expiresAt: number }>();
const accessTokens = new Map<string, { userId: string; expiresAt: number }>();

// Mock users
const users = [
  {
    sub: 'user-001',
    email: 'admin@localhost',
    preferred_username: 'admin',
    roles: ['admin', 'developer'],
    password: 'admin123'
  },
  {
    sub: 'user-002',
    email: 'developer@localhost',
    preferred_username: 'developer',
    roles: ['developer'],
    password: 'dev123'
  },
  {
    sub: 'user-003',
    email: 'viewer@localhost',
    preferred_username: 'viewer',
    roles: ['viewer'],
    password: 'view123'
  }
];

// Configuration
const CLIENT_ID = 'mimir-local-test';
const CLIENT_SECRET = 'local-test-secret-123';
const ISSUER = 'http://localhost:8888';

/**
 * GET /oauth2/v1/authorize
 * Authorization endpoint - shows consent form
 */
app.get('/oauth2/v1/authorize', (req, res) => {
  const { response_type, client_id, redirect_uri, state, scope } = req.query;

  console.log('[OAuth Provider] Authorization request:', { response_type, client_id, redirect_uri, state, scope });

  if (response_type !== 'code') {
    return res.status(400).send('Unsupported response_type. Only "code" is supported.');
  }

  if (client_id !== CLIENT_ID) {
    return res.status(400).send('Invalid client_id');
  }

  if (!redirect_uri) {
    return res.status(400).send('redirect_uri is required');
  }

  // Show simple login/consent form
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Local OAuth Provider - Login</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
        h2 { color: #333; }
        form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        label { display: block; margin: 10px 0 5px; font-weight: bold; }
        input, select { width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
        button:hover { background: #45a049; }
        .info { background: #e3f2fd; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .user-info { font-size: 12px; color: #666; margin-top: 10px; }
      </style>
    </head>
    <body>
      <h2>🔐 Local OAuth Provider</h2>
      <div class="info">
        <strong>Test OAuth Login</strong><br>
        Application: Mimir<br>
        Redirect: ${redirect_uri}
      </div>
      <form method="POST" action="/oauth2/v1/authorize/consent">
        <input type="hidden" name="client_id" value="${client_id}">
        <input type="hidden" name="redirect_uri" value="${redirect_uri}">
        <input type="hidden" name="state" value="${state || ''}">
        <input type="hidden" name="scope" value="${scope || ''}">
        
        <label>Select Test User:</label>
        <select name="user_id" required>
          ${users.map(u => `
            <option value="${u.sub}">
              ${u.preferred_username} (${u.email}) - Roles: ${u.roles.join(', ')}
            </option>
          `).join('')}
        </select>
        
        <div class="user-info">
          <strong>Available users:</strong><br>
          ${users.map(u => `• ${u.preferred_username} / ${u.password} - [${u.roles.join(', ')}]`).join('<br>')}
        </div>
        
        <button type="submit">Authorize & Continue</button>
      </form>
    </body>
    </html>
  `);
});

/**
 * POST /oauth2/v1/authorize/consent
 * User consents and gets redirected with authorization code
 */
app.post('/oauth2/v1/authorize/consent', (req, res) => {
  const { client_id, redirect_uri, state, user_id } = req.body;

  console.log('[OAuth Provider] User consent:', { client_id, redirect_uri, user_id });

  // Generate authorization code
  const authCode = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  authCodes.set(authCode, {
    clientId: client_id,
    redirectUri: redirect_uri,
    userId: user_id,
    expiresAt
  });

  console.log('[OAuth Provider] Generated auth code:', authCode.substring(0, 20) + '...');

  // Redirect back to app with code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', authCode);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  console.log('[OAuth Provider] Redirecting to:', redirectUrl.toString());
  res.redirect(redirectUrl.toString());
});

/**
 * POST /oauth2/v1/token
 * Token exchange endpoint
 */
app.post('/oauth2/v1/token', (req, res) => {
  const { grant_type, code, redirect_uri, client_id, client_secret } = req.body;

  console.log('[OAuth Provider] Token request:', { grant_type, code: code?.substring(0, 20) + '...', client_id });

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported'
    });
  }

  if (client_id !== CLIENT_ID || client_secret !== CLIENT_SECRET) {
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client credentials'
    });
  }

  const authData = authCodes.get(code);
  if (!authData) {
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid or expired authorization code'
    });
  }

  if (authData.expiresAt < Date.now()) {
    authCodes.delete(code);
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Authorization code expired'
    });
  }

  if (authData.redirectUri !== redirect_uri) {
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'redirect_uri mismatch'
    });
  }

  // Delete used code (one-time use)
  authCodes.delete(code);

  // Generate access token
  const accessToken = crypto.randomBytes(32).toString('hex');
  const expiresIn = 3600; // 1 hour
  accessTokens.set(accessToken, {
    userId: authData.userId,
    expiresAt: Date.now() + expiresIn * 1000
  });

  console.log('[OAuth Provider] Issued access token for user:', authData.userId);

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: 'openid profile email'
  });
});

/**
 * GET /oauth2/v1/userinfo
 * Userinfo endpoint
 */
app.get('/oauth2/v1/userinfo', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.substring(7);
  const tokenData = accessTokens.get(token);

  if (!tokenData) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Invalid access token'
    });
  }

  if (tokenData.expiresAt < Date.now()) {
    accessTokens.delete(token);
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Access token expired'
    });
  }

  const user = users.find(u => u.sub === tokenData.userId);
  if (!user) {
    return res.status(500).json({
      error: 'server_error',
      error_description: 'User not found'
    });
  }

  console.log('[OAuth Provider] Userinfo request for:', user.email);

  const { password, ...userProfile } = user;
  res.json(userProfile);
});

/**
 * GET /.well-known/oauth-authorization-server
 * OAuth 2.0 Discovery endpoint
 */
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth2/v1/authorize`,
    token_endpoint: `${ISSUER}/oauth2/v1/token`,
    userinfo_endpoint: `${ISSUER}/oauth2/v1/userinfo`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['client_secret_post']
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', users: users.length });
});

// Start server
const PORT = 8888;
app.listen(PORT, () => {
  console.log(`\n🚀 Local OAuth Provider running on http://localhost:${PORT}`);
  console.log(`\n📋 Configuration for .env file:`);
  console.log(`MIMIR_AUTH_PROVIDER=oauth`);
  console.log(`MIMIR_OAUTH_ISSUER=${ISSUER}`);
  console.log(`MIMIR_OAUTH_CLIENT_ID=${CLIENT_ID}`);
  console.log(`MIMIR_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`MIMIR_OAUTH_CALLBACK_URL=http://localhost:9042/auth/oauth/callback`);
  console.log(`\n👥 Test Users:`);
  users.forEach(u => {
    console.log(`  • ${u.preferred_username} / ${u.password} - [${u.roles.join(', ')}]`);
  });
  console.log(`\n✅ Ready to accept OAuth requests!\n`);
});
