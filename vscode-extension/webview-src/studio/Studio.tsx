import React, { useState, useEffect } from 'react';
import { useDrag, useDrop } from 'react-dnd';

declare const vscode: any;

interface Task {
  // Required fields (backend contract)
  id: string;
  title: string;
  agentRoleDescription: string;
  recommendedModel: string;
  prompt: string;
  dependencies: string[];
  estimatedDuration: string;
  
  // Optional fields (backend contract)
  parallelGroup?: number;
  qcRole?: string; // QC Agent Role Description
  verificationCriteria?: string[]; // Array in UI, converted to string for backend
  maxRetries?: number;
  estimatedToolCalls?: number;
  
  // UI-only fields (not sent to backend)
  workerAgent?: Agent;
  qcAgent?: Agent;
  executionStatus?: 'pending' | 'executing' | 'completed' | 'failed';
}

interface Agent {
  id: string;
  name: string;
  role: string;
  type: 'pm' | 'worker' | 'qc';
  preamble?: string;
}

interface Preamble {
  name: string;
  title: string;
  description?: string;
  agentType?: string;
}

/**
 * Main Studio component - VSCode Edition
 * Features: Task-based workflow builder with drag-and-drop
 */
interface Deliverable {
  filename: string;
  size: number;
}

export function Studio() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [preambles, setPreambles] = useState<Preamble[]>([]);
  const [projectPrompt, setProjectPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [lastExecutionId, setLastExecutionId] = useState<string | null>(null);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('📨 Webview received message:', message.command, message);
      switch (message.command) {
        case 'preamblesLoaded':
          console.log('📚 Received preambles:', message.preambles?.length || 0, 'agents');
          console.log('📚 Preambles data:', message.preambles);
          setPreambles(message.preambles || []);
          break;
        case 'workflowLoaded': {
          // Convert loaded tasks from backend format (string) to UI format (array)
          const loadedTasks = (message.workflow?.tasks || []).map((task: any) => ({
            ...task,
            verificationCriteria: typeof task.verificationCriteria === 'string'
              ? task.verificationCriteria.split('\n').filter((v: string) => v.trim())
              : (Array.isArray(task.verificationCriteria) ? task.verificationCriteria : [])
          }));
          setTasks(loadedTasks);
          break;
        }
        case 'executionStarted':
          setIsExecuting(true);
          break;
        case 'executionComplete':
          setIsExecuting(false);
          if (message.deliverables) {
            setDeliverables(message.deliverables);
          }
          if (message.executionId) {
            setLastExecutionId(message.executionId);
          }
          break;
        case 'taskStatusUpdate':
          handleTaskStatusUpdate(message.taskId, message.status);
          break;
        case 'planGenerated':
          handlePlanGenerated(message.plan);
          setIsGenerating(false);
          break;
        case 'planGenerationFailed':
          setIsGenerating(false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Send ready message to extension host after listener is set up
    console.log('📤 Sending ready message to extension host');
    vscode.postMessage({ command: 'ready' });
    
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleTaskStatusUpdate = (taskId: string, status: Task['executionStatus']) => {
    console.log(`🔄 Task status update: ${taskId} → ${status}`);
    setTasks(tasks => 
      tasks.map(t => {
        if (t.id === taskId) {
          console.log(`  ✓ Updated task ${t.title} to ${status}`);
          return { ...t, executionStatus: status };
        }
        return t;
      })
    );
  };

  const handlePlanGenerated = (plan: any) => {
    if (!plan || !plan.tasks || !Array.isArray(plan.tasks)) {
      console.error('Invalid plan structure:', plan);
      return;
    }

    // Convert plan tasks to Studio tasks with ALL required fields from PM agent
    const newTasks: Task[] = plan.tasks.map((planTask: any, index: number) => ({
      // Required fields (from TaskDefinition contract)
      id: planTask.id || `task-${Date.now()}-${index}`,
      title: planTask.title || `Task ${index + 1}`,
      agentRoleDescription: planTask.agentRoleDescription || 'Worker Agent',
      recommendedModel: planTask.recommendedModel || 'gpt-4.1',
      prompt: planTask.prompt || 'Enter task instructions here',
      dependencies: planTask.dependencies || [],
      estimatedDuration: planTask.estimatedDuration || '30 min',
      
      // QC fields (required for backend)
      qcRole: planTask.qcRole || '',
      verificationCriteria: Array.isArray(planTask.verificationCriteria) 
        ? planTask.verificationCriteria 
        : (planTask.verificationCriteria ? [planTask.verificationCriteria] : []),
      
      // Optional fields
      parallelGroup: typeof planTask.parallelGroup === 'number' ? planTask.parallelGroup : 0,
      maxRetries: planTask.maxRetries || 2,
      estimatedToolCalls: planTask.estimatedToolCalls || 10,
      
      // UI-only fields
      workerAgent: {
        id: `worker-${Date.now()}-${index}`,
        name: 'Worker Agent',
        role: planTask.agentRoleDescription || 'Implementation',
        type: 'worker' as const,
        preamble: planTask.workerPreambleId
      },
      qcAgent: {
        id: `qc-${Date.now()}-${index}`,
        name: 'QC Agent',
        role: planTask.qcRole || 'Quality Check',
        type: 'qc' as const,
        preamble: planTask.qcPreambleId
      },
      executionStatus: 'pending'
    }));

    console.log(`✅ Generated ${newTasks.length} tasks from PM agent`);
    setTasks(newTasks);
  };

  const handleGeneratePlan = () => {
    if (!projectPrompt.trim()) {
      vscode.postMessage({
        command: 'error',
        error: 'Please enter a project prompt'
      });
      return;
    }

    setIsGenerating(true);
    vscode.postMessage({
      command: 'generatePlan',
      prompt: projectPrompt
    });
  };

  const handleCreateTask = (agent: Agent) => {
    // Only Worker and QC agents can create tasks
    if (agent.type === 'pm') {
      vscode.postMessage({
        command: 'error',
        error: 'PM agents cannot be added to tasks. Drop Worker or QC agents instead.'
      });
      return;
    }

    const newTask: Task = {
      // Required fields (matching TaskDefinition contract)
      id: `task-${Date.now()}`,
      title: `${agent.name} Task`,
      agentRoleDescription: agent.type === 'worker' ? agent.role : 'Specify worker agent role',
      recommendedModel: 'gpt-4.1',
      prompt: `# Task Instructions

## Objective
Describe what needs to be accomplished.

## Steps
1. Step 1
2. Step 2
3. Step 3

## Expected Output
Describe the expected deliverables.

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2`,
      dependencies: [],
      estimatedDuration: '30 min',
      
      // QC fields (required for backend)
      qcRole: agent.type === 'qc' ? agent.role : 'Specify QC agent role',
      verificationCriteria: ['Check 1', 'Check 2', 'Check 3'],
      
      // Optional fields
      parallelGroup: 0,
      maxRetries: 2,
      estimatedToolCalls: 10,
      
      // UI-only fields
      workerAgent: agent.type === 'worker' ? agent : undefined,
      qcAgent: agent.type === 'qc' ? agent : undefined,
      executionStatus: 'pending'
    };
    setTasks([...tasks, newTask]);
    console.log(`✅ Created task from ${agent.type} agent with all required fields`);
  };

  const handleAddEmptyTask = () => {
    const newTask: Task = {
      // Required fields (matching TaskDefinition contract)
      id: `task-${Date.now()}`,
      title: 'New Task',
      agentRoleDescription: 'Specify worker agent role (e.g., Python developer, DevOps engineer)',
      recommendedModel: 'gpt-4.1',
      prompt: `# Task Instructions

## Objective
Describe what needs to be accomplished.

## Steps
1. Step 1
2. Step 2
3. Step 3

## Expected Output
Describe the expected deliverables.

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2`,
      dependencies: [],
      estimatedDuration: '30 min',
      
      // QC fields (required for backend)
      qcRole: 'Specify QC agent role (e.g., Senior developer reviewing code quality)',
      verificationCriteria: ['Check 1', 'Check 2', 'Check 3'],
      
      // Optional fields
      parallelGroup: 0,
      maxRetries: 2,
      estimatedToolCalls: 10,
      
      // UI-only fields
      workerAgent: undefined,
      qcAgent: undefined,
      executionStatus: 'pending'
    };
    setTasks([...tasks, newTask]);
    console.log('✅ Created new empty task with all required fields');
  };

  const handleAddAgentToTask = (taskId: string, agent: Agent) => {
    console.log(`📥 Adding ${agent.type} agent to task ${taskId}`);
    
    setTasks(tasks => {
      const updatedTasks = tasks.map(t => {
        if (t.id !== taskId) return t;
        
        if (agent.type === 'worker') {
          console.log(`✅ Setting worker agent for task ${taskId}`);
          return { 
            ...t, 
            workerAgent: agent,
            agentRoleDescription: agent.role || t.agentRoleDescription
          };
        } else if (agent.type === 'qc') {
          console.log(`✅ Setting QC agent for task ${taskId}`);
          return { 
            ...t, 
            qcAgent: agent,
            qcRole: agent.role // Backend requires qcRole to be populated
          };
        }
        return t;
      });
      
      console.log('Updated tasks:', updatedTasks);
      return updatedTasks;
    });
  };

  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    setTasks(tasks => 
      tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
    );
  };

  const handleUpdateAgent = (taskId: string, agentType: 'worker' | 'qc', updates: Partial<Agent>) => {
    setTasks(tasks =>
      tasks.map(t => {
        if (t.id !== taskId) return t;
        const key = agentType === 'worker' ? 'workerAgent' : 'qcAgent';
        return {
          ...t,
          [key]: t[key] ? { ...t[key], ...updates } : undefined
        };
      })
    );
  };

  const handleRemoveTask = (taskId: string) => {
    setTasks(tasks => tasks.filter(t => t.id !== taskId));
  };

  const handleRemoveAgent = (taskId: string, agentType: 'worker' | 'qc') => {
    setTasks(tasks =>
      tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          [agentType === 'worker' ? 'workerAgent' : 'qcAgent']: undefined
        };
      })
    );
  };

  // Convert tasks to backend format (verificationCriteria: string[] → string)
  const tasksToBackendFormat = (tasks: Task[]) => {
    return tasks.map(task => ({
      ...task,
      verificationCriteria: Array.isArray(task.verificationCriteria) 
        ? task.verificationCriteria.join('\n')
        : (task.verificationCriteria || '')
    }));
  };

  const handleSaveWorkflow = () => {
    vscode.postMessage({
      command: 'saveWorkflow',
      workflow: { tasks: tasksToBackendFormat(tasks) }
    });
  };

  const handleImportWorkflow = () => {
    vscode.postMessage({
      command: 'importWorkflow'
    });
  };

  const handleDownloadDeliverables = () => {
    if (lastExecutionId && deliverables.length > 0) {
      vscode.postMessage({
        command: 'downloadDeliverables',
        executionId: lastExecutionId,
        deliverables
      });
    }
  };

  const handleExecuteWorkflow = () => {
    if (tasks.length === 0) {
      vscode.postMessage({
        command: 'error',
        error: 'Please add at least one task to the workflow'
      });
      return;
    }

    setIsExecuting(true);
    vscode.postMessage({
      command: 'executeWorkflow',
      workflow: { tasks: tasksToBackendFormat(tasks) }
    });
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>🎨 Mimir Studio</h1>
        <p style={{ margin: '10px 0 0 0', opacity: 0.7 }}>Generate workflows with PM Agent or drag-and-drop manually</p>
      </div>

      {/* PM Agent Prompt Input */}
      <div style={{
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: 'var(--vscode-input-background)',
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>✨ Project Goal & Requirements</span>
        </div>
        <textarea
          value={projectPrompt}
          onChange={(e) => setProjectPrompt(e.target.value)}
          placeholder="Describe your project goal, requirements, and constraints. The PM agent will decompose this into executable tasks..."
          disabled={isGenerating || isExecuting}
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '8px',
            backgroundColor: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            borderRadius: '4px',
            fontSize: '13px',
            fontFamily: 'var(--vscode-font-family)',
            resize: 'vertical',
            marginBottom: '8px'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>
            💡 Tip: Be specific about deliverables, constraints, and success criteria
          </div>
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={isGenerating || isExecuting || !projectPrompt.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: isGenerating 
                ? 'var(--vscode-button-secondaryBackground)' 
                : '#fbbf24',
              color: isGenerating ? 'var(--vscode-button-secondaryForeground)' : '#1f2937',
              border: 'none',
              borderRadius: '4px',
              cursor: (!projectPrompt.trim() || isGenerating || isExecuting) ? 'not-allowed' : 'pointer',
              opacity: (!projectPrompt.trim() || isGenerating || isExecuting) ? 0.5 : 1,
              fontWeight: 'bold',
              fontSize: '13px'
            }}
          >
            {isGenerating ? '⏳ Generating...' : '✨ Generate with PM Agent'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* Agent Palette */}
        <div style={{
          width: '250px',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '8px',
          padding: '16px',
          overflowY: 'auto'
        }}>
          <AgentPalette preambles={preambles} isExecuting={isExecuting} />
        </div>

        {/* Task Canvas */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <TaskCanvas
            tasks={tasks}
            preambles={preambles}
            isExecuting={isExecuting}
            onCreateTask={handleCreateTask}
            onAddEmptyTask={handleAddEmptyTask}
            onAddAgentToTask={handleAddAgentToTask}
            onUpdateTask={handleUpdateTask}
            onUpdateAgent={handleUpdateAgent}
            onRemoveTask={handleRemoveTask}
            onRemoveAgent={handleRemoveAgent}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={handleExecuteWorkflow}
          disabled={isExecuting || tasks.length === 0}
          style={{
            padding: '8px 16px',
            backgroundColor: isExecuting 
              ? 'var(--vscode-button-secondaryBackground)' 
              : 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: '4px',
            cursor: tasks.length === 0 ? 'not-allowed' : 'pointer',
            opacity: tasks.length === 0 ? 0.5 : 1,
            fontWeight: 'bold'
          }}
        >
          {isExecuting ? '⏳ Executing...' : '▶️ Execute Workflow'}
        </button>
        
        <button
          type="button"
          onClick={handleSaveWorkflow}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          💾 Save ({tasks.length} tasks)
        </button>
        
        <button
          type="button"
          onClick={handleImportWorkflow}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--vscode-button-secondaryBackground)',
            color: 'var(--vscode-button-secondaryForeground)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          📁 Import
        </button>
        
        <button
          type="button"
          onClick={handleDownloadDeliverables}
          disabled={deliverables.length === 0}
          style={{
            padding: '8px 16px',
            backgroundColor: deliverables.length === 0 
              ? 'var(--vscode-button-secondaryBackground)'
              : 'var(--vscode-button-background)',
            color: deliverables.length === 0
              ? 'var(--vscode-button-secondaryForeground)'
              : 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: '4px',
            cursor: deliverables.length === 0 ? 'not-allowed' : 'pointer',
            opacity: deliverables.length === 0 ? 0.5 : 1
          }}
          title={deliverables.length > 0 
            ? `Download ${deliverables.length} deliverable${deliverables.length !== 1 ? 's' : ''}` 
            : 'No deliverables available'}
        >
          📥 Download Deliverables ({deliverables.length})
        </button>
      </div>
    </div>
  );
}

/**
 * Agent palette - draggable agent templates from Neo4j
 */
function AgentPalette({ preambles, isExecuting }: { preambles: Preamble[]; isExecuting: boolean }) {
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [roleDescription, setRoleDescription] = useState('');
  const [agentType, setAgentType] = useState<'worker' | 'qc'>('worker');
  const [useAgentinator, setUseAgentinator] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Convert preambles to Agent format, grouped by type (use agentType from API)
  const workerAgents: Agent[] = preambles
    .filter(p => p.agentType === 'worker')
    .map(p => ({
      id: p.name,
      name: p.title || p.name,
      role: p.description || 'Worker Agent',
      type: 'worker' as const,
      preamble: p.name
    }));

  const qcAgents: Agent[] = preambles
    .filter(p => p.agentType === 'qc')
    .map(p => ({
      id: p.name,
      name: p.title || p.name,
      role: p.description || 'QC Agent',
      type: 'qc' as const,
      preamble: p.name
    }));

  const handleCreateAgent = async () => {
    if (!roleDescription.trim()) return;

    setIsCreating(true);
    try {
      // Call backend to create agent via agentinator
      vscode.postMessage({
        command: 'createAgent',
        roleDescription: roleDescription.trim(),
        agentType,
        useAgentinator
      });

      // Reset form
      setRoleDescription('');
      setAgentType('worker');
      setUseAgentinator(true);
      setIsCreatingAgent(false);
    } catch (error) {
      console.error('Failed to create agent:', error);
    } finally {
      setIsCreating(false);
    }
  };

  // If creating agent, show creation form
  if (isCreatingAgent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Create New Agent</div>
            <button
              type="button"
              onClick={() => setIsCreatingAgent(false)}
              style={{
                padding: '4px 8px',
                backgroundColor: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                border: '1px solid var(--vscode-button-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label htmlFor="roleDescription" style={{ fontSize: '12px', fontWeight: 'bold' }}>Role Description</label>
          <textarea
            id="roleDescription"
            value={roleDescription}
            onChange={(e) => setRoleDescription(e.target.value)}
            placeholder="e.g., DevOps engineer specializing in Kubernetes deployment"
            style={{
              padding: '8px',
              backgroundColor: 'var(--vscode-input-background)',
              border: '1px solid var(--vscode-input-border)',
              borderRadius: '4px',
              color: 'var(--vscode-input-foreground)',
              fontSize: '12px',
              resize: 'vertical',
              minHeight: '80px'
            }}
          />
          <div style={{ fontSize: '11px', opacity: 0.7 }}>
            Describe the role, expertise, and responsibilities
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Agent Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="radio"
                value="worker"
                checked={agentType === 'worker'}
                onChange={(e) => setAgentType(e.target.value as 'worker')}
                style={{ marginRight: '8px' }}
              />
              Worker (Task Executor)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="radio"
                value="qc"
                checked={agentType === 'qc'}
                onChange={(e) => setAgentType(e.target.value as 'qc')}
                style={{ marginRight: '8px' }}
              />
              QC (Quality Control)
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="useAgentinator"
            checked={useAgentinator}
            onChange={(e) => setUseAgentinator(e.target.checked)}
          />
          <label htmlFor="useAgentinator" style={{ fontSize: '12px', cursor: 'pointer' }}>
            ✨ Generate full preamble with Agentinator
          </label>
        </div>

        <button
          type="button"
          onClick={handleCreateAgent}
          disabled={isCreating || !roleDescription.trim()}
          style={{
            padding: '8px 16px',
            backgroundColor: isCreating || !roleDescription.trim()
              ? 'var(--vscode-button-secondaryBackground)'
              : 'var(--vscode-button-background)',
            color: isCreating || !roleDescription.trim()
              ? 'var(--vscode-button-secondaryForeground)'
              : 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: '4px',
            cursor: isCreating || !roleDescription.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '12px'
          }}
        >
          {isCreating ? '⏳ Creating...' : '✨ Create Agent'}
        </button>
      </div>
    );
  }

  // Normal agent library view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '16px', margin: 0 }}>Agents</h2>
        <button
          type="button"
          onClick={() => setIsCreatingAgent(true)}
          disabled={isExecuting}
          style={{
            padding: '4px 8px',
            backgroundColor: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: '4px',
            cursor: isExecuting ? 'not-allowed' : 'pointer',
            opacity: isExecuting ? 0.5 : 1,
            fontSize: '14px',
            fontWeight: 'bold'
          }}
          title="Create new agent"
        >
          +
        </button>
      </div>
      <div style={{ fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>
        {preambles.length === 0 ? 'Loading agents...' : isExecuting ? 'Executing workflow...' : `${preambles.length} agent(s) available. Drag to canvas:`}
      </div>

      {/* Worker Agents Section */}
      {workerAgents.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#60a5fa' }}>
            👷 WORKER AGENTS ({workerAgents.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {workerAgents.map(agent => (
              <DraggableAgent key={agent.id} agent={agent} isExecuting={isExecuting} />
            ))}
          </div>
        </div>
      )}

      {/* QC Agents Section */}
      {qcAgents.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#60a5fa' }}>
            🛡️ QC AGENTS ({qcAgents.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {qcAgents.map(agent => (
              <DraggableAgent key={agent.id} agent={agent} isExecuting={isExecuting} />
            ))}
          </div>
        </div>
      )}

      {preambles.length === 0 && (
        <div style={{ fontSize: '12px', opacity: 0.5, fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
          No agents found in database.
          Generate agents first.
        </div>
      )}
    </div>
  );
}

/**
 * Draggable agent card
 */
function DraggableAgent({ agent, isExecuting }: { agent: Agent; isExecuting: boolean }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'AGENT',
    item: agent,
    canDrag: !isExecuting,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [agent, isExecuting]);

  return (
    <div
      ref={drag}
      style={{
        padding: '12px',
        backgroundColor: 'var(--vscode-list-inactiveSelectionBackground)',
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: '6px',
        cursor: isExecuting ? 'not-allowed' : 'grab',
        opacity: isDragging ? 0.5 : isExecuting ? 0.6 : 1,
      }}
    >
      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{agent.name}</div>
      <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px' }}>{agent.role}</div>
    </div>
  );
}

/**
 * Task canvas - drop zone for creating tasks and managing workflow
 */
function TaskCanvas({ tasks, preambles, isExecuting, onCreateTask, onAddEmptyTask, onAddAgentToTask, onUpdateTask, onUpdateAgent, onRemoveTask, onRemoveAgent }: {
  tasks: Task[];
  preambles: Preamble[];
  isExecuting: boolean;
  onCreateTask: (agent: Agent) => void;
  onAddEmptyTask: () => void;
  onAddAgentToTask: (taskId: string, agent: Agent) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onUpdateAgent: (taskId: string, agentType: 'worker' | 'qc', updates: Partial<Agent>) => void;
  onRemoveTask: (taskId: string) => void;
  onRemoveAgent: (taskId: string, agentType: 'worker' | 'qc') => void;
}) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'AGENT',
    drop: (agent: Agent, monitor) => {
      // Don't create new task if already handled by a task card
      const didDrop = monitor.didDrop();
      if (didDrop) {
        return; // A task card already handled this drop
      }
      
      onCreateTask(agent);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
    }),
  }));

  return (
    <div
      ref={drop}
      style={{
        height: '100%',
        border: '2px dashed var(--vscode-panel-border)',
        borderRadius: '8px',
        padding: '20px',
        backgroundColor: isOver
          ? 'var(--vscode-list-hoverBackground)'
          : 'var(--vscode-editor-background)',
        transition: 'background-color 0.2s',
        overflowY: 'auto',
      }}
    >
      {/* Header with Add Task button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '16px', margin: 0 }}>Execution Plan</h2>
          <p style={{ opacity: 0.7, margin: '4px 0 0 0' }}>
            {tasks.length === 0 
              ? '👆 Drag agents here or click + to create tasks' 
              : `${tasks.length} task(s) configured`}
          </p>
        </div>
        
        <button
          type="button"
          onClick={onAddEmptyTask}
          disabled={isExecuting}
          title="Add empty task"
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: '4px',
            cursor: isExecuting ? 'not-allowed' : 'pointer',
            opacity: isExecuting ? 0.5 : 1,
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          ➕ Add Task
        </button>
      </div>

      {/* Tasks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {tasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            index={index}
            preambles={preambles}
            isExecuting={isExecuting}
            onAddAgent={onAddAgentToTask}
            onUpdateTask={onUpdateTask}
            onUpdateAgent={onUpdateAgent}
            onRemoveTask={onRemoveTask}
            onRemoveAgent={onRemoveAgent}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Task card - contains Worker and QC agents with configuration
 */
function TaskCard({ task, index, preambles, isExecuting, onAddAgent, onUpdateTask, onUpdateAgent, onRemoveTask, onRemoveAgent }: {
  task: Task;
  index: number;
  preambles: Preamble[];
  isExecuting: boolean;
  onAddAgent: (taskId: string, agent: Agent) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onUpdateAgent: (taskId: string, agentType: 'worker' | 'qc', updates: Partial<Agent>) => void;
  onRemoveTask: (taskId: string) => void;
  onRemoveAgent: (taskId: string, agentType: 'worker' | 'qc') => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTask, setEditedTask] = useState<Task>(task);

  // Reset edited task when task changes or when exiting edit mode
  useEffect(() => {
    if (!isEditing) {
      setEditedTask(task);
    }
  }, [task, isEditing]);

  const handleSaveEdit = () => {
    onUpdateTask(task.id, editedTask);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedTask(task);
    setIsEditing(false);
  };

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'AGENT',
    drop: (agent: Agent, monitor) => {
      // Only handle if dropped directly on this task (not on canvas)
      const didDrop = monitor.didDrop();
      if (didDrop) {
        return; // Already handled by a nested drop target
      }
      
      onAddAgent(task.id, agent);
      return { handled: true }; // Signal that we handled this drop
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }));

  // Get execution status styling
  const getBorderStyle = () => {
    switch (task.executionStatus) {
      case 'executing':
        return '3px solid #FFD700'; // valhalla gold
      case 'completed':
        return '3px solid #22c55e'; // vibrant green
      case 'failed':
        return '3px solid #ef4444'; // red
      default:
        return '2px solid var(--vscode-panel-border)';
    }
  };

  const getShadowStyle = () => {
    if (task.executionStatus === 'executing') {
      return '0 0 25px rgba(255, 215, 0, 0.6)'; // valhalla gold glow
    }
    if (task.executionStatus === 'completed') {
      return '0 0 20px rgba(34, 197, 94, 0.4)'; // vibrant green glow
    }
    if (task.executionStatus === 'failed') {
      return '0 0 20px rgba(239, 68, 68, 0.4)'; // red glow
    }
    return 'none';
  };

  return (
    <div
      ref={drop}
      className={task.executionStatus === 'executing' ? 'task-executing' : ''}
      style={{
        padding: '16px',
        backgroundColor: isOver 
          ? 'var(--vscode-list-hoverBackground)'
          : 'var(--vscode-list-activeSelectionBackground)',
        border: getBorderStyle(),
        borderRadius: '8px',
        boxShadow: task.executionStatus === 'executing' ? undefined : getShadowStyle(), // Let animation handle executing state
        minHeight: '200px',
        maxHeight: isEditing ? '600px' : 'none',
        overflowY: isEditing ? 'auto' : 'visible',
      }}
    >
      {isEditing ? (
        /* EDIT MODE - Full Task Editor */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header with Save/Cancel buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>✏️ Edit Task</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleSaveEdit}
                style={{
                  padding: '4px 12px',
                  backgroundColor: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                ✓ Save
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                style={{
                  padding: '4px 12px',
                  backgroundColor: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                ✕ Cancel
              </button>
            </div>
          </div>

          {/* Task Title */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Task Title *
            </label>
            <input
              type="text"
              value={editedTask.title}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Task Prompt */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Task Prompt / Instructions *
            </label>
            <textarea
              value={editedTask.prompt || ''}
              onChange={(e) => setEditedTask({ ...editedTask, prompt: e.target.value })}
              placeholder="Detailed instructions for what the agent should do..."
              rows={4}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '13px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
                resize: 'vertical',
                fontFamily: 'var(--vscode-font-family)',
              }}
            />
          </div>

          {/* Agent Role Description */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Worker Agent Role Description
            </label>
            <input
              type="text"
              value={editedTask.agentRoleDescription || ''}
              onChange={(e) => setEditedTask({ ...editedTask, agentRoleDescription: e.target.value })}
              placeholder="e.g., Senior DevOps Engineer with Kubernetes expertise"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* QC Agent Role Description */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              QC Agent Role Description
            </label>
            <input
              type="text"
              value={editedTask.qcRole || ''}
              onChange={(e) => setEditedTask({ ...editedTask, qcRole: e.target.value })}
              placeholder="e.g., Senior QA Engineer with automated testing expertise"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Verification Criteria */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Verification Criteria (for QC agent)
            </label>
            <textarea
              value={editedTask.verificationCriteria?.join('\n') || ''}
              onChange={(e) => setEditedTask({ ...editedTask, verificationCriteria: e.target.value.split('\n').filter(v => v.trim()) })}
              placeholder="One verification criterion per line:&#10;Code review passed&#10;Security scan clean&#10;Performance benchmarks met"
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '13px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
                resize: 'vertical',
                fontFamily: 'var(--vscode-font-family)',
              }}
            />
          </div>

          {/* Recommended Model */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Recommended Model
            </label>
            <input
              type="text"
              value={editedTask.recommendedModel || ''}
              onChange={(e) => setEditedTask({ ...editedTask, recommendedModel: e.target.value })}
              placeholder="e.g., gpt-4o, claude-3-opus"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Max Retries */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Max Retries
            </label>
            <input
              type="number"
              min="0"
              max="10"
              value={editedTask.maxRetries ?? 2}
              onChange={(e) => setEditedTask({ ...editedTask, maxRetries: parseInt(e.target.value) || 0 })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Parallel Group */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Parallel Group (0 = sequential)
            </label>
            <input
              type="number"
              min="0"
              value={editedTask.parallelGroup}
              onChange={(e) => setEditedTask({ ...editedTask, parallelGroup: parseInt(e.target.value) || 0 })}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Estimated Duration */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Estimated Duration (e.g., "2h", "30m")
            </label>
            <input
              type="text"
              value={editedTask.estimatedDuration || ''}
              onChange={(e) => setEditedTask({ ...editedTask, estimatedDuration: e.target.value })}
              placeholder="e.g., 2h, 30m, 1d"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Estimated Tool Calls */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Estimated Tool Calls
            </label>
            <input
              type="number"
              min="0"
              value={editedTask.estimatedToolCalls || ''}
              onChange={(e) => setEditedTask({ ...editedTask, estimatedToolCalls: parseInt(e.target.value) || undefined })}
              placeholder="0"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Dependencies */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              Dependencies (comma-separated task IDs)
            </label>
            <input
              type="text"
              value={editedTask.dependencies.join(', ')}
              onChange={(e) => setEditedTask({
                ...editedTask,
                dependencies: e.target.value.split(',').map(d => d.trim()).filter(d => d)
              })}
              placeholder="task-1, task-2"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            />
          </div>

          {/* Worker Agent Preamble */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              👷 Worker Agent Preamble
            </label>
            <select
              value={editedTask.workerAgent?.preamble || ''}
              onChange={(e) => {
                const selectedPreamble = preambles.find(p => p.name === e.target.value);
                if (selectedPreamble) {
                  setEditedTask({
                    ...editedTask,
                    workerAgent: {
                      id: selectedPreamble.name,
                      name: selectedPreamble.title,
                      role: selectedPreamble.description || '',
                      type: 'worker',
                      preamble: selectedPreamble.name
                    }
                  });
                } else {
                  setEditedTask({ ...editedTask, workerAgent: undefined });
                }
              }}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            >
              <option value="">-- No Worker Agent --</option>
              {preambles.filter(p => p.agentType === 'worker').map(p => (
                <option key={p.name} value={p.name}>
                  {p.title || p.name}
                </option>
              ))}
            </select>
          </div>

          {/* QC Agent Preamble */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', opacity: 0.8 }}>
              🛡️ QC Agent Preamble
            </label>
            <select
              value={editedTask.qcAgent?.preamble || ''}
              onChange={(e) => {
                const selectedPreamble = preambles.find(p => p.name === e.target.value);
                if (selectedPreamble) {
                  setEditedTask({
                    ...editedTask,
                    qcAgent: {
                      id: selectedPreamble.name,
                      name: selectedPreamble.title,
                      role: selectedPreamble.description || '',
                      type: 'qc',
                      preamble: selectedPreamble.name
                    }
                  });
                } else {
                  setEditedTask({ ...editedTask, qcAgent: undefined });
                }
              }}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '4px',
              }}
            >
              <option value="">-- No QC Agent --</option>
              {preambles.filter(p => p.agentType === 'qc').map(p => (
                <option key={p.name} value={p.name}>
                  {p.title || p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        /* NORMAL MODE - Drag & Drop View */
        <>
          {/* Task Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              {/* Edit Icon Button */}
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={isExecuting}
                title="Edit task details"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: isExecuting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  opacity: isExecuting ? 0.3 : 0.7,
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--vscode-editor-foreground)',
                }}
              >
                ✏️
              </button>
              
              <input
                type="text"
                value={task.title}
                onChange={(e) => onUpdateTask(task.id, { title: e.target.value })}
                disabled={isExecuting}
                style={{
                  flex: 1,
                  fontSize: '16px',
                  fontWeight: 'bold',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--vscode-editor-foreground)',
                  outline: 'none',
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Parallel group */}
              <div style={{ fontSize: '12px', opacity: 0.7 }}>
                Group:
                <input
                  type="number"
                  min="0"
                  value={task.parallelGroup}
                  onChange={(e) => onUpdateTask(task.id, { parallelGroup: parseInt(e.target.value) || 0 })}
                  disabled={isExecuting}
                  style={{
                    width: '50px',
                    marginLeft: '4px',
                    padding: '2px 4px',
                    backgroundColor: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: '1px solid var(--vscode-input-border)',
                    borderRadius: '4px',
                  }}
                />
              </div>
              
              <button
                type="button"
                onClick={() => onRemoveTask(task.id)}
                disabled={isExecuting}
                style={{
                  backgroundColor: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  cursor: isExecuting ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  opacity: isExecuting ? 0.5 : 1,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Worker Agent Section */}
          <AgentSection
            title="👷 WORKER AGENT"
            agent={task.workerAgent}
            agentType="worker"
            taskId={task.id}
            preambles={preambles}
            isExecuting={isExecuting}
            onUpdateAgent={onUpdateAgent}
            onRemoveAgent={onRemoveAgent}
          />

          {/* QC Agent Section */}
          <AgentSection
            title="🛡️ QC AGENT"
            agent={task.qcAgent}
            agentType="qc"
            taskId={task.id}
            preambles={preambles}
            isExecuting={isExecuting}
            onUpdateAgent={onUpdateAgent}
            onRemoveAgent={onRemoveAgent}
          />
        </>
      )}
    </div>
  );
}

/**
 * Agent section within a task (Worker or QC)
 */
function AgentSection({ title, agent, agentType, taskId, preambles, isExecuting, onUpdateAgent, onRemoveAgent }: {
  title: string;
  agent?: Agent;
  agentType: 'worker' | 'qc';
  taskId: string;
  preambles: Preamble[];
  isExecuting: boolean;
  onUpdateAgent: (taskId: string, agentType: 'worker' | 'qc', updates: Partial<Agent>) => void;
  onRemoveAgent: (taskId: string, agentType: 'worker' | 'qc') => void;
}) {
  // Show empty drop zone if no agent
  if (!agent) {
    return (
      <div style={{
        marginTop: '12px',
        padding: '12px',
        backgroundColor: 'var(--vscode-editor-background)',
        border: '1px dashed var(--vscode-panel-border)',
        borderRadius: '6px',
        textAlign: 'center',
        opacity: 0.5,
      }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#60a5fa', marginBottom: '4px' }}>
          {title}
        </div>
        <div style={{ fontSize: '11px', fontStyle: 'italic' }}>
          Drop {agentType === 'worker' ? 'Worker' : 'QC'} agent here
        </div>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: '12px',
      padding: '12px',
      backgroundColor: 'var(--vscode-editor-background)',
      border: '1px solid var(--vscode-panel-border)',
      borderRadius: '6px',
    }}>
      {/* Agent header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#60a5fa' }}>
          {title}
        </div>
        <button
          type="button"
          onClick={() => onRemoveAgent(taskId, agentType)}
          disabled={isExecuting}
          style={{
            backgroundColor: 'transparent',
            color: 'var(--vscode-errorForeground)',
            border: 'none',
            cursor: isExecuting ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            opacity: isExecuting ? 0.5 : 1,
            padding: '2px 6px',
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: '14px', marginBottom: '8px' }}>
        {agent.name}
      </div>
      <div style={{ fontSize: '12px', opacity: 0.7, marginBottom: '8px' }}>
        {agent.role}
      </div>

             {/* Preamble selection */}
      <div>
        <label htmlFor={`preamble-${taskId}-${agentType}`} style={{ fontSize: '11px', opacity: 0.8, display: 'block', marginBottom: '4px' }}>
          Preamble:
        </label>
        <select
          id={`preamble-${taskId}-${agentType}`}
          value={agent.preamble || ''}
          onChange={(e) => onUpdateAgent(taskId, agentType, { preamble: e.target.value })}
          disabled={isExecuting}
          style={{
            width: '100%',
            padding: '4px 8px',
            backgroundColor: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            borderRadius: '4px',
            fontSize: '12px',
          }}
        >
          <option value="">Default ({agent.type})</option>
          {Array.isArray(preambles) && preambles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.title || p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Add CSS animation for pulse
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }
`;
document.head.appendChild(style);
