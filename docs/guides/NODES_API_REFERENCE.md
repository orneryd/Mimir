# Nodes API Reference

Complete CRUD operations for managing nodes in Mimir's knowledge graph.

## Base URL

```
http://localhost:9042/api/nodes
```

## Endpoints

### 1. Create Node

**POST** `/api/nodes`

Creates a new node with automatic embedding generation.

**Request Body:**
```json
{
  "type": "memory",
  "properties": {
    "title": "My Node",
    "content": "Node content here",
    "description": "Optional description",
    "tags": ["tag1", "tag2"]
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "node": {
    "id": "memory-1-1763734516694",
    "type": "memory",
    "properties": {
      "title": "My Node",
      "content": "Node content here",
      "has_embedding": true,
      "embedding_model": "mxbai-embed-large",
      "embedding_dimensions": 1024
    },
    "created": "2025-11-21T14:15:16.694Z",
    "updated": "2025-11-21T14:15:16.694Z"
  }
}
```

**Features:**
- ✅ Automatic embedding generation
- ✅ Automatic chunking for large content (>768 chars)
- ✅ Supports all node types (memory, todo, concept, etc.)

---

### 2. Read Node

**GET** `/api/nodes/:id`

Retrieves a single node by ID.

**Example:**
```bash
curl http://localhost:9042/api/nodes/memory-1-1763734516694
```

**Response (200 OK):**
```json
{
  "id": "memory-1-1763734516694",
  "type": "memory",
  "properties": {
    "title": "My Node",
    "content": "Node content here",
    "has_embedding": true,
    "embedding_model": "mxbai-embed-large",
    "embedding_dimensions": 1024
  },
  "created": "2025-11-21T14:15:16.694Z",
  "updated": "2025-11-21T14:15:16.694Z"
}
```

**Error (404 Not Found):**
```json
{
  "error": "Node not found"
}
```

---

### 3. Update Node (Full)

**PUT** `/api/nodes/:id`

Fully updates a node's properties. **Automatically regenerates embeddings** if content changes.

**Request Body:**
```json
{
  "properties": {
    "title": "Updated Title",
    "content": "Updated content triggers embedding regeneration"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "node": {
    "id": "memory-1-1763734516694",
    "type": "memory",
    "properties": {
      "title": "Updated Title",
      "content": "Updated content triggers embedding regeneration",
      "has_embedding": true,
      "embedding_model": "mxbai-embed-large"
    },
    "updated": "2025-11-21T14:15:30.937Z"
  }
}
```

**Features:**
- ✅ Automatic embedding regeneration when `content`, `text`, `title`, or `description` changes
- ✅ Handles chunking for large content
- ✅ Preserves unchanged properties

---

### 4. Update Node (Partial)

**PATCH** `/api/nodes/:id`

Partially updates a node's properties. **Automatically regenerates embeddings** if content changes.

**Request Body:**
```json
{
  "title": "Only update the title"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "node": {
    "id": "memory-1-1763734516694",
    "type": "memory",
    "properties": {
      "title": "Only update the title",
      "content": "Original content preserved",
      "has_embedding": true
    },
    "updated": "2025-11-21T14:15:45.123Z"
  }
}
```

**Features:**
- ✅ Only updates specified fields
- ✅ Automatic embedding regeneration if content fields change
- ✅ Preserves all other properties

---

### 5. Regenerate Embeddings

**POST** `/api/nodes/:id/embeddings`

Manually regenerates embeddings for a node.

**Example:**
```bash
curl -X POST http://localhost:9042/api/nodes/memory-1-1763734516694/embeddings
```

**Response (200 OK) - Single Embedding:**
```json
{
  "success": true,
  "message": "Generated 1 embedding",
  "embeddingCount": 1,
  "chunked": false,
  "dimensions": 1024,
  "model": "mxbai-embed-large"
}
```

**Response (200 OK) - Chunked:**
```json
{
  "success": true,
  "message": "Generated 5 chunk embeddings",
  "embeddingCount": 5,
  "chunked": true
}
```

**Error (400 Bad Request):**
```json
{
  "error": "No text content found",
  "details": "Node must have content, text, title, or description property"
}
```

**Error (503 Service Unavailable):**
```json
{
  "error": "Embeddings service is not enabled",
  "details": "Check your LLM configuration"
}
```

**Use Cases:**
- Force regeneration after model upgrade
- Fix corrupted embeddings
- Regenerate after manual content edits in Neo4j

---

## Embedding Behavior

### Automatic Embedding Generation

Embeddings are **automatically generated** in these scenarios:

1. **On CREATE** (`POST /api/nodes`)
   - If node has `content`, `text`, `title`, or `description`
   - Chunked if content > 768 characters

2. **On UPDATE** (`PUT` or `PATCH /api/nodes/:id`)
   - If `content`, `text`, `title`, or `description` is modified
   - Old embeddings/chunks are deleted
   - New embeddings/chunks are generated

3. **Manual Regeneration** (`POST /api/nodes/:id/embeddings`)
   - Always regenerates from current content
   - Useful for fixing issues or after model changes

### Chunking Strategy

| Content Length | Strategy | Result |
|----------------|----------|--------|
| ≤ 768 chars | Single embedding | `has_chunks: false` |
| > 768 chars | Chunked embeddings | `has_chunks: true` |

**Chunked nodes:**
- Parent node has `has_chunks: true`, `has_embedding: true`
- No direct embedding on parent (removed)
- Multiple `NodeChunk` nodes created with `HAS_CHUNK` relationships
- Each chunk has its own embedding

---

## Error Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Missing required fields, no content for embeddings |
| 404 | Not Found | Node ID doesn't exist |
| 500 | Internal Server Error | Database error, embedding service error |
| 503 | Service Unavailable | Embeddings service not configured |

---

## Examples

### Create a Memory Node

```bash
curl -X POST http://localhost:9042/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "type": "memory",
    "properties": {
      "title": "Important Decision",
      "content": "We decided to use PostgreSQL for its ACID compliance.",
      "tags": ["decision", "database"]
    }
  }'
```

### Update Content (Triggers Embedding Regeneration)

```bash
curl -X PUT http://localhost:9042/api/nodes/memory-123 \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "content": "Updated decision: Using PostgreSQL 16 with pgvector extension."
    }
  }'
```

### Partial Update (No Embedding Regeneration)

```bash
curl -X PATCH http://localhost:9042/api/nodes/memory-123 \
  -H "Content-Type: application/json" \
  -d '{
    "priority": "high",
    "reviewed": true
  }'
```

### Force Embedding Regeneration

```bash
curl -X POST http://localhost:9042/api/nodes/memory-123/embeddings
```

---

## Integration with VSCode Extension

The VSCode extension uses these endpoints for:

- **"Regenerate embeddings"** button → `POST /api/nodes/:id/embeddings`
- Node editing in UI → `PUT /api/nodes/:id`
- Node creation → `POST /api/nodes`

---

## Performance Notes

- **Embedding generation** takes ~100-500ms per node (depending on content size)
- **Chunked nodes** take longer (100-500ms per chunk)
- **Updates** that don't change content fields are fast (<50ms)
- **Regeneration** is idempotent - safe to call multiple times

---

## See Also

- [RRF Configuration Guide](./RRF_CONFIGURATION_GUIDE.md) - Search configuration
- [LLM Provider Guide](./LLM_PROVIDER_GUIDE.md) - Embeddings setup
- [VSCode Extension Testing](../../vscode-extension/TESTING.md) - UI integration
