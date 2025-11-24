[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / config/LLMConfigLoader

# config/LLMConfigLoader

## Classes

### LLMConfigLoader

Defined in: src/config/LLMConfigLoader.ts:78

#### Methods

##### getInstance()

> `static` **getInstance**(): [`LLMConfigLoader`](#llmconfigloader)

Defined in: src/config/LLMConfigLoader.ts:86

###### Returns

[`LLMConfigLoader`](#llmconfigloader)

##### resetCache()

> **resetCache**(): `void`

Defined in: src/config/LLMConfigLoader.ts:96

Reset cached config (for testing)

###### Returns

`void`

##### load()

> **load**(): `Promise`\<[`LLMConfig`](#llmconfig)\>

Defined in: src/config/LLMConfigLoader.ts:221

Load LLM configuration from environment and defaults

###### Returns

`Promise`\<[`LLMConfig`](#llmconfig)\>

Complete LLM configuration with provider settings

###### Example

```ts
const loader = LLMConfigLoader.getInstance();
const config = await loader.load();
console.log('Default provider:', config.defaultProvider);
```

##### getModelConfig()

> **getModelConfig**(`provider`, `model`): `Promise`\<[`ModelConfig`](#modelconfig)\>

Defined in: src/config/LLMConfigLoader.ts:578

Get configuration for specific model

###### Parameters

###### provider

`string`

Provider name (e.g., 'copilot', 'ollama')

###### model

`string`

Model name

###### Returns

`Promise`\<[`ModelConfig`](#modelconfig)\>

Model configuration with context window and capabilities

###### Example

```ts
const config = await loader.getModelConfig('copilot', 'gpt-4o');
console.log('Context window:', config.contextWindow);
```

##### getContextWindow()

> **getContextWindow**(`provider`, `model`): `Promise`\<`number`\>

Defined in: src/config/LLMConfigLoader.ts:609

###### Parameters

###### provider

`string`

###### model

`string`

###### Returns

`Promise`\<`number`\>

##### validateContextSize()

> **validateContextSize**(`provider`, `model`, `tokenCount`): `Promise`\<\{ `valid`: `boolean`; `warning?`: `string`; \}\>

Defined in: src/config/LLMConfigLoader.ts:614

###### Parameters

###### provider

`string`

###### model

`string`

###### tokenCount

`number`

###### Returns

`Promise`\<\{ `valid`: `boolean`; `warning?`: `string`; \}\>

##### getAgentDefaults()

> **getAgentDefaults**(`agentType`): `Promise`\<\{ `provider`: `string`; `model`: `string`; \}\>

Defined in: src/config/LLMConfigLoader.ts:654

Get default provider and model for agent type

###### Parameters

###### agentType

Type of agent ('pm', 'worker', 'qc')

`"worker"` | `"pm"` | `"qc"`

###### Returns

`Promise`\<\{ `provider`: `string`; `model`: `string`; \}\>

Default provider and model for agent type

###### Example

```ts
const defaults = await loader.getAgentDefaults('worker');
console.log(`Worker uses: ${defaults.provider}/${defaults.model}`);
```

##### displayModelWarnings()

> **displayModelWarnings**(`provider`, `model`): `Promise`\<`void`\>

Defined in: src/config/LLMConfigLoader.ts:675

###### Parameters

###### provider

`string`

###### model

`string`

###### Returns

`Promise`\<`void`\>

##### isPMModelSuggestionsEnabled()

> **isPMModelSuggestionsEnabled**(): `Promise`\<`boolean`\>

Defined in: src/config/LLMConfigLoader.ts:696

Check if PM model suggestions feature is enabled

###### Returns

`Promise`\<`boolean`\>

true if PM can suggest models for tasks

###### Example

```ts
if (await loader.isPMModelSuggestionsEnabled()) {
  console.log('PM can suggest models');
}
```

##### isVectorEmbeddingsEnabled()

> **isVectorEmbeddingsEnabled**(): `Promise`\<`boolean`\>

Defined in: src/config/LLMConfigLoader.ts:710

Check if vector embeddings are enabled

###### Returns

`Promise`\<`boolean`\>

true if embeddings generation is enabled

###### Example

```ts
if (await loader.isVectorEmbeddingsEnabled()) {
  await generateEmbeddings();
}
```

##### getEmbeddingsConfig()

> **getEmbeddingsConfig**(): `Promise`\<[`EmbeddingsConfig`](#embeddingsconfig) \| `null`\>

Defined in: src/config/LLMConfigLoader.ts:725

Get embeddings configuration

###### Returns

`Promise`\<[`EmbeddingsConfig`](#embeddingsconfig) \| `null`\>

Embeddings config or null if disabled

###### Example

```ts
const embConfig = await loader.getEmbeddingsConfig();
if (embConfig) {
  console.log('Model:', embConfig.model);
}
```

##### getAvailableModels()

> **getAvailableModels**(`provider?`): `Promise`\<`object`[]\>

Defined in: src/config/LLMConfigLoader.ts:733

###### Parameters

###### provider?

`string`

###### Returns

`Promise`\<`object`[]\>

##### formatAvailableModelsForPM()

> **formatAvailableModelsForPM**(): `Promise`\<`string`\>

Defined in: src/config/LLMConfigLoader.ts:769

###### Returns

`Promise`\<`string`\>

## Interfaces

### ModelConfig

Defined in: src/config/LLMConfigLoader.ts:11

#### Properties

##### name

> **name**: `string`

Defined in: src/config/LLMConfigLoader.ts:12

##### contextWindow

> **contextWindow**: `number`

Defined in: src/config/LLMConfigLoader.ts:13

##### extendedContextWindow?

> `optional` **extendedContextWindow**: `number`

Defined in: src/config/LLMConfigLoader.ts:14

##### description

> **description**: `string`

Defined in: src/config/LLMConfigLoader.ts:15

##### recommendedFor

> **recommendedFor**: `string`[]

Defined in: src/config/LLMConfigLoader.ts:16

##### config

> **config**: `Record`\<`string`, `any`\>

Defined in: src/config/LLMConfigLoader.ts:17

##### costPerMToken?

> `optional` **costPerMToken**: `object`

Defined in: src/config/LLMConfigLoader.ts:18

###### input

> **input**: `number`

###### output

> **output**: `number`

##### warnings?

> `optional` **warnings**: `string`[]

Defined in: src/config/LLMConfigLoader.ts:22

##### supportsTools?

> `optional` **supportsTools**: `boolean`

Defined in: src/config/LLMConfigLoader.ts:23

***

### ProviderConfig

Defined in: src/config/LLMConfigLoader.ts:26

#### Properties

##### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: src/config/LLMConfigLoader.ts:27

##### defaultModel

> **defaultModel**: `string`

Defined in: src/config/LLMConfigLoader.ts:28

##### models

> **models**: `Record`\<`string`, [`ModelConfig`](#modelconfig)\>

Defined in: src/config/LLMConfigLoader.ts:29

##### enabled?

> `optional` **enabled**: `boolean`

Defined in: src/config/LLMConfigLoader.ts:30

##### requiresAuth?

> `optional` **requiresAuth**: `boolean`

Defined in: src/config/LLMConfigLoader.ts:31

##### authInstructions?

> `optional` **authInstructions**: `string`

Defined in: src/config/LLMConfigLoader.ts:32

***

### EmbeddingsConfig

Defined in: src/config/LLMConfigLoader.ts:35

#### Properties

##### enabled

> **enabled**: `boolean`

Defined in: src/config/LLMConfigLoader.ts:36

##### provider

> **provider**: `string`

Defined in: src/config/LLMConfigLoader.ts:37

##### model

> **model**: `string`

Defined in: src/config/LLMConfigLoader.ts:38

##### dimensions?

> `optional` **dimensions**: `number`

Defined in: src/config/LLMConfigLoader.ts:39

##### chunkSize?

> `optional` **chunkSize**: `number`

Defined in: src/config/LLMConfigLoader.ts:40

##### chunkOverlap?

> `optional` **chunkOverlap**: `number`

Defined in: src/config/LLMConfigLoader.ts:41

##### images?

> `optional` **images**: `object`

Defined in: src/config/LLMConfigLoader.ts:43

###### enabled

> **enabled**: `boolean`

###### describeMode

> **describeMode**: `boolean`

###### maxPixels

> **maxPixels**: `number`

###### targetSize

> **targetSize**: `number`

###### resizeQuality

> **resizeQuality**: `number`

##### vl?

> `optional` **vl**: `object`

Defined in: src/config/LLMConfigLoader.ts:51

###### provider

> **provider**: `string`

###### api

> **api**: `string`

###### apiPath

> **apiPath**: `string`

###### apiKey

> **apiKey**: `string`

###### model

> **model**: `string`

###### contextSize

> **contextSize**: `number`

###### maxTokens

> **maxTokens**: `number`

###### temperature

> **temperature**: `number`

###### dimensions?

> `optional` **dimensions**: `number`

***

### LLMConfig

Defined in: src/config/LLMConfigLoader.ts:64

#### Properties

##### defaultProvider

> **defaultProvider**: `string`

Defined in: src/config/LLMConfigLoader.ts:65

##### providers

> **providers**: `Record`\<`string`, [`ProviderConfig`](#providerconfig)\>

Defined in: src/config/LLMConfigLoader.ts:66

##### agentDefaults?

> `optional` **agentDefaults**: `Record`\<`string`, \{ `provider`: `string`; `model`: `string`; `rationale`: `string`; \}\>

Defined in: src/config/LLMConfigLoader.ts:67

##### embeddings?

> `optional` **embeddings**: [`EmbeddingsConfig`](#embeddingsconfig)

Defined in: src/config/LLMConfigLoader.ts:72

##### features?

> `optional` **features**: `object`

Defined in: src/config/LLMConfigLoader.ts:73

###### pmModelSuggestions?

> `optional` **pmModelSuggestions**: `boolean`
