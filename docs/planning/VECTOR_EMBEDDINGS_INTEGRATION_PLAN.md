# Ollama + Neo4j Vector Embeddings Integration Plan

**Version**: 1.0.0  
**Date**: October 18, 2025  
**Status**: Planning Phase  
**Target**: Mimir Graph-RAG TODO v1.1.0

---

## Executive Summary

Integration plan for adding lightweight local LLM inference and vector embeddings to the Mimir Graph-RAG system using Ollama + Neo4j vector search. This enables semantic search across graph nodes without external API dependencies.

**Key Benefits**:
- ✅ **Local-first**: No external API keys or rate limits
- ✅ **Privacy**: All inference happens locally
- ✅ **Cost**: Zero per-token costs
- ✅ **Speed**: < 50ms vector search on 100K nodes
- ✅ **Lightweight**: < 2GB additional memory footprint

---

## Research Foundation

**Full research documentation**: `research/LIGHTWEIGHT_LLM_RESEARCH.md`

**Key Findings**:
- **LLM**: TinyLlama 1.1B (default), upgradeable to Phi-3-mini 3.8B or Llama 3.2 3B
- **Embeddings**: Nomic Embed Text v1.5 @ 512 dimensions (Matryoshka scaling 64-768)
- **Framework**: Ollama (Docker-native, LangChain-integrated, llama.cpp backend)
- **Vector Store**: Neo4j 5.15 vector indexes (cosine similarity)

---

## Special Considerations for Mimir

### 1. Multi-Agent Graph-RAG Context

**Current Mimir Architecture** (per `docs/architecture/MULTI_AGENT_GRAPH_RAG.md`):
- Neo4j stores nodes (todos, files, concepts) with relationships
- Context isolation: 90% context reduction via filtered subgraphs
- Multi-agent locking: Optimistic locking for concurrent access
- File indexing: Automatic watching with .gitignore support

**Vector Embeddings Integration Points**:

**A. Enhanced Context Retrieval** (Primary Use Case)
- **Current**: `get_task_context` filters by relationships only
- **Enhanced**: Add semantic similarity to find related context
- **Example**: Agent working on "authentication" task gets semantically similar nodes (security, login, tokens) even without explicit edges

**B. Semantic Search Tool**
- **New Tool**: `graph_semantic_search`
- **Input**: Natural language query + optional filters (node type, agent context)
- **Output**: Top-K nodes ranked by embedding similarity + graph distance
- **Use Case**: Agent searches "how to handle errors" → returns error-handling patterns from codebase

**C. File Content Search**
- **Enhancement**: `index_folder` now generates embeddings for file content
- **Query**: Search file contents semantically ("find database connection code")
- **Returns**: Relevant files + line numbers + similarity scores

**D. Associative Memory**
- **Pattern**: Connect nodes by semantic similarity, not just explicit relationships
- **Example**: "TODO: Fix login bug" → finds related "authentication.ts" file and "security" concept nodes
- **Benefit**: Multi-hop retrieval includes semantic + structural paths

### 2. Node Schema Extensions

**Current Node Properties**:
```typescript
interface GraphNode {
  id: string;
  type: string; // "todo", "file", "concept", etc.
  properties: Record<string, any>;
  lockedBy?: string;
  lockedUntil?: number;
}
```

**Enhanced Schema**:
```typescript
interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, any>;
  lockedBy?: string;
  lockedUntil?: number;
  
  // NEW: Vector embedding support
  embedding?: number[];          // Vector representation
  embeddingModel?: string;       // "nomic-embed-text:v1.5"
  embeddingDimension?: number;   // 512
  embeddingTimestamp?: number;   // When generated
  embeddableContent?: string;    // Cached text used for embedding
}
```

**Rationale**:
- `embedding`: Stored as Neo4j list property (efficient vector index)
- `embeddingModel`: Track model for compatibility checks
- `embeddingDimension`: Validate dimension consistency
- `embeddingTimestamp`: Stale detection / re-embedding trigger
- `embeddableContent`: Cache for re-embedding if model changes

### 3. Configuration Management

**New Configuration File**: `.mimir/embedding-config.json`

```json
{
  "llm": {
    "enabled": true,
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "tinyllama",
    "temperature": 0.7,
    "contextWindow": 4096
  },
  "embeddings": {
    "enabled": true,
    "provider": "ollama",
    "baseUrl": "http://localhost:11434",
    "model": "nomic-embed-text",
    "dimension": 512,
    "batchSize": 32,
    "cacheEmbeddings": true
  },
  "vectorSearch": {
    "indexName": "node_embeddings",
    "similarityFunction": "cosine",
    "defaultTopK": 10,
    "minSimilarityScore": 0.7
  },
  "autoEmbed": {
    "onNodeCreate": true,
    "onNodeUpdate": true,
    "nodeTypes": ["todo", "file", "concept"],
    "contentFields": ["title", "description", "content", "notes"]
  }
}
```

**Environment Variables** (docker-compose.yml):
```bash
OLLAMA_BASE_URL=http://ollama:11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSION=512
VECTOR_INDEX_NAME=node_embeddings
```

### 4. Backward Compatibility

**Non-Breaking Changes**:
- ✅ Embeddings are **optional**: Existing nodes without embeddings work normally
- ✅ New tools are **additive**: `graph_semantic_search` doesn't affect existing tools
- ✅ Configuration is **opt-in**: Default config disables embeddings unless Ollama detected
- ✅ Graceful degradation: If Ollama unavailable, vector search returns empty results with warning

**Migration Strategy**:
```typescript
// Detect existing Mimir installation
if (existingNodesWithoutEmbeddings > 0) {
  console.log(`
    ⚠️  Found ${existingNodesWithoutEmbeddings} nodes without embeddings.
    
    To enable semantic search:
    1. Start Ollama: docker-compose up -d ollama
    2. Run migration: npm run embed:migrate
    3. Estimated time: ~${estimatedTime} minutes
    
    Or continue without semantic search (existing functionality unaffected)
  `);
}
```

### 5. Testing Requirements

**Unit Tests** (Per best practices - every new piece of code):

**A. Ollama Integration Tests** (`test/integration/ollama.test.ts`):
```typescript
describe('OllamaIntegration', () => {
  test('should connect to Ollama service', async () => {
    const ollama = new OllamaClient(config);
    const health = await ollama.healthCheck();
    expect(health.status).toBe('ok');
  });

  test('should generate embeddings with correct dimensions', async () => {
    const embedding = await ollama.embed('test content');
    expect(embedding).toHaveLength(512);
    expect(embedding.every(n => typeof n === 'number')).toBe(true);
  });

  test('should handle batch embeddings', async () => {
    const texts = ['text 1', 'text 2', 'text 3'];
    const embeddings = await ollama.embedBatch(texts);
    expect(embeddings).toHaveLength(3);
    expect(embeddings[0]).toHaveLength(512);
  });

  test('should fallback gracefully if Ollama unavailable', async () => {
    const ollama = new OllamaClient({ baseUrl: 'http://localhost:9999' });
    const result = await ollama.embed('test');
    expect(result).toBeNull();
    expect(ollama.lastError).toBeDefined();
  });
});
```

**B. Vector Index Tests** (`test/integration/vector-index.test.ts`):
```typescript
describe('Neo4jVectorIndex', () => {
  test('should create vector index with correct dimensions', async () => {
    await vectorIndex.create('test_index', 512, 'cosine');
    const indexes = await vectorIndex.list();
    expect(indexes).toContainEqual(
      expect.objectContaining({ name: 'test_index', dimensions: 512 })
    );
  });

  test('should insert and retrieve embeddings', async () => {
    const nodeId = 'test-node-1';
    const embedding = Array(512).fill(0).map(() => Math.random());
    await vectorIndex.insert(nodeId, embedding);
    
    const results = await vectorIndex.query(embedding, 5);
    expect(results[0].nodeId).toBe(nodeId);
    expect(results[0].score).toBeGreaterThan(0.99); // cosine similarity
  });

  test('should validate dimension consistency', async () => {
    const wrongDimension = Array(256).fill(0);
    await expect(
      vectorIndex.insert('node-2', wrongDimension)
    ).rejects.toThrow('Dimension mismatch');
  });
});
```

**C. Semantic Search Tests** (`test/tools/semantic-search.test.ts`):
```typescript
describe('graph_semantic_search tool', () => {
  test('should find semantically similar nodes', async () => {
    // Setup: Create nodes with similar content
    await graph.addNode({ type: 'todo', properties: { 
      title: 'Fix authentication bug' 
    }});
    await graph.addNode({ type: 'todo', properties: { 
      title: 'Improve login security' 
    }});
    
    // Generate embeddings
    await embeddings.embedAllNodes();
    
    // Query
    const results = await tools.graph_semantic_search({
      query: 'security issues with user login',
      topK: 5
    });
    
    expect(results).toHaveLength(2);
    expect(results[0].properties.title).toContain('authentication');
  });

  test('should combine semantic + graph filters', async () => {
    const results = await tools.graph_semantic_search({
      query: 'database connections',
      filters: { type: 'file', lockedBy: null },
      topK: 10
    });
    
    expect(results.every(n => n.type === 'file')).toBe(true);
    expect(results.every(n => !n.lockedBy)).toBe(true);
  });

  test('should return empty array if embeddings not available', async () => {
    // Simulate Ollama down
    const results = await tools.graph_semantic_search({
      query: 'test query'
    });
    
    expect(results).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Embeddings not available')
    );
  });
});
```

**D. Model Swap Tests** (`test/integration/model-migration.test.ts`):
```typescript
describe('EmbeddingModelMigration', () => {
  test('should detect dimension mismatch', async () => {
    // Create nodes with 512-dim embeddings
    await createNodesWithEmbeddings(512);
    
    // Try to add node with 256-dim embedding
    await expect(
      graph.addNode({ 
        type: 'todo', 
        embedding: Array(256).fill(0) 
      })
    ).rejects.toThrow('Embedding dimension mismatch');
  });

  test('should warn when changing embedding model', async () => {
    config.embeddings.model = 'bge-small'; // Different model
    const warnings = await embeddings.validateConfig();
    
    expect(warnings).toContainEqual(
      expect.stringContaining('model change requires re-embedding')
    );
  });

  test('should migrate embeddings to new model', async () => {
    const oldModel = 'nomic-embed-text';
    const newModel = 'bge-small';
    
    await createNodesWithEmbeddings(512, oldModel);
    const migration = await embeddings.migrate(newModel, 384);
    
    expect(migration.reembedded).toBeGreaterThan(0);
    expect(migration.newDimension).toBe(384);
  });
});
```

**E. Performance Tests** (`test/performance/vector-search.bench.ts`):
```typescript
describe('VectorSearchPerformance', () => {
  test('should search 10K nodes in < 10ms', async () => {
    await createNodesWithEmbeddings(10000, 512);
    
    const start = Date.now();
    const results = await vectorIndex.query(testEmbedding, 10);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(10);
    expect(results).toHaveLength(10);
  });

  test('should generate embeddings at > 100 docs/sec', async () => {
    const docs = Array(1000).fill(0).map((_, i) => `Document ${i}`);
    
    const start = Date.now();
    await ollama.embedBatch(docs, { batchSize: 32 });
    const duration = Date.now() - start;
    
    const docsPerSec = 1000 / (duration / 1000);
    expect(docsPerSec).toBeGreaterThan(100);
  });
});
```

### 6. Error Handling & Edge Cases

**Critical Error Scenarios**:

**A. Ollama Service Unavailable**
```typescript
try {
  const embedding = await ollama.embed(text);
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    logger.warn('Ollama service not available. Semantic search disabled.');
    return null; // Graceful degradation
  }
  throw error; // Re-throw unexpected errors
}
```

**B. Model Not Downloaded**
```typescript
// Check if model exists before embedding
const availableModels = await ollama.listModels();
if (!availableModels.includes(config.embeddings.model)) {
  logger.info(`Model ${config.embeddings.model} not found. Pulling...`);
  await ollama.pullModel(config.embeddings.model);
}
```

**C. Dimension Mismatch**
```typescript
const existingDimension = await vectorIndex.getDimension();
if (existingDimension && existingDimension !== config.embeddings.dimension) {
  throw new Error(`
    Dimension mismatch detected:
    - Index: ${existingDimension} dimensions
    - Config: ${config.embeddings.dimension} dimensions
    
    To fix:
    1. Update config to match index: dimension: ${existingDimension}
    2. OR recreate index: npm run vector:recreate
    3. OR migrate embeddings: npm run embed:migrate
  `);
}
```

**D. Neo4j Vector Index Limit**
```typescript
// Neo4j vector indexes have size limits
const indexSize = await vectorIndex.getSize();
const maxSize = 10_000_000; // 10M vectors (Neo4j community limit)

if (indexSize >= maxSize) {
  logger.error(`Vector index size limit reached: ${indexSize}/${maxSize}`);
  // Strategy: Archive old embeddings, or use multiple indexes
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goals**:
- Docker Compose integration
- Basic Ollama client
- Configuration management
- Unit tests for infrastructure

**Deliverables**:
1. `docker-compose.yml` updated with Ollama service
2. `src/embeddings/OllamaClient.ts` - TypeScript client for Ollama API
3. `src/embeddings/EmbeddingConfig.ts` - Config loader with validation
4. `.mimir/embedding-config.json` - Default configuration
5. `test/integration/ollama.test.ts` - Full test coverage

**Acceptance Criteria**:
- ✅ Ollama starts with `docker-compose up`
- ✅ Health check passes
- ✅ Can generate test embedding
- ✅ All unit tests pass
- ✅ Graceful degradation if Ollama unavailable

### Phase 2: Neo4j Vector Integration (Week 2)

**Goals**:
- Neo4j vector index management
- Node schema extensions
- Embedding generation pipeline
- Vector index tests

**Deliverables**:
1. `src/embeddings/VectorIndexManager.ts` - Neo4j vector index CRUD
2. `src/managers/GraphManager.ts` - Enhanced with embedding support
3. `src/embeddings/EmbeddingGenerator.ts` - Auto-embed on node create/update
4. Migration script: `scripts/embed-migrate.ts`
5. `test/integration/vector-index.test.ts` - Complete test suite

**Acceptance Criteria**:
- ✅ Vector index created automatically on first run
- ✅ Nodes auto-embed when created (if config enabled)
- ✅ Can query by vector similarity
- ✅ Dimension validation working
- ✅ Migration script tested on sample data

### Phase 3: Semantic Search Tool (Week 3)

**Goals**:
- New MCP tool: `graph_semantic_search`
- Hybrid search (semantic + graph filters)
- Context isolation integration
- Tool tests

**Deliverables**:
1. `src/tools/semantic-search.tools.ts` - New tool implementation
2. `src/managers/ContextManager.ts` - Enhanced with semantic context
3. Tool schema: `schemas/semantic-search.schema.json`
4. Documentation: `docs/tools/SEMANTIC_SEARCH.md`
5. `test/tools/semantic-search.test.ts` - Full coverage

**Acceptance Criteria**:
- ✅ Tool available via MCP
- ✅ Can search by natural language query
- ✅ Combines semantic + structural filters
- ✅ Integrates with multi-agent locking
- ✅ Performance < 50ms for 100K nodes

### Phase 4: File Content Search (Week 4)

**Goals**:
- Enhance file indexing with embeddings
- Chunk long files for embedding
- File content semantic search
- Integration tests

**Deliverables**:
1. `src/indexing/FileIndexer.ts` - Enhanced with embedding generation
2. `src/embeddings/ContentChunker.ts` - Smart chunking for long files
3. Tool enhancement: `index_folder` now includes embeddings
4. Documentation: `docs/guides/FILE_SEMANTIC_SEARCH.md`
5. `test/integration/file-search.test.ts` - Coverage

**Acceptance Criteria**:
- ✅ Files auto-embed on index
- ✅ Long files chunked intelligently
- ✅ Can search file contents semantically
- ✅ Returns file path + line numbers
- ✅ Respects .gitignore rules

### Phase 5: Documentation & Polish (Week 5)

**Goals**:
- Comprehensive documentation
- User migration guide
- Performance optimization
- Production readiness

**Deliverables**:
1. `docs/VECTOR_EMBEDDINGS_GUIDE.md` - User guide
2. `docs/MIGRATION_GUIDE.md` - Upgrading from v1.0.0
3. `AGENTS.md` - Updated with semantic search patterns
4. `README.md` - Updated setup instructions
5. Performance benchmarks document

**Acceptance Criteria**:
- ✅ All features documented
- ✅ Migration guide tested
- ✅ Performance benchmarks published
- ✅ Zero breaking changes to existing API
- ✅ All tests passing

---

## Key Patterns for Implementation

### Pattern 1: Lazy Embedding Generation

**Problem**: Don't want to slow down node creation with embedding generation.

**Solution**: Async queue with background worker.

```typescript
class EmbeddingQueue {
  private queue: Array<{nodeId: string, content: string}> = [];
  private processing = false;

  async enqueue(nodeId: string, content: string) {
    this.queue.push({nodeId, content});
    if (!this.processing) {
      this.processQueue(); // Don't await
    }
  }

  private async processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 32); // Batch size
      const embeddings = await ollama.embedBatch(
        batch.map(b => b.content)
      );
      
      await Promise.all(
        batch.map((item, i) => 
          graph.updateNode(item.nodeId, { embedding: embeddings[i] })
        )
      );
    }
    this.processing = false;
  }
}
```

**Test**:
```typescript
test('should not block node creation while embedding', async () => {
  const start = Date.now();
  await graph.addNode({ type: 'todo', properties: { title: 'Test' }});
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(50); // Node created quickly
  
  // Wait for async embedding
  await waitForEmbedding('test-node-id', { timeout: 5000 });
  const node = await graph.getNode('test-node-id');
  expect(node.embedding).toBeDefined();
});
```

### Pattern 2: Content Fingerprinting (Avoid Re-Embedding)

**Problem**: Re-generating embeddings is expensive, avoid if content unchanged.

**Solution**: Hash content, store with embedding.

```typescript
interface NodeWithEmbedding {
  id: string;
  embedding: number[];
  embeddingContentHash: string; // SHA-256 of embeddable content
}

async function embedNodeIfNeeded(node: GraphNode): Promise<void> {
  const content = extractEmbeddableContent(node);
  const contentHash = sha256(content);
  
  if (node.embeddingContentHash === contentHash) {
    // Content unchanged, skip embedding
    return;
  }
  
  const embedding = await ollama.embed(content);
  await graph.updateNode(node.id, {
    embedding,
    embeddingContentHash: contentHash,
    embeddingTimestamp: Date.now()
  });
}
```

**Test**:
```typescript
test('should skip re-embedding if content unchanged', async () => {
  const node = await graph.addNode({ 
    type: 'todo', 
    properties: { title: 'Test' } 
  });
  
  await waitForEmbedding(node.id);
  const firstEmbedding = (await graph.getNode(node.id)).embedding;
  
  // Update node with same content
  await graph.updateNode(node.id, { properties: { title: 'Test' } });
  
  const secondEmbedding = (await graph.getNode(node.id)).embedding;
  expect(secondEmbedding).toEqual(firstEmbedding); // Not re-embedded
});
```

### Pattern 3: Hybrid Search (Semantic + Filters)

**Problem**: Users want semantic search but also need to filter by type, status, etc.

**Solution**: Two-stage query - Neo4j filters first, then vector similarity.

```typescript
async function hybridSearch(params: {
  query: string;
  filters?: Record<string, any>;
  topK?: number;
}) {
  // Stage 1: Generate query embedding
  const queryEmbedding = await ollama.embed(params.query);
  
  // Stage 2: Build Cypher query with filters
  const filterClauses = buildFilterClauses(params.filters);
  
  const cypher = `
    MATCH (n:Node)
    WHERE ${filterClauses}
    CALL db.index.vector.queryNodes(
      'node_embeddings', 
      $topK, 
      $queryEmbedding
    ) YIELD node, score
    WHERE node = n
    RETURN n, score
    ORDER BY score DESC
  `;
  
  return await session.run(cypher, {
    topK: params.topK || 10,
    queryEmbedding
  });
}
```

**Test**:
```typescript
test('should combine semantic search with filters', async () => {
  await graph.addNode({ type: 'todo', properties: { 
    status: 'open', 
    title: 'Fix security bug' 
  }});
  await graph.addNode({ type: 'todo', properties: { 
    status: 'completed', 
    title: 'Improve authentication' 
  }});
  
  const results = await hybridSearch({
    query: 'security issues',
    filters: { type: 'todo', status: 'open' },
    topK: 5
  });
  
  expect(results).toHaveLength(1);
  expect(results[0].properties.status).toBe('open');
});
```

### Pattern 4: Dimension Compatibility Check

**Problem**: Prevent accidental dimension mismatches that break vector search.

**Solution**: Validate on every operation, fail fast with helpful errors.

```typescript
class VectorIndexManager {
  private cachedDimension: number | null = null;
  
  async ensureDimensionCompatibility(embedding: number[]): Promise<void> {
    if (!this.cachedDimension) {
      this.cachedDimension = await this.getIndexDimension();
    }
    
    if (embedding.length !== this.cachedDimension) {
      throw new DimensionMismatchError(`
        Embedding dimension mismatch:
        - Expected: ${this.cachedDimension} (index dimension)
        - Received: ${embedding.length} (new embedding)
        
        This usually means:
        1. You changed the embedding model
        2. You changed the dimension config
        
        To fix:
        - Revert config to previous model/dimension, OR
        - Run migration: npm run embed:migrate --dimension ${embedding.length}
        
        ⚠️  Migration will re-embed ALL nodes and recreate index.
      `);
    }
  }
}
```

**Test**:
```typescript
test('should throw helpful error on dimension mismatch', async () => {
  await vectorIndex.create('test_index', 512, 'cosine');
  const wrongDimension = Array(256).fill(0);
  
  await expect(
    vectorIndex.insert('node-1', wrongDimension)
  ).rejects.toThrow(DimensionMismatchError);
  
  try {
    await vectorIndex.insert('node-1', wrongDimension);
  } catch (error) {
    expect(error.message).toContain('Expected: 512');
    expect(error.message).toContain('Received: 256');
    expect(error.message).toContain('npm run embed:migrate');
  }
});
```

---

## Documentation Requirements

### User-Facing Documentation

**1. Setup Guide** (`docs/VECTOR_EMBEDDINGS_GUIDE.md`):
- What are embeddings and why use them
- Prerequisites (Ollama installation)
- Configuration options
- First-time setup walkthrough
- Troubleshooting common issues

**2. Migration Guide** (`docs/MIGRATION_GUIDE.md`):
- Upgrading from v1.0.0 to v1.1.0
- Enabling embeddings on existing installation
- Model swapping procedure
- Dimension change procedure
- Rollback instructions

**3. Tool Documentation** (`docs/tools/SEMANTIC_SEARCH.md`):
- `graph_semantic_search` tool spec
- Example queries
- Performance characteristics
- Integration with other tools
- Best practices

**4. Agent Instructions** (`AGENTS.md` update):
- When to use semantic search vs graph queries
- Semantic search patterns for PM/Worker/QC agents
- Combining semantic + structural context
- Example agent workflows

### Developer-Facing Documentation

**5. Architecture** (`docs/architecture/VECTOR_EMBEDDINGS_ARCHITECTURE.md`):
- System design overview
- Component interactions
- Data flow diagrams
- Performance characteristics
- Scalability considerations

**6. API Reference** (`docs/api/EMBEDDINGS_API.md`):
- OllamaClient API
- VectorIndexManager API
- EmbeddingGenerator API
- Type definitions

---

## Warnings & Breaking Changes

### ⚠️ CRITICAL: Model Change Warning

**Display prominently in documentation and CLI**:

```markdown
⚠️  CHANGING EMBEDDING MODELS REQUIRES FULL RE-INDEXING

Embedding vectors are NOT compatible across different models, even from the same provider.

**What happens if you change models:**
1. ❌ All existing embeddings become meaningless
2. ❌ Vector similarity scores will be incorrect
3. ❌ Semantic search returns irrelevant results
4. ✅ Solution: Re-embed ALL content

**Migration procedure:**
```bash
# 1. Backup your data
docker exec neo4j_db neo4j-admin dump --to=/backups/pre-migration.dump

# 2. Update config with new model
# Edit .mimir/embedding-config.json

# 3. Run migration (this will take time)
npm run embed:migrate

# 4. Verify
npm run embed:verify
```

**Estimated time:** ~X seconds per 1000 nodes
**Disk space:** Temporary increase of ~Y MB during migration

**Alternative:** Create separate indexes for different models
```

### Model Compatibility Matrix

**Safe Changes** (no migration needed):
- ✅ Quantization variant (tinyllama → tinyllama:q4_0)
- ✅ LLM model change (tinyllama → phi3) - does NOT affect embeddings
- ✅ Temperature/parameter changes

**REQUIRES MIGRATION**:
- ❌ Embedding model change (nomic → bge)
- ❌ Dimension change (512 → 256)
- ❌ Any embedding-related config change

---

## Success Metrics

**Performance Targets**:
- ✅ Embedding generation: < 20ms per document (CPU)
- ✅ Vector search: < 50ms for top-10 on 100K nodes
- ✅ Startup time: < 5 seconds for Ollama model load
- ✅ Memory footprint: < 2GB additional (models + indexes)

**Quality Targets**:
- ✅ Test coverage: > 90% for new code
- ✅ Zero breaking changes to v1.0.0 API
- ✅ Graceful degradation if Ollama unavailable
- ✅ All edge cases documented with tests

**User Experience Targets**:
- ✅ Setup: < 5 commands to enable embeddings
- ✅ Migration: < 10 minutes for 10K nodes
- ✅ Documentation: < 30 minutes to understand and implement

---

## Next Steps

1. **Review & Approve Plan**: Stakeholder sign-off
2. **Setup Development Branch**: `feature/vector-embeddings`
3. **Phase 1 Implementation**: Start with Docker + Ollama integration
4. **Iterative Testing**: Unit tests for each component before moving to next phase
5. **User Documentation**: Write alongside implementation
6. **Beta Testing**: Internal testing with sample datasets
7. **Production Release**: v1.1.0 with vector embeddings

---

## Related Documents

- **Research**: `research/LIGHTWEIGHT_LLM_RESEARCH.md`
- **Current Architecture**: `docs/architecture/MULTI_AGENT_GRAPH_RAG.md`
- **Roadmap**: `docs/architecture/MULTI_AGENT_ROADMAP.md`
- **Testing Guide**: `docs/guides/TESTING_GUIDE.md`

---

**Status**: ✅ Ready for implementation  
**Approved By**: _pending_  
**Target Release**: v1.1.0 (Q4 2025)