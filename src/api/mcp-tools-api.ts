import { Router } from 'express';
import type { IGraphManager } from '../types/index.js';
import { handleIndexFolder, handleRemoveFolder, handleListWatchedFolders } from '../tools/fileIndexing.tools.js';

export function createMCPToolsRouter(graphManager: IGraphManager): Router {
  const router = Router();

  /**
   * POST /mcp/index-folder - Start indexing and watching a folder
   * 
   * Initiates file indexing with automatic watching for changes.
   * Supports embeddings generation, recursive scanning, and pattern filtering.
   * 
   * Request Body:
   * - path: Folder path to index (required)
   * - recursive: Scan subdirectories (default: true)
   * - generate_embeddings: Generate vector embeddings (default: from env)
   * - file_patterns: File patterns to include (optional)
   * - ignore_patterns: Patterns to ignore (optional)
   * 
   * @returns JSON with indexing result and watch status
   * 
   * @example
   * fetch('/mcp/index-folder', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({
   *     path: '/workspace/src',
   *     recursive: true,
   *     generate_embeddings: true
   *   })
   * }).then(r => r.json());
   */
  router.post('/mcp/index-folder', async (req, res) => {
    try {
      // Default generate_embeddings based on MIMIR_EMBEDDINGS_ENABLED env var
      const embeddingsEnabledByDefault = process.env.MIMIR_EMBEDDINGS_ENABLED !== 'false';
      const { path, recursive = true, generate_embeddings = embeddingsEnabledByDefault, file_patterns, ignore_patterns } = req.body;

      if (!path) {
        return res.status(400).json({
          error: 'Missing required parameter: path'
        });
      }

      console.log(`📁 API: Indexing folder ${path} (embeddings: ${generate_embeddings})`);

      // Get FileWatchManager from the global state
      // Note: This assumes FileWatchManager is passed through or accessible
      const watchManager = (globalThis as any).fileWatchManager;
      if (!watchManager) {
        return res.status(500).json({
          error: 'FileWatchManager not initialized'
        });
      }

      const result = await handleIndexFolder(
        {
          path,
          recursive,
          generate_embeddings,
          file_patterns,
          ignore_patterns
        },
        graphManager.getDriver(),
        watchManager
      );

      res.json(result);
    } catch (error: any) {
      console.error('❌ Index folder error:', error);
      res.status(500).json({
        error: 'Failed to index folder',
        details: error.message
      });
    }
  });

  /**
   * POST /mcp/remove-folder - Stop watching and remove indexed files
   * 
   * Stops file watching and removes all indexed files from database.
   * 
   * Request Body:
   * - path: Folder path to remove (required)
   * 
   * @returns JSON with removal result
   * 
   * @example
   * fetch('/mcp/remove-folder', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ path: '/workspace/src' })
   * }).then(r => r.json());
   */
  router.post('/mcp/remove-folder', async (req, res) => {
    try {
      const { path } = req.body;

      if (!path) {
        return res.status(400).json({
          error: 'Missing required parameter: path'
        });
      }

      console.log(`🗑️ API: Removing folder ${path}`);

      const watchManager = (globalThis as any).fileWatchManager;
      if (!watchManager) {
        return res.status(500).json({
          error: 'FileWatchManager not initialized'
        });
      }

      const result = await handleRemoveFolder(
        { path },
        graphManager.getDriver(),
        watchManager
      );

      res.json(result);
    } catch (error: any) {
      console.error('❌ Remove folder error:', error);
      res.status(500).json({
        error: 'Failed to remove folder',
        details: error.message
      });
    }
  });

  /**
   * POST /mcp/save-conversation - Save chat conversation to memory
   * 
   * Stores conversation messages as a memory node for future reference.
   * 
   * Request Body:
   * - messages: Array of message objects with role, content, timestamp
   * 
   * @returns JSON with memory ID
   * 
   * @example
   * fetch('/mcp/save-conversation', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({
   *     messages: [
   *       { role: 'user', content: 'Hello', timestamp: Date.now() },
   *       { role: 'assistant', content: 'Hi!', timestamp: Date.now() }
   *     ]
   *   })
   * }).then(r => r.json());
   */
  router.post('/mcp/save-conversation', async (req, res) => {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: 'Missing or invalid messages array'
        });
      }

      console.log(`💭 API: Saving conversation with ${messages.length} messages`);

      // Format the conversation as markdown
      const conversationText = messages
        .map((msg: any) => {
          const role = msg.role === 'user' ? '**User**' : '**Assistant**';
          const timestamp = new Date(msg.timestamp).toLocaleString();
          return `${role} (${timestamp}):\n${msg.content}\n`;
        })
        .join('\n---\n\n');

      // Create a title from the first user message
      const firstUserMessage = messages.find((m: any) => m.role === 'user');
      const title = firstUserMessage 
        ? `Chat: ${firstUserMessage.content.substring(0, 50)}${firstUserMessage.content.length > 50 ? '...' : ''}`
        : 'Chat Conversation';

      // Save as memory node
      const session = graphManager.getDriver().session();
      try {
        const result = await session.run(
          `
          CREATE (m:Node:Memory {
            id: randomUUID(),
            type: 'memory',
            title: $title,
            content: $content,
            category: 'conversation',
            messageCount: $messageCount,
            createdAt: datetime(),
            tags: ['chat', 'conversation']
          })
          RETURN m.id AS memoryId
          `,
          {
            title,
            content: conversationText,
            messageCount: messages.length
          }
        );

        const memoryId = result.records[0]?.get('memoryId');

        console.log(`✅ Conversation saved as memory: ${memoryId}`);

        res.json({
          success: true,
          memoryId,
          message: `Conversation saved with ${messages.length} messages`
        });
      } finally {
        await session.close();
      }
    } catch (error: any) {
      console.error('❌ Save conversation error:', error);
      res.status(500).json({
        error: 'Failed to save conversation',
        details: error.message
      });
    }
  });

  /**
   * GET /mcp/list-folders - List all indexed folders
   * 
   * Returns all folders currently being watched with their status.
   * 
   * @returns JSON with folders array
   * 
   * @example
   * fetch('/mcp/list-folders')
   *   .then(r => r.json())
   *   .then(data => {
   *     data.folders.forEach(f => {
   *       console.log(f.path, f.status, f.filesIndexed);
   *     });
   *   });
   */
  router.get('/mcp/list-folders', async (req, res) => {
    try {
      console.log('📋 API: Listing indexed folders');

      const watchManager = (globalThis as any).fileWatchManager;
      if (!watchManager) {
        return res.status(500).json({
          error: 'FileWatchManager not initialized'
        });
      }

      const result = await handleListWatchedFolders(graphManager.getDriver());

      // Transform the response to match frontend expectations
      const folders = result.watches?.map((watch: any) => ({
        path: watch.containerPath || watch.folder, // Use containerPath (/workspace/...) instead of internal folder path
        recursive: watch.recursive,
        filePatterns: watch.file_patterns,
        status: watch.active ? 'active' : 'inactive',
        filesIndexed: typeof watch.files_indexed === 'object' ? watch.files_indexed.low : watch.files_indexed
      })) || [];

      res.json({ folders });
    } catch (error: any) {
      console.error('❌ List folders error:', error);
      res.status(500).json({
        error: 'Failed to list folders',
        details: error.message
      });
    }
  });

  return router;
}
