[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/types

# orchestrator/types

## Enumerations

### LLMProvider

Defined in: src/orchestrator/types.ts:8

LLM Provider Types

Aliases:
- ollama, llama.cpp: Local LLM provider (Ollama or llama.cpp - interchangeable)
- copilot, openai: OpenAI-compatible endpoint (GitHub Copilot or OpenAI API)

#### Enumeration Members

##### OLLAMA

> **OLLAMA**: `"ollama"`

Defined in: src/orchestrator/types.ts:9

##### COPILOT

> **COPILOT**: `"copilot"`

Defined in: src/orchestrator/types.ts:10

##### OPENAI

> **OPENAI**: `"openai"`

Defined in: src/orchestrator/types.ts:11

## Functions

### normalizeProvider()

> **normalizeProvider**(`providerName`): [`LLMProvider`](#llmprovider)

Defined in: src/orchestrator/types.ts:20

Normalize provider name to canonical value
Handles aliases:
- llama.cpp → openai (llama.cpp is OpenAI-compatible)
- copilot → openai

#### Parameters

##### providerName

`string` | `undefined`

#### Returns

[`LLMProvider`](#llmprovider)

***

### fetchAvailableModels()

> **fetchAvailableModels**(`apiUrl`, `timeoutMs`): `Promise`\<`object`[]\>

Defined in: src/orchestrator/types.ts:56

Fetch available models from LLM provider endpoint
Queries the configured LLM provider's /v1/models endpoint for available models

#### Parameters

##### apiUrl

`string`

Base URL of the LLM provider API (e.g., http://localhost:11434/v1)

##### timeoutMs

`number` = `5000`

Timeout in milliseconds (default: 5000)

#### Returns

`Promise`\<`object`[]\>

Promise of model list with id and owned_by fields

#### Example

```ts
const models = await fetchAvailableModels('http://copilot-api:4141/v1');
console.log(models.map(m => m.id));
```
