[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / types/graph.types

# types/graph.types

## Interfaces

### Node

Defined in: src/types/graph.types.ts:51

Unified Node structure

#### Properties

##### id

> **id**: `string`

Defined in: src/types/graph.types.ts:52

##### type

> **type**: [`NodeType`](#nodetype)

Defined in: src/types/graph.types.ts:53

##### properties

> **properties**: `Record`\<`string`, `any`\>

Defined in: src/types/graph.types.ts:54

##### created

> **created**: `string`

Defined in: src/types/graph.types.ts:55

##### updated

> **updated**: `string`

Defined in: src/types/graph.types.ts:56

***

### Edge

Defined in: src/types/graph.types.ts:62

Edge structure

#### Properties

##### id

> **id**: `string`

Defined in: src/types/graph.types.ts:63

##### source

> **source**: `string`

Defined in: src/types/graph.types.ts:64

##### target

> **target**: `string`

Defined in: src/types/graph.types.ts:65

##### type

> **type**: [`EdgeType`](#edgetype)

Defined in: src/types/graph.types.ts:66

##### properties?

> `optional` **properties**: `Record`\<`string`, `any`\>

Defined in: src/types/graph.types.ts:67

##### created

> **created**: `string`

Defined in: src/types/graph.types.ts:68

***

### SearchOptions

Defined in: src/types/graph.types.ts:74

Search options for queries

#### Properties

##### limit?

> `optional` **limit**: `number`

Defined in: src/types/graph.types.ts:75

##### offset?

> `optional` **offset**: `number`

Defined in: src/types/graph.types.ts:76

##### types?

> `optional` **types**: [`NodeType`](#nodetype)[]

Defined in: src/types/graph.types.ts:77

##### sortBy?

> `optional` **sortBy**: `string`

Defined in: src/types/graph.types.ts:78

##### sortOrder?

> `optional` **sortOrder**: `"asc"` \| `"desc"`

Defined in: src/types/graph.types.ts:79

##### minSimilarity?

> `optional` **minSimilarity**: `number`

Defined in: src/types/graph.types.ts:80

##### rrfK?

> `optional` **rrfK**: `number`

Defined in: src/types/graph.types.ts:81

##### rrfVectorWeight?

> `optional` **rrfVectorWeight**: `number`

Defined in: src/types/graph.types.ts:82

##### rrfBm25Weight?

> `optional` **rrfBm25Weight**: `number`

Defined in: src/types/graph.types.ts:83

##### rrfMinScore?

> `optional` **rrfMinScore**: `number`

Defined in: src/types/graph.types.ts:84

***

### BatchDeleteResult

Defined in: src/types/graph.types.ts:90

Batch delete result with partial failure handling

#### Properties

##### deleted

> **deleted**: `number`

Defined in: src/types/graph.types.ts:91

##### errors

> **errors**: `object`[]

Defined in: src/types/graph.types.ts:92

###### id

> **id**: `string`

###### error

> **error**: `string`

***

### GraphStats

Defined in: src/types/graph.types.ts:101

Graph statistics

#### Properties

##### nodeCount

> **nodeCount**: `number`

Defined in: src/types/graph.types.ts:102

##### edgeCount

> **edgeCount**: `number`

Defined in: src/types/graph.types.ts:103

##### types

> **types**: `Record`\<`string`, `number`\>

Defined in: src/types/graph.types.ts:104

***

### Subgraph

Defined in: src/types/graph.types.ts:110

Subgraph result

#### Properties

##### nodes

> **nodes**: [`Node`](#node)[]

Defined in: src/types/graph.types.ts:111

##### edges

> **edges**: [`Edge`](#edge)[]

Defined in: src/types/graph.types.ts:112

## Type Aliases

### NodeType

> **NodeType** = `"todo"` \| `"todoList"` \| `"memory"` \| `"file"` \| `"function"` \| `"class"` \| `"module"` \| `"concept"` \| `"person"` \| `"project"` \| `"preamble"` \| `"chain_execution"` \| `"agent_step"` \| `"failure_pattern"` \| `"custom"`

Defined in: src/types/graph.types.ts:10

Node types in the unified graph
'todo' replaces the old separate TodoManager

***

### ClearType

> **ClearType** = [`NodeType`](#nodetype) \| `"ALL"`

Defined in: src/types/graph.types.ts:28

***

### EdgeType

> **EdgeType** = `"contains"` \| `"depends_on"` \| `"relates_to"` \| `"implements"` \| `"calls"` \| `"imports"` \| `"assigned_to"` \| `"parent_of"` \| `"blocks"` \| `"references"` \| `"belongs_to"` \| `"follows"` \| `"occurred_in"`

Defined in: src/types/graph.types.ts:33

Edge types for relationships between nodes

## Functions

### todoToNodeProperties()

> **todoToNodeProperties**(`todo`): `Record`\<`string`, `any`\>

Defined in: src/types/graph.types.ts:122

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

Defined in: src/types/graph.types.ts:140

Helper: Convert node to TODO-like structure (for compatibility)

#### Parameters

##### node

[`Node`](#node)

#### Returns

`any`
