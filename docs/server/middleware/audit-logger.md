[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / middleware/audit-logger

# middleware/audit-logger

## Interfaces

### AuditEvent

Defined in: src/middleware/audit-logger.ts:9

Audit Event Structure (Generic, Not Domain-Specific)

#### Properties

##### timestamp

> **timestamp**: `string`

Defined in: src/middleware/audit-logger.ts:10

##### userId

> **userId**: `string` \| `null`

Defined in: src/middleware/audit-logger.ts:11

##### action

> **action**: `string`

Defined in: src/middleware/audit-logger.ts:12

##### resource

> **resource**: `string`

Defined in: src/middleware/audit-logger.ts:13

##### method

> **method**: `string`

Defined in: src/middleware/audit-logger.ts:14

##### outcome

> **outcome**: `"success"` \| `"failure"`

Defined in: src/middleware/audit-logger.ts:15

##### statusCode

> **statusCode**: `number`

Defined in: src/middleware/audit-logger.ts:16

##### metadata

> **metadata**: `object`

Defined in: src/middleware/audit-logger.ts:17

###### Index Signature

\[`key`: `string`\]: `any`

###### ipAddress

> **ipAddress**: `string`

###### userAgent?

> `optional` **userAgent**: `string`

###### duration?

> `optional` **duration**: `number`

###### errorMessage?

> `optional` **errorMessage**: `string`

***

### AuditLoggerConfig

Defined in: src/middleware/audit-logger.ts:29

Audit Logger Configuration

#### Properties

##### enabled

> **enabled**: `boolean`

Defined in: src/middleware/audit-logger.ts:30

##### destination

> **destination**: `"file"` \| `"all"` \| `"stdout"` \| `"webhook"`

Defined in: src/middleware/audit-logger.ts:31

##### format

> **format**: `"text"` \| `"json"`

Defined in: src/middleware/audit-logger.ts:32

##### level

> **level**: `"error"` \| `"debug"` \| `"info"` \| `"warn"`

Defined in: src/middleware/audit-logger.ts:33

##### filePath?

> `optional` **filePath**: `string`

Defined in: src/middleware/audit-logger.ts:34

##### webhookUrl?

> `optional` **webhookUrl**: `string`

Defined in: src/middleware/audit-logger.ts:35

##### webhookAuthHeader?

> `optional` **webhookAuthHeader**: `string`

Defined in: src/middleware/audit-logger.ts:36

##### batchSize?

> `optional` **batchSize**: `number`

Defined in: src/middleware/audit-logger.ts:37

##### batchIntervalMs?

> `optional` **batchIntervalMs**: `number`

Defined in: src/middleware/audit-logger.ts:38

## Functions

### loadAuditLoggerConfig()

> **loadAuditLoggerConfig**(): [`AuditLoggerConfig`](#auditloggerconfig)

Defined in: src/middleware/audit-logger.ts:71

Load audit logger configuration from environment variables

Reads audit logging settings from environment and returns a configuration
object with defaults for any missing values.

**Environment Variables**:
- `MIMIR_ENABLE_AUDIT_LOGGING`: Enable/disable audit logging (default: false)
- `MIMIR_AUDIT_LOG_DESTINATION`: Where to send logs (stdout/file/webhook/all)
- `MIMIR_AUDIT_LOG_FORMAT`: Log format (json/text)
- `MIMIR_AUDIT_LOG_LEVEL`: Log level (info/debug/warn/error)
- `MIMIR_AUDIT_LOG_FILE`: File path for file destination
- `MIMIR_AUDIT_WEBHOOK_URL`: Webhook URL for webhook destination
- `MIMIR_AUDIT_WEBHOOK_AUTH_HEADER`: Authorization header for webhook
- `MIMIR_AUDIT_WEBHOOK_BATCH_SIZE`: Batch size for webhook (default: 100)
- `MIMIR_AUDIT_WEBHOOK_BATCH_INTERVAL_MS`: Batch interval (default: 5000ms)

#### Returns

[`AuditLoggerConfig`](#auditloggerconfig)

Audit logger configuration object

#### Examples

```ts
// Load configuration
const config = loadAuditLoggerConfig();
console.log('Audit logging enabled:', config.enabled);
console.log('Destination:', config.destination);
```

```ts
// Use with middleware
const config = loadAuditLoggerConfig();
app.use(auditLogger(config));
```

***

### writeAuditEvent()

> **writeAuditEvent**(`event`, `config`): `void`

Defined in: src/middleware/audit-logger.ts:177

Write audit event to configured destinations

Sends audit events to one or more destinations based on configuration:
- **stdout**: Logs to console
- **file**: Appends to log file
- **webhook**: Queues for batch HTTP POST
- **all**: Sends to all destinations

Webhook events are batched for efficiency and sent when batch size
is reached or after the configured interval.

#### Parameters

##### event

[`AuditEvent`](#auditevent)

Audit event to write

##### config

[`AuditLoggerConfig`](#auditloggerconfig)

Audit logger configuration

#### Returns

`void`

#### Examples

```ts
// Write single event
const event: AuditEvent = {
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  action: 'write',
  resource: '/api/nodes',
  method: 'POST',
  outcome: 'success',
  statusCode: 201,
  metadata: { ipAddress: '192.168.1.1' }
};

const config = loadAuditLoggerConfig();
writeAuditEvent(event, config);
```

```ts
// Custom event with error
const failureEvent: AuditEvent = {
  timestamp: new Date().toISOString(),
  userId: null,
  action: 'delete',
  resource: '/api/nodes/123',
  method: 'DELETE',
  outcome: 'failure',
  statusCode: 403,
  metadata: {
    ipAddress: '10.0.0.1',
    errorMessage: 'Permission denied'
  }
};
writeAuditEvent(failureEvent, config);
```

***

### auditLogger()

> **auditLogger**(`config`): (`req`, `res`, `next`) => `void`

Defined in: src/middleware/audit-logger.ts:302

Express middleware for automatic audit logging

Intercepts all HTTP requests and logs them as audit events.
Captures request details, user information, timing, and outcomes.

**Automatically Logs**:
- User ID (from req.user)
- HTTP method and path
- Response status code
- Request duration
- IP address and user agent
- Error messages for failures

**Skipped Routes**:
- `/health` endpoint (to avoid log spam)

#### Parameters

##### config

[`AuditLoggerConfig`](#auditloggerconfig)

Audit logger configuration

#### Returns

Express middleware function

> (`req`, `res`, `next`): `void`

##### Parameters

###### req

`Request`

###### res

`Response`

###### next

`NextFunction`

##### Returns

`void`

#### Examples

```ts
// Basic usage
import { loadAuditLoggerConfig, auditLogger } from './middleware/audit-logger.js';

const config = loadAuditLoggerConfig();
app.use(auditLogger(config));
```

```ts
// With custom configuration
const config: AuditLoggerConfig = {
  enabled: true,
  destination: 'file',
  format: 'json',
  level: 'info',
  filePath: '/var/log/mimir/audit.log'
};
app.use(auditLogger(config));
```

```ts
// Webhook destination
const config: AuditLoggerConfig = {
  enabled: true,
  destination: 'webhook',
  format: 'json',
  level: 'info',
  webhookUrl: 'https://logs.example.com/audit',
  webhookAuthHeader: 'Bearer secret-token',
  batchSize: 50,
  batchIntervalMs: 10000
};
app.use(auditLogger(config));
```

***

### shutdownAuditLogger()

> **shutdownAuditLogger**(`config`): `Promise`\<`void`\>

Defined in: src/middleware/audit-logger.ts:387

Shutdown handler - flush remaining webhook events

Ensures all queued audit events are sent before application shutdown.
Should be called during graceful shutdown to prevent data loss.

#### Parameters

##### config

[`AuditLoggerConfig`](#auditloggerconfig)

Audit logger configuration

#### Returns

`Promise`\<`void`\>

#### Examples

```ts
// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  const config = loadAuditLoggerConfig();
  await shutdownAuditLogger(config);
  process.exit(0);
});
```

```ts
// With server cleanup
async function shutdown() {
  await server.close();
  await shutdownAuditLogger(auditConfig);
  await database.disconnect();
  console.log('Cleanup complete');
}
```
