[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / indexing/GitignoreHandler

# indexing/GitignoreHandler

## Classes

### GitignoreHandler

Defined in: src/indexing/GitignoreHandler.ts:9

#### Constructors

##### Constructor

> **new GitignoreHandler**(): [`GitignoreHandler`](#gitignorehandler)

Defined in: src/indexing/GitignoreHandler.ts:12

###### Returns

[`GitignoreHandler`](#gitignorehandler)

#### Methods

##### loadIgnoreFile()

> **loadIgnoreFile**(`folderPath`): `Promise`\<`void`\>

Defined in: src/indexing/GitignoreHandler.ts:53

Load .gitignore file from a folder and add patterns to ignore list

Reads the .gitignore file from the specified folder and adds all patterns
to the ignore matcher. If the file doesn't exist, silently continues with
default patterns. Handles both standard gitignore syntax and comments.

###### Parameters

###### folderPath

`string`

Absolute path to folder containing .gitignore

###### Returns

`Promise`\<`void`\>

###### Examples

```ts
// Load .gitignore from project root
const handler = new GitignoreHandler();
await handler.loadIgnoreFile('/Users/user/my-project');
console.log('Loaded .gitignore patterns');
```

```ts
// Load from nested directory
const handler = new GitignoreHandler();
await handler.loadIgnoreFile('/Users/user/my-project/packages/api');
// Patterns from this .gitignore are added to defaults
```

```ts
// Handle missing .gitignore gracefully
const handler = new GitignoreHandler();
await handler.loadIgnoreFile('/Users/user/new-project');
// No error thrown - uses default patterns only
```

##### addPatterns()

> **addPatterns**(`patterns`): `void`

Defined in: src/indexing/GitignoreHandler.ts:100

Add custom ignore patterns to the ignore list

Adds additional patterns to ignore beyond .gitignore and defaults.
Useful for programmatically excluding specific files or directories.
Supports standard gitignore pattern syntax including wildcards.

###### Parameters

###### patterns

`string`[]

Array of gitignore-style patterns to add

###### Returns

`void`

###### Examples

```ts
// Add custom patterns for temporary files
const handler = new GitignoreHandler();
handler.addPatterns([
  '*.tmp',
  '*.bak',
  'temp/',
  '.cache/'
]);
```

```ts
// Exclude specific directories
handler.addPatterns([
  'coverage/',
  'test-results/',
  '.vscode/'
]);
```

```ts
// Add patterns from configuration
const config = { ignorePatterns: ['*.secret', 'private/'] };
handler.addPatterns(config.ignorePatterns);
```

##### shouldIgnore()

> **shouldIgnore**(`filePath`, `rootPath`): `boolean`

Defined in: src/indexing/GitignoreHandler.ts:150

Check if a file path should be ignored based on patterns

Tests whether a file path matches any ignore patterns from .gitignore,
defaults, or custom patterns. Uses relative path from root for matching.

###### Parameters

###### filePath

`string`

Absolute path to file to check

###### rootPath

`string`

Absolute path to root directory

###### Returns

`boolean`

true if file should be ignored, false otherwise

###### Examples

```ts
// Check if file should be ignored
const handler = new GitignoreHandler();
await handler.loadIgnoreFile('/Users/user/project');

const shouldSkip = handler.shouldIgnore(
  '/Users/user/project/node_modules/package/index.js',
  '/Users/user/project'
);
console.log('Skip file:', shouldSkip); // true
```

```ts
// Filter files during directory traversal
const files = await readdir('/Users/user/project');
for (const file of files) {
  const fullPath = path.join('/Users/user/project', file);
  if (handler.shouldIgnore(fullPath, '/Users/user/project')) {
    console.log('Skipping:', file);
    continue;
  }
  await processFile(fullPath);
}
```

```ts
// Check multiple files
const filesToCheck = [
  '/Users/user/project/src/index.ts',
  '/Users/user/project/dist/bundle.js',
  '/Users/user/project/.env'
];

filesToCheck.forEach(file => {
  const ignored = handler.shouldIgnore(file, '/Users/user/project');
  console.log(file, ignored ? 'IGNORED' : 'OK');
});
```

##### filterPaths()

> **filterPaths**(`filePaths`, `rootPath`): `string`[]

Defined in: src/indexing/GitignoreHandler.ts:204

Filter an array of file paths, removing ignored files

Convenience method to filter a list of file paths, keeping only files
that should not be ignored. Useful for batch processing of file lists.

###### Parameters

###### filePaths

`string`[]

Array of absolute file paths to filter

###### rootPath

`string`

Absolute path to root directory

###### Returns

`string`[]

Array of file paths that should not be ignored

###### Examples

```ts
// Filter file list from directory scan
const handler = new GitignoreHandler();
await handler.loadIgnoreFile('/Users/user/project');

const allFiles = [
  '/Users/user/project/src/index.ts',
  '/Users/user/project/node_modules/lib.js',
  '/Users/user/project/dist/bundle.js',
  '/Users/user/project/README.md'
];

const validFiles = handler.filterPaths(allFiles, '/Users/user/project');
console.log('Files to process:', validFiles.length);
// Output: ['/Users/user/project/src/index.ts', '/Users/user/project/README.md']
```

```ts
// Use with glob results
const globFiles = await glob('/Users/user/project/src/*.ts');
const filtered = handler.filterPaths(globFiles, '/Users/user/project');
console.log('TypeScript files to index:', filtered.length);
```

```ts
// Chain with other filters
const allFiles = await getAllFiles('/Users/user/project');
const validFiles = handler.filterPaths(allFiles, '/Users/user/project')
  .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
  .filter(f => f.indexOf('.test.') === -1);

console.log('Final file count:', validFiles.length);
```
