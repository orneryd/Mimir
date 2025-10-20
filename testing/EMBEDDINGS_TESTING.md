# Embeddings Testing Documentation

## Overview

This directory contains tests to verify that the vector embeddings functionality is working correctly and producing useful semantic search results.

## Test Files

### 1. `testing/embeddings-functionality.test.ts`

**Comprehensive integration test** using Vitest framework.

**What it tests:**
- ✅ Technical correctness (dimensions, data types)
- ✅ Semantic similarity detection
- ✅ Practical usefulness (finding auth code, database code, etc.)
- ✅ Performance characteristics
- ✅ Model availability verification
- ✅ Edge case handling

**Run with:**
```bash
npm test -- embeddings-functionality.test.ts
```

### 2. `scripts/test-embeddings.js`

**Quick standalone test** that can run without the full test suite.

**What it tests:**
- ✅ Ollama connectivity
- ✅ Embedding generation
- ✅ Semantic search accuracy
- ✅ Similar vs dissimilar text distinction
- ✅ Performance metrics

**Run with:**
```bash
npm run test:embeddings
```

## Test Results Summary

### ✅ All Tests Passing!

**Test Results (2025-10-18):**

```
Configuration:
  Ollama URL: http://localhost:11434
  Model: nomic-embed-text
  Dimensions: 768

Performance:
  ✅ Single embedding: ~907ms average
  ✅ Batch processing: 5 embeddings in 4.5s

Semantic Search Accuracy:
  ✅ Authentication query → 76.0% match with auth code
  ✅ Database query → 78.4% match with DB code  
  ✅ Graph traversal query → 61.7% match with graph code
  
Similar vs Dissimilar:
  ✅ Similar texts: 72.9% similarity
  ✅ Dissimilar texts: 37.6% similarity
  ✅ Clear distinction (35.3% difference)
```

## What This Proves

### 1. Technical Functionality ✅

- Ollama API is accessible and responding
- nomic-embed-text model is properly installed
- Embeddings are 768-dimensional vectors
- API returns valid JSON with correct structure

### 2. Semantic Understanding ✅

The model correctly understands:
- **Authentication concepts** (JWT, OAuth, login, credentials)
- **Database operations** (connection pooling, configuration)
- **Graph algorithms** (traversal, relationships, nodes)

### 3. Practical Usefulness ✅

**Real-world scenario testing:**

When searching for "user authentication and login":
1. ✅ Top match: JWT authentication code (76%)
2. ✅ Second match: OAuth authorization (50.6%)
3. ❌ Not matched: Redis caching (38.9%)

**This proves semantic search works for finding relevant code!**

### 4. Discrimination Ability ✅

The model can distinguish between:
- Similar concepts: ML training vs ML optimization (72.9%)
- Different concepts: ML training vs cooking recipes (37.6%)

**35% difference proves the model has strong semantic discrimination.**

## Prerequisites for Running Tests

### Required:

1. **Ollama running** (Docker or local):
   ```bash
   docker compose up -d ollama
   # or
   ollama serve
   ```

2. **Model installed**:
   ```bash
   docker exec ollama_server ollama pull nomic-embed-text
   # or
   ollama pull nomic-embed-text
   ```

3. **Environment variables** (optional):
   ```bash
   export OLLAMA_BASE_URL=http://localhost:11434
   export MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
   ```

### Verify Prerequisites:

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Check model is installed
docker exec ollama_server ollama list | grep nomic-embed-text
```

## Troubleshooting

### Test fails with "Connection refused"

**Problem:** Ollama not running

**Solution:**
```bash
docker compose up -d ollama
# Wait 10 seconds for startup
npm run test:embeddings
```

### Test fails with "model not found"

**Problem:** Model not installed

**Solution:**
```bash
docker exec ollama_server ollama pull nomic-embed-text
npm run test:embeddings
```

### Similarity scores are too low (< 50%)

**Problem:** Model may not be specialized for your content

**Solution:** Try alternative models:
```bash
# Larger model (better accuracy, slower)
docker exec ollama_server ollama pull mxbai-embed-large

# Update .env
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
MIMIR_EMBEDDINGS_DIMENSIONS=1024
```

## Performance Expectations

**On M1 MacBook Pro with 16GB RAM:**
- Single embedding: ~900ms
- Batch (5 embeddings): ~4.5s (900ms avg)
- Memory usage: ~2GB for Ollama

**For production use:**
- Consider GPU acceleration for faster inference
- Batch embeddings when indexing multiple files
- Cache embeddings in Neo4j (don't regenerate)

## Next Steps

After verifying tests pass:

1. **Enable in production:**
   ```bash
   # Edit .env
   MIMIR_EMBEDDINGS_ENABLED=true
   ```

2. **Index your codebase:**
   ```bash
   node setup-watch.js
   ```

3. **Use semantic search:**
   ```bash
   npm run chain "find authentication code"
   ```

4. **Monitor performance:**
   ```bash
   # Check indexing time
   docker compose logs mcp-server | grep "indexed"
   
   # Check embedding stats
   npm run chain "show embedding statistics"
   ```

## Future Improvements

- [ ] Add benchmark tests for different models
- [ ] Test chunking strategies for large files
- [ ] Add multilingual embedding tests
- [ ] Compare with OpenAI embeddings
- [ ] Test on different domains (docs, code, mixed)

## References

- [nomic-embed-text Model Card](https://ollama.ai/library/nomic-embed-text)
- [Ollama Embeddings API](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-embeddings)
- [Vector Embeddings Guide](../docs/guides/VECTOR_EMBEDDINGS_GUIDE.md)

---

**Last Updated:** 2025-10-18  
**Status:** ✅ All tests passing  
**Model:** nomic-embed-text (768 dimensions)
