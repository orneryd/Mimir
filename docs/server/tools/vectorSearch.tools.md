[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / tools/vectorSearch.tools

# tools/vectorSearch.tools

## Functions

### createVectorSearchTools()

> **createVectorSearchTools**(`driver`): `object`[]

Defined in: src/tools/vectorSearch.tools.ts:11

#### Parameters

##### driver

`Driver`

#### Returns

`object`[]

***

### handleVectorSearchNodes()

> **handleVectorSearchNodes**(`params`, `driver`): `Promise`\<`any`\>

Defined in: src/tools/vectorSearch.tools.ts:73

Handle vector_search_nodes tool call
Uses UnifiedSearchService for automatic fallback
Supports multi-hop graph traversal when depth > 1

#### Parameters

##### params

`any`

##### driver

`Driver`

#### Returns

`Promise`\<`any`\>

***

### handleGetEmbeddingStats()

> **handleGetEmbeddingStats**(`params`, `driver`): `Promise`\<`any`\>

Defined in: src/tools/vectorSearch.tools.ts:208

Handle get_embedding_stats tool call

#### Parameters

##### params

`any`

##### driver

`Driver`

#### Returns

`Promise`\<`any`\>
