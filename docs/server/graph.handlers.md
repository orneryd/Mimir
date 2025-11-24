[**mimir v1.0.0**](README.md)

***

[mimir](README.md) / graph.handlers

# graph.handlers

## Description

Consolidated graph tool handlers for MCP memory operations.
Routes operations to GraphManager methods and provides unified interface
for node, edge, batch, lock, and clear operations.

## Functions

### handleMemoryNode()

> **handleMemoryNode**(`args`, `graphManager`): `Promise`\<\{ `success`: `boolean`; `operation`: `string`; `node`: [`Node`](types/graph.types.md#node); `warning`: `string`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `success`: `boolean`; `error`: `string`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `success`: `boolean`; `operation`: `string`; `node`: [`Node`](types/graph.types.md#node) \| `null`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `node`: \{ `id`: `string`; `type`: [`NodeType`](types/graph.types.md#nodetype); \}; `cascadeDeletedEdges`: `number`; \}; `message`: `string`; `expiresIn`: `string`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `operation`: `string`; `confirmed`: `boolean`; `deleted`: `boolean`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](types/graph.types.md#node)[]; \}\>

Defined in: src/tools/graph.handlers.ts:94

Handle memory_node operations - CRUD for graph nodes

#### Parameters

##### args

`any`

Operation arguments

##### graphManager

[`IGraphManager`](types/IGraphManager.md#igraphmanager)

Graph manager instance

#### Returns

`Promise`\<\{ `success`: `boolean`; `operation`: `string`; `node`: [`Node`](types/graph.types.md#node); `warning`: `string`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `success`: `boolean`; `error`: `string`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `success`: `boolean`; `operation`: `string`; `node`: [`Node`](types/graph.types.md#node) \| `null`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `node`: \{ `id`: `string`; `type`: [`NodeType`](types/graph.types.md#nodetype); \}; `cascadeDeletedEdges`: `number`; \}; `message`: `string`; `expiresIn`: `string`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `operation`: `string`; `confirmed`: `boolean`; `deleted`: `boolean`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](types/graph.types.md#node)[]; \}\>

Promise with operation result

#### Description

Provides unified interface for creating, reading, updating,
and deleting nodes in the Neo4j graph database. Supports todos, memories,
files, concepts, and custom node types. Automatically handles nested
properties by flattening them if needed.

#### Examples

```typescript
// Create a memory node
const result = await handleMemoryNode({
  operation: 'add',
  type: 'memory',
  properties: {
    title: 'Important Decision',
    content: 'We decided to use PostgreSQL for better ACID compliance'
  }
}, graphManager);
// Returns: { success: true, operation: 'add', node: {...} }
```

```typescript
// Query pending todos
const result = await handleMemoryNode({
  operation: 'query',
  type: 'todo',
  filters: { status: 'pending' }
}, graphManager);
// Returns: { success: true, operation: 'query', count: 5, nodes: [...] }
```

```typescript
// Semantic search
const result = await handleMemoryNode({
  operation: 'search',
  query: 'authentication implementation',
  options: { limit: 10, types: ['memory', 'file'] }
}, graphManager);
// Returns: { success: true, operation: 'search', count: 3, nodes: [...] }
```

#### Throws

If operation fails or invalid arguments provided

***

### handleMemoryEdge()

> **handleMemoryEdge**(`args`, `graphManager`): `Promise`\<\{ `warning?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `error`: `string`; `edge?`: `undefined`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `operation`: `string`; `edge`: [`Edge`](types/graph.types.md#edge); `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `operation`: `string`; `edge`: [`Edge`](types/graph.types.md#edge); `warning`: `string`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `count?`: `undefined`; `edge?`: `undefined`; `success`: `boolean`; `operation`: `string`; `deleted`: `boolean`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `edge?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](types/graph.types.md#edge)[]; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `edge?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `neighbors`: [`Node`](types/graph.types.md#node)[]; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `edge?`: `undefined`; `edges?`: `undefined`; `neighbors?`: `undefined`; `success`: `boolean`; `operation`: `string`; `subgraph`: [`Subgraph`](types/graph.types.md#subgraph); \}\>

Defined in: src/tools/graph.handlers.ts:284

Handle memory_edge operations - Manage relationships between nodes

#### Parameters

##### args

`any`

Operation arguments

##### graphManager

[`IGraphManager`](types/IGraphManager.md#igraphmanager)

Graph manager instance

#### Returns

`Promise`\<\{ `warning?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `error`: `string`; `edge?`: `undefined`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `operation`: `string`; `edge`: [`Edge`](types/graph.types.md#edge); `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `operation`: `string`; `edge`: [`Edge`](types/graph.types.md#edge); `warning`: `string`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `count?`: `undefined`; `edge?`: `undefined`; `success`: `boolean`; `operation`: `string`; `deleted`: `boolean`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `edge?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](types/graph.types.md#edge)[]; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `edge?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `neighbors`: [`Node`](types/graph.types.md#node)[]; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `edge?`: `undefined`; `edges?`: `undefined`; `neighbors?`: `undefined`; `success`: `boolean`; `operation`: `string`; `subgraph`: [`Subgraph`](types/graph.types.md#subgraph); \}\>

Promise with operation result

#### Description

Build knowledge graphs by creating, deleting, and querying
relationships between nodes. Supports operations like finding neighbors,
extracting subgraphs, and traversing the graph structure.

#### Examples

```typescript
// Create a relationship
const result = await handleMemoryEdge({
  operation: 'add',
  source: 'todo-1',
  target: 'project-2',
  type: 'part_of'
}, graphManager);
```

```typescript
// Find all neighbors
const result = await handleMemoryEdge({
  operation: 'neighbors',
  node_id: 'todo-1',
  edge_type: 'depends_on',
  depth: 2
}, graphManager);
```

```typescript
// Extract subgraph
const result = await handleMemoryEdge({
  operation: 'subgraph',
  node_id: 'project-1',
  depth: 3
}, graphManager);
// Returns: { success: true, subgraph: { nodes: [...], edges: [...] } }
```

***

### handleMemoryBatch()

> **handleMemoryBatch**(`args`, `graphManager`): `Promise`\<\{ `warning?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `error`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](types/graph.types.md#node)[]; `result?`: `undefined`; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](types/graph.types.md#node)[]; `warning`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `nodeCount`: `number`; `nodeIds`: `string`[]; `more`: `number`; `edgeCount?`: `undefined`; `edgeIds?`: `undefined`; \}; `message`: `string`; `expiresIn`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `confirmed`: `boolean`; `result`: [`BatchDeleteResult`](types/graph.types.md#batchdeleteresult); \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `nodes?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](types/graph.types.md#edge)[]; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `nodes?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](types/graph.types.md#edge)[]; `warning`: `string`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `nodeCount?`: `undefined`; `nodeIds?`: `undefined`; `edgeCount`: `number`; `edgeIds`: `string`[]; `more`: `number`; \}; `message`: `string`; `expiresIn`: `string`; \}\>

Defined in: src/tools/graph.handlers.ts:419

Handle memory_batch operations - Bulk operations for nodes and edges

#### Parameters

##### args

`any`

Operation arguments

##### graphManager

[`IGraphManager`](types/IGraphManager.md#igraphmanager)

Graph manager instance

#### Returns

`Promise`\<\{ `warning?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `error`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](types/graph.types.md#node)[]; `result?`: `undefined`; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](types/graph.types.md#node)[]; `warning`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `nodeCount`: `number`; `nodeIds`: `string`[]; `more`: `number`; `edgeCount?`: `undefined`; `edgeIds?`: `undefined`; \}; `message`: `string`; `expiresIn`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `confirmed`: `boolean`; `result`: [`BatchDeleteResult`](types/graph.types.md#batchdeleteresult); \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `nodes?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](types/graph.types.md#edge)[]; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `nodes?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](types/graph.types.md#edge)[]; `warning`: `string`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `nodeCount?`: `undefined`; `nodeIds?`: `undefined`; `edgeCount`: `number`; `edgeIds`: `string`[]; `more`: `number`; \}; `message`: `string`; `expiresIn`: `string`; \}\>

Promise with operation result

#### Description

Perform bulk operations on multiple nodes or edges at once
for better performance. Supports batch add, update, and delete operations
with automatic property flattening and confirmation flows for destructive operations.

#### Examples

```typescript
// Batch create nodes
const result = await handleMemoryBatch({
  operation: 'add_nodes',
  nodes: [
    { type: 'todo', properties: { title: 'Task 1' } },
    { type: 'todo', properties: { title: 'Task 2' } }
  ]
}, graphManager);
// Returns: { success: true, count: 2, nodes: [...] }
```

```typescript
// Batch update nodes
const result = await handleMemoryBatch({
  operation: 'update_nodes',
  updates: [
    { id: 'todo-1', properties: { status: 'completed' } },
    { id: 'todo-2', properties: { status: 'completed' } }
  ]
}, graphManager);
```

```typescript
// Batch create edges
const result = await handleMemoryBatch({
  operation: 'add_edges',
  edges: [
    { source: 'todo-1', target: 'project-1', type: 'part_of' },
    { source: 'todo-2', target: 'project-1', type: 'part_of' }
  ]
}, graphManager);
```

***

### handleMemoryLock()

> **handleMemoryLock**(`args`, `graphManager`): `Promise`\<\{ `message?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `success`: `boolean`; `error`: `string`; `locked?`: `undefined`; `unlocked?`: `undefined`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `success`: `boolean`; `operation`: `string`; `locked`: `boolean`; `message`: `string`; `unlocked?`: `undefined`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `locked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `unlocked`: `boolean`; `message`: `string`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `message?`: `undefined`; `locked?`: `undefined`; `unlocked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](types/graph.types.md#node)[]; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `locked?`: `undefined`; `unlocked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `cleaned`: `number`; `message`: `string`; \}\>

Defined in: src/tools/graph.handlers.ts:656

Handle memory_lock operations - Multi-agent locking for concurrent access

#### Parameters

##### args

`any`

Operation arguments

##### graphManager

[`IGraphManager`](types/IGraphManager.md#igraphmanager)

Graph manager instance

#### Returns

`Promise`\<\{ `message?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `success`: `boolean`; `error`: `string`; `locked?`: `undefined`; `unlocked?`: `undefined`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `success`: `boolean`; `operation`: `string`; `locked`: `boolean`; `message`: `string`; `unlocked?`: `undefined`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `locked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `unlocked`: `boolean`; `message`: `string`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `message?`: `undefined`; `locked?`: `undefined`; `unlocked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](types/graph.types.md#node)[]; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `locked?`: `undefined`; `unlocked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `cleaned`: `number`; `message`: `string`; \}\>

Promise with operation result

#### Description

Provides optimistic locking mechanism for multi-agent scenarios.
Prevents race conditions when multiple agents try to modify the same node.
Locks automatically expire after timeout to prevent deadlocks.

#### Examples

```typescript
// Acquire lock
const result = await handleMemoryLock({
  operation: 'acquire',
  node_id: 'todo-1',
  agent_id: 'worker-agent-1',
  timeout_ms: 300000
}, graphManager);
// Returns: { success: true, locked: true, message: '...' }
```

```typescript
// Query available (unlocked) nodes
const result = await handleMemoryLock({
  operation: 'query_available',
  type: 'todo',
  filters: { status: 'pending' }
}, graphManager);
// Returns: { success: true, count: 5, nodes: [...] }
```

```typescript
// Release lock
const result = await handleMemoryLock({
  operation: 'release',
  node_id: 'todo-1',
  agent_id: 'worker-agent-1'
}, graphManager);
```

***

### handleMemoryClear()

> **handleMemoryClear**(`args`, `graphManager`): `Promise`\<\{ `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `error`: `string`; \} \| \{ `error?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `deletedNodes`: `number`; `deletedEdges`: `number`; `types?`: `Record`\<`string`, `number`\>; \}; `message`: `string`; `expiresIn`: `string`; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `confirmed`: `boolean`; `message`: `string`; `deletedNodes`: `number`; `deletedEdges`: `number`; \}\>

Defined in: src/tools/graph.handlers.ts:774

Handle memory_clear operations - Clear data from graph database

#### Parameters

##### args

`any`

Operation arguments

##### graphManager

[`IGraphManager`](types/IGraphManager.md#igraphmanager)

Graph manager instance

#### Returns

`Promise`\<\{ `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `error`: `string`; \} \| \{ `error?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `deletedNodes`: `number`; `deletedEdges`: `number`; `types?`: `Record`\<`string`, `number`\>; \}; `message`: `string`; `expiresIn`: `string`; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `confirmed`: `boolean`; `message`: `string`; `deletedNodes`: `number`; `deletedEdges`: `number`; \}\>

Promise with operation result

#### Description

Provides safe deletion of data by type or complete database clear.
Includes confirmation flow for destructive operations. Use with caution!

#### Examples

```typescript
// Request preview for clearing all todos
const preview = await handleMemoryClear({
  type: 'todo'
}, graphManager);
// Returns: { needsConfirmation: true, confirmationId: '...', preview: {...} }

// Execute with confirmation
const result = await handleMemoryClear({
  type: 'todo',
  confirm: true,
  confirmationId: preview.confirmationId
}, graphManager);
// Returns: { success: true, confirmed: true, deleted: 42 }
```

```typescript
// Clear entire database (use with extreme caution!)
const preview = await handleMemoryClear({
  type: 'ALL'
}, graphManager);

const result = await handleMemoryClear({
  type: 'ALL',
  confirm: true,
  confirmationId: preview.confirmationId
}, graphManager);
```

#### Throws

If operation fails or invalid confirmation
