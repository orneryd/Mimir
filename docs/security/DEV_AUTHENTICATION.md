# Development Authentication

This guide explains how to configure development authentication for local testing, including multiple users with different roles for RBAC testing.

## Overview

When `MIMIR_ENABLE_SECURITY=true`, Mimir supports local username/password authentication for development and testing. This allows you to test authentication and RBAC features without connecting to an external OAuth provider.

## Single User (Legacy)

The simplest way to enable dev authentication is with a single user:

```bash
# .env
MIMIR_ENABLE_SECURITY=true
MIMIR_DEV_USERNAME=admin
MIMIR_DEV_PASSWORD=admin
```

This creates a single user with the `admin` role.

## Multiple Users for RBAC Testing (Recommended)

To test RBAC with different roles, you can configure multiple dev users using the `MIMIR_DEV_USER_*` pattern:

```bash
# .env
MIMIR_ENABLE_SECURITY=true
MIMIR_ENABLE_RBAC=true

# Format: MIMIR_DEV_USER_<NAME>=username:password:role1,role2,role3
MIMIR_DEV_USER_ADMIN=admin:admin:admin,developer,analyst
MIMIR_DEV_USER_DEVELOPER=dev:dev:developer
MIMIR_DEV_USER_ANALYST=analyst:analyst:analyst
MIMIR_DEV_USER_VIEWER=viewer:viewer:viewer
```

### Format

Each dev user is defined with the pattern:

```
MIMIR_DEV_USER_<NAME>=<username>:<password>:<roles>
```

- **`<NAME>`**: Unique identifier (e.g., `ADMIN`, `DEVELOPER`, `VIEWER`)
- **`<username>`**: Login username
- **`<password>`**: Login password
- **`<roles>`**: Comma-separated list of roles (e.g., `admin,developer`)

### Example Users

| Username | Password | Roles | Use Case |
|----------|----------|-------|----------|
| `admin` | `admin` | `admin`, `developer`, `analyst` | Full access admin user |
| `dev` | `dev` | `developer` | Developer with code access |
| `analyst` | `analyst` | `analyst` | Analyst with read-only access |
| `viewer` | `viewer` | `viewer` | Minimal read-only access |

## Default Roles

Mimir includes these default roles in the RBAC configuration:

- **`admin`**: Full system access, can manage users and configuration
- **`developer`**: Can create/modify code, run workflows, access tools
- **`analyst`**: Can view data, run queries, generate reports
- **`viewer`**: Read-only access to public resources

See `config/rbac.json` for the complete role definitions and permissions.

## Login UI

When dev users are configured, the login page will display a username/password form:

1. Visit `http://localhost:3000/login`
2. Enter one of the configured usernames and passwords
3. Click "Sign in"

The UI will show "Development Mode" to indicate you're using local authentication.

## Testing RBAC

To test RBAC with different roles:

1. **Enable RBAC**: Set `MIMIR_ENABLE_RBAC=true` in `.env`
2. **Configure dev users**: Add multiple `MIMIR_DEV_USER_*` entries with different roles
3. **Restart server**: `npm run start:http`
4. **Test each user**:
   - Log in as `admin:admin` - should have full access
   - Log out and log in as `viewer:viewer` - should have limited access
   - Try accessing restricted endpoints - should get 403 Forbidden

## Session Management

Dev authentication uses session cookies:

- **Session duration**: 24 hours (configurable via `MIMIR_JWT_SECRET`)
- **Logout**: POST to `/auth/logout` or close browser
- **Session storage**: In-memory (sessions lost on server restart)

For production, use Redis session store (see `docs/security/AUTHENTICATION_PROVIDER_INTEGRATION.md`).

## Security Notes

⚠️ **Development Only**: Dev authentication is for local testing only. Never use in production!

- Passwords are stored in plain text in environment variables
- No password hashing or encryption
- No rate limiting on login attempts
- Sessions stored in memory (not persistent)

For production deployments, use OAuth/OIDC with your identity provider (Okta, Auth0, Azure AD, etc.).

## Troubleshooting

### Login page shows OAuth button instead of username/password

**Cause**: Server hasn't detected dev users in environment variables.

**Solution**:
1. Check `.env` file has `MIMIR_DEV_USER_*` entries
2. Restart server: `npm run start:http`
3. Check server logs for: `[Auth] Dev user registered: <username> with roles [...]`

### "Invalid credentials" error

**Cause**: Username/password doesn't match any configured dev user.

**Solution**:
1. Check `.env` file for correct username/password
2. Verify format: `MIMIR_DEV_USER_NAME=username:password:roles`
3. Restart server after changing `.env`

### Can't access protected routes after login

**Cause**: RBAC is enabled but user lacks required permissions.

**Solution**:
1. Check user's roles: Look at server logs when logging in
2. Check RBAC config: `config/rbac.json`
3. Add required roles to user or update RBAC config

## Next Steps

- [RBAC Configuration](./RBAC_DESIGN.md) - Configure roles and permissions
- [OAuth Integration](./AUTHENTICATION_PROVIDER_INTEGRATION.md) - Set up production OAuth
- [Security Quick Start](./SECURITY_QUICK_START.md) - Complete security setup guide
