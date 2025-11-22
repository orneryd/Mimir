import React, { useState, useRef, useEffect } from 'react';
import './styles.css';

declare const vscode: any;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: AttachedFile[];
}

interface AttachedFile {
  name: string;
  size: number;
  type: string;
  content: string; // base64 encoded
}

interface VectorSearchSettings {
  enabled: boolean;
  limit: number;
  minSimilarity: number;
  depth: number;
  types: string[];
}

export function Portal() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState('http://localhost:9042');
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});
  const authHeadersRef = React.useRef<Record<string, string>>({});
  const [model, setModel] = useState('gpt-4.1');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [showVectorModal, setShowVectorModal] = useState(false);
  const [vectorSettings, setVectorSettings] = useState<VectorSearchSettings>({
    enabled: true,
    limit: 10,
    minSimilarity: 0.8,
    depth: 1,
    types: ['memory', 'file_chunk']
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Sync authHeaders to ref
  React.useEffect(() => {
    authHeadersRef.current = authHeaders;
  }, [authHeaders]);

  // Listen for messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'config':
          setApiUrl(message.apiUrl || 'http://localhost:9042');
          setAuthHeaders(message.authHeaders || {});
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const base64 = content.split(',')[1];
        
        setAttachments(prev => [...prev, {
          name: file.name,
          size: file.size,
          type: file.type,
          content: base64
        }]);
      };
      reader.readAsDataURL(file);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
      attachments: attachments.length > 0 ? [...attachments] : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    try {
      // Build request body
      const requestBody: any = {
        messages: [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: input }],
        model,
        stream: false
      };

      // Add vector search tool parameters if enabled
      if (vectorSettings.enabled) {
        requestBody.tool_parameters = {
          vector_search_nodes: {
            limit: vectorSettings.limit,
            min_similarity: vectorSettings.minSimilarity,
            depth: vectorSettings.depth,
            types: vectorSettings.types
          }
        };
      }

      // Add file attachments if any
      if (userMessage.attachments && userMessage.attachments.length > 0) {
        requestBody.attachments = userMessage.attachments;
      }

      const response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeadersRef.current },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      const assistantContent = data.choices?.[0]?.message?.content || 'No response';

      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ Error: ${error.message}\n\nMake sure Mimir server is running at ${apiUrl}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveVectorSettings = () => {
    setShowVectorModal(false);
    vscode.postMessage({ command: 'saveVectorSettings', settings: vectorSettings });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="portal-container">
      {/* Header */}
      <div className="portal-header">
        <div className="portal-title">
          <span className="portal-icon">🧠</span>
          <h1>Mimir Chat</h1>
        </div>
        <div className="portal-subtitle">
          Graph-RAG powered AI assistant
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <p>Start a conversation with Mimir</p>
            <p className="empty-hint">Ask questions, attach files, or configure vector search</p>
          </div>
        )}
        
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-header">
              <span className="message-role">
                {message.role === 'user' ? '👤 You' : '🧠 Mimir'}
              </span>
              <span className="message-time">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
            {message.attachments && message.attachments.length > 0 && (
              <div className="message-attachments">
                {message.attachments.map((file, idx) => (
                  <div key={idx} className="attachment-chip">
                    📎 {file.name} ({formatFileSize(file.size)})
                  </div>
                ))}
              </div>
            )}
            <div className="message-content">
              {message.content}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="message assistant">
            <div className="message-header">
              <span className="message-role">🧠 Mimir</span>
            </div>
            <div className="message-content loading">
              <div className="loading-dots">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="attachments-preview">
          <div className="attachments-title">Attachments ({attachments.length}):</div>
          <div className="attachments-list">
            {attachments.map((file, idx) => (
              <div key={idx} className="attachment-item">
                <span className="attachment-name">📎 {file.name}</span>
                <span className="attachment-size">({formatFileSize(file.size)})</span>
                <button
                  type="button"
                  className="attachment-remove"
                  onClick={() => removeAttachment(idx)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="input-container">
        <div className="input-toolbar">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => setShowVectorModal(true)}
            title="Vector Search Settings"
          >
            ⚙️
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Files"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Mimir anything... (Shift+Enter for new line)"
          rows={3}
          disabled={isLoading}
        />
        <button
          type="button"
          className="send-button"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? '⏳' : '📤'} Send
        </button>
      </div>

      {/* Vector Search Settings Modal */}
      {showVectorModal && (
        <div className="modal-overlay" onClick={() => setShowVectorModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Vector Search Settings</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowVectorModal(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="modal-body">
              <div className="setting-row">
                <label className="setting-label vector-search-toggle">
                  <input
                    type="checkbox"
                    checked={vectorSettings.enabled}
                    onChange={(e) => setVectorSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                  <span className={vectorSettings.enabled ? 'toggle-enabled' : 'toggle-disabled'}>
                    {vectorSettings.enabled ? '✓ Vector Search Enabled' : '○ Vector Search Disabled'}
                  </span>
                </label>
                {!vectorSettings.enabled && (
                  <div className="fallback-notice">
                    ℹ️ Full-text search will be used as fallback
                  </div>
                )}
              </div>

              <div className="setting-row">
                <label className="setting-label">
                  Result Limit: {vectorSettings.limit}
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={vectorSettings.limit}
                    onChange={(e) => setVectorSettings(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
                    disabled={!vectorSettings.enabled}
                  />
                </label>
              </div>

              <div className="setting-row">
                <label className="setting-label">
                  Min Similarity: {vectorSettings.minSimilarity.toFixed(2)}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={vectorSettings.minSimilarity}
                    onChange={(e) => setVectorSettings(prev => ({ ...prev, minSimilarity: parseFloat(e.target.value) }))}
                    disabled={!vectorSettings.enabled}
                  />
                </label>
              </div>

              <div className="setting-row">
                <label className="setting-label">
                  Search Depth: {vectorSettings.depth}
                  <input
                    type="range"
                    min="1"
                    max="3"
                    value={vectorSettings.depth}
                    onChange={(e) => setVectorSettings(prev => ({ ...prev, depth: parseInt(e.target.value) }))}
                    disabled={!vectorSettings.enabled}
                  />
                </label>
              </div>

              <div className="setting-row">
                <label className="setting-label">Search Types:</label>
                <div className="checkbox-group">
                  {['memory', 'file_chunk', 'todo', 'function', 'class'].map(type => (
                    <label key={type} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={vectorSettings.types.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setVectorSettings(prev => ({ ...prev, types: [...prev.types, type] }));
                          } else {
                            setVectorSettings(prev => ({ ...prev, types: prev.types.filter(t => t !== type) }));
                          }
                        }}
                        disabled={!vectorSettings.enabled}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setShowVectorModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={handleSaveVectorSettings}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
