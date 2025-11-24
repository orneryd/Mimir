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

Defined in: src/tools/vectorSearch.tools.ts:118

Handle vector_search_nodes tool call - Semantic search across all nodes

#### Parameters

##### params

`any`

Search parameters

##### driver

`Driver`

Neo4j driver instance

#### Returns

`Promise`\<`any`\>

Promise with search results and metadata

#### Description

Performs semantic search using vector embeddings to find nodes
by meaning rather than exact keywords. Automatically falls back to full-text
search if embeddings are disabled or no results found. Supports multi-hop
graph traversal to discover connected nodes at specified depth.

#### Examples

```typescript
// Basic semantic search
const result = await handleVectorSearchNodes({
  query: 'authentication implementation',
  limit: 10
}, driver);
// Returns: { results: [...], total_candidates: 10, search_method: 'vector' }
```

```typescript
// Search specific node types
const result = await handleVectorSearchNodes({
  query: 'database connection',
  types: ['file', 'file_chunk'],
  limit: 20,
  min_similarity: 0.8
}, driver);
```

```typescript
// Multi-hop search to find connected nodes
const result = await handleVectorSearchNodes({
  query: 'user authentication',
  depth: 2,
  limit: 15
}, driver);
// Returns direct matches + connected nodes within 2 hops
```

***

### handleGetEmbeddingStats()

> **handleGetEmbeddingStats**(`params`, `driver`): `Promise`\<`any`\>

Defined in: src/tools/vectorSearch.tools.ts:288

Handle get_embedding_stats tool call - Get embedding statistics

#### Parameters

##### params

`any`

No parameters required

##### driver

`Driver`

Neo4j driver instance

#### Returns

`Promise`\<`any`\>

Promise with embedding statistics

#### Description

Returns statistics about nodes with vector embeddings,
broken down by node type. Useful for monitoring indexing progress
and understanding what content is available for semantic search.

#### Examples

```typescript
// Get embedding statistics
const result = await handleGetEmbeddingStats({}, driver);
// Returns: {
//   status: 'success',
//   embeddings_enabled: true,
//   total_nodes_with_embeddings: 1523,
//   breakdown_by_type: {
//     file_chunk: 1200,
//     todo: 150,
//     memory: 100,
//     file: 73
//   }
// }
```

```typescript
// Check if embeddings are enabled
const stats = await handleGetEmbeddingStats({}, driver);
if (stats.embeddings_enabled) {
  console.log(`${stats.total_nodes_with_embeddings} nodes indexed`);
}
```
