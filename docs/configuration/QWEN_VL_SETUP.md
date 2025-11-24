# Qwen2.5-VL Vision-Language Model Setup

## 🎯 Overview

This document describes the setup and configuration for using **Qwen2.5-VL** vision-language models with Mimir for image understanding and description generation.

**Note:** We're using Qwen2.5-VL instead of Qwen3-VL due to better llama.cpp compatibility and stable GGUF support.

## 🏗️ Architecture

```
Image File → llama.cpp (qwen2.5-vl) → Text Description → 
nomic-embed-text-v1.5 (embed description) → Neo4j (vector + description)
```

**Why this approach?**
- ✅ Multimodal GGUF embedding models are rare/unavailable
- ✅ VLM descriptions are human-readable and debuggable
- ✅ Works with existing text embedding infrastructure
- ✅ Provides semantic image search capabilities

## 📦 Available Models

| Model | GGUF Size | Context | RAM Required | Speed | Quality |
|-------|-----------|---------|--------------|-------|---------|
| **qwen2.5-vl-2b** | ~1.5 GB | 32K tokens | ~2 GB | ~60 tok/s | Good |
| **qwen2.5-vl-7b** | ~4.8 GB | 128K tokens | ~6 GB | ~35 tok/s | **Excellent** ⭐ |
| **qwen2.5-vl-72b** | ~45 GB | 128K tokens | ~48 GB | ~8 tok/s | Best |

*Speeds are approximate on Apple Silicon M-series*

## 🔧 Configuration

### Environment Variables (Maxed Out Settings)

```bash
# Image Embeddings Control
MIMIR_EMBEDDINGS_IMAGES=true                          # Enable image indexing
MIMIR_EMBEDDINGS_IMAGES_DESCRIBE_MODE=true            # Use VLM description method

# VL Provider Configuration
MIMIR_EMBEDDINGS_VL_PROVIDER=llama.cpp                # Provider type
MIMIR_EMBEDDINGS_VL_API=http://llama-vl-server:8080   # VL server endpoint
MIMIR_EMBEDDINGS_VL_API_PATH=/v1/chat/completions     # OpenAI-compatible endpoint
MIMIR_EMBEDDINGS_VL_API_KEY=dummy-key                 # Not required for local
MIMIR_EMBEDDINGS_VL_MODEL=qwen2.5-vl                  # Model name

# Context & Generation Settings (MAXED OUT)
MIMIR_EMBEDDINGS_VL_CONTEXT_SIZE=131072               # 128K tokens (7b/72b)
MIMIR_EMBEDDINGS_VL_MAX_TOKENS=2048                   # Max description length
MIMIR_EMBEDDINGS_VL_TEMPERATURE=0.7                   # Balanced creativity
MIMIR_EMBEDDINGS_VL_DIMENSIONS=768                    # Falls back to text dims
```

### Docker Compose Service

```yaml
llama-vl-server:
  image: timothyswt/llama-cpp-server-arm64-qwen-vl:8b  # or :4b
  container_name: llama_vl_server
  ports:
    - "8081:8080"  # Different port to avoid conflict
  environment:
    # Runtime overrides (model is baked into image)
    - LLAMA_ARG_CTX_SIZE=131072  # 128K tokens (8b), use 32768 for 4b
    - LLAMA_ARG_N_PARALLEL=4
    - LLAMA_ARG_THREADS=-1  # Use all available threads
    - LLAMA_ARG_HOST=0.0.0.0
    - LLAMA_ARG_PORT=8080
    # Vision-specific settings
    - LLAMA_ARG_TEMPERATURE=0.7
    - LLAMA_ARG_TOP_K=20
    - LLAMA_ARG_TOP_P=0.95
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 60s  # VL models take longer to load
  networks:
    - mcp_network
```

## 🚀 Building Docker Images

### Prerequisites

1. **Pull models from Ollama** (already done):
   ```bash
   ollama pull qwen3-vl:4b
   ollama pull qwen3-vl:8b
   ```

2. **Extract GGUF files** (already done):
   ```bash
   # Models are copied to docker/llama-cpp/models/
   ls -lh docker/llama-cpp/models/
   # qwen3-vl-4b.gguf  (3.3 GB)
   # qwen3-vl-8b.gguf  (6.1 GB)
   ```

### Build Commands

```bash
# Build 4b image (faster, lighter)
./scripts/build-llama-cpp-qwen-vl.sh 4b

# Build 8b image (recommended, best balance)
./scripts/build-llama-cpp-qwen-vl.sh 8b

# Build 32b image (requires downloading model first)
./scripts/build-llama-cpp-qwen-vl.sh 32b
```

### Build Process

Each build:
1. ✅ Clones **latest** llama.cpp (main branch) for qwen3-vl support
2. ✅ Compiles llama.cpp server with multimodal support
3. ✅ Copies **only** the specified model (keeps image size down)
4. ✅ Tests locally on port 8080
5. ✅ Prompts for Docker Hub push

## 🧪 Testing

### Health Check

```bash
curl http://localhost:8081/health
```

### Image Description Test

```bash
# Convert image to base64
IMAGE_BASE64=$(base64 -i /path/to/image.png | tr -d '\n')

# Test vision capabilities
curl -X POST http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-vl",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "Describe this image in detail."},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,'$IMAGE_BASE64'"}}
      ]
    }],
    "max_tokens": 2048,
    "temperature": 0.7
  }'
```

## 📊 Performance Tuning

### Context Size by Model

```bash
# 4b model
LLAMA_ARG_CTX_SIZE=32768   # 32K tokens

# 8b model (recommended)
LLAMA_ARG_CTX_SIZE=131072  # 128K tokens

# 32b model
LLAMA_ARG_CTX_SIZE=131072  # 128K tokens
```

### Parallelism

```bash
LLAMA_ARG_N_PARALLEL=4     # Process 4 requests simultaneously
LLAMA_ARG_THREADS=-1       # Use all available CPU threads
```

### Generation Quality

```bash
LLAMA_ARG_TEMPERATURE=0.7  # Balanced (0.0 = deterministic, 1.0 = creative)
LLAMA_ARG_TOP_K=20         # Consider top 20 tokens
LLAMA_ARG_TOP_P=0.95       # Nucleus sampling threshold
```

## 🏷️ Docker Image Tags

```
timothyswt/llama-cpp-server-arm64-qwen-vl:4b
timothyswt/llama-cpp-server-arm64-qwen-vl:4b-latest
timothyswt/llama-cpp-server-arm64-qwen-vl:8b
timothyswt/llama-cpp-server-arm64-qwen-vl:8b-latest
timothyswt/llama-cpp-server-arm64-qwen-vl:latest  (→ 8b)
```

## 🐛 Troubleshooting

### Error: "key not found in model: qwen3vl.rope.dimension_sections"

**Cause:** Old llama.cpp version doesn't support qwen3-vl models

**Solution:** Rebuild with latest llama.cpp:
```bash
# Dockerfile now uses latest main branch
./scripts/build-llama-cpp-qwen-vl.sh 4b
```

### Container Keeps Restarting

**Check logs:**
```bash
docker logs llama_vl_server --tail 50
```

**Common causes:**
- Model file not found/corrupted
- Insufficient memory (need ~4GB for 4b, ~8GB for 8b)
- llama.cpp version incompatibility

### Slow Inference

**Solutions:**
- Use 4b model instead of 8b
- Reduce `LLAMA_ARG_CTX_SIZE`
- Reduce `LLAMA_ARG_N_PARALLEL`
- Enable GPU support (if available)

## 📐 Image Processing Strategy

### Automatic Downscaling (No Chunking Required)

Qwen2.5-VL has built-in dynamic resolution handling:

**Model Limits:**
- `image_max_pixels`: 3,211,264 (~1792×1792 pixels, 3.2 MP)
- `image_min_pixels`: 6,272 (~79×79 pixels)
- `patch_size`: 14×14 pixels
- `image_size`: 560 pixels

**Supported Image Sizes:**
- ✅ 1920×1080 (Full HD) = 2.07 MP → **No resize needed**
- ✅ 1792×1792 (Square) = 3.21 MP → **No resize needed**
- ⚠️ 2560×1440 (2K) = 3.69 MP → **Auto-resized**
- ⚠️ 3840×2160 (4K) = 8.29 MP → **Auto-resized**

**Processing Pipeline:**
```
1. Check image dimensions
2. If > 3.2 MP: Resize to fit (preserve aspect ratio)
3. Convert to Base64 Data URL
4. Send to Qwen2.5-VL
5. Receive text description
6. Embed description with metadata
7. Store in Neo4j
```

**Why No Chunking:**
- ✅ **Dynamic Resolution ViT**: Auto-segments into 14×14 patches
- ✅ **MRoPE**: Preserves spatial relationships across entire image
- ✅ **Single API call**: Faster, simpler, more reliable
- ✅ **Semantic search**: Needs "gist", not pixel-perfect detail
- ✅ **Negligible resize time**: ~50-300ms vs ~12-35s VL processing

**Configuration:**
```bash
MIMIR_IMAGE_MAX_PIXELS=3211264    # Qwen2.5-VL limit
MIMIR_IMAGE_TARGET_SIZE=1536      # Conservative resize target
MIMIR_IMAGE_RESIZE_QUALITY=90     # JPEG quality after resize
```

## 🔐 Security

- Models run locally (no external API calls)
- No API key required
- Images are processed locally
- Descriptions stored in Neo4j

## 📚 Related Documentation

- [Metadata Enriched Embeddings](../guides/METADATA_ENRICHED_EMBEDDINGS.md)
- [Qwen3-VL README](../../docker/llama-cpp/README-QWEN-VL.md)
- [Environment Variables](../../env.example)

## 🔗 External Resources

- [Qwen3-VL Model Card](https://huggingface.co/Qwen/Qwen3-VL)
- [llama.cpp GitHub](https://github.com/ggerganov/llama.cpp)
- [GGUF Format Spec](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md)

## 📝 License

Qwen3-VL models are licensed under **Apache 2.0** - compatible with MIT projects.
