// ============================================================================
// Unified Graph Tools - Consolidated for Better UX
// 6 tools: memory_node, memory_edge, memory_batch, memory_lock, get_task_context, memory_clear
// Reduced from 22 tools while maintaining all functionality
// ============================================================================

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const GRAPH_TOOLS: Tool[] = [
  // ============================================================================
  // TOOL 1: memory_node - All node operations
  // ============================================================================
  {
    name: "memory_node",
    description: `Manage memory nodes (knowledge entries). Operations: add, get, update, delete, query, search.
    
Nodes store conversation details, decisions, file references, concepts. All nodes automatically get semantic embeddings for later retrieval via vector_search_nodes. Use IDs to reference nodes instead of repeating details.

Examples:
- Add: memory_node(operation='add', type='memory', properties={title: 'X', content: 'Y'})
- Get: memory_node(operation='get', id='memory-123')
- Query: memory_node(operation='query', type='todo', filters={status: 'pending'})
- Search: memory_node(operation='search', query='authentication code') [exact text match]`,
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["add", "get", "update", "delete", "query", "search"],
          description: "Operation to perform on nodes"
        },
        id: {
          type: "string",
          description: "Node ID (required for get, update, delete)"
        },
        type: {
          type: "string",
          enum: ["todo", "todoList", "memory", "file", "function", "class", "module", "concept", "person", "project", "custom"],
          description: "Node type (required for add, optional for query)"
        },
        properties: {
          type: "object",
          description: "Node properties for add/update operations",
          additionalProperties: true
        },
        filters: {
          type: "object",
          description: "Property filters for query (e.g., {status: 'pending', priority: 'high'})",
          additionalProperties: true
        },
        query: {
          type: "string",
          description: "Search query text for search operation (full-text search)"
        },
        options: {
          type: "object",
          description: "Search options: {limit: 100, offset: 0, types: ['todo', 'memory']}",
          additionalProperties: true
        }
      },
      required: ["operation"]
    }
  },

  // ============================================================================
  // TOOL 2: memory_edge - All edge/relationship operations
  // ============================================================================
  {
    name: "memory_edge",
    description: `Manage relationships between nodes. Operations: add, delete, get, neighbors, subgraph.
    
Build knowledge graphs by linking nodes (e.g., 'file depends_on module', 'todo part_of project').

Examples:
- Add: memory_edge(operation='add', source='todo-1', target='project-2', type='part_of')
- Get edges: memory_edge(operation='get', node_id='todo-1', direction='both')
- Neighbors: memory_edge(operation='neighbors', node_id='todo-1', edge_type='depends_on')
- Subgraph: memory_edge(operation='subgraph', node_id='project-1', depth=2)`,
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["add", "delete", "get", "neighbors", "subgraph"],
          description: "Operation to perform on edges/relationships"
        },
        source: {
          type: "string",
          description: "Source node ID (required for add)"
        },
        target: {
          type: "string",
          description: "Target node ID (required for add)"
        },
        edge_id: {
          type: "string",
          description: "Edge ID (required for delete)"
        },
        node_id: {
          type: "string",
          description: "Node ID (required for get, neighbors, subgraph)"
        },
        type: {
          type: "string",
          enum: ["contains", "depends_on", "relates_to", "implements", "calls", "imports", "assigned_to", "parent_of", "blocks", "references"],
          description: "Edge type (required for add)"
        },
        edge_type: {
          type: "string",
          description: "Filter by edge type (optional for neighbors)"
        },
        direction: {
          type: "string",
          enum: ["in", "out", "both"],
          description: "Edge direction for get operation (default: both)"
        },
        depth: {
          type: "number",
          description: "Traversal depth for neighbors/subgraph (default: 1 for neighbors, 2 for subgraph)"
        },
        properties: {
          type: "object",
          description: "Edge properties for add operation",
          additionalProperties: true
        }
      },
      required: ["operation"]
    }
  },

  // ============================================================================
  // TOOL 3: memory_batch - Bulk operations
  // ============================================================================
  {
    name: "memory_batch",
    description: `Perform bulk operations on multiple nodes/edges efficiently. Operations: add_nodes, update_nodes, delete_nodes, add_edges, delete_edges.
    
Use for batch processing (e.g., creating multiple todos, bulk updates).

Examples:
- Add nodes: memory_batch(operation='add_nodes', nodes=[{type: 'todo', properties: {...}}, ...])
- Update nodes: memory_batch(operation='update_nodes', updates=[{id: 'todo-1', properties: {status: 'completed'}}, ...])
- Delete nodes: memory_batch(operation='delete_nodes', ids=['todo-1', 'todo-2'])`,
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["add_nodes", "update_nodes", "delete_nodes", "add_edges", "delete_edges"],
          description: "Batch operation to perform"
        },
        nodes: {
          type: "array",
          description: "Array of nodes for add_nodes: [{type: 'todo', properties: {...}}, ...]",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              properties: { type: "object", additionalProperties: true }
            }
          }
        },
        updates: {
          type: "array",
          description: "Array of updates for update_nodes: [{id: 'todo-1', properties: {...}}, ...]",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              properties: { type: "object", additionalProperties: true }
            }
          }
        },
        ids: {
          type: "array",
          description: "Array of IDs for delete_nodes/delete_edges",
          items: { type: "string" }
        },
        edges: {
          type: "array",
          description: "Array of edges for add_edges: [{source: 'a', target: 'b', type: 'depends_on'}, ...]",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              target: { type: "string" },
              type: { type: "string" },
              properties: { type: "object", additionalProperties: true }
            }
          }
        }
      },
      required: ["operation"]
    }
  },

  // ============================================================================
  // TOOL 4: memory_lock - Multi-agent locking
  // ============================================================================
  {
    name: "memory_lock",
    description: `Manage locks for multi-agent coordination. Operations: acquire, release, query_available, cleanup.
    
Prevent race conditions when multiple agents work on same tasks.

Examples:
- Acquire: memory_lock(operation='acquire', node_id='todo-1', agent_id='worker-1')
- Release: memory_lock(operation='release', node_id='todo-1', agent_id='worker-1')
- Query: memory_lock(operation='query_available', type='todo', filters={status: 'pending'})
- Cleanup: memory_lock(operation='cleanup')`,
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["acquire", "release", "query_available", "cleanup"],
          description: "Lock operation to perform"
        },
        node_id: {
          type: "string",
          description: "Node ID (required for acquire, release)"
        },
        agent_id: {
          type: "string",
          description: "Agent ID (required for acquire, release)"
        },
        timeout_ms: {
          type: "number",
          description: "Lock timeout in milliseconds (default: 300000 = 5 min)"
        },
        type: {
          type: "string",
          description: "Node type filter for query_available"
        },
        filters: {
          type: "object",
          description: "Property filters for query_available",
          additionalProperties: true
        }
      },
      required: ["operation"]
    }
  },

  // ============================================================================
  // TOOL 5: get_task_context - Context isolation (specialized)
  // ============================================================================
  {
    name: "get_task_context",
    description: "Get filtered task context based on agent type (PM/worker/QC). Server-side context isolation for multi-agent workflows. PM agents get full context (100%), workers get minimal context (<10% - only files, dependencies, requirements), QC agents get requirements + worker output for verification. Implements 90%+ context reduction for worker agents.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task node ID to retrieve context for"
        },
        agentType: {
          type: "string",
          enum: ["pm", "worker", "qc"],
          description: "Agent type requesting context - determines filtering level"
        }
      },
      required: ["taskId", "agentType"]
    }
  },

  // ============================================================================
  // TOOL 6: memory_clear - Dangerous operation (deserves own tool)
  // ============================================================================
  {
    name: "memory_clear",
    description: "Clear data from the graph. SAFETY: To clear all data, you MUST explicitly pass type='ALL'. To clear specific node types, pass the node type. Returns counts of deleted nodes and edges.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["ALL", "todo", "todoList", "memory", "file", "function", "class", "module", "concept", "person", "project", "custom"],
          description: "Node type to clear, or 'ALL' to clear entire graph (use with extreme caution!). Required parameter."
        }
      },
      required: ["type"]
    }
  }
];
