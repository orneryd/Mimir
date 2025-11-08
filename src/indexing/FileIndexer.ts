// ============================================================================
// FileIndexer - Index files into Neo4j
// Phase 1: Basic file indexing with content
// Phase 2: Vector embeddings for semantic search
// Phase 3: Parse and extract functions/classes (future)
// ============================================================================

import { Driver } from 'neo4j-driver';
import { promises as fs } from 'fs';
import path from 'path';
import { EmbeddingsService, ChunkEmbeddingResult } from './EmbeddingsService.js';

export interface IndexResult {
  file_node_id: string;
  path: string;
  size_bytes: number;
  chunks_created?: number;
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
   * Index a single file with optional embeddings (Industry Standard: Separate Chunks)
   * Creates File node + FileChunk nodes with individual embeddings
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
      
      // Check if file already has chunks
      let hasExistingChunks = false;
      if (generateEmbeddings) {
        const checkResult = await session.run(
          `MATCH (f:File {path: $path})-[:HAS_CHUNK]->(c:FileChunk)
           RETURN count(c) AS chunk_count, f.last_modified AS last_modified`,
          { path: relativePath }
        );
        
        if (checkResult.records.length > 0) {
          const chunkCount = checkResult.records[0].get('chunk_count').toNumber();
          hasExistingChunks = chunkCount > 0;
          const existingModified = checkResult.records[0].get('last_modified');
          
          // Re-generate if file was modified
          if (hasExistingChunks && existingModified) {
            const existingModifiedDate = new Date(existingModified);
            if (stats.mtime > existingModifiedDate) {
              console.log(`📝 File modified, regenerating chunks: ${relativePath}`);
              hasExistingChunks = false;
              
              // Delete old chunks
              await session.run(
                `MATCH (f:File {path: $path})-[:HAS_CHUNK]->(c:FileChunk)
                 DETACH DELETE c`,
                { path: relativePath }
              );
            }
          }
        }
      }
      
      // Create File node (without embedding, content stored in chunks)
      // Note: We don't store full content in File node to avoid Neo4j size limits
      // Content is preserved in FileChunk nodes for retrieval
      const fileResult = await session.run(`
        MERGE (f:File:Node {path: $path})
        SET 
          f.absolute_path = $absolute_path,
          f.name = $name,
          f.extension = $extension,
          f.language = $language,
          f.size_bytes = $size_bytes,
          f.line_count = $line_count,
          f.last_modified = $last_modified,
          f.indexed_date = datetime(),
          f.type = 'file',
          f.has_chunks = $has_chunks
        RETURN f.path AS path, f.size_bytes AS size_bytes, id(f) AS node_id
      `, {
        path: relativePath,
        absolute_path: filePath,
        name: path.basename(filePath),
        extension: extension,
        language: language,
        size_bytes: stats.size,
        line_count: content.split('\n').length,
        last_modified: stats.mtime.toISOString(),
        has_chunks: generateEmbeddings && !hasExistingChunks
      });

      const fileNodeId = fileResult.records[0].get('node_id');
      let chunksCreated = 0;

      // Generate and store chunk embeddings if enabled and not already present
      if (generateEmbeddings && !hasExistingChunks) {
        await this.initEmbeddings();
        if (this.embeddingsService.isEnabled()) {
          try {
            // Generate separate chunk embeddings (industry standard)
            const chunkEmbeddings = await this.embeddingsService.generateChunkEmbeddings(content);
            
            // Create FileChunk nodes with embeddings
            for (const chunk of chunkEmbeddings) {
              await session.run(`
                MATCH (f:File) WHERE id(f) = $fileNodeId
                CREATE (c:FileChunk:Node {
                  chunk_index: $chunkIndex,
                  text: $text,
                  start_offset: $startOffset,
                  end_offset: $endOffset,
                  embedding: $embedding,
                  embedding_dimensions: $dimensions,
                  embedding_model: $model,
                  type: 'file_chunk',
                  indexed_date: datetime(),
                  filePath: f.path,
                  fileName: f.name,
                  parentFileId: id(f)
                })
                CREATE (f)-[:HAS_CHUNK {index: $chunkIndex}]->(c)
                RETURN id(c) AS chunk_id
              `, {
                fileNodeId,
                chunkIndex: chunk.chunkIndex,
                text: chunk.text,
                startOffset: chunk.startOffset,
                endOffset: chunk.endOffset,
                embedding: chunk.embedding,
                dimensions: chunk.dimensions,
                model: chunk.model
              });
              
              chunksCreated++;
            }
            
            console.log(`✅ Created ${chunksCreated} chunk embeddings for ${relativePath}`);
          } catch (error: any) {
            console.warn(`⚠️  Failed to generate chunk embeddings for ${relativePath}: ${error.message}`);
          }
        }
      } else if (generateEmbeddings && hasExistingChunks) {
        console.log(`⏭️  Skipping chunk embeddings (already exist): ${relativePath}`);
      }
      
      return {
        file_node_id: `file-${fileNodeId}`,
        path: relativePath,
        size_bytes: stats.size,
        chunks_created: chunksCreated
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
   * Delete file node and associated chunks from Neo4j
   */
  async deleteFile(relativePath: string): Promise<void> {
    const session = this.driver.session();
    
    try {
      // DETACH DELETE automatically removes relationships and connected chunks
      await session.run(`
        MATCH (f:File {path: $path})
        OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:FileChunk)
        DETACH DELETE f, c
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
