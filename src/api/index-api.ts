import { Router, Request, Response } from 'express';
import { FileWatchManager } from '../indexing/FileWatchManager.js';
import { WatchConfigManager } from '../indexing/WatchConfigManager.js';
import neo4j from 'neo4j-driver';
import { validateAndSanitizePath, translateHostToContainer, getHostWorkspaceRoot } from '../utils/path-utils.js';
import { promises as fs } from 'fs';

const router = Router();

// Get FileWatchManager instance from global (set in http-server.ts)
const getWatchManager = (): FileWatchManager => {
  const manager = (globalThis as any).fileWatchManager;
  if (!manager) {
    throw new Error('FileWatchManager not initialized');
  }
  return manager;
};

/**
 * GET /api/indexed-folders
 * Returns list of all folders currently being watched/indexed
 */
router.get('/indexed-folders', async (req: Request, res: Response) => {
  let driver: neo4j.Driver | null = null;
  
  try {
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const configManager = new WatchConfigManager(driver);
    const watchConfigs = await configManager.listAll();
    
    // Use separate session for each query to avoid transaction conflicts
    const folders = await Promise.all(
      watchConfigs.map(async (config) => {
        const session = driver!.session();
        try {
          // Translate host path to container path for querying files
          // Files may be stored with different path formats:
          // 1. Container path: /workspace/ngx-cmk-translate/...
          // 2. Full host path: /Users/c815719/src/ngx-cmk-translate/...
          // 3. Tilde host path: ~/src/ngx-cmk-translate/... (legacy)
          const containerPath = translateHostToContainer(config.path);
          const containerFolderPath = containerPath.endsWith('/') ? containerPath : containerPath + '/';
          
          // Also check for host path format (config.path might be host or container)
          const hostFolderPath = config.path.endsWith('/') ? config.path : config.path + '/';
          
          // Check for tilde-based path (legacy format)
          const hostWorkspaceRoot = getHostWorkspaceRoot();
          let tildeFolderPath = null;
          if (config.path.startsWith(hostWorkspaceRoot)) {
            // Convert /Users/c815719/src/folder -> ~/src/folder
            const relativePath = config.path.substring(hostWorkspaceRoot.length);
            tildeFolderPath = `~/src${relativePath}/`;
          }
          
          const result = await session.run(
            `
            MATCH (f:File)
            WHERE f.path STARTS WITH $containerFolderPath OR f.path = $containerPath
               OR f.path STARTS WITH $hostFolderPath OR f.path = $hostPath
               OR ($tildeFolderPath IS NOT NULL AND (f.path STARTS WITH $tildeFolderPath OR f.path = $tildePath))
            WITH DISTINCT f
            OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:FileChunk)
            WITH f, c, 
                 CASE WHEN c IS NOT NULL AND c.embedding IS NOT NULL THEN 1 ELSE 0 END as chunkHasEmbedding,
                 CASE WHEN f.embedding IS NOT NULL THEN 1 ELSE 0 END as fileHasEmbedding
            RETURN 
              COUNT(DISTINCT f) as fileCount,
              COUNT(DISTINCT c) as chunkCount,
              SUM(chunkHasEmbedding) + SUM(fileHasEmbedding) as embeddingCount
            `,
            { 
              containerFolderPath,
              containerPath,
              hostFolderPath,
              hostPath: config.path,
              tildeFolderPath,
              tildePath: tildeFolderPath ? tildeFolderPath.slice(0, -1) : null
            }
          );

          const record = result.records[0];
          const fileCount = record ? record.get('fileCount').toInt() : 0;
          const chunkCount = record ? record.get('chunkCount').toInt() : 0;
          const embeddingCount = record ? record.get('embeddingCount').toInt() : 0;

          // Convert Neo4j DateTime to ISO string
          const lastSyncDate: any = config.last_indexed || config.added_date;
          const lastSyncString = lastSyncDate 
            ? (typeof lastSyncDate === 'string' ? lastSyncDate : lastSyncDate.toString())
            : new Date().toISOString();

          return {
            id: config.id,
            path: config.path,
            hostPath: config.host_path,
            fileCount,
            chunkCount,
            embeddingCount,
            status: config.status || 'active',
            error: config.error || null,
            lastSync: lastSyncString,
            patterns: config.file_patterns
          };
        } finally {
          await session.close();
        }
      })
    );

    res.json({ folders });
  } catch (error: any) {
    console.error('❌ Error fetching indexed folders:', error);
    res.status(500).json({ 
      error: 'Failed to fetch indexed folders', 
      details: error.message 
    });
  } finally {
    if (driver) {
      await driver.close();
    }
  }
});

/**
 * POST /api/index-folder
 * Adds a new folder to the watch/index system
 */
router.post('/index-folder', async (req: Request, res: Response) => {
  try {
    const { path: inputPath, recursive, generate_embeddings, file_patterns, ignore_patterns } = req.body;

    if (!inputPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Sanitize and validate path input using path utilities (same as MCP tools)
    let resolvedPath: string;
    let containerPath: string;
    
    try {
      resolvedPath = validateAndSanitizePath(inputPath);
      
      // Translate host path to container path
      containerPath = translateHostToContainer(resolvedPath);
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid path',
        message: error instanceof Error ? error.message : 'Invalid path provided',
        path: inputPath
      });
    }
    
    console.log(`📍 Path translation: ${resolvedPath} -> ${containerPath}`);

    // Validation: Path exists (using container path)
    try {
      await fs.access(containerPath);
    } catch (error) {
      return res.status(400).json({
        error: 'Path does not exist',
        message: `Path '${resolvedPath}' (container: '${containerPath}') does not exist on filesystem.`,
        path: resolvedPath
      });
    }

    // Check if it's a directory
    try {
      const stats = await fs.stat(containerPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({
          error: 'Path is not a directory',
          message: `Path '${resolvedPath}' is not a directory.`,
          path: resolvedPath
        });
      }
    } catch (error) {
      return res.status(400).json({
        error: 'Cannot stat path',
        message: error instanceof Error ? error.message : 'Failed to check path',
        path: resolvedPath
      });
    }

    console.log(`📁 Adding folder to indexing: ${containerPath}`);
    console.log(`   Resolved path: ${resolvedPath}`);
    console.log(`   Container path: ${containerPath}`);
    console.log(`   Recursive: ${recursive !== false}`);
    console.log(`   Generate embeddings: ${generate_embeddings !== false}`);

    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const configManager = new WatchConfigManager(driver);
    
    // Check if already watching (use container path)
    const existing = await configManager.getByPath(containerPath);
    if (existing) {
      await driver.close();
      return res.status(409).json({ 
        error: 'Folder is already being watched', 
        path: resolvedPath,
        containerPath: containerPath,
        existingConfig: existing
      });
    }

    // Create watch configuration (use host path for consistency)
    const config = await configManager.createWatch({
      path: resolvedPath,  // Store host path (for UI/SSE matching)
      host_path: resolvedPath,  // Store resolved host path
      recursive: recursive !== false,
      generate_embeddings: generate_embeddings !== false,
      file_patterns,
      ignore_patterns,
      debounce_ms: 500
    });

    await driver.close();

    // Start watching in background (don't await - let it run async)
    const watchManager = getWatchManager();
    watchManager.startWatch(config).catch((error) => {
      console.error(`❌ Error during background indexing for ${containerPath}:`, error);
    });

    // Return immediately - indexing continues in background
    res.json({ 
      success: true, 
      message: `Folder added to indexing: ${resolvedPath}. Indexing will continue in the background.`,
      path: resolvedPath,  // Return sanitized path to user
      containerPath: containerPath,  // Also include container path for transparency
      config
    });
  } catch (error: any) {
    console.error('❌ Error adding folder to indexing:', error);
    res.status(500).json({ 
      error: 'Failed to add folder to indexing', 
      message: error.message 
    });
  }
});

/**
 * DELETE /api/indexed-folders
 * Removes a folder from the watch/index system and deletes its indexed data
 */
router.delete('/indexed-folders', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Watch config ID is required' });
    }

    console.log(`🗑️ Removing watch config by ID: ${id}`);

    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const configManager = new WatchConfigManager(driver);
    
    // Get config by ID
    const config = await configManager.getById(id);
    if (!config) {
      await driver.close();
      return res.status(404).json({ 
        error: 'Watch configuration not found', 
        id
      });
    }

    const containerPath = config.path;
    const resolvedPath = config.host_path || config.path;

    console.log(`   Container path: ${containerPath}`);
    console.log(`   Host path: ${resolvedPath}`);

    // Stop watching (use container path)
    const watchManager = getWatchManager();
    await watchManager.stopWatch(containerPath);

    // Delete watch configuration
    await configManager.delete(config.id);

    // Delete indexed files and chunks for this folder
    const session = driver.session();
    try {
      // Ensure path ends with separator to avoid false matches (e.g., /src matching /src-other)
      const folderPathWithSep = containerPath.endsWith('/') ? containerPath : containerPath + '/';
      
      // Delete File nodes and their FileChunk children
      const fileResult = await session.run(
        `
        MATCH (f:File)
        WHERE f.path STARTS WITH $folderPathWithSep OR f.path = $exactPath
        OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:FileChunk)
        DETACH DELETE f, c
        RETURN count(DISTINCT f) as fileCount, count(DISTINCT c) as chunkCount
        `,
        { 
          folderPathWithSep,
          exactPath: containerPath
        }
      );
      
      const stats = fileResult.records[0];
      const deletedFiles = stats ? stats.get('fileCount').toInt() : 0;
      const deletedChunks = stats ? stats.get('chunkCount').toInt() : 0;
      
      console.log(`🗑️  Deleted ${deletedFiles} files and ${deletedChunks} file chunks`);
    } finally {
      await session.close();
      await driver.close();
    }

    res.json({ 
      success: true, 
      message: `Folder removed from indexing: ${resolvedPath}`,
      path: resolvedPath,
      containerPath: containerPath
    });
  } catch (error: any) {
    console.error('❌ Error removing folder from indexing:', error);
    res.status(500).json({ 
      error: 'Failed to remove folder from indexing', 
      details: error.message 
    });
  }
});

/**
 * PATCH /api/indexed-folders/reactivate
 * Reactivates an inactive watch configuration
 */
router.patch('/indexed-folders/reactivate', async (req: Request, res: Response) => {
  let driver: neo4j.Driver | null = null;
  
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Watch config ID is required' });
    }

    console.log(`🔄 Reactivating watch config by ID: ${id}`);

    driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const configManager = new WatchConfigManager(driver);
    
    // Get config by ID
    const config = await configManager.getById(id);
    
    if (!config) {
      return res.status(404).json({ 
        error: 'Watch configuration not found', 
        id
      });
    }

    // Determine which is the host path and which is the container path
    // If config.path looks like a host path (e.g., /Users/...), translate it
    const hostPath = config.host_path || config.path;
    let containerPath = config.path;
    
    // If path stored in DB is a host path (not already translated), translate it now
    if (!containerPath.startsWith('/workspace') && !containerPath.startsWith('/app')) {
      containerPath = translateHostToContainer(containerPath);
      console.log(`   Translated path: ${config.path} -> ${containerPath}`);
    }

    console.log(`   Container path: ${containerPath}`);
    console.log(`   Host path: ${hostPath}`);

    if (config.status === 'active') {
      return res.status(400).json({ 
        error: 'Watch is already active', 
        id,
        path: hostPath
      });
    }

    // Reactivate the watch configuration in DB
    await configManager.reactivate(config.id);

    // Start watching again in background (don't await - let it run async)
    const watchManager = getWatchManager();
    watchManager.startWatch({
      id: config.id,
      path: containerPath,  // Use translated container path
      host_path: hostPath,  // Use host path for display
      recursive: config.recursive,
      debounce_ms: config.debounce_ms,
      file_patterns: config.file_patterns,
      ignore_patterns: config.ignore_patterns || [],
      generate_embeddings: config.generate_embeddings || false,
      status: 'active',
      added_date: config.added_date,
      last_indexed: config.last_indexed,
      last_updated: new Date().toISOString(),
      files_indexed: config.files_indexed || 0,
      error: undefined
    }).catch((error) => {
      console.error(`❌ Background indexing error for ${config.id}:`, error);
    });

    console.log(`✅ Reactivated watch for: ${hostPath}`);

    res.json({ 
      success: true, 
      message: `Watch reactivated: ${hostPath}`,
      id: config.id,
      path: hostPath,
      containerPath: containerPath
    });
  } catch (error: any) {
    console.error('❌ Error reactivating watch:', error);
    res.status(500).json({ 
      error: 'Failed to reactivate watch', 
      details: error.message 
    });
  } finally {
    if (driver) {
      await driver.close();
    }
  }
});

/**
 * GET /api/index-config
 * Returns environment configuration for path translation
 */
router.get('/index-config', async (req: Request, res: Response) => {
  try {
    const config = {
      hostWorkspaceRoot: getHostWorkspaceRoot(),
      workspaceRoot: process.env.WORKSPACE_ROOT || '',
      home: process.env.HOME || process.env.USERPROFILE || '',
    };
    
    res.json(config);
  } catch (error: any) {
    console.error('Error getting index config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/indexing-status
 * Returns the indexing status for all folders
 */
router.get('/indexing-status', async (req: Request, res: Response) => {
  try {
    const watchManager = getWatchManager();
    const statuses: { path: string; isIndexing: boolean }[] = [];
    
    // Get all watched folders and check their indexing status
    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );
    
    const configManager = new WatchConfigManager(driver);
    const watchConfigs = await configManager.listAll();
    
    for (const config of watchConfigs) {
      statuses.push({
        path: config.path,
        isIndexing: watchManager.isIndexing(config.path)
      });
    }
    
    await driver.close();
    
    res.json({ statuses });
  } catch (error: any) {
    console.error('Error getting indexing status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * OPTIONS /api/indexing-progress
 * CORS preflight for SSE endpoint
 */
router.options('/indexing-progress', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.sendStatus(204);
});

/**
 * GET /api/indexing-progress (SSE)
 * Streams real-time indexing progress updates for all active indexing jobs
 */
router.get('/indexing-progress', (req: Request, res: Response) => {
  // Set CORS headers for webview compatibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  // Ensure response is flushed immediately
  res.flushHeaders();

  const watchManager = getWatchManager();

  // Send initial progress for all active jobs
  const allProgress = watchManager.getAllProgress();
  console.log(`[SSE] New client connected. Sending ${allProgress.length} initial progress updates`);
  for (const progress of allProgress) {
    const data = JSON.stringify(progress);
    console.log(`[SSE] Initial progress for path: ${progress.path} (${progress.indexed}/${progress.totalFiles}) status: ${progress.status}`);
    res.write(`data: ${data}\n\n`);
  }

  // Register callback for real-time progress updates (per-file)
  const unsubscribe = watchManager.onProgress((progress) => {
    try {
      const data = JSON.stringify(progress);
      console.log(`[SSE] Sending progress for path: ${progress.path} (${progress.indexed}/${progress.totalFiles})`);
      res.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('Error sending SSE progress:', error);
    }
  });

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeatId = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (error) {
      clearInterval(heartbeatId);
    }
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    unsubscribe();
    clearInterval(heartbeatId);
    console.log('📡 SSE client disconnected from indexing progress');
  });

  console.log('📡 SSE client connected to indexing progress');
});

/**
 * GET /api/index-stats
 * Returns aggregate statistics about all indexed content
 */
router.get('/index-stats', async (req: Request, res: Response) => {
  try {
    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const session = driver.session();

    try {
      // Get aggregate stats
      const statsResult = await session.run(`
        MATCH (f:File)
        OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:FileChunk)
        WITH f, c,
          CASE WHEN c IS NOT NULL AND c.embedding IS NOT NULL THEN 1 ELSE 0 END as chunkHasEmbedding,
          CASE WHEN f.embedding IS NOT NULL THEN 1 ELSE 0 END as fileHasEmbedding
        WITH 
          COUNT(DISTINCT f) as totalFiles,
          COUNT(DISTINCT c) as totalChunks,
          SUM(chunkHasEmbedding) + SUM(fileHasEmbedding) as totalEmbeddings,
          COLLECT(DISTINCT f.extension) as extensions
        RETURN 
          totalFiles,
          totalChunks,
          totalEmbeddings,
          extensions
      `);

      const statsRecord = statsResult.records[0];
      const totalFiles = statsRecord ? statsRecord.get('totalFiles').toInt() : 0;
      const totalChunks = statsRecord ? statsRecord.get('totalChunks').toInt() : 0;
      const totalEmbeddings = statsRecord ? statsRecord.get('totalEmbeddings').toInt() : 0;

      // Get file count by extension
      const extensionResult = await session.run(`
        MATCH (f:File)
        WHERE f.extension IS NOT NULL
        WITH f.extension as ext, COUNT(f) as count
        RETURN ext, count
        ORDER BY count DESC
      `);

      const byExtension: Record<string, number> = {};
      extensionResult.records.forEach(record => {
        const ext = record.get('ext');
        const count = record.get('count').toInt();
        byExtension[ext || '(no extension)'] = count;
      });

      // Get file count by type (node label)
      const typeResult = await session.run(`
        MATCH (f:File)
        WITH f, [label IN labels(f) WHERE label <> 'File'] as filteredLabels
        UNWIND filteredLabels as label
        WITH label, COUNT(f) as count
        RETURN label as type, count
        ORDER BY count DESC
      `);

      const byType: Record<string, number> = {};
      typeResult.records.forEach(record => {
        const type = record.get('type');
        const count = record.get('count').toInt();
        byType[type] = count;
      });

      // Count watched folders
      const configManager = new WatchConfigManager(driver);
      const watchConfigs = await configManager.listAll();

      res.json({
        totalFolders: watchConfigs.length,
        totalFiles,
        totalChunks,
        totalEmbeddings,
        byType,
        byExtension
      });
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error: any) {
    console.error('❌ Error fetching index stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch index stats', 
      details: error.message 
    });
  }
});

/**
 * POST /api/migrate-indexed-folders
 * Creates WatchConfig nodes for existing indexed folders (only for paths that exist on filesystem)
 */
router.post('/migrate-indexed-folders', async (req: Request, res: Response) => {
  try {
    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const session = driver.session();
    const configManager = new WatchConfigManager(driver);

    try {
      // Find all unique root folders
      const foldersResult = await session.run(`
        MATCH (f:File)
        WITH SPLIT(f.path, '/')[0..3] as pathParts, f
        WITH '/' + pathParts[0] + '/' + pathParts[1] + '/' + pathParts[2] + '/' + pathParts[3] as rootFolder, 
             COUNT(DISTINCT f) as fileCount
        WHERE fileCount > 0
        RETURN DISTINCT rootFolder
        ORDER BY rootFolder
      `);

      const migratedFolders = [];
      const skippedFolders = [];

      for (const record of foldersResult.records) {
        const folderPath = record.get('rootFolder');

        // Skip null or invalid paths
        if (!folderPath || typeof folderPath !== 'string') {
          skippedFolders.push({
            path: folderPath,
            reason: 'Invalid or null path'
          });
          continue;
        }

        // Check if WatchConfig already exists
        const existing = await configManager.getByPath(folderPath);
        if (existing) {
          skippedFolders.push({
            path: folderPath,
            reason: 'WatchConfig already exists'
          });
          continue;
        }

        // Check if path actually exists on filesystem
        try {
          await fs.access(folderPath);
        } catch {
          skippedFolders.push({
            path: folderPath,
            reason: 'Path does not exist on filesystem'
          });
          console.log(`⏭️  Skipping non-existent path: ${folderPath}`);
          continue;
        }

        // Create WatchConfig for this folder
        try {
          await configManager.createWatch({
            path: folderPath,
            recursive: true,
            generate_embeddings: false, // Don't re-generate embeddings
            file_patterns: null,
            ignore_patterns: [],
            debounce_ms: 500
          });

          migratedFolders.push(folderPath);
          console.log(`✅ Created WatchConfig for: ${folderPath}`);
        } catch (error: any) {
          skippedFolders.push({
            path: folderPath,
            reason: error.message
          });
          console.error(`❌ Failed to create WatchConfig for ${folderPath}:`, error.message);
        }
      }

      res.json({
        success: true,
        migratedCount: migratedFolders.length,
        skippedCount: skippedFolders.length,
        migrated: migratedFolders,
        skipped: skippedFolders
      });
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error: any) {
    console.error('❌ Error migrating indexed folders:', error);
    res.status(500).json({
      error: 'Failed to migrate indexed folders',
      details: error.message
    });
  }
});

/**
 * POST /api/migrate-file-paths
 * Migrates existing File nodes to new path structure:
 * OLD: f.path (relative) + f.absolute_path (container)
 * NEW: f.path (container) + f.host_path (host)
 */
router.post('/api/migrate-file-paths', async (req: Request, res: Response) => {
  try {
    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const session = driver.session();
    const workspaceRoot = process.env.WORKSPACE_ROOT || '';
    const hostWorkspaceRoot = getHostWorkspaceRoot();

    try {
      // Get all File nodes with old structure
      const files = await session.run(`
        MATCH (f:File)
        WHERE f.absolute_path IS NOT NULL
        RETURN f.path as oldPath, f.absolute_path as containerPath, id(f) as nodeId
        LIMIT 1000
      `);

      let migrated = 0;
      let skipped = 0;

      for (const record of files.records) {
        const containerPath = record.get('containerPath');
        const nodeId = record.get('nodeId');
        
        if (!containerPath) {
          skipped++;
          continue;
        }

        // Calculate host path
        let hostPath = containerPath;
        if (hostWorkspaceRoot) {
          // Ensure root ends with separator to avoid false matches
          const rootWithSep = workspaceRoot.endsWith('/') ? workspaceRoot : `${workspaceRoot}/`;
          
          // Check if path starts with root (with separator) or is exact match
          if (containerPath.startsWith(rootWithSep) || containerPath === workspaceRoot) {
            hostPath = containerPath.replace(workspaceRoot, hostWorkspaceRoot);
          }
        }

        // Update the node
        await session.run(`
          MATCH (f:File)
          WHERE id(f) = $nodeId
          SET 
            f.path = $containerPath,
            f.host_path = $hostPath
          REMOVE f.absolute_path
        `, {
          nodeId,
          containerPath,
          hostPath
        });

        migrated++;
      }

      res.json({
        success: true,
        migrated,
        skipped,
        total: files.records.length,
        workspaceRoot,
        hostWorkspaceRoot: hostWorkspaceRoot || '(not set - non-Docker mode)'
      });

      console.log(`✅ Migrated ${migrated} file paths`);
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error: any) {
    console.error('❌ Error migrating file paths:', error);
    res.status(500).json({
      error: 'Failed to migrate file paths',
      details: error.message
    });
  }
});

/**
 * GET /api/debug-file-paths
 * Returns sample file paths to diagnose indexing issues
 */
router.get('/debug-file-paths', async (req: Request, res: Response) => {
  try {
    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const session = driver.session();

    try {
      const result = await session.run(`
        MATCH (f:File)
        RETURN f.path as path
        LIMIT 20
      `);

      const paths = result.records.map(r => r.get('path'));
      
      // Group by root folder
      const rootFolders = new Map<string, number>();
      paths.forEach(path => {
        if (path) {
          const parts = path.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const root = `/${parts[0]}/${parts[1]}`;
            rootFolders.set(root, (rootFolders.get(root) || 0) + 1);
          }
        }
      });

      res.json({
        samplePaths: paths,
        rootFolders: Array.from(rootFolders.entries()).map(([path, count]) => ({ path, count }))
      });
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error: any) {
    console.error('❌ Error fetching debug paths:', error);
    res.status(500).json({
      error: 'Failed to fetch debug paths',
      details: error.message
    });
  }
});

/**
 * POST /api/cleanup-invalid-watchconfigs
 * Removes WatchConfig nodes with path_not_found errors and File nodes with null paths
 */
router.post('/cleanup-invalid-watchconfigs', async (req: Request, res: Response) => {
  try {
    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const session = driver.session();

    try {
      // Delete WatchConfig nodes with path_not_found error
      const watchConfigResult = await session.run(`
        MATCH (w:WatchConfig)
        WHERE w.error = 'path_not_found' OR w.status = 'inactive'
        WITH w, w.path as path, w.error as error
        DELETE w
        RETURN path, error
      `);

      const deletedWatchConfigs = watchConfigResult.records.map(r => ({
        path: r.get('path'),
        error: r.get('error')
      }));

      // Delete File nodes with null or invalid paths (and their chunks/embeddings)
      const fileResult = await session.run(`
        MATCH (f:File)
        WHERE f.path IS NULL OR f.path = ''
        OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:FileChunk)
        OPTIONAL MATCH (c)-[:HAS_EMBEDDING]->(e)
        WITH f, c, e, f.path as path
        DETACH DELETE f, c, e
        RETURN count(DISTINCT f) as fileCount, count(DISTINCT c) as chunkCount, count(DISTINCT e) as embeddingCount
      `);

      const fileStats = fileResult.records[0];
      const deletedFiles = fileStats ? fileStats.get('fileCount').toInt() : 0;
      const deletedChunks = fileStats ? fileStats.get('chunkCount').toInt() : 0;
      const deletedEmbeddings = fileStats ? fileStats.get('embeddingCount').toInt() : 0;

      res.json({
        success: true,
        watchConfigs: {
          deletedCount: deletedWatchConfigs.length,
          deleted: deletedWatchConfigs
        },
        files: {
          deletedFiles,
          deletedChunks,
          deletedEmbeddings
        }
      });

      console.log(`✅ Cleanup complete:`);
      console.log(`   - Removed ${deletedWatchConfigs.length} invalid WatchConfig nodes`);
      console.log(`   - Deleted ${deletedFiles} File nodes with null paths`);
      console.log(`   - Deleted ${deletedChunks} orphaned chunks`);
      console.log(`   - Deleted ${deletedEmbeddings} orphaned embeddings`);
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error: any) {
    console.error('❌ Error cleaning up invalid data:', error);
    res.status(500).json({
      error: 'Failed to cleanup invalid data',
      details: error.message
    });
  }
});

/**
 * POST /api/migrate-watchconfig-paths
 * Migrates all existing WatchConfig nodes to include host_path
 */
router.post('/migrate-watchconfig-paths', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Migrating WatchConfig nodes to include host_path...');
    
    const driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'your_password_here'
      )
    );

    const session = driver.session();

    try {
      // Helper function to translate container path to host path
      const translateToHostPath = (containerPath: string): string => {
        const containerWorkspaceRoot = process.env.WORKSPACE_ROOT || '';
        const hostWorkspaceRoot = getHostWorkspaceRoot();
        
        // Ensure root ends with separator to avoid false matches
        const rootWithSep = containerWorkspaceRoot.endsWith('/') ? containerWorkspaceRoot : `${containerWorkspaceRoot}/`;
        
        // Check if path starts with root (with separator) or is exact match
        if (containerPath.startsWith(rootWithSep) || containerPath === containerWorkspaceRoot) {
          return containerPath.replace(containerWorkspaceRoot, hostWorkspaceRoot);
        }
        
        // If it doesn't start with container workspace root, return as-is
        return containerPath;
      };

      // Get all WatchConfig nodes
      const watchConfigsResult = await session.run(`
        MATCH (w:WatchConfig)
        RETURN w.id as id, w.path as path, w.host_path as hostPath
      `);

      const updates = [];
      for (const record of watchConfigsResult.records) {
        const id = record.get('id');
        const path = record.get('path');
        const existingHostPath = record.get('hostPath');

        // Only update if host_path is missing
        if (!existingHostPath && path) {
          const hostPath = translateToHostPath(path);
          
          await session.run(`
            MATCH (w:WatchConfig {id: $id})
            SET w.host_path = $hostPath
          `, { id, hostPath });

          updates.push({
            id,
            path,
            hostPath
          });
        }
      }

      res.json({
        success: true,
        updatedCount: updates.length,
        updates
      });

      console.log(`✅ Migration complete: Updated ${updates.length} WatchConfig nodes`);
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (error: any) {
    console.error('❌ Error migrating WatchConfig paths:', error);
    res.status(500).json({
      error: 'Failed to migrate WatchConfig paths',
      details: error.message
    });
  }
});

export default router;
