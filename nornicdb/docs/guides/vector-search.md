# Vector Search Guide

Learn how to use semantic search with embeddings in NornicDB.

## Overview

Vector search enables finding similar content by meaning, not keywords. NornicDB supports:

- **Cosine similarity** for exact matching
- **HNSW indexing** for fast approximate search
- **GPU acceleration** for 10-100x speedup
- **Hybrid search** combining vectors + full-text

## Basic Vector Search

### 1. Create Embeddings

```go
// Generate embeddings using Ollama
embedder, err := embed.New(&embed.Config{
    Provider: "ollama",
    APIUrl:   "http://localhost:11434",
    Model:    "mxbai-embed-large",
})
if err != nil {
    log.Fatal(err)
}

// Create embedding for text
embedding, err := embedder.Embed(ctx, "Machine learning is awesome")
if err != nil {
    log.Fatal(err)
}
```

### 2. Store with Embeddings

```go
// Store memory with embedding
memory := &nornicdb.Memory{
    Content:   "Machine learning enables computers to learn from data",
    Title:     "ML Basics",
    Tier:      nornicdb.TierSemantic,
    Embedding: embedding,
}

stored, err := db.Store(ctx, memory)
if err != nil {
    log.Fatal(err)
}
```

### 3. Search by Similarity

```go
// Search for similar content
queryEmbedding, _ := embedder.Embed(ctx, "AI and learning algorithms")
results, err := db.Search(ctx, "AI and learning algorithms", 10)
if err != nil {
    log.Fatal(err)
}

for _, result := range results {
    fmt.Printf("Found: %s (similarity: %.3f)\n", 
        result.Title, result.Score)
}
```

## Advanced Search Techniques

### Batch Embedding

```go
// Embed multiple texts efficiently
texts := []string{
    "Python is a programming language",
    "Go is fast and concurrent",
    "Rust provides memory safety",
}

embeddings, err := embedder.BatchEmbed(ctx, texts)
if err != nil {
    log.Fatal(err)
}

// Store all at once
for i, text := range texts {
    memory := &nornicdb.Memory{
        Content:   text,
        Embedding: embeddings[i],
        Tier:      nornicdb.TierSemantic,
    }
    db.Store(ctx, memory)
}
```

### Cached Embeddings

NornicDB includes a transparent LRU cache wrapper that provides **450,000x speedup** for repeated queries.

```go
// Wrap any embedder with caching (default: 10K entries)
base := embed.NewOllama(nil)
cached := embed.NewCachedEmbedder(base, 10000)

// First call generates embedding (~50-200ms)
emb1, _ := cached.Embed(ctx, "Hello world")

// Second call uses cache (~111ns - 450,000x faster!)
emb2, _ := cached.Embed(ctx, "Hello world")

// Check cache statistics
stats := cached.Stats()
fmt.Printf("Cache: %d/%d entries, %.1f%% hit rate\n",
    stats.Size, stats.MaxSize, stats.HitRate)
```

**Cache is enabled by default** when starting NornicDB server:

```bash
# Default: 10K cache (~40MB for 1024-dim vectors)
nornicdb serve

# Increase for heavy workloads
nornicdb serve --embedding-cache 50000

# Disable caching
nornicdb serve --embedding-cache 0

# Or via environment variable
export NORNICDB_EMBEDDING_CACHE_SIZE=50000
```

**Batch operations also benefit from caching**:

```go
// Only uncached texts are sent to the embedder
texts := []string{"cached", "new1", "new2"}
embeddings, _ := cached.EmbedBatch(ctx, texts)
// If "cached" was previously embedded, only "new1" and "new2" are processed
```

### Asynchronous Embedding

```go
// Queue embeddings for background processing
autoEmbedder.QueueEmbed("doc-1", "Some content",
    func(nodeID string, embedding []float32, err error) {
        if err != nil {
            log.Printf("Failed to embed %s: %v", nodeID, err)
            return
        }
        // Store embedding in database
        db.UpdateNodeEmbedding(nodeID, embedding)
    })
```

## GPU-Accelerated Search

### Enable GPU Acceleration

```go
// Create GPU manager
gpuConfig := &gpu.Config{
    Enabled:           true,
    PreferredBackend:  gpu.BackendOpenCL,
    MaxMemoryMB:       8192,
}

manager, err := gpu.NewManager(gpuConfig)
if err != nil {
    log.Printf("GPU not available: %v", err)
    // Falls back to CPU
}

// Create GPU-accelerated index
indexConfig := gpu.DefaultEmbeddingIndexConfig(1024)
index := gpu.NewEmbeddingIndex(manager, indexConfig)

// Add embeddings
for _, embedding := range embeddings {
    index.Add(nodeID, embedding)
}

// Sync to GPU
if err := index.SyncToGPU(); err != nil {
    log.Printf("GPU sync failed: %v", err)
}

// Search (10-100x faster!)
results, err := index.Search(queryEmbedding, 10)
```

### GPU Backends

| Backend | Platform | Performance | Notes |
|---------|----------|-------------|-------|
| **CUDA** | NVIDIA | Highest | Requires CUDA toolkit |
| **OpenCL** | Cross-platform | Good | Best compatibility |
| **Metal** | Apple Silicon | Excellent | Native M1/M2/M3 support |
| **Vulkan** | Cross-platform | Good | Future-proof |

## Hybrid Search

### Combine Vector + Full-Text

```go
// Vector search for semantic similarity
vectorResults, _ := db.Search(ctx, "machine learning", 10)

// Full-text search for keyword matching
fullTextResults, _ := db.SearchFullText(ctx, "machine learning", 10)

// Combine and rank results
combinedResults := mergeResults(vectorResults, fullTextResults)
```

## Performance Tuning

### Vector Dimensions

```go
// Smaller dimensions = faster search, less memory
// 384 dimensions: Fast, good for most use cases
// 768 dimensions: Balanced
// 1024 dimensions: Slower, better quality
// 3072 dimensions: Slowest, highest quality (OpenAI)

config := &embed.Config{
    Model: "mxbai-embed-large", // 1024 dims
}
```

### Similarity Thresholds

```go
// Stricter threshold = fewer results, higher quality
results, _ := db.Search(ctx, query, 10, 0.9) // Very similar
results, _ := db.Search(ctx, query, 10, 0.7) // Moderately similar
results, _ := db.Search(ctx, query, 10, 0.0) // All results
```

### Batch Size

```go
// Larger batches = faster throughput, more memory
embeddings, _ := autoEmbedder.BatchEmbed(ctx, texts)
// Typically 2-5x faster than sequential embedding
```

## Common Patterns

### Search-Augmented Generation (RAG)

```go
// 1. Search for relevant context
results, _ := db.Search(ctx, userQuery, 5)

// 2. Build context
context := ""
for _, result := range results {
    context += result.Content + "\n"
}

// 3. Generate response with context
response := llm.Generate(userQuery, context)
```

### Semantic Clustering

```go
// Find all similar items
results, _ := db.Search(ctx, seed, 100)

// Group by similarity threshold
clusters := groupBySimilarity(results, 0.8)
```

### Recommendation System

```go
// Find similar items to user's interests
interests := getUserInterests(userID)
recommendations := db.Search(ctx, interests, 10)
```

## Troubleshooting

### Slow Search

- Enable GPU acceleration
- Reduce vector dimensions
- Use HNSW indexing
- Increase similarity threshold

### Poor Results

- Check embedding quality
- Increase vector dimensions
- Lower similarity threshold
- Use hybrid search

### Out of Memory

- Reduce batch size
- Use smaller embedding model
- Enable GPU (offloads to VRAM)
- Archive old data

## Next Steps

- **[GPU Acceleration](gpu-acceleration.md)** - Speed up searches
- **[Cypher Queries](cypher-queries.md)** - Advanced graph queries
- **[API Reference](../api-reference.md)** - Complete API docs
