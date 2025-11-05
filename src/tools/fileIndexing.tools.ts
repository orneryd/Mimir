// ============================================================================
// File Indexing MCP Tools
// ============================================================================

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Driver } from 'neo4j-driver';
import { promises as fs } from 'fs';
import { FileWatchManager } from '../indexing/FileWatchManager.js';
import { WatchConfigManager } from '../indexing/WatchConfigManager.js';
import { LLMConfigLoader } from '../config/LLMConfigLoader.js';
import type {
  WatchConfigInput,
  WatchFolderResponse,
  IndexFolderResponse,
  ListWatchedFoldersResponse
} from '../types/index.js';

// ============================================================================
// Path Translation Utilities
// ============================================================================

/**
 * Detect if we're running in Docker container
 */
function isRunningInDocker(): boolean {
  const isDocker = process.env.WORKSPACE_ROOT === '/workspace';
  console.log(`🐳 Docker detection: WORKSPACE_ROOT=${process.env.WORKSPACE_ROOT}, isDocker=${isDocker}`);
  return isDocker;
}

/**
 * Get the host workspace root from environment
 * Default: ~/src (expanded to actual home directory)
 * When running in Docker, HOST_WORKSPACE_ROOT should be pre-expanded by docker-compose
 */
function getHostWorkspaceRoot(): string {
  const hostRoot = process.env.HOST_WORKSPACE_ROOT;
  
  // If not set, use default
  if (!hostRoot) {
    const defaultRoot = '~/src';
    // Only expand ~ if not in Docker (in Docker, this would be wrong)
    if (!isRunningInDocker() && defaultRoot.startsWith('~/')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const expanded = defaultRoot.replace('~', homeDir);
      console.log(`🏠 Host workspace root (default): ${defaultRoot} → ${expanded}`);
      return expanded;
    }
    console.log(`🏠 Host workspace root (default): ${defaultRoot}`);
    return defaultRoot;
  }
  
  // HOST_WORKSPACE_ROOT is set - use it as-is (should be pre-expanded)
  console.log(`🏠 Host workspace root (from env): ${hostRoot}`);
  return hostRoot;
}

/**
 * Translate host path to container path
 * Example: /Users/username/src/project -> /workspace/project
 */
function translateHostToContainer(hostPath: string): string {
  if (!isRunningInDocker()) {
    return hostPath; // Not in Docker, use path as-is
  }

  const hostRoot = getHostWorkspaceRoot();
  
  // Normalize paths (remove trailing slashes)
  const normalizedHostRoot = hostRoot.replace(/\/$/, '');
  const normalizedHostPath = hostPath.replace(/\/$/, '');
  
  // Check if the path starts with the host root
  if (normalizedHostPath.startsWith(normalizedHostRoot)) {
    // Replace host root with container workspace
    const relativePath = normalizedHostPath.substring(normalizedHostRoot.length);
    return `/workspace${relativePath}`;
  }
  
  // If path doesn't start with host root, assume it's already a container path
  return hostPath;
}

/**
 * Translate container path to host path
 * Example: /workspace/project -> /Users/username/src/project
 */
function translateContainerToHost(containerPath: string): string {
  if (!isRunningInDocker()) {
    return containerPath; // Not in Docker, use path as-is
  }

  const hostRoot = getHostWorkspaceRoot();
  
  // Normalize paths
  const normalizedContainerPath = containerPath.replace(/\/$/, '');
  
  // Check if the path starts with /workspace
  if (normalizedContainerPath.startsWith('/workspace')) {
    // Replace /workspace with host root
    const relativePath = normalizedContainerPath.substring('/workspace'.length);
    return `${hostRoot}${relativePath}`;
  }
  
  // If path doesn't start with /workspace, return as-is
  return containerPath;
}

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
            description: 'Generate vector embeddings (default: auto-detected from global config)',
            default: undefined
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
        properties: {}
      }
    }
  ];
}

/**
 * Handle index_folder tool call - now combines watch and index
 */
export async function handleIndexFolder(
  params: any,
  driver: Driver,
  watchManager: FileWatchManager
): Promise<IndexFolderResponse> {
  const configManager = new WatchConfigManager(driver);
  const startTime = Date.now();

  // Translate host path to container path if running in Docker
  const userProvidedPath = params.path;
  const containerPath = translateHostToContainer(userProvidedPath);
  
  console.log(`📍 Path translation: ${userProvidedPath} -> ${containerPath}`);

  // Validation: Path exists (using container path)
  try {
    await fs.access(containerPath);
  } catch (error) {
    return {
      status: 'error',
      error: 'path_not_found',
      message: `Path '${userProvidedPath}' (container: '${containerPath}') does not exist on filesystem.`,
      path: userProvidedPath
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

  // Index all files (using container path)
  const filesIndexed = await watchManager.indexFolder(containerPath, config);

  const elapsed = Date.now() - startTime;

  return {
    status: 'success',
    path: userProvidedPath,  // Return original path to user
    containerPath: containerPath,  // Also include container path for transparency
    files_indexed: filesIndexed,
    elapsed_ms: elapsed
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
  
  // Translate host path to container path if running in Docker
  const userProvidedPath = params.path;
  const containerPath = translateHostToContainer(userProvidedPath);
  
  console.log(`📍 Path translation for removal: ${userProvidedPath} -> ${containerPath}`);
  
  const config = await configManager.getByPath(containerPath);
  if (!config) {
    return {
      status: 'error',
      message: `Path '${userProvidedPath}' (container: '${containerPath}') is not being watched.`
    };
  }

  // Stop watcher (using container path)
  await watchManager.stopWatch(containerPath);

  // Mark inactive in Neo4j
  await configManager.markInactive(config.id);

  // Remove all indexed files from this folder (using container path)
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (f:File)
      WHERE f.path STARTS WITH $pathPrefix OR f.absolute_path STARTS WITH $pathPrefix
      DETACH DELETE f
      RETURN count(f) AS deleted
    `, { pathPrefix: containerPath });
    
    const deleted = result.records[0]?.get('deleted')?.toNumber() || 0;
    
    return {
      status: 'success',
      path: userProvidedPath,  // Return original path to user
      containerPath: containerPath,  // Also include container path for transparency
      files_removed: deleted,
      message: `Folder watch stopped and ${deleted} indexed files removed from database.`
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
  
  const configs = await configManager.listActive();

  return {
    watches: configs.map(config => ({
      watch_id: config.id,
      folder: translateContainerToHost(config.path),  // Translate back to host path for display
      containerPath: config.path,  // Also show container path
      recursive: config.recursive,
      files_indexed: config.files_indexed || 0,
      last_update: config.last_updated || config.added_date,
      active: config.status === 'active'
    })),
    total: configs.length
  };
}
