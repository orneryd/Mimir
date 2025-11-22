/**
 * @fileoverview Unit tests for workflow execution engine
 * 
 * Tests the main workflow orchestration logic including task execution,
 * state management, SSE events, deliverable collection, and error handling
 * with fully mocked dependencies.
 * 
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { executeWorkflowFromJSON, executionStates } from './workflow-executor.js';
import type { IGraphManager } from '../../types/index.js';
import * as persistence from './persistence.js';
import * as sse from './sse.js';
import * as taskExecutor from '../../orchestrator/task-executor.js';

// Mock modules
vi.mock('./persistence.js');
vi.mock('./sse.js');
vi.mock('../../orchestrator/task-executor.js');
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ isFile: () => true }),
  readFile: vi.fn().mockResolvedValue('file content'),
  rm: vi.fn().mockResolvedValue(undefined),
}));

describe('Workflow Executor', () => {
  let mockGraphManager: IGraphManager;
  let mockSession: any;
  let mockDriver: any;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Clear execution states
    executionStates.clear();

    // Create mock session
    mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock driver
    mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    };

    // Create mock graph manager
    mockGraphManager = {
      getDriver: vi.fn().mockReturnValue(mockDriver),
    } as any;

    // Mock persistence functions
    vi.mocked(persistence.createExecutionNodeInNeo4j).mockResolvedValue(undefined);
    vi.mocked(persistence.persistTaskExecutionToNeo4j).mockResolvedValue('task-exec-1');
    vi.mocked(persistence.updateExecutionNodeProgress).mockResolvedValue(undefined);
    vi.mocked(persistence.updateExecutionNodeInNeo4j).mockResolvedValue(undefined);

    // Mock SSE functions
    vi.mocked(sse.sendSSEEvent).mockImplementation(() => {});
    vi.mocked(sse.closeSSEConnections).mockImplementation(() => {});

    // Mock task execution functions
    vi.mocked(taskExecutor.generatePreamble).mockResolvedValue('# Test Preamble\nContent...');
    vi.mocked(taskExecutor.executeTask).mockResolvedValue({
      taskId: 'task-1',
      status: 'success',
      output: 'Task completed',
      duration: 1000,
      preamblePath: '/test.md',
      tokens: { input: 100, output: 50 },
      toolCalls: 2,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('executeWorkflowFromJSON', () => {
    it('should execute a simple single-task workflow successfully', async () => {
      const uiTasks = [
        {
          id: 'task-1',
          title: 'Test Task',
          prompt: 'Do something',
          agentRoleDescription: 'Test Worker',
          dependencies: [],
        },
      ];
      const executionId = 'exec-123';

      const results = await executeWorkflowFromJSON(
        uiTasks,
        executionId,
        mockGraphManager
      );

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
      expect(results[0].taskId).toBe('task-1');

      // Verify execution node was created
      expect(persistence.createExecutionNodeInNeo4j).toHaveBeenCalledWith(
        mockGraphManager,
        executionId,
        executionId,
        1,
        expect.any(Number)
      );

      // Verify task was persisted
      expect(persistence.persistTaskExecutionToNeo4j).toHaveBeenCalledOnce();

      // Verify execution was finalized
      expect(persistence.updateExecutionNodeInNeo4j).toHaveBeenCalledWith(
        mockGraphManager,
        executionId,
        results,
        expect.any(Number),
        false
      );
    });

    it('should initialize execution state correctly', async () => {
      const uiTasks = [
        {
          id: 'task-1',
          title: 'Task 1',
          prompt: 'Do A',
          agentRoleDescription: 'Worker A',
          dependencies: [],
        },
        {
          id: 'task-2',
          title: 'Task 2',
          prompt: 'Do B',
          agentRoleDescription: 'Worker B',
          dependencies: ['task-1'],
        },
      ];
      const executionId = 'exec-456';

      await executeWorkflowFromJSON(uiTasks, executionId, mockGraphManager);

      const state = executionStates.get(executionId);
      expect(state).toBeDefined();
      expect(state?.status).toBe('completed');
      expect(state?.taskStatuses['task-1']).toBe('completed');
      expect(state?.taskStatuses['task-2']).toBe('completed');
    });

    it('should send SSE events for execution lifecycle', async () => {
      const uiTasks = [
        {
          id: 'task-1',
          title: 'Test Task',
          prompt: 'Test',
          agentRoleDescription: 'Worker',
          dependencies: [],
        },
      ];
      const executionId = 'exec-789';

      await executeWorkflowFromJSON(uiTasks, executionId, mockGraphManager);

      // Verify SSE events were sent
      expect(sse.sendSSEEvent).toHaveBeenCalledWith(
        executionId,
        'execution-start',
        expect.any(Object)
      );
      expect(sse.sendSSEEvent).toHaveBeenCalledWith(
        executionId,
        'task-start',
        expect.any(Object)
      );
      expect(sse.sendSSEEvent).toHaveBeenCalledWith(
        executionId,
        'task-complete',
        expect.any(Object)
      );
      expect(sse.sendSSEEvent).toHaveBeenCalledWith(
        executionId,
        'execution-complete',
        expect.any(Object)
      );
    });

    it('should handle task execution failure gracefully', async () => {
      // Mock task failure
      vi.mocked(taskExecutor.executeTask).mockResolvedValueOnce({
        taskId: 'task-1',
        status: 'failure',
        output: '',
        error: 'Task failed',
        duration: 500,
        preamblePath: '/test.md',
      });

      const uiTasks = [
        {
          id: 'task-1',
          title: 'Failing Task',
          prompt: 'Fail',
          agentRoleDescription: 'Worker',
          dependencies: [],
        },
      ];
      const executionId = 'exec-fail';

      const results = await executeWorkflowFromJSON(
        uiTasks,
        executionId,
        mockGraphManager
      );

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('failure');
      expect(results[0].error).toBe('Task failed');

      // Verify execution was marked as failed
      const state = executionStates.get(executionId);
      expect(state?.status).toBe('failed');
    });

    it('should stop execution after first task failure', async () => {
      // First task fails
      vi.mocked(taskExecutor.executeTask)
        .mockResolvedValueOnce({
          taskId: 'task-1',
          status: 'failure',
          output: '',
          error: 'Failed',
          duration: 500,
          preamblePath: '/test.md',
        })
        .mockResolvedValueOnce({
          taskId: 'task-2',
          status: 'success',
          output: 'Should not execute',
          duration: 1000,
          preamblePath: '/test.md',
        });

      const uiTasks = [
        { id: 'task-1', title: 'Task 1', prompt: 'A', agentRoleDescription: 'Worker', dependencies: [] },
        { id: 'task-2', title: 'Task 2', prompt: 'B', agentRoleDescription: 'Worker', dependencies: ['task-1'] },
      ];

      const results = await executeWorkflowFromJSON(
        uiTasks,
        'exec-stop',
        mockGraphManager
      );

      // Only first task should have executed
      expect(results).toHaveLength(1);
      expect(results[0].taskId).toBe('task-1');
      expect(taskExecutor.executeTask).toHaveBeenCalledOnce();
    });

    it('should generate preambles for each unique role', async () => {
      const uiTasks = [
        { id: 'task-1', title: 'Task 1', prompt: 'A', agentRoleDescription: 'Worker A', dependencies: [] },
        { id: 'task-2', title: 'Task 2', prompt: 'B', agentRoleDescription: 'Worker A', dependencies: [] },
        { id: 'task-3', title: 'Task 3', prompt: 'C', agentRoleDescription: 'Worker B', dependencies: [] },
      ];

      await executeWorkflowFromJSON(uiTasks, 'exec-roles', mockGraphManager);

      // Should generate 2 preambles (one for each unique role)
      expect(taskExecutor.generatePreamble).toHaveBeenCalledTimes(2);
    });

    it('should include QC preambles when QC roles are specified', async () => {
      const uiTasks = [
        {
          id: 'task-1',
          title: 'Task with QC',
          prompt: 'Test',
          agentRoleDescription: 'Worker',
          qcRole: 'QC Agent',
          verificationCriteria: 'Check A, Check B',
          dependencies: [],
        },
      ];

      await executeWorkflowFromJSON(uiTasks, 'exec-qc', mockGraphManager);

      // Should generate both worker and QC preambles
      expect(taskExecutor.generatePreamble).toHaveBeenCalledWith(
        'Worker',
        expect.any(String),
        expect.any(Object),
        false
      );
      expect(taskExecutor.generatePreamble).toHaveBeenCalledWith(
        'QC Agent',
        expect.any(String),
        expect.any(Object),
        true
      );
    });

    it('should handle execution cancellation', async () => {
      const executionId = 'exec-cancel';
      const uiTasks = [
        { id: 'task-1', title: 'Task 1', prompt: 'A', agentRoleDescription: 'Worker', dependencies: [] },
      ];

      // Start execution
      const executionPromise = executeWorkflowFromJSON(
        uiTasks,
        executionId,
        mockGraphManager
      );

      // Cancel execution mid-flight
      const state = executionStates.get(executionId);
      if (state) {
        state.cancelled = true;
      }

      await executionPromise;

      // Verify cancelled status
      expect(sse.sendSSEEvent).toHaveBeenCalledWith(
        executionId,
        'execution-cancelled',
        expect.any(Object)
      );
    });

    it('should update progress after each task completion', async () => {
      const uiTasks = [
        { id: 'task-1', title: 'Task 1', prompt: 'A', agentRoleDescription: 'Worker', dependencies: [] },
        { id: 'task-2', title: 'Task 2', prompt: 'B', agentRoleDescription: 'Worker', dependencies: [] },
      ];

      await executeWorkflowFromJSON(uiTasks, 'exec-progress', mockGraphManager);

      // Should update progress twice (once per task)
      expect(persistence.updateExecutionNodeProgress).toHaveBeenCalledTimes(2);
    });

    it('should close SSE connections after completion', async () => {
      vi.useFakeTimers();

      const uiTasks = [
        { id: 'task-1', title: 'Task', prompt: 'Test', agentRoleDescription: 'Worker', dependencies: [] },
      ];
      const executionId = 'exec-sse';

      await executeWorkflowFromJSON(uiTasks, executionId, mockGraphManager);

      // Fast-forward timers to trigger closeSSEConnections
      vi.advanceTimersByTime(1000);

      expect(sse.closeSSEConnections).toHaveBeenCalledWith(executionId);

      vi.useRealTimers();
    });

    it('should handle Neo4j persistence failures gracefully', async () => {
      // Mock persistence failure
      vi.mocked(persistence.persistTaskExecutionToNeo4j).mockRejectedValueOnce(
        new Error('Neo4j connection failed')
      );

      const uiTasks = [
        { id: 'task-1', title: 'Task', prompt: 'Test', agentRoleDescription: 'Worker', dependencies: [] },
      ];

      // Should not throw - execution continues even if persistence fails
      const results = await executeWorkflowFromJSON(
        uiTasks,
        'exec-persist-fail',
        mockGraphManager
      );

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
    });

    it('should convert UI tasks to TaskDefinition format correctly', async () => {
      const uiTasks = [
        {
          id: 'task-1',
          title: 'Complex Task',
          prompt: 'Do complex thing',
          agentRoleDescription: 'Complex Worker',
          recommendedModel: 'gpt-4-turbo',
          estimatedDuration: '15 min',
          estimatedToolCalls: 10,
          dependencies: ['task-0'],
          parallelGroup: 'group-1',
          qcRole: 'Complex QC',
          verificationCriteria: 'Criterion 1, Criterion 2',
          maxRetries: 3,
        },
      ];

      await executeWorkflowFromJSON(uiTasks, 'exec-complex', mockGraphManager);

      // Verify executeTask was called with properly formatted TaskDefinition
      expect(taskExecutor.executeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-1',
          title: 'Complex Task',
          agentRoleDescription: 'Complex Worker',
          recommendedModel: 'gpt-4-turbo',
          prompt: 'Do complex thing',
          dependencies: ['task-0'],
          estimatedDuration: '15 min',
          parallelGroup: 'group-1',
          qcRole: 'Complex QC',
          verificationCriteria: 'Criterion 1, Criterion 2', // Keep as comma-separated
          maxRetries: 3,
          estimatedToolCalls: 10,
        }),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Function)
      );
    });
  });

  describe('executionStates', () => {
    it('should maintain execution state throughout workflow', async () => {
      const executionId = 'exec-state-test';
      const uiTasks = [
        { id: 'task-1', title: 'Task', prompt: 'Test', agentRoleDescription: 'Worker', dependencies: [] },
      ];

      await executeWorkflowFromJSON(uiTasks, executionId, mockGraphManager);

      const state = executionStates.get(executionId);
      expect(state).toBeDefined();
      expect(state?.executionId).toBe(executionId);
      expect(state?.results).toHaveLength(1);
      expect(state?.startTime).toBeDefined();
      expect(state?.endTime).toBeDefined();
    });
  });
});
