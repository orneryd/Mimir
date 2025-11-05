// ============================================================================
// Consolidated Graph Tool Handlers
// Routes operations to GraphManager methods
// ============================================================================

import type { IGraphManager } from "../managers/index.js";
import type { NodeType, EdgeType, ClearType } from "../types/index.js";

// ============================================================================
// memory_node handler - All node operations
// ============================================================================
export async function handleMemoryNode(args: any, graphManager: IGraphManager) {
  const { operation } = args;

  switch (operation) {
    case 'add': {
      const { type, properties } = args as { type?: NodeType; properties: Record<string, any> };
      const node = await graphManager.addNode(type, properties);
      return { success: true, operation: 'add', node };
    }

    case 'get': {
      const { id } = args as { id: string };
      if (!id) {
        return { success: false, error: 'id is required for get operation' };
      }
      const node = await graphManager.getNode(id);
      return { success: true, operation: 'get', node };
    }

    case 'update': {
      const { id, properties } = args as { id: string; properties: Record<string, any> };
      if (!id || !properties) {
        return { success: false, error: 'id and properties are required for update operation' };
      }
      const node = await graphManager.updateNode(id, properties);
      return { success: true, operation: 'update', node };
    }

    case 'delete': {
      const { id } = args as { id: string };
      if (!id) {
        return { success: false, error: 'id is required for delete operation' };
      }
      const deleted = await graphManager.deleteNode(id);
      return { success: true, operation: 'delete', deleted };
    }

    case 'query': {
      const { type, filters } = args as { type?: NodeType; filters?: Record<string, any> };
      const nodes = await graphManager.queryNodes(type, filters);
      return { success: true, operation: 'query', count: nodes.length, nodes };
    }

    case 'search': {
      const { query, options } = args as { query: string; options?: any };
      if (!query) {
        return { success: false, error: 'query is required for search operation' };
      }
      const nodes = await graphManager.searchNodes(query, options);
      return { success: true, operation: 'search', count: nodes.length, nodes };
    }

    default:
      return { 
        success: false, 
        error: `Unknown operation: ${operation}. Valid operations: add, get, update, delete, query, search` 
      };
  }
}

// ============================================================================
// memory_edge handler - All edge operations
// ============================================================================
export async function handleMemoryEdge(args: any, graphManager: IGraphManager) {
  const { operation } = args;

  switch (operation) {
    case 'add': {
      const { source, target, type, properties } = args as {
        source: string;
        target: string;
        type: EdgeType;
        properties?: Record<string, any>;
      };
      if (!source || !target || !type) {
        return { success: false, error: 'source, target, and type are required for add operation' };
      }
      const edge = await graphManager.addEdge(source, target, type, properties);
      return { success: true, operation: 'add', edge };
    }

    case 'delete': {
      const { edge_id } = args as { edge_id: string };
      if (!edge_id) {
        return { success: false, error: 'edge_id is required for delete operation' };
      }
      const deleted = await graphManager.deleteEdge(edge_id);
      return { success: true, operation: 'delete', deleted };
    }

    case 'get': {
      const { node_id, direction } = args as { node_id: string; direction?: 'in' | 'out' | 'both' };
      if (!node_id) {
        return { success: false, error: 'node_id is required for get operation' };
      }
      const edges = await graphManager.getEdges(node_id, direction);
      return { success: true, operation: 'get', count: edges.length, edges };
    }

    case 'neighbors': {
      const { node_id, edge_type, depth } = args as { node_id: string; edge_type?: EdgeType; depth?: number };
      if (!node_id) {
        return { success: false, error: 'node_id is required for neighbors operation' };
      }
      const neighbors = await graphManager.getNeighbors(node_id, edge_type, depth);
      return { success: true, operation: 'neighbors', count: neighbors.length, neighbors };
    }

    case 'subgraph': {
      const { node_id, depth } = args as { node_id: string; depth?: number };
      if (!node_id) {
        return { success: false, error: 'node_id is required for subgraph operation' };
      }
      const subgraph = await graphManager.getSubgraph(node_id, depth);
      return { success: true, operation: 'subgraph', subgraph };
    }

    default:
      return { 
        success: false, 
        error: `Unknown operation: ${operation}. Valid operations: add, delete, get, neighbors, subgraph` 
      };
  }
}

// ============================================================================
// memory_batch handler - Bulk operations
// ============================================================================
export async function handleMemoryBatch(args: any, graphManager: IGraphManager) {
  const { operation } = args;

  switch (operation) {
    case 'add_nodes': {
      const { nodes } = args as { nodes: Array<{ type: NodeType; properties: Record<string, any> }> };
      if (!nodes || !Array.isArray(nodes)) {
        return { success: false, error: 'nodes array is required for add_nodes operation' };
      }
      const created = await graphManager.addNodes(nodes);
      return { success: true, operation: 'add_nodes', count: created.length, nodes: created };
    }

    case 'update_nodes': {
      const { updates } = args as { updates: Array<{ id: string; properties: Record<string, any> }> };
      if (!updates || !Array.isArray(updates)) {
        return { success: false, error: 'updates array is required for update_nodes operation' };
      }
      const updated = await graphManager.updateNodes(updates);
      return { success: true, operation: 'update_nodes', count: updated.length, nodes: updated };
    }

    case 'delete_nodes': {
      const { ids } = args as { ids: string[] };
      if (!ids || !Array.isArray(ids)) {
        return { success: false, error: 'ids array is required for delete_nodes operation' };
      }
      const result = await graphManager.deleteNodes(ids);
      return { success: true, operation: 'delete_nodes', result };
    }

    case 'add_edges': {
      const { edges } = args as { edges: Array<{ source: string; target: string; type: EdgeType; properties?: Record<string, any> }> };
      if (!edges || !Array.isArray(edges)) {
        return { success: false, error: 'edges array is required for add_edges operation' };
      }
      const created = await graphManager.addEdges(edges);
      return { success: true, operation: 'add_edges', count: created.length, edges: created };
    }

    case 'delete_edges': {
      const { ids } = args as { ids: string[] };
      if (!ids || !Array.isArray(ids)) {
        return { success: false, error: 'ids array is required for delete_edges operation' };
      }
      const result = await graphManager.deleteEdges(ids);
      return { success: true, operation: 'delete_edges', result };
    }

    default:
      return { 
        success: false, 
        error: `Unknown operation: ${operation}. Valid operations: add_nodes, update_nodes, delete_nodes, add_edges, delete_edges` 
      };
  }
}

// ============================================================================
// memory_lock handler - Multi-agent locking
// ============================================================================
export async function handleMemoryLock(args: any, graphManager: IGraphManager) {
  const { operation } = args;

  switch (operation) {
    case 'acquire': {
      const { node_id, agent_id, timeout_ms } = args as { node_id: string; agent_id: string; timeout_ms?: number };
      if (!node_id || !agent_id) {
        return { success: false, error: 'node_id and agent_id are required for acquire operation' };
      }
      const locked = await graphManager.lockNode(node_id, agent_id, timeout_ms);
      return { 
        success: true, 
        operation: 'acquire',
        locked,
        message: locked 
          ? `Lock acquired by ${agent_id} on ${node_id}` 
          : `Node ${node_id} is already locked by another agent`
      };
    }

    case 'release': {
      const { node_id, agent_id } = args as { node_id: string; agent_id: string };
      if (!node_id || !agent_id) {
        return { success: false, error: 'node_id and agent_id are required for release operation' };
      }
      const unlocked = await graphManager.unlockNode(node_id, agent_id);
      return { 
        success: true, 
        operation: 'release',
        unlocked,
        message: unlocked 
          ? `Lock released by ${agent_id} on ${node_id}` 
          : `Node ${node_id} was not locked by ${agent_id}`
      };
    }

    case 'query_available': {
      const { type, filters } = args as { 
        type?: NodeType; 
        filters?: Record<string, any>; 
      };
      const nodes = await graphManager.queryNodesWithLockStatus(type, filters, true);
      return { 
        success: true, 
        operation: 'query_available',
        count: nodes.length, 
        nodes 
      };
    }

    case 'cleanup': {
      const cleaned = await graphManager.cleanupExpiredLocks();
      return { 
        success: true, 
        operation: 'cleanup',
        cleaned,
        message: `Cleaned up ${cleaned} expired lock(s)`
      };
    }

    default:
      return { 
        success: false, 
        error: `Unknown operation: ${operation}. Valid operations: acquire, release, query_available, cleanup` 
      };
  }
}

// ============================================================================
// memory_clear handler - Dangerous operation
// ============================================================================
export async function handleMemoryClear(args: any, graphManager: IGraphManager) {
  const { type } = args as { type?: ClearType };
  
  if (!type) {
    return { 
      success: false, 
      error: "type is required. Use type='ALL' to clear entire graph or specify a node type." 
    };
  }

  const result = await graphManager.clear(type);
  return { 
    success: true,
    ...result,
    message: type === 'ALL'
      ? `Cleared ALL data: ${result.deletedNodes} nodes, ${result.deletedEdges} edges`
      : `Cleared ${result.deletedNodes} nodes of type '${type}' and ${result.deletedEdges} edges`
  };
}
