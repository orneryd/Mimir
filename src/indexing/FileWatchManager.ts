// ============================================================================
// FileWatchManager - Manage chokidar file watchers
// ============================================================================

import chokidar, { FSWatcher } from 'chokidar';
import { Driver } from 'neo4j-driver';
import { promises as fs } from 'fs';
import path from 'path';
import { WatchConfig } from '../types/index.js';
import { GitignoreHandler } from './GitignoreHandler.js';
import { FileIndexer } from './FileIndexer.js';
import { WatchConfigManager } from './WatchConfigManager.js';

interface IndexingProgress {
  path: string;
  totalFiles: number;
  indexed: number;
  skipped: number;
  errored: number;
  currentFile?: string;
  status: 'queued' | 'indexing' | 'completed' | 'cancelled' | 'error';
  startTime?: number;
  endTime?: number;
}

export class FileWatchManager {
  private watchers: Map<string, FSWatcher> = new Map();
  private indexer: FileIndexer;
  private configManager: WatchConfigManager;
  private abortControllers: Map<string, AbortController> = new Map();
  private activeIndexingCount: number = 0;
  private maxConcurrentIndexing: number;
  private indexingQueue: Array<() => Promise<void>> = [];
  private progressTrackers: Map<string, IndexingProgress> = new Map();
  private indexingPromises: Map<string, Promise<void>> = new Map();
  private progressCallbacks: Array<(progress: IndexingProgress) => void> = [];
  private activeIndexingPaths: Set<string> = new Set(); // Track active indexing jobs to prevent duplicates

  constructor(private driver: Driver) {
    this.indexer = new FileIndexer(driver);
    this.configManager = new WatchConfigManager(driver);
    // Read max concurrent indexing from env, default to 1 (embeddings hit single Ollama instance)
    this.maxConcurrentIndexing = parseInt(process.env.MIMIR_INDEXING_THREADS || '1', 10);
    console.log(`📊 FileWatchManager initialized with max ${this.maxConcurrentIndexing} concurrent indexing threads`);
  }
  
  /**
   * Register a callback for real-time progress updates during file indexing
   * 
   * Subscribe to indexing progress events to display real-time status in UI.
   * Returns an unsubscribe function to clean up when done.
   * 
   * @param callback - Function called with progress updates
   * @returns Unsubscribe function to remove the callback
   * 
   * @example
   * // Display progress in console
   * const unsubscribe = fileWatchManager.onProgress((progress) => {
   *   console.log(`${progress.path}: ${progress.indexed}/${progress.totalFiles} files`);
   *   console.log(`Status: ${progress.status}`);
   * });
   * // Later: unsubscribe();
   * 
   * @example
   * // Update UI progress bar
   * const unsubscribe = fileWatchManager.onProgress((progress) => {
   *   if (progress.totalFiles > 0) {
   *     const percent = (progress.indexed / progress.totalFiles) * 100;
   *     updateProgressBar(progress.path, percent);
   *   }
   *   if (progress.status === 'completed') {
   *     showNotification(`Indexing complete: ${progress.path}`);
   *     unsubscribe();
   *   }
   * });
   * 
   * @example
   * // Server-Sent Events (SSE) streaming
   * app.get('/api/indexing/progress', (req, res) => {
   *   res.setHeader('Content-Type', 'text/event-stream');
   *   const unsubscribe = fileWatchManager.onProgress((progress) => {
   *     res.write(`data: ${JSON.stringify(progress)}\n\n`);
   *   });
   *   req.on('close', unsubscribe);
   * });
   */
  onProgress(callback: (progress: IndexingProgress) => void): () => void {
    this.progressCallbacks.push(callback);
    console.log(`[FileWatchManager] Registered progress callback. Total callbacks: ${this.progressCallbacks.length}`);
    // Return unsubscribe function
    return () => {
      const index = this.progressCallbacks.indexOf(callback);
      if (index > -1) {
        this.progressCallbacks.splice(index, 1);
        console.log(`[FileWatchManager] Unregistered progress callback. Total callbacks: ${this.progressCallbacks.length}`);
      }
    };
  }
  
  /**
   * Emit progress update to all registered callbacks
   */
  private emitProgress(progress: IndexingProgress): void {
    // console.log(`[FileWatchManager] Emitting progress for ${progress.path} to ${this.progressCallbacks.length} callbacks`);
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    }
  }

  /**
   * Get current indexing progress for a specific folder
   * 
   * Returns progress information including file counts, status, and timing.
   * Returns undefined if folder is not being indexed or has no tracked progress.
   * 
   * @param path - Folder path to check
   * @returns Progress object or undefined if not found
   * 
   * @example
   * // Check if indexing is complete
   * const progress = fileWatchManager.getProgress('/workspace/src');
   * if (progress && progress.status === 'completed') {
   *   console.log(`Indexed ${progress.indexed} files in ${progress.path}`);
   *   console.log(`Skipped: ${progress.skipped}, Errors: ${progress.errored}`);
   * }
   * 
   * @example
   * // Calculate indexing duration
   * const progress = fileWatchManager.getProgress('/workspace/docs');
   * if (progress && progress.startTime && progress.endTime) {
   *   const durationSec = (progress.endTime - progress.startTime) / 1000;
   *   console.log(`Indexing took ${durationSec.toFixed(1)} seconds`);
   * }
   * 
   * @example
   * // Poll for completion
   * const checkProgress = setInterval(() => {
   *   const progress = fileWatchManager.getProgress('/workspace/api');
   *   if (progress?.status === 'completed' || progress?.status === 'error') {
   *     clearInterval(checkProgress);
   *     console.log('Indexing finished:', progress.status);
   *   }
   * }, 1000);
   */
  getProgress(path: string): IndexingProgress | undefined {
    return this.progressTrackers.get(path);
  }

  /**
   * Get progress for all folders currently being indexed or recently completed
   * 
   * Returns array of progress objects for all tracked indexing operations.
   * Useful for dashboard views showing multiple concurrent indexing jobs.
   * 
   * @returns Array of progress objects for all tracked folders
   * 
   * @example
   * // Display all active indexing jobs
   * const allProgress = fileWatchManager.getAllProgress();
   * console.log(`Active indexing jobs: ${allProgress.length}`);
   * for (const progress of allProgress) {
   *   console.log(`${progress.path}: ${progress.status}`);
   * }
   * 
   * @example
   * // Calculate total indexing statistics
   * const allProgress = fileWatchManager.getAllProgress();
   * const stats = allProgress.reduce((acc, p) => ({
   *   totalFiles: acc.totalFiles + p.totalFiles,
   *   indexed: acc.indexed + p.indexed,
   *   skipped: acc.skipped + p.skipped,
   *   errored: acc.errored + p.errored
   * }), { totalFiles: 0, indexed: 0, skipped: 0, errored: 0 });
   * console.log('Total stats:', stats);
   * 
   * @example
   * // Filter by status
   * const allProgress = fileWatchManager.getAllProgress();
   * const active = allProgress.filter(p => p.status === 'indexing');
   * const completed = allProgress.filter(p => p.status === 'completed');
   * console.log(`Active: ${active.length}, Completed: ${completed.length}`);
   */
  getAllProgress(): IndexingProgress[] {
    return Array.from(this.progressTrackers.values());
  }

  /**
   * Acquire a slot for indexing (waits if at max concurrency)
   */
  private async acquireIndexingSlot(): Promise<void> {
    if (this.activeIndexingCount < this.maxConcurrentIndexing) {
      this.activeIndexingCount++;
      console.log(`📊 Acquired indexing slot (${this.activeIndexingCount}/${this.maxConcurrentIndexing} active)`);
      return;
    }

    // Wait in queue
    console.log(`⏳ Waiting for indexing slot (${this.activeIndexingCount}/${this.maxConcurrentIndexing} active, ${this.indexingQueue.length} queued)`);
    return new Promise((resolve) => {
      this.indexingQueue.push(async () => {
        this.activeIndexingCount++;
        console.log(`📊 Acquired indexing slot from queue (${this.activeIndexingCount}/${this.maxConcurrentIndexing} active)`);
        resolve();
      });
    });
  }

  /**
   * Release a slot after indexing completes
   */
  private releaseIndexingSlot(): void {
    this.activeIndexingCount--;
    console.log(`📊 Released indexing slot (${this.activeIndexingCount}/${this.maxConcurrentIndexing} active)`);
    
    // Process next in queue
    if (this.indexingQueue.length > 0) {
      const next = this.indexingQueue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Start indexing a folder with automatic file watching
   * 
   * Begins indexing all files in the specified folder according to the config.
   * Respects .gitignore patterns and custom ignore rules. Supports recursive
   * directory traversal and file pattern filtering. Indexing runs with
   * concurrency control to avoid overwhelming the system.
   * 
   * @param config - Watch configuration with path, patterns, and options
   * @returns Promise that resolves when indexing is queued (not completed)
   * 
   * @example
   * // Index a source code directory
   * await fileWatchManager.startWatch({
   *   path: '/workspace/src',
   *   recursive: true,
   *   file_patterns: ['*.ts', '*.tsx', '*.js', '*.jsx'],
   *   ignore_patterns: ['node_modules/**', 'dist/**', '*.test.ts']
   * });
   * console.log('Indexing started for /workspace/src');
   * 
   * @example
   * // Index documentation with progress tracking
   * const unsubscribe = fileWatchManager.onProgress((progress) => {
   *   console.log(`Progress: ${progress.indexed}/${progress.totalFiles}`);
   * });
   * await fileWatchManager.startWatch({
   *   path: '/workspace/docs',
   *   recursive: true,
   *   file_patterns: ['*.md', '*.mdx'],
   *   ignore_patterns: ['node_modules/**']
   * });
   * 
   * @example
   * // Index specific file types only
   * await fileWatchManager.startWatch({
   *   path: '/workspace/config',
   *   recursive: false,
   *   file_patterns: ['*.json', '*.yaml', '*.yml'],
   *   ignore_patterns: []
   * });
   */
  async startWatch(config: WatchConfig): Promise<void> {
    // Don't start if already watching
    if (this.watchers.has(config.path)) {
      console.log(`Already watching: ${config.path}`);
      return;
    }

    // Mark as "watching" immediately
    this.watchers.set(config.path, 'manual' as any);
    console.log(`📁 Registered for manual indexing: ${config.path}`);

    // Queue the indexing work and store promise for cancellation tracking
    const indexingPromise = this.queueIndexing(config);
    this.indexingPromises.set(config.path, indexingPromise);
  }

  /**
   * Queue an indexing job with concurrency control
   */
  private async queueIndexing(config: WatchConfig): Promise<void> {
    // Prevent duplicate indexing jobs for the same path
    if (this.activeIndexingPaths.has(config.path)) {
      console.log(`⏭️  Skipping duplicate indexing job for ${config.path} (already in progress)`);
      return;
    }
    
    // Mark path as being indexed
    this.activeIndexingPaths.add(config.path);
    
    // Create abort controller for this indexing job
    const abortController = new AbortController();
    this.abortControllers.set(config.path, abortController);

    // Initialize progress tracker
    const initialProgress = {
      path: config.path,
      totalFiles: 0,
      indexed: 0,
      skipped: 0,
      errored: 0,
      status: 'queued' as const
    };
    this.progressTrackers.set(config.path, initialProgress);
    this.emitProgress(initialProgress);

    try {
      // Wait for an available slot
      await this.acquireIndexingSlot();
      
      // Check if cancelled while waiting
      if (abortController.signal.aborted) {
        console.log(`🛑 Indexing cancelled before starting: ${config.path}`);
        const progress = this.progressTrackers.get(config.path);
        if (progress) {
          progress.status = 'cancelled';
          progress.endTime = Date.now();
          this.emitProgress(progress);
        }
        return;
      }

      // Update status to indexing
      const progress = this.progressTrackers.get(config.path);
      if (progress) {
        progress.status = 'indexing';
        progress.startTime = Date.now();
        this.emitProgress(progress);
      }

      console.log(`🔄 Starting indexing for: ${config.path}`);
      await this.indexFolder(config.path, config, abortController.signal);
      
      // Mark as completed
      const finalProgress = this.progressTrackers.get(config.path);
      if (finalProgress) {
        finalProgress.status = 'completed';
        finalProgress.endTime = Date.now();
        this.emitProgress(finalProgress);
      }
      
    } catch (error: any) {
      const progress = this.progressTrackers.get(config.path);
      if (error.message === 'Indexing cancelled') {
        console.log(`✅ Successfully cancelled indexing for ${config.path}`);
        if (progress) {
          progress.status = 'cancelled';
          progress.endTime = Date.now();
          this.emitProgress(progress);
        }
      } else {
        console.error(`❌ Error indexing ${config.path}:`, error);
        if (progress) {
          progress.status = 'error';
          progress.endTime = Date.now();
          this.emitProgress(progress);
        }
        throw error;
      }
    } finally {
      // Always release the slot and clean up
      this.releaseIndexingSlot();
      this.abortControllers.delete(config.path);
      this.indexingPromises.delete(config.path);
      this.activeIndexingPaths.delete(config.path); // Remove from active set to allow future indexing
      
      // Keep progress for 30 seconds after completion for SSE clients
      setTimeout(() => {
        this.progressTrackers.delete(config.path);
      }, 30000);
    }
  }

  /**
   * Abort active indexing operation for a folder
   * 
   * Sends abort signal to stop indexing immediately. Does not wait for
   * completion. Returns true if abort signal was sent, false if no
   * active indexing was found.
   * 
   * @param path - Folder path to abort indexing for
   * @returns True if abort signal sent, false if not indexing
   * 
   * @example
   * // Cancel indexing if taking too long
   * setTimeout(() => {
   *   const aborted = fileWatchManager.abortIndexing('/workspace/large-repo');
   *   if (aborted) {
   *     console.log('Indexing cancelled due to timeout');
   *   }
   * }, 60000); // 1 minute timeout
   * 
   * @example
   * // User-initiated cancellation
   * app.post('/api/indexing/cancel', async (req, res) => {
   *   const { path } = req.body;
   *   const aborted = fileWatchManager.abortIndexing(path);
   *   res.json({ 
   *     success: aborted,
   *     message: aborted ? 'Indexing cancelled' : 'No active indexing found'
   *   });
   * });
   * 
   * @example
   * // Cancel all active indexing
   * const allProgress = fileWatchManager.getAllProgress();
   * const activeIndexing = allProgress.filter(p => p.status === 'indexing');
   * for (const progress of activeIndexing) {
   *   fileWatchManager.abortIndexing(progress.path);
   * }
   * console.log(`Cancelled ${activeIndexing.length} indexing operations`);
   */
  abortIndexing(path: string): boolean {
    const abortController = this.abortControllers.get(path);
    if (abortController) {
      console.log(`🛑 Aborting indexing for: ${path}`);
      abortController.abort();
      this.abortControllers.delete(path);
      return true;
    }
    return false;
  }

  /**
   * Check if a folder is currently being actively indexed
   * 
   * Returns true if indexing is in progress, false otherwise.
   * Does not include queued or completed indexing operations.
   * 
   * @param path - Folder path to check
   * @returns True if currently indexing, false otherwise
   * 
   * @example
   * // Wait for indexing to complete
   * while (fileWatchManager.isIndexing('/workspace/src')) {
   *   await new Promise(resolve => setTimeout(resolve, 1000));
   *   console.log('Still indexing...');
   * }
   * console.log('Indexing complete!');
   * 
   * @example
   * // Prevent duplicate indexing
   * if (fileWatchManager.isIndexing('/workspace/docs')) {
   *   console.log('Already indexing this folder');
   * } else {
   *   await fileWatchManager.startWatch({
   *     path: '/workspace/docs',
   *     recursive: true,
   *     file_patterns: ['*.md'],
   *     ignore_patterns: []
   *   });
   * }
   * 
   * @example
   * // API endpoint to check status
   * app.get('/api/indexing/status/:path', (req, res) => {
   *   const isActive = fileWatchManager.isIndexing(req.params.path);
   *   const progress = fileWatchManager.getProgress(req.params.path);
   *   res.json({ isIndexing: isActive, progress });
   * });
   */
  isIndexing(path: string): boolean {
    return this.abortControllers.has(path);
  }

  /**
   * Stop watching and indexing a folder
   * 
   * Stops any active indexing for the folder and removes it from the watch list.
   * If indexing is in progress, sends abort signal and waits for graceful shutdown.
   * Safe to call even if folder is not being watched.
   * 
   * @param path - Folder path to stop watching
   * @returns Promise that resolves when watching has stopped
   * 
   * @example
   * // Stop watching a folder
   * await fileWatchManager.stopWatch('/workspace/src');
   * console.log('Stopped watching /workspace/src');
   * 
   * @example
   * // Stop all active watches
   * const allProgress = fileWatchManager.getAllProgress();
   * for (const progress of allProgress) {
   *   await fileWatchManager.stopWatch(progress.path);
   * }
   * console.log('All watches stopped');
   * 
   * @example
   * // Stop with error handling
   * try {
   *   await fileWatchManager.stopWatch('/workspace/docs');
   *   console.log('Successfully stopped watching');
   * } catch (error) {
   *   console.error('Failed to stop watch:', error);
   * }
   */
  async stopWatch(path: string): Promise<void> {
    console.log(`🛑 Stopping watch for: ${path}`);
    
    // Check if there's an active indexing job
    const indexingPromise = this.indexingPromises.get(path);
    const hasActiveIndexing = this.abortControllers.has(path);
    
    if (hasActiveIndexing) {
      console.log(`⏳ Active indexing detected for ${path}, sending abort signal...`);
      
      // Send abort signal
      this.abortIndexing(path);
      
      // Wait for the indexing to actually stop
      if (indexingPromise) {
        console.log(`⏳ Waiting for indexing to stop for ${path}...`);
        try {
          await indexingPromise;
          console.log(`✅ Indexing stopped for ${path}`);
        } catch (error: any) {
          // Indexing was cancelled or errored, which is expected
          console.log(`✅ Indexing terminated for ${path}: ${error.message}`);
        }
      }
    }

    // Now safe to close the watcher
    const watcher = this.watchers.get(path);
    if (watcher) {
      // Only close if it's an actual watcher (not 'manual')
      if (typeof watcher !== 'string') {
        await watcher.close();
      }
      this.watchers.delete(path);
      console.log(`✅ Stopped watching: ${path}`);
    }
  }

  /**
   * Index all files in a folder (one-time operation)
   */
  async indexFolder(folderPath: string, config: WatchConfig, signal?: AbortSignal): Promise<number> {
    // Translate host path to container path for file operations
    const { translateHostToContainer } = await import('../utils/path-utils.js');
    const containerPath = translateHostToContainer(folderPath);
    console.log(`📂 Indexing folder: ${folderPath} (container: ${containerPath})`);
    
    const gitignoreHandler = new GitignoreHandler();
    await gitignoreHandler.loadIgnoreFile(containerPath);
    
    if (config.ignore_patterns.length > 0) {
      gitignoreHandler.addPatterns(config.ignore_patterns);
    }

    const files = await this.walkDirectory(
      containerPath,
      gitignoreHandler,
      config.file_patterns,
      config.recursive
    );

    // Update progress with total file count
    const progress = this.progressTrackers.get(config.path);
    if (progress) {
      progress.totalFiles = files.length;
      this.emitProgress(progress);
    }

    let indexed = 0;
    let skipped = 0;
    let errored = 0;
    const generateEmbeddings = config.generate_embeddings || false;
    const indexingId = `idx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    if (generateEmbeddings) {
      console.log(`🧮 Vector embeddings enabled for this watch [${indexingId}] path=${config.path}`);
    }
    
    for (const file of files) {
      // Check if indexing has been cancelled
      if (signal?.aborted) {
        console.log(`🛑 Indexing cancelled for ${config.path} (indexed ${indexed}/${files.length} files before cancellation)`);
        throw new Error('Indexing cancelled');
      }

      // Update current file in progress and emit BEFORE indexing
      if (progress) {
        progress.currentFile = path.basename(file);
        this.emitProgress(progress);
      }

      try {
        await this.indexer.indexFile(file, containerPath, generateEmbeddings, config.id);
        indexed++;
        
        // Update progress and emit event after indexing
        if (progress) {
          progress.indexed = indexed;
          progress.currentFile = undefined; // Clear current file after completion
          this.emitProgress(progress);
        }
        
        // Add delay when generating embeddings to avoid overwhelming Ollama
        // Ollama's runner process can crash under heavy load, so we need significant delays
        if (generateEmbeddings) {
          const delay = parseInt(process.env.MIMIR_EMBEDDINGS_DELAY_MS || '500', 10);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        if ((indexed + skipped) % 10 === 0) {
          const processed = indexed + skipped + errored;
          console.log(`  [${indexingId}] Processed ${processed}/${files.length} files (✅ ${indexed} indexed, ⏭️  ${skipped} skipped, ❌ ${errored} errors)...`);
        }
      } catch (error: any) {
        if (error.message === 'Binary file') {
          skipped++;
          if (progress) {
            progress.skipped = skipped;
            this.emitProgress(progress);
          }
        } else {
          console.error(`Failed to index ${file}:`, error.message);
          errored++;
          if (progress) {
            progress.errored = errored;
            this.emitProgress(progress);
          }
        }
      }
    }

    const totalProcessed = indexed + skipped + errored;
    console.log(`✅ Indexing complete for ${config.path}`);
    console.log(`   📊 Processed: ${totalProcessed}/${files.length} files`);
    console.log(`   ✅ Indexed: ${indexed} | ⏭️  Skipped: ${skipped} | ❌ Errors: ${errored}`);
    
    // Update stats in Neo4j
    await this.configManager.updateStats(config.id, indexed);
    
    return indexed;
  }

  /**
   * Handle file added event
   */
  private async handleFileAdded(relativePath: string, config: WatchConfig): Promise<void> {
    const fullPath = path.join(config.path, relativePath);
    console.log(`➕ File added: ${relativePath}`);
    
    try {
      await this.indexer.indexFile(fullPath, config.path, config.generate_embeddings, config.id);
    } catch (error: any) {
      if (error.message !== 'Binary file') {
        console.error(`Failed to index ${relativePath}:`, error.message);
      }
    }
  }

  /**
   * Handle file changed event
   */
  private async handleFileChanged(relativePath: string, config: WatchConfig): Promise<void> {
    const fullPath = path.join(config.path, relativePath);
    console.log(`✏️  File changed: ${relativePath}`);
    
    try {
      await this.indexer.updateFile(fullPath, config.path);
    } catch (error: any) {
      if (error.message !== 'Binary file') {
        console.error(`Failed to update ${relativePath}:`, error.message);
      }
    }
  }

  /**
   * Handle file deleted event
   */
  private async handleFileDeleted(relativePath: string, config: WatchConfig): Promise<void> {
    console.log(`🗑️  File deleted: ${relativePath}`);
    
    try {
      await this.indexer.deleteFile(relativePath);
    } catch (error: any) {
      console.error(`Failed to delete ${relativePath}:`, error.message);
    }
  }

  /**
   * Recursively walk directory and collect files
   */
  private async walkDirectory(
    dir: string,
    gitignoreHandler: GitignoreHandler,
    patterns: string[] | null,
    recursive: boolean,
    rootPath?: string
  ): Promise<string[]> {
    const files: string[] = [];
    const root = rootPath || dir; // First call establishes the root
    
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip ignored files (use consistent root path)
      if (gitignoreHandler.shouldIgnore(fullPath, root)) {
        continue;
      }
      
      if (entry.isDirectory() && recursive) {
        // Recursively walk subdirectories (pass root along)
        const subFiles = await this.walkDirectory(fullPath, gitignoreHandler, patterns, recursive, root);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check file patterns
        if (patterns && patterns.length > 0) {
          const matches = patterns.some(pattern => {
            // Simple pattern matching (*.ts, *.js, etc.)
            if (pattern.startsWith('*.')) {
              return entry.name.endsWith(pattern.substring(1));
            }
            return entry.name.includes(pattern);
          });
          
          if (matches) {
            files.push(fullPath);
          }
        } else {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  /**
   * Get active watchers
   */
  getActiveWatchers(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Close all watchers
   */
  async closeAll(): Promise<void> {
    for (const [path, watcher] of this.watchers.entries()) {
      await watcher.close();
      console.log(`🛑 Closed watcher: ${path}`);
    }
    this.watchers.clear();
  }
}
