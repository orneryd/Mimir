[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / indexing/EmbeddingsService

# indexing/EmbeddingsService

## Classes

### EmbeddingsService

Defined in: src/indexing/EmbeddingsService.ts:101

#### Constructors

##### Constructor

> **new EmbeddingsService**(): [`EmbeddingsService`](#embeddingsservice)

Defined in: src/indexing/EmbeddingsService.ts:109

###### Returns

[`EmbeddingsService`](#embeddingsservice)

#### Properties

##### enabled

> **enabled**: `boolean` = `false`

Defined in: src/indexing/EmbeddingsService.ts:103

#### Methods

##### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: src/indexing/EmbeddingsService.ts:145

Initialize the embeddings service with provider configuration

Loads embeddings configuration from LLM config and sets up the provider
(Ollama, OpenAI, or Copilot). If embeddings are disabled in config or
initialization fails, the service gracefully falls back to disabled state.

###### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

###### Examples

```ts
// Initialize with Ollama (local embeddings)
const embeddingsService = new EmbeddingsService();
await embeddingsService.initialize();
if (embeddingsService.isEnabled()) {
  console.log('Using local Ollama embeddings');
}
```

```ts
// Initialize with OpenAI embeddings
// Set MIMIR_EMBEDDINGS_API_KEY=sk-... in environment
const embeddingsService = new EmbeddingsService();
await embeddingsService.initialize();
console.log('Embeddings provider:', embeddingsService.isEnabled());
```

```ts
// Handle disabled embeddings gracefully
const embeddingsService = new EmbeddingsService();
await embeddingsService.initialize();
if (!embeddingsService.isEnabled()) {
  console.log('Embeddings disabled, using full-text search only');
}
```

##### isEnabled()

> **isEnabled**(): `boolean`

Defined in: src/indexing/EmbeddingsService.ts:208

Check if vector embeddings are enabled and ready to use

Returns true if the service initialized successfully and embeddings
are configured. Use this before calling embedding generation methods.

###### Returns

`boolean`

True if embeddings enabled, false otherwise

###### Examples

```ts
// Check before generating embeddings
if (embeddingsService.isEnabled()) {
  const result = await embeddingsService.generateEmbedding('search query');
} else {
  console.log('Falling back to keyword search');
}
```

```ts
// Conditional feature availability
const features = {
  semanticSearch: embeddingsService.isEnabled(),
  keywordSearch: true,
  hybridSearch: embeddingsService.isEnabled()
};
console.log('Available features:', features);
```

##### ~~generateEmbedding()~~

> **generateEmbedding**(`text`): `Promise`\<[`EmbeddingResult`](#embeddingresult)\>

Defined in: src/indexing/EmbeddingsService.ts:293

Generate a single averaged embedding vector for text

For large texts, automatically chunks and averages embeddings.
Returns a single vector representing the entire text.

###### Parameters

###### text

`string`

Text to generate embedding for

###### Returns

`Promise`\<[`EmbeddingResult`](#embeddingresult)\>

Embedding result with vector, dimensions, and model info

###### Deprecated

Use generateChunkEmbeddings() for better search accuracy.
Industry standard is to store separate embeddings per chunk.

###### Throws

If embeddings disabled or text is empty

###### Examples

```ts
// Generate embedding for search query
const result = await embeddingsService.generateEmbedding(
  'How do I implement authentication?'
);
console.log(`Embedding dimensions: ${result.dimensions}`);
console.log(`Model: ${result.model}`);
// Use result.embedding for similarity search
```

```ts
// Generate embedding for short content
const memory = await embeddingsService.generateEmbedding(
  'Use JWT tokens with 15-minute expiry and refresh tokens'
);
// Store memory.embedding in database for semantic search
```

```ts
// Handle large text (auto-chunked and averaged)
const longDoc = fs.readFileSync('documentation.md', 'utf-8');
const result = await embeddingsService.generateEmbedding(longDoc);
// Returns single averaged embedding for entire document
```

##### generateChunkEmbeddings()

> **generateChunkEmbeddings**(`text`): `Promise`\<[`ChunkEmbeddingResult`](#chunkembeddingresult)[]\>

Defined in: src/indexing/EmbeddingsService.ts:424

Generate separate embeddings for each text chunk (Industry Standard)

Splits large text into overlapping chunks and generates individual embeddings.
Each chunk becomes a separate searchable unit, enabling precise retrieval.
This is the recommended approach for file indexing and RAG systems.

Chunking strategy:
- Default chunk size: 768 characters (configurable via MIMIR_EMBEDDINGS_CHUNK_SIZE)
- Overlap: 10 characters (configurable via MIMIR_EMBEDDINGS_CHUNK_OVERLAP)
- Smart boundaries: Breaks at paragraphs, sentences, or words

###### Parameters

###### text

`string`

Text to chunk and embed

###### Returns

`Promise`\<[`ChunkEmbeddingResult`](#chunkembeddingresult)[]\>

Array of chunk embeddings with text, offsets, and metadata

###### Throws

If embeddings disabled or text is empty

###### Examples

```ts
// Index a source code file
const fileContent = fs.readFileSync('src/auth.ts', 'utf-8');
const chunks = await embeddingsService.generateChunkEmbeddings(fileContent);

for (const chunk of chunks) {
  await db.createNode('file_chunk', {
    text: chunk.text,
    embedding: chunk.embedding,
    chunkIndex: chunk.chunkIndex,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset
  });
}
console.log(`Indexed ${chunks.length} chunks`);
```

```ts
// Index documentation with metadata
const docContent = fs.readFileSync('README.md', 'utf-8');
const metadata = formatMetadataForEmbedding({
  name: 'README.md',
  relativePath: 'README.md',
  language: 'markdown',
  extension: '.md'
});
const enrichedContent = metadata + docContent;
const chunks = await embeddingsService.generateChunkEmbeddings(enrichedContent);
// Each chunk now includes file context for better search
```

```ts
// Search within specific chunks
const query = 'authentication implementation';
const queryEmbedding = await embeddingsService.generateEmbedding(query);

// Find most similar chunks
const results = await vectorSearch(queryEmbedding.embedding, {
  type: 'file_chunk',
  limit: 5
});

for (const result of results) {
  console.log(`Chunk ${result.chunkIndex}: ${result.text.substring(0, 100)}...`);
  console.log(`Similarity: ${result.similarity}`);
}
```

##### generateEmbeddings()

> **generateEmbeddings**(`texts`): `Promise`\<[`EmbeddingResult`](#embeddingresult)[]\>

Defined in: src/indexing/EmbeddingsService.ts:705

Generate embeddings for multiple texts (batch processing)

###### Parameters

###### texts

`string`[]

###### Returns

`Promise`\<[`EmbeddingResult`](#embeddingresult)[]\>

##### cosineSimilarity()

> **cosineSimilarity**(`a`, `b`): `number`

Defined in: src/indexing/EmbeddingsService.ts:732

Calculate cosine similarity between two embeddings

###### Parameters

###### a

`number`[]

###### b

`number`[]

###### Returns

`number`

##### findMostSimilar()

> **findMostSimilar**(`query`, `candidates`, `topK`): `object`[]

Defined in: src/indexing/EmbeddingsService.ts:753

Find most similar embeddings using cosine similarity

###### Parameters

###### query

`number`[]

###### candidates

`object`[]

###### topK

`number` = `5`

###### Returns

`object`[]

##### verifyModel()

> **verifyModel**(): `Promise`\<`boolean`\>

Defined in: src/indexing/EmbeddingsService.ts:772

Verify embedding model is available

###### Returns

`Promise`\<`boolean`\>

## Interfaces

### EmbeddingResult

Defined in: src/indexing/EmbeddingsService.ts:15

#### Properties

##### embedding

> **embedding**: `number`[]

Defined in: src/indexing/EmbeddingsService.ts:16

##### dimensions

> **dimensions**: `number`

Defined in: src/indexing/EmbeddingsService.ts:17

##### model

> **model**: `string`

Defined in: src/indexing/EmbeddingsService.ts:18

***

### ChunkEmbeddingResult

Defined in: src/indexing/EmbeddingsService.ts:21

#### Properties

##### text

> **text**: `string`

Defined in: src/indexing/EmbeddingsService.ts:22

##### embedding

> **embedding**: `number`[]

Defined in: src/indexing/EmbeddingsService.ts:23

##### dimensions

> **dimensions**: `number`

Defined in: src/indexing/EmbeddingsService.ts:24

##### model

> **model**: `string`

Defined in: src/indexing/EmbeddingsService.ts:25

##### startOffset

> **startOffset**: `number`

Defined in: src/indexing/EmbeddingsService.ts:26

##### endOffset

> **endOffset**: `number`

Defined in: src/indexing/EmbeddingsService.ts:27

##### chunkIndex

> **chunkIndex**: `number`

Defined in: src/indexing/EmbeddingsService.ts:28

***

### TextChunk

Defined in: src/indexing/EmbeddingsService.ts:31

#### Properties

##### text

> **text**: `string`

Defined in: src/indexing/EmbeddingsService.ts:32

##### startOffset

> **startOffset**: `number`

Defined in: src/indexing/EmbeddingsService.ts:33

##### endOffset

> **endOffset**: `number`

Defined in: src/indexing/EmbeddingsService.ts:34

***

### FileMetadata

Defined in: src/indexing/EmbeddingsService.ts:38

#### Properties

##### name

> **name**: `string`

Defined in: src/indexing/EmbeddingsService.ts:39

##### relativePath

> **relativePath**: `string`

Defined in: src/indexing/EmbeddingsService.ts:40

##### language

> **language**: `string`

Defined in: src/indexing/EmbeddingsService.ts:41

##### extension

> **extension**: `string`

Defined in: src/indexing/EmbeddingsService.ts:42

##### directory?

> `optional` **directory**: `string`

Defined in: src/indexing/EmbeddingsService.ts:43

##### sizeBytes?

> `optional` **sizeBytes**: `number`

Defined in: src/indexing/EmbeddingsService.ts:44

## Functions

### formatMetadataForEmbedding()

> **formatMetadataForEmbedding**(`metadata`): `string`

Defined in: src/indexing/EmbeddingsService.ts:63

Format file metadata as natural language for embedding
This enriches content with contextual information about the file itself
enabling semantic search to match on filenames, paths, and file types

#### Parameters

##### metadata

[`FileMetadata`](#filemetadata)

#### Returns

`string`

#### Example

```ts
formatMetadataForEmbedding({
  name: 'auth-api.ts',
  relativePath: 'src/api/auth-api.ts',
  language: 'typescript',
  extension: '.ts',
  directory: 'src/api',
  sizeBytes: 15360
})
// Returns: "This is a typescript file named auth-api.ts located at src/api/auth-api.ts in the src/api directory."
```
