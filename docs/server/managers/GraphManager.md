[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / managers/GraphManager

# managers/GraphManager

## Classes

### GraphManager

Defined in: src/managers/GraphManager.ts:24

Unified Graph Manager Interface
Supports both single and batch operations

#### Implements

- [`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Constructors

##### Constructor

> **new GraphManager**(`uri`, `user`, `password`): [`GraphManager`](#graphmanager)

Defined in: src/managers/GraphManager.ts:31

###### Parameters

###### uri

`string`

###### user

`string`

###### password

`string`

###### Returns

[`GraphManager`](#graphmanager)

#### Methods

##### getDriver()

> **getDriver**(): `Driver`

Defined in: src/managers/GraphManager.ts:94

Get the Neo4j driver instance for direct database access

Use this when you need to execute custom Cypher queries or manage
transactions that aren't covered by the GraphManager API.

###### Returns

`Driver`

Neo4j driver instance

###### Examples

```ts
// Execute custom Cypher query
const driver = graphManager.getDriver();
const session = driver.session();
try {
  const result = await session.run(
    'MATCH (n:Node) WHERE n.created > $date RETURN count(n)',
    { date: '2024-01-01' }
  );
  console.log('Nodes created:', result.records[0].get(0));
} finally {
  await session.close();
}
```

```ts
// Create custom transaction
const driver = graphManager.getDriver();
const session = driver.session();
const tx = session.beginTransaction();
try {
  await tx.run('CREATE (n:CustomNode {id: $id})', { id: 'custom-1' });
  await tx.run('CREATE (n:CustomNode {id: $id})', { id: 'custom-2' });
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
} finally {
  await session.close();
}
```

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`getDriver`](../types/IGraphManager.md#getdriver)

##### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: src/managers/GraphManager.ts:140

Initialize database schema: create indexes, constraints, and vector indexes

This method sets up the Neo4j database with all necessary indexes and constraints
for optimal performance. It's idempotent and safe to call multiple times.

Creates:
- Unique constraint on node IDs
- Full-text search indexes
- Vector indexes for semantic search
- File indexing schema
- Type indexes for fast filtering

###### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

###### Throws

If database connection fails or schema creation fails

###### Examples

```ts
// Initialize on server startup
const graphManager = new GraphManager(
  'bolt://localhost:7687',
  'neo4j',
  'password'
);
await graphManager.initialize();
console.log('Database schema initialized');
```

```ts
// Initialize with error handling
try {
  await graphManager.initialize();
  console.log('✅ Database ready');
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}
```

```ts
// Safe to call multiple times (idempotent)
await graphManager.initialize(); // First call creates schema
await graphManager.initialize(); // Second call is no-op
await graphManager.initialize(); // Still safe
```

##### testConnection()

> **testConnection**(): `Promise`\<`boolean`\>

Defined in: src/managers/GraphManager.ts:238

Test connection

###### Returns

`Promise`\<`boolean`\>

##### addNode()

> **addNode**(`type?`, `properties?`): `Promise`\<[`Node`](../types/graph.types.md#node)\>

Defined in: src/managers/GraphManager.ts:459

Add a new node to the knowledge graph with automatic embedding generation

Creates a node with the specified type and properties. Automatically generates
vector embeddings from text content (title, description, content fields) for
semantic search. Supports chunking for large content (>768 chars by default).

###### Parameters

###### type?

Node type (todo, file, concept, memory, etc.) or properties object

`Record`\<`string`, `any`\> | [`NodeType`](../types/graph.types.md#nodetype)

###### properties?

`Record`\<`string`, `any`\>

Node properties (title, description, content, status, etc.)

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)\>

Created node with generated ID and embeddings

###### Throws

If node creation fails

###### Examples

```ts
// Create a TODO task
const todo = await graphManager.addNode('todo', {
  title: 'Implement user authentication',
  description: 'Add JWT-based auth with refresh tokens and role-based access',
  status: 'pending',
  priority: 'high',
  assignee: 'worker-agent-1'
});
console.log('Created:', todo.id); // 'todo-1-1732456789'
console.log('Has embedding:', todo.properties.has_embedding); // true
```

```ts
// Create a memory node with automatic embedding
const memory = await graphManager.addNode('memory', {
  title: 'API Design Pattern',
  content: 'Use RESTful conventions with versioned endpoints (/v1/users). ' +
           'Always return consistent error formats with status codes.',
  tags: ['api', 'architecture', 'best-practices'],
  source: 'team-discussion',
  confidence: 0.95
});
// Embedding generated from title + content for semantic search
```

```ts
// Create a file node during indexing
const file = await graphManager.addNode('file', {
  path: '/src/auth/login.ts',
  name: 'login.ts',
  language: 'typescript',
  size: 2048,
  lines: 87,
  lastModified: new Date().toISOString(),
  content: '// File content here...'
});
// Large files automatically chunked for embeddings
```

```ts
// Create concept node for knowledge graph
const concept = await graphManager.addNode('concept', {
  title: 'Microservices Architecture',
  description: 'Architectural pattern where application is composed of small, ' +
               'independent services that communicate via APIs',
  category: 'architecture',
  related_concepts: ['API Gateway', 'Service Discovery', 'Event-Driven']
});
```

```ts
// Flexible API: pass properties as first argument
const node = await graphManager.addNode({
  type: 'memory',
  title: 'Quick note',
  content: 'Remember to update docs'
});
```

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`addNode`](../types/IGraphManager.md#addnode)

##### getNode()

> **getNode**(`id`): `Promise`\<[`Node`](../types/graph.types.md#node) \| `null`\>

Defined in: src/managers/GraphManager.ts:596

Retrieve a node by its ID with full properties

Fetches a single node from the graph database. Returns null if not found.
Includes all properties except embedding vectors (for performance).

###### Parameters

###### id

`string`

Unique node identifier

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node) \| `null`\>

Node object with all properties, or null if not found

###### Examples

```ts
// Get a TODO by ID
const todo = await graphManager.getNode('todo-1-1732456789');
if (todo) {
  console.log('Title:', todo.properties.title);
  console.log('Status:', todo.properties.status);
  console.log('Created:', todo.properties.created);
} else {
  console.log('TODO not found');
}
```

```ts
// Check if node exists before updating
const existing = await graphManager.getNode('memory-123');
if (!existing) {
  throw new Error('Memory node not found');
}
await graphManager.updateNode('memory-123', { 
  content: 'Updated content' 
});
```

```ts
// Get file node and check metadata
const file = await graphManager.getNode('file-src-auth-login-ts');
if (file && file.properties.lastModified) {
  const lastMod = new Date(file.properties.lastModified);
  const hoursSinceUpdate = (Date.now() - lastMod.getTime()) / (1000 * 60 * 60);
  console.log(`File last modified ${hoursSinceUpdate.toFixed(1)} hours ago`);
}
```

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`getNode`](../types/IGraphManager.md#getnode)

##### updateNode()

> **updateNode**(`id`, `properties`): `Promise`\<[`Node`](../types/graph.types.md#node)\>

Defined in: src/managers/GraphManager.ts:673

Update an existing node's properties with automatic embedding regeneration

Merges new properties into existing node. Automatically regenerates embeddings
if content-related fields (content, title, description) are modified.
Updates the 'updated' timestamp automatically.

###### Parameters

###### id

`string`

Node ID to update

###### properties

`Partial`\<`Record`\<`string`, `any`\>\>

Properties to update (partial update, merges with existing)

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)\>

Updated node with new properties

###### Throws

If node not found or update fails

###### Examples

```ts
// Update TODO status
const updated = await graphManager.updateNode('todo-1-1732456789', {
  status: 'in_progress',
  assignee: 'worker-agent-2',
  started_at: new Date().toISOString()
});
console.log('Status changed to:', updated.properties.status);
```

```ts
// Update memory content (triggers embedding regeneration)
const memory = await graphManager.updateNode('memory-123', {
  content: 'Updated API design: Use GraphQL instead of REST for complex queries',
  confidence: 0.98,
  last_verified: new Date().toISOString()
});
// Embedding automatically regenerated from new content
```

```ts
// Add metadata without changing content
await graphManager.updateNode('file-src-utils-ts', {
  lastAccessed: new Date().toISOString(),
  accessCount: 42,
  tags: ['utility', 'helper', 'core']
});
// No embedding regeneration (content unchanged)
```

```ts
// Partial update - only specified fields change
const todo = await graphManager.getNode('todo-1');
console.log('Before:', todo.properties); // { title: 'Task', status: 'pending', priority: 'high' }

await graphManager.updateNode('todo-1', { status: 'completed' });

const updated = await graphManager.getNode('todo-1');
console.log('After:', updated.properties); // { title: 'Task', status: 'completed', priority: 'high' }
// Only status changed, other fields preserved
```

```ts
// Error handling
try {
  await graphManager.updateNode('nonexistent-id', { status: 'done' });
} catch (error) {
  console.error('Update failed:', error.message); // 'Node not found: nonexistent-id'
}
```

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`updateNode`](../types/IGraphManager.md#updatenode)

##### deleteNode()

> **deleteNode**(`id`): `Promise`\<`boolean`\>

Defined in: src/managers/GraphManager.ts:777

Delete a single node

###### Parameters

###### id

`string`

###### Returns

`Promise`\<`boolean`\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`deleteNode`](../types/IGraphManager.md#deletenode)

##### addEdge()

> **addEdge**(`source`, `target`, `type`, `properties`): `Promise`\<[`Edge`](../types/graph.types.md#edge)\>

Defined in: src/managers/GraphManager.ts:796

Add a single edge between two nodes

###### Parameters

###### source

`string`

###### target

`string`

###### type

[`EdgeType`](../types/graph.types.md#edgetype)

###### properties

`Record`\<`string`, `any`\> = `{}`

###### Returns

`Promise`\<[`Edge`](../types/graph.types.md#edge)\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`addEdge`](../types/IGraphManager.md#addedge)

##### deleteEdge()

> **deleteEdge**(`edgeId`): `Promise`\<`boolean`\>

Defined in: src/managers/GraphManager.ts:854

Delete a single edge

###### Parameters

###### edgeId

`string`

###### Returns

`Promise`\<`boolean`\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`deleteEdge`](../types/IGraphManager.md#deleteedge)

##### addNodes()

> **addNodes**(`nodes`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/GraphManager.ts:877

Add multiple nodes in a single transaction
Returns created nodes in same order as input

###### Parameters

###### nodes

`object`[]

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`addNodes`](../types/IGraphManager.md#addnodes)

##### updateNodes()

> **updateNodes**(`updates`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/GraphManager.ts:966

Update multiple nodes in a single transaction
Returns updated nodes in same order as input

###### Parameters

###### updates

`object`[]

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`updateNodes`](../types/IGraphManager.md#updatenodes)

##### deleteNodes()

> **deleteNodes**(`ids`): `Promise`\<[`BatchDeleteResult`](../types/graph.types.md#batchdeleteresult)\>

Defined in: src/managers/GraphManager.ts:993

Delete multiple nodes in a single transaction
Returns count of deleted nodes and any errors

###### Parameters

###### ids

`string`[]

###### Returns

`Promise`\<[`BatchDeleteResult`](../types/graph.types.md#batchdeleteresult)\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`deleteNodes`](../types/IGraphManager.md#deletenodes)

##### addEdges()

> **addEdges**(`edges`): `Promise`\<[`Edge`](../types/graph.types.md#edge)[]\>

Defined in: src/managers/GraphManager.ts:1017

Add multiple edges in a single transaction
Returns created edges in same order as input

###### Parameters

###### edges

`object`[]

###### Returns

`Promise`\<[`Edge`](../types/graph.types.md#edge)[]\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`addEdges`](../types/IGraphManager.md#addedges)

##### deleteEdges()

> **deleteEdges**(`edgeIds`): `Promise`\<[`BatchDeleteResult`](../types/graph.types.md#batchdeleteresult)\>

Defined in: src/managers/GraphManager.ts:1056

Delete multiple edges in a single transaction
Returns count of deleted edges and any errors

###### Parameters

###### edgeIds

`string`[]

###### Returns

`Promise`\<[`BatchDeleteResult`](../types/graph.types.md#batchdeleteresult)\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`deleteEdges`](../types/IGraphManager.md#deleteedges)

##### queryNodes()

> **queryNodes**(`type?`, `filters?`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/GraphManager.ts:1084

Query nodes by type and/or properties
Note: Large content fields (>10KB) are stripped to prevent massive responses.
Use getNode() for individual nodes to retrieve full content.

###### Parameters

###### type?

[`NodeType`](../types/graph.types.md#nodetype)

###### filters?

`Record`\<`string`, `any`\>

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`queryNodes`](../types/IGraphManager.md#querynodes)

##### searchNodes()

> **searchNodes**(`query`, `options`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/GraphManager.ts:1137

Full-text search across node properties
Note: Large content fields (>10KB) are stripped, but relevant line numbers
and snippets matching the search query are included.
Use getNode() for individual nodes to retrieve full content.

###### Parameters

###### query

`string`

###### options

[`SearchOptions`](../types/graph.types.md#searchoptions) = `{}`

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`searchNodes`](../types/IGraphManager.md#searchnodes)

##### getEdges()

> **getEdges**(`nodeId`, `direction`): `Promise`\<[`Edge`](../types/graph.types.md#edge)[]\>

Defined in: src/managers/GraphManager.ts:1204

Get all edges connected to a node

###### Parameters

###### nodeId

`string`

###### direction

`"in"` | `"out"` | `"both"`

###### Returns

`Promise`\<[`Edge`](../types/graph.types.md#edge)[]\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`getEdges`](../types/IGraphManager.md#getedges)

##### getNeighbors()

> **getNeighbors**(`nodeId`, `edgeType?`, `depth?`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/GraphManager.ts:1230

Get neighboring nodes

###### Parameters

###### nodeId

`string`

###### edgeType?

[`EdgeType`](../types/graph.types.md#edgetype)

###### depth?

`number` = `1`

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`getNeighbors`](../types/IGraphManager.md#getneighbors)

##### getSubgraph()

> **getSubgraph**(`nodeId`, `depth`): `Promise`\<[`Subgraph`](../types/graph.types.md#subgraph)\>

Defined in: src/managers/GraphManager.ts:1266

Get a subgraph starting from a node

###### Parameters

###### nodeId

`string`

###### depth

`number` = `2`

###### Returns

`Promise`\<[`Subgraph`](../types/graph.types.md#subgraph)\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`getSubgraph`](../types/IGraphManager.md#getsubgraph)

##### getStats()

> **getStats**(): `Promise`\<[`GraphStats`](../types/graph.types.md#graphstats)\>

Defined in: src/managers/GraphManager.ts:1320

Get graph statistics

###### Returns

`Promise`\<[`GraphStats`](../types/graph.types.md#graphstats)\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`getStats`](../types/IGraphManager.md#getstats)

##### clear()

> **clear**(`type?`): `Promise`\<\{ `deletedNodes`: `number`; `deletedEdges`: `number`; \}\>

Defined in: src/managers/GraphManager.ts:1359

Clear all data or specific node type from the graph

###### Parameters

###### type?

[`ClearType`](../types/graph.types.md#cleartype)

Node type to clear, or "ALL" to clear entire graph (use with caution!)

###### Returns

`Promise`\<\{ `deletedNodes`: `number`; `deletedEdges`: `number`; \}\>

Object with counts of deleted nodes and edges

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`clear`](../types/IGraphManager.md#clear)

##### close()

> **close**(): `Promise`\<`void`\>

Defined in: src/managers/GraphManager.ts:1420

Close connections (cleanup)

###### Returns

`Promise`\<`void`\>

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`close`](../types/IGraphManager.md#close)

##### lockNode()

> **lockNode**(`nodeId`, `agentId`, `timeoutMs`): `Promise`\<`boolean`\>

Defined in: src/managers/GraphManager.ts:1481

Acquire exclusive lock on a node (typically a TODO) for multi-agent coordination
Uses optimistic locking with automatic expiry

###### Parameters

###### nodeId

`string`

Node ID to lock

###### agentId

`string`

Agent claiming the lock

###### timeoutMs

`number` = `300000`

Lock expiry in milliseconds (default 300000 = 5 min)

###### Returns

`Promise`\<`boolean`\>

true if lock acquired, false if already locked by another agent

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`lockNode`](../types/IGraphManager.md#locknode)

##### unlockNode()

> **unlockNode**(`nodeId`, `agentId`): `Promise`\<`boolean`\>

Defined in: src/managers/GraphManager.ts:1522

Release lock on a node

###### Parameters

###### nodeId

`string`

Node ID to unlock

###### agentId

`string`

Agent releasing the lock (must match lock owner)

###### Returns

`Promise`\<`boolean`\>

true if lock released, false if not locked or locked by different agent

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`unlockNode`](../types/IGraphManager.md#unlocknode)

##### queryNodesWithLockStatus()

> **queryNodesWithLockStatus**(`type?`, `filters?`, `includeAvailableOnly?`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/GraphManager.ts:1549

Query nodes filtered by lock status

###### Parameters

###### type?

[`NodeType`](../types/graph.types.md#nodetype)

Optional node type filter

###### filters?

`Record`\<`string`, `any`\>

Additional property filters

###### includeAvailableOnly?

`boolean`

If true, only return unlocked or expired-lock nodes

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Array of nodes

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`queryNodesWithLockStatus`](../types/IGraphManager.md#querynodeswithlockstatus)

##### cleanupExpiredLocks()

> **cleanupExpiredLocks**(): `Promise`\<`number`\>

Defined in: src/managers/GraphManager.ts:1616

Clean up expired locks across all nodes
Should be called periodically by the server

###### Returns

`Promise`\<`number`\>

Number of locks cleaned up

###### Implementation of

[`IGraphManager`](../types/IGraphManager.md#igraphmanager).[`cleanupExpiredLocks`](../types/IGraphManager.md#cleanupexpiredlocks)
