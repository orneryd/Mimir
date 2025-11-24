/**
 * @module types/graph.types
 * @description Core type definitions for the unified graph model
 * 
 * Mimir uses a unified graph model where everything is a Node with a type.
 * This simplifies the data model and enables powerful graph traversal queries.
 * All nodes share the same base structure but have different types and properties.
 * 
 * @example
 * ```typescript
 * // All these are nodes with different types
 * const memory: Node = {
 *   id: 'memory-1',
 *   type: 'memory',
 *   properties: { title: 'Decision', content: '...' },
 *   created: '2024-01-01T00:00:00Z',
 *   updated: '2024-01-01T00:00:00Z'
 * };
 * 
 * const todo: Node = {
 *   id: 'todo-1',
 *   type: 'todo',
 *   properties: { title: 'Task', status: 'pending' },
 *   created: '2024-01-01T00:00:00Z',
 *   updated: '2024-01-01T00:00:00Z'
 * };
 * ```
 */

/**
 * Node types in the unified graph model
 * 
 * @description All entities in Mimir are represented as nodes with one of these types.
 * Each type has its own expected properties but all share the same base Node structure.
 * 
 * Common node types:
 * - **todo**: Tasks and action items with status tracking
 * - **memory**: Knowledge entries for agent recall
 * - **file**: Source code files with content
 * - **todoList**: Collections of related todos
 * - **concept**: Abstract ideas and concepts
 * - **project**: High-level project containers
 * 
 * @example
 * ```typescript
 * // Create different node types
 * const memory = await graphManager.addNode('memory', {
 *   title: 'Architecture Decision',
 *   content: 'We chose microservices...'
 * });
 * 
 * const todo = await graphManager.addNode('todo', {
 *   title: 'Implement auth',
 *   status: 'pending',
 *   priority: 'high'
 * });
 * ```
 */
export type NodeType = 
  | 'todo'              // Tasks, action items (replaces TodoManager)
  | 'todoList'          // Collection/list of todos (can only contain relationships to todo nodes)
  | 'memory'            // Memory/knowledge entries for agent recall
  | 'file'              // Source files
  | 'function'          // Functions, methods
  | 'class'             // Classes, interfaces
  | 'module'            // Modules, packages
  | 'concept'           // Abstract concepts, ideas
  | 'person'            // People, users, agents
  | 'project'           // Projects, initiatives
  | 'preamble'          // Agent preambles (worker/QC role definitions)
  | 'chain_execution'   // Agent chain execution tracking
  | 'agent_step'        // Individual agent step within chain
  | 'failure_pattern'   // Failed execution patterns for learning
  | 'custom';           // User-defined types

// Special type for clear() function - includes all node types plus "ALL"
export type ClearType = NodeType | "ALL";

/**
 * Edge types for relationships between nodes
 * 
 * @description Defines the semantic meaning of relationships in the graph.
 * Edges connect nodes and represent how they relate to each other.
 * 
 * Common edge types:
 * - **depends_on**: A requires B to be completed first
 * - **contains**: Parent-child containment (file contains function)
 * - **relates_to**: Generic semantic relationship
 * - **references**: One node references another
 * 
 * @example
 * ```typescript
 * // Create relationships between nodes
 * await graphManager.addEdge('todo-1', 'todo-2', 'depends_on');
 * await graphManager.addEdge('file-1', 'function-1', 'contains');
 * await graphManager.addEdge('memory-1', 'concept-1', 'relates_to');
 * ```
 */
export type EdgeType =
  | 'contains'     // File contains function, class contains method
  | 'depends_on'   // A depends on B
  | 'relates_to'   // Generic relationship
  | 'implements'   // Class implements interface
  | 'calls'        // Function calls function
  | 'imports'      // File imports module
  | 'assigned_to'  // Task assigned to person
  | 'parent_of'    // Hierarchical parent-child
  | 'blocks'       // Task A blocks task B
  | 'references'   // Generic reference
  | 'belongs_to'   // Step belongs to execution
  | 'follows'      // Step follows previous step
  | 'occurred_in'; // Failure occurred in execution

/**
 * Unified Node structure
 * 
 * @description Base structure for all nodes in the graph. Every entity
 * (todo, memory, file, etc.) uses this same structure with different types
 * and properties. This unified model enables powerful graph queries.
 * 
 * @property id - Unique identifier (e.g., 'todo-123', 'memory-456')
 * @property type - Node type determining its semantic meaning
 * @property properties - Flexible key-value properties specific to the type
 * @property created - ISO 8601 timestamp of creation
 * @property updated - ISO 8601 timestamp of last update
 * 
 * @example
 * ```typescript
 * const node: Node = {
 *   id: 'memory-1',
 *   type: 'memory',
 *   properties: {
 *     title: 'Important Decision',
 *     content: 'We decided to use PostgreSQL',
 *     tags: ['database', 'architecture']
 *   },
 *   created: '2024-01-01T00:00:00Z',
 *   updated: '2024-01-01T00:00:00Z'
 * };
 * ```
 */
export interface Node {
  id: string;
  type: NodeType;
  properties: Record<string, any>;  // Flexible properties
  created: string;   // ISO timestamp
  updated: string;   // ISO timestamp
}

/**
 * Edge structure
 * 
 * @description Represents a directed relationship between two nodes.
 * Edges have a type that defines the semantic meaning of the relationship.
 * 
 * @property id - Unique edge identifier
 * @property source - ID of the source node
 * @property target - ID of the target node
 * @property type - Semantic type of the relationship
 * @property properties - Optional additional properties
 * @property created - ISO 8601 timestamp of creation
 * 
 * @example
 * ```typescript
 * const edge: Edge = {
 *   id: 'edge-1',
 *   source: 'todo-1',
 *   target: 'todo-2',
 *   type: 'depends_on',
 *   properties: { weight: 1.0 },
 *   created: '2024-01-01T00:00:00Z'
 * };
 * ```
 */
export interface Edge {
  id: string;
  source: string;     // Source node ID
  target: string;     // Target node ID
  type: EdgeType;
  properties?: Record<string, any>;
  created: string;
}

/**
 * Search options for queries
 * 
 * @description Configuration options for search and query operations.
 * Supports pagination, filtering, sorting, and hybrid search parameters.
 * 
 * @property limit - Maximum number of results (default: 10)
 * @property offset - Number of results to skip for pagination
 * @property types - Filter by node types
 * @property sortBy - Property name to sort by
 * @property sortOrder - Sort direction: 'asc' or 'desc'
 * @property minSimilarity - Minimum cosine similarity for vector search (0-1)
 * @property rrfK - Reciprocal Rank Fusion constant (default: 60)
 * @property rrfVectorWeight - Weight for vector search in hybrid mode
 * @property rrfBm25Weight - Weight for BM25 keyword search in hybrid mode
 * @property rrfMinScore - Minimum RRF score threshold
 * 
 * @example
 * ```typescript
 * const options: SearchOptions = {
 *   limit: 20,
 *   types: ['memory', 'todo'],
 *   minSimilarity: 0.8,
 *   sortBy: 'created',
 *   sortOrder: 'desc'
 * };
 * 
 * const results = await graphManager.searchNodes('auth', options);
 * ```
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  types?: NodeType[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  minSimilarity?: number;  
  rrfK?: number;              // RRF constant k (default: 60, higher = less emphasis on top ranks)
  rrfVectorWeight?: number;   // Weight for vector search ranking (default: 1.0)
  rrfBm25Weight?: number;     // Weight for BM25 keyword ranking (default: 1.0)
  rrfMinScore?: number;       // Minimum RRF score to include result (default: 0.01)
}

/**
 * Batch delete result with partial failure handling
 */
export interface BatchDeleteResult {
  deleted: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}

/**
 * Graph statistics
 */
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  types: Record<string, number>;
}

/**
 * Subgraph result
 */
export interface Subgraph {
  nodes: Node[];
  edges: Edge[];
}

// ============================================================================
// Backward Compatibility Helpers (Optional)
// ============================================================================

/**
 * Helper: Convert old TODO to unified node properties
 */
export function todoToNodeProperties(todo: {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  [key: string]: any;
}): Record<string, any> {
  return {
    description: todo.description || '',
    status: todo.status || 'pending',
    priority: todo.priority || 'medium',
    ...todo
  };
}

/**
 * Helper: Convert node to TODO-like structure (for compatibility)
 */
export function nodeToTodo(node: Node): any {
  if (node.type !== 'todo') {
    throw new Error(`Node ${node.id} is not a TODO (type: ${node.type})`);
  }
  return {
    id: node.id,
    ...node.properties,
    created: node.created,
    updated: node.updated
  };
}
