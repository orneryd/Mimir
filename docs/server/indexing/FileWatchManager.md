[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / indexing/FileWatchManager

# indexing/FileWatchManager

## Classes

### FileWatchManager

Defined in: src/indexing/FileWatchManager.ts:26

#### Constructors

##### Constructor

> **new FileWatchManager**(`driver`): [`FileWatchManager`](#filewatchmanager)

Defined in: src/indexing/FileWatchManager.ts:39

###### Parameters

###### driver

`Driver`

###### Returns

[`FileWatchManager`](#filewatchmanager)

#### Methods

##### onProgress()

> **onProgress**(`callback`): () => `void`

Defined in: src/indexing/FileWatchManager.ts:87

Register a callback for real-time progress updates during file indexing

Subscribe to indexing progress events to display real-time status in UI.
Returns an unsubscribe function to clean up when done.

###### Parameters

###### callback

(`progress`) => `void`

Function called with progress updates

###### Returns

Unsubscribe function to remove the callback

> (): `void`

###### Returns

`void`

###### Examples

```ts
// Display progress in console
const unsubscribe = fileWatchManager.onProgress((progress) => {
  console.log(`${progress.path}: ${progress.indexed}/${progress.totalFiles} files`);
  console.log(`Status: ${progress.status}`);
});
// Later: unsubscribe();
```

```ts
// Update UI progress bar
const unsubscribe = fileWatchManager.onProgress((progress) => {
  if (progress.totalFiles > 0) {
    const percent = (progress.indexed / progress.totalFiles) * 100;
    updateProgressBar(progress.path, percent);
  }
  if (progress.status === 'completed') {
    showNotification(`Indexing complete: ${progress.path}`);
    unsubscribe();
  }
});
```

```ts
// Server-Sent Events (SSE) streaming
app.get('/api/indexing/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  const unsubscribe = fileWatchManager.onProgress((progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  });
  req.on('close', unsubscribe);
});
```

##### getProgress()

> **getProgress**(`path`): `IndexingProgress` \| `undefined`

Defined in: src/indexing/FileWatchManager.ts:149

Get current indexing progress for a specific folder

Returns progress information including file counts, status, and timing.
Returns undefined if folder is not being indexed or has no tracked progress.

###### Parameters

###### path

`string`

Folder path to check

###### Returns

`IndexingProgress` \| `undefined`

Progress object or undefined if not found

###### Examples

```ts
// Check if indexing is complete
const progress = fileWatchManager.getProgress('/workspace/src');
if (progress && progress.status === 'completed') {
  console.log(`Indexed ${progress.indexed} files in ${progress.path}`);
  console.log(`Skipped: ${progress.skipped}, Errors: ${progress.errored}`);
}
```

```ts
// Calculate indexing duration
const progress = fileWatchManager.getProgress('/workspace/docs');
if (progress && progress.startTime && progress.endTime) {
  const durationSec = (progress.endTime - progress.startTime) / 1000;
  console.log(`Indexing took ${durationSec.toFixed(1)} seconds`);
}
```

```ts
// Poll for completion
const checkProgress = setInterval(() => {
  const progress = fileWatchManager.getProgress('/workspace/api');
  if (progress?.status === 'completed' || progress?.status === 'error') {
    clearInterval(checkProgress);
    console.log('Indexing finished:', progress.status);
  }
}, 1000);
```

##### getAllProgress()

> **getAllProgress**(): `IndexingProgress`[]

Defined in: src/indexing/FileWatchManager.ts:187

Get progress for all folders currently being indexed or recently completed

Returns array of progress objects for all tracked indexing operations.
Useful for dashboard views showing multiple concurrent indexing jobs.

###### Returns

`IndexingProgress`[]

Array of progress objects for all tracked folders

###### Examples

```ts
// Display all active indexing jobs
const allProgress = fileWatchManager.getAllProgress();
console.log(`Active indexing jobs: ${allProgress.length}`);
for (const progress of allProgress) {
  console.log(`${progress.path}: ${progress.status}`);
}
```

```ts
// Calculate total indexing statistics
const allProgress = fileWatchManager.getAllProgress();
const stats = allProgress.reduce((acc, p) => ({
  totalFiles: acc.totalFiles + p.totalFiles,
  indexed: acc.indexed + p.indexed,
  skipped: acc.skipped + p.skipped,
  errored: acc.errored + p.errored
}), { totalFiles: 0, indexed: 0, skipped: 0, errored: 0 });
console.log('Total stats:', stats);
```

```ts
// Filter by status
const allProgress = fileWatchManager.getAllProgress();
const active = allProgress.filter(p => p.status === 'indexing');
const completed = allProgress.filter(p => p.status === 'completed');
console.log(`Active: ${active.length}, Completed: ${completed.length}`);
```

##### startWatch()

> **startWatch**(`config`): `Promise`\<`void`\>

Defined in: src/indexing/FileWatchManager.ts:270

Start indexing a folder with automatic file watching

Begins indexing all files in the specified folder according to the config.
Respects .gitignore patterns and custom ignore rules. Supports recursive
directory traversal and file pattern filtering. Indexing runs with
concurrency control to avoid overwhelming the system.

###### Parameters

###### config

[`WatchConfig`](../types/watchConfig.types.md#watchconfig)

Watch configuration with path, patterns, and options

###### Returns

`Promise`\<`void`\>

Promise that resolves when indexing is queued (not completed)

###### Examples

```ts
// Index a source code directory
await fileWatchManager.startWatch({
  path: '/workspace/src',
  recursive: true,
  file_patterns: ['*.ts', '*.tsx', '*.js', '*.jsx'],
  ignore_patterns: ['node_modules/**', 'dist/**', '*.test.ts']
});
console.log('Indexing started for /workspace/src');
```

```ts
// Index documentation with progress tracking
const unsubscribe = fileWatchManager.onProgress((progress) => {
  console.log(`Progress: ${progress.indexed}/${progress.totalFiles}`);
});
await fileWatchManager.startWatch({
  path: '/workspace/docs',
  recursive: true,
  file_patterns: ['*.md', '*.mdx'],
  ignore_patterns: ['node_modules/**']
});
```

```ts
// Index specific file types only
await fileWatchManager.startWatch({
  path: '/workspace/config',
  recursive: false,
  file_patterns: ['*.json', '*.yaml', '*.yml'],
  ignore_patterns: []
});
```

##### abortIndexing()

> **abortIndexing**(`path`): `boolean`

Defined in: src/indexing/FileWatchManager.ts:421

Abort active indexing operation for a folder

Sends abort signal to stop indexing immediately. Does not wait for
completion. Returns true if abort signal was sent, false if no
active indexing was found.

###### Parameters

###### path

`string`

Folder path to abort indexing for

###### Returns

`boolean`

True if abort signal sent, false if not indexing

###### Examples

```ts
// Cancel indexing if taking too long
setTimeout(() => {
  const aborted = fileWatchManager.abortIndexing('/workspace/large-repo');
  if (aborted) {
    console.log('Indexing cancelled due to timeout');
  }
}, 60000); // 1 minute timeout
```

```ts
// User-initiated cancellation
app.post('/api/indexing/cancel', async (req, res) => {
  const { path } = req.body;
  const aborted = fileWatchManager.abortIndexing(path);
  res.json({ 
    success: aborted,
    message: aborted ? 'Indexing cancelled' : 'No active indexing found'
  });
});
```

```ts
// Cancel all active indexing
const allProgress = fileWatchManager.getAllProgress();
const activeIndexing = allProgress.filter(p => p.status === 'indexing');
for (const progress of activeIndexing) {
  fileWatchManager.abortIndexing(progress.path);
}
console.log(`Cancelled ${activeIndexing.length} indexing operations`);
```

##### isIndexing()

> **isIndexing**(`path`): `boolean`

Defined in: src/indexing/FileWatchManager.ts:470

Check if a folder is currently being actively indexed

Returns true if indexing is in progress, false otherwise.
Does not include queued or completed indexing operations.

###### Parameters

###### path

`string`

Folder path to check

###### Returns

`boolean`

True if currently indexing, false otherwise

###### Examples

```ts
// Wait for indexing to complete
while (fileWatchManager.isIndexing('/workspace/src')) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Still indexing...');
}
console.log('Indexing complete!');
```

```ts
// Prevent duplicate indexing
if (fileWatchManager.isIndexing('/workspace/docs')) {
  console.log('Already indexing this folder');
} else {
  await fileWatchManager.startWatch({
    path: '/workspace/docs',
    recursive: true,
    file_patterns: ['*.md'],
    ignore_patterns: []
  });
}
```

```ts
// API endpoint to check status
app.get('/api/indexing/status/:path', (req, res) => {
  const isActive = fileWatchManager.isIndexing(req.params.path);
  const progress = fileWatchManager.getProgress(req.params.path);
  res.json({ isIndexing: isActive, progress });
});
```

##### stopWatch()

> **stopWatch**(`path`): `Promise`\<`void`\>

Defined in: src/indexing/FileWatchManager.ts:506

Stop watching and indexing a folder

Stops any active indexing for the folder and removes it from the watch list.
If indexing is in progress, sends abort signal and waits for graceful shutdown.
Safe to call even if folder is not being watched.

###### Parameters

###### path

`string`

Folder path to stop watching

###### Returns

`Promise`\<`void`\>

Promise that resolves when watching has stopped

###### Examples

```ts
// Stop watching a folder
await fileWatchManager.stopWatch('/workspace/src');
console.log('Stopped watching /workspace/src');
```

```ts
// Stop all active watches
const allProgress = fileWatchManager.getAllProgress();
for (const progress of allProgress) {
  await fileWatchManager.stopWatch(progress.path);
}
console.log('All watches stopped');
```

```ts
// Stop with error handling
try {
  await fileWatchManager.stopWatch('/workspace/docs');
  console.log('Successfully stopped watching');
} catch (error) {
  console.error('Failed to stop watch:', error);
}
```

##### indexFolder()

> **indexFolder**(`folderPath`, `config`, `signal?`): `Promise`\<`number`\>

Defined in: src/indexing/FileWatchManager.ts:547

Index all files in a folder (one-time operation)

###### Parameters

###### folderPath

`string`

###### config

[`WatchConfig`](../types/watchConfig.types.md#watchconfig)

###### signal?

`AbortSignal`

###### Returns

`Promise`\<`number`\>

##### getActiveWatchers()

> **getActiveWatchers**(): `string`[]

Defined in: src/indexing/FileWatchManager.ts:745

Get active watchers

###### Returns

`string`[]

##### closeAll()

> **closeAll**(): `Promise`\<`void`\>

Defined in: src/indexing/FileWatchManager.ts:752

Close all watchers

###### Returns

`Promise`\<`void`\>
