import { describe, it, expect } from 'vitest';
import { parseChainOutput, organizeTasks, TaskDefinition } from '../src/orchestrator/task-executor.js';

describe('Task Executor - Parallel Execution', () => {
  
  describe('parseChainOutput with Parallel Groups', () => {
    
    it('should parse tasks without parallel groups', () => {
      const markdown = `
### Task ID: task-1
**Agent Role Description**
Backend engineer with API experience

**Recommended Model**
GPT-4.1

**Optimized Prompt**
<prompt>
Create API endpoint
</prompt>

**Dependencies**
None
**Estimated Duration**
1 hour

---

### Task ID: task-2
**Agent Role Description**
Frontend developer with React skills

**Recommended Model**
Claude Sonnet 4

**Optimized Prompt**
<prompt>
Build UI component
</prompt>

**Dependencies**
task-1
**Estimated Duration**
2 hours
`;

      const tasks = parseChainOutput(markdown);
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('task-1');
      expect(tasks[0].parallelGroup).toBeUndefined();
      expect(tasks[1].id).toBe('task-2');
      expect(tasks[1].dependencies).toEqual(['task-1']);
    });

    it('should parse tasks with parallel groups', () => {
      const markdown = `
### Task ID: task-1
**Parallel Group**
1
**Agent Role Description**
Backend engineer

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
**Parallel Group**
1
**Agent Role Description**
Backend engineer

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
`;

      const tasks = parseChainOutput(markdown);
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0].parallelGroup).toBe(1);
      expect(tasks[1].parallelGroup).toBe(1);
      expect(tasks[0].dependencies).toEqual([]);
      expect(tasks[1].dependencies).toEqual([]);
    });
  });

  describe('organizeTasks', () => {
    
    it('should create single batch for independent tasks', () => {
      const tasks: TaskDefinition[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 1',
          dependencies: [],
          estimatedDuration: '1h',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 2',
          dependencies: [],
          estimatedDuration: '1h',
        },
      ];

      const batches = organizeTasks(tasks);
      
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(2);
      expect(batches[0].map(t => t.id)).toEqual(['task-1', 'task-2']);
    });

    it('should create sequential batches for dependent tasks', () => {
      const tasks: TaskDefinition[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 1',
          dependencies: [],
          estimatedDuration: '1h',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 2',
          dependencies: ['task-1'],
          estimatedDuration: '1h',
        },
        {
          id: 'task-3',
          title: 'Task 3',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 3',
          dependencies: ['task-2'],
          estimatedDuration: '1h',
        },
      ];

      const batches = organizeTasks(tasks);
      
      expect(batches).toHaveLength(3);
      expect(batches[0][0].id).toBe('task-1');
      expect(batches[1][0].id).toBe('task-2');
      expect(batches[2][0].id).toBe('task-3');
    });

    it('should handle diamond dependency pattern', () => {
      const tasks: TaskDefinition[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 1',
          dependencies: [],
          estimatedDuration: '1h',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 2',
          dependencies: ['task-1'],
          estimatedDuration: '1h',
        },
        {
          id: 'task-3',
          title: 'Task 3',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 3',
          dependencies: ['task-1'],
          estimatedDuration: '1h',
        },
        {
          id: 'task-4',
          title: 'Task 4',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 4',
          dependencies: ['task-2', 'task-3'],
          estimatedDuration: '1h',
        },
      ];

      const batches = organizeTasks(tasks);
      
      // Batch 1: task-1
      // Batch 2: task-2, task-3 (parallel)
      // Batch 3: task-4
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(1);
      expect(batches[0][0].id).toBe('task-1');
      expect(batches[1]).toHaveLength(2);
      expect(batches[1].map(t => t.id).sort()).toEqual(['task-2', 'task-3']);
      expect(batches[2]).toHaveLength(1);
      expect(batches[2][0].id).toBe('task-4');
    });

    it('should respect explicit parallel groups', () => {
      const tasks: TaskDefinition[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 1',
          dependencies: [],
          estimatedDuration: '1h',
          parallelGroup: 1,
        },
        {
          id: 'task-2',
          title: 'Task 2',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 2',
          dependencies: [],
          estimatedDuration: '1h',
          parallelGroup: 1,
        },
        {
          id: 'task-3',
          title: 'Task 3',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 3',
          dependencies: [],
          estimatedDuration: '1h',
          parallelGroup: 2,
        },
      ];

      const batches = organizeTasks(tasks);
      
      // Should create separate batches for different parallel groups
      expect(batches).toHaveLength(2);
      
      // Find which batch has group 1 and group 2
      const group1Batch = batches.find(b => b[0].parallelGroup === 1);
      const group2Batch = batches.find(b => b[0].parallelGroup === 2);
      
      expect(group1Batch).toBeDefined();
      expect(group2Batch).toBeDefined();
      expect(group1Batch!).toHaveLength(2);
      expect(group2Batch!).toHaveLength(1);
    });

    it('should throw error for circular dependencies', () => {
      const tasks: TaskDefinition[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 1',
          dependencies: ['task-2'],
          estimatedDuration: '1h',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 2',
          dependencies: ['task-1'],
          estimatedDuration: '1h',
        },
      ];

      expect(() => organizeTasks(tasks)).toThrow('Cannot resolve dependencies');
    });

    it('should throw error for missing dependencies', () => {
      const tasks: TaskDefinition[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          agentRoleDescription: 'Engineer',
          recommendedModel: 'GPT-4.1',
          prompt: 'Do task 1',
          dependencies: ['non-existent-task'],
          estimatedDuration: '1h',
        },
      ];

      expect(() => organizeTasks(tasks)).toThrow('Cannot resolve dependencies');
    });
  });
});
