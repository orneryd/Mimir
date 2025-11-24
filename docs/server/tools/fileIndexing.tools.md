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

Defined in: src/tools/fileIndexing.tools.ts:111

Handle index_folder tool call - now combines watch and index
Returns immediately while indexing happens in the background

#### Parameters

##### params

`any`

##### driver

`Driver`

##### watchManager

[`FileWatchManager`](../indexing/FileWatchManager.md#filewatchmanager)

##### configManager?

[`WatchConfigManager`](../indexing/WatchConfigManager.md#watchconfigmanager)

#### Returns

`Promise`\<[`IndexFolderResponse`](../types/watchConfig.types.md#indexfolderresponse)\>

***

### handleRemoveFolder()

> **handleRemoveFolder**(`params`, `driver`, `watchManager`, `configManager?`): `Promise`\<`any`\>

Defined in: src/tools/fileIndexing.tools.ts:213

Handle remove_folder tool call (renamed from unwatch_folder)

#### Parameters

##### params

`any`

##### driver

`Driver`

##### watchManager

[`FileWatchManager`](../indexing/FileWatchManager.md#filewatchmanager)

##### configManager?

[`WatchConfigManager`](../indexing/WatchConfigManager.md#watchconfigmanager)

#### Returns

`Promise`\<`any`\>

***

### handleListWatchedFolders()

> **handleListWatchedFolders**(`driver`, `configManager?`): `Promise`\<[`ListWatchedFoldersResponse`](../types/watchConfig.types.md#listwatchedfoldersresponse)\>

Defined in: src/tools/fileIndexing.tools.ts:294

Handle list_folders tool call

#### Parameters

##### driver

`Driver`

##### configManager?

[`WatchConfigManager`](../indexing/WatchConfigManager.md#watchconfigmanager)

#### Returns

`Promise`\<[`ListWatchedFoldersResponse`](../types/watchConfig.types.md#listwatchedfoldersresponse)\>
