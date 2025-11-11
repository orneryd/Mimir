# MockGraphManager - Unit Testing Guide

## Overview

The `MockGraphManager` provides an **in-memory** implementation of `IGraphManager` that allows you to write fast unit tests without requiring a real Neo4j database.

### Performance Comparison

- **Real Neo4j**: ~6-40 seconds for test suite (database calls, embeddings generation, network latency)
- **MockGraphManager**: ~4ms for equivalent tests (pure in-memory operations)

---

## When to Use Mock vs. Real Database

### ✅ Use MockGraphManager For:

1. **Unit tests** - Testing business logic, handlers, tool functions
2. **Fast feedback** - TDD workflows, pre-commit hooks
3. **CI/CD pipelines** - Faster builds without database dependencies
4. **Edge case testing** - Testing error conditions, concurrency, etc.
5. **Isolated testing** - Testing components without Neo4j, Ollama, Docker

### ✅ Use Real GraphManager For:

1. **Integration tests** - End-to-end workflows with actual database
2. **Performance testing** - Benchmarking query performance
3. **Vector search testing** - Testing embeddings and similarity search
4. **Schema validation** - Testing Neo4j constraints and indexes
5. **Full-text search** - Testing Neo4j's full-text search indexes

---

## Quick Start

### Basic Test Setup

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGraphManager, MockGraphManager } from './helpers/mockGraphManager.js';

describe('My Feature', () => {
  let graphManager: MockGraphManager;

  beforeEach(async () => {
    // Create fresh mock for each test - no database required!
    graphManager = createMockGraphManager();
    await graphManager.initialize(); // No-op for mock
  });

  it('should do something', async () => {
    const node = await graphManager.addNode('todo', { title: 'Test' });
    expect(node.id).toBeDefined();
  });
});
```

### No Cleanup Required

Unlike real database tests, you don't need `afterAll` cleanup:

```typescript
// ❌ NOT NEEDED with mock
afterAll(async () => {
  await graphManager.clear('ALL');
  await graphManager.close();
});

// ✅ Each beforeEach creates a fresh instance
beforeEach(async () => {
  graphManager = createMockGraphManager();
});
```

---

## Complete API Coverage

The mock implements **all** `IGraphManager` methods:

### Node Operations
- `addNode(type, properties)`
- `getNode(id)`
- `updateNode(id, properties)`
- `deleteNode(id)`
- `queryNodes(type?, filters?)`
- `searchNodes(query, options?)`

### Edge Operations
- `addEdge(source, target, type, properties?)`
- `getEdges(nodeId, direction?)`
- `deleteEdge(edgeId)`
- `getNeighbors(nodeId, edgeType?, depth?)`
- `getSubgraph(nodeId, depth?)`

### Batch Operations
- `addNodes(nodes)`
- `updateNodes(updates)`
- `deleteNodes(ids)`
- `addEdges(edges)`
- `deleteEdges(ids)`

### Locking (Multi-Agent)
- `lockNode(nodeId, agentId, timeoutMs?)`
- `unlockNode(nodeId, agentId)`
- `queryAvailableNodes(type?, filters?)`
- `cleanupExpiredLocks()`

### Utility
- `getStats()`
- `clear(type?)`
- `close()`

---

## Migration Guide

### Converting Existing Tests

**Before (Real Database):**
```typescript
import { GraphManager } from '../src/managers/GraphManager.js';

describe('My Test', () => {
  let manager: GraphManager;
  
  beforeAll(async () => {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';
    
    manager = new GraphManager(uri, user, password);
    await manager.initialize();
  });

  beforeEach(async () => {
    await manager.clear('ALL'); // Slow database call
  });

  afterAll(async () => {
    await manager.clear('ALL');
    await manager.close();
  });

  it('should work', async () => {
    const node = await manager.addNode('todo', { title: 'Test' });
    expect(node).toBeDefined();
  });
});
```

**After (Mock):**
```typescript
import { createMockGraphManager, MockGraphManager } from './helpers/mockGraphManager.js';

describe('My Test', () => {
  let manager: MockGraphManager;

  beforeEach(async () => {
    manager = createMockGraphManager(); // Fresh instance, no database
    await manager.initialize();
  });

  // No afterAll needed!

  it('should work', async () => {
    const node = await manager.addNode('todo', { title: 'Test' });
    expect(node).toBeDefined();
  });
});
```

**Changes:**
1. Import `createMockGraphManager` instead of `GraphManager`
2. Remove connection string setup
3. Use `beforeEach` instead of `beforeAll` (mocks are cheap to create)
4. Remove `clear()` and `close()` cleanup
5. Everything else stays the same!

---

## Testing Patterns

### 1. Testing Handler Functions

```typescript
import { handleMemoryNode } from '../src/tools/graph.handlers.js';
import { createMockGraphManager } from './helpers/mockGraphManager.js';

describe('handleMemoryNode', () => {
  it('should add a node', async () => {
    const manager = createMockGraphManager();
    await manager.initialize();

    const result = await handleMemoryNode({
      operation: 'add',
      type: 'memory',
      properties: { content: 'Test' }
    }, manager);

    expect(result.success).toBe(true);
    expect(result.node.type).toBe('memory');
  });
});
```

### 2. Testing Multi-Agent Locking

```typescript
it('should prevent concurrent access', async () => {
  const manager = createMockGraphManager();
  const task = await manager.addNode('todo', { title: 'Task' });

  // Agent 1 locks
  const locked1 = await manager.lockNode(task.id, 'agent-1');
  expect(locked1).toBe(true);

  // Agent 2 blocked
  const locked2 = await manager.lockNode(task.id, 'agent-2');
  expect(locked2).toBe(false);

  // Agent 1 releases
  await manager.unlockNode(task.id, 'agent-1');

  // Agent 2 can now lock
  const locked3 = await manager.lockNode(task.id, 'agent-2');
  expect(locked3).toBe(true);
});
```

### 3. Testing Graph Traversal

```typescript
it('should traverse graph relationships', async () => {
  const manager = createMockGraphManager();
  
  const project = await manager.addNode('project', { name: 'My Project' });
  const task1 = await manager.addNode('todo', { title: 'Task 1' });
  const task2 = await manager.addNode('todo', { title: 'Task 2' });
  
  await manager.addEdge(task1.id, project.id, 'belongs_to');
  await manager.addEdge(task2.id, project.id, 'belongs_to');
  
  const subgraph = await manager.getSubgraph(project.id, 1);
  expect(subgraph.nodes).toHaveLength(3);
  expect(subgraph.edges).toHaveLength(2);
});
```

### 4. Testing Nested Payload Flattening

```typescript
import { flattenForMCP } from '../src/tools/mcp/flattenForMCP.js';

it('should handle nested payloads automatically', async () => {
  const manager = createMockGraphManager();
  
  // This would fail with real Neo4j without flattening
  const node = await manager.addNode('memory', {
    title: 'Test',
    details: {
      files: ['a.ts', 'b.ts'],
      notes: 'Some notes'
    }
  });
  
  // Mock doesn't enforce Neo4j constraints, so test the flattening separately
  const flattened = flattenForMCP({
    title: 'Test',
    details: {
      files: ['a.ts', 'b.ts'],
      notes: 'Some notes'
    }
  });
  
  expect(flattened.title).toBe('Test');
  expect(flattened.details_files).toEqual(['a.ts', 'b.ts']);
  expect(flattened.details_notes).toBe('Some notes');
});
```

---

## Limitations

### What MockGraphManager Doesn't Provide:

1. **Vector Search** - `vectorSearchNodes()` returns fake similarity scores
2. **Full-Text Search** - Simple substring matching instead of Neo4j's lucene index
3. **Neo4j Constraints** - No validation of property types (use real DB for this)
4. **Embeddings Generation** - No actual Ollama calls
5. **Performance Characteristics** - Mock is always fast, doesn't test query optimization

### When These Matter:

- **Vector search accuracy** → Use integration tests with real Neo4j + Ollama
- **Schema constraints** → Use integration tests to validate Neo4j schema
- **Query performance** → Use benchmarks with real database
- **Embedding quality** → Use integration tests with Ollama

---

## Best Practices

### 1. Separate Unit and Integration Tests

```
testing/
├── unit/                    # Fast tests with mocks
│   ├── handlers.test.ts
│   ├── tools.test.ts
│   └── utils.test.ts
├── integration/             # Slower tests with real DB
│   ├── graph-search.test.ts
│   ├── embeddings.test.ts
│   └── workflows.test.ts
└── helpers/
    └── mockGraphManager.ts
```

### 2. Use Descriptive Test Names

```typescript
// ✅ Good
it('should prevent duplicate locks from same agent', async () => { ... });

// ❌ Bad
it('works', async () => { ... });
```

### 3. Test One Thing Per Test

```typescript
// ✅ Good
it('should add a node', async () => { ... });
it('should retrieve a node by ID', async () => { ... });

// ❌ Bad - tests multiple things
it('should add and retrieve nodes', async () => { ... });
```

### 4. Use beforeEach for Fresh State

```typescript
// ✅ Good - each test starts clean
beforeEach(async () => {
  manager = createMockGraphManager();
  await manager.initialize();
});

// ❌ Bad - tests share state
beforeAll(async () => {
  manager = createMockGraphManager();
});
```

---

## Running Tests

### Run Only Mock Tests

```bash
# Run specific test file
npm test -- mockGraphManager.example.test.ts --run

# Run all tests in unit/ folder
npm test -- testing/unit/ --run

# Watch mode for TDD
npm test -- mockGraphManager.example.test.ts
```

### Run Integration Tests

```bash
# Requires Neo4j running
docker-compose up -d neo4j

# Run integration tests
npm test -- testing/integration/ --run
```

---

## Example Test File

See `testing/mockGraphManager.example.test.ts` for a complete example with:
- Node CRUD operations
- Edge relationships
- Graph traversal
- Multi-agent locking
- Batch operations
- Search functionality

---

## Summary

| Feature | MockGraphManager | Real GraphManager |
|---------|-----------------|-------------------|
| **Speed** | ⚡ ~4ms | 🐌 ~6-40s |
| **Dependencies** | None | Neo4j, Docker |
| **Use Case** | Unit tests | Integration tests |
| **Vector Search** | ❌ Fake | ✅ Real |
| **Full-Text Search** | ⚠️ Simple | ✅ Lucene |
| **Constraints** | ❌ No validation | ✅ Schema enforced |
| **Setup Complexity** | ✅ None | ❌ Requires config |

**Recommendation**: Use `MockGraphManager` for fast unit tests, real `GraphManager` for integration tests. This gives you both fast feedback loops and confidence in real-world behavior.
