# Mimir Security Documentation

**Version**: 1.0.0  
**Date**: 2025-11-21  
**Status**: Design & Implementation Guides

---

## 📋 Overview

This directory contains comprehensive security documentation for Mimir, covering authentication, authorization, compliance, and enterprise readiness.

**Key Features**:
- ✅ OAuth 2.0 / OIDC integration (Okta, Auth0, Azure AD, Google, Keycloak)
- ✅ Multi-provider authentication strategy
- ✅ Downstream service authentication (PCTX, MCP clients)
- ✅ Reverse proxy security (Nginx)
- ✅ GDPR, HIPAA, FISMA compliance guidance
- ✅ Feature-flag based security (backward compatible)

---

## 📚 Documentation Index

### 🔐 Authentication

| Document | Purpose | Audience |
|----------|---------|----------|
| **[Passport.js Quick Start](./PASSPORT_QUICK_START.md)** ⭐ | Get auth working in 15 minutes | Everyone |
| **[Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md)** | Complete OAuth/OIDC integration guide | Architects, DevOps |
| **[Security Environment Variables](./SECURITY_ENVIRONMENT_VARIABLES.md)** | All environment variables by security phase | DevOps, Admins |

### 🛡️ Security Implementation

| Document | Purpose | Audience |
|----------|---------|----------|
| **[Reverse Proxy Security Guide](./REVERSE_PROXY_SECURITY_GUIDE.md)** | First-line defense with Nginx | DevOps, SysAdmins |
| **[Security Implementation Plan](./SECURITY_IMPLEMENTATION_PLAN.md)** | Feature-flag based security rollout | Engineering Teams |
| **[Security Quick Start](./SECURITY_QUICK_START.md)** | 4-hour security hardening | DevOps, Admins |

### 🏢 Enterprise & Compliance

| Document | Purpose | Audience |
|----------|---------|----------|
| **[Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md)** | Full security audit & compliance analysis | Leadership, Compliance |

---

## 🚀 Quick Start

### For New Deployments

**Step 1: Choose Your Security Level**

```bash
# Option A: No Security (Development Only)
MIMIR_ENABLE_SECURITY=false

# Option B: Basic Security (Recommended)
MIMIR_ENABLE_SECURITY=true
MIMIR_AUTH_METHODS=api-key,oauth
MIMIR_DEFAULT_AUTH_METHOD=api-key

# Option C: OAuth Only (Enterprise)
MIMIR_ENABLE_SECURITY=true
MIMIR_AUTH_METHODS=oauth,jwt
MIMIR_DEFAULT_AUTH_METHOD=oauth
```

**Step 2: Follow the Appropriate Guide**

- **15-minute setup**: [Passport.js Quick Start](./PASSPORT_QUICK_START.md) ⭐ **START HERE**
- **OAuth integration**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md)
- **Reverse proxy**: [Reverse Proxy Security Guide](./REVERSE_PROXY_SECURITY_GUIDE.md)
- **Full enterprise**: [Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md)

### For Existing Deployments

**Migration Path** (No Downtime):

```bash
# Week 1: Add OAuth (keep API keys working)
MIMIR_ENABLE_SECURITY=true
MIMIR_AUTH_METHODS=api-key,oauth
MIMIR_DEFAULT_AUTH_METHOD=api-key  # Still default to API keys

# Week 2: Test OAuth with select users
# (No config changes, just test /auth/login endpoint)

# Week 3: Make OAuth default (API keys still work)
MIMIR_DEFAULT_AUTH_METHOD=oauth

# Week 4: Deprecate API keys (optional)
MIMIR_AUTH_METHODS=oauth,jwt
```

---

## 🎯 Authentication Strategies

### Upstream Authentication (Users → Mimir)

Mimir authenticates users via external Identity Providers:

| Provider | Protocol | Use Case | Setup Time |
|----------|----------|----------|------------|
| **Okta** | OIDC | Enterprise SSO | 2 hours |
| **Auth0** | OIDC | SaaS, multi-tenant | 2 hours |
| **Azure AD** | OIDC | Microsoft 365 | 2 hours |
| **Google** | OAuth 2.0 | Google Workspace | 1 hour |
| **Keycloak** | OIDC | Self-hosted | 4 hours |

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md)

### Downstream Authentication (PCTX/Services → Mimir)

Services authenticate with Mimir using **simple API keys**:

| Method | Use Case | Token Type | Setup Time |
|--------|----------|------------|------------|
| **API Key** | Trusted services (PCTX, internal tools) | `X-API-Key: xxx` | 5 minutes |

**Simplified**: No service accounts, no token forwarding, no JWT issuance. Just API keys for services, OAuth for users.

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → Downstream Services

---

## 🔧 Implementation Roadmap

### Phase 1: Basic Security (1 Week)

**Goal**: HTTPS + OAuth + API Keys

**Tasks**:
1. Set up Nginx reverse proxy (4 hours)
2. Configure OAuth provider (1 day)
3. Implement token validation (1 day)
4. Test authentication flows (1 day)

**Cost**: $0 (self-hosted) to $500/month (commercial IdP)

**Guides**:
- [Reverse Proxy Security Guide](./REVERSE_PROXY_SECURITY_GUIDE.md)
- [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md)
- [Security Environment Variables](./SECURITY_ENVIRONMENT_VARIABLES.md) → Phase 1

### Phase 2: Compliance (4-6 Weeks)

**Goal**: GDPR-ready

**Tasks**:
1. Implement audit logging
2. Add data encryption at rest
3. Add PII handling
4. Implement data retention policies
5. Add consent management

**Cost**: ~$10K

**Guides**:
- [Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md) → GDPR Section
- [Security Environment Variables](./SECURITY_ENVIRONMENT_VARIABLES.md) → Phase 2

### Phase 3: Enterprise (2-3 Months)

**Goal**: HIPAA/FISMA-ready

**Tasks**:
1. Implement RBAC
2. Add MFA
3. Add network segmentation
4. Implement security monitoring
5. Add incident response

**Cost**: ~$50K

**Guides**:
- [Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md) → HIPAA/FISMA Sections
- [Security Environment Variables](./SECURITY_ENVIRONMENT_VARIABLES.md) → Phase 3

---

## 🔍 Common Scenarios

### Scenario 1: PCTX Integration (Simplified)

**Requirement**: PCTX needs to call Mimir

**Solution**: Simple API Key

```bash
# Mimir Configuration
MIMIR_API_KEY=your-api-key

# PCTX Configuration
MIMIR_URL=https://mimir.yourcompany.com
MIMIR_API_KEY=your-api-key
```

**Simplified**: No service accounts, no user context propagation. Just API key authentication.

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → PCTX Integration

### Scenario 2: Multi-Tenant SaaS Deployment

**Requirement**: Multiple organizations, isolated data, SSO per org

**Solution**: Auth0 with Organization Support

```bash
# Mimir Configuration
MIMIR_AUTH_PROVIDER=auth0
MIMIR_AUTH0_DOMAIN=your-tenant.auth0.com
MIMIR_AUTH0_AUDIENCE=https://mimir.yourcompany.com/api
MIMIR_OAUTH_SCOPE=openid profile email org_id

# Multi-tenancy
MIMIR_ENABLE_MULTI_TENANCY=true
MIMIR_TENANT_ISOLATION=strict
MIMIR_TENANT_ID_SOURCE=jwt_claim:org_id
```

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → Auth0

### Scenario 3: Microsoft 365 Integration

**Requirement**: Users authenticate with Microsoft accounts

**Solution**: Azure AD Integration

```bash
# Mimir Configuration
MIMIR_AUTH_PROVIDER=azure
MIMIR_AZURE_TENANT_ID=your-tenant-id
MIMIR_OAUTH_CLIENT_ID=your-app-id
MIMIR_OAUTH_SCOPE=openid profile email User.Read
```

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → Azure AD

### Scenario 4: Self-Hosted, Air-Gapped Environment

**Requirement**: No external IdP, on-premises only

**Solution**: Keycloak (Self-Hosted)

```bash
# Mimir Configuration
MIMIR_AUTH_PROVIDER=keycloak
MIMIR_KEYCLOAK_SERVER_URL=https://keycloak.internal.company.com
MIMIR_KEYCLOAK_REALM=mimir
MIMIR_OAUTH_CLIENT_ID=mimir-client
```

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → Keycloak

---

## 🧪 Testing & Validation

### Test OAuth Login Flow

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

### Test PCTX Integration (Simplified)

```bash
# Configure PCTX
export MIMIR_URL=https://mimir.yourcompany.com
export MIMIR_API_KEY=your-api-key

# Start PCTX
pctx start

# Call Mimir through PCTX
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# Expected: 200 OK with Mimir tools
```

**Simplified**: Just set URL and API key. No auth modes, no service accounts.

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → Testing & Validation

### Configure MCP Clients After OAuth Login

**⚠️ IMPORTANT**: After successfully authenticating with OAuth (using VSCode extension commands like `Mimir: Login`), you need to manually copy your access token to your MCP client configuration.

**Steps**:

1. **Authenticate via VSCode Extension**:
   ```
   Cmd+Shift+P → "Mimir: Login"
   ```
   Complete the OAuth flow in your browser.

2. **Copy Your Access Token**:
   - Open VSCode Settings (JSON): `Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"
   - Find your OAuth token:
     ```json
     {
       "mimir.auth.apiKey": "316a95be487900ba08873e5009f9c5a8ee6e5670fbf82af1cafaef2a4103da6f",
       "mimir.auth.username": "admin"
     }
     ```
   - Copy the `mimir.auth.apiKey` value

3. **Configure Your MCP Client** (Cursor, Claude Desktop, etc.):
   
   Open your MCP client's configuration file and add the Authorization header:
   
   **Cursor** (`~/.cursor/config.json` or `~/Library/Application Support/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`):
   ```json
   {
     "Mimir": {
       "url": "http://localhost:9042/mcp",
       "type": "http",
       "transport": "streamable-http",
       "description": "MCP Server for tracking TODOs and managing memories",
       "headers": {
         "Authorization": "Bearer 316a95be487900ba08873e5009f9c5a8ee6e5670fbf82af1cafaef2a4103da6f"
       }
     }
   }
   ```
   
   **Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "Mimir": {
         "url": "http://localhost:9042/mcp",
         "headers": {
           "Authorization": "Bearer 316a95be487900ba08873e5009f9c5a8ee6e5670fbf82af1cafaef2a4103da6f"
         }
       }
     }
   }
   ```

4. **Restart Your MCP Client** to apply the new configuration.

**Why This is Needed**:
- OAuth authentication is **stateless** - no session cookies or database storage
- Your access token is validated on every request by calling the OAuth provider's userinfo endpoint
- MCP clients cannot access VSCode's stored credentials directly, so manual configuration is required

**Token Refresh**:
- OAuth tokens typically expire after 7 days
- When your token expires, you'll see `401 Unauthorized` errors
- Simply run `Mimir: Logout` → `Mimir: Login` again to get a fresh token
- Copy the new token to your MCP client configuration

---

## 🛠️ Troubleshooting

### Issue: "OAuth Login Fails"

**Symptoms**: Redirect to IdP fails or returns error

**Solutions**:
1. Check `MIMIR_OAUTH_CLIENT_ID` matches IdP configuration
2. Verify `MIMIR_OAUTH_REDIRECT_URI` is whitelisted in IdP
3. Check IdP is accessible from Mimir server
4. Verify SSL certificates are valid

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → Troubleshooting

### Issue: "Token Validation Failed"

**Symptoms**: Valid token rejected by Mimir

**Solutions**:
1. Check token expiration: `jwt decode $TOKEN | jq '.exp'`
2. Verify JWKS endpoint is accessible
3. Check audience claim matches `MIMIR_OAUTH_AUDIENCE`
4. Verify issuer claim matches `MIMIR_OAUTH_ISSUER`

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → Troubleshooting

### Issue: "PCTX Can't Authenticate"

**Symptoms**: PCTX gets 401 from Mimir

**Solutions**:
1. Check `MIMIR_SERVICE_ACCOUNT_ID` exists in Mimir
2. Verify `MIMIR_SERVICE_ACCOUNT_SECRET` is correct
3. Check `MIMIR_ENABLE_SERVICE_ACCOUNTS=true` in Mimir
4. Test service account directly with curl

**See**: [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) → Troubleshooting

---

## 📊 Security Metrics

### Authentication Metrics

Monitor these metrics to ensure healthy authentication:

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **OAuth Login Success Rate** | >95% | <90% |
| **Token Validation Latency** | <100ms | >500ms |
| **Token Refresh Success Rate** | >99% | <95% |
| **Failed Auth Attempts** | <1% | >5% |
| **Service Account Usage** | Tracked | Anomalies |

### Security Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **SSL Certificate Expiry** | >30 days | <7 days |
| **Rate Limit Hits** | <1% | >10% |
| **Audit Log Completeness** | 100% | <100% |
| **Token Revocations** | Tracked | Spike |

**See**: [Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md) → Operational Security

---

## 🔗 External Resources

### OAuth 2.0 / OIDC

- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

### Provider Documentation

- [Okta Developer Docs](https://developer.okta.com/docs/)
- [Auth0 Documentation](https://auth0.com/docs)
- [Azure AD Documentation](https://docs.microsoft.com/en-us/azure/active-directory/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Keycloak Documentation](https://www.keycloak.org/documentation)

### Compliance

- [GDPR Official Text](https://gdpr-info.eu/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [FISMA Overview](https://www.cisa.gov/federal-information-security-modernization-act)

---

## 📝 Summary

**Mimir Security Features**:
- ✅ **Multi-Provider OAuth**: Okta, Auth0, Azure AD, Google, Keycloak
- ✅ **Backward Compatible**: API keys still work
- ✅ **Downstream Auth**: PCTX service accounts with user context
- ✅ **Feature-Flag Based**: `MIMIR_ENABLE_SECURITY` (default: false)
- ✅ **Phased Rollout**: 3 phases (Basic → Compliance → Enterprise)
- ✅ **Zero Downtime Migration**: Add OAuth without breaking existing clients

**Implementation Time**:
- **Phase 1** (Basic): 1 week
- **Phase 2** (GDPR): 4-6 weeks
- **Phase 3** (HIPAA/FISMA): 2-3 months

**Cost**:
- **Phase 1**: $0 (self-hosted) to $500/month (commercial IdP)
- **Phase 2**: ~$10K
- **Phase 3**: ~$50K

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-21  
**Maintainer**: Security Team  
**Status**: Active
