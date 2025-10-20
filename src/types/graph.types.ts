// ============================================================================
// Unified Graph Types - Simple and Clean
// Everything is a Node (including TODOs)
// ============================================================================

/**
 * Node types in the unified graph
 * 'todo' replaces the old separate TodoManager
 */
export type NodeType = 
  | 'todo'              // Tasks, action items (replaces TodoManager)
  | 'file'              // Source files
  | 'function'          // Functions, methods
  | 'class'             // Classes, interfaces
  | 'module'            // Modules, packages
  | 'concept'           // Abstract concepts, ideas
  | 'person'            // People, users, agents
  | 'project'           // Projects, initiatives
  | 'chain_execution'   // Agent chain execution tracking
  | 'agent_step'        // Individual agent step within chain
  | 'failure_pattern'   // Failed execution patterns for learning
  | 'custom';           // User-defined types

// Special type for clear() function - includes all node types plus "ALL"
export type ClearType = NodeType | "ALL";

/**
 * Edge types for relationships between nodes
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
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  types?: NodeType[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
