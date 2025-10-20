// ============================================================================
// FileIndexer - Index files into Neo4j
// Phase 1: Basic file indexing with content
// Phase 2: Vector embeddings for semantic search
// Phase 3: Parse and extract functions/classes (future)
// ============================================================================

import { Driver } from 'neo4j-driver';
import { promises as fs } from 'fs';
import path from 'path';
import { EmbeddingsService } from './EmbeddingsService.js';

export interface IndexResult {
  file_node_id: string;
  path: string;
  size_bytes: number;
}

export class FileIndexer {
  private embeddingsService: EmbeddingsService;
  private embeddingsInitialized: boolean = false;

  constructor(private driver: Driver) {
    this.embeddingsService = new EmbeddingsService();
  }

  /**
   * Initialize embeddings service (lazy loading)
   */
  private async initEmbeddings(): Promise<void> {
    if (!this.embeddingsInitialized) {
      await this.embeddingsService.initialize();
      this.embeddingsInitialized = true;
    }
  }

  /**
   * Index a single file with optional embeddings
   */
  async indexFile(filePath: string, rootPath: string, generateEmbeddings: boolean = false): Promise<IndexResult> {
    const session = this.driver.session();
    
    try {
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      const relativePath = path.relative(rootPath, filePath);
      const extension = path.extname(filePath);
      const language = this.detectLanguage(filePath);
      
      // Generate embeddings if enabled
      let embeddingData: any = null;
      if (generateEmbeddings) {
        await this.initEmbeddings();
        if (this.embeddingsService.isEnabled()) {
          try {
            // Generate embedding for entire file content
            const embedding = await this.embeddingsService.generateEmbedding(content);
            embeddingData = {
              embedding: embedding.embedding,
              dimensions: embedding.dimensions,
              model: embedding.model,
            };
          } catch (error: any) {
            console.warn(`⚠️  Failed to generate embedding for ${relativePath}: ${error.message}`);
          }
        }
      }

      // Create File node in Neo4j with optional embedding
      const cypher = embeddingData 
        ? `
          MERGE (f:File {path: $path})
          SET 
            f.absolute_path = $absolute_path,
            f.name = $name,
            f.extension = $extension,
            f.content = $content,
            f.language = $language,
            f.size_bytes = $size_bytes,
            f.line_count = $line_count,
            f.last_modified = $last_modified,
            f.indexed_date = datetime(),
            f.embedding = $embedding,
            f.embedding_dimensions = $embedding_dimensions,
            f.embedding_model = $embedding_model,
            f.has_embedding = true
          RETURN f.path AS path, f.size_bytes AS size_bytes, id(f) AS node_id
        `
        : `
          MERGE (f:File {path: $path})
          SET 
            f.absolute_path = $absolute_path,
            f.name = $name,
            f.extension = $extension,
            f.content = $content,
            f.language = $language,
            f.size_bytes = $size_bytes,
            f.line_count = $line_count,
            f.last_modified = $last_modified,
            f.indexed_date = datetime(),
            f.has_embedding = false
          RETURN f.path AS path, f.size_bytes AS size_bytes, id(f) AS node_id
        `;

      const params: any = {
        path: relativePath,
        absolute_path: filePath,
        name: path.basename(filePath),
        extension: extension,
        content: content,
        language: language,
        size_bytes: stats.size,
        line_count: content.split('\n').length,
        last_modified: stats.mtime.toISOString(),
      };

      if (embeddingData) {
        params.embedding = embeddingData.embedding;
        params.embedding_dimensions = embeddingData.dimensions;
        params.embedding_model = embeddingData.model;
      }

      const result = await session.run(cypher, params);
      const record = result.records[0];
      
      return {
        file_node_id: `file-${record.get('node_id')}`,
        path: record.get('path'),
        size_bytes: record.get('size_bytes')
      };
      
    } catch (error: any) {
      // Skip binary files or files that can't be read as UTF-8
      if (error.code === 'ERR_INVALID_ARG_TYPE' || error.message?.includes('invalid')) {
        console.warn(`⚠️  Skipping binary file: ${filePath}`);
        throw new Error('Binary file');
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sql': 'sql'
    };
    return languageMap[ext] || 'generic';
  }

  /**
   * Delete file node from Neo4j
   */
  async deleteFile(relativePath: string): Promise<void> {
    const session = this.driver.session();
    
    try {
      await session.run(`
        MATCH (f:File {path: $path})
        DETACH DELETE f
      `, { path: relativePath });
      
    } finally {
      await session.close();
    }
  }

  /**
   * Update file content (for file changes)
   */
  async updateFile(filePath: string, rootPath: string): Promise<void> {
    // Just re-index the file
    await this.indexFile(filePath, rootPath);
  }
}
