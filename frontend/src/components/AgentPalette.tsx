import { useState, useEffect, useRef } from 'react';
import { useDrag } from 'react-dnd';
import { usePlanStore } from '../store/planStore';
import { AgentTemplate } from '../types/task';
import { GripVertical, Plus, Search, Eye, Trash2 } from 'lucide-react';
import { CreateAgentModal } from './CreateAgentModal';
import { AgentDetailsModal } from './AgentDetailsModal';

interface DraggableAgentProps {
  agent: AgentTemplate;
  isOperating: boolean;
  onViewDetails: (agent: AgentTemplate) => void;
  onDelete: (agentId: string) => void;
}

function DraggableAgent({ agent, isOperating, onViewDetails, onDelete }: DraggableAgentProps) {
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: 'agent',
    item: agent,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [agent]);

  const isDefault = agent.id.startsWith('default-');
  
  // Hide default preview, we'll show custom preview in TaskCanvas
  preview(null as any, { captureDraggingState: true });

  return (
    <div
      ref={drag}
      className={`p-4 bg-norse-stone border-2 border-norse-rune rounded-lg hover:border-valhalla-gold hover:shadow-lg hover:shadow-valhalla-gold/20 transition-all ${
        isDragging ? 'opacity-50' : ''
      } ${isOperating ? 'opacity-50 pointer-events-none' : 'cursor-move'}`}
    >
      <div className="flex items-start space-x-3">
        <GripVertical className="w-4 h-4 text-gray-500 flex-shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-100 text-sm">{agent.name}</h3>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                agent.agentType === 'qc' 
                  ? 'bg-magic-rune text-gray-100' 
                  : 'bg-frost-ice text-norse-night'
              }`}>
                {agent.agentType === 'qc' ? 'QC' : 'Worker'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(agent);
                }}
                className="p-1 text-gray-400 hover:text-frost-ice transition-colors"
                title="View details"
              >
                <Eye className="w-4 h-4" />
              </button>
              {!isDefault && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(agent.id);
                  }}
                  disabled={isOperating}
                  className="p-1 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                  title="Delete agent"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 line-clamp-2">
            {agent.role}
          </p>
          <div className="mt-2 text-xs text-gray-500">
            v{agent.version}
            {isOperating && <span className="ml-2 text-valhalla-gold">Processing...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentPalette() {
  const { 
    agentTemplates, 
    agentSearch,
    hasMoreAgents, 
    isLoadingAgents,
    isCreatingAgent,
    fetchAgents,
    setAgentSearch,
    deleteAgent,
    selectedAgent,
    setSelectedAgent,
    agentOperations,
  } = usePlanStore();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  
  const handleViewDetails = (agent: AgentTemplate) => {
    setSelectedAgent(agent);
  };
  
  const handleDelete = async (agentId: string) => {
    try {
      await deleteAgent(agentId);
    } catch (error) {
      console.error('Failed to delete agent:', error);
    }
  };

  // Initial load
  useEffect(() => {
    fetchAgents(undefined, true);
  }, [fetchAgents]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== agentSearch) {
        setAgentSearch(searchInput);
        fetchAgents(searchInput, true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, agentSearch, setAgentSearch, fetchAgents]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreAgents && !isLoadingAgents) {
          fetchAgents();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMoreAgents, isLoadingAgents, fetchAgents]);

  const workerAgents = agentTemplates.filter(a => a.agentType === 'worker');
  const qcAgents = agentTemplates.filter(a => a.agentType === 'qc');

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Loading indicator bar */}
        {isLoadingAgents && (
          <div className="h-1 bg-norse-stone overflow-hidden">
            <div className="h-full bg-gradient-to-r from-valhalla-gold via-valhalla-amber to-valhalla-gold animate-shimmer bg-[length:200%_100%]" />
          </div>
        )}

        {/* Header with search and create button */}
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-valhalla-gold">Agent Library</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {agentTemplates.length} agents {isLoadingAgents && '(loading...)'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              disabled={isCreatingAgent}
              className="p-2 bg-valhalla-gold text-norse-night rounded-lg hover:bg-valhalla-amber transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed relative"
              title={isCreatingAgent ? "Creating agent..." : "Create new agent"}
            >
              {isCreatingAgent ? (
                <div className="animate-spin h-5 w-5 border-2 border-norse-night border-t-transparent rounded-full" />
              ) : (
                <Plus className="w-5 h-5 font-bold" />
              )}
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-norse-stone border-2 border-norse-rune text-gray-100 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-valhalla-gold focus:border-valhalla-gold"
            />
          </div>
        </div>

        {/* Scrollable agent list */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6">
          {workerAgents.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-frost-ice uppercase tracking-wide">
                Worker Agents ({workerAgents.length})
              </h3>
              <div className="space-y-2">
                {workerAgents.map((agent) => (
                  <DraggableAgent 
                    key={agent.id} 
                    agent={agent}
                    isOperating={!!agentOperations[agent.id]}
                    onViewDetails={handleViewDetails}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {qcAgents.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-magic-spell uppercase tracking-wide">
                QC Agents ({qcAgents.length})
              </h3>
              <div className="space-y-2">
                {qcAgents.map((agent) => (
                  <DraggableAgent 
                    key={agent.id} 
                    agent={agent}
                    isOperating={!!agentOperations[agent.id]}
                    onViewDetails={handleViewDetails}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {isLoadingAgents && agentTemplates.length > 0 && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin h-5 w-5 border-2 border-valhalla-gold border-t-transparent rounded-full" />
            </div>
          )}

          {!isLoadingAgents && agentTemplates.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-base font-medium mb-2">No agents found</p>
              <p className="text-sm">Try adjusting your search or create a new agent</p>
            </div>
          )}

          {/* Infinite scroll trigger */}
          <div ref={observerTarget} className="h-4" />
        </div>
      </div>

      <CreateAgentModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />
      
      <AgentDetailsModal 
        agent={selectedAgent} 
        onClose={() => setSelectedAgent(null)} 
      />
    </>
  );
}
