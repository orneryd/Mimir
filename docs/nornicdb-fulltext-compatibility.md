# NornicDB Neo4j Fulltext Compatibility Requirements

## Executive Summary

For NornicDB to be **backward compatible with Neo4j's fulltext search API**, it must support the `db.index.fulltext.queryNodes()` procedure call. This allows Mimir's UnifiedSearchService to work transparently with both Neo4j and NornicDB without code changes.

## Current State

### What NornicDB Has ✅
- **Internal BM25 fulltext index** (automatic, no manual index creation needed)
- Indexes properties: `content`, `text`, `title`, `name`, `description`, `path`, `workerRole`, `requirements`
- Returns BM25 scores via RRF hybrid search
- Excellent performance (~255µs for 10K documents)

### What's Missing ❌
- **Cypher procedure:** `CALL db.index.fulltext.queryNodes(indexName, query)`
- This is how Neo4j exposes fulltext search in Cypher queries
- Currently NornicDB only exposes fulltext via Go API, not Cypher

## Acceptance Criteria

### 1. Cypher Procedure Implementation

**Procedure Signature:**
```cypher
CALL db.index.fulltext.queryNodes(indexName: String, query: String)
YIELD node, score
```

**Parameters:**
- `indexName`: String - Index name (NornicDB should accept ANY name since it has one internal index)
- `query`: String - BM25 search query (supports boolean operators, phrases, fuzzy)

**Returns:**
- `node`: Node - The matched graph node
- `score`: Float - BM25 relevance score (higher = more relevant)

### 2. Example Usage

**Query sent by Mimir:**
```cypher
CALL db.index.fulltext.queryNodes('node_search', 'authentication error')
YIELD node, score
WHERE node.type IN ['memory', 'file']
OPTIONAL MATCH (node)<-[:HAS_CHUNK]-(parentFile:File)
RETURN node.id AS id,
       node.type AS type,
       node.title AS title,
       node.content AS content,
       score AS relevance
ORDER BY score DESC
LIMIT 10
```

**Expected behavior:**
1. Accept the procedure call (ignore `indexName` since NornicDB has one internal index)
2. Parse `query` string using existing BM25 search
3. Return matched nodes with BM25 scores
4. Allow standard Cypher operations after YIELD (WHERE, MATCH, RETURN, etc.)

### 3. Score Format

**NornicDB should return:**
- BM25 scores in **original BM25 range** (typically 0-10+, higher = better)
- Do NOT normalize to 0-1 range
- Do NOT return RRF scores (those are for hybrid search only)

**Example scores:**
```
node1: score = 8.234  (very relevant)
node2: score = 3.421  (moderately relevant)
node3: score = 0.523  (marginally relevant)
```

### 4. Query Syntax Support

NornicDB should support the same BM25 query syntax as Neo4j's Lucene index:

| Feature | Example | Description |
|---------|---------|-------------|
| Basic terms | `authentication error` | Match documents with these words |
| Boolean AND | `authentication AND error` | Both terms required |
| Boolean OR | `authentication OR login` | Either term matches |
| Boolean NOT | `authentication NOT token` | Exclude documents with "token" |
| Phrase search | `"authentication error"` | Exact phrase match |
| Wildcards | `auth*` | Prefix matching |
| Fuzzy search | `authentication~` | Typo tolerance |

**Note:** NornicDB already has BM25 implemented, so this is just exposing it via Cypher.

### 5. Error Handling

**If procedure is called with wrong syntax:**
```cypher
CALL db.index.fulltext.queryNodes('invalid')  -- Missing parameter
```
**Return:** Error with message `"Procedure requires 2 arguments: indexName, query"`

**If no results found:**
```cypher
CALL db.index.fulltext.queryNodes('node_search', 'nonexistentterm12345')
```
**Return:** Empty result set (0 records), NOT an error

### 6. Index Name Handling

**Neo4j allows multiple fulltext indexes:**
```cypher
CALL db.index.fulltext.queryNodes('node_search', 'query')  -- Default index
CALL db.index.fulltext.queryNodes('custom_index', 'query')  -- Custom index
```

**NornicDB implementation:**
- Accept ANY `indexName` parameter (for compatibility)
- Internally use the single built-in BM25 index
- Log a warning if `indexName != 'node_search'` (optional, for debugging)

**Rationale:** Mimir always uses `'node_search'` as the index name, but accepting any name ensures compatibility with other Neo4j clients.

## Testing Requirements

### Test 1: Basic Fulltext Search
```cypher
CALL db.index.fulltext.queryNodes('node_search', 'test')
YIELD node, score
RETURN node.id, score
LIMIT 5
```
**Expected:** 
- Returns up to 5 nodes matching "test"
- Each record has `node` and `score` fields
- Scores are BM25 values (> 0)

### Test 2: With Type Filtering
```cypher
CALL db.index.fulltext.queryNodes('node_search', 'authentication')
YIELD node, score
WHERE node.type = 'memory'
RETURN node.id, node.type, score
LIMIT 10
```
**Expected:**
- Returns only nodes where `type = 'memory'`
- WHERE clause works after YIELD

### Test 3: With Relationship Traversal
```cypher
CALL db.index.fulltext.queryNodes('node_search', 'error')
YIELD node, score
OPTIONAL MATCH (node)<-[:HAS_CHUNK]-(parentFile:File)
RETURN node.id, parentFile.path, score
```
**Expected:**
- MATCH clauses work after YIELD
- Returns parent file paths for file chunks

### Test 4: Empty Results
```cypher
CALL db.index.fulltext.queryNodes('node_search', 'qwertyuiop12345')
YIELD node, score
RETURN node.id, score
```
**Expected:**
- Returns 0 records
- No error thrown

### Test 5: Boolean Query
```cypher
CALL db.index.fulltext.queryNodes('node_search', 'authentication AND security')
YIELD node, score
RETURN node.id, score
ORDER BY score DESC
LIMIT 5
```
**Expected:**
- Returns nodes matching BOTH terms
- Higher scores for documents with both words

## Implementation Notes

### Option 1: Native Procedure (Recommended)
Implement `db.index.fulltext.queryNodes` as a **native Cypher procedure** in NornicDB's query engine:

1. Add procedure to NornicDB's procedure registry
2. Parse procedure call in Cypher parser
3. Execute BM25 search using existing `pkg/search/fulltext_index.go`
4. Return results in standard YIELD format

**Pros:** 
- Full compatibility with Neo4j
- No client-side changes needed
- Supports all Cypher operations after YIELD

### Option 2: Virtual Procedure (Alternative)
Intercept `CALL db.index.fulltext.queryNodes` and rewrite to MATCH query:

```cypher
-- Client sends:
CALL db.index.fulltext.queryNodes('node_search', 'test') YIELD node, score

-- NornicDB internally executes:
MATCH (node) WHERE bm25_search(node, 'test') > 0
RETURN node, bm25_score(node, 'test') AS score
```

**Pros:** Easier to implement if NornicDB already has BM25 functions
**Cons:** May not support all Cypher patterns after YIELD

## Backward Compatibility Testing

After implementation, run Mimir's test suite:

```bash
# Unit tests (should pass with NornicDB)
npx vitest run testing/unified-search-nornicdb.test.ts

# Live integration tests (currently 14/15 pass, fulltext fails)
npx vitest run testing/nornicdb-live-integration.test.ts

# After implementing procedure, this test should pass:
# "should handle db.index.fulltext.queryNodes" (currently fails)
```

**Success criteria:** 15/15 tests pass, including the fulltext test.

## Performance Expectations

Based on NornicDB's existing BM25 performance:

| Metric | Target |
|--------|--------|
| Query execution | < 5ms for 10K documents |
| Score calculation | < 1ms per result |
| Memory overhead | < 100MB for 100K indexed nodes |

## Summary Checklist

- [ ] Implement `CALL db.index.fulltext.queryNodes(indexName, query)` procedure
- [ ] Return `YIELD node, score` in standard format
- [ ] Support Cypher operations after YIELD (WHERE, MATCH, RETURN)
- [ ] Return BM25 scores (not normalized, not RRF)
- [ ] Support BM25 query syntax (boolean, phrases, fuzzy)
- [ ] Accept any `indexName` for compatibility
- [ ] Handle empty results gracefully (no error)
- [ ] Pass all 5 acceptance tests above
- [ ] Pass Mimir's fulltext integration test
- [ ] Document any differences from Neo4j behavior

## Contact

If you have questions about implementation:
- Review Neo4j procedure docs: https://neo4j.com/docs/cypher-manual/current/indexes-for-full-text-search/
- Check Mimir's usage: `src/managers/UnifiedSearchService.ts` line 583
- Test against: `testing/nornicdb-live-integration.test.ts` line 307

## Related Files

**NornicDB (to modify):**
- `pkg/search/fulltext_index.go` - BM25 implementation (already exists)
- `pkg/graph/procedures.go` - Add procedure registration (may need to create)
- `pkg/cypher/parser.go` - Parse CALL syntax (may need to extend)

**Mimir (unchanged):**
- `src/managers/UnifiedSearchService.ts` - Already calls the procedure
- `testing/nornicdb-live-integration.test.ts` - Will validate implementation
