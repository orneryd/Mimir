[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / utils/reciprocal-rank-fusion

# utils/reciprocal-rank-fusion

## Classes

### ReciprocalRankFusion

Defined in: src/utils/reciprocal-rank-fusion.ts:79

Reciprocal Rank Fusion implementation

#### Constructors

##### Constructor

> **new ReciprocalRankFusion**(`config`): [`ReciprocalRankFusion`](#reciprocalrankfusion)

Defined in: src/utils/reciprocal-rank-fusion.ts:82

###### Parameters

###### config

`Partial`\<[`RRFConfig`](#rrfconfig)\> = `{}`

###### Returns

[`ReciprocalRankFusion`](#reciprocalrankfusion)

#### Methods

##### fuse()

> **fuse**(`vectorResults`, `bm25Results`): [`RRFResult`](#rrfresult)[]

Defined in: src/utils/reciprocal-rank-fusion.ts:125

Fuse multiple ranked lists using Reciprocal Rank Fusion

Combines results from vector search (semantic) and BM25 search (keyword)
into a single ranked list. This hybrid approach leverages the strengths
of both search methods:
- Vector search: Understands semantic meaning and context
- BM25 search: Excels at exact keyword matching

The RRF formula gives higher scores to documents that appear in both
result sets and rank highly in either. Documents appearing in only one
result set can still score well if they rank highly there.

###### Parameters

###### vectorResults

[`SearchResult`](#searchresult)[]

Results from vector/semantic search, ranked by cosine similarity

###### bm25Results

[`SearchResult`](#searchresult)[]

Results from BM25 keyword search, ranked by relevance score

###### Returns

[`RRFResult`](#rrfresult)[]

Fused results sorted by RRF score (highest first), with rank metadata

###### Example

```ts
const rrf = new ReciprocalRankFusion({ k: 60 });

const vectorResults = [
  { id: 'doc1', title: 'Machine Learning', similarity: 0.95, ... },
  { id: 'doc2', title: 'Deep Learning', similarity: 0.88, ... }
];

const bm25Results = [
  { id: 'doc2', title: 'Deep Learning', ... },
  { id: 'doc3', title: 'Neural Networks', ... }
];

const fused = rrf.fuse(vectorResults, bm25Results);
// doc2 appears in both lists, so it gets highest RRF score
// Result: [doc2, doc1, doc3] with rrfScore, vectorRank, bm25Rank
```

##### getAdaptiveConfig()

> `static` **getAdaptiveConfig**(`query`): [`RRFConfig`](#rrfconfig)

Defined in: src/utils/reciprocal-rank-fusion.ts:225

Get adaptive RRF configuration based on query characteristics

Automatically selects the best RRF profile based on query length:
- Short queries (1-2 words): Emphasize keyword matching (KEYWORD profile)
  Example: "docker compose" → Better with exact term matching
- Long queries (6+ words): Emphasize semantic understanding (SEMANTIC profile)
  Example: "How do I configure Docker containers for production?" → Better with semantic search
- Medium queries (3-5 words): Balanced approach (BALANCED profile)
  Example: "configure docker production" → Equal weight to both

This adaptive approach improves search quality without requiring manual
configuration for each query type.

###### Parameters

###### query

`string`

The search query string

###### Returns

[`RRFConfig`](#rrfconfig)

Optimized RRF configuration for the query type

###### Example

```ts
// Short query - emphasizes keyword matching
const config1 = ReciprocalRankFusion.getAdaptiveConfig('docker');
// Returns: { k: 60, vectorWeight: 0.5, bm25Weight: 1.5, ... }

// Long query - emphasizes semantic understanding
const config2 = ReciprocalRankFusion.getAdaptiveConfig(
  'How do I set up a development environment with Docker and Node.js?'
);
// Returns: { k: 60, vectorWeight: 1.5, bm25Weight: 0.5, ... }

// Use adaptive config for search
const rrf = new ReciprocalRankFusion(
  ReciprocalRankFusion.getAdaptiveConfig(userQuery)
);
const results = rrf.fuse(vectorResults, bm25Results);
```

## Interfaces

### RRFConfig

Defined in: src/utils/reciprocal-rank-fusion.ts:19

Reciprocal Rank Fusion (RRF)

Industry-standard method for combining ranked lists from multiple search algorithms.
Used by Azure AI Search, Google Cloud, Weaviate, Elasticsearch, and others.

Formula: RRF_score(doc) = Σ (weight_i / (k + rank_i))

Where:
- k = constant (typically 60)
- rank_i = rank of document in result set i (1-indexed)
- weight_i = importance weight for result set i

References:
- https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf (Original paper)
- https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking

#### Properties

##### k

> **k**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:20

##### vectorWeight

> **vectorWeight**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:21

##### bm25Weight

> **bm25Weight**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:22

##### minScore

> **minScore**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:23

***

### SearchResult

Defined in: src/utils/reciprocal-rank-fusion.ts:26

#### Extended by

- [`RRFResult`](#rrfresult)

#### Indexable

\[`key`: `string`\]: `any`

#### Properties

##### id

> **id**: `string`

Defined in: src/utils/reciprocal-rank-fusion.ts:27

##### type

> **type**: `string`

Defined in: src/utils/reciprocal-rank-fusion.ts:28

##### title

> **title**: `string` \| `null`

Defined in: src/utils/reciprocal-rank-fusion.ts:29

##### description

> **description**: `string` \| `null`

Defined in: src/utils/reciprocal-rank-fusion.ts:30

##### content\_preview

> **content\_preview**: `string`

Defined in: src/utils/reciprocal-rank-fusion.ts:31

##### similarity?

> `optional` **similarity**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:32

##### avg\_similarity?

> `optional` **avg\_similarity**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:33

***

### RRFResult

Defined in: src/utils/reciprocal-rank-fusion.ts:37

#### Extends

- [`SearchResult`](#searchresult)

#### Indexable

\[`key`: `string`\]: `any`

#### Properties

##### id

> **id**: `string`

Defined in: src/utils/reciprocal-rank-fusion.ts:27

###### Inherited from

[`SearchResult`](#searchresult).[`id`](#id)

##### type

> **type**: `string`

Defined in: src/utils/reciprocal-rank-fusion.ts:28

###### Inherited from

[`SearchResult`](#searchresult).[`type`](#type)

##### title

> **title**: `string` \| `null`

Defined in: src/utils/reciprocal-rank-fusion.ts:29

###### Inherited from

[`SearchResult`](#searchresult).[`title`](#title)

##### description

> **description**: `string` \| `null`

Defined in: src/utils/reciprocal-rank-fusion.ts:30

###### Inherited from

[`SearchResult`](#searchresult).[`description`](#description)

##### content\_preview

> **content\_preview**: `string`

Defined in: src/utils/reciprocal-rank-fusion.ts:31

###### Inherited from

[`SearchResult`](#searchresult).[`content_preview`](#content_preview)

##### similarity?

> `optional` **similarity**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:32

###### Inherited from

[`SearchResult`](#searchresult).[`similarity`](#similarity)

##### avg\_similarity?

> `optional` **avg\_similarity**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:33

###### Inherited from

[`SearchResult`](#searchresult).[`avg_similarity`](#avg_similarity)

##### rrfScore

> **rrfScore**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:38

##### vectorRank?

> `optional` **vectorRank**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:39

##### bm25Rank?

> `optional` **bm25Rank**: `number`

Defined in: src/utils/reciprocal-rank-fusion.ts:40

## Variables

### DEFAULT\_RRF\_CONFIG

> `const` **DEFAULT\_RRF\_CONFIG**: [`RRFConfig`](#rrfconfig)

Defined in: src/utils/reciprocal-rank-fusion.ts:47

Default RRF configuration
k=60 is the standard value from research

***

### RRF\_PROFILES

> `const` **RRF\_PROFILES**: `object`

Defined in: src/utils/reciprocal-rank-fusion.ts:57

Adaptive RRF profiles for different query types

#### Type Declaration

##### SEMANTIC

> **SEMANTIC**: `object`

###### SEMANTIC.k

> **k**: `number`

###### SEMANTIC.minScore

> **minScore**: `number`

###### SEMANTIC.vectorWeight

> **vectorWeight**: `number` = `1.5`

###### SEMANTIC.bm25Weight

> **bm25Weight**: `number` = `0.5`

##### KEYWORD

> **KEYWORD**: `object`

###### KEYWORD.k

> **k**: `number`

###### KEYWORD.minScore

> **minScore**: `number`

###### KEYWORD.vectorWeight

> **vectorWeight**: `number` = `0.5`

###### KEYWORD.bm25Weight

> **bm25Weight**: `number` = `1.5`

##### BALANCED

> **BALANCED**: [`RRFConfig`](#rrfconfig) = `DEFAULT_RRF_CONFIG`
