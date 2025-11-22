import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Paperclip, X, Image as ImageIcon, RotateCcw, ChevronDown, Plus, Edit2, Copy, Check, ChevronRight, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EyeOfMimir } from '../components/EyeOfMimir';
import { OrchestrationStudioIcon } from '../components/OrchestrationStudioIcon';
import { FileIndexingSidebar } from '../components/FileIndexingSidebar';
import { MemoryRuneIcon } from '../components/MemoryRuneIcon';
import { apiClient } from '../utils/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Represents a tool call during agent execution.
 * 
 * @interface ToolCall
 * @property {string} name - Name of the tool being called
 * @property {any} args - Arguments passed to the tool
 * @property {string} [result] - Result returned from the tool (if completed)
 * @property {'executing' | 'completed'} status - Current status of the tool call
 */
interface ToolCall {
  name: string;
  args: any;
  result?: string;
  status: 'executing' | 'completed';
}

/**
 * Represents a chat message in the conversation.
 * 
 * @interface Message
 * @property {string} id - Unique identifier for the message (timestamp-based)
 * @property {'user' | 'assistant'} role - The sender of the message
 * @property {string} content - The text content of the message
 * @property {Date} timestamp - When the message was created
 * @property {AttachedFile[]} [attachments] - Optional array of attached files
 * @property {ToolCall[]} [toolCalls] - Tool calls made during this message (for assistant messages)
 * 
 * @example
 * ```typescript
 * const userMessage: Message = {
 *   id: '1700000000000',
 *   role: 'user',
 *   content: 'What is the meaning of life?',
 *   timestamp: new Date(),
 *   attachments: []
 * };
 * ```
 * 
 * @example
 * ```typescript
 * const assistantMessage: Message = {
 *   id: '1700000000001',
 *   role: 'assistant',
 *   content: '42, according to The Hitchhiker\'s Guide to the Galaxy.',
 *   timestamp: new Date()
 * };
 * ```
 */
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: AttachedFile[];
  toolCalls?: ToolCall[];
}

/**
 * Represents a file attachment with preview capabilities.
 * 
 * @interface AttachedFile
 * @property {File} file - The native browser File object
 * @property {string} preview - Base64-encoded data URL for preview display
 * @property {string} id - Unique identifier for this attachment
 * 
 * @example
 * ```typescript
 * const imageAttachment: AttachedFile = {
 *   file: new File(['...'], 'screenshot.png', { type: 'image/png' }),
 *   preview: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
 *   id: '1700000000000-0.12345'
 * };
 * ```
 */
interface AttachedFile {
  file: File;
  preview: string;
  id: string;
}

/**
 * Represents a chatmode/preamble configuration.
 * 
 * @interface Preamble
 * @property {string} name - Internal identifier (e.g., 'mimir-v2', 'debug')
 * @property {string} filename - Full filename (e.g., 'claudette-mimir-v2.md')
 * @property {string} displayName - Human-readable name for UI (e.g., 'Mimir V2')
 * 
 * @example
 * ```typescript
 * const debugMode: Preamble = {
 *   name: 'debug',
 *   filename: 'claudette-debug.md',
 *   displayName: 'Debug'
 * };
 * ```
 */
interface Preamble {
  name: string;
  filename: string;
  displayName: string;
}

/**
 * Vector search settings configuration.
 * 
 * @interface VectorSearchSettings
 * @property {boolean} enabled - Enable/disable vector search
 * @property {number} limit - Max results to retrieve (1-50)
 * @property {number} minSimilarity - Similarity threshold 0-1
 * @property {number} depth - Graph traversal depth 1-3
 * @property {string[]} types - Node types to search
 */
interface VectorSearchSettings {
  enabled: boolean;
  limit: number;
  minSimilarity: number;
  depth: number;
  types: string[];
}

/**
 * Main chat portal component for interacting with the Mimir AI system.
 * 
 * Provides a full-featured chat interface with:
 * - Dynamic model selection from OpenAI-compatible API
 * - Customizable preambles/chatmodes for different agent behaviors
 * - File attachment support (images, PDFs, text files)
 * - Streaming responses with markdown rendering
 * - Memory persistence for conversations
 * - localStorage-based preferences (default model, custom preambles)
 * 
 * @component
 * @returns {JSX.Element} The rendered portal interface
 * 
 * @example
 * Basic usage in router:
 * ```typescript
 * import { Portal } from './pages/Portal';
 * 
 * function App() {
 *   return (
 *     <Routes>
 *       <Route path="/" element={<Portal />} />
 *     </Routes>
 *   );
 * }
 * ```
 * 
 * @example
 * With custom navigation wrapper:
 * ```typescript
 * <BrowserRouter>
 *   <Portal />
 * </BrowserRouter>
 * ```
 * 
 * @example
 * Testing component initialization:
 * ```typescript
 * import { render, screen } from '@testing-library/react';
 * 
 * test('renders portal with greeting', () => {
 *   render(<Portal />);
 *   expect(screen.getByText(/How may I give counsel/i)).toBeInTheDocument();
 * });
 * ```
 */
export function Portal() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string}>>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [selectedPreamble, setSelectedPreamble] = useState('limerick');
  const [availablePreambles, setAvailablePreambles] = useState<Preamble[]>([]);
  const [preambleCache, setPreambleCache] = useState<Record<string, string>>({});
  const [showCustomPreambleModal, setShowCustomPreambleModal] = useState(false);
  const [customPreambleText, setCustomPreambleText] = useState('');
  const [customPreambleContent, setCustomPreambleContent] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [copiedConversation, setCopiedConversation] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  
  // Vector search settings state
  const [showVectorSearchModal, setShowVectorSearchModal] = useState(false);
  const [vectorSearchSettings, setVectorSearchSettings] = useState<VectorSearchSettings>({
    enabled: true,
    limit: 10,
    minSimilarity: 0.8,
    depth: 1,
    types: ['todo', 'memory', 'file', 'file_chunk'],
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];

  // Set page title
  useEffect(() => {
    document.title = 'The Well of Mímir - Seek Ancient Wisdom';
  }, []);

  // Load default model from localStorage on mount
  useEffect(() => {
    const savedDefault = localStorage.getItem('mimir-default-model');
    if (savedDefault) {
      setDefaultModel(savedDefault);
    }
  }, []);

  // Load custom preamble from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('mimir-custom-preamble');
    if (saved) {
      setCustomPreambleContent(saved);
    }
  }, []);

  // Load vector search settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('mimir-vector-search-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setVectorSearchSettings(parsed);
      } catch (error) {
        console.error('Failed to load vector search settings:', error);
      }
    }
  }, []);

  // Fetch available models from OpenAI-compatible API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('/v1/models', {
          credentials: 'include' // Send HTTP-only cookie
        });
        if (response.ok) {
          const data = await response.json();
          const models = data.data?.map((model: any) => ({
            id: model.id,
            name: model.id, // Use ID as name, can be formatted later
          })) || [];
          setAvailableModels(models);
          
          // Set initial selected model: user default > first available
          if (models.length > 0) {
            const savedDefault = localStorage.getItem('mimir-default-model');
            if (savedDefault && models.some((m: any) => m.id === savedDefault)) {
              setSelectedModel(savedDefault);
            } else {
              setSelectedModel(models[0].id);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
        // Fallback to a default model if API fails
        setAvailableModels([{ id: 'gpt-4.1', name: 'gpt-4.1' }]);
        setSelectedModel('gpt-4.1');
      }
    };
    fetchModels();
  }, []);

  // Fetch available preambles
  useEffect(() => {
    const fetchPreambles = async () => {
      try {
        const response = await fetch('/api/preambles', {
          credentials: 'include' // Send HTTP-only cookie
        });
        if (response.ok) {
          const data = await response.json();
          setAvailablePreambles(data.preambles || []);
        }
      } catch (error) {
        console.error('Failed to fetch preambles:', error);
      }
    };
    fetchPreambles();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  /**
   * Fetches preamble content from server and caches it
   */
  const fetchPreambleContent = async (preambleName: string): Promise<string> => {
    // Check cache first
    if (preambleCache[preambleName]) {
      return preambleCache[preambleName];
    }

    try {
      const response = await fetch(`/api/preambles/${preambleName}`, {
        credentials: 'include' // Send HTTP-only cookie
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch preamble: ${response.status}`);
      }
      const content = await response.text();
      
      // Cache for future use
      setPreambleCache(prev => ({ ...prev, [preambleName]: content }));
      return content;
    } catch (error) {
      console.error(`Error fetching preamble '${preambleName}':`, error);
      throw error;
    }
  };

  /**
   * Opens the custom preamble modal dialog for editing.
   * Loads existing custom preamble content if available.
   * 
   * @function handleOpenCustomPreambleModal
   * @returns {void}
   * 
   * @example
   * Called when user clicks the Plus button:
   * ```typescript
   * <button onClick={handleOpenCustomPreambleModal}>
   *   <Plus />
   * </button>
   * ```
   */
  const handleOpenCustomPreambleModal = () => {
    setCustomPreambleText(customPreambleContent || '');
    setShowCustomPreambleModal(true);
  };

  /**
   * Saves the custom preamble to localStorage and activates it.
   * Sets the chatmode selector to 'custom'.
   * 
   * @function handleSaveCustomPreamble
   * @returns {void}
   * 
   * @example
   * User saves custom preamble:
   * ```typescript
   * // User enters custom preamble text
   * setCustomPreambleText('You are a specialized SQL expert...');
   * handleSaveCustomPreamble();
   * // Result: localStorage updated, modal closed, 'Custom' mode active
   * ```
   */
  const handleSaveCustomPreamble = () => {
    if (customPreambleText.trim()) {
      localStorage.setItem('mimir-custom-preamble', customPreambleText);
      setCustomPreambleContent(customPreambleText);
      setSelectedPreamble('custom');
      setShowCustomPreambleModal(false);
    }
  };

  /**
   * Cancels custom preamble editing and closes the modal.
   * Does not save changes.
   * 
   * @function handleCancelCustomPreamble
   * @returns {void}
   * 
   * @example
   * ```typescript
   * <button onClick={handleCancelCustomPreamble}>Cancel</button>
   * ```
   */
  const handleCancelCustomPreamble = () => {
    setShowCustomPreambleModal(false);
    setCustomPreambleText('');
  };

  /**
   * Removes saved custom preamble from localStorage.
   * Reverts to first available predefined preamble.
   * 
   * @function handleClearCustomPreamble
   * @returns {void}
   * 
   * @example
   * User deletes custom preamble:
   * ```typescript
   * handleClearCustomPreamble();
   * // Result: localStorage key removed, 'Custom' option disappears from dropdown
   * ```
   */
  const handleClearCustomPreamble = () => {
    localStorage.removeItem('mimir-custom-preamble');
    setCustomPreambleContent(null);
    setSelectedPreamble(availablePreambles[0]?.name || 'limerick');
  };

  /**
   * Saves the currently selected model as the user's default.
   * Persists preference to localStorage for future sessions.
   * 
   * @function handleSaveDefaultModel
   * @returns {void}
   * 
   * @example
   * User sets gpt-4.1 as default:
   * ```typescript
   * setSelectedModel('gpt-4.1');
   * handleSaveDefaultModel();
   * // Next session: gpt-4.1 auto-selected on load
   * ```
   */
  const handleSaveDefaultModel = () => {
    localStorage.setItem('mimir-default-model', selectedModel);
    setDefaultModel(selectedModel);
  };

  /**
   * Computed boolean indicating if the selected model is the user's default.
   * Used to toggle UI state between "Save as Default" and "✓ Default Model".
   * 
   * @constant {boolean} isDefaultModel
   * 
   * @example
   * Conditional rendering:
   * ```typescript
   * {isDefaultModel ? (
   *   <span>✓ Default Model</span>
   * ) : (
   *   <span>Save as Default</span>
   * )}
   * ```
   */
  const isDefaultModel = defaultModel === selectedModel || (!defaultModel && availableModels[0]?.id === selectedModel);

  /**
   * Validates a file against size and type constraints.
   * 
   * @function validateFile
   * @param {File} file - The file to validate
   * @returns {string | null} Error message if validation fails, null if valid
   * 
   * @example
   * Valid file:
   * ```typescript
   * const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });
   * const error = validateFile(file);
   * // error === null (file is valid)
   * ```
   * 
   * @example
   * File too large:
   * ```typescript
   * const largeFile = new File([new ArrayBuffer(20 * 1024 * 1024)], 'big.png');
   * const error = validateFile(largeFile);
   * // error === 'File "big.png" is too large. Maximum size is 10MB.'
   * ```
   * 
   * @example
   * Invalid type:
   * ```typescript
   * const exe = new File(['data'], 'program.exe', { type: 'application/x-msdownload' });
   * const error = validateFile(exe);
   * // error === 'File type "application/x-msdownload" is not supported...'
   * ```
   */
  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" is too large. Maximum size is 10MB.`;
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return `File type "${file.type}" is not supported. Allowed types: images, PDF, text files.`;
    }
    return null;
  };

  /**
   * Clears the entire chat conversation and resets UI state.
   * Removes all messages, attached files, and input text.
   * 
   * @function clearChat
   * @returns {void}
   * 
   * @example
   * User clicks "New Chat" button:
   * ```typescript
   * <button onClick={clearChat}>New Chat</button>
   * // Result: Fresh chat screen with Eye of Mimir greeting
   * ```
   * 
   * @example
   * Programmatic reset after error:
   * ```typescript
   * if (sessionExpired) {
   *   clearChat();
   *   showNotification('Session expired. Starting new chat.');
   * }
   * ```
   */
  const clearChat = () => {
    setMessages([]);
    setAttachedFiles([]);
    setInput('');
    setIsLoading(false);
    setEditingMessageId(null);
    setEditingMessageText('');
  };

  /**
   * Starts editing a user message.
   * Allows re-sending conversation from that point.
   * 
   * @function handleEditMessage
   * @param {string} messageId - ID of the message to edit
   * @param {string} content - Current content of the message
   * @returns {void}
   * 
   * @example
   * ```typescript
   * handleEditMessage('msg-123', 'Original question');
   * // User can now edit and re-send
   * ```
   */
  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingMessageText(content);
  };

  /**
   * Cancels message editing without changes.
   * 
   * @function handleCancelEdit
   * @returns {void}
   */
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageText('');
  };

  /**
   * Copies the entire conversation to clipboard in plain text format.
   * Shows visual feedback for 2 seconds after copying.
   * 
   * @function handleCopyConversation
   * @returns {Promise<void>}
   * 
   * @example
   * Output format:
   * ```
   * User: Hello, how are you?
   * Assistant: I'm doing well, thank you for asking!
   * User: Can you help me with coding?
   * Assistant: Of course! I'd be happy to help...
   * ```
   */
  const handleCopyConversation = async () => {
    if (messages.length === 0) return;

    try {
      // Format conversation as plain text
      const conversationText = messages
        .map(msg => {
          const role = msg.role === 'user' ? 'User' : 'Assistant';
          return `${role}: ${msg.content}`;
        })
        .join('\n\n');

      // Copy to clipboard
      await navigator.clipboard.writeText(conversationText);
      
      // Show success feedback
      setCopiedConversation(true);
      setTimeout(() => setCopiedConversation(false), 2000);
    } catch (error) {
      console.error('Failed to copy conversation:', error);
      alert('Failed to copy conversation to clipboard');
    }
  };

  /**
   * Saves edited message and re-sends conversation from that point.
   * Removes all messages after the edited one and re-submits.
   * 
   * @function handleSaveEdit
   * @returns {Promise<void>}
   * 
   * @example
   * User edits message and re-sends:
   * ```typescript
   * // Original: [msg1, msg2, msg3, msg4]
   * // User edits msg2
   * await handleSaveEdit();
   * // Result: [msg1, edited-msg2] → re-sends to API
   * ```
   */
  const handleSaveEdit = async () => {
    if (!editingMessageId || !editingMessageText.trim()) return;

    // Find the index of the message being edited
    const messageIndex = messages.findIndex(m => m.id === editingMessageId);
    if (messageIndex === -1) return;

    // Keep only messages up to (and including) the edited one
    const updatedMessage: Message = {
      ...messages[messageIndex],
      content: editingMessageText.trim(),
      timestamp: new Date(),
    };

    // Remove all messages after the edited one
    const messagesUpToEdit = messages.slice(0, messageIndex);
    setMessages([...messagesUpToEdit, updatedMessage]);
    
    // Clear edit state
    setEditingMessageId(null);
    setEditingMessageText('');
    setIsLoading(true);

    // Re-send the conversation from this point
    try {
      // Build messages array - fetch and include preamble as system message
      const messagesPayload: any[] = [];
      
      // Fetch preamble content (either custom or from server)
      let preambleContent: string;
      if (selectedPreamble === 'custom' && customPreambleContent) {
        preambleContent = customPreambleContent;
      } else {
        try {
          preambleContent = await fetchPreambleContent(selectedPreamble);
        } catch (error) {
          console.error('Failed to fetch preamble, using minimal default');
          preambleContent = 'You are a helpful AI assistant.';
        }
      }
      
      // Always inject preamble as system message
      messagesPayload.push({ role: 'system', content: preambleContent });
      
      // Add all previous messages in conversation history
      for (const msg of messagesUpToEdit) {
        messagesPayload.push({ 
          role: msg.role === 'user' ? 'user' : 'assistant', 
          content: msg.content 
        });
      }
      
      // Add the edited user message
      messagesPayload.push({ role: 'user', content: editingMessageText.trim() });

      // Call API with full conversation history and vector search settings
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send HTTP-only cookie
        body: JSON.stringify({
          messages: messagesPayload,
          model: selectedModel,
          stream: true,
          enable_tools: vectorSearchSettings.enabled, // Enable tool calling based on settings
          tool_parameters: vectorSearchSettings.enabled ? {
            vector_search_nodes: {
              limit: vectorSearchSettings.limit,
              min_similarity: vectorSearchSettings.minSimilarity,
              depth: vectorSearchSettings.depth,
              types: vectorSearchSettings.types,
            },
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessageContent = '';
      const toolCalls: ToolCall[] = [];
      
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [],
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith(':')) {
            const status = line.slice(2).trim();
            
            // Check for tool execution messages
            if (status.includes('Executing tool:') || status.includes('Tool:')) {
              const toolMatch = status.match(/(?:Executing tool:|Tool:)\s*(\w+)/);
              if (toolMatch) {
                toolCalls.push({
                  name: toolMatch[1],
                  args: {},
                  status: 'executing'
                });
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, toolCalls: [...toolCalls] }
                      : msg
                  )
                );
              }
            } else if (status.includes('Tool result:') || status.includes('completed')) {
              if (toolCalls.length > 0) {
                toolCalls[toolCalls.length - 1].status = 'completed';
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, toolCalls: [...toolCalls] }
                      : msg
                  )
                );
              }
            }
            continue;
          }
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            
            try {
              const parsed = JSON.parse(data);
              
              // Check for tool calls in the response
              const toolCallData = parsed.choices?.[0]?.delta?.tool_calls;
              if (toolCallData && Array.isArray(toolCallData)) {
                for (const tc of toolCallData) {
                  if (tc.function) {
                    const existingIndex = toolCalls.findIndex(t => t.name === tc.function.name);
                    if (existingIndex === -1) {
                      toolCalls.push({
                        name: tc.function.name,
                        args: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
                        status: 'executing'
                      });
                    }
                  }
                }
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, toolCalls: [...toolCalls] }
                      : msg
                  )
                );
              }
              
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessageContent += content;
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, content: assistantMessageContent }
                      : msg
                  )
                );
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      if (!assistantMessageContent) {
        throw new Error('No response content received');
      }
      
    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const createFilePreview = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: AttachedFile[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        alert(error);
        continue;
      }

      try {
        const preview = await createFilePreview(file);
        validFiles.push({
          file,
          preview,
          id: `${Date.now()}-${Math.random()}`,
        });
      } catch (error) {
        console.error('Error creating preview:', error);
      }
    }

    if (validFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Click to upload
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      // Reset input so same file can be selected again
      e.target.value = '';
    }
  };

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  // Clipboard paste
  const handleSaveAsMemory = async () => {
    if (messages.length === 0 || savingMemory) return;

    setSavingMemory(true);
    try {
      const result = await apiClient.saveConversationAsMemory(messages);
      console.log('✅ Conversation saved as memory:', result.memoryId);
      
      // Show success feedback (you could add a toast notification here)
      alert(`✅ Conversation saved to memory!\n\nMemory ID: ${result.memoryId}\n\nThis conversation can now be recalled through semantic search.`);
    } catch (error) {
      console.error('Failed to save conversation:', error);
      alert('❌ Failed to save conversation to memory. Please try again.');
    } finally {
      setSavingMemory(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault(); // Prevent pasting file path as text
      await addFiles(files);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim() || '[Attachment only]',
      timestamp: new Date(),
      attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');
    setAttachedFiles([]);
    setIsLoading(true);

    try {
      // Build messages array - fetch and include preamble as system message
      const messagesPayload: any[] = [];
      
      // Fetch preamble content (either custom or from server)
      let preambleContent: string;
      if (selectedPreamble === 'custom' && customPreambleContent) {
        preambleContent = customPreambleContent;
      } else {
        try {
          preambleContent = await fetchPreambleContent(selectedPreamble);
        } catch (error) {
          console.error('Failed to fetch preamble, using minimal default');
          preambleContent = 'You are a helpful AI assistant.';
        }
      }
      
      // Always inject preamble as system message
      messagesPayload.push({ role: 'system', content: preambleContent });
      
      // Add user message
      messagesPayload.push({ role: 'user', content: currentInput });

      // Call OpenAI-compatible RAG-enhanced chat API with streaming and vector search settings
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send HTTP-only cookie
        body: JSON.stringify({
          messages: messagesPayload,
          model: selectedModel,
          stream: true,
          enable_tools: vectorSearchSettings.enabled, // Enable tool calling based on settings
          tool_parameters: vectorSearchSettings.enabled ? {
            vector_search_nodes: {
              limit: vectorSearchSettings.limit,
              min_similarity: vectorSearchSettings.minSimilarity,
              depth: vectorSearchSettings.depth,
              types: vectorSearchSettings.types,
            },
          } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Process OpenAI-compatible SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessageContent = '';
      const toolCalls: ToolCall[] = [];
      
      // Create initial assistant message
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [],
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          // Skip comments but check for tool execution status
          if (line.startsWith(':')) {
            const status = line.slice(2).trim();
            console.debug('Status:', status);
            
            // Check for tool execution messages
            if (status.includes('Executing tool:') || status.includes('Tool:')) {
              const toolMatch = status.match(/(?:Executing tool:|Tool:)\s*(\w+)/);
              if (toolMatch) {
                const toolName = toolMatch[1];
                toolCalls.push({
                  name: toolName,
                  args: {},
                  status: 'executing'
                });
                
                // Update message with tool call
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, toolCalls: [...toolCalls] }
                      : msg
                  )
                );
              }
            } else if (status.includes('Tool result:') || status.includes('completed')) {
              // Mark last tool as completed
              if (toolCalls.length > 0) {
                toolCalls[toolCalls.length - 1].status = 'completed';
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, toolCalls: [...toolCalls] }
                      : msg
                  )
                );
              }
            }
            continue;
          }
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            
            try {
              const parsed = JSON.parse(data);
              
              // Check for tool calls in the response
              const toolCallData = parsed.choices?.[0]?.delta?.tool_calls;
              if (toolCallData && Array.isArray(toolCallData)) {
                for (const tc of toolCallData) {
                  if (tc.function) {
                    const existingIndex = toolCalls.findIndex(t => t.name === tc.function.name);
                    if (existingIndex === -1) {
                      toolCalls.push({
                        name: tc.function.name,
                        args: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
                        status: 'executing'
                      });
                    }
                  }
                }
                
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, toolCalls: [...toolCalls] }
                      : msg
                  )
                );
              }
              
              // OpenAI-compatible format: choices[0].delta.content
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessageContent += content;
                
                // Update the assistant message with accumulated content
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessageId 
                      ? { ...msg, content: assistantMessageContent }
                      : msg
                  )
                );
              }
            } catch (e) {
              // Skip invalid JSON
              console.debug('Skipping invalid JSON:', data.substring(0, 100));
            }
          }
        }
      }
      
      // Ensure final message is set
      if (!assistantMessageContent) {
        throw new Error('No response content received');
      }
      
    } catch (error: any) {
      console.error('Chat error:', error);
      // Show error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const hasMessages = messages.length > 0;

  /**
   * Opens the vector search settings modal.
   */
  const handleOpenVectorSearchModal = () => {
    setShowVectorSearchModal(true);
  };

  /**
   * Saves vector search settings to localStorage and closes modal.
   */
  const handleSaveVectorSearchSettings = () => {
    localStorage.setItem('mimir-vector-search-settings', JSON.stringify(vectorSearchSettings));
    setShowVectorSearchModal(false);
  };

  /**
   * Cancels vector search settings editing.
   */
  const handleCancelVectorSearchSettings = () => {
    // Reload from localStorage to discard changes
    const savedSettings = localStorage.getItem('mimir-vector-search-settings');
    if (savedSettings) {
      try {
        setVectorSearchSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Failed to reload settings:', error);
      }
    }
    setShowVectorSearchModal(false);
  };

  /**
   * Resets vector search settings to defaults.
   */
  const handleResetVectorSearchSettings = () => {
    const defaults: VectorSearchSettings = {
      enabled: true,
      limit: 10,
      minSimilarity: 0.8,
      depth: 1,
      types: ['todo', 'memory', 'file', 'file_chunk'],
    };
    setVectorSearchSettings(defaults);
  };

  return (
    <div className="h-screen flex flex-col bg-norse-night">
      {/* File Indexing Drawer - Fixed position, slides from left */}
      <FileIndexingSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Header Banner - Always visible */}
      <header className="bg-norse-shadow border-b border-norse-rune px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <img 
            src="/mimir-logo.png" 
            alt="Mimir Logo" 
            className="h-10 w-auto"
          />
          <div>
            <h1 className="text-xl font-bold text-valhalla-gold">Mimir</h1>
            <p className="text-xs text-gray-400">AI Counsel</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* Model Selector with Default Save */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2.5 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 text-gray-300 hover:text-valhalla-gold text-sm font-medium cursor-pointer h-11 focus:outline-none focus:border-valhalla-gold"
                title="Select AI model"
                disabled={availableModels.length === 0}
              >
                {availableModels.length === 0 ? (
                  <option>Loading...</option>
                ) : (
                  availableModels.map((model) => (
                    <option key={model.id} value={model.id} className="bg-[#0a0e1a] text-gray-300">
                      {model.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {availableModels.length > 0 && !isDefaultModel && (
              <button
                onClick={handleSaveDefaultModel}
                className="px-3 py-2 bg-norse-rune/50 hover:bg-valhalla-gold/20 border border-norse-rune hover:border-valhalla-gold rounded-lg transition-all duration-300 text-xs text-gray-400 hover:text-valhalla-gold whitespace-nowrap h-11 flex items-center"
                title="Click to save as default model"
              >
                Save Default
              </button>
            )}
            {availableModels.length > 0 && isDefaultModel && (
              <div className="px-3 py-2 bg-valhalla-gold/10 border border-valhalla-gold/30 rounded-lg text-xs text-valhalla-gold/70 whitespace-nowrap h-11 flex items-center">
                ✓ Default
              </div>
            )}
          </div>

          {/* Chatmode/Preamble Selector */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <select
                value={selectedPreamble}
                onChange={(e) => setSelectedPreamble(e.target.value)}
                className="appearance-none w-full pl-4 pr-10 py-2.5 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 text-gray-300 hover:text-valhalla-gold text-sm font-medium cursor-pointer h-11 focus:outline-none focus:border-valhalla-gold"
                title="Select chatmode (agent personality/behavior)"
              >
                {availablePreambles.map((preamble) => (
                  <option key={preamble.name} value={preamble.name} className="bg-[#0a0e1a] text-gray-300">
                    {preamble.displayName}
                  </option>
                ))}
                {customPreambleContent && (
                  <option value="custom" className="bg-[#0a0e1a] text-valhalla-gold">
                    Custom
                  </option>
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <button
              onClick={handleOpenCustomPreambleModal}
              className="flex items-center justify-center w-11 h-11 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 group"
              title="Add custom preamble"
            >
              <Plus className="w-5 h-5 text-gray-300 group-hover:text-valhalla-gold transition-colors" />
            </button>
          </div>

          {/* New Chat Button - Only show when there are messages */}
          {hasMessages && (
            <button
              onClick={clearChat}
              className="flex items-center space-x-2 px-4 py-2.5 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 group h-11"
              title="Start a new chat"
            >
              <RotateCcw className="w-5 h-5 text-gray-300 group-hover:text-valhalla-gold transition-colors flex-shrink-0" />
              <span className="text-gray-300 group-hover:text-valhalla-gold text-sm font-medium">
                New Chat
              </span>
            </button>
          )}

          {/* Save as Memory Button - Only show when there are messages */}
          {hasMessages && (
            <button
              onClick={handleSaveAsMemory}
              disabled={savingMemory}
              className="flex items-center space-x-2 px-4 py-2.5 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 group disabled:opacity-50 disabled:cursor-not-allowed h-11"
              title="Save conversation to memory"
            >
              <MemoryRuneIcon className="w-5 h-5 text-gray-300 group-hover:text-valhalla-gold transition-colors flex-shrink-0" />
              <span className="text-gray-300 group-hover:text-valhalla-gold text-sm font-medium">
                {savingMemory ? 'Saving...' : 'Save Memory'}
              </span>
            </button>
          )}

          {/* Studio Link Button */}
          <button
            onClick={() => navigate('/studio')}
            className="flex items-center space-x-2 px-4 py-2.5 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 group h-11"
            title="Open Orchestration Studio"
          >
            <OrchestrationStudioIcon size={20} className="group-hover:opacity-80 transition-opacity flex-shrink-0" />
            <span className="text-gray-300 group-hover:text-valhalla-gold text-sm font-medium">Studio</span>
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {!hasMessages ? (
          /* Landing State - Centered with Input */
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl flex flex-col items-center space-y-12">
              {/* Eye of Mimir & Greeting */}
              <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 blur-3xl bg-valhalla-gold opacity-30 rounded-full"></div>
                  <EyeOfMimir size={120} className="relative z-10" />
                </div>
                
                <div className="text-center space-y-2">
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-valhalla-gold via-yellow-300 to-valhalla-gold bg-clip-text text-transparent">
                   How may I give counsel?
                  </h1>
                  <p className="text-base text-gray-400 font-light">
                    The All-Seeing Eye watches over the depths of knowledge
                  </p>
                </div>
              </div>

              {/* Centered Input */}
              <div className="w-full">
                <form onSubmit={handleSubmit} className="relative">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ALLOWED_FILE_TYPES.join(',')}
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  {/* File Previews */}
                  {attachedFiles.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {attachedFiles.map((file) => (
                        <div
                          key={file.id}
                          className="relative group bg-norse-shadow border-2 border-norse-rune rounded-xl overflow-hidden transition-all hover:border-valhalla-gold"
                        >
                          {file.file.type.startsWith('image/') ? (
                            <img
                              src={file.preview}
                              alt={file.file.name}
                              className="w-20 h-20 object-cover"
                            />
                          ) : (
                            <div className="w-20 h-20 flex items-center justify-center bg-norse-rune">
                              <ImageIcon className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(file.id)}
                            className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-700 rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="Remove file"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                            <p className="text-xs text-gray-300 truncate">{file.file.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`rounded-3xl shadow-xl transition-all duration-300 ${
                      isLoading 
                        ? 'border-2 border-valhalla-gold bg-[#252d3d] animate-[pulse-border_2s_ease-in-out_infinite]' 
                        : isDragging
                        ? 'border-2 border-valhalla-gold bg-valhalla-gold/10'
                        : 'border-2 border-norse-rune bg-[#252d3d] hover:border-gray-600'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="flex items-center px-4 py-3 gap-2">
                      <button
                        type="button"
                        onClick={handleOpenVectorSearchModal}
                        className="flex-shrink-0 p-2 text-gray-400 hover:text-valhalla-gold transition-all rounded-lg hover:bg-norse-rune/50"
                        title="Vector Search Settings"
                        disabled={isLoading}
                      >
                        <Settings className="w-5 h-5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-shrink-0 p-2 text-gray-400 hover:text-valhalla-gold transition-all rounded-lg hover:bg-norse-rune/50"
                        title="Attach file (Click, Drag, or Paste)"
                        disabled={isLoading}
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>

                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        onFocus={(e) => e.target.placeholder = ''}
                        onBlur={(e) => e.target.placeholder = 'Ask the Well of Mímir for wisdom...'}
                        placeholder="Ask the Well of Mímir for wisdom..."
                        className="flex-1 !bg-[#252d3d] text-gray-100 placeholder:text-gray-500 placeholder:opacity-50 outline-none border-none resize-none px-3 max-h-40 focus:!bg-[#252d3d] focus:outline-none focus:ring-0 focus:border-none active:!bg-[#252d3d]"
                        rows={1}
                        disabled={isLoading}
                        style={{ 
                          background: '#252d3d !important',
                          boxShadow: 'none',
                          border: 'none',
                          outline: 'none'
                        }}
                      />
                      
                      <button
                        type="submit"
                        disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
                        className="flex-shrink-0 p-2 bg-valhalla-gold text-norse-night rounded-xl hover:bg-yellow-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-gray-600"
                        title="Send message"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : (
          /* Chat State - Messages */
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start space-x-4 ${
                  message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                {/* Avatar */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  message.role === 'assistant'
                    ? 'bg-gradient-to-br from-valhalla-gold to-yellow-600 shadow-lg'
                    : 'bg-gradient-to-br from-blue-500 to-blue-600'
                }`}>
                  {message.role === 'assistant' ? (
                    <Sparkles className="w-5 h-5 text-norse-night" />
                  ) : (
                    <User className="w-5 h-5 text-white" />
                  )}
                </div>

                {/* Message Bubble */}
                <div className={`flex-1 max-w-3xl ${
                  message.role === 'user' ? 'flex justify-end' : ''
                }`}>
                  <div className={`rounded-2xl px-5 py-3 ${
                    message.role === 'assistant'
                      ? 'bg-norse-shadow border border-norse-rune'
                      : 'bg-blue-600/20 border border-blue-500/30'
                  }`}>
                    {/* Attachments */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {message.attachments.map((file) => (
                          <div
                            key={file.id}
                            className="relative bg-norse-rune/50 border border-gray-600 rounded-lg overflow-hidden"
                          >
                            {file.file.type.startsWith('image/') ? (
                              <img
                                src={file.preview}
                                alt={file.file.name}
                                className="w-32 h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => window.open(file.preview, '_blank')}
                              />
                            ) : (
                              <div className="w-32 h-32 flex flex-col items-center justify-center p-2">
                                <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                                <p className="text-xs text-gray-300 text-center truncate w-full">{file.file.name}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tool Calls / Thinking Section */}
                    {message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mb-3 border border-norse-rune rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedThinking(prev => ({
                            ...prev,
                            [message.id]: !prev[message.id]
                          }))}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-norse-rune/30 hover:bg-norse-rune/50 transition-colors"
                        >
                          <div className="flex items-center space-x-2">
                            <ChevronRight 
                              className={`w-4 h-4 text-valhalla-gold transition-transform ${
                                expandedThinking[message.id] ? 'rotate-90' : ''
                              }`}
                            />
                            <span className="text-sm font-medium text-valhalla-gold">
                              Thinking
                              {message.toolCalls.some(tc => tc.status === 'executing') && (
                                <span className="ml-2 inline-flex">
                                  <span className="animate-pulse">.</span>
                                  <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
                                  <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
                                </span>
                              )}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">
                            {message.toolCalls.length} tool call{message.toolCalls.length !== 1 ? 's' : ''}
                          </span>
                        </button>
                        
                        {expandedThinking[message.id] && (
                          <div className="px-4 py-3 space-y-2 bg-[#0a0e1a]">
                            {message.toolCalls.map((toolCall, index) => (
                              <div 
                                key={index}
                                className="text-sm font-mono"
                              >
                                <div className="flex items-center space-x-2">
                                  <span className={`w-2 h-2 rounded-full ${
                                    toolCall.status === 'executing' 
                                      ? 'bg-yellow-500 animate-pulse' 
                                      : 'bg-green-500'
                                  }`}></span>
                                  <span className="text-valhalla-gold font-semibold">
                                    {toolCall.name}
                                  </span>
                                  {toolCall.status === 'executing' && (
                                    <span className="text-gray-400 text-xs">executing...</span>
                                  )}
                                </div>
                                {Object.keys(toolCall.args).length > 0 && (
                                  <div className="ml-4 mt-1 text-gray-400 text-xs">
                                    <pre className="whitespace-pre-wrap break-words">
                                      {JSON.stringify(toolCall.args, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {toolCall.result && (
                                  <div className="ml-4 mt-1 text-green-400 text-xs">
                                    ✓ {toolCall.result.substring(0, 100)}
                                    {toolCall.result.length > 100 && '...'}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {message.role === 'assistant' ? (
                      message.content ? (
                      <div className="text-gray-100 leading-relaxed prose prose-invert prose-sm max-w-none
                        prose-headings:text-valhalla-gold prose-headings:font-semibold
                        prose-p:text-gray-100 prose-p:leading-relaxed
                        prose-a:text-valhalla-gold prose-a:underline hover:prose-a:text-yellow-300
                        prose-strong:text-gray-50 prose-strong:font-semibold
                        prose-code:text-valhalla-gold prose-code:bg-norse-rune/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:break-words
                        prose-pre:bg-norse-rune/30 prose-pre:border prose-pre:border-norse-rune prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:max-w-full
                        prose-pre:code:break-normal prose-pre:code:whitespace-pre
                        prose-ul:text-gray-100 prose-ol:text-gray-100
                        prose-li:text-gray-100 prose-li:marker:text-valhalla-gold
                        prose-blockquote:border-l-valhalla-gold prose-blockquote:text-gray-300
                        prose-hr:border-norse-rune">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                      ) : (
                        <div className="flex space-x-2">
                          <div className="w-2 h-2 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      )
                    ) : editingMessageId === message.id ? (
                      /* Editing mode for user message */
                      <div className="space-y-2">
                        <textarea
                          value={editingMessageText}
                          onChange={(e) => setEditingMessageText(e.target.value)}
                          className="w-full p-3 bg-[#0a0e1a] border-2 border-valhalla-gold rounded-xl text-gray-100 focus:outline-none focus:border-valhalla-gold resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center space-x-2 justify-end">
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 bg-norse-rune hover:bg-gray-700 border border-norse-rune rounded-lg text-gray-300 text-sm transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={!editingMessageText.trim() || isLoading}
                            className="px-3 py-1.5 bg-valhalla-gold hover:bg-yellow-500 border border-valhalla-gold rounded-lg text-norse-night text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Save & Re-send
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal user message display */
                      <div className="group relative">
                        <p className="text-gray-100 leading-relaxed whitespace-pre-wrap pr-8">
                          {message.content}
                        </p>
                        {!isLoading && (
                          <button
                            onClick={() => handleEditMessage(message.id, message.content)}
                            className="absolute top-0 right-0 p-1 text-gray-400 hover:text-valhalla-gold opacity-0 group-hover:opacity-100 transition-all rounded"
                            title="Edit and re-send from this point"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-2">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Loading Indicator - Only show if we haven't started receiving response yet */}
            {isLoading && messages.length > 0 && messages[messages.length - 1].role !== 'assistant' && (
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-valhalla-gold to-yellow-600 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-norse-night animate-pulse" />
                </div>
                <div className="flex-1 max-w-3xl">
                  <div className="bg-norse-shadow border border-norse-rune rounded-2xl px-5 py-3">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-valhalla-gold rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Copy Conversation Button - Appears at end of messages */}
            {messages.length > 0 && (
              <div className="flex justify-center mt-8 mb-4">
                <button
                  onClick={handleCopyConversation}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-norse-rune hover:bg-valhalla-gold/20 border-2 border-norse-rune hover:border-valhalla-gold rounded-xl transition-all duration-300 group"
                  title="Copy entire conversation to clipboard"
                >
                  {copiedConversation ? (
                    <>
                      <Check className="w-5 h-5 text-green-400 transition-colors flex-shrink-0" />
                      <span className="text-green-400 text-sm font-medium">
                        Copied!
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5 text-gray-300 group-hover:text-valhalla-gold transition-colors flex-shrink-0" />
                      <span className="text-gray-300 group-hover:text-valhalla-gold text-sm font-medium">
                        Copy Conversation
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area - Only show at bottom when messages exist */}
      {hasMessages && (
        <div className="border-t border-norse-rune bg-norse-night">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <form onSubmit={handleSubmit} className="relative">
              {/* File Previews */}
              {attachedFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="relative group bg-norse-shadow border-2 border-norse-rune rounded-xl overflow-hidden transition-all hover:border-valhalla-gold"
                    >
                      {file.file.type.startsWith('image/') ? (
                        <img
                          src={file.preview}
                          alt={file.file.name}
                          className="w-20 h-20 object-cover"
                        />
                      ) : (
                        <div className="w-20 h-20 flex items-center justify-center bg-norse-rune">
                          <ImageIcon className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(file.id)}
                        className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-700 rounded-full transition-all opacity-0 group-hover:opacity-100"
                        title="Remove file"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                        <p className="text-xs text-gray-300 truncate">{file.file.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`rounded-3xl shadow-xl transition-all duration-300 ${
                  isLoading 
                    ? 'border-2 border-valhalla-gold bg-[#252d3d] animate-[pulse-border_2s_ease-in-out_infinite]' 
                    : isDragging
                    ? 'border-2 border-valhalla-gold bg-valhalla-gold/10'
                    : 'border-2 border-norse-rune bg-[#252d3d] hover:border-gray-600'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex items-center px-4 py-3 gap-2">
                  <button
                    type="button"
                    onClick={handleOpenVectorSearchModal}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-valhalla-gold transition-all rounded-lg hover:bg-norse-rune/50"
                    title="Vector Search Settings"
                    disabled={isLoading}
                  >
                    <Settings className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-valhalla-gold transition-all rounded-lg hover:bg-norse-rune/50"
                    title="Attach file (Click, Drag, or Paste)"
                    disabled={isLoading}
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.placeholder = ''}
                    onBlur={(e) => e.target.placeholder = 'Ask the Well of Mímir for wisdom...'}
                    placeholder="Ask the Well of Mímir for wisdom..."
                    className="flex-1 !bg-[#252d3d] text-gray-100 placeholder:text-gray-500 placeholder:opacity-50 outline-none border-none resize-none px-3 max-h-40 focus:!bg-[#252d3d] focus:outline-none focus:ring-0 focus:border-none active:!bg-[#252d3d]"
                    rows={1}
                    disabled={isLoading}
                    style={{ 
                      background: '#252d3d !important',
                      boxShadow: 'none',
                      border: 'none',
                      outline: 'none'
                    }}
                  />
                  
                  <button
                    type="submit"
                    disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
                    className="flex-shrink-0 p-2 bg-valhalla-gold text-norse-night rounded-xl hover:bg-yellow-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-gray-600"
                    title="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Preamble Modal */}
      {showCustomPreambleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1f2e] border-2 border-valhalla-gold rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-valhalla-gold">Custom Preamble</h2>
              <button
                onClick={handleCancelCustomPreamble}
                className="text-gray-400 hover:text-valhalla-gold transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <p className="text-gray-300 mb-4 text-sm">
              Paste your custom system prompt/preamble below. This will be used as the agent's instructions
              when "Custom" mode is selected.
            </p>

            <textarea
              value={customPreambleText}
              onChange={(e) => setCustomPreambleText(e.target.value)}
              placeholder="# My Custom Agent Instructions&#10;&#10;You are a specialized assistant that..."
              className="w-full h-64 p-4 bg-[#0a0e1a] border-2 border-norse-rune rounded-xl text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-valhalla-gold resize-none font-mono text-sm"
            />

            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center space-x-2">
                {customPreambleContent && (
                  <button
                    onClick={handleClearCustomPreamble}
                    className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border-2 border-red-800 hover:border-red-600 rounded-xl text-red-400 hover:text-red-300 text-sm font-medium transition-all"
                  >
                    Clear Saved
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleCancelCustomPreamble}
                  className="px-6 py-2 bg-norse-rune hover:bg-gray-700 border-2 border-norse-rune hover:border-gray-600 rounded-xl text-gray-300 hover:text-gray-100 text-sm font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCustomPreamble}
                  disabled={!customPreambleText.trim()}
                  className="px-6 py-2 bg-valhalla-gold hover:bg-yellow-500 border-2 border-valhalla-gold rounded-xl text-norse-night text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save & Use
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vector Search Settings Modal */}
      {showVectorSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1f2e] border-2 border-valhalla-gold rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-2xl">
                         <div className="flex items-center justify-between mb-4">
               <h2 className="text-2xl font-bold text-valhalla-gold">Vector Search Settings</h2>
               <button
                 onClick={handleCancelVectorSearchSettings}
                 className="text-gray-400 hover:text-valhalla-gold transition-colors"
               >
                 <X className="w-6 h-6" />
               </button>
             </div>
             
             <p className="text-gray-300 mb-4 text-sm">
               Configure semantic search parameters for retrieving relevant context from your knowledge graph.
               Vector search helps the AI find related memories, files, and concepts to improve responses.
             </p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="vectorSearchEnabled"
                  checked={vectorSearchSettings.enabled}
                  onChange={(e) => setVectorSearchSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="mr-2 h-4 w-4 text-valhalla-gold focus:ring-valhalla-gold border-gray-600 bg-gray-700"
                />
                <label htmlFor="vectorSearchEnabled" className="text-gray-300 text-sm">Enable Vector Search</label>
              </div>
              <div className="flex items-center">
                <input
                  type="number"
                  id="vectorSearchLimit"
                  value={vectorSearchSettings.limit}
                  onChange={(e) => setVectorSearchSettings(prev => ({ ...prev, limit: parseInt(e.target.value, 10) || 1 }))}
                  min="1"
                  max="50"
                  className="w-24 h-8 p-1 bg-gray-800 border border-gray-600 rounded-md text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-valhalla-gold focus:border-valhalla-gold"
                />
                <label htmlFor="vectorSearchLimit" className="text-gray-300 text-sm ml-2">Max Results: {vectorSearchSettings.limit}</label>
              </div>
              <div className="flex items-center">
                <input
                  type="number"
                  id="vectorSearchMinSimilarity"
                  value={vectorSearchSettings.minSimilarity}
                  onChange={(e) => setVectorSearchSettings(prev => ({ ...prev, minSimilarity: parseFloat(e.target.value) || 0 }))}
                  min="0"
                  max="1"
                  step="0.01"
                  className="w-24 h-8 p-1 bg-gray-800 border border-gray-600 rounded-md text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-valhalla-gold focus:border-valhalla-gold"
                />
                <label htmlFor="vectorSearchMinSimilarity" className="text-gray-300 text-sm ml-2">Min Similarity: {vectorSearchSettings.minSimilarity.toFixed(2)}</label>
              </div>
              <div className="flex items-center">
                <input
                  type="number"
                  id="vectorSearchDepth"
                  value={vectorSearchSettings.depth}
                  onChange={(e) => setVectorSearchSettings(prev => ({ ...prev, depth: parseInt(e.target.value, 10) || 1 }))}
                  min="1"
                  max="3"
                  className="w-24 h-8 p-1 bg-gray-800 border border-gray-600 rounded-md text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-valhalla-gold focus:border-valhalla-gold"
                />
                <label htmlFor="vectorSearchDepth" className="text-gray-300 text-sm ml-2">Graph Depth: {vectorSearchSettings.depth}</label>
              </div>
            </div>

                         <div className="mb-4">
               <p className="text-gray-300 text-sm font-semibold mb-2">Node Types to Search:</p>
               <div className="grid grid-cols-2 gap-2">
                 {['todo', 'todoList', 'memory', 'file', 'file_chunk', 'function', 'class', 'module', 'concept', 'person', 'project', 'custom'].map((type) => (
                   <div key={type} className="flex items-center">
                     <input
                       type="checkbox"
                       id={`vectorSearchType-${type}`}
                       checked={vectorSearchSettings.types.includes(type)}
                       onChange={(e) => {
                         if (e.target.checked) {
                           setVectorSearchSettings(prev => ({ ...prev, types: [...prev.types, type] }));
                         } else {
                           setVectorSearchSettings(prev => ({ ...prev, types: prev.types.filter(t => t !== type) }));
                         }
                       }}
                       className="mr-2 h-4 w-4 text-valhalla-gold focus:ring-valhalla-gold border-gray-600 bg-gray-700 rounded"
                     />
                     <label htmlFor={`vectorSearchType-${type}`} className="text-gray-300 text-sm capitalize">
                       {type.replace(/_/g, ' ')}
                     </label>
                   </div>
                 ))}
               </div>
             </div>

            <div className="flex items-center justify-between mt-6">
              <button
                onClick={handleResetVectorSearchSettings}
                className="px-6 py-2 bg-red-900/30 hover:bg-red-900/50 border-2 border-red-800 hover:border-red-600 rounded-xl text-red-400 hover:text-red-300 text-sm font-medium transition-all"
              >
                Reset to Defaults
              </button>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleCancelVectorSearchSettings}
                  className="px-6 py-2 bg-norse-rune hover:bg-gray-700 border-2 border-norse-rune hover:border-gray-600 rounded-xl text-gray-300 hover:text-gray-100 text-sm font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveVectorSearchSettings}
                  disabled={!vectorSearchSettings.enabled && vectorSearchSettings.limit === 10 && vectorSearchSettings.minSimilarity === 0.5 && vectorSearchSettings.depth === 1 && vectorSearchSettings.types.length === 4}
                  className="px-6 py-2 bg-valhalla-gold hover:bg-yellow-500 border-2 border-valhalla-gold rounded-xl text-norse-night text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
