# Ollama + Embeddings Quick Start

**Version:** 1.0.0  
**Last Updated:** 2025-10-18

---

## 🎯 Overview

This guide helps you quickly enable **vector embeddings** with **Ollama** in Docker.

---

## 🚀 Quick Start (Docker)

### Option 1: Enable via Environment Variables

**1. Create `.env` file:**

```bash
cp .env.example .env
```

**2. Edit `.env` and enable embeddings:**

```bash
# Feature Flags
MIMIR_FEATURE_VECTOR_EMBEDDINGS=true

# Embeddings Configuration
MIMIR_EMBEDDINGS_ENABLED=true
MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
```

**3. Start with Ollama profile:**

```bash
# Start all services including Ollama
docker compose --profile ollama up -d

# Or set profile in environment
export COMPOSE_PROFILES=ollama
docker compose up -d
```

**4. Pull embedding model:**

```bash
# Inside Ollama container
docker exec ollama_server ollama pull nomic-embed-text

# Or from host (if Ollama running locally)
ollama pull nomic-embed-text
```

**5. Index files with embeddings:**

```bash
# Inside MCP server container
docker exec mcp_server node setup-watch.js

# Files will be indexed with embeddings automatically
```

---

### Option 2: Enable via docker compose.yml

**1. Edit `docker compose.yml`:**

```yaml
mcp-server:
  environment:
    # Enable embeddings
    - MIMIR_FEATURE_VECTOR_EMBEDDINGS=true
    - MIMIR_EMBEDDINGS_ENABLED=true
    - MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
```

**2. Uncomment Ollama dependency (optional):**

```yaml
mcp-server:
  depends_on:
    neo4j:
      condition: service_healthy
    ollama:
      condition: service_healthy  # Add this
```

**3. Start services:**

```bash
docker compose --profile ollama up -d
```

---

## 🔍 Verify Setup

### Check Services

```bash
# All services running
docker compose ps

# Expected output:
# neo4j_db        running
# ollama_server   running  (if profile enabled)
# mcp_server      running

# Check Ollama models
docker exec ollama_server ollama list
```

### Check Embeddings Status

```bash
# Inside MCP container
docker exec mcp_server node -e "
  const { LLMConfigLoader } = require('./build/config/LLMConfigLoader.js');
  (async () => {
    const loader = LLMConfigLoader.getInstance();
    const enabled = await loader.isVectorEmbeddingsEnabled();
    console.log('Vector embeddings enabled:', enabled);
  })();
"
```

### Test Vector Search

```bash
# Query for embedding stats
docker exec mcp_server node -e "
  const { createGraphManager } = require('./build/managers/index.js');
  (async () => {
    const gm = await createGraphManager();
    const session = gm.getDriver().session();
    const result = await session.run(\`
      MATCH (f:File)
      RETURN 
        COUNT(f) AS total,
        SUM(CASE WHEN f.has_embedding = true THEN 1 ELSE 0 END) AS with_embeddings
    \`);
    const record = result.records[0];
    console.log('Files:', record.get('total').toNumber());
    console.log('With embeddings:', record.get('with_embeddings').toNumber());
    await session.close();
    await gm.close();
  })();
"
```

---

## 🛠️ Available Models

### Recommended: nomic-embed-text

```bash
docker exec ollama_server ollama pull nomic-embed-text
```

- **Dimensions:** 768
- **Size:** ~274MB
- **Speed:** Fast
- **Best for:** General purpose code/text

### Alternative: mxbai-embed-large

```bash
docker exec ollama_server ollama pull mxbai-embed-large
```

- **Dimensions:** 1024
- **Size:** ~670MB
- **Speed:** Medium
- **Best for:** Higher accuracy needs

### Alternative: all-minilm

```bash
docker exec ollama_server ollama pull all-minilm
```

- **Dimensions:** 384
- **Size:** ~120MB
- **Speed:** Very fast
- **Best for:** Testing, quick iterations

---

## 📊 Usage Examples

### Semantic File Search

```bash
# Via agent chain
docker exec mcp_server npm run chain "find files about database connections"

# The agent will use vector_search_files tool automatically
```

### Direct MCP Tool Usage

See [VECTOR_EMBEDDINGS_GUIDE.md](./VECTOR_EMBEDDINGS_GUIDE.md) for detailed examples.

---

## 🔄 Enable/Disable Without Rebuild

### Disable Embeddings

**Edit `.env`:**
```bash
MIMIR_FEATURE_VECTOR_EMBEDDINGS=false
MIMIR_EMBEDDINGS_ENABLED=false
```

**Restart:**
```bash
docker compose restart mcp-server
```

**Ollama keeps running** but embeddings won't be used.

### Re-enable

**Edit `.env`:**
```bash
MIMIR_FEATURE_VECTOR_EMBEDDINGS=true
MIMIR_EMBEDDINGS_ENABLED=true
```

**Restart:**
```bash
docker compose restart mcp-server
```

---

## 🐛 Troubleshooting

### Ollama Not Starting

**Check profile:**
```bash
docker compose ps ollama

# If not listed, profile not enabled
docker compose --profile ollama up -d
```

### Model Not Found

**Pull model:**
```bash
docker exec ollama_server ollama pull nomic-embed-text

# Check models
docker exec ollama_server ollama list
```

### Connection Refused

**Check Ollama health:**
```bash
docker compose ps ollama_server

# Should show "healthy"
```

**Check URL in MCP server:**
```bash
docker exec mcp_server env | grep OLLAMA
# Should show: OLLAMA_BASE_URL=http://ollama:11434
```

### No Embeddings Generated

**Check feature flags:**
```bash
docker exec mcp_server env | grep MIMIR_

# Should show:
# MIMIR_FEATURE_VECTOR_EMBEDDINGS=true
# MIMIR_EMBEDDINGS_ENABLED=true
```

**Re-index files:**
```bash
# Remove old watch (TODO: add tool)
# Re-run setup
docker exec mcp_server node setup-watch.js
```

---

## 📚 Related Documentation

- **[Vector Embeddings Guide](./VECTOR_EMBEDDINGS_GUIDE.md)** - Complete embeddings documentation
- **[File Watching Guide](./FILE_WATCHING_GUIDE.md)** - File indexing setup
- **[Docker Deployment Guide](./DOCKER_DEPLOYMENT_GUIDE.md)** - Container setup

---

## 🚀 Production Deployment

### With GPU Support (NVIDIA)

**Edit `docker compose.yml`:**

```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

**Requires:**
- NVIDIA GPU
- nvidia-docker2
- CUDA drivers

### Resource Allocation

**Increase if needed:**

```yaml
ollama:
  deploy:
    resources:
      limits:
        memory: 8G
        cpus: '4'
```

---

**Questions?** Check [GitHub Issues](https://github.com/orneryd/GRAPH-RAG-TODO/issues) or open a discussion.
