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

export class FileWatchManager {
  private watchers: Map<string, FSWatcher> = new Map();
  private indexer: FileIndexer;
  private configManager: WatchConfigManager;

  constructor(private driver: Driver) {
    this.indexer = new FileIndexer(driver);
    this.configManager = new WatchConfigManager(driver);
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

    // Mark as "watching" (for compatibility - no actual watcher created)
    // Using 'manual' as a placeholder since we're not using chokidar
    this.watchers.set(config.path, 'manual' as any);
    console.log(`📁 Registered for manual indexing: ${config.path}`);
    
    // Automatically index the folder when watch is started
    console.log(`🔄 Auto-indexing folder: ${config.path}`);
    await this.indexFolder(config.path, config);
  }

  /**
   * Stop watching a folder
   */
  async stopWatch(path: string): Promise<void> {
    const watcher = this.watchers.get(path);
    if (watcher) {
      // Only close if it's an actual watcher (not 'manual')
      if (typeof watcher !== 'string') {
        await watcher.close();
      }
      this.watchers.delete(path);
      console.log(`🛑 Stopped watching: ${path}`);
    }
  }

  /**
   * Index all files in a folder (one-time operation)
   */
  async indexFolder(folderPath: string, config: WatchConfig): Promise<number> {
    console.log(`📂 Indexing folder: ${folderPath}`);
    
    const gitignoreHandler = new GitignoreHandler();
    await gitignoreHandler.loadIgnoreFile(folderPath);
    
    if (config.ignore_patterns.length > 0) {
      gitignoreHandler.addPatterns(config.ignore_patterns);
    }

    const files = await this.walkDirectory(
      folderPath,
      gitignoreHandler,
      config.file_patterns,
      config.recursive
    );

    let indexed = 0;
    const generateEmbeddings = config.generate_embeddings || false;
    
    if (generateEmbeddings) {
      console.log('🧮 Vector embeddings enabled for this watch');
    }
    
    for (const file of files) {
      try {
        await this.indexer.indexFile(file, folderPath, generateEmbeddings);
        indexed++;
        
        if (indexed % 10 === 0) {
          console.log(`  Indexed ${indexed}/${files.length} files...`);
        }
      } catch (error: any) {
        if (error.message !== 'Binary file') {
          console.error(`Failed to index ${file}:`, error.message);
        }
      }
    }

    console.log(`✅ Indexed ${indexed} files from ${folderPath}`);
    
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
