// ============================================================================
// IGraphManager Interface - Unified Graph Operations
// ============================================================================

import type {
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

/**
 * Unified Graph Manager Interface
 * Supports both single and batch operations
 */
export interface IGraphManager {
  // ============================================================================
  // SINGLE OPERATIONS (Primary - Simple, Common Case)
  // ============================================================================
  
  /**
   * Add a single node to the graph
   * @param type - Node type (defaults to 'memory' if not specified)
   * @param properties - Node properties
   */
  addNode(type?: NodeType, properties?: Record<string, any>): Promise<Node>;
  
  /**
   * Get a node by ID
   * Returns full node content including any large text fields.
   * This is a single-node operation so all content is included.
   */
  getNode(id: string): Promise<Node | null>;
  
  /**
   * Update a node's properties (merge with existing)
   */
  updateNode(id: string, properties: Partial<Record<string, any>>): Promise<Node>;
  
  /**
   * Delete a single node
   */
  deleteNode(id: string): Promise<boolean>;
  
  /**
   * Add a single edge between two nodes
   */
  addEdge(
    source: string,
    target: string,
    type: EdgeType,
    properties?: Record<string, any>
  ): Promise<Edge>;
  
  /**
   * Delete a single edge
   */
  deleteEdge(edgeId: string): Promise<boolean>;
  
  // ============================================================================
  // BATCH OPERATIONS (Performance - Bulk Imports)
  // ============================================================================
  
  /**
   * Add multiple nodes in a single transaction
   * Returns created nodes in same order as input
   */
  addNodes(nodes: Array<{
    type: NodeType;
    properties: Record<string, any>;
  }>): Promise<Node[]>;
  
  /**
   * Update multiple nodes in a single transaction
   * Returns updated nodes in same order as input
   */
  updateNodes(updates: Array<{
    id: string;
    properties: Partial<Record<string, any>>;
  }>): Promise<Node[]>;
  
  /**
   * Delete multiple nodes in a single transaction
   * Returns count of deleted nodes and any errors
   */
  deleteNodes(ids: string[]): Promise<BatchDeleteResult>;
  
  /**
   * Add multiple edges in a single transaction
   * Returns created edges in same order as input
   */
  addEdges(edges: Array<{
    source: string;
    target: string;
    type: EdgeType;
    properties?: Record<string, any>;
  }>): Promise<Edge[]>;
  
  /**
   * Delete multiple edges in a single transaction
   * Returns count of deleted edges and any errors
   */
  deleteEdges(edgeIds: string[]): Promise<BatchDeleteResult>;
  
  // ============================================================================
  // SEARCH & QUERY (Always Return Multiple)
  // ============================================================================
  
  /**
   * Query nodes by type and/or properties
   * Note: Large content fields (>10KB) are stripped to prevent massive responses.
   * Use getNode() for individual nodes to retrieve full content.
   */
  queryNodes(
    type?: NodeType,
    filters?: Record<string, any>
  ): Promise<Node[]>;
  
  /**
   * Full-text search across node properties
   * Note: Large content fields (>10KB) are stripped, but relevant line numbers
   * and snippets matching the search query are included.
   * Use getNode() for individual nodes to retrieve full content.
   */
  searchNodes(
    query: string,
    options?: SearchOptions
  ): Promise<Node[]>;
  
  /**
   * Get all edges connected to a node
   */
  getEdges(
    nodeId: string,
    direction?: 'in' | 'out' | 'both'
  ): Promise<Edge[]>;
  
  // ============================================================================
  // GRAPH OPERATIONS
  // ============================================================================
  
  /**
   * Get neighboring nodes
   */
  getNeighbors(
    nodeId: string,
    edgeType?: EdgeType,
    depth?: number
  ): Promise<Node[]>;
  
  /**
   * Get a subgraph starting from a node
   */
  getSubgraph(
    nodeId: string,
    depth?: number
  ): Promise<Subgraph>;
  
  // ============================================================================
  // UTILITY
  // ============================================================================
  
  /**
   * Get graph statistics
   */
  getStats(): Promise<GraphStats>;
  
  /**
   * Clear all data or specific node type from the graph
   * @param type - Node type to clear, or "ALL" to clear entire graph (use with caution!)
   * @returns Object with counts of deleted nodes and edges
   */
  clear(type?: ClearType): Promise<{ deletedNodes: number; deletedEdges: number }>;
  
  /**
   * Close connections (cleanup)
   */
  close?(): Promise<void>;
  
  /**
   * Get the Neo4j driver instance (for direct access when needed)
   */
  getDriver(): any;

  // ============================================================================
  // MULTI-AGENT LOCKING
  // ============================================================================

  /**
   * Acquire exclusive lock on a node for multi-agent coordination
   * @param nodeId - Node ID to lock
   * @param agentId - Agent claiming the lock
   * @param timeoutMs - Lock expiry in milliseconds (default 300000 = 5 min)
   * @returns true if lock acquired, false if already locked by another agent
   */
  lockNode(nodeId: string, agentId: string, timeoutMs?: number): Promise<boolean>;

  /**
   * Release lock on a node
   * @param nodeId - Node ID to unlock
   * @param agentId - Agent releasing the lock (must match lock owner)
   * @returns true if lock released, false if not locked or locked by different agent
   */
  unlockNode(nodeId: string, agentId: string): Promise<boolean>;

  /**
   * Query nodes filtered by lock status
   * @param type - Optional node type filter
   * @param filters - Additional property filters
   * @param includeAvailableOnly - If true, only return unlocked or expired-lock nodes
   * @returns Array of nodes
   */
  queryNodesWithLockStatus(
    type?: NodeType,
    filters?: Record<string, any>,
    includeAvailableOnly?: boolean
  ): Promise<Node[]>;

  /**
   * Clean up expired locks across all nodes
   * @returns Number of locks cleaned up
   */
  cleanupExpiredLocks(): Promise<number>;
}
