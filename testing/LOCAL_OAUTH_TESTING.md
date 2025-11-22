# Local OAuth Provider Testing

This guide explains how to test the full OAuth 2.0 Authorization Code flow using a local OAuth provider.

## Why Use This?

- **No external dependencies**: Test OAuth without registering apps with Google, GitHub, etc.
- **Localhost redirects**: External providers often don't allow `localhost` redirects
- **Multiple test users**: Pre-configured users with different roles for RBAC testing
- **Full flow testing**: Tests authorization, token exchange, and userinfo endpoints

## Quick Start

### 1. Start the Local OAuth Provider

```bash
npx tsx testing/local-oauth-provider.ts
```

You should see:
```
🚀 Local OAuth Provider running on http://localhost:8888

📋 Configuration for .env file:
MIMIR_AUTH_PROVIDER=oauth
MIMIR_OAUTH_ISSUER=http://localhost:8888
MIMIR_OAUTH_CLIENT_ID=mimir-local-test
MIMIR_OAUTH_CLIENT_SECRET=local-test-secret-123
MIMIR_OAUTH_CALLBACK_URL=http://localhost:9042/auth/oauth/callback

👥 Test Users:
  • admin / admin123 - [admin, developer]
  • developer / dev123 - [developer]
  • viewer / view123 - [viewer]

✅ Ready to accept OAuth requests!
```

### 2. Configure Mimir

Add to your `.env` file:

```bash
# Enable security
MIMIR_ENABLE_SECURITY=true

# Local OAuth Provider
MIMIR_AUTH_PROVIDER=oauth
MIMIR_OAUTH_ISSUER=http://localhost:8888
MIMIR_OAUTH_CLIENT_ID=mimir-local-test
MIMIR_OAUTH_CLIENT_SECRET=local-test-secret-123
MIMIR_OAUTH_CALLBACK_URL=http://localhost:9042/auth/oauth/callback
MIMIR_OAUTH_PROVIDER_NAME=Local Test OAuth
```

### 3. Start Mimir

```bash
npm run dev
# or
docker compose up
```

### 4. Test the OAuth Flow

1. Navigate to `http://localhost:9042`
2. Click "Login with Local Test OAuth"
3. You'll be redirected to `http://localhost:8888/oauth2/v1/authorize`
4. Select a test user from the dropdown
5. Click "Authorize & Continue"
6. You'll be redirected back to Mimir with an authenticated session

## Test Users

| Username  | Password | Roles              | Use Case                    |
|-----------|----------|--------------------|-----------------------------|
| admin     | admin123 | admin, developer   | Full admin access testing   |
| developer | dev123   | developer          | Developer role testing      |
| viewer    | view123  | viewer             | Read-only access testing    |

## OAuth Flow Details

### 1. Authorization Request
```
GET http://localhost:8888/oauth2/v1/authorize?
  response_type=code&
  client_id=mimir-local-test&
  redirect_uri=http://localhost:9042/auth/oauth/callback&
  scope=openid%20profile%20email&
  state=random_state_string
```

### 2. User Consent
- User selects test user and clicks "Authorize"
- Provider generates authorization code
- Redirects to callback with code

### 3. Token Exchange
```
POST http://localhost:8888/oauth2/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=AUTHORIZATION_CODE&
redirect_uri=http://localhost:9042/auth/oauth/callback&
client_id=mimir-local-test&
client_secret=local-test-secret-123
```

Response:
```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email"
}
```

### 4. Userinfo Request
```
GET http://localhost:8888/oauth2/v1/userinfo
Authorization: Bearer ACCESS_TOKEN
```

Response:
```json
{
  "sub": "user-001",
  "email": "admin@localhost",
  "preferred_username": "admin",
  "roles": ["admin", "developer"]
}
```

## Troubleshooting

### "Invalid client_id"
- Make sure `MIMIR_OAUTH_CLIENT_ID=mimir-local-test` in your `.env`

### "redirect_uri mismatch"
- Verify `MIMIR_OAUTH_CALLBACK_URL=http://localhost:9042/auth/oauth/callback`
- Check ports (OAuth provider: 8888, Mimir: 9042)

### "Authorization code expired"
- Authorization codes expire after 10 minutes
- Restart the OAuth flow

### Network Errors
- Ensure both OAuth provider (8888) and Mimir (9042) are running
- Check firewall/network settings

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/oauth2/v1/authorize` | GET | Authorization endpoint (shows consent form) |
| `/oauth2/v1/authorize/consent` | POST | Processes user consent |
| `/oauth2/v1/token` | POST | Token exchange |
| `/oauth2/v1/userinfo` | GET | User profile |
| `/.well-known/oauth-authorization-server` | GET | Discovery endpoint |
| `/health` | GET | Health check |

## Customization

### Add More Test Users

Edit `testing/local-oauth-provider.ts`:

```typescript
const users = [
  {
    sub: 'user-004',
    email: 'custom@localhost',
    preferred_username: 'custom',
    roles: ['custom-role'],
    password: 'custom123'
  }
];
```

### Change Port

```typescript
const PORT = 8888; // Change this
const ISSUER = 'http://localhost:8888'; // Update this too
```

### Modify Client Credentials

```typescript
const CLIENT_ID = 'your-client-id';
const CLIENT_SECRET = 'your-client-secret';
```

## Production Notes

⚠️ **This is for TESTING ONLY!**

- No password hashing
- No persistent storage
- No rate limiting
- No HTTPS support
- Minimal security checks

For production, use a real OAuth provider like:
- Okta
- Auth0
- Azure AD
- Google OAuth
- GitHub OAuth
