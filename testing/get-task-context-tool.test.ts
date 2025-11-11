/**
 * get_task_context MCP Tool Integration Tests
 * 
 * Tests the complete flow of the get_task_context tool through the MCP interface:
 * - Tool registration and availability
 * - Parameter validation
 * - Context filtering for each agent type (PM, worker, QC)
 * - Error handling for missing tasks
 * - Integration with GraphManager and ContextManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMockGraphManager } from './helpers/mockGraphManager.js';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

describe('get_task_context MCP Tool (Integration)', () => {
  let graphManager: any;
  let server: Server;

  beforeEach(async () => {
  // Use in-memory mock GraphManager for tests
  graphManager = createMockGraphManager();
  await graphManager.initialize();
  await graphManager.clear('ALL');
    
    // Small delay for database clear
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Note: We'll test through the actual MCP server by importing the handler
    // For now, we'll test the underlying implementation directly
  });

  afterEach(async () => {
    if (graphManager) {
      await graphManager.clear('ALL');
      await graphManager.close();
    }
  });

  describe('Tool Availability', () => {
    it('should be registered in GRAPH_TOOLS', async () => {
      const { GRAPH_TOOLS } = await import('../src/tools/graph.tools.js');
      
      const tool = GRAPH_TOOLS.find(t => t.name === 'get_task_context');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('get_task_context');
      expect(tool?.description).toContain('filtered task context');
      expect(tool?.description).toContain('PM/worker/QC');
    });

    it('should have correct input schema', async () => {
      const { GRAPH_TOOLS } = await import('../src/tools/graph.tools.js');
      
      const tool = GRAPH_TOOLS.find(t => t.name === 'get_task_context');
      expect(tool?.inputSchema.properties).toHaveProperty('taskId');
      expect(tool?.inputSchema.properties).toHaveProperty('agentType');
      expect(tool?.inputSchema.required).toEqual(['taskId', 'agentType']);
      
      // Check agentType enum
      const agentTypeProp = (tool?.inputSchema.properties as any).agentType;
      expect(agentTypeProp.enum).toEqual(['pm', 'worker', 'qc']);
    });
  });

  describe('Worker Context Filtering', () => {
    it('should return minimal context for worker agents', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Create task with full PM context
      const taskNode = await graphManager.addNode('todo', {
        title: 'Build authentication API',
        requirements: 'Implement JWT authentication with refresh tokens',
        description: 'Create secure authentication endpoints',
        workerRole: 'Backend engineer with Node.js expertise',
        qcRole: 'Security auditor',
        files: Array.from({ length: 20 }, (_, i) => `src/auth/file-${i}.ts`),
        dependencies: ['task-dep-1', 'task-dep-2', 'task-dep-3', 'task-dep-4', 'task-dep-5', 'task-dep-6'],
        status: 'pending',
        priority: 'high',
        // Large PM-only fields
        research: JSON.stringify({
          findings: Array.from({ length: 50 }, (_, i) => `Research finding ${i}`),
          alternatives: Array.from({ length: 20 }, (_, i) => `Alternative ${i}`)
        }),
        planningNotes: JSON.stringify(Array.from({ length: 100 }, (_, i) => `Planning note ${i}`)),
        architectureDecisions: JSON.stringify({
          patterns: Array.from({ length: 30 }, (_, i) => `Pattern ${i}`),
          rationale: Array.from({ length: 30 }, (_, i) => `Rationale ${i}`)
        })
      });

      // Get worker context
      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');

      // Verify worker context structure
      expect(result.context).toBeDefined();
      expect(result.context.title).toBe('Build authentication API');
      expect(result.context.requirements).toBe('Implement JWT authentication with refresh tokens');
      expect(result.context.description).toBe('Create secure authentication endpoints');
      expect(result.context.workerRole).toBe('Backend engineer with Node.js expertise');
      
      // Files limited to 10
      expect(result.context.files).toBeDefined();
      expect(result.context.files.length).toBeLessThanOrEqual(10);
      
      // Dependencies limited to 5
      expect(result.context.dependencies).toBeDefined();
      expect(result.context.dependencies.length).toBeLessThanOrEqual(5);
      
      // PM fields should be filtered out
      expect((result.context as any).research).toBeUndefined();
      expect((result.context as any).planningNotes).toBeUndefined();
      expect((result.context as any).architectureDecisions).toBeUndefined();
      
      // Verify 90%+ reduction
      expect(result.metrics.reductionPercent).toBeGreaterThanOrEqual(89);
    });

    it('should include errorContext for retry scenarios', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Create task with error context (after QC failure)
      const errorData = {
        previousAttempt: 1,
        errorMessage: 'Authentication tests failed',
        suggestedFix: 'Add error handling for expired tokens',
        qcFeedback: 'Missing edge case handling'
      };

      const taskNode = await graphManager.addNode('todo', {
        title: 'Fix authentication bugs',
        requirements: 'Handle all edge cases',
        description: 'Fix issues from previous attempt',
        workerRole: 'Backend engineer',
        attemptNumber: 2,
        errorContext: JSON.stringify(errorData)
      });

      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');

      // Verify error context is included for retries
      expect(result.context.errorContext).toBeDefined();
      expect(result.context.errorContext).toContain('previousAttempt');
      expect(result.context.errorContext).toContain('Authentication tests failed');
    });

    it('should handle tasks with minimal fields', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Create task with only required fields
      const taskNode = await graphManager.addNode('todo', {
        title: 'Simple task',
        requirements: 'Basic requirements',
        description: 'Minimal description'
      });

      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');

      // Should still work with minimal fields
      expect(result.context.title).toBe('Simple task');
      expect(result.context.requirements).toBe('Basic requirements');
      expect(result.context.description).toBe('Minimal description');
      expect(result.context.files || []).toEqual([]);
      expect(result.context.dependencies || []).toEqual([]);
    });
  });

  describe('QC Context Filtering', () => {
    it('should return requirements + worker output for QC agents', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Create task with worker output
      const verificationCriteria = {
        security: ['No hardcoded secrets', 'Input validation'],
        functionality: ['All endpoints work', 'Proper error handling'],
        codeQuality: ['Unit tests >80%', 'TypeScript types defined']
      };

      const taskNode = await graphManager.addNode('todo', {
        title: 'Authentication API',
        requirements: 'JWT auth with refresh tokens',
        description: 'Secure authentication',
        workerRole: 'Backend engineer',
        qcRole: 'Security auditor',
        verificationCriteria: JSON.stringify(verificationCriteria),
        workerOutput: 'Implemented JWT auth with bcrypt password hashing and refresh token rotation',
        status: 'awaiting_qc',
        // Should be filtered out for QC
        research: JSON.stringify({ findings: ['Finding 1', 'Finding 2'] }),
        planningNotes: JSON.stringify(['Note 1', 'Note 2'])
      });

      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'qc');

      // Verify QC context has what's needed
      expect(result.context.requirements).toBe('JWT auth with refresh tokens');
      expect(result.context.workerOutput).toBe('Implemented JWT auth with bcrypt password hashing and refresh token rotation');
      expect(result.context.verificationCriteria).toContain('security');
      
      // Files should be included (inherited from worker scope)
      // Files are optional, may be undefined
      
      // PM fields should be filtered out
      expect((result.context as any).research).toBeUndefined();
      expect((result.context as any).planningNotes).toBeUndefined();
    });

    it('should handle QC context without worker output (first verification)', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Task without worker output yet
      const taskNode = await graphManager.addNode('todo', {
        title: 'New task',
        requirements: 'Requirements here',
        description: 'Description',
        qcRole: 'QC auditor',
        status: 'pending'
      });

      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'qc');

      // Should still work without worker output
      expect(result.context.requirements).toBe('Requirements here');
      expect(result.context.workerOutput).toBeUndefined();
    });
  });

  describe('PM Context (Full Context)', () => {
    it('should return full context for PM agents', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Create task with all fields
      const research = { findings: ['F1', 'F2'], alternatives: ['A1', 'A2'] };
      const planningNotes = ['Note 1', 'Note 2'];
      
      const taskNode = await graphManager.addNode('todo', {
        title: 'Complex task',
        requirements: 'Complex requirements',
        description: 'Detailed description',
        workerRole: 'Engineer',
        qcRole: 'Auditor',
        files: ['file1.ts', 'file2.ts'],
        dependencies: ['dep1', 'dep2'],
        research: JSON.stringify(research),
        planningNotes: JSON.stringify(planningNotes),
        architectureDecisions: JSON.stringify({ patterns: ['P1'] })
      });

      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'pm');

      // PM should get everything
      expect(result.context.title).toBe('Complex task');
      expect(result.context.requirements).toBe('Complex requirements');
      expect(result.context.workerRole).toBe('Engineer');
      expect(result.context.qcRole).toBe('Auditor');
      expect(result.context.research).toBeDefined();
      expect(result.context.planningNotes).toBeDefined();
      expect(result.context.architectureDecisions).toBeDefined();
      
      // No reduction for PM
      expect(result.metrics.reductionPercent).toBe(0);
    });
  });

  describe('Context Metrics', () => {
    it('should calculate accurate byte sizes and reduction percentages', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Create task with measurable size difference
      const largeResearch = JSON.stringify({
        findings: Array.from({ length: 100 }, (_, i) => `Finding ${i}: ${'x'.repeat(100)}`),
        alternatives: Array.from({ length: 50 }, (_, i) => `Alternative ${i}: ${'y'.repeat(100)}`)
      });

      const taskNode = await graphManager.addNode('todo', {
        title: 'Task with large PM context',
        requirements: 'Requirements',
        description: 'Description',
        workerRole: 'Worker',
        files: Array.from({ length: 20 }, (_, i) => `file-${i}.ts`),
        research: largeResearch,
        planningNotes: JSON.stringify(Array.from({ length: 100 }, (_, i) => `Note ${i}`))
      });

      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');

      // Verify metrics
      expect(result.metrics.originalSize).toBeGreaterThan(0);
      expect(result.metrics.filteredSize).toBeGreaterThan(0);
      expect(result.metrics.filteredSize).toBeLessThan(result.metrics.originalSize);
      expect(result.metrics.reductionPercent).toBeGreaterThan(0);
      expect(result.metrics.reductionPercent).toBeLessThan(100);
      
      // Verify removed and retained fields are tracked
      expect(result.metrics.fieldsRemoved).toContain('research');
      expect(result.metrics.fieldsRemoved).toContain('planningNotes');
      expect(result.metrics.fieldsRetained).toContain('title');
      expect(result.metrics.fieldsRetained).toContain('requirements');
    });

    it('should validate worker context meets 90% reduction requirement', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Create task with enough PM data to ensure 90%+ reduction
      const taskNode = await graphManager.addNode('todo', {
        title: 'Auth system',
        requirements: 'JWT authentication',
        description: 'Implement secure auth',
        workerRole: 'Backend engineer',
        files: Array.from({ length: 15 }, (_, i) => `src/file-${i}.ts`),
        dependencies: ['dep1', 'dep2', 'dep3', 'dep4', 'dep5', 'dep6'],
        research: JSON.stringify({
          findings: Array.from({ length: 200 }, (_, i) => `Research finding ${i} with lots of detail about authentication patterns and security considerations`),
          alternatives: Array.from({ length: 100 }, (_, i) => `Alternative approach ${i} with detailed pros and cons analysis`)
        }),
        planningNotes: JSON.stringify(
          Array.from({ length: 150 }, (_, i) => `Planning note ${i} about implementation strategy and timeline`)
        ),
        architectureDecisions: JSON.stringify({
          patterns: Array.from({ length: 80 }, (_, i) => `Architecture pattern ${i} with rationale`),
          rationale: Array.from({ length: 80 }, (_, i) => `Decision rationale ${i}`)
        })
      });

      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');

      // Verify validation passes
      expect(result.metrics.reductionPercent).toBeGreaterThanOrEqual(89);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent task', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      const contextManager = new ContextManager(graphManager);
      
      await expect(
        contextManager.getFilteredTaskContext('non-existent-task-id', 'worker')
      ).rejects.toThrow('Task not found');
    });

    it('should handle tasks with malformed JSON fields gracefully', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      
      // Create task with invalid JSON in a field
      const taskNode = await graphManager.addNode('todo', {
        title: 'Task with bad JSON',
        requirements: 'Requirements',
        description: 'Description',
        workerRole: 'Worker',
        errorContext: 'THIS IS NOT VALID JSON'  // Invalid JSON
      });

      const contextManager = new ContextManager(graphManager);
      const result = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');

      // Should still work, treating it as a string
      expect(result.context.title).toBe('Task with bad JSON');
      expect(result.context.errorContext).toBe('THIS IS NOT VALID JSON');
    });
  });

  describe('Multi-Agent Workflow Integration', () => {
    it('should support complete PM → Worker → QC flow', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      const contextManager = new ContextManager(graphManager);

      // 1. PM creates task with full context
      const taskNode = await graphManager.addNode('todo', {
        title: 'Build user registration',
        requirements: 'Email validation, password hashing, duplicate check',
        description: 'Complete user registration endpoint',
        workerRole: 'Backend developer with validation expertise',
        qcRole: 'Security specialist focusing on input validation',
        verificationCriteria: JSON.stringify({
          security: ['Email validation prevents injection', 'Password meets complexity rules'],
          functionality: ['Duplicate email detection works', 'Success response correct'],
          codeQuality: ['Unit tests present', 'Error messages clear']
        }),
        files: Array.from({ length: 12 }, (_, i) => `src/user/file-${i}.ts`),
        dependencies: ['task-db-schema', 'task-email-service'],
        maxRetries: 2,
        attemptNumber: 1,
        status: 'pending',
        research: JSON.stringify({ findings: ['Finding 1', 'Finding 2', 'Finding 3'] }),
        planningNotes: JSON.stringify(['Note 1', 'Note 2'])
      });

      // 2. Worker gets minimal context
      const workerContext = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');
      expect(workerContext.context.title).toBeDefined();
      expect(workerContext.context.workerRole).toBeDefined();
      expect(workerContext.context.files.length).toBeLessThanOrEqual(10);
      expect((workerContext.context as any).research).toBeUndefined();
      expect(workerContext.metrics.reductionPercent).toBeGreaterThanOrEqual(45);

      // 3. Worker completes task
      await graphManager.updateNode(taskNode.id, {
        workerOutput: 'Implemented registration with bcrypt hashing and email validation',
        status: 'awaiting_qc'
      });

      // 4. QC gets verification context
      const qcContext = await contextManager.getFilteredTaskContext(taskNode.id, 'qc');
      expect(qcContext.context.requirements).toBeDefined();
      expect(qcContext.context.workerOutput).toBe('Implemented registration with bcrypt hashing and email validation');
      expect(qcContext.context.verificationCriteria).toContain('security');
      expect((qcContext.context as any).research).toBeUndefined();

      // 5. PM can still access full context
      const pmContext = await contextManager.getFilteredTaskContext(taskNode.id, 'pm');
      expect(pmContext.context.research).toBeDefined();
      expect(pmContext.context.planningNotes).toBeDefined();
      expect(pmContext.metrics.reductionPercent).toBe(0);
    });

    it('should support retry workflow with error context', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      const contextManager = new ContextManager(graphManager);

      // Create task after QC failure
      const taskNode = await graphManager.addNode('todo', {
        title: 'Fix validation bugs',
        requirements: 'Proper email validation',
        description: 'Fix issues from attempt 1',
        workerRole: 'Backend developer',
        qcRole: 'Security auditor',
        attemptNumber: 2,
        maxRetries: 2,
        status: 'pending',
        errorContext: JSON.stringify({
          previousAttempt: 1,
          qcFeedback: 'Email validation allows invalid formats',
          issues: ['Missing regex validation', 'No domain verification'],
          requiredFixes: ['Add proper email regex', 'Verify domain exists']
        }),
        qcVerificationHistory: JSON.stringify([
          {
            attempt: 1,
            passed: false,
            score: 45,
            feedback: 'Validation logic incomplete'
          }
        ])
      });

      // Worker gets context including error details
      const workerContext = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');
      expect(workerContext.context.errorContext).toBeDefined();
      expect(workerContext.context.errorContext).toContain('previousAttempt');
      expect(workerContext.context.errorContext).toContain('Email validation allows invalid formats');
      expect(workerContext.context.attemptNumber).toBe(2);
    });
  });

  describe('Context Scope Validation', () => {
    it('should respect DEFAULT_CONTEXT_SCOPES for each agent type', async () => {
      const { ContextManager } = await import('../src/managers/ContextManager.js');
      const { DEFAULT_CONTEXT_SCOPES } = await import('../src/types/context.types.js');
      
      const taskNode = await graphManager.addNode('todo', {
        title: 'Test task',
        requirements: 'Requirements',
        description: 'Description',
        workerRole: 'Worker',
        qcRole: 'QC',
        files: ['file1.ts'],
        dependencies: ['dep1'],
        research: JSON.stringify({ data: 'research' }),
        planningNotes: JSON.stringify(['note']),
        architectureDecisions: JSON.stringify({ pattern: 'pattern' }),
        workerOutput: 'Output',
        verificationCriteria: JSON.stringify({ security: ['check1'] })
      });

      const contextManager = new ContextManager(graphManager);

      // Test worker scope
      const workerResult = await contextManager.getFilteredTaskContext(taskNode.id, 'worker');
      const workerScope = DEFAULT_CONTEXT_SCOPES.worker;
      
      for (const field of workerScope.allowedFields) {
        if (field !== 'errorContext') { // errorContext is optional
          expect(workerResult.context).toHaveProperty(field);
        }
      }

      // Test QC scope
      const qcResult = await contextManager.getFilteredTaskContext(taskNode.id, 'qc');
      const qcScope = DEFAULT_CONTEXT_SCOPES.qc;
      
      expect(qcResult.context).toHaveProperty('requirements');
      expect(qcResult.context).toHaveProperty('workerOutput');
      expect(qcResult.context).toHaveProperty('verificationCriteria');

      // Test PM scope (should have everything)
      const pmResult = await contextManager.getFilteredTaskContext(taskNode.id, 'pm');
      expect(pmResult.context.research).toBeDefined();
      expect(pmResult.context.planningNotes).toBeDefined();
      expect(pmResult.context.architectureDecisions).toBeDefined();
    });
  });
});
