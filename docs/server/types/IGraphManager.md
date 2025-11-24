[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / types/IGraphManager

# types/IGraphManager

## Interfaces

### IGraphManager

Defined in: src/types/IGraphManager.ts:21

Unified Graph Manager Interface
Supports both single and batch operations

#### Methods

##### addNode()

> **addNode**(`type?`, `properties?`): `Promise`\<[`Node`](graph.types.md#node)\>

Defined in: src/types/IGraphManager.ts:31

Add a single node to the graph

###### Parameters

###### type?

[`NodeType`](graph.types.md#nodetype)

Node type (defaults to 'memory' if not specified)

###### properties?

`Record`\<`string`, `any`\>

Node properties

###### Returns

`Promise`\<[`Node`](graph.types.md#node)\>

##### getNode()

> **getNode**(`id`): `Promise`\<[`Node`](graph.types.md#node) \| `null`\>

Defined in: src/types/IGraphManager.ts:38

Get a node by ID
Returns full node content including any large text fields.
This is a single-node operation so all content is included.

###### Parameters

###### id

`string`

###### Returns

`Promise`\<[`Node`](graph.types.md#node) \| `null`\>

##### updateNode()

> **updateNode**(`id`, `properties`): `Promise`\<[`Node`](graph.types.md#node)\>

Defined in: src/types/IGraphManager.ts:43

Update a node's properties (merge with existing)

###### Parameters

###### id

`string`

###### properties

`Partial`\<`Record`\<`string`, `any`\>\>

###### Returns

`Promise`\<[`Node`](graph.types.md#node)\>

##### deleteNode()

> **deleteNode**(`id`): `Promise`\<`boolean`\>

Defined in: src/types/IGraphManager.ts:48

Delete a single node

###### Parameters

###### id

`string`

###### Returns

`Promise`\<`boolean`\>

##### addEdge()

> **addEdge**(`source`, `target`, `type`, `properties?`): `Promise`\<[`Edge`](graph.types.md#edge)\>

Defined in: src/types/IGraphManager.ts:53

Add a single edge between two nodes

###### Parameters

###### source

`string`

###### target

`string`

###### type

[`EdgeType`](graph.types.md#edgetype)

###### properties?

`Record`\<`string`, `any`\>

###### Returns

`Promise`\<[`Edge`](graph.types.md#edge)\>

##### deleteEdge()

> **deleteEdge**(`edgeId`): `Promise`\<`boolean`\>

Defined in: src/types/IGraphManager.ts:63

Delete a single edge

###### Parameters

###### edgeId

`string`

###### Returns

`Promise`\<`boolean`\>

##### addNodes()

> **addNodes**(`nodes`): `Promise`\<[`Node`](graph.types.md#node)[]\>

Defined in: src/types/IGraphManager.ts:73

Add multiple nodes in a single transaction
Returns created nodes in same order as input

###### Parameters

###### nodes

`object`[]

###### Returns

`Promise`\<[`Node`](graph.types.md#node)[]\>

##### updateNodes()

> **updateNodes**(`updates`): `Promise`\<[`Node`](graph.types.md#node)[]\>

Defined in: src/types/IGraphManager.ts:82

Update multiple nodes in a single transaction
Returns updated nodes in same order as input

###### Parameters

###### updates

`object`[]

###### Returns

`Promise`\<[`Node`](graph.types.md#node)[]\>

##### deleteNodes()

> **deleteNodes**(`ids`): `Promise`\<[`BatchDeleteResult`](graph.types.md#batchdeleteresult)\>

Defined in: src/types/IGraphManager.ts:91

Delete multiple nodes in a single transaction
Returns count of deleted nodes and any errors

###### Parameters

###### ids

`string`[]

###### Returns

`Promise`\<[`BatchDeleteResult`](graph.types.md#batchdeleteresult)\>

##### addEdges()

> **addEdges**(`edges`): `Promise`\<[`Edge`](graph.types.md#edge)[]\>

Defined in: src/types/IGraphManager.ts:97

Add multiple edges in a single transaction
Returns created edges in same order as input

###### Parameters

###### edges

`object`[]

###### Returns

`Promise`\<[`Edge`](graph.types.md#edge)[]\>

##### deleteEdges()

> **deleteEdges**(`edgeIds`): `Promise`\<[`BatchDeleteResult`](graph.types.md#batchdeleteresult)\>

Defined in: src/types/IGraphManager.ts:108

Delete multiple edges in a single transaction
Returns count of deleted edges and any errors

###### Parameters

###### edgeIds

`string`[]

###### Returns

`Promise`\<[`BatchDeleteResult`](graph.types.md#batchdeleteresult)\>

##### queryNodes()

> **queryNodes**(`type?`, `filters?`): `Promise`\<[`Node`](graph.types.md#node)[]\>

Defined in: src/types/IGraphManager.ts:119

Query nodes by type and/or properties
Note: Large content fields (>10KB) are stripped to prevent massive responses.
Use getNode() for individual nodes to retrieve full content.

###### Parameters

###### type?

[`NodeType`](graph.types.md#nodetype)

###### filters?

`Record`\<`string`, `any`\>

###### Returns

`Promise`\<[`Node`](graph.types.md#node)[]\>

##### searchNodes()

> **searchNodes**(`query`, `options?`): `Promise`\<[`Node`](graph.types.md#node)[]\>

Defined in: src/types/IGraphManager.ts:130

Full-text search across node properties
Note: Large content fields (>10KB) are stripped, but relevant line numbers
and snippets matching the search query are included.
Use getNode() for individual nodes to retrieve full content.

###### Parameters

###### query

`string`

###### options?

[`SearchOptions`](graph.types.md#searchoptions)

###### Returns

`Promise`\<[`Node`](graph.types.md#node)[]\>

##### getEdges()

> **getEdges**(`nodeId`, `direction?`): `Promise`\<[`Edge`](graph.types.md#edge)[]\>

Defined in: src/types/IGraphManager.ts:138

Get all edges connected to a node

###### Parameters

###### nodeId

`string`

###### direction?

`"in"` | `"out"` | `"both"`

###### Returns

`Promise`\<[`Edge`](graph.types.md#edge)[]\>

##### getNeighbors()

> **getNeighbors**(`nodeId`, `edgeType?`, `depth?`): `Promise`\<[`Node`](graph.types.md#node)[]\>

Defined in: src/types/IGraphManager.ts:150

Get neighboring nodes

###### Parameters

###### nodeId

`string`

###### edgeType?

[`EdgeType`](graph.types.md#edgetype)

###### depth?

`number`

###### Returns

`Promise`\<[`Node`](graph.types.md#node)[]\>

##### getSubgraph()

> **getSubgraph**(`nodeId`, `depth?`): `Promise`\<[`Subgraph`](graph.types.md#subgraph)\>

Defined in: src/types/IGraphManager.ts:159

Get a subgraph starting from a node

###### Parameters

###### nodeId

`string`

###### depth?

`number`

###### Returns

`Promise`\<[`Subgraph`](graph.types.md#subgraph)\>

##### getStats()

> **getStats**(): `Promise`\<[`GraphStats`](graph.types.md#graphstats)\>

Defined in: src/types/IGraphManager.ts:171

Get graph statistics

###### Returns

`Promise`\<[`GraphStats`](graph.types.md#graphstats)\>

##### clear()

> **clear**(`type?`): `Promise`\<\{ `deletedNodes`: `number`; `deletedEdges`: `number`; \}\>

Defined in: src/types/IGraphManager.ts:178

Clear all data or specific node type from the graph

###### Parameters

###### type?

[`ClearType`](graph.types.md#cleartype)

Node type to clear, or "ALL" to clear entire graph (use with caution!)

###### Returns

`Promise`\<\{ `deletedNodes`: `number`; `deletedEdges`: `number`; \}\>

Object with counts of deleted nodes and edges

##### close()?

> `optional` **close**(): `Promise`\<`void`\>

Defined in: src/types/IGraphManager.ts:183

Close connections (cleanup)

###### Returns

`Promise`\<`void`\>

##### getDriver()

> **getDriver**(): `any`

Defined in: src/types/IGraphManager.ts:188

Get the Neo4j driver instance (for direct access when needed)

###### Returns

`any`

##### lockNode()

> **lockNode**(`nodeId`, `agentId`, `timeoutMs?`): `Promise`\<`boolean`\>

Defined in: src/types/IGraphManager.ts:201

Acquire exclusive lock on a node for multi-agent coordination

###### Parameters

###### nodeId

`string`

Node ID to lock

###### agentId

`string`

Agent claiming the lock

###### timeoutMs?

`number`

Lock expiry in milliseconds (default 300000 = 5 min)

###### Returns

`Promise`\<`boolean`\>

true if lock acquired, false if already locked by another agent

##### unlockNode()

> **unlockNode**(`nodeId`, `agentId`): `Promise`\<`boolean`\>

Defined in: src/types/IGraphManager.ts:209

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

##### queryNodesWithLockStatus()

> **queryNodesWithLockStatus**(`type?`, `filters?`, `includeAvailableOnly?`): `Promise`\<[`Node`](graph.types.md#node)[]\>

Defined in: src/types/IGraphManager.ts:218

Query nodes filtered by lock status

###### Parameters

###### type?

[`NodeType`](graph.types.md#nodetype)

Optional node type filter

###### filters?

`Record`\<`string`, `any`\>

Additional property filters

###### includeAvailableOnly?

`boolean`

If true, only return unlocked or expired-lock nodes

###### Returns

`Promise`\<[`Node`](graph.types.md#node)[]\>

Array of nodes

##### cleanupExpiredLocks()

> **cleanupExpiredLocks**(): `Promise`\<`number`\>

Defined in: src/types/IGraphManager.ts:228

Clean up expired locks across all nodes

###### Returns

`Promise`\<`number`\>

Number of locks cleaned up
