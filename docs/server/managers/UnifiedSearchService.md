[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / managers/UnifiedSearchService

# managers/UnifiedSearchService

## Classes

### UnifiedSearchService

Defined in: src/managers/UnifiedSearchService.ts:75

#### Constructors

##### Constructor

> **new UnifiedSearchService**(`driver`): [`UnifiedSearchService`](#unifiedsearchservice)

Defined in: src/managers/UnifiedSearchService.ts:80

###### Parameters

###### driver

`Driver`

###### Returns

[`UnifiedSearchService`](#unifiedsearchservice)

#### Methods

##### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: src/managers/UnifiedSearchService.ts:113

Initialize the embeddings service for semantic search

Sets up vector embeddings support for semantic search. If initialization fails,
the service falls back to full-text search only. Safe to call multiple times.

###### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

###### Examples

```ts
// Initialize on service startup
const searchService = new UnifiedSearchService(driver);
await searchService.initialize();
console.log('Search service ready');
```

```ts
// Automatic initialization on first search
const searchService = new UnifiedSearchService(driver);
// No need to call initialize() - happens automatically
const results = await searchService.search('authentication');
```

```ts
// Handle initialization errors gracefully
try {
  await searchService.initialize();
} catch (error) {
  console.warn('Embeddings disabled, using full-text only');
}
```

##### search()

> **search**(`query`, `options`): `Promise`\<[`UnifiedSearchResponse`](#unifiedsearchresponse)\>

Defined in: src/managers/UnifiedSearchService.ts:195

Unified search with automatic semantic and keyword search

Intelligently combines vector similarity search (semantic) with BM25 full-text
search (keyword) using Reciprocal Rank Fusion (RRF). Automatically falls back
to full-text only if embeddings are disabled.

Search Strategy:
1. If embeddings enabled: RRF hybrid search (vector + BM25)
2. If embeddings disabled: Full-text search only

###### Parameters

###### query

`string`

Search query string

###### options

[`UnifiedSearchOptions`](#unifiedsearchoptions) = `{}`

Search options (types, limit, similarity threshold, RRF config)

###### Returns

`Promise`\<[`UnifiedSearchResponse`](#unifiedsearchresponse)\>

Search response with results and metadata

###### Examples

```ts
// Basic semantic search
const response = await searchService.search('user authentication');
console.log(`Found ${response.returned} results`);
for (const result of response.results) {
  console.log(`${result.title}: ${result.similarity}`);
}
```

```ts
// Search specific node types with limit
const response = await searchService.search('API endpoint', {
  types: ['file', 'memory'],
  limit: 10,
  minSimilarity: 0.7
});
console.log(`Method: ${response.search_method}`);
```

```ts
// Advanced RRF hybrid search configuration
const response = await searchService.search('database query', {
  types: ['file'],
  limit: 20,
  rrfK: 60,              // RRF constant (higher = less top-rank bias)
  rrfVectorWeight: 1.5,  // Boost semantic results
  rrfBm25Weight: 1.0,    // Standard keyword weight
  rrfMinScore: 0.01      // Filter low-relevance results
});
```

```ts
// Handle search with pagination
const page1 = await searchService.search('React components', {
  limit: 10,
  offset: 0
});
const page2 = await searchService.search('React components', {
  limit: 10,
  offset: 10
});
```

```ts
// Search with fallback detection
const response = await searchService.search('error handling');
if (response.fallback_triggered) {
  console.log('Used full-text fallback');
}
if (response.search_method === 'rrf_hybrid') {
  console.log('Used hybrid semantic + keyword search');
}
```

##### isEmbeddingsEnabled()

> **isEmbeddingsEnabled**(): `boolean`

Defined in: src/managers/UnifiedSearchService.ts:658

Check if vector embeddings are enabled for semantic search

Returns true if the embeddings service is initialized and functional.
Use this to determine if semantic search is available.

###### Returns

`boolean`

True if embeddings enabled, false otherwise

###### Examples

```ts
// Check before using vector-specific features
if (searchService.isEmbeddingsEnabled()) {
  console.log('Semantic search available');
} else {
  console.log('Using keyword search only');
}
```

```ts
// Conditional search strategy
const searchService = new UnifiedSearchService(driver);
await searchService.initialize();

if (searchService.isEmbeddingsEnabled()) {
  // Use semantic search for conceptual queries
  const results = await searchService.search('authentication patterns');
} else {
  // Use exact keyword matching
  const results = await searchService.search('AuthService.login');
}
```

##### getEmbeddingsService()

> **getEmbeddingsService**(): [`EmbeddingsService`](../indexing/EmbeddingsService.md#embeddingsservice)

Defined in: src/managers/UnifiedSearchService.ts:683

Get the underlying embeddings service instance

Provides direct access to the embeddings service for advanced use cases
like generating custom embeddings or checking embedding statistics.

###### Returns

[`EmbeddingsService`](../indexing/EmbeddingsService.md#embeddingsservice)

EmbeddingsService instance

###### Examples

```ts
// Generate custom embedding
const embeddingsService = searchService.getEmbeddingsService();
const result = await embeddingsService.generateEmbedding('custom text');
console.log(`Embedding dimensions: ${result.dimensions}`);
```

```ts
// Check embedding model info
const embeddingsService = searchService.getEmbeddingsService();
if (embeddingsService.isEnabled()) {
  console.log('Using embeddings for semantic search');
}
```

## Interfaces

### SearchResult

Defined in: src/managers/UnifiedSearchService.ts:21

#### Properties

##### id

> **id**: `string`

Defined in: src/managers/UnifiedSearchService.ts:22

##### type

> **type**: `string`

Defined in: src/managers/UnifiedSearchService.ts:23

##### title

> **title**: `string` \| `null`

Defined in: src/managers/UnifiedSearchService.ts:24

##### description

> **description**: `string` \| `null`

Defined in: src/managers/UnifiedSearchService.ts:25

##### similarity?

> `optional` **similarity**: `number`

Defined in: src/managers/UnifiedSearchService.ts:26

##### avg\_similarity?

> `optional` **avg\_similarity**: `number`

Defined in: src/managers/UnifiedSearchService.ts:27

##### relevance?

> `optional` **relevance**: `number`

Defined in: src/managers/UnifiedSearchService.ts:28

##### content\_preview

> **content\_preview**: `string`

Defined in: src/managers/UnifiedSearchService.ts:29

##### path?

> `optional` **path**: `string`

Defined in: src/managers/UnifiedSearchService.ts:30

##### absolute\_path?

> `optional` **absolute\_path**: `string`

Defined in: src/managers/UnifiedSearchService.ts:31

##### chunk\_text?

> `optional` **chunk\_text**: `string`

Defined in: src/managers/UnifiedSearchService.ts:32

##### chunk\_index?

> `optional` **chunk\_index**: `number`

Defined in: src/managers/UnifiedSearchService.ts:33

##### chunks\_matched?

> `optional` **chunks\_matched**: `number`

Defined in: src/managers/UnifiedSearchService.ts:34

##### parent\_file?

> `optional` **parent\_file**: `object`

Defined in: src/managers/UnifiedSearchService.ts:35

###### path

> **path**: `string`

###### absolute\_path?

> `optional` **absolute\_path**: `string`

###### name

> **name**: `string`

###### language

> **language**: `string`

***

### UnifiedSearchOptions

Defined in: src/managers/UnifiedSearchService.ts:43

#### Properties

##### types?

> `optional` **types**: `string`[]

Defined in: src/managers/UnifiedSearchService.ts:44

##### limit?

> `optional` **limit**: `number`

Defined in: src/managers/UnifiedSearchService.ts:45

##### minSimilarity?

> `optional` **minSimilarity**: `number`

Defined in: src/managers/UnifiedSearchService.ts:46

##### offset?

> `optional` **offset**: `number`

Defined in: src/managers/UnifiedSearchService.ts:47

##### rrfK?

> `optional` **rrfK**: `number`

Defined in: src/managers/UnifiedSearchService.ts:50

##### rrfVectorWeight?

> `optional` **rrfVectorWeight**: `number`

Defined in: src/managers/UnifiedSearchService.ts:51

##### rrfBm25Weight?

> `optional` **rrfBm25Weight**: `number`

Defined in: src/managers/UnifiedSearchService.ts:52

##### rrfMinScore?

> `optional` **rrfMinScore**: `number`

Defined in: src/managers/UnifiedSearchService.ts:53

***

### UnifiedSearchResponse

Defined in: src/managers/UnifiedSearchService.ts:56

#### Properties

##### status

> **status**: `"success"` \| `"error"`

Defined in: src/managers/UnifiedSearchService.ts:57

##### query

> **query**: `string`

Defined in: src/managers/UnifiedSearchService.ts:58

##### results

> **results**: [`SearchResult`](#searchresult)[]

Defined in: src/managers/UnifiedSearchService.ts:59

##### total\_candidates

> **total\_candidates**: `number`

Defined in: src/managers/UnifiedSearchService.ts:60

##### returned

> **returned**: `number`

Defined in: src/managers/UnifiedSearchService.ts:61

##### search\_method

> **search\_method**: `"rrf_hybrid"` \| `"fulltext"`

Defined in: src/managers/UnifiedSearchService.ts:62

##### fallback\_triggered?

> `optional` **fallback\_triggered**: `boolean`

Defined in: src/managers/UnifiedSearchService.ts:63

##### message?

> `optional` **message**: `string`

Defined in: src/managers/UnifiedSearchService.ts:64

##### advanced\_metrics?

> `optional` **advanced\_metrics**: `object`

Defined in: src/managers/UnifiedSearchService.ts:65

###### stage1Time

> **stage1Time**: `number`

###### stage2Time

> **stage2Time**: `number`

###### stage3Time

> **stage3Time**: `number`

###### stage4Time

> **stage4Time**: `number`

###### totalTime

> **totalTime**: `number`

###### candidatesPerMethod

> **candidatesPerMethod**: `Record`\<`string`, `number`\>
