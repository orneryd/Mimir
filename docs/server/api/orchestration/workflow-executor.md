[**mimir v1.0.0**](../../README.md)

***

[mimir](../../README.md) / api/orchestration/workflow-executor

# api/orchestration/workflow-executor

## Fileoverview

Workflow execution engine for orchestrated multi-agent task execution

This module provides the core workflow execution logic that coordinates task execution,
manages state, handles dependencies, integrates with Neo4j persistence, and provides
real-time SSE updates. Supports parallel execution with rate limiting, QC verification,
error handling, and deliverable capture.

## Since

1.0.0

## Interfaces

### Deliverable

Defined in: src/api/orchestration/workflow-executor.ts:31

Deliverable file metadata

#### Properties

##### filename

> **filename**: `string`

Defined in: src/api/orchestration/workflow-executor.ts:33

Filename without path

##### content

> **content**: `string`

Defined in: src/api/orchestration/workflow-executor.ts:35

File content as string

##### mimeType

> **mimeType**: `string`

Defined in: src/api/orchestration/workflow-executor.ts:37

MIME type for proper handling

##### size

> **size**: `number`

Defined in: src/api/orchestration/workflow-executor.ts:39

Content size in bytes

***

### ExecutionState

Defined in: src/api/orchestration/workflow-executor.ts:45

Execution state for tracking workflow progress

#### Properties

##### executionId

> **executionId**: `string`

Defined in: src/api/orchestration/workflow-executor.ts:47

Unique execution identifier

##### status

> **status**: `"completed"` \| `"cancelled"` \| `"failed"` \| `"running"`

Defined in: src/api/orchestration/workflow-executor.ts:49

Current execution status

##### currentTaskId

> **currentTaskId**: `string` \| `null`

Defined in: src/api/orchestration/workflow-executor.ts:51

ID of currently executing task (null if none)

##### taskStatuses

> **taskStatuses**: `Record`\<`string`, `"pending"` \| `"executing"` \| `"completed"` \| `"failed"`\>

Defined in: src/api/orchestration/workflow-executor.ts:53

Status map for all tasks in workflow

##### results

> **results**: [`ExecutionResult`](../../orchestrator/task-executor.md#executionresult)[]

Defined in: src/api/orchestration/workflow-executor.ts:55

Accumulated execution results

##### deliverables

> **deliverables**: [`Deliverable`](#deliverable)[]

Defined in: src/api/orchestration/workflow-executor.ts:57

Collected deliverable files

##### startTime

> **startTime**: `number`

Defined in: src/api/orchestration/workflow-executor.ts:59

Workflow start timestamp

##### endTime?

> `optional` **endTime**: `number`

Defined in: src/api/orchestration/workflow-executor.ts:61

Workflow end timestamp (undefined while running)

##### error?

> `optional` **error**: `string`

Defined in: src/api/orchestration/workflow-executor.ts:63

Error message if execution failed

##### cancelled?

> `optional` **cancelled**: `boolean`

Defined in: src/api/orchestration/workflow-executor.ts:65

Cancellation flag set by user

## Variables

### executionStates

> `const` **executionStates**: `Map`\<`string`, [`ExecutionState`](#executionstate)\>

Defined in: src/api/orchestration/workflow-executor.ts:72

Global execution state registry
Maps execution IDs to their current state

## Functions

### executeWorkflowFromJSON()

> **executeWorkflowFromJSON**(`uiTasks`, `executionId`, `graphManager`): `Promise`\<[`ExecutionResult`](../../orchestrator/task-executor.md#executionresult)[]\>

Defined in: src/api/orchestration/workflow-executor.ts:524

Execute workflow from Task Canvas JSON format

Main orchestration function that converts UI task definitions into executable
workflows, manages task execution with dependencies, persists telemetry to Neo4j,
captures deliverables, and provides real-time SSE updates to connected clients.
Handles QC verification loops and collects all artifacts into a downloadable bundle.

#### Parameters

##### uiTasks

`any`[]

Array of task objects from Task Canvas UI with id, title, prompt, dependencies

##### executionId

`string`

Unique execution identifier (timestamp-based, e.g., 'exec-1763134573643')

##### graphManager

[`IGraphManager`](../../types/IGraphManager.md#igraphmanager)

Neo4j graph manager instance for persistent storage

#### Returns

`Promise`\<[`ExecutionResult`](../../orchestrator/task-executor.md#executionresult)[]\>

Array of execution results for all tasks with status, tokens, and QC data

#### Throws

If task execution fails critically or Neo4j operations fail

#### Examples

```ts
// Example 1: Execute simple 3-task workflow
const tasks = [
  { id: 'task-1', title: 'Research topic', prompt: 'Research X', agentRoleDescription: 'Researcher' },
  { id: 'task-2', title: 'Write draft', prompt: 'Write about X', dependencies: ['task-1'] },
  { id: 'task-3', title: 'Review', prompt: 'Review draft', dependencies: ['task-2'] }
];
const results = await executeWorkflowFromJSON(
  tasks,
  '/Users/user/mimir/deliverables/exec-1234567890',
  'exec-1234567890',
  graphManager
);
// Returns: [{ taskId: 'task-1', status: 'success', ... }, ...]
// Creates: execution node, task_execution nodes, deliverable files
```

```ts
// Example 2: Execute workflow with parallel tasks
const parallelTasks = [
  { id: 'task-1', title: 'Setup', prompt: 'Initialize project' },
  { id: 'task-2.1', title: 'Feature A', prompt: 'Implement A', dependencies: ['task-1'] },
  { id: 'task-2.2', title: 'Feature B', prompt: 'Implement B', dependencies: ['task-1'] },
  { id: 'task-3', title: 'Integration', prompt: 'Combine A and B', dependencies: ['task-2.1', 'task-2.2'] }
];
const results = await executeWorkflowFromJSON(
  parallelTasks,
  '/deliverables/exec-1763134573643',
  'exec-1763134573643',
  graphManager
);
// task-2.1 and task-2.2 execute in parallel after task-1 completes
// task-3 waits for both parallel tasks to complete
```

```ts
// Example 3: Execute workflow with QC verification
const tasksWithQC = [
  {
    id: 'task-1',
    title: 'Generate report',
    prompt: 'Create quarterly report',
    agentRoleDescription: 'Report writer',
    qcRole: 'Quality auditor',
    verificationCriteria: ['Accuracy', 'Completeness', 'Formatting']
  }
];
const results = await executeWorkflowFromJSON(
  tasksWithQC,
  '/deliverables/exec-1763134573643',
  'exec-1763134573643',
  graphManager
);
// Worker generates report → QC validates → retry if failed → persist results
// Final result includes qcVerification with score, feedback, issues
```

#### Since

1.0.0
