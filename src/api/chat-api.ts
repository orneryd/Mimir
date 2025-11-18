/**
 * @fileoverview Chat API for RAG-enhanced conversations
 * 
 * Provides chat completion endpoints with Graph-RAG semantic search,
 * similar to the mimir_rag_auto.py pipeline in Open WebUI.
 * 
 * @since 1.0.0
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { IGraphManager } from '../types/index.js';
import { handleVectorSearchNodes } from '../tools/vectorSearch.tools.js';
import { CopilotAgentClient, LLMProvider } from '../orchestrator/llm-client.js';
import { normalizeProvider, fetchAvailableModels } from '../orchestrator/types.js';
import { consolidatedTools } from '../orchestrator/tools.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration for chat API
 */
interface ChatConfig {
  semanticSearchEnabled: boolean;
  semanticSearchLimit: number;
  minSimilarityThreshold: number;
  llmProvider: 'openai' | 'ollama' | string;
  llmApiUrl: string;
  defaultModel: string;
  embeddingModel: string;
}

/**
 * Chat message structure
 */
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Chat completion request body
 */
interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  preamble?: string; // Chatmode/preamble name (e.g., 'mimir-v2', 'debug', 'research')
  enable_tools?: boolean; // Enable MCP tool calling (default: true)
  tools?: string[]; // Specific tools to enable (optional)
  max_tool_calls?: number; // Max tool calls per response (default: 3)
}

/**
 * Default configuration
 * 
 * Provider Switching:
 * - Set MIMIR_DEFAULT_PROVIDER to:
 *   - 'ollama' (Native Ollama API - uses /api/chat endpoint)
 *   - 'openai', 'copilot', or 'llama.cpp' (OpenAI-compatible - uses /v1/chat/completions endpoint)
 * - Configure MIMIR_LLM_API for the base URL (e.g., http://ollama:11434, http://copilot-api:4141, http://llama-server:11434)
 * 
 * Provider aliases are normalized automatically:
 *   llama.cpp → openai (OpenAI-compatible)
 *   copilot → openai (OpenAI-compatible)
 */
const DEFAULT_CONFIG: ChatConfig = {
  semanticSearchEnabled: true,
  semanticSearchLimit: 10,
  minSimilarityThreshold: 0.55,
  llmProvider: normalizeProvider(process.env.LLM_PROVIDER || process.env.MIMIR_DEFAULT_PROVIDER || 'ollama').toString(),
  // Base URL only - LangChain clients add their own paths
  llmApiUrl: process.env.MIMIR_LLM_API || 'http://ollama:11434',
  defaultModel: process.env.DEFAULT_MODEL || process.env.MIMIR_DEFAULT_MODEL || 'qwen3:4b',
  embeddingModel: process.env.EMBEDDING_MODEL || process.env.MIMIR_EMBEDDINGS_MODEL || 'mxbai-embed-large',
};

/**
 * Get available preamble files
 */
async function getAvailablePreambles(): Promise<{ name: string; filename: string; displayName: string }[]> {
  const preambleDir = '/app/docs/agents';
  try {
    const files = await fs.readdir(preambleDir);
    const preambles = files
      .filter(f => f.startsWith('claudette-') && f.endsWith('.md'))
      .map(filename => {
        const name = filename.replace('claudette-', '').replace('.md', '');
        const displayName = name
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return { name, filename, displayName };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return preambles;
  } catch (error) {
    console.warn('⚠️  Could not read preambles directory:', error);
    return [];
  }
}

/**
 * Load preamble by name (e.g., 'mimir-v2', 'debug', 'research')
 */
async function loadPreamble(preambleName?: string): Promise<string> {
  const defaultPreamble = 'mimir-v2';
  const name = preambleName || defaultPreamble;
  const preamblePath = `/app/docs/agents/claudette-${name}.md`;

  try {
    const content = await fs.readFile(preamblePath, 'utf-8');
    console.log(`✅ Loaded preamble: ${name} from ${preamblePath}`);
    return content;
  } catch (error) {
    console.warn(`⚠️  Could not load preamble: ${name}, using fallback`);
    // Fallback preamble
    return `# Claudette Agent v5.2.1

You are an autonomous AI assistant that helps users accomplish their goals by:
- Providing accurate, relevant information
- Breaking down complex tasks into manageable steps
- Using context from the knowledge base when available
- Being concise, clear, and helpful

Always prioritize user needs and provide practical solutions.`;
  }
}

/**
 * Create chat API router (OpenAI-compatible)
 */
export function createChatRouter(graphManager: IGraphManager): express.Router {
  const router = express.Router();
  const config = { ...DEFAULT_CONFIG };
  let claudettePreamble = '';

  // Load default preamble on startup
  loadPreamble('mimir-v2').then(preamble => {
    claudettePreamble = preamble;
  });

  /**
   * GET /api/preambles
   * List available preambles/chatmodes
   */
  router.get('/api/preambles', async (req: any, res: any) => {
    try {
      const preambles = await getAvailablePreambles();
      res.json({ preambles });
    } catch (error: any) {
      console.error('Error listing preambles:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/tools
   * List available MCP tools for the agent
   */
  router.get('/api/tools', async (req: any, res: any) => {
    try {
      // Return tool names and descriptions from consolidatedTools
      const tools = consolidatedTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        category: tool.name.startsWith('memory_') || tool.name === 'todo' || tool.name === 'todo_list' ? 'mcp' : 'filesystem',
      }));

      res.json({
        tools,
        count: tools.length,
        description: 'Available tools for agents (consolidated API - 14 tools: 8 filesystem + 6 MCP)'
      });
    } catch (error: any) {
      console.error('Error listing tools:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/models
   * List available models from configured LLM provider
   * Fetches dynamically from the provider's API endpoint
   */
  router.get('/api/models', async (req: any, res: any) => {
    try {
      const models = await fetchAvailableModels(config.llmApiUrl);
      res.json({
        models: models.map(m => ({
          id: m.id,
          owned_by: m.owned_by || 'unknown',
          object: m.object || 'model',
        })),
        count: models.length,
        provider: config.llmProvider,
        description: `Available models from configured LLM provider (${config.llmProvider})`
      });
    } catch (error: any) {
      console.error('Error listing models:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /v1/chat/completions
   * OpenAI-compatible RAG-enhanced chat completion with streaming & MCP tool support
   * 
   * **Provider Switching:**
   * Configure via environment variables:
   * - LLM_PROVIDER → 'openai' (OpenAI-compatible endpoint) or 'ollama' (local Ollama)
   * - LLM_API_URL → Base URL for the LLM endpoint (e.g., http://copilot-api:4141/v1)
   * - DEFAULT_MODEL → Model name (e.g., gpt-4o for OpenAI, qwen2.5-coder for Ollama)
   * - EMBEDDING_MODEL → Embedding model (default: nomic-embed-text)
   * 
   * **MCP Tools:**
   * All providers support full MCP tool calling through LangChain agents.
   * Tools are automatically loaded from src/orchestrator/tools.ts
   * Enable/disable with enable_tools parameter (default: true)
   * 
   * **Examples:**
   * ```bash
   * # Use OpenAI-compatible endpoint (copilot-api)
   * LLM_PROVIDER=openai LLM_API_URL=http://copilot-api:4141/v1 DEFAULT_MODEL=gpt-4o
   * 
   * # Use local Ollama
   * LLM_PROVIDER=ollama LLM_API_URL=http://localhost:11434 DEFAULT_MODEL=qwen2.5-coder
   * 
   * # Use actual OpenAI API
   * LLM_PROVIDER=openai LLM_API_URL=https://api.openai.com/v1 DEFAULT_MODEL=gpt-4-turbo
   * ```
   */
  router.post('/v1/chat/completions', async (req: any, res: any) => {
    try {
      const body: ChatCompletionRequest = req.body;
      const { messages, stream = true, preamble, enable_tools = true, tools: requestedTools, max_tool_calls = 3 } = body;

      if (!messages || messages.length === 0) {
        return res.status(400).json({ error: 'No messages provided' });
      }

      // Get the latest user message for RAG search
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      const userMessage = lastUserMessage?.content || '';
      
      if (!userMessage) {
        return res.status(400).json({ error: 'No user message found' });
      }

      console.log(`\n💬 Chat request: ${userMessage.substring(0, 100)}...`);
      console.log(`📨 Incoming messages: ${messages.length} (${messages.map(m => m.role).join(', ')})`);
      if (enable_tools) {
        console.log(`🔧 Tools enabled (max calls: ${max_tool_calls})`);
      }

      // Check if user already provided a system prompt
      const hasSystemPrompt = messages.some(m => m.role === 'system');
      
      // Only load Claudette preamble if no system prompt provided
      let activePreamble: string | null = null;
      if (!hasSystemPrompt) {
        console.log(`🎭 No system prompt provided, loading chatmode: ${preamble || 'mimir-v2'}`);
        activePreamble = await loadPreamble(preamble);
      } else {
        console.log(`✅ Using system prompt from request`);
      }

      // Get model from request or use default
      // Note: Do NOT split on '.' as gpt-4.1 is a version number, not a provider prefix
      let selectedModel = body.model || config.defaultModel;
      
      // Only clean up if it has a provider prefix (e.g., 'mimir:model-name')
      if (selectedModel.startsWith('mimir:')) {
        selectedModel = selectedModel.replace('mimir:', '');
      }
      
      console.log(`📋 Using model: ${selectedModel}`);

      // Prepare tools for agent (filter if specific tools requested)
      const agentTools = enable_tools 
        ? (requestedTools ? consolidatedTools.filter(t => requestedTools.includes(t.name)) : consolidatedTools)
        : []; // Empty array disables agent mode
      
      console.log(`🔧 Tools enabled: ${enable_tools}, count: ${agentTools.length} (consolidated API)`);

      // Set up SSE if streaming
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }

      // Helper to send OpenAI-compatible SSE chunks
      const sendChunk = (content: string, finish_reason: string | null = null) => {
        if (stream) {
          const chunk = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: selectedModel,
            choices: [
              {
                index: 0,
                delta: finish_reason ? {} : { content },
                finish_reason,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      };

      // Send initial status (as comment for debugging)
      if (stream) {
        res.write(`: 🔍 Retrieving relevant context...\n\n`);
      }

      // Perform semantic search if enabled
      let relevantContext = '';
      let contextCount = 0;

      if (config.semanticSearchEnabled) {
        try {
          console.log(`🔍 Performing semantic search for: "${userMessage.substring(0, 100)}..."`);
          console.log(`   Min similarity: ${config.minSimilarityThreshold}, Limit: ${config.semanticSearchLimit}`);
          
          // Use vector search tool
          const searchResult = await handleVectorSearchNodes(
            {
              query: userMessage,
              types: undefined, // search all types
              limit: config.semanticSearchLimit,
              min_similarity: config.minSimilarityThreshold
            },
            graphManager.getDriver()
          );

          if (searchResult && searchResult.results && searchResult.results.length > 0) {
            const searchResults = searchResult.results;
            contextCount = searchResults.length;
            console.log(`✅ Found ${contextCount} relevant documents:`, 
              searchResults.map((r: any) => `${r.title || r.id} (${r.similarity?.toFixed(3) || 'N/A'})`)
            );

            // Format context
            const contextParts: string[] = [];
            for (const result of searchResults) {
              const sourceLabel = result.type === 'memory' ? 'Memory' : 'File';
              const quality = result.similarity >= 0.90 ? '🔥 Excellent' :
                             result.similarity >= 0.80 ? '✅ High' :
                             result.similarity >= 0.75 ? '📊 Good' : '📉 Moderate';

              // Get the actual content - try multiple fields
              const contentText = result.chunk_text || result.content || result.content_preview || result.description || 'No content available';
              
              // Include absolute path if available (for agent to access files directly)
              const locationInfo = result.absolute_path ? `\n**Path:** ${result.absolute_path}` : 
                                   result.path ? `\n**Path:** ${result.path}` : '';

              contextParts.push(
                `**${sourceLabel}:** ${result.title || result.id}${locationInfo}\n` +
                `**Quality:** ${quality} (score: ${result.similarity.toFixed(3)})\n` +
                `**Content:**\n\`\`\`\n${contentText}\n\`\`\`\n\n---\n\n`
              );
            }

            relevantContext = contextParts.join('');
            if (stream) {
              res.write(`: ✅ Found ${contextCount} relevant document(s)\n\n`);
            }
          } else {
            console.log('ℹ️ No relevant context found');
            if (stream) {
              res.write(`: ℹ️ No relevant context found\n\n`);
            }
          }
        } catch (searchError: any) {
          console.error('⚠️ Semantic search failed:', searchError);
          if (stream) {
            res.write(`: ⚠️ Search failed: ${searchError.message}\n\n`);
          }
        }
      }

      // Build context section
      let contextSection = '';
      if (relevantContext) {
        console.log(`📝 Context length: ${relevantContext.length} characters`);
        console.log(`📝 Context preview (first 500 chars):\n${relevantContext.substring(0, 500)}...`);
        contextSection = `

## RELEVANT CONTEXT FROM KNOWLEDGE BASE

The following context was retrieved from the Mimir knowledge base based on semantic similarity to your request:

${relevantContext}

---

`;
      } else {
        console.log('⚠️ No context to inject - relevantContext is empty');
      }

      // Build message array - use incoming messages or construct new ones
      let chatMessages: ChatMessage[];
      
      if (hasSystemPrompt) {
        // User provided system prompt - use their messages as-is
        chatMessages = [...messages];
        
        // If we have RAG context, inject it before the last user message
        if (contextSection && relevantContext) {
          const lastUserIdx = chatMessages.map(m => m.role).lastIndexOf('user');
          if (lastUserIdx !== -1) {
            chatMessages.splice(lastUserIdx, 0, {
              role: 'user',
              content: `## RELEVANT CONTEXT FROM KNOWLEDGE BASE\n\n${relevantContext}`
            });
          }
        }
      } else {
        // No system prompt provided - will use Claudette preamble via agent
        chatMessages = [...messages];
      }

      console.log(`📋 Message count: ${messages.length} (${messages.map(m => m.role).join(', ')})`);

      // Determine provider from config (with alias support)
      let provider: LLMProvider;
      let baseUrl: string;
      
      const normalizedProvider = normalizeProvider(config.llmProvider);
      if (normalizedProvider === LLMProvider.OLLAMA) {
        provider = LLMProvider.OLLAMA;
      } else {
        // OpenAI-compatible endpoint (copilot-api proxy or openai direct)
        provider = LLMProvider.OPENAI;
      }
      
      // ALWAYS use ONLY base URL - LangChain clients add their own paths
      // Ollama client adds /api/chat internally
      // OpenAI client adds /v1/chat/completions internally
      baseUrl = process.env.MIMIR_LLM_API || 'http://ollama:11434';

      const providerDisplay = provider === LLMProvider.OLLAMA ? 'Ollama (native)' : 'OpenAI-compatible (Copilot/OpenAI/llama.cpp)';
      console.log(`🤖 Using provider: ${providerDisplay}, model: ${selectedModel}, base: ${baseUrl}`);

      // Build task for agent - include RAG context and conversation history
      let task = '';
      
      // Add RAG context if available
      if (contextSection && relevantContext) {
        task += contextSection + '\n\n';
      }
      
      // Add conversation history (user/assistant messages)
      const conversationParts: string[] = [];
      for (const msg of messages) {
        if (msg.role === 'user') {
          conversationParts.push(`User: ${msg.content}`);
        } else if (msg.role === 'assistant') {
          conversationParts.push(`Assistant: ${msg.content}`);
        }
      }
      
      task += conversationParts.join('\n\n');

      console.log(`📋 Task length: ${task.length} characters`);

      // Initialize agent with appropriate preamble
      // Note: CopilotAgentClient expects both copilotBaseUrl and openaiBaseUrl for OpenAI-compatible endpoints
      const agent = new CopilotAgentClient({
        preamblePath: '', // Will load content directly
        model: selectedModel,
        provider,
        copilotBaseUrl: provider === LLMProvider.OPENAI ? baseUrl : undefined, // Used for OpenAI-compatible endpoints (includes copilot-api, OpenAI)
        ollamaBaseUrl: provider === LLMProvider.OLLAMA ? baseUrl : undefined,   // Used for local Ollama or llama.cpp
        tools: agentTools, // Use filtered/enabled tools
        temperature: 0.7,
      });

      // Load preamble (use system prompt if provided, otherwise Claudette preamble)
      const systemContent = hasSystemPrompt 
        ? messages.find(m => m.role === 'system')?.content || activePreamble!
        : activePreamble!;
      
      await agent.loadPreamble(systemContent, true); // true = load as content, not file path

      if (stream) {
        const providerDisplay = provider === LLMProvider.OLLAMA ? 'Ollama' : 'OpenAI-compatible';
        res.write(`: 🤖 Processing with ${selectedModel} (${providerDisplay})...\n\n`);
      }

      // Execute agent
      console.log(`🚀 Executing agent...`);
      const result = await agent.execute(task, 0, max_tool_calls);

      // Stream response in OpenAI-compatible format
      if (stream) {
        // Split output into chunks for streaming effect
        const output = result.output;
        const chunkSize = 50; // characters per chunk
        
        for (let i = 0; i < output.length; i += chunkSize) {
          const chunk = output.slice(i, Math.min(i + chunkSize, output.length));
          sendChunk(chunk, null);
        }
        
        // Send finish
        sendChunk('', 'stop');
        res.write(`: ✅ Response complete (${result.toolCalls} tool calls)\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-streaming response
        res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: selectedModel,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: result.output,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: result.tokens.input,
            completion_tokens: result.tokens.output,
            total_tokens: result.tokens.input + result.tokens.output,
          },
        });
      }

    } catch (error: any) {
      console.error('❌ Chat completion error:', error);
      
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          error: 'Chat completion failed',
          details: error.message,
        });
      }
    }
  });

  /**
   * POST /v1/embeddings
   * OpenAI-compatible embeddings endpoint (proxies to Ollama)
   */
  router.post('/v1/embeddings', async (req: any, res: any) => {
    try {
      const { input, model = config.embeddingModel } = req.body;

      if (!input) {
        return res.status(400).json({
          error: {
            message: 'Input is required',
            type: 'invalid_request_error',
            param: 'input',
            code: null,
          },
        });
      }

      console.log(`🔢 Embeddings request for model: ${model}`);

      // Normalize input to array
      const inputs = Array.isArray(input) ? input : [input];

      // Use split URL configuration for embeddings
      const baseUrl = process.env.MIMIR_EMBEDDINGS_API || 'http://llama-server:11434';
      const embeddingsPath = process.env.MIMIR_EMBEDDINGS_API_PATH || '/v1/embeddings';
      const embeddingsUrl = `${baseUrl}${embeddingsPath}`;
      
      console.log(`🔗 Embeddings URL: ${embeddingsUrl}`);
      
      const embeddings: number[][] = [];

      for (const text of inputs) {
        const response = await fetch(embeddingsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: text, // OpenAI-compatible format
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Embeddings error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as any;
        
        // Handle both OpenAI-compatible and Ollama native response formats
        let embedding: number[];
        if (data.data && Array.isArray(data.data) && data.data[0]?.embedding) {
          // OpenAI-compatible format: { data: [{ embedding: [...] }] }
          const embeddingData = data.data[0].embedding;
          // Handle space-separated string (llama.cpp format)
          embedding = typeof embeddingData === 'string' 
            ? embeddingData.split(' ').map(parseFloat)
            : embeddingData;
        } else if (data.embedding) {
          // Ollama native format: { embedding: [...] }
          embedding = data.embedding;
        } else {
          throw new Error(`Unexpected embeddings response format: ${JSON.stringify(data).substring(0, 200)}`);
        }
        
        embeddings.push(embedding);
      }

      // Return OpenAI-compatible response
      res.json({
        object: 'list',
        data: embeddings.map((embedding, index) => ({
          object: 'embedding',
          embedding,
          index,
        })),
        model,
        usage: {
          prompt_tokens: inputs.reduce((sum: number, text: string) => sum + text.length / 4, 0), // Rough estimate
          total_tokens: inputs.reduce((sum: number, text: string) => sum + text.length / 4, 0),
        },
      });

      console.log(`✅ Embeddings generated: ${embeddings.length} vectors`);
    } catch (error: any) {
      console.error('❌ Embeddings error:', error);
      res.status(500).json({
        error: {
          message: error.message || 'Failed to generate embeddings',
          type: 'api_error',
          param: null,
          code: null,
        },
      });
    }
  });

  /**
   * Shared handler for models endpoints
   * Proxies to configured chat provider for both /models and /v1/models
   */
  const handleModelsRequest = async (req: any, res: any) => {
    try {
      // Simple concatenation: base URL + models path
      const baseUrl = process.env.MIMIR_LLM_API || 'http://localhost:11434';
      const modelsPath = process.env.MIMIR_LLM_API_MODELS_PATH || '/v1/models';
      const modelsUrl = `${baseUrl}${modelsPath}`;
      
      console.log(`🔗 Proxying ${req.path} request to chat provider: ${modelsUrl}`);
      
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Provider returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('❌ Error fetching models from chat provider:', error.message);
      // Fallback to static models list
      res.json({
        object: 'list',
        data: [
          {
            id: config.defaultModel,
            object: 'model',
            created: Date.now(),
            owned_by: 'mimir',
          },
          {
            id: config.embeddingModel,
            object: 'model',
            created: Date.now(),
            owned_by: 'mimir',
          },
        ],
      });
    }
  };

  /**
   * GET /v1/models
   * OpenAI-compatible models list - proxies to configured chat provider
   */
  router.get('/v1/models', handleModelsRequest);

  /**
   * GET /models
   * Models list - proxies to configured chat provider (same as /v1/models)
   */
  router.get('/models', handleModelsRequest);

  return router;
}
