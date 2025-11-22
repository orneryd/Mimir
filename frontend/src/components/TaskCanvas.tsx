import { useState, useRef, useEffect } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { usePlanStore } from '../store/planStore';
import { Task, ParallelGroup, AgentTemplate } from '../types/task';
import { TaskCard } from './TaskCard';
import { ParallelGroupContainer } from './ParallelGroupContainer';
import { Plus, Download, Play, ListPlus, GripVertical, FileDown, XCircle } from 'lucide-react';

// Unified reorderable canvas item (task or group)
interface ReorderableItemProps {
  itemId: string;
  itemType: 'task' | 'group';
  index: number;
  onReorder: (itemId: string, itemType: 'task' | 'group', newIndex: number) => void;
  children: React.ReactNode;
}

function ReorderableItem({ itemId, itemType, index, onReorder, children }: ReorderableItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: 'canvas-item',
    item: { type: 'canvas-item', itemId, itemType, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: 'canvas-item',
    hover: (item: { itemId: string; itemType: 'task' | 'group'; index: number }, monitor) => {
      if (!ref.current) return;
      
      const dragIndex = item.index;
      const hoverIndex = index;
      
      if (dragIndex === hoverIndex) return;
      
      // Don't trigger on first hover to avoid jitter
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;
      
      // Only perform the move when the mouse has crossed half of the items height
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      
      onReorder(item.itemId, item.itemType, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      className={`transition-opacity ${
        isDragging ? 'opacity-50' : 'opacity-100'
      } ${isOver ? 'border-l-4 border-valhalla-gold pl-2' : ''}`}
    >
      <div className="flex items-stretch gap-2">
        <div className="flex items-center cursor-move text-gray-500 hover:text-valhalla-gold transition-colors pt-3">
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

export function TaskCanvas() {
  const { 
    tasks, 
    parallelGroups, 
    addTask, 
    addParallelGroup, 
    assignTaskToGroup, 
    reorderCanvasItem, 
    agentTemplates, 
    projectPlan,
    updateTaskExecutionStatus,
    setActiveExecution,
    setExecutionResults,
    isExecuting,
    activeExecutionId,
  } = usePlanStore();
  
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [completedExecutionId, setCompletedExecutionId] = useState<string | null>(null);
  const [deliverables, setDeliverables] = useState<Array<{ filename: string; size: number; mimeType: string }>>([]);
  
  // Reconnect to SSE on mount if there's an active execution
  useEffect(() => {
    if (activeExecutionId && activeExecutionId !== 'starting' && !currentExecutionId) {
      console.log('🔄 Page loaded with active execution - reconnecting to SSE:', activeExecutionId);
      setCurrentExecutionId(activeExecutionId);
    }
  }, []); // Run once on mount

  // Export JSON handler
  const handleExportJSON = () => {
    // Export only the necessary data (tasks, parallelGroups, agentTemplates)
    // Don't duplicate data that's already in projectPlan
    const exportData = {
      overview: projectPlan?.overview,
      tasks,
      parallelGroups,
      agentTemplates,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // SSE connection for real-time execution updates
  useEffect(() => {
    if (!currentExecutionId || currentExecutionId === 'starting') return;
    
    console.log(`📡 Connecting to SSE stream for execution ${currentExecutionId}`);
    const eventSource = new EventSource(`/api/execution-stream/${currentExecutionId}`);
    
    eventSource.addEventListener('init', (event) => {
      const data = JSON.parse(event.data);
      console.log('SSE init:', data);
    });
    
    eventSource.addEventListener('execution-start', (event) => {
      const data = JSON.parse(event.data);
      console.log('Execution started:', data);
      setActiveExecution(currentExecutionId, true);
    });
    
    eventSource.addEventListener('task-start', (event) => {
      const data = JSON.parse(event.data);
      console.log('🟡 Task started:', data.taskId, data);
      updateTaskExecutionStatus(data.taskId, 'executing');
      console.log('Updated task status to executing');
    });
    
    eventSource.addEventListener('task-complete', (event) => {
      const data = JSON.parse(event.data);
      console.log('🟢 Task completed:', data.taskId, data);
      updateTaskExecutionStatus(data.taskId, 'completed');
      console.log('Updated task status to completed');
    });
    
    eventSource.addEventListener('task-fail', (event) => {
      const data = JSON.parse(event.data);
      console.log('🔴 Task failed:', data.taskId, data);
      updateTaskExecutionStatus(data.taskId, 'failed');
      console.log('Updated task status to failed');
    });
    
    eventSource.addEventListener('agent-chatter', (event) => {
      const data = JSON.parse(event.data);
      console.group(`💬 Agent Chatter: ${data.taskTitle} (${data.taskId})`);
      if (data.preamble) {
        console.log(`📋 Preamble (truncated):\n${data.preamble}`);
      }
      if (data.output) {
        console.log(`📤 Output (truncated):\n${data.output}`);
      }
      if (data.tokens) {
        console.log(`🎫 Tokens: ${data.tokens.input} in, ${data.tokens.output} out`);
      }
      if (data.toolCalls) {
        console.log(`🔧 Tool Calls: ${data.toolCalls}`);
      }
      console.groupEnd();
    });
    
    eventSource.addEventListener('execution-complete', (event) => {
      const data = JSON.parse(event.data);
      console.log('✅ Execution complete:', data);
      setActiveExecution(null, false);
      setExecutionResults(currentExecutionId, data);
      setDeliverables(data.deliverables || []);
      setCompletedExecutionId(currentExecutionId); // Store for deliverable downloads
      setCurrentExecutionId(null);
      
      // Clear execution state from sessionStorage (keep workflow state)
      sessionStorage.removeItem('mimir-execution-state');
      console.log('🗑️ Cleared execution state from sessionStorage');
      
      eventSource.close();
    });
    
    eventSource.addEventListener('execution-cancelled', (event) => {
      const data = JSON.parse(event.data);
      console.log('⛔ Execution cancelled:', data);
      setActiveExecution(null, false);
      setExecutionResults(currentExecutionId, data);
      setCurrentExecutionId(null);
      
      // Clear execution state from sessionStorage
      sessionStorage.removeItem('mimir-execution-state');
      console.log('🗑️ Cleared execution state from sessionStorage');
      
      alert('Workflow execution was cancelled.');
      eventSource.close();
    });
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
      setActiveExecution(null, false);
    };
    
    return () => {
      eventSource.close();
    };
  }, [currentExecutionId, updateTaskExecutionStatus, setActiveExecution, setExecutionResults]);

  // Execute workflow handler
  const handleExecuteWorkflow = async () => {
    // Prevent multiple executions
    if (isExecuting) {
      console.warn('⚠️ Execution already in progress - ignoring duplicate click');
      return;
    }
    
          // Clear previous deliverables when starting new execution
      setDeliverables([]);
      setCompletedExecutionId(null);
      console.log('🗑️ Cleared previous deliverables cache');
    
    // Initialize ALL tasks to 'pending' status
    console.log('🔄 Initializing all tasks to pending status');
    console.log('Tasks to initialize:', tasks.map(t => ({ id: t.id, title: t.title })));
    tasks.forEach(task => {
      updateTaskExecutionStatus(task.id, 'pending');
    });
    
    // IMMEDIATELY lock the UI before making the API call
    setActiveExecution('starting', true);
    
    try {
      const workflowData = {
        tasks,
        parallelGroups,
        agentTemplates,
        projectPlan,
      };

      const response = await fetch('/api/execute-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send HTTP-only cookie
        body: JSON.stringify(workflowData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Workflow execution failed');
      }

      const result = await response.json();
      console.log('✅ Workflow execution started:', result);
      
      // Connect to SSE stream with actual execution ID
      setCurrentExecutionId(result.executionId);
      setActiveExecution(result.executionId, true);
    } catch (error: any) {
      console.error('❌ Failed to execute workflow:', error);
      alert(`Failed to execute workflow: ${error.message}`);
      // Unlock UI on error
      setActiveExecution(null, false);
      setCurrentExecutionId(null);
    }
  };
  
  // Download deliverables handler (as zip archive)
  const handleDownloadDeliverables = async () => {
    if (deliverables.length === 0) return;
    
    const execId = completedExecutionId || currentExecutionId;
    if (!execId) return;
    
    try {
      // Fetch the zip archive
      const response = await fetch(`/api/deliverables/${execId}/download`, {
        credentials: 'include' // Send HTTP-only cookie
      });
      if (!response.ok) {
        throw new Error('Failed to download deliverables archive');
      }
      
      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `execution-${execId}-deliverables.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the object URL
      URL.revokeObjectURL(url);
      
      console.log(`✅ Downloaded deliverables archive with ${deliverables.length} files`);
    } catch (error: any) {
      console.error('❌ Failed to download deliverables archive:', error);
      alert(`Failed to download deliverables: ${error.message}`);
    }
  };
  
  // Cancel execution handler
  const handleCancelExecution = async () => {
    if (!currentExecutionId || currentExecutionId === 'starting') {
      return;
    }
    
    const confirmed = window.confirm('Are you sure you want to cancel the running workflow? This cannot be undone.');
    if (!confirmed) return;
    
    try {
      console.log('⛔ Requesting cancellation for execution:', currentExecutionId);
      
      const response = await fetch(`/api/cancel-execution/${currentExecutionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send HTTP-only cookie
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel execution');
      }
      
      const result = await response.json();
      console.log('✅ Cancellation requested:', result);
    } catch (error: any) {
      console.error('❌ Failed to cancel execution:', error);
      alert(`Failed to cancel execution: ${error.message}`);
    }
  };

  // Helper function to extract task number from ID as fallback (e.g., "task-0" -> 0)
  const getTaskNumber = (taskId: string): number => {
    const match = taskId.match(/task-(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  };

  // Create unified canvas items (tasks and parallel groups interleaved)
  type CanvasItem = 
    | { type: 'task'; task: Task; order: number }
    | { type: 'group'; group: ParallelGroup; order: number };

  const canvasItems: CanvasItem[] = [];

  // Add ungrouped tasks (use order property, fallback to task number)
  tasks
    .filter((t) => t.parallelGroup === null)
    .forEach((task) => {
      canvasItems.push({
        type: 'task',
        task,
        order: task.order ?? getTaskNumber(task.id),
      });
    });

  // Add parallel groups (order based on minimum order of tasks in the group)
  parallelGroups.forEach((group) => {
    const groupTasks = tasks.filter((t) => t.parallelGroup === group.id);
    const minOrder = Math.min(
      ...groupTasks.map((t) => t.order ?? getTaskNumber(t.id)),
      Infinity
    );
    canvasItems.push({
      type: 'group',
      group,
      order: minOrder,
    });
  });

  // Sort by order property
  canvasItems.sort((a, b) => a.order - b.order);
  
  const handleCreateTask = () => {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: 'New Task',
      agentRoleDescription: '',
      recommendedModel: 'gpt-4.1',
      prompt: '',
      successCriteria: [],
      dependencies: [],
      estimatedDuration: '30 minutes',
      estimatedToolCalls: 20,
      parallelGroup: null,
      qcRole: '',
      verificationCriteria: [],
      maxRetries: 3,
    };
    addTask(newTask);
  };
  
  // Drop zone for agents (to create tasks) and tasks (to ungroup them)
  const [{ isOverAgent, isOverTask }, drop] = useDrop(() => ({
    accept: ['agent', 'task'],
    drop: (item: AgentTemplate | Task, monitor) => {
      // Only handle drop if it's directly on this zone (not a child zone)
      if (monitor.didDrop()) {
        return; // Already handled by a nested drop zone
      }
      
      const itemType = monitor.getItemType();
      
      if (itemType === 'agent') {
        // Agent dropped - create new task
        const agent = item as AgentTemplate;
        const newTask: Task = {
          id: `task-${Date.now()}`,
          title: `New ${agent.name} Task`,
          agentRoleDescription: agent.agentType === 'worker' ? agent.role : '',
          workerPreambleId: agent.agentType === 'worker' ? agent.id : undefined,
          recommendedModel: 'gpt-4.1',
          prompt: '',
          successCriteria: [],
          dependencies: [],
          estimatedDuration: '30 minutes',
          estimatedToolCalls: 20,
          parallelGroup: null,
          qcRole: agent.agentType === 'qc' ? agent.role : '',
          qcPreambleId: agent.agentType === 'qc' ? agent.id : undefined,
          verificationCriteria: [],
          maxRetries: 3,
        };
        addTask(newTask);
      } else if (itemType === 'task') {
        // Task dropped - ungroup it (move to canvas)
        const task = item as Task;
        if (task.parallelGroup !== null) {
          assignTaskToGroup(task.id, null);
        }
      }
    },
    collect: (monitor) => ({
      isOverAgent: monitor.isOver({ shallow: true }) && monitor.getItemType() === 'agent',
      isOverTask: monitor.isOver({ shallow: true }) && monitor.getItemType() === 'task',
    }),
  }));

  return (
    <div 
      ref={drop}
      className={`p-6 space-y-6 min-h-full transition-colors ${
        isOverAgent || isOverTask ? 'bg-norse-stone' : 'bg-norse-night'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-valhalla-gold">Task Canvas</h2>
          <p className="text-sm text-gray-400 mt-1">
            Organize tasks into parallel execution groups
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={isExecuting ? handleCancelExecution : handleExecuteWorkflow}
            disabled={!isExecuting && tasks.length === 0}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-all font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
              isExecuting
                ? 'bg-red-600 text-white hover:bg-red-700 hover:shadow-red-600/30'
                : 'bg-frost-ice text-norse-night hover:bg-magic-rune hover:shadow-frost-ice/30'
            }`}
          >
            {isExecuting ? (
              <>
                <XCircle className="w-5 h-5" />
                <span>Stop Execution</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                <span>Execute Workflow</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            disabled={tasks.length === 0}
            className="px-4 py-2 bg-norse-stone border-2 border-norse-rune text-gray-100 rounded-lg hover:bg-norse-rune hover:border-valhalla-gold flex items-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Export JSON</span>
          </button>
          {deliverables.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadDeliverables}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2 transition-all font-semibold shadow-lg hover:shadow-green-600/30"
              title={`Download all ${deliverables.length} deliverable${deliverables.length === 1 ? '' : 's'} as a zip archive`}
            >
              <FileDown className="w-4 h-4" />
              <span>Download ZIP ({deliverables.length} {deliverables.length === 1 ? 'file' : 'files'})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCreateTask}
            disabled={isExecuting}
            className="px-4 py-2 bg-valhalla-gold text-norse-night rounded-lg hover:bg-valhalla-amber flex items-center space-x-2 transition-all font-semibold shadow-lg hover:shadow-valhalla-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ListPlus className="w-5 h-5" />
            <span>Create Task</span>
          </button>
          <button
            type="button"
            onClick={addParallelGroup}
            disabled={isExecuting}
            className="px-4 py-2 bg-norse-stone border-2 border-norse-rune text-gray-100 rounded-lg hover:bg-norse-rune hover:border-valhalla-gold flex items-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Add Parallel Group</span>
          </button>
        </div>
      </div>

      {/* Unified Task Canvas - Tasks and Groups in Execution Order */}
      {canvasItems.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-valhalla-gold uppercase tracking-wide">
            Execution Plan
            <span className="ml-2 text-xs text-gray-400 normal-case font-normal">
              (top-to-bottom execution order • drag tasks to reorder or move between groups)
            </span>
          </h3>
          <div className="space-y-4">
            {canvasItems.map((item, index) => {
              if (item.type === 'task') {
                return (
                  <ReorderableItem 
                    key={item.task.id} 
                    itemId={item.task.id}
                    itemType="task"
                    index={index}
                    onReorder={reorderCanvasItem}
                  >
                    <TaskCard task={item.task} disableDrag={true} isExecuting={isExecuting} />
                  </ReorderableItem>
                );
              } else {
                return (
                  <ReorderableItem 
                    key={`group-${item.group.id}`} 
                    itemId={String(item.group.id)}
                    itemType="group"
                index={index}
                    onReorder={reorderCanvasItem}
                  >
                    <ParallelGroupContainer group={item.group} isExecuting={isExecuting} />
                  </ReorderableItem>
                );
              }
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {canvasItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-2xl font-bold mb-3 text-gray-200">No tasks yet</h3>
          <p className="text-center max-w-md text-base leading-relaxed mb-6">
            Click "Create Task" to add a new task, then drag worker and QC agents from the left 
            sidebar into the task card. Or use the PM Agent to generate a complete task plan.
          </p>
          <button
            type="button"
            onClick={handleCreateTask}
            className="px-6 py-3 bg-valhalla-gold text-norse-night rounded-lg hover:bg-valhalla-amber flex items-center space-x-2 transition-all font-semibold shadow-lg hover:shadow-valhalla-gold/30"
          >
            <ListPlus className="w-5 h-5" />
            <span>Create Your First Task</span>
          </button>
        </div>
      )}
    </div>
  );
}
