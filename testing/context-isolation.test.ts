/**
 * Context Isolation Tests
 * 
 * Verifies that worker agents receive <10% of PM context size
 * while retaining all necessary fields for task execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockGraphManager } from './helpers/mockGraphManager.js';
import { ContextManager } from '../src/managers/ContextManager.js';
import type { PMContext } from '../src/types/context.types.js';

describe('Context Isolation (Integration)', () => {
  let graphManager: any;
  let contextManager: ContextManager;

  beforeEach(async () => {
  // Use in-memory mock GraphManager for fast, isolated tests
  graphManager = createMockGraphManager();
    await graphManager.initialize();
    await graphManager.clear('ALL');
    
    // Small delay for database clear
    await new Promise(resolve => setTimeout(resolve, 50));
    
    contextManager = new ContextManager(graphManager);
  });

  afterEach(async () => {
    if (graphManager) {
      await graphManager.clear('ALL');
      await graphManager.close();
    }
  });

  describe('Context Filtering', () => {
    it('should filter PM context to worker context with 90%+ reduction', () => {
      // Create large PM context
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Implement authentication service',
        requirements: 'Create JWT-based auth with refresh tokens',
        description: 'Detailed implementation of authentication',
        files: Array.from({ length: 50 }, (_, i) => `src/file-${i}.ts`),
        dependencies: ['task-0', 'task-2', 'task-3'],
        status: 'pending',
        priority: 'high',
        research: {
          alternatives: [
            'Option 1: Use Passport.js',
            'Option 2: Custom JWT implementation',
            'Option 3: OAuth2 with third-party provider'
          ],
          references: [
            'https://jwt.io/introduction',
            'https://auth0.com/docs',
            'https://www.passportjs.org/'
          ],
          notes: [
            'Passport.js seems heavy for our use case',
            'Custom JWT gives us more control',
            'Need to consider refresh token rotation'
          ],
          estimatedComplexity: 'Medium-High'
        },
        fullSubgraph: {
          nodes: Array.from({ length: 20 }, (_, i) => ({ id: `node-${i}`, type: 'concept' })),
          edges: Array.from({ length: 30 }, (_, i) => ({ id: `edge-${i}`, type: 'depends_on' }))
        },
        planningNotes: [
          'Start with basic JWT implementation',
          'Add refresh token logic',
          'Implement token blacklist for logout',
          'Add rate limiting'
        ],
        architectureDecisions: [
          'Use Redis for token blacklist',
          'Store refresh tokens in database',
          'Implement sliding session expiry'
        ],
        allFiles: Array.from({ length: 100 }, (_, i) => `src/all-files/file-${i}.ts`)
      };

      const workerContext = contextManager.filterForAgent(pmContext, 'worker');
      const metrics = contextManager.calculateReduction(pmContext, workerContext);

      // Verify 90%+ reduction
      expect(metrics.reductionPercent).toBeGreaterThanOrEqual(90);
      expect(metrics.originalSize).toBeGreaterThan(metrics.filteredSize);

      // Verify essential fields retained
      expect(workerContext.taskId).toBe('task-1');
      expect(workerContext.title).toBe('Implement authentication service');
      expect(workerContext.requirements).toBe('Create JWT-based auth with refresh tokens');

      // Verify PM-specific fields removed
      expect((workerContext as any).research).toBeUndefined();
      expect((workerContext as any).fullSubgraph).toBeUndefined();
      expect((workerContext as any).planningNotes).toBeUndefined();
      expect((workerContext as any).architectureDecisions).toBeUndefined();
      expect((workerContext as any).allFiles).toBeUndefined();

      // Verify file list limited (default max 10)
      expect(workerContext.files?.length).toBeLessThanOrEqual(10);
    });

    it('should filter PM context to QC context with requirements', () => {
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Test task',
        requirements: 'Original requirements text',
        research: {
          alternatives: ['Alt 1', 'Alt 2'],
          notes: ['Note 1']
        }
      };

      const qcContext = contextManager.filterForAgent(pmContext, 'qc') as import('../src/types/context.types.js').QCContext;

      // QC should have original requirements
      expect(qcContext.originalRequirements).toBe('Original requirements text');
      
      // But not have PM research
      expect((qcContext as any).research).toBeUndefined();
    });

    it('should return full context for PM agent', () => {
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Test task',
        requirements: 'Requirements',
        research: {
          alternatives: ['Alt 1', 'Alt 2']
        },
        planningNotes: ['Note 1', 'Note 2']
      };

      const result = contextManager.filterForAgent(pmContext, 'pm');

      // PM should get everything
      expect(result).toEqual(pmContext);
      expect((result as PMContext).research).toBeDefined();
      expect((result as PMContext).planningNotes).toBeDefined();
    });

    it('should preserve error context for worker retries', () => {
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Retry task',
        requirements: 'Fix authentication bug',
        errorContext: {
          previousAttempt: 1,
          errorMessage: 'JWT verification failed',
          suggestedFix: 'Check token expiry logic'
        }
      };

      const workerContext = contextManager.filterForAgent(pmContext, 'worker');

      // Error context should be preserved for retries
      expect(workerContext.errorContext).toBeDefined();
      expect(workerContext.errorContext?.previousAttempt).toBe(1);
      expect(workerContext.errorContext?.errorMessage).toBe('JWT verification failed');
      expect(workerContext.errorContext?.suggestedFix).toBe('Check token expiry logic');
    });

    it('should limit file list size to prevent context bloat', () => {
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Task with many files',
        requirements: 'Process all files',
        files: Array.from({ length: 100 }, (_, i) => `file-${i}.ts`)
      };

      // Default limit is 10
      const workerContext1 = contextManager.filterForAgent(pmContext, 'worker');
      expect(workerContext1.files?.length).toBe(10);

      // Custom limit
      const workerContext2 = contextManager.filterForAgent(pmContext, 'worker', {
        agentId: 'worker-1',
        agentType: 'worker',
        maxFiles: 5
      });
      expect(workerContext2.files?.length).toBe(5);
    });

    it('should limit dependencies list', () => {
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Task with many deps',
        requirements: 'Complete after all dependencies',
        dependencies: Array.from({ length: 20 }, (_, i) => `task-${i}`)
      };

      // Default limit is 5
      const workerContext = contextManager.filterForAgent(pmContext, 'worker');
      expect(workerContext.dependencies?.length).toBe(5);

      // Custom limit
      const workerContext2 = contextManager.filterForAgent(pmContext, 'worker', {
        agentId: 'worker-1',
        agentType: 'worker',
        maxDependencies: 3
      });
      expect(workerContext2.dependencies?.length).toBe(3);
    });

    it('should handle missing fields gracefully', () => {
      const minimalContext: PMContext = {
        taskId: 'task-1',
        title: 'Minimal task',
        requirements: 'Do something'
      };

      const workerContext = contextManager.filterForAgent(minimalContext, 'worker');

      expect(workerContext.taskId).toBe('task-1');
      expect(workerContext.title).toBe('Minimal task');
      expect(workerContext.requirements).toBe('Do something');
      expect(workerContext.files).toBeUndefined();
      expect(workerContext.dependencies).toBeUndefined();
    });

    it('should verify all required fields present in worker context', () => {
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Complete task',
        requirements: 'Build feature X',
        description: 'Detailed description',
        files: ['file1.ts', 'file2.ts'],
        dependencies: ['task-0'],
        status: 'in_progress',
        priority: 'high'
      };

      const workerContext = contextManager.filterForAgent(pmContext, 'worker');

      // All required fields for task execution
      expect(workerContext.taskId).toBeDefined();
      expect(workerContext.title).toBeDefined();
      expect(workerContext.requirements).toBeDefined();
      expect(workerContext.description).toBeDefined();
      expect(workerContext.files).toBeDefined();
      expect(workerContext.dependencies).toBeDefined();
      expect(workerContext.status).toBeDefined();
      expect(workerContext.priority).toBeDefined();
    });
  });

  describe('Context Size Metrics', () => {
    it('should calculate context size in bytes', () => {
      const smallContext: PMContext = {
        taskId: 'task-1',
        title: 'Small task',
        requirements: 'Simple requirement'
      };

      const largeContext: PMContext = {
        ...smallContext,
        research: {
          alternatives: Array.from({ length: 100 }, (_, i) => `Alternative ${i} with lots of text describing the approach in detail`),
          notes: Array.from({ length: 50 }, (_, i) => `Note ${i}`)
        }
      };

      const smallWorker = contextManager.filterForAgent(smallContext, 'worker');
      const largeWorker = contextManager.filterForAgent(largeContext, 'worker');

      const smallMetrics = contextManager.calculateReduction(smallContext, smallWorker);
      const largeMetrics = contextManager.calculateReduction(largeContext, largeWorker);

      // Larger context should show bigger reduction
      expect(largeMetrics.originalSize).toBeGreaterThan(smallMetrics.originalSize);
      expect(largeMetrics.reductionPercent).toBeGreaterThan(smallMetrics.reductionPercent);
    });

    it('should track fields removed and retained', () => {
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Task',
        requirements: 'Req',
        research: { notes: ['Note 1'] },
        planningNotes: ['Planning note']
      };

      const workerContext = contextManager.filterForAgent(pmContext, 'worker');
      const metrics = contextManager.calculateReduction(pmContext, workerContext);

      expect(metrics.fieldsRemoved).toContain('research');
      expect(metrics.fieldsRemoved).toContain('planningNotes');
      expect(metrics.fieldsRetained).toContain('taskId');
      expect(metrics.fieldsRetained).toContain('title');
      expect(metrics.fieldsRetained).toContain('requirements');
    });

    it('should validate context reduction meets requirements', () => {
      const pmContext: PMContext = {
        taskId: 'task-1',
        title: 'Task',
        requirements: 'Requirements',
        research: {
          alternatives: Array.from({ length: 100 }, (_, i) => `Long alternative description ${i}`),
          notes: Array.from({ length: 50 }, (_, i) => `Long note ${i}`)
        }
      };

      const workerContext = contextManager.filterForAgent(pmContext, 'worker');
      const validation = contextManager.validateContextReduction(pmContext, workerContext);

      expect(validation.valid).toBe(true); // At least 90% reduction
      expect(validation.metrics.reductionPercent).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Graph Integration', () => {
    it('should fetch and filter task context from graph', async () => {
      // Create task in graph (flatten nested objects to JSON strings for Neo4j)
      const taskNode = await graphManager.addNode('todo', {
        title: 'Implement feature',
        requirements: 'Build auth system',
        description: 'Complete authentication',
        files: ['auth.ts', 'jwt.ts'],
        dependencies: ['task-0'],
        research: JSON.stringify({
          notes: ['Use JWT', 'Add refresh tokens']
        }),
        planningNotes: ['Start with basic auth', 'Add OAuth later']
      });

      // Get filtered context for worker
      const { context: workerContext } = await contextManager.getFilteredTaskContext(
        taskNode.id,
        'worker'
      );

      expect(workerContext.taskId).toBe(taskNode.id);
      expect(workerContext.title).toBe('Implement feature');
      expect(workerContext.requirements).toBe('Build auth system');
      expect((workerContext as any).research).toBeUndefined();
      expect((workerContext as any).planningNotes).toBeUndefined(); // Filtered out for workers
    });

    it('should fetch subgraph for PM agent', async () => {
      // Create task network
      const task1 = await graphManager.addNode('todo', {
        title: 'Task 1',
        requirements: 'Req 1'
      });

      const task2 = await graphManager.addNode('todo', {
        title: 'Task 2',
        requirements: 'Req 2'
      });

      await graphManager.addEdge(task1.id, task2.id, 'depends_on', {});

      // Get context for PM (includes subgraph)
      const result = await contextManager.getFilteredTaskContext(task1.id, 'pm');
      const pmContext = result.context as PMContext;

      expect(pmContext.taskId).toBe(task1.id);
      expect(pmContext.fullSubgraph).toBeDefined();
      expect(pmContext.fullSubgraph?.nodes.length).toBeGreaterThan(0);
    });

    it('should handle missing task gracefully', async () => {
      await expect(
        contextManager.getFilteredTaskContext('non-existent-task', 'worker')
      ).rejects.toThrow('Task not found');
    });

    it('should handle large PM context with significant reduction', async () => {
      // Create task with substantial data (flatten nested objects for Neo4j)
      const largeTask = await graphManager.addNode('todo', {
        title: 'Large task',
        requirements: 'Process all data',
        files: Array.from({ length: 100 }, (_, i) => `large-file-${i}.ts`),
        research: JSON.stringify({
          alternatives: Array.from({ length: 20 }, (_, i) => 
            `Alternative ${i}: ${'Lorem ipsum dolor sit amet '.repeat(5)}`
          ),
          notes: Array.from({ length: 15 }, (_, i) => 
            `Note ${i}: ${'Detailed note content '.repeat(5)}`
          )
        }),
        planningNotes: Array.from({ length: 10 }, (_, i) => 
          `Planning note ${i}: ${'Plan details '.repeat(3)}`
        )
      });

      const { context: workerContext } = await contextManager.getFilteredTaskContext(
        largeTask.id,
        'worker'
      );

      const pmResult = await contextManager.getFilteredTaskContext(largeTask.id, 'pm');
      const pmContextFull = pmResult.context as PMContext;

      const metrics = contextManager.calculateReduction(pmContextFull, workerContext);

      // Should achieve 90%+ reduction with large context
      expect(metrics.reductionPercent).toBeGreaterThanOrEqual(90);
      // Verify significant size difference (PM context is much larger)
      expect(metrics.originalSize).toBeGreaterThan(metrics.filteredSize * 5);
      expect(metrics.filteredSize).toBeLessThan(metrics.originalSize * 0.1);
    });
  });

  describe('Context Scope Management', () => {
    it('should return correct scope for each agent type', () => {
      const pmScope = contextManager.getScope('pm');
      const workerScope = contextManager.getScope('worker');
      const qcScope = contextManager.getScope('qc');

      expect(pmScope.type).toBe('pm');
      expect(pmScope.allowedFields).toContain('*');

      expect(workerScope.type).toBe('worker');
      expect(workerScope.allowedFields).toContain('taskId');
      expect(workerScope.allowedFields).toContain('requirements');

      expect(qcScope.type).toBe('qc');
      expect(qcScope.allowedFields).toContain('originalRequirements');
    });
  });
});
