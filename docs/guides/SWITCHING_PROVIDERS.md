# Switching Between LLM Providers

## Overview

With the new split URL configuration, switching between providers is as simple as changing a few environment variables. No code changes required!

## Quick Switch Examples

### Switch to Copilot API (Default)

The default `docker-compose.yml` is configured for Copilot. No changes needed!

### Switch to Ollama

Create a `.env` file or override in your shell:

```bash
# .env file for Ollama
MIMIR_LLM_API=http://ollama:11434
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_MODELS_PATH=/v1/models

MIMIR_EMBEDDINGS_API=http://ollama:11434
MIMIR_EMBEDDINGS_API_PATH=/api/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/api/tags
MIMIR_EMBEDDINGS_PROVIDER=ollama
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
MIMIR_EMBEDDINGS_DIMENSIONS=1024

MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_DEFAULT_MODEL=qwen2.5-coder:14b
```

### Switch to External OpenAI

```bash
# .env file for OpenAI
MIMIR_LLM_API=https://api.openai.com
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_MODELS_PATH=/v1/models
MIMIR_LLM_API_KEY=sk-your-actual-key

MIMIR_EMBEDDINGS_API=https://api.openai.com
MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/v1/models
MIMIR_EMBEDDINGS_API_KEY=sk-your-actual-key
MIMIR_EMBEDDINGS_PROVIDER=openai
MIMIR_EMBEDDINGS_MODEL=text-embedding-3-small
MIMIR_EMBEDDINGS_DIMENSIONS=1536

MIMIR_DEFAULT_PROVIDER=openai
MIMIR_DEFAULT_MODEL=gpt-4-turbo
```

### Hybrid: Ollama LLM + Copilot Embeddings

Mix and match! Use local models for chat but cloud embeddings:

```bash
# .env file for Hybrid
MIMIR_LLM_API=http://ollama:11434
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_MODELS_PATH=/v1/models
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_DEFAULT_MODEL=qwen2.5-coder:14b

MIMIR_EMBEDDINGS_API=http://copilot-api:4141
MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/v1/models
MIMIR_EMBEDDINGS_PROVIDER=copilot
MIMIR_EMBEDDINGS_MODEL=text-embedding-3-small
MIMIR_EMBEDDINGS_DIMENSIONS=1536
```

## How It Works

### Base URL + Path = Full URL

The system concatenates:
```javascript
const fullUrl = `${MIMIR_LLM_API}${MIMIR_LLM_API_PATH}`;
// http://ollama:11434 + /v1/chat/completions
// = http://ollama:11434/v1/chat/completions
```

### No URL Parsing!

Unlike the old system, we **never** parse or manipulate URLs:
- ❌ Old: Extract base from full URL, reconstruct paths
- ✅ New: Simple concatenation, predictable results

### Provider-Specific Paths

Different providers use different API paths:

| Provider | Chat Path | Embeddings Path | Models Path |
|----------|-----------|----------------|-------------|
| **Ollama** | `/v1/chat/completions` | `/api/embeddings` | `/api/tags` |
| **Copilot** | `/v1/chat/completions` | `/v1/embeddings` | `/v1/models` |
| **OpenAI** | `/v1/chat/completions` | `/v1/embeddings` | `/v1/models` |
| **llama.cpp** | `/v1/chat/completions` | `/v1/embeddings` | `/v1/models` |

Notice: Ollama uses `/api/*` for embeddings and models, while others use `/v1/*`!

## Applying Changes

### Using .env File

1. Create/edit `.env` in the project root
2. Add your environment variables
3. Restart containers:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Using Shell Environment

```bash
# Export variables
export MIMIR_LLM_API=http://ollama:11434
export MIMIR_LLM_API_PATH=/v1/chat/completions
# ... etc

# Start services
docker-compose up -d
```

### Using docker-compose Override

Create `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  mimir-server:
    environment:
      - MIMIR_LLM_API=http://ollama:11434
      - MIMIR_LLM_API_PATH=/v1/chat/completions
      - MIMIR_LLM_API_MODELS_PATH=/v1/models
      - MIMIR_EMBEDDINGS_API=http://ollama:11434
      - MIMIR_EMBEDDINGS_API_PATH=/api/embeddings
      - MIMIR_EMBEDDINGS_API_MODELS_PATH=/api/tags
      - MIMIR_EMBEDDINGS_PROVIDER=ollama
      - MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
      - MIMIR_EMBEDDINGS_DIMENSIONS=1024
```

Docker Compose automatically merges this with the base file!

## Verification

### Check Active Configuration

Visit the Mimir UI and check:
1. Model dropdown shows correct available models
2. Chat completions work
3. Embeddings generate successfully

### Check Logs

```bash
docker-compose logs mimir-server | grep "🔧"
```

You should see:
```
🔧 LLM Base URL (copilot): http://copilot-api:4141
🔧 Chat Path: /v1/chat/completions
🔧 Models Path: /v1/models
✅ Vector embeddings enabled: copilot/text-embedding-3-small
   Base URL: http://copilot-api:4141
   Dimensions: 1536
```

### Test Models List

```bash
curl http://localhost:3000/v1/models
```

Should return models from your configured provider!

## Common Issues

### 404 Errors

**Problem**: Endpoints return 404

**Solution**: Check that paths match your provider:
- Ollama embeddings: Use `/api/embeddings`, NOT `/v1/embeddings`
- Copilot/OpenAI: Use `/v1/embeddings`

### 400 Invalid Input (Ollama)

**Problem**: Ollama returns `invalid input` for embeddings

**Solution**: You're using OpenAI-compatible path with Ollama. Switch to:
```bash
MIMIR_EMBEDDINGS_API_PATH=/api/embeddings
```

### Empty Models List

**Problem**: Model dropdown is empty

**Solution**: Check models path matches your provider:
- Ollama: `MIMIR_LLM_API_MODELS_PATH=/api/tags`
- Others: `MIMIR_LLM_API_MODELS_PATH=/v1/models`

## Best Practices

### Keep Provider Settings Together

Group related settings in your `.env`:

```bash
# === OLLAMA CONFIGURATION ===
MIMIR_LLM_API=http://ollama:11434
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_MODELS_PATH=/v1/models
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_DEFAULT_MODEL=qwen2.5-coder:14b

# === EMBEDDINGS (OLLAMA NATIVE) ===
MIMIR_EMBEDDINGS_API=http://ollama:11434
MIMIR_EMBEDDINGS_API_PATH=/api/embeddings
MIMIR_EMBEDDINGS_API_MODELS_PATH=/api/tags
MIMIR_EMBEDDINGS_PROVIDER=ollama
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
MIMIR_EMBEDDINGS_DIMENSIONS=1024
```

### Use Comments to Track Alternatives

```bash
# LLM Configuration
MIMIR_LLM_API=http://copilot-api:4141
# MIMIR_LLM_API=http://ollama:11434  # Switch to Ollama
# MIMIR_LLM_API=https://api.openai.com  # Switch to OpenAI
```

### Verify After Switching

1. Check logs for correct URLs
2. Test model list endpoint
3. Send a test chat message
4. Generate a test embedding

## See Also

- [ENV_VARS.md](../ENV_VARS.md) - Complete environment variable reference
- [LLM Provider Guide](LLM_PROVIDER_GUIDE.md) - Provider-specific setup
- [Docker Compose Examples](../../docker-compose.yml) - Default configuration
