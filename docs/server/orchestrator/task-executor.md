[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/task-executor

# orchestrator/task-executor

## Interfaces

### TaskDefinition

Defined in: src/orchestrator/task-executor.ts:88

#### Properties

##### id

> **id**: `string`

Defined in: src/orchestrator/task-executor.ts:89

##### title

> **title**: `string`

Defined in: src/orchestrator/task-executor.ts:90

##### agentRoleDescription

> **agentRoleDescription**: `string`

Defined in: src/orchestrator/task-executor.ts:91

##### recommendedModel

> **recommendedModel**: `string`

Defined in: src/orchestrator/task-executor.ts:92

##### prompt

> **prompt**: `string`

Defined in: src/orchestrator/task-executor.ts:93

##### dependencies

> **dependencies**: `string`[]

Defined in: src/orchestrator/task-executor.ts:94

##### estimatedDuration

> **estimatedDuration**: `string`

Defined in: src/orchestrator/task-executor.ts:95

##### parallelGroup?

> `optional` **parallelGroup**: `number`

Defined in: src/orchestrator/task-executor.ts:96

##### qcRole?

> `optional` **qcRole**: `string`

Defined in: src/orchestrator/task-executor.ts:99

##### verificationCriteria?

> `optional` **verificationCriteria**: `string`

Defined in: src/orchestrator/task-executor.ts:100

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: src/orchestrator/task-executor.ts:101

##### qcPreamblePath?

> `optional` **qcPreamblePath**: `string`

Defined in: src/orchestrator/task-executor.ts:102

##### estimatedToolCalls?

> `optional` **estimatedToolCalls**: `number`

Defined in: src/orchestrator/task-executor.ts:103

***

### QCResult

Defined in: src/orchestrator/task-executor.ts:106

#### Properties

##### passed

> **passed**: `boolean`

Defined in: src/orchestrator/task-executor.ts:107

##### score

> **score**: `number`

Defined in: src/orchestrator/task-executor.ts:108

##### feedback

> **feedback**: `string`

Defined in: src/orchestrator/task-executor.ts:109

##### issues

> **issues**: `string`[]

Defined in: src/orchestrator/task-executor.ts:110

##### requiredFixes

> **requiredFixes**: `string`[]

Defined in: src/orchestrator/task-executor.ts:111

##### timestamp?

> `optional` **timestamp**: `string`

Defined in: src/orchestrator/task-executor.ts:112

***

### ExecutionResult

Defined in: src/orchestrator/task-executor.ts:115

#### Properties

##### taskId

> **taskId**: `string`

Defined in: src/orchestrator/task-executor.ts:116

##### status

> **status**: `"success"` \| `"failure"`

Defined in: src/orchestrator/task-executor.ts:117

##### output

> **output**: `string`

Defined in: src/orchestrator/task-executor.ts:118

##### error?

> `optional` **error**: `string`

Defined in: src/orchestrator/task-executor.ts:119

##### duration

> **duration**: `number`

Defined in: src/orchestrator/task-executor.ts:120

##### preamblePath

> **preamblePath**: `string`

Defined in: src/orchestrator/task-executor.ts:121

##### agentRoleDescription?

> `optional` **agentRoleDescription**: `string`

Defined in: src/orchestrator/task-executor.ts:122

##### prompt?

> `optional` **prompt**: `string`

Defined in: src/orchestrator/task-executor.ts:123

##### tokens?

> `optional` **tokens**: `object`

Defined in: src/orchestrator/task-executor.ts:124

###### input

> **input**: `number`

###### output

> **output**: `number`

##### toolCalls?

> `optional` **toolCalls**: `number`

Defined in: src/orchestrator/task-executor.ts:128

##### graphNodeId?

> `optional` **graphNodeId**: `string`

Defined in: src/orchestrator/task-executor.ts:129

##### qcVerification?

> `optional` **qcVerification**: [`QCResult`](#qcresult)

Defined in: src/orchestrator/task-executor.ts:132

##### qcVerificationHistory?

> `optional` **qcVerificationHistory**: [`QCResult`](#qcresult)[]

Defined in: src/orchestrator/task-executor.ts:133

##### qcFailureReport?

> `optional` **qcFailureReport**: `string`

Defined in: src/orchestrator/task-executor.ts:134

##### attemptNumber?

> `optional` **attemptNumber**: `number`

Defined in: src/orchestrator/task-executor.ts:135

##### circuitBreakerAnalysis?

> `optional` **circuitBreakerAnalysis**: `string`

Defined in: src/orchestrator/task-executor.ts:138

##### preamblePreview?

> `optional` **preamblePreview**: `string`

Defined in: src/orchestrator/task-executor.ts:141

##### outputPreview?

> `optional` **outputPreview**: `string`

Defined in: src/orchestrator/task-executor.ts:142

## Functions

### organizeTasks()

> **organizeTasks**(`tasks`): [`TaskDefinition`](#taskdefinition)[][]

Defined in: src/orchestrator/task-executor.ts:212

Organize tasks into parallel execution batches based on dependencies

Analyzes task dependencies and creates execution batches where tasks
with satisfied dependencies can run in parallel. Supports explicit
parallel groups for fine-grained control over concurrent execution.

**Features**:
- Automatic dependency resolution
- Parallel execution of independent tasks
- Explicit parallel groups via `parallelGroup` property
- Circular dependency detection

#### Parameters

##### tasks

[`TaskDefinition`](#taskdefinition)[]

Array of task definitions with dependencies

#### Returns

[`TaskDefinition`](#taskdefinition)[][]

Array of task batches for parallel execution

#### Throws

If circular dependencies or invalid task graph detected

#### Examples

```ts
// Simple parallel execution - independent tasks run together
const tasks = [
  { id: 't1', dependencies: [], title: 'Setup database' },
  { id: 't2', dependencies: [], title: 'Setup API' },
  { id: 't3', dependencies: ['t1', 't2'], title: 'Run tests' }
];
const batches = organizeTasks(tasks);
// Returns: [[t1, t2], [t3]]
// Batch 1: t1 and t2 run in parallel
// Batch 2: t3 runs after both complete
```

```ts
// Sequential execution - each task depends on previous
const tasks = [
  { id: 't1', dependencies: [], title: 'Build' },
  { id: 't2', dependencies: ['t1'], title: 'Test' },
  { id: 't3', dependencies: ['t2'], title: 'Deploy' }
];
const batches = organizeTasks(tasks);
// Returns: [[t1], [t2], [t3]]
// Each task runs sequentially
```

```ts
// Explicit parallel groups - PM controls parallelism
const tasks = [
  { id: 't1', dependencies: [], parallelGroup: 1, title: 'Frontend' },
  { id: 't2', dependencies: [], parallelGroup: 1, title: 'Backend' },
  { id: 't3', dependencies: [], parallelGroup: 2, title: 'Database' },
  { id: 't4', dependencies: ['t1', 't2', 't3'], title: 'Integration' }
];
const batches = organizeTasks(tasks);
// Returns: [[t1, t2], [t3], [t4]]
// Group 1: t1 and t2 run together
// Group 2: t3 runs separately
// t4 runs after all complete
```

```ts
// Error handling - circular dependency
const tasks = [
  { id: 't1', dependencies: ['t2'] },
  { id: 't2', dependencies: ['t1'] }
];
try {
  organizeTasks(tasks);
} catch (error) {
  console.error('Circular dependency:', error.message);
  // Error: Cannot resolve dependencies for tasks: t1, t2
}
```

***

### parseChainOutput()

> **parseChainOutput**(`markdown`): [`TaskDefinition`](#taskdefinition)[]

Defined in: src/orchestrator/task-executor.ts:385

Parse chain output markdown into task definitions

Extracts structured task information from PM-generated markdown with
flexible field matching to handle variations in PM output format.

**Supported Fields**:
- **Task ID**: Required, format `task-N.M`
- **Agent Role Description**: Worker agent role (with aliases)
- **Recommended Model**: LLM model suggestion (optional)
- **Optimized Prompt**: Task instructions (supports `<details>` and `<prompt>` tags)
- **Dependencies**: Task IDs this task depends on
- **Estimated Duration**: Time estimate (optional)
- **QC Agent Role**: QC verification role (optional)
- **Verification Criteria**: Success criteria for QC (optional)
- **Max Retries**: Retry limit (default: 2)
- **Estimated Tool Calls**: For circuit breaker (optional)
- **Parallel Group**: Group ID for parallel execution (optional)

**Flexible Parsing**:
- Case-insensitive field names
- Multiple aliases per field (e.g., "Agent Role" or "Worker Role")
- Handles `<details>` collapsible sections
- Extracts from `<prompt>` XML tags
- Deduplicates dependencies
- Removes self-references

#### Parameters

##### markdown

`string`

Chain output markdown content from PM agent

#### Returns

[`TaskDefinition`](#taskdefinition)[]

Array of parsed task definitions ready for execution

#### Examples

```ts
// Parse PM output from file
const markdown = await fs.readFile('chain-output.md', 'utf-8');
const tasks = parseChainOutput(markdown);
console.log(`Parsed ${tasks.length} tasks`);

tasks.forEach(task => {
  console.log(`Task ${task.id}:`);
  console.log(`  Role: ${task.agentRoleDescription}`);
  console.log(`  Dependencies: ${task.dependencies.join(', ') || 'none'}`);
  console.log(`  QC: ${task.qcRole ? 'enabled' : 'disabled'}`);
});
```

```ts
// Standard PM output format
const markdown = `
**Task ID:** task-1.1
**Agent Role Description**
Senior Backend Developer
**Recommended Model**
ollama/qwen2.5-coder:32b
**Optimized Prompt**
<details>
<summary>Click to expand</summary>
<prompt>
Implement user authentication with JWT tokens.
</prompt>
</details>
**Dependencies**
None
**Estimated Duration**
2 hours
**QC Agent Role**
Security Auditor
**Verification Criteria**
- JWT tokens properly signed
- Refresh token rotation implemented
- Password hashing uses bcrypt
**Max Retries**
3
`;

const tasks = parseChainOutput(markdown);
console.log(tasks[0].id); // 'task-1.1'
console.log(tasks[0].agentRoleDescription); // 'Senior Backend Developer'
console.log(tasks[0].maxRetries); // 3
```

```ts
// With dependencies and parallel groups
const markdown = `
**Task ID:** task-1.1
**Agent Role Description:** Frontend Developer
**Parallel Group:** 1
**Dependencies:** None

**Task ID:** task-1.2
**Agent Role Description:** Backend Developer  
**Parallel Group:** 1
**Dependencies:** None

**Task ID:** task-2.1
**Agent Role Description:** Integration Tester
**Dependencies:** task-1.1, task-1.2
`;

const tasks = parseChainOutput(markdown);
// task-1.1 and task-1.2 can run in parallel (same group)
// task-2.1 waits for both to complete
console.log(tasks[0].parallelGroup); // 1
console.log(tasks[1].parallelGroup); // 1
console.log(tasks[2].dependencies); // ['task-1.1', 'task-1.2']
```

***

### generatePreamble()

> **generatePreamble**(`roleDescription`, `outputDir`, `taskExample?`, `isQC?`): `Promise`\<`string`\>

Defined in: src/orchestrator/task-executor.ts:617

Generate agent preamble via Agentinator

Creates specialized agent preamble for given role using LLM generation.

#### Parameters

##### roleDescription

`string`

Description of agent role and responsibilities

##### outputDir

`string` = `'generated-agents'`

Directory to save generated preamble

##### taskExample?

[`TaskDefinition`](#taskdefinition)

Optional task for context

##### isQC?

`boolean` = `false`

#### Returns

`Promise`\<`string`\>

Generated preamble content

#### Example

```ts
const preamble = await generatePreamble(
  'Implement authentication with JWT tokens',
  'generated-agents'
);
```

***

### executeTask()

> **executeTask**(`task`, `preambleContent`, `qcPreambleContent?`, `executionId?`, `sendSSE?`): `Promise`\<[`ExecutionResult`](#executionresult)\>

Defined in: src/orchestrator/task-executor.ts:1528

Execute single task with Worker → QC → Retry flow

Runs task with worker agent, validates with QC, retries on failure.

#### Parameters

##### task

[`TaskDefinition`](#taskdefinition)

Task definition to execute

##### preambleContent

`string`

Worker agent preamble

##### qcPreambleContent?

`string`

Optional QC agent preamble

##### executionId?

`string`

##### sendSSE?

(`event`, `data`) => `void`

#### Returns

`Promise`\<[`ExecutionResult`](#executionresult)\>

Execution result with status and outputs

#### Example

```ts
const result = await executeTask(task, workerPreamble, qcPreamble);
if (result.status === 'success') {
  console.log('Task completed:', result.outputs);
}
```

***

### executeChainOutput()

> **executeChainOutput**(`chainOutputPath`, `outputDir`): `Promise`\<[`ExecutionResult`](#executionresult)[]\>

Defined in: src/orchestrator/task-executor.ts:2275

Execute all tasks from chain output with parallel batching

Orchestrates full workflow execution with dependency-based parallelization.

#### Parameters

##### chainOutputPath

`string`

Path to chain-output.md

##### outputDir

`string` = `'generated-agents'`

Directory for generated agents

#### Returns

`Promise`\<[`ExecutionResult`](#executionresult)[]\>

Array of execution results

#### Example

```ts
const results = await executeChainOutput('chain-output.md');
const successful = results.filter(r => r.status === 'success');
console.log(`${successful.length}/${results.length} tasks succeeded`);
```

***

### generateFinalReport()

> **generateFinalReport**(`tasks`, `results`, `outputPath`, `chainOutputPath`): `Promise`\<`string`\>

Defined in: src/orchestrator/task-executor.ts:2529

Generate final PM report summarizing execution results

Creates comprehensive report with success rates and deliverables.

#### Parameters

##### tasks

[`TaskDefinition`](#taskdefinition)[]

All task definitions

##### results

[`ExecutionResult`](#executionresult)[]

Execution results

##### outputPath

`string`

Path to save report

##### chainOutputPath

`string`

#### Returns

`Promise`\<`string`\>

#### Example

```ts
await generateFinalReport(tasks, results, 'final-report.md');
```

***

### main()

> **main**(): `Promise`\<`void`\>

Defined in: src/orchestrator/task-executor.ts:2748

CLI Entry Point

#### Returns

`Promise`\<`void`\>
