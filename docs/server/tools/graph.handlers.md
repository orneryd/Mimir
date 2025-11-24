[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / tools/graph.handlers

# tools/graph.handlers

## Functions

### handleMemoryNode()

> **handleMemoryNode**(`args`, `graphManager`): `Promise`\<\{ `success`: `boolean`; `operation`: `string`; `node`: [`Node`](../types/graph.types.md#node); `warning`: `string`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `success`: `boolean`; `error`: `string`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `success`: `boolean`; `operation`: `string`; `node`: [`Node`](../types/graph.types.md#node) \| `null`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `node`: \{ `id`: `string`; `type`: [`NodeType`](../types/graph.types.md#nodetype); \}; `cascadeDeletedEdges`: `number`; \}; `message`: `string`; `expiresIn`: `string`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `operation`: `string`; `confirmed`: `boolean`; `deleted`: `boolean`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](../types/graph.types.md#node)[]; \}\>

Defined in: src/tools/graph.handlers.ts:27

#### Parameters

##### args

`any`

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Returns

`Promise`\<\{ `success`: `boolean`; `operation`: `string`; `node`: [`Node`](../types/graph.types.md#node); `warning`: `string`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `success`: `boolean`; `error`: `string`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `success`: `boolean`; `operation`: `string`; `node`: [`Node`](../types/graph.types.md#node) \| `null`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `node`: \{ `id`: `string`; `type`: [`NodeType`](../types/graph.types.md#nodetype); \}; `cascadeDeletedEdges`: `number`; \}; `message`: `string`; `expiresIn`: `string`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `operation`: `string`; `confirmed`: `boolean`; `deleted`: `boolean`; `count?`: `undefined`; `nodes?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `node?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `deleted?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](../types/graph.types.md#node)[]; \}\>

***

### handleMemoryEdge()

> **handleMemoryEdge**(`args`, `graphManager`): `Promise`\<\{ `warning?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `error`: `string`; `edge?`: `undefined`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `operation`: `string`; `edge`: [`Edge`](../types/graph.types.md#edge); `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `operation`: `string`; `edge`: [`Edge`](../types/graph.types.md#edge); `warning`: `string`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `count?`: `undefined`; `edge?`: `undefined`; `success`: `boolean`; `operation`: `string`; `deleted`: `boolean`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `edge?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](../types/graph.types.md#edge)[]; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `edge?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `neighbors`: [`Node`](../types/graph.types.md#node)[]; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `edge?`: `undefined`; `edges?`: `undefined`; `neighbors?`: `undefined`; `success`: `boolean`; `operation`: `string`; `subgraph`: [`Subgraph`](../types/graph.types.md#subgraph); \}\>

Defined in: src/tools/graph.handlers.ts:165

#### Parameters

##### args

`any`

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Returns

`Promise`\<\{ `warning?`: `undefined`; `deleted?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `error`: `string`; `edge?`: `undefined`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `operation`: `string`; `edge`: [`Edge`](../types/graph.types.md#edge); `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `success`: `boolean`; `operation`: `string`; `edge`: [`Edge`](../types/graph.types.md#edge); `warning`: `string`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `count?`: `undefined`; `edge?`: `undefined`; `success`: `boolean`; `operation`: `string`; `deleted`: `boolean`; `edges?`: `undefined`; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `edge?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](../types/graph.types.md#edge)[]; `neighbors?`: `undefined`; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `edge?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `neighbors`: [`Node`](../types/graph.types.md#node)[]; `subgraph?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `deleted?`: `undefined`; `count?`: `undefined`; `edge?`: `undefined`; `edges?`: `undefined`; `neighbors?`: `undefined`; `success`: `boolean`; `operation`: `string`; `subgraph`: [`Subgraph`](../types/graph.types.md#subgraph); \}\>

***

### handleMemoryBatch()

> **handleMemoryBatch**(`args`, `graphManager`): `Promise`\<\{ `warning?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `error`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](../types/graph.types.md#node)[]; `result?`: `undefined`; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](../types/graph.types.md#node)[]; `warning`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `nodeCount`: `number`; `nodeIds`: `string`[]; `more`: `number`; `edgeCount?`: `undefined`; `edgeIds?`: `undefined`; \}; `message`: `string`; `expiresIn`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `confirmed`: `boolean`; `result`: [`BatchDeleteResult`](../types/graph.types.md#batchdeleteresult); \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `nodes?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](../types/graph.types.md#edge)[]; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `nodes?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](../types/graph.types.md#edge)[]; `warning`: `string`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `nodeCount?`: `undefined`; `nodeIds?`: `undefined`; `edgeCount`: `number`; `edgeIds`: `string`[]; `more`: `number`; \}; `message`: `string`; `expiresIn`: `string`; \}\>

Defined in: src/tools/graph.handlers.ts:247

#### Parameters

##### args

`any`

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Returns

`Promise`\<\{ `warning?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `error`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](../types/graph.types.md#node)[]; `result?`: `undefined`; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](../types/graph.types.md#node)[]; `warning`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `nodeCount`: `number`; `nodeIds`: `string`[]; `more`: `number`; `edgeCount?`: `undefined`; `edgeIds?`: `undefined`; \}; `message`: `string`; `expiresIn`: `string`; `result?`: `undefined`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `success`: `boolean`; `operation`: `string`; `confirmed`: `boolean`; `result`: [`BatchDeleteResult`](../types/graph.types.md#batchdeleteresult); \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `nodes?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](../types/graph.types.md#edge)[]; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `confirmed?`: `undefined`; `nodes?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `edges`: [`Edge`](../types/graph.types.md#edge)[]; `warning`: `string`; \} \| \{ `warning?`: `undefined`; `error?`: `undefined`; `confirmed?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `edges?`: `undefined`; `result?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `nodeCount?`: `undefined`; `nodeIds?`: `undefined`; `edgeCount`: `number`; `edgeIds`: `string`[]; `more`: `number`; \}; `message`: `string`; `expiresIn`: `string`; \}\>

***

### handleMemoryLock()

> **handleMemoryLock**(`args`, `graphManager`): `Promise`\<\{ `message?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `success`: `boolean`; `error`: `string`; `locked?`: `undefined`; `unlocked?`: `undefined`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `success`: `boolean`; `operation`: `string`; `locked`: `boolean`; `message`: `string`; `unlocked?`: `undefined`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `locked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `unlocked`: `boolean`; `message`: `string`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `message?`: `undefined`; `locked?`: `undefined`; `unlocked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](../types/graph.types.md#node)[]; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `locked?`: `undefined`; `unlocked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `cleaned`: `number`; `message`: `string`; \}\>

Defined in: src/tools/graph.handlers.ts:436

#### Parameters

##### args

`any`

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Returns

`Promise`\<\{ `message?`: `undefined`; `operation?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `success`: `boolean`; `error`: `string`; `locked?`: `undefined`; `unlocked?`: `undefined`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `success`: `boolean`; `operation`: `string`; `locked`: `boolean`; `message`: `string`; `unlocked?`: `undefined`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `locked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `unlocked`: `boolean`; `message`: `string`; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `message?`: `undefined`; `locked?`: `undefined`; `unlocked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `count`: `number`; `nodes`: [`Node`](../types/graph.types.md#node)[]; `cleaned?`: `undefined`; \} \| \{ `error?`: `undefined`; `count?`: `undefined`; `nodes?`: `undefined`; `locked?`: `undefined`; `unlocked?`: `undefined`; `success`: `boolean`; `operation`: `string`; `cleaned`: `number`; `message`: `string`; \}\>

***

### handleMemoryClear()

> **handleMemoryClear**(`args`, `graphManager`): `Promise`\<\{ `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `error`: `string`; \} \| \{ `error?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `deletedNodes`: `number`; `deletedEdges`: `number`; `types?`: `Record`\<`string`, `number`\>; \}; `message`: `string`; `expiresIn`: `string`; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `confirmed`: `boolean`; `message`: `string`; `deletedNodes`: `number`; `deletedEdges`: `number`; \}\>

Defined in: src/tools/graph.handlers.ts:507

#### Parameters

##### args

`any`

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Returns

`Promise`\<\{ `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `message?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `error`: `string`; \} \| \{ `error?`: `undefined`; `success`: `boolean`; `needsConfirmation`: `boolean`; `confirmationId`: `string`; `preview`: \{ `deletedNodes`: `number`; `deletedEdges`: `number`; `types?`: `Record`\<`string`, `number`\>; \}; `message`: `string`; `expiresIn`: `string`; \} \| \{ `error?`: `undefined`; `needsConfirmation?`: `undefined`; `confirmationId?`: `undefined`; `preview?`: `undefined`; `expiresIn?`: `undefined`; `success`: `boolean`; `confirmed`: `boolean`; `message`: `string`; `deletedNodes`: `number`; `deletedEdges`: `number`; \}\>
