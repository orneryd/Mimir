[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/file-isolation

# orchestrator/file-isolation

## Classes

### FileIsolationManager

Defined in: src/orchestrator/file-isolation.ts:63

Sandboxed filesystem for testing agents safely

Provides multiple isolation strategies to prevent agents from accidentally
modifying the repository during testing:

**Isolation Modes:**
- **virtual**: All operations in-memory, nothing touches disk
- **restricted**: Only allow operations in whitelisted directories
- **readonly**: Allow reads, block all writes/deletes
- **disabled**: No restrictions (use with caution)

All operations are logged for analysis and debugging.

#### Example

```ts
// Virtual mode - safest for testing
const isolation = new FileIsolationManager('virtual');
await isolation.writeFile('/test.txt', 'content');
// File stored in memory, not on disk

// Restricted mode - limit to specific directories
const isolation = new FileIsolationManager('restricted', ['/tmp/agent-test']);
await isolation.writeFile('/tmp/agent-test/file.txt', 'ok'); // Allowed
await isolation.writeFile('/etc/passwd', 'bad'); // Blocked

// Get operation log
const summary = isolation.getSummary();
console.log(`Blocked operations: ${summary.blocked}`);
```

#### Constructors

##### Constructor

> **new FileIsolationManager**(`mode`, `allowedDirs`): [`FileIsolationManager`](#fileisolationmanager)

Defined in: src/orchestrator/file-isolation.ts:75

###### Parameters

###### mode

[`IsolationMode`](#isolationmode) = `'virtual'`

###### allowedDirs

`string`[] = `[]`

###### Returns

[`FileIsolationManager`](#fileisolationmanager)

#### Methods

##### readFile()

> **readFile**(`filepath`): `Promise`\<`string`\>

Defined in: src/orchestrator/file-isolation.ts:190

Read file with isolation enforcement

In virtual mode, checks in-memory filesystem first, then falls back to real FS.
In restricted/readonly modes, enforces access controls.

###### Parameters

###### filepath

`string`

Path to file to read

###### Returns

`Promise`\<`string`\>

File content as string

###### Throws

Error if path is blocked or file doesn't exist

###### Example

```ts
const isolation = new FileIsolationManager('virtual');

// Read from virtual FS
await isolation.writeFile('/test.txt', 'hello');
const content = await isolation.readFile('/test.txt');
console.log(content); // 'hello'

// Blocked patterns are rejected
try {
  await isolation.readFile('/node_modules/package/index.js');
} catch (error) {
  console.log(error.message); // 'File read blocked: ...'
}
```

##### writeFile()

> **writeFile**(`filepath`, `content`): `Promise`\<`void`\>

Defined in: src/orchestrator/file-isolation.ts:244

Write file with isolation enforcement

In virtual mode, stores in memory. In restricted mode, checks whitelist.
In readonly mode, blocks all writes.

###### Parameters

###### filepath

`string`

Path to file to write

###### content

`string`

Content to write

###### Returns

`Promise`\<`void`\>

###### Throws

Error if write is blocked by isolation mode

###### Example

```ts
// Virtual mode - safe testing
const isolation = new FileIsolationManager('virtual');
await isolation.writeFile('/output.txt', 'result');
// Stored in memory, not on disk

// Readonly mode - blocks writes
const readonly = new FileIsolationManager('readonly');
try {
  await readonly.writeFile('/test.txt', 'data');
} catch (error) {
  console.log(error.message); // 'File write blocked: Readonly mode...'
}
```

##### deleteFile()

> **deleteFile**(`filepath`): `Promise`\<`void`\>

Defined in: src/orchestrator/file-isolation.ts:277

Delete file (respects isolation mode)

###### Parameters

###### filepath

`string`

###### Returns

`Promise`\<`void`\>

##### getOperations()

> **getOperations**(): `FileOperation`[]

Defined in: src/orchestrator/file-isolation.ts:304

Get operations log

###### Returns

`FileOperation`[]

##### getSummary()

> **getSummary**(): `object`

Defined in: src/orchestrator/file-isolation.ts:332

Get summary statistics of all file operations

###### Returns

`object`

Object with operation counts and statistics

###### totalOperations

> **totalOperations**: `number`

###### reads

> **reads**: `number`

###### writes

> **writes**: `number`

###### deletes

> **deletes**: `number`

###### blocked

> **blocked**: `number`

###### virtualFiles

> **virtualFiles**: `number`

###### Example

```ts
const isolation = new FileIsolationManager('virtual');
await isolation.writeFile('/test1.txt', 'a');
await isolation.writeFile('/test2.txt', 'b');
await isolation.readFile('/test1.txt');

const summary = isolation.getSummary();
console.log(summary);
// {
//   totalOperations: 3,
//   reads: 1,
//   writes: 2,
//   deletes: 0,
//   blocked: 0,
//   virtualFiles: 2
// }
```

##### generateOperationsLog()

> **generateOperationsLog**(): `string`

Defined in: src/orchestrator/file-isolation.ts:379

Generate detailed operations log in Markdown format

Creates a comprehensive report including:
- Operation summary statistics
- Timeline of all operations
- List of virtual files in memory
- List of blocked operations

###### Returns

`string`

Markdown-formatted log string

###### Example

```ts
const isolation = new FileIsolationManager('restricted', ['/tmp/test']);
await isolation.writeFile('/tmp/test/ok.txt', 'allowed');
try {
  await isolation.writeFile('/etc/passwd', 'blocked');
} catch {}

const log = isolation.generateOperationsLog();
console.log(log);
// # File Operations Log
// **Mode:** restricted
// **Total Operations:** 2
// - Writes: 2
// - Blocked: 1
// ...
```

##### getVirtualFile()

> **getVirtualFile**(`filepath`): `VirtualFile` \| `undefined`

Defined in: src/orchestrator/file-isolation.ts:430

Get virtual file content

###### Parameters

###### filepath

`string`

###### Returns

`VirtualFile` \| `undefined`

##### exportVirtualFiles()

> **exportVirtualFiles**(): `Record`\<`string`, `string`\>

Defined in: src/orchestrator/file-isolation.ts:453

Export all virtual files as JSON object

###### Returns

`Record`\<`string`, `string`\>

Object mapping file paths to their content

###### Example

```ts
const isolation = new FileIsolationManager('virtual');
await isolation.writeFile('/test1.txt', 'content1');
await isolation.writeFile('/test2.txt', 'content2');

const files = isolation.exportVirtualFiles();
console.log(files);
// {
//   '/test1.txt': 'content1',
//   '/test2.txt': 'content2'
// }
```

##### saveVirtualFiles()

> **saveVirtualFiles**(`outputDir`): `Promise`\<`void`\>

Defined in: src/orchestrator/file-isolation.ts:482

Save all virtual files to disk after testing

Writes all in-memory files to the specified output directory,
preserving the relative path structure.

###### Parameters

###### outputDir

`string`

Directory to save files to

###### Returns

`Promise`\<`void`\>

###### Example

```ts
const isolation = new FileIsolationManager('virtual');
await isolation.writeFile('/workspace/output.txt', 'result');
await isolation.writeFile('/workspace/data.json', '{"key": "value"}');

// After testing, save to disk
await isolation.saveVirtualFiles('/tmp/test-results');
// Creates:
// /tmp/test-results/workspace/output.txt
// /tmp/test-results/workspace/data.json
```

##### reset()

> **reset**(): `void`

Defined in: src/orchestrator/file-isolation.ts:505

Clear all virtual files and operation logs

Resets the isolation manager to a clean state for the next test.

###### Returns

`void`

###### Example

```ts
const isolation = new FileIsolationManager('virtual');
await isolation.writeFile('/test.txt', 'data');
console.log(isolation.getSummary().virtualFiles); // 1

isolation.reset();
console.log(isolation.getSummary().virtualFiles); // 0
```

## Type Aliases

### IsolationMode

> **IsolationMode** = `"virtual"` \| `"restricted"` \| `"readonly"` \| `"disabled"`

Defined in: src/orchestrator/file-isolation.ts:13

## Functions

### createFileIsolation()

> **createFileIsolation**(`mode`, `allowedDirs?`): [`FileIsolationManager`](#fileisolationmanager)

Defined in: src/orchestrator/file-isolation.ts:535

Create isolated filesystem manager for agent testing

Factory function to create a FileIsolationManager with the specified mode.

#### Parameters

##### mode

[`IsolationMode`](#isolationmode) = `'virtual'`

Isolation mode (virtual, restricted, readonly, disabled)

##### allowedDirs?

`string`[]

Optional array of allowed directories (for restricted mode)

#### Returns

[`FileIsolationManager`](#fileisolationmanager)

Configured FileIsolationManager instance

#### Example

```ts
// Virtual mode for safe testing
const isolation = createFileIsolation('virtual');

// Restricted mode with whitelist
const restricted = createFileIsolation('restricted', [
  '/tmp/agent-sandbox',
  '/workspace/output'
]);

// Readonly mode for analysis
const readonly = createFileIsolation('readonly');
```
