# Graph Search Nodes Test Coverage

**Test File**: `testing/graph-search-nodes.test.ts`

This comprehensive test suite validates all permutations of the `memory_search_nodes` MCP tool.

---

## 🎯 Test Categories

### 1. **Query Parameter: No Filters** (3 tests)
- Search across all types with no options
- Non-existent query returns empty array
- Case-insensitive search

### 2. **Query Parameter: Limit Option** (3 tests)
- Respect limit option
- Use default limit when not specified
- Handle limit larger than result set

### 3. **Query Parameter: Offset Option** (3 tests)
- Skip results with offset
- Return empty when offset exceeds results
- Handle offset 0 (same as no offset)

### 4. **Query Parameter: Types Filter** (7 tests) ⚠️ **BUG AREA**
- Filter by single type
- Filter by multiple types
- Return empty when types filter has no matches
- Handle empty types array
- Handle non-existent type
- Handle mix of valid and invalid types

### 5. **Query Parameter: Sort Options** (3 tests)
- Sort by property ascending
- Sort by property descending
- Handle invalid sortBy property gracefully

### 6. **Combined Filters** (4 tests)
- Limit + offset together
- Types + limit together
- Types + sortBy together
- All filters together

### 7. **Edge Cases** (6 tests)
- Empty query string
- Special characters in query
- Multiple words in query
- Very long query string
- Null/undefined options

### 8. **Performance** (2 tests)
- Complete search within reasonable time (<1s)
- Handle large result sets efficiently (<2s for 50+ nodes)

### 9. **Result Format Validation** (3 tests)
- Return nodes with all required properties
- No duplicate nodes
- Nodes ordered by relevance by default

### 10. **Regression Tests for Known Bugs** (3 tests)
- ⚠️ Types filter should not cause syntax error
- ⚠️ Types filter with single type should work
- ⚠️ Empty types array should not cause error

---

## 🐛 Known Bug Being Tested

**Issue**: `types` filter parameter causes Neo4j syntax error

**Error Message**:
```
Invalid input '(': expected "!=" "%" ")" "*" "+" "-" "/" "::" "<" "<=" "<>" "=" "=~" ">" ">=" "AND" "CONTAINS" "ENDS" "IN" "IS" "OR" "STARTS" "XOR" "^"
```

**Affected Code**: `src/managers/GraphManager.ts` - `searchNodes()` method

**Test Cases**:
```typescript
// These should NOT throw errors:
await manager.searchNodes('authentication', { types: ['todo'] });
await manager.searchNodes('authentication', { types: ['todo', 'file'] });
await manager.searchNodes('authentication', { types: [] });
```

**Root Cause**: Likely an issue with Cypher query construction when the `types` parameter is passed. Possibly related to:
- String interpolation vs parameterized queries
- Array handling in Neo4j driver
- Label filtering syntax

---

## 🏃 Running the Tests

### Run all graph search tests:
```bash
npm test -- testing/graph-search-nodes.test.ts
```

### Run specific test suite:
```bash
npm test -- testing/graph-search-nodes.test.ts -t "types filter"
```

### Run only bug regression tests:
```bash
npm test -- testing/graph-search-nodes.test.ts -t "Regression tests"
```

### Run with coverage:
```bash
npm test -- testing/graph-search-nodes.test.ts --coverage
```

---

## 📊 Test Data Setup

Each test creates a fresh dataset with:

**6 Nodes**:
1. `todo` - "Implement authentication" (high priority, in_progress)
2. `todo` - "Fix bug in orchestration" (critical priority, pending)
3. `file` - "src/auth/authentication.ts" (TypeScript)
4. `file` - "src/orchestration/WorkflowManager.ts" (TypeScript)
5. `concept` - "authentication" (keywords: auth, jwt, security)
6. `person` - "Alice" (developer, alice@example.com)

This dataset covers:
- Multiple node types
- Overlapping keywords ("authentication", "orchestration")
- Different property structures
- Real-world use cases

---

## ✅ Expected Test Results

### Before Bug Fix:
```
❌ FAIL: types filter should not cause syntax error
❌ FAIL: types filter with single type should work
❌ FAIL: empty types array should not cause error
✅ PASS: All other tests (30+ tests)
```

### After Bug Fix:
```
✅ PASS: All tests (33 tests)
```

---

## 🔧 How to Use This Test Suite

### 1. **Identify the Bug**
Run the tests to confirm the bug:
```bash
npm test -- testing/graph-search-nodes.test.ts -t "Regression tests"
```

### 2. **Fix the Bug**
Edit `src/managers/GraphManager.ts` - `searchNodes()` method

Likely fix involves changing from:
```typescript
// BAD: String interpolation
AND (n.type IN $types OR ANY(t IN $types WHERE (t.charAt(0)...)))
```

To:
```typescript
// GOOD: Proper parameterized query
AND (n.type IN $types OR ANY(t IN $types WHERE toUpper(substring(t, 0, 1)) + substring(t, 1) IN labels(n)))
```

Or simplify to:
```typescript
// BETTER: Direct label check
WHERE ANY(type IN $types WHERE n:$type)
```

### 3. **Verify the Fix**
Run all tests:
```bash
npm test -- testing/graph-search-nodes.test.ts
```

### 4. **Add to CI/CD**
Ensure this test runs on every commit:
```yaml
# .github/workflows/test.yml
- name: Run graph search tests
  run: npm test -- testing/graph-search-nodes.test.ts
```

---

## 📈 Coverage Goals

- ✅ **100% of search options covered**
- ✅ **All parameter combinations tested**
- ✅ **Edge cases included**
- ✅ **Performance benchmarks**
- ✅ **Bug regression tests**

---

## 🎓 Learning Resources

**Neo4j Full-Text Search**:
- https://neo4j.com/docs/cypher-manual/current/indexes/search-performance-indexes/managing-indexes/#indexes-search-create-fulltext

**LangChain Array Parameters**:
- https://neo4j.com/docs/api/javascript-driver/current/class/lib6/driver.js~Driver.html

**Cypher Label Matching**:
- https://neo4j.com/docs/cypher-manual/current/syntax/expressions/#label-expressions

---

**Last Updated**: 2025-10-17  
**Total Tests**: 33  
**Known Bugs**: 1 (types filter syntax error)  
**Status**: ⚠️ Tests created, awaiting bug fix

