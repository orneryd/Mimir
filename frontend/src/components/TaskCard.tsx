import { useDrag, useDrop } from 'react-dnd';
import { useEffect } from 'react';
import { usePlanStore } from '../store/planStore';
import { Task, AgentTemplate } from '../types/task';
import { GripVertical, Trash2, Clock, Zap, User, Shield } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  disableDrag?: boolean; // Disable drag when used in ReorderableTaskCard
  isExecuting?: boolean; // Disable editing during execution
}

export function TaskCard({ task, disableDrag = false, isExecuting = false }: TaskCardProps) {
  const { setSelectedTask, deleteTask, updateTask, agentTemplates, tasks } = usePlanStore();
  
  // Debug: Log when execution status changes
  useEffect(() => {
    if (task.executionStatus) {
      console.log(`🎨 TaskCard ${task.id} (${task.title}) - Status changed to: ${task.executionStatus}`);
    }
  }, [task.executionStatus, task.id, task.title]);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'task',
    item: task,
    canDrag: !disableDrag, // Only allow drag if not disabled
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  // Find assigned agents
  const workerAgent = agentTemplates.find(a => a.id === task.workerPreambleId);
  const qcAgent = agentTemplates.find(a => a.id === task.qcPreambleId);

  // Helper to get task title from task ID
  const getTaskTitle = (taskId: string): string => {
    const dependentTask = tasks.find(t => t.id === taskId);
    return dependentTask?.title || taskId;
  };

  // Drop zone for worker agent
  const [{ isOverWorker }, dropWorker] = useDrop(() => ({
    accept: 'agent',
    canDrop: (item: AgentTemplate) => item.agentType === 'worker',
    drop: (item: AgentTemplate) => {
      updateTask(task.id, {
        workerPreambleId: item.id,
        agentRoleDescription: item.role,
      });
    },
    collect: (monitor) => ({
      isOverWorker: monitor.isOver() && monitor.canDrop(),
    }),
  }));

  // Drop zone for QC agent
  const [{ isOverQC }, dropQC] = useDrop(() => ({
    accept: 'agent',
    canDrop: (item: AgentTemplate) => item.agentType === 'qc',
    drop: (item: AgentTemplate) => {
      updateTask(task.id, {
        qcPreambleId: item.id,
        qcAgentRoleDescription: item.role,
      });
    },
    collect: (monitor) => ({
      isOverQC: monitor.isOver() && monitor.canDrop(),
    }),
  }));

  // Get execution status styling
  const getExecutionStatusClass = () => {
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

  return (
    <div
      ref={disableDrag ? undefined : drag}
      className={`bg-norse-stone border-2 rounded-lg overflow-hidden transition-all ${
        isDragging ? 'opacity-50' : ''
      } ${getExecutionStatusClass()}`}
    >
      {/* Header */}
      <div className="p-4 bg-norse-shadow border-b border-norse-rune">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {!disableDrag && <GripVertical className="w-4 h-4 text-gray-500 flex-shrink-0 cursor-move" />}
            <button
              type="button"
              onClick={() => !isExecuting && setSelectedTask(task)}
              disabled={isExecuting}
              className="font-medium text-gray-100 text-sm truncate hover:text-valhalla-gold transition-colors text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
              {task.title}
            </button>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isExecuting) deleteTask(task.id);
            }}
            disabled={isExecuting}
            className="text-red-400 hover:text-red-600 flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>{task.estimatedDuration}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Zap className="w-3 h-3" />
            <span>{task.estimatedToolCalls} calls</span>
          </div>
        </div>
      </div>

      {/* Worker Agent Drop Zone */}
      <div
        ref={dropWorker}
        className={`p-3 border-b border-norse-rune transition-all ${
          isOverWorker
            ? 'bg-frost-ice bg-opacity-20 border-frost-ice'
            : workerAgent
            ? 'bg-norse-shadow'
            : 'bg-norse-stone'
        }`}
      >
        <div className="flex items-center space-x-2 mb-2">
          <User className="w-4 h-4 text-frost-ice" />
          <span className="text-xs font-semibold text-frost-ice uppercase tracking-wide">
            Worker Agent
          </span>
        </div>
        
        {workerAgent ? (
          <div className="bg-norse-night rounded p-2 border border-norse-rune">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-100 truncate">
                  {workerAgent.name}
                </div>
                <div className="text-xs text-gray-400 line-clamp-1">
                  {workerAgent.role}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateTask(task.id, {
                    workerPreambleId: undefined,
                    agentRoleDescription: '',
                  });
                }}
                className="ml-2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className={`border-2 border-dashed rounded p-3 text-center transition-all ${
            isOverWorker
              ? 'border-frost-ice bg-frost-ice bg-opacity-10'
              : 'border-norse-rune'
          }`}>
            <p className="text-xs text-gray-500">
              {isOverWorker ? 'Drop worker here' : 'Drag worker agent here'}
            </p>
          </div>
        )}
      </div>

      {/* QC Agent Drop Zone */}
      <div
        ref={dropQC}
        className={`p-3 transition-all ${
          isOverQC
            ? 'bg-magic-rune bg-opacity-20 border-t-2 border-magic-rune'
            : qcAgent
            ? 'bg-norse-shadow'
            : 'bg-norse-stone'
        }`}
      >
        <div className="flex items-center space-x-2 mb-2">
          <Shield className="w-4 h-4 text-magic-rune" />
          <span className="text-xs font-semibold text-magic-rune uppercase tracking-wide">
            QC Agent
          </span>
        </div>
        
        {qcAgent ? (
          <div className="bg-norse-night rounded p-2 border border-norse-rune">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-100 truncate">
                  {qcAgent.name}
                </div>
                <div className="text-xs text-gray-400 line-clamp-1">
                  {qcAgent.role}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateTask(task.id, {
                    qcPreambleId: undefined,
                    qcAgentRoleDescription: '',
                  });
                }}
                className="ml-2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          <div className={`border-2 border-dashed rounded p-3 text-center transition-all ${
            isOverQC
              ? 'border-magic-rune bg-magic-rune bg-opacity-10'
              : 'border-norse-rune'
          }`}>
            <p className="text-xs text-gray-500">
              {isOverQC ? 'Drop QC agent here' : 'Drag QC agent here'}
            </p>
          </div>
        )}
      </div>

      {/* Dependencies Footer */}
      {task.dependencies.length > 0 && (
        <div className="px-3 py-2 bg-norse-shadow border-t border-norse-rune">
          <p className="text-xs text-gray-500">
            Depends on: {task.dependencies.map(getTaskTitle).join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
