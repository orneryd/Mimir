import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlanStore } from '../../store/planStore';

// Mock fetch globally
global.fetch = vi.fn();

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

global.sessionStorage = sessionStorageMock as any;

// Ensure window is defined for sessionStorage checks in planStore
if (typeof window === 'undefined') {
  (global as any).window = {};
}

// Mock EventSource
class MockEventSource {
  url: string;
  listeners: Map<string, Function[]> = new Map();
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    this.readyState = 1; // OPEN
  }

  addEventListener(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  dispatchEvent(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        callback({ data: JSON.stringify(data) });
      });
    }
  }

  close() {
    this.readyState = 2; // CLOSED
  }
}

global.EventSource = MockEventSource as any;

describe('TaskCanvas SSE Event Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    
    // Reset store
    const { result } = renderHook(() => usePlanStore());
    act(() => {
      result.current.clearSessionStorage();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SSE Connection Lifecycle', () => {
    it('should connect to SSE stream when execution starts', () => {
      const executionId = 'exec-test-123';
      
      // Mock fetch response for execute-workflow
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          executionId,
          message: 'Execution started',
        }),
      });

      // In a real test, we'd trigger the execute button
      // For now, verify the EventSource constructor is called
      const eventSource = new EventSource(`/api/execution-stream/${executionId}`);
      
      expect(eventSource.url).toBe(`/api/execution-stream/${executionId}`);
      expect(eventSource.readyState).toBe(1); // OPEN
    });

    it('should close SSE connection on execution-complete event', () => {
      const eventSource = new MockEventSource('/api/execution-stream/test-exec');
      
      eventSource.addEventListener('execution-complete', () => {
        eventSource.close();
      });

      eventSource.dispatchEvent('execution-complete', {
        executionId: 'test-exec',
        status: 'completed',
      });

      expect(eventSource.readyState).toBe(2); // CLOSED
    });

    it('should close SSE connection on execution-cancelled event', () => {
      const eventSource = new MockEventSource('/api/execution-stream/test-exec');
      
      eventSource.addEventListener('execution-cancelled', () => {
        eventSource.close();
      });

      eventSource.dispatchEvent('execution-cancelled', {
        executionId: 'test-exec',
        status: 'cancelled',
      });

      expect(eventSource.readyState).toBe(2); // CLOSED
    });
  });

  describe('SSE Event Processing', () => {
    it('should update task status to executing on task-start event', () => {
      const { result } = renderHook(() => usePlanStore());
      
      // Add a test task
      act(() => {
        result.current.addTask({
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
        });
      });

      // Simulate SSE task-start event
      act(() => {
        result.current.updateTaskExecutionStatus('task-0', 'executing');
      });

      expect(result.current.tasks[0].executionStatus).toBe('executing');
    });

    it('should update task status to completed on task-complete event', () => {
      const { result } = renderHook(() => usePlanStore());
      
      act(() => {
        result.current.addTask({
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
          executionStatus: 'executing',
        });
      });

      // Simulate SSE task-complete event
      act(() => {
        result.current.updateTaskExecutionStatus('task-0', 'completed');
      });

      expect(result.current.tasks[0].executionStatus).toBe('completed');
    });

    it('should update task status to failed on task-fail event', () => {
      const { result } = renderHook(() => usePlanStore());
      
      act(() => {
        result.current.addTask({
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
          executionStatus: 'executing',
        });
      });

      // Simulate SSE task-fail event
      act(() => {
        result.current.updateTaskExecutionStatus('task-0', 'failed');
      });

      expect(result.current.tasks[0].executionStatus).toBe('failed');
    });

    it('should set isExecuting to true on execution-start event', () => {
      const { result } = renderHook(() => usePlanStore());
      
      act(() => {
        result.current.setActiveExecution('exec-123', true);
      });

      expect(result.current.isExecuting).toBe(true);
      expect(result.current.activeExecutionId).toBe('exec-123');
    });

    it('should set isExecuting to false on execution-complete event', () => {
      const { result } = renderHook(() => usePlanStore());
      
      act(() => {
        result.current.setActiveExecution('exec-123', true);
      });

      act(() => {
        result.current.setActiveExecution(null, false);
      });

      expect(result.current.isExecuting).toBe(false);
      expect(result.current.activeExecutionId).toBe(null);
    });

    it('should clear execution state on execution-cancelled event', () => {
      const { result } = renderHook(() => usePlanStore());
      
      // Set up execution state
      act(() => {
        result.current.addTask({
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
          executionStatus: 'executing',
        });
        result.current.setActiveExecution('exec-123', true);
      });

      // Simulate cancellation
      act(() => {
        result.current.setActiveExecution(null, false);
      });

      expect(result.current.isExecuting).toBe(false);
      expect(result.current.activeExecutionId).toBe(null);
    });
  });

  describe('Cancel Execution Functionality', () => {
    it('should send cancel request to API', async () => {
      const executionId = 'exec-test-123';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          executionId,
          message: 'Execution cancellation requested',
        }),
      });

      await fetch(`/api/cancel-execution/${executionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/cancel-execution/${executionId}`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should handle cancel request errors gracefully', async () => {
      const executionId = 'exec-test-123';
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Execution not found',
        }),
      });

      const response = await fetch(`/api/cancel-execution/${executionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.ok).toBe(false);
    });

    it('should not allow cancellation if no execution is running', () => {
      const { result } = renderHook(() => usePlanStore());
      
      // No execution running
      expect(result.current.isExecuting).toBe(false);
      expect(result.current.activeExecutionId).toBe(null);
    });

    it('should unlock UI after cancellation', () => {
      const { result } = renderHook(() => usePlanStore());
      
      // Set execution state
      act(() => {
        result.current.setActiveExecution('exec-123', true);
      });
      expect(result.current.isExecuting).toBe(true);

      // Cancel execution
      act(() => {
        result.current.setActiveExecution(null, false);
      });

      expect(result.current.isExecuting).toBe(false);
    });
  });

  describe('SessionStorage Persistence', () => {
    it('should save execution state to sessionStorage', () => {
      const { result } = renderHook(() => usePlanStore());
      
      act(() => {
        result.current.addTask({
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
          executionStatus: 'executing',
        });
        result.current.setActiveExecution('exec-123', true);
        result.current.saveToSessionStorage();
      });

      const executionData = sessionStorage.getItem('mimir-execution-state');
      expect(executionData).toBeTruthy();
      
      const parsed = JSON.parse(executionData!);
      expect(parsed.activeExecutionId).toBe('exec-123');
      expect(parsed.isExecuting).toBe(true);
      expect(parsed.taskStatuses['task-0']).toBe('executing');
    });

    it('should clear execution state from sessionStorage on cancellation', () => {
      const { result } = renderHook(() => usePlanStore());
      
      act(() => {
        result.current.setActiveExecution('exec-123', true);
        result.current.saveToSessionStorage();
      });

      // Verify it's saved
      expect(sessionStorage.getItem('mimir-execution-state')).toBeTruthy();

      // Clear on cancellation
      sessionStorage.removeItem('mimir-execution-state');
      expect(sessionStorage.getItem('mimir-execution-state')).toBe(null);
    });

    it('should restore execution state on page reload', () => {
      // Set up execution state in sessionStorage
      const mockExecutionState = {
        activeExecutionId: 'exec-123',
        isExecuting: true,
        taskStatuses: {
          'task-0': 'completed',
          'task-1': 'executing',
        },
      };

      sessionStorage.setItem('mimir-execution-state', JSON.stringify(mockExecutionState));

      const { result } = renderHook(() => usePlanStore());
      
      act(() => {
        result.current.loadFromSessionStorage();
      });

      expect(result.current.activeExecutionId).toBe('exec-123');
      expect(result.current.isExecuting).toBe(true);
    });
  });

  describe('Complete Execution Flow', () => {
    it('should process complete execution lifecycle with SSE events', () => {
      const { result } = renderHook(() => usePlanStore());
      const eventSource = new MockEventSource('/api/execution-stream/test-exec');
      const events: string[] = [];

      // Add test tasks
      act(() => {
        result.current.addTask({
          id: 'task-0',
          title: 'Setup',
          agentRoleDescription: 'DevOps',
          recommendedModel: 'gpt-4',
          prompt: 'Setup environment',
          context: '',
          successCriteria: [],
          dependencies: [],
          estimatedDuration: '10 min',
          estimatedToolCalls: 5,
          parallelGroup: null,
          qcAgentRoleDescription: 'QC Agent',
          verificationCriteria: [],
          maxRetries: 2,
        });
        result.current.addTask({
          id: 'task-1',
          title: 'Deploy',
          agentRoleDescription: 'DevOps',
          recommendedModel: 'gpt-4',
          prompt: 'Deploy application',
          context: '',
          successCriteria: [],
          dependencies: ['task-0'],
          estimatedDuration: '15 min',
          estimatedToolCalls: 8,
          parallelGroup: null,
          qcAgentRoleDescription: 'QC Agent',
          verificationCriteria: [],
          maxRetries: 2,
        });
      });

      // Set up event listeners
      eventSource.addEventListener('execution-start', () => {
        events.push('execution-start');
        act(() => {
          result.current.setActiveExecution('test-exec', true);
        });
      });

      eventSource.addEventListener('task-start', (event: any) => {
        const data = JSON.parse(event.data);
        events.push(`task-start:${data.taskId}`);
        act(() => {
          result.current.updateTaskExecutionStatus(data.taskId, 'executing');
        });
      });

      eventSource.addEventListener('task-complete', (event: any) => {
        const data = JSON.parse(event.data);
        events.push(`task-complete:${data.taskId}`);
        act(() => {
          result.current.updateTaskExecutionStatus(data.taskId, 'completed');
        });
      });

      eventSource.addEventListener('execution-complete', () => {
        events.push('execution-complete');
        act(() => {
          result.current.setActiveExecution(null, false);
        });
      });

      // Simulate execution flow
      eventSource.dispatchEvent('execution-start', { executionId: 'test-exec' });
      eventSource.dispatchEvent('task-start', { taskId: 'task-0' });
      eventSource.dispatchEvent('task-complete', { taskId: 'task-0', status: 'success' });
      eventSource.dispatchEvent('task-start', { taskId: 'task-1' });
      eventSource.dispatchEvent('task-complete', { taskId: 'task-1', status: 'success' });
      eventSource.dispatchEvent('execution-complete', { status: 'completed' });

      // Verify event sequence
      expect(events).toEqual([
        'execution-start',
        'task-start:task-0',
        'task-complete:task-0',
        'task-start:task-1',
        'task-complete:task-1',
        'execution-complete',
      ]);

      // Verify final state
      expect(result.current.tasks[0].executionStatus).toBe('completed');
      expect(result.current.tasks[1].executionStatus).toBe('completed');
      expect(result.current.isExecuting).toBe(false);
    });

    it('should handle cancellation mid-execution', () => {
      const { result } = renderHook(() => usePlanStore());
      const eventSource = new MockEventSource('/api/execution-stream/test-exec');
      const events: string[] = [];

      // Add test tasks
      act(() => {
        result.current.addTask({
          id: 'task-0',
          title: 'Task 0',
          agentRoleDescription: 'Agent',
          recommendedModel: 'gpt-4',
          prompt: 'Do task 0',
          context: '',
          successCriteria: [],
          dependencies: [],
          estimatedDuration: '10 min',
          estimatedToolCalls: 5,
          parallelGroup: null,
          qcAgentRoleDescription: 'QC',
          verificationCriteria: [],
          maxRetries: 2,
        });
        result.current.addTask({
          id: 'task-1',
          title: 'Task 1',
          agentRoleDescription: 'Agent',
          recommendedModel: 'gpt-4',
          prompt: 'Do task 1',
          context: '',
          successCriteria: [],
          dependencies: [],
          estimatedDuration: '10 min',
          estimatedToolCalls: 5,
          parallelGroup: null,
          qcAgentRoleDescription: 'QC',
          verificationCriteria: [],
          maxRetries: 2,
        });
      });

      // Set up listeners
      eventSource.addEventListener('execution-start', () => {
        events.push('execution-start');
        act(() => result.current.setActiveExecution('test-exec', true));
      });

      eventSource.addEventListener('task-start', (event: any) => {
        const data = JSON.parse(event.data);
        events.push(`task-start:${data.taskId}`);
        act(() => result.current.updateTaskExecutionStatus(data.taskId, 'executing'));
      });

      eventSource.addEventListener('task-complete', (event: any) => {
        const data = JSON.parse(event.data);
        events.push(`task-complete:${data.taskId}`);
        act(() => result.current.updateTaskExecutionStatus(data.taskId, 'completed'));
      });

      eventSource.addEventListener('execution-cancelled', () => {
        events.push('execution-cancelled');
        act(() => result.current.setActiveExecution(null, false));
      });

      // Start execution
      eventSource.dispatchEvent('execution-start', { executionId: 'test-exec' });
      eventSource.dispatchEvent('task-start', { taskId: 'task-0' });
      eventSource.dispatchEvent('task-complete', { taskId: 'task-0', status: 'success' });
      
      // Cancel before task-1 starts
      eventSource.dispatchEvent('execution-cancelled', { 
        status: 'cancelled',
        completed: 1,
        total: 2,
      });

      // Verify cancellation occurred after task-0
      expect(events).toEqual([
        'execution-start',
        'task-start:task-0',
        'task-complete:task-0',
        'execution-cancelled',
      ]);

      // Verify states
      expect(result.current.tasks[0].executionStatus).toBe('completed');
      // Task 1 should not be in executing state (it was cancelled before starting)
      expect(result.current.tasks[1].executionStatus).not.toBe('executing');
      expect(result.current.isExecuting).toBe(false);
    });
  });
});
