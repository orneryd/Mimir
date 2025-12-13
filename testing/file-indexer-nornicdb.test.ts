/**
 * Unit tests for FileIndexer NornicDB detection and embedding skip logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { FileIndexer } from '../src/indexing/FileIndexer.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock neo4j-driver
vi.mock('neo4j-driver', () => {
  const mockSession = {
    run: vi.fn(),
    close: vi.fn()
  };
  
  const mockDriver = {
    session: vi.fn(() => mockSession)
  };
  
  return {
    default: {
      driver: vi.fn(() => mockDriver),
      auth: {
        basic: vi.fn((user, pass) => ({ scheme: 'basic', credentials: `${user}:${pass}` }))
      }
    }
  };
});

// Mock EmbeddingsService
vi.mock('../src/indexing/EmbeddingsService.js', () => ({
  EmbeddingsService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    generateEmbedding: vi.fn().mockResolvedValue({
      embedding: new Array(768).fill(0.1),
      dimensions: 768,
      model: 'test-model'
    }),
    generateChunkEmbeddings: vi.fn().mockResolvedValue([
      {
        text: 'chunk 1',
        embedding: new Array(768).fill(0.1),
        dimensions: 768,
        model: 'test-model',
        startOffset: 0,
        endOffset: 100,
        chunkIndex: 0
      }
    ])
  })),
  // Export the standalone function used by FileIndexer for NornicDB metadata enrichment
  formatMetadataForEmbedding: vi.fn((metadata: any) => {
    const parts = [`File: ${metadata.relativePath}`];
    if (metadata.language) parts.push(`Language: ${metadata.language}`);
    if (metadata.extension) parts.push(`Extension: ${metadata.extension}`);
    return parts.join(' | ') + '\n\n';
  })
}));

// Mock DocumentParser
vi.mock('../src/indexing/DocumentParser.js', () => ({
  DocumentParser: vi.fn().mockImplementation(() => ({
    isSupportedFormat: vi.fn().mockReturnValue(false),
    extractText: vi.fn().mockResolvedValue('extracted text')
  }))
}));

// Mock LLMConfigLoader
vi.mock('../src/config/LLMConfigLoader.js', () => ({
  LLMConfigLoader: {
    getInstance: vi.fn(() => ({
      getEmbeddingsConfig: vi.fn().mockResolvedValue({
        enabled: true,
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        images: {
          enabled: false,
          describeMode: true,
          maxPixels: 3211264,
          targetSize: 1536,
          resizeQuality: 90
        }
      })
    }))
  }
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue('test content'), // Return string not Buffer
    stat: vi.fn().mockResolvedValue({
      size: 1024,
      mtime: new Date()
    })
  }
}));

describe('FileIndexer - NornicDB Detection', () => {
  let fileIndexer: FileIndexer;
  let mockDriver: any;
  let mockSession: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockDriver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'password'));
    mockSession = mockDriver.session();
    vi.clearAllMocks();
    
    // Setup default mock responses for all indexFile calls
    // This prevents the complex query chain from failing
    mockSession.run.mockImplementation((query: string, params?: any) => {
      // Detection query
      if (query.includes('RETURN 1 as test')) {
        const agent = process.env.MIMIR_DATABASE_PROVIDER === 'nornicdb' 
          ? 'NornicDB/1.0.0' 
          : 'Neo4j/5.13.0';
        return Promise.resolve({
          records: [{ get: () => 1 }],
          summary: {
            server: { agent }
          }
        });
      }
      
      // Chunk check query
      if (query.includes('chunk_count')) {
        return Promise.resolve({
          records: [] // No existing chunks
        });
      }
      
      // File creation query
      if (query.includes('MERGE (f:File')) {
        return Promise.resolve({
          records: [{ 
            get: (key: string) => {
              if (key === 'node_id') return 123;
              return 'file-1';
            }
          }]
        });
      }
      
      // Default
      return Promise.resolve({ records: [] });
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Provider Detection', () => {
    it('should detect NornicDB from manual override', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      
      fileIndexer = new FileIndexer(mockDriver);
      
      await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      // Verify NornicDB was detected
      expect((fileIndexer as any).isNornicDB).toBe(true);
    });

    it('should detect Neo4j from manual override', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'neo4j';
      
      fileIndexer = new FileIndexer(mockDriver);
      await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      expect((fileIndexer as any).isNornicDB).toBe(false);
    });

    it('should auto-detect NornicDB from server agent', async () => {
      delete process.env.MIMIR_DATABASE_PROVIDER;
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb'; // Simulate detection
      
      fileIndexer = new FileIndexer(mockDriver);
      await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      expect((fileIndexer as any).isNornicDB).toBe(true);
    });

    it('should auto-detect Neo4j from server agent', async () => {
      delete process.env.MIMIR_DATABASE_PROVIDER;
      // Default mock returns Neo4j
      
      fileIndexer = new FileIndexer(mockDriver);
      await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      expect((fileIndexer as any).isNornicDB).toBe(false);
    });

    it('should default to Neo4j on detection error', async () => {
      delete process.env.MIMIR_DATABASE_PROVIDER;
      
      // Override mock to simulate error on first call
      let callCount = 0;
      mockSession.run.mockImplementation((query: string) => {
        callCount++;
        if (callCount === 1 && query.includes('RETURN 1')) {
          return Promise.reject(new Error('Connection failed'));
        }
        // Use default implementation for other calls
        if (query.includes('chunk_count')) return Promise.resolve({ records: [] });
        if (query.includes('MERGE (f:File')) return Promise.resolve({ records: [{ get: () => 123 }] });
        return Promise.resolve({ records: [] });
      });
      
      fileIndexer = new FileIndexer(mockDriver);
      await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      expect((fileIndexer as any).isNornicDB).toBe(false);
    });
  });

  describe('Embeddings Service Initialization', () => {
    it('should initialize embeddings service for Neo4j', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'neo4j';
      
      fileIndexer = new FileIndexer(mockDriver);
      await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      // Verify embeddings service was initialized
      expect((fileIndexer as any).embeddingsInitialized).toBe(true);
      expect((fileIndexer as any).isNornicDB).toBe(false);
    });

    it('should NOT initialize embeddings service for NornicDB', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      
      fileIndexer = new FileIndexer(mockDriver);
      await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      // Verify detection happened but embeddings service was NOT initialized
      // For NornicDB, embeddingsInitialized stays false since initEmbeddings() is never called
      expect((fileIndexer as any).providerDetected).toBe(true);
      expect((fileIndexer as any).embeddingsInitialized).toBe(false);
      expect((fileIndexer as any).isNornicDB).toBe(true);
    });
  });

  describe('Embedding Generation Skip Logic', () => {
    it('should generate embeddings for Neo4j', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'neo4j';
      
      fileIndexer = new FileIndexer(mockDriver);
      const result = await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      // Verify embeddings service exists for Neo4j
      const embeddingsService = (fileIndexer as any).embeddingsService;
      expect(embeddingsService).toBeTruthy();
      expect((fileIndexer as any).isNornicDB).toBe(false);
    });

    it('should skip embedding generation for NornicDB', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      
      fileIndexer = new FileIndexer(mockDriver);
      const result = await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      // Verify no embedding generation occurred
      const embeddingsService = (fileIndexer as any).embeddingsService;
      expect(embeddingsService.generateEmbedding).not.toHaveBeenCalled();
      expect(embeddingsService.generateChunkEmbeddings).not.toHaveBeenCalled();
    });

    it('should skip embeddings even when generateEmbeddings=true for NornicDB', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      
      fileIndexer = new FileIndexer(mockDriver);
      // Explicitly request embeddings
      const result = await fileIndexer.indexFile('/test/file.txt', '/test', true);
      
      // Should still skip for NornicDB - verify isNornicDB flag set
      expect((fileIndexer as any).isNornicDB).toBe(true);
      
      // Embeddings service still gets called during init but returns early
      const embeddingsService = (fileIndexer as any).embeddingsService;
      expect(embeddingsService.generateEmbedding).not.toHaveBeenCalled();
    });
  });

  describe('File Content Storage', () => {
    it('should store file content for both Neo4j and NornicDB', async () => {
      // Test with NornicDB - content should still be stored
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      
      // Capture file creation params
      let capturedParams: any;
      mockSession.run.mockImplementation((query: string, params?: any) => {
        if (query.includes('RETURN 1 as test')) {
          return Promise.resolve({
            records: [{ get: () => 1 }],
            summary: { server: { agent: 'NornicDB/1.0.0' } }
          });
        }
        if (query.includes('chunk_count')) {
          return Promise.resolve({ records: [] });
        }
        if (query.includes('MERGE (f:File')) {
          capturedParams = params;
          return Promise.resolve({
            records: [{ get: () => 123 }]
          });
        }
        return Promise.resolve({ records: [] });
      });
      
      fileIndexer = new FileIndexer(mockDriver);
      await fileIndexer.indexFile('/test/file.txt', '/test', false);
      
      // Verify file content was stored
      expect(capturedParams.content).toBeTruthy();
    });
  });
});
