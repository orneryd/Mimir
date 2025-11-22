# Mimir Security Implementation Plan

**Version**: 1.0.0  
**Date**: 2025-11-21  
**Status**: Design Document

---

## 🎯 Goal

Implement security features behind a **unified feature flag** (`MIMIR_ENABLE_SECURITY`) that:
- ✅ Defaults to `false` (backward compatible)
- ✅ Does not break existing functionality
- ✅ Can be enabled with a single environment variable
- ✅ Provides gradual security hardening path

---

## 🚩 Feature Flag Design

### Environment Variable

```bash
# .env
MIMIR_ENABLE_SECURITY=false  # Default: disabled for backward compatibility
```

**When `MIMIR_ENABLE_SECURITY=false`** (default):
- No authentication required
- HTTP allowed (no HTTPS enforcement)
- No audit logging
- No rate limiting
- **Existing behavior unchanged**

**When `MIMIR_ENABLE_SECURITY=true`**:
- API key authentication required
- Audit logging enabled
- Rate limiting enforced
- Security headers added
- **All security features active**

---

## 📋 Implementation Strategy

### Phase 1: Add Security Middleware (No Breaking Changes)

**Goal**: Add security code that only activates when flag is enabled

**Files to Modify**:
1. `src/middleware/security.ts` (new)
2. `src/http-server.ts` (add conditional middleware)
3. `env.example` (document flag)
4. `docker-compose.yml` (add flag with default false)

**Implementation**:

#### 1.1 Create Security Middleware

```typescript
// src/middleware/security.ts

import { Request, Response, NextFunction } from 'express';

/**
 * Security configuration loaded from environment
 */
export interface SecurityConfig {
  enabled: boolean;
  apiKey?: string;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  auditLog: boolean;
}

/**
 * Load security configuration from environment
 */
export function loadSecurityConfig(): SecurityConfig {
  const enabled = process.env.MIMIR_ENABLE_SECURITY === 'true';
  
  return {
    enabled,
    apiKey: enabled ? process.env.MIMIR_API_KEY : undefined,
    rateLimit: enabled ? {
      windowMs: parseInt(process.env.MIMIR_RATE_LIMIT_WINDOW_MS || '60000', 10),
      max: parseInt(process.env.MIMIR_RATE_LIMIT_MAX || '100', 10),
    } : undefined,
    auditLog: enabled,
  };
}

/**
 * API Key Authentication Middleware
 * Only active when MIMIR_ENABLE_SECURITY=true
 */
export function apiKeyAuth(config: SecurityConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if security disabled
    if (!config.enabled) {
      return next();
    }

    // Skip health check endpoint (always public)
    if (req.path === '/health') {
      return next();
    }

    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required. Set X-API-Key header.',
        hint: 'Security is enabled. See docs/security/SECURITY_QUICK_START.md'
      });
    }

    if (apiKey !== config.apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key'
      });
    }

    // Store authenticated flag for audit logging
    (req as any).authenticated = true;
    next();
  };
}

/**
 * Audit Logging Middleware
 * Only active when MIMIR_ENABLE_SECURITY=true
 */
export function auditLogger(config: SecurityConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if security disabled
    if (!config.enabled || !config.auditLog) {
      return next();
    }

    const startTime = Date.now();
    
    // Capture request details
    const log = {
      timestamp: new Date().toISOString(),
      ip: req.headers['x-real-ip'] as string || req.ip || 'unknown',
      method: req.method,
      path: req.path,
      authenticated: (req as any).authenticated || false,
      apiKey: maskApiKey(req.headers['x-api-key'] as string),
      userAgent: req.headers['user-agent'],
    };

    // Capture response
    res.on('finish', () => {
      const auditLog = {
        ...log,
        statusCode: res.statusCode,
        duration: Date.now() - startTime,
      };
      
      // Log as JSON with [AUDIT] prefix for easy filtering
      console.log(`[AUDIT] ${JSON.stringify(auditLog)}`);
    });

    next();
  };
}

/**
 * Rate Limiting Middleware
 * Only active when MIMIR_ENABLE_SECURITY=true
 */
export function rateLimiter(config: SecurityConfig) {
  // Simple in-memory rate limiter
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if security disabled
    if (!config.enabled || !config.rateLimit) {
      return next();
    }

    const ip = req.headers['x-real-ip'] as string || req.ip || 'unknown';
    const now = Date.now();
    const windowMs = config.rateLimit.windowMs;
    const max = config.rateLimit.max;

    // Get or create rate limit entry
    let entry = requests.get(ip);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      requests.set(ip, entry);
    }

    entry.count++;

    // Check if rate limit exceeded
    if (entry.count > max) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${max} requests per ${windowMs / 1000}s.`,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', (max - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', entry.resetTime.toString());

    next();
  };
}

/**
 * Security Headers Middleware
 * Only active when MIMIR_ENABLE_SECURITY=true
 */
export function securityHeaders(config: SecurityConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if security disabled
    if (!config.enabled) {
      return next();
    }

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    next();
  };
}

/**
 * Mask API key for logging (show first 8 chars only)
 */
function maskApiKey(apiKey: string | undefined): string {
  if (!apiKey) return 'none';
  if (apiKey.length <= 8) return '***';
  return apiKey.substring(0, 8) + '...';
}

/**
 * Cleanup rate limiter entries periodically
 */
export function startRateLimiterCleanup(intervalMs: number = 60000) {
  // This would be implemented with a proper cleanup mechanism
  // For now, it's a placeholder
}
```

#### 1.2 Update HTTP Server

```typescript
// src/http-server.ts

import { 
  loadSecurityConfig, 
  apiKeyAuth, 
  auditLogger, 
  rateLimiter,
  securityHeaders 
} from './middleware/security.js';

async function startHttpServer() {
  console.error("🚀 Graph-RAG MCP HTTP Server v4.1 starting...");
  
  // Load security configuration
  const securityConfig = loadSecurityConfig();
  
  if (securityConfig.enabled) {
    console.error("🔒 Security: ENABLED");
    console.error("   - API key authentication: ✅");
    console.error("   - Rate limiting: ✅");
    console.error("   - Audit logging: ✅");
    console.error("   - Security headers: ✅");
  } else {
    console.error("⚠️  Security: DISABLED (set MIMIR_ENABLE_SECURITY=true to enable)");
  }

  // ... existing GraphManager initialization ...

  const app = express();

  // ============================================================================
  // SECURITY MIDDLEWARE (only active if MIMIR_ENABLE_SECURITY=true)
  // ============================================================================
  
  // 1. Security headers (always safe to add)
  app.use(securityHeaders(securityConfig));
  
  // 2. Rate limiting (before body parsing to prevent DoS)
  app.use(rateLimiter(securityConfig));
  
  // 3. Body parsing
  app.use(bodyParser.json({ 
    limit: process.env.MAX_REQUEST_SIZE || '10mb',
    strict: true 
  }));

  // 4. CORS (existing)
  app.use(cors({ 
    origin: process.env.MCP_ALLOWED_ORIGIN || '*', 
    methods: ['POST','GET','DELETE'], 
    exposedHeaders: ['Mcp-Session-Id'], 
    credentials: true 
  }));

  // 5. Audit logging (after CORS, before auth)
  app.use(auditLogger(securityConfig));

  // 6. API key authentication (before routes)
  app.use(apiKeyAuth(securityConfig));

  // ============================================================================
  // ROUTES (existing, unchanged)
  // ============================================================================
  
  app.use('/', createChatRouter(graphManager));
  app.use('/api', createOrchestrationRouter(graphManager));
  // ... rest of routes ...

  // Health check (always public, even with security enabled)
  app.get('/health', (_req, res) => {
    res.json({ 
      status: 'healthy',
      security: securityConfig.enabled ? 'enabled' : 'disabled',
      timestamp: new Date().toISOString()
    });
  });

  // ... rest of server setup ...
}
```

#### 1.3 Update Environment Files

```bash
# env.example

# ============================================================================
# SECURITY CONFIGURATION (Optional - Disabled by Default)
# ============================================================================

# Enable security features (authentication, rate limiting, audit logging)
# Default: false (backward compatible - no breaking changes)
# Set to 'true' to enable all security features
MIMIR_ENABLE_SECURITY=false

# API Key (required when MIMIR_ENABLE_SECURITY=true)
# Generate with: openssl rand -base64 32
# MIMIR_API_KEY=your-secret-api-key-here

# Rate Limiting (only active when MIMIR_ENABLE_SECURITY=true)
# MIMIR_RATE_LIMIT_WINDOW_MS=60000  # 1 minute window
# MIMIR_RATE_LIMIT_MAX=100          # Max 100 requests per window
```

```yaml
# docker-compose.yml

services:
  mimir_server:
    environment:
      # Security (disabled by default for backward compatibility)
      - MIMIR_ENABLE_SECURITY=${MIMIR_ENABLE_SECURITY:-false}
      - MIMIR_API_KEY=${MIMIR_API_KEY:-}
      - MIMIR_RATE_LIMIT_WINDOW_MS=${MIMIR_RATE_LIMIT_WINDOW_MS:-60000}
      - MIMIR_RATE_LIMIT_MAX=${MIMIR_RATE_LIMIT_MAX:-100}
```

---

## 🧪 Testing Strategy

### Test 1: Default Behavior (Security Disabled)

```bash
# No MIMIR_ENABLE_SECURITY set (defaults to false)
docker-compose up -d

# Should work without API key
curl http://localhost:9042/health
# Expected: 200 OK

curl http://localhost:9042/api/nodes/query \
  -H "Content-Type: application/json" \
  -d '{"type":"todo"}'
# Expected: 200 OK (no authentication required)
```

### Test 2: Security Enabled

```bash
# Enable security
export MIMIR_ENABLE_SECURITY=true
export MIMIR_API_KEY=$(openssl rand -base64 32)

docker-compose up -d

# Health check should still work (public endpoint)
curl http://localhost:9042/health
# Expected: 200 OK, shows "security": "enabled"

# API call without key should fail
curl http://localhost:9042/api/nodes/query \
  -H "Content-Type: application/json" \
  -d '{"type":"todo"}'
# Expected: 401 Unauthorized

# API call with key should work
curl http://localhost:9042/api/nodes/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $MIMIR_API_KEY" \
  -d '{"type":"todo"}'
# Expected: 200 OK
```

### Test 3: Rate Limiting

```bash
# With security enabled, send 150 requests
for i in {1..150}; do
  curl -H "X-API-Key: $MIMIR_API_KEY" http://localhost:9042/health
done
# Expected: First 100 succeed, rest return 429 Too Many Requests
```

### Test 4: Audit Logging

```bash
# With security enabled, make some requests
curl -H "X-API-Key: $MIMIR_API_KEY" http://localhost:9042/api/nodes/query \
  -H "Content-Type: application/json" \
  -d '{"type":"todo"}'

# Check logs
docker-compose logs mimir_server | grep AUDIT
# Expected: JSON audit logs with timestamp, IP, method, path, statusCode, duration
```

---

## 📚 Documentation Updates

### 1. Update Main README

```markdown
## 🔒 Security

Mimir supports optional security features that can be enabled with a single environment variable:

```bash
# Enable all security features
MIMIR_ENABLE_SECURITY=true
MIMIR_API_KEY=your-secret-api-key
```

**Security Features** (when enabled):
- ✅ API key authentication
- ✅ Rate limiting (100 req/min)
- ✅ Audit logging
- ✅ Security headers

**Default**: Security is **disabled** for backward compatibility.

**For production deployments**, see:
- [Security Quick Start](docs/security/SECURITY_QUICK_START.md) - Enable security in 5 minutes
- [Enterprise Readiness Audit](docs/security/ENTERPRISE_READINESS_AUDIT.md) - Full compliance analysis
```

### 2. Create Migration Guide

```markdown
# Migrating to Secured Mimir

## For Existing Users

**No action required!** Security is disabled by default.

Your existing setup will continue to work without any changes.

## Enabling Security (Optional)

If you want to add security:

1. Generate an API key:
   ```bash
   openssl rand -base64 32
   ```

2. Add to `.env`:
   ```bash
   MIMIR_ENABLE_SECURITY=true
   MIMIR_API_KEY=your-generated-key
   ```

3. Restart Mimir:
   ```bash
   docker-compose restart mimir_server
   ```

4. Update clients to include API key:
   ```bash
   curl -H "X-API-Key: your-generated-key" http://localhost:9042/api/...
   ```

## Gradual Rollout

You can enable security in stages:

1. **Development**: Keep disabled (`MIMIR_ENABLE_SECURITY=false`)
2. **Staging**: Enable and test (`MIMIR_ENABLE_SECURITY=true`)
3. **Production**: Enable after validation

## Troubleshooting

**"Unauthorized" errors after enabling security**:
- Check `MIMIR_API_KEY` is set
- Verify clients are sending `X-API-Key` header
- Check logs: `docker-compose logs mimir_server | grep AUDIT`

**Rate limiting issues**:
- Increase limit: `MIMIR_RATE_LIMIT_MAX=200`
- Increase window: `MIMIR_RATE_LIMIT_WINDOW_MS=120000` (2 minutes)
```

---

## 🚀 Rollout Plan

### Week 1: Implementation

**Day 1-2**: Implement middleware
- Create `src/middleware/security.ts`
- Add tests for each middleware function
- Ensure all middleware checks `config.enabled` first

**Day 3**: Integrate with HTTP server
- Update `src/http-server.ts`
- Add conditional middleware
- Test with security disabled (default)
- Test with security enabled

**Day 4**: Documentation
- Update README.md
- Create migration guide
- Update env.example
- Add inline code comments

**Day 5**: Testing
- Manual testing (both modes)
- Integration tests
- Performance testing (ensure no overhead when disabled)

### Week 2: Release

**Day 1**: Beta release
- Merge to `develop` branch
- Tag as `v4.2.0-beta.1`
- Announce in Discord/Slack

**Day 2-3**: Beta testing
- Community testing
- Collect feedback
- Fix any issues

**Day 4**: Release
- Merge to `main`
- Tag as `v4.2.0`
- Update Docker Hub
- Publish release notes

**Day 5**: Documentation
- Blog post about security features
- Video tutorial
- Update examples

---

## ✅ Success Criteria

### Backward Compatibility

- [ ] Existing users can upgrade without changes
- [ ] All existing functionality works with `MIMIR_ENABLE_SECURITY=false`
- [ ] No performance degradation when security disabled
- [ ] No breaking changes to API

### Security Features

- [ ] API key authentication works correctly
- [ ] Rate limiting prevents DoS
- [ ] Audit logs capture all requests
- [ ] Security headers added
- [ ] Health check always public

### Documentation

- [ ] Clear migration guide
- [ ] Updated README
- [ ] Environment variable documentation
- [ ] Troubleshooting guide

### Testing

- [ ] Unit tests for all middleware
- [ ] Integration tests (both modes)
- [ ] Performance tests
- [ ] Security audit passed

---

## 🔄 Future Enhancements (Optional)

These can be added later behind the same flag:

### Phase 2: Advanced Authentication

```bash
MIMIR_ENABLE_SECURITY=true
MIMIR_AUTH_TYPE=oauth  # or 'api-key' (default)
MIMIR_OAUTH_ISSUER=https://auth.yourcompany.com
MIMIR_OAUTH_AUDIENCE=mimir-api
```

### Phase 3: RBAC

```bash
MIMIR_ENABLE_SECURITY=true
MIMIR_ENABLE_RBAC=true
MIMIR_RBAC_ADMIN_ROLE=admin
MIMIR_RBAC_USER_ROLE=user
```

### Phase 4: Encryption

```bash
MIMIR_ENABLE_SECURITY=true
MIMIR_ENABLE_ENCRYPTION_AT_REST=true
MIMIR_ENCRYPTION_KEY_FILE=/run/secrets/encryption_key
```

---

## 📊 Performance Impact

### Benchmark Results (Expected)

**Security Disabled** (default):
- Request latency: ~10ms (baseline)
- Throughput: 1000 req/s
- Memory overhead: 0 MB

**Security Enabled**:
- Request latency: ~12ms (+2ms for auth + audit)
- Throughput: 900 req/s (-10% for rate limiting checks)
- Memory overhead: ~5 MB (rate limiter map)

**Impact**: Minimal (<10% overhead when enabled, 0% when disabled)

---

## 🎯 Summary

**Key Principles**:
1. ✅ **Backward Compatible**: Security disabled by default
2. ✅ **Single Flag**: One environment variable to enable all features
3. ✅ **No Breaking Changes**: Existing functionality unchanged
4. ✅ **Gradual Adoption**: Users can enable when ready
5. ✅ **Zero Overhead**: No performance impact when disabled

**Implementation Effort**: 1 week (5 days)

**Risk**: LOW (feature flag ensures safety)

**Benefit**: HIGH (enables secure deployments without breaking existing users)

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-21  
**Status**: Ready for Implementation  
**Approval**: Pending
