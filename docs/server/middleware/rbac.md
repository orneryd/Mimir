[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / middleware/rbac

# middleware/rbac

## Functions

### getUserPermissions()

> **getUserPermissions**(`user`): `Set`\<`string`\>

Defined in: src/middleware/rbac.ts:33

Get all permissions for a user based on their roles

Extracts user roles from the configured claim path and aggregates
all permissions from the RBAC configuration. Supports default role
fallback if no roles are found.

#### Parameters

##### user

`any`

User object from authentication (req.user)

#### Returns

`Set`\<`string`\>

Set of permission strings (e.g., 'nodes:read', 'search:execute')

#### Examples

```ts
// Get permissions for authenticated user
const permissions = getUserPermissions(req.user);
console.log('User has', permissions.size, 'permissions');
```

```ts
// Check specific permission
const permissions = getUserPermissions(req.user);
if (permissions.has('nodes:write')) {
  console.log('User can write nodes');
}
```

```ts
// List all user permissions
const permissions = getUserPermissions(req.user);
permissions.forEach(perm => console.log('  -', perm));
```

***

### hasPermission()

> **hasPermission**(`userPermissions`, `requiredPermission`): `boolean`

Defined in: src/middleware/rbac.ts:101

Check if user has a specific permission

Supports wildcard matching for flexible permission checks:
- `*` matches all permissions (admin)
- `nodes:*` matches all node permissions (`nodes:read`, `nodes:write`, etc.)
- Exact match: `nodes:read` only matches `nodes:read`

#### Parameters

##### userPermissions

`Set`\<`string`\>

Set of user's permissions from getUserPermissions()

##### requiredPermission

`string`

Permission to check (e.g., 'nodes:write')

#### Returns

`boolean`

true if user has the permission, false otherwise

#### Examples

```ts
// Check specific permission
const permissions = getUserPermissions(req.user);
if (hasPermission(permissions, 'nodes:delete')) {
  // User can delete nodes
  await deleteNode(nodeId);
}
```

```ts
// Admin check (wildcard '*')
const permissions = getUserPermissions(req.user);
if (hasPermission(permissions, 'admin:panel')) {
  // Will pass if user has '*' permission
  console.log('User is admin');
}
```

```ts
// Namespace wildcard check
const permissions = new Set(['nodes:*']);
console.log(hasPermission(permissions, 'nodes:read'));   // true
console.log(hasPermission(permissions, 'nodes:write'));  // true
console.log(hasPermission(permissions, 'search:execute')); // false
```

***

### requirePermission()

> **requirePermission**(`permission`): (`req`, `res`, `next`) => `void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>

Defined in: src/middleware/rbac.ts:164

Express middleware to require a specific permission

Checks if the authenticated user has the required permission.
Returns 401 if not authenticated, 403 if permission denied.
Automatically skipped if RBAC is disabled via env var.

#### Parameters

##### permission

`string`

Required permission string (e.g., 'nodes:write')

#### Returns

Express middleware function

> (`req`, `res`, `next`): `void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>

##### Parameters

###### req

`Request`

###### res

`Response`

###### next

`NextFunction`

##### Returns

`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>

#### Examples

```ts
// Protect single endpoint
router.post('/api/nodes',
  requirePermission('nodes:write'),
  async (req, res) => {
    // Only users with 'nodes:write' can access
    const node = await createNode(req.body);
    res.json(node);
  }
);
```

```ts
// Protect multiple endpoints
router.delete('/api/nodes/:id',
  requirePermission('nodes:delete'),
  deleteNodeHandler
);

router.get('/api/admin/stats',
  requirePermission('admin:stats'),
  getStatsHandler
);
```

```ts
// Chain with other middleware
router.put('/api/nodes/:id',
  authenticate,
  requirePermission('nodes:write'),
  validateNodeData,
  updateNodeHandler
);
```

***

### requireAnyPermission()

> **requireAnyPermission**(`permissions`): (`req`, `res`, `next`) => `void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>

Defined in: src/middleware/rbac.ts:200

Middleware to require ANY of the specified permissions
Usage: app.get('/api/data', requireAnyPermission(['nodes:read', 'files:read']), handler)

#### Parameters

##### permissions

`string`[]

#### Returns

> (`req`, `res`, `next`): `void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>

##### Parameters

###### req

`Request`

###### res

`Response`

###### next

`NextFunction`

##### Returns

`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>

***

### requireAllPermissions()

> **requireAllPermissions**(`permissions`): (`req`, `res`, `next`) => `void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>

Defined in: src/middleware/rbac.ts:238

Middleware to require ALL of the specified permissions
Usage: app.post('/api/admin', requireAllPermissions(['admin:read', 'admin:write']), handler)

#### Parameters

##### permissions

`string`[]

#### Returns

> (`req`, `res`, `next`): `void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>

##### Parameters

###### req

`Request`

###### res

`Response`

###### next

`NextFunction`

##### Returns

`void` \| `Response`\<`any`, `Record`\<`string`, `any`\>\>
