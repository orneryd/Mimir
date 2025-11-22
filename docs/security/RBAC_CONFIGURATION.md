# RBAC Configuration Guide

This guide explains how to configure Role-Based Access Control (RBAC) in Mimir using flexible configuration sources.

## Configuration Sources

Mimir supports **3 ways** to provide RBAC configuration via the `MIMIR_RBAC_CONFIG` environment variable:

### 1. Local File Path (Default)

Point to a JSON file on the local filesystem:

```bash
MIMIR_RBAC_CONFIG=./config/rbac.json
```

**Use case**: Development, Docker volumes, Kubernetes ConfigMaps mounted as files

**Example**:
```bash
# .env
MIMIR_RBAC_CONFIG=./config/rbac.local.json
```

### 2. Remote URI (HTTP/HTTPS)

Fetch configuration from a remote server:

```bash
MIMIR_RBAC_CONFIG=https://config-server.example.com/rbac.json
MIMIR_RBAC_AUTH_HEADER="Bearer your-token-here"
```

**Use case**: Centralized configuration management, dynamic updates, GitOps workflows

**Example**:
```bash
# .env
MIMIR_RBAC_CONFIG=https://raw.githubusercontent.com/your-org/configs/main/mimir-rbac.json
MIMIR_RBAC_AUTH_HEADER="token ghp_yourGitHubToken"
```

**Features**:
- Supports authentication via `MIMIR_RBAC_AUTH_HEADER`
- Loaded once at server startup
- Cached in memory for performance

### 3. Inline JSON

Embed the entire configuration in the environment variable:

```bash
MIMIR_RBAC_CONFIG='{"version":"1.0","claimPath":"roles","roleMappings":{"admin":{"permissions":["*"]}}}'
```

**Use case**: Kubernetes Secrets, containerized deployments, CI/CD pipelines

**Example**:
```bash
# .env
MIMIR_RBAC_CONFIG='{"version":"1.0","claimPath":"roles","defaultRole":"viewer","roleMappings":{"admin":{"description":"Full access","permissions":["*"]},"developer":{"description":"Read/write access","permissions":["nodes:*","orchestration:*"]},"viewer":{"description":"Read-only","permissions":["nodes:read","search:execute"]}}}'
```

## Configuration Format

All three sources must provide JSON in this format:

```json
{
  "version": "1.0",
  "claimPath": "roles",
  "defaultRole": "viewer",
  "roleMappings": {
    "admin": {
      "description": "Full system access",
      "permissions": ["*"]
    },
    "developer": {
      "description": "Read/write access for development",
      "permissions": [
        "nodes:read",
        "nodes:write",
        "nodes:delete",
        "search:execute",
        "orchestration:*",
        "files:*",
        "chat:use"
      ]
    },
    "analyst": {
      "description": "Read and query access",
      "permissions": [
        "nodes:read",
        "search:execute",
        "orchestration:read",
        "files:read",
        "chat:use"
      ]
    },
    "viewer": {
      "description": "Read-only access",
      "permissions": [
        "nodes:read",
        "search:execute",
        "files:read"
      ]
    }
  }
}
```

### Fields

- **`version`**: Config schema version (currently `"1.0"`)
- **`claimPath`**: JWT path to extract roles (e.g., `"roles"`, `"groups"`, `"custom.permissions"`)
- **`defaultRole`**: Role assigned to users with no roles (optional)
- **`roleMappings`**: Map of role names to permissions

### Permissions

Permissions use the format `resource:action`:

- **Wildcards**: `*` (all), `nodes:*` (all node operations)
- **Resources**: `nodes`, `search`, `orchestration`, `files`, `chat`, `mcp`
- **Actions**: `read`, `write`, `delete`, `execute`, `use`

## Examples

### Example 1: Local File (Development)

```bash
# .env
MIMIR_ENABLE_RBAC=true
MIMIR_RBAC_CONFIG=./config/rbac.local.json
```

```json
// config/rbac.local.json
{
  "version": "1.0",
  "claimPath": "roles",
  "roleMappings": {
    "admin": { "permissions": ["*"] },
    "dev": { "permissions": ["nodes:*", "orchestration:*"] }
  }
}
```

### Example 2: Remote URI (Production)

```bash
# .env
MIMIR_ENABLE_RBAC=true
MIMIR_RBAC_CONFIG=https://config.company.com/mimir/rbac.json
MIMIR_RBAC_AUTH_HEADER="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Example 3: Inline JSON (Kubernetes)

```yaml
# kubernetes/deployment.yaml
apiVersion: v1
kind: Secret
metadata:
  name: mimir-rbac
type: Opaque
stringData:
  MIMIR_RBAC_CONFIG: |
    {
      "version": "1.0",
      "claimPath": "groups",
      "roleMappings": {
        "engineering": {"permissions": ["nodes:*", "orchestration:*"]},
        "data-science": {"permissions": ["nodes:read", "search:execute", "chat:use"]},
        "viewers": {"permissions": ["nodes:read"]}
      }
    }
```

## Best Practices

### Security

1. **Don't commit secrets**: Add custom configs to `.gitignore`
   ```bash
   # .gitignore already includes:
   config/rbac.local.json
   config/rbac.*.json
   ```

2. **Use environment-specific configs**:
   - Dev: `./config/rbac.local.json`
   - Staging: Remote URI with auth
   - Prod: Remote URI with auth or Kubernetes Secret

3. **Rotate auth tokens**: Update `MIMIR_RBAC_AUTH_HEADER` regularly

### Performance

1. **Config is cached**: Loaded once at startup, no runtime overhead
2. **Restart to reload**: Changes require server restart
3. **Use local files for speed**: Remote URIs add startup latency

### Maintenance

1. **Version your configs**: Use git for local files, versioned URLs for remote
2. **Test before deploying**: Validate JSON syntax and permissions
3. **Document custom roles**: Add descriptions to help team understand permissions

## Troubleshooting

### Config not loading

**Symptoms**: Server uses default config instead of your custom one

**Solutions**:
1. Check `MIMIR_RBAC_CONFIG` is set: `echo $MIMIR_RBAC_CONFIG`
2. Verify file exists: `ls -la ./config/rbac.local.json`
3. Check server logs for errors: Look for `❌ Error loading RBAC config`
4. Validate JSON syntax: `cat config/rbac.local.json | jq .`

### Remote config fails to load

**Symptoms**: `❌ Error loading RBAC config: HTTP 401/403/404`

**Solutions**:
1. Test URL manually: `curl -H "Authorization: Bearer TOKEN" https://...`
2. Check `MIMIR_RBAC_AUTH_HEADER` is set correctly
3. Verify network access from server to config URL
4. Check server logs for detailed error message

### Permissions not working

**Symptoms**: Users get 403 Forbidden unexpectedly

**Solutions**:
1. Check user's roles: Look at `/auth/status` response
2. Verify role exists in config: `cat config/rbac.json | jq '.roleMappings'`
3. Check permission format: Must be `resource:action` or wildcard
4. Test with admin role: If admin works, it's a permission issue

## See Also

- [Development Authentication](./DEV_AUTHENTICATION.md) - Local dev users with roles
- [Authentication Provider Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) - OAuth/OIDC setup
- [Security Quick Start](./SECURITY_QUICK_START.md) - Complete security setup

