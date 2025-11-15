# llama.cpp Docker Image for ARM64

This directory contains the Dockerfile and scripts to build llama.cpp server for ARM64 (Apple Silicon).

## Why Custom Build?

The official `ghcr.io/ggml-org/llama.cpp:server` image claims multi-arch support but actually only provides AMD64. This custom build provides native ARM64 support for Apple Silicon Macs.

## Quick Start

### Using Pre-built Image

```bash
docker pull timothyswt/llama-cpp-server-arm64:latest
docker run -p 11434:8080 -v ./models:/models timothyswt/llama-cpp-server-arm64:latest
```

### Building Locally

```bash
# Build the image
./scripts/build-llama-cpp.sh

# Or manually:
docker build --platform linux/arm64 \
  -t timothyswt/llama-cpp-server-arm64:latest \
  -f docker/llama-cpp/Dockerfile .
```

## Features

- **Native ARM64**: Built specifically for Apple Silicon
- **OpenAI-Compatible API**: Drop-in replacement for Ollama
- **Embeddings Support**: Mean pooling for semantic search
- **Lightweight**: ~200MB runtime image
- **No GPU Required**: Optimized for CPU inference

## Usage with Mimir

The `docker-compose.yml` automatically uses this image for the `llama-server` service:

```yaml
llama-server:
  image: timothyswt/llama-cpp-server-arm64:latest
  ports:
    - "11434:8080"
  volumes:
    - ollama_models:/models
```

## API Endpoints

- **Health**: `GET /health`
- **Embeddings**: `POST /v1/embeddings`
- **Models**: `GET /v1/models`

Compatible with Ollama API format.

## Model Management

### Download Models

Models can be in GGUF format (same as Ollama). Place them in the `/models` directory:

```bash
# If you have Ollama models already:
cp -r ~/.ollama/models ./data/ollama/models

# Or download directly:
curl -L https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q8_0.gguf \
  -o ./data/ollama/models/nomic-embed-text.gguf
```

### Specify Model in docker-compose.yml

Uncomment and set the model path in the `command` section:

```yaml
command:
  - "--model"
  - "/models/nomic-embed-text.gguf"
  - "--alias"
  - "nomic-embed-text"
```

## Performance

ARM64 build performance:
- **Embeddings**: ~50-100ms per request (768-dim)
- **Memory**: ~200MB base + model size
- **CPU**: Utilizes all cores efficiently

## Publishing Updates

```bash
# Build and push new version
./scripts/build-llama-cpp.sh 1.0.1

# Or manually:
docker push timothyswt/llama-cpp-server-arm64:1.0.1
docker push timothyswt/llama-cpp-server-arm64:latest
```

## Troubleshooting

### Image Not Found
```bash
docker pull timothyswt/llama-cpp-server-arm64:latest
```

### Health Check Fails
Wait 30 seconds for server startup, or check logs:
```bash
docker logs llama_server
```

### Model Not Loading
Verify model path and format (must be GGUF):
```bash
docker exec llama_server ls -la /models
```

## Architecture

```
┌─────────────────────────────────┐
│   Docker Container (ARM64)      │
│                                 │
│  ┌──────────────────────────┐   │
│  │  llama-server binary     │   │
│  │  (compiled from source)  │   │
│  └──────────────────────────┘   │
│            ↓                    │
│  ┌──────────────────────────┐   │
│  │   OpenAI-compatible API  │   │
│  │   Port: 8080             │   │
│  └──────────────────────────┘   │
│            ↓                    │
│  ┌──────────────────────────┐   │
│  │   /models (volume)       │   │
│  │   GGUF model files       │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
         ↓
    Port 11434 (external)
         ↓
   Mimir Server
```

## References

- [llama.cpp GitHub](https://github.com/ggerganov/llama.cpp)
- [GGUF Format](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md)
- [OpenAI Embeddings API](https://platform.openai.com/docs/api-reference/embeddings)
