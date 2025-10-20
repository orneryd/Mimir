# Docker Setup with Ollama

This guide explains how to run Mimir with a containerized Ollama instance.

## Prerequisites

**⚠️ IMPORTANT: Configure Docker Resources First**

Ollama requires significant memory to run models. **Before starting**, allocate at least **16 GB RAM** to Docker:

- **macOS/Windows**: Docker Desktop → Settings → Resources → Memory: **16 GB**
- **Linux**: No configuration needed (uses host memory directly)

📖 **See [DOCKER_RESOURCES.md](DOCKER_RESOURCES.md) for detailed instructions**

Without sufficient memory, you'll see errors like:
```
llama runner process no longer running: -1
```

## Architecture

The Docker Compose setup includes three services:
- **neo4j**: Graph database for knowledge storage
- **ollama**: LLM inference server (runs models locally)
- **mcp-server**: The Mimir MCP server (connects to both)

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   mcp-server    │────▶│    ollama    │     │   neo4j     │
│  (Port 3000)    │     │ (Port 11434) │◀────│ (Port 7687) │
└─────────────────┘     └──────────────┘     └─────────────┘
        │                      │                     │
        └──────────────────────┴─────────────────────┘
                    Internal Docker Network
```

## Quick Start

### 1. Build and Start Services

```bash
# Build MCP server image with consistent tag
docker build . -t mimir

# Start all services (Neo4j, Ollama, MCP server)
docker compose up -d

# Check status
docker compose ps
```

**Important**: Always use `-t mimir` when building manually to avoid creating multiple unnamed images.

**Alternative** (docker compose handles tagging automatically):
```bash
docker compose build
docker compose up -d
```

### 2. Pull Ollama Models

The setup script **intelligently pulls only the models you need**:

**Automatic model detection:**
```bash
./scripts/setup-ollama-models.sh
```

This script will:
- ✅ Pull **agent models** (qwen3:8b, qwen2.5-coder:1.5b-base) **only if** `defaultProvider: "ollama"` in `.mimir/llm-config.json`
- ✅ Pull **embedding model** (e.g., nomic-embed-text) **only if** `MIMIR_EMBEDDINGS_ENABLED=true` in `.env`
- ℹ️  Skip unnecessary models if you're using a different provider (e.g., Copilot)

**Example output when Ollama is NOT the agent provider:**
```
ℹ️  No Ollama models needed

Current configuration:
   Default provider: copilot
   Vector embeddings: false

Ollama is available but not currently configured for:
   - Agent execution (using copilot instead)
   - Vector embeddings (not enabled)
```

**To pull additional models manually:**

```bash
# Using the helper script (recommended)
./scripts/pull-model.sh qwen2.5-coder:7b
./scripts/pull-model.sh llama3.1:8b
./scripts/pull-model.sh deepseek-r1:8b

# Or directly
docker exec ollama_server ollama pull qwen2.5-coder:7b
docker exec ollama_server ollama pull llama3.1:8b
```

**Remove a model:**
```bash
docker exec ollama_server ollama rm tinyllama
```

### 3. Verify Setup

```bash
# Check Ollama has models
docker exec ollama_server ollama list

# Check MCP server health
curl http://localhost:3000/health

# Check Neo4j (browser UI)
open http://localhost:7474
```

## Configuration

### Environment Variables

The `docker compose.yml` automatically sets:
- `OLLAMA_BASE_URL=http://ollama:11434` - MCP server uses containerized Ollama
- `NEO4J_URI=bolt://neo4j:7687` - MCP server uses containerized Neo4j

### LLM Config Override

The system automatically detects `OLLAMA_BASE_URL` environment variable:

```typescript
// In LLMConfigLoader.ts
if (process.env.OLLAMA_BASE_URL && parsedConfig.providers.ollama) {
  parsedConfig.providers.ollama.baseUrl = process.env.OLLAMA_BASE_URL;
}
```

Priority order:
1. `OLLAMA_BASE_URL` environment variable (Docker uses this)
2. `.mimir/llm-config.json` baseUrl
3. Default: `http://localhost:11434`

## Using the Agent Chain

Once everything is running, use the agent chain as normal:

```bash
# From your host machine
npm run chain "implement authentication"

# Or execute inside the container
docker exec mcp_server npm run chain "implement authentication"
```

## GPU Support (Optional)

To enable GPU acceleration for Ollama (NVIDIA GPUs only):

1. Install [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

2. Uncomment the GPU section in `docker compose.yml`:

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

3. Restart Ollama:

```bash
docker compose up -d --force-recreate ollama
```

## Data Persistence

All data is persisted in local directories:

```
./data/
├── neo4j/     # Graph database data
├── ollama/    # Downloaded models (large!)
└── ...
```

**Note**: Ollama models can be 1-10GB each. Ensure you have sufficient disk space.

## Troubleshooting

### ⚠️ Out of Memory Errors (Most Common)

**Symptoms:**
```
llama runner process no longer running: -1
error loading llama server
```

**Solution:**
1. **Increase Docker memory to 16 GB** - See [DOCKER_RESOURCES.md](DOCKER_RESOURCES.md)
2. Restart Docker Desktop completely
3. Restart services: `docker compose restart`

**Quick check:**
```bash
docker stats --no-stream ollama_server
# Should show: MEM USAGE / LIMIT = XXX / 16GiB
```

### Model Not Found

**Symptoms:**
```
model 'qwen3:8b' not found
```

**Solutions:**
```bash
# 1. Check installed models
docker exec ollama_server ollama list

# 2. If empty, pull the model
./scripts/pull-model.sh qwen3:8b

# 3. Verify config matches installed models
cat .mimir/llm-config.json | grep -A 2 "agentDefaults"
```

**Common issue:** Config says `qwen3` but Ollama needs `qwen3:8b` (with tag)

### Ollama Container Exits Immediately

```bash
# Check logs
docker logs ollama_server --tail 50

# Common causes:
# 1. Insufficient memory (see above)
# 2. Permission issues with ./data/ollama
# 3. Corrupted model files
```

**Fix permission issues:**
```bash
# Stop services
docker compose down

# Fix permissions
rm -rf ./data/ollama
mkdir -p ./data/ollama

# Restart
docker compose up -d
./scripts/setup-ollama-models.sh
```

### Models Not Found After Pull

```bash
# List models in container
docker exec ollama_server ollama list

# If empty, pull models again
./scripts/setup-ollama-models.sh
```

### MCP Server Can't Connect to Ollama

```bash
# Check network connectivity from MCP server
docker exec mcp_server wget -q -O - http://ollama:11434/api/tags

# Or check from host
curl http://localhost:11434/api/tags

# Should return JSON with model list
```

### Container Starts But Crashes on First Request

**Symptoms:**
- `docker ps` shows container running
- First API call crashes Ollama
- Logs show "llama runner process no longer running"

**Root cause:** Not enough memory allocated to Docker

**Solution:** Increase Docker memory to **16 GB** (see [DOCKER_RESOURCES.md](DOCKER_RESOURCES.md))

### Permission Issues with Data Volumes

```bash
# Fix permissions
sudo chown -R $USER:$USER ./data
```

## Development Workflow

### Local Development (No Docker)

If developing locally without Docker:

```bash
# Start only Neo4j in Docker
docker compose up -d neo4j

# Run MCP server locally (uses localhost Ollama)
npm run build
node build/http-server.js
```

### Hybrid Setup

Use containerized Neo4j and Ollama, but run MCP server locally for faster iteration:

```bash
# Start Neo4j and Ollama
docker compose up -d neo4j ollama

# Set environment variable to use Docker Ollama
export OLLAMA_BASE_URL=http://localhost:11434
export NEO4J_URI=bolt://localhost:7687

# Run MCP server locally
npm run build
node build/http-server.js
```

## Stopping Services

```bash
# Stop all services (keeps data)
docker compose down

# Stop and remove volumes (DELETES ALL DATA)
docker compose down -v

# Stop specific service
docker compose stop ollama
```

## Model Recommendations

Based on testing, here are the recommended models:

### Default Models (Auto-installed)

| Model | Size | Use Case | Tool Support |
|-------|------|----------|--------------|
| `qwen3:8b` | 5.2GB | PM/QC agents (✅ Default) | ✅ Yes |
| `qwen2.5-coder:1.5b-base` | 986MB | Worker agents (✅ Default) | ✅ Yes |

**Total: ~6GB**

### Optional Models (Pull manually)

| Model | Size | Use Case | Tool Support | Command |
|-------|------|----------|--------------|---------|
| `qwen2.5-coder:7b` | 4.7GB | Worker (better quality) | ✅ Yes | `./scripts/pull-model.sh qwen2.5-coder:7b` |
| `llama3.1:8b` | 4.9GB | General purpose | ✅ Yes | `./scripts/pull-model.sh llama3.1:8b` |
| `deepseek-r1:8b` | 5.2GB | Advanced reasoning | ✅ Yes | `./scripts/pull-model.sh deepseek-r1:8b` |
| `hermes3:8b` | 4.7GB | Agentic tasks | ✅ Yes | `./scripts/pull-model.sh hermes3:8b` |

### ❌ Not Recommended

| Model | Size | Why Not |
|-------|------|---------|
| `gpt-oss:latest` | 13GB | Too large, unreliable tool calling |
| `tinyllama` | 637MB | No tool support |

**Storage Requirements:**
- Minimal setup (defaults): ~6GB
- With qwen2.5-coder:7b: ~11GB
- With multiple optional models: ~15-25GB

## Next Steps

- [Configure custom models](../docs/configuration/CONFIGURATION.md)
- [Run agent chains](../src/orchestrator/README.md)
- [Deploy to production](../docs/guides/DOCKER_DEPLOYMENT_GUIDE.md)
