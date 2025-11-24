# Metadata-Enriched Embeddings & Image Indexing

## Overview

This guide covers two complementary features that enhance Mimir's semantic search capabilities:

1. **Metadata-Enriched Embeddings** - Embeds file metadata (filename, path, language, directory) alongside content for better file discovery
2. **Image Embeddings** - Indexes images using Vision-Language models to generate searchable text descriptions

Both features work together to provide comprehensive semantic search across text files, documents, and images.

## Problem Solved

**Before**: Searching "authentication config" would only match files containing those words in their content.

**After**: The same search also matches:
- Files named `auth-config.ts`
- Files in `auth/` or `config/` directories
- Files with `AuthConfig` class names
- Any semantically related file paths

## Implementation

### Phase 1: Metadata Formatting (✅ COMPLETE)

Added to `src/indexing/EmbeddingsService.ts`:

```typescript
export interface FileMetadata {
  name: string;
  relativePath: string;
  language: string;
  extension: string;
  directory?: string;
  sizeBytes?: number;
}

export function formatMetadataForEmbedding(metadata: FileMetadata): string {
  // Returns natural language description of file
  // Example: "This is a typescript file named auth-api.ts located at src/api/auth-api.ts in the src/api directory."
}
```

### Phase 2: FileIndexer Integration (⏳ TODO)

Modify `src/indexing/FileIndexer.ts` to prepend metadata before generating embeddings:

```typescript
// Around line 197-199
const metadata: FileMetadata = {
  name: path.basename(filePath),
  relativePath: relativePath,
  language: language,
  extension: extension,
  directory: path.dirname(relativePath),
  sizeBytes: stats.size
};

// Prepend metadata to content
const metadataPrefix = formatMetadataForEmbedding(metadata);
const enrichedContent = metadataPrefix + content;

// Generate embeddings with enriched content
const chunkEmbeddings = await this.embeddingsService.generateChunkEmbeddings(enrichedContent);
```

## Benefits

### Improved Search Examples

| Query | Additional Matches |
|-------|-------------------|
| "authentication config" | `auth-config.ts`, `src/auth/config.ts`, `authentication.config.json` |
| "user database models" | `src/users/db/models.ts`, `user-model.py`, `database/users/*` |
| "typescript API routes" | All `.ts` files in `api/` or `routes/` directories |
| "markdown documentation" | All `.md` files, files in `docs/` directory |
| "test authentication" | `auth.test.ts`, `test/auth/*`, test files with "auth" in path |

### Natural Language Format

The metadata is formatted as natural language for optimal embedding quality:

```
This is a typescript file named auth-api.ts located at src/api/auth-api.ts in the src/api directory.

export class AuthService {
  async authenticate(user: User) {
    // ... actual content ...
  }
}
```

## Standard Behavior

Metadata enrichment is **always enabled** - it's the standard way Mimir embeds files. This ensures optimal semantic search across your entire codebase.

## Backward Compatibility

✅ **Fully backward compatible**
- Existing embeddings continue to work
- New embeddings generated on next file modification
- No schema changes required
- No data migration needed
- Gradual rollout as files are re-indexed

## Storage Impact

- **File nodes**: No change (metadata already stored)
- **Chunk nodes**: ~50-100 characters larger (metadata prefix)
- **Embeddings**: Same dimensions, enriched content
- **Estimated increase**: ~5% more text in chunks

## Testing

After implementation:

1. Index a sample file with metadata
2. Search by filename only
3. Search by directory path
4. Search by file type/language
5. Verify metadata appears in search results

## Image Embeddings Configuration

Mimir supports separate configuration for image embeddings using Vision-Language (VL) models.

### Configuration Hierarchy

**VL-specific config → General embedding config → Defaults**

If VL-specific environment variables are set, they override general settings for images. Otherwise, images use the same config as text.

### Environment Variables

```bash
# Image Indexing Control
MIMIR_EMBEDDINGS_IMAGES=true              # Enable/disable image indexing (default: true)

# Optional VL-Specific Config (if not set, falls back to general embedding config)
MIMIR_EMBEDDINGS_VL_PROVIDER=openai       # VL provider (defaults to MIMIR_EMBEDDINGS_PROVIDER)
MIMIR_EMBEDDINGS_VL_API=http://llama-vl-server:8081  # VL API endpoint (defaults to MIMIR_EMBEDDINGS_API)
MIMIR_EMBEDDINGS_VL_API_PATH=/v1/embeddings          # VL API path (defaults to MIMIR_EMBEDDINGS_API_PATH)
MIMIR_EMBEDDINGS_VL_API_KEY=dummy-key                # VL API key (defaults to MIMIR_EMBEDDINGS_API_KEY)
MIMIR_EMBEDDINGS_VL_MODEL=nomic-embed-multimodal     # VL model name (defaults to MIMIR_EMBEDDINGS_MODEL)
MIMIR_EMBEDDINGS_VL_DIMENSIONS=768                   # VL dimensions (defaults to MIMIR_EMBEDDINGS_DIMENSIONS)
```

### Configuration Examples

#### Option 1: Single Unified Model (Simplest)
Use same model for both text and images:

```bash
MIMIR_EMBEDDINGS_IMAGES=true
MIMIR_EMBEDDINGS_MODEL=nomic-embed-multimodal
MIMIR_EMBEDDINGS_DIMENSIONS=768
# No VL-specific vars needed
```

#### Option 2: Separate Models
Use different models for text vs images:

```bash
MIMIR_EMBEDDINGS_IMAGES=true
# Text embeddings
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
MIMIR_EMBEDDINGS_DIMENSIONS=1024
# Image embeddings
MIMIR_EMBEDDINGS_VL_MODEL=nomic-embed-multimodal
MIMIR_EMBEDDINGS_VL_DIMENSIONS=768
```

#### Option 3: Separate Servers
Run text and image models on different servers:

```bash
# Text on port 8080
MIMIR_EMBEDDINGS_API=http://llama-server:8080
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
# Images on port 8081
MIMIR_EMBEDDINGS_VL_API=http://llama-vl-server:8081
MIMIR_EMBEDDINGS_VL_MODEL=nomic-embed-multimodal
```

#### Option 4: No Images
Disable image indexing entirely:

```bash
MIMIR_EMBEDDINGS_IMAGES=false
# Images are skipped just like currently
```

### Image Description Mode (Default)

**How it works:**  
Since multimodal GGUF embedding models are hard to find, Mimir uses a **description-based approach**:

1. **Image preprocessing**: Automatically resize images >3.2 MP to fit Qwen2.5-VL limits
2. **qwen2.5-vl** (Vision-Language model) analyzes the image
3. Generates a detailed text description of the image content
4. **Text embedding model** (e.g., mxbai-embed-large) embeds the description
5. Both description and embedding are stored in Neo4j

**Benefits:**
- ✅ Works with existing text embedding infrastructure
- ✅ No need for rare multimodal GGUF models
- ✅ Semantic image search via descriptions
- ✅ Human-readable descriptions stored alongside embeddings
- ✅ Automatic handling of large images (no manual chunking)

**Configuration:**
```bash
MIMIR_EMBEDDINGS_IMAGES_DESCRIBE_MODE=true  # Default: true
MIMIR_EMBEDDINGS_VL_MODEL=qwen2.5-vl        # VL model for descriptions
MIMIR_EMBEDDINGS_VL_API=http://llama-vl-server:8080
MIMIR_EMBEDDINGS_VL_PROVIDER=llama.cpp

# Image processing
MIMIR_IMAGE_MAX_PIXELS=3211264              # Qwen2.5-VL limit (~1792×1792)
MIMIR_IMAGE_TARGET_SIZE=1536                # Conservative resize target
```

### Image Processing Strategy

**Automatic Downscaling (No Chunking Required):**

Qwen2.5-VL has built-in dynamic resolution handling with these limits:
- **Maximum**: ~1792×1792 pixels (3.2 megapixels)
- **Minimum**: ~79×79 pixels (6,272 pixels)

**For images within limits** (most photos, screenshots):
- Sent directly to VL model without modification
- Examples: 1920×1080 (Full HD), 1280×720, phone photos

**For images exceeding limits** (4K, 8K, high-res scans):
- Automatically resized to fit within 3.2 MP
- Aspect ratio preserved
- Resize time negligible (~50-300ms vs ~12-35s VL processing)

**Why no chunking:**
- ✅ Qwen2.5-VL uses Dynamic Resolution ViT (auto-segments into 14×14 patches)
- ✅ MRoPE preserves spatial relationships across entire image
- ✅ Single API call = faster, simpler, more reliable
- ✅ Semantic search needs "gist", not pixel-perfect detail

**Processing pipeline:**
```
Image File → Check size → Resize if >3.2MP → Base64 encode → 
Qwen2.5-VL → Text description → Add metadata → Embed → Store
```

### Image Metadata Format

When images are indexed, their metadata + AI description is formatted:

```typescript
const imageMetadata: ImageMetadata = {
  ...fileMetadata,
  format: 'jpeg',
  width: 1920,
  height: 1080,
  description: 'A screenshot showing a terminal window with code execution...' // AI-generated
};

// Example output for embedding:
// "This is a JPEG image named screenshot.jpg located at docs/images/screenshot.jpg, 
// 1920x1080 pixels. Description: A screenshot showing a terminal window with code execution 
// and colorful syntax highlighting. The terminal displays Python code with import statements 
// and function definitions."
```

---

## 🖼️ Image Embeddings (VL Description Method)

### Overview

Mimir can index and search images using a Vision-Language Model (VLM) to generate text descriptions, which are then embedded alongside text content. This enables semantic search across both text and images.

**Status**: ✅ **Production Ready** (Disabled by default)

### How It Works

Mimir supports **two modes** for image embeddings:

#### Mode 1: VL Description Method (Default) ⭐

Uses a Vision-Language Model to generate text descriptions:

1. **Image Detection** - Automatically identifies image files (JPG, PNG, WEBP, GIF, BMP, TIFF)
2. **Preprocessing** - Resizes images >3.2 MP to fit model limits (aspect ratio preserved)
3. **VL Analysis** - Qwen2.5-VL generates detailed text description
4. **Metadata Enrichment** - Adds file metadata to description
5. **Text Embedding** - Standard text embedding model embeds the enriched description
6. **Storage** - Both description and embedding stored in Neo4j

**Benefits:**
- ✅ Works with existing text embedding infrastructure
- ✅ No need for rare multimodal GGUF models
- ✅ Semantic image search via descriptions
- ✅ Human-readable descriptions stored alongside embeddings
- ✅ Automatic handling of large images (no manual chunking)

**Enable with:**
```bash
MIMIR_EMBEDDINGS_IMAGES=true
MIMIR_EMBEDDINGS_IMAGES_DESCRIBE_MODE=true  # Default
```

#### Mode 2: Direct Multimodal Embedding

Sends images directly to a multimodal embeddings endpoint:

1. **Image Detection** - Automatically identifies image files
2. **Preprocessing** - Resizes images if needed
3. **Direct Embedding** - Sends image as data URL to multimodal embeddings API
4. **Storage** - Image embedding stored in Neo4j

**Benefits:**
- ✅ True multimodal embeddings (if model supports it)
- ✅ No intermediate text description
- ✅ Can use any OpenAI-compatible multimodal embeddings API
- ✅ Faster processing (no VL model inference)

**Enable with:**
```bash
MIMIR_EMBEDDINGS_IMAGES=true
MIMIR_EMBEDDINGS_IMAGES_DESCRIBE_MODE=false  # Direct mode

# Point to your multimodal embeddings endpoint
MIMIR_EMBEDDINGS_API=http://your-multimodal-api:8080
MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings
MIMIR_EMBEDDINGS_MODEL=your-multimodal-model
```

**Note**: Mode 2 requires a multimodal embeddings endpoint that accepts images in OpenAI format:
```json
{
  "model": "multimodal-model",
  "input": [{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}]
}
```

### Quick Start

Choose your mode based on your needs:
- **Mode 1 (VL Description)**: Best for most users, generates human-readable descriptions
- **Mode 2 (Direct Multimodal)**: For advanced users with multimodal embeddings endpoints

#### Mode 1: VL Description Method (Recommended)

**1. Enable Image Indexing**

```bash
# In your .env file or docker-compose
MIMIR_EMBEDDINGS_IMAGES=true                      # Enable image indexing
MIMIR_EMBEDDINGS_IMAGES_DESCRIBE_MODE=true        # Use VL description method (default)
```

**2. Uncomment VL Server in docker-compose.arm64.yml**

```yaml
llama-vl-server:
  image: timothyswt/llama-cpp-server-arm64-qwen2.5-vl-7b:latest  # or :2b for lighter
  container_name: llama_vl_server
  ports:
    - "8081:8080"
  # ... rest of config
```

**3. Start Services**

```bash
docker compose -f docker-compose.arm64.yml up -d
```

#### Mode 2: Direct Multimodal Embedding (Advanced)

**1. Enable Image Indexing with Direct Mode**

```bash
# In your .env file or docker-compose
MIMIR_EMBEDDINGS_IMAGES=true                      # Enable image indexing
MIMIR_EMBEDDINGS_IMAGES_DESCRIBE_MODE=false       # Use direct multimodal mode

# Point to your multimodal embeddings endpoint
MIMIR_EMBEDDINGS_API=http://your-multimodal-api:8080
MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings
MIMIR_EMBEDDINGS_MODEL=your-multimodal-model
MIMIR_EMBEDDINGS_DIMENSIONS=1024  # Your model's dimensions
```

**2. No VL Server Needed**

Direct mode sends images to your embeddings endpoint, so you don't need the llama-vl-server.

**3. Start Services**

```bash
docker compose -f docker-compose.arm64.yml up -d
```

---

#### Common Steps (Both Modes)
  
  **Index a Folder with Images**

```bash
curl -X POST http://localhost:3000/api/index/folder \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/workspace/images",
    "generateEmbeddings": true
  }'
```

**Search for Images**

```bash
curl -X POST http://localhost:3000/api/search/semantic \
  -H "Content-Type: application/json" \
  -d '{
    "query": "photo of food",
    "limit": 10
  }'
```

### Model Selection

Mimir provides two pre-built Docker images for different resource requirements:

#### 7B Model (Recommended) ⭐

**Image**: `timothyswt/llama-cpp-server-arm64-qwen2.5-vl-7b:latest`

**Specs:**
- **Size**: 6.88 GB
- **RAM Required**: ~8 GB
- **Context**: 128K tokens
- **Speed**: ~30-60 seconds per image (ARM64)
- **Quality**: Excellent descriptions

**Best for:**
- Production environments
- High-quality image descriptions
- Detailed scene understanding
- Complex images with multiple objects

**Configuration:**
```yaml
llama-vl-server:
  image: timothyswt/llama-cpp-server-arm64-qwen2.5-vl-7b:latest
  environment:
    - LLAMA_ARG_CTX_SIZE=131072  # 128K tokens
```

#### 2B Model (Resource-Constrained)

**Image**: `timothyswt/llama-cpp-server-arm64-qwen2.5-vl-2b:latest`

**Specs:**
- **Size**: 2.86 GB
- **RAM Required**: ~4 GB
- **Context**: 32K tokens
- **Speed**: ~15-30 seconds per image (ARM64)
- **Quality**: Good descriptions

**Best for:**
- Development environments
- Resource-constrained systems
- Faster processing
- Simple images

**Configuration:**
```yaml
llama-vl-server:
  image: timothyswt/llama-cpp-server-arm64-qwen2.5-vl-2b:latest
  environment:
    - LLAMA_ARG_CTX_SIZE=32768  # 32K tokens
```

**To switch models:**
1. Update the `image:` line in `docker-compose.arm64.yml`
2. Update `LLAMA_ARG_CTX_SIZE` to match model capacity
3. Restart: `docker compose -f docker-compose.arm64.yml up -d llama-vl-server`

### Configuration Reference

#### Image Processing

```bash
# Enable/disable image indexing
MIMIR_EMBEDDINGS_IMAGES=false  # Default: disabled for safety

# VL description mode (vs direct multimodal embedding - not yet available)
MIMIR_EMBEDDINGS_IMAGES_DESCRIBE_MODE=true  # Default: true

# Image preprocessing
MIMIR_IMAGE_MAX_PIXELS=3211264      # Qwen2.5-VL limit (~1792×1792)
MIMIR_IMAGE_TARGET_SIZE=1536        # Conservative resize target
MIMIR_IMAGE_RESIZE_QUALITY=90       # JPEG quality after resize
```

#### VL Provider Settings

```bash
# VL server configuration
MIMIR_EMBEDDINGS_VL_PROVIDER=llama.cpp
MIMIR_EMBEDDINGS_VL_API=http://llama-vl-server:8080
MIMIR_EMBEDDINGS_VL_API_PATH=/v1/chat/completions
MIMIR_EMBEDDINGS_VL_API_KEY=dummy-key  # Not required for local llama.cpp

# Model settings
MIMIR_EMBEDDINGS_VL_MODEL=qwen2.5-vl
MIMIR_EMBEDDINGS_VL_CONTEXT_SIZE=131072    # 128K for 7b, 32K for 2b
MIMIR_EMBEDDINGS_VL_MAX_TOKENS=2048        # Max description length
MIMIR_EMBEDDINGS_VL_TEMPERATURE=0.7
MIMIR_EMBEDDINGS_VL_TIMEOUT=180000         # 3 minutes (VL is slow)
```

**Fallback Hierarchy**: VL-specific settings override general embedding settings if not provided.

### Image Processing Strategy

#### Automatic Downscaling (No Chunking Required)

Qwen2.5-VL has built-in dynamic resolution handling with these limits:
- **Maximum**: ~1792×1792 pixels (3.2 megapixels)
- **Minimum**: ~79×79 pixels (6,272 pixels)

**For images within limits** (most photos, screenshots):
- Sent directly to VL model without modification
- Examples: 1920×1080 (Full HD), 1280×720, phone photos

**For images exceeding limits** (4K, 8K, high-res scans):
- Automatically resized to fit within 3.2 MP
- Aspect ratio preserved
- Resize time negligible (~50-300ms vs ~12-35s VL processing)

**Why no chunking:**
- ✅ Qwen2.5-VL uses Dynamic Resolution ViT (auto-segments into 14×14 patches)
- ✅ MRoPE preserves spatial relationships across entire image
- ✅ Single API call = faster, simpler, more reliable
- ✅ Semantic search needs "gist", not pixel-perfect detail
- ✅ Negligible resize time: ~50-300ms vs ~12-35s VL processing

**Processing pipeline:**
```
Image File → Check size → Resize if >3.2MP → Base64 encode → 
Qwen2.5-VL → Text description → Add metadata → Embed → Store
```

### Performance Expectations

#### qwen2.5-vl-7b on ARM64:
- Small images (<1MP): ~15-30 seconds
- Medium images (1-3MP): ~30-60 seconds
- Large images (>3MP, auto-resized): ~30-60 seconds

#### qwen2.5-vl-2b on ARM64:
- Small images: ~8-15 seconds
- Medium images: ~15-30 seconds
- Large images: ~15-30 seconds

**Note**: First image may take longer due to model loading. Subsequent images are faster.

### Example Use Cases

**1. Find screenshots:**
```bash
vector_search_nodes(query='screenshot of terminal with code', types=['file'])
```

**2. Locate diagrams:**
```bash
vector_search_nodes(query='architecture diagram showing microservices', types=['file'])
```

**3. Search photos:**
```bash
vector_search_nodes(query='photo of food on a plate', types=['file'])
```

**4. Find UI mockups:**
```bash
vector_search_nodes(query='user interface design with buttons and forms', types=['file'])
```

### Troubleshooting

#### Images timing out

**Symptom**: `TimeoutError: The operation was aborted due to timeout`

**Solution**: Increase timeout (default 3 minutes)
```bash
MIMIR_EMBEDDINGS_VL_TIMEOUT=300000  # 5 minutes
```

#### VL server not responding

**Check health:**
```bash
docker logs llama_vl_server
curl http://localhost:8081/health
```

**Restart:**
```bash
docker compose -f docker-compose.arm64.yml restart llama-vl-server
```

#### Out of memory

**Symptom**: Container crashes or system becomes unresponsive

**Solution**: Switch to 2B model or increase Docker memory limit
```bash
# In Docker Desktop: Settings → Resources → Memory → 8GB+
```

#### Wrong server URL

**Symptom**: `ECONNREFUSED` or connection errors

**Fix**: Ensure correct URLs in docker-compose:
- Text embeddings: `http://llama-server:8080`
- Image embeddings: `http://llama-vl-server:8080`

### Building Custom Images

If you need to build the images yourself:

```bash
# Build 7B image
./scripts/build-llama-cpp-qwen-vl.sh 7b

# Build 2B image
./scripts/build-llama-cpp-qwen-vl.sh 2b

# Push to your registry
docker tag timothyswt/llama-cpp-server-arm64-qwen2.5-vl-7b:latest your-registry/qwen2.5-vl:7b
docker push your-registry/qwen2.5-vl:7b
```

See `scripts/build-llama-cpp-qwen-vl.sh` for details.

---

## Related

- [Knowledge Graph Guide](./KNOWLEDGE_GRAPH.md)
- [File Indexing System](../architecture/FILE_INDEXING_SYSTEM.md)
- [Qwen2.5-VL Setup Guide](../configuration/QWEN_VL_SETUP.md)
- [Vector Search](../../README.md#vector-search)
