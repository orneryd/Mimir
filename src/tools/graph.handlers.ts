// ============================================================================
// Consolidated Graph Tool Handlers
// Routes operations to GraphManager methods
// ============================================================================

import type { IGraphManager } from "../managers/index.js";
import type { NodeType, EdgeType, ClearType } from "../types/index.js";
import { flattenForMCP } from "./mcp/flattenForMCP.js";
import { 
  generateConfirmationToken, 
  validateConfirmationToken, 
  consumeConfirmationToken 
} from "./confirmation.utils.js";

/**
 * Check if an error is a Neo4j nested map property error
 */
function isNestedMapError(error: any): boolean {
  const message = error?.message || String(error);
  return message.includes('Property values can only be of primitive types or arrays thereof') ||
         message.includes('Encountered: Map{');
}

// ============================================================================
// memory_node handler - All node operations
// ============================================================================
export async function handleMemoryNode(args: any, graphManager: IGraphManager) {
  const { operation } = args;

  switch (operation) {
    case 'add': {
      const { type, properties } = args as { type?: NodeType; properties: Record<string, any> };
      
      try {
        const node = await graphManager.addNode(type, properties);
        return { success: true, operation: 'add', node };
      } catch (error: any) {
        // Auto-retry with flattened properties if nested map error detected
        if (isNestedMapError(error) && properties) {
          console.warn('⚠️  Nested map detected in add operation, auto-flattening and retrying...');
          const flattenedProperties = flattenForMCP(properties);
          const node = await graphManager.addNode(type, flattenedProperties);
          return { 
            success: true, 
            operation: 'add', 
            node,
            warning: 'Properties were automatically flattened due to nested structure. Consider flattening client-side for better performance.'
          };
        }
        throw error;
      }
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
      
      try {
        const node = await graphManager.updateNode(id, properties);
        return { success: true, operation: 'update', node };
      } catch (error: any) {
        // Auto-retry with flattened properties if nested map error detected
        if (isNestedMapError(error)) {
          console.warn('⚠️  Nested map detected in update operation, auto-flattening and retrying...');
          const flattenedProperties = flattenForMCP(properties);
          const node = await graphManager.updateNode(id, flattenedProperties);
          return { 
            success: true, 
            operation: 'update', 
            node,
            warning: 'Properties were automatically flattened due to nested structure. Consider flattening client-side for better performance.'
          };
        }
        throw error;
      }
    }

    case 'delete': {
      const { id, confirm, confirmationId } = args as { 
        id: string; 
        confirm?: boolean; 
        confirmationId?: string;
      };
      if (!id) {
        return { success: false, error: 'id is required for delete operation' };
      }
      
      // CONFIRMATION FLOW for delete
      if (!confirm || !confirmationId) {
        // Get node details for preview
        const node = await graphManager.getNode(id);
        if (!node) {
          return { success: false, error: `Node not found: ${id}` };
        }
        
        // Count edges that will be deleted
        const edges = await graphManager.getEdges(id, 'both');
        
        const newConfirmationId = generateConfirmationToken('memory_node_delete', { id });
        
        return {
          success: true,
          needsConfirmation: true,
          confirmationId: newConfirmationId,
          preview: {
            node: { id: node.id, type: node.type },
            cascadeDeletedEdges: edges.length
          },
          message: `⚠️  This will delete node '${id}' (type: ${node.type}) and ${edges.length} connected edge(s). Call memory_node with operation='delete', id='${id}', confirm=true, and confirmationId="${newConfirmationId}" to proceed.`,
          expiresIn: '5 minutes'
        };
      }
      
      // Validate and execute
      const isValid = validateConfirmationToken(confirmationId, 'memory_node_delete', { id });
      if (!isValid) {
        return {
          success: false,
          error: 'Invalid or expired confirmation token. Please request a new preview.'
        };
      }
      
      consumeConfirmationToken(confirmationId);
      const deleted = await graphManager.deleteNode(id);
      return { success: true, operation: 'delete', confirmed: true, deleted };
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
      
      try {
        const edge = await graphManager.addEdge(source, target, type, properties);
        return { success: true, operation: 'add', edge };
      } catch (error: any) {
        // Auto-retry with flattened properties if nested map error detected
        if (isNestedMapError(error) && properties) {
          console.warn('⚠️  Nested map detected in edge properties, auto-flattening and retrying...');
          const flattenedProperties = flattenForMCP(properties);
          const edge = await graphManager.addEdge(source, target, type, flattenedProperties);
          return { 
            success: true, 
            operation: 'add', 
            edge,
            warning: 'Edge properties were automatically flattened due to nested structure. Consider flattening client-side for better performance.'
          };
        }
        throw error;
      }
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
      
      try {
        const created = await graphManager.addNodes(nodes);
        return { success: true, operation: 'add_nodes', count: created.length, nodes: created };
      } catch (error: any) {
        // Auto-retry with flattened properties if nested map error detected
        if (isNestedMapError(error)) {
          console.warn('⚠️  Nested map detected in batch add_nodes, auto-flattening and retrying...');
          const flattenedNodes = nodes.map(node => ({
            ...node,
            properties: flattenForMCP(node.properties)
          }));
          const created = await graphManager.addNodes(flattenedNodes);
          return { 
            success: true, 
            operation: 'add_nodes', 
            count: created.length, 
            nodes: created,
            warning: 'Node properties were automatically flattened due to nested structure. Consider flattening client-side for better performance.'
          };
        }
        throw error;
      }
    }

    case 'update_nodes': {
      const { updates } = args as { updates: Array<{ id: string; properties: Record<string, any> }> };
      if (!updates || !Array.isArray(updates)) {
        return { success: false, error: 'updates array is required for update_nodes operation' };
      }
      
      try {
        const updated = await graphManager.updateNodes(updates);
        return { success: true, operation: 'update_nodes', count: updated.length, nodes: updated };
      } catch (error: any) {
        // Auto-retry with flattened properties if nested map error detected
        if (isNestedMapError(error)) {
          console.warn('⚠️  Nested map detected in batch update_nodes, auto-flattening and retrying...');
          const flattenedUpdates = updates.map(update => ({
            ...update,
            properties: flattenForMCP(update.properties)
          }));
          const updated = await graphManager.updateNodes(flattenedUpdates);
          return { 
            success: true, 
            operation: 'update_nodes', 
            count: updated.length, 
            nodes: updated,
            warning: 'Node properties were automatically flattened due to nested structure. Consider flattening client-side for better performance.'
          };
        }
        throw error;
      }
    }

    case 'delete_nodes': {
      const { ids, confirm, confirmationId } = args as { 
        ids: string[]; 
        confirm?: boolean; 
        confirmationId?: string;
      };
      if (!ids || !Array.isArray(ids)) {
        return { success: false, error: 'ids array is required for delete_nodes operation' };
      }
      
      // CONFIRMATION FLOW for batch delete
      if (!confirm || !confirmationId) {
        const newConfirmationId = generateConfirmationToken('memory_batch_delete_nodes', { ids });
        
        return {
          success: true,
          needsConfirmation: true,
          confirmationId: newConfirmationId,
          preview: {
            nodeCount: ids.length,
            nodeIds: ids.slice(0, 10), // Show first 10
            more: ids.length > 10 ? ids.length - 10 : 0
          },
          message: `⚠️  This will delete ${ids.length} node(s) and their connected edges. Call memory_batch with operation='delete_nodes', ids=[...], confirm=true, and confirmationId="${newConfirmationId}" to proceed.`,
          expiresIn: '5 minutes'
        };
      }
      
      // Validate and execute
      const isValid = validateConfirmationToken(confirmationId, 'memory_batch_delete_nodes', { ids });
      if (!isValid) {
        return {
          success: false,
          error: 'Invalid or expired confirmation token. Please request a new preview.'
        };
      }
      
      consumeConfirmationToken(confirmationId);
      const result = await graphManager.deleteNodes(ids);
      return { success: true, operation: 'delete_nodes', confirmed: true, result };
    }

    case 'add_edges': {
      const { edges } = args as { edges: Array<{ source: string; target: string; type: EdgeType; properties?: Record<string, any> }> };
      if (!edges || !Array.isArray(edges)) {
        return { success: false, error: 'edges array is required for add_edges operation' };
      }
      
      try {
        const created = await graphManager.addEdges(edges);
        return { success: true, operation: 'add_edges', count: created.length, edges: created };
      } catch (error: any) {
        // Auto-retry with flattened properties if nested map error detected
        if (isNestedMapError(error)) {
          console.warn('⚠️  Nested map detected in batch add_edges, auto-flattening and retrying...');
          const flattenedEdges = edges.map(edge => ({
            ...edge,
            properties: edge.properties ? flattenForMCP(edge.properties) : undefined
          }));
          const created = await graphManager.addEdges(flattenedEdges);
          return { 
            success: true, 
            operation: 'add_edges', 
            count: created.length, 
            edges: created,
            warning: 'Edge properties were automatically flattened due to nested structure. Consider flattening client-side for better performance.'
          };
        }
        throw error;
      }
    }

    case 'delete_edges': {
      const { ids, confirm, confirmationId } = args as { 
        ids: string[]; 
        confirm?: boolean; 
        confirmationId?: string;
      };
      if (!ids || !Array.isArray(ids)) {
        return { success: false, error: 'ids array is required for delete_edges operation' };
      }
      
      // CONFIRMATION FLOW for batch delete edges
      if (!confirm || !confirmationId) {
        const newConfirmationId = generateConfirmationToken('memory_batch_delete_edges', { ids });
        
        return {
          success: true,
          needsConfirmation: true,
          confirmationId: newConfirmationId,
          preview: {
            edgeCount: ids.length,
            edgeIds: ids.slice(0, 10),
            more: ids.length > 10 ? ids.length - 10 : 0
          },
          message: `⚠️  This will delete ${ids.length} edge(s). Call memory_batch with operation='delete_edges', ids=[...], confirm=true, and confirmationId="${newConfirmationId}" to proceed.`,
          expiresIn: '5 minutes'
        };
      }
      
      // Validate and execute
      const isValid = validateConfirmationToken(confirmationId, 'memory_batch_delete_edges', { ids });
      if (!isValid) {
        return {
          success: false,
          error: 'Invalid or expired confirmation token. Please request a new preview.'
        };
      }
      
      consumeConfirmationToken(confirmationId);
      const result = await graphManager.deleteEdges(ids);
      return { success: true, operation: 'delete_edges', confirmed: true, result };
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
// memory_clear handler - Dangerous operation with confirmation flow
// ============================================================================
export async function handleMemoryClear(args: any, graphManager: IGraphManager) {
  const { type, confirm, confirmationId } = args as { 
    type?: ClearType; 
    confirm?: boolean; 
    confirmationId?: string;
  };
  
  if (!type) {
    return { 
      success: false, 
      error: "type is required. Use type='ALL' to clear entire graph or specify a node type." 
    };
  }

  // Safety guard: prevent accidental clearing of the real database during tests.
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || !!(globalThis as any).vitest;
  // If the graphManager appears to be a mock (mock returns null driver), allow; otherwise block 'ALL' clears in test env.
  let isMockManager = false;
  try {
    // Some managers return null for getDriver in mocks
    const driver = (graphManager as any).getDriver && (graphManager as any).getDriver();
    if (driver === null) isMockManager = true;
  } catch (e) {
    // If getDriver throws or is absent, treat as non-mock conservatively
    isMockManager = false;
  }

  if (isTestEnv && type === 'ALL' && !isMockManager) {
    return {
      success: false,
      error: "Refusing to clear the entire database during tests when using a real GraphManager. Use the mock GraphManager in tests or set type to a specific node type."
    };
  }

  // CONFIRMATION FLOW: Step 1 - Generate preview if not confirmed
  if (!confirm || !confirmationId) {
    // Get current stats to show what would be deleted
    const stats = await graphManager.getStats();
    
    let preview: { deletedNodes: number; deletedEdges: number; types?: Record<string, number> };
    
    if (type === 'ALL') {
      preview = {
        deletedNodes: stats.nodeCount,
        deletedEdges: stats.edgeCount,
        types: stats.types
      };
    } else {
      // Count nodes of specific type
      const nodes = await graphManager.queryNodes(type);
      preview = {
        deletedNodes: nodes.length,
        deletedEdges: 0, // Edges will be cascade deleted
        types: { [type]: nodes.length }
      };
    }
    
    // Generate confirmation token
    const newConfirmationId = generateConfirmationToken('memory_clear', { type });
    
    return {
      success: true,
      needsConfirmation: true,
      confirmationId: newConfirmationId,
      preview,
      message: type === 'ALL'
        ? `⚠️  This will delete ALL ${preview.deletedNodes} nodes and ${preview.deletedEdges} edges. Call memory_clear again with confirm=true and confirmationId="${newConfirmationId}" to proceed.`
        : `⚠️  This will delete ${preview.deletedNodes} nodes of type '${type}'. Call memory_clear again with confirm=true and confirmationId="${newConfirmationId}" to proceed.`,
      expiresIn: '5 minutes'
    };
  }

  // CONFIRMATION FLOW: Step 2 - Validate and execute if confirmed
  if (confirm && confirmationId) {
    // Validate confirmation token
    const isValid = validateConfirmationToken(confirmationId, 'memory_clear', { type });
    
    if (!isValid) {
      return {
        success: false,
        error: 'Invalid or expired confirmation token. Please request a new preview by calling memory_clear without confirm=true.'
      };
    }
    
    // Consume the token (one-time use)
    consumeConfirmationToken(confirmationId);
    
    // Execute the clear operation
    const result = await graphManager.clear(type);
    
    return {
      success: true,
      confirmed: true,
      ...result,
      message: type === 'ALL'
        ? `✅ Cleared ALL data: ${result.deletedNodes} nodes, ${result.deletedEdges} edges`
        : `✅ Cleared ${result.deletedNodes} nodes of type '${type}' and ${result.deletedEdges} edges`
    };
  }

  // Should never reach here
  return {
    success: false,
    error: 'Invalid confirmation flow state.'
  };
}
