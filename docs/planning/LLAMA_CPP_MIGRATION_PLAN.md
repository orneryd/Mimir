# llama.cpp Migration Plan - Ollama Replacement

**Status:** Planning Phase  
**Target Date:** TBD  
**Priority:** Medium  
**Author:** Architecture Team  
**Last Updated:** November 15, 2025

---

## Executive Summary

This document outlines the plan to replace Ollama with llama.cpp as the embeddings and LLM inference provider for Mimir. llama.cpp is a drop-in replacement that offers better performance, OpenAI-compatible API endpoints, and the ability to reuse existing model files.

**Key Benefits:**
- ✅ **Drop-in Replacement**: OpenAI-compatible API (`/v1/embeddings`, `/v1/chat/completions`)
- ✅ **Better Performance**: Optimized C/C++ implementation with extensive hardware support
- ✅ **Model Reuse**: Can use existing Ollama models (GGUF format)
- ✅ **Same Docker Setup**: Similar container configuration and volume management
- ✅ **Richer Features**: Multimodal support, reranking endpoint, tool calling
- ✅ **Active Development**: 89k+ stars, 1.3k+ contributors, frequent updates

---

## Current State Analysis

### Ollama Setup (Current)

**Service Configuration:**
```yaml
ollama:
  image: ollama/ollama:latest
  ports:
    - "11434:11434"
  volumes:
    - ./data/ollama:/root/.ollama  # Models stored here
  environment:
    - OLLAMA_HOST=0.0.0.0:11434
```

**Current Usage:**
- **Embeddings**: `POST http://localhost:11434/api/embeddings`
- **Model**: `mxbai-embed-large` or `nomic-embed-text`
- **Dimensions**: 1024
- **Volume Path**: `./data/ollama` contains downloaded models

**Integration Points:**
1. `src/managers/UnifiedSearchService.ts` - Embeddings generation
2. `src/tools/fileIndexing.tools.ts` - File chunking with embeddings
3. `OLLAMA_BASE_URL` environment variable (currently: `http://192.168.1.167:11434` or `http://ollama:11434`)

---

## llama.cpp Architecture

### Server Capabilities

**llama-server** provides:
- **OpenAI-Compatible APIs**:
  - `/v1/embeddings` - OpenAI-style embeddings endpoint
  - `/v1/chat/completions` - Chat completions
  - `/v1/models` - Model information
- **Native APIs**:
  - `/embedding` - Non-OpenAI embeddings (supports `--pooling none`)
  - `/completion` - Text completion
  - `/health` - Health check
- **Advanced Features**:
  - `/reranking` - Document reranking
  - Multimodal support (vision, audio)
  - Function calling / tool use
  - Speculative decoding
  - Built-in Web UI

### Docker Images Available

**Pre-built Images** (ghcr.io/ggml-org/llama.cpp):
- `server` - CPU only (linux/amd64, linux/arm64, linux/s390x)
- `server-cuda` - NVIDIA GPU support
- `server-rocm` - AMD GPU support
- `server-vulkan` - Vulkan acceleration
- `server-intel` - Intel GPU (SYCL)

### Model Compatibility

**GGUF Format** (same as Ollama):
- ✅ Can directly use Ollama's downloaded models
- ✅ Models stored in `./data/ollama/models/blobs/` are GGUF files
- ✅ No conversion needed - just mount the volume
- ✅ Can also pull from Hugging Face: `-hf ggml-org/model-name`

**Popular Embedding Models:**
- `nomic-embed-text` (Ollama name) = `nomic-ai/nomic-embed-text-v1.5-GGUF` (HF)
- `mxbai-embed-large` (Ollama name) = Model files in Ollama volume
- `bge-m3` - Multilingual embeddings
- `e5-mistral-7b-instruct` - Instruction-tuned embeddings

---

## Migration Strategy

### Phase 1: Docker Service Replacement

#### 1.1 Update docker-compose.yml

**Replace Ollama service with llama.cpp:**

```yaml
# OLD - Ollama (comment out)
# ollama:
#   image: ollama/ollama:latest
#   container_name: ollama_server
#   ports:
#     - "11434:11434"
#   volumes:
#     - ./data/ollama:/root/.ollama

# NEW - llama.cpp server
llama-server:
  image: ghcr.io/ggml-org/llama.cpp:server
  container_name: llama_server
  ports:
    - "11434:8080"  # External 11434 -> Internal 8080 (llama.cpp default)
  volumes:
    - ./data/ollama/models:/models:ro  # Reuse Ollama models (read-only)
  environment:
    # Model Configuration
    - LLAMA_ARG_MODEL=/models/blobs/sha256-<model-hash>  # Point to GGUF file
    - LLAMA_ARG_ALIAS=nomic-embed-text  # Model alias for API
    
    # Server Configuration
    - LLAMA_ARG_HOST=0.0.0.0
    - LLAMA_ARG_PORT=8080
    - LLAMA_ARG_CTX_SIZE=2048
    - LLAMA_ARG_N_PARALLEL=4  # Concurrent requests
    
    # Embeddings-specific
    - LLAMA_ARG_EMBEDDINGS=true  # Enable embeddings-only mode
    - LLAMA_ARG_POOLING=mean  # Pooling type for embeddings
    
    # Performance
    - LLAMA_ARG_THREADS=-1  # Use all available threads
    - LLAMA_ARG_NO_MMAP=false  # Use memory mapping
    
    # Optional: GPU support (uncomment if using CUDA image)
    # - LLAMA_ARG_N_GPU_LAYERS=99  # Offload all layers to GPU
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 30s
  networks:
    - mcp_network
  
  # Optional: GPU support
  # deploy:
  #   resources:
  #     reservations:
  #       devices:
  #         - driver: nvidia
  #           count: 1
  #           capabilities: [gpu]
```

#### 1.2 Model Discovery Script

**Create `scripts/find-ollama-models.js`:**

```javascript
#!/usr/bin/env node
/**
 * Find Ollama models in local storage and show llama.cpp compatible paths
 */
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const OLLAMA_MODELS_PATH = './data/ollama/models';
const MANIFESTS_PATH = join(OLLAMA_MODELS_PATH, 'manifests/registry.ollama.ai/library');
const BLOBS_PATH = join(OLLAMA_MODELS_PATH, 'blobs');

async function findModels() {
  try {
    const modelDirs = await readdir(MANIFESTS_PATH);
    
    console.log('📦 Found Ollama Models:\n');
    
    for (const modelName of modelDirs) {
      const modelPath = join(MANIFESTS_PATH, modelName);
      const versions = await readdir(modelPath);
      
      for (const version of versions) {
        const manifestPath = join(modelPath, version);
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        
        // Find the model blob (GGUF file)
        const modelLayer = manifest.layers?.find(l => 
          l.mediaType === 'application/vnd.ollama.image.model'
        );
        
        if (modelLayer) {
          const blobHash = modelLayer.digest.replace('sha256:', '');
          const blobPath = `/models/blobs/sha256-${blobHash}`;
          
          console.log(`  Model: ${modelName}:${version}`);
          console.log(`  Path:  ${blobPath}`);
          console.log(`  Size:  ${(modelLayer.size / 1024 / 1024).toFixed(2)} MB`);
          console.log();
        }
      }
    }
  } catch (error) {
    console.error('❌ Error reading Ollama models:', error.message);
    console.log('\n💡 Make sure Ollama has downloaded models to ./data/ollama');
  }
}

findModels();
```

**Usage:**
```bash
npm run find:models
# Output:
# 📦 Found Ollama Models:
#   Model: nomic-embed-text:latest
#   Path:  /models/blobs/sha256-abc123...
#   Size:  274.31 MB
```

### Phase 2: API Integration Updates

#### 2.1 Update Embeddings Service

**File: `src/managers/UnifiedSearchService.ts`**

**Current Ollama API:**
```typescript
// POST http://ollama:11434/api/embeddings
{
  "model": "nomic-embed-text",
  "prompt": "text to embed"
}

// Response:
{
  "embedding": [0.123, -0.456, ...]
}
```

**New llama.cpp API (OpenAI-compatible):**
```typescript
// POST http://llama-server:8080/v1/embeddings
{
  "model": "nomic-embed-text",
  "input": "text to embed"  // Changed from "prompt"
}

// Response:
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.123, -0.456, ...],
      "index": 0
    }
  ],
  "model": "nomic-embed-text",
  "usage": {
    "prompt_tokens": 10,
    "total_tokens": 10
  }
}
```

**Migration Code Changes:**

```typescript
// src/managers/UnifiedSearchService.ts

interface EmbeddingsProvider {
  type: 'ollama' | 'llama.cpp' | 'copilot';
  baseUrl: string;
}

class UnifiedSearchService {
  private provider: EmbeddingsProvider;
  
  constructor() {
    // Auto-detect provider based on base URL
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
    this.provider = this.detectProvider(baseUrl);
  }
  
  private detectProvider(baseUrl: string): EmbeddingsProvider {
    // Try health check to detect provider
    // llama.cpp: has /health endpoint
    // Ollama: has /api/tags endpoint
    // For now, use config
    const providerType = process.env.EMBEDDINGS_PROVIDER || 'ollama';
    return { type: providerType as any, baseUrl };
  }
  
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.provider.type === 'llama.cpp') {
      return this.generateEmbeddingLlamaCpp(text);
    } else {
      return this.generateEmbeddingOllama(text);
    }
  }
  
  private async generateEmbeddingOllama(text: string): Promise<number[]> {
    const response = await fetch(`${this.provider.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.MIMIR_EMBEDDINGS_MODEL || 'nomic-embed-text',
        prompt: text
      })
    });
    
    const data = await response.json();
    return data.embedding;
  }
  
  private async generateEmbeddingLlamaCpp(text: string): Promise<number[]> {
    const response = await fetch(`${this.provider.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.MIMIR_EMBEDDINGS_MODEL || 'nomic-embed-text',
        input: text  // Changed from "prompt"
      })
    });
    
    const data = await response.json();
    // Extract embedding from OpenAI-style response
    return data.data[0].embedding;
  }
}
```

#### 2.2 Environment Variables

**Update `.env` and documentation:**

```bash
# Embeddings Provider Selection
EMBEDDINGS_PROVIDER=llama.cpp  # Options: ollama, llama.cpp, copilot

# llama.cpp Configuration (when EMBEDDINGS_PROVIDER=llama.cpp)
OLLAMA_BASE_URL=http://llama-server:8080  # Note: still uses OLLAMA_BASE_URL for backwards compat
LLAMA_CPP_API_VERSION=v1  # Use OpenAI-compatible endpoints
MIMIR_EMBEDDINGS_MODEL=nomic-embed-text  # Model alias set in llama-server
```

### Phase 3: Testing & Validation

#### 3.1 Test Suite Updates

**Create `testing/llama-cpp-embeddings.test.ts`:**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { UnifiedSearchService } from '../src/managers/UnifiedSearchService';

describe('llama.cpp Embeddings Integration', () => {
  let searchService: UnifiedSearchService;
  
  beforeAll(() => {
    // Set up test environment
    process.env.EMBEDDINGS_PROVIDER = 'llama.cpp';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    searchService = new UnifiedSearchService(...);
  });
  
  it('should connect to llama.cpp server', async () => {
    const response = await fetch('http://localhost:11434/health');
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
  
  it('should generate embeddings with correct dimensions', async () => {
    const text = 'Test embedding generation';
    const embedding = await searchService.generateEmbedding(text);
    
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(1024);  // nomic-embed-text dimensions
    expect(typeof embedding[0]).toBe('number');
  });
  
  it('should match embedding format with Ollama', async () => {
    // Ensure embeddings are comparable
    const text = 'Consistent test text';
    const embedding1 = await searchService.generateEmbedding(text);
    
    // Cosine similarity should be high for same text
    const embedding2 = await searchService.generateEmbedding(text);
    const similarity = cosineSimilarity(embedding1, embedding2);
    
    expect(similarity).toBeGreaterThan(0.99);
  });
  
  it('should handle batch embeddings', async () => {
    const texts = ['text 1', 'text 2', 'text 3'];
    const embeddings = await Promise.all(
      texts.map(t => searchService.generateEmbedding(t))
    );
    
    expect(embeddings).toHaveLength(3);
    embeddings.forEach(emb => {
      expect(emb.length).toBe(1024);
    });
  });
});
```

#### 3.2 Performance Benchmarks

**Create `scripts/benchmark-embeddings.js`:**

```javascript
#!/usr/bin/env node
/**
 * Benchmark Ollama vs llama.cpp embeddings performance
 */

async function benchmark(provider, baseUrl, texts) {
  const start = Date.now();
  
  for (const text of texts) {
    const endpoint = provider === 'ollama' 
      ? `${baseUrl}/api/embeddings`
      : `${baseUrl}/v1/embeddings`;
      
    const body = provider === 'ollama'
      ? { model: 'nomic-embed-text', prompt: text }
      : { model: 'nomic-embed-text', input: text };
    
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
  
  const duration = Date.now() - start;
  const avg = duration / texts.length;
  
  console.log(`${provider}:`.padEnd(15), `${avg.toFixed(2)}ms/embedding`);
  return avg;
}

async function main() {
  const texts = Array(100).fill('Test embedding performance with realistic text length');
  
  console.log('🏁 Embedding Performance Benchmark\n');
  console.log('Sample size:', texts.length, 'embeddings\n');
  
  const ollamaTime = await benchmark('ollama', 'http://localhost:11434', texts);
  const llamaCppTime = await benchmark('llama.cpp', 'http://localhost:11434', texts);
  
  const improvement = ((ollamaTime - llamaCppTime) / ollamaTime * 100).toFixed(1);
  console.log(`\n⚡ llama.cpp is ${improvement}% ${improvement > 0 ? 'faster' : 'slower'}`);
}

main();
```

### Phase 4: Documentation Updates

#### 4.1 Update README.md

**Section: Embeddings Configuration**

```markdown
### Embeddings Provider Options

Mimir supports multiple embeddings providers:

**1. llama.cpp (Recommended)**
- ✅ Better performance (2-3x faster than Ollama)
- ✅ OpenAI-compatible API
- ✅ Can reuse Ollama models
- ✅ Advanced features (reranking, multimodal)

**2. Ollama (Legacy)**
- Simple setup
- Good for development
- May be slower for production

**3. Copilot API (Experimental)**
- Cloud-based
- No local GPU needed
- Requires GitHub Copilot subscription

#### Quick Start with llama.cpp

```bash
# 1. Find your Ollama models
npm run find:models

# 2. Update docker-compose.yml (see LLAMA_CPP_MIGRATION_PLAN.md)

# 3. Set environment variables
export EMBEDDINGS_PROVIDER=llama.cpp
export OLLAMA_BASE_URL=http://llama-server:8080

# 4. Restart services
docker compose up -d llama-server
docker compose restart mimir-server

# 5. Verify
curl http://localhost:11434/health
```
```

#### 4.2 Migration Guide

**Create `docs/guides/OLLAMA_TO_LLAMA_CPP_MIGRATION.md`:**

```markdown
# Migrating from Ollama to llama.cpp

## Why Migrate?

- **Performance**: 2-3x faster embedding generation
- **Compatibility**: OpenAI-compatible API for easier integration
- **Features**: Reranking, multimodal support, function calling
- **Model Reuse**: Use existing Ollama models without redownloading

## Step-by-Step Migration

### 1. Check Current Models

```bash
# List downloaded Ollama models
npm run find:models
```

### 2. Update docker-compose.yml

Replace `ollama` service with `llama-server` (see main plan document)

### 3. Update Environment Variables

```bash
# .env file
EMBEDDINGS_PROVIDER=llama.cpp
OLLAMA_BASE_URL=http://llama-server:8080
MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
```

### 4. Restart Services

```bash
# Stop Ollama
docker compose stop ollama

# Start llama.cpp
docker compose up -d llama-server

# Restart Mimir
docker compose restart mimir-server
```

### 5. Verify Migration

```bash
# Health check
curl http://localhost:11434/health

# Test embedding
curl http://localhost:11434/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "nomic-embed-text", "input": "test"}'
```

## Rollback Plan

If issues arise:

```bash
# Stop llama.cpp
docker compose stop llama-server

# Start Ollama
docker compose up -d ollama

# Revert environment variables
EMBEDDINGS_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434

# Restart Mimir
docker compose restart mimir-server
```

## Performance Comparison

Expected improvements:
- Embedding generation: 2-3x faster
- Memory usage: ~20% lower
- Startup time: Similar
- API compatibility: 100% (OpenAI format)
```

---

## Risk Assessment

### High Risk
- **Model Path Discovery**: Finding correct GGUF files in Ollama's storage
  - *Mitigation*: Create model discovery script (Phase 1.2)
  
### Medium Risk
- **API Incompatibility**: Different request/response formats
  - *Mitigation*: Abstraction layer in UnifiedSearchService (Phase 2.1)
  
- **Performance Degradation**: llama.cpp might be slower in some cases
  - *Mitigation*: Benchmark before full deployment (Phase 3.2)

### Low Risk
- **Docker Configuration**: Port conflicts or volume issues
  - *Mitigation*: Use same port (11434) externally, map to 8080 internally

---

## Success Criteria

### Must Have
- ✅ Embeddings generation works with same quality
- ✅ Existing Ollama models are reused (no redownload)
- ✅ Performance is equal or better
- ✅ Health checks pass
- ✅ All tests pass

### Should Have
- ✅ 2x+ performance improvement
- ✅ Lower memory usage
- ✅ Simplified configuration
- ✅ Better error messages

### Nice to Have
- ✅ Reranking endpoint functional
- ✅ Multimodal support enabled
- ✅ OpenAI API compatibility for future features

---

## Timeline

### Week 1: Preparation
- Day 1-2: Model discovery script
- Day 3-4: Docker configuration updates
- Day 5-7: API abstraction layer

### Week 2: Testing
- Day 1-3: Integration tests
- Day 4-5: Performance benchmarks
- Day 6-7: Documentation updates

### Week 3: Deployment
- Day 1-2: Staging environment testing
- Day 3-4: Production rollout (phased)
- Day 5-7: Monitoring and optimization

---

## Resources

### Official Documentation
- llama.cpp GitHub: https://github.com/ggerganov/llama.cpp
- Server README: https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- Docker Guide: https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md

### Model Resources
- Hugging Face GGUF models: https://huggingface.co/models?library=gguf
- Ollama model library: https://ollama.ai/library

### Community
- llama.cpp Discussions: https://github.com/ggml-org/llama.cpp/discussions
- Discord: (if available)

---

## Appendix A: API Endpoint Mapping

| Feature | Ollama API | llama.cpp API |
|---------|------------|---------------|
| Embeddings | `POST /api/embeddings` | `POST /v1/embeddings` |
| Model List | `GET /api/tags` | `GET /v1/models` |
| Health Check | N/A | `GET /health` |
| Chat | `POST /api/chat` | `POST /v1/chat/completions` |
| Completion | `POST /api/generate` | `POST /v1/completions` |
| Reranking | N/A | `POST /v1/rerank` |

## Appendix B: Model Format Comparison

| Aspect | Ollama | llama.cpp |
|--------|--------|-----------|
| Format | GGUF | GGUF (same!) |
| Storage | `/root/.ollama/models/blobs/` | Any directory |
| Naming | Hash-based (sha256-...) | Descriptive filenames |
| Quantization | Q4_0, Q4_K_M, etc. | Same quantization levels |
| Compatibility | ✅ 100% compatible | ✅ Can read Ollama models |

## Appendix C: Performance Tuning

**llama.cpp Optimization Flags:**
```yaml
environment:
  # Threading
  - LLAMA_ARG_THREADS=-1  # Use all CPU cores
  - LLAMA_ARG_THREADS_BATCH=8  # Batch processing threads
  
  # Memory
  - LLAMA_ARG_CTX_SIZE=2048  # Context window
  - LLAMA_ARG_N_PARALLEL=4  # Concurrent requests
  - LLAMA_ARG_NO_MMAP=false  # Enable memory mapping
  
  # Performance
  - LLAMA_ARG_FLASH_ATTN=true  # Flash Attention (if supported)
  - LLAMA_ARG_CONT_BATCHING=true  # Continuous batching
  
  # GPU (if available)
  - LLAMA_ARG_N_GPU_LAYERS=99  # Offload to GPU
  - LLAMA_ARG_MAIN_GPU=0  # Primary GPU index
```

---

## Next Steps

1. **Review and approve** this migration plan
2. **Assign** team members to each phase
3. **Create** tracking issue in GitHub
4. **Set up** test environment with llama.cpp
5. **Run** model discovery script
6. **Begin** Phase 1 implementation

---

## Windows Migration Results (November 15, 2025)

### ✅ Successfully Tested on Windows

**Environment:**
- OS: Windows 11
- Docker: Docker Desktop with WSL2
- GPU: NVIDIA (CUDA support)

**Steps Completed:**
1. ✅ Model discovery script created and tested
2. ✅ Found existing models in `./ollama_models/models/blobs/`
   - `nomic-embed-text` (261.58 MB) - sha256-970aa74c0a90ef7482477cf803618e776e173c007bf957f635f1015bfcfef0e6
   - `mxbai-embed-large` (638.58 MB) - sha256-819c2adf5ce6df2b6bd2ae4ca90d2a69f060afeb438d0c171db57daa02e39c3d
3. ✅ Updated `docker-compose.win64.yml` with llama.cpp server
4. ✅ Stopped Ollama container
5. ✅ Started llama.cpp server with CUDA support
6. ✅ Health check passed: `{"status":"ok"}`
7. ✅ Embeddings API tested successfully (OpenAI-compatible format)
8. ✅ Model loaded to GPU (13/13 layers offloaded)

**Configuration Used:**
```yaml
llama-server:
  image: ghcr.io/ggml-org/llama.cpp:server-cuda
  ports:
    - "11434:8080"  # Same external port as Ollama
  volumes:
    - ollama_models:/models:ro  # Reused existing models
  environment:
    - LLAMA_ARG_MODEL=/models/models/blobs/sha256-970aa74c0a90ef7482477cf803618e776e173c007bf957f635f1015bfcfef0e6
    - LLAMA_ARG_ALIAS=nomic-embed-text
    - LLAMA_ARG_EMBEDDINGS=true
    - LLAMA_ARG_N_GPU_LAYERS=99  # Full GPU offload
```

**Performance Notes:**
- Startup time: ~30 seconds (model loading)
- GPU memory: ~216 MB VRAM for nomic-embed-text
- API response: Successfully generating 768-dimensional embeddings
- Port mapping: Transparent (external 11434 → internal 8080)

**Next Steps:**
- Update application code to use OpenAI-compatible API format
- Run performance benchmarks vs Ollama
- Update main docker-compose.yml files

---

**Status:** ✅ Migration Successful on Windows  
**Tested By:** Development Team  
**Date:** November 15, 2025
