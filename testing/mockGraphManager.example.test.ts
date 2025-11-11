// ============================================================================
// Example Test Using Mock GraphManager
// Demonstrates how to write fast unit tests without real database calls
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGraphManager, MockGraphManager } from './helpers/mockGraphManager.js';

describe('Example: Using MockGraphManager', () => {
  let graphManager: MockGraphManager;

  beforeEach(async () => {
    // Create a fresh mock for each test - no database required!
    graphManager = createMockGraphManager();
    await graphManager.initialize();
  });

  it('should add and retrieve a node', async () => {
    // Add a node
    const node = await graphManager.addNode('todo', {
      title: 'Test task',
      status: 'pending',
      priority: 'high'
    });

    expect(node.id).toBeDefined();
    expect(node.type).toBe('todo');
    expect(node.properties.title).toBe('Test task');

    // Retrieve it
    const retrieved = await graphManager.getNode(node.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.properties.title).toBe('Test task');
  });

  it('should update node properties', async () => {
    const node = await graphManager.addNode('memory', {
      content: 'Initial content',
      category: 'test'
    });

    // Update properties
    const updated = await graphManager.updateNode(node.id, {
      content: 'Updated content',
      tags: ['important']
    });

    expect(updated.properties.content).toBe('Updated content');
    expect(updated.properties.tags).toEqual(['important']);
    expect(updated.properties.category).toBe('test'); // Original property preserved
  });

  it('should query nodes by type and filters', async () => {
    // Add multiple nodes
    await graphManager.addNode('todo', { status: 'pending', priority: 'high' });
    await graphManager.addNode('todo', { status: 'completed', priority: 'low' });
    await graphManager.addNode('todo', { status: 'pending', priority: 'medium' });
    await graphManager.addNode('memory', { category: 'test' });

    // Query by type
    const todos = await graphManager.queryNodes('todo');
    expect(todos).toHaveLength(3);

    // Query with filters
    const pending = await graphManager.queryNodes('todo', { status: 'pending' });
    expect(pending).toHaveLength(2);

    const highPriority = await graphManager.queryNodes('todo', { priority: 'high' });
    expect(highPriority).toHaveLength(1);
  });

  it('should handle edges between nodes', async () => {
    // Create nodes
    const task1 = await graphManager.addNode('todo', { title: 'Task 1' });
    const task2 = await graphManager.addNode('todo', { title: 'Task 2' });
    const project = await graphManager.addNode('project', { name: 'My Project' });

    // Create edges
    await graphManager.addEdge(task1.id, task2.id, 'depends_on');
    await graphManager.addEdge(task1.id, project.id, 'belongs_to');

    // Get edges
    const task1Edges = await graphManager.getEdges(task1.id, 'out');
    expect(task1Edges).toHaveLength(2);

    const task2Edges = await graphManager.getEdges(task2.id, 'in');
    expect(task2Edges).toHaveLength(1);
    expect(task2Edges[0].type).toBe('depends_on');
  });

  it('should handle node locking for multi-agent coordination', async () => {
    const task = await graphManager.addNode('todo', { title: 'Locked task' });

    // Agent 1 acquires lock
    const locked1 = await graphManager.lockNode(task.id, 'agent-1');
    expect(locked1).toBe(true);

    // Agent 2 tries to acquire same lock
    const locked2 = await graphManager.lockNode(task.id, 'agent-2');
    expect(locked2).toBe(false); // Already locked

    // Agent 1 releases lock
    const unlocked = await graphManager.unlockNode(task.id, 'agent-1');
    expect(unlocked).toBe(true);

    // Agent 2 can now acquire
    const locked3 = await graphManager.lockNode(task.id, 'agent-2');
    expect(locked3).toBe(true);
  });

  it('should perform batch operations efficiently', async () => {
    // Batch add nodes
    const nodes = await graphManager.addNodes([
      { type: 'todo', properties: { title: 'Task 1' } },
      { type: 'todo', properties: { title: 'Task 2' } },
      { type: 'memory', properties: { content: 'Note 1' } }
    ]);

    expect(nodes).toHaveLength(3);
    expect(nodes[0].properties.title).toBe('Task 1');

    // Batch update
    const updated = await graphManager.updateNodes([
      { id: nodes[0].id, properties: { status: 'completed' } },
      { id: nodes[1].id, properties: { status: 'in_progress' } }
    ]);

    expect(updated[0].properties.status).toBe('completed');
    expect(updated[1].properties.status).toBe('in_progress');
  });

  it('should search nodes by text', async () => {
    await graphManager.addNode('todo', {
      title: 'Implement authentication',
      description: 'Add JWT authentication to API'
    });
    await graphManager.addNode('file', {
      path: 'src/auth.ts',
      content: 'Authentication service implementation'
    });
    await graphManager.addNode('concept', {
      name: 'Security',
      notes: 'Authentication and authorization patterns'
    });

    // Search for "authentication"
    const results = await graphManager.searchNodes('authentication');
    expect(results.length).toBeGreaterThan(0);

    // All results should contain "authentication" in some property
    for (const node of results) {
      const text = JSON.stringify(node.properties).toLowerCase();
      expect(text).toContain('authentication');
    }
  });

  it('should clear all nodes or by type', async () => {
    // Add various nodes
    await graphManager.addNode('todo', { title: 'Task' });
    await graphManager.addNode('memory', { content: 'Note' });
    await graphManager.addNode('file', { path: 'test.ts' });

    // Get initial stats
    let stats = await graphManager.getStats();
    expect(stats.nodeCount).toBe(3);

    // Clear specific type
    await graphManager.clear('todo');
    stats = await graphManager.getStats();
    expect(stats.nodeCount).toBe(2);

    // Clear all
    await graphManager.clear('ALL');
    stats = await graphManager.getStats();
    expect(stats.nodeCount).toBe(0);
  });
});
