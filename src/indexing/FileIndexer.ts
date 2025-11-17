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
import { DocumentParser } from './DocumentParser.js';

export interface IndexResult {
  file_node_id: string;
  path: string;
  size_bytes: number;
  chunks_created?: number;
}

export class FileIndexer {
  private embeddingsService: EmbeddingsService;
  private embeddingsInitialized: boolean = false;
  private documentParser: DocumentParser;

  constructor(private driver: Driver) {
    this.embeddingsService = new EmbeddingsService();
    this.documentParser = new DocumentParser();
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
    let content: string = '';
    
    try {
      const relativePath = path.relative(rootPath, filePath);
      const extension = path.extname(filePath).toLowerCase();
      const binaryDoc = this.documentParser.isSupportedFormat(extension)
      // Skip binary files and non-indexable file types (except supported documents)
      // Read file content - either as text or extract from documents
      
      if (binaryDoc) {
        // Extract text from PDF or DOCX
        const buffer = await fs.readFile(filePath);
        content = await this.documentParser.extractText(buffer, extension);
        console.log(`📄 Extracted ${content.length} chars from ${extension} document: ${relativePath}`);
      } else if (!this.shouldSkipFile(filePath, extension)) {
        // Read as plain text file
        content = await fs.readFile(filePath, 'utf-8');
        
        // Check if content is actually text (not binary masquerading as text)
        if (!this.isTextContent(content)) {
          throw new Error('Binary content detected');
        }
      } else {
        throw new Error('Binary or non-indexable file');
      }

      const stats = await fs.stat(filePath);
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
      
      // Determine if file needs chunking (based on embeddings config chunk size)
      const needsChunking = generateEmbeddings && content.length > 1000; // Will be refined by EmbeddingsService
      
      // Storage strategy:
      // - If embeddings ENABLED and file is LARGE → Store in chunks (chunk nodes) + no content on File node
      // - If embeddings DISABLED → ALWAYS store full content on File node (enables full-text search)
      // - If embeddings ENABLED and file is SMALL → Store content on File node + embedding
      const shouldStoreFullContent = !generateEmbeddings || !needsChunking;
      
      // Create File node
      // Small files: Store embedding directly on File node
      // Large files: Store embeddings in FileChunk nodes
      const fileResult = await session.run(`
        MERGE (f:File:Node {path: $path})
        ON CREATE SET f.id = 'file-' + toString(timestamp())
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
          f.has_chunks = $has_chunks,
          f.content = $content
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
        has_chunks: needsChunking,
        content: shouldStoreFullContent ? content : null // Store full content when embeddings disabled OR file is small
      });

      const fileNodeId = fileResult.records[0].get('node_id');
      let chunksCreated = 0;

      // Generate and store embeddings if enabled and not already present
      if (generateEmbeddings && !hasExistingChunks) {
        await this.initEmbeddings();
        if (this.embeddingsService.isEnabled()) {
          try {
            if (needsChunking) {
              // Large file: Generate separate chunk embeddings
              const chunkEmbeddings = await this.embeddingsService.generateChunkEmbeddings(content);
              
              // Create FileChunk nodes with embeddings and sequential relationships
              let previousChunkId: string | null = null;
              
              for (const chunk of chunkEmbeddings) {
                // Generate unique chunk ID
                const chunkId = `chunk-${relativePath}-${chunk.chunkIndex}`;
                
                const result = await session.run(`
                  MATCH (f:File) WHERE id(f) = $fileNodeId
                  CREATE (c:FileChunk:Node)
                  SET c.id = $chunkId,
                      c.chunk_index = $chunkIndex,
                      c.text = $text,
                      c.start_offset = $startOffset,
                      c.end_offset = $endOffset,
                      c.embedding = $embedding,
                      c.embedding_dimensions = $dimensions,
                      c.embedding_model = $model,
                      c.type = 'file_chunk',
                      c.indexed_date = datetime(),
                      c.filePath = f.path,
                      c.fileName = f.name,
                      c.parentFileId = id(f)
                  CREATE (f)-[:HAS_CHUNK {index: $chunkIndex}]->(c)
                  RETURN c.id AS chunk_id
                `, {
                  fileNodeId,
                  chunkId,
                  chunkIndex: chunk.chunkIndex,
                  text: chunk.text,
                  startOffset: chunk.startOffset,
                  endOffset: chunk.endOffset,
                  embedding: chunk.embedding,
                  dimensions: chunk.dimensions,
                  model: chunk.model
                });
                
                const currentChunkId = result.records[0].get('chunk_id');
                
                // Create NEXT_CHUNK relationship from previous chunk to current
                if (previousChunkId) {
                  await session.run(`
                    MATCH (prev:FileChunk {id: $prevId})
                    MATCH (curr:FileChunk {id: $currId})
                    CREATE (prev)-[:NEXT_CHUNK]->(curr)
                  `, {
                    prevId: previousChunkId,
                    currId: currentChunkId
                  });
                }
                
                previousChunkId = currentChunkId;
                chunksCreated++;
              }
              
              console.log(`✅ Created ${chunksCreated} chunk embeddings with sequential links for ${relativePath}`);
            } else {
              // Small file: Store embedding directly on File node
              const embedding = await this.embeddingsService.generateEmbedding(content);
              
              await session.run(`
                MATCH (f:File) WHERE id(f) = $fileNodeId
                SET 
                  f.embedding = $embedding,
                  f.embedding_dimensions = $dimensions,
                  f.embedding_model = $model,
                  f.has_embedding = true
              `, {
                fileNodeId,
                embedding: embedding.embedding,
                dimensions: embedding.dimensions,
                model: embedding.model
              });
              
              console.log(`✅ Created file embedding for ${relativePath}`);
            }
          } catch (error: any) {
            console.warn(`⚠️  Failed to generate embeddings for ${relativePath}: ${error.message}`);
          }
        }
      } else if (generateEmbeddings && hasExistingChunks) {
        console.log(`⏭️  Skipping embeddings (already exist): ${relativePath}`);
      }
      
      return {
        file_node_id: `file-${fileNodeId}`,
        path: relativePath,
        size_bytes: stats.size,
        chunks_created: chunksCreated
      };
      
    } catch (error: any) {
      // Provide specific error messages for different skip reasons
      const relativePath = path.relative(rootPath, filePath);
      
      if (error.message === 'Binary or non-indexable file') {
        // Silently skip - these are expected
        throw error;
      }
      
      if (error.message === 'Binary content detected') {
        console.warn(`⚠️  Skipping file with binary content: ${relativePath}`);
        throw new Error('Binary file');
      }
      
      // UTF-8 decode errors
      if (error.code === 'ERR_INVALID_ARG_TYPE' || error.message?.includes('invalid')) {
        console.warn(`⚠️  Skipping file (UTF-8 decode error): ${relativePath}`);
        throw new Error('Binary file');
      }
      
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Check if content is actually text (not binary)
   */
  private isTextContent(content: string): boolean {
    // Check for null bytes (common in binary files)
    if (content.includes('\0')) {
      return false;
    }
    
    // Check ratio of printable characters
    let printableCount = 0;
    const sampleSize = Math.min(content.length, 1000); // Check first 1000 chars
    
    for (let i = 0; i < sampleSize; i++) {
      const code = content.charCodeAt(i);
      // Printable ASCII + common whitespace/newlines
      if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) {
        printableCount++;
      }
    }
    
    const printableRatio = printableCount / sampleSize;
    
    // If less than 85% printable, likely binary
    return printableRatio >= 0.85;
  }

  /**
   * Check if file should be skipped (binary, images, archives, etc.)
   * Note: PDF and DOCX are in this list but handled separately via DocumentParser
   */
  private shouldSkipFile(filePath: string, extension: string): boolean {
    // Binary and non-text file extensions to skip
    const skipExtensions = new Set([
      // Images
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.tiff', '.tif',
      // Videos
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v',
      // Audio
      '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma',
      // Archives
      '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz', '.tgz',
      // Executables and binaries
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.app',
      // Compiled/bytecode
      '.pyc', '.pyo', '.class', '.o', '.obj', '.wasm',
      // Documents (binary formats) - PDF/DOCX supported via DocumentParser
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
      // Fonts
      '.ttf', '.otf', '.woff', '.woff2', '.eot',
      // Database files
      '.db', '.sqlite', '.sqlite3', '.mdb',
      // IDE/Editor files
      '.swp', '.swo', '.DS_Store', '.idea',
      // Lock files (often auto-generated)
      '.lock',
      // Other binary formats
      '.pkl', '.pickle', '.parquet', '.avro', '.protobuf', '.pb'
    ]);
    
    // Check extension
    if (skipExtensions.has(extension)) {
      return true;
    }
    
    // Skip files without extension that are likely binary
    const fileName = path.basename(filePath);
    const binaryFileNames = new Set([
      'package-lock.json', // Too large and auto-generated
      'yarn.lock',         // Too large and auto-generated
      'pnpm-lock.yaml',    // Too large and auto-generated
      '.DS_Store',
      'Thumbs.db',
      'desktop.ini'
    ]);
    
    if (binaryFileNames.has(fileName)) {
      return true;
    }
    
    return false;
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
