// ============================================================================
// WatchConfigManager - Neo4j CRUD for WatchConfig nodes
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { Driver } from 'neo4j-driver';
import type { WatchConfig, WatchConfigInput } from '../types/index.js';

export class WatchConfigManager {
  constructor(private driver: Driver) {}

  /**
   * Create a new watch configuration in Neo4j
   * 
   * Stores watch configuration for file monitoring with indexing settings.
   * Used by FileWatchManager to persist watch state across restarts.
   * 
   * @param input - Watch configuration parameters
   * @returns Created watch configuration with generated ID
   * 
   * @example
   * const manager = new WatchConfigManager(driver);
   * const config = await manager.createWatch({
   *   path: '/Users/user/project/src',
   *   host_path: '/Users/user/project/src',
   *   recursive: true,
   *   generate_embeddings: true
   * });
   * console.log('Created watch:', config.id);
   */
  async createWatch(input: WatchConfigInput): Promise<WatchConfig> {
    const session = this.driver.session();
    
    try {
      const id = `watch-${Date.now()}-${randomUUID().substring(0, 8)}`;
      const now = new Date().toISOString();
      
      const result = await session.run(`
        CREATE (w:WatchConfig:Node {
          id: $id,
          type: 'watchConfig',
          path: $path,
          host_path: $host_path,
          recursive: $recursive,
          debounce_ms: $debounce_ms,
          file_patterns: $file_patterns,
          ignore_patterns: $ignore_patterns,
          generate_embeddings: $generate_embeddings,
          status: 'active',
          added_date: $added_date,
          last_updated: $added_date,
          files_indexed: 0
        })
        RETURN w
      `, {
        id,
        path: input.path,
        host_path: input.host_path || null,
        recursive: input.recursive ?? true,
        debounce_ms: input.debounce_ms ?? 500,
        file_patterns: input.file_patterns ?? null,
        ignore_patterns: input.ignore_patterns ?? [],
        generate_embeddings: input.generate_embeddings ?? false,
        added_date: now
      });
      
      const node = result.records[0].get('w');
      return this.mapToWatchConfig(node.properties);
      
    } finally {
      await session.close();
    }
  }

  /**
   * Get active watch configuration by path
   * 
   * @param path - Directory path being watched
   * @returns Watch configuration or null if not found
   * 
   * @example
   * const config = await manager.getByPath('/Users/user/project/src');
   * if (config) {
   *   console.log('Watch status:', config.status);
   *   console.log('Files indexed:', config.files_indexed);
   * }
   */
  async getByPath(path: string): Promise<WatchConfig | null> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        MATCH (w:WatchConfig {path: $path, status: 'active'})
        RETURN w
      `, { path });
      
      if (result.records.length === 0) {
        return null;
      }
      
      const node = result.records[0].get('w');
      return this.mapToWatchConfig(node.properties);
      
    } finally {
      await session.close();
    }
  }

  /**
   * Get watch configuration by ID
   * 
   * @param id - Watch configuration ID
   * @returns Watch configuration or null if not found
   * 
   * @example
   * const config = await manager.getById('watch-1234-abcd');
   */
  async getById(id: string): Promise<WatchConfig | null> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        MATCH (w:WatchConfig {id: $id})
        RETURN w
      `, { id });
      
      if (result.records.length === 0) {
        return null;
      }
      
      const node = result.records[0].get('w');
      return this.mapToWatchConfig(node.properties);
      
    } finally {
      await session.close();
    }
  }

  /**
   * List all watch configurations (active and inactive)
   * 
   * @returns Array of all watch configurations, sorted by status and date
   * 
   * @example
   * const configs = await manager.listAll();
   * console.log('Total watches:', configs.length);
   * const active = configs.filter(c => c.status === 'active');
   * console.log('Active:', active.length);
   */
  async listAll(): Promise<WatchConfig[]> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        MATCH (w:WatchConfig)
        RETURN w
        ORDER BY w.status DESC, w.added_date ASC
      `);
      
      // Ensure records is an array before mapping
      if (!result.records || !Array.isArray(result.records)) {
        return [];
      }
      
      return result.records.map(record => {
        const node = record.get('w');
        return this.mapToWatchConfig(node.properties);
      });
      
    } finally {
      await session.close();
    }
  }

  /**
   * Reactivate an inactive watch configuration
   * 
   * @param id - Watch configuration ID to reactivate
   * @throws {Error} If watch configuration not found
   * 
   * @example
   * await manager.reactivate('watch-1234-abcd');
   * console.log('Watch reactivated');
   */
  async reactivate(id: string): Promise<void> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        MATCH (w:WatchConfig {id: $id})
        SET 
          w.status = 'active',
          w.error = null,
          w.last_updated = datetime()
        RETURN w
      `, { id });
      
      if (result.records.length === 0) {
        throw new Error(`Watch configuration with ID ${id} not found`);
      }
      
      console.log(`✅ Reactivated watch config ${id} in database`);
    } finally {
      await session.close();
    }
  }

  /**
   * Update watch statistics after indexing
   * 
   * @param id - Watch configuration ID
   * @param filesIndexed - Total number of files indexed
   * 
   * @example
   * await manager.updateStats('watch-1234-abcd', 150);
   */
  async updateStats(id: string, filesIndexed: number): Promise<void> {
    const session = this.driver.session();
    
    try {
      await session.run(`
        MATCH (w:WatchConfig {id: $id})
        SET 
          w.files_indexed = $filesIndexed,
          w.last_indexed = datetime(),
          w.last_updated = datetime()
      `, { id, filesIndexed });
      
    } finally {
      await session.close();
    }
  }

  /**
   * Mark watch as inactive with optional error
   * 
   * @param id - Watch configuration ID
   * @param error - Optional error message
   * 
   * @example
   * await manager.markInactive('watch-1234-abcd', 'Directory not found');
   */
  async markInactive(id: string, error?: string): Promise<void> {
    const session = this.driver.session();
    
    try {
      await session.run(`
        MATCH (w:WatchConfig {id: $id})
        SET 
          w.status = 'inactive',
          w.error = $error,
          w.last_updated = datetime()
      `, { id, error: error || null });
      
    } finally {
      await session.close();
    }
  }

  /**
   * Delete watch configuration from database
   * 
   * @param id - Watch configuration ID to delete
   * 
   * @example
   * await manager.delete('watch-1234-abcd');
   * console.log('Watch configuration deleted');
   */
  async delete(id: string): Promise<void> {
    const session = this.driver.session();
    
    try {
      await session.run(`
        MATCH (w:WatchConfig {id: $id})
        DETACH DELETE w
      `, { id });
      
    } finally {
      await session.close();
    }
  }

  /**
   * Map Neo4j properties to WatchConfig
   */
  private mapToWatchConfig(props: any): WatchConfig {
    // Helper to convert Neo4j Integer to JS number
    const toNumber = (value: any): number => {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'number') return value;
      if (typeof value === 'object' && 'toNumber' in value) {
        return value.toNumber();
      }
      return 0;
    };
    
    return {
      id: props.id,
      path: props.path,
      host_path: props.host_path,
      recursive: props.recursive,
      debounce_ms: props.debounce_ms,
      file_patterns: props.file_patterns,
      ignore_patterns: props.ignore_patterns || [],
      generate_embeddings: props.generate_embeddings || false,
      status: props.status,
      added_date: props.added_date,
      last_indexed: props.last_indexed,
      last_updated: props.last_updated,
      files_indexed: toNumber(props.files_indexed),
      error: props.error
    };
  }
}
