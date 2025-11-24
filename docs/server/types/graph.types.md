[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / types/graph.types

# types/graph.types

## Description

Core type definitions for the unified graph model

Mimir uses a unified graph model where everything is a Node with a type.
This simplifies the data model and enables powerful graph traversal queries.
All nodes share the same base structure but have different types and properties.

## Example

```typescript
// All these are nodes with different types
const memory: Node = {
  id: 'memory-1',
  type: 'memory',
  properties: { title: 'Decision', content: '...' },
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z'
};

const todo: Node = {
  id: 'todo-1',
  type: 'todo',
  properties: { title: 'Task', status: 'pending' },
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z'
};
```

## Interfaces

### Node

Defined in: src/types/graph.types.ts:142

Unified Node structure

#### Description

Base structure for all nodes in the graph. Every entity
(todo, memory, file, etc.) uses this same structure with different types
and properties. This unified model enables powerful graph queries.

#### Example

```typescript
const node: Node = {
  id: 'memory-1',
  type: 'memory',
  properties: {
    title: 'Important Decision',
    content: 'We decided to use PostgreSQL',
    tags: ['database', 'architecture']
  },
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z'
};
```

#### Properties

##### id

> **id**: `string`

Defined in: src/types/graph.types.ts:143

Unique identifier (e.g., 'todo-123', 'memory-456')

##### type

> **type**: [`NodeType`](#nodetype)

Defined in: src/types/graph.types.ts:144

Node type determining its semantic meaning

##### properties

> **properties**: `Record`\<`string`, `any`\>

Defined in: src/types/graph.types.ts:145

Flexible key-value properties specific to the type

##### created

> **created**: `string`

Defined in: src/types/graph.types.ts:146

ISO 8601 timestamp of creation

##### updated

> **updated**: `string`

Defined in: src/types/graph.types.ts:147

ISO 8601 timestamp of last update

***

### Edge

Defined in: src/types/graph.types.ts:175

Edge structure

#### Description

Represents a directed relationship between two nodes.
Edges have a type that defines the semantic meaning of the relationship.

#### Example

```typescript
const edge: Edge = {
  id: 'edge-1',
  source: 'todo-1',
  target: 'todo-2',
  type: 'depends_on',
  properties: { weight: 1.0 },
  created: '2024-01-01T00:00:00Z'
};
```

#### Properties

##### id

> **id**: `string`

Defined in: src/types/graph.types.ts:176

Unique edge identifier

##### source

> **source**: `string`

Defined in: src/types/graph.types.ts:177

ID of the source node

##### target

> **target**: `string`

Defined in: src/types/graph.types.ts:178

ID of the target node

##### type

> **type**: [`EdgeType`](#edgetype)

Defined in: src/types/graph.types.ts:179

Semantic type of the relationship

##### properties?

> `optional` **properties**: `Record`\<`string`, `any`\>

Defined in: src/types/graph.types.ts:180

Optional additional properties

##### created

> **created**: `string`

Defined in: src/types/graph.types.ts:181

ISO 8601 timestamp of creation

***

### SearchOptions

Defined in: src/types/graph.types.ts:214

Search options for queries

#### Description

Configuration options for search and query operations.
Supports pagination, filtering, sorting, and hybrid search parameters.

#### Example

```typescript
const options: SearchOptions = {
  limit: 20,
  types: ['memory', 'todo'],
  minSimilarity: 0.8,
  sortBy: 'created',
  sortOrder: 'desc'
};

const results = await graphManager.searchNodes('auth', options);
```

#### Properties

##### limit?

> `optional` **limit**: `number`

Defined in: src/types/graph.types.ts:215

Maximum number of results (default: 10)

##### offset?

> `optional` **offset**: `number`

Defined in: src/types/graph.types.ts:216

Number of results to skip for pagination

##### types?

> `optional` **types**: [`NodeType`](#nodetype)[]

Defined in: src/types/graph.types.ts:217

Filter by node types

##### sortBy?

> `optional` **sortBy**: `string`

Defined in: src/types/graph.types.ts:218

Property name to sort by

##### sortOrder?

> `optional` **sortOrder**: `"asc"` \| `"desc"`

Defined in: src/types/graph.types.ts:219

Sort direction: 'asc' or 'desc'

##### minSimilarity?

> `optional` **minSimilarity**: `number`

Defined in: src/types/graph.types.ts:220

Minimum cosine similarity for vector search (0-1)

##### rrfK?

> `optional` **rrfK**: `number`

Defined in: src/types/graph.types.ts:221

Reciprocal Rank Fusion constant (default: 60)

##### rrfVectorWeight?

> `optional` **rrfVectorWeight**: `number`

Defined in: src/types/graph.types.ts:222

Weight for vector search in hybrid mode

##### rrfBm25Weight?

> `optional` **rrfBm25Weight**: `number`

Defined in: src/types/graph.types.ts:223

Weight for BM25 keyword search in hybrid mode

##### rrfMinScore?

> `optional` **rrfMinScore**: `number`

Defined in: src/types/graph.types.ts:224

Minimum RRF score threshold

***

### BatchDeleteResult

Defined in: src/types/graph.types.ts:230

Batch delete result with partial failure handling

#### Properties

##### deleted

> **deleted**: `number`

Defined in: src/types/graph.types.ts:231

##### errors

> **errors**: `object`[]

Defined in: src/types/graph.types.ts:232

###### id

> **id**: `string`

###### error

> **error**: `string`

***

### GraphStats

Defined in: src/types/graph.types.ts:241

Graph statistics

#### Properties

##### nodeCount

> **nodeCount**: `number`

Defined in: src/types/graph.types.ts:242

##### edgeCount

> **edgeCount**: `number`

Defined in: src/types/graph.types.ts:243

##### types

> **types**: `Record`\<`string`, `number`\>

Defined in: src/types/graph.types.ts:244

***

### Subgraph

Defined in: src/types/graph.types.ts:250

Subgraph result

#### Properties

##### nodes

> **nodes**: [`Node`](#node)[]

Defined in: src/types/graph.types.ts:251

##### edges

> **edges**: [`Edge`](#edge)[]

Defined in: src/types/graph.types.ts:252

## Type Aliases

### NodeType

> **NodeType** = `"todo"` \| `"todoList"` \| `"memory"` \| `"file"` \| `"function"` \| `"class"` \| `"module"` \| `"concept"` \| `"person"` \| `"project"` \| `"preamble"` \| `"chain_execution"` \| `"agent_step"` \| `"failure_pattern"` \| `"custom"`

Defined in: src/types/graph.types.ts:59

Node types in the unified graph model

#### Description

All entities in Mimir are represented as nodes with one of these types.
Each type has its own expected properties but all share the same base Node structure.

Common node types:
- **todo**: Tasks and action items with status tracking
- **memory**: Knowledge entries for agent recall
- **file**: Source code files with content
- **todoList**: Collections of related todos
- **concept**: Abstract ideas and concepts
- **project**: High-level project containers

#### Example

```typescript
// Create different node types
const memory = await graphManager.addNode('memory', {
  title: 'Architecture Decision',
  content: 'We chose microservices...'
});

const todo = await graphManager.addNode('todo', {
  title: 'Implement auth',
  status: 'pending',
  priority: 'high'
});
```

***

### ClearType

> **ClearType** = [`NodeType`](#nodetype) \| `"ALL"`

Defined in: src/types/graph.types.ts:77

***

### EdgeType

> **EdgeType** = `"contains"` \| `"depends_on"` \| `"relates_to"` \| `"implements"` \| `"calls"` \| `"imports"` \| `"assigned_to"` \| `"parent_of"` \| `"blocks"` \| `"references"` \| `"belongs_to"` \| `"follows"` \| `"occurred_in"`

Defined in: src/types/graph.types.ts:99

Edge types for relationships between nodes

#### Description

Defines the semantic meaning of relationships in the graph.
Edges connect nodes and represent how they relate to each other.

Common edge types:
- **depends_on**: A requires B to be completed first
- **contains**: Parent-child containment (file contains function)
- **relates_to**: Generic semantic relationship
- **references**: One node references another

#### Example

```typescript
// Create relationships between nodes
await graphManager.addEdge('todo-1', 'todo-2', 'depends_on');
await graphManager.addEdge('file-1', 'function-1', 'contains');
await graphManager.addEdge('memory-1', 'concept-1', 'relates_to');
```

## Functions

### todoToNodeProperties()

> **todoToNodeProperties**(`todo`): `Record`\<`string`, `any`\>

Defined in: src/types/graph.types.ts:262

Helper: Convert old TODO to unified node properties

#### Parameters

##### todo

###### title

`string`

###### description?

`string`

###### status?

`string`

###### priority?

`string`

#### Returns

`Record`\<`string`, `any`\>

***

### nodeToTodo()

> **nodeToTodo**(`node`): `any`

Defined in: src/types/graph.types.ts:280

Helper: Convert node to TODO-like structure (for compatibility)

#### Parameters

##### node

[`Node`](#node)

#### Returns

`any`
