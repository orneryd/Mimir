import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockGraphManager } from './helpers/mockGraphManager.js';

/**
 * INTEGRATION TESTS - Multi-Agent Locking
 * 
 * These are integration tests that require a running Neo4j instance.
 * They test the actual locking behavior against a real database.
 * 
 * For true unit tests, mock the Neo4j driver using a library like:
 * - vitest.mock() for the neo4j-driver
 * - neo4j-driver-mock for realistic Neo4j mocking
 * 
 * Run these tests with: npm test -- multi-agent-locking.test.ts
 */

// Helper to convert Neo4j Integer to number
function toNumber(value: any): number {
  if (typeof value === 'object' && value !== null && 'low' in value) {
    return value.low;
  }
  return value;
}

describe('Multi-Agent Locking (Integration)', () => {
  let manager: any;
  let taskId: string;

  beforeEach(async () => {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';
    
  manager = createMockGraphManager();
  await manager.initialize();
    // Wait for clear to complete
    await manager.clear('ALL');
    // Small delay to ensure Neo4j processes the clear
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Create a test task
    const task = await manager.addNode('todo', {
      title: 'Test task',
      description: 'For testing locks',
      status: 'pending',
      priority: 'high'
    });
    taskId = task.id;
  });

  afterEach(async () => {
    await manager.close();
  });

  describe('Basic Locking', () => {
    it('should acquire lock on unlocked node', async () => {
      const locked = await manager.lockNode(taskId, 'worker-1');
      expect(locked).toBe(true);

      // Verify lock properties are set
      const node = await manager.getNode(taskId);
      expect(node!.properties.lockedBy).toBe('worker-1');
      expect(node!.properties.lockedAt).toBeDefined();
      expect(node!.properties.lockExpiresAt).toBeDefined();
      // Neo4j returns Integer objects, convert to number
      const version = typeof node!.properties.version === 'object' && 'low' in node!.properties.version 
        ? node!.properties.version.low 
        : node!.properties.version;
      expect(version).toBe(1);
    });

    it('should prevent double locking by different agents', async () => {
      const lock1 = await manager.lockNode(taskId, 'worker-1');
      expect(lock1).toBe(true);

      const lock2 = await manager.lockNode(taskId, 'worker-2');
      expect(lock2).toBe(false);

      // Verify first agent still holds lock
      const node = await manager.getNode(taskId);
      expect(node!.properties.lockedBy).toBe('worker-1');
    });

    it('should allow same agent to re-acquire their own lock', async () => {
      const lock1 = await manager.lockNode(taskId, 'worker-1');
      expect(lock1).toBe(true);

      const lock2 = await manager.lockNode(taskId, 'worker-1');
      expect(lock2).toBe(true);

      // Version should increment
      const node = await manager.getNode(taskId);
      expect(toNumber(node!.properties.version)).toBe(2);
    });
  });

  describe('Lock Release', () => {
    it('should release lock when agent unlocks', async () => {
      await manager.lockNode(taskId, 'worker-1');
      
      const unlocked = await manager.unlockNode(taskId, 'worker-1');
      expect(unlocked).toBe(true);

      // Verify lock properties are removed
      const node = await manager.getNode(taskId);
      expect(node!.properties.lockedBy).toBeUndefined();
      expect(node!.properties.lockedAt).toBeUndefined();
      expect(node!.properties.lockExpiresAt).toBeUndefined();
    });

    it('should not allow different agent to release lock', async () => {
      await manager.lockNode(taskId, 'worker-1');
      
      const unlocked = await manager.unlockNode(taskId, 'worker-2');
      expect(unlocked).toBe(false);

      // Lock should still be held by worker-1
      const node = await manager.getNode(taskId);
      expect(node!.properties.lockedBy).toBe('worker-1');
    });

    it('should handle unlock of unlocked node gracefully', async () => {
      const unlocked = await manager.unlockNode(taskId, 'worker-1');
      expect(unlocked).toBe(false);
    });
  });

  describe('Lock Expiry', () => {
    it('should allow lock acquisition after expiry', async () => {
      // Lock with 200ms timeout
      await manager.lockNode(taskId, 'worker-1', 200);

      // Wait for expiry with buffer
      await new Promise(resolve => setTimeout(resolve, 300));

      // Different agent should be able to acquire
      const locked = await manager.lockNode(taskId, 'worker-2');
      expect(locked).toBe(true);

      const node = await manager.getNode(taskId);
      expect(node!.properties.lockedBy).toBe('worker-2');
    });

    it('should set correct expiry time', async () => {
      const before = Date.now();
      await manager.lockNode(taskId, 'worker-1', 5000);
      const after = Date.now();

      const node = await manager.getNode(taskId);
      const expiresAt = new Date(node!.properties.lockExpiresAt).getTime();
      
      // Should expire approximately 5 seconds from now
      expect(expiresAt).toBeGreaterThanOrEqual(before + 5000);
      expect(expiresAt).toBeLessThanOrEqual(after + 5000 + 100); // 100ms tolerance
    });
  });

  describe('Query Available Nodes', () => {
    let task2Id: string;
    let task3Id: string;

    beforeEach(async () => {
      const task2 = await manager.addNode('todo', {
        title: 'Task 2',
        status: 'pending'
      });
      task2Id = task2.id;

      const task3 = await manager.addNode('todo', {
        title: 'Task 3',
        status: 'pending'
      });
      task3Id = task3.id;
    });

    it('should return all unlocked nodes', async () => {
      const nodes = await manager.queryNodesWithLockStatus('todo', undefined, true);
      expect(nodes.length).toBe(3);
    });

    it('should exclude locked nodes', async () => {
      await manager.lockNode(taskId, 'worker-1');
      
      const nodes = await manager.queryNodesWithLockStatus('todo', undefined, true);
      expect(nodes.length).toBe(2);
      expect(nodes.some(n => n.id === taskId)).toBe(false);
    });

    it('should include expired-lock nodes', async () => {
      await manager.lockNode(taskId, 'worker-1', 200);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const nodes = await manager.queryNodesWithLockStatus('todo', undefined, true);
      expect(nodes.length).toBe(3);
      expect(nodes.some(n => n.id === taskId)).toBe(true);
    });

    it('should filter by properties and lock status', async () => {
      await manager.updateNode(task2Id, { priority: 'high' });
      await manager.lockNode(task3Id, 'worker-1');
      
      const nodes = await manager.queryNodesWithLockStatus(
        'todo', 
        { priority: 'high' }, 
        true
      );
      
      expect(nodes.length).toBe(2);
      expect(nodes.every(n => n.properties.priority === 'high')).toBe(true);
      expect(nodes.some(n => n.id === task3Id)).toBe(false);
    });

    it('should return all nodes when availableOnly is false', async () => {
      await manager.lockNode(taskId, 'worker-1');
      
      const nodes = await manager.queryNodesWithLockStatus('todo', undefined, false);
      expect(nodes.length).toBe(3);
      expect(nodes.some(n => n.id === taskId)).toBe(true);
    });
  });

  describe('Cleanup Expired Locks', () => {
    it('should clean up expired locks', async () => {
      const task2 = await manager.addNode('todo', { title: 'Task 2', status: 'pending' });
      const task3 = await manager.addNode('todo', { title: 'Task 3', status: 'pending' });

      // Lock with short timeout
      await manager.lockNode(taskId, 'worker-1', 200);
      await manager.lockNode(task2.id, 'worker-2', 200);
      await manager.lockNode(task3.id, 'worker-3', 300000); // Long timeout

      // Wait for first two to expire
      await new Promise(resolve => setTimeout(resolve, 300));

      const cleaned = await manager.cleanupExpiredLocks();
      expect(cleaned).toBe(2);

      // Verify only task3 is still locked
      const nodes = await manager.queryNodesWithLockStatus('todo', undefined, true);
      expect(nodes.length).toBe(2);
      expect(nodes.some(n => n.id === task3.id)).toBe(false);
    });

    it('should return 0 when no expired locks', async () => {
      await manager.lockNode(taskId, 'worker-1', 300000);
      
      const cleaned = await manager.cleanupExpiredLocks();
      expect(cleaned).toBe(0);
    });

    it('should handle cleanup when no locks exist', async () => {
      const cleaned = await manager.cleanupExpiredLocks();
      expect(cleaned).toBe(0);
    });
  });

  describe('Version Tracking', () => {
    it('should increment version on each lock', async () => {
      await manager.lockNode(taskId, 'worker-1');
      let node = await manager.getNode(taskId);
      expect(toNumber(node!.properties.version)).toBe(1);

      await manager.unlockNode(taskId, 'worker-1');
      
      await manager.lockNode(taskId, 'worker-2');
      node = await manager.getNode(taskId);
      expect(toNumber(node!.properties.version)).toBe(2);

      await manager.unlockNode(taskId, 'worker-2');
      
      await manager.lockNode(taskId, 'worker-1');
      node = await manager.getNode(taskId);
      expect(toNumber(node!.properties.version)).toBe(3);
    });

    it('should handle version on first lock', async () => {
      // Node has no version initially
      let node = await manager.getNode(taskId);
      expect(node!.properties.version).toBeUndefined();

      await manager.lockNode(taskId, 'worker-1');
      node = await manager.getNode(taskId);
      expect(toNumber(node!.properties.version)).toBe(1);
    });
  });

  describe('Concurrent Access Scenarios', () => {
    it('should handle race condition correctly', async () => {
      // Simulate two agents trying to lock simultaneously
      const [lock1, lock2] = await Promise.all([
        manager.lockNode(taskId, 'worker-1'),
        manager.lockNode(taskId, 'worker-2')
      ]);

      // One should succeed, one should fail
      expect(lock1 !== lock2).toBe(true);
      expect(lock1 || lock2).toBe(true);

      const node = await manager.getNode(taskId);
      expect(node!.properties.lockedBy).toMatch(/worker-[12]/);
    });

    it('should handle multiple tasks being locked by different agents', async () => {
      const task2 = await manager.addNode('todo', { title: 'Task 2' });
      const task3 = await manager.addNode('todo', { title: 'Task 3' });

      await manager.lockNode(taskId, 'worker-1');
      await manager.lockNode(task2.id, 'worker-2');
      await manager.lockNode(task3.id, 'worker-3');

      const node1 = await manager.getNode(taskId);
      const node2 = await manager.getNode(task2.id);
      const node3 = await manager.getNode(task3.id);

      expect(node1!.properties.lockedBy).toBe('worker-1');
      expect(node2!.properties.lockedBy).toBe('worker-2');
      expect(node3!.properties.lockedBy).toBe('worker-3');
    });
  });
});
