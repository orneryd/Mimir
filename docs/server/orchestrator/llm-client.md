[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/llm-client

# orchestrator/llm-client

## Classes

### CopilotAgentClient

Defined in: src/orchestrator/llm-client.ts:64

Client for GitHub Copilot Chat API via copilot-api proxy
WITH FULL AGENT MODE (tool calling enabled) using LangChain 1.0.1 + LangGraph

#### Example

```typescript
const client = new CopilotAgentClient({
  preamblePath: 'agent.md',
  model: 'gpt-4.1',  // Or use env var: process.env.MIMIR_DEFAULT_MODEL
  temperature: 0.0,
});
await client.loadPreamble('agent.md');
const result = await client.execute('Debug the order processing system');
```

#### Constructors

##### Constructor

> **new CopilotAgentClient**(`config`): [`CopilotAgentClient`](#copilotagentclient)

Defined in: src/orchestrator/llm-client.ts:88

###### Parameters

###### config

[`AgentConfig`](#agentconfig)

###### Returns

[`CopilotAgentClient`](#copilotagentclient)

#### Methods

##### getProvider()

> **getProvider**(): [`LLMProvider`](types.md#llmprovider)

Defined in: src/orchestrator/llm-client.ts:134

###### Returns

[`LLMProvider`](types.md#llmprovider)

##### getModel()

> **getModel**(): `string`

Defined in: src/orchestrator/llm-client.ts:147

###### Returns

`string`

##### getBaseURL()

> **getBaseURL**(): `string`

Defined in: src/orchestrator/llm-client.ts:158

###### Returns

`string`

##### getLLMConfig()

> **getLLMConfig**(): `Record`\<`string`, `any`\>

Defined in: src/orchestrator/llm-client.ts:174

###### Returns

`Record`\<`string`, `any`\>

##### getContextWindow()

> **getContextWindow**(): `Promise`\<`number`\>

Defined in: src/orchestrator/llm-client.ts:195

###### Returns

`Promise`\<`number`\>

##### loadPreamble()

> **loadPreamble**(`pathOrContent`, `isContent`): `Promise`\<`void`\>

Defined in: src/orchestrator/llm-client.ts:207

Load agent preamble from file or string

###### Parameters

###### pathOrContent

`string`

File path or content

###### isContent

`boolean` = `false`

true if pathOrContent is content

###### Returns

`Promise`\<`void`\>

###### Example

```ts
await client.loadPreamble('preambles/worker.md');
```

##### initializeConversationHistory()

> **initializeConversationHistory**(): `Promise`\<`void`\>

Defined in: src/orchestrator/llm-client.ts:279

Initialize conversation history with Neo4j

###### Returns

`Promise`\<`void`\>

###### Example

```ts
await client.initializeConversationHistory();
```

##### execute()

> **execute**(`task`, `retryCount`, `circuitBreakerLimit?`, `sessionId?`, `workingDirectory?`): `Promise`\<\{ `output`: `string`; `conversationHistory`: `object`[]; `tokens`: \{ `input`: `number`; `output`: `number`; \}; `toolCalls`: `number`; `intermediateSteps`: `any`[]; `metadata?`: \{ `toolCallCount`: `number`; `messageCount`: `number`; `estimatedContextTokens`: `number`; `qcRecommended`: `boolean`; `circuitBreakerTriggered`: `boolean`; `circuitBreakerReason?`: `string`; `duration`: `number`; \}; \}\>

Defined in: src/orchestrator/llm-client.ts:610

Execute task with LLM agent

###### Parameters

###### task

`string`

Task description

###### retryCount

`number` = `0`

Retry attempt number

###### circuitBreakerLimit?

`number`

Max iterations

###### sessionId?

`string`

###### workingDirectory?

`string`

###### Returns

`Promise`\<\{ `output`: `string`; `conversationHistory`: `object`[]; `tokens`: \{ `input`: `number`; `output`: `number`; \}; `toolCalls`: `number`; `intermediateSteps`: `any`[]; `metadata?`: \{ `toolCallCount`: `number`; `messageCount`: `number`; `estimatedContextTokens`: `number`; `qcRecommended`: `boolean`; `circuitBreakerTriggered`: `boolean`; `circuitBreakerReason?`: `string`; `duration`: `number`; \}; \}\>

###### Example

```ts
const result = await client.execute('Write hello world');
console.log(result.output);
```

## Interfaces

### AgentConfig

Defined in: src/orchestrator/llm-client.ts:28

#### Properties

##### preamblePath

> **preamblePath**: `string`

Defined in: src/orchestrator/llm-client.ts:29

##### model?

> `optional` **model**: `string`

Defined in: src/orchestrator/llm-client.ts:30

##### temperature?

> `optional` **temperature**: `number`

Defined in: src/orchestrator/llm-client.ts:31

##### maxTokens?

> `optional` **maxTokens**: `number`

Defined in: src/orchestrator/llm-client.ts:32

##### tools?

> `optional` **tools**: `StructuredToolInterface`\<`ToolInputSchemaBase`, `any`, `any`\>[]

Defined in: src/orchestrator/llm-client.ts:33

##### provider?

> `optional` **provider**: `string`

Defined in: src/orchestrator/llm-client.ts:36

##### agentType?

> `optional` **agentType**: `"worker"` \| `"pm"` \| `"qc"`

Defined in: src/orchestrator/llm-client.ts:37

##### ollamaBaseUrl?

> `optional` **ollamaBaseUrl**: `string`

Defined in: src/orchestrator/llm-client.ts:40

##### copilotBaseUrl?

> `optional` **copilotBaseUrl**: `string`

Defined in: src/orchestrator/llm-client.ts:41

##### openAIApiKey?

> `optional` **openAIApiKey**: `string`

Defined in: src/orchestrator/llm-client.ts:42

##### fallbackProvider?

> `optional` **fallbackProvider**: `string`

Defined in: src/orchestrator/llm-client.ts:43

## References

### LLMProvider

Re-exports [LLMProvider](types.md#llmprovider)
