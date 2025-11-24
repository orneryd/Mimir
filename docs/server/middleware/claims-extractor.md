[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / middleware/claims-extractor

# middleware/claims-extractor

## Functions

### extractClaims()

> **extractClaims**(`user`, `claimPath`): `string`[]

Defined in: src/middleware/claims-extractor.ts:47

Extract claims from user object using dot notation path

Supports nested paths and handles various claim formats from different
identity providers. Automatically converts non-string values and extracts
from common object patterns.

**Supported Formats**:
- Arrays of strings: `["admin", "user"]`
- Single string: `"admin"`
- Numbers/booleans: Converted to strings with warning
- Objects: Extracts `name`, `value`, or `id` fields

**Nested Paths**: Use dot notation for nested claims:
- `"roles"` → `user.roles`
- `"custom.roles"` → `user.custom.roles`
- `"app_metadata.permissions"` → `user.app_metadata.permissions`

#### Parameters

##### user

`any`

User object from Passport (typically contains JWT claims)

##### claimPath

`string`

Dot-separated path to claims

#### Returns

`string`[]

Array of claim values as strings

#### Examples

```ts
// Simple array of roles
const user = { roles: ['admin', 'editor'] };
const claims = extractClaims(user, 'roles');
console.log(claims); // ['admin', 'editor']
```

```ts
// Nested path
const user = { custom: { permissions: ['read', 'write'] } };
const claims = extractClaims(user, 'custom.permissions');
console.log(claims); // ['read', 'write']
```

```ts
// Object array with name field
const user = {
  groups: [
    { name: 'developers', id: 123 },
    { name: 'admins', id: 456 }
  ]
};
const claims = extractClaims(user, 'groups');
console.log(claims); // ['developers', 'admins']
```

***

### extractRolesWithDefault()

> **extractRolesWithDefault**(`user`, `claimPath`, `defaultRole?`): `string`[]

Defined in: src/middleware/claims-extractor.ts:206

Extract roles from user and add default role if none found

Convenience wrapper around extractClaims() that provides a fallback
default role when no roles are found in the user object. Useful for
ensuring all users have at least one role for RBAC.

#### Parameters

##### user

`any`

User object from Passport

##### claimPath

`string`

Path to roles in user object (dot notation)

##### defaultRole?

`string`

Default role to assign if no roles found

#### Returns

`string`[]

Array of roles (includes default if no roles extracted)

#### Examples

```ts
// User with roles
const user = { roles: ['admin'] };
const roles = extractRolesWithDefault(user, 'roles', 'viewer');
console.log(roles); // ['admin']
```

```ts
// User without roles - gets default
const user = { email: 'user@example.com' };
const roles = extractRolesWithDefault(user, 'roles', 'viewer');
console.log(roles); // ['viewer']
```

```ts
// No default role specified
const user = {};
const roles = extractRolesWithDefault(user, 'roles');
console.log(roles); // []
```
