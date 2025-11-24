[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / tools/fileIndexing.tools

# tools/fileIndexing.tools

## Functions

### createFileIndexingTools()

> **createFileIndexingTools**(`driver`, `watchManager`): `object`[]

Defined in: src/tools/fileIndexing.tools.ts:25

#### Parameters

##### driver

`Driver`

##### watchManager

[`FileWatchManager`](../indexing/FileWatchManager.md#filewatchmanager)

#### Returns

`object`[]

***

### handleIndexFolder()

> **handleIndexFolder**(`params`, `driver`, `watchManager`, `configManager?`): `Promise`\<[`IndexFolderResponse`](../types/watchConfig.types.md#indexfolderresponse)\>

Defined in: src/tools/fileIndexing.tools.ts:166

Handle index_folder tool call - Index files and start watching for changes

#### Parameters

##### params

`any`

Indexing parameters

##### driver

`Driver`

Neo4j driver instance

##### watchManager

[`FileWatchManager`](../indexing/FileWatchManager.md#filewatchmanager)

File watch manager instance

##### configManager?

[`WatchConfigManager`](../indexing/WatchConfigManager.md#watchconfigmanager)

Watch config manager (optional, for testing)

#### Returns

`Promise`\<[`IndexFolderResponse`](../types/watchConfig.types.md#indexfolderresponse)\>

Promise with indexing status and metadata

#### Description

Indexes all files in a directory into Neo4j and automatically
starts watching for file changes. Files are parsed, content extracted, and
optionally embedded with vector embeddings for semantic search. Respects
.gitignore patterns and supports custom file/ignore patterns.

Returns immediately while indexing happens asynchronously in the background.
Check logs or use list_folders to monitor progress.

#### Examples

```typescript
// Index a TypeScript project
const result = await handleIndexFolder({
  path: '/workspace/src/my-app',
  recursive: true,
  file_patterns: ['*.ts', '*.tsx'],
  ignore_patterns: ['*.test.ts', '*.spec.ts'],
  generate_embeddings: true
}, driver, watchManager);
// Returns: { status: 'success', path: '...', message: 'Indexing started...' }
```

```typescript
// Index documentation files only
const result = await handleIndexFolder({
  path: '/workspace/docs',
  file_patterns: ['*.md', '*.mdx'],
  generate_embeddings: true
}, driver, watchManager);
```

```typescript
// Index without embeddings (faster, no semantic search)
const result = await handleIndexFolder({
  path: '/workspace/config',
  file_patterns: ['*.json', '*.yaml'],
  generate_embeddings: false
}, driver, watchManager);
```

#### Throws

If path is invalid or doesn't exist

***

### handleRemoveFolder()

> **handleRemoveFolder**(`params`, `driver`, `watchManager`, `configManager?`): `Promise`\<`any`\>

Defined in: src/tools/fileIndexing.tools.ts:299

Handle remove_folder tool call - Stop watching and remove indexed files

#### Parameters

##### params

`any`

Removal parameters

##### driver

`Driver`

Neo4j driver instance

##### watchManager

[`FileWatchManager`](../indexing/FileWatchManager.md#filewatchmanager)

File watch manager instance

##### configManager?

[`WatchConfigManager`](../indexing/WatchConfigManager.md#watchconfigmanager)

Watch config manager (optional, for testing)

#### Returns

`Promise`\<`any`\>

Promise with removal status and count of deleted files

#### Description

Stops watching a directory for changes and removes all indexed
files from the Neo4j database. This includes File nodes and their associated
FileChunk nodes. Use this to clean up when you no longer need a folder indexed.

#### Examples

```typescript
// Remove a folder from indexing
const result = await handleRemoveFolder({
  path: '/workspace/old-project'
}, driver, watchManager);
// Returns: { status: 'success', files_deleted: 42, chunks_deleted: 156 }
```

```typescript
// Remove temporary files
const result = await handleRemoveFolder({
  path: '/workspace/temp'
}, driver, watchManager);
```

#### Throws

If path is invalid or not being watched

***

### handleListWatchedFolders()

> **handleListWatchedFolders**(`driver`, `configManager?`): `Promise`\<[`ListWatchedFoldersResponse`](../types/watchConfig.types.md#listwatchedfoldersresponse)\>

Defined in: src/tools/fileIndexing.tools.ts:414

Handle list_folders tool call - List all watched folders

#### Parameters

##### driver

`Driver`

Neo4j driver instance

##### configManager?

[`WatchConfigManager`](../indexing/WatchConfigManager.md#watchconfigmanager)

Watch config manager (optional, for testing)

#### Returns

`Promise`\<[`ListWatchedFoldersResponse`](../types/watchConfig.types.md#listwatchedfoldersresponse)\>

Promise with list of watched folders and their configurations

#### Description

Returns a list of all folders currently being watched for file
changes, along with their configuration (patterns, recursive, embeddings, etc.).
Useful for checking what's being indexed and monitoring indexing progress.

#### Examples

```typescript
// List all watched folders
const result = await handleListWatchedFolders(driver);
// Returns: {
//   status: 'success',
//   folders: [
//     {
//       path: '/workspace/src',
//       recursive: true,
//       file_patterns: ['*.ts', '*.tsx'],
//       generate_embeddings: true
//     },
//     ...
//   ]
// }
```

```typescript
// Check if a specific folder is being watched
const result = await handleListWatchedFolders(driver);
const isWatched = result.folders.some(f => f.path === '/workspace/src');
```
