[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / config/rbac-config

# config/rbac-config

## Interfaces

### RBACConfig

Defined in: src/config/rbac-config.ts:4

#### Properties

##### version

> **version**: `string`

Defined in: src/config/rbac-config.ts:5

##### claimPath

> **claimPath**: `string`

Defined in: src/config/rbac-config.ts:6

##### roleMappings

> **roleMappings**: `object`

Defined in: src/config/rbac-config.ts:7

###### Index Signature

\[`roleName`: `string`\]: `object`

##### defaultRole?

> `optional` **defaultRole**: `string`

Defined in: src/config/rbac-config.ts:13

## Functions

### getDefaultConfig()

> **getDefaultConfig**(): [`RBACConfig`](#rbacconfig)

Defined in: src/config/rbac-config.ts:104

Get default RBAC configuration with standard roles

Provides a sensible default configuration with three roles:
- **admin**: Full system access (wildcard permissions)
- **developer**: Read/write access for development work
- **viewer**: Read-only access

#### Returns

[`RBACConfig`](#rbacconfig)

Default RBAC configuration object

#### Example

```ts
const config = getDefaultConfig();
console.log(config.roleMappings.admin.permissions); // ['*']
console.log(config.defaultRole); // 'viewer'
```

***

### initRBACConfig()

> **initRBACConfig**(): `Promise`\<[`RBACConfig`](#rbacconfig)\>

Defined in: src/config/rbac-config.ts:194

Initialize RBAC configuration asynchronously

**IMPORTANT**: Call this at server startup before using RBAC middleware.

Supports three configuration sources (in order of precedence):
1. **Inline JSON**: Set MIMIR_RBAC_CONFIG to JSON string
2. **Remote URI**: Set MIMIR_RBAC_CONFIG to HTTP/HTTPS URL
3. **Local file**: Set MIMIR_RBAC_CONFIG to file path (default: ./config/rbac.json)

Configuration is cached after first successful load. If loading fails,
falls back to default configuration.

#### Returns

`Promise`\<[`RBACConfig`](#rbacconfig)\>

Promise resolving to loaded or default RBAC configuration

#### Example

```ts
// At server startup
const config = await initRBACConfig();
console.log('RBAC initialized:', config.version);

// Then use synchronous getter in middleware
app.use((req, res, next) => {
  const config = getRBACConfig(); // Fast, synchronous
  // ... check permissions
});
```

***

### getRBACConfig()

> **getRBACConfig**(): [`RBACConfig`](#rbacconfig)

Defined in: src/config/rbac-config.ts:296

Get RBAC configuration synchronously

**IMPORTANT**: Call `await initRBACConfig()` at server startup first
if using remote configuration sources.

Returns cached configuration if available. For remote configs, this
requires prior initialization with `initRBACConfig()`.

#### Returns

[`RBACConfig`](#rbacconfig)

RBAC configuration (cached, default, or synchronously loaded)

#### Example

```ts
// In middleware (after initRBACConfig() at startup)
function checkPermission(req, res, next) {
  const config = getRBACConfig();
  const userRoles = req.user.roles;
  
  const permissions = userRoles.flatMap(role => 
    config.roleMappings[role]?.permissions || []
  );
  
  if (permissions.includes('*') || permissions.includes('nodes:write')) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
}
```

***

### clearConfigCache()

> **clearConfigCache**(): `void`

Defined in: src/config/rbac-config.ts:364

#### Returns

`void`

***

### getConfigStatus()

> **getConfigStatus**(): `object`

Defined in: src/config/rbac-config.ts:392

Get RBAC configuration loading status for diagnostics

Useful for health checks and debugging configuration issues.

#### Returns

`object`

Status object with loading state, errors, and source information

##### loaded

> **loaded**: `boolean`

##### loading

> **loading**: `boolean`

##### error

> **error**: `Error` \| `null`

##### source

> **source**: `string`

##### usingDefault

> **usingDefault**: `boolean`

#### Example

```ts
// Health check endpoint
app.get('/health/rbac', (req, res) => {
  const status = getConfigStatus();
  res.json({
    loaded: status.loaded,
    loading: status.loading,
    error: status.error?.message,
    source: status.source,
    usingDefault: status.usingDefault
  });
});
```
