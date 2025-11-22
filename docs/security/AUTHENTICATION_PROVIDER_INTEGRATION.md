# Authentication Provider Integration Strategy

**Version**: 1.0.0  
**Date**: 2025-11-21  
**Status**: Design Document

---

## 🎯 Overview

This document defines Mimir's authentication strategy for integrating with **upstream** (identity providers) and **downstream** (services that depend on Mimir) authentication systems, with special focus on **PCTX compatibility**.

**Goals**:
- ✅ Support multiple OAuth 2.0 / OIDC providers (Okta, Auth0, Azure AD, Google)
- ✅ Enable upstream authentication (Mimir authenticates users via external IdP)
- ✅ Enable downstream authentication (PCTX authenticates via Mimir)
- ✅ Maintain backward compatibility (API keys still work)
- ✅ Support token forwarding and delegation
- ✅ Enable SSO (Single Sign-On) across integrated services

---

## 📋 Table of Contents

1. [Authentication Flow Architecture](#authentication-flow-architecture)
2. [Upstream Providers (Identity Providers)](#upstream-providers-identity-providers)
3. [Downstream Services (PCTX, etc.)](#downstream-services-pctx-etc)
4. [Token Management](#token-management)
5. [Implementation Guide](#implementation-guide)
6. [Environment Variables](#environment-variables)
7. [Testing & Validation](#testing--validation)

---

## Authentication Flow Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UPSTREAM PROVIDERS                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  Okta    │  │  Auth0   │  │  Azure   │  │  Google  │           │
│  │   IdP    │  │   IdP    │  │    AD    │  │  OAuth   │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │             │              │             │                  │
│       └─────────────┴──────────────┴─────────────┘                  │
│                            │                                         │
│                    OAuth 2.0 / OIDC                                  │
│                            │                                         │
└────────────────────────────┼─────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         MIMIR (Auth Hub)                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Authentication Layer                                         │  │
│  │  • Validates tokens from upstream IdPs                        │  │
│  │  • Issues Mimir tokens for downstream services                │  │
│  │  │  • Manages token lifecycle (refresh, revoke)                │  │
│  │  • Enforces RBAC policies                                     │  │
│  │  • Audit logging                                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Supported Auth Methods:                                             │
│  1. OAuth 2.0 / OIDC (upstream IdP tokens)                          │
│  2. API Keys (backward compatible)                                   │
│  3. Mimir-issued JWT (for downstream services)                      │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                    Mimir JWT / API Key
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      DOWNSTREAM SERVICES                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  PCTX    │  │  Custom  │  │  MCP     │  │  Future  │           │
│  │  Proxy   │  │  Agents  │  │  Clients │  │  Services│           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### Authentication Modes

Mimir supports **2 authentication modes** (simplified):

| Mode | Use Case | Token Type | Validation |
|------|----------|------------|------------|
| **1. API Key** | Simple, service-to-service, backward compatible | `X-API-Key: xxx` | String match |
| **2. OAuth/OIDC** | User authentication, enterprise SSO | `Authorization: Bearer <token>` | JWT validation against IdP |

**Note**: Mimir validates tokens from upstream IdPs directly. No intermediate Mimir JWT layer - keeps it simple.

---

## Upstream Providers (Identity Providers)

### Supported Providers

Mimir integrates with any **OAuth 2.0 / OIDC compliant** provider:

| Provider | Protocol | Use Case | Priority |
|----------|----------|----------|----------|
| **Okta** | OIDC | Enterprise SSO | HIGH |
| **Auth0** | OIDC | SaaS, multi-tenant | HIGH |
| **Azure AD** | OIDC | Microsoft 365 integration | HIGH |
| **Google** | OAuth 2.0 | Google Workspace | MEDIUM |
| **Keycloak** | OIDC | Self-hosted, open-source | MEDIUM |
| **AWS Cognito** | OIDC | AWS integration | LOW |
| **Generic OIDC** | OIDC | Any compliant provider | ALL |

### Provider Configuration

Each provider requires these environment variables:

```bash
# Provider-specific configuration
MIMIR_AUTH_PROVIDER=okta  # okta, auth0, azure, google, keycloak, generic

# OAuth 2.0 / OIDC endpoints
MIMIR_OAUTH_ISSUER=https://your-tenant.okta.com
MIMIR_OAUTH_AUTHORIZATION_ENDPOINT=https://your-tenant.okta.com/oauth2/v1/authorize
MIMIR_OAUTH_TOKEN_ENDPOINT=https://your-tenant.okta.com/oauth2/v1/token
MIMIR_OAUTH_JWKS_URI=https://your-tenant.okta.com/oauth2/v1/keys
MIMIR_OAUTH_USERINFO_ENDPOINT=https://your-tenant.okta.com/oauth2/v1/userinfo

# Client credentials
MIMIR_OAUTH_CLIENT_ID=your-client-id
MIMIR_OAUTH_CLIENT_SECRET=your-client-secret
MIMIR_OAUTH_REDIRECT_URI=https://mimir.yourcompany.com/auth/callback

# Token configuration
MIMIR_OAUTH_SCOPE=openid profile email groups
MIMIR_OAUTH_AUDIENCE=mimir-api
```

### Provider-Specific Configurations

#### Okta

```bash
# Okta Configuration
MIMIR_AUTH_PROVIDER=okta
MIMIR_OAUTH_ISSUER=https://your-tenant.okta.com
MIMIR_OAUTH_CLIENT_ID=0oa1234567890abcdef
MIMIR_OAUTH_CLIENT_SECRET=your-okta-client-secret
MIMIR_OAUTH_REDIRECT_URI=https://mimir.yourcompany.com/auth/callback
MIMIR_OAUTH_SCOPE=openid profile email groups

# Okta-specific
MIMIR_OKTA_DOMAIN=your-tenant.okta.com
MIMIR_OKTA_AUTHORIZATION_SERVER=default  # or custom
```

#### Auth0

```bash
# Auth0 Configuration
MIMIR_AUTH_PROVIDER=auth0
MIMIR_OAUTH_ISSUER=https://your-tenant.auth0.com/
MIMIR_OAUTH_CLIENT_ID=abc123def456ghi789
MIMIR_OAUTH_CLIENT_SECRET=your-auth0-client-secret
MIMIR_OAUTH_REDIRECT_URI=https://mimir.yourcompany.com/auth/callback
MIMIR_OAUTH_SCOPE=openid profile email

# Auth0-specific
MIMIR_AUTH0_DOMAIN=your-tenant.auth0.com
MIMIR_AUTH0_AUDIENCE=https://mimir.yourcompany.com/api
```

#### Azure AD

```bash
# Azure AD Configuration
MIMIR_AUTH_PROVIDER=azure
MIMIR_OAUTH_ISSUER=https://login.microsoftonline.com/{tenant-id}/v2.0
MIMIR_OAUTH_CLIENT_ID=12345678-1234-1234-1234-123456789012
MIMIR_OAUTH_CLIENT_SECRET=your-azure-client-secret
MIMIR_OAUTH_REDIRECT_URI=https://mimir.yourcompany.com/auth/callback
MIMIR_OAUTH_SCOPE=openid profile email User.Read

# Azure-specific
MIMIR_AZURE_TENANT_ID=your-tenant-id
MIMIR_AZURE_TENANT_NAME=yourcompany.onmicrosoft.com
```

#### Google

```bash
# Google OAuth Configuration
MIMIR_AUTH_PROVIDER=google
MIMIR_OAUTH_ISSUER=https://accounts.google.com
MIMIR_OAUTH_CLIENT_ID=123456789012-abcdefghijklmnop.apps.googleusercontent.com
MIMIR_OAUTH_CLIENT_SECRET=your-google-client-secret
MIMIR_OAUTH_REDIRECT_URI=https://mimir.yourcompany.com/auth/callback
MIMIR_OAUTH_SCOPE=openid profile email

# Google-specific
MIMIR_GOOGLE_HOSTED_DOMAIN=yourcompany.com  # Restrict to specific domain
```

#### Keycloak (Self-Hosted)

```bash
# Keycloak Configuration
MIMIR_AUTH_PROVIDER=keycloak
MIMIR_OAUTH_ISSUER=https://keycloak.yourcompany.com/realms/mimir
MIMIR_OAUTH_CLIENT_ID=mimir-client
MIMIR_OAUTH_CLIENT_SECRET=your-keycloak-client-secret
MIMIR_OAUTH_REDIRECT_URI=https://mimir.yourcompany.com/auth/callback
MIMIR_OAUTH_SCOPE=openid profile email roles

# Keycloak-specific
MIMIR_KEYCLOAK_REALM=mimir
MIMIR_KEYCLOAK_SERVER_URL=https://keycloak.yourcompany.com
```

---

## Downstream Services (PCTX, etc.)

### PCTX Integration

PCTX needs to authenticate with Mimir to access MCP tools. Mimir supports **2 authentication flows** for PCTX:

#### PCTX Authentication (Simplified - API Key Only)

```
┌──────────┐                           ┌──────────┐
│  PCTX    │  X-API-Key: mimir-key    │  Mimir   │
│  Server  │ ───────────────────────→  │  Server  │
└──────────┘                           └──────────┘
```

**Configuration**:
```bash
# PCTX .env
MIMIR_URL=https://mimir.yourcompany.com
MIMIR_API_KEY=your-mimir-api-key
```

**Why Simple?**: 
- ✅ Works immediately, no OAuth setup needed
- ✅ PCTX is a trusted service on your infrastructure
- ✅ Use OAuth for end-user authentication, API keys for service-to-service
- ✅ Reduces complexity - no token forwarding, no service accounts, no JWT issuance

### Other Downstream Services

Any service that needs to call Mimir can use:

1. **API Key** - For trusted services on your infrastructure (PCTX, internal tools)
2. **OAuth Token** - For end-user authentication (web apps, mobile apps)

**Simplified**: No intermediate JWT layer. Services use API keys, users use OAuth.

---

## Token Management

### Token Types (Simplified)

| Token Type | Issuer | Lifetime | Use Case |
|------------|--------|----------|----------|
| **OAuth Access Token** | Okta/Auth0/Azure/Google | 1 hour | User authentication |
| **OAuth Refresh Token** | Okta/Auth0/Azure/Google | 90 days | Refresh access token |
| **API Key** | Mimir Admin | Infinite | Service-to-service, backward compatible |

**Simplified**: Mimir validates IdP tokens directly. No need for Mimir to issue its own JWTs.

### Token Lifecycle

#### 1. User Authentication Flow (OAuth 2.0 Authorization Code)

```
1. User → Mimir: Request access
2. Mimir → IdP: Redirect to login
3. User → IdP: Authenticate
4. IdP → Mimir: Authorization code
5. Mimir → IdP: Exchange code for tokens
6. IdP → Mimir: Access token + Refresh token
7. Mimir → User: Set session cookie + Mimir JWT
```

#### 2. Token Validation Flow

```
1. Client → Mimir: Request with Bearer token
2. Mimir: Check token type (IdP or Mimir)
3a. If IdP token:
    - Validate signature against IdP JWKS
    - Check expiration
    - Extract user claims
3b. If Mimir token:
    - Validate signature against Mimir secret
    - Check expiration
    - Extract user + service claims
4. Mimir: Process request with user context
```

#### 3. Token Refresh Flow

```
1. Client → Mimir: Request with expired access token
2. Mimir: Return 401 with "token_expired" error
3. Client → Mimir: POST /auth/refresh with refresh token
4. Mimir → IdP: Validate refresh token
5. IdP → Mimir: New access token
6. Mimir → Client: New Mimir JWT
```

### Token Storage

**Server-Side (Mimir)**:
```bash
# Redis for token storage (recommended)
MIMIR_TOKEN_STORAGE=redis
MIMIR_REDIS_URL=redis://localhost:6379
MIMIR_REDIS_DB=0
MIMIR_REDIS_KEY_PREFIX=mimir:tokens:

# Or in-memory (development only)
MIMIR_TOKEN_STORAGE=memory
```

**Client-Side**:
- **Web**: HTTP-only secure cookies (recommended)
- **Mobile**: Secure storage (Keychain/Keystore)
- **CLI**: Encrypted file in `~/.mimir/credentials`
- **PCTX**: Environment variables or secrets manager

---

## Implementation Guide

### Phase 1: Basic OAuth Support (Week 1)

**Goal**: Support one OAuth provider (Okta or Auth0)

**Tasks**:
1. Add OAuth middleware to `src/middleware/auth.ts`
2. Implement authorization code flow
3. Add token validation
4. Store tokens in Redis
5. Test with Okta

**Files to Create/Modify**:
```
src/middleware/oauth.ts          # OAuth flow implementation
src/utils/token-validator.ts     # JWT validation
src/api/auth-api.ts              # Auth endpoints (/login, /callback, /refresh)
src/config/oauth-providers.ts    # Provider configurations
```

### Phase 2: Multi-Provider Support (Week 2)

**Goal**: Support Okta, Auth0, Azure AD, Google

**Tasks**:
1. Abstract provider-specific logic
2. Add provider factory pattern
3. Implement provider discovery
4. Add provider switching UI
5. Test all providers

**Files to Create/Modify**:
```
src/providers/okta.ts
src/providers/auth0.ts
src/providers/azure.ts
src/providers/google.ts
src/providers/base-provider.ts   # Abstract base class
```

### Phase 3: API Key Management (Week 3)

**Goal**: Simple API key management for downstream services

**Tasks**:
1. Add API key CRUD operations
2. Add API key validation to auth middleware
3. Test with PCTX

**Files to Create/Modify**:
```
src/api/api-keys-api.ts          # Manage API keys (create, list, revoke)
src/middleware/auth.ts           # Add API key validation
```

**Simplified**: No JWT issuance, no service accounts, no token forwarding. Just simple API keys.

### Phase 4: Token Management (Week 4)

**Goal**: Complete token lifecycle management

**Tasks**:
1. Implement token refresh
2. Add token revocation
3. Implement token introspection
4. Add token cleanup (expired tokens)
5. Add monitoring

**Files to Create/Modify**:
```
src/api/token-api.ts             # Token management endpoints
src/jobs/token-cleanup.ts        # Cleanup expired tokens
src/utils/token-monitor.ts       # Monitor token usage
```

---

## Environment Variables

### Complete OAuth Configuration (Simplified with Passport.js)

```bash
# ============================================================================
# AUTHENTICATION PROVIDER CONFIGURATION (Passport.js)
# ============================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Feature Flag
# ─────────────────────────────────────────────────────────────────────────────

# Enable security features (set to true to activate authentication)
MIMIR_ENABLE_SECURITY=true

# ─────────────────────────────────────────────────────────────────────────────
# OAuth Provider Configuration (SIMPLIFIED - Only 5 variables!)
# ─────────────────────────────────────────────────────────────────────────────

# Provider type (okta, auth0, azure, google, keycloak)
MIMIR_AUTH_PROVIDER=okta

# Client credentials (from IdP)
MIMIR_OAUTH_CLIENT_ID=your-client-id
MIMIR_OAUTH_CLIENT_SECRET=your-client-secret
MIMIR_OAUTH_CALLBACK_URL=https://mimir.yourcompany.com/auth/callback
MIMIR_OAUTH_ISSUER=https://your-tenant.okta.com

# Optional: Custom scopes (defaults to: openid profile email)
MIMIR_OAUTH_SCOPE=openid profile email groups

# ✅ THAT'S IT! Passport auto-discovers all endpoints from the issuer URL
# ❌ NO NEED FOR: authorization_endpoint, token_endpoint, jwks_uri, userinfo_endpoint, revocation_endpoint
# Passport strategies handle endpoint discovery automatically via .well-known/openid-configuration

# ─────────────────────────────────────────────────────────────────────────────
# Stateless Authentication (JWT/OAuth)
# ─────────────────────────────────────────────────────────────────────────────

# JWT secret for signing tokens
MIMIR_JWT_SECRET=your-jwt-secret-generate-with-openssl

# Note: No session storage - all authentication is stateless via JWT/OAuth tokens

# ─────────────────────────────────────────────────────────────────────────────
# API Key Authentication (Downstream Services - Simplified)
# ─────────────────────────────────────────────────────────────────────────────

# API keys for trusted services (comma-separated for multiple keys)
MIMIR_API_KEYS=key1,key2,key3

# Or single API key
MIMIR_API_KEY=your-api-key-here

# ─────────────────────────────────────────────────────────────────────────────
# Security Features (Passport handles these automatically)
# ─────────────────────────────────────────────────────────────────────────────

# ✅ PKCE - Passport strategies enable this by default
# ✅ State parameter - Passport generates and validates automatically
# ✅ Nonce - Passport OIDC strategies handle this
# ✅ Token validation - Passport validates JWT signatures automatically
# ✅ Token refresh - Passport handles refresh tokens automatically

# No configuration needed! Passport does it all.
```

### Environment Variable Count Comparison

| Approach | Variables Required | Complexity |
|----------|-------------------|------------|
| **Custom OAuth** | ~25 variables | High - manual endpoint config, token management, validation |
| **Passport.js** | **~10 variables** | **Low - auto-discovery, built-in validation** |

**Reduction**: 60% fewer environment variables with Passport.js!

### PCTX Configuration (Downstream)

```bash
# ============================================================================
# PCTX AUTHENTICATION WITH MIMIR (Simplified)
# ============================================================================

# Mimir URL
MIMIR_URL=https://mimir.yourcompany.com

# API Key (simple and secure)
MIMIR_API_KEY=your-mimir-api-key
```

**That's it!** No auth modes, no service accounts, no token forwarding. Just a simple API key.

---

## Testing & Validation

### Test 1: OAuth Login Flow

```bash
# 1. Start OAuth flow
curl -I https://mimir.yourcompany.com/auth/login
# Expected: 302 redirect to IdP

# 2. After IdP authentication, callback should succeed
curl https://mimir.yourcompany.com/auth/callback?code=xxx&state=yyy
# Expected: 200 OK with session cookie

# 3. Access protected endpoint
curl -H "Cookie: mimir_session=xxx" https://mimir.yourcompany.com/api/nodes/query
# Expected: 200 OK
```

### Test 2: Token Validation

```bash
# Get token from IdP
TOKEN=$(curl -X POST https://your-tenant.okta.com/oauth2/v1/token \
  -d "grant_type=client_credentials" \
  -d "client_id=xxx" \
  -d "client_secret=yyy" \
  -d "scope=mimir-api" | jq -r '.access_token')

# Use token with Mimir
curl -H "Authorization: Bearer $TOKEN" https://mimir.yourcompany.com/api/nodes/query
# Expected: 200 OK
```

### Test 3: PCTX Integration

```bash
# Configure PCTX with service account
export MIMIR_URL=https://mimir.yourcompany.com
export MIMIR_AUTH_MODE=service-account
export MIMIR_SERVICE_ACCOUNT_ID=pctx-service
export MIMIR_SERVICE_ACCOUNT_SECRET=your-secret

# Start PCTX
pctx start

# Call Mimir through PCTX
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# Expected: 200 OK with Mimir tools
```

### Test 4: Token Refresh

```bash
# Use expired token
curl -H "Authorization: Bearer expired_token" https://mimir.yourcompany.com/api/nodes/query
# Expected: 401 Unauthorized with "token_expired" error

# Refresh token
curl -X POST https://mimir.yourcompany.com/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"your_refresh_token"}'
# Expected: 200 OK with new access token
```

---

## Migration Path

### Stage 1: Add OAuth (No Breaking Changes)

```bash
# Keep API keys working
MIMIR_AUTH_METHODS=api-key,oauth
MIMIR_DEFAULT_AUTH_METHOD=api-key  # Still default to API keys

# Add OAuth configuration
MIMIR_AUTH_PROVIDER=okta
MIMIR_OAUTH_CLIENT_ID=xxx
MIMIR_OAUTH_CLIENT_SECRET=yyy
```

**Result**: Both API keys and OAuth work

### Stage 2: Migrate PCTX to Service Account

```bash
# PCTX old config (API key)
MIMIR_API_KEY=old-api-key

# PCTX new config (service account)
MIMIR_AUTH_MODE=service-account
MIMIR_SERVICE_ACCOUNT_ID=pctx-service
MIMIR_SERVICE_ACCOUNT_SECRET=new-secret
```

**Result**: PCTX has service identity + can forward user context

### Stage 3: Make OAuth Default

```bash
# Switch default to OAuth
MIMIR_DEFAULT_AUTH_METHOD=oauth

# API keys still work for services
MIMIR_AUTH_METHODS=api-key,oauth,jwt
```

**Result**: Users use OAuth, services use API keys/JWTs

---

## Security Considerations

### Token Security

1. **HTTPS Only**: All OAuth flows require HTTPS
2. **PKCE**: Use PKCE for public clients (mobile, SPA)
3. **State Parameter**: Prevent CSRF attacks
4. **Nonce**: Prevent replay attacks (OIDC)
5. **Token Binding**: Bind tokens to specific clients
6. **Short Lifetimes**: Access tokens expire in 1 hour
7. **Refresh Token Rotation**: Issue new refresh token on refresh
8. **Secure Storage**: Store tokens in HTTP-only cookies or secure storage

### Provider Trust

1. **Validate JWKS**: Always validate JWT signatures against provider JWKS
2. **Check Issuer**: Verify `iss` claim matches expected issuer
3. **Check Audience**: Verify `aud` claim matches Mimir
4. **Check Expiration**: Reject expired tokens
5. **Check Not Before**: Respect `nbf` claim
6. **Rate Limiting**: Limit token validation requests to IdP

### Downstream Security

1. **Service Accounts**: Use dedicated service accounts for each downstream service
2. **Least Privilege**: Grant minimum required permissions
3. **Audit Logging**: Log all service account usage
4. **Token Rotation**: Rotate service account secrets regularly
5. **Revocation**: Support immediate token revocation

---

## Troubleshooting

### Issue 1: "Invalid OAuth Configuration"

**Symptoms**: OAuth login fails immediately

**Solutions**:
```bash
# Verify provider configuration
curl https://your-tenant.okta.com/.well-known/openid-configuration

# Check client credentials
echo $MIMIR_OAUTH_CLIENT_ID
echo $MIMIR_OAUTH_CLIENT_SECRET

# Verify redirect URI matches
echo $MIMIR_OAUTH_REDIRECT_URI
# Must match exactly what's configured in IdP
```

### Issue 2: "Token Validation Failed"

**Symptoms**: Valid token rejected by Mimir

**Solutions**:
```bash
# Check token expiration
jwt decode $TOKEN | jq '.exp'

# Verify JWKS endpoint is accessible
curl https://your-tenant.okta.com/oauth2/v1/keys

# Check audience claim
jwt decode $TOKEN | jq '.aud'
# Must match MIMIR_OAUTH_AUDIENCE
```

### Issue 3: "PCTX Can't Authenticate"

**Symptoms**: PCTX gets 401 from Mimir

**Solutions**:
```bash
# Check PCTX configuration
echo $MIMIR_URL
echo $MIMIR_AUTH_MODE
echo $MIMIR_SERVICE_ACCOUNT_ID

# Test service account directly
curl -X POST https://mimir.yourcompany.com/auth/token \
  -d "grant_type=client_credentials" \
  -d "client_id=$MIMIR_SERVICE_ACCOUNT_ID" \
  -d "client_secret=$MIMIR_SERVICE_ACCOUNT_SECRET"
```

---

## Summary

**Authentication Strategy**:
- ✅ **Upstream**: Integrate with any OAuth 2.0 / OIDC provider
- ✅ **Downstream**: Support API keys, OAuth tokens, and Mimir JWTs
- ✅ **PCTX**: Service account with user context propagation
- ✅ **Backward Compatible**: API keys continue to work
- ✅ **Flexible**: Support multiple auth methods simultaneously

**Implementation Priority**:
1. **Week 1**: Basic OAuth (one provider)
2. **Week 2**: Multi-provider support
3. **Week 3**: Downstream integration (PCTX)
4. **Week 4**: Token management

**Total Effort**: 4 weeks  
**Cost**: $0 (open-source providers) to $500/month (commercial IdP)

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-21  
**Maintainer**: Security Team  
**Status**: Design Document
