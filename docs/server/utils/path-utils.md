[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / utils/path-utils

# utils/path-utils

## Fileoverview

Cross-platform path utilities for workspace path translation

Handles path normalization between host systems (Windows/Mac/Linux) and
Docker container paths. Supports:
- Tilde (~) expansion to home directory
- Relative paths (../, ./)
- Windows drive letters (C:\, D:\)
- Unix absolute paths (/home/user)
- Consistent forward-slash normalization

## Since

1.0.0

## Functions

### normalizeSlashes()

> **normalizeSlashes**(`filepath`): `string`

Defined in: src/utils/path-utils.ts:38

Normalize path slashes to forward slashes

#### Parameters

##### filepath

`string`

#### Returns

`string`

#### Example

```ts
normalizeSlashes('C:\\Users\\file') // => 'C:/Users/file'
```

***

### expandTilde()

> **expandTilde**(`filepath`): `string`

Defined in: src/utils/path-utils.ts:60

Expand tilde to home directory

#### Parameters

##### filepath

`string`

#### Returns

`string`

#### Example

```ts
expandTilde('~/src/project') // => '/Users/john/src/project'
```

***

### normalizeAndResolve()

> **normalizeAndResolve**(`filepath`, `basePath?`): `string`

Defined in: src/utils/path-utils.ts:100

Normalize and resolve path

#### Parameters

##### filepath

`string`

##### basePath?

`string`

#### Returns

`string`

#### Example

```ts
normalizeAndResolve('~/project') // => '/Users/john/project'
```

***

### isRunningInDocker()

> **isRunningInDocker**(): `boolean`

Defined in: src/utils/path-utils.ts:168

Check if running in Docker container

#### Returns

`boolean`

#### Example

```ts
if (isRunningInDocker()) console.log('In Docker');
```

***

### getHostWorkspaceRoot()

> **getHostWorkspaceRoot**(): `string`

Defined in: src/utils/path-utils.ts:195

Get host workspace root path

#### Returns

`string`

#### Example

```ts
const root = getHostWorkspaceRoot(); // => '/Users/john/src'
```

***

### translateHostToContainer()

> **translateHostToContainer**(`hostPath`): `string`

Defined in: src/utils/path-utils.ts:286

Translate host path to container path

#### Parameters

##### hostPath

`string`

#### Returns

`string`

#### Example

```ts
translateHostToContainer('/Users/john/src/project') // => '/workspace/project'
```

***

### translateContainerToHost()

> **translateContainerToHost**(`containerPath`): `string`

Defined in: src/utils/path-utils.ts:422

Translate container path to host path

#### Parameters

##### containerPath

`string`

#### Returns

`string`

#### Example

```ts
translateContainerToHost('/workspace/project') // => '/Users/john/src/project'
```

***

### pathExists()

> **pathExists**(`filepath`): `Promise`\<`boolean`\>

Defined in: src/utils/path-utils.ts:462

Validate that a path exists on the filesystem

#### Parameters

##### filepath

`string`

Path to validate

#### Returns

`Promise`\<`boolean`\>

true if path exists, false otherwise

***

### validateAndSanitizePath()

> **validateAndSanitizePath**(`userPath`, `allowRelative`): `string`

Defined in: src/utils/path-utils.ts:496

Validate and sanitize user-provided path

#### Parameters

##### userPath

`string`

##### allowRelative

`boolean` = `true`

#### Returns

`string`

#### Example

```ts
validateAndSanitizePath('~/project') // => '/Users/john/project'
```
