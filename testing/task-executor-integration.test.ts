import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as taskExecutor from '../src/orchestrator/task-executor.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const { executeChainOutput, generateFinalReport } = taskExecutor;
type TaskDefinition = taskExecutor.TaskDefinition;

// Mock the LLM client - ensure each instance gets proper mock methods
vi.mock('../src/orchestrator/llm-client.js', () => {
  const CopilotModel = {
    GPT_4_1: 'gpt-4.1',
    GPT_4: 'gpt-4',
    GPT_4O: 'gpt-4o',
    GPT_4O_MINI: 'gpt-4o-mini',
    CLAUDE_SONNET_4: 'claude-sonnet-4',
    CLAUDE_3_7_SONNET: 'claude-3.7-sonnet',
    O3_MINI: 'o3-mini',
    GEMINI_2_5_PRO: 'gemini-2.5-pro',
  };
  
  class MockCopilotAgentClient {
    async loadPreamble(path: string) {
      return Promise.resolve();
    }
    
    async execute(prompt: string) {
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        output: `Completed: ${prompt.substring(0, 50)}...`,
        tokens: { input: 100, output: 50 },
        toolCalls: 2,
      };
    }
  }
  
  return {
    CopilotAgentClient: MockCopilotAgentClient,
    CopilotModel,
  };
});

// Mock child_process exec to avoid calling real agentinator
vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, opts: any, callback: any) => {
    // Don't actually execute - just call callback with success
    setImmediate(() => callback(null, { stdout: '', stderr: '' }));
  }),
}));

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>();
  return {
    ...actual,
    promisify: (fn: any) => {
      if (fn.name === 'exec') {
        // Return a mock promisified exec
        return async (cmd: string, opts: any) => {
          return { stdout: '', stderr: '' };
        };
      }
      return actual.promisify(fn);
    },
  };
});

describe('Task Executor - Integration Tests', () => {
  const TEST_DIR = path.join(process.cwd(), 'test-output-executor');
  
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
    
    // Pre-create preamble files that generatePreamble will look for
    // The function checks if file exists first, so we create them ahead of time
    const roles = [
      'Backend engineer specializing in microservices',
      'Database architect',
      'Backend engineer',
      'API developer',
      'System architect',
      'Frontend developer',
      'Backend developer',
      'Integration engineer',
      'Microservice developer',
    ];
    
    for (const role of roles) {
      const roleHash = crypto.createHash('md5').update(role).digest('hex').substring(0, 8);
      const preamblePath = path.join(TEST_DIR, `worker-${roleHash}.md`);
      await fs.writeFile(preamblePath, `# Test Preamble\n\nRole: ${role}`, 'utf-8');
    }
  });

  afterEach(async () => {
    // Restore mocks
    vi.restoreAllMocks();
    
    // Cleanup
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Parallel Execution Flow', () => {
    
    it('should execute independent tasks in parallel', async () => {
      const markdown = `
### Task ID: task-1
**Agent Role Description**
Backend engineer specializing in microservices

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create authentication service
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour

---

### Task ID: task-2
**Agent Role Description**
Backend engineer specializing in microservices

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create logging service
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour
`;

      const chainPath = path.join(TEST_DIR, 'chain-output.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      const startTime = Date.now();
      const results = await executeChainOutput(chainPath, TEST_DIR);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('success');
      
      // Parallel execution should be faster than sequential (2 * 10ms delay)
      // With parallel execution, both 10ms delays happen simultaneously
      expect(duration).toBeLessThan(100); // Much less than 200ms (2 * 100ms)
    }, 15000);

    it('should execute dependent tasks sequentially', async () => {
      const markdown = `
### Task ID: task-1
**Agent Role Description**
Database architect

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Design database schema
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour

---

### Task ID: task-2
**Agent Role Description**
Backend engineer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Implement data access layer
</prompt>

**Dependencies**
task-1
**Estimated Duration**
2 hours

---

### Task ID: task-3
**Agent Role Description**
API developer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create REST endpoints
</prompt>

**Dependencies**
task-2
**Estimated Duration**
1 hour
`;

      const chainPath = path.join(TEST_DIR, 'chain-output.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      const results = await executeChainOutput(chainPath, TEST_DIR);

      expect(results).toHaveLength(3);
      expect(results[0].taskId).toBe('task-1');
      expect(results[1].taskId).toBe('task-2');
      expect(results[2].taskId).toBe('task-3');
      
      // All should succeed
      results.forEach(r => expect(r.status).toBe('success'));
    }, 15000);

    it('should handle diamond dependency pattern with parallel execution', async () => {
      const markdown = `
### Task ID: task-1
**Agent Role Description**
System architect

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Define system architecture
</prompt>

**Dependencies**
None
**Estimated Duration**
2 hours

---

### Task ID: task-2
**Agent Role Description**
Frontend developer

**Recommended Model**
Claude Sonnet 4

**Optimized Prompt**
<prompt>
Create UI components
</prompt>

**Dependencies**
task-1
**Estimated Duration**
3 hours

---

### Task ID: task-3
**Agent Role Description**
Backend developer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create API services
</prompt>

**Dependencies**
task-1
**Estimated Duration**
3 hours

---

### Task ID: task-4
**Agent Role Description**
Integration engineer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Wire up frontend and backend
</prompt>

**Dependencies**
task-2, task-3
**Estimated Duration**
2 hours
`;

      const chainPath = path.join(TEST_DIR, 'chain-output.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      const results = await executeChainOutput(chainPath, TEST_DIR);

      expect(results).toHaveLength(4);
      
      // Verify execution order:
      // Batch 1: task-1
      // Batch 2: task-2, task-3 (parallel)
      // Batch 3: task-4
      
      const task1Result = results.find(r => r.taskId === 'task-1');
      const task2Result = results.find(r => r.taskId === 'task-2');
      const task3Result = results.find(r => r.taskId === 'task-3');
      const task4Result = results.find(r => r.taskId === 'task-4');

      expect(task1Result).toBeDefined();
      expect(task2Result).toBeDefined();
      expect(task3Result).toBeDefined();
      expect(task4Result).toBeDefined();
      
      // All should succeed
      expect(task1Result!.status).toBe('success');
      expect(task2Result!.status).toBe('success');
      expect(task3Result!.status).toBe('success');
      expect(task4Result!.status).toBe('success');
    }, 15000);

    it('should respect explicit parallel groups', async () => {
      const markdown = `
### Task ID: task-1
**Parallel Group**
1
**Agent Role Description**
Microservice developer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create user service
</prompt>

**Dependencies**
None
**Estimated Duration**
2 hours

---

### Task ID: task-2
**Parallel Group**
1
**Agent Role Description**
Microservice developer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create product service
</prompt>

**Dependencies**
None
**Estimated Duration**
2 hours

---

### Task ID: task-3
**Parallel Group**
2
**Agent Role Description**
Integration engineer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create API gateway
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour
`;

      const chainPath = path.join(TEST_DIR, 'chain-output.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      const results = await executeChainOutput(chainPath, TEST_DIR);

      expect(results).toHaveLength(3);
      
      // All should succeed
      results.forEach(r => expect(r.status).toBe('success'));
      
      // Verify parallel groups were parsed
      expect(results[0].agentRoleDescription).toContain('Microservice');
      expect(results[1].agentRoleDescription).toContain('Microservice');
      expect(results[2].agentRoleDescription).toContain('Integration');
    }, 15000);
  });

  describe('Failure Handling', () => {
    
    it('should stop execution when a task fails', async () => {
      const markdown = `
### Task ID: task-1
**Agent Role Description**
Backend engineer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create service that will fail
</prompt>

**Dependencies**
None

**Estimated Duration**
1 hour

---

### Task ID: task-2
**Agent Role Description**
Backend engineer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
This should not execute
</prompt>

**Dependencies**
task-1

**Estimated Duration**
1 hour
`;

      const chainPath = path.join(TEST_DIR, 'chain-output-fail.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      // Override the mock class prototype to simulate failure
      const originalExecute = vi.fn().mockImplementation(async function(this: any, prompt: string) {
        if (prompt.includes('fail')) {
          throw new Error('Simulated task failure');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          output: `Completed: ${prompt.substring(0, 50)}...`,
          tokens: { input: 100, output: 50 },
          toolCalls: 2,
        };
      });

      // Temporarily replace the execute method
      const { CopilotAgentClient } = await import('../src/orchestrator/llm-client.js');
      const originalMethod = (CopilotAgentClient as any).prototype.execute;
      (CopilotAgentClient as any).prototype.execute = originalExecute;

      try {
        const results = await executeChainOutput(chainPath, TEST_DIR);

        // Only first task should execute
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('failure');
        expect(results[0].error).toContain('Simulated task failure');
      } finally {
        // Restore original method
        (CopilotAgentClient as any).prototype.execute = originalMethod;
      }
    }, 10000);

    it('should handle multiple failures in parallel batch', async () => {
      const markdown = `
### Task ID: task-1
**Agent Role Description**
Backend engineer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create service A that will fail
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour

---

### Task ID: task-2
**Agent Role Description**
Backend engineer

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create service B that will also fail
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour
`;

      const chainPath = path.join(TEST_DIR, 'chain-output-fail-parallel.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      // Override the mock class prototype to always fail
      const { CopilotAgentClient } = await import('../src/orchestrator/llm-client.js');
      const originalMethod = (CopilotAgentClient as any).prototype.execute;
      (CopilotAgentClient as any).prototype.execute = vi.fn().mockRejectedValue(new Error('Simulated failure'));

      try {
        const results = await executeChainOutput(chainPath, TEST_DIR);

        // Both tasks should execute in parallel and both fail
        expect(results).toHaveLength(2);
        expect(results[0].status).toBe('failure');
        expect(results[1].status).toBe('failure');
      } finally {
        // Restore original method
        (CopilotAgentClient as any).prototype.execute = originalMethod;
      }
    }, 10000);
  });

  describe('Preamble Generation and Reuse', () => {
    
    it('should reuse preambles for same agent role', async () => {
      const markdown = `
### Task ID: task-1
**Agent Role Description**
Backend engineer specializing in microservices

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create service A
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour

---

### Task ID: task-2
**Agent Role Description**
Backend engineer specializing in microservices

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create service B
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour

---

### Task ID: task-3
**Agent Role Description**
Frontend developer

**Recommended Model**
Claude Sonnet 4

**Optimized Prompt**
<prompt>
Create UI
</prompt>

**Dependencies**
None
**Estimated Duration**
2 hours
`;

      const chainPath = path.join(TEST_DIR, 'chain-output-reuse.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      const results = await executeChainOutput(chainPath, TEST_DIR);

      expect(results).toHaveLength(3);
      
      // Should have 2 unique preambles (Backend and Frontend)
      const uniquePreambles = new Set(results.map(r => r.preamblePath));
      expect(uniquePreambles.size).toBe(2);
      
      // Backend tasks should share preamble
      expect(results[0].preamblePath).toBe(results[1].preamblePath);
      
      // Frontend task should have different preamble
      expect(results[2].preamblePath).not.toBe(results[0].preamblePath);
    });
  });

  describe('Final Report Generation', () => {
    
    it('should generate comprehensive final report', async () => {
      const tasks: TaskDefinition[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          agentRoleDescription: 'Backend engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Create API',
          dependencies: [],
          estimatedDuration: '1h',
        },
      ];

      const results = [
        {
          taskId: 'task-1',
          status: 'success' as const,
          output: 'Created API with 3 endpoints',
          duration: 1500,
          preamblePath: 'test-preamble.md',
          agentRoleDescription: 'Backend engineer',
          prompt: 'Create API',
          tokens: { input: 100, output: 50 },
          toolCalls: 5,
        },
      ];

      const reportPath = path.join(TEST_DIR, 'final-report.md');
      
      // Override the PM agent execute to return a proper report
      const { CopilotAgentClient } = await import('../src/orchestrator/llm-client.js');
      const originalMethod = (CopilotAgentClient as any).prototype.execute;
      (CopilotAgentClient as any).prototype.execute = vi.fn().mockImplementation(async (prompt: string) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        // Generate a proper report that includes the task info
        return {
          output: `# Final Execution Report\n\n## Task: task-1\nAgent: Backend engineer\nStatus: SUCCESS\n\nCreated API with 3 endpoints`,
          tokens: { input: 200, output: 100 },
          toolCalls: 1,
        };
      });

      try {
        await generateFinalReport(tasks, results, reportPath);

        // Verify report was created
        const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
        expect(reportExists).toBe(true);

        // Verify report contains key information
        const report = await fs.readFile(reportPath, 'utf-8');
        expect(report).toContain('task-1');
        expect(report).toContain('Backend engineer');
        expect(report).toBeDefined();
      } finally {
        // Restore original method
        (CopilotAgentClient as any).prototype.execute = originalMethod;
      }
    });
  });

  describe('Edge Cases', () => {
    
    it('should handle empty task list', async () => {
      const markdown = `# No Tasks Here`;

      const chainPath = path.join(TEST_DIR, 'chain-output.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      const results = await executeChainOutput(chainPath, TEST_DIR);

      expect(results).toHaveLength(0);
    });

    it('should handle malformed markdown gracefully', async () => {
      const markdown = `
### Task ID: incomplete-task
**Agent Role Description**
Some role

This task is missing required fields...
`;

      const chainPath = path.join(TEST_DIR, 'chain-output.md');
      await fs.writeFile(chainPath, markdown, 'utf-8');

      const results = await executeChainOutput(chainPath, TEST_DIR);

      // Should not crash, just return empty or partial results
      expect(results).toBeDefined();
    });
  });
});
