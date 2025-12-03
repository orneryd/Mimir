import React, { useState, useRef, useEffect, useCallback } from 'react';
import './Bifrost.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

interface BifrostProps {
  isOpen: boolean;
  onClose: () => void;
  modelName?: string;
  apiEndpoint?: string;
}

/**
 * Bifrost - AI Chat Interface
 * 
 * A terminal-style chat interface for interacting with NornicDB's
 * built-in AI assistant. Provides natural language access to
 * database management, diagnostics, and intelligent operations.
 * 
 * Uses OpenAI-compatible SSE streaming API.
 */
// Session storage key for persisting chat history
const BIFROST_MESSAGES_KEY = 'bifrost-messages';
const BIFROST_COMMAND_HISTORY_KEY = 'bifrost-command-history';

// Load messages from session storage
const loadSessionMessages = (): Message[] => {
  try {
    const stored = sessionStorage.getItem(BIFROST_MESSAGES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Restore Date objects
      return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
    }
  } catch (e) {
    // Ignore storage errors
  }
  return [{ 
    id: '0', 
    role: 'system', 
    content: '✓ AI Assistant Connected\n\nReady for database operations.\nType /help for available commands.', 
    timestamp: new Date() 
  }];
};

const loadCommandHistory = (): string[] => {
  try {
    const stored = sessionStorage.getItem(BIFROST_COMMAND_HISTORY_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    // Ignore storage errors
  }
  return [];
};

export const Bifrost: React.FC<BifrostProps> = ({ 
  isOpen, 
  onClose,
  modelName = 'qwen2.5-0.5b-instruct',
  apiEndpoint = '/api/bifrost/chat/completions'
}) => {
  const [messages, setMessages] = useState<Message[]>(loadSessionMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>(loadCommandHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedModel, setSelectedModel] = useState(modelName);
  const [connectionStatus, setConnectionStatus] = useState<'ready' | 'streaming' | 'error'>('ready');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when messages change
  const messagesLength = messages.length;
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesLength]);

  // Persist messages to session storage (survives closing/reopening Bifrost panel)
  useEffect(() => {
    try {
      // Only save non-streaming messages
      const toSave = messages.filter(m => !m.streaming);
      sessionStorage.setItem(BIFROST_MESSAGES_KEY, JSON.stringify(toSave));
    } catch (e) {
      // Ignore storage errors
    }
  }, [messages]);

  // Persist command history to session storage
  useEffect(() => {
    try {
      sessionStorage.setItem(BIFROST_COMMAND_HISTORY_KEY, JSON.stringify(commandHistory));
    } catch (e) {
      // Ignore storage errors
    }
  }, [commandHistory]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Check Heimdall status on open
  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
    return () => {
      // Cancel any ongoing stream when closing
      abortControllerRef.current?.abort();
    };
  }, [isOpen]);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/bifrost/status');
      if (res.ok) {
        const data = await res.json();
        if (data.heimdall?.enabled) {
          setConnectionStatus('ready');
          setSelectedModel(data.model || modelName);
        } else {
          setConnectionStatus('error');
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'system',
            content: '⚠️ AI Assistant is not enabled. Set NORNICDB_HEIMDALL_ENABLED=true to activate.',
            timestamp: new Date()
          }]);
        }
      }
    } catch (err) {
      setConnectionStatus('error');
    }
  };

  const handleBuiltInCommand = (cmd: string): boolean => {
    const command = cmd.toLowerCase().trim();
    
    if (command === '/help') {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Available commands:
  /help     - Show this help message
  /clear    - Clear chat history
  /health   - Check database health
  /stats    - Get graph statistics
  /status   - Show connection status
  /model    - Show current model`,
        timestamp: new Date()
      }]);
      return true;
    }
    
    if (command === '/clear') {
      setMessages([{
        id: crypto.randomUUID(),
        role: 'system',
        content: '✓ Chat cleared',
        timestamp: new Date()
      }]);
      return true;
    }
    
    if (command === '/status') {
      checkStatus();
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Status: ${connectionStatus}\nModel: ${selectedModel}`,
        timestamp: new Date()
      }]);
      return true;
    }
    
    if (command === '/model') {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Current model: ${selectedModel}`,
        timestamp: new Date()
      }]);
      return true;
    }
    
    return false;
  };

  // Send message using OpenAI-compatible SSE streaming
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    
    const trimmedInput = input.trim();
    
    // Check for built-in commands
    if (trimmedInput.startsWith('/')) {
      if (handleBuiltInCommand(trimmedInput)) {
        setCommandHistory(prev => [...prev, trimmedInput]);
        setHistoryIndex(-1);
        setInput('');
        return;
      }
    }
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date()
    };
    
    // Add to history
    setCommandHistory(prev => [...prev, trimmedInput]);
    setHistoryIndex(-1);
    
    // Add user message
    setMessages(prev => [...prev, userMessage]);
    
    // Add placeholder for assistant response
    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true
    };
    setMessages(prev => [...prev, assistantMessage]);
    
    setInput('');
    setIsStreaming(true);
    setConnectionStatus('streaming');
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();
    
    try {
      // Single-shot messaging: only send current user message, no context
      // History is kept in UI for display purposes only
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: trimmedInput }],
          stream: true,
          max_tokens: 512,
          temperature: 0.1
        }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }
      
      let fullContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              // Stream complete
              setMessages(prev => prev.map(m => 
                m.id === assistantId 
                  ? { ...m, streaming: false, content: fullContent }
                  : m
              ));
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                setMessages(prev => prev.map(m => 
                  m.id === assistantId 
                    ? { ...m, content: fullContent }
                    : m
                ));
              }
            } catch (e) {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }
      
      setConnectionStatus('ready');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled
        setMessages(prev => prev.map(m => 
          m.id === assistantId 
            ? { ...m, streaming: false, content: m.content || '(cancelled)' }
            : m
        ));
      } else {
        setMessages(prev => [
          ...prev.filter(m => m.id !== assistantId),
          { 
            id: crypto.randomUUID(), 
            role: 'system', 
            content: `❌ Error: ${err.message}`, 
            timestamp: new Date() 
          }
        ]);
        setConnectionStatus('error');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [input, isStreaming, messages, apiEndpoint, selectedModel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (e.key === 'Escape') {
      if (isStreaming) {
        abortControllerRef.current?.abort();
      } else {
        onClose();
      }
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'ready': return 'ready';
      case 'streaming': return 'streaming';
      case 'error': return 'error';
      default: return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="bifrost-portal">
      <div 
        className="bifrost-overlay" 
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close AI Assistant"
      />
      
      <div className="bifrost-container">
        {/* Header */}
        <div className="bifrost-header">
          <div className="bifrost-title">
            <svg className="bifrost-logo" viewBox="0 0 40 40" width="28" height="28">
              {/* Heimdall - The Watchman */}
              {/* Helmet silhouette */}
              <path d="M 12 28 Q 10 20 12 14 Q 14 8 20 6 Q 26 8 28 14 Q 30 20 28 28 Q 25 31 20 32 Q 15 31 12 28"
                    fill="var(--frost-ice)"/>
              {/* Helmet crest */}
              <path d="M 20 5 L 20 9"
                    fill="none" stroke="var(--frost-ice)" strokeWidth="3" strokeLinecap="round"/>
              {/* Helmet wings */}
              <path d="M 10 13 Q 6 10 4 6"
                    fill="none" stroke="var(--frost-ice)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 30 13 Q 34 10 36 6"
                    fill="none" stroke="var(--frost-ice)" strokeWidth="2" strokeLinecap="round"/>
              {/* All-Seeing Eye */}
              <ellipse cx="20" cy="18" rx="6" ry="4" fill="none" stroke="var(--valhalla-gold)" strokeWidth="1.5"/>
              <circle cx="20" cy="18" r="3" fill="var(--valhalla-gold)"/>
              <circle cx="20" cy="18" r="1.5" fill="var(--norse-night)"/>
              {/* Sight rays */}
              <line x1="27" y1="17" x2="32" y2="16" stroke="var(--valhalla-gold)" strokeWidth="1" opacity="0.6"/>
              <line x1="13" y1="17" x2="8" y2="16" stroke="var(--valhalla-gold)" strokeWidth="1" opacity="0.6"/>
              {/* Gjallarhorn */}
              <path d="M 32 22 Q 35 19 36 14"
                    fill="none" stroke="var(--frost-ice)" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="36" cy="14" r="1.5" fill="var(--valhalla-gold)"/>
            </svg>
            <span>AI Assistant</span>
            <span className="bifrost-subtitle">NornicDB</span>
            <div className={`bifrost-status ${getStatusColor()}`} />
          </div>
          <div className="bifrost-controls">
            <span className="bifrost-model">{selectedModel}</span>
            <button 
              type="button"
              className="bifrost-close" 
              onClick={onClose}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* Messages */}
        <div className="bifrost-messages" ref={scrollRef}>
          {messages.map((message) => (
            <div 
              key={message.id} 
              className={`bifrost-message bifrost-message-${message.role}`}
            >
              <div className="bifrost-message-header">
                <span className="bifrost-message-role">
                  {message.role === 'user' ? '>' : message.role === 'assistant' ? '◈' : '⚙'}
                </span>
                <span className="bifrost-message-time">
                  {formatTimestamp(message.timestamp)}
                </span>
              </div>
              <div className="bifrost-message-content">
                {message.content}
                {message.streaming && <span className="bifrost-cursor">▊</span>}
              </div>
            </div>
          ))}
        </div>
        
        {/* Input */}
        <div className="bifrost-input-container">
          <span className="bifrost-prompt">{'>'}</span>
          <textarea
            ref={inputRef}
            className="bifrost-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Processing...' : 'Ask about database operations...'}
            disabled={isStreaming}
            rows={1}
          />
          <button
            className="bifrost-send"
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            type="button"
          >
            {isStreaming ? '⏳' : '⏎'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Bifrost;
