// ============================================================================
// FileIndexer - Index files into Neo4j
// Phase 1: Basic file indexing with content
// Phase 2: Vector embeddings for semantic search
// Phase 3: Parse and extract functions/classes (future)
// ============================================================================

import { Driver } from 'neo4j-driver';
import { promises as fs } from 'fs';
import path from 'path';
import { EmbeddingsService, ChunkEmbeddingResult, formatMetadataForEmbedding, FileMetadata } from './EmbeddingsService.js';
import { DocumentParser } from './DocumentParser.js';
import { getHostWorkspaceRoot } from '../utils/path-utils.js';
import { ImageProcessor } from './ImageProcessor.js';
import { VLService } from './VLService.js';
import { LLMConfigLoader } from '../config/LLMConfigLoader.js';

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
  private imageProcessor: ImageProcessor | null = null;
  private vlService: VLService | null = null;
  private configLoader: LLMConfigLoader;

  constructor(private driver: Driver) {
    this.embeddingsService = new EmbeddingsService();
    this.documentParser = new DocumentParser();
    this.configLoader = LLMConfigLoader.getInstance();
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
   * Initialize image processing services (lazy loading)
   */
  private async initImageServices(): Promise<void> {
    const config = await this.configLoader.getEmbeddingsConfig();
    
    if (!config?.images?.enabled) {
      return;
    }

    // Initialize ImageProcessor
    if (!this.imageProcessor) {
      this.imageProcessor = new ImageProcessor({
        maxPixels: config.images.maxPixels,
        targetSize: config.images.targetSize,
        resizeQuality: config.images.resizeQuality
      });
    }

    // Initialize VLService if describe mode is enabled
    if (config.images.describeMode && config.vl && !this.vlService) {
      this.vlService = new VLService({
        provider: config.vl.provider,
        api: config.vl.api,
        apiPath: config.vl.apiPath,
        apiKey: config.vl.apiKey,
        model: config.vl.model,
        contextSize: config.vl.contextSize,
        maxTokens: config.vl.maxTokens,
        temperature: config.vl.temperature
      });
      console.log('🖼️  Image embedding services initialized (VL describe mode)');
    }
  }

  /**
   * Translate container path to host path
   * e.g., /workspace/my-project/file.ts -> /Users/user/src/my-project/file.ts
   * If not in Docker, both paths are the same
   */
  private translateToHostPath(containerPath: string): string {
    const workspaceRoot = process.env.WORKSPACE_ROOT;
    const hostWorkspaceRoot = process.env.HOST_WORKSPACE_ROOT;
    
    // If WORKSPACE_ROOT not set, we're running locally - no translation needed
    if (!workspaceRoot) {
      return containerPath;
    }
    
    // If HOST_WORKSPACE_ROOT not set but WORKSPACE_ROOT is, something is misconfigured
    if (!hostWorkspaceRoot) {
      console.warn('⚠️  WORKSPACE_ROOT is set but HOST_WORKSPACE_ROOT is not - path translation may fail');
      return containerPath;
    }
    
    // Expand tilde in HOST_WORKSPACE_ROOT for consistent storage
    // Use getHostWorkspaceRoot() which properly expands tilde
    const expandedHostRoot = getHostWorkspaceRoot();
    
    // Replace container workspace root with expanded host workspace root
    if (containerPath.startsWith(workspaceRoot)) {
      return containerPath.replace(workspaceRoot, expandedHostRoot);
    }
    
    return containerPath;
  }

  /**
   * Index a single file with optional embeddings (Industry Standard: Separate Chunks)
   * Creates File node + FileChunk nodes with individual embeddings
   */
  async indexFile(filePath: string, rootPath: string, generateEmbeddings: boolean = false): Promise<IndexResult> {
    const session = this.driver.session();
    let content: string = '';
    let isImage = false;
    
    try {
      const relativePath = path.relative(rootPath, filePath);
      const extension = path.extname(filePath).toLowerCase();
      const binaryDoc = this.documentParser.isSupportedFormat(extension);
      
      // Check if this is an image file BEFORE the binary skip
      if (ImageProcessor.isImageFile(filePath) && generateEmbeddings) {
        await this.initImageServices();
        const config = await this.configLoader.getEmbeddingsConfig();
        
        if (config?.images?.enabled) {
          isImage = true;
          
          if (config.images.describeMode && this.vlService && this.imageProcessor) {
            // Path 1: VL Description Method (DEFAULT)
            // Uses VL model to generate text description, then embeds the description
            console.log(`🖼️  Processing image with VL description: ${relativePath}`);
            
            // 1. Prepare image (resize if needed)
            const processedImage = await this.imageProcessor.prepareImageForVL(filePath);
            
            if (processedImage.wasResized) {
              console.log(`   Resized from ${processedImage.originalSize.width}×${processedImage.originalSize.height} to ${processedImage.processedSize.width}×${processedImage.processedSize.height}`);
            }
            
            // 2. Create Data URL
            const dataURL = this.imageProcessor.createDataURL(processedImage.base64, processedImage.format);
            
            // 3. Get description from VL model
            const result = await this.vlService.describeImage(dataURL);
            content = result.description;
            
            console.log(`   Generated description (${content.length} chars) in ${result.processingTimeMs}ms`);
          } else if (!config.images.describeMode && this.imageProcessor) {
            // Path 2: Direct Multimodal Embedding
            // Sends image directly to multimodal embeddings endpoint
            console.log(`🖼️  Processing image with direct multimodal embedding: ${relativePath}`);
            
            // 1. Prepare image (resize if needed)
            const processedImage = await this.imageProcessor.prepareImageForVL(filePath);
            
            if (processedImage.wasResized) {
              console.log(`   Resized from ${processedImage.originalSize.width}×${processedImage.originalSize.height} to ${processedImage.processedSize.width}×${processedImage.processedSize.height}`);
            }
            
            // 2. Create Data URL for embedding
            const dataURL = this.imageProcessor.createDataURL(processedImage.base64, processedImage.format);
            
            // 3. Store the data URL as content - will be sent to embeddings service
            // The embeddings service will handle multimodal input
            content = dataURL;
            
            console.log(`   Prepared image for direct embedding (${processedImage.sizeBytes} bytes)`);
          } else {
            // Missing required services
            const missingServices = [];
            if (!this.imageProcessor) missingServices.push('ImageProcessor');
            if (config.images.describeMode && !this.vlService) missingServices.push('VLService');
            
            throw new Error(`Image processing requires: ${missingServices.join(', ')}`);
          }
        } else {
          // Images disabled, skip
          throw new Error('Image indexing disabled');
        }
      } else if (binaryDoc) {
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
          { path: filePath }
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
              
              // Delete old chunks (use filePath which is the absolute container path)
              await session.run(
                `MATCH (f:File {path: $path})-[:HAS_CHUNK]->(c:FileChunk)
                 DETACH DELETE c`,
                { path: filePath }
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
      
      // Create File node with BOTH container and host paths
      // f.path = absolute container path (e.g., /app/docs/README.md)
      // f.host_path = absolute host path (e.g., /Users/user/src/Mimir/docs/README.md)
      // When not in Docker, both paths are the same
      
      // Convert container path to host path using environment variables
      const hostPath = this.translateToHostPath(filePath);
      // Use host path for logging (fall back to container path if not available)
      const displayPath = hostPath || filePath;
      
      const fileResult = await session.run(`
        MERGE (f:File:Node {path: $path})
        ON CREATE SET f.id = 'file-' + toString(timestamp()) + '-' + substring(randomUUID(), 0, 8)
        SET 
          f.host_path = $host_path,
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
        path: filePath,  // Now stores absolute container path
        host_path: hostPath,
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
            // Prepare metadata for enrichment (ALL files get metadata enrichment)
            const fileMetadata: FileMetadata = {
              name: path.basename(filePath),
              relativePath: relativePath,
              language: language,
              extension: extension,
              directory: path.dirname(relativePath),
              sizeBytes: stats.size
            };
            
            // Format metadata as natural language prefix
            const metadataPrefix = formatMetadataForEmbedding(fileMetadata);
            
            if (needsChunking) {
              // Large file: Generate separate chunk embeddings with metadata
              // Prepend metadata to the FULL content before chunking
              const enrichedContent = metadataPrefix + content;
              const chunkEmbeddings = await this.embeddingsService.generateChunkEmbeddings(enrichedContent);
              
              // Create FileChunk nodes with embeddings and sequential relationships
              let previousChunkId: string | null = null;
              
              for (const chunk of chunkEmbeddings) {
                // Generate unique chunk ID
                const chunkId = `chunk-${relativePath}-${chunk.chunkIndex}`;
                
                const result = await session.run(`
                  MATCH (f:File) WHERE id(f) = $fileNodeId
                  MERGE (c:FileChunk:Node {id: $chunkId})
                  ON CREATE SET
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
                  ON MATCH SET
                      c.chunk_index = $chunkIndex,
                      c.text = $text,
                      c.start_offset = $startOffset,
                      c.end_offset = $endOffset,
                      c.embedding = $embedding,
                      c.embedding_dimensions = $dimensions,
                      c.embedding_model = $model,
                      c.indexed_date = datetime()
                  MERGE (f)-[:HAS_CHUNK {index: $chunkIndex}]->(c)
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
              
              console.log(`✅ Created ${chunksCreated} chunk embeddings with sequential links for ${displayPath}`);
            } else {
              // Small file: Store embedding directly on File node with metadata enrichment
              const enrichedContent = metadataPrefix + content;
              const embedding = await this.embeddingsService.generateEmbedding(enrichedContent);
              
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
              
              console.log(`✅ Created file embedding for ${displayPath}`);
            }
          } catch (error: any) {
            console.warn(`⚠️  Failed to generate embeddings for ${displayPath}: ${error.message}`);
          }
        }
      } else if (generateEmbeddings && hasExistingChunks) {
        console.log(`⏭️  Skipping embeddings (already exist): ${displayPath}`);
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
   * Check if file should be skipped (binary, images, archives, sensitive files, etc.)
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
      '.pkl', '.pickle', '.parquet', '.avro', '.protobuf', '.pb',
      // Sensitive file extensions (Industry Standard Security)
      '.pem', '.key', '.p12', '.pfx', '.cer', '.crt', '.der', // Certificates & Private Keys
      '.keystore', '.jks', '.bks', // Java keystores
      '.ppk', '.pub', // SSH keys
      '.credentials', '.secret', // Credential files
      '.log' // Logs (may contain sensitive data)
    ]);
    
    // Check extension
    if (skipExtensions.has(extension)) {
      return true;
    }
    
    // Skip files without extension that are likely binary or auto-generated
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
    
    // Skip sensitive files by name (Industry Standard Security)
    // Configurable via MIMIR_SENSITIVE_FILES environment variable (comma-separated)
    const defaultSensitiveFiles = [
      '.env', '.env.local', '.env.development', '.env.production', '.env.test', '.env.staging', '.env.example', // Environment files
      '.npmrc', '.yarnrc', '.pypirc', // Package manager configs with tokens
      '.netrc', '_netrc', // FTP/HTTP credentials
      'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', // SSH private keys
      'credentials', 'secrets.yml', 'secrets.yaml', 'secrets.json',
      'master.key', 'production.key' // Rails secrets
    ];
    
    const sensitiveFileNames = new Set(
      process.env.MIMIR_SENSITIVE_FILES 
        ? process.env.MIMIR_SENSITIVE_FILES.split(',').map(f => f.trim()).filter(f => f.length > 0)
        : defaultSensitiveFiles
    );
    
    if (sensitiveFileNames.has(fileName)) {
      return true;
    }
    
    // Skip files with sensitive patterns in name
    const lowerFileName = fileName.toLowerCase();
    const sensitivePatterns = [
      'password', 'passwd', 'secret', 'credential', 'token', 'apikey', 'api_key', 'private_key'
    ];
    
    for (const pattern of sensitivePatterns) {
      if (lowerFileName.includes(pattern)) {
        return true;
      }
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
