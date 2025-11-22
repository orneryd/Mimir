import React, { useState, useEffect, useCallback } from 'react';
import './styles.css';

// VSCode API is acquired globally in main.tsx
declare const vscode: any;

interface NodeType {
  type: string;
  count: number;
}

interface Node {
  id: string;
  type: string;
  displayName: string;
  created: string;
  updated: string;
  edgeCount: number;
  embeddingCount: number;
  properties: Record<string, any>;
}

interface NodeDetails {
  node: {
    id: string;
    type: string;
    properties: Record<string, any>;
  };
  edges: {
    outgoing: Array<{
      type: string;
      targetId: string;
      targetType: string;
      targetName: string;
      properties: Record<string, any>;
    }>;
    incoming: Array<{
      type: string;
      sourceId: string;
      sourceType: string;
      sourceName: string;
      properties: Record<string, any>;
    }>;
    total: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function NodeManager() {
  const [apiUrl, setApiUrl] = useState<string>('');
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});
  const authHeadersRef = React.useRef<Record<string, string>>({});
  const [types, setTypes] = useState<NodeType[]>([]);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Record<string, Node[]>>({});
  const [pagination, setPagination] = useState<Record<string, Pagination>>({});
  const [selectedNode, setSelectedNode] = useState<NodeDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<string[]>([]); // Node IDs
  const [searchResultNodes, setSearchResultNodes] = useState<Record<string, Node[]>>({}); // Full nodes by type
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchSettings, setShowSearchSettings] = useState(false);
  const [searchSettings, setSearchSettings] = useState({
    minSimilarity: 0.75,
    limit: 50,
    types: [] as string[]
  });

  const loadTypes = useCallback(async () => {
    if (!apiUrl) {
      console.warn('[NodeManager] Cannot load types - apiUrl not set');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      console.log('[NodeManager] Loading types with auth headers:', Object.keys(authHeadersRef.current).length > 0 ? 'Present' : 'Empty');
      const response = await fetch(`${apiUrl}/api/nodes/types`, {
        headers: authHeadersRef.current
      });
      const data = await response.json();
      
      if (response.ok) {
        setTypes(data.types);
      } else {
        setError(data.error || 'Failed to load node types');
      }
    } catch (err: any) {
      setError(`Failed to load types: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // Don't auto-load types - wait for config message with auth headers
  // loadTypes will be called from the config message handler after both apiUrl and authHeaders are set


  const loadNodesForType = useCallback(async (type: string, page: number = 1) => {
    if (!apiUrl) {
      console.warn('[NodeManager] Cannot load nodes - apiUrl not set');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const url = `${apiUrl}/api/nodes/types/${encodeURIComponent(type)}?page=${page}&limit=20`;
      console.log(`[NodeManager] Fetching nodes for type "${type}" from:`, url);
      
      const response = await fetch(url, {
        headers: authHeadersRef.current
      });
      const data = await response.json();
      
      console.log(`[NodeManager] Response for type "${type}":`, { status: response.status, data });
      
      if (response.ok) {
        setNodes(prev => ({ ...prev, [type]: data.nodes }));
        setPagination(prev => ({ ...prev, [type]: data.pagination }));
      } else {
        const errorMsg = data.error || `Failed to load ${type} nodes`;
        setError(errorMsg);
        console.error(`[NodeManager] API error for type "${type}":`, errorMsg);
      }
    } catch (err: any) {
      const errorMsg = `Failed to load ${type} nodes: ${err.message}`;
      setError(errorMsg);
      console.error(`[NodeManager] Error loading ${type} nodes:`, err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);
  
  const handleDeleteNode = useCallback(async (nodeId: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${apiUrl}/api/nodes/${encodeURIComponent(nodeId)}`, {
        method: 'DELETE',
        headers: authHeadersRef.current
      });
      const data = await response.json();
      
      if (response.ok) {
        vscode.postMessage({ 
          command: 'showInfo',
          message: `Node deleted successfully (${data.deleted.edgesRemoved} edges removed)`
        });
        
        // Clear selected node if it was the deleted one
        if (selectedNode?.node.id === nodeId) {
          setSelectedNode(null);
        }
        
        // Reload types and current list
        loadTypes();
        if (expandedType) {
          loadNodesForType(expandedType, pagination[expandedType]?.page || 1);
        }
      } else {
        setError(data.error || 'Failed to delete node');
      }
    } catch (err: any) {
      setError('Failed to delete node');
      console.error('Error deleting node:', err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, selectedNode, expandedType, pagination, loadTypes, loadNodesForType]);

  // Message listener for extension host communication
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      if (message.command === 'config') {
        console.log('[NodeManager] Received config:', message.config.apiUrl, 'Auth headers:', Object.keys(message.authHeaders || {}).length > 0 ? 'Present' : 'Empty');
        if (message.authHeaders && Object.keys(message.authHeaders).length > 0) {
          console.log('[NodeManager] Auth header keys:', Object.keys(message.authHeaders));
        }
        const newApiUrl = message.config.apiUrl;
        setApiUrl(newApiUrl);
        setAuthHeaders(message.authHeaders || {});
        
        // Manually trigger loadTypes after setting both apiUrl and authHeaders
        // This ensures authHeadersRef is updated before the fetch call
        setTimeout(() => {
          if (newApiUrl) {
            console.log('[NodeManager] Triggering loadTypes with URL:', newApiUrl);
            loadTypes();
          } else {
            console.warn('[NodeManager] No apiUrl provided, skipping loadTypes');
          }
        }, 0);
      } else if (message.command === 'deleteConfirmed') {
        handleDeleteNode(message.nodeId);
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Signal that we're ready
    vscode.postMessage({ command: 'ready' });

    return () => window.removeEventListener('message', handleMessage);
  }, [handleDeleteNode]);

  // Sync authHeaders to ref
  React.useEffect(() => {
    authHeadersRef.current = authHeaders;
  }, [authHeaders]);


  const loadNodeDetails = async (type: string, id: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${apiUrl}/api/nodes/types/${encodeURIComponent(type)}/${encodeURIComponent(id)}/details`, {
        headers: authHeadersRef.current
      });
      const data = await response.json();
      
      if (response.ok) {
        setSelectedNode(data);
      } else {
        setError(data.error || 'Failed to load node details');
      }
    } catch (err: any) {
      setError('Failed to load node details');
      console.error('Error loading node details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeClick = (type: string) => {
    if (expandedType === type) {
      setExpandedType(null);
      setSelectedNode(null);
    } else {
      setExpandedType(type);
      setSelectedNode(null);
      
      // If search is active and we have cached results, use them
      if (searchResults.length > 0 && searchResultNodes[type]) {
        setNodes(prev => ({
          ...prev,
          [type]: searchResultNodes[type]
        }));
      } else if (searchResults.length === 0) {
        // No search active - fetch from API
        loadNodesForType(type);
      }
      // If search is active but no results for this type, nodes[type] will remain undefined
    }
  };

  const handleNodeClick = (node: Node) => {
    loadNodeDetails(node.type, node.id);
  };

  const handleDeleteClick = (node: Node, event: React.MouseEvent) => {
    event.stopPropagation();
    vscode.postMessage({
      command: 'confirmDelete',
      nodeId: node.id,
      nodeType: node.type
    });
  };

  const handleGenerateEmbeddings = async (node: Node, event: React.MouseEvent) => {
    event.stopPropagation();
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${apiUrl}/api/nodes/${encodeURIComponent(node.id)}/embeddings`, {
        method: 'POST',
        headers: authHeadersRef.current
      });
      const data = await response.json();
      
      if (response.ok) {
        vscode.postMessage({
          command: 'showInfo',
          message: data.message
        });
        
        // Reload the list to update embedding counts
        if (expandedType) {
          loadNodesForType(expandedType, pagination[expandedType]?.page || 1);
        }
      } else {
        setError(data.error || 'Failed to generate embeddings');
      }
    } catch (err: any) {
      setError(`Failed to generate embeddings: ${err.message}`);
      console.error('Error generating embeddings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadNode = (node: Node, event: React.MouseEvent) => {
    event.stopPropagation();
    
    // Send message to extension host to save the file
    vscode.postMessage({
      command: 'downloadNode',
      node: {
        id: node.id,
        type: node.type,
        displayName: node.displayName,
        created: node.created,
        updated: node.updated,
        edgeCount: node.edgeCount,
        embeddingCount: node.embeddingCount,
        properties: node.properties
      }
    });
  };

  const handleSearch = async () => {
    console.log('[NodeManager] handleSearch called, query:', searchQuery);
    
    if (!searchQuery.trim()) {
      // Clear search - show all nodes
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      console.log('[NodeManager] Starting vector search with auth headers:', Object.keys(authHeadersRef.current).length > 0 ? 'Present' : 'Empty');
      
      const params = new URLSearchParams({
        query: searchQuery,
        limit: searchSettings.limit.toString(),
        min_similarity: searchSettings.minSimilarity.toString()
      });

      // Determine types to search
      let typesToSearch = searchSettings.types;
      if (typesToSearch.length === 0) {
        // If no types selected, search all types EXCEPT files and chunks
        typesToSearch = types
          .map(t => t.type)
          .filter(t => t !== 'file' && t !== 'file_chunk' && t !== 'node_chunk');
      } else {
        // Filter out files and chunks from selected types
        typesToSearch = typesToSearch.filter(t => t !== 'file' && t !== 'file_chunk' && t !== 'node_chunk');
      }

      if (typesToSearch.length > 0) {
        params.append('types', typesToSearch.join(','));
      }

      console.log('[NodeManager] Fetching:', `${apiUrl}/api/nodes/vector-search?${params}`);
      
      const response = await fetch(`${apiUrl}/api/nodes/vector-search?${params}`, {
        headers: authHeadersRef.current
      });
      
      console.log('[NodeManager] Response status:', response.status);
      const data = await response.json();

      if (response.ok) {
        // Extract node IDs and organize full nodes by type
        const nodeIds = data.results.map((r: any) => r.id);
        const nodesByType: Record<string, Node[]> = {};
        
        data.results.forEach((r: any) => {
          const node: Node = {
            id: r.id,
            type: r.type,
            displayName: r.title || r.name || r.id,
            created: r.created || '',
            updated: r.updated || '',
            edgeCount: 0, // We don't have this from search
            embeddingCount: 0, // We don't have this from search
            properties: r.props || {}
          };
          
          if (!nodesByType[r.type]) {
            nodesByType[r.type] = [];
          }
          nodesByType[r.type].push(node);
        });
        
        setSearchResults(nodeIds);
        setSearchResultNodes(nodesByType);
      } else {
        setError(data.error || 'Search failed');
        setSearchResults([]);
        setSearchResultNodes({});
      }
    } catch (err: any) {
      setError(`Search failed: ${err.message}`);
      setSearchResults([]);
      setSearchResultNodes({});
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchResultNodes({});
    setIsSearching(false);
  };

  // Filter nodes based on search results
  const filterNodesBySearch = (nodeList: Node[]) => {
    if (searchResults.length === 0 && searchQuery.trim() === '') {
      // No search active - show all nodes
      return nodeList;
    }
    if (searchResults.length === 0 && searchQuery.trim() !== '') {
      // Search active but no results
      return [];
    }
    // Filter by search results
    return nodeList.filter(node => searchResults.includes(node.id));
  };

  const handlePageChange = (type: string, newPage: number) => {
    loadNodesForType(type, newPage);
  };

  const handleBackToList = () => {
    setSelectedNode(null);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined) return 'null';
    
    // Truncate embedding arrays
    if (key === 'embedding' && Array.isArray(value) && value.length > 0) {
      const preview = value.slice(0, 5);
      return `[${preview.join(', ')}, ... (${value.length} dimensions)]`;
    }
    
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  return (
    <div className="node-manager">
      <div className="header">
        <h1>📊 Node Manager</h1>
        <p className="subtitle">Browse and manage nodes in your knowledge graph</p>
        {error && <div className="error-banner">{error}</div>}
      </div>

      {/* Vector Search */}
      <div className="search-container">
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="🔍 Vector search nodes by meaning..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
              }
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={clearSearch}
              title="Clear search"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            className="search-btn"
            onClick={handleSearch}
            disabled={isSearching}
            title="Search"
          >
            {isSearching ? '⏳' : '🔍'}
          </button>
          <button
            type="button"
            className="settings-btn"
            onClick={() => setShowSearchSettings(!showSearchSettings)}
            title="Search settings"
          >
            ⚙️
          </button>
        </div>

        {showSearchSettings && (
          <div className="search-settings">
            <div className="setting-item">
              <label htmlFor="min-similarity">Min Similarity:</label>
              <input
                id={`min-similarity-${Math.random()}`}
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={searchSettings.minSimilarity}
                onChange={(e) => setSearchSettings({
                  ...searchSettings,
                  minSimilarity: parseFloat(e.target.value)
                })}
              />
              <span className="setting-value">{searchSettings.minSimilarity}</span>
            </div>
            <div className="setting-item">
              <label htmlFor="search-limit">Max Results:</label>
              <input
                id={`search-limit-${Math.random()}`}
                type="number"
                min="1"
                max="100"
                value={searchSettings.limit}
                onChange={(e) => setSearchSettings({
                  ...searchSettings,
                  limit: parseInt(e.target.value, 10)
                })}
              />
              <span className="setting-value">{searchSettings.limit}</span>
            </div>
            <div className="setting-item">
              <label htmlFor="node-types">Node Types:</label>
              <select
                id={`node-types-${Math.random()}`}
                multiple
                value={searchSettings.types}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setSearchSettings({
                    ...searchSettings,
                    types: selected
                  });
                }}
              >
                {types.map(t => (
                  <option key={t.type} value={t.type}>{t.type}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {searchQuery && (
          <div className="search-status">
            {isSearching ? (
              <span>Searching...</span>
            ) : searchResults.length > 0 ? (
              <span>Found {searchResults.length} matching nodes</span>
            ) : (
              <span>No results found</span>
            )}
          </div>
        )}
      </div>

      {loading && !types.length && (
        <div className="loading">Loading node types...</div>
      )}

      {!selectedNode ? (
        <div className="types-container">
          {types.map(nodeType => (
            <div key={nodeType.type} className="type-section">
              <div 
                className={`type-header ${expandedType === nodeType.type ? 'expanded' : ''}`}
                onClick={() => handleTypeClick(nodeType.type)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTypeClick(nodeType.type); }}
                role="button"
                tabIndex={0}
              >
                <span className="type-icon">{expandedType === nodeType.type ? '▼' : '▶'}</span>
                <span className="type-name">{nodeType.type}</span>
                <span className="type-count">
                  {searchResults.length > 0 
                    ? `${searchResultNodes[nodeType.type]?.length || 0}/${nodeType.count}`
                    : nodeType.count}
                </span>
              </div>

              {expandedType === nodeType.type && (
                <div className="nodes-list">
                  {loading && !nodes[nodeType.type]?.length ? (
                    <div className="loading-small">Loading nodes...</div>
                  ) : (
                    <>
                      {filterNodesBySearch(nodes[nodeType.type] || []).map(node => (
                        <div 
                          key={node.id}
                          className="node-item"
                          onClick={() => handleNodeClick(node)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNodeClick(node); }}
                          role="button"
                          tabIndex={0}
                        >
                          <button
                            type="button"
                            className="download-btn"
                            onClick={(e) => handleDownloadNode(node, e)}
                            title="Download node as JSON"
                          >
                            📥
                          </button>
                          <div className="node-main">
                            <div className="node-name">{node.displayName}</div>
                            <div className="node-meta">
                              <span className="node-id">{node.id}</span>
                              <span className="node-edges">🔗 {node.edgeCount} edges</span>
                              <span className="node-embeddings">
                                🧠 {node.embeddingCount} embedding{node.embeddingCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="node-dates">
                              <span>Updated: {formatDate(node.updated)}</span>
                            </div>
                          </div>
                          <div className="node-actions">
                            <button 
                              type="button"
                              className="embeddings-btn"
                              onClick={(e) => handleGenerateEmbeddings(node, e)}
                              title={node.embeddingCount > 0 ? "Regenerate embeddings" : "Generate embeddings"}
                            >
                              ✨
                            </button>
                            <button 
                              type="button"
                              className="delete-btn"
                              onClick={(e) => handleDeleteClick(node, e)}
                              title="Delete node and all its edges"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}

                      {pagination[nodeType.type] && pagination[nodeType.type].totalPages > 1 && (
                        <div className="pagination">
                          <button 
                            type="button"
                            disabled={pagination[nodeType.type].page === 1}
                            onClick={() => handlePageChange(nodeType.type, pagination[nodeType.type].page - 1)}
                          >
                            ← Previous
                          </button>
                          <span className="page-info">
                            Page {pagination[nodeType.type].page} of {pagination[nodeType.type].totalPages}
                          </span>
                          <button 
                            type="button"
                            disabled={pagination[nodeType.type].page === pagination[nodeType.type].totalPages}
                            onClick={() => handlePageChange(nodeType.type, pagination[nodeType.type].page + 1)}
                          >
                            Next →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="node-detail">
          <div className="detail-header">
            <button type="button" className="back-btn" onClick={handleBackToList}>
              ← Back to List
            </button>
            <h2>{selectedNode.node.properties.title || selectedNode.node.properties.name || selectedNode.node.id}</h2>
          </div>

          <div className="detail-section">
            <h3>Node Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">ID:</span>
                <span className="detail-value">{selectedNode.node.id}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Type:</span>
                <span className="detail-value">{selectedNode.node.type}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Edges:</span>
                <span className="detail-value">{selectedNode.edges.total}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>Properties</h3>
            <div className="properties-list">
              {Object.entries(selectedNode.node.properties).map(([key, value]) => (
                <div key={key} className="property-item">
                  <span className="property-key">{key}:</span>
                  <pre className="property-value">{formatValue(key, value)}</pre>
                </div>
              ))}
            </div>
          </div>

          {selectedNode.edges.outgoing.length > 0 && (
            <div className="detail-section">
              <h3>Outgoing Edges ({selectedNode.edges.outgoing.length})</h3>
              <div className="edges-list">
                {selectedNode.edges.outgoing.map((edge, idx) => (
                  <div key={`${edge.type}-${edge.targetId}-${idx}`} className="edge-item">
                    <div className="edge-type">[{edge.type}]</div>
                    <div className="edge-target">
                      → {edge.targetName} <span className="edge-target-type">({edge.targetType})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedNode.edges.incoming.length > 0 && (
            <div className="detail-section">
              <h3>Incoming Edges ({selectedNode.edges.incoming.length})</h3>
              <div className="edges-list">
                {selectedNode.edges.incoming.map((edge, idx) => (
                  <div key={`${edge.type}-${edge.sourceId}-${idx}`} className="edge-item">
                    <div className="edge-type">[{edge.type}]</div>
                    <div className="edge-source">
                      ← {edge.sourceName} <span className="edge-source-type">({edge.sourceType})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
