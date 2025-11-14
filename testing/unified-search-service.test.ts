/**
 * @file testing/unified-search-service.test.ts
 * @description Test unified search with vector/fulltext fallback
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import neo4j, { Driver } from 'neo4j-driver';
import { UnifiedSearchService } from '../src/managers/UnifiedSearchService.js';
import { GraphManager } from '../src/managers/GraphManager.js';

describe.skip('UnifiedSearchService', () => {
  let driver: Driver;
  let searchService: UnifiedSearchService;
  let graphManager: GraphManager;

  beforeAll(async () => {
    // Connect to test database
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    
    // Initialize GraphManager for schema
    graphManager = new GraphManager(uri, user, password);
    await graphManager.initialize();
    
    searchService = new UnifiedSearchService(driver);
    await searchService.initialize();
  });

  afterAll(async () => {
    await driver.close();
  });

  beforeEach(async () => {
    // Clean test data
    const session = driver.session();
    try {
      await session.run(`
        MATCH (n)
        WHERE n.type IN ['memory', 'test_memory']
        DETACH DELETE n
      `);
    } finally {
      await session.close();
    }
  });

  describe('Full-text search (embeddings disabled or fallback)', () => {
    it('should find nodes by keyword match in content', async () => {
      // Add test nodes
      await graphManager.addNode('memory', {
        title: 'Authentication System',
        content: 'Implemented JWT-based authentication with refresh tokens',
        tags: ['auth', 'security']
      });

      await graphManager.addNode('memory', {
        title: 'Database Setup',
        content: 'PostgreSQL configuration for production',
        tags: ['database', 'postgres']
      });

      // Search for authentication
      const result = await searchService.search('authentication', {
        types: ['memory'],
        limit: 10
      });

      expect(result.status).toBe('success');
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.search_method).toMatch(/vector|fulltext/);
      
      // Should find the auth node
      const authNode = result.results.find(r => r.title === 'Authentication System');
      expect(authNode).toBeDefined();
    });

    it('should search across multiple fields (title, content, description)', async () => {
      await graphManager.addNode('memory', {
        title: 'API Design',
        description: 'RESTful API with OpenAPI specification',
        content: 'Endpoints for user management'
      });

      // Search by title
      const titleResult = await searchService.search('API', { types: ['memory'] });
      expect(titleResult.results.length).toBeGreaterThan(0);

      // Search by description
      const descResult = await searchService.search('OpenAPI', { types: ['memory'] });
      expect(descResult.results.length).toBeGreaterThan(0);

      // Search by content
      const contentResult = await searchService.search('endpoints', { types: ['memory'] });
      expect(contentResult.results.length).toBeGreaterThan(0);
    });

    it('should filter by node type', async () => {
      await graphManager.addNode('memory', {
        title: 'Memory Test',
        content: 'Testing search'
      });

      await graphManager.addNode('todo', {
        title: 'Todo Test',
        description: 'Testing search'
      });

      // Search only memories
      const memoryResult = await searchService.search('Testing', {
        types: ['memory']
      });

      expect(memoryResult.results.every(r => r.type === 'memory')).toBe(true);

      // Search only todos
      const todoResult = await searchService.search('Testing', {
        types: ['todo']
      });

      expect(todoResult.results.every(r => r.type === 'todo')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      // Add multiple nodes
      for (let i = 0; i < 10; i++) {
        await graphManager.addNode('memory', {
          title: `Test Node ${i}`,
          content: 'Common search term testing'
        });
      }

      const result = await searchService.search('testing', {
        types: ['memory'],
        limit: 5
      });

      expect(result.results.length).toBeLessThanOrEqual(5);
    });

    it('should return empty results for no matches', async () => {
      const result = await searchService.search('xyznonexistent12345', {
        types: ['memory']
      });

      expect(result.status).toBe('success');
      expect(result.results.length).toBe(0);
    });
  });

  describe('Vector search with fallback', () => {
    it('should indicate search method used', async () => {
      await graphManager.addNode('memory', {
        title: 'Test Node',
        content: 'Testing search methods'
      });

      const result = await searchService.search('testing', {
        types: ['memory']
      });

      expect(result.search_method).toMatch(/^(vector|fulltext|hybrid)$/);
    });

    it('should include fallback flag when fallback triggered', async () => {
      // Create node unlikely to match vector search but will match fulltext
      await graphManager.addNode('memory', {
        title: 'Specific Term XYZ123',
        content: 'Very specific content with unique terms'
      });

      const result = await searchService.search('XYZ123', {
        types: ['memory'],
        minSimilarity: 0.95 // High threshold likely to trigger fallback
      });

      // If fallback was triggered, flag should be true
      if (result.fallback_triggered) {
        expect(result.search_method).toBe('fulltext');
        expect(result.message).toBeDefined();
      }
    });
  });

  describe('Search result formatting', () => {
    it('should include standard fields in results', async () => {
      const testNode = await graphManager.addNode('memory', {
        title: 'Formatting Test',
        description: 'Testing result format',
        content: 'Full content text here'
      });

      const result = await searchService.search('Formatting', {
        types: ['memory']
      });

      expect(result.results.length).toBeGreaterThan(0);
      
      const foundNode = result.results[0];
      expect(foundNode).toHaveProperty('id');
      expect(foundNode).toHaveProperty('type');
      expect(foundNode).toHaveProperty('title');
      expect(foundNode).toHaveProperty('description');
      expect(foundNode).toHaveProperty('content_preview');
    });

    it('should generate content preview', async () => {
      await graphManager.addNode('memory', {
        title: 'Long Content Test',
        content: 'A'.repeat(500) // Long content
      });

      const result = await searchService.search('Long Content', {
        types: ['memory']
      });

      expect(result.results.length).toBeGreaterThan(0);
      
      const preview = result.results[0].content_preview;
      expect(preview).toBeDefined();
      expect(preview.length).toBeLessThanOrEqual(200);
    });
  });

  describe('Integration with GraphManager', () => {
    it('should work seamlessly with memory_node search operation', async () => {
      // Add test data
      await graphManager.addNode('memory', {
        title: 'Integration Test',
        content: 'Testing GraphManager integration'
      });

      // Use GraphManager's searchNodes (which now uses UnifiedSearchService)
      const nodes = await graphManager.searchNodes('Integration', {
        types: ['memory']
      });

      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].properties.title).toBe('Integration Test');
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in search query', async () => {
      await graphManager.addNode('memory', {
        title: 'Special Chars Test',
        content: 'Content with @#$% special characters!'
      });

      const result = await searchService.search('special characters', {
        types: ['memory']
      });

      expect(result.status).toBe('success');
    });

    it('should handle empty search query gracefully', async () => {
      const result = await searchService.search('', {
        types: ['memory']
      });

      expect(result.status).toBe('success');
      // Empty query might return all or none depending on implementation
    });

    it('should handle very long search queries', async () => {
      const longQuery = 'test '.repeat(100);
      
      const result = await searchService.search(longQuery, {
        types: ['memory']
      });

      expect(result.status).toBe('success');
    });
  });
});
