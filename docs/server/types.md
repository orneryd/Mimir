[**mimir v1.0.0**](README.md)

***

[mimir](README.md) / types

# types

## Description

Core TypeScript type definitions for Mimir

This module exports all type definitions used throughout Mimir:

**Graph Types** (`graph.types.ts`):
- **Node**: Base structure for all graph nodes (todos, memories, files, etc.)
- **Edge**: Directed relationships between nodes
- **NodeType**: Union of all valid node types
- **EdgeType**: Union of all valid relationship types
- **SearchOptions**: Configuration for search queries
- **GraphStats**: Database statistics
- **Subgraph**: Multi-node graph structure

**Manager Interface** (`IGraphManager.ts`):
- **IGraphManager**: Complete interface for graph database operations

**Watch Config Types** (`watchConfig.types.ts`):
- **WatchConfig**: File watching configuration
- **WatchConfigInput**: Input for creating watch configs
- **WatchFolderResponse**: Response from watch operations
- **IndexFolderResponse**: Response from indexing operations
- **ListWatchedFoldersResponse**: List of watched folders

## Examples

```typescript
import type { Node, Edge, NodeType, SearchOptions } from './types/index.js';

// Create a typed node
const memory: Node = {
  id: 'memory-1',
  type: 'memory',
  properties: { title: 'Decision', content: '...' },
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z'
};

// Use search options
const options: SearchOptions = {
  limit: 10,
  types: ['memory', 'todo'],
  minSimilarity: 0.8
};
```

```typescript
// Work with edges
import type { Edge, EdgeType } from './types/index.js';

const edge: Edge = {
  id: 'edge-1',
  source: 'todo-1',
  target: 'project-1',
  type: 'part_of',
  created: '2024-01-01T00:00:00Z'
};
```

## References

### Node

Re-exports [Node](types/graph.types.md#node)

***

### Edge

Re-exports [Edge](types/graph.types.md#edge)

***

### NodeType

Re-exports [NodeType](types/graph.types.md#nodetype)

***

### EdgeType

Re-exports [EdgeType](types/graph.types.md#edgetype)

***

### ClearType

Re-exports [ClearType](types/graph.types.md#cleartype)

***

### SearchOptions

Re-exports [SearchOptions](types/graph.types.md#searchoptions)

***

### BatchDeleteResult

Re-exports [BatchDeleteResult](types/graph.types.md#batchdeleteresult)

***

### GraphStats

Re-exports [GraphStats](types/graph.types.md#graphstats)

***

### Subgraph

Re-exports [Subgraph](types/graph.types.md#subgraph)

***

### todoToNodeProperties

Re-exports [todoToNodeProperties](types/graph.types.md#todotonodeproperties)

***

### nodeToTodo

Re-exports [nodeToTodo](types/graph.types.md#nodetotodo)

***

### IGraphManager

Re-exports [IGraphManager](types/IGraphManager.md#igraphmanager)

***

### WatchConfig

Re-exports [WatchConfig](types/watchConfig.types.md#watchconfig)

***

### WatchConfigInput

Re-exports [WatchConfigInput](types/watchConfig.types.md#watchconfiginput)

***

### WatchFolderResponse

Re-exports [WatchFolderResponse](types/watchConfig.types.md#watchfolderresponse)

***

### IndexFolderResponse

Re-exports [IndexFolderResponse](types/watchConfig.types.md#indexfolderresponse)

***

### ListWatchedFoldersResponse

Re-exports [ListWatchedFoldersResponse](types/watchConfig.types.md#listwatchedfoldersresponse)
