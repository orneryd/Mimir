[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / utils/data-retention

# utils/data-retention

## Interfaces

### DataRetentionConfig

Defined in: src/utils/data-retention.ts:7

Data Retention Configuration
Default: Forever (no automatic deletion)

#### Properties

##### enabled

> **enabled**: `boolean`

Defined in: src/utils/data-retention.ts:8

##### defaultDays

> **defaultDays**: `number`

Defined in: src/utils/data-retention.ts:9

##### nodeTypePolicies

> **nodeTypePolicies**: `Record`\<`string`, `number`\>

Defined in: src/utils/data-retention.ts:10

##### auditDays

> **auditDays**: `number`

Defined in: src/utils/data-retention.ts:11

##### runIntervalMs

> **runIntervalMs**: `number`

Defined in: src/utils/data-retention.ts:12

## Functions

### loadDataRetentionConfig()

> **loadDataRetentionConfig**(): [`DataRetentionConfig`](#dataretentionconfig)

Defined in: src/utils/data-retention.ts:47

Load data retention configuration from environment variables

Configures automatic cleanup of old data based on retention policies.
By default, data is kept forever (retention = 0 days).

**Environment Variables:**
- `MIMIR_DATA_RETENTION_ENABLED`: Enable/disable retention (default: false)
- `MIMIR_DATA_RETENTION_DEFAULT_DAYS`: Default retention in days (0 = forever)
- `MIMIR_DATA_RETENTION_POLICIES`: JSON object with per-type policies
- `MIMIR_DATA_RETENTION_AUDIT_DAYS`: Audit log retention (0 = forever)
- `MIMIR_DATA_RETENTION_INTERVAL_MS`: Cleanup interval in ms (default: 24h)

#### Returns

[`DataRetentionConfig`](#dataretentionconfig)

Data retention configuration object

#### Example

```ts
// Enable retention with 30-day default
process.env.MIMIR_DATA_RETENTION_ENABLED = 'true';
process.env.MIMIR_DATA_RETENTION_DEFAULT_DAYS = '30';

// Custom policies per node type
process.env.MIMIR_DATA_RETENTION_POLICIES = JSON.stringify({
  'Session': 7,      // Delete sessions after 7 days
  'TempFile': 1,     // Delete temp files after 1 day
  'Project': 0       // Keep projects forever
});

const config = loadDataRetentionConfig();
console.log(config.defaultDays); // 30
```

***

### runDataRetentionCleanup()

> **runDataRetentionCleanup**(`driver`, `config`): `Promise`\<`void`\>

Defined in: src/utils/data-retention.ts:115

Run data retention cleanup to delete expired nodes

Scans all node types in the database and deletes nodes that exceed
their retention period. Uses `createdAt` timestamp to determine age.

**Process:**
1. Discover all node types (labels) in database
2. For each type, check retention policy
3. Delete nodes older than retention period
4. Log deletion statistics

Nodes without a `createdAt` property are not deleted (assumed permanent).

#### Parameters

##### driver

`Driver`

Neo4j driver instance

##### config

[`DataRetentionConfig`](#dataretentionconfig)

Data retention configuration

#### Returns

`Promise`\<`void`\>

Promise that resolves when cleanup is complete

#### Example

```ts
const driver = neo4j.driver('bolt://localhost:7687');
const config = loadDataRetentionConfig();

// Run cleanup manually
await runDataRetentionCleanup(driver, config);
// Output: [Data Retention] Deleted 15 Session nodes older than 7 days

// Cleanup respects per-type policies
// Session nodes: 7 days
// TempFile nodes: 1 day
// Project nodes: forever (0 days = never deleted)
```

***

### startDataRetentionScheduler()

> **startDataRetentionScheduler**(`driver`, `config`): `Timeout` \| `null`

Defined in: src/utils/data-retention.ts:214

Start automatic data retention cleanup scheduler

Runs cleanup immediately on start, then schedules recurring cleanup
at the configured interval. Returns a timer that can be stopped later.

If retention is disabled, returns null and does nothing.

#### Parameters

##### driver

`Driver`

Neo4j driver instance

##### config

[`DataRetentionConfig`](#dataretentionconfig)

Data retention configuration

#### Returns

`Timeout` \| `null`

Timer handle for stopping scheduler, or null if disabled

#### Example

```ts
const driver = neo4j.driver('bolt://localhost:7687');
const config = loadDataRetentionConfig();

// Start scheduler (runs every 24 hours by default)
const timer = startDataRetentionScheduler(driver, config);
// Output: [Data Retention] Scheduler started
//         Default retention: 30 days
//         Run interval: 1440 minutes

// Stop scheduler on shutdown
process.on('SIGTERM', () => {
  stopDataRetentionScheduler(timer);
  driver.close();
});
```

***

### stopDataRetentionScheduler()

> **stopDataRetentionScheduler**(`timer`): `void`

Defined in: src/utils/data-retention.ts:257

Stop the data retention cleanup scheduler

Clears the interval timer to stop automatic cleanup.
Safe to call with null timer (no-op).

#### Parameters

##### timer

Timer handle from startDataRetentionScheduler()

`Timeout` | `null`

#### Returns

`void`

#### Example

```ts
const timer = startDataRetentionScheduler(driver, config);

// Later, stop the scheduler
stopDataRetentionScheduler(timer);
// Output: [Data Retention] Scheduler stopped
```
