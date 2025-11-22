# Security Responsibility Matrix

**Purpose**: Clarify what security features are **built into Mimir** vs **handled by deployment infrastructure**.

**Philosophy**: Mimir provides **generic, configurable security primitives**. Domain-specific concerns (PII/PHI detection, FIPS crypto, SIEM) are handled by deployment teams using industry-standard tools.

---

## 🔧 Mimir's Responsibility (Code Changes)

### ✅ Phase 1: COMPLETE

| Feature | Status | Description |
|---------|--------|-------------|
| **OAuth/OIDC Authentication** | ✅ Complete | Passport.js integration with multi-provider support |
| **Role-Based Access Control** | ✅ Complete | Claims-based authorization with configurable permissions |
| **Session Management** | ✅ Complete | HTTP-only cookies with configurable expiration |
| **Protected Routes** | ✅ Complete | UI redirect + API 401/403 enforcement |
| **Development Mode** | ✅ Complete | Local username/password for testing |

### 🔄 Phase 2: Planned

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| **Structured Audit Logging** | HIGH | 1-2 weeks | Generic audit trail with JSON output |
| **Data Retention Policies** | MEDIUM | 2 weeks | Configurable TTL and automated purging |
| **Webhook Support** | MEDIUM | 1 week | Send audit events to external services |
| **API Rate Limiting** | LOW | 1 week | Application-level rate limiting |

### What Mimir Provides

**Audit Logging (Generic, Not Domain-Specific)**
```json
{
  "timestamp": "2025-11-21T10:30:00Z",
  "userId": "user@example.com",
  "action": "nodes:write",
  "resource": "/api/nodes",
  "outcome": "success",
  "metadata": {
    "nodeId": "node-123",
    "nodeType": "memory",
    "ipAddress": "10.0.1.5",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Key Characteristics:**
- ✅ Generic (not PII/PHI-specific)
- ✅ JSON-formatted for SIEM ingestion
- ✅ Configurable destinations (stdout, file, webhook)
- ✅ Environment-driven configuration
- ❌ Does NOT detect/classify PII/PHI (deployment team's responsibility)
- ❌ Does NOT enforce FIPS crypto (deployment team's responsibility)

**Configuration Example:**
```bash
# .env
MIMIR_ENABLE_AUDIT_LOGGING=true
MIMIR_AUDIT_LOG_DESTINATION=stdout  # or file, webhook
MIMIR_AUDIT_LOG_FILE=/var/log/mimir/audit.log
MIMIR_AUDIT_WEBHOOK_URL=https://siem.example.com/ingest
```

---

## 🏗️ Deployment Team's Responsibility (Infrastructure)

### High Priority (Already Documented)

| Feature | Tools | Mimir Provides | Deployment Configures |
|---------|-------|----------------|----------------------|
| **HTTPS/TLS** | Nginx, Traefik, AWS ALB | HTTP server | Reverse proxy with TLS 1.2+ |
| **Rate Limiting** | Nginx, Cloudflare | API endpoints | Request limits per IP/user |
| **IP Whitelisting** | Nginx, AWS Security Groups | API endpoints | Allowed IP ranges |
| **SIEM Integration** | Splunk, ELK, Datadog | JSON audit logs | Log aggregation pipeline |
| **FIPS Crypto** | Hardware modules, AWS KMS | Standard crypto | FIPS 140-2 validated modules |
| **Certificate Management** | Let's Encrypt, cert-manager | Standard TLS | Cert issuance and rotation |

**Documentation:**
- ✅ `docs/security/REVERSE_PROXY_SECURITY_GUIDE.md` - HTTPS, rate limiting, IP whitelisting
- 🔄 `docs/security/SIEM_INTEGRATION_GUIDE.md` - TO BE CREATED
- 🔄 `docs/security/FIPS_COMPLIANCE_GUIDE.md` - TO BE CREATED

### Medium Priority (To Be Documented)

| Feature | Tools | Mimir Provides | Deployment Configures |
|---------|-------|----------------|----------------------|
| **PII/PHI Detection** | DLP tools (Nightfall, Macie) | Generic data storage | Data classification rules |
| **Anomaly Detection** | SIEM, ML tools | Audit logs | Behavioral analysis |
| **Intrusion Detection** | IDS/IPS (Snort, Suricata) | Network endpoints | Attack signatures |
| **Compliance Reporting** | Tableau, PowerBI, custom | Audit logs + export API | Report generation |
| **Data Governance** | Collibra, Alation | Metadata fields | Classification policies |
| **Backup & DR** | Velero, AWS Backup | Neo4j data | Backup schedules + recovery |

**Documentation (To Be Created):**
- 🔄 `docs/security/DATA_CLASSIFICATION_GUIDE.md`
- 🔄 `docs/security/COMPLIANCE_REPORTING_GUIDE.md`
- 🔄 `docs/security/DISASTER_RECOVERY_GUIDE.md`

### Low Priority (To Be Documented)

| Feature | Tools | Mimir Provides | Deployment Configures |
|---------|-------|----------------|----------------------|
| **Web Application Firewall** | ModSecurity, Cloudflare | HTTP endpoints | WAF rules |
| **DDoS Protection** | Cloudflare, AWS Shield | HTTP endpoints | Traffic filtering |
| **Secrets Management** | Vault, AWS Secrets Manager | Env var support | Secret rotation |
| **Container Security** | Falco, Aqua Security | Docker images | Runtime protection |

---

## 🎯 Why This Separation?

### Benefits of Mimir's Approach

**1. Domain Agnostic**
- ✅ Works for healthcare (HIPAA), finance (SOC 2), government (FISMA), EU (GDPR)
- ✅ Not tied to specific regulations or data types
- ✅ Flexible for any industry

**2. Best-of-Breed Integration**
- ✅ Use industry-standard tools (Nginx, Splunk, AWS KMS)
- ✅ Avoid reinventing the wheel
- ✅ Leverage existing expertise

**3. Deployment Flexibility**
- ✅ On-premises, cloud, hybrid, air-gapped
- ✅ Different security postures per environment
- ✅ Gradual security hardening

**4. Maintainability**
- ✅ Mimir focuses on core functionality
- ✅ Security infrastructure evolves independently
- ✅ Easier upgrades and testing

### What Mimir Does NOT Build

**❌ PII/PHI Detection**
- **Why**: Domain-specific, requires ML models, constantly evolving
- **Use instead**: DLP tools (Nightfall, AWS Macie, Microsoft Purview)

**❌ FIPS 140-2 Cryptography**
- **Why**: Requires hardware validation, expensive certification
- **Use instead**: FIPS-validated modules (AWS KMS, Hardware Security Modules)

**❌ SIEM Platform**
- **Why**: Complex, enterprise-scale, requires specialized expertise
- **Use instead**: Splunk, ELK Stack, Datadog, Sumo Logic

**❌ Intrusion Detection**
- **Why**: Network-level concern, requires deep packet inspection
- **Use instead**: IDS/IPS (Snort, Suricata, AWS GuardDuty)

**❌ Compliance Reporting**
- **Why**: Organization-specific, requires custom dashboards
- **Use instead**: BI tools (Tableau, PowerBI) + Mimir's audit logs

---

## 📋 Phase 2 Implementation Plan

### What Mimir Will Build (1-3 weeks)

**1. Structured Audit Logging (1-2 weeks)**

```typescript
// src/middleware/audit-logger.ts
interface AuditEvent {
  timestamp: string;
  userId: string;
  action: string;  // e.g., "nodes:write", "search:execute"
  resource: string; // e.g., "/api/nodes"
  outcome: "success" | "failure";
  metadata: Record<string, any>;
}

// Configuration
MIMIR_ENABLE_AUDIT_LOGGING=true
MIMIR_AUDIT_LOG_DESTINATION=stdout  // or file, webhook
MIMIR_AUDIT_LOG_FORMAT=json  // or text
MIMIR_AUDIT_LOG_LEVEL=info  // or debug, warn, error
```

**2. Data Retention Policies (2 weeks)**

```bash
# Configuration
MIMIR_DATA_RETENTION_ENABLED=true
MIMIR_DATA_RETENTION_DEFAULT_DAYS=90
MIMIR_DATA_RETENTION_TODO_DAYS=30
MIMIR_DATA_RETENTION_MEMORY_DAYS=365
MIMIR_DATA_RETENTION_AUDIT_DAYS=2555  # 7 years for HIPAA
```

**3. Webhook Support (1 week)**

```bash
# Configuration
MIMIR_AUDIT_WEBHOOK_URL=https://siem.example.com/ingest
MIMIR_AUDIT_WEBHOOK_AUTH_HEADER=Bearer token123
MIMIR_AUDIT_WEBHOOK_BATCH_SIZE=100
MIMIR_AUDIT_WEBHOOK_BATCH_INTERVAL_MS=5000
```

### What Deployment Teams Configure (Ongoing)

**1. HTTPS Reverse Proxy (Already Documented)**
- Follow `docs/security/REVERSE_PROXY_SECURITY_GUIDE.md`
- Tools: Nginx, Traefik, AWS ALB, Cloudflare

**2. SIEM Integration (To Be Documented)**
- Forward Mimir's JSON logs to SIEM
- Tools: Splunk, ELK, Datadog, Sumo Logic

**3. FIPS Compliance (To Be Documented)**
- Use FIPS-validated cryptographic modules
- Tools: AWS KMS, Hardware Security Modules, FIPS-enabled OpenSSL

**4. Data Classification (To Be Documented)**
- Tag sensitive data using DLP tools
- Tools: Nightfall, AWS Macie, Microsoft Purview

---

## 🚀 Quick Reference

### For Mimir Developers

**What to build:**
- ✅ Generic audit logging (JSON output)
- ✅ Configurable retention policies
- ✅ Webhook support for external services
- ✅ Environment-driven configuration

**What NOT to build:**
- ❌ PII/PHI detection logic
- ❌ FIPS crypto implementation
- ❌ SIEM platform
- ❌ Intrusion detection
- ❌ Compliance reporting dashboards

### For Deployment Teams

**What Mimir provides:**
- ✅ OAuth/OIDC authentication
- ✅ RBAC with configurable permissions
- ✅ JSON audit logs (stdout/file/webhook)
- ✅ Session management
- ✅ Protected API routes

**What you configure:**
- 🔧 HTTPS reverse proxy (Nginx, Traefik)
- 🔧 SIEM integration (Splunk, ELK)
- 🔧 FIPS crypto (AWS KMS, HSM)
- 🔧 DLP tools (Nightfall, Macie)
- 🔧 Backup & DR (Velero, AWS Backup)

---

## 📚 Documentation Roadmap

### ✅ Complete
- `docs/security/REVERSE_PROXY_SECURITY_GUIDE.md`
- `docs/security/AUTHENTICATION_PROVIDER_INTEGRATION.md`
- `docs/security/RBAC_CONFIGURATION.md`
- `docs/security/SESSION_CONFIGURATION.md`
- `docs/security/DEV_AUTHENTICATION.md`

### 🔄 To Be Created (Phase 2)
- `docs/security/AUDIT_LOGGING_GUIDE.md` - Mimir's audit logging
- `docs/security/SIEM_INTEGRATION_GUIDE.md` - Splunk, ELK, Datadog
- `docs/security/FIPS_COMPLIANCE_GUIDE.md` - FIPS 140-2 setup
- `docs/security/DATA_CLASSIFICATION_GUIDE.md` - DLP tools
- `docs/security/COMPLIANCE_REPORTING_GUIDE.md` - Audit log analysis
- `docs/security/DISASTER_RECOVERY_GUIDE.md` - Backup & restore

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-21  
**Maintained By**: Mimir Security Team

