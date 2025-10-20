# Vector Embeddings Guide

**Version:** 1.0.0  
**Last Updated:** 2025-10-18  
**Feature Status:** ✅ Available (Feature Flag)

---

## 🎯 Overview

The MCP server includes **optional vector embeddings** support for semantic file search. This enables finding files based on meaning rather than just keywords, powered by Ollama's embedding models.

**Key Benefits:**
- 🔍 Semantic search: Find files by concept, not just keywords
- 🧠 Context-aware: Understands code semantics and relationships  
- 🚀 Local: Runs entirely on your machine via Ollama
- 🔧 Optional: Easy feature flag to enable/disable

---

## 🏗️ Architecture

### Components

1. **EmbeddingsService** (`src/indexing/EmbeddingsService.ts`)
   - Generates vector embeddings via Ollama API
   - Handles text chunking for large files
   - Calculates cosine similarity for search

2. **FileIndexer** (Enhanced)
   - Optionally generates embeddings during indexing
   - Stores embeddings in Neo4j File nodes
   - Configurable per watch configuration

3. **Vector Search Tools** (2 MCP tools)
   - `vector_search_files` - Semantic file search
   - `get_embedding_stats` - View embedding statistics

---

## 🚀 Quick Start

### Step 1: Configure Embeddings Model

**Enable embeddings in `.env` file (required first):**

```bash
# Copy example file if you don't have .env yet
cp .env.example .env

# Edit .env and set:
MIMIR_FEATURE_VECTOR_EMBEDDINGS=true
MIMIR_EMBEDDINGS_ENABLED=true
MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
```

**The embedding model will be automatically pulled** when you run `scripts/setup-ollama-models.sh` or `scripts/docker-quickstart.sh`. 

**Manual installation (optional):**

```bash
# Install the embedding model manually
ollama pull nomic-embed-text

# Verify installation
ollama list | grep nomic-embed-text
```

**Model Details:**
- **Model**: `nomic-embed-text`
- **Dimensions**: 768
- **Size**: ~274MB
- **Speed**: ~1000 tokens/sec on M1 Mac

### Step 2: Enable Feature Flags

Feature flags are now configured via **environment variables** for easier Docker deployment.

**For Docker deployment, edit `.env` file:**

```bash
# Copy example file if you don't have .env yet
cp .env.example .env

# Edit .env and set these variables:
MIMIR_FEATURE_VECTOR_EMBEDDINGS=true
MIMIR_EMBEDDINGS_ENABLED=true
MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
MIMIR_EMBEDDINGS_DIMENSIONS=768
MIMIR_EMBEDDINGS_CHUNK_SIZE=512
MIMIR_EMBEDDINGS_CHUNK_OVERLAP=50
```

**For local development, set environment variables:**

```bash
export MIMIR_FEATURE_VECTOR_EMBEDDINGS=true
export MIMIR_EMBEDDINGS_ENABLED=true
export MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
```

**Configuration Options:**

| Environment Variable | Description | Default | Notes |
|---------------------|-------------|---------|-------|
| `MIMIR_FEATURE_VECTOR_EMBEDDINGS` | Enable vector search tools | `false` | Master switch |
| `MIMIR_EMBEDDINGS_ENABLED` | Generate embeddings | `false` | Must be `true` |
| `MIMIR_EMBEDDINGS_MODEL` | Ollama embedding model | `nomic-embed-text` | Recommended |
| `MIMIR_EMBEDDINGS_DIMENSIONS` | Vector dimensions | `768` | Model-specific |
| `MIMIR_EMBEDDINGS_CHUNK_SIZE` | Max chunk size (tokens) | `512` | For large files |
| `MIMIR_EMBEDDINGS_CHUNK_OVERLAP` | Overlap between chunks | `50` | Preserve context |
| `OLLAMA_BASE_URL` | Ollama API endpoint | `http://localhost:11434` | Docker: `http://ollama:11434` |

### Step 3: Start Services with Ollama

**Docker deployment:**

```bash
# Start all services including Ollama
docker compose --profile ollama up -d

# Or set profile in environment
export COMPOSE_PROFILES=ollama
docker compose up -d
```

**Verify services:**

```bash
docker compose ps

# Expected output:
# neo4j_db        running
# ollama_server   running
# mcp_server      running
```

### Step 4: Index Files with Embeddings

Files will automatically be indexed with embeddings when `MIMIR_EMBEDDINGS_ENABLED=true`.

**Docker:**

```bash
# Setup file watching (embeddings enabled via .env)
docker exec mcp_server node setup-watch.js
```

**Local:**

```bash
# Embeddings enabled via environment variables
node setup-watch.js
```

**The script will:**
- Detect embeddings are enabled from environment
- Generate embeddings for each file
- Store vectors in Neo4j
- Display progress: `🧮 Vector embeddings enabled for this watch`

### Step 5: Test Semantic Search

```bash
# Via agent chain (Docker)
docker exec mcp_server npm run chain "find files related to authentication"

# Local
npm run chain "find files related to authentication"

# Check embedding stats (Docker)
docker exec mcp_server node -e "
  require('./build/tools/vectorSearch.tools.js')
    .handleGetEmbeddingStats({}, require('./build/managers/index.js').createGraphManager().then(gm => gm.getDriver()))
    .then(r => console.log(JSON.stringify(r, null, 2)));
"
```

---

## 📊 Usage Examples

### Semantic File Search

**Via MCP Tool:**

```javascript
// Search for files about database connections
const result = await mcp.call('vector_search_files', {
  query: 'database connection pool configuration',
  limit: 5,
  min_similarity: 0.6
});

// Returns:
{
  "status": "success",
  "query": "database connection pool configuration",
  "results": [
    {
      "path": "src/managers/GraphManager.ts",
      "name": "GraphManager.ts",
      "language": "typescript",
      "similarity": 0.87,
      "content_preview": "import neo4j, { Driver, Session } from 'neo4j-driver'..."
    },
    {
      "path": "src/index.ts",
      "name": "index.ts",
      "language": "typescript",
      "similarity": 0.73,
      "content_preview": "// Database initialization..."
    }
  ],
  "total_candidates": 31,
  "returned": 2
}
```

**Via Agent Chain:**

```bash
npm run chain "show me files that handle error logging"
```

The agent will use `vector_search_files` to find relevant files semantically.

### Check Embedding Statistics

```javascript
const stats = await mcp.call('get_embedding_stats', {});

// Returns:
{
  "status": "success",
  "stats": {
    "total_files": 31,
    "files_with_embeddings": 31,
    "files_without_embeddings": 0,
    "embedding_model": "nomic-embed-text",
    "embedding_dimensions": 768
  }
}
```

---

## 🔧 Configuration Deep Dive

### Environment Variables vs Config Files

**All embeddings configuration is now via environment variables** for easier Docker deployment.

**Two-level safety:**

1. **`MIMIR_FEATURE_VECTOR_EMBEDDINGS`**: Enable vector search tools in MCP server
2. **`MIMIR_EMBEDDINGS_ENABLED`**: Enable embedding generation during file indexing

**Why two flags?**
- Use existing embeddings without generating new ones (testing)
- Disable search tools while keeping embeddings (migration)
- Independent control for gradual rollout

**Benefits of environment variables:**
- ✅ Change without editing config files
- ✅ Docker-friendly (docker compose.yml)
- ✅ Easy enable/disable without rebuild
- ✅ Environment-specific configuration (dev/staging/prod)

### Embedding Models

**Recommended Models:**

| Model | Dimensions | Size | Speed | Use Case |
|-------|------------|------|-------|----------|
| `nomic-embed-text` | 768 | 274MB | Fast | **Recommended** - General purpose |
| `mxbai-embed-large` | 1024 | 670MB | Medium | Higher accuracy, slower |
| `all-minilm` | 384 | 120MB | Very Fast | Quick testing, less accurate |

**Switching models:**

Edit `.env`:
```bash
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
MIMIR_EMBEDDINGS_DIMENSIONS=1024
```

Restart and re-index:
```bash
docker compose restart mcp-server
docker exec ollama_server ollama pull mxbai-embed-large
docker exec mcp_server node setup-watch.js
```

**Important:** Re-index files after changing models! Old embeddings won't match.

### Chunking Strategy

For large files, text is split into chunks. Configure via environment variables:

```bash
MIMIR_EMBEDDINGS_CHUNK_SIZE=512      # Tokens per chunk
MIMIR_EMBEDDINGS_CHUNK_OVERLAP=50   # Overlap for context
```

**Tuning guidance:**

- **Small files (<2KB)**: Chunking unnecessary, embedded as-is
- **Medium files (2-10KB)**: Default settings work well
- **Large files (>10KB)**: Consider smaller `chunkSize` (256-384)
- **High overlap**: Better context, slower indexing
- **Low overlap**: Faster, may miss cross-chunk relationships

---

## 🎯 Integration with Agent Chain

### Automatic Usage

When embeddings are enabled, the agent chain automatically:

1. **Gathers embedding stats** during context gathering
2. **Uses vector search** for semantic file queries
3. **Includes similarity scores** in context

**Example flow:**

```bash
npm run chain "refactor the authentication logic"
```

**Behind the scenes:**
```
1. PM agent receives request
2. Checks if embeddings enabled (✓)
3. Searches: vector_search_files("authentication logic")
4. Finds: auth.ts (0.89), middleware.ts (0.76), user.ts (0.68)
5. Reads relevant files
6. Creates refactoring plan
```

### Manual Control

Disable vector search for specific queries:

```javascript
// In agent prompt
"Do NOT use vector search, only exact text search"
```

Or disable feature flag temporarily in `.env`:

```bash
MIMIR_FEATURE_VECTOR_EMBEDDINGS=false  # Disable tools
```

Then restart:
```bash
docker compose restart mcp-server
```

---

## 🐛 Troubleshooting

### Model Not Found

**Error:**
```
⚠️  Embeddings model 'nomic-embed-text' not found in Ollama
   Run: ollama pull nomic-embed-text
```

**Solution:**
```bash
ollama pull nomic-embed-text
```

### Connection Refused

**Error:**
```
Cannot connect to Ollama at http://localhost:11434
```

**Solutions:**

1. **Start Ollama:**
   ```bash
   # macOS
   open -a Ollama
   
   # Linux
   ollama serve
   
   # Docker
   docker compose up -d ollama
   ```

2. **Check Ollama URL in `.env`:**
   ```bash
   # For Docker
   OLLAMA_BASE_URL=http://ollama:11434
   
   # For local Ollama
   OLLAMA_BASE_URL=http://localhost:11434
   ```

3. **Restart services:**
   ```bash
   docker compose restart mcp-server
   ```

### No Embeddings Generated

**Symptom:** Files indexed but `files_with_embeddings = 0`

**Check:**

1. **Feature flag enabled?**
   ```bash
   cat .mimir/llm-config.json | grep -A 5 embeddings
   ```

2. **Watch config has `generate_embeddings: true`?**
   ```bash
   node check-watches.js
   ```

3. **Re-index with embeddings:**
   ```bash
   # Remove old watch
   # Re-run setup with embeddings enabled
   node setup-watch.js
   ```

### Slow Indexing

**Symptom:** File indexing takes minutes

**Causes:**
- Large files + small chunks = many embeddings
- Ollama running on CPU instead of GPU
- Network latency to Ollama

**Solutions:**

1. **Increase chunk size in `.env`:**
   ```bash
   MIMIR_EMBEDDINGS_CHUNK_SIZE=1024  # Larger chunks = fewer embeddings
   ```

2. **Disable temporarily:**
   ```bash
   # In .env
   MIMIR_EMBEDDINGS_ENABLED=false
   ```

3. **Use faster model:**
   ```bash
   # In .env
   MIMIR_EMBEDDINGS_MODEL=all-minilm  # Smaller, faster
   MIMIR_EMBEDDINGS_DIMENSIONS=384
   ```
   
   Then restart and pull model:
   ```bash
   docker compose restart mcp-server
   docker exec ollama_server ollama pull all-minilm
   ```

### Low Similarity Scores

**Symptom:** `vector_search_files` returns no results or low similarity

**Causes:**
- Query too specific or too vague
- Wrong embedding model
- Files not in expected language

**Solutions:**

1. **Lower threshold:**
   ```javascript
   min_similarity: 0.4  // Instead of 0.6
   ```

2. **Broaden query:**
   ```
   Before: "JWT token validation middleware"
   After:  "authentication middleware"
   ```

3. **Check indexed files:**
   ```javascript
   get_embedding_stats()  // Verify files are indexed
   ```

---

## 📈 Performance Considerations

### Indexing Performance

**Benchmark** (M1 Mac, 31 TypeScript files):

| Configuration | Time | Files/sec |
|---------------|------|-----------|
| No embeddings | 2.1s | 14.8 |
| With embeddings (nomic-embed-text) | 8.7s | 3.6 |
| With embeddings (all-minilm) | 4.2s | 7.4 |

**Optimization tips:**
- Index during off-hours
- Use faster model for development
- Enable only for critical directories

### Search Performance

**Benchmark** (31 files with embeddings):

- Query embedding generation: ~100ms
- Similarity calculation (31 files): ~5ms
- Total search time: ~105ms

**Scaling:**
- Linear with number of files
- O(n) similarity calculation
- Consider Neo4j vector indexes for >10K files (future)

### Storage Impact

**Per file overhead:**

| Component | Size |
|-----------|------|
| Embedding vector (768 dims) | ~3KB |
| Metadata | ~100 bytes |
| **Total overhead** | **~3.1KB per file** |

**Example:**
- 100 files = ~310KB
- 1,000 files = ~3.1MB
- 10,000 files = ~31MB

Negligible compared to file content storage.

---

## 🔄 Migration & Rollback

### Enabling Embeddings

**No data loss** - existing files remain unchanged.

**Steps:**
1. Enable feature flags in config
2. Pull Ollama model
3. Re-index files with `generate_embeddings: true`

### Disabling Embeddings

**Embeddings remain in database** but are not used.

**Steps:**

1. Edit `.env`:
   ```bash
   MIMIR_FEATURE_VECTOR_EMBEDDINGS=false
   MIMIR_EMBEDDINGS_ENABLED=false
   ```

2. Restart MCP server:
   ```bash
   docker compose restart mcp-server
   ```

3. Vector search tools become unavailable (existing embeddings preserved)

**To fully remove embeddings:**

```cypher
// Neo4j Browser or cypher-shell
MATCH (f:File)
WHERE f.has_embedding = true
REMOVE f.embedding, f.embedding_dimensions, f.embedding_model
SET f.has_embedding = false
```

---

## 🚀 Future Enhancements

### Planned Features

- **Chunked embeddings**: Store multiple embeddings per file
- **Incremental updates**: Only re-generate changed files
- **Neo4j vector index**: Native vector similarity search
- **Multi-modal embeddings**: Images, diagrams, videos
- **Cross-file relationships**: Semantic similarity edges

### Phase 3: Advanced RAG

- **Hybrid search**: Combine keyword + semantic
- **Re-ranking**: LLM-based result re-ranking
- **Query expansion**: Automatically broaden queries
- **Contextual chunks**: Use surrounding code for better embeddings

---

## 📚 Related Documentation

- **[LLM Configuration Guide](../configuration/LLM_CONFIGURATION.md)** - Configuration details
- **[File Watching Guide](./FILE_WATCHING_GUIDE.md)** - File indexing setup
- **[Multi-Agent Architecture](../architecture/MULTI_AGENT_GRAPH_RAG.md)** - System overview

---

## 🤝 Contributing

Embeddings feature is extensible:

1. **Add new providers** (OpenAI, Cohere, etc.)
2. **Optimize chunking algorithms**
3. **Implement hybrid search**
4. **Add vector databases** (Pinecone, Weaviate, etc.)

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

---

**Questions?** Check [GitHub Issues](https://github.com/orneryd/GRAPH-RAG-TODO/issues) or open a discussion.
