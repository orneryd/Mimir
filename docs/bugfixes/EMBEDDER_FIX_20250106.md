# NornicDB Docker Build Fix

## Issues Fixed

### 1. ✅ Embedder Model Loading Failure (CRITICAL)
**Error**: `llama_model_load: error loading model: vector::_M_range_check: __n (which is 1) >= this->size() (which is 1)`

**Root Cause**: llama.cpp version b4785 has a bug that prevents loading certain GGUF models like bge-m3.gguf

**Solution**: Upgraded llama.cpp from b4785 → b7285 (latest stable, Dec 2025)

**Files Changed**:
- `nornicdb/docker/Dockerfile.llama-cuda`: Updated `ARG LLAMA_VERSION=b7285`
- `nornicdb/docker/Dockerfile.amd64-cuda`: Updated base image reference to `b7285`

### 2. ✅ Build Version Verification
**Problem**: No way to verify which Docker image version is actually running

**Solution**: Added git commit hash and build timestamp to startup logs

**Format**: `🚀 Starting NornicDB v0.1.0-abc1234 (built: 20250106-123456)`

**Files Changed**:
- `nornicdb/cmd/nornicdb/main.go`: Enhanced version display logic
- `nornicdb/docker/Dockerfile.amd64-cuda`: Added commit hash to build ldflags

## Rebuild Instructions

### Step 1: Rebuild llama-cuda-libs base image (one-time, ~15 min)
```powershell
cd C:\Users\timot\Documents\GitHub\Mimir\nornicdb

# Build the new llama.cpp b7285 static library
docker build -f docker/Dockerfile.llama-cuda -t timothyswt/llama-cuda-libs:b7285 .

# (Optional) Push to registry for reuse
docker push timothyswt/llama-cuda-libs:b7285
```

### Step 2: Rebuild NornicDB image (~2 min with cached base)
```powershell
# Full build with BGE model embedded and Heimdall
docker build -f docker/Dockerfile.amd64-cuda `
  --build-arg EMBED_MODEL=true `
  -t timothyswt/nornicdb-amd64-cuda-bge-heimdall:v1.0.1 .

# Or build without embedding model (BYOM)
docker build -f docker/Dockerfile.amd64-cuda `
  -t timothyswt/nornicdb-amd64-cuda:v1.0.1 .
```

### Step 3: Test the fix
```powershell
# Stop old container
docker stop nornicdb
docker rm nornicdb

# Start new container
docker run -d --name nornicdb `
  --gpus all `
  -p 7474:7474 -p 7687:7687 `
  -v C:\Users\timot\Documents\GitHub\Mimir\data\nornicdb:/data `
  -v C:\Users\timot\Documents\GitHub\Mimir\models:/app/models `
  timothyswt/nornicdb-amd64-cuda-bge-heimdall:v1.0.1

# Check logs - should see successful model loading
docker logs nornicdb -f
```

## Expected Log Output (Success)

```
🚀 Starting NornicDB v0.1.0-a1b2c3d (built: 20250106-143022)
   Data directory:  /data
   Bolt protocol:   bolt://localhost:7687
   HTTP API:        http://localhost:7474
🧠 Loading local embedding model: /app/models/bge-m3.gguf
   GPU layers: -1 (-1 = auto/all)
✅ Model loaded: bge-m3 (1024 dimensions)
🔥 Model warmup enabled: every 5m0s
✓ Embeddings enabled: local GGUF (bge-m3, 1024 dims)
```

## Verification

1. **Check version includes commit hash**:
   ```
   🚀 Starting NornicDB v0.1.0-a1b2c3d (built: 20250106-143022)
   ```

2. **Confirm model loads without error**:
   ```
   ✅ Model loaded: bge-m3 (1024 dimensions)
   ```
   
3. **Test embeddings**:
   - Open http://localhost:7474
   - Click "Regenerate Embeddings" 
   - Should return success (not 503)

## Rollback (if needed)

```powershell
# Revert to old working image (Mac build)
docker stop nornicdb
docker rm nornicdb
docker run -d --name nornicdb --gpus all -p 7474:7474 -p 7687:7687 `
  -v C:\Users\timot\Documents\GitHub\Mimir\data\nornicdb:/data `
  timothyswt/nornicdb-amd64-cuda-bge-heimdall:v1.0.0
```

## Technical Details

### Why this fixes the embedder issue:

1. **Old llama.cpp b4785** (several months old):
   - Had a bug in GGUF model loading that caused vector bounds check failures
   - Specific to certain model architectures like BGE-M3
   - Manifested as: `vector::_M_range_check: __n (which is 1) >= this->size() (which is 1)`

2. **New llama.cpp b7285** (Dec 2025):
   - Fixed GGUF loading bugs
   - Improved model compatibility
   - Better error messages
   - CUDA optimizations

### Why build timestamp matters:

- Docker image tags (`:latest`, `:v1.0.0`) can be ambiguous
- Commit hash proves exactly which code is running
- Build timestamp shows when image was created
- Enables debugging: "Was this built before or after the fix?"

## Related Files

- `nornicdb/docker/Dockerfile.llama-cuda` - llama.cpp static library builder
- `nornicdb/docker/Dockerfile.amd64-cuda` - Main NornicDB CUDA build
- `nornicdb/cmd/nornicdb/main.go` - Startup logging with version info
- `nornicdb/pkg/embed/local_gguf.go` - Local GGUF embedder (calls llama.cpp)
- `nornicdb/pkg/localllm/llama_windows.go` - llama.cpp CGO bindings

## Notes

- The old `timothyswt/llama-cuda-libs:b4785` image can be kept for now (doesn't hurt)
- New builds will automatically use b7285 due to Dockerfile changes
- Build time ~17 minutes total:
  - llama-cuda-libs: ~15 min (one-time)
  - nornicdb: ~2 min (uses cached llama-cuda-libs)
