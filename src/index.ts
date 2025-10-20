#!/usr/bin/env node

// ============================================================================
// MCP Graph-RAG Server
// Unified graph model with Neo4j backend
// Version: 4.0.0 (Clean Architecture)
// ============================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createGraphManager, type IGraphManager } from "./managers/index.js";
import { ContextManager } from "./managers/ContextManager.js";
import { GRAPH_TOOLS } from "./tools/index.js";
import type { NodeType, EdgeType, ClearType } from "./types/index.js";
import type { AgentType } from "./types/context.types.js";

// File Indexing
import { FileWatchManager } from "./indexing/FileWatchManager.js";
import { WatchConfigManager } from "./indexing/WatchConfigManager.js";
import {
  createFileIndexingTools,
  handleWatchFolder,
  handleUnwatchFolder,
  handleIndexFolder,
  handleListWatchedFolders
} from "./tools/fileIndexing.tools.js";

// Vector Search
import {
  createVectorSearchTools,
  handleVectorSearchFiles,
  handleGetEmbeddingStats
} from "./tools/vectorSearch.tools.js";

// ============================================================================
// Global State
// ============================================================================

let graphManager: IGraphManager;
let fileWatchManager: FileWatchManager;
export let allTools: any[] = [];

// ============================================================================
// MCP Server Setup
// ============================================================================

export const server = new Server(
  {
    name: "Mimir-RAG-TODO-MCP",
    version: "4.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Tool Handlers
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: allTools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ========================================================================
      // SINGLE OPERATIONS
      // ========================================================================

      case "graph_add_node": {
        const { type, properties } = args as { type: NodeType; properties: Record<string, any> };
        const node = await graphManager.addNode(type, properties);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, node }, null, 2)
            }
          ]
        };
      }

      case "graph_get_node": {
        const { id } = args as { id: string };
        const node = await graphManager.getNode(id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, node }, null, 2)
            }
          ]
        };
      }

      case "graph_update_node": {
        const { id, properties } = args as { id: string; properties: Record<string, any> };
        const node = await graphManager.updateNode(id, properties);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, node }, null, 2)
            }
          ]
        };
      }

      case "graph_delete_node": {
        const { id } = args as { id: string };
        const deleted = await graphManager.deleteNode(id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, deleted }, null, 2)
            }
          ]
        };
      }

      case "graph_add_edge": {
        const { source, target, type, properties } = args as {
          source: string;
          target: string;
          type: EdgeType;
          properties?: Record<string, any>;
        };
        const edge = await graphManager.addEdge(source, target, type, properties);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, edge }, null, 2)
            }
          ]
        };
      }

      case "graph_delete_edge": {
        const { edgeId } = args as { edgeId: string };
        const deleted = await graphManager.deleteEdge(edgeId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, deleted }, null, 2)
            }
          ]
        };
      }

      case "graph_query_nodes": {
        const { type, filters } = args as { type?: NodeType; filters?: Record<string, any> };
        const nodes = await graphManager.queryNodes(type, filters);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, count: nodes.length, nodes }, null, 2)
            }
          ]
        };
      }

      case "graph_search_nodes": {
        const { query, options } = args as { query: string; options?: any };
        const nodes = await graphManager.searchNodes(query, options);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, count: nodes.length, nodes }, null, 2)
            }
          ]
        };
      }

      case "graph_get_edges": {
        const { nodeId, direction } = args as { nodeId: string; direction?: 'in' | 'out' | 'both' };
        const edges = await graphManager.getEdges(nodeId, direction);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, count: edges.length, edges }, null, 2)
            }
          ]
        };
      }

      case "graph_get_neighbors": {
        const { nodeId, edgeType, depth } = args as { nodeId: string; edgeType?: EdgeType; depth?: number };
        const neighbors = await graphManager.getNeighbors(nodeId, edgeType, depth);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, count: neighbors.length, neighbors }, null, 2)
            }
          ]
        };
      }

      case "graph_get_subgraph": {
        const { nodeId, depth } = args as { nodeId: string; depth?: number };
        const subgraph = await graphManager.getSubgraph(nodeId, depth);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, subgraph }, null, 2)
            }
          ]
        };
      }

      case "graph_clear": {
        const type = args?.type as ClearType | undefined;
        const result = await graphManager.clear(type);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                success: true,
                ...result,
                message: type === 'ALL'
                  ? `Cleared ALL data: ${result.deletedNodes} nodes, ${result.deletedEdges} edges`
                  : type
                  ? `Cleared ${result.deletedNodes} nodes of type '${type}' and ${result.deletedEdges} edges`
                  : `No type provided. Use type='ALL' to clear entire graph.`
              }, null, 2)
            }
          ]
        };
      }

      // ========================================================================
      // BATCH OPERATIONS
      // ========================================================================

      case "graph_add_nodes": {
        const { nodes } = args as { nodes: Array<{ type: NodeType; properties: Record<string, any> }> };
        const created = await graphManager.addNodes(nodes);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, count: created.length, nodes: created }, null, 2)
            }
          ]
        };
      }

      case "graph_update_nodes": {
        const { updates } = args as { updates: Array<{ id: string; properties: Record<string, any> }> };
        const updated = await graphManager.updateNodes(updates);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, count: updated.length, nodes: updated }, null, 2)
            }
          ]
        };
      }

      case "graph_delete_nodes": {
        const { ids } = args as { ids: string[] };
        const result = await graphManager.deleteNodes(ids);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, result }, null, 2)
            }
          ]
        };
      }

      case "graph_add_edges": {
        const { edges } = args as { edges: Array<{ source: string; target: string; type: EdgeType; properties?: Record<string, any> }> };
        const created = await graphManager.addEdges(edges);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, count: created.length, edges: created }, null, 2)
            }
          ]
        };
      }

      case "graph_delete_edges": {
        const { edgeIds } = args as { edgeIds: string[] };
        const result = await graphManager.deleteEdges(edgeIds);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, result }, null, 2)
            }
          ]
        };
      }

      // ========================================================================
      // FILE INDEXING OPERATIONS
      // ========================================================================

      case "watch_folder": {
        const result = await handleWatchFolder(args, graphManager.getDriver(), fileWatchManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "unwatch_folder": {
        const result = await handleUnwatchFolder(args, graphManager.getDriver(), fileWatchManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "index_folder": {
        const result = await handleIndexFolder(args, graphManager.getDriver(), fileWatchManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "list_watched_folders": {
        const result = await handleListWatchedFolders(graphManager.getDriver());
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      // ========================================================================
      // VECTOR SEARCH OPERATIONS
      // ========================================================================

      case "vector_search_files": {
        const result = await handleVectorSearchFiles(args, graphManager.getDriver());
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "get_embedding_stats": {
        const result = await handleGetEmbeddingStats(args, graphManager.getDriver());
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      // ========================================================================
      // MULTI-AGENT LOCKING OPERATIONS
      // ========================================================================

      case "graph_lock_node": {
        const { nodeId, agentId, timeoutMs } = args as { nodeId: string; agentId: string; timeoutMs?: number };
        const locked = await graphManager.lockNode(nodeId, agentId, timeoutMs);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                success: true, 
                locked,
                message: locked 
                  ? `Lock acquired by ${agentId} on ${nodeId}` 
                  : `Node ${nodeId} is already locked by another agent`
              }, null, 2)
            }
          ]
        };
      }

      case "graph_unlock_node": {
        const { nodeId, agentId } = args as { nodeId: string; agentId: string };
        const unlocked = await graphManager.unlockNode(nodeId, agentId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                success: true, 
                unlocked,
                message: unlocked 
                  ? `Lock released by ${agentId} on ${nodeId}` 
                  : `Node ${nodeId} was not locked by ${agentId}`
              }, null, 2)
            }
          ]
        };
      }

      case "graph_query_available_nodes": {
        const { type, filters, availableOnly } = args as { 
          type?: NodeType; 
          filters?: Record<string, any>; 
          availableOnly?: boolean 
        };
        const nodes = await graphManager.queryNodesWithLockStatus(
          type, 
          filters, 
          availableOnly !== false  // Default to true
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                success: true, 
                count: nodes.length, 
                nodes 
              }, null, 2)
            }
          ]
        };
      }

      case "graph_cleanup_locks": {
        const cleaned = await graphManager.cleanupExpiredLocks();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ 
                success: true, 
                cleaned,
                message: `Cleaned up ${cleaned} expired lock(s)`
              }, null, 2)
            }
          ]
        };
      }

      // ========================================================================
      // CONTEXT ISOLATION
      // ========================================================================

      case "get_task_context": {
        const { taskId, agentType } = args as { taskId: string; agentType: AgentType };
        const contextManager = new ContextManager(graphManager);
        const { context, metrics } = await contextManager.getFilteredTaskContext(taskId, agentType);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, context, metrics }, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
          }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// ============================================================================
// Main Entry Point
// ============================================================================

// ============================================================================
// Initialization Function
// ============================================================================

export async function initializeGraphManager() {
  if (!graphManager) {
    graphManager = await createGraphManager();
    
    // Initialize file watch manager
    fileWatchManager = new FileWatchManager(graphManager.getDriver());
    
    // Restore watchers from Neo4j
    await restoreFileWatchers();
    
    // Combine all tools
    const fileIndexingTools = createFileIndexingTools(graphManager.getDriver(), fileWatchManager);
    const vectorSearchTools = createVectorSearchTools(graphManager.getDriver());
    allTools = [...GRAPH_TOOLS, ...fileIndexingTools, ...vectorSearchTools];
  }
  return graphManager;
}

/**
 * Restore file watchers from Neo4j on startup
 */
async function restoreFileWatchers() {
  console.error('🔄 Loading watch configurations from Neo4j...');
  
  const configManager = new WatchConfigManager(graphManager.getDriver());
  const configs = await configManager.listActive();
  
  console.error(`Found ${configs.length} active watch configurations`);
  
  for (const config of configs) {
    try {
      const pathExists = await import('fs').then(fs => 
        fs.promises.access(config.path).then(() => true).catch(() => false)
      );
      
      if (pathExists) {
        await fileWatchManager.startWatch(config);
        console.error(`✅ Restored watcher: ${config.path}`);
      } else {
        console.error(`⚠️  Path no longer exists: ${config.path}`);
        await configManager.markInactive(config.id, 'path_not_found');
      }
    } catch (error: any) {
      console.error(`❌ Failed to restore watcher: ${config.path}`, error.message);
    }
  }
  
  console.error('✅ File watcher initialization complete');
}

// ============================================================================
// Main Entry Point (stdio mode)
// ============================================================================

async function main() {
  console.error("🚀 Graph-RAG MCP Server v4.0 starting...");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Initialize GraphManager
  try {
    await initializeGraphManager();
    const stats = await graphManager.getStats();
    console.error(`✅ Connected to Neo4j`);
    console.error(`   Nodes: ${stats.nodeCount}`);
    console.error(`   Edges: ${stats.edgeCount}`);
    console.error(`   Types: ${JSON.stringify(stats.types)}`);
  } catch (error: any) {
    console.error(`❌ Failed to initialize GraphManager: ${error.message}`);
    process.exit(1);
  }

  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error(`📊 ${allTools.length} tools available (${GRAPH_TOOLS.length} graph + ${allTools.length - GRAPH_TOOLS.length} file indexing)`);
  console.error(`   🔒 Multi-agent locking enabled (4 lock management tools)`);
  console.error(`   🎯 Context isolation enabled (get_task_context tool)`);
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.error('\n🛑 Shutting down gracefully...');
    if (fileWatchManager) {
      await fileWatchManager.closeAll();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('\n🛑 Shutting down gracefully...');
    if (fileWatchManager) {
      await fileWatchManager.closeAll();
    }
    process.exit(0);
  });

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("✅ Server ready on stdio");
}

// Only run main() if this file is executed directly (not imported)
// This allows http-server.ts to import the server without auto-connecting to stdio
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
