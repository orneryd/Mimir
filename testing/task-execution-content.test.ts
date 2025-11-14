import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are properly initialized
const {
  mockReadFile,
  mockWriteFile,
  mockMkdir,
  mockAccess,
  mockLoadPreamble,
  mockExecute,
  mockCopilotAgentClient,
} = vi.hoisted(() => {
  const mockLoadPreamble = vi.fn();
  const mockExecute = vi.fn().mockResolvedValue({
    output: `### QC VERDICT: PASS\n\n### SCORE: 95\n\n### FEEDBACK:\nTask completed successfully. All requirements met.\n\n### ISSUES FOUND:\nNone\n\n### REQUIRED FIXES:\nNone`,
    tokens: { input: 1000, output: 500 },
    toolCalls: 2,
  });

  return {
    mockReadFile: vi.fn(),
    mockWriteFile: vi.fn(),
    mockMkdir: vi.fn(),
    mockAccess: vi.fn(),
    mockLoadPreamble,
    mockExecute,
    mockCopilotAgentClient: vi.fn().mockImplementation(() => ({
      loadPreamble: mockLoadPreamble,
      execute: mockExecute,
    })),
  };
});

vi.mock('../src/orchestrator/llm-client.js', () => ({
  CopilotAgentClient: mockCopilotAgentClient,
}));

vi.mock('../src/managers/index.js', () => ({
  getGraphManager: vi.fn().mockResolvedValue({
    getDriver: vi.fn(() => ({
      session: vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ records: [] }),
        close: vi.fn(),
      })),
    })),
    updateNode: vi.fn(),
    addNode: vi.fn(),
  }),
  createGraphManager: vi.fn().mockResolvedValue({
    getDriver: vi.fn(() => ({
      session: vi.fn(() => ({
        run: vi.fn().mockResolvedValue({ records: [] }),
        close: vi.fn(),
      })),
    })),
    updateNode: vi.fn(),
    addNode: vi.fn(),
  }),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
  },
}));

// Import after mocks
import { executeTask, TaskDefinition } from '../src/orchestrator/task-executor.js';

describe('Task Execution with Content Strings', () => {
  let mockTask: TaskDefinition;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockTask = {
      id: 'task-1',
      title: 'Test Task',
      agentRoleDescription: 'Backend Engineer',
      recommendedModel: 'GPT-4.1',
      prompt: 'Create API endpoint',
      dependencies: [],
      estimatedDuration: '1h',
      qcRole: 'QC Specialist',  // QC is now mandatory
      verificationCriteria: 'API endpoint works correctly and tests pass',
    };
  });

  describe('executeTask - Preamble Content Handling', () => {
    it('should accept preamble content string instead of file path', async () => {
      // Arrange
      const preambleContent = '# Worker Preamble\n\nRole: Backend Engineer\n\n## Instructions\n\nImplement tasks carefully.';
      const qcPreambleContent = '# QC Preamble\n\nVerify implementation meets requirements';
      
      // Act
      const result = await executeTask(mockTask, preambleContent, qcPreambleContent);
      
      // Assert
      expect(mockCopilotAgentClient).toHaveBeenCalledWith(
        expect.objectContaining({
          preamblePath: 'memory', // Dummy value since content is passed directly
        })
      );
      
      expect(mockLoadPreamble).toHaveBeenCalledWith(preambleContent, true); // true = isContent
      expect(result.status).toBe('success');
    });

    it('should NOT read preamble from file system', async () => {
      // Arrange
      const preambleContent = '# Preamble Content\n\nDirect content';
      const qcPreambleContent = '# QC Preamble\n\nVerify';
      
      // Act
      await executeTask(mockTask, preambleContent, qcPreambleContent);
      
      // Assert - NO file reads for preambles (templates are OK)
      const preambleReads = mockReadFile.mock.calls.filter((call: any) => 
        call[0]?.includes('preamble') || call[0]?.includes('worker-') || call[0]?.includes('qc-')
      );
      expect(preambleReads).toHaveLength(0);
    });

    it('should handle QC preamble content string', async () => {
      // Arrange
      const workerPreambleContent = '# Worker Preamble\n\nImplement feature';
      const qcPreambleContent = '# QC Preamble\n\nVerify implementation meets requirements';
      const taskWithQC = {
        ...mockTask,
        requiresQC: true,
        qcRole: 'QC Specialist',
        verificationCriteria: 'Must have tests and follow style guide',
      };
      
      // Act
      await executeTask(taskWithQC, workerPreambleContent, qcPreambleContent);
      
      // Assert
      const allCalls = mockCopilotAgentClient.mock.calls;
      const qcAgentCall = allCalls.find((call: any) => 
        call[0]?.preamblePath === 'memory' && call.length > 0
      );
      
      expect(qcAgentCall).toBeDefined();
      
      // Verify QC agent loaded content, not path
      expect(mockLoadPreamble).toHaveBeenCalledWith(
        expect.stringContaining('QC Preamble'),
        true // isContent flag
      );
    });

    it('should pass content directly to worker agent', async () => {
      // Arrange
      const longPreambleContent = '# Detailed Preamble\n\n'.repeat(100) + 'Large content blob';
      const qcPreambleContent = '# QC Preamble\n\nVerify';
      
      // Act
      await executeTask(mockTask, longPreambleContent, qcPreambleContent);
      
      // Assert
      expect(mockLoadPreamble).toHaveBeenCalledWith(longPreambleContent, true);
    });

    it('should complete successfully with in-memory content', async () => {
      // Arrange
      const preambleContent = '# Worker\n\nComplete the task';
      const qcPreambleContent = '# QC Preamble\n\nVerify';
      
      // Act
      const result = await executeTask(mockTask, preambleContent, qcPreambleContent);
      
      // Assert
      expect(result).toMatchObject({
        taskId: 'task-1',
        status: 'success',
        output: expect.any(String),
        preamblePath: 'database', // Indicates content from DB
      });
    });
  });

  describe('executeTask - No Disk I/O for Preambles', () => {
    it('should never write preamble content to disk during execution', async () => {
      // Arrange
      const preambleContent = '# Test Preamble\n\nContent in memory';
      const qcPreambleContent = '# QC Preamble\n\nVerify';
      
      // Act
      await executeTask(mockTask, preambleContent, qcPreambleContent);
      
      // Assert - NO preamble writes to disk
      const writeFileCalls = mockWriteFile.mock.calls;
      const preambleWrites = writeFileCalls.filter((call: any) => 
        call[0]?.includes('preamble') || 
        call[0]?.includes('worker-') ||
        call[0]?.includes('qc-')
      );
      
      expect(preambleWrites).toHaveLength(0);
    });

    it('should never read preamble from disk when content provided', async () => {
      // Arrange
      const preambleContent = '# Worker Preamble\n\nIn-memory content';
      const qcPreambleContent = '# QC Preamble\n\nVerify';
      
      // Act
      await executeTask(mockTask, preambleContent, qcPreambleContent);
      
      // Assert - NO preamble reads from disk
      const readFileCalls = mockReadFile.mock.calls;
      const preambleReads = readFileCalls.filter((call: any) => 
        call[0]?.includes('preamble') ||
        call[0]?.includes('worker-') ||
        call[0]?.includes('qc-')
      );
      
      expect(preambleReads).toHaveLength(0);
    });
  });

  describe('executeTask - Result Properties', () => {
    it('should set preamblePath to "database" in result', async () => {
      // Arrange
      const preambleContent = '# Preamble from DB';
      const qcPreambleContent = '# QC Preamble\n\nVerify';
      
      // Act
      const result = await executeTask(mockTask, preambleContent, qcPreambleContent);
      
      // Assert
      expect(result.preamblePath).toBe('database');
      expect(result.preamblePath).not.toMatch(/\.md$/);
      expect(result.preamblePath).not.toMatch(/generated-agents/);
    });

    it('should include task execution metadata', async () => {
      // Arrange
      const preambleContent = '# Worker\n\nExecute task';
      const qcPreambleContent = '# QC Preamble\n\nVerify';
      
      // Act
      const result = await executeTask(mockTask, preambleContent, qcPreambleContent);
      
      // Assert
      expect(result).toMatchObject({
        taskId: mockTask.id,
        agentRoleDescription: mockTask.agentRoleDescription,
        prompt: mockTask.prompt,
        status: expect.stringMatching(/success|failure/),
        duration: expect.any(Number),
        preamblePath: 'database',
      });
    });
  });
});
