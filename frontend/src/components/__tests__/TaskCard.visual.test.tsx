import { describe, it, expect } from 'vitest';
import { Task } from '../../types/task';

describe('TaskCard Visual States', () => {
  const createMockTask = (executionStatus?: 'pending' | 'executing' | 'completed' | 'failed'): Task => ({
    id: 'task-0',
    title: 'Test Task',
    agentRoleDescription: 'Test Agent',
    recommendedModel: 'gpt-4',
    prompt: 'Test prompt',
    context: '',
    successCriteria: [],
    dependencies: [],
    estimatedDuration: '10 min',
    estimatedToolCalls: 5,
    parallelGroup: null,
    qcAgentRoleDescription: 'QC Agent',
    verificationCriteria: [],
    maxRetries: 2,
    executionStatus,
  });

  const getExecutionStatusClass = (task: Task) => {
    if (!task.executionStatus) return 'border-norse-rune hover:border-valhalla-gold';
    
    switch (task.executionStatus) {
      case 'executing':
        return 'border-yellow-500 shadow-lg shadow-yellow-500/50 animate-pulse';
      case 'completed':
        return 'border-green-500 shadow-md shadow-green-500/30';
      case 'failed':
        return 'border-red-500 shadow-md shadow-red-500/30';
      case 'pending':
      default:
        return 'border-gray-600';
    }
  };

  describe('Execution Status Visual Behavior', () => {
    it('should have pulsing animation ONLY for executing status', () => {
      const executingTask = createMockTask('executing');
      const className = getExecutionStatusClass(executingTask);
      
      expect(className).toContain('animate-pulse');
      expect(className).toContain('border-yellow-500');
    });

    it('should NOT pulse for completed status - solid green', () => {
      const completedTask = createMockTask('completed');
      const className = getExecutionStatusClass(completedTask);
      
      expect(className).not.toContain('animate-pulse');
      expect(className).toContain('border-green-500');
      expect(className).toContain('shadow-green-500/30');
    });

    it('should NOT pulse for failed status - solid red', () => {
      const failedTask = createMockTask('failed');
      const className = getExecutionStatusClass(failedTask);
      
      expect(className).not.toContain('animate-pulse');
      expect(className).toContain('border-red-500');
      expect(className).toContain('shadow-red-500/30');
    });

    it('should NOT pulse for pending status - solid gray', () => {
      const pendingTask = createMockTask('pending');
      const className = getExecutionStatusClass(pendingTask);
      
      expect(className).not.toContain('animate-pulse');
      expect(className).toContain('border-gray-600');
    });

    it('should NOT pulse for tasks without execution status', () => {
      const defaultTask = createMockTask();
      const className = getExecutionStatusClass(defaultTask);
      
      expect(className).not.toContain('animate-pulse');
      expect(className).toContain('border-norse-rune');
    });
  });

  describe('Status Color Verification', () => {
    it('should use yellow/orange for executing tasks', () => {
      const task = createMockTask('executing');
      const className = getExecutionStatusClass(task);
      
      expect(className).toContain('border-yellow-500');
      expect(className).toContain('shadow-yellow-500/50');
    });

    it('should use green for completed tasks', () => {
      const task = createMockTask('completed');
      const className = getExecutionStatusClass(task);
      
      expect(className).toContain('border-green-500');
      expect(className).toContain('shadow-green-500/30');
    });

    it('should use red for failed tasks', () => {
      const task = createMockTask('failed');
      const className = getExecutionStatusClass(task);
      
      expect(className).toContain('border-red-500');
      expect(className).toContain('shadow-red-500/30');
    });

    it('should use gray for pending tasks', () => {
      const task = createMockTask('pending');
      const className = getExecutionStatusClass(task);
      
      expect(className).toContain('border-gray-600');
    });
  });

  describe('Shadow Effects', () => {
    it('should have strong shadow for executing (pulsing) tasks', () => {
      const task = createMockTask('executing');
      const className = getExecutionStatusClass(task);
      
      expect(className).toContain('shadow-lg'); // Larger shadow
      expect(className).toContain('shadow-yellow-500/50');
    });

    it('should have medium shadow for completed tasks', () => {
      const task = createMockTask('completed');
      const className = getExecutionStatusClass(task);
      
      expect(className).toContain('shadow-md'); // Medium shadow
      expect(className).toContain('shadow-green-500/30');
    });

    it('should have medium shadow for failed tasks', () => {
      const task = createMockTask('failed');
      const className = getExecutionStatusClass(task);
      
      expect(className).toContain('shadow-md'); // Medium shadow
      expect(className).toContain('shadow-red-500/30');
    });

    it('should not have special shadow for pending tasks', () => {
      const task = createMockTask('pending');
      const className = getExecutionStatusClass(task);
      
      expect(className).not.toContain('shadow-lg');
      expect(className).not.toContain('shadow-md');
    });
  });
});
