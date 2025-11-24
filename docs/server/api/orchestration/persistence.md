[**mimir v1.0.0**](../../README.md)

***

[mimir](../../README.md) / api/orchestration/persistence

# api/orchestration/persistence

## Fileoverview

Neo4j persistence operations for orchestration execution tracking

This module provides all database operations for storing and retrieving
orchestration execution telemetry in Neo4j. It handles creation and updates
of execution nodes, task execution nodes, and their relationships.

## Since

1.0.0

## Functions

### persistTaskExecutionToNeo4j()

> **persistTaskExecutionToNeo4j**(`graphManager`, `executionId`, `taskId`, `result`, `task`): `Promise`\<`string`\>

Defined in: src/api/orchestration/persistence.ts:98

Persist task execution result to Neo4j with unique composite ID

Creates a task_execution node in Neo4j with comprehensive telemetry including
tokens, QC verification results, duration, and output. Links the task to its
parent execution node and creates a FAILED_TASK relationship if the task failed.
This ensures all execution history is permanently stored for audit and analysis.

#### Parameters

##### graphManager

[`IGraphManager`](../../types/IGraphManager.md#igraphmanager)

Neo4j graph manager instance for database operations

##### executionId

`string`

Parent execution identifier (e.g., 'exec-1763134573643')

##### taskId

`string`

Task identifier from the plan (e.g., 'task-1.1', 'task-2')

##### result

[`ExecutionResult`](../../orchestrator/task-executor.md#executionresult)

Execution result containing status, output, tokens, and QC data

##### task

[`TaskDefinition`](../../orchestrator/task-executor.md#taskdefinition)

Original task definition with title, roles, and verification criteria

#### Returns

`Promise`\<`string`\>

Unique task execution node ID in format `${executionId}-${taskId}`

#### Throws

If Neo4j session creation or query execution fails

#### Examples

```ts
// Example 1: Persist successful task with QC validation
const result = {
  taskId: 'task-1',
  status: 'success',
  output: '✅ Environment validated successfully',
  duration: 5000,
  tokens: { input: 1000, output: 500 },
  toolCalls: 3,
  qcVerification: { passed: true, score: 95, feedback: 'All checks passed' }
};
const nodeId = await persistTaskExecutionToNeo4j(
  graphManager,
  'exec-1763134573643',
  'task-1',
  result,
  taskDefinition
);
// Returns: 'exec-1763134573643-task-1'
```

```ts
// Example 2: Persist failed task with error details
const failedResult = {
  taskId: 'task-2',
  status: 'failure',
  error: 'Timeout waiting for API response',
  duration: 30000,
  tokens: { input: 800, output: 100 },
  qcVerification: { 
    passed: false, 
    score: 45, 
    issues: ['Incomplete data', 'Missing validation'],
    requiredFixes: ['Retry with timeout handling', 'Add error recovery']
  }
};
await persistTaskExecutionToNeo4j(
  graphManager,
  'exec-1763134573643',
  'task-2',
  failedResult,
  taskDef
);
// Creates FAILED_TASK relationship for quick failure queries
```

```ts
// Example 3: Persist task with retry attempt tracking
const retryResult = {
  taskId: 'task-3',
  status: 'success',
  output: 'Completed on second attempt',
  duration: 8000,
  attemptNumber: 2,
  tokens: { input: 1200, output: 600 },
  toolCalls: 5
};
const nodeId = await persistTaskExecutionToNeo4j(
  graphManager,
  'exec-1763134573643',
  'task-3',
  retryResult,
  taskDefinition
);
// Stores attemptNumber for tracking retries
```

#### Since

1.0.0

***

### createExecutionNodeInNeo4j()

> **createExecutionNodeInNeo4j**(`graphManager`, `executionId`, `planId`, `totalTasks`, `startTime`): `Promise`\<`void`\>

Defined in: src/api/orchestration/persistence.ts:249

Create initial execution node in Neo4j at workflow start

Initializes a central orchestration_execution node that serves as the root
for all task executions in a workflow. Sets initial metrics to zero and
status to 'running'. Links to the orchestration_plan if one exists.
This node is updated incrementally as tasks complete.

#### Parameters

##### graphManager

[`IGraphManager`](../../types/IGraphManager.md#igraphmanager)

Neo4j graph manager instance for database operations

##### executionId

`string`

Unique execution identifier (timestamp-based)

##### planId

`string`

Associated orchestration plan identifier

##### totalTasks

`number`

Total number of tasks in the workflow

##### startTime

`number`

Unix timestamp in milliseconds when execution started

#### Returns

`Promise`\<`void`\>

#### Throws

If Neo4j session creation or query execution fails

#### Examples

```ts
// Example 1: Create execution node for new 5-task workflow
await createExecutionNodeInNeo4j(
  graphManager,
  'exec-1763134573643',
  'plan-kolache-recipe',
  5,
  Date.now()
);
// Creates node with status='running', tasksTotal=5, all counters at 0
```

```ts
// Example 2: Create execution node with explicit timestamp
const workflowStart = Date.now();
await createExecutionNodeInNeo4j(
  graphManager,
  `exec-${workflowStart}`,
  `plan-${workflowStart}`,
  12,
  workflowStart
);
// Links to plan-{timestamp} if it exists in the graph
```

```ts
// Example 3: Create execution node in production with error handling
try {
  await createExecutionNodeInNeo4j(
    graphManager,
    executionId,
    planId,
    taskCount,
    Date.now()
  );
  console.log(`✅ Execution ${executionId} tracking initialized`);
} catch (error) {
  console.error('Failed to create execution node:', error);
  // Workflow continues even if persistence fails
}
```

#### Since

1.0.0

***

### updateExecutionNodeProgress()

> **updateExecutionNodeProgress**(`graphManager`, `executionId`, `taskResult`, `tasksFailed`, `tasksSuccessful`): `Promise`\<`void`\>

Defined in: src/api/orchestration/persistence.ts:376

Update execution node incrementally after each task completes

Provides real-time progress tracking by updating the orchestration_execution
node immediately after each task finishes. Aggregates tokens, tool calls, and
task counts. Marks the execution as 'failed' instantly if any task fails,
allowing for immediate error detection without waiting for workflow completion.

#### Parameters

##### graphManager

[`IGraphManager`](../../types/IGraphManager.md#igraphmanager)

Neo4j graph manager instance for database operations

##### executionId

`string`

Execution identifier to update (e.g., 'exec-1763134573643')

##### taskResult

[`ExecutionResult`](../../orchestrator/task-executor.md#executionresult)

Just-completed task's execution result with tokens and status

##### tasksFailed

`number`

Current count of failed tasks (including this one if failed)

##### tasksSuccessful

`number`

Current count of successful tasks

#### Returns

`Promise`\<`void`\>

#### Throws

If Neo4j session creation or query execution fails (logged but not re-thrown)

#### Examples

```ts
// Example 1: Update after successful task completion
const taskResult = {
  taskId: 'task-1',
  status: 'success',
  duration: 5000,
  tokens: { input: 1000, output: 500 },
  toolCalls: 3
};
await updateExecutionNodeProgress(
  graphManager,
  'exec-1763134573643',
  taskResult,
  0,  // tasksFailed
  1   // tasksSuccessful
);
// Execution node: status='running', successful=1, failed=0, tokens aggregated
```

```ts
// Example 2: Update after task failure (immediate status change)
const failedResult = {
  taskId: 'task-2',
  status: 'failure',
  error: 'API timeout',
  duration: 30000,
  tokens: { input: 800, output: 50 },
  toolCalls: 1
};
await updateExecutionNodeProgress(
  graphManager,
  'exec-1763134573643',
  failedResult,
  1,  // tasksFailed (incremented)
  1   // tasksSuccessful (unchanged)
);
// Execution node: status='failed', successful=1, failed=1
// Console: "⚠️  Execution node marked as FAILED after task task-2"
```

```ts
// Example 3: Aggregate tokens across multiple tasks
const results = [
  { tokens: { input: 1000, output: 500 }, status: 'success', toolCalls: 3 },
  { tokens: { input: 1200, output: 600 }, status: 'success', toolCalls: 5 },
  { tokens: { input: 900, output: 400 }, status: 'success', toolCalls: 2 }
];
for (let i = 0; i < results.length; i++) {
  await updateExecutionNodeProgress(
    graphManager,
    executionId,
    results[i],
    0,
    i + 1
  );
}
// Final: tokensInput=3100, tokensOutput=1500, tokensTotal=4600, toolCalls=10
```

#### Since

1.0.0

***

### updateExecutionNodeInNeo4j()

> **updateExecutionNodeInNeo4j**(`graphManager`, `executionId`, `results`, `endTime`, `cancelled`): `Promise`\<`void`\>

Defined in: src/api/orchestration/persistence.ts:486

Finalize execution node with completion summary at workflow end

Updates the orchestration_execution node with final status, end time, and
total duration. This is called once at the end of workflow execution after
all tasks have completed (or been cancelled). Note that task counts and token
aggregates are already up-to-date from incremental updates.

#### Parameters

##### graphManager

[`IGraphManager`](../../types/IGraphManager.md#igraphmanager)

Neo4j graph manager instance for database operations

##### executionId

`string`

Execution identifier to finalize (e.g., 'exec-1763134573643')

##### results

[`ExecutionResult`](../../orchestrator/task-executor.md#executionresult)[]

Array of all task execution results from the workflow

##### endTime

`number`

Unix timestamp in milliseconds when execution ended

##### cancelled

`boolean` = `false`

Whether execution was manually cancelled (default: false)

#### Returns

`Promise`\<`void`\>

#### Throws

If Neo4j session creation or query execution fails

#### Examples

```ts
// Example 1: Finalize successful workflow with all tasks passed
const results = [
  { taskId: 'task-1', status: 'success', duration: 5000 },
  { taskId: 'task-2', status: 'success', duration: 8000 },
  { taskId: 'task-3', status: 'success', duration: 3000 }
];
await updateExecutionNodeInNeo4j(
  graphManager,
  'exec-1763134573643',
  results,
  Date.now(),
  false
);
// Execution node: status='completed', endTime=now, duration=16000ms
```

```ts
// Example 2: Finalize workflow with failures
const mixedResults = [
  { taskId: 'task-1', status: 'success', duration: 5000 },
  { taskId: 'task-2', status: 'failure', error: 'Timeout', duration: 30000 },
  { taskId: 'task-3', status: 'success', duration: 3000 }
];
await updateExecutionNodeInNeo4j(
  graphManager,
  'exec-1763134573643',
  mixedResults,
  Date.now(),
  false
);
// Execution node: status='failed' (any failure marks entire execution failed)
```

```ts
// Example 3: Finalize cancelled workflow
const partialResults = [
  { taskId: 'task-1', status: 'success', duration: 5000 },
  { taskId: 'task-2', status: 'success', duration: 8000 }
];
await updateExecutionNodeInNeo4j(
  graphManager,
  'exec-1763134573643',
  partialResults,
  Date.now(),
  true  // cancelled=true
);
// Execution node: status='cancelled', endTime=now
// Console: "💾 Execution node finalized: exec-1763134573643 (status: cancelled)"
```

#### Since

1.0.0
