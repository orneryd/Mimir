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
 * Handle index_folder tool call - Index files and start watching for changes
 * 
 * @description Indexes all files in a directory into Neo4j and automatically
 * starts watching for file changes. Files are parsed, content extracted, and
 * optionally embedded with vector embeddings for semantic search. Respects
 * .gitignore patterns and supports custom file/ignore patterns.
 * 
 * Returns immediately while indexing happens asynchronously in the background.
 * Check logs or use list_folders to monitor progress.
 * 
 * @param params - Indexing parameters
 * @param params.path - Absolute path to folder (e.g., '/workspace/src/my-project')
 * @param params.recursive - Watch subdirectories recursively (default: true)
 * @param params.debounce_ms - Debounce delay for file events in ms (default: 500)
 * @param params.file_patterns - File patterns to watch (e.g., ['*.ts', '*.js'])
 * @param params.ignore_patterns - Additional ignore patterns beyond .gitignore
 * @param params.generate_embeddings - Generate vector embeddings (default: auto from config)
 * @param driver - Neo4j driver instance
 * @param watchManager - File watch manager instance
 * @param configManager - Watch config manager (optional, for testing)
 * 
 * @returns Promise with indexing status and metadata
 * 
 * @example
 * ```typescript
 * // Index a TypeScript project
 * const result = await handleIndexFolder({
 *   path: '/workspace/src/my-app',
 *   recursive: true,
 *   file_patterns: ['*.ts', '*.tsx'],
 *   ignore_patterns: ['*.test.ts', '*.spec.ts'],
 *   generate_embeddings: true
 * }, driver, watchManager);
 * // Returns: { status: 'success', path: '...', message: 'Indexing started...' }
 * ```
 * 
 * @example
 * ```typescript
 * // Index documentation files only
 * const result = await handleIndexFolder({
 *   path: '/workspace/docs',
 *   file_patterns: ['*.md', '*.mdx'],
 *   generate_embeddings: true
 * }, driver, watchManager);
 * ```
 * 
 * @example
 * ```typescript
 * // Index without embeddings (faster, no semantic search)
 * const result = await handleIndexFolder({
 *   path: '/workspace/config',
 *   file_patterns: ['*.json', '*.yaml'],
 *   generate_embeddings: false
 * }, driver, watchManager);
 * ```
 * 
 * @throws {Error} If path is invalid or doesn't exist
 */
export async function handleIndexFolder(
  params: any,
  driver: Driver,
  watchManager: FileWatchManager,
  configManager?: WatchConfigManager
): Promise<IndexFolderResponse> {
  const manager = configManager || new WatchConfigManager(driver);
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
  let config = await manager.getByPath(containerPath);
  
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

    config = await manager.createWatch(input);
    
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
 * Handle remove_folder tool call - Stop watching and remove indexed files
 * 
 * @description Stops watching a directory for changes and removes all indexed
 * files from the Neo4j database. This includes File nodes and their associated
 * FileChunk nodes. Use this to clean up when you no longer need a folder indexed.
 * 
 * @param params - Removal parameters
 * @param params.path - Path to folder to stop watching and remove
 * @param driver - Neo4j driver instance
 * @param watchManager - File watch manager instance
 * @param configManager - Watch config manager (optional, for testing)
 * 
 * @returns Promise with removal status and count of deleted files
 * 
 * @example
 * ```typescript
 * // Remove a folder from indexing
 * const result = await handleRemoveFolder({
 *   path: '/workspace/old-project'
 * }, driver, watchManager);
 * // Returns: { status: 'success', files_deleted: 42, chunks_deleted: 156 }
 * ```
 * 
 * @example
 * ```typescript
 * // Remove temporary files
 * const result = await handleRemoveFolder({
 *   path: '/workspace/temp'
 * }, driver, watchManager);
 * ```
 * 
 * @throws {Error} If path is invalid or not being watched
 */
export async function handleRemoveFolder(
  params: any,
  driver: Driver,
  watchManager: FileWatchManager,
  configManager?: WatchConfigManager
): Promise<any> {
  const manager = configManager || new WatchConfigManager(driver);
  
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
  
  const config = await manager.getByPath(containerPath);
  if (!config) {
    return {
      status: 'error',
      message: `Path '${resolvedPath}' (container: '${containerPath}') is not being watched.`
    };
  }

  // Stop watcher (using container path)
  await watchManager.stopWatch(containerPath);

  // Delete watch configuration from Neo4j
  await manager.delete(config.id);

  // Remove all indexed files and chunks from this folder (using container path)
  const session = driver.session();
  try {
    // Ensure path ends with separator to avoid false matches (e.g., /src matching /src-other)
    const folderPathWithSep = containerPath.endsWith('/') ? containerPath : containerPath + '/';
    
    const result = await session.run(`
      MATCH (f:File)
      WHERE f.path STARTS WITH $folderPathWithSep OR f.path = $exactPath
      OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:FileChunk)
      WITH f, collect(c) AS chunks, count(c) AS chunk_count
      // Delete chunks FIRST, then file
      FOREACH (chunk IN chunks | DETACH DELETE chunk)
      DETACH DELETE f
      RETURN count(f) AS files_deleted, sum(chunk_count) AS chunks_deleted
    `, { 
      folderPathWithSep,
      exactPath: containerPath
    });
    
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
 * Handle list_folders tool call - List all watched folders
 * 
 * @description Returns a list of all folders currently being watched for file
 * changes, along with their configuration (patterns, recursive, embeddings, etc.).
 * Useful for checking what's being indexed and monitoring indexing progress.
 * 
 * @param driver - Neo4j driver instance
 * @param configManager - Watch config manager (optional, for testing)
 * 
 * @returns Promise with list of watched folders and their configurations
 * 
 * @example
 * ```typescript
 * // List all watched folders
 * const result = await handleListWatchedFolders(driver);
 * // Returns: {
 * //   status: 'success',
 * //   folders: [
 * //     {
 * //       path: '/workspace/src',
 * //       recursive: true,
 * //       file_patterns: ['*.ts', '*.tsx'],
 * //       generate_embeddings: true
 * //     },
 * //     ...
 * //   ]
 * // }
 * ```
 * 
 * @example
 * ```typescript
 * // Check if a specific folder is being watched
 * const result = await handleListWatchedFolders(driver);
 * const isWatched = result.folders.some(f => f.path === '/workspace/src');
 * ```
 */
export async function handleListWatchedFolders(
  driver: Driver,
  configManager?: WatchConfigManager
): Promise<ListWatchedFoldersResponse> {
  const manager = configManager || new WatchConfigManager(driver);
  
  const configs = await manager.listAll();

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
