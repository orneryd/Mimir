import { useState, useRef, useId } from 'react';
import { X, Upload, FileJson, AlertCircle, CheckCircle, Copy, FileUp } from 'lucide-react';
import { usePlanStore } from '../store/planStore';
import { Task, AgentTask, TransformerTask, ParallelGroup } from '../types/task';

interface ImportWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportTab = 'paste' | 'upload';

interface WorkflowJSON {
  name?: string;
  description?: string;
  tasks: any[];
  parallelGroups?: any[];
  lambdas?: any[];
  agentTemplates?: any[];
  projectPlan?: any;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  taskCount: number;
  lambdaCount: number;
  parallelGroupCount: number;
}

export function ImportWorkflowModal({ isOpen, onClose }: ImportWorkflowModalProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>('paste');
  const [jsonInput, setJsonInput] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputId = useId();
  
  const { 
    setTasks, 
    setParallelGroups, 
    addLambda, 
    addAgentTemplate,
    clearTasks 
  } = usePlanStore();

  if (!isOpen) return null;

  const validateWorkflow = (json: string): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let taskCount = 0;
    let lambdaCount = 0;
    let parallelGroupCount = 0;

    try {
      const data = JSON.parse(json) as WorkflowJSON;

      // Check for tasks array
      if (!data.tasks || !Array.isArray(data.tasks)) {
        errors.push('Missing or invalid "tasks" array');
        return { valid: false, errors, warnings, taskCount, lambdaCount, parallelGroupCount };
      }

      taskCount = data.tasks.length;
      if (taskCount === 0) {
        errors.push('Workflow must contain at least one task');
      }

      // Validate each task
      const taskIds = new Set<string>();
      data.tasks.forEach((task, idx) => {
        if (!task.id) {
          errors.push(`Task at index ${idx} missing "id"`);
        } else if (taskIds.has(task.id)) {
          errors.push(`Duplicate task ID: "${task.id}"`);
        } else {
          taskIds.add(task.id);
        }

        if (!task.title) {
          warnings.push(`Task "${task.id || idx}" missing "title"`);
        }

        if (!task.taskType) {
          warnings.push(`Task "${task.id || idx}" missing "taskType", will default to "agent"`);
        }

        // Check dependencies reference valid tasks
        if (task.dependencies && Array.isArray(task.dependencies)) {
          task.dependencies.forEach((dep: string) => {
            // Check if dependency exists (it might be defined later in array)
            const depExists = data.tasks.some((t: any) => t.id === dep);
            if (!depExists) {
              errors.push(`Task "${task.id}" references unknown dependency: "${dep}"`);
            }
          });
        }

        // Agent-specific validation
        if (task.taskType === 'agent' || !task.taskType) {
          if (!task.agentRoleDescription) {
            warnings.push(`Agent task "${task.id}" missing "agentRoleDescription"`);
          }
        }

        // Transformer-specific validation
        if (task.taskType === 'transformer') {
          if (!task.lambdaScript && !task.lambdaId) {
            warnings.push(`Transformer "${task.id}" has no Lambda assigned (will be pass-through)`);
          }
        }
      });

      // Count lambdas (from explicit array + inline scripts on transformers)
      if (data.lambdas && Array.isArray(data.lambdas)) {
        lambdaCount = data.lambdas.length;
      }
      // Also count inline lambdas from transformer tasks
      const inlineLambdaCount = data.tasks.filter(
        (t: any) => t.taskType === 'transformer' && t.lambdaScript
      ).length;
      lambdaCount += inlineLambdaCount;

      // Count parallel groups
      if (data.parallelGroups && Array.isArray(data.parallelGroups)) {
        parallelGroupCount = data.parallelGroups.length;
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        taskCount,
        lambdaCount,
        parallelGroupCount,
      };
    } catch (e) {
      return {
        valid: false,
        errors: [`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`],
        warnings: [],
        taskCount: 0,
        lambdaCount: 0,
        parallelGroupCount: 0,
      };
    }
  };

  const handleValidate = () => {
    const result = validateWorkflow(jsonInput);
    setValidation(result);
  };

  const handleImport = async () => {
    if (!validation?.valid) return;

    setIsImporting(true);
    try {
      const data = JSON.parse(jsonInput) as WorkflowJSON;

      // Clear existing tasks
      clearTasks();

      // Import lambdas - merge explicit lambdas array with inline scripts from tasks
      // Build a map of lambdaName -> script from transformer tasks
      const inlineScripts = new Map<string, { script: string; language: string; title: string; description: string }>();
      data.tasks.forEach(task => {
        if (task.taskType === 'transformer' && task.lambdaScript) {
          const key = task.lambdaName || task.id;
          inlineScripts.set(key, {
            script: task.lambdaScript,
            language: task.lambdaLanguage || 'javascript',
            title: task.title || task.lambdaName || task.id,
            description: task.description || `Lambda for ${task.title || task.id}`,
          });
        }
      });
      
      // Track which lambdas we've added (to avoid duplicates)
      const addedLambdaIds = new Set<string>();
      
      // 1. From explicit lambdas array - merge with inline scripts if available
      // Skip lambdas that have no script and no matching inline script (stale entries)
      if (data.lambdas && Array.isArray(data.lambdas)) {
        data.lambdas.forEach(lambda => {
          const inline = inlineScripts.get(lambda.id);
          const script = lambda.script || inline?.script || '';
          
          // Skip if no script available (stale lambda entry with no matching task)
          if (!script) {
            console.log(`Skipping lambda "${lambda.id}" - no script found`);
            return;
          }
          
          addLambda({
            id: lambda.id,
            name: lambda.name,
            description: lambda.description || inline?.description || '',
            language: lambda.language || inline?.language || 'javascript',
            script,
            version: lambda.version || '1.0',
            created: lambda.created || new Date().toISOString(),
          });
          addedLambdaIds.add(lambda.id);
        });
      }
      
      // 2. Add any inline lambdas not already in the lambdas array
      inlineScripts.forEach((inline, key) => {
        if (!addedLambdaIds.has(key)) {
          addLambda({
            id: key,
            name: inline.title,
            description: inline.description,
            language: inline.language as 'javascript' | 'typescript' | 'python',
            script: inline.script,
            version: '1.0',
            created: new Date().toISOString(),
          });
        }
      });

      // Import agent templates if provided
      if (data.agentTemplates && Array.isArray(data.agentTemplates)) {
        data.agentTemplates.forEach(template => {
          addAgentTemplate(template);
        });
      }

      // Import parallel groups
      if (data.parallelGroups && Array.isArray(data.parallelGroups)) {
        const groups: ParallelGroup[] = data.parallelGroups.map(g => ({
          id: g.id,
          name: g.name || `Group ${g.id}`,
          taskIds: g.taskIds || [],
          color: g.color,
        }));
        setParallelGroups(groups);
      }

      // Import tasks
      const tasks: Task[] = data.tasks.map(t => {
        const baseTask = {
          id: t.id,
          title: t.title || 'Untitled Task',
          description: t.description || '',
          dependencies: t.dependencies || [],
          parallelGroup: t.parallelGroup ?? null,
          position: t.position,
          executionStatus: undefined,
        };

        if (t.taskType === 'transformer') {
          return {
            ...baseTask,
            taskType: 'transformer' as const,
            lambdaId: t.lambdaId,
            lambdaScript: t.lambdaScript,
            lambdaLanguage: t.lambdaLanguage,
            lambdaName: t.lambdaName,
            inputMapping: t.inputMapping,
            outputMapping: t.outputMapping,
          } as TransformerTask;
        } else {
          return {
            ...baseTask,
            taskType: 'agent' as const,
            agentRoleDescription: t.agentRoleDescription || 'General assistant',
            recommendedModel: t.recommendedModel || 'gpt-4.1',
            prompt: t.prompt || '',
            estimatedDuration: t.estimatedDuration || '5 min',
            estimatedToolCalls: t.estimatedToolCalls || 0,
            successCriteria: t.successCriteria || [],
            workerPreambleId: t.workerPreambleId,
            qcPreambleId: t.qcPreambleId,
            qcRole: t.qcRole,
            verificationCriteria: t.verificationCriteria || [],
            maxRetries: t.maxRetries || 2,
          } as AgentTask;
        }
      });

      setTasks(tasks);

      // Success - close modal
      handleClose();
    } catch (error) {
      console.error('Import failed:', error);
      setValidation({
        valid: false,
        errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        taskCount: 0,
        lambdaCount: 0,
        parallelGroupCount: 0,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonInput(content);
      // Auto-validate after loading
      const result = validateWorkflow(content);
      setValidation(result);
    };
    reader.readAsText(file);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonInput(text);
      // Auto-validate after paste
      const result = validateWorkflow(text);
      setValidation(result);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handleClose = () => {
    setJsonInput('');
    setFileName(null);
    setValidation(null);
    setActiveTab('paste');
    onClose();
  };

  const loadExample = () => {
    const example = {
      name: "Example Workflow",
      tasks: [
        {
          id: "task-1",
          taskType: "agent",
          title: "Research Task",
          agentRoleDescription: "Research assistant",
          prompt: "Research the topic and provide key findings",
          dependencies: [],
          parallelGroup: 1
        },
        {
          id: "transformer-1",
          taskType: "transformer",
          title: "Summarize Results",
          dependencies: ["task-1"],
          lambdaName: "Summarizer",
          lambdaLanguage: "typescript",
          lambdaScript: "function transform(input: any): string {\n  return input.tasks.map((t: any) => t.workerOutput).join('\\n');\n}"
        }
      ],
      parallelGroups: [
        { id: 1, name: "Research Phase" }
      ]
    };
    setJsonInput(JSON.stringify(example, null, 2));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-norse-stone border-2 border-norse-rune rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-norse-rune">
          <div className="flex items-center space-x-3">
            <FileJson className="w-6 h-6 text-valhalla-gold" />
            <h2 className="text-xl font-bold text-valhalla-gold">Import Workflow</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-norse-rune rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-norse-rune">
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'paste'
                ? 'text-valhalla-gold border-b-2 border-valhalla-gold bg-norse-shadow/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-norse-rune/30'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Copy className="w-4 h-4" />
              <span>Paste JSON</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'text-valhalla-gold border-b-2 border-valhalla-gold bg-norse-shadow/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-norse-rune/30'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <FileUp className="w-4 h-4" />
              <span>Upload File</span>
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col min-h-0">
          {activeTab === 'paste' ? (
            <div className="flex flex-col h-full space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor={jsonInputId} className="text-sm font-medium text-gray-300">
                  Workflow JSON
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handlePaste}
                    className="text-xs text-frost-ice hover:text-frost-ice/80 flex items-center space-x-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Paste from clipboard</span>
                  </button>
                  <button
                    type="button"
                    onClick={loadExample}
                    className="text-xs text-violet-400 hover:text-violet-300"
                  >
                    Load example
                  </button>
                </div>
              </div>
              <textarea
                id={jsonInputId}
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
                  setValidation(null);
                }}
                placeholder='{\n  "tasks": [\n    {\n      "id": "task-1",\n      "taskType": "agent",\n      "title": "My Task",\n      ...\n    }\n  ]\n}'
                className="flex-1 min-h-[300px] px-4 py-3 bg-norse-night border-2 border-norse-rune text-gray-100 placeholder-gray-600 rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold font-mono text-sm resize-none"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="flex flex-col h-full space-y-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 min-h-[200px] border-2 border-dashed border-norse-rune rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-valhalla-gold hover:bg-norse-shadow/30 transition-colors"
              >
                <Upload className="w-12 h-12 text-gray-500 mb-4" />
                <p className="text-gray-300 font-medium">
                  {fileName ? fileName : 'Click to upload or drag & drop'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  JSON files only (.json)
                </p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />

              {fileName && jsonInput && (
                <div className="bg-norse-shadow/50 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-sm text-gray-300">
                    <FileJson className="w-4 h-4 text-valhalla-gold" />
                    <span>{fileName}</span>
                    <span className="text-gray-500">({(jsonInput.length / 1024).toFixed(1)} KB)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validation Results */}
          {validation && (
            <div className={`mt-4 p-3 rounded-lg border ${
              validation.valid 
                ? 'bg-green-900/20 border-green-700' 
                : 'bg-red-900/20 border-red-700'
            }`}>
              <div className="flex items-start space-x-2">
                {validation.valid ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${validation.valid ? 'text-green-400' : 'text-red-400'}`}>
                    {validation.valid ? 'Validation Passed' : 'Validation Failed'}
                  </p>
                  
                  {validation.valid && (
                    <p className="text-sm text-gray-400 mt-1">
                      {validation.taskCount} tasks, {validation.lambdaCount} lambdas, {validation.parallelGroupCount} groups
                    </p>
                  )}

                  {validation.errors.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {validation.errors.map((error) => (
                        <li key={`err-${error}`} className="text-sm text-red-300">• {error}</li>
                      ))}
                    </ul>
                  )}

                  {validation.warnings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-yellow-500 font-medium">Warnings:</p>
                      <ul className="mt-1 space-y-0.5">
                        {validation.warnings.slice(0, 5).map((warning) => (
                          <li key={`warn-${warning}`} className="text-xs text-yellow-400/80">• {warning}</li>
                        ))}
                        {validation.warnings.length > 5 && (
                          <li className="text-xs text-yellow-400/60">
                            ... and {validation.warnings.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-norse-rune bg-norse-shadow/30">
          <p className="text-xs text-gray-500">
            Import will replace current workflow
          </p>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-norse-rune text-gray-200 font-medium rounded-lg hover:bg-norse-mist transition-colors"
            >
              Cancel
            </button>
            {!validation && (
              <button
                type="button"
                onClick={handleValidate}
                disabled={!jsonInput.trim()}
                className="px-4 py-2 bg-frost-ice text-norse-night font-semibold rounded-lg hover:bg-frost-ice/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Validate
              </button>
            )}
            {validation?.valid && (
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="px-4 py-2 bg-valhalla-gold text-norse-night font-semibold rounded-lg hover:bg-valhalla-gold/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-norse-night border-t-transparent rounded-full" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Import Workflow</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
