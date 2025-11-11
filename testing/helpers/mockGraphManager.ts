// ============================================================================
// Mock GraphManager for Unit Tests
// Provides in-memory implementation to avoid real database calls
// ============================================================================

import type {
  IGraphManager,
  Node,
  Edge,
  NodeType,
  EdgeType,
  SearchOptions,
  BatchDeleteResult,
  GraphStats,
  Subgraph,
  ClearType
} from '../../src/types/index.js';

/**
 * In-memory mock implementation of GraphManager for unit tests
 * Avoids real Neo4j database calls while maintaining interface compatibility
 */
export class MockGraphManager implements IGraphManager {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();
  private nodeCounter = 0;
  private edgeCounter = 0;
  private locks: Map<string, { agentId: string; expiresAt: number }> = new Map();

  async initialize(): Promise<void> {
    // No-op for mock
  }

  async close(): Promise<void> {
    this.nodes.clear();
    this.edges.clear();
    this.locks.clear();
  }

  // ============================================================================
  // Node Operations
  // ============================================================================

  async addNode(type: NodeType, properties: Record<string, any>): Promise<Node> {
    const id = `${type}-${++this.nodeCounter}-${Date.now()}`;
    const now = new Date().toISOString();
    
    const node: Node = {
      id,
      type,
      created: now,
      updated: now,
      properties: { ...properties }
    };
    
    this.nodes.set(id, node);
    return node;
  }

  async getNode(id: string): Promise<Node | null> {
    return this.nodes.get(id) || null;
  }

  async updateNode(id: string, properties: Record<string, any>): Promise<Node> {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Node not found: ${id}`);
    }
    
    node.properties = { ...node.properties, ...properties };
    node.updated = new Date().toISOString();
    
    this.nodes.set(id, node);
    return node;
  }

  async deleteNode(id: string): Promise<boolean> {
    // Delete associated edges
    const edgesToDelete = Array.from(this.edges.values()).filter(
      e => e.source === id || e.target === id
    );
    edgesToDelete.forEach(e => this.edges.delete(e.id));
    
    return this.nodes.delete(id);
  }

  async queryNodes(type?: NodeType, filters?: Record<string, any>): Promise<Node[]> {
    let results = Array.from(this.nodes.values());
    
    if (type) {
      results = results.filter(n => n.type === type);
    }
    
    if (filters) {
      results = results.filter(node => {
        return Object.entries(filters).every(([key, value]) => {
          return node.properties[key] === value;
        });
      });
    }
    
    return results;
  }

  async searchNodes(query: string, options?: SearchOptions): Promise<Node[]> {
    const lowerQuery = query.toLowerCase();
    let results = Array.from(this.nodes.values());
    
    // Filter by types if specified
    if (options?.types && options.types.length > 0) {
      results = results.filter(n => options.types!.includes(n.type));
    }
    
    // Simple text search across all properties
    results = results.filter(node => {
      const searchText = JSON.stringify(node.properties).toLowerCase();
      return searchText.includes(lowerQuery);
    });
    
    // Apply limit and offset
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    
    return results.slice(offset, offset + limit);
  }

  // ============================================================================
  // Edge Operations
  // ============================================================================

  async addEdge(
    source: string,
    target: string,
    type: EdgeType,
    properties?: Record<string, any>
  ): Promise<Edge> {
    const id = `edge-${++this.edgeCounter}-${Date.now()}`;
    const now = new Date().toISOString();
    
    const edge: Edge = {
      id,
      source,
      target,
      type,
      created: now,
      properties: properties || {}
    };
    
    this.edges.set(id, edge);
    return edge;
  }

  async getEdges(nodeId: string, direction: 'in' | 'out' | 'both' = 'both'): Promise<Edge[]> {
    const results = Array.from(this.edges.values());
    
    switch (direction) {
      case 'in':
        return results.filter(e => e.target === nodeId);
      case 'out':
        return results.filter(e => e.source === nodeId);
      case 'both':
        return results.filter(e => e.source === nodeId || e.target === nodeId);
      default:
        return [];
    }
  }

  async deleteEdge(edgeId: string): Promise<boolean> {
    return this.edges.delete(edgeId);
  }

  async getNeighbors(
    nodeId: string,
    edgeType?: EdgeType,
    depth: number = 1
  ): Promise<Node[]> {
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [{ id: nodeId, currentDepth: 0 }];
    const neighbors: Node[] = [];
    
    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      
      if (visited.has(id) || currentDepth >= depth) continue;
      visited.add(id);
      
      const edges = await this.getEdges(id, 'both');
      const filteredEdges = edgeType ? edges.filter(e => e.type === edgeType) : edges;
      
      for (const edge of filteredEdges) {
        const neighborId = edge.source === id ? edge.target : edge.source;
        if (!visited.has(neighborId)) {
          const node = await this.getNode(neighborId);
          if (node && currentDepth + 1 === depth) {
            neighbors.push(node);
          }
          if (currentDepth + 1 < depth) {
            queue.push({ id: neighborId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }
    
    return neighbors;
  }

  async getSubgraph(nodeId: string, depth: number = 2): Promise<Subgraph> {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [{ id: nodeId, currentDepth: 0 }];
    
    // Add root node
    const rootNode = await this.getNode(nodeId);
    if (rootNode) {
      nodes.push(rootNode);
      visited.add(nodeId);
    }
    
    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      
      if (currentDepth >= depth) continue;
      
      const nodeEdges = await this.getEdges(id, 'both');
      
      for (const edge of nodeEdges) {
        edges.push(edge);
        
        const neighborId = edge.source === id ? edge.target : edge.source;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          const node = await this.getNode(neighborId);
          if (node) {
            nodes.push(node);
            queue.push({ id: neighborId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }
    
    return { nodes, edges };
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  async addNodes(nodes: Array<{ type: NodeType; properties: Record<string, any> }>): Promise<Node[]> {
    const results: Node[] = [];
    for (const node of nodes) {
      results.push(await this.addNode(node.type, node.properties));
    }
    return results;
  }

  async updateNodes(
    updates: Array<{ id: string; properties: Record<string, any> }>
  ): Promise<Node[]> {
    const results: Node[] = [];
    for (const update of updates) {
      results.push(await this.updateNode(update.id, update.properties));
    }
    return results;
  }

  async deleteNodes(ids: string[]): Promise<BatchDeleteResult> {
    let deleted = 0;
    const errors: Array<{ id: string; error: string }> = [];
    
    for (const id of ids) {
      try {
        const success = await this.deleteNode(id);
        if (success) deleted++;
      } catch (error: any) {
        errors.push({ id, error: error.message });
      }
    }
    
    return { deleted, errors };
  }

  async addEdges(
    edges: Array<{ source: string; target: string; type: EdgeType; properties?: Record<string, any> }>
  ): Promise<Edge[]> {
    const results: Edge[] = [];
    for (const edge of edges) {
      results.push(await this.addEdge(edge.source, edge.target, edge.type, edge.properties));
    }
    return results;
  }

  async deleteEdges(ids: string[]): Promise<BatchDeleteResult> {
    let deleted = 0;
    const errors: Array<{ id: string; error: string }> = [];
    
    for (const id of ids) {
      try {
        const success = await this.deleteEdge(id);
        if (success) deleted++;
      } catch (error: any) {
        errors.push({ id, error: error.message });
      }
    }
    
    return { deleted, errors };
  }

  // ============================================================================
  // Locking Operations
  // ============================================================================

  async lockNode(nodeId: string, agentId: string, timeoutMs: number = 300000): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(nodeId);

    // If there's an existing lock that hasn't expired and is held by a different agent, deny
    if (existing && existing.expiresAt > now && existing.agentId !== agentId) {
      return false;
    }

    const expiresAt = now + timeoutMs;

    // Acquire or refresh lock
    this.locks.set(nodeId, {
      agentId,
      expiresAt
    });

    // Also reflect lock on the node properties so tests can inspect it
    const node = this.nodes.get(nodeId);
    if (node) {
      // Ensure properties object exists
      node.properties = node.properties || {};
      node.properties.lockedBy = agentId;
      node.properties.lockedAt = new Date(now).toISOString();
      node.properties.lockExpiresAt = new Date(expiresAt).toISOString();

      // Increment version (initialize if missing)
      const currentVersion = node.properties.version;
      if (typeof currentVersion === 'number') {
        node.properties.version = currentVersion + 1;
      } else if (typeof currentVersion === 'object' && currentVersion !== null && 'low' in currentVersion) {
        // If tests emulate neo4j Integer shape, convert to number and increment
        node.properties.version = currentVersion.low + 1;
      } else {
        node.properties.version = 1;
      }

      node.updated = new Date().toISOString();
      this.nodes.set(nodeId, node);
    }

    return true;
  }

  async unlockNode(nodeId: string, agentId: string): Promise<boolean> {
    const lock = this.locks.get(nodeId);
    if (lock && lock.agentId === agentId) {
      this.locks.delete(nodeId);

      // Remove lock properties from node if present
      const node = this.nodes.get(nodeId);
      if (node && node.properties) {
        delete node.properties.lockedBy;
        delete node.properties.lockedAt;
        delete node.properties.lockExpiresAt;
        node.updated = new Date().toISOString();
        this.nodes.set(nodeId, node);
      }

      return true;
    }
    return false;
  }

  async queryAvailableNodes(
    type?: NodeType,
    filters?: Record<string, any>
  ): Promise<Node[]> {
    const now = Date.now();
    const nodes = await this.queryNodes(type, filters);
    
    // Filter out locked nodes
    return nodes.filter(node => {
      const lock = this.locks.get(node.id);
      return !lock || lock.expiresAt <= now;
    });
  }

  async cleanupExpiredLocks(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [nodeId, lock] of Array.from(this.locks.entries())) {
      if (lock.expiresAt <= now) {
        this.locks.delete(nodeId);
        cleaned++;

        // Remove lock properties from the node as well
        const node = this.nodes.get(nodeId);
        if (node && node.properties) {
          delete node.properties.lockedBy;
          delete node.properties.lockedAt;
          delete node.properties.lockExpiresAt;
          node.updated = new Date().toISOString();
          this.nodes.set(nodeId, node);
        }
      }
    }

    return cleaned;
  }

  // ============================================================================
  // Utility Operations
  // ============================================================================

  async clear(type: ClearType = 'ALL'): Promise<{ deletedNodes: number; deletedEdges: number }> {
    if (type === 'ALL') {
      const deletedNodes = this.nodes.size;
      const deletedEdges = this.edges.size;
      
      this.nodes.clear();
      this.edges.clear();
      this.locks.clear();
      
      return { deletedNodes, deletedEdges };
    } else {
      const nodesToDelete = Array.from(this.nodes.values())
        .filter(n => n.type === type)
        .map(n => n.id);
      
      const result = await this.deleteNodes(nodesToDelete);
      return { deletedNodes: result.deleted, deletedEdges: 0 };
    }
  }

  async getStats(): Promise<GraphStats> {
    const types: Record<string, number> = {};
    
    for (const node of this.nodes.values()) {
      types[node.type] = (types[node.type] || 0) + 1;
    }
    
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      types
    };
  }

  // ============================================================================
  // Vector Search (Stub - returns empty for mock)
  // ============================================================================

  async vectorSearchNodes(
    query: string,
    limit: number = 5,
    minSimilarity: number = 0.5,
    types?: NodeType[]
  ): Promise<Array<Node & { similarity: number }>> {
    // Mock implementation: just do text search and add fake similarity
    const results = await this.searchNodes(query, { limit, types });
    return results.map(node => ({ ...node, similarity: 0.8 }));
  }

  // ============================================================================
  // Required Interface Methods
  // ============================================================================

  getDriver(): any {
    // Return mock driver for testing
    return null;
  }

  async queryNodesWithLockStatus(
    type?: NodeType,
    filters?: Record<string, any>,
    includeAvailableOnly?: boolean
  ): Promise<Node[]> {
    const nodes = await this.queryNodes(type, filters);
    
    if (!includeAvailableOnly) {
      return nodes;
    }
    
    // Filter to only unlocked nodes
    return await this.queryAvailableNodes(type, filters);
  }
}

/**
 * Factory function to create a mock GraphManager for tests
 */
export function createMockGraphManager(): MockGraphManager {
  return new MockGraphManager();
}
