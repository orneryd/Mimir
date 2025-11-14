/**
 * @file testing/chunk-aggregation.test.ts
 * @description Test chunk aggregation, IDs, and sequential relationships
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import neo4j, { Driver } from 'neo4j-driver';
import { FileIndexer } from '../src/indexing/FileIndexer.js';
import { UnifiedSearchService } from '../src/managers/UnifiedSearchService.js';
import { GraphManager } from '../src/managers/GraphManager.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe.skip('Chunk Aggregation and Sequential Relationships', () => {
  let driver: Driver;
  let searchService: UnifiedSearchService;
  let graphManager: GraphManager;
  let fileIndexer: FileIndexer;
  let tempDir: string;
  let testFile1: string;
  let testFile2: string;

  beforeAll(async () => {
    // Connect to test database
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    
    // Initialize GraphManager for schema
    graphManager = new GraphManager(uri, user, password);
    await graphManager.initialize();
    
    fileIndexer = new FileIndexer(driver);
    searchService = new UnifiedSearchService(driver);
    await searchService.initialize();

    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mimir-chunk-test-'));
    
    // Create test files with enough content to trigger chunking
    testFile1 = path.join(tempDir, 'test-file-1.ts');
    const content1 = `
// Test file 1 for chunk aggregation testing
// This file contains information about authentication systems

export class AuthenticationService {
  private tokenManager: TokenManager;
  private userRepository: UserRepository;

  // User authentication with JWT tokens
  async authenticateUser(username: string, password: string) {
    const user = await this.userRepository.findByUsername(username);
    if (!user || !await this.validatePassword(password, user.passwordHash)) {
      throw new Error('Invalid credentials');
    }
    return this.tokenManager.generateToken(user);
  }

  // Token validation for secure endpoints
  async validateToken(token: string) {
    const payload = this.tokenManager.verifyToken(token);
    return await this.userRepository.findById(payload.userId);
  }

  // Password reset functionality
  async resetPassword(userId: string, newPassword: string) {
    const hashedPassword = await this.hashPassword(newPassword);
    await this.userRepository.updatePassword(userId, hashedPassword);
  }
}

// Additional authentication utilities
export class TokenManager {
  private secretKey: string;

  generateToken(user: User): string {
    return jwt.sign({ userId: user.id, email: user.email }, this.secretKey);
  }

  verifyToken(token: string): TokenPayload {
    return jwt.verify(token, this.secretKey) as TokenPayload;
  }
}

// User repository for database operations
export class UserRepository {
  async findByUsername(username: string): Promise<User | null> {
    return await db.users.findOne({ username });
  }

  async findById(id: string): Promise<User | null> {
    return await db.users.findOne({ id });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await db.users.update({ id: userId }, { passwordHash: hashedPassword });
  }
}
`.repeat(3); // Repeat to ensure chunking (>1000 chars)

    testFile2 = path.join(tempDir, 'test-file-2.ts');
    const content2 = `
// Test file 2 for chunk aggregation testing
// This file contains database configuration and authentication setup

export class DatabaseConfig {
  private connectionString: string;
  
  // Database authentication settings
  async configureAuth() {
    const authConfig = {
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      authSource: 'admin'
    };
    return authConfig;
  }

  // Connection pool configuration
  async setupConnection() {
    return {
      poolSize: 10,
      authentication: await this.configureAuth(),
      ssl: true
    };
  }
}

// Additional database utilities
export class QueryBuilder {
  buildAuthQuery(userId: string) {
    return { user_id: userId, active: true };
  }
}
`.repeat(2); // Smaller file, fewer chunks

    await fs.writeFile(testFile1, content1, 'utf-8');
    await fs.writeFile(testFile2, content2, 'utf-8');
  });

  afterAll(async () => {
    // Cleanup test files
    await fs.unlink(testFile1).catch(() => {});
    await fs.unlink(testFile2).catch(() => {});
    await fs.rmdir(tempDir).catch(() => {});
    
    await driver.close();
  });

  beforeEach(async () => {
    // Clean test data
    const session = driver.session();
    try {
      await session.run(`
        MATCH (n)
        WHERE n.path STARTS WITH $tempDir OR n.filePath STARTS WITH $tempDir
        DETACH DELETE n
      `, { tempDir });
    } finally {
      await session.close();
    }
  });

  describe('Chunk ID Generation', () => {
    it('should generate unique IDs for each chunk', async () => {
      // Index file with embeddings (triggers chunking)
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      const session = driver.session();
      try {
        // FileIndexer stores relative paths, not absolute
        const relativePath = path.basename(testFile1);
        const result = await session.run(`
          MATCH (c:FileChunk)
          WHERE c.filePath = $filePath
          RETURN c.id AS chunk_id, c.chunk_index AS chunk_index
          ORDER BY c.chunk_index
        `, { filePath: relativePath });

        expect(result.records.length).toBeGreaterThan(0);
        
        const chunkIds = result.records.map(r => r.get('chunk_id'));
        
        // All IDs should be unique
        const uniqueIds = new Set(chunkIds);
        expect(uniqueIds.size).toBe(chunkIds.length);
        
        // IDs should follow the pattern: chunk-{filePath}-{index}
        for (const record of result.records) {
          const chunkId = record.get('chunk_id');
          const chunkIndex = record.get('chunk_index');
          
          expect(chunkId).toContain('chunk-');
          expect(chunkId).toContain(`-${chunkIndex}`);
        }
      } finally {
        await session.close();
      }
    });

    it('should not have null IDs for chunks', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      const session = driver.session();
      try {
        const result = await session.run(`
          MATCH (c:FileChunk)
          WHERE c.filePath STARTS WITH $tempDir
          RETURN c.id AS chunk_id
        `, { tempDir });

        for (const record of result.records) {
          const chunkId = record.get('chunk_id');
          expect(chunkId).not.toBeNull();
          expect(chunkId).toBeTruthy();
        }
      } finally {
        await session.close();
      }
    });
  });

  describe('NEXT_CHUNK Relationships', () => {
    it('should create NEXT_CHUNK relationships between sequential chunks', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      const session = driver.session();
      try {
        // Get all chunks ordered by index (use relative path)
        const relativePath = path.basename(testFile1);
        const chunksResult = await session.run(`
          MATCH (c:FileChunk)
          WHERE c.filePath = $filePath
          RETURN c.id AS chunk_id, c.chunk_index AS chunk_index
          ORDER BY c.chunk_index
        `, { filePath: relativePath });

        const chunks = chunksResult.records.map(r => ({
          id: r.get('chunk_id'),
          index: r.get('chunk_index')
        }));

        expect(chunks.length).toBeGreaterThan(1);

        // Check that NEXT_CHUNK relationships exist
        for (let i = 0; i < chunks.length - 1; i++) {
          const currentChunk = chunks[i];
          const nextChunk = chunks[i + 1];

          const relationshipResult = await session.run(`
            MATCH (curr:FileChunk {id: $currId})-[r:NEXT_CHUNK]->(next:FileChunk {id: $nextId})
            RETURN count(r) AS relationship_count
          `, {
            currId: currentChunk.id,
            nextId: nextChunk.id
          });

          const count = relationshipResult.records[0].get('relationship_count').toNumber();
          expect(count).toBe(1);
        }
      } finally {
        await session.close();
      }
    });

    it('should allow traversal of entire chunk chain', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      const session = driver.session();
      try {
        // Get first chunk (use relative path)
        const relativePath = path.basename(testFile1);
        const firstChunkResult = await session.run(`
          MATCH (c:FileChunk)
          WHERE c.filePath = $filePath AND c.chunk_index = 0
          RETURN c.id AS chunk_id
        `, { filePath: relativePath });

        expect(firstChunkResult.records.length).toBe(1);
        const firstChunkId = firstChunkResult.records[0].get('chunk_id');

        // Traverse the entire chain
        const chainResult = await session.run(`
          MATCH path = (start:FileChunk {id: $startId})-[:NEXT_CHUNK*]->(end:FileChunk)
          RETURN length(path) AS chain_length, 
                 [node IN nodes(path) | node.chunk_index] AS chunk_indices
          ORDER BY chain_length DESC
          LIMIT 1
        `, { startId: firstChunkId });

        if (chainResult.records.length > 0) {
          const chunkIndices = chainResult.records[0].get('chunk_indices');
          
          // Indices should be sequential
          for (let i = 0; i < chunkIndices.length - 1; i++) {
            expect(chunkIndices[i + 1]).toBe(chunkIndices[i] + 1);
          }
        }
      } finally {
        await session.close();
      }
    });

    it('should not create NEXT_CHUNK relationships to chunks from different files', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      await fileIndexer.indexFile(testFile2, tempDir, true);
      
      const session = driver.session();
      try {
        // Check that no NEXT_CHUNK relationships exist between different files
        const result = await session.run(`
          MATCH (c1:FileChunk)-[:NEXT_CHUNK]->(c2:FileChunk)
          WHERE c1.filePath <> c2.filePath
          RETURN count(*) AS cross_file_links
        `);

        const crossFileLinks = result.records[0].get('cross_file_links').toNumber();
        expect(crossFileLinks).toBe(0);
      } finally {
        await session.close();
      }
    });
  });

  describe('Chunk Aggregation by File', () => {
    it('should count only chunks from the same file', async () => {
      // Index both files
      await fileIndexer.indexFile(testFile1, tempDir, true);
      await fileIndexer.indexFile(testFile2, tempDir, true);
      
      // Search for "authentication" which appears in both files
      const result = await searchService.search('authentication', {
        types: ['file_chunk'],
        limit: 10,
        minSimilarity: 0.3
      });

      expect(result.results.length).toBeGreaterThan(0);

      // Each result should represent one file
      const filePaths = result.results.map(r => r.parent_file?.path || r.path);
      const uniqueFiles = new Set(filePaths);
      
      // Should have at most 2 unique files (test-file-1.ts and test-file-2.ts)
      expect(uniqueFiles.size).toBeLessThanOrEqual(2);

      // Verify chunks_matched for each result
      for (const resultItem of result.results) {
        if (resultItem.chunks_matched) {
          // chunks_matched should be a positive number
          expect(resultItem.chunks_matched).toBeGreaterThan(0);

          // Verify the count is accurate by querying the database
          const session = driver.session();
          try {
            const filePath = resultItem.parent_file?.path || resultItem.path;
            if (!filePath) continue;
            
            // File paths are stored as just the filename (e.g., 'test-file-1.ts')
            const fileName = path.basename(filePath);

            const countResult = await session.run(`
              MATCH (f:File {path: $fileName})-[:HAS_CHUNK]->(c:FileChunk)
              WHERE c.embedding IS NOT NULL
              RETURN count(c) AS total_chunks
            `, { fileName });

            const totalChunks = countResult.records[0]?.get('total_chunks').toNumber() || 0;
            
            // chunks_matched should be <= total chunks in the file
            expect(resultItem.chunks_matched).toBeLessThanOrEqual(totalChunks);
          } finally {
            await session.close();
          }
        }
      }
    });

    it('should return the best matching chunk for each file', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      const result = await searchService.search('authentication token', {
        types: ['file_chunk'],
        limit: 5,
        minSimilarity: 0.3
      });

      expect(result.results.length).toBeGreaterThan(0);

      for (const resultItem of result.results) {
        // Should have similarity score
        expect(resultItem.similarity).toBeDefined();
        expect(resultItem.similarity).toBeGreaterThan(0);

        // If there are multiple chunks, should have avg_similarity
        if (resultItem.chunks_matched && resultItem.chunks_matched > 1) {
          expect(resultItem.avg_similarity).toBeDefined();
          
          // Average similarity should be <= best similarity
          expect(resultItem.avg_similarity).toBeLessThanOrEqual(resultItem.similarity!);
        }

        // Should have content preview from the best chunk
        expect(resultItem.content_preview).toBeTruthy();
      }
    });

    it('should aggregate multiple matching chunks from the same file', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      // Search for a term that appears multiple times in the file
      const result = await searchService.search('authentication', {
        types: ['file_chunk'],
        limit: 5,
        minSimilarity: 0.3
      });

      // Find results with multiple chunks matched
      const multiChunkResults = result.results.filter(r => 
        r.chunks_matched && r.chunks_matched > 1
      );

      if (multiChunkResults.length > 0) {
        for (const resultItem of multiChunkResults) {
          // Should have chunks_matched > 1
          expect(resultItem.chunks_matched).toBeGreaterThan(1);

          // Should have avg_similarity
          expect(resultItem.avg_similarity).toBeDefined();

          // Should have only one result per file (aggregated)
          expect(resultItem.parent_file).toBeDefined();
          expect(resultItem.parent_file!.path).toBeTruthy();

          // Check that we're not returning duplicate entries for this file
          const sameFileResults = result.results.filter(r => 
            r.parent_file?.path === resultItem.parent_file!.path
          );
          expect(sameFileResults.length).toBe(1);
        }
      }
    });
  });

  describe('Search Result Format', () => {
    it('should include chunk_index for the best matching chunk', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      const result = await searchService.search('authentication', {
        types: ['file_chunk'],
        limit: 5,
        minSimilarity: 0.3
      });

      expect(result.results.length).toBeGreaterThan(0);

      for (const resultItem of result.results) {
        if (resultItem.type === 'file_chunk') {
          // Should have chunk_index
          expect(resultItem.chunk_index).toBeDefined();
          expect(typeof resultItem.chunk_index).toBe('number');
          expect(resultItem.chunk_index).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should include parent_file information for file_chunk results', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      const result = await searchService.search('authentication', {
        types: ['file_chunk'],
        limit: 5,
        minSimilarity: 0.3
      });

      expect(result.results.length).toBeGreaterThan(0);

      for (const resultItem of result.results) {
        if (resultItem.type === 'file_chunk') {
          expect(resultItem.parent_file).toBeDefined();
          expect(resultItem.parent_file!.path).toBeTruthy();
          expect(resultItem.parent_file!.name).toBeTruthy();
          expect(resultItem.parent_file!.language).toBe('typescript');
        }
      }
    });

    it('should not have duplicate file entries in results', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      await fileIndexer.indexFile(testFile2, tempDir, true);
      
      const result = await searchService.search('authentication', {
        types: ['file_chunk'],
        limit: 10,
        minSimilarity: 0.3
      });

      // Get all file paths from results
      const filePaths = result.results.map(r => 
        r.parent_file?.path || r.path
      );

      // Check for duplicates
      const uniqueFiles = new Set(filePaths);
      expect(uniqueFiles.size).toBe(filePaths.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with only one chunk', async () => {
      // Create a small file that won't be chunked
      const smallFile = path.join(tempDir, 'small-file.ts');
      const smallContent = 'export const config = { auth: true };';
      await fs.writeFile(smallFile, smallContent, 'utf-8');

      await fileIndexer.indexFile(smallFile, tempDir, true);
      
      const session = driver.session();
      try {
        const result = await session.run(`
          MATCH (f:File)
          WHERE f.path = $relativePath
          RETURN f.has_chunks AS has_chunks
        `, { relativePath: path.relative(tempDir, smallFile) });

        if (result.records.length > 0) {
          const hasChunks = result.records[0].get('has_chunks');
          
          // Small file should not have separate chunks
          expect(hasChunks).toBe(false);
        }
      } finally {
        await session.close();
      }

      await fs.unlink(smallFile);
    });

    it('should handle files with no matches', async () => {
      await fileIndexer.indexFile(testFile1, tempDir, true);
      
      const result = await searchService.search('xyznonexistentterm12345', {
        types: ['file_chunk'],
        limit: 5,
        minSimilarity: 0.9
      });

      expect(result.status).toBe('success');
      expect(result.results.length).toBe(0);
    });
  });
});
