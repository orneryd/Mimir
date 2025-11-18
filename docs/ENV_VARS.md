# Mimir Environment Variables Reference

**Last Updated:** 2025-01-18  
**Version:** 2.0 (Unified API Configuration)

## Overview

Mimir uses split configuration with base URLs and paths. This provides maximum flexibility while keeping configuration explicit and simple. No URL parsing or manipulation - just straightforward concatenation.

## Core Philosophy

- **Explicit over Implicit**: Base URL + paths (simple concatenation, no parsing)
- **Separation of Concerns**: LLM and embeddings configured independently
- **Provider Agnostic**: Works with Ollama, OpenAI, Copilot, or any OpenAI-compatible API
- **Flexible Paths**: Different providers can use different endpoint paths

---

## LLM API Configuration

### `MIMIR_LLM_API`
**Required**: Yes  
**Type**: String (Base URL)  
**Default**: `http://ollama:11434`

**Base URL of the LLM server (no paths).**

```bash
# Ollama
MIMIR_LLM_API=http://ollama:11434

# Copilot API
MIMIR_LLM_API=http://copilot-api:4141

# External OpenAI-compatible
MIMIR_LLM_API=http://host.docker.internal:8080

# OpenAI
MIMIR_LLM_API=https://api.openai.com
```

### `MIMIR_LLM_API_PATH`
**Required**: No  
**Type**: String (Path)  
**Default**: `/v1/chat/completions`

**Path to the chat completions endpoint.**

```bash
MIMIR_LLM_API_PATH=/v1/chat/completions
```

### `MIMIR_LLM_API_MODELS_PATH`
**Required**: No  
**Type**: String (Path)  
**Default**: `/v1/models`

**Path to the models list endpoint.**

```bash
MIMIR_LLM_API_MODELS_PATH=/v1/models
```

### `MIMIR_LLM_API_KEY`
**Required**: No (depends on provider)  
**Type**: String  
**Default**: `dummy-key`

**API key for authentication.**

```bash
# Local Ollama (no auth needed)
MIMIR_LLM_API_KEY=dummy-key

# OpenAI
MIMIR_LLM_API_KEY=sk-...

# Copilot
MIMIR_LLM_API_KEY=sk-copilot-...
```

---

## Embeddings API Configuration

### `MIMIR_EMBEDDINGS_API`
**Required**: Yes (if embeddings enabled)  
**Type**: String (Base URL)  
**Default**: `http://ollama:11434`

**Base URL of the embeddings server (no paths).**

```bash
# Ollama
MIMIR_EMBEDDINGS_API=http://ollama:11434

# Copilot API
MIMIR_EMBEDDINGS_API=http://copilot-api:4141

# OpenAI
MIMIR_EMBEDDINGS_API=https://api.openai.com
```

### `MIMIR_EMBEDDINGS_API_PATH`
**Required**: No  
**Type**: String (Path)  
**Default**: `/api/embeddings` (for Ollama)

**Path to the embeddings endpoint.**

```bash
# Ollama native format (default)
MIMIR_EMBEDDINGS_API_PATH=/api/embeddings

# OpenAI-compatible format
MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings
```

### `MIMIR_EMBEDDINGS_API_MODELS_PATH`
**Required**: No  
**Type**: String (Path)  
**Default**: `/api/tags` (for Ollama)

**Path to the models list endpoint for embeddings.**

```bash
# Ollama native format
MIMIR_EMBEDDINGS_API_MODELS_PATH=/api/tags

# OpenAI-compatible format
MIMIR_EMBEDDINGS_API_MODELS_PATH=/v1/models
```

### `MIMIR_EMBEDDINGS_API_KEY`
**Required**: No (depends on provider)  
**Type**: String  
**Default**: `dummy-key`

**API key for embeddings authentication.**

```bash
MIMIR_EMBEDDINGS_API_KEY=dummy-key
```

---

## Provider and Model Configuration

### `MIMIR_DEFAULT_PROVIDER`
**Type**: String  
**Default**: `copilot`  
**Options**: `copilot` | `ollama` | `openai`

**Default provider for model discovery.**

### `MIMIR_DEFAULT_MODEL`
**Type**: String  
**Default**: `gpt-4.1`

**Default model name.**

```bash
# Examples
MIMIR_DEFAULT_MODEL=gpt-4.1
MIMIR_DEFAULT_MODEL=qwen2.5-coder:14b
MIMIR_DEFAULT_MODEL=gpt-4-turbo
```

### `MIMIR_CONTEXT_WINDOW`
**Type**: Number  
**Default**: `128000`

**Maximum context window size in tokens.**

---

## Embeddings Configuration

### `MIMIR_EMBEDDINGS_ENABLED`
**Type**: Boolean  
**Default**: `true`

### `MIMIR_EMBEDDINGS_PROVIDER`
**Type**: String  
**Default**: `ollama`  
**Options**: `ollama` | `openai` | `copilot` | `llama.cpp`

### `MIMIR_EMBEDDINGS_MODEL`
**Type**: String  
**Default**: Architecture-dependent
- **ARM64**: `mxbai-embed-large`
- **AMD64**: `text-embedding-3-small`

### `MIMIR_EMBEDDINGS_DIMENSIONS`
**Type**: Number  
**Default**: Architecture-dependent
- **ARM64**: `1024`
- **AMD64**: `1536`

### `MIMIR_EMBEDDINGS_CHUNK_SIZE`
**Type**: Number  
**Default**: `512`

### `MIMIR_EMBEDDINGS_CHUNK_OVERLAP`
**Type**: Number  
**Default**: `50`

---

## Database Configuration

### `NEO4J_URI`
**Default**: `bolt://neo4j_db:7687`

### `NEO4J_USER`
**Default**: `neo4j`

### `NEO4J_PASSWORD`
**Default**: `password`

---

## Server Configuration

### `PORT`
**Default**: `3000`

### `NODE_ENV`
**Default**: `production`

---

## Workspace Configuration

### `WORKSPACE_ROOT`
**Default**: `/workspace`

### `HOST_WORKSPACE_ROOT`
**Required**: Yes (for file operations)  
**Example**: `~/src` or `C:\Users\you\code`

---

## Feature Flags

### `MIMIR_AUTO_INDEX_DOCS`
**Type**: Boolean  
**Default**: `true`

**Auto-index documentation on startup.**

### `MIMIR_ENABLE_ECKO`
**Type**: Boolean  
**Default**: `false`

**Enable Ecko orchestration mode.**

### `MIMIR_FEATURE_PM_MODEL_SUGGESTIONS`
**Type**: Boolean  
**Default**: `false`

**Enable PM model suggestions feature.**

---

## Quick Start Configurations

### Local Ollama Setup
```bash
# LLM
MIMIR_LLM_API=http://ollama:11434
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_MODELS_PATH=/v1/models
MIMIR_LLM_API_KEY=dummy-key

# Embeddings
MIMIR_EMBEDDINGS_API=http://ollama:11434
MIMIR_EMBEDDINGS_API_PATH=/api/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/api/tags
MIMIR_EMBEDDINGS_API_KEY=dummy-key
MIMIR_EMBEDDINGS_PROVIDER=ollama
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
MIMIR_EMBEDDINGS_DIMENSIONS=1024

# Provider
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_DEFAULT_MODEL=qwen2.5-coder:14b
```

### OpenAI Setup
```bash
# LLM
MIMIR_LLM_API=https://api.openai.com
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_MODELS_PATH=/v1/models
MIMIR_LLM_API_KEY=sk-...

# Embeddings
MIMIR_EMBEDDINGS_API=https://api.openai.com
MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/v1/models
MIMIR_EMBEDDINGS_API_KEY=sk-...
MIMIR_EMBEDDINGS_PROVIDER=openai
MIMIR_EMBEDDINGS_MODEL=text-embedding-3-small
MIMIR_EMBEDDINGS_DIMENSIONS=1536

# Provider
MIMIR_DEFAULT_PROVIDER=openai
MIMIR_DEFAULT_MODEL=gpt-4-turbo
```

### Hybrid Setup (Ollama LLM + OpenAI Embeddings)
```bash
# LLM (Local Ollama)
MIMIR_LLM_API=http://ollama:11434
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_MODELS_PATH=/v1/models
MIMIR_LLM_API_KEY=dummy-key

# Embeddings (Cloud OpenAI)
MIMIR_EMBEDDINGS_API=https://api.openai.com
MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/v1/models
MIMIR_EMBEDDINGS_API_KEY=sk-...
MIMIR_EMBEDDINGS_PROVIDER=openai
MIMIR_EMBEDDINGS_MODEL=text-embedding-3-small
MIMIR_EMBEDDINGS_DIMENSIONS=1536

# Provider
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_DEFAULT_MODEL=qwen2.5-coder:14b
```

---

## Migration from v1.x

### Removed Variables
- ❌ `LLM_API_URL` → Use `MIMIR_LLM_API`
- ❌ `OLLAMA_BASE_URL` → Use `MIMIR_LLM_API` or `MIMIR_EMBEDDINGS_API`
- ❌ `COPILOT_BASE_URL` → Use `MIMIR_LLM_API`
- ❌ `OPENAI_BASE_URL` → Use `MIMIR_LLM_API`
- ❌ `OPENAI_API_KEY` → Use `MIMIR_LLM_API_KEY` or `MIMIR_EMBEDDINGS_API_KEY`
- ❌ `FILE_WATCH_POLLING` → Removed (unused)
- ❌ `FILE_WATCH_INTERVAL` → Removed (unused)

### Migration Example
```bash
# OLD (v1.x)
OLLAMA_BASE_URL=http://ollama:11434
COPILOT_BASE_URL=http://copilot-api:4141/v1

# NEW (v2.0) - For Ollama
MIMIR_LLM_API=http://ollama:11434
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_MODELS_PATH=/v1/models
MIMIR_LLM_API_KEY=dummy-key

MIMIR_EMBEDDINGS_API=http://ollama:11434
MIMIR_EMBEDDINGS_API_PATH=/api/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/api/tags
MIMIR_EMBEDDINGS_API_KEY=dummy-key
```

---

## Troubleshooting

### 404 Error on Embeddings
**Problem**: `404 page not found` when generating embeddings

**Solution**: Check that `MIMIR_EMBEDDINGS_API_PATH` is set correctly:
- **Ollama native** (default): `MIMIR_EMBEDDINGS_API_PATH=/api/embeddings`
- **OpenAI-compatible**: `MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings`

### 400 Invalid Input on Embeddings
**Problem**: `invalid input` error from Ollama embeddings

**Solution**: You're using Ollama with OpenAI-compatible path. Switch to native:
```bash
MIMIR_EMBEDDINGS_API_PATH=/api/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/api/tags
```

### Model Not Found
**Problem**: LLM returns "model not supported"

**Solution**: 
1. Verify model exists: `curl http://localhost:11434/v1/models`
2. Update `MIMIR_DEFAULT_MODEL` to match available model

### Authentication Errors
**Problem**: 401 Unauthorized

**Solution**: Set correct API key in `MIMIR_LLM_API_KEY` or `MIMIR_EMBEDDINGS_API_KEY`

---

## See Also

- [LLM Provider Guide](./guides/LLM_PROVIDER_GUIDE.md)
- [Pipeline Configuration](./guides/PIPELINE_CONFIGURATION.md)
- [Docker Compose Examples](../docker-compose.yml)
