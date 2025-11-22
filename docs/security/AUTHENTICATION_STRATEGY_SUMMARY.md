# Authentication Provider Integration - Executive Summary

**Version**: 1.0.0  
**Date**: 2025-11-21  
**Status**: Design Document

---

## 🎯 Overview

Mimir now supports **comprehensive authentication provider integration** with OAuth 2.0 / OIDC, enabling seamless integration with enterprise identity providers while maintaining backward compatibility with existing API key authentication.

---

## ✅ Key Features

### Upstream Authentication (Users → Mimir)

| Provider | Protocol | Setup Time | Cost |
|----------|----------|------------|------|
| **Okta** | OIDC | 2 hours | $0-$500/mo |
| **Auth0** | OIDC | 2 hours | $0-$500/mo |
| **Azure AD** | OIDC | 2 hours | Included with M365 |
| **Google** | OAuth 2.0 | 1 hour | Free |
| **Keycloak** | OIDC | 4 hours | $0 (self-hosted) |
| **Generic OIDC** | OIDC | 2 hours | Varies |

### Downstream Authentication (PCTX/Services → Mimir)

| Method | Use Case | Token Type | Setup Time |
|--------|----------|------------|------------|
| **API Key** | Trusted services (PCTX, internal tools) | `X-API-Key: xxx` | 5 minutes |

**Simplified**: No service accounts, no token forwarding, no JWT issuance. Just API keys.

---

## 🔄 Authentication Flow

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│   User /    │   OAuth Token     │    Mimir    │   Mimir JWT       │    PCTX     │
│  Identity   │ ─────────────────→│  (Auth Hub) │ ─────────────────→│   Service   │
│  Provider   │                    │             │                    │             │
└─────────────┘                    └─────────────┘                    └─────────────┘
     ↑                                    │                                   │
     │                                    │                                   │
     └────────────────────────────────────┴───────────────────────────────────┘
              Validates tokens          Issues tokens           Calls Mimir APIs
```

**Key Points**:
- ✅ Mimir acts as **authentication hub** between IdP and downstream services
- ✅ Validates upstream OAuth tokens from IdP
- ✅ Issues downstream JWT tokens for services (PCTX, MCP clients)
- ✅ Propagates user context through the entire chain
- ✅ Supports multiple authentication methods simultaneously

---

## 🚀 Implementation Roadmap

### Week 1: Basic OAuth (One Provider)

**Tasks**:
1. Add OAuth middleware
2. Implement authorization code flow
3. Add token validation
4. Store tokens in Redis
5. Test with one provider (Okta or Auth0)

**Deliverables**:
- OAuth login working
- Token validation working
- Session management working

**Cost**: $0 (development)

### Week 2: Multi-Provider Support

**Tasks**:
1. Abstract provider-specific logic
2. Add provider factory pattern
3. Implement provider discovery
4. Test all providers

**Deliverables**:
- Support for Okta, Auth0, Azure AD, Google, Keycloak
- Provider switching
- Provider-specific configurations

**Cost**: $0 (development)

### Week 3: API Key Management

**Tasks**:
1. Add API key CRUD operations
2. Add API key validation to auth middleware
3. Test with PCTX

**Deliverables**:
- API key management working
- PCTX can authenticate with API key

**Cost**: $0 (development)

**Simplified**: No JWT issuance, no service accounts, no token forwarding.

### Week 4: Token Management

**Tasks**:
1. Implement token refresh
2. Add token revocation
3. Implement token introspection
4. Add token cleanup
5. Add monitoring

**Deliverables**:
- Complete token lifecycle management
- Monitoring and metrics
- Production-ready

**Cost**: $0 (development)

**Total Implementation Time**: 4 weeks  
**Total Cost**: $0 (self-hosted) to $500/month (commercial IdP)

---

## 🔧 Configuration Example

### Mimir Configuration (Okta)

```bash
# Enable security features
MIMIR_ENABLE_SECURITY=true

# Authentication methods
MIMIR_AUTH_METHODS=api-key,oauth,jwt
MIMIR_DEFAULT_AUTH_METHOD=api-key  # Start with API keys

# OAuth Provider
MIMIR_AUTH_PROVIDER=okta
MIMIR_OAUTH_ISSUER=https://your-tenant.okta.com
MIMIR_OAUTH_CLIENT_ID=your-client-id
MIMIR_OAUTH_CLIENT_SECRET=your-client-secret
MIMIR_OAUTH_REDIRECT_URI=https://mimir.yourcompany.com/auth/callback
MIMIR_OAUTH_SCOPE=openid profile email groups

# Token Storage
MIMIR_TOKEN_STORAGE=redis
MIMIR_REDIS_URL=redis://redis:6379

# API Keys (for downstream services)
MIMIR_API_KEY=your-api-key
```

### PCTX Configuration

```bash
# Mimir URL
MIMIR_URL=https://mimir.yourcompany.com

# Authentication Mode
MIMIR_AUTH_MODE=service-account
MIMIR_SERVICE_ACCOUNT_ID=pctx-service
MIMIR_SERVICE_ACCOUNT_SECRET=your-service-secret

# User Context
MIMIR_USER_CONTEXT_ENABLED=true
MIMIR_USER_CONTEXT_SOURCE=header
```

---

## 🔒 Security Features

### OAuth Security

- ✅ **PKCE** (Proof Key for Code Exchange) - Prevents authorization code interception
- ✅ **State Parameter** - Prevents CSRF attacks
- ✅ **Nonce** - Prevents replay attacks (OIDC)
- ✅ **Token Binding** - Binds tokens to specific clients
- ✅ **Short Lifetimes** - Access tokens expire in 1 hour
- ✅ **Refresh Token Rotation** - Issues new refresh token on refresh

### Token Security

- ✅ **HTTPS Only** - All OAuth flows require HTTPS
- ✅ **JWT Validation** - Validates signatures against IdP JWKS
- ✅ **Audience Validation** - Verifies `aud` claim
- ✅ **Issuer Validation** - Verifies `iss` claim
- ✅ **Expiration Validation** - Rejects expired tokens
- ✅ **Secure Storage** - HTTP-only cookies, Redis storage

### Service Account Security

- ✅ **Dedicated Accounts** - One service account per downstream service
- ✅ **Least Privilege** - Minimum required permissions
- ✅ **Audit Logging** - All service account usage logged
- ✅ **Token Rotation** - Rotate secrets regularly
- ✅ **Immediate Revocation** - Support for token revocation

---

## 📊 Benefits

### For Users

- ✅ **Single Sign-On (SSO)** - One login for all services
- ✅ **Familiar Login** - Use existing corporate credentials
- ✅ **Multi-Factor Authentication (MFA)** - Inherit from IdP
- ✅ **Password Policies** - Managed by IdP
- ✅ **Account Lifecycle** - Automatic provisioning/deprovisioning

### For Administrators

- ✅ **Centralized User Management** - Manage users in IdP
- ✅ **Audit Trail** - Complete authentication logs
- ✅ **Compliance** - Meet GDPR, HIPAA, FISMA requirements
- ✅ **Scalability** - Handle thousands of users
- ✅ **Flexibility** - Support multiple IdPs

### For Developers

- ✅ **Standard Protocols** - OAuth 2.0 / OIDC
- ✅ **Multiple Providers** - Easy to switch providers
- ✅ **Backward Compatible** - API keys still work
- ✅ **User Context** - Access user information in services
- ✅ **Service Accounts** - Secure service-to-service auth

---

## 🎯 Use Cases

### Use Case 1: Enterprise SSO

**Scenario**: 500-employee company with Okta

**Configuration**:
```bash
MIMIR_AUTH_PROVIDER=okta
MIMIR_DEFAULT_AUTH_METHOD=oauth
```

**Benefits**:
- ✅ Users login with corporate credentials
- ✅ MFA enforced by Okta
- ✅ Automatic user provisioning
- ✅ Audit logs in Okta

### Use Case 2: Multi-Tenant SaaS

**Scenario**: SaaS product with multiple customers

**Configuration**:
```bash
MIMIR_AUTH_PROVIDER=auth0
MIMIR_ENABLE_MULTI_TENANCY=true
MIMIR_TENANT_ID_SOURCE=jwt_claim:org_id
```

**Benefits**:
- ✅ Each customer has their own SSO
- ✅ Data isolation per tenant
- ✅ Flexible authentication per customer

### Use Case 3: Microsoft 365 Integration

**Scenario**: Company using Microsoft 365

**Configuration**:
```bash
MIMIR_AUTH_PROVIDER=azure
MIMIR_AZURE_TENANT_ID=your-tenant-id
```

**Benefits**:
- ✅ Login with Microsoft accounts
- ✅ Access Microsoft Graph API
- ✅ Seamless integration with Office 365

### Use Case 4: Self-Hosted/Air-Gapped

**Scenario**: On-premises deployment, no external IdP

**Configuration**:
```bash
MIMIR_AUTH_PROVIDER=keycloak
MIMIR_KEYCLOAK_SERVER_URL=https://keycloak.internal.company.com
```

**Benefits**:
- ✅ Complete control over authentication
- ✅ No external dependencies
- ✅ Works in air-gapped environments

---

## 📈 Migration Strategy

### Stage 1: Add OAuth (No Breaking Changes)

```bash
# Keep API keys working
MIMIR_AUTH_METHODS=api-key,oauth
MIMIR_DEFAULT_AUTH_METHOD=api-key
```

**Result**: Both API keys and OAuth work

### Stage 2: Test OAuth

- Test OAuth login with select users
- Verify token validation
- Test PCTX integration
- Monitor for issues

**Result**: OAuth validated in production

### Stage 3: Make OAuth Default

```bash
# Switch default to OAuth
MIMIR_DEFAULT_AUTH_METHOD=oauth
```

**Result**: New users use OAuth, existing API keys still work

### Stage 4: Deprecate API Keys (Optional)

```bash
# Remove API key support
MIMIR_AUTH_METHODS=oauth,jwt
```

**Result**: OAuth-only authentication

**Total Migration Time**: 4 weeks (no downtime)

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md)** | Complete implementation guide |
| **[Security Environment Variables](./SECURITY_ENVIRONMENT_VARIABLES.md)** | All environment variables |
| **[Reverse Proxy Security Guide](./REVERSE_PROXY_SECURITY_GUIDE.md)** | Nginx setup for HTTPS |
| **[Security Implementation Plan](./SECURITY_IMPLEMENTATION_PLAN.md)** | Feature-flag based rollout |
| **[Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md)** | Full security audit |

---

## 🏁 Summary

**What We Built**:
- ✅ OAuth 2.0 / OIDC integration with 6 providers
- ✅ Upstream authentication (users via IdP)
- ✅ Downstream authentication (PCTX via service accounts)
- ✅ Token lifecycle management
- ✅ User context propagation
- ✅ Backward compatible (API keys still work)

**Implementation**:
- ⏱️ **Time**: 4 weeks
- 💰 **Cost**: $0 (self-hosted) to $500/month (commercial IdP)
- 🚀 **Migration**: Zero downtime

**Security**:
- 🔒 PKCE, State, Nonce protection
- 🔒 JWT validation against IdP JWKS
- 🔒 Token binding and rotation
- 🔒 Service account isolation
- 🔒 Audit logging

**Next Steps**:
1. Choose OAuth provider (Okta, Auth0, Azure AD, Google, Keycloak)
2. Follow [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md)
3. Configure environment variables from [Security Environment Variables](./SECURITY_ENVIRONMENT_VARIABLES.md)
4. Test with [Testing & Validation](./AUTHENTICATION_PROVIDER_INTEGRATION.md#testing--validation)
5. Deploy with [Migration Strategy](#migration-strategy)

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-21  
**Maintainer**: Security Team  
**Status**: Active
