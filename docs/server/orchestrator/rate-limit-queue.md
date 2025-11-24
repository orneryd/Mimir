[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/rate-limit-queue

# orchestrator/rate-limit-queue

## Classes

### RateLimitQueue

Defined in: src/orchestrator/rate-limit-queue.ts:28

#### Methods

##### getInstance()

> `static` **getInstance**(`config?`, `instanceKey?`): [`RateLimitQueue`](#ratelimitqueue)

Defined in: src/orchestrator/rate-limit-queue.ts:89

Get or create a singleton RateLimitQueue instance

Supports multiple named instances for different providers/services.
If instance exists and config is provided, updates the configuration.

###### Parameters

###### config?

`Partial`\<[`RateLimitConfig`](#ratelimitconfig)\>

Optional configuration to apply

###### instanceKey?

`string` = `'default'`

Instance identifier (default: 'default')

###### Returns

[`RateLimitQueue`](#ratelimitqueue)

RateLimitQueue instance

###### Examples

```ts
// Get default instance
const limiter = RateLimitQueue.getInstance();
```

```ts
// Create provider-specific instance
const openaiLimiter = RateLimitQueue.getInstance(
  { requestsPerHour: 10000 },
  'openai'
);
```

```ts
// Update existing instance config
const limiter = RateLimitQueue.getInstance(
  { requestsPerHour: 5000, logLevel: 'verbose' },
  'default'
);
```

##### setRequestsPerHour()

> **setRequestsPerHour**(`newLimit`): `void`

Defined in: src/orchestrator/rate-limit-queue.ts:149

Update requestsPerHour dynamically at runtime

Useful for adjusting rate limits based on API tier changes
or quota updates without restarting the application.

###### Parameters

###### newLimit

`number`

New requests per hour limit (-1 to bypass)

###### Returns

`void`

###### Examples

```ts
// Increase limit after tier upgrade
limiter.setRequestsPerHour(10000);
```

```ts
// Disable rate limiting
limiter.setRequestsPerHour(-1);
```

```ts
// Reduce limit during high load
limiter.setRequestsPerHour(1000);
```

##### enqueue()

> **enqueue**\<`T`\>(`execute`, `estimatedRequests`): `Promise`\<`T`\>

Defined in: src/orchestrator/rate-limit-queue.ts:190

Enqueue a request for rate-limited execution

Queues the request and processes it when rate limit capacity is available.
Automatically handles timing, throttling, and queue management.

**Bypass Mode**: If `requestsPerHour` is -1, executes immediately without queuing.

###### Type Parameters

###### T

`T`

###### Parameters

###### execute

() => `Promise`\<`T`\>

Async function that makes the API call

###### estimatedRequests

`number` = `1`

Number of API calls this will make (default: 1)

###### Returns

`Promise`\<`T`\>

Promise that resolves with the result of execute()

###### Examples

```ts
// Simple LLM call
const response = await limiter.enqueue(async () => {
  return await llm.invoke([new HumanMessage('Hello')]);
});
```

```ts
// Agent execution with multiple calls
const result = await limiter.enqueue(async () => {
  return await agent.invoke({ messages });
}, 5);  // Estimated 5 API calls
```

```ts
// With error handling
try {
  const data = await limiter.enqueue(async () => {
    return await fetchUserData();
  });
  console.log('Data:', data);
} catch (error) {
  console.error('Rate-limited request failed:', error);
}
```

##### getRemainingCapacity()

> **getRemainingCapacity**(): `number`

Defined in: src/orchestrator/rate-limit-queue.ts:335

Get remaining capacity in current hour

###### Returns

`number`

##### getQueueDepth()

> **getQueueDepth**(): `number`

Defined in: src/orchestrator/rate-limit-queue.ts:344

Get current queue depth

###### Returns

`number`

##### getMetrics()

> **getMetrics**(): `object`

Defined in: src/orchestrator/rate-limit-queue.ts:351

Get metrics for monitoring

###### Returns

`object`

###### requestsInCurrentHour

> **requestsInCurrentHour**: `number`

###### remainingCapacity

> **remainingCapacity**: `number`

###### queueDepth

> **queueDepth**: `number`

###### totalProcessed

> **totalProcessed**: `number`

###### avgWaitTimeMs

> **avgWaitTimeMs**: `number`

###### usagePercent

> **usagePercent**: `number`

##### reset()

> **reset**(): `void`

Defined in: src/orchestrator/rate-limit-queue.ts:378

Reset metrics (for testing)

###### Returns

`void`

## Interfaces

### RateLimitConfig

Defined in: src/orchestrator/rate-limit-queue.ts:21

#### Properties

##### requestsPerHour

> **requestsPerHour**: `number`

Defined in: src/orchestrator/rate-limit-queue.ts:22

##### enableDynamicThrottling

> **enableDynamicThrottling**: `boolean`

Defined in: src/orchestrator/rate-limit-queue.ts:23

##### warningThreshold

> **warningThreshold**: `number`

Defined in: src/orchestrator/rate-limit-queue.ts:24

##### logLevel

> **logLevel**: `"silent"` \| `"normal"` \| `"verbose"`

Defined in: src/orchestrator/rate-limit-queue.ts:25
