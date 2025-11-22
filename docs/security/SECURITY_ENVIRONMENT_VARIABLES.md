# Security Environment Variables Reference

**Version**: 1.1.0  
**Date**: 2025-11-21  
**Purpose**: Pre-defined environment variables for all security stages

---

## 📋 Overview

This document defines **all environment variables** needed for each stage of Mimir's security implementation. Variables are organized by security phase and can be added incrementally.

**Stages**:
1. **Current** - No security (backward compatible)
2. **Phase 1** - Basic Security (Reverse Proxy + OAuth)
3. **Phase 2** - Compliance (GDPR-ready)
4. **Phase 3** - Enterprise (HIPAA/FISMA-ready)

---

## 🎯 Quick Reference

| Stage | Variables | Implementation Time | Cost |
|-------|-----------|---------------------|------|
| **Current** | 0 security vars | 0 (existing) | $0 |
| **Phase 1** | 35 vars (OAuth + Proxy) | 1 week | $0-$500/mo |
| **Phase 2** | +20 vars (55 total) | 4-6 weeks | $10K |
| **Phase 3** | +25 vars (80 total) | 2-3 months | $50K |

---

## Current State (No Security)

### Existing Variables

```bash
# ============================================================================
# CURRENT MIMIR CONFIGURATION (No Security)
# ============================================================================

# Neo4j Database
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password

# Mimir Server
MIMIR_SERVER_URL=http://localhost:9042
MIMIR_SERVER_PORT=9042
PORT=3000

# LLM Configuration
COPILOT_API_URL=http://copilot-api:4141
MIMIR_LLM_API=http://copilot-api:4141/v1
MIMIR_LLM_MODEL=gpt-4o

# Embeddings
MIMIR_EMBEDDINGS_ENABLED=true
MIMIR_EMBEDDINGS_API=http://copilot-api:4141/v1
MIMIR_EMBEDDINGS_MODEL=text-embedding-3-small

# PCTX Integration
PCTX_URL=http://localhost:8080
PCTX_ENABLED=false

# Feature Flags
MIMIR_ENABLE_SECURITY=false  # Security disabled by default
```

---

## Phase 1: Basic Security (Reverse Proxy + OAuth)

**Goal**: HTTPS, OAuth/OIDC authentication, API key auth, rate limiting  
**Time**: 1 week (4 hours for proxy, 3-4 days for OAuth)  
**Cost**: $0 (self-hosted) to $500/month (commercial IdP)

### New Variables

```bash
# ============================================================================
# PHASE 1: BASIC SECURITY (Reverse Proxy + OAuth/OIDC)
# ============================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Feature Flag
# ─────────────────────────────────────────────────────────────────────────────

# Enable security features (set to true to activate Phase 1)
MIMIR_ENABLE_SECURITY=true

# ─────────────────────────────────────────────────────────────────────────────
# Authentication Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Authentication methods (comma-separated: api-key, oauth, jwt)
MIMIR_AUTH_METHODS=api-key,oauth
MIMIR_DEFAULT_AUTH_METHOD=api-key  # Start with API keys, migrate to OAuth

# ─────────────────────────────────────────────────────────────────────────────
# API Key Authentication (Legacy/Service-to-Service)
# ─────────────────────────────────────────────────────────────────────────────

# Primary API key (generate with: openssl rand -base64 32)
MIMIR_API_KEY=your-generated-api-key-here

# Optional: Support multiple API keys (comma-separated)
# MIMIR_API_KEYS=key1,key2,key3

# ─────────────────────────────────────────────────────────────────────────────
# OAuth 2.0 / OIDC Provider Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Provider type (okta, auth0, azure, google, keycloak, generic)
MIMIR_AUTH_PROVIDER=okta

# OAuth 2.0 / OIDC endpoints
MIMIR_OAUTH_ISSUER=https://your-tenant.okta.com
MIMIR_OAUTH_AUTHORIZATION_ENDPOINT=https://your-tenant.okta.com/oauth2/v1/authorize
MIMIR_OAUTH_TOKEN_ENDPOINT=https://your-tenant.okta.com/oauth2/v1/token
MIMIR_OAUTH_JWKS_URI=https://your-tenant.okta.com/oauth2/v1/keys
MIMIR_OAUTH_USERINFO_ENDPOINT=https://your-tenant.okta.com/oauth2/v1/userinfo
MIMIR_OAUTH_REVOCATION_ENDPOINT=https://your-tenant.okta.com/oauth2/v1/revoke

# Client credentials (from IdP)
MIMIR_OAUTH_CLIENT_ID=your-client-id
MIMIR_OAUTH_CLIENT_SECRET=your-client-secret
MIMIR_OAUTH_REDIRECT_URI=https://mimir.yourcompany.com/auth/callback

# OAuth scopes
MIMIR_OAUTH_SCOPE=openid profile email groups

# OAuth audience (optional, provider-specific)
MIMIR_OAUTH_AUDIENCE=mimir-api

# ─────────────────────────────────────────────────────────────────────────────
# Provider-Specific Configuration (Choose One)
# ─────────────────────────────────────────────────────────────────────────────

# Okta
MIMIR_OKTA_DOMAIN=your-tenant.okta.com
MIMIR_OKTA_AUTHORIZATION_SERVER=default

# Auth0
# MIMIR_AUTH0_DOMAIN=your-tenant.auth0.com
# MIMIR_AUTH0_AUDIENCE=https://mimir.yourcompany.com/api

# Azure AD
# MIMIR_AZURE_TENANT_ID=your-tenant-id
# MIMIR_AZURE_TENANT_NAME=yourcompany.onmicrosoft.com

# Google
# MIMIR_GOOGLE_HOSTED_DOMAIN=yourcompany.com

# Keycloak
# MIMIR_KEYCLOAK_REALM=mimir
# MIMIR_KEYCLOAK_SERVER_URL=https://keycloak.yourcompany.com

# ─────────────────────────────────────────────────────────────────────────────
# Token Management
# ─────────────────────────────────────────────────────────────────────────────

# Token storage (redis, memory, database)
MIMIR_TOKEN_STORAGE=redis
MIMIR_REDIS_URL=redis://redis:6379
MIMIR_REDIS_DB=0
MIMIR_REDIS_KEY_PREFIX=mimir:tokens:

# Mimir JWT configuration
MIMIR_JWT_SECRET=your-jwt-secret-key-generate-with-openssl
MIMIR_JWT_ALGORITHM=RS256
MIMIR_JWT_ISSUER=https://mimir.yourcompany.com
MIMIR_JWT_AUDIENCE=mimir-api

# Token lifetimes (seconds)
MIMIR_ACCESS_TOKEN_LIFETIME=3600      # 1 hour
MIMIR_REFRESH_TOKEN_LIFETIME=2592000  # 30 days
MIMIR_ID_TOKEN_LIFETIME=3600          # 1 hour

# Token features
MIMIR_ENABLE_TOKEN_REFRESH=true
MIMIR_REFRESH_TOKEN_ROTATION=true
MIMIR_ENABLE_TOKEN_REVOCATION=true

# ─────────────────────────────────────────────────────────────────────────────
# Stateless Authentication (JWT/OAuth)
# ─────────────────────────────────────────────────────────────────────────────

# JWT secret for signing tokens (REQUIRED - change in production!)
MIMIR_JWT_SECRET=your-jwt-secret-generate-with-openssl

# Note: No session storage - all authentication is stateless via JWT/OAuth tokens
# Tokens are stored in HTTP-only cookies with secure flag in production

# ─────────────────────────────────────────────────────────────────────────────
# API Key Authentication (Downstream Services - Simplified)
# ─────────────────────────────────────────────────────────────────────────────

# API keys for trusted services (comma-separated for multiple keys)
MIMIR_API_KEYS=key1,key2,key3

# Or single API key
MIMIR_API_KEY=your-api-key-here

# ─────────────────────────────────────────────────────────────────────────────
# OAuth Security Features
# ─────────────────────────────────────────────────────────────────────────────

# PKCE (Proof Key for Code Exchange) - recommended for public clients
MIMIR_OAUTH_ENABLE_PKCE=true

# State parameter validation (prevent CSRF)
MIMIR_OAUTH_ENABLE_STATE=true
MIMIR_OAUTH_STATE_TIMEOUT=600  # 10 minutes

# Nonce validation (OIDC, prevent replay attacks)
MIMIR_OAUTH_ENABLE_NONCE=true

# Token binding
MIMIR_ENABLE_TOKEN_BINDING=true

# ─────────────────────────────────────────────────────────────────────────────
# SSL/TLS Configuration (Nginx Reverse Proxy)
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# Rate Limiting
# ─────────────────────────────────────────────────────────────────────────────

# API endpoints (requests per minute)
NGINX_RATE_LIMIT_API=100
NGINX_RATE_LIMIT_API_BURST=20

# MCP endpoints (requests per minute)
NGINX_RATE_LIMIT_MCP=200
NGINX_RATE_LIMIT_MCP_BURST=50

# Health check (requests per second)
NGINX_RATE_LIMIT_HEALTH=10
NGINX_RATE_LIMIT_HEALTH_BURST=20

# Connection limit (concurrent connections per IP)
NGINX_CONNECTION_LIMIT=10

# ─────────────────────────────────────────────────────────────────────────────
# Proxy Timeouts
# ─────────────────────────────────────────────────────────────────────────────

# Connection timeout (seconds)
NGINX_PROXY_CONNECT_TIMEOUT=30

# Send timeout (seconds)
NGINX_PROXY_SEND_TIMEOUT=60

# Read timeout (seconds)
NGINX_PROXY_READ_TIMEOUT=60

# MCP-specific timeouts (longer for agent operations)
NGINX_MCP_CONNECT_TIMEOUT=60
NGINX_MCP_SEND_TIMEOUT=300
NGINX_MCP_READ_TIMEOUT=300

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

# Access log path
NGINX_ACCESS_LOG=/var/log/nginx/access.log

# Error log path
NGINX_ERROR_LOG=/var/log/nginx/error.log

# Log level (debug, info, notice, warn, error, crit, alert, emerg)
NGINX_LOG_LEVEL=warn

# ─────────────────────────────────────────────────────────────────────────────
# IP Whitelisting (Optional)
# ─────────────────────────────────────────────────────────────────────────────

# Allowed IP ranges (comma-separated CIDR notation)
# Leave empty to allow all IPs
# NGINX_ALLOWED_IPS=10.0.0.0/8,192.168.0.0/16,172.16.0.0/12,203.0.113.0/24

# ─────────────────────────────────────────────────────────────────────────────
# Security Headers
# ─────────────────────────────────────────────────────────────────────────────

# HSTS (HTTP Strict Transport Security)
NGINX_HSTS_MAX_AGE=31536000
NGINX_HSTS_INCLUDE_SUBDOMAINS=true

# X-Frame-Options (DENY, SAMEORIGIN, ALLOW-FROM uri)
NGINX_X_FRAME_OPTIONS=DENY

# X-Content-Type-Options
NGINX_X_CONTENT_TYPE_OPTIONS=nosniff

# X-XSS-Protection
NGINX_X_XSS_PROTECTION=1; mode=block

# Referrer-Policy
NGINX_REFERRER_POLICY=strict-origin-when-cross-origin

# ─────────────────────────────────────────────────────────────────────────────
# Performance
# ─────────────────────────────────────────────────────────────────────────────

# Worker processes (auto = number of CPU cores)
NGINX_WORKER_PROCESSES=auto

# Worker connections
NGINX_WORKER_CONNECTIONS=1024

# Keepalive timeout (seconds)
NGINX_KEEPALIVE_TIMEOUT=65

# Client max body size
NGINX_CLIENT_MAX_BODY_SIZE=10m

# Gzip compression
NGINX_GZIP_ENABLED=on
NGINX_GZIP_COMP_LEVEL=6
```

### PCTX Configuration for Phase 1 (Simplified)

```bash
# ============================================================================
# PCTX AUTHENTICATION WITH MIMIR (Phase 1 - Simplified)
# ============================================================================

# Mimir URL
MIMIR_URL=https://mimir.yourcompany.com

# API Key (simple and secure)
MIMIR_API_KEY=your-mimir-api-key
```

**Simplified**: No auth modes, no service accounts, no user context propagation. Just API key.

### Complete Phase 1 `.env` Example

```bash
# Copy this to your .env file for Phase 1 security

# ============================================================================
# PHASE 1: BASIC SECURITY
# ============================================================================

# API Authentication
MIMIR_API_KEY=$(openssl rand -base64 32)  # Generate unique key

# Rate Limiting
NGINX_RATE_LIMIT_API=100
NGINX_RATE_LIMIT_MCP=200
NGINX_RATE_LIMIT_HEALTH=10

# Timeouts
NGINX_PROXY_CONNECT_TIMEOUT=30
NGINX_PROXY_SEND_TIMEOUT=60
NGINX_PROXY_READ_TIMEOUT=60

# Logging
NGINX_ACCESS_LOG=/var/log/nginx/access.log
NGINX_ERROR_LOG=/var/log/nginx/error.log
NGINX_LOG_LEVEL=warn

# Optional: IP Whitelisting (uncomment to enable)
# NGINX_ALLOWED_IPS=10.0.0.0/8,192.168.0.0/16
```

---

## Phase 2: Compliance (GDPR-Ready)

**Goal**: OAuth, RBAC, audit logging, data retention  
**Time**: 4-6 weeks  
**Cost**: $10,000 + $500/month

### New Variables

```bash
# ============================================================================
# PHASE 2: COMPLIANCE (GDPR-Ready)
# ============================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Authentication & Authorization
# ─────────────────────────────────────────────────────────────────────────────

# Authentication type (api-key, oauth, oidc)
MIMIR_AUTH_TYPE=oauth

# OAuth 2.0 / OIDC Configuration
MIMIR_OAUTH_ISSUER=https://auth.yourcompany.com
MIMIR_OAUTH_AUDIENCE=mimir-api
MIMIR_OAUTH_CLIENT_ID=mimir-client
MIMIR_OAUTH_CLIENT_SECRET=your-oauth-client-secret
MIMIR_OAUTH_JWKS_URI=https://auth.yourcompany.com/.well-known/jwks.json

# JWT Configuration
MIMIR_JWT_SECRET=your-jwt-secret-key
MIMIR_JWT_ALGORITHM=RS256
MIMIR_JWT_EXPIRATION=3600  # 1 hour

# Note: No session management - all authentication is stateless via JWT/OAuth tokens

# ─────────────────────────────────────────────────────────────────────────────
# Role-Based Access Control (RBAC)
# ─────────────────────────────────────────────────────────────────────────────

# Enable RBAC
MIMIR_ENABLE_RBAC=true

# Default roles
MIMIR_RBAC_ADMIN_ROLE=admin
MIMIR_RBAC_USER_ROLE=user
MIMIR_RBAC_READONLY_ROLE=readonly

# Role permissions (JSON format)
# MIMIR_RBAC_PERMISSIONS='{"admin":["*"],"user":["read","write"],"readonly":["read"]}'

# ─────────────────────────────────────────────────────────────────────────────
# API Key Management
# ─────────────────────────────────────────────────────────────────────────────

# API keys are managed via the API (no environment variables needed)
# Key features:
# - Generate keys via POST /api/keys/generate (requires keys:write permission)
# - List keys via GET /api/keys (requires keys:read permission)
# - Revoke keys via DELETE /api/keys/:keyId (requires keys:delete permission)
# - Keys inherit user's roles by default (can specify custom permissions)
# - Configurable expiration (default: 90 days)
# - Stateless validation: keys are validated against current user roles on each request
#
# Note: API keys are validated stateless - no periodic re-validation needed
# Keys are checked against the user's current roles/permissions on every request

# ─────────────────────────────────────────────────────────────────────────────
# Audit Logging
# ─────────────────────────────────────────────────────────────────────────────

# Enable comprehensive audit logging
MIMIR_ENABLE_AUDIT_LOG=true

# Audit log destination (file, neo4j, siem, all)
MIMIR_AUDIT_LOG_DESTINATION=all

# Audit log file path
MIMIR_AUDIT_LOG_FILE=/var/log/mimir/audit.log

# Audit log rotation
MIMIR_AUDIT_LOG_MAX_SIZE=100M
MIMIR_AUDIT_LOG_MAX_AGE=90  # days
MIMIR_AUDIT_LOG_MAX_BACKUPS=10

# SIEM Integration (optional)
# MIMIR_SIEM_ENDPOINT=https://siem.yourcompany.com/api/events
# MIMIR_SIEM_API_KEY=your-siem-api-key

# ─────────────────────────────────────────────────────────────────────────────
# Data Classification & Privacy
# ─────────────────────────────────────────────────────────────────────────────

# Enable data classification
MIMIR_ENABLE_DATA_CLASSIFICATION=true

# Data sensitivity levels (public, internal, confidential, restricted)
MIMIR_DATA_SENSITIVITY_LEVELS=public,internal,confidential,restricted

# Default sensitivity for new nodes
MIMIR_DEFAULT_DATA_SENSITIVITY=internal

# Enable PII detection
MIMIR_ENABLE_PII_DETECTION=true

# PII detection patterns (regex, comma-separated)
MIMIR_PII_PATTERNS=email,ssn,phone,credit_card

# PII masking (true = mask in logs, false = no masking)
MIMIR_PII_MASKING_ENABLED=true

# ─────────────────────────────────────────────────────────────────────────────
# Data Retention & Deletion
# ─────────────────────────────────────────────────────────────────────────────

# Enable data retention policies
MIMIR_ENABLE_DATA_RETENTION=true

# Default retention period (days, 0 = infinite)
MIMIR_DEFAULT_RETENTION_DAYS=365

# Retention by node type (JSON format)
# MIMIR_RETENTION_POLICY='{"todo":90,"memory":365,"file":730}'

# Automatic deletion of expired data
MIMIR_AUTO_DELETE_EXPIRED=true

# Deletion schedule (cron format)
MIMIR_DELETION_SCHEDULE=0 2 * * *  # 2 AM daily

# Soft delete (move to trash) vs hard delete
MIMIR_SOFT_DELETE_ENABLED=true
MIMIR_TRASH_RETENTION_DAYS=30

# ─────────────────────────────────────────────────────────────────────────────
# GDPR Compliance
# ─────────────────────────────────────────────────────────────────────────────

# Enable GDPR features
MIMIR_ENABLE_GDPR=true

# Data subject rights endpoints
MIMIR_GDPR_ENABLE_RIGHT_TO_ACCESS=true
MIMIR_GDPR_ENABLE_RIGHT_TO_ERASURE=true
MIMIR_GDPR_ENABLE_RIGHT_TO_PORTABILITY=true

# Consent management
MIMIR_GDPR_REQUIRE_CONSENT=true
MIMIR_GDPR_CONSENT_VERSION=1.0

# Data processing agreement
MIMIR_GDPR_DPA_ACCEPTED=false  # Must be set to true after reviewing DPA

# Breach notification
MIMIR_GDPR_BREACH_NOTIFICATION_EMAIL=security@yourcompany.com
MIMIR_GDPR_BREACH_NOTIFICATION_THRESHOLD=100  # Number of records

# ─────────────────────────────────────────────────────────────────────────────
# Privacy & Anonymization
# ─────────────────────────────────────────────────────────────────────────────

# Enable data anonymization
MIMIR_ENABLE_ANONYMIZATION=true

# Anonymization method (hash, encrypt, pseudonymize, remove)
MIMIR_ANONYMIZATION_METHOD=pseudonymize

# Anonymization key (for pseudonymization)
MIMIR_ANONYMIZATION_KEY=your-anonymization-key

# ─────────────────────────────────────────────────────────────────────────────
# Backup & Recovery
# ─────────────────────────────────────────────────────────────────────────────

# Enable automated backups
MIMIR_ENABLE_AUTO_BACKUP=true

# Backup schedule (cron format)
MIMIR_BACKUP_SCHEDULE=0 1 * * *  # 1 AM daily

# Backup destination
MIMIR_BACKUP_DESTINATION=/backups/mimir

# Backup retention (days)
MIMIR_BACKUP_RETENTION_DAYS=30

# Backup encryption
MIMIR_BACKUP_ENCRYPTION_ENABLED=true
MIMIR_BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/backup_encryption_key
```

### Complete Phase 2 `.env` Example

```bash
# Copy this to your .env file for Phase 2 compliance

# ============================================================================
# PHASE 2: COMPLIANCE (GDPR-Ready)
# ============================================================================

# OAuth 2.0 Authentication
MIMIR_AUTH_TYPE=oauth
MIMIR_OAUTH_ISSUER=https://auth.yourcompany.com
MIMIR_OAUTH_AUDIENCE=mimir-api
MIMIR_OAUTH_CLIENT_ID=mimir-client
MIMIR_OAUTH_CLIENT_SECRET=your-oauth-client-secret

# RBAC
MIMIR_ENABLE_RBAC=true
MIMIR_RBAC_ADMIN_ROLE=admin
MIMIR_RBAC_USER_ROLE=user
MIMIR_RBAC_READONLY_ROLE=readonly

# Audit Logging
MIMIR_ENABLE_AUDIT_LOG=true
MIMIR_AUDIT_LOG_DESTINATION=all
MIMIR_AUDIT_LOG_FILE=/var/log/mimir/audit.log

# Data Classification
MIMIR_ENABLE_DATA_CLASSIFICATION=true
MIMIR_DEFAULT_DATA_SENSITIVITY=internal
MIMIR_ENABLE_PII_DETECTION=true
MIMIR_PII_MASKING_ENABLED=true

# Data Retention
MIMIR_ENABLE_DATA_RETENTION=true
MIMIR_DEFAULT_RETENTION_DAYS=365
MIMIR_AUTO_DELETE_EXPIRED=true
MIMIR_SOFT_DELETE_ENABLED=true

# GDPR Compliance
MIMIR_ENABLE_GDPR=true
MIMIR_GDPR_ENABLE_RIGHT_TO_ACCESS=true
MIMIR_GDPR_ENABLE_RIGHT_TO_ERASURE=true
MIMIR_GDPR_ENABLE_RIGHT_TO_PORTABILITY=true
MIMIR_GDPR_BREACH_NOTIFICATION_EMAIL=security@yourcompany.com

# Backups
MIMIR_ENABLE_AUTO_BACKUP=true
MIMIR_BACKUP_SCHEDULE=0 1 * * *
MIMIR_BACKUP_ENCRYPTION_ENABLED=true
```

---

## Phase 3: Enterprise (HIPAA/FISMA-Ready)

**Goal**: MFA, FIPS encryption, intrusion detection, compliance  
**Time**: 2-3 months  
**Cost**: $50,000 + $5,000/month

### New Variables

```bash
# ============================================================================
# PHASE 3: ENTERPRISE (HIPAA/FISMA-Ready)
# ============================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Multi-Factor Authentication (MFA)
# ─────────────────────────────────────────────────────────────────────────────

# Enable MFA
MIMIR_ENABLE_MFA=true

# MFA methods (totp, sms, email, hardware)
MIMIR_MFA_METHODS=totp,sms

# MFA required for roles (comma-separated)
MIMIR_MFA_REQUIRED_ROLES=admin,user

# TOTP Configuration
MIMIR_MFA_TOTP_ISSUER=Mimir
MIMIR_MFA_TOTP_WINDOW=1  # Allow 1 time step before/after

# SMS Configuration (Twilio)
MIMIR_MFA_SMS_PROVIDER=twilio
MIMIR_MFA_SMS_ACCOUNT_SID=your-twilio-account-sid
MIMIR_MFA_SMS_AUTH_TOKEN=your-twilio-auth-token
MIMIR_MFA_SMS_FROM_NUMBER=+1234567890

# Email Configuration
MIMIR_MFA_EMAIL_PROVIDER=smtp
MIMIR_MFA_EMAIL_HOST=smtp.yourcompany.com
MIMIR_MFA_EMAIL_PORT=587
MIMIR_MFA_EMAIL_USER=mimir@yourcompany.com
MIMIR_MFA_EMAIL_PASSWORD=your-email-password
MIMIR_MFA_EMAIL_FROM=mimir@yourcompany.com

# Hardware Token (YubiKey)
MIMIR_MFA_YUBIKEY_ENABLED=true
MIMIR_MFA_YUBIKEY_CLIENT_ID=your-yubikey-client-id
MIMIR_MFA_YUBIKEY_SECRET_KEY=your-yubikey-secret-key

# ─────────────────────────────────────────────────────────────────────────────
# Encryption at Rest
# ─────────────────────────────────────────────────────────────────────────────

# Enable encryption at rest
MIMIR_ENABLE_ENCRYPTION_AT_REST=true

# Encryption method (aes-256-gcm, aes-256-cbc)
MIMIR_ENCRYPTION_METHOD=aes-256-gcm

# Encryption key management (file, vault, kms)
MIMIR_ENCRYPTION_KEY_MANAGEMENT=vault

# Encryption key file (if using file-based)
MIMIR_ENCRYPTION_KEY_FILE=/run/secrets/encryption_key

# HashiCorp Vault Configuration
MIMIR_VAULT_ADDR=https://vault.yourcompany.com
MIMIR_VAULT_TOKEN=your-vault-token
MIMIR_VAULT_NAMESPACE=mimir
MIMIR_VAULT_KEY_PATH=secret/data/mimir/encryption-key

# AWS KMS Configuration
# MIMIR_AWS_KMS_KEY_ID=your-kms-key-id
# MIMIR_AWS_REGION=us-east-1

# FIPS 140-2 Compliance
MIMIR_FIPS_MODE_ENABLED=true
MIMIR_FIPS_CRYPTO_PROVIDER=openssl-fips

# ─────────────────────────────────────────────────────────────────────────────
# Intrusion Detection & Prevention
# ─────────────────────────────────────────────────────────────────────────────

# Enable intrusion detection
MIMIR_ENABLE_IDS=true

# IDS provider (ossec, wazuh, custom)
MIMIR_IDS_PROVIDER=wazuh

# Wazuh Configuration
MIMIR_WAZUH_MANAGER_HOST=wazuh.yourcompany.com
MIMIR_WAZUH_MANAGER_PORT=1514
MIMIR_WAZUH_AGENT_NAME=mimir-server
MIMIR_WAZUH_AGENT_KEY=your-wazuh-agent-key

# Anomaly detection
MIMIR_ENABLE_ANOMALY_DETECTION=true
MIMIR_ANOMALY_DETECTION_THRESHOLD=0.95  # 95% confidence

# Anomaly detection rules
MIMIR_ANOMALY_FAILED_AUTH_THRESHOLD=5  # Failed auth attempts
MIMIR_ANOMALY_UNUSUAL_TRAFFIC_THRESHOLD=1000  # Requests per minute
MIMIR_ANOMALY_LARGE_EXPORT_THRESHOLD=10000  # Number of nodes

# Alert destinations
MIMIR_ALERT_EMAIL=security@yourcompany.com
MIMIR_ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
MIMIR_ALERT_PAGERDUTY_KEY=your-pagerduty-integration-key

# ─────────────────────────────────────────────────────────────────────────────
# Vulnerability Management
# ─────────────────────────────────────────────────────────────────────────────

# Enable vulnerability scanning
MIMIR_ENABLE_VULN_SCAN=true

# Scan schedule (cron format)
MIMIR_VULN_SCAN_SCHEDULE=0 3 * * 0  # 3 AM every Sunday

# Scan tools (snyk, trivy, clair)
MIMIR_VULN_SCAN_TOOLS=snyk,trivy

# Snyk Configuration
MIMIR_SNYK_TOKEN=your-snyk-token
MIMIR_SNYK_ORG_ID=your-snyk-org-id

# Trivy Configuration
MIMIR_TRIVY_SEVERITY=HIGH,CRITICAL
MIMIR_TRIVY_IGNORE_UNFIXED=false

# ─────────────────────────────────────────────────────────────────────────────
# Security Monitoring
# ─────────────────────────────────────────────────────────────────────────────

# Enable security monitoring
MIMIR_ENABLE_SECURITY_MONITORING=true

# Prometheus metrics
MIMIR_PROMETHEUS_ENABLED=true
MIMIR_PROMETHEUS_PORT=9090
MIMIR_PROMETHEUS_PATH=/metrics

# Grafana dashboards
MIMIR_GRAFANA_ENABLED=true
MIMIR_GRAFANA_URL=https://grafana.yourcompany.com
MIMIR_GRAFANA_API_KEY=your-grafana-api-key

# Security metrics to track
MIMIR_METRICS_FAILED_AUTH_ATTEMPTS=true
MIMIR_METRICS_RATE_LIMIT_HITS=true
MIMIR_METRICS_LARGE_EXPORTS=true
MIMIR_METRICS_UNUSUAL_PATTERNS=true

# ─────────────────────────────────────────────────────────────────────────────
# HIPAA Compliance
# ─────────────────────────────────────────────────────────────────────────────

# Enable HIPAA features
MIMIR_ENABLE_HIPAA=true

# PHI (Protected Health Information) handling
MIMIR_PHI_DETECTION_ENABLED=true
MIMIR_PHI_ENCRYPTION_REQUIRED=true
MIMIR_PHI_ACCESS_LOGGING_REQUIRED=true

# Automatic logoff (seconds)
MIMIR_HIPAA_AUTO_LOGOFF_TIMEOUT=900  # 15 minutes

# Emergency access (break-glass)
MIMIR_HIPAA_EMERGENCY_ACCESS_ENABLED=true
MIMIR_HIPAA_EMERGENCY_ACCESS_ROLE=emergency_admin
MIMIR_HIPAA_EMERGENCY_ACCESS_AUDIT=true

# Business Associate Agreement
MIMIR_HIPAA_BAA_ACCEPTED=false  # Must be set to true after signing BAA

# ─────────────────────────────────────────────────────────────────────────────
# FISMA Compliance
# ─────────────────────────────────────────────────────────────────────────────

# Enable FISMA features
MIMIR_ENABLE_FISMA=true

# FISMA level (low, moderate, high)
MIMIR_FISMA_LEVEL=moderate

# PIV/CAC card authentication
MIMIR_FISMA_PIV_ENABLED=true
MIMIR_FISMA_PIV_CA_CERT=/etc/pki/ca-trust/source/anchors/dod_root_ca.crt

# STIG compliance
MIMIR_FISMA_STIG_COMPLIANCE=true
MIMIR_FISMA_STIG_PROFILE=disa_stig

# Continuous monitoring
MIMIR_FISMA_CONTINUOUS_MONITORING=true
MIMIR_FISMA_MONITORING_INTERVAL=300  # 5 minutes

# ATO (Authority to Operate)
MIMIR_FISMA_ATO_EXPIRATION_DATE=2026-12-31
MIMIR_FISMA_ATO_RENEWAL_REMINDER_DAYS=90

# ─────────────────────────────────────────────────────────────────────────────
# Disaster Recovery
# ─────────────────────────────────────────────────────────────────────────────

# Enable disaster recovery
MIMIR_ENABLE_DISASTER_RECOVERY=true

# DR site configuration
MIMIR_DR_SITE_ENABLED=true
MIMIR_DR_SITE_URL=https://mimir-dr.yourcompany.com
MIMIR_DR_REPLICATION_INTERVAL=300  # 5 minutes

# Recovery objectives
MIMIR_DR_RTO=4  # Recovery Time Objective (hours)
MIMIR_DR_RPO=1  # Recovery Point Objective (hours)

# Failover configuration
MIMIR_DR_AUTO_FAILOVER=false  # Manual failover recommended
MIMIR_DR_FAILOVER_THRESHOLD=3  # Failed health checks before failover

# ─────────────────────────────────────────────────────────────────────────────
# Penetration Testing
# ─────────────────────────────────────────────────────────────────────────────

# Pen test schedule
MIMIR_PENTEST_SCHEDULE=annual
MIMIR_PENTEST_LAST_DATE=2025-01-15
MIMIR_PENTEST_NEXT_DATE=2026-01-15

# Pen test provider
MIMIR_PENTEST_PROVIDER=YourSecurityFirm
MIMIR_PENTEST_CONTACT=pentest@securityfirm.com

# Bug bounty program
MIMIR_BUGBOUNTY_ENABLED=false
# MIMIR_BUGBOUNTY_PLATFORM=hackerone
# MIMIR_BUGBOUNTY_URL=https://hackerone.com/yourcompany
```

### Complete Phase 3 `.env` Example

```bash
# Copy this to your .env file for Phase 3 enterprise security

# ============================================================================
# PHASE 3: ENTERPRISE (HIPAA/FISMA-Ready)
# ============================================================================

# Multi-Factor Authentication
MIMIR_ENABLE_MFA=true
MIMIR_MFA_METHODS=totp,sms
MIMIR_MFA_REQUIRED_ROLES=admin,user

# Encryption at Rest
MIMIR_ENABLE_ENCRYPTION_AT_REST=true
MIMIR_ENCRYPTION_METHOD=aes-256-gcm
MIMIR_ENCRYPTION_KEY_MANAGEMENT=vault
MIMIR_VAULT_ADDR=https://vault.yourcompany.com
MIMIR_FIPS_MODE_ENABLED=true

# Intrusion Detection
MIMIR_ENABLE_IDS=true
MIMIR_IDS_PROVIDER=wazuh
MIMIR_ENABLE_ANOMALY_DETECTION=true
MIMIR_ALERT_EMAIL=security@yourcompany.com

# Vulnerability Management
MIMIR_ENABLE_VULN_SCAN=true
MIMIR_VULN_SCAN_SCHEDULE=0 3 * * 0
MIMIR_VULN_SCAN_TOOLS=snyk,trivy

# Security Monitoring
MIMIR_ENABLE_SECURITY_MONITORING=true
MIMIR_PROMETHEUS_ENABLED=true
MIMIR_GRAFANA_ENABLED=true

# HIPAA Compliance
MIMIR_ENABLE_HIPAA=true
MIMIR_PHI_DETECTION_ENABLED=true
MIMIR_PHI_ENCRYPTION_REQUIRED=true
MIMIR_HIPAA_AUTO_LOGOFF_TIMEOUT=900
MIMIR_HIPAA_BAA_ACCEPTED=true

# FISMA Compliance
MIMIR_ENABLE_FISMA=true
MIMIR_FISMA_LEVEL=moderate
MIMIR_FISMA_PIV_ENABLED=true
MIMIR_FISMA_STIG_COMPLIANCE=true

# Disaster Recovery
MIMIR_ENABLE_DISASTER_RECOVERY=true
MIMIR_DR_SITE_ENABLED=true
MIMIR_DR_RTO=4
MIMIR_DR_RPO=1
```

---

## 📊 Variable Summary by Category

### Authentication (12 variables)
- Phase 1: `MIMIR_API_KEY`
- Phase 2: +8 OAuth/JWT vars
- Phase 3: +3 MFA vars

### Authorization (5 variables)
- Phase 2: 5 RBAC vars

### Encryption (10 variables)
- Phase 1: 5 SSL/TLS vars
- Phase 3: +5 encryption at rest vars

### Logging & Monitoring (15 variables)
- Phase 1: 3 basic logging vars
- Phase 2: +7 audit logging vars
- Phase 3: +5 security monitoring vars

### Compliance (20 variables)
- Phase 2: 10 GDPR vars
- Phase 3: +10 HIPAA/FISMA vars

### Security Controls (13 variables)
- Phase 1: 8 rate limiting/timeout vars
- Phase 3: +5 IDS/IPS vars

---

## 🔧 Variable Validation

### Required Variables by Phase

**Phase 1 (Minimum)**:
```bash
MIMIR_API_KEY  # Must be set
```

**Phase 2 (Minimum)**:
```bash
MIMIR_AUTH_TYPE
MIMIR_OAUTH_ISSUER
MIMIR_OAUTH_CLIENT_ID
MIMIR_ENABLE_AUDIT_LOG
MIMIR_ENABLE_GDPR
```

**Phase 3 (Minimum)**:
```bash
MIMIR_ENABLE_MFA
MIMIR_ENABLE_ENCRYPTION_AT_REST
MIMIR_ENCRYPTION_KEY_MANAGEMENT
MIMIR_ENABLE_HIPAA  # or MIMIR_ENABLE_FISMA
```

### Variable Validation Script

```bash
#!/bin/bash
# validate-security-vars.sh

# Check Phase 1 variables
if [ -z "$MIMIR_API_KEY" ]; then
  echo "ERROR: MIMIR_API_KEY is required for Phase 1"
  exit 1
fi

# Check Phase 2 variables (if Phase 2 enabled)
if [ "$MIMIR_AUTH_TYPE" = "oauth" ]; then
  if [ -z "$MIMIR_OAUTH_ISSUER" ]; then
    echo "ERROR: MIMIR_OAUTH_ISSUER is required for OAuth"
    exit 1
  fi
fi

# Check Phase 3 variables (if Phase 3 enabled)
if [ "$MIMIR_ENABLE_ENCRYPTION_AT_REST" = "true" ]; then
  if [ -z "$MIMIR_ENCRYPTION_KEY_MANAGEMENT" ]; then
    echo "ERROR: MIMIR_ENCRYPTION_KEY_MANAGEMENT is required"
    exit 1
  fi
fi

echo "✅ All required security variables are set"
```

---

## 📚 Related Documentation

- [Reverse Proxy Security Guide](./REVERSE_PROXY_SECURITY_GUIDE.md) - Phase 1 implementation
- [Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md) - Full security analysis
- [Security Implementation Plan](./SECURITY_IMPLEMENTATION_PLAN.md) - Feature flag approach

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-21  
**Maintainer**: Security Team  
**Status**: Reference Document
