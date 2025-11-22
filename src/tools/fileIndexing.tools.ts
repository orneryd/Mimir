// ============================================================================
// File Indexing MCP Tools
// ============================================================================

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Driver } from 'neo4j-driver';
import { promises as fs } from 'fs';
import path from 'path';
import { FileWatchManager } from '../indexing/FileWatchManager.js';
import { WatchConfigManager } from '../indexing/WatchConfigManager.js';
import { LLMConfigLoader } from '../config/LLMConfigLoader.js';
import {
  translateHostToContainer,
  translateContainerToHost,
  validateAndSanitizePath,
  pathExists,
} from '../utils/path-utils.js';
import type {
  WatchConfigInput,
  WatchFolderResponse,
  IndexFolderResponse,
  ListWatchedFoldersResponse
} from '../types/index.js';

export function createFileIndexingTools(
  driver: Driver,
  watchManager: FileWatchManager
): Tool[] {
  const configManager = new WatchConfigManager(driver);

  return [
    // ========================================================================
    // index_folder
    // ========================================================================
    {
      name: 'index_folder',
      description: 'Index all files in a folder and automatically start watching it for changes. Files will be indexed into Neo4j and the folder will be monitored for future changes. REQUIRES: Path must exist on filesystem.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to folder to index and watch (e.g., /workspace/src/my-project)'
          },
          recursive: {
            type: 'boolean',
            description: 'Watch subdirectories recursively (default: true)',
            default: true
          },
          debounce_ms: {
            type: 'number',
            description: 'Debounce delay for file events in milliseconds (default: 500)',
            default: 500
          },
          file_patterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'File patterns to watch (e.g., ["*.ts", "*.js"]). Default: all files'
          },
          ignore_patterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional ignore patterns beyond .gitignore (e.g., ["*.test.ts"])'
          },
          generate_embeddings: {
            type: 'boolean',
            description: 'Generate vector embeddings (default: auto-detected from global config)'
          }
        },
        required: ['path']
      }
    },

    // ========================================================================
    // remove_folder
    // ========================================================================
    {
      name: 'remove_folder',
      description: 'Stop watching a folder and remove all indexed files from Neo4j. This will delete all File nodes for files under this path.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to folder to stop watching and remove from database'
          }
        },
        required: ['path']
      }
    },

    // ========================================================================
    // list_folders
    // ========================================================================
    {
      name: 'list_folders',
      description: 'List all folders currently being watched for file changes.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  ];
}

/**
 * Handle index_folder tool call - now combines watch and index
 * Returns immediately while indexing happens in the background
 */
export async function handleIndexFolder(
  params: any,
  driver: Driver,
  watchManager: FileWatchManager
): Promise<IndexFolderResponse> {
  const configManager = new WatchConfigManager(driver);
  const startTime = Date.now();

  // Sanitize and validate path input using new path utilities
  let resolvedPath: string;
  let containerPath: string;
  
  try {
    resolvedPath = validateAndSanitizePath(params.path);
    
    // Translate host path to container path
    containerPath = translateHostToContainer(resolvedPath);
  } catch (error) {
    return {
      status: 'error',
      error: 'invalid_path',
      message: error instanceof Error ? error.message : 'Invalid path provided',
      path: params.path
    };
  }
  
  console.log(`📍 Path translation: ${resolvedPath} -> ${containerPath}`);

  // Validation: Path exists (using container path)
  try {
    await fs.access(containerPath);
  } catch (error) {
    return {
      status: 'error',
      error: 'path_not_found',
      message: `Path '${resolvedPath}' (container: '${containerPath}') does not exist on filesystem.`,
      path: resolvedPath
    };
  }

  // Check global embeddings configuration
  const configLoader = LLMConfigLoader.getInstance();
  const embeddingsConfig = await configLoader.getEmbeddingsConfig();
  const globalEmbeddingsEnabled = embeddingsConfig?.enabled ?? false;
  
  // Use global setting if not explicitly overridden
  const generateEmbeddings = params.generate_embeddings ?? globalEmbeddingsEnabled;
  
  console.log(`🔍 Embeddings: global=${globalEmbeddingsEnabled}, requested=${params.generate_embeddings}, final=${generateEmbeddings}`);

  // Check if already watching (using container path)
  let config = await configManager.getByPath(containerPath);
  
  if (!config) {
    // Create watch config if it doesn't exist
    const input: WatchConfigInput = {
      path: containerPath,  // Store container path
      recursive: params.recursive ?? true,
      debounce_ms: params.debounce_ms ?? 500,
      file_patterns: params.file_patterns ?? null,
      ignore_patterns: params.ignore_patterns ?? [],
      generate_embeddings: generateEmbeddings
    };

    config = await configManager.createWatch(input);
    
    // Start watching
    await watchManager.startWatch(config);
  }

  // Start indexing in the background (don't await)
  // Use Promise to ensure it runs asynchronously without blocking the response
  Promise.resolve().then(async () => {
    try {
      console.log(`🚀 Starting background indexing for ${containerPath}`);
      const filesIndexed = await watchManager.indexFolder(containerPath, config!);
      const elapsed = Date.now() - startTime;
      console.log(`✅ Background indexing complete: ${filesIndexed} files indexed in ${elapsed}ms`);
    } catch (error) {
      console.error(`❌ Background indexing failed for ${containerPath}:`, error);
    }
  }).catch(error => {
    console.error(`❌ Unhandled error in background indexing:`, error);
  });

  // Return immediately
  const elapsed = Date.now() - startTime;

  return {
    status: 'success',
    path: resolvedPath,  // Return sanitized path to user
    containerPath: containerPath,  // Also include container path for transparency
    files_indexed: 0,  // Will be updated in background
    elapsed_ms: elapsed,
    message: 'Indexing started in background. Check logs for progress.'
  };
}

/**
 * Handle remove_folder tool call (renamed from unwatch_folder)
 */
export async function handleRemoveFolder(
  params: any,
  driver: Driver,
  watchManager: FileWatchManager
): Promise<any> {
  const configManager = new WatchConfigManager(driver);
  
  // Sanitize and validate path input using new path utilities
  let resolvedPath: string;
  let containerPath: string;
  
  try {
    resolvedPath = validateAndSanitizePath(params.path);
    
    // Translate host path to container path
    containerPath = translateHostToContainer(resolvedPath);
  } catch (error) {
    return {
      status: 'error',
      error: 'invalid_path',
      message: error instanceof Error ? error.message : 'Invalid path provided'
    };
  }
  
  console.log(`📍 Path translation for removal: ${resolvedPath} -> ${containerPath}`);
  
  const config = await configManager.getByPath(containerPath);
  if (!config) {
    return {
      status: 'error',
      message: `Path '${resolvedPath}' (container: '${containerPath}') is not being watched.`
    };
  }

  // Stop watcher (using container path)
  await watchManager.stopWatch(containerPath);

  // Mark inactive in Neo4j
  await configManager.markInactive(config.id);

  // Remove all indexed files and chunks from this folder (using container path)
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (f:File)
      WHERE f.path STARTS WITH $pathPrefix OR f.absolute_path STARTS WITH $pathPrefix
      OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:FileChunk)
      WITH f, collect(c) AS chunks, count(c) AS chunk_count
      // Delete chunks FIRST, then file
      FOREACH (chunk IN chunks | DETACH DELETE chunk)
      DETACH DELETE f
      RETURN count(f) AS files_deleted, sum(chunk_count) AS chunks_deleted
    `, { pathPrefix: containerPath });
    
    const record = result.records[0];
    const filesDeleted = record?.get('files_deleted')?.toNumber() || 0;
    const chunksDeleted = record?.get('chunks_deleted')?.toNumber() || 0;
    
    return {
      status: 'success',
      path: params.path,  // Return original path to user
      containerPath: containerPath,  // Also include container path for transparency
      files_removed: filesDeleted,
      chunks_removed: chunksDeleted,
      message: `Folder watch stopped. Removed ${filesDeleted} files and ${chunksDeleted} chunks from database.`
    };
  } finally {
    await session.close();
  }
}

/**
 * Handle list_folders tool call
 */
export async function handleListWatchedFolders(
  driver: Driver
): Promise<ListWatchedFoldersResponse> {
  const configManager = new WatchConfigManager(driver);
  
  const configs = await configManager.listAll();

  // Ensure configs is an array
  const configArray = Array.isArray(configs) ? configs : [];

  return {
    watches: configArray.map(config => ({
      watch_id: config.id,
      folder: translateContainerToHost(config.path),  // Translate back to host path for display
      containerPath: config.path,  // Also show container path
      recursive: config.recursive,
      files_indexed: config.files_indexed || 0,
      last_update: config.last_updated || config.added_date,
      active: config.status === 'active'
    })),
    total: configArray.length
  };
}
