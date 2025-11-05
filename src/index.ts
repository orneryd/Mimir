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
import { 
  GRAPH_TOOLS,
  handleMemoryNode,
  handleMemoryEdge,
  handleMemoryBatch,
  handleMemoryLock,
  handleMemoryClear
} from "./tools/index.js";
import type { NodeType, EdgeType, ClearType } from "./types/index.js";
import type { AgentType } from "./types/context.types.js";

// File Indexing
import { FileWatchManager } from "./indexing/FileWatchManager.js";
import { WatchConfigManager } from "./indexing/WatchConfigManager.js";
import {
  createFileIndexingTools,
  handleIndexFolder,
  handleRemoveFolder,
  handleListWatchedFolders
} from "./tools/fileIndexing.tools.js";

// Vector Search
import {
  createVectorSearchTools,
  handleVectorSearchNodes,
  handleGetEmbeddingStats
} from "./tools/vectorSearch.tools.js";

// Todo Management
import {
  createTodoListTools,
  handleTodo,
  handleTodoList
} from "./tools/todoList.tools.js";

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
      // CONSOLIDATED MEMORY OPERATIONS (6 tools instead of 22)
      // ========================================================================

      case "memory_node": {
        const result = await handleMemoryNode(args, graphManager);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      case "memory_edge": {
        const result = await handleMemoryEdge(args, graphManager);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      case "memory_batch": {
        const result = await handleMemoryBatch(args, graphManager);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      case "memory_lock": {
        const result = await handleMemoryLock(args, graphManager);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      case "memory_clear": {
        const result = await handleMemoryClear(args, graphManager);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }

      // ========================================================================
      // FILE INDEXING OPERATIONS
      // ========================================================================

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

      case "remove_folder": {
        const result = await handleRemoveFolder(args, graphManager.getDriver(), fileWatchManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "list_folders": {
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

      case "vector_search_nodes": {
        const result = await handleVectorSearchNodes(args, graphManager.getDriver());
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
      // TODO MANAGEMENT OPERATIONS
      // ========================================================================

      case "todo": {
        const result = await handleTodo(args, graphManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "todo_list": {
        const result = await handleTodoList(args, graphManager);
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
      // CONTEXT ISOLATION (specialized tool)
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
    
    // Restore watchers from Neo4j in background (non-blocking)
    // This allows the server to start immediately and handle requests
    // while file indexing happens asynchronously
    setImmediate(() => {
      restoreFileWatchers().catch(err => {
        console.error('❌ Failed to restore file watchers:', err.message);
      });
    });
    
    // Combine all tools
    const fileIndexingTools = createFileIndexingTools(graphManager.getDriver(), fileWatchManager);
    const vectorSearchTools = createVectorSearchTools(graphManager.getDriver());
    const todoTools = createTodoListTools();
    allTools = [...GRAPH_TOOLS, ...fileIndexingTools, ...vectorSearchTools, ...todoTools];
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
