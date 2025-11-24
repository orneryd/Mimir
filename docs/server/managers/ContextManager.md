[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / managers/ContextManager

# managers/ContextManager

## Classes

### ContextManager

Defined in: src/managers/ContextManager.ts:20

#### Constructors

##### Constructor

> **new ContextManager**(`graphManager`): [`ContextManager`](#contextmanager)

Defined in: src/managers/ContextManager.ts:21

###### Parameters

###### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

###### Returns

[`ContextManager`](#contextmanager)

#### Methods

##### filterForAgent()

> **filterForAgent**(`fullContext`, `agentType`, `options?`): [`WorkerContext`](../types/context.types.md#workercontext) \| [`PMContext`](../types/context.types.md#pmcontext) \| [`QCContext`](../types/context.types.md#qccontext)

Defined in: src/managers/ContextManager.ts:79

Filter context for a specific agent type with automatic scope reduction

Applies agent-specific filtering to reduce context size and prevent pollution.
PM agents receive full context, while workers get 90%+ reduction for focused
execution. QC agents receive worker context plus validation data.

Context Reduction Strategy:
- **PM Agent**: Full context (0% reduction) - needs complete project view
- **Worker Agent**: 90%+ reduction - only task essentials
- **QC Agent**: Worker context + validation criteria

###### Parameters

###### fullContext

[`PMContext`](../types/context.types.md#pmcontext)

Complete PM context with all project data

###### agentType

[`AgentType`](../types/context.types.md#agenttype)

Agent type ('pm', 'worker', 'qc')

###### options?

`Partial`\<[`ContextFilterOptions`](../types/context.types.md#contextfilteroptions)\>

Optional filtering configuration

###### Returns

[`WorkerContext`](../types/context.types.md#workercontext) \| [`PMContext`](../types/context.types.md#pmcontext) \| [`QCContext`](../types/context.types.md#qccontext)

Filtered context appropriate for agent type

###### Examples

```ts
// Filter for worker agent (90%+ reduction)
const pmContext: PMContext = {
  taskId: 'task-123',
  title: 'Implement authentication',
  requirements: 'Add JWT-based auth',
  description: 'Full implementation details...',
  files: ['src/auth.ts', 'src/middleware.ts'],
  research: '50 pages of OAuth research...',
  planningNotes: 'Extensive planning docs...',
  allFiles: ['100+ files in project...'],
  status: 'in_progress',
  priority: 'high'
};

const workerContext = contextManager.filterForAgent(pmContext, 'worker');
// Returns: { taskId, title, requirements, description, files (limited), status, priority }
// Removes: research, planningNotes, allFiles, fullSubgraph
```

```ts
// PM agent gets full context
const pmContext = contextManager.filterForAgent(fullContext, 'pm');
// Returns: fullContext unchanged (0% reduction)
console.log('PM has access to all project data');
```

```ts
// QC agent gets worker context + validation data
const qcContext = contextManager.filterForAgent(pmContext, 'qc');
// Returns: worker context + originalRequirements + verificationCriteria
console.log('QC can validate against requirements');
```

```ts
// Custom filtering options
const workerContext = contextManager.filterForAgent(pmContext, 'worker', {
  maxFiles: 5,              // Limit to 5 files instead of default 10
  maxDependencies: 3,       // Limit dependencies
  includeErrorContext: true // Include error details for retry tasks
});
```

##### calculateReduction()

> **calculateReduction**(`fullContext`, `filteredContext`): [`ContextMetrics`](../types/context.types.md#contextmetrics)

Defined in: src/managers/ContextManager.ts:218

Calculate context size reduction metrics for validation

Measures the effectiveness of context filtering by comparing byte sizes
and tracking which fields were removed. Used to verify 90%+ reduction
target for worker agents.

###### Parameters

###### fullContext

[`PMContext`](../types/context.types.md#pmcontext)

Original PM context

###### filteredContext

Filtered worker or QC context

[`WorkerContext`](../types/context.types.md#workercontext) | [`QCContext`](../types/context.types.md#qccontext)

###### Returns

[`ContextMetrics`](../types/context.types.md#contextmetrics)

Metrics including sizes, reduction percentage, and field changes

###### Examples

```ts
// Verify worker context reduction
const pmContext = buildFullContext();
const workerContext = contextManager.filterForAgent(pmContext, 'worker');
const metrics = contextManager.calculateReduction(pmContext, workerContext);

console.log('Original:', metrics.originalSize, 'bytes');
console.log('Filtered:', metrics.filteredSize, 'bytes');
console.log('Reduction:', metrics.reductionPercent.toFixed(1) + '%');
console.log('Removed fields:', metrics.fieldsRemoved.join(', '));
// Output: "Reduction: 92.3%"
// Removed fields: research, planningNotes, fullSubgraph, allFiles
```

```ts
// Monitor context efficiency in production
const result = await contextManager.getFilteredTaskContext(
  'task-123',
  'worker'
);

if (result.metrics.reductionPercent < 90) {
  console.warn('Low reduction:', result.metrics.reductionPercent + '%');
  console.warn('Consider removing:', result.metrics.fieldsRetained.join(', '));
}
```

```ts
// Compare different agent types
const workerMetrics = contextManager.calculateReduction(pmCtx, workerCtx);
const qcMetrics = contextManager.calculateReduction(pmCtx, qcCtx);

console.log('Worker reduction:', workerMetrics.reductionPercent + '%');
console.log('QC reduction:', qcMetrics.reductionPercent + '%');
// QC typically has slightly less reduction due to validation data
```

##### getFilteredTaskContext()

> **getFilteredTaskContext**(`taskId`, `agentType`, `options?`): `Promise`\<\{ `context`: [`WorkerContext`](../types/context.types.md#workercontext) \| [`PMContext`](../types/context.types.md#pmcontext) \| [`QCContext`](../types/context.types.md#qccontext); `metrics`: [`ContextMetrics`](../types/context.types.md#contextmetrics); \}\>

Defined in: src/managers/ContextManager.ts:328

Get task context from graph with automatic agent-specific filtering

Main entry point for multi-agent orchestration. Fetches task from Neo4j,
builds complete PM context, filters for agent type, and returns both
filtered context and reduction metrics.

Workflow:
1. Fetch task node from graph database
2. Build complete PM context from properties
3. Optionally fetch subgraph for PM agents
4. Filter context based on agent type
5. Calculate and return reduction metrics

###### Parameters

###### taskId

`string`

Task node ID in graph database

###### agentType

[`AgentType`](../types/context.types.md#agenttype)

Agent type requesting context

###### options?

`Partial`\<[`ContextFilterOptions`](../types/context.types.md#contextfilteroptions)\>

Optional filtering configuration

###### Returns

`Promise`\<\{ `context`: [`WorkerContext`](../types/context.types.md#workercontext) \| [`PMContext`](../types/context.types.md#pmcontext) \| [`QCContext`](../types/context.types.md#qccontext); `metrics`: [`ContextMetrics`](../types/context.types.md#contextmetrics); \}\>

Filtered context and reduction metrics

###### Throws

If task not found in database

###### Examples

```ts
// Worker agent fetching task context
const result = await contextManager.getFilteredTaskContext(
  'task-auth-123',
  'worker'
);

console.log('Task:', result.context.title);
console.log('Requirements:', result.context.requirements);
console.log('Files:', result.context.files?.join(', '));
console.log('Context reduced by', result.metrics.reductionPercent.toFixed(1) + '%');

// Worker executes with minimal context
await executeTask(result.context);
```

```ts
// PM agent fetching full context with subgraph
const pmResult = await contextManager.getFilteredTaskContext(
  'task-planning-456',
  'pm'
);

// PM gets everything including subgraph
console.log('Research:', pmResult.context.research);
console.log('Planning notes:', pmResult.context.planningNotes);
console.log('Subgraph nodes:', pmResult.context.fullSubgraph?.nodes.length);
console.log('All project files:', pmResult.context.allFiles?.length);
```

```ts
// QC agent validating worker output
const qcResult = await contextManager.getFilteredTaskContext(
  'task-completed-789',
  'qc'
);

// QC gets worker context + validation data
const passed = validateOutput(
  qcResult.context.workerOutput,
  qcResult.context.originalRequirements,
  qcResult.context.verificationCriteria
);
```

```ts
// Custom filtering for retry tasks
const retryResult = await contextManager.getFilteredTaskContext(
  'task-retry-999',
  'worker',
  {
    maxFiles: 5,
    includeErrorContext: true  // Include previous error for debugging
  }
);

if (retryResult.context.errorContext) {
  console.log('Previous error:', retryResult.context.errorContext);
  console.log('Attempt', retryResult.context.attemptNumber + '/' + retryResult.context.maxRetries);
}
```

##### validateContextReduction()

> **validateContextReduction**(`fullContext`, `workerContext`): `object`

Defined in: src/managers/ContextManager.ts:448

Validate that worker context meets 90%+ reduction requirement

Ensures worker context is <10% of PM context size to maintain
focused execution and prevent context pollution. Use this to
verify filtering effectiveness in tests or production monitoring.

###### Parameters

###### fullContext

[`PMContext`](../types/context.types.md#pmcontext)

Original PM context

###### workerContext

[`WorkerContext`](../types/context.types.md#workercontext)

Filtered worker context

###### Returns

`object`

Validation result with boolean and detailed metrics

###### valid

> **valid**: `boolean`

###### metrics

> **metrics**: [`ContextMetrics`](../types/context.types.md#contextmetrics)

###### Examples

```ts
// Validate context reduction in tests
const pmContext = buildPMContext(task);
const workerContext = contextManager.filterForAgent(pmContext, 'worker');
const validation = contextManager.validateContextReduction(
  pmContext,
  workerContext
);

expect(validation.valid).toBe(true);
expect(validation.metrics.reductionPercent).toBeGreaterThanOrEqual(90);
console.log('Context reduced by', validation.metrics.reductionPercent.toFixed(1) + '%');
```

```ts
// Production monitoring with alerts
const validation = contextManager.validateContextReduction(
  pmContext,
  workerContext
);

if (!validation.valid) {
  console.error('Context reduction failed:', validation.metrics.reductionPercent + '%');
  console.error('Original:', validation.metrics.originalSize, 'bytes');
  console.error('Filtered:', validation.metrics.filteredSize, 'bytes');
  console.error('Fields retained:', validation.metrics.fieldsRetained.join(', '));
  
  // Alert ops team
  await alertOps('Context reduction below 90%', validation.metrics);
}
```

```ts
// Validate custom filtering options
const customWorker = contextManager.filterForAgent(pmContext, 'worker', {
  maxFiles: 20  // More files than default
});

const validation = contextManager.validateContextReduction(
  pmContext,
  customWorker
);

if (!validation.valid) {
  console.warn('Increase maxFiles caused validation failure');
  console.warn('Consider reducing maxFiles to maintain 90% reduction');
}
```

##### getScope()

> **getScope**(`agentType`): [`ContextScope`](../types/context.types.md#contextscope)

Defined in: src/managers/ContextManager.ts:496

Get context scope definition for agent type

Returns the configured scope that defines which fields each agent
type is allowed to access. Used internally by filtering logic.

###### Parameters

###### agentType

[`AgentType`](../types/context.types.md#agenttype)

Agent type to get scope for

###### Returns

[`ContextScope`](../types/context.types.md#contextscope)

Scope configuration with allowed fields

###### Examples

```ts
// Check what fields worker agents can access
const workerScope = contextManager.getScope('worker');
console.log('Worker can access:', workerScope.fields);
// Output: ['taskId', 'title', 'requirements', 'description', 'files', ...]
```

```ts
// Compare scopes across agent types
const pmScope = contextManager.getScope('pm');
const workerScope = contextManager.getScope('worker');
const qcScope = contextManager.getScope('qc');

console.log('PM fields:', pmScope.fields.length);
console.log('Worker fields:', workerScope.fields.length);
console.log('QC fields:', qcScope.fields.length);
```

```ts
// Validate custom context against scope
const workerScope = contextManager.getScope('worker');
const customContext = buildCustomContext();

const invalidFields = Object.keys(customContext).filter(
  key => !workerScope.fields.includes(key)
);

if (invalidFields.length > 0) {
  console.warn('Invalid fields for worker:', invalidFields.join(', '));
}
```
