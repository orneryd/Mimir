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
import { translateHostToContainer } from "./utils/path-utils.js";
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

// Orchestration
import { orchestrationTools } from "./tools/orchestration.tools.js";
import { 
  executeWorkflowFromJSON, 
  executionStates 
} from "./api/orchestration/workflow-executor.js";

// ============================================================================
// Global State
// ============================================================================

let graphManager: IGraphManager;
export let fileWatchManager: FileWatchManager;
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
  console.error(`[MCP] tools/list called, returning ${allTools.length} tools`);
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

      // ========================================================================
      // ORCHESTRATION OPERATIONS
      // ========================================================================

      case "execute_workflow": {
        const { tasks } = args as { tasks: any[] };
        
        // Use configured server URL (defaults to localhost for local, internal for Docker)
        const serverUrl = process.env.MIMIR_SERVER_URL || 'http://localhost:9042';
        
        // Call the orchestration API
        const response = await fetch(`${serverUrl}/api/execute-workflow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tasks })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Orchestration API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "get_execution_status": {
        const { execution_id } = args as { execution_id: string };
        
        const serverUrl = process.env.MIMIR_SERVER_URL || 'http://localhost:9042';
        const response = await fetch(`${serverUrl}/api/executions/${execution_id}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get execution status: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "get_execution_results": {
        const { execution_id } = args as { execution_id: string };
        
        const serverUrl = process.env.MIMIR_SERVER_URL || 'http://localhost:9042';
        const response = await fetch(`${serverUrl}/api/deliverables/${execution_id}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get execution results: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case "cancel_execution": {
        const { execution_id } = args as { execution_id: string };
        
        const serverUrl = process.env.MIMIR_SERVER_URL || 'http://localhost:9042';
        const response = await fetch(`${serverUrl}/api/cancel-execution/${execution_id}`, {
          method: 'POST'
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to cancel execution: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
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
    allTools = [...GRAPH_TOOLS, ...fileIndexingTools, ...vectorSearchTools, ...todoTools, ...orchestrationTools];
  }
  return graphManager;
}

/**
 * Restore file watchers from Neo4j on startup
 */
async function restoreFileWatchers() {
  console.error('🔄 Loading watch configurations from Neo4j...');
  
  const configManager = new WatchConfigManager(graphManager.getDriver());
  const configs = await configManager.listAll();
  
  // Filter to only active watches
  const activeConfigs = configs.filter(c => c.status === 'active');
  const inactiveCount = configs.length - activeConfigs.length;
  
  console.error(`Found ${configs.length} watch configurations (${activeConfigs.length} active, ${inactiveCount} inactive)`);
  
  for (const config of activeConfigs) {
    try {
      // Translate host path to container path for existence check AND indexing
      const containerPath = translateHostToContainer(config.path);
      console.error(`🔍 Checking path: ${config.path} -> ${containerPath}`);
      
      const pathExists = await import('fs').then(fs => 
        fs.promises.access(containerPath).then(() => true).catch(() => false)
      );
      
      if (pathExists) {
        // Use original config (path is host path for UI/SSE matching)
        // FileWatchManager will translate to container internally when needed
        await fileWatchManager.startWatch(config);
        console.error(`✅ Restored watcher: ${config.path} (container: ${containerPath})`);
      } else{
        console.error(`⚠️  Path no longer exists: ${containerPath} (from ${config.path})`);
        await configManager.markInactive(config.id, 'path_not_found');
      }
    } catch (error: any) {
      console.error(`❌ Failed to restore watcher: ${config.path}`, error.message);
    }
  }
  
  // Auto-index documentation folder on first startup
  console.error('🔍 Checking if documentation needs indexing...');
  try {
    await ensureDocsIndexed(configManager);
  } catch (error: any) {
    console.error('❌ Error in ensureDocsIndexed:', error.message);
  }
  
  console.error('✅ File watcher initialization complete');
}

/**
 * Ensure documentation folder is indexed on startup
 * This allows users to immediately query Mimir's documentation
 */
async function ensureDocsIndexed(configManager: WatchConfigManager) {
  console.error('📖 ensureDocsIndexed: Starting...');
  
  // Check feature flag (default: true)
  const autoIndexDocs = process.env.MIMIR_AUTO_INDEX_DOCS !== 'false';
  console.error(`📖 Feature flag check: MIMIR_AUTO_INDEX_DOCS=${process.env.MIMIR_AUTO_INDEX_DOCS}, enabled=${autoIndexDocs}`);
  
  if (!autoIndexDocs) {
    console.error('ℹ️  Auto-indexing documentation disabled (MIMIR_AUTO_INDEX_DOCS=false)');
    return;
  }
  
  const fs = await import('fs').then(m => m.promises);
  
  // Documentation is always at /app/docs in container
  const docsPath = '/app/docs';
  console.error(`📖 Checking if ${docsPath} exists...`);
  
  // Verify docs folder exists
  try {
    await fs.access(docsPath);
    console.error(`📚 Found documentation at: ${docsPath}`);
  } catch {
    console.error('⚠️  Documentation folder not found at /app/docs - skipping auto-indexing');
    return;
  }
  
  // Check if docs are already indexed (either directly or via parent folder)
  console.error('📖 Querying Neo4j for existing doc files...');
  const driver = graphManager.getDriver();
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (f:file)
      WHERE f.path STARTS WITH '/app/docs/' OR f.path = '/app/docs'
      RETURN count(f) as docCount
      LIMIT 1
    `);
    
    const docCount = result.records[0]?.get('docCount')?.toNumber() || 0;
    console.error(`📖 Found ${docCount} doc files in Neo4j`);
    
    if (docCount > 0) {
      console.error(`✅ Documentation already indexed (${docCount} files found)`);
      console.error('   Docs are searchable via semantic search!');
      return;
    }
  } finally {
    await session.close();
  }
  
  console.error('📖 No docs found, proceeding to index /app/docs...');
  
  // Create new watch configuration for docs
  console.error('📖 Auto-indexing documentation folder for first-time users...');
  
  try {
    const { handleIndexFolder } = await import('./tools/fileIndexing.tools.js');
    
    const result = await handleIndexFolder(
      {
        path: docsPath,
        recursive: true,
        file_patterns: ['*.md', '*.txt'],
        ignore_patterns: ['node_modules', '.git', 'archive'],
        generate_embeddings: true, // Enable embeddings for better doc search
      },
      graphManager.getDriver(),
      fileWatchManager
    );
    
    if (result.status === 'success') {
      console.error(`✅ Documentation indexed: ${result.files_indexed || 0} files`);
      console.error('   Users can now query Mimir docs via semantic search!');
    } else if (result.status === 'error') {
      console.error(`⚠️  Failed to index documentation: ${result.message}`);
    }
  } catch (error: any) {
    console.error(`❌ Error auto-indexing docs: ${error.message}`);
  }
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
