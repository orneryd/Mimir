/**
 * @module types
 * @description Core TypeScript type definitions for Mimir
 * 
 * This module exports all type definitions used throughout Mimir:
 * 
 * **Graph Types** (`graph.types.ts`):
 * - **Node**: Base structure for all graph nodes (todos, memories, files, etc.)
 * - **Edge**: Directed relationships between nodes
 * - **NodeType**: Union of all valid node types
 * - **EdgeType**: Union of all valid relationship types
 * - **SearchOptions**: Configuration for search queries
 * - **GraphStats**: Database statistics
 * - **Subgraph**: Multi-node graph structure
 * 
 * **Manager Interface** (`IGraphManager.ts`):
 * - **IGraphManager**: Complete interface for graph database operations
 * 
 * **Watch Config Types** (`watchConfig.types.ts`):
 * - **WatchConfig**: File watching configuration
 * - **WatchConfigInput**: Input for creating watch configs
 * - **WatchFolderResponse**: Response from watch operations
 * - **IndexFolderResponse**: Response from indexing operations
 * - **ListWatchedFoldersResponse**: List of watched folders
 * 
 * @example
 * ```typescript
 * import type { Node, Edge, NodeType, SearchOptions } from './types/index.js';
 * 
 * // Create a typed node
 * const memory: Node = {
 *   id: 'memory-1',
 *   type: 'memory',
 *   properties: { title: 'Decision', content: '...' },
 *   created: '2024-01-01T00:00:00Z',
 *   updated: '2024-01-01T00:00:00Z'
 * };
 * 
 * // Use search options
 * const options: SearchOptions = {
 *   limit: 10,
 *   types: ['memory', 'todo'],
 *   minSimilarity: 0.8
 * };
 * ```
 * 
 * @example
 * ```typescript
 * // Work with edges
 * import type { Edge, EdgeType } from './types/index.js';
 * 
 * const edge: Edge = {
 *   id: 'edge-1',
 *   source: 'todo-1',
 *   target: 'project-1',
 *   type: 'part_of',
 *   created: '2024-01-01T00:00:00Z'
 * };
 * ```
 */

// Graph types
export type {
  Node,
  Edge,
  NodeType,
  EdgeType,
  ClearType,
  SearchOptions,
  BatchDeleteResult,
  GraphStats,
  Subgraph
} from './graph.types.js';

export {
  todoToNodeProperties,
  nodeToTodo
} from './graph.types.js';

// Graph manager interface
export type { IGraphManager } from './IGraphManager.js';

// Watch config types
export type {
  WatchConfig,
  WatchConfigInput,
  WatchFolderResponse,
  IndexFolderResponse,
  ListWatchedFoldersResponse
} from './watchConfig.types.js';
