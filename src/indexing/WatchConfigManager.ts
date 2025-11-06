// ============================================================================
// WatchConfigManager - Neo4j CRUD for WatchConfig nodes
// ============================================================================

import { Driver, Session } from 'neo4j-driver';
import type { WatchConfig, WatchConfigInput } from '../types/index.js';
import { randomUUID } from 'crypto';

export class WatchConfigManager {
  constructor(private driver: Driver) {}

  /**
   * Create a new watch configuration
   */
  async createWatch(input: WatchConfigInput): Promise<WatchConfig> {
    const session = this.driver.session();
    
    try {
      const id = `watch-${Date.now()}-${randomUUID().substring(0, 8)}`;
      const now = new Date().toISOString();
      
      const result = await session.run(`
        CREATE (w:WatchConfig {
          id: $id,
          path: $path,
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
   * Get watch configuration by path
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
   * List all active watch configurations
   */
  async listActive(): Promise<WatchConfig[]> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        MATCH (w:WatchConfig)
        WHERE w.status = 'active'
        RETURN w
        ORDER BY w.added_date ASC
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
   * Update watch statistics
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
   * Mark watch as inactive
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
   * Delete watch configuration
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
    return {
      id: props.id,
      path: props.path,
      recursive: props.recursive,
      debounce_ms: props.debounce_ms,
      file_patterns: props.file_patterns,
      ignore_patterns: props.ignore_patterns || [],
      generate_embeddings: props.generate_embeddings || false,
      status: props.status,
      added_date: props.added_date,
      last_indexed: props.last_indexed,
      last_updated: props.last_updated,
      files_indexed: props.files_indexed || 0,
      error: props.error
    };
  }
}
