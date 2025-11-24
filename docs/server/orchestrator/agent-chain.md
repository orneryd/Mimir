[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/agent-chain

# orchestrator/agent-chain

## Classes

### AgentChain

Defined in: src/orchestrator/agent-chain.ts:66

Agent Chain Orchestrator

Chains multiple agents together in a sequential workflow:
1. PM Agent: Analyzes user request and plans approach
2. Ecko Agent: Optimizes prompts for individual tasks
3. PM Agent: Creates final task graph with optimized prompts

#### Constructors

##### Constructor

> **new AgentChain**(`agentsDir`, `enableEcko`): [`AgentChain`](#agentchain)

Defined in: src/orchestrator/agent-chain.ts:73

###### Parameters

###### agentsDir

`string` = `'docs/agents'`

###### enableEcko

`boolean` = `false`

###### Returns

[`AgentChain`](#agentchain)

#### Methods

##### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: src/orchestrator/agent-chain.ts:103

Initialize all agents (load preambles)

###### Returns

`Promise`\<`void`\>

##### cleanup()

> **cleanup**(): `Promise`\<`void`\>

Defined in: src/orchestrator/agent-chain.ts:124

Clean up resources (close Neo4j connection)

###### Returns

`Promise`\<`void`\>

##### execute()

> **execute**(`userRequest`): `Promise`\<[`AgentChainResult`](#agentchainresult)\>

Defined in: src/orchestrator/agent-chain.ts:367

Execute the full agent chain

###### Parameters

###### userRequest

`string`

High-level user request (e.g., "Draft up plan X")

###### Returns

`Promise`\<[`AgentChainResult`](#agentchainresult)\>

Complete chain result with task graph

## Interfaces

### AgentChainStep

Defined in: src/orchestrator/agent-chain.ts:23

Result from each agent in the chain

#### Properties

##### agentName

> **agentName**: `string`

Defined in: src/orchestrator/agent-chain.ts:24

##### agentRole

> **agentRole**: `string`

Defined in: src/orchestrator/agent-chain.ts:25

##### input

> **input**: `string`

Defined in: src/orchestrator/agent-chain.ts:26

##### output

> **output**: `string`

Defined in: src/orchestrator/agent-chain.ts:27

##### toolCalls

> **toolCalls**: `number`

Defined in: src/orchestrator/agent-chain.ts:28

##### tokens

> **tokens**: `object`

Defined in: src/orchestrator/agent-chain.ts:29

###### input

> **input**: `number`

###### output

> **output**: `number`

##### duration

> **duration**: `number`

Defined in: src/orchestrator/agent-chain.ts:30

***

### AgentChainResult

Defined in: src/orchestrator/agent-chain.ts:36

Complete chain execution result

#### Properties

##### steps

> **steps**: [`AgentChainStep`](#agentchainstep)[]

Defined in: src/orchestrator/agent-chain.ts:37

##### finalOutput

> **finalOutput**: `string`

Defined in: src/orchestrator/agent-chain.ts:38

##### totalTokens

> **totalTokens**: `object`

Defined in: src/orchestrator/agent-chain.ts:39

###### input

> **input**: `number`

###### output

> **output**: `number`

##### totalDuration

> **totalDuration**: `number`

Defined in: src/orchestrator/agent-chain.ts:40

##### taskGraph?

> `optional` **taskGraph**: [`TaskGraphNode`](#taskgraphnode)

Defined in: src/orchestrator/agent-chain.ts:41

***

### TaskGraphNode

Defined in: src/orchestrator/agent-chain.ts:47

Task graph node (similar to DOCKER_MIGRATION_PROMPTS.md structure)

#### Properties

##### id

> **id**: `string`

Defined in: src/orchestrator/agent-chain.ts:48

##### type

> **type**: `"project"` \| `"phase"` \| `"task"`

Defined in: src/orchestrator/agent-chain.ts:49

##### title

> **title**: `string`

Defined in: src/orchestrator/agent-chain.ts:50

##### description?

> `optional` **description**: `string`

Defined in: src/orchestrator/agent-chain.ts:51

##### prompt?

> `optional` **prompt**: `string`

Defined in: src/orchestrator/agent-chain.ts:52

##### dependencies?

> `optional` **dependencies**: `string`[]

Defined in: src/orchestrator/agent-chain.ts:53

##### status?

> `optional` **status**: `"pending"` \| `"completed"` \| `"in_progress"`

Defined in: src/orchestrator/agent-chain.ts:54

##### children?

> `optional` **children**: [`TaskGraphNode`](#taskgraphnode)[]

Defined in: src/orchestrator/agent-chain.ts:55

## Functions

### main()

> **main**(): `Promise`\<`void`\>

Defined in: src/orchestrator/agent-chain.ts:638

CLI Entry Point

Usage: npm run chain "Draft migration plan for Docker"

#### Returns

`Promise`\<`void`\>
