import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Download, FileDown, X } from 'lucide-react';
import { PromptInput } from '../components/PromptInput';
import { AgentPalette } from '../components/AgentPalette';
import { TaskCanvas } from '../components/TaskCanvas';
import { TaskEditor } from '../components/TaskEditor';
import { AgentDragPreview } from '../components/AgentDragPreview';
import { ErrorModal } from '../components/ErrorModal';
import { EyeOfMimirLogo } from '../components/EyeOfMimirLogo';
import { usePlanStore } from '../store/planStore';

export function Studio() {
  const location = useLocation();
  const navigate = useNavigate();
  const { globalError, setGlobalError, setProjectPrompt } = usePlanStore();
  const [showDeliverablesModal, setShowDeliverablesModal] = useState(false);
  const [recentExecutions, setRecentExecutions] = useState<any[]>([]);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  
  // Handle initial prompt from Portal navigation
  useEffect(() => {
    const state = location.state as { initialPrompt?: string } | null;
    if (state?.initialPrompt) {
      setProjectPrompt(state.initialPrompt);
      // Clear the location state to prevent re-setting on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setProjectPrompt]);
  
  // Helper to safely extract string message from error object
  const getErrorMessage = (error: any): string => {
    if (!error) return '';
    if (typeof error.message === 'string') return error.message;
    if (typeof error.message === 'object') {
      // If message is an object, try to extract useful info
      return error.message.message || error.message.error || JSON.stringify(error.message);
    }
    return error.error || error.toString();
  };
  
  const getErrorDetails = (error: any): string | undefined => {
    if (!error) return undefined;
    if (typeof error.details === 'string') return error.details;
    if (typeof error.details === 'object') {
      return JSON.stringify(error.details, null, 2);
    }
    return error.details;
  };

  // Fetch recent workflow executions with deliverables
  const handleOpenDeliverables = async () => {
    setShowDeliverablesModal(true);
    setLoadingExecutions(true);
    
    try {
      const response = await fetch('/api/executions?limit=20', {
        credentials: 'include' // Send HTTP-only cookie
      });
      if (response.ok) {
        const data = await response.json();
        setRecentExecutions(data.executions || []);
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    } finally {
      setLoadingExecutions(false);
    }
  };

  // Download all deliverables for an execution as a zip file
  const handleDownloadAll = (executionId: string) => {
    window.open(`/api/deliverables/${executionId}/download`, '_blank');
  };

  // Download a single deliverable file
  const handleDownloadFile = (executionId: string, filename: string) => {
    window.open(`/api/execution-deliverable/${executionId}/${encodeURIComponent(filename)}`, '_blank');
  };
  
  return (
    <DndProvider backend={HTML5Backend}>
      <AgentDragPreview />
      <ErrorModal
        isOpen={globalError !== null}
        title={globalError?.title || 'Error'}
        message={getErrorMessage(globalError)}
        details={getErrorDetails(globalError)}
        onClose={() => setGlobalError(null)}
      />
      <div className="h-screen flex flex-col bg-norse-night">
        {/* Header */}
        <header className="bg-norse-shadow border-b border-norse-rune px-6 py-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3">
            <img 
              src="/mimir-logo.png" 
              alt="Mimir Logo" 
              className="h-12 w-auto"
            />
            <div>
              <h1 className="text-2xl font-bold text-valhalla-gold">Mimir Orchestration Studio</h1>
              <p className="text-sm text-gray-400">Visual Agent Task Planner</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={handleOpenDeliverables}
              className="flex items-center space-x-2 px-4 py-2 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 group"
              title="View workflow deliverables"
            >
              <Download className="w-5 h-5 text-gray-300 group-hover:text-valhalla-gold transition-colors" />
              <span className="text-gray-300 group-hover:text-valhalla-gold text-sm font-medium">Deliverables</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/portal')}
              className="flex items-center space-x-2 px-4 py-2 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 group"
              title="Return to Portal"
            >
              <EyeOfMimirLogo size={32} className="group-hover:opacity-80 transition-opacity" />
              <span className="text-gray-300 group-hover:text-valhalla-gold text-sm font-medium">Portal</span>
            </button>
          </div>
        </header>

        {/* Prompt Input */}
        <div className="bg-norse-shadow border-b border-norse-rune px-6 py-4">
          <PromptInput />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Agent Palette */}
          <aside className="w-80 bg-norse-shadow border-r border-norse-rune overflow-y-auto scroll-container">
            <AgentPalette />
          </aside>

          {/* Center - Task Canvas */}
          <main className="flex-1 overflow-y-auto scroll-container">
            <TaskCanvas />
          </main>

          {/* Right Sidebar - Task Editor */}
          <aside className="w-96 bg-norse-shadow border-l border-norse-rune overflow-y-auto scroll-container">
            <TaskEditor />
          </aside>
        </div>
      </div>

      {/* Deliverables Modal */}
      {showDeliverablesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1f2e] border-2 border-valhalla-gold rounded-2xl p-6 max-w-4xl w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-valhalla-gold flex items-center space-x-2">
                <Download className="w-6 h-6" />
                <span>Workflow Deliverables</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowDeliverablesModal(false)}
                className="text-gray-400 hover:text-valhalla-gold transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <p className="text-gray-300 mb-4 text-sm">
              Download files generated by workflow executions from the Orchestration Studio.
            </p>

            <div className="flex-1 overflow-y-auto">
              {loadingExecutions ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-3 h-3 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-3 h-3 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              ) : recentExecutions.length === 0 ? (
                <div className="text-center py-12">
                  <FileDown className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">No workflow executions found</p>
                  <p className="text-gray-500 text-sm mt-2">Execute workflows in the Studio to generate deliverables</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentExecutions.map((exec: any) => {
                    const hasDeliverables = exec.deliverables && exec.deliverables.length > 0;
                    const executionDate = new Date(exec.startTime).toLocaleString();
                    const statusColor = exec.status === 'completed' ? 'text-green-400' : 
                                      exec.status === 'failed' ? 'text-red-400' : 
                                      exec.status === 'running' ? 'text-yellow-400' : 'text-gray-400';

                    return (
                      <div
                        key={exec.id}
                        className="bg-norse-shadow border-2 border-norse-rune rounded-xl p-4 hover:border-valhalla-gold/50 transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-100 font-mono">
                                {exec.id}
                              </h3>
                              <span className={`text-sm font-medium ${statusColor}`}>
                                {exec.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-400 mb-2">
                              {executionDate}
                            </p>
                            {hasDeliverables && (
                              <div className="mt-3 space-y-2">
                                <p className="text-sm text-valhalla-gold font-medium">
                                  {exec.deliverables.length} deliverable{exec.deliverables.length !== 1 ? 's' : ''}:
                                </p>
                                <div className="space-y-1">
                                  {exec.deliverables.map((file: any) => (
                                    <button
                                      key={file.filename}
                                      type="button"
                                      onClick={() => handleDownloadFile(exec.id, file.filename)}
                                      className="flex items-center space-x-2 text-sm text-gray-300 hover:text-valhalla-gold transition-colors w-full text-left p-2 rounded hover:bg-norse-rune/50"
                                    >
                                      <FileDown className="w-4 h-4 flex-shrink-0" />
                                      <span className="font-mono truncate">{file.filename}</span>
                                      <span className="text-xs text-gray-500 flex-shrink-0">
                                        ({(file.size / 1024).toFixed(1)} KB)
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          {hasDeliverables && (
                            <button
                              type="button"
                              onClick={() => handleDownloadAll(exec.id)}
                              className="flex items-center space-x-2 px-4 py-2 bg-valhalla-gold hover:bg-yellow-500 text-norse-night rounded-lg transition-all font-medium text-sm flex-shrink-0 ml-4"
                              title="Download all deliverables as ZIP"
                            >
                              <Download className="w-4 h-4" />
                              <span>Download All</span>
                            </button>
                          )}
                        </div>
                        {!hasDeliverables && (
                          <p className="text-sm text-gray-500 italic mt-2">
                            No deliverables generated
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6 pt-4 border-t border-norse-rune">
              <button
                type="button"
                onClick={() => setShowDeliverablesModal(false)}
                className="px-6 py-2 bg-norse-rune hover:bg-gray-700 border-2 border-norse-rune hover:border-gray-600 rounded-xl text-gray-300 hover:text-gray-100 text-sm font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DndProvider>
  );
}
