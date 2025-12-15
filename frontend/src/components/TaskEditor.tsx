import { usePlanStore } from '../store/planStore';
import { X, Plus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Task, isAgentTask, isTransformerTask, AgentTask, TransformerTask } from '../types/task';

export function TaskEditor() {
  const { selectedTask, updateTask, setSelectedTask, tasks, agentTemplates, lambdas, parallelGroups, addParallelGroup } = usePlanStore();
  const [localTask, setLocalTask] = useState<Task | null>(selectedTask);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    setLocalTask(selectedTask);
  }, [selectedTask]);

  if (!selectedTask || !localTask) {
    return (
      <div className="p-6 text-center text-gray-400">
        <div className="text-6xl mb-4">📝</div>
        <p className="text-lg font-medium">Select a task to edit its details</p>
      </div>
    );
  }

  const handleSave = () => {
    updateTask(selectedTask.id, localTask);
    setSelectedTask(null);
  };

  // For transformer tasks, show a simplified editor
  if (isTransformerTask(localTask)) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-norse-rune pb-4">
          <h2 className="text-lg font-semibold text-violet-400">Transformer Editor</h2>
          <button
            type="button"
            onClick={() => setSelectedTask(null)}
            className="text-gray-400 hover:text-violet-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Title</label>
            <input
              type="text"
              value={localTask.title}
              onChange={(e) => updateTransformerTask({ title: e.target.value })}
              className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-gray-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
            <textarea
              value={localTask.description || ''}
              onChange={(e) => updateTransformerTask({ description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-gray-100"
              placeholder="What does this transformer do?"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Lambda Language</label>
            <select
              value={localTask.lambdaLanguage || 'javascript'}
              onChange={(e) => updateTransformerTask({ lambdaLanguage: e.target.value as 'javascript' | 'typescript' | 'python' })}
              className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-gray-100"
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Lambda Name</label>
            <input
              type="text"
              value={localTask.lambdaName || ''}
              onChange={(e) => updateTransformerTask({ lambdaName: e.target.value || undefined })}
              className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-gray-100"
              placeholder="my-transformer-lambda"
            />
            <p className="text-xs text-gray-400 mt-1">
              Identifier for logging (e.g., split-batch-1)
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Lambda Script</label>
            <textarea
              value={localTask.lambdaScript || ''}
              onChange={(e) => updateTransformerTask({ lambdaScript: e.target.value || undefined })}
              rows={10}
              className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-gray-100 font-mono"
              placeholder={`// Access upstream outputs via tasks array:\nconst output = tasks[0].transformerOutput || tasks[0].workerOutput || '';\nconst data = JSON.parse(output);\nreturn JSON.stringify(data);`}
              spellCheck={false}
            />
            <p className="text-xs text-gray-400 mt-1">
              Inline script code. Use <code className="text-violet-400">tasks[0].transformerOutput</code> or <code className="text-violet-400">tasks[0].workerOutput</code> to access upstream data.
            </p>
          </div>

          <details className="text-xs">
            <summary className="text-gray-400 cursor-pointer hover:text-gray-300">Or select from library...</summary>
            <div className="mt-2">
              <select
                value={localTask.lambdaId || ''}
                onChange={(e) => {
                  const selectedLambda = lambdas.find(l => l.id === e.target.value);
                  if (selectedLambda) {
                    updateTransformerTask({ 
                      lambdaId: selectedLambda.id,
                      lambdaScript: selectedLambda.script,
                      lambdaLanguage: selectedLambda.language,
                      lambdaName: selectedLambda.name
                    });
                  } else {
                    updateTransformerTask({ lambdaId: undefined });
                  }
                }}
                className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-gray-100"
              >
                <option value="">None (use inline script above)</option>
                {lambdas.map(lambda => (
                  <option key={lambda.id} value={lambda.id}>
                    {lambda.name} ({lambda.language})
                  </option>
                ))}
              </select>
            </div>
          </details>

          {/* Parallel Group for Transformer */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-300">Parallel Group</label>
              <button
                type="button"
                onClick={() => setIsCreatingGroup(!isCreatingGroup)}
                className="text-xs text-violet-400 hover:text-violet-300 flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>{isCreatingGroup ? 'Cancel' : 'New Group'}</span>
              </button>
            </div>
            
            {isCreatingGroup ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name (optional)"
                  className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    addParallelGroup();
                    const newGroupId = Math.max(0, ...parallelGroups.map(g => g.id)) + 1;
                    // Update both local state and store immediately
                    updateTransformerTask({ parallelGroup: newGroupId });
                    updateTask(selectedTask.id, { parallelGroup: newGroupId });
                    setIsCreatingGroup(false);
                    setNewGroupName('');
                  }}
                  className="w-full px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 text-sm font-medium"
                >
                  Create & Assign Group {Math.max(0, ...parallelGroups.map(g => g.id)) + 1}
                </button>
              </div>
            ) : (
              <select
                value={localTask.parallelGroup ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const newGroup = value === '' ? null : parseInt(value, 10);
                  // Update both local state and store immediately
                  updateTransformerTask({ parallelGroup: newGroup });
                  updateTask(selectedTask.id, { parallelGroup: newGroup });
                }}
                className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm text-gray-100"
              >
                <option value="">None (ungrouped)</option>
                {parallelGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    Group {group.id}{group.name ? ` - ${group.name}` : ''}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Tasks in the same group can run in parallel
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-norse-rune">
          <button
            type="button"
            onClick={() => setSelectedTask(null)}
            className="px-4 py-2 bg-norse-rune text-gray-200 rounded-lg hover:bg-norse-stone transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    );
  }

  // Cast to AgentTask since we've ruled out TransformerTask above
  const agentTask = localTask as AgentTask;

  // Type-safe update for agent tasks
  const updateAgentTask = (updates: Partial<AgentTask>) => {
    if (localTask && isAgentTask(localTask)) {
      const updated: AgentTask = Object.assign({}, localTask, updates);
      setLocalTask(updated);
    }
  };

  // Type-safe update for transformer tasks
  const updateTransformerTask = (updates: Partial<TransformerTask>) => {
    if (localTask && isTransformerTask(localTask)) {
      const updated: TransformerTask = Object.assign({}, localTask, updates);
      setLocalTask(updated);
    }
  };

  const addSuccessCriterion = () => {
    if (localTask && isAgentTask(localTask)) {
      const updated: AgentTask = Object.assign({}, localTask, {
        successCriteria: [...localTask.successCriteria, ''],
      });
      setLocalTask(updated);
    }
  };

  const updateSuccessCriterion = (index: number, value: string) => {
    if (localTask && isAgentTask(localTask)) {
      const newCriteria = [...localTask.successCriteria];
      newCriteria[index] = value;
      const updated: AgentTask = Object.assign({}, localTask, { successCriteria: newCriteria });
      setLocalTask(updated);
    }
  };

  const removeSuccessCriterion = (index: number) => {
    if (localTask && isAgentTask(localTask)) {
      const updated: AgentTask = Object.assign({}, localTask, {
        successCriteria: localTask.successCriteria.filter((_: string, i: number) => i !== index),
      });
      setLocalTask(updated);
    }
  };

  const availableDependencies = tasks
    .filter((t) => t.id !== selectedTask.id)
    .map((t) => t.id);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-valhalla-gold">Task Editor</h2>
        <button
          type="button"
          onClick={() => setSelectedTask(null)}
          className="text-gray-400 hover:text-valhalla-gold transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Task ID */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Task ID
          </label>
          <input
            type="text"
            value={agentTask.id}
            onChange={(e) => updateAgentTask({ id: e.target.value })}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Title
          </label>
          <input
            type="text"
            value={agentTask.title}
            onChange={(e) => updateAgentTask({ title: e.target.value })}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          />
        </div>

        {/* Agent Role Description */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Worker Role Description
          </label>
          <textarea
            value={agentTask.agentRoleDescription}
            onChange={(e) => updateAgentTask({ agentRoleDescription: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          />
        </div>

        {/* Worker Preamble Selection */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Worker Preamble (Optional)
          </label>
          <select
            value={agentTask.workerPreambleId || ''}
            onChange={(e) => updateAgentTask({ workerPreambleId: e.target.value || undefined })}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          >
            <option value="">None - Use role description only</option>
            {agentTemplates
              .filter(a => a.agentType === 'worker')
              .map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} (v{agent.version})
                </option>
              ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Link to a saved worker preamble for consistent role execution
          </p>
        </div>

        {/* QC Role Description */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            QC Role Description
          </label>
          <textarea
            value={agentTask.qcRole}
            onChange={(e) => updateAgentTask({ qcRole: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          />
        </div>

        {/* QC Preamble Selection */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            QC Preamble (Optional)
          </label>
          <select
            value={agentTask.qcPreambleId || ''}
            onChange={(e) => updateAgentTask({ qcPreambleId: e.target.value || undefined })}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          >
            <option value="">None - Use role description only</option>
            {agentTemplates
              .filter(a => a.agentType === 'qc')
              .map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} (v{agent.version})
                </option>
              ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Link to a saved QC preamble for consistent verification
          </p>
        </div>

        {/* Recommended Model */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Recommended Model
          </label>
          <select
            value={agentTask.recommendedModel}
            onChange={(e) => updateAgentTask({ recommendedModel: e.target.value })}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          >
            <option value="gpt-4.1">gpt-4.1</option>
            <option value="gpt-4">gpt-4</option>
            <option value="claude-3.5-sonnet">claude-3.5-sonnet</option>
            <option value="claude-3-opus">claude-3-opus</option>
          </select>
        </div>

        {/* Prompt */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Prompt
          </label>
          <textarea
            value={agentTask.prompt}
            onChange={(e) => updateAgentTask({ prompt: e.target.value })}
            rows={6}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm font-mono text-gray-100"
            placeholder="Enter the detailed prompt for this task..."
          />
        </div>

        {/* Success Criteria */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-300">
              Success Criteria
            </label>
            <button
              type="button"
              onClick={addSuccessCriterion}
              className="text-valhalla-gold hover:text-valhalla-amber text-xs flex items-center space-x-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>
          <div className="space-y-2">
            {agentTask.successCriteria.map((criterion, index) => (
              <div key={index} className="flex items-start space-x-2">
                <input
                  type="text"
                  value={criterion}
                  onChange={(e) => updateSuccessCriterion(index, e.target.value)}
                  placeholder="Enter success criterion..."
                  className="flex-1 px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => removeSuccessCriterion(index)}
                  className="text-red-400 hover:text-red-600 p-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Dependencies */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Dependencies
          </label>
          <select
            multiple
            value={agentTask.dependencies}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (option) => option.value);
              updateAgentTask({ dependencies: selected });
            }}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
            size={5}
          >
            {availableDependencies.map((taskId) => (
              <option key={taskId} value={taskId}>
                {taskId}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Hold Cmd/Ctrl to select multiple
          </p>
        </div>

        {/* Parallel Group */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-300">
              Parallel Group
            </label>
            <button
              type="button"
              onClick={() => setIsCreatingGroup(!isCreatingGroup)}
              className="text-xs text-frost-ice hover:text-frost-ice/80 flex items-center space-x-1"
            >
              <Plus className="w-3 h-3" />
              <span>{isCreatingGroup ? 'Cancel' : 'New Group'}</span>
            </button>
          </div>
          
          {isCreatingGroup ? (
            <div className="space-y-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (optional)"
                className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-frost-ice focus:border-frost-ice text-sm text-gray-100"
              />
              <button
                type="button"
                onClick={() => {
                  addParallelGroup();
                  // Get the newly created group (it's the last one)
                  const newGroupId = Math.max(0, ...parallelGroups.map(g => g.id)) + 1;
                  // Update both local state and store immediately
                  updateAgentTask({ parallelGroup: newGroupId });
                  updateTask(selectedTask.id, { parallelGroup: newGroupId });
                  setIsCreatingGroup(false);
                  setNewGroupName('');
                }}
                className="w-full px-3 py-2 bg-frost-ice text-norse-night rounded-lg hover:bg-frost-ice/90 text-sm font-medium"
              >
                Create & Assign Group {Math.max(0, ...parallelGroups.map(g => g.id)) + 1}
              </button>
            </div>
          ) : (
            <select
              value={agentTask.parallelGroup ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                const newGroup = value === '' ? null : parseInt(value, 10);
                // Update both local state and store immediately
                updateAgentTask({ parallelGroup: newGroup });
                updateTask(selectedTask.id, { parallelGroup: newGroup });
              }}
              className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
            >
              <option value="">None (ungrouped)</option>
              {parallelGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  Group {group.id}{group.name ? ` - ${group.name}` : ''}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Tasks in the same group can run in parallel (List view concept)
          </p>
        </div>

        {/* Estimated Duration */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Estimated Duration
          </label>
          <input
            type="text"
            value={agentTask.estimatedDuration}
            onChange={(e) => updateAgentTask({ estimatedDuration: e.target.value })}
            placeholder="e.g., 30 minutes"
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          />
        </div>

        {/* Estimated Tool Calls */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Estimated Tool Calls
          </label>
          <input
            type="number"
            value={agentTask.estimatedToolCalls}
            onChange={(e) => updateAgentTask({ estimatedToolCalls: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          />
        </div>

        {/* Max Retries */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Max Retries
          </label>
          <input
            type="number"
            value={agentTask.maxRetries}
            onChange={(e) => updateAgentTask({ maxRetries: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-norse-shadow border-2 border-norse-rune rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold text-sm text-gray-100"
          />
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full px-4 py-2 bg-valhalla-gold text-norse-night rounded-lg hover:bg-valhalla-amber transition-all font-semibold shadow-lg hover:shadow-valhalla-gold/30"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
