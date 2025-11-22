# RBAC Configuration Guide

**Version**: 1.0.0  
**Date**: 2025-11-21  
**Purpose**: Flexible Role-Based Access Control without code changes

---

## 🎯 Two-Tier Security Model

```
┌─────────────────────────────────────────────────────────────┐
│ MIMIR_ENABLE_SECURITY=true                                  │
│ ✅ Authentication: Who are you?                             │
│ → All authenticated users get system-wide access            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ MIMIR_ENABLE_RBAC=true                                      │
│ ✅ Authorization: What can you do?                          │
│ → Fine-grained permissions based on roles                   │
└─────────────────────────────────────────────────────────────┘
```

**Use Cases:**
- **Security only**: Internal team, everyone needs full access → `MIMIR_ENABLE_SECURITY=true`, `MIMIR_ENABLE_RBAC=false`
- **Security + RBAC**: Enterprise, different teams/roles → Both `true`
- **Development**: No security → Both `false`

---

## 📋 Standard Approach (Claims-Based Authorization)

### How It Works

1. **User authenticates** via OAuth/OIDC (Okta, Auth0, Azure AD, CVS internal system)
2. **IdP returns JWT** with claims (roles, groups, permissions)
3. **Mimir extracts claims** from JWT (e.g., `roles: ["developer", "admin"]`)
4. **Configuration file maps** IdP roles → Mimir permissions
5. **Middleware checks** if user's roles have required permission for endpoint

### Example JWT Claims (from CVS IdP)

```json
{
  "sub": "user123",
  "email": "john.doe@cvshealth.com",
  "groups": ["cvs-mimir-developers", "cvs-data-analysts"],
  "roles": ["developer", "viewer"],
  "department": "Digital Engineering"
}
```

### Mimir Role Mapping (Configuration File)

**File**: `config/rbac.json` or `MIMIR_RBAC_CONFIG` env var

```json
{
  "version": "1.0",
  "claimPath": "roles",  // Where to find roles in JWT (can be "groups", "roles", "permissions")
  "roleMappings": {
    "admin": {
      "description": "Full system access",
      "permissions": ["*"]
    },
    "developer": {
      "description": "Read/write code, manage tasks",
      "permissions": [
        "nodes:read",
        "nodes:write",
        "nodes:delete",
        "search:execute",
        "orchestration:read",
        "orchestration:write",
        "files:index",
        "files:read"
      ]
    },
    "viewer": {
      "description": "Read-only access",
      "permissions": [
        "nodes:read",
        "search:execute",
        "orchestration:read",
        "files:read"
      ]
    },
    "analyst": {
      "description": "Data analysis and search",
      "permissions": [
        "nodes:read",
        "search:execute",
        "files:read"
      ]
    }
  },
  "defaultRole": "viewer"  // Fallback if no roles matched
}
```

---

## 🔐 Mimir Permission Model

### API Permissions (Granular)

| Permission | Scope | Endpoints |
|------------|-------|-----------|
| `nodes:read` | View nodes | `GET /api/nodes/*` |
| `nodes:write` | Create/update nodes | `POST /api/nodes`, `PUT /api/nodes/*`, `PATCH /api/nodes/*` |
| `nodes:delete` | Delete nodes | `DELETE /api/nodes/*` |
| `search:execute` | Run searches | `POST /api/vector-search`, `POST /api/search` |
| `orchestration:read` | View workflows | `GET /api/executions/*`, `GET /api/agents/*` |
| `orchestration:write` | Create workflows | `POST /api/execute-workflow`, `POST /api/agents` |
| `orchestration:execute` | Run agents | `POST /api/executions/*/start` |
| `files:index` | Index files | `POST /api/index-folder` |
| `files:read` | Read indexed files | `GET /api/files/*` |
| `chat:use` | Use chat API | `POST /v1/chat/completions` |
| `admin:config` | System configuration | `POST /api/config/*` |
| `*` | All permissions | All endpoints |

### MCP Tool Permissions

| Permission | MCP Tools |
|------------|-----------|
| `mcp:memory_read` | `memory_node(get)`, `memory_node(query)`, `memory_node(search)` |
| `mcp:memory_write` | `memory_node(add)`, `memory_node(update)`, `memory_batch` |
| `mcp:memory_delete` | `memory_node(delete)`, `memory_clear` |
| `mcp:edges` | `memory_edge(*)` |
| `mcp:search` | `vector_search_nodes`, `get_embedding_stats` |
| `mcp:files` | `index_folder`, `remove_folder`, `list_folders` |
| `mcp:todos` | `todo(*)`, `todo_list(*)` |
| `mcp:orchestration` | `execute_workflow`, `get_execution_status`, etc. |

---

## 🛠️ Implementation Architecture

### 1. Configuration Loader

**File**: `src/config/rbac-config.ts`

```typescript
export interface RBACConfig {
  version: string;
  claimPath: string; // JWT path to roles (e.g., "roles", "groups", "custom.permissions")
  roleMappings: {
    [roleName: string]: {
      description: string;
      permissions: string[];
    };
  };
  defaultRole?: string;
}

export function loadRBACConfig(): RBACConfig {
  const configPath = process.env.MIMIR_RBAC_CONFIG || './config/rbac.json';
  
  if (!fs.existsSync(configPath)) {
    console.warn('⚠️  RBAC config not found, using default (viewer-only)');
    return getDefaultConfig();
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  validateConfig(config);
  return config;
}
```

### 2. Claims Extractor

**File**: `src/middleware/claims-extractor.ts`

```typescript
import jwt from 'jsonwebtoken';

export function extractClaims(user: any, claimPath: string): string[] {
  // Support nested paths like "custom.roles" or "groups"
  const parts = claimPath.split('.');
  let value = user;
  
  for (const part of parts) {
    value = value?.[part];
  }
  
  // Handle array or single value
  return Array.isArray(value) ? value : value ? [value] : [];
}

// Example: extractClaims(user, "roles") → ["developer", "admin"]
// Example: extractClaims(user, "groups") → ["cvs-mimir-developers"]
```

### 3. Permission Checker Middleware

**File**: `src/middleware/rbac.ts`

```typescript
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if RBAC not enabled
    if (process.env.MIMIR_ENABLE_RBAC !== 'true') {
      return next();
    }
    
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Extract roles from JWT claims
    const config = loadRBACConfig();
    const userRoles = extractClaims(user, config.claimPath);
    
    // Get all permissions for user's roles
    const userPermissions = new Set<string>();
    for (const role of userRoles) {
      const roleConfig = config.roleMappings[role];
      if (roleConfig) {
        roleConfig.permissions.forEach(p => userPermissions.add(p));
      }
    }
    
    // Check if user has wildcard or specific permission
    if (userPermissions.has('*') || userPermissions.has(permission)) {
      return next();
    }
    
    return res.status(403).json({ 
      error: 'Forbidden',
      message: `Requires permission: ${permission}`,
      userRoles,
      requiredPermission: permission
    });
  };
}
```

### 4. Route Protection

**File**: `src/http-server.ts`

```typescript
import { requirePermission } from './middleware/rbac.js';

// Protect API routes with permissions
app.get('/api/nodes/:id', 
  requirePermission('nodes:read'),
  async (req, res) => { /* ... */ }
);

app.post('/api/nodes', 
  requirePermission('nodes:write'),
  async (req, res) => { /* ... */ }
);

app.delete('/api/nodes/:id', 
  requirePermission('nodes:delete'),
  async (req, res) => { /* ... */ }
);

app.post('/api/execute-workflow',
  requirePermission('orchestration:write'),
  async (req, res) => { /* ... */ }
);
```

---

## 🔧 Configuration Examples

### Example 1: CVS Internal System

**CVS IdP returns:**
```json
{
  "sub": "john.doe@cvshealth.com",
  "groups": ["cvs-mimir-admins", "cvs-digital-engineering"],
  "department": "Digital Engineering"
}
```

**Mimir RBAC Config:**
```json
{
  "version": "1.0",
  "claimPath": "groups",
  "roleMappings": {
    "cvs-mimir-admins": {
      "description": "CVS Mimir Administrators",
      "permissions": ["*"]
    },
    "cvs-digital-engineering": {
      "description": "Digital Engineering Team",
      "permissions": [
        "nodes:read", "nodes:write",
        "search:execute",
        "orchestration:read", "orchestration:write",
        "files:index", "files:read"
      ]
    },
    "cvs-data-analysts": {
      "description": "Data Analysis Team",
      "permissions": ["nodes:read", "search:execute", "files:read"]
    }
  },
  "defaultRole": "viewer"
}
```

### Example 2: Okta with Custom Roles

**Okta returns:**
```json
{
  "sub": "user123",
  "email": "user@company.com",
  "roles": ["mimir-developer", "mimir-viewer"]
}
```

**Mimir RBAC Config:**
```json
{
  "version": "1.0",
  "claimPath": "roles",
  "roleMappings": {
    "mimir-admin": {
      "permissions": ["*"]
    },
    "mimir-developer": {
      "permissions": [
        "nodes:read", "nodes:write", "nodes:delete",
        "search:execute",
        "orchestration:read", "orchestration:write", "orchestration:execute",
        "files:index", "files:read",
        "chat:use"
      ]
    },
    "mimir-viewer": {
      "permissions": ["nodes:read", "search:execute", "files:read"]
    }
  }
}
```

### Example 3: Azure AD with Groups

**Azure AD returns:**
```json
{
  "oid": "user-guid",
  "email": "user@company.com",
  "groups": ["sg-mimir-full-access", "sg-mimir-readonly"]
}
```

**Mimir RBAC Config:**
```json
{
  "version": "1.0",
  "claimPath": "groups",
  "roleMappings": {
    "sg-mimir-full-access": {
      "permissions": ["*"]
    },
    "sg-mimir-readonly": {
      "permissions": ["nodes:read", "search:execute"]
    }
  }
}
```

---

## 🚀 Usage

### Step 1: Enable RBAC

```bash
# .env
MIMIR_ENABLE_SECURITY=true
MIMIR_ENABLE_RBAC=true
MIMIR_RBAC_CONFIG=/path/to/rbac.json
```

### Step 2: Create RBAC Config

Create `config/rbac.json` with your IdP's role mappings (see examples above).

### Step 3: Configure Your IdP

**In your OAuth/OIDC provider (Okta/Auth0/Azure/CVS):**

1. Create groups/roles (e.g., `cvs-mimir-admins`, `cvs-mimir-developers`)
2. Assign users to groups
3. Configure JWT to include groups/roles in claims
4. Update `rbac.json` to map those groups → Mimir permissions

### Step 4: Test

```bash
# Login as user with "developer" role
curl -X POST http://localhost:9042/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"dev-user","password":"pass"}'

# Try protected endpoint
curl -X POST http://localhost:9042/api/nodes \
  -H "Cookie: connect.sid=..." \
  -H "Content-Type: application/json" \
  -d '{"type":"memory","properties":{"title":"test"}}'

# Should succeed if user has "nodes:write" permission
# Should return 403 if user lacks permission
```

---

## 🎨 Benefits of This Approach

### ✅ No Code Changes for New Providers

- Add CVS internal system → just update `rbac.json`
- Switch from Okta to Azure AD → just change `claimPath`
- Add new role → just add to `roleMappings`

### ✅ Customer Controls Their Own RBAC

- CVS IT creates groups in their IdP
- CVS IT maps groups to Mimir permissions in `rbac.json`
- No need to contact Mimir team for role changes

### ✅ Standard Industry Practice

- **Claims-based authorization**: OAuth 2.0 / OIDC standard
- **Configuration-driven**: No hardcoded roles in code
- **Flexible claim paths**: Works with any JWT structure

### ✅ Granular Control

- API-level permissions (nodes, search, orchestration)
- MCP tool permissions (optional, can add later)
- Wildcard support (`*` for admin)

### ✅ Easy Testing

- Development mode: `MIMIR_ENABLE_RBAC=false` (all authenticated users get full access)
- Production mode: `MIMIR_ENABLE_RBAC=true` (fine-grained control)

---

## 🔄 Migration Path

### Phase 1: Authentication Only (Current)
```bash
MIMIR_ENABLE_SECURITY=true
MIMIR_ENABLE_RBAC=false
```
→ All authenticated users get full access

### Phase 2: Add RBAC Config
```bash
# Create config/rbac.json
# Map IdP roles to Mimir permissions
```

### Phase 3: Enable RBAC
```bash
MIMIR_ENABLE_RBAC=true
```
→ Fine-grained permissions enforced

---

## 📚 Next Steps

1. **Implement RBAC middleware** (`src/middleware/rbac.ts`)
2. **Create default config** (`config/rbac.default.json`)
3. **Add permission decorators** to API routes
4. **Document IdP setup** for Okta/Auth0/Azure/CVS
5. **Add RBAC testing** (`testing/test-rbac.sh`)

---

## 🤔 FAQ

**Q: Can we use custom claim names?**  
A: Yes! Set `claimPath` to any JWT field (e.g., `"custom.permissions"`, `"app_metadata.roles"`).

**Q: Can one user have multiple roles?**  
A: Yes! Permissions are merged from all roles. If JWT has `["developer", "viewer"]`, user gets both permission sets.

**Q: What if IdP doesn't send roles?**  
A: Use `defaultRole` in config (e.g., `"viewer"`) as fallback.

**Q: Can we restrict MCP tools separately?**  
A: Yes! Add `mcp:*` permissions and check in MCP server tool handlers.

**Q: Does this work with API keys?**  
A: Yes! API keys can have associated roles stored in database, checked same way.

**Q: How does validation work for API keys?**  
A: API keys are validated stateless on every request:
- API key is looked up in the database
- User's current roles are retrieved from the key's associated user
- Permissions are calculated from current roles (not cached)
- This ensures API keys always reflect the user's current permissions

**Example:**
- User creates API key with `["admin", "developer"]` roles
- User is later demoted to `["developer"]` in IdP
- On next API key use, permissions are automatically reduced to `["developer"]`
- This prevents privilege escalation via stale API keys

**Security Benefits:**
- ✅ API keys always reflect user's current permissions (no caching)
- ✅ No manual key revocation needed when user roles change
- ✅ Stateless validation - no session storage required
- ✅ Works with any authentication provider (OAuth, OIDC, etc.)

---

**Last Updated**: 2025-11-21  
**Version**: 1.1.0


