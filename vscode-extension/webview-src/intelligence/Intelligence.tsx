import React, { useState, useEffect, useCallback, useId } from 'react';
import './styles.css';

declare const vscode: any;

interface FolderInfo {
  id: string;
  path: string;
  hostPath?: string;
  fileCount: number;
  chunkCount: number;
  embeddingCount: number;
  status: 'active' | 'inactive' | 'stopped' | 'error';
  lastSync: string;
  patterns?: string[];
  isIndexing?: boolean;
  error?: string | null;
}

/**
 * Type guard to validate FolderInfo objects at runtime
 * Ensures all required fields exist before attempting to use folder data
 */
function isFolderInfo(obj: any): obj is FolderInfo {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    typeof obj.path === 'string' &&
    typeof obj.fileCount === 'number' &&
    typeof obj.chunkCount === 'number' &&
    typeof obj.embeddingCount === 'number' &&
    typeof obj.status === 'string' &&
    ['active', 'inactive', 'stopped', 'error'].includes(obj.status) &&
    typeof obj.lastSync === 'string'
  );
}

interface IndexingProgress {
  path: string;
  totalFiles: number;
  indexed: number;
  skipped: number;
  errored: number;
  currentFile?: string;
  status: 'queued' | 'indexing' | 'completed' | 'cancelled' | 'error';
  startTime?: number;
  endTime?: number;
}

interface IndexStats {
  totalFolders: number;
  totalFiles: number;
  totalChunks: number;
  totalEmbeddings: number;
  byType: Record<string, number>;
  byExtension: Record<string, number>;
}

interface SearchResult {
  id: string;
  type: string;
  title: string;
  path: string;
  absolute_path?: string;
  similarity: number;
  parent_file?: {
    path: string;
    absolute_path: string;
    name: string;
    language: string;
  };
}

export function Intelligence() {
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState('http://localhost:9042');
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Map<string, IndexingProgress>>(new Map());
  const [configReceived, setConfigReceived] = useState(false);
  
  // Memoize auth headers to prevent infinite loops
  const authHeadersRef = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    authHeadersRef.current = authHeaders;
  }, [authHeaders]);
  
  // Vector search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showSearchSettings, setShowSearchSettings] = useState(false);
  const [searchSettings, setSearchSettings] = useState({
    minSimilarity: 0.75,
    limit: 20
  });

  // Generate stable IDs for form inputs
  const minSimilarityId = useId();
  const searchLimitId = useId();

  const loadFolders = useCallback(async () => {
    try {
      const [foldersResponse, statusResponse] = await Promise.all([
        fetch(`${apiUrl}/api/indexed-folders`, { 
          headers: authHeadersRef.current
        }),
        fetch(`${apiUrl}/api/indexing-status`, { 
          headers: authHeadersRef.current
        }).catch(() => null)
      ]);
      
      if (!foldersResponse.ok) throw new Error(`HTTP ${foldersResponse.status}`);
      
      const foldersData = await foldersResponse.json() as any;
      let folders = foldersData.folders || [];
      
      // Validate folder data before processing
      folders = folders.filter((folder: any) => {
        if (!isFolderInfo(folder)) {
          console.error('[Intelligence] Invalid folder data received, missing required fields:', folder);
          return false;
        }
        return true;
      });
      
      // Merge indexing status if available
      if (statusResponse && statusResponse.ok) {
        const statusData = await statusResponse.json() as any;
        const statusMap = new Map(
          statusData.statuses?.map((s: any) => [s.path, s.isIndexing]) || []
        );
        
        folders = folders.map((folder: FolderInfo) => ({
          ...folder,
          isIndexing: statusMap.get(folder.path) || false
        }));
      }
      
      setFolders(folders);
    } catch (err: any) {
      console.error('Failed to load folders:', err);
      // Don't clear folders on error - keep existing data
      // setFolders([]);
    }
  }, [apiUrl]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/index-stats`, { 
        headers: authHeadersRef.current
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as any;
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
      // Don't clear stats on error - keep existing data
      // setStats(null);
    }
  }, [apiUrl]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadFolders(), loadStats()]);
    } catch (err: any) {
      console.error('[Intelligence] Failed to load data:', err);
      setError(`Network error: Unable to connect to server. Please check if the server is running.`);
      // Don't clear existing data on network errors
    } finally {
      setLoading(false);
    }
  }, [loadFolders, loadStats]);

  const performRemoveFolder = useCallback(async (id: string, path: string) => {
    console.log('[Intelligence] Performing deletion for ID:', id, 'path:', path);
    
    try {
      console.log('[Intelligence] Sending DELETE request to:', `${apiUrl}/api/indexed-folders`);
      const response = await fetch(`${apiUrl}/api/indexed-folders`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeadersRef.current },
        body: JSON.stringify({ id })
      });

      console.log('[Intelligence] DELETE response status:', response.status);

      if (!response.ok) {
        const error = await response.text();
        console.error('[Intelligence] DELETE request failed:', error);
        throw new Error(error);
      }

      console.log('[Intelligence] Folder deleted successfully');

      vscode.postMessage({ 
        command: 'showMessage', 
        type: 'info',
        message: `✅ Removed folder from indexing: ${path}` 
      });

      loadData();
    } catch (err: any) {
      console.error('[Intelligence] Error during deletion:', err);
      
      vscode.postMessage({ 
        command: 'showMessage', 
        type: 'error',
        message: `❌ Failed to remove folder: ${err.message}` 
      });
    }
  }, [apiUrl, loadData]);

  useEffect(() => {
    // Tell extension we're ready to receive config
    vscode.postMessage({ command: 'ready' });
    
    // Listen for messages from extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'config':
          console.log('[Intelligence] Received config:', message.apiUrl, 'Auth headers:', Object.keys(message.authHeaders || {}).length > 0 ? 'Present' : 'Empty');
          if (message.authHeaders && Object.keys(message.authHeaders).length > 0) {
            console.log('[Intelligence] Auth header keys:', Object.keys(message.authHeaders));
          }
          setApiUrl(message.apiUrl || 'http://localhost:9042');
          setAuthHeaders(message.authHeaders || {});
          setConfigReceived(true);
          break;
        case 'refresh':
          loadData();
          break;
        case 'removeFolderConfirmed':
          // Extension confirmed deletion, proceed with API call
          performRemoveFolder(message.id, message.path);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadData, performRemoveFolder]);

  // Load data once config is received (with or without auth headers)
  useEffect(() => {
    if (configReceived) {
      const hasAuth = Object.keys(authHeaders).length > 0;
      console.log(`[Intelligence] Config received (auth: ${hasAuth ? 'yes' : 'no'}), loading data`);
      loadData();
    }
  }, [configReceived, authHeaders, loadData]);

  // SSE connection for real-time indexing progress
  useEffect(() => {
    // Don't connect until we have the actual API URL from config
    if (!configReceived) {
      return;
    }

    // Build SSE URL with auth token as query parameter (EventSource can't send custom headers)
    let sseUrl = `${apiUrl}/api/indexing-progress`;
    
    // Extract Bearer token from Authorization header if present
    if (authHeadersRef.current?.Authorization) {
      const authHeader = authHeadersRef.current.Authorization;
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
      sseUrl += `?access_token=${encodeURIComponent(token)}`;
      console.log('[Intelligence] SSE connecting with auth token');
    } else {
      console.log('[Intelligence] SSE connecting without auth (security may be disabled)');
    }

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      if (event.data && event.data !== ': heartbeat') {
        try {
          const progress: IndexingProgress = JSON.parse(event.data);
          console.log('[Intelligence] Received progress for path:', progress.path, `(${progress.indexed}/${progress.totalFiles})`, `status: ${progress.status}`, progress.currentFile ? `file: ${progress.currentFile}` : '');
          
          setProgressMap((prev) => {
            const newMap = new Map(prev);
            newMap.set(progress.path, progress);
            console.log('[Intelligence] Updated progressMap, size:', newMap.size, 'keys:', Array.from(newMap.keys()));
            return newMap;
          });

          // Reload folder data when indexing completes
          if (progress.status === 'completed') {
            setTimeout(() => {
              loadFolders();
            }, 1000);
          }
        } catch (err) {
          console.error('[Intelligence] Failed to parse SSE data:', err);
        }
      }
    };

    eventSource.onerror = (err) => {
      console.error('[Intelligence] SSE connection error:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [apiUrl, loadFolders, configReceived, authHeaders]);

  const handleAddFolder = () => {
    // Ask extension to open folder picker
    vscode.postMessage({ command: 'selectFolder' });
  };

  const handleRemoveFolder = (id: string, path: string) => {
    console.log('[Intelligence] Delete button clicked for ID:', id, 'path:', path);
    
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      console.error('[Intelligence] ERROR: Invalid or missing folder ID!');
      vscode.postMessage({ 
        command: 'showMessage', 
        type: 'error',
        message: `❌ Cannot remove folder: invalid ID` 
      });
      return;
    }
    
    // Request confirmation from extension host (webviews can't use confirm())
    vscode.postMessage({ 
      command: 'confirmRemoveFolder',
      id: id,
      path: path
    });
  };

  const handleReactivateFolder = async (id: string, path: string) => {
    console.log('[Intelligence] Reactivate button clicked for ID:', id, 'path:', path);
    console.log('[Intelligence] ID type:', typeof id, 'ID value:', id);
    
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      console.error('[Intelligence] ERROR: Invalid or missing folder ID!');
      vscode.postMessage({ 
        command: 'showMessage', 
        type: 'error',
        message: `❌ Cannot reactivate: folder ID is missing` 
      });
      return;
    }
    
    try {
      const response = await fetch(`${apiUrl}/api/indexed-folders/reactivate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeadersRef.current },
        body: JSON.stringify({ id })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      vscode.postMessage({ 
        command: 'showMessage', 
        type: 'info',
        message: `✅ Reactivated watch: ${path}` 
      });

      loadData();
    } catch (err: any) {
      console.error('[Intelligence] Error reactivating watch:', err);
      
      vscode.postMessage({ 
        command: 'showMessage', 
        type: 'error',
        message: `❌ Failed to reactivate watch: ${err.message}` 
      });
    }
  };

  const handleRefresh = () => {
    loadData();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        query: searchQuery,
        limit: searchSettings.limit.toString(),
        min_similarity: searchSettings.minSimilarity.toString(),
        types: 'file' // Will be expanded to file,file_chunk by the server
      });

      const response = await fetch(`${apiUrl}/api/nodes/vector-search?${params}`, { 
        headers: authHeadersRef.current
      });
      const data = await response.json();

      if (response.ok) {
        setSearchResults(data.results || []);
      } else {
        setError(data.error || 'Search failed');
        setSearchResults([]);
      }
    } catch (err: any) {
      setError(`Search failed: ${err.message}`);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setHasSearched(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Clear results when input is cleared
    if (!value.trim()) {
      setSearchResults([]);
      setHasSearched(false);
    }
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return '✅';
      case 'inactive': return '⏸️';
      case 'stopped': return '🛑';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'stopped': return 'Stopped';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  const getTopExtensions = (byExtension: Record<string, number>) => {
    return Object.entries(byExtension)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  };

  return (
    <div className="intelligence-container">
      {/* Header */}
      <div className="intelligence-header">
        <div className="header-title">
          <span className="header-icon">🧠</span>
          <h1>Mimir Code Intelligence</h1>
        </div>
        <div className="header-subtitle">
          File indexing, chunking, and embedding management
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Vector Search */}
      <div className="search-container">
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="🔍 Search indexed files by content..."
            value={searchQuery}
            onChange={handleInputChange}
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
              <label htmlFor={minSimilarityId}>Min Similarity:</label>
              <input
                id={minSimilarityId}
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                value={searchSettings.minSimilarity}
                onChange={(e) => setSearchSettings(prev => ({ 
                  ...prev, 
                  minSimilarity: parseFloat(e.target.value) 
                }))}
              />
              <span className="setting-value">{searchSettings.minSimilarity.toFixed(2)}</span>
            </div>
            <div className="setting-item">
              <label htmlFor={searchLimitId}>Max Results:</label>
              <input
                id={searchLimitId}
                type="number"
                min="5"
                max="100"
                value={searchSettings.limit}
                onChange={(e) => setSearchSettings(prev => ({ 
                  ...prev, 
                  limit: parseInt(e.target.value) || 20 
                }))}
              />
              <span className="setting-value">{searchSettings.limit}</span>
            </div>
          </div>
        )}

        {hasSearched && (
          <div className="search-status">
            {isSearching ? (
              <span>🔍 Searching indexed files...</span>
            ) : searchResults.length > 0 ? (
              <span>✅ Found {searchResults.length} matching file{searchResults.length !== 1 ? 's' : ''}</span>
            ) : (
              <span>❌ No results found</span>
            )}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="search-results">
            <h3>Search Results</h3>
            {searchResults.map((result) => (
              <div key={result.id} className="search-result-item">
                <div className="result-header">
                  <span className="result-icon">📄</span>
                  <span className="result-title">{result.title || result.path}</span>
                  <span className="result-similarity" title="Similarity score">
                    {(result.similarity * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="result-path">
                  {result.parent_file?.absolute_path || result.absolute_path || result.path}
                </div>
                {result.parent_file && (
                  <div className="result-meta">
                    <span className="result-language">{result.parent_file.language}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Loading index data...</p>
          </div>
        </div>
      )}

      {/* Statistics Dashboard */}
      {stats && (
        <div className="stats-section">
          <h2>📊 Index Statistics</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📁</div>
              <div className="stat-value">{formatNumber(stats.totalFolders)}</div>
              <div className="stat-label">Folders Watched</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📄</div>
              <div className="stat-value">{formatNumber(stats.totalFiles)}</div>
              <div className="stat-label">Files Indexed</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🧩</div>
              <div className="stat-value">{formatNumber(stats.totalChunks)}</div>
              <div className="stat-label">Chunks Created</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🎯</div>
              <div className="stat-value">{formatNumber(stats.totalEmbeddings)}</div>
              <div className="stat-label">Embeddings Generated</div>
            </div>
          </div>
        </div>
      )}

      {/* Indexed Folders */}
      <div className="folders-section">
        <div className="section-header">
          <h2>📂 Indexed Folders</h2>
          <div className="section-actions">
            <button type="button" className="button-refresh" onClick={handleRefresh} title="Refresh">
              🔄 Refresh
            </button>
            <button type="button" className="button-primary" onClick={handleAddFolder}>
              + Add Folder
            </button>
          </div>
        </div>
        
        {folders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <p>No folders are currently being indexed</p>
            <p className="empty-hint">Click "Add Folder" to start indexing a workspace folder</p>
          </div>
        ) : (
          <div className="folders-list">
            {folders.map((folder) => {
              const progress = progressMap.get(folder.path);
              console.log('[Intelligence] Checking progress for folder.path:', folder.path, 'found:', progress ? 'YES' : 'NO', progress?.status);
              const isIndexing = progress?.status === 'indexing';
              const isQueued = progress?.status === 'queued';
              const isCompleted = progress?.status === 'completed';
              
              let statusClass = folder.status;
              if (isIndexing) statusClass += ' folder-indexing';
              if (isQueued) statusClass += ' folder-queued';
              if (isCompleted) statusClass += ' folder-completed';
              
              return (
                <div key={folder.path} className={`folder-item ${statusClass}`}>
                  <div className="folder-info">
                    <span className="folder-status" title={folder.status}>
                      {getStatusIcon(folder.status)}
                    </span>
                    <div className="folder-details">
                      <div className="folder-path">
                        {folder.hostPath || folder.path}
                        <span style={{ 
                          marginLeft: '8px', 
                          fontSize: '11px', 
                          color: folder.status === 'inactive' ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-foreground)',
                          opacity: folder.status === 'inactive' ? 0.7 : 1
                        }}>
                          ({getStatusLabel(folder.status)})
                        </span>
                        {isIndexing && progress && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '12px', 
                            color: 'var(--vscode-charts-blue)',
                            fontWeight: 'bold'
                          }}>
                            🔄 {progress.indexed}/{progress.totalFiles} ({progress.currentFile || '...'})
                          </span>
                        )}
                        {isQueued && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '12px', 
                            color: 'var(--vscode-charts-orange)',
                            fontWeight: 'bold'
                          }}>
                            ⏳ Queued...
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '12px', 
                            color: 'var(--vscode-charts-green)',
                            fontWeight: 'bold'
                          }}>
                            ✅ Complete ({progress.indexed} indexed, {progress.skipped} skipped, {progress.errored} errors)
                          </span>
                        )}
                        {folder.status === 'inactive' && folder.error && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '11px', 
                            color: 'var(--vscode-errorForeground)',
                            fontStyle: 'italic'
                          }}>
                            ({folder.error})
                          </span>
                        )}
                      </div>
                    <div className="folder-stats">
                      <span title="Files">📄 {formatNumber(folder.fileCount)}</span>
                      <span title="Chunks">🧩 {formatNumber(folder.chunkCount)}</span>
                      <span title="Embeddings">🎯 {formatNumber(folder.embeddingCount)}</span>
                      {folder.lastSync && (
                        <span title="Last synced" className="folder-sync">
                          ⏰ {formatDate(folder.lastSync)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="folder-actions">
                  {folder.status === 'inactive' ? (
                    <>
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => handleReactivateFolder(folder.id, folder.path)}
                        title="Reactivate this watch"
                        style={{ marginRight: '8px' }}
                      >
                        ▶️ Reactivate
                      </button>
                      <button
                        type="button"
                        className="button-danger"
                        onClick={() => handleRemoveFolder(folder.id, folder.path)}
                        title="Permanently remove from indexing"
                      >
                        🗑️ Delete
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => handleRemoveFolder(folder.id, folder.path)}
                      title={folder.isIndexing ? 'Cancel indexing and remove folder' : 'Remove from indexing'}
                    >
                      {folder.isIndexing ? '🛑 Cancel & Remove' : '🗑️ Remove'}
                    </button>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* File Type Breakdown */}
      {stats && stats.byExtension && Object.keys(stats.byExtension).length > 0 && (
        <div className="breakdown-section">
          <h2>📋 File Type Breakdown</h2>
          <div className="breakdown-list">
            {getTopExtensions(stats.byExtension).map(([ext, count]) => {
              const percentage = ((count / stats.totalFiles) * 100).toFixed(1);
              return (
                <div key={ext} className="breakdown-row">
                  <div className="breakdown-info">
                    <span className="breakdown-ext">{ext || '(no extension)'}</span>
                    <span className="breakdown-count">
                      {formatNumber(count)} files ({percentage}%)
                    </span>
                  </div>
                  <div className="breakdown-bar-container">
                    <div 
                      className="breakdown-bar" 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="intelligence-footer">
        <p>💡 Tip: Only folders within your mounted workspace can be indexed</p>
      </div>
    </div>
  );
}
