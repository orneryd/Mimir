import { useDrop } from 'react-dnd';
import { usePlanStore } from '../store/planStore';
import { ParallelGroup, Task, AgentTemplate } from '../types/task';
import { TaskCard } from './TaskCard';
import { Trash2, Edit2 } from 'lucide-react';
import { useState } from 'react';

interface ParallelGroupContainerProps {
  group: ParallelGroup;
  isExecuting?: boolean;
}

export function ParallelGroupContainer({ group, isExecuting = false }: ParallelGroupContainerProps) {
  const { tasks, assignTaskToGroup, deleteParallelGroup, updateParallelGroup, addTask } = usePlanStore();
  const [isEditing, setIsEditing] = useState(false);
  const [groupName, setGroupName] = useState(group.name);

  const [{ isOverTask, isOverAgent }, drop] = useDrop(() => ({
    accept: ['task', 'reorderable-task', 'agent'],
    drop: (item: Task | AgentTemplate | { task: Task }, monitor) => {
      // Only handle drop if it's directly on this zone (not a child zone)
      if (monitor.didDrop()) {
        return; // Already handled by a nested drop zone
      }
      
      const itemType = monitor.getItemType();
      
      if (itemType === 'task') {
        // Existing task being moved to this group
        const task = item as Task;
        if (task.parallelGroup !== group.id) {
          assignTaskToGroup(task.id, group.id);
        }
      } else if (itemType === 'reorderable-task') {
        // Reorderable task from ungrouped section
        const { task } = item as { task: Task };
        if (task.parallelGroup !== group.id) {
          assignTaskToGroup(task.id, group.id);
        }
      } else if (itemType === 'agent') {
        // Agent being dropped to create new task in this group
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
          parallelGroup: group.id,
          qcAgentRoleDescription: agent.agentType === 'qc' ? agent.role : '',
          qcPreambleId: agent.agentType === 'qc' ? agent.id : undefined,
          verificationCriteria: [],
          maxRetries: 3,
        };
        addTask(newTask);
      }
    },
    collect: (monitor) => ({
      isOverTask: monitor.isOver({ shallow: true }) && (monitor.getItemType() === 'task' || monitor.getItemType() === 'reorderable-task'),
      isOverAgent: monitor.isOver({ shallow: true }) && monitor.getItemType() === 'agent',
    }),
  }));

  const groupTasks = tasks.filter((t) => t.parallelGroup === group.id);

  const handleSaveName = () => {
    updateParallelGroup(group.id, { name: groupName });
    setIsEditing(false);
  };

  return (
    <div
      ref={drop}
      style={{ borderColor: group.color }}
      className={`border-2 rounded-lg p-4 transition-colors ${
        isOverAgent
          ? 'bg-valhalla-gold bg-opacity-10 border-valhalla-gold'
          : isOverTask
          ? 'bg-opacity-10'
          : 'bg-norse-shadow'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3 flex-1">
          <div
            style={{ backgroundColor: group.color }}
            className="w-3 h-3 rounded-full"
          />
          {isEditing ? (
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              className="flex-1 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          ) : (
            <>
              <h3 className="font-semibold text-gray-100">{group.name}</h3>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-gray-400 hover:text-gray-600"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">{groupTasks.length} tasks</span>
          <button
            type="button"
            onClick={() => deleteParallelGroup(group.id)}
            className="text-red-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {groupTasks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {groupTasks.map((task) => (
            <TaskCard key={task.id} task={task} isExecuting={isExecuting} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          Drop tasks here to add them to this group
        </div>
      )}
    </div>
  );
}
