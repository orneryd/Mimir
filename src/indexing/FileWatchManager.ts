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

  constructor(private driver: Driver) {
    this.indexer = new FileIndexer(driver);
    this.configManager = new WatchConfigManager(driver);
    // Read max concurrent indexing from env, default to 1 (embeddings hit single Ollama instance)
    this.maxConcurrentIndexing = parseInt(process.env.MIMIR_INDEXING_THREADS || '1', 10);
    console.log(`📊 FileWatchManager initialized with max ${this.maxConcurrentIndexing} concurrent indexing threads`);
  }
  
  /**
   * Register a callback for real-time progress updates
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
    console.log(`[FileWatchManager] Emitting progress for ${progress.path} to ${this.progressCallbacks.length} callbacks`);
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    }
  }

  /**
   * Get indexing progress for a specific folder
   */
  getProgress(path: string): IndexingProgress | undefined {
    return this.progressTrackers.get(path);
  }

  /**
   * Get all active indexing progress
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
   * Start watching a folder (manual indexing only - no file system events)
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
      
      // Keep progress for 30 seconds after completion for SSE clients
      setTimeout(() => {
        this.progressTrackers.delete(config.path);
      }, 30000);
    }
  }

  /**
   * Abort active indexing for a folder
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
   * Check if a folder is currently being indexed
   */
  isIndexing(path: string): boolean {
    return this.abortControllers.has(path);
  }

  /**
   * Stop watching a folder
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
    
    if (generateEmbeddings) {
      console.log('🧮 Vector embeddings enabled for this watch');
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
        await this.indexer.indexFile(file, containerPath, generateEmbeddings);
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
          console.log(`  Processed ${processed}/${files.length} files (✅ ${indexed} indexed, ⏭️  ${skipped} skipped, ❌ ${errored} errors)...`);
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
      await this.indexer.indexFile(fullPath, config.path);
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
