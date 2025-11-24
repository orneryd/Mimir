[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / types/context.types

# types/context.types

## Interfaces

### ContextScope

Defined in: src/types/context.types.ts:16

Context scope configuration

#### Properties

##### type

> **type**: [`AgentType`](#agenttype)

Defined in: src/types/context.types.ts:17

##### allowedFields

> **allowedFields**: `string`[]

Defined in: src/types/context.types.ts:18

##### description

> **description**: `string`

Defined in: src/types/context.types.ts:19

***

### WorkerContext

Defined in: src/types/context.types.ts:26

Minimal context for worker agents
Only includes essential fields needed for task execution

#### Extended by

- [`PMContext`](#pmcontext)
- [`QCContext`](#qccontext)

#### Properties

##### taskId

> **taskId**: `string`

Defined in: src/types/context.types.ts:28

##### title

> **title**: `string`

Defined in: src/types/context.types.ts:29

##### requirements

> **requirements**: `string`

Defined in: src/types/context.types.ts:32

##### description?

> `optional` **description**: `string`

Defined in: src/types/context.types.ts:33

##### files?

> `optional` **files**: `string`[]

Defined in: src/types/context.types.ts:36

##### dependencies?

> `optional` **dependencies**: `string`[]

Defined in: src/types/context.types.ts:37

##### workerRole?

> `optional` **workerRole**: `string`

Defined in: src/types/context.types.ts:40

##### attemptNumber?

> `optional` **attemptNumber**: `number`

Defined in: src/types/context.types.ts:43

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: src/types/context.types.ts:44

##### errorContext?

> `optional` **errorContext**: `any`

Defined in: src/types/context.types.ts:47

##### status?

> `optional` **status**: `string`

Defined in: src/types/context.types.ts:50

##### priority?

> `optional` **priority**: `string`

Defined in: src/types/context.types.ts:51

***

### PMContext

Defined in: src/types/context.types.ts:58

Full context for PM agents
Includes all research, notes, and planning data

#### Extends

- [`WorkerContext`](#workercontext)

#### Indexable

\[`key`: `string`\]: `any`

#### Properties

##### taskId

> **taskId**: `string`

Defined in: src/types/context.types.ts:28

###### Inherited from

[`WorkerContext`](#workercontext).[`taskId`](#taskid)

##### title

> **title**: `string`

Defined in: src/types/context.types.ts:29

###### Inherited from

[`WorkerContext`](#workercontext).[`title`](#title)

##### requirements

> **requirements**: `string`

Defined in: src/types/context.types.ts:32

###### Inherited from

[`WorkerContext`](#workercontext).[`requirements`](#requirements)

##### description?

> `optional` **description**: `string`

Defined in: src/types/context.types.ts:33

###### Inherited from

[`WorkerContext`](#workercontext).[`description`](#description-1)

##### files?

> `optional` **files**: `string`[]

Defined in: src/types/context.types.ts:36

###### Inherited from

[`WorkerContext`](#workercontext).[`files`](#files)

##### dependencies?

> `optional` **dependencies**: `string`[]

Defined in: src/types/context.types.ts:37

###### Inherited from

[`WorkerContext`](#workercontext).[`dependencies`](#dependencies)

##### workerRole?

> `optional` **workerRole**: `string`

Defined in: src/types/context.types.ts:40

###### Inherited from

[`WorkerContext`](#workercontext).[`workerRole`](#workerrole)

##### attemptNumber?

> `optional` **attemptNumber**: `number`

Defined in: src/types/context.types.ts:43

###### Inherited from

[`WorkerContext`](#workercontext).[`attemptNumber`](#attemptnumber)

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: src/types/context.types.ts:44

###### Inherited from

[`WorkerContext`](#workercontext).[`maxRetries`](#maxretries)

##### errorContext?

> `optional` **errorContext**: `any`

Defined in: src/types/context.types.ts:47

###### Inherited from

[`WorkerContext`](#workercontext).[`errorContext`](#errorcontext)

##### status?

> `optional` **status**: `string`

Defined in: src/types/context.types.ts:50

###### Inherited from

[`WorkerContext`](#workercontext).[`status`](#status)

##### priority?

> `optional` **priority**: `string`

Defined in: src/types/context.types.ts:51

###### Inherited from

[`WorkerContext`](#workercontext).[`priority`](#priority)

##### research?

> `optional` **research**: `object`

Defined in: src/types/context.types.ts:60

###### alternatives?

> `optional` **alternatives**: `string`[]

###### references?

> `optional` **references**: `string`[]

###### notes?

> `optional` **notes**: `string`[]

###### estimatedComplexity?

> `optional` **estimatedComplexity**: `string`

##### fullSubgraph?

> `optional` **fullSubgraph**: `object`

Defined in: src/types/context.types.ts:68

###### nodes

> **nodes**: `any`[]

###### edges

> **edges**: `any`[]

##### planningNotes?

> `optional` **planningNotes**: `string`[]

Defined in: src/types/context.types.ts:74

##### architectureDecisions?

> `optional` **architectureDecisions**: `string`[]

Defined in: src/types/context.types.ts:75

##### allFiles?

> `optional` **allFiles**: `string`[]

Defined in: src/types/context.types.ts:78

***

### QCContext

Defined in: src/types/context.types.ts:88

QC agent context
Includes requirements and validation data

#### Extends

- [`WorkerContext`](#workercontext)

#### Properties

##### taskId

> **taskId**: `string`

Defined in: src/types/context.types.ts:28

###### Inherited from

[`WorkerContext`](#workercontext).[`taskId`](#taskid)

##### title

> **title**: `string`

Defined in: src/types/context.types.ts:29

###### Inherited from

[`WorkerContext`](#workercontext).[`title`](#title)

##### requirements

> **requirements**: `string`

Defined in: src/types/context.types.ts:32

###### Inherited from

[`WorkerContext`](#workercontext).[`requirements`](#requirements)

##### description?

> `optional` **description**: `string`

Defined in: src/types/context.types.ts:33

###### Inherited from

[`WorkerContext`](#workercontext).[`description`](#description-1)

##### files?

> `optional` **files**: `string`[]

Defined in: src/types/context.types.ts:36

###### Inherited from

[`WorkerContext`](#workercontext).[`files`](#files)

##### dependencies?

> `optional` **dependencies**: `string`[]

Defined in: src/types/context.types.ts:37

###### Inherited from

[`WorkerContext`](#workercontext).[`dependencies`](#dependencies)

##### workerRole?

> `optional` **workerRole**: `string`

Defined in: src/types/context.types.ts:40

###### Inherited from

[`WorkerContext`](#workercontext).[`workerRole`](#workerrole)

##### attemptNumber?

> `optional` **attemptNumber**: `number`

Defined in: src/types/context.types.ts:43

###### Inherited from

[`WorkerContext`](#workercontext).[`attemptNumber`](#attemptnumber)

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: src/types/context.types.ts:44

###### Inherited from

[`WorkerContext`](#workercontext).[`maxRetries`](#maxretries)

##### errorContext?

> `optional` **errorContext**: `any`

Defined in: src/types/context.types.ts:47

###### Inherited from

[`WorkerContext`](#workercontext).[`errorContext`](#errorcontext)

##### status?

> `optional` **status**: `string`

Defined in: src/types/context.types.ts:50

###### Inherited from

[`WorkerContext`](#workercontext).[`status`](#status)

##### priority?

> `optional` **priority**: `string`

Defined in: src/types/context.types.ts:51

###### Inherited from

[`WorkerContext`](#workercontext).[`priority`](#priority)

##### originalRequirements

> **originalRequirements**: `string`

Defined in: src/types/context.types.ts:90

##### workerOutput?

> `optional` **workerOutput**: `any`

Defined in: src/types/context.types.ts:93

##### verificationCriteria?

> `optional` **verificationCriteria**: `any`

Defined in: src/types/context.types.ts:96

##### qcRole?

> `optional` **qcRole**: `string`

Defined in: src/types/context.types.ts:99

***

### ContextFilterOptions

Defined in: src/types/context.types.ts:105

Context filtering options

#### Properties

##### agentType

> **agentType**: [`AgentType`](#agenttype)

Defined in: src/types/context.types.ts:106

##### agentId

> **agentId**: `string`

Defined in: src/types/context.types.ts:107

##### includeErrorContext?

> `optional` **includeErrorContext**: `boolean`

Defined in: src/types/context.types.ts:108

##### maxFiles?

> `optional` **maxFiles**: `number`

Defined in: src/types/context.types.ts:109

##### maxDependencies?

> `optional` **maxDependencies**: `number`

Defined in: src/types/context.types.ts:110

***

### ContextMetrics

Defined in: src/types/context.types.ts:116

Context size metrics

#### Properties

##### originalSize

> **originalSize**: `number`

Defined in: src/types/context.types.ts:117

##### filteredSize

> **filteredSize**: `number`

Defined in: src/types/context.types.ts:118

##### reductionPercent

> **reductionPercent**: `number`

Defined in: src/types/context.types.ts:119

##### fieldsRemoved

> **fieldsRemoved**: `string`[]

Defined in: src/types/context.types.ts:120

##### fieldsRetained

> **fieldsRetained**: `string`[]

Defined in: src/types/context.types.ts:121

## Type Aliases

### AgentType

> **AgentType** = `"pm"` \| `"worker"` \| `"qc"`

Defined in: src/types/context.types.ts:11

Agent types that can request context

## Variables

### DEFAULT\_CONTEXT\_SCOPES

> `const` **DEFAULT\_CONTEXT\_SCOPES**: `Record`\<[`AgentType`](#agenttype), [`ContextScope`](#contextscope)\>

Defined in: src/types/context.types.ts:127

Default context scopes for each agent type
