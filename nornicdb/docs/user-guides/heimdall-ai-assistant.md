# Heimdall AI Assistant

Heimdall is NornicDB's built-in AI assistant that enables natural language interaction with your graph database. Access it through the Bifrost chat interface in the admin UI.

## Quick Start

### Enable Heimdall

```bash
# Environment variable
export NORNICDB_HEIMDALL_ENABLED=true

# Or in docker-compose
environment:
  NORNICDB_HEIMDALL_ENABLED: "true"

# Start NornicDB
./nornicdb serve
```

### Access Bifrost Chat

1. Open NornicDB admin UI at `http://localhost:7474`
2. Click the AI Assistant icon (helmet) in the top bar
3. The Bifrost chat panel opens on the right

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `NORNICDB_HEIMDALL_ENABLED` | `false` | Enable/disable the AI assistant |
| `NORNICDB_HEIMDALL_MODEL` | `qwen2.5-1.5b-instruct-q4_k_m` | GGUF model to use |
| `NORNICDB_MODELS_DIR` | `/app/models` | Directory containing GGUF models |
| `NORNICDB_HEIMDALL_GPU_LAYERS` | `-1` | GPU layers (-1 = auto) |
| `NORNICDB_HEIMDALL_MAX_TOKENS` | `512` | Max tokens per response |
| `NORNICDB_HEIMDALL_TEMPERATURE` | `0.1` | Response creativity (0.0-1.0) |

## Available Commands

### Built-in Commands (Bifrost UI)

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear chat history |
| `/status` | Show connection status |
| `/model` | Show current model |

### Natural Language Actions

Ask Heimdall in plain English:

| Request | What it does |
|---------|--------------|
| "get status" | Show database and system status |
| "db stats" | Show node/relationship counts |
| "hello" | Test connection with greeting |
| "show metrics" | Runtime metrics (memory, goroutines) |
| "health check" | System health status |

### Query Examples

```
count all nodes
show database statistics  
what labels exist in the database
```

## API Endpoints

Bifrost provides OpenAI-compatible HTTP endpoints:

```bash
# Check status
curl http://localhost:7474/api/bifrost/status

# Chat (single message)
curl -X POST http://localhost:7474/api/bifrost/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "get status"}]}'

# Stream response
curl -X POST http://localhost:7474/api/bifrost/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "hello"}], "stream": true}'
```

## Docker Deployment

### Pre-built Image (Recommended)

The `nornicdb-arm64-metal-bge-heimdall` image includes Heimdall ready to use:

```bash
docker pull timothyswt/nornicdb-arm64-metal-bge-heimdall:latest

docker run -d \
  -p 7474:7474 \
  -p 7687:7687 \
  -v nornicdb-data:/data \
  timothyswt/nornicdb-arm64-metal-bge-heimdall
```

### BYOM (Bring Your Own Model)

Heimdall supports any instruction-tuned GGUF model. You can use different models for different use cases.

#### Supported Models

| Model | Size | Speed | Quality | Use Case |
|-------|------|-------|---------|----------|
| `qwen2.5-0.5b-instruct` | 469 MB | Fast | Basic | Quick commands, low memory |
| `qwen2.5-1.5b-instruct-q4_k_m` | 1.0 GB | Medium | Good | **Recommended** - balanced |
| `qwen2.5-3b-instruct-q4_k_m` | 2.0 GB | Slower | Better | Complex queries |
| `phi-3-mini-4k-instruct` | 2.3 GB | Medium | Good | Alternative option |
| `llama-3.2-1b-instruct` | 1.3 GB | Medium | Good | Llama alternative |

#### Download a Model

```bash
# From Hugging Face (Qwen 1.5B recommended)
curl -L -o models/qwen2.5-1.5b-instruct-q4_k_m.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf"

# Smaller model (faster, less capable)
curl -L -o models/qwen2.5-0.5b-instruct.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"

# Larger model (slower, more capable)
curl -L -o models/qwen2.5-3b-instruct-q4_k_m.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
```

#### Docker with Custom Model

```bash
docker run -d \
  -p 7474:7474 \
  -p 7687:7687 \
  -v nornicdb-data:/data \
  -v /path/to/models:/app/models \
  -e NORNICDB_HEIMDALL_ENABLED=true \
  -e NORNICDB_HEIMDALL_MODEL=your-model-name \
  timothyswt/nornicdb-arm64-metal-bge
```

#### Local Development

```bash
# Set models directory
export NORNICDB_MODELS_DIR=./models
export NORNICDB_HEIMDALL_ENABLED=true
export NORNICDB_HEIMDALL_MODEL=qwen2.5-1.5b-instruct-q4_k_m

# Start NornicDB
./nornicdb serve
```

#### Model Naming Convention

The model name should match the filename without `.gguf`:

```
File: models/qwen2.5-1.5b-instruct-q4_k_m.gguf
ENV:  NORNICDB_HEIMDALL_MODEL=qwen2.5-1.5b-instruct-q4_k_m
```

#### Choosing a Quantization

GGUF models come in different quantizations (compression levels):

| Quantization | Quality | Size | Speed |
|--------------|---------|------|-------|
| `q4_k_m` | Good | ~40% | Fast | **Recommended** |
| `q5_k_m` | Better | ~50% | Medium |
| `q8_0` | Best | ~80% | Slower |
| `f16` | Original | 100% | Slowest |

For Heimdall, `q4_k_m` provides the best balance of quality and performance.

#### GPU vs CPU

```bash
# Auto-detect GPU (recommended)
export NORNICDB_HEIMDALL_GPU_LAYERS=-1

# Force all layers on GPU
export NORNICDB_HEIMDALL_GPU_LAYERS=999

# Force CPU only
export NORNICDB_HEIMDALL_GPU_LAYERS=0
```

On Apple Silicon, Metal acceleration is automatic. On NVIDIA, CUDA is used if available.

## Disabling Heimdall

To run NornicDB without the AI assistant:

```bash
# Don't set the variable (disabled by default)
./nornicdb serve

# Or explicitly disable
NORNICDB_HEIMDALL_ENABLED=false ./nornicdb serve
```

When disabled:
- Bifrost chat UI shows "AI Assistant not enabled"
- `/api/bifrost/*` endpoints return disabled status
- No SLM model is loaded (saves memory)

## Chat History

- Chat history persists while the browser session is open
- Closing and reopening Bifrost preserves history
- Closing the browser tab clears history
- Use `/clear` command to manually clear

## Troubleshooting

### "AI Assistant is not enabled"

```bash
# Verify environment variable
echo $NORNICDB_HEIMDALL_ENABLED

# Check startup logs for:
# ✅ Heimdall AI Assistant ready
#    → Model: qwen2.5-1.5b-instruct-q4_k_m
```

### "Model not found"

```bash
# Check models directory
ls /app/models/  # In container
ls ./models/     # Local

# Set correct path
export NORNICDB_MODELS_DIR=/path/to/models
```

### Slow Responses

- Try a smaller model (0.5B instead of 1.5B)
- Enable GPU acceleration: `NORNICDB_HEIMDALL_GPU_LAYERS=-1`
- Reduce max tokens: `NORNICDB_HEIMDALL_MAX_TOKENS=256`

### Actions Not Executing

The SLM interprets your request and outputs action commands. If actions don't execute:

1. Try simpler phrasing: "get status" instead of "what's the current status of everything"
2. Use exact action names: "db stats", "hello", "health"
3. Check server logs for `[Bifrost]` messages

## Extending Heimdall

Create custom plugins to add new capabilities:

- [Writing Heimdall Plugins](./heimdall-plugins.md)
- [Plugin Architecture](../architecture/COGNITIVE_SLM_PROPOSAL.md)

---

**See Also:**
- [Configuration Reference](../configuration/)
- [Docker Deployment](../getting-started/)
- [API Reference](../api-reference/)
