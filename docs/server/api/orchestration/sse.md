[**mimir v1.0.0**](../../README.md)

***

[mimir](../../README.md) / api/orchestration/sse

# api/orchestration/sse

## Fileoverview

Server-Sent Events (SSE) management for real-time execution updates

This module provides SSE functionality for streaming real-time execution progress
to connected frontend clients. Supports event broadcasting, client management,
and graceful error handling for disconnected clients.

## Since

1.0.0

## Functions

### sendSSEEvent()

> **sendSSEEvent**(`executionId`, `event`, `data`): `void`

Defined in: src/api/orchestration/sse.ts:60

Send Server-Sent Events (SSE) to all connected clients for a specific execution

Broadcasts real-time execution progress events to connected frontend clients
using the SSE protocol. Handles client write failures gracefully to prevent
one failed client from affecting others.

#### Parameters

##### executionId

`string`

Unique identifier for the execution session

##### event

`string`

Event type name (e.g., 'task-start', 'task-complete', 'execution-complete')

##### data

`any`

Payload data to send to clients (will be JSON stringified)

#### Returns

`void`

#### Examples

```ts
// Example 1: Notify clients that task execution started
sendSSEEvent('exec-1234567890', 'task-start', {
  taskId: 'task-1',
  taskTitle: 'Validate Environment',
  progress: 1,
  total: 5
});
```

```ts
// Example 2: Send task completion with results
sendSSEEvent('exec-1234567890', 'task-complete', {
  taskId: 'task-2',
  status: 'success',
  duration: 15000,
  progress: 2,
  total: 5
});
```

```ts
// Example 3: Notify all clients of execution completion
sendSSEEvent('exec-1234567890', 'execution-complete', {
  executionId: 'exec-1234567890',
  status: 'completed',
  successful: 5,
  failed: 0,
  totalDuration: 120000
});
```

#### Since

1.0.0

***

### registerSSEClient()

> **registerSSEClient**(`executionId`, `responseStream`): `void`

Defined in: src/api/orchestration/sse.ts:99

Register a new SSE client for an execution

Adds a response stream to the list of clients receiving real-time updates
for a specific execution. Multiple clients can be registered for the same
execution ID.

#### Parameters

##### executionId

`string`

Unique identifier for the execution session

##### responseStream

`any`

Express response object configured for SSE streaming

#### Returns

`void`

#### Example

```ts
// Example: Register client when they connect to SSE endpoint
app.get('/api/executions/:executionId/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  registerSSEClient(req.params.executionId, res);
  
  req.on('close', () => {
    unregisterSSEClient(req.params.executionId, res);
  });
});
```

#### Since

1.0.0

***

### unregisterSSEClient()

> **unregisterSSEClient**(`executionId`, `responseStream`): `void`

Defined in: src/api/orchestration/sse.ts:124

Unregister an SSE client from an execution

Removes a response stream from the list of clients for an execution.
Automatically cleans up empty client lists to prevent memory leaks.

#### Parameters

##### executionId

`string`

Unique identifier for the execution session

##### responseStream

`any`

Express response object to remove

#### Returns

`void`

#### Example

```ts
// Example: Unregister client when they disconnect
req.on('close', () => {
  unregisterSSEClient(executionId, res);
  console.log('Client disconnected from SSE stream');
});
```

#### Since

1.0.0

***

### getSSEClientCount()

> **getSSEClientCount**(`executionId`): `number`

Defined in: src/api/orchestration/sse.ts:152

Get count of connected SSE clients for an execution

#### Parameters

##### executionId

`string`

Unique identifier for the execution session

#### Returns

`number`

Number of active SSE client connections

#### Example

```ts
// Example: Check if any clients are listening
const clientCount = getSSEClientCount('exec-1234567890');
if (clientCount > 0) {
  sendSSEEvent('exec-1234567890', 'status-update', { message: 'Processing...' });
}
```

#### Since

1.0.0

***

### closeSSEConnections()

> **closeSSEConnections**(`executionId`): `void`

Defined in: src/api/orchestration/sse.ts:176

Close all SSE connections for an execution

Ends all active SSE streams for an execution and removes them from the registry.
Use this when an execution completes to clean up resources and notify clients.

#### Parameters

##### executionId

`string`

Unique identifier for the execution session

#### Returns

`void`

#### Example

```ts
// Example: Close all connections when execution completes
try {
  sendSSEEvent(executionId, 'execution-complete', { status: 'completed' });
  await new Promise(resolve => setTimeout(resolve, 100)); // Let final events flush
  closeSSEConnections(executionId);
} catch (error) {
  console.error('Error closing SSE connections:', error);
}
```

#### Since

1.0.0
