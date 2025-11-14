export type TaskExecutionStatus = 'pending' | 'executing' | 'completed' | 'failed';

export interface Task {
  id: string;
  title: string;
  agentRoleDescription: string;
  workerPreambleId?: string; // Reference to worker preamble
  recommendedModel: string;
  prompt: string;
  context?: string;
  toolBasedExecution?: string;
  successCriteria: string[];
  dependencies: string[];
  estimatedDuration: string;
  estimatedToolCalls: number;
  parallelGroup: number | null;
  qcAgentRoleDescription: string;
  qcPreambleId?: string; // Reference to QC preamble
  verificationCriteria: string[];
  maxRetries: number;
  position?: { x: number; y: number };
  order?: number; // Execution order for ungrouped tasks (top-to-bottom)
  executionStatus?: TaskExecutionStatus; // Runtime execution status
}

export interface ProjectPlan {
  overview: {
    goal: string;
    complexity: 'Simple' | 'Medium' | 'Complex';
    totalTasks: number;
    estimatedDuration: string;
    estimatedToolCalls: number;
  };
  reasoning: {
    requirementsAnalysis: string;
    complexityAssessment: string;
    repositoryContext: string;
    decompositionStrategy: string;
    taskBreakdown: string;
  };
  tasks: Task[];
  parallelGroups: ParallelGroup[];
}

export interface ParallelGroup {
  id: number;
  name: string;
  taskIds: string[];
  color: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  agentType: 'worker' | 'qc';
  content: string;
  version: string;
  created: string;
}

export interface CreateAgentRequest {
  roleDescription: string;
  agentType: 'worker' | 'qc';
  useAgentinator?: boolean;
}
