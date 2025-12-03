# NornicDB Docker Images

## Image Variants

| Image | Description | Use When |
|-------|-------------|----------|
| `nornicdb-arm64-metal` | Base image (~50MB) | BYOM - bring your own models |
| `nornicdb-arm64-metal-bge` | With BGE-M3 (~1.6GB) | Ready for embeddings immediately |
| `nornicdb-arm64-metal-bge-heimdall` | With BGE-M3 + Heimdall (~2.0GB) | **Full cognitive features** - single-click deploy |
| `nornicdb-amd64-cuda` | Base image (~3GB) | BYOM - bring your own models |
| `nornicdb-amd64-cuda-bge` | With BGE-M3 (~4.5GB) | Ready for embeddings immediately |

### 🛡️ Heimdall Build (NEW)

The `nornicdb-arm64-metal-bge-heimdall` image is "batteries included":
- **BGE-M3** for vector search/embeddings
- **Qwen2.5-0.5B-Instruct** for Heimdall (cognitive guardian)
- **Bifrost** chat interface enabled by default

Heimdall provides:
- Anomaly detection on graph structure
- Runtime diagnosis (goroutine analysis, memory issues)
- Memory curation (summarization, deduplication)
- Natural language interaction via Bifrost

---

## ARM64 Metal (Apple Silicon)

### Prerequisites
- Docker Desktop for Mac
- `models/bge-m3.gguf` file (for BGE variants)
- `models/qwen2.5-1.5b-instruct-q4_k_m.gguf` file (for Heimdall variant)

### Build & Deploy Base Image
```bash
cd nornicdb

# Build
make build-arm64-metal

# Push to registry
make push-arm64-metal

# Or build + push in one command
make deploy-arm64-metal
```

### Build & Deploy BGE Image (with embedded model)
```bash
cd nornicdb

# Ensure model file exists
ls -la models/bge-m3.gguf

# Build (includes the model file)
make build-arm64-metal-bge

# Push to registry
make push-arm64-metal-bge

# Or build + push in one command
make deploy-arm64-metal-bge
```

### Build & Deploy Heimdall Image (full cognitive features)
```bash
cd nornicdb

# Ensure both model files exist
ls -la models/bge-m3.gguf
ls -la models/qwen2.5-1.5b-instruct-q4_k_m.gguf

# Build (includes both models - batteries included!)
make build-arm64-metal-bge-heimdall

# Push to registry
make push-arm64-metal-bge-heimdall

# Or build + push in one command
make deploy-arm64-metal-bge-heimdall
```

**Running the Heimdall image:**
```bash
# Simple run
docker run -p 7474:7474 -p 7687:7687 timothyswt/nornicdb-arm64-metal-bge-heimdall

# With persistent data
docker run -p 7474:7474 -p 7687:7687 -v nornicdb-data:/data timothyswt/nornicdb-arm64-metal-bge-heimdall
```

Access the Bifrost chat interface at `http://localhost:7474/bifrost` to interact with Heimdall.

---

## AMD64 CUDA (NVIDIA GPU)

### Prerequisites
- Docker with NVIDIA runtime
- CUDA drivers installed
- `models/bge-m3.gguf` file (only for BGE variant)

### One-Time Setup: Build CUDA Libraries
This caches llama.cpp CUDA compilation (~15 min build, then reused forever):
```bash
cd nornicdb

# Build the CUDA libs image
make build-llama-cuda

# Push to registry (share across machines)
make push-llama-cuda
```

### Build & Deploy Base Image
```bash
cd nornicdb

# Build
make build-amd64-cuda

# Push to registry
make push-amd64-cuda

# Or build + push in one command
make deploy-amd64-cuda
```

### Build & Deploy BGE Image (with embedded model)
```bash
cd nornicdb

# Ensure model file exists
ls -la models/bge-m3.gguf

# Build (includes the model file)
make build-amd64-cuda-bge

# Push to registry
make push-amd64-cuda-bge

# Or build + push in one command
make deploy-amd64-cuda-bge
```

---

## Deploy All Images

```bash
cd nornicdb

# Deploy base images (both architectures)
make deploy-all

# With custom registry
REGISTRY=myregistry make deploy-all

# With version tag
VERSION=v1.0.0 make deploy-all

# Both custom registry and version
REGISTRY=myregistry VERSION=v1.0.0 make deploy-all
```

---

## Alternative: Shell Scripts

### Mac/Linux
```bash
./build.sh build arm64-metal        # Build base
./build.sh build arm64-metal-bge    # Build with BGE
./build.sh deploy arm64-metal       # Build + push base
./build.sh deploy arm64-metal-bge   # Build + push BGE
./build.sh deploy all               # Deploy all base images
```

### Windows PowerShell
```powershell
.\build.ps1 build amd64-cuda        # Build base
.\build.ps1 build amd64-cuda-bge    # Build with BGE
.\build.ps1 deploy amd64-cuda       # Build + push base
.\build.ps1 deploy amd64-cuda-bge   # Build + push BGE
.\build.ps1 deploy all              # Deploy all base images
```

---

## Running the Images

### BGE Variant (Ready to Go)
No model setup needed - just run:
```bash
# ARM64 Metal
docker run -d --name nornicdb \
  -p 7474:7474 -p 7687:7687 \
  -v nornicdb-data:/data \
  timothyswt/nornicdb-arm64-metal-bge:latest

# AMD64 CUDA
docker run -d --name nornicdb --gpus all \
  -p 7474:7474 -p 7687:7687 \
  -v nornicdb-data:/data \
  timothyswt/nornicdb-amd64-cuda-bge:latest
```

### Base Variant (BYOM - Bring Your Own Model)
Mount your models directory:
```bash
# ARM64 Metal
docker run -d --name nornicdb \
  -p 7474:7474 -p 7687:7687 \
  -v nornicdb-data:/data \
  -v /path/to/models:/app/models \
  timothyswt/nornicdb-arm64-metal:latest

# AMD64 CUDA
docker run -d --name nornicdb --gpus all \
  -p 7474:7474 -p 7687:7687 \
  -v nornicdb-data:/data \
  -v /path/to/models:/app/models \
  timothyswt/nornicdb-amd64-cuda:latest
```

### Verify Running
```bash
# Check health
curl http://localhost:7474/health

# Open UI
open http://localhost:7474
```

---

## Files

```
docker/
├── Dockerfile.arm64-metal      # ARM64 Metal build
├── Dockerfile.amd64-cuda       # AMD64 CUDA build
├── Dockerfile.llama-cuda       # CUDA libs (one-time prereq)
├── entrypoint.sh               # Shared entrypoint
├── docker-compose.arm64-metal.yml
├── docker-compose.cuda.yml
└── README.md
```

## APOC Plugins

All Docker images include the pre-built APOC plugin at `/app/plugins/`:

- **apoc.so**: Full APOC plugin (coll, text, math, convert, date, json, util, agg, create functions)

### Using Plugins

Plugins are automatically loaded at startup. Use them in Cypher queries:

```cypher
RETURN apoc.coll.sum([1, 2, 3, 4, 5])  // 15
RETURN apoc.text.capitalize('hello world')  // "Hello World"
RETURN apoc.math.round(3.14159, 2)  // 3.14
RETURN apoc.create.uuid()  // UUID string
```

### Custom Plugins

Mount custom plugins to extend functionality:

```bash
docker run -d \
  -v ./my-plugins:/app/plugins \
  timothyswt/nornicdb-arm64-metal:latest
```

See [APOC Plugin Guide](../docs/user-guides/APOC_PLUGINS.md) for creating custom plugins.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NORNICDB_DATA_DIR` | `/data` | Data directory |
| `NORNICDB_HTTP_PORT` | `7474` | HTTP/UI port |
| `NORNICDB_BOLT_PORT` | `7687` | Bolt protocol port |
| `NORNICDB_NO_AUTH` | `true` | Disable authentication |
| `NORNICDB_EMBEDDING_MODEL` | `bge-m3` | Embedding model name |
| `NORNICDB_MODELS_DIR` | `/app/models` | Models directory |
| `NORNICDB_EMBEDDING_GPU_LAYERS` | `-1` (CUDA) / `0` (Metal) | GPU layers |
| `NORNICDB_PLUGINS_DIR` | `/app/plugins` | APOC plugins directory |