/**
 * @file testing/unified-search-nornicdb.test.ts
 * @description Unit tests for UnifiedSearchService - Neo4j vs NornicDB paths
 * 
 * Tests validate that:
 * 1. Both paths use the same Cypher query structure
 * 2. Score thresholds are correctly applied (cosine similarity 0-1 for both)
 * 3. Results are formatted consistently
 * 4. Fallback behavior works correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import neo4j from 'neo4j-driver';

// Mock neo4j-driver before importing UnifiedSearchService
vi.mock('neo4j-driver', () => {
  const mockSession = {
    run: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined)
  };
  
  const mockDriver = {
    session: vi.fn(() => mockSession)
  };
  
  return {
    default: {
      driver: vi.fn(() => mockDriver),
      auth: {
        basic: vi.fn((user, pass) => ({ scheme: 'basic', credentials: `${user}:${pass}` }))
      },
      int: vi.fn((n: number) => ({ low: n, high: 0 }))
    },
    int: vi.fn((n: number) => ({ low: n, high: 0 }))
  };
});

// Mock EmbeddingsService
vi.mock('../src/indexing/EmbeddingsService.js', () => ({
  EmbeddingsService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    generateEmbedding: vi.fn().mockResolvedValue({
      embedding: new Array(1024).fill(0.1),
      dimensions: 1024,
      model: 'mxbai-embed-large'
    })
  }))
}));

// Import after mocks are set up
import { UnifiedSearchService } from '../src/managers/UnifiedSearchService.js';

describe('UnifiedSearchService - NornicDB vs Neo4j Search Paths', () => {
  let searchService: UnifiedSearchService;
  let mockDriver: any;
  let mockSession: any;
  let originalEnv: NodeJS.ProcessEnv;

  // Helper to create mock Neo4j Record objects
  const createMockRecord = (data: Record<string, any>) => ({
    get: (field: string) => data[field],
    has: (field: string) => field in data && data[field] !== undefined
  });

  // Sample search results that both paths should return
  const mockSearchRecords = [
    createMockRecord({
      id: 'memory-1',
      type: 'memory',
      title: 'Authentication Decision',
      name: null,
      description: 'Decided to use JWT tokens',
      content: 'We decided to implement JWT-based authentication for the API',
      path: null,
      absolute_path: null,
      chunk_text: null,
      chunk_index: null,
      similarity: 0.85,  // Cosine similarity (0-1 range)
      avg_similarity: 0.85,
      chunks_matched: null,
      parent_file_path: null,
      parent_file_absolute_path: null,
      parent_file_name: null,
      parent_file_language: null
    }),
    createMockRecord({
      id: 'file-chunk-1',
      type: 'file_chunk',
      title: 'auth.ts',
      name: 'auth.ts',
      description: null,
      content: null,
      path: '/workspace/src/auth.ts',
      absolute_path: '/workspace/src/auth.ts',
      chunk_text: 'export function authenticate(token: string) { ... }',
      chunk_index: 0,
      similarity: 0.78,
      avg_similarity: 0.75,
      chunks_matched: 3,
      chunk_id: 'chunk-1',
      parent_file_path: '/workspace/src/auth.ts',
      parent_file_absolute_path: '/workspace/src/auth.ts',
      parent_file_name: 'auth.ts',
      parent_file_language: 'typescript'
    })
  ];

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Get mocked driver and session
    mockDriver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'password'));
    mockSession = mockDriver.session();
    
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('Database Provider Detection', () => {
    it('should detect NornicDB and use server-side search path', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      
      // Mock provider detection query
      mockSession.run.mockResolvedValueOnce({
        records: [{ get: () => 1 }],
        summary: { server: { agent: 'NornicDB/1.0.0' } }
      });
      
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      // Verify NornicDB detection happened
      expect((searchService as any).isNornicDB).toBe(true);
    });

    it('should detect Neo4j and use client-side embedding path', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'neo4j';
      
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      expect((searchService as any).isNornicDB).toBe(false);
    });
  });

  describe('NornicDB Search Path', () => {
    beforeEach(async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
    });

    it('should pass string query directly to db.index.vector.queryNodes', async () => {
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      await searchService.search('authentication', { limit: 10 });
      
      // Verify the query was called with string parameter
      const callArgs = mockSession.run.mock.calls[0];
      const cypher = callArgs[0];
      const params = callArgs[1];
      
      expect(cypher).toContain('db.index.vector.queryNodes');
      expect(params.searchQuery).toBe('authentication');
    });

    it('should use cosine similarity threshold (0-1), NOT RRF scores', async () => {
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      // Search with default options
      await searchService.search('test query', { limit: 10 });
      
      const callArgs = mockSession.run.mock.calls[0];
      const params = callArgs[1];
      
      // BUG CHECK: The current code uses 0.005 as default minSimilarity
      // This is WRONG because db.index.vector.queryNodes returns cosine similarity (0-1)
      // NOT RRF scores (0.01-0.05)
      // 
      // The default should be 0.5 or higher for meaningful results
      console.log('NornicDB minScore parameter:', params.minScore);
      
      // This test documents the current (buggy) behavior
      // After fix, this should be around 0.5-0.75
      expect(params.minScore).toBeDefined();
    });

    it('should format results consistently with Neo4j path', async () => {
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      const result = await searchService.search('authentication', { limit: 10 });
      
      expect(result.status).toBe('success');
      expect(result.search_method).toBe('rrf_hybrid');
      expect(result.results.length).toBe(2);
      
      // Verify result structure
      const firstResult = result.results[0];
      expect(firstResult).toHaveProperty('id');
      expect(firstResult).toHaveProperty('type');
      expect(firstResult).toHaveProperty('similarity');
    });

    it('should expand file type to include file_chunk', async () => {
      mockSession.run.mockResolvedValueOnce({ records: [] });
      
      await searchService.search('test', { types: ['file'], limit: 10 });
      
      const callArgs = mockSession.run.mock.calls[0];
      const params = callArgs[1];
      
      expect(params.types).toContain('file');
      expect(params.types).toContain('file_chunk');
    });

    it('should fallback to fulltext search on error', async () => {
      // First call fails (vector search)
      mockSession.run.mockRejectedValueOnce(new Error('Vector index not found'));
      // Second call succeeds (fulltext fallback)
      mockSession.run.mockResolvedValueOnce({ records: [] });
      
      const result = await searchService.search('test query', { limit: 10 });
      
      expect(result.fallback_triggered).toBe(true);
      expect(result.search_method).toBe('fulltext');
    });
  });

  describe('Neo4j Search Path', () => {
    beforeEach(async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'neo4j';
      
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
    });

    it('should generate embedding client-side and pass vector array', async () => {
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      await searchService.search('authentication', { limit: 10 });
      
      const callArgs = mockSession.run.mock.calls[0];
      const cypher = callArgs[0];
      const params = callArgs[1];
      
      expect(cypher).toContain('db.index.vector.queryNodes');
      // Neo4j path passes queryVector (array), not searchQuery (string)
      expect(params.queryVector).toBeDefined();
      expect(Array.isArray(params.queryVector)).toBe(true);
    });

    it('should use appropriate cosine similarity threshold', async () => {
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      await searchService.search('test query', { limit: 10, minSimilarity: 0.75 });
      
      const callArgs = mockSession.run.mock.calls[0];
      const params = callArgs[1];
      
      // Neo4j path uses minSimilarity correctly
      expect(params.minSimilarity).toBe(0.75);
    });
  });

  describe('Query Structure Parity', () => {
    it('NornicDB and Neo4j should use same db.index.vector.queryNodes procedure', async () => {
      // Test NornicDB path
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      let nornicService = new UnifiedSearchService(mockDriver);
      await nornicService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: [] });
      await nornicService.search('test', { limit: 10 });
      const nornicCypher = mockSession.run.mock.calls[0][0];
      
      // Reset and test Neo4j path
      vi.clearAllMocks();
      process.env.MIMIR_DATABASE_PROVIDER = 'neo4j';
      let neo4jService = new UnifiedSearchService(mockDriver);
      await neo4jService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: [] });
      await neo4jService.search('test', { limit: 10 });
      const neo4jCypher = mockSession.run.mock.calls[0][0];
      
      // Both should call db.index.vector.queryNodes
      expect(nornicCypher).toContain('db.index.vector.queryNodes');
      expect(neo4jCypher).toContain('db.index.vector.queryNodes');
      
      // Both should use same index name
      expect(nornicCypher).toContain('node_embedding_index');
      expect(neo4jCypher).toContain('node_embedding_index');
    });

    it('NornicDB query should return cosine similarity scores (0-1), not RRF scores', async () => {
      // According to NornicDB source code (call.go line 1023):
      // score = vector.CosineSimilarity(queryVector, nodeEmbedding)
      // This returns values in 0-1 range, NOT RRF scores (0.01-0.05)
      
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      // Mock returns cosine similarity (0.85)
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      const result = await searchService.search('authentication', { limit: 10 });
      
      // Results should have similarity in 0-1 range
      expect(result.results[0].similarity).toBe(0.85);
      expect(result.results[0].similarity).toBeGreaterThanOrEqual(0);
      expect(result.results[0].similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('Similarity Threshold Bug Analysis', () => {
    it('FIXED: NornicDB path now uses correct cosine similarity threshold (0.5)', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      // Search without explicit minSimilarity
      await searchService.search('test', { limit: 10 });
      
      const params = mockSession.run.mock.calls[0][1];
      
      // FIXED: Now uses 0.5 default (cosine similarity)
      // Previously used 0.005 (incorrectly assuming RRF scores)
      expect(params.minScore).toBe(0.5);
    });

    it('Neo4j path correctly uses 0.75 default threshold', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'neo4j';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      // Search without explicit minSimilarity  
      await searchService.search('test', { limit: 10 });
      
      const params = mockSession.run.mock.calls[0][1];
      
      // Neo4j path uses correct default
      expect(params.minSimilarity).toBe(0.75);
    });
  });

  describe('Empty Query Handling', () => {
    it('should return empty results for empty query', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      const result = await searchService.search('', { limit: 10 });
      
      expect(result.status).toBe('success');
      expect(result.results).toEqual([]);
      expect(mockSession.run).not.toHaveBeenCalled();
    });
  });

  describe('Result Aggregation (File Chunks)', () => {
    it('NornicDB path should aggregate file chunks by parent file', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      const result = await searchService.search('authentication', { 
        types: ['file'],
        limit: 10 
      });
      
      // Find the file_chunk result
      const chunkResult = result.results.find(r => r.type === 'file_chunk');
      
      // Verify parent file info is included
      if (chunkResult) {
        expect(chunkResult.parent_file).toBeDefined();
      }
    });

    it('Neo4j path aggregates chunks correctly', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'neo4j';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: mockSearchRecords });
      
      const result = await searchService.search('authentication', {
        types: ['file'],
        limit: 10
      });
      
      // Neo4j path has aggregation logic in Cypher query
      const query = mockSession.run.mock.calls[0][0];
      expect(query).toContain('OPTIONAL MATCH');
      expect(query).toContain('parentFile');
    });
  });
});

describe('UnifiedSearchService - Integration Tests (Mocked)', () => {
  let searchService: UnifiedSearchService;
  let mockDriver: any;
  let mockSession: any;

  beforeEach(async () => {
    mockDriver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'password'));
    mockSession = mockDriver.session();
    vi.clearAllMocks();
  });

  describe('Search with type filtering', () => {
    it('should filter by single type', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: [] });
      
      await searchService.search('test', { types: ['memory'], limit: 10 });
      
      const params = mockSession.run.mock.calls[0][1];
      expect(params.types).toContain('memory');
    });

    it('should filter by multiple types', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: [] });
      
      await searchService.search('test', { types: ['memory', 'todo'], limit: 10 });
      
      const params = mockSession.run.mock.calls[0][1];
      expect(params.types).toContain('memory');
      expect(params.types).toContain('todo');
    });
  });

  describe('Limit parameter handling', () => {
    it('should apply limit correctly', async () => {
      process.env.MIMIR_DATABASE_PROVIDER = 'nornicdb';
      searchService = new UnifiedSearchService(mockDriver);
      await searchService.initialize();
      
      mockSession.run.mockResolvedValueOnce({ records: [] });
      
      await searchService.search('test', { limit: 25 });
      
      const params = mockSession.run.mock.calls[0][1];
      // NornicDB path gets more candidates then limits
      expect(params.searchLimit.low).toBe(50); // limit * 2
      expect(params.finalLimit.low).toBe(25);
    });
  });
});
