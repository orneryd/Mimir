/**
 * MCP Server Tools for LangChain Agents
 * 
 * Provides access to MCP server at http://localhost:3000/mcp
 * for knowledge graph and TODO management operations.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000/mcp';

/**
 * Call MCP server tool
 */
async function callMCPTool(toolName: string, args: Record<string, any>): Promise<string> {
  try {
    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Explicitly accept JSON (and event-stream for SSE clients)
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      return `MCP server error: ${response.status} ${response.statusText}`;
    }

    const result = await response.json();
    
    if (result.error) {
      return `MCP error: ${result.error.message || JSON.stringify(result.error)}`;
    }

    // Return the content from the tool call result
    if (result.result?.content?.[0]?.text) {
      return result.result.content[0].text;
    }

    return JSON.stringify(result.result, null, 2);
  } catch (error: any) {
    return `Error calling MCP server: ${error.message}`;
  }
}

/**
 * Knowledge Graph Tools
 */

export const graphAddNodeTool = new DynamicStructuredTool({
  name: 'graph_add_node',
  description: 'Add a node to the knowledge graph. Nodes represent entities like projects, phases, tasks, files, concepts.',
  schema: z.object({
    type: z.string().describe('Node type (e.g., "project", "phase", "task", "file", "concept")'),
    properties: z.record(z.string(), z.any()).describe('Node properties as key-value pairs'),
  }),
  func: async ({ type, properties }) => {
    return await callMCPTool('graph_add_node', { type, properties });
  },
});

export const graphGetNodeTool = new DynamicStructuredTool({
  name: 'graph_get_node',
  description: 'Retrieve a node from the knowledge graph by its ID.',
  schema: z.object({
    id: z.string().describe('Node ID to retrieve'),
  }),
  func: async ({ id }) => {
    return await callMCPTool('graph_get_node', { id });
  },
});

export const graphUpdateNodeTool = new DynamicStructuredTool({
  name: 'graph_update_node',
  description: 'Update properties of an existing node in the knowledge graph.',
  schema: z.object({
    id: z.string().describe('Node ID to update'),
    properties: z.record(z.string(), z.any()).describe('Properties to update (will be merged with existing)'),
  }),
  func: async ({ id, properties }) => {
    return await callMCPTool('graph_update_node', { id, properties });
  },
});

export const graphAddEdgeTool = new DynamicStructuredTool({
  name: 'graph_add_edge',
  description: 'Add a relationship edge between two nodes in the knowledge graph.',
  schema: z.object({
    from: z.string().describe('Source node ID'),
    to: z.string().describe('Target node ID'),
    type: z.string().describe('Edge type/relationship (e.g., "depends_on", "implements", "contains")'),
    properties: z.record(z.string(), z.any()).optional().describe('Optional edge properties'),
  }),
  func: async ({ from, to, type, properties }) => {
    return await callMCPTool('graph_add_edge', { from, to, type, properties });
  },
});

export const graphQueryNodesTool = new DynamicStructuredTool({
  name: 'graph_query_nodes',
  description: 'Query nodes by type and/or properties. Returns matching nodes.',
  schema: z.object({
    type: z.string().optional().describe('Filter by node type'),
    properties: z.record(z.string(), z.any()).optional().describe('Filter by property values'),
  }),
  func: async ({ type, properties }) => {
    return await callMCPTool('graph_query_nodes', { type, properties });
  },
});

export const graphGetSubgraphTool = new DynamicStructuredTool({
  name: 'graph_get_subgraph',
  description: 'Get subgraph (nodes and edges) within N hops of a starting node',
  schema: z.object({
    nodeId: z.string().describe('Starting node ID'),
    depth: z.number().optional().describe('Traversal depth (default: 2)'),
  }),
  func: async ({ nodeId, depth }) => {
    return await callMCPTool('graph_get_subgraph', { nodeId, depth });
  },
});

export const graphDeleteNodeTool = new DynamicStructuredTool({
  name: 'graph_delete_node',
  description: 'Delete a node and all its relationships from the graph',
  schema: z.object({
    nodeId: z.string().describe('Node ID to delete'),
  }),
  func: async ({ nodeId }) => {
    return await callMCPTool('graph_delete_node', { id: nodeId });
  },
});

export const graphDeleteEdgeTool = new DynamicStructuredTool({
  name: 'graph_delete_edge',
  description: 'Delete a relationship edge between two nodes',
  schema: z.object({
    edgeId: z.string().describe('Edge ID to delete'),
  }),
  func: async ({ edgeId }) => {
    return await callMCPTool('graph_delete_edge', { edgeId });
  },
});

export const graphSearchNodesTool = new DynamicStructuredTool({
  name: 'graph_search_nodes',
  description: 'Full-text search across all nodes in the graph - CRITICAL for finding related tasks, patterns, decisions',
  schema: z.object({
    query: z.string().describe('Search query text (e.g., "authentication", "JWT token", "Docker setup")'),
    types: z.array(z.string()).optional().describe('Filter by node types (e.g., ["todo", "concept"])'),
    limit: z.number().optional().describe('Max results (default: 100)'),
  }),
  func: async ({ query, types, limit }) => {
    const options: any = {};
    if (types) options.types = types;
    if (limit) options.limit = limit;
    return await callMCPTool('graph_search_nodes', { query, options });
  },
});

export const graphGetEdgesTool = new DynamicStructuredTool({
  name: 'graph_get_edges',
  description: 'Get all edges connected to a node',
  schema: z.object({
    nodeId: z.string().describe('Node ID'),
    direction: z.enum(['in', 'out', 'both']).optional().describe('Edge direction (default: both)'),
  }),
  func: async ({ nodeId, direction }) => {
    return await callMCPTool('graph_get_edges', { nodeId, direction });
  },
});

export const graphGetNeighborsTool = new DynamicStructuredTool({
  name: 'graph_get_neighbors',
  description: 'Find all nodes connected to a given node',
  schema: z.object({
    nodeId: z.string().describe('Starting node ID'),
    depth: z.number().optional().describe('Traversal depth (default: 1)'),
    edgeType: z.string().optional().describe('Filter by edge type'),
  }),
  func: async ({ nodeId, depth, edgeType }) => {
    return await callMCPTool('graph_get_neighbors', { nodeId, depth, edgeType });
  },
});

export const graphAddNodesBulkTool = new DynamicStructuredTool({
  name: 'graph_add_nodes_bulk',
  description: 'Bulk create multiple nodes in one efficient transaction',
  schema: z.object({
    nodes: z.array(z.object({
      type: z.string(),
      properties: z.record(z.string(), z.any()),
    })).describe('Array of nodes to create'),
  }),
  func: async ({ nodes }) => {
    return await callMCPTool('graph_add_nodes', { nodes });
  },
});

export const graphUpdateNodesBulkTool = new DynamicStructuredTool({
  name: 'graph_update_nodes_bulk',
  description: 'Bulk update multiple nodes in one transaction',
  schema: z.object({
    updates: z.array(z.object({
      id: z.string(),
      properties: z.record(z.string(), z.any()),
    })).describe('Array of node updates'),
  }),
  func: async ({ updates }) => {
    return await callMCPTool('graph_update_nodes', { updates });
  },
});

export const graphAddEdgesBulkTool = new DynamicStructuredTool({
  name: 'graph_add_edges_bulk',
  description: 'Bulk create multiple relationships in one transaction',
  schema: z.object({
    edges: z.array(z.object({
      source: z.string(),
      target: z.string(),
      type: z.string(),
      properties: z.record(z.string(), z.any()).optional(),
    })).describe('Array of edges to create'),
  }),
  func: async ({ edges }) => {
    return await callMCPTool('graph_add_edges', { edges });
  },
});

export const graphLockNodeTool = new DynamicStructuredTool({
  name: 'graph_lock_node',
  description: 'Acquire exclusive lock on a node for multi-agent coordination',
  schema: z.object({
    nodeId: z.string().describe('Node ID to lock'),
    agentId: z.string().describe('Agent ID claiming the lock'),
    timeoutMs: z.number().optional().describe('Lock expiry in ms (default: 300000 = 5 min)'),
  }),
  func: async ({ nodeId, agentId, timeoutMs }) => {
    return await callMCPTool('graph_lock_node', { nodeId, agentId, timeoutMs });
  },
});

export const graphUnlockNodeTool = new DynamicStructuredTool({
  name: 'graph_unlock_node',
  description: 'Release lock on a node',
  schema: z.object({
    nodeId: z.string().describe('Node ID to unlock'),
    agentId: z.string().describe('Agent ID releasing the lock'),
  }),
  func: async ({ nodeId, agentId }) => {
    return await callMCPTool('graph_unlock_node', { nodeId, agentId });
  },
});

export const graphQueryAvailableNodesTool = new DynamicStructuredTool({
  name: 'graph_query_available_nodes',
  description: 'Query nodes filtered by lock status - find available unlocked tasks',
  schema: z.object({
    type: z.string().optional().describe('Node type filter'),
    filters: z.record(z.string(), z.any()).optional().describe('Additional property filters'),
    availableOnly: z.boolean().optional().describe('Only return unlocked nodes (default: true)'),
  }),
  func: async ({ type, filters, availableOnly }) => {
    return await callMCPTool('graph_query_available_nodes', { type, filters, availableOnly });
  },
});

export const getTaskContextTool = new DynamicStructuredTool({
  name: 'get_task_context',
  description: 'Get filtered task context based on agent type (PM/worker/QC) - implements context isolation',
  schema: z.object({
    taskId: z.string().describe('Task node ID'),
    agentType: z.enum(['pm', 'worker', 'qc']).describe('Agent type requesting context'),
  }),
  func: async ({ taskId, agentType }) => {
    return await callMCPTool('get_task_context', { taskId, agentType });
  },
});

/**
 * TODO Management Tools
 */

export const createTodoTool = new DynamicStructuredTool({
  name: 'create_todo',
  description: 'Create a new TODO item with optional context and parent relationship.',
  schema: z.object({
    title: z.string().describe('TODO title'),
    description: z.string().optional().describe('Detailed description'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium').describe('Priority level'),
    status: z.enum(['pending', 'in_progress', 'completed']).default('pending').describe('Status'),
    context: z.string().optional().describe('Additional context or metadata'),
    parent_id: z.string().optional().describe('Parent TODO ID for hierarchical organization'),
  }),
  func: async ({ title, description, priority, status, context, parent_id }) => {
    return await callMCPTool('create_todo', { 
      title, 
      description, 
      priority, 
      status, 
      context, 
      parent_id 
    });
  },
});

export const getTodoTool = new DynamicStructuredTool({
  name: 'get_todo',
  description: 'Retrieve a TODO item by its ID.',
  schema: z.object({
    id: z.string().describe('TODO ID'),
  }),
  func: async ({ id }) => {
    return await callMCPTool('get_todo', { id });
  },
});

export const updateTodoTool = new DynamicStructuredTool({
  name: 'update_todo',
  description: 'Update an existing TODO item (status, priority, etc).',
  schema: z.object({
    id: z.string().describe('TODO ID'),
    status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('New status'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('New priority'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
  }),
  func: async ({ id, status, priority, title, description }) => {
    const updates: Record<string, any> = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (title) updates.title = title;
    if (description) updates.description = description;
    
    return await callMCPTool('update_todo', { id, ...updates });
  },
});

export const listTodosTool = new DynamicStructuredTool({
  name: 'list_todos',
  description: 'List TODO items with optional filters (status, priority).',
  schema: z.object({
    status: z.enum(['pending', 'in_progress', 'completed', 'all']).default('all').describe('Filter by status'),
    priority: z.enum(['low', 'medium', 'high', 'urgent', 'all']).default('all').describe('Filter by priority'),
  }),
  func: async ({ status, priority }) => {
    const params: Record<string, any> = {};
    if (status !== 'all') params.status = status;
    if (priority !== 'all') params.priority = priority;
    
    return await callMCPTool('list_todos', params);
  },
});

/**
 * All MCP tools
 */
export const mcpTools = [
  // Knowledge Graph - Single Operations
  graphAddNodeTool,
  graphGetNodeTool,
  graphUpdateNodeTool,
  graphDeleteNodeTool,
  graphAddEdgeTool,
  graphDeleteEdgeTool,
  graphQueryNodesTool,
  graphSearchNodesTool,        // ⭐ Essential for Ecko and PM agents
  graphGetEdgesTool,
  graphGetNeighborsTool,
  graphGetSubgraphTool,
  
  // Knowledge Graph - Bulk Operations
  graphAddNodesBulkTool,
  graphUpdateNodesBulkTool,
  graphAddEdgesBulkTool,
  
  // Multi-Agent Locking
  graphLockNodeTool,
  graphUnlockNodeTool,
  graphQueryAvailableNodesTool,
  
  // Context Isolation
  getTaskContextTool,
  
  // TODO Management (legacy, consider deprecating in favor of graph operations)
  createTodoTool,
  getTodoTool,
  updateTodoTool,
  listTodosTool,
];

/**
 * Get MCP tool names for logging
 */
export function getMCPToolNames(): string[] {
  return mcpTools.map(tool => tool.name);
}

