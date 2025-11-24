[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / indexing/WatchConfigManager

# indexing/WatchConfigManager

## Classes

### WatchConfigManager

Defined in: src/indexing/WatchConfigManager.ts:9

#### Constructors

##### Constructor

> **new WatchConfigManager**(`driver`): [`WatchConfigManager`](#watchconfigmanager)

Defined in: src/indexing/WatchConfigManager.ts:10

###### Parameters

###### driver

`Driver`

###### Returns

[`WatchConfigManager`](#watchconfigmanager)

#### Methods

##### createWatch()

> **createWatch**(`input`): `Promise`\<[`WatchConfig`](../types/watchConfig.types.md#watchconfig)\>

Defined in: src/indexing/WatchConfigManager.ts:31

Create a new watch configuration in Neo4j

Stores watch configuration for file monitoring with indexing settings.
Used by FileWatchManager to persist watch state across restarts.

###### Parameters

###### input

[`WatchConfigInput`](../types/watchConfig.types.md#watchconfiginput)

Watch configuration parameters

###### Returns

`Promise`\<[`WatchConfig`](../types/watchConfig.types.md#watchconfig)\>

Created watch configuration with generated ID

###### Example

```ts
const manager = new WatchConfigManager(driver);
const config = await manager.createWatch({
  path: '/Users/user/project/src',
  host_path: '/Users/user/project/src',
  recursive: true,
  generate_embeddings: true
});
console.log('Created watch:', config.id);
```

##### getByPath()

> **getByPath**(`path`): `Promise`\<[`WatchConfig`](../types/watchConfig.types.md#watchconfig) \| `null`\>

Defined in: src/indexing/WatchConfigManager.ts:88

Get active watch configuration by path

###### Parameters

###### path

`string`

Directory path being watched

###### Returns

`Promise`\<[`WatchConfig`](../types/watchConfig.types.md#watchconfig) \| `null`\>

Watch configuration or null if not found

###### Example

```ts
const config = await manager.getByPath('/Users/user/project/src');
if (config) {
  console.log('Watch status:', config.status);
  console.log('Files indexed:', config.files_indexed);
}
```

##### getById()

> **getById**(`id`): `Promise`\<[`WatchConfig`](../types/watchConfig.types.md#watchconfig) \| `null`\>

Defined in: src/indexing/WatchConfigManager.ts:118

Get watch configuration by ID

###### Parameters

###### id

`string`

Watch configuration ID

###### Returns

`Promise`\<[`WatchConfig`](../types/watchConfig.types.md#watchconfig) \| `null`\>

Watch configuration or null if not found

###### Example

```ts
const config = await manager.getById('watch-1234-abcd');
```

##### listAll()

> **listAll**(): `Promise`\<[`WatchConfig`](../types/watchConfig.types.md#watchconfig)[]\>

Defined in: src/indexing/WatchConfigManager.ts:150

List all watch configurations (active and inactive)

###### Returns

`Promise`\<[`WatchConfig`](../types/watchConfig.types.md#watchconfig)[]\>

Array of all watch configurations, sorted by status and date

###### Example

```ts
const configs = await manager.listAll();
console.log('Total watches:', configs.length);
const active = configs.filter(c => c.status === 'active');
console.log('Active:', active.length);
```

##### reactivate()

> **reactivate**(`id`): `Promise`\<`void`\>

Defined in: src/indexing/WatchConfigManager.ts:185

Reactivate an inactive watch configuration

###### Parameters

###### id

`string`

Watch configuration ID to reactivate

###### Returns

`Promise`\<`void`\>

###### Throws

If watch configuration not found

###### Example

```ts
await manager.reactivate('watch-1234-abcd');
console.log('Watch reactivated');
```

##### updateStats()

> **updateStats**(`id`, `filesIndexed`): `Promise`\<`void`\>

Defined in: src/indexing/WatchConfigManager.ts:217

Update watch statistics after indexing

###### Parameters

###### id

`string`

Watch configuration ID

###### filesIndexed

`number`

Total number of files indexed

###### Returns

`Promise`\<`void`\>

###### Example

```ts
await manager.updateStats('watch-1234-abcd', 150);
```

##### markInactive()

> **markInactive**(`id`, `error?`): `Promise`\<`void`\>

Defined in: src/indexing/WatchConfigManager.ts:243

Mark watch as inactive with optional error

###### Parameters

###### id

`string`

Watch configuration ID

###### error?

`string`

Optional error message

###### Returns

`Promise`\<`void`\>

###### Example

```ts
await manager.markInactive('watch-1234-abcd', 'Directory not found');
```

##### delete()

> **delete**(`id`): `Promise`\<`void`\>

Defined in: src/indexing/WatchConfigManager.ts:269

Delete watch configuration from database

###### Parameters

###### id

`string`

Watch configuration ID to delete

###### Returns

`Promise`\<`void`\>

###### Example

```ts
await manager.delete('watch-1234-abcd');
console.log('Watch configuration deleted');
```
