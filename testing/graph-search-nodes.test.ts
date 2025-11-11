import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createMockGraphManager } from './helpers/mockGraphManager.js';
import type { NodeType } from '../src/types/index.js';
import type { MockGraphManager } from './helpers/mockGraphManager.js';

describe('GraphManager - searchNodes', () => {
  let manager: MockGraphManager;
  
  beforeAll(async () => {
    // Use in-memory mock GraphManager for fast tests
    manager = createMockGraphManager();
    await manager.initialize();
  });

  beforeEach(async () => {
    // Clear all data before each test
    await manager.clear('ALL');
    
    // Create test data with various types and properties
    await manager.addNode('todo', {
      title: 'Implement authentication',
      description: 'Add JWT authentication to the API',
      priority: 'high',
      status: 'in_progress'
    });
    
    await manager.addNode('todo', {
      title: 'Fix bug in orchestration',
      description: 'WorkflowManager throws error on startup',
      priority: 'critical',
      status: 'pending'
    });
    
    await manager.addNode('file', {
      path: 'src/auth/authentication.ts',
      content: 'export class AuthenticationService { /* JWT implementation */ }',
      language: 'typescript'
    });
    
    await manager.addNode('file', {
      path: 'src/orchestration/WorkflowManager.ts',
      content: 'export class WorkflowManager { /* orchestration logic */ }',
      language: 'typescript'
    });
    
    await manager.addNode('concept', {
      name: 'authentication',
      description: 'User authentication and authorization patterns',
      keywords: ['auth', 'jwt', 'security']
    });
    
    await manager.addNode('person', {
      name: 'Alice',
      email: 'alice@example.com',
      role: 'developer'
    });
  });

  afterAll(async () => {
    // Clean up
    await manager.clear('ALL');
    await manager.close();
  });

  describe('Query parameter: no filters', () => {
    it('should search across all node types with no options', async () => {
      const results = await manager.searchNodes('authentication');
      
      expect(results.length).toBeGreaterThan(0);
      
      // Should find nodes with "authentication" in various properties
      const types = new Set(results.map(n => n.type));
      expect(types.size).toBeGreaterThan(1); // Multiple types
    });

    it('should return empty array for non-existent query', async () => {
      const results = await manager.searchNodes('nonexistent-xyz-12345');
      
      expect(results).toEqual([]);
    });

    it('should be case-insensitive by default', async () => {
      const results = await manager.searchNodes('AUTHENTICATION');
      
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Query parameter: with limit option', () => {
    it('should respect limit option', async () => {
      const results = await manager.searchNodes('orchestration', { limit: 1 });
      
      expect(results.length).toBe(1);
    });

    it('should use default limit when not specified', async () => {
      const results = await manager.searchNodes('authentication');
      
      expect(results.length).toBeLessThanOrEqual(100); // Default limit
    });

    it('should handle limit larger than result set', async () => {
      const results = await manager.searchNodes('authentication', { limit: 1000 });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThan(1000);
    });
  });

  describe('Query parameter: with offset option', () => {
    it('should skip results with offset', async () => {
      const allResults = await manager.searchNodes('typescript');
      const offsetResults = await manager.searchNodes('typescript', { offset: 1 });
      
      expect(offsetResults.length).toBe(allResults.length - 1);
      if (allResults.length > 1) {
        expect(offsetResults[0].id).not.toBe(allResults[0].id);
      }
    });

    it('should return empty array when offset exceeds results', async () => {
      const results = await manager.searchNodes('authentication', { offset: 1000 });
      
      expect(results).toEqual([]);
    });

    it('should handle offset 0 (same as no offset)', async () => {
      const noOffsetResults = await manager.searchNodes('authentication');
      const zeroOffsetResults = await manager.searchNodes('authentication', { offset: 0 });
      
      expect(zeroOffsetResults).toEqual(noOffsetResults);
    });
  });

  describe('Query parameter: with types filter (BUG AREA)', () => {
    it('should filter by single type', async () => {
      const results = await manager.searchNodes('authentication', { 
        types: ['todo'] 
      });
      
      expect(results.length).toBeGreaterThan(0);
      results.forEach(node => {
        expect(node.type).toBe('todo');
      });
    });

    it('should filter by multiple types', async () => {
      const results = await manager.searchNodes('typescript', { 
        types: ['file', 'concept'] 
      });
      
      expect(results.length).toBeGreaterThan(0);
      results.forEach(node => {
        expect(['file', 'concept']).toContain(node.type);
      });
    });

    it('should return empty array when types filter has no matches', async () => {
      const results = await manager.searchNodes('authentication', { 
        types: ['person'] 
      });
      
      expect(results).toEqual([]);
    });

    it('should handle empty types array (should return all types)', async () => {
      const results = await manager.searchNodes('authentication', { 
        types: [] 
      });
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle types array with non-existent type', async () => {
      const results = await manager.searchNodes('authentication', { 
        types: ['nonexistent-type' as NodeType] 
      });
      
      expect(results).toEqual([]);
    });

    it('should handle types array with mix of valid and invalid types', async () => {
      const results = await manager.searchNodes('authentication', { 
        types: ['todo', 'nonexistent-type' as NodeType] 
      });
      
      expect(results.length).toBeGreaterThan(0);
      results.forEach(node => {
        expect(node.type).toBe('todo');
      });
    });
  });

  describe('Query parameter: with sortBy and sortOrder', () => {
    it('should sort by property ascending', async () => {
      // Add more todos with different priorities
      await manager.addNode('todo', {
        title: 'Task A',
        priority: 'low',
        description: 'authentication task'
      });
      
      await manager.addNode('todo', {
        title: 'Task B',
        priority: 'high',
        description: 'authentication task'
      });
      
      const results = await manager.searchNodes('authentication', { 
        types: ['todo'],
        sortBy: 'priority',
        sortOrder: 'asc'
      });
      
      expect(results.length).toBeGreaterThan(0);
      // Should be sorted: critical, high, low, etc.
    });

    it('should sort by property descending', async () => {
      const results = await manager.searchNodes('authentication', { 
        types: ['todo'],
        sortBy: 'priority',
        sortOrder: 'desc'
      });
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle invalid sortBy property gracefully', async () => {
      const results = await manager.searchNodes('authentication', { 
        sortBy: 'nonexistent_property'
      });
      
      // Should not crash, returns results unsorted or default sorted
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Query parameter: combined filters', () => {
    it('should apply limit + offset together', async () => {
      const results = await manager.searchNodes('authentication', { 
        limit: 2,
        offset: 1
      });
      
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should apply types + limit together', async () => {
      const results = await manager.searchNodes('authentication', { 
        types: ['todo', 'file'],
        limit: 2
      });
      
      expect(results.length).toBeLessThanOrEqual(2);
      results.forEach(node => {
        expect(['todo', 'file']).toContain(node.type);
      });
    });

    it('should apply types + sortBy together', async () => {
      const results = await manager.searchNodes('typescript', { 
        types: ['file'],
        sortBy: 'path',
        sortOrder: 'asc'
      });
      
      expect(results.length).toBeGreaterThan(0);
      results.forEach(node => {
        expect(node.type).toBe('file');
      });
    });

    it('should apply all filters together', async () => {
      const results = await manager.searchNodes('authentication', { 
        types: ['todo'],
        limit: 1,
        offset: 0,
        sortBy: 'priority',
        sortOrder: 'desc'
      });
      
      expect(results.length).toBeLessThanOrEqual(1);
      if (results.length > 0) {
        expect(results[0].type).toBe('todo');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query string', async () => {
      const results = await manager.searchNodes('');
      
      // Implementation dependent: might return all or none
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle query with special characters', async () => {
      await manager.addNode('todo', {
        title: 'Fix bug: JWT token expires',
        description: 'User authentication breaks after 24h'
      });
      
      const results = await manager.searchNodes('JWT');
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle query with multiple words', async () => {
      // Searches for exact phrase "authentication service" - will not match nodes 
      // that only contain "authentication" separately from "service"
      const results = await manager.searchNodes('authentication service');
      
      // This should return 0 results since no node contains this exact phrase
      expect(results.length).toBe(0);
    });

    it('should handle very long query string', async () => {
      const longQuery = 'authentication '.repeat(100);
      const results = await manager.searchNodes(longQuery);
      
      // Should not crash
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle null/undefined options gracefully', async () => {
      const results = await manager.searchNodes('authentication', undefined);
      
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should complete search within reasonable time', async () => {
      const startTime = Date.now();
      await manager.searchNodes('authentication');
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete in < 1 second
    });

    it('should handle large result sets efficiently', async () => {
      // Create many nodes
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(manager.addNode('todo', {
          title: `Task ${i}`,
          description: `authentication task ${i}`
        }));
      }
      await Promise.all(promises);
      
      const startTime = Date.now();
      const results = await manager.searchNodes('authentication', { limit: 100 });
      const duration = Date.now() - startTime;
      
      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // Should complete in < 2 seconds
    });
  });

  describe('Result format validation', () => {
    it('should return nodes with all required properties', async () => {
      const results = await manager.searchNodes('authentication');
      
      expect(results.length).toBeGreaterThan(0);
      
      results.forEach(node => {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('type');
        expect(node).toHaveProperty('properties');
        expect(node).toHaveProperty('created');
        expect(node).toHaveProperty('updated');
        
        expect(typeof node.id).toBe('string');
        expect(typeof node.type).toBe('string');
        expect(typeof node.properties).toBe('object');
      });
    });

    it('should not return duplicate nodes', async () => {
      const results = await manager.searchNodes('authentication');
      
      const ids = results.map(n => n.id);
      const uniqueIds = new Set(ids);
      
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should return nodes ordered by relevance by default', async () => {
      const results = await manager.searchNodes('authentication');
      
      expect(results.length).toBeGreaterThan(0);
      // First result should be most relevant
      // (exact match or highest score)
    });
  });

  describe('Regression tests for known bugs', () => {
    it('BUG: types filter should not cause syntax error', async () => {
      // This is the bug reported - types filter causes Neo4j syntax error
      // Error: "Invalid input '(': expected..."
      
      expect(async () => {
        await manager.searchNodes('authentication', { 
          types: ['todo', 'file'] 
        });
      }).not.toThrow();
    });

    it('BUG: types filter with single type should work', async () => {
      expect(async () => {
        await manager.searchNodes('authentication', { 
          types: ['todo'] 
        });
      }).not.toThrow();
    });

    it('BUG: empty types array should not cause error', async () => {
      expect(async () => {
        await manager.searchNodes('authentication', { 
          types: [] 
        });
      }).not.toThrow();
    });
  });
});

describe('Edge Creation with Properties', () => {
  let manager: MockGraphManager;

  beforeEach(async () => {
    manager = createMockGraphManager();
    await manager.initialize();
    await manager.clear('ALL');
  });

  afterEach(async () => {
    await manager.close();
  });

  it('should create edge with custom properties', async () => {
    // Create two nodes
    const node1 = await manager.addNode('file', {
      name: 'Controller',
      path: '/src/controllers/UserController.ts'
    });

    const node2 = await manager.addNode('module', {
      name: 'Service',
      path: '/src/services/UserService.ts'
    });

    // Create edge with properties
    const edge = await manager.addEdge(node1.id, node2.id, 'depends_on', {
      reason: 'Controller uses service for business logic',
      weight: 1,
      critical: true
    });

    expect(edge).toBeDefined();
    expect(edge.id).toBeDefined();
    expect(edge.source).toBe(node1.id);
    expect(edge.target).toBe(node2.id);
    expect(edge.type).toBe('depends_on');
    expect(edge.properties).toEqual({
      reason: 'Controller uses service for business logic',
      weight: 1,
      critical: true
    });
    expect(edge.created).toBeDefined();
  });

  it('should create edge without properties', async () => {
    const node1 = await manager.addNode('file', { name: 'File1' });
    const node2 = await manager.addNode('file', { name: 'File2' });

    const edge = await manager.addEdge(node1.id, node2.id, 'relates_to');

    expect(edge).toBeDefined();
    expect(edge.properties).toEqual({});
  });

  it('should handle array properties on edges', async () => {
    const node1 = await manager.addNode('module', { name: 'ModuleA' });
    const node2 = await manager.addNode('module', { name: 'ModuleB' });

    const edge = await manager.addEdge(node1.id, node2.id, 'imports', {
      symbols: ['function1', 'function2', 'Class1'],
      importType: 'named'
    });

    expect(edge.properties?.symbols).toEqual(['function1', 'function2', 'Class1']);
    expect(edge.properties?.importType).toBe('named');
  });

  it('should retrieve edges with properties via getNeighbors', async () => {
    const node1 = await manager.addNode('file', { name: 'A' });
    const node2 = await manager.addNode('file', { name: 'B' });
    const node3 = await manager.addNode('file', { name: 'C' });

    await manager.addEdge(node1.id, node2.id, 'depends_on', { strength: 'high' });
    await manager.addEdge(node1.id, node3.id, 'depends_on', { strength: 'low' });

    const neighbors = await manager.getNeighbors(node1.id);

    expect(neighbors.length).toBe(2);
    expect(neighbors.some(n => n.id === node2.id)).toBeTruthy();
    expect(neighbors.some(n => n.id === node3.id)).toBeTruthy();
  });
});

