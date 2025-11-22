# Local OAuth Provider Testing

This guide explains how to test the full OAuth 2.0 Authorization Code flow using a local OAuth provider.

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| Start OAuth provider | `npx tsx testing/local-oauth-provider.ts` |
| Run automated tests | `npm run test:oauth` |
| Check provider health | `curl http://localhost:8888/health` |
| View discovery metadata | `curl http://localhost:8888/.well-known/oauth-authorization-server` |
| Test login flow | Navigate to `http://localhost:9042` and click "Login" |

**Default Test Users:**
- `admin` / `admin123` - Full admin access
- `developer` / `dev123` - Developer access
- `viewer` / `view123` - Read-only access

**Ports:**
- OAuth Provider: `8888`
- Mimir Server: `9042`

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

# Local OAuth Provider (explicit endpoint URLs - no hardcoded paths!)
MIMIR_AUTH_PROVIDER=oauth
MIMIR_OAUTH_AUTHORIZATION_URL=http://localhost:8888/oauth2/v1/authorize
MIMIR_OAUTH_TOKEN_URL=http://localhost:8888/oauth2/v1/token
MIMIR_OAUTH_USERINFO_URL=http://localhost:8888/oauth2/v1/userinfo
MIMIR_OAUTH_CLIENT_ID=mimir-local-test
MIMIR_OAUTH_CLIENT_SECRET=local-test-secret-123
MIMIR_OAUTH_CALLBACK_URL=http://localhost:9042/auth/oauth/callback
MIMIR_OAUTH_PROVIDER_NAME=Local Test OAuth
MIMIR_OAUTH_ALLOW_HTTP=true  # Required for local HTTP OAuth testing
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

## Validating OAuth Flows

### Manual Flow Validation

**Step 1: Test Authorization Endpoint**
```bash
# Open in browser or use curl
curl "http://localhost:8888/oauth2/v1/authorize?response_type=code&client_id=mimir-local-test&redirect_uri=http://localhost:9042/auth/oauth/callback&state=test123"
```

Expected: HTML login form with test users

**Step 2: Test Discovery Endpoint**
```bash
curl http://localhost:8888/.well-known/oauth-authorization-server | jq
```

Expected:
```json
{
  "issuer": "http://localhost:8888",
  "authorization_endpoint": "http://localhost:8888/oauth2/v1/authorize",
  "token_endpoint": "http://localhost:8888/oauth2/v1/token",
  "userinfo_endpoint": "http://localhost:8888/oauth2/v1/userinfo",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"]
}
```

**Step 3: Test Token Exchange (requires auth code from Step 1)**
```bash
# After completing Step 1, you'll get an auth code in the redirect
curl -X POST http://localhost:8888/oauth2/v1/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTH_CODE_HERE" \
  -d "redirect_uri=http://localhost:9042/auth/oauth/callback" \
  -d "client_id=mimir-local-test" \
  -d "client_secret=local-test-secret-123"
```

Expected:
```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email"
}
```

**Step 4: Test Userinfo Endpoint**
```bash
# Use access_token from Step 3
curl http://localhost:8888/oauth2/v1/userinfo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

Expected:
```json
{
  "sub": "user-001",
  "email": "admin@localhost",
  "preferred_username": "admin",
  "roles": ["admin", "developer"]
}
```

### Automated Testing

Run the OAuth flow test script:

```bash
npm run test:oauth
```

This script validates:
- ✅ Authorization endpoint accessibility
- ✅ Token exchange with valid credentials
- ✅ Userinfo retrieval with access token
- ✅ Error handling for invalid credentials
- ✅ Token expiration behavior

### Debugging OAuth Issues

**Enable verbose logging:**

In `testing/local-oauth-provider.ts`, all requests are logged with `[OAuth Provider]` prefix. Watch the console output:

```bash
npx tsx testing/local-oauth-provider.ts
```

**Common validation failures:**

1. **State mismatch**: Check that `state` parameter is preserved through redirect
2. **Code reuse**: Authorization codes are single-use only
3. **Redirect URI mismatch**: Must match exactly (including trailing slashes)
4. **Token expiration**: Auth codes expire in 10 minutes, access tokens in 1 hour
5. **Client credentials**: Verify `CLIENT_ID` and `CLIENT_SECRET` match

**Network debugging:**

```bash
# Check OAuth provider is running
curl http://localhost:8888/health

# Check Mimir is running
curl http://localhost:9042/health

# Test full redirect flow
curl -v "http://localhost:8888/oauth2/v1/authorize?response_type=code&client_id=mimir-local-test&redirect_uri=http://localhost:9042/auth/oauth/callback&state=test"
```

### Testing Different Scenarios

**Test invalid client:**
```bash
curl "http://localhost:8888/oauth2/v1/authorize?response_type=code&client_id=invalid-client&redirect_uri=http://localhost:9042/auth/oauth/callback"
```
Expected: 400 error "Invalid client_id"

**Test expired code:**
1. Get an auth code
2. Wait 11 minutes
3. Try to exchange it
Expected: 400 error "Authorization code expired"

**Test invalid token:**
```bash
curl http://localhost:8888/oauth2/v1/userinfo \
  -H "Authorization: Bearer invalid-token"
```
Expected: 401 error "Invalid access token"

**Test role-based access:**
1. Login as `viewer` (roles: ["viewer"])
2. Verify user profile in response
3. Test that Mimir enforces role restrictions

## Production Notes

⚠️ **This is for TESTING ONLY!**

- No password hashing
- No persistent storage
- No rate limiting
- No HTTPS support
- Minimal security checks
- Hardcoded credentials
- No PKCE support
- No refresh tokens

For production, use a real OAuth provider like:
- Okta
- Auth0
- Azure AD
- Google OAuth
- GitHub OAuth
- Keycloak
