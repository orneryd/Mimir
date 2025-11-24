[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / indexing/FileIndexer

# indexing/FileIndexer

## Classes

### FileIndexer

Defined in: src/indexing/FileIndexer.ts:25

#### Constructors

##### Constructor

> **new FileIndexer**(`driver`): [`FileIndexer`](#fileindexer)

Defined in: src/indexing/FileIndexer.ts:33

###### Parameters

###### driver

`Driver`

###### Returns

[`FileIndexer`](#fileindexer)

#### Methods

##### indexFile()

> **indexFile**(`filePath`, `rootPath`, `generateEmbeddings`): `Promise`\<[`IndexResult`](#indexresult)\>

Defined in: src/indexing/FileIndexer.ts:256

Index a single file into Neo4j with optional vector embeddings

Creates a File node in the graph database with metadata and content.
For large files with embeddings enabled, splits content into chunks
with individual embeddings for precise semantic search (industry standard).

Indexing Strategy:
- **Small files** (<1000 chars): Single embedding on File node
- **Large files** (>1000 chars): Multiple FileChunk nodes with embeddings
- **No embeddings**: Full content stored on File node for full-text search

Supported Formats:
- Text files (.ts, .js, .py, .md, .json, etc.)
- PDF documents (text extraction)
- DOCX documents (text extraction)
- Images (.png, .jpg, etc.) with VL description or multimodal embedding

###### Parameters

###### filePath

`string`

Absolute path to file

###### rootPath

`string`

Root directory path for calculating relative paths

###### generateEmbeddings

`boolean` = `false`

Whether to generate vector embeddings

###### Returns

`Promise`\<[`IndexResult`](#indexresult)\>

Index result with file node ID, path, size, and chunk count

###### Throws

If file is binary, non-indexable, or processing fails

###### Examples

```ts
// Index a TypeScript file without embeddings
const result = await fileIndexer.indexFile(
  '/Users/user/project/src/auth.ts',
  '/Users/user/project',
  false
);
console.log('Indexed:', result.path);
console.log('Size:', result.size_bytes, 'bytes');
// File content stored on File node for full-text search
```

```ts
// Index a large file with embeddings (chunked)
const result = await fileIndexer.indexFile(
  '/Users/user/project/docs/guide.md',
  '/Users/user/project',
  true
);
console.log('Created', result.chunks_created, 'chunks');
// Each chunk has its own embedding for precise semantic search
```

```ts
// Index a PDF document with embeddings
const result = await fileIndexer.indexFile(
  '/Users/user/project/docs/manual.pdf',
  '/Users/user/project',
  true
);
console.log('Extracted and indexed PDF:', result.path);
console.log('Chunks created:', result.chunks_created);
```

```ts
// Index an image with VL description
const result = await fileIndexer.indexFile(
  '/Users/user/project/images/diagram.png',
  '/Users/user/project',
  true
);
console.log('Image indexed with description:', result.path);
// VL model generates text description, then embeds it
```

```ts
// Handle indexing errors
try {
  await fileIndexer.indexFile(filePath, rootPath, true);
} catch (error) {
  if (error.message === 'Binary or non-indexable file') {
    console.log('Skipped binary file');
  } else {
    console.error('Indexing failed:', error.message);
  }
}
```

##### deleteFile()

> **deleteFile**(`relativePath`): `Promise`\<`void`\>

Defined in: src/indexing/FileIndexer.ts:765

Delete file node and all associated chunks from Neo4j

Removes the File node and cascades to delete all FileChunk nodes
and their relationships. Use this when files are deleted from disk
or need to be removed from the index.

###### Parameters

###### relativePath

`string`

Relative path to file (from root directory)

###### Returns

`Promise`\<`void`\>

###### Examples

```ts
// Delete a file from index when deleted from disk
await fileIndexer.deleteFile('src/auth.ts');
console.log('File removed from index');
```

```ts
// Clean up after file move/rename
await fileIndexer.deleteFile('old/path/file.ts');
await fileIndexer.indexFile('/new/path/file.ts', rootPath, true);
console.log('File re-indexed at new location');
```

```ts
// Batch delete multiple files
const deletedFiles = ['src/old1.ts', 'src/old2.ts', 'src/old3.ts'];
for (const file of deletedFiles) {
  await fileIndexer.deleteFile(file);
}
console.log('Cleaned up', deletedFiles.length, 'files');
```

##### updateFile()

> **updateFile**(`filePath`, `rootPath`): `Promise`\<`void`\>

Defined in: src/indexing/FileIndexer.ts:815

Update file content and embeddings after file modification

Re-indexes the file to update content and regenerate embeddings.
Automatically detects if file was modified and regenerates chunks
if needed. This is the recommended way to handle file changes.

###### Parameters

###### filePath

`string`

Absolute path to modified file

###### rootPath

`string`

Root directory path

###### Returns

`Promise`\<`void`\>

###### Examples

```ts
// Update file after modification
await fileIndexer.updateFile(
  '/Users/user/project/src/auth.ts',
  '/Users/user/project'
);
console.log('File content and embeddings updated');
```

```ts
// Handle file watcher events
watcher.on('change', async (filePath) => {
  console.log('File changed:', filePath);
  await fileIndexer.updateFile(filePath, rootPath);
  console.log('Index updated');
});
```

```ts
// Batch update multiple changed files
const changedFiles = await getModifiedFiles();
for (const file of changedFiles) {
  await fileIndexer.updateFile(file, rootPath);
}
console.log('Updated', changedFiles.length, 'files');
```

## Interfaces

### IndexResult

Defined in: src/indexing/FileIndexer.ts:18

#### Properties

##### file\_node\_id

> **file\_node\_id**: `string`

Defined in: src/indexing/FileIndexer.ts:19

##### path

> **path**: `string`

Defined in: src/indexing/FileIndexer.ts:20

##### size\_bytes

> **size\_bytes**: `number`

Defined in: src/indexing/FileIndexer.ts:21

##### chunks\_created?

> `optional` **chunks\_created**: `number`

Defined in: src/indexing/FileIndexer.ts:22
