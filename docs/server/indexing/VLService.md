[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / indexing/VLService

# indexing/VLService

## Classes

### VLService

Defined in: src/indexing/VLService.ts:30

#### Constructors

##### Constructor

> **new VLService**(`config`): [`VLService`](#vlservice)

Defined in: src/indexing/VLService.ts:34

###### Parameters

###### config

[`VLConfig`](#vlconfig)

###### Returns

[`VLService`](#vlservice)

#### Methods

##### describeImage()

> **describeImage**(`imageDataURL`, `prompt`): `Promise`\<[`VLDescriptionResult`](#vldescriptionresult)\>

Defined in: src/indexing/VLService.ts:80

Generate a text description of an image using vision-language model

Sends image to VL model (e.g., qwen2.5-vl) to generate natural language
description. Used for making images searchable via text embeddings.

###### Parameters

###### imageDataURL

`string`

Image as data URL (data:image/jpeg;base64,...)

###### prompt

`string` = `"Describe this image in detail. What do you see?"`

Instruction prompt for VL model

###### Returns

`Promise`\<[`VLDescriptionResult`](#vldescriptionresult)\>

Description result with text, model info, and timing

###### Throws

If VL service is disabled or API call fails

###### Examples

```ts
const vlService = new VLService({
  provider: 'llama.cpp',
  api: 'http://localhost:8080',
  apiPath: '/v1/chat/completions',
  apiKey: 'none',
  model: 'qwen2.5-vl',
  contextSize: 4096,
  maxTokens: 500,
  temperature: 0.7
});

const result = await vlService.describeImage(dataURL);
console.log('Description:', result.description);
console.log('Processing time:', result.processingTimeMs, 'ms');
```

```ts
// Custom prompt for specific analysis
const result = await vlService.describeImage(
  imageDataURL,
  'Describe the architecture diagram. What components are shown?'
);
console.log('Analysis:', result.description);
```

```ts
// Use description for embedding
const vlResult = await vlService.describeImage(imageDataURL);
const embedding = await embeddingsService.generateEmbedding(vlResult.description);
await storeImageEmbedding(imagePath, embedding);
```

##### testConnection()

> **testConnection**(): `Promise`\<`boolean`\>

Defined in: src/indexing/VLService.ts:182

Test VL service connectivity and availability

Sends a minimal test image to verify the VL API is accessible
and responding correctly. Use during initialization.

###### Returns

`Promise`\<`boolean`\>

true if connection successful, false otherwise

###### Examples

```ts
const vlService = new VLService(config);
const isAvailable = await vlService.testConnection();
if (isAvailable) {
  console.log('VL service ready');
} else {
  console.warn('VL service unavailable');
}
```

```ts
// Check before enabling image indexing
if (await vlService.testConnection()) {
  await indexImagesWithDescriptions();
} else {
  console.log('Skipping image indexing - VL service offline');
}
```

## Interfaces

### VLConfig

Defined in: src/indexing/VLService.ts:12

#### Properties

##### provider

> **provider**: `string`

Defined in: src/indexing/VLService.ts:13

##### api

> **api**: `string`

Defined in: src/indexing/VLService.ts:14

##### apiPath

> **apiPath**: `string`

Defined in: src/indexing/VLService.ts:15

##### apiKey

> **apiKey**: `string`

Defined in: src/indexing/VLService.ts:16

##### model

> **model**: `string`

Defined in: src/indexing/VLService.ts:17

##### contextSize

> **contextSize**: `number`

Defined in: src/indexing/VLService.ts:18

##### maxTokens

> **maxTokens**: `number`

Defined in: src/indexing/VLService.ts:19

##### temperature

> **temperature**: `number`

Defined in: src/indexing/VLService.ts:20

***

### VLDescriptionResult

Defined in: src/indexing/VLService.ts:23

#### Properties

##### description

> **description**: `string`

Defined in: src/indexing/VLService.ts:24

##### model

> **model**: `string`

Defined in: src/indexing/VLService.ts:25

##### tokensUsed

> **tokensUsed**: `number`

Defined in: src/indexing/VLService.ts:26

##### processingTimeMs

> **processingTimeMs**: `number`

Defined in: src/indexing/VLService.ts:27
