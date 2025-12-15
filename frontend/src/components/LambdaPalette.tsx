import { useState, useMemo } from 'react';
import { useDrag } from 'react-dnd';
import { usePlanStore } from '../store/planStore';
import { Lambda } from '../types/task';
import { GripVertical, Plus, Eye, Trash2, Code2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { CreateModal } from './CreateModal';

interface DraggableLambdaProps {
  lambda: Lambda;
  onViewDetails: (lambda: Lambda) => void;
  onDelete: (lambdaId: string) => void;
}

function DraggableLambda({ lambda, onViewDetails, onDelete }: DraggableLambdaProps) {
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: 'lambda',
    item: lambda,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [lambda]);

  const isDefault = lambda.id.startsWith('default-');
  
  // Hide default preview
  preview(null as any, { captureDraggingState: true });

  // Language badge colors
  const getLangStyle = () => {
    switch (lambda.language) {
      case 'typescript':
        return 'bg-blue-600 text-white';
      case 'python':
        return 'bg-yellow-600 text-white';
      case 'javascript':
        return 'bg-yellow-500 text-black';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  return (
    <div
      ref={drag}
      className={`p-3 bg-gradient-to-br from-violet-950/50 to-norse-stone border-2 border-violet-700/50 rounded-lg hover:border-violet-400 hover:shadow-lg hover:shadow-violet-500/20 transition-all ${
        isDragging ? 'opacity-50' : ''
      } cursor-move`}
    >
      <div className="flex items-start space-x-3">
        <GripVertical className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-2">
              <Code2 className="w-4 h-4 text-violet-400" />
              <h3 className="font-semibold text-gray-100 text-sm">{lambda.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getLangStyle()}`}>
                {lambda.language === 'typescript' ? 'TS' : lambda.language === 'javascript' ? 'JS' : 'PY'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(lambda);
                }}
                className="p-1 text-gray-400 hover:text-violet-400 transition-colors"
                title="View details"
              >
                <Eye className="w-4 h-4" />
              </button>
              {!isDefault && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete Lambda "${lambda.name}"?`)) {
                      onDelete(lambda.id);
                    }
                  }}
                  className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                  title="Delete lambda"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 line-clamp-2">
            {lambda.description}
          </p>
        </div>
      </div>
    </div>
  );
}

// Lambda Details Modal
interface LambdaDetailsModalProps {
  lambda: Lambda;
  onClose: () => void;
}

function LambdaDetailsModal({ lambda, onClose }: LambdaDetailsModalProps) {
  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" 
      onClick={onClose}
      onKeyDown={handleBackdropKeyDown}
      tabIndex={-1}
    >
      <div 
        className="bg-norse-shadow border border-norse-rune rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Code2 className="w-6 h-6 text-violet-400" />
            <h2 className="text-xl font-bold text-valhalla-gold">{lambda.name}</h2>
          </div>
          <span className={`px-3 py-1 rounded text-sm font-medium ${
            lambda.language === 'typescript' ? 'bg-blue-600 text-white' :
            lambda.language === 'python' ? 'bg-yellow-600 text-white' :
            'bg-yellow-500 text-black'
          }`}>
            {lambda.language}
          </span>
        </div>
        
        <p className="text-gray-300 mb-4">{lambda.description}</p>
        
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-violet-400 mb-2">Script</h3>
          <pre className="bg-norse-night border border-norse-rune rounded-lg p-4 overflow-x-auto text-sm text-gray-300 font-mono">
            {lambda.script}
          </pre>
        </div>
        
        <div className="flex justify-between text-xs text-gray-500">
          <span>Version: {lambda.version}</span>
          <span>Created: {new Date(lambda.created).toLocaleDateString()}</span>
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-norse-rune text-gray-200 rounded-lg hover:bg-norse-stone transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function LambdaPalette() {
  const { lambdas, deleteLambda } = usePlanStore();
  const [viewingLambda, setViewingLambda] = useState<Lambda | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);  // Collapsed by default
  const [searchQuery, setSearchQuery] = useState('');

  // Filter lambdas by search query
  const filteredLambdas = useMemo(() => {
    if (!searchQuery.trim()) return lambdas;
    const query = searchQuery.toLowerCase();
    return lambdas.filter(lambda => 
      lambda.name.toLowerCase().includes(query) ||
      lambda.description.toLowerCase().includes(query) ||
      lambda.language.toLowerCase().includes(query)
    );
  }, [lambdas, searchQuery]);

  return (
    <div 
      className={`flex flex-col transition-all duration-300 ease-in-out ${
        isExpanded ? 'max-h-[70vh]' : 'max-h-12'
      }`}
    >
      {/* Header - Always visible, acts as toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-4 py-2.5 hover:bg-norse-rune/30 transition-colors flex-shrink-0"
      >
        <div className="flex items-center space-x-2 text-violet-400">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <Code2 className="w-4 h-4" />
          <span className="text-sm font-semibold uppercase tracking-wide">λ Lambdas</span>
          <span className="text-xs text-gray-500">({lambdas.length})</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsCreateModalOpen(true);
          }}
          className="p-1.5 bg-violet-600 text-white rounded hover:bg-violet-500 transition-colors"
          title="Create Lambda"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </button>

      {/* Expandable Content */}
      <div 
        className={`flex-1 min-h-0 flex flex-col transition-all duration-300 ${
          isExpanded ? 'opacity-100' : 'opacity-0 h-0'
        }`}
      >
        {/* Search Input */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search lambdas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-norse-shadow border border-norse-rune rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500"
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 px-4 mb-2 flex-shrink-0">
          Drag lambdas onto Transformer nodes to add data transformation logic.
        </p>

        {/* Lambda List - Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-2">
            {filteredLambdas.map((lambda) => (
              <DraggableLambda
                key={lambda.id}
                lambda={lambda}
                onViewDetails={setViewingLambda}
                onDelete={deleteLambda}
              />
            ))}
          </div>

          {filteredLambdas.length === 0 && lambdas.length > 0 && (
            <div className="text-center py-6 text-gray-500">
              <Search className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No lambdas match "{searchQuery}"</p>
            </div>
          )}

          {lambdas.length === 0 && (
            <div className="text-center py-6 text-gray-500">
              <Code2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No lambdas yet</p>
              <p className="text-xs mt-1">Click + to create one</p>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {viewingLambda && (
        <LambdaDetailsModal
          lambda={viewingLambda}
          onClose={() => setViewingLambda(null)}
        />
      )}

      {/* Create Modal */}
      <CreateModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)}
        initialTab="lambda"
      />
    </div>
  );
}
