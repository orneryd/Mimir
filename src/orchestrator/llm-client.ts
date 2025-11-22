import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
  trimMessages,
} from "@langchain/core/messages";
import type { CompiledStateGraph } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import fs from "fs/promises";
import { LLMProvider } from "./types.js";
import { consolidatedTools, planningTools, getToolNames } from "./tools.js";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { LLMConfigLoader } from "../config/LLMConfigLoader.js";
import { RateLimitQueue } from "./rate-limit-queue.js";
import { ConversationHistoryManager } from "./ConversationHistoryManager.js";
import neo4j, { Driver } from "neo4j-driver";
import { loadRateLimitConfig } from "../config/rate-limit-config.js";
import { runWithWorkspaceContext } from "./workspace-context.js";

// API key for LLM provider - use MIMIR_LLM_API_KEY (generic) or fallback to dummy for local proxy
const LLM_API_KEY = process.env.MIMIR_LLM_API_KEY || 'dummy-key-for-proxy';

export interface AgentConfig {
  preamblePath: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: StructuredToolInterface[]; // Allow custom tool set

  // Provider Configuration (NEW)
  provider?: LLMProvider | string;
  agentType?: "pm" | "worker" | "qc"; // For config defaults

  // Provider-specific options
  ollamaBaseUrl?: string;
  copilotBaseUrl?: string;
  openAIApiKey?: string;
  fallbackProvider?: LLMProvider | string;
}

// Re-export LLMProvider for convenience
export { LLMProvider };

/**
 * Client for GitHub Copilot Chat API via copilot-api proxy
 * WITH FULL AGENT MODE (tool calling enabled) using LangChain 1.0.1 + LangGraph
 *
 * @example
 * ```typescript
 * const client = new CopilotAgentClient({
 *   preamblePath: 'agent.md',
 *   model: 'gpt-4.1',  // Or use env var: process.env.MIMIR_DEFAULT_MODEL
 *   temperature: 0.0,
 * });
 * await client.loadPreamble('agent.md');
 * const result = await client.execute('Debug the order processing system');
 * ```
 */
export class CopilotAgentClient {
  private llm: BaseChatModel | null = null; // Initialize in loadPreamble
  private agent: CompiledStateGraph<any, any> | null = null;
  private systemPrompt: string = "";
  private maxIterations: number = 50; // Prevent infinite loops
  private tools: StructuredToolInterface[];
  private maxMessagesInHistory: number = 20; // Keep only last N messages to prevent token overflow
  private maxCompletionTokens: number = 4096; // Reduced from default 16384 to save context space

  // Provider abstraction fields (NEW)
  private provider: LLMProvider = LLMProvider.OLLAMA; // Default
  private modelName: string = "tinyllama"; // Default
  private baseURL: string = "http://localhost:11434"; // Default
  private llmConfig: Record<string, any> = {};
  private configLoader: LLMConfigLoader;
  private agentConfig: AgentConfig; // Store for lazy initialization

  // Rate limiter (NEW) - initialized lazily after provider is determined
  private rateLimiter: RateLimitQueue | null = null;

  // Conversation history with embeddings + retrieval (Option 4)
  private conversationHistory: ConversationHistoryManager | null = null;
  private neo4jDriver: Driver | null = null;

  constructor(config: AgentConfig) {
    // Use custom tools if provided, otherwise default to consolidatedTools
    // Note: consolidatedTools will be replaced with PCTX-enhanced tools in loadPreamble
    this.tools = config.tools || consolidatedTools;

    // Store config for lazy initialization in loadPreamble
    this.agentConfig = config;

    // Validate provider if specified
    if (
      config.provider &&
      !Object.values(LLMProvider).includes(config.provider as LLMProvider)
    ) {
      throw new Error(
        `Unknown provider: ${config.provider}. Valid options: ${Object.values(
          LLMProvider
        ).join(", ")}`
      );
    }

    // Validate OpenAI API key if using OpenAI provider
    // OpenAI API key is required by LangChain but not used by copilot-api proxy
    // Use dummy key if not provided
    if (
      config.provider === LLMProvider.OPENAI &&
      !config.openAIApiKey &&
      !process.env.OPENAI_API_KEY
    ) {
      process.env.OPENAI_API_KEY = LLM_API_KEY;
    }

    // Load config loader (synchronous singleton access)
    this.configLoader = LLMConfigLoader.getInstance();

    // Note: Rate limiter initialization deferred to initializeLLM()
    // so we use the correct provider (not a premature default)

    console.log(
      `🔧 Tools available (${this.tools.length}): ${this.tools
        .map((t) => t.name)
        .slice(0, 10)
        .join(", ")}${this.tools.length > 10 ? "..." : ""}`
    );
  }

  // Public getter methods for testing
  public getProvider(): LLMProvider {
    // Return default until initialized
    if (!this.llm) {
      // Return what would be initialized based on config
      if (this.agentConfig.provider) {
        return this.agentConfig.provider as LLMProvider;
      }
      // Default to OPENAI provider
      return LLMProvider.OPENAI;
    }
    return this.provider;
  }

  public getModel(): string {
    if (!this.llm) {
      if (this.agentConfig.model) {
        return this.agentConfig.model;
      }
      // Default from env var or fallback
      return process.env.MIMIR_DEFAULT_MODEL || "gpt-4.1";
    }
    return this.modelName;
  }

  public getBaseURL(): string {
    if (!this.llm) {
      // Return what would be set based on config
      if (this.agentConfig.provider === LLMProvider.OLLAMA) {
        return this.agentConfig.ollamaBaseUrl || "http://localhost:11434";
      } else if (this.agentConfig.provider === LLMProvider.COPILOT) {
        return this.agentConfig.copilotBaseUrl || "http://localhost:4141/v1";
      } else if (this.agentConfig.provider === LLMProvider.OPENAI) {
        return "https://api.openai.com/v1";
      }
      // Default to Ollama
      return this.agentConfig.ollamaBaseUrl || "http://localhost:11434";
    }
    return this.baseURL;
  }

  public getLLMConfig(): Record<string, any> {
    if (!this.llm) {
      // Return defaults based on provider before initialization
      const provider = this.getProvider();
      if (provider === LLMProvider.OLLAMA) {
        return {
          numCtx: 8192,
          numPredict: -1,
          temperature: this.agentConfig.temperature ?? 0.0,
        };
      } else {
        // Copilot/OpenAI
        return {
          maxTokens: this.agentConfig.maxTokens ?? -1,
          temperature: this.agentConfig.temperature ?? 0.0,
        };
      }
    }
    return this.llmConfig;
  }

  public async getContextWindow(): Promise<number> {
    const provider = this.getProvider();
    const model = this.getModel();
    return this.configLoader.getContextWindow(provider, model);
  }

  async loadPreamble(pathOrContent: string, isContent: boolean = false): Promise<void> {
    // Initialize LLM if not already done
    if (!this.llm) {
      await this.initializeLLM();
    }

    this.systemPrompt = isContent 
      ? pathOrContent 
      : await fs.readFile(pathOrContent, "utf-8");

    // Display context window information
    const contextWindow = await this.getContextWindow();
    console.log(`📊 Context Window: ${contextWindow.toLocaleString()} tokens`);

    // Display model-specific warnings if any
    await this.configLoader.displayModelWarnings(this.provider, this.modelName);

    // Load PCTX-enhanced tools if not using custom tools
    if (!this.agentConfig.tools) {
      const { getConsolidatedTools } = await import('./tools.js');
      const includePCTX = process.env.PCTX_ENABLED !== 'false'; // Default to true
      this.tools = await getConsolidatedTools(includePCTX);
      console.log(`🔧 Loaded tools with PCTX support: ${includePCTX ? 'enabled' : 'disabled'}`);
    }

    // Add tool usage instructions to the system prompt

    // Verify LLM is initialized before creating agent
    if (!this.llm) {
      throw new Error(
        `❌ CRITICAL: this.llm is null after initializeLLM()! Provider: ${this.provider}, Model: ${this.modelName}`
      );
    }

    console.log(
      `🔍 Creating LangGraph agent with LLM: ${this.llm.constructor.name}`
    );
    console.log(`🔧 Tools count: ${this.tools.length}`);
    console.log(
      `🔍 System prompt length: ${this.systemPrompt.length} chars`
    );    

    // Check if tools are disabled (empty array = no agent mode)
    if (this.tools.length === 0) {
      console.log(
        "⚠️  No tools provided - agent mode disabled, using direct LLM invocation"
      );
      this.agent = null; // Will use direct LLM.invoke() in execute()
      const ctxWindow = await this.getContextWindow();
      console.log("✅ Direct LLM mode initialized (no tool calling)");
      console.log(`📊 Context: ${ctxWindow.toLocaleString()} tokens`);
      return;
    }

    // ✅ FIX: Do NOT create agent here - will be created fresh per request
    // LangGraph agents maintain internal state that accumulates across invocations
    // Creating fresh agent per request prevents unbounded context accumulation
    this.agent = null; // Signal that we'll use tool mode with fresh agent

    const ctxWindow = await this.getContextWindow();
    console.log(
      "✅ Agent mode enabled (tools available) - will create fresh agent per request"
    );
    console.log(
      `📊 Context: ${ctxWindow.toLocaleString()} tokens`
    );
  }

  /**
   * Initialize conversation history manager with Neo4j
   * Call this to enable vector-based conversation persistence
   */
  async initializeConversationHistory(): Promise<void> {
    if (this.conversationHistory) {
      return; // Already initialized
    }

    try {
      // Get Neo4j connection from environment or use defaults
      const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
      const neo4jUser = process.env.NEO4J_USER || 'neo4j';
      const neo4jPassword = process.env.NEO4J_PASSWORD || 'password';

      this.neo4jDriver = neo4j.driver(
        neo4jUri,
        neo4j.auth.basic(neo4jUser, neo4jPassword)
      );

      this.conversationHistory = new ConversationHistoryManager(this.neo4jDriver);
      await this.conversationHistory.initialize();

      console.log('✅ Conversation history with embeddings + retrieval initialized');
    } catch (error: any) {
      console.warn('⚠️  Failed to initialize conversation history:', error.message);
      console.warn('   Conversation persistence will be disabled');
    }
  }

  private async initializeLLM(): Promise<void> {
    const config = this.agentConfig;

    // Determine provider (with fallback chain)
    let provider: LLMProvider;
    let model: string;

    if (config.provider) {
      // Explicit provider specified
      provider = config.provider as LLMProvider;
      model = config.model || (await this.getDefaultModelForProvider(provider));
    } else if (config.agentType) {
      // Use agent type defaults from config
      const defaults = await this.configLoader.getAgentDefaults(
        config.agentType
      );
      provider = defaults.provider as LLMProvider;
      model = defaults.model;
    } else {
      // Read default provider from config file (if available)
      try {
        const llmConfig = await this.configLoader.load();

        // If config explicitly sets defaultProvider, use it
        if (llmConfig.defaultProvider) {
          provider = llmConfig.defaultProvider as LLMProvider;
          model =
            config.model || (await this.getDefaultModelForProvider(provider));
        } else {
          // Config exists but no defaultProvider set - use Ollama as default
          provider = LLMProvider.OLLAMA;
          model = config.model || "tinyllama";
        }
      } catch (error) {
        // No config file - use Ollama as default
        provider = LLMProvider.OLLAMA;
        model = config.model || "tinyllama";
      }
    }

    // Validate provider
    if (!Object.values(LLMProvider).includes(provider)) {
      throw new Error(
        `Unknown provider: ${provider}. Valid options: ${Object.values(
          LLMProvider
        ).join(", ")}`
      );
    }

    this.provider = provider;
    this.modelName = model;

    // Initialize rate limiter NOW that we know the actual provider
    const providerName = provider.toString().toLowerCase();
    const rateLimitConfig = loadRateLimitConfig(providerName);
    this.rateLimiter = RateLimitQueue.getInstance(
      rateLimitConfig,
      providerName
    );

    // Initialize provider-specific configuration
    switch (provider) {
      case LLMProvider.OLLAMA:
        await this.initializeOllama(config, model);
        break;
      case LLMProvider.COPILOT:
        await this.initializeCopilot(config, model);
        break;
      case LLMProvider.OPENAI:
        await this.initializeOpenAI(config, model);
        break;
      default:
        throw new Error(`Provider ${provider} not implemented`);
    }

    console.log(`🤖 Model: ${this.modelName} via ${this.provider}`);
  }

  private async getDefaultModelForProvider(
    provider: LLMProvider
  ): Promise<string> {
    const config = await this.configLoader.load();
    switch (provider) {
      case LLMProvider.OLLAMA:
        return config.providers.ollama?.defaultModel || "tinyllama";
      case LLMProvider.COPILOT:
        return config.providers.copilot?.defaultModel || "gpt-4o";
      case LLMProvider.OPENAI:
        return "gpt-4-turbo";
      default:
        return "tinyllama"; // Default to Ollama model
    }
  }

  private async initializeOllama(
    config: AgentConfig,
    model: string
  ): Promise<void> {
    const llmConfig = await this.configLoader.load();
    const modelConfig = await this.configLoader.getModelConfig(
      LLMProvider.OLLAMA,
      model
    );
    const contextWindow = await this.configLoader.getContextWindow(
      LLMProvider.OLLAMA,
      model
    );

    this.baseURL =
      config.ollamaBaseUrl ||
      llmConfig.providers.ollama?.baseUrl ||
      "http://localhost:11434";
    this.llmConfig = {
      numCtx: modelConfig?.config?.numCtx || contextWindow || 8192,
      numPredict: modelConfig?.config?.numPredict || -1,
      temperature:
        config.temperature ?? modelConfig?.config?.temperature ?? 0.0,
    };

    this.llm = new ChatOllama({
      baseUrl: this.baseURL,
      model: model,
      numCtx: this.llmConfig.numCtx,
      numPredict: this.llmConfig.numPredict,
      temperature: this.llmConfig.temperature,
    });
  }

  private async initializeCopilot(
    config: AgentConfig,
    model: string
  ): Promise<void> {
    const llmConfig = await this.configLoader.load();
    const modelConfig = await this.configLoader.getModelConfig(
      LLMProvider.COPILOT,
      model
    );

    // Use MIMIR_LLM_API directly - no manipulation
    this.baseURL = process.env.MIMIR_LLM_API || "http://localhost:4141/v1";
    
    this.llmConfig = {
      maxTokens: config.maxTokens ?? modelConfig?.config?.maxTokens ?? -1,
      temperature:
        config.temperature ?? modelConfig?.config?.temperature ?? 0.0,
    };

    console.log(`🔍 Initializing Copilot client with baseURL: ${this.baseURL}`);
    console.log(
      `🔍 Model: ${model}, maxTokens: ${this.llmConfig.maxTokens}, temperature: ${this.llmConfig.temperature}`
    );

    this.llm = new ChatOpenAI({
      apiKey: LLM_API_KEY,
      model: model,
      configuration: {
        baseURL: this.baseURL,
      },
      temperature: this.llmConfig.temperature,
      maxTokens: this.llmConfig.maxTokens,
      streaming: false,
      timeout: 120000,
    });

    console.log(`✅ Copilot ChatOpenAI client created successfully`);
  }

  private async initializeOpenAI(
    config: AgentConfig,
    model: string
  ): Promise<void> {
    const llmConfig = await this.configLoader.load();
    const modelConfig = await this.configLoader.getModelConfig(
      LLMProvider.OPENAI,
      model
    );

    // Use MIMIR_LLM_API directly - no manipulation
    this.baseURL = process.env.MIMIR_LLM_API || "http://localhost:4141/v1";
    
    this.llmConfig = {
      maxTokens: config.maxTokens ?? modelConfig?.config?.maxTokens ?? -1,
      temperature:
        config.temperature ?? modelConfig?.config?.temperature ?? 0.0,
    };

    console.log(`🔍 Initializing OpenAI client with baseURL: ${this.baseURL}`);
    console.log(
      `🔍 Model: ${model}, maxTokens: ${this.maxCompletionTokens} (reduced to prevent overflow), temperature: ${this.llmConfig.temperature}`
    );

    this.llm = new ChatOpenAI({
      apiKey: LLM_API_KEY,
      model: model,
      configuration: {
        baseURL: this.baseURL,
      },
      temperature: this.llmConfig.temperature,
      maxTokens: this.maxCompletionTokens,
      streaming: false,
      timeout: 120000,
    });

    console.log(`✅ OpenAI ChatOpenAI client created successfully`);
  }

  /**
   * Summarize conversation history to prevent context explosion
   * Uses the LLM to create a dense summary of the conversation so far
   * Preserves the most recent messages for continuity
   *
   * @param messages - Full message history to summarize
   * @param keepRecentCount - Number of recent messages to preserve (default: 10)
   * @returns Summarized messages: [system, summary, ...recent messages]
   */
  private async summarizeMessages(
    messages: BaseMessage[],
    keepRecentCount: number = 10
  ): Promise<BaseMessage[]> {
    if (messages.length <= keepRecentCount + 2) {
      // Not enough messages to warrant summarization
      return messages;
    }

    const systemMessage = messages.find((m) => m._getType() === "system");
    const recentMessages = messages.slice(-keepRecentCount);
    const toSummarize = messages.slice(systemMessage ? 1 : 0, -keepRecentCount);

    if (toSummarize.length === 0) {
      return messages;
    }

    // Build conversation text for summarization
    const conversationText = toSummarize
      .map((msg) => {
        const type = msg._getType();
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);

        if (type === "human") return `Human: ${content}`;
        if (type === "ai") return `Assistant: ${content}`;
        if (type === "tool")
          return `Tool Result: ${content.substring(0, 200)}...`; // Truncate tool results
        return `${type}: ${content}`;
      })
      .join("\n\n");

    // Request concise summary from LLM
    const summaryPrompt = `Summarize the following conversation history concisely. Focus on:
- Key decisions made
- Important findings or errors
- Tools used and their outcomes
- Current state of the work

Keep the summary under 500 tokens. Be specific and factual.

CONVERSATION HISTORY:
${conversationText}

CONCISE SUMMARY:`;

    try {
      const summaryResult = await this.llm!.invoke([
        new HumanMessage(summaryPrompt),
      ]);
      const summaryContent = summaryResult.content.toString();

      console.log(
        `📝 Summarized ${toSummarize.length} messages into ${Math.ceil(
          summaryContent.length / 4
        )} tokens`
      );
      console.log(`   Kept ${keepRecentCount} recent messages for continuity`);

      // Build new message array: [system?, summary, ...recent]
      const result: BaseMessage[] = [];
      if (systemMessage) result.push(systemMessage);
      result.push(
        new AIMessage({
          content: `[CONVERSATION SUMMARY]\n${summaryContent}\n[END SUMMARY]\n\nContinuing with recent messages...`,
        })
      );
      result.push(...recentMessages);

      return result;
    } catch (error: any) {
      console.warn(`⚠️  Failed to summarize messages: ${error.message}`);
      console.warn(
        `   Falling back to keeping all messages (may hit context limits)`
      );
      return messages;
    }
  }

  async execute(
    task: string,
    retryCount: number = 0,
    circuitBreakerLimit?: number, // Optional: PM's estimate × 1.5
    sessionId?: string, // Optional: Enable conversation persistence with embeddings + retrieval
    workingDirectory?: string // Optional: Working directory for tool execution (defaults to process.cwd())
  ): Promise<{
    output: string;
    conversationHistory: Array<{ role: string; content: string }>;
    tokens: { input: number; output: number };
    toolCalls: number;
    intermediateSteps: any[];
    metadata?: {
      toolCallCount: number;
      messageCount: number;
      estimatedContextTokens: number;
      qcRecommended: boolean;
      circuitBreakerTriggered: boolean;
      circuitBreakerReason?: string;
      duration: number;
    };
  }> {
    if (!this.llm) {
      throw new Error("LLM not initialized. Call loadPreamble() first.");
    }

    // Ensure rate limiter is initialized (should happen in initializeLLM)
    if (!this.rateLimiter) {
      throw new Error(
        "Rate limiter not initialized. This should not happen - please report this bug."
      );
    }

    // Conservative estimate: 1 base request + assume some tool calls
    // Will be updated with actual count after execution
    const estimatedRequests = 1 + Math.min(this.tools.length, 10); // Assume up to 10 tool calls

    // Wrap execution with rate limiter AND workspace context
    return this.rateLimiter.enqueue(async () => {
      // Set up workspace context for tool execution
      const executeWithContext = async () => {
        const result = await this.executeInternal(
          task,
          retryCount,
          circuitBreakerLimit,
          sessionId
        );

        // Record actual API usage after execution
        this.recordAPIUsageMetrics(result);

        return result;
      };

      // If working directory specified, run with workspace context
      if (workingDirectory) {
        console.log(`📁 Workspace context: ${workingDirectory}`);
        return runWithWorkspaceContext(
          { workingDirectory },
          executeWithContext
        );
      } else {
        // No workspace context - tools will use process.cwd()
        return executeWithContext();
      }
    }, estimatedRequests);
  }

  /**
   * Internal execution method (rate-limited by enqueue wrapper)
   */
  private async executeInternal(
    task: string,
    retryCount: number = 0,
    circuitBreakerLimit?: number, // Optional: PM's estimate × 1.5, defaults to 50
    sessionId?: string // Optional: session ID for conversation persistence
  ): Promise<{
    output: string;
    conversationHistory: Array<{ role: string; content: string }>;
    tokens: { input: number; output: number };
    toolCalls: number;
    intermediateSteps: any[];
    metadata?: {
      toolCallCount: number;
      messageCount: number;
      estimatedContextTokens: number;
      qcRecommended: boolean;
      circuitBreakerTriggered: boolean;
      circuitBreakerReason?: string;
      duration: number;
    };
  }> {
    if (!this.llm) {
      throw new Error("LLM not initialized. Call loadPreamble() first.");
    }

    console.log("\n🚀 Starting execution...\n");
    console.log(
      `🔍 Provider: ${this.provider}, Model: ${this.modelName}, BaseURL: ${this.baseURL}`
    );
    console.log(`🔍 Task length: ${task.length} chars\n`);

    const startTime = Date.now();

    // Build messages with conversation history if sessionId provided
    let messagesWithHistory: BaseMessage[] | null = null;
    if (sessionId && this.conversationHistory) {
      console.log(`🧠 Building conversation context with embeddings + retrieval (session: ${sessionId})...`);
      try {
        messagesWithHistory = await this.conversationHistory.buildConversationContext(
          sessionId,
          this.systemPrompt,
          task
        );
        console.log(`✅ Retrieved conversation context: ${messagesWithHistory.length} messages`);
        
        // Log stats if available
        const stats = await this.conversationHistory.getSessionStats(sessionId);
        console.log(`📊 Session stats: ${stats.totalMessages} total messages (${stats.userMessages} user, ${stats.assistantMessages} assistant)`);
      } catch (error: any) {
        console.warn(`⚠️  Failed to build conversation context: ${error.message}`);
        console.warn(`   Continuing without conversation history`);
      }
    }

    // Direct LLM mode (no agent/tools)
    if (this.tools.length === 0) {
      console.log("📤 Invoking LLM directly (no tool calling)...");

      // Use conversation history if available, otherwise use simple messages
      const messages = messagesWithHistory || [
        new SystemMessage(this.systemPrompt),
        new HumanMessage(task),
      ];
      const tokenCircuitBreakerEnabled = true;
      // Circuit breaker: Max output tokens (calculated from existing test results)
      // Based on median of healthy runs (excluding outliers): 609 tokens
      // Threshold = 3x median = 1827 tokens
      const MAX_OUTPUT_TOKENS = 5000;

      const response = await this.llm.invoke(messages);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`\n✅ LLM completed in ${duration}s\n`);

      const output = response.content.toString();

      // Count tokens (approximate)
      const inputTokens = Math.ceil(
        (this.systemPrompt.length + task.length) / 4
      );
      const outputTokens = Math.ceil(output.length / 4);

      // Check circuit breaker
      if (tokenCircuitBreakerEnabled && outputTokens > MAX_OUTPUT_TOKENS) {
        console.warn(
          `\n⚠️  CIRCUIT BREAKER TRIGGERED: Output tokens (${outputTokens}) exceeded limit (${MAX_OUTPUT_TOKENS})`
        );
        console.warn(
          `   This indicates runaway generation. Truncating output...\n`
        );

        // Truncate output to max tokens
        const maxChars = MAX_OUTPUT_TOKENS * 4; // Approximate chars per token
        const truncatedOutput =
          output.substring(0, maxChars) +
          "\n\n[OUTPUT TRUNCATED BY CIRCUIT BREAKER]";

        return {
          output: truncatedOutput,
          toolCalls: 0,
          tokens: {
            input: inputTokens,
            output: MAX_OUTPUT_TOKENS, // Report as limit
          },
          conversationHistory: [
            { role: "system", content: this.systemPrompt },
            { role: "user", content: task },
            { role: "assistant", content: truncatedOutput },
          ],
          intermediateSteps: [],
          metadata: {
            toolCallCount: 0,
            messageCount: 3,
            estimatedContextTokens: inputTokens + MAX_OUTPUT_TOKENS,
            qcRecommended: false,
            circuitBreakerTriggered: true,
            circuitBreakerReason: `Output tokens (${outputTokens}) exceeded limit (${MAX_OUTPUT_TOKENS})`,
            duration: parseFloat(duration),
          },
        };
      }

      // Store conversation turn if sessionId provided
      if (sessionId && this.conversationHistory) {
        try {
          await this.conversationHistory.storeConversationTurn(
            sessionId,
            task,
            output
          );
          console.log(`💾 Stored conversation turn to session ${sessionId}`);
        } catch (error: any) {
          console.warn(`⚠️  Failed to store conversation: ${error.message}`);
        }
      }

      return {
        output,
        toolCalls: 0,
        tokens: {
          input: inputTokens,
          output: outputTokens,
        },
        conversationHistory: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: task },
          { role: "assistant", content: output },
        ],
        intermediateSteps: [],
        metadata: {
          toolCallCount: 0,
          messageCount: 3, // system + user + assistant
          estimatedContextTokens: inputTokens + outputTokens,
          qcRecommended: false,
          circuitBreakerTriggered: false,
          duration: parseFloat(duration),
        },
      };
    }

    // Agent mode (with tools)
    const maxRetries = 2; // Allow 2 retries for malformed tool calls

    try {
      console.log("📤 Invoking agent with LangGraph...");

      // Circuit breaker: Stop execution if tool calls exceed threshold
      // Use PM's estimate (×10) if provided, otherwise default to 100
      const MAX_TOOL_CALLS = circuitBreakerLimit || 100;
      const MAX_MESSAGES = MAX_TOOL_CALLS * 10; // ~10 messages per tool call (generous buffer)

      console.log(
        `🔒 Circuit breaker limit: ${MAX_TOOL_CALLS} tool calls (${
          circuitBreakerLimit ? "from PM estimate" : "default"
        })`
      );

      // Calculate token budget (context window - function schemas - completion reserve - safety margin)
      const contextWindow = await this.getContextWindow();
      const functionTokens = 2214; // Measured: 14 tools = ~2214 tokens
      const completionReserve = this.maxCompletionTokens;
      const safetyMargin = 2000; // Buffer for system prompt and formatting
      const maxMessageTokens = contextWindow - functionTokens - completionReserve - safetyMargin;
      
      console.log(`📊 Token budget: ${maxMessageTokens.toLocaleString()} for messages (${contextWindow.toLocaleString()} total - ${functionTokens} tools - ${completionReserve} completion - ${safetyMargin} margin)`);

      // ✅ PROPER FIX: Create fresh agent for each request (LangGraph 1.0 best practice)
      // Per LangGraph documentation: Agents are STATELESS by default (no checkpointer = no persistence)
      // Creating a fresh agent per request prevents LangGraph's internal state accumulation
      // This is the industry-standard pattern for stateless agents
      console.log(`🔄 Creating fresh agent for this request (stateless mode)...`);
      const freshAgent = createReactAgent({
        llm: this.llm,
        tools: this.tools,
        prompt: new SystemMessage(this.systemPrompt),
      });
      
      // Pass conversation history if available, otherwise just the current task
      // LangGraph will manage tool call loops internally
      let initialMessages: BaseMessage[];
      if (messagesWithHistory) {
        // Remove system message from history (already in agent prompt)
        initialMessages = messagesWithHistory.filter(m => m._getType() !== 'system');
        console.log(`📝 Using ${initialMessages.length} messages from conversation history`);
      } else {
        initialMessages = [new HumanMessage(task)];
      }
      
      console.log(`🔧 Agent initialized with ${this.tools.length} tools: ${this.tools.map(t => t.name).join(', ')}`);
      
      const result = await freshAgent.invoke(
        {
          messages: initialMessages,
        },
        {
          recursionLimit: MAX_MESSAGES, // Generous limit to prevent premature cutoff
        }
      );
      console.log("📥 Agent invocation complete");
      
      // Debug: Log tool calls
      const resultMessages = result.messages || [];
      const detectedToolCalls = resultMessages.filter((m: any) => m._getType() === 'tool');
      console.log(`🔍 Debug: ${detectedToolCalls.length} tool calls detected in response`);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Agent completed in ${duration}s\n`);

      // Debug: Log what we actually got
      console.log("📦 Result keys:", Object.keys(result));
      console.log("📦 Result type:", typeof result);
      
      // Log message count before trimming
      const messagesBeforeTrim = (result as any).messages?.length || 0;
      console.log(`📨 Messages in result: ${messagesBeforeTrim}`);

      // Extract the final message from LangGraph result
      const messages = (result as any).messages || [];
      const lastMessage = messages[messages.length - 1];
      const output = lastMessage?.content || "No response generated";

      if (!output || output.length === 0) {
        console.warn("⚠️  WARNING: Agent returned empty output!\n");
        console.warn("Full result:", JSON.stringify(result, null, 2));
      }

      // Extract conversation history from messages
      const conversationHistory: Array<{ role: string; content: string }> = [
        { role: "system", content: this.systemPrompt },
      ];

      // Add all messages to conversation history
      for (const message of messages) {
        const role =
          (message as any)._getType() === "human"
            ? "user"
            : (message as any)._getType() === "ai"
            ? "assistant"
            : (message as any)._getType() === "system"
            ? "system"
            : "tool";

        conversationHistory.push({
          role,
          content: (message as any).content,
        });
      }

      // Count tool calls from messages (total tool_calls across all AI messages)
      const toolCalls = messages.reduce((total: number, msg: any) => {
        if (
          msg._getType() === "ai" &&
          msg.tool_calls &&
          msg.tool_calls.length > 0
        ) {
          return total + msg.tool_calls.length;
        }
        return total;
      }, 0);

      console.log(`\n✅ Task completed in ${duration}s`);
      console.log(`📊 Tokens: ${this.estimateTokens(output)}`);
      console.log(`🔧 Tool calls: ${toolCalls}`);

      // Circuit breaker warnings
      const messageCount = messages.length;
      if (toolCalls > 50) {
        console.warn(
          `⚠️  HIGH TOOL USAGE: ${toolCalls} tool calls - agent may be stuck in a loop`
        );
        console.warn(
          `💡 Consider: QC review, task simplification, or circuit breaker intervention`
        );
      }
      // Note: Recursion limit is now dynamic (10x tool calls), no need for hardcoded warning

      // Calculate estimated context size
      const estimatedContext = messages.reduce((sum: number, msg: any) => {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        return sum + Math.ceil(content.length / 4);
      }, 0);
      if (estimatedContext > 80000) {
        console.warn(
          `⚠️  HIGH CONTEXT: ~${estimatedContext.toLocaleString()} tokens - approaching limits`
        );
      }

      // Determine if QC intervention is recommended (soft thresholds)
      const qcRecommended =
        toolCalls > 30 || messageCount > 40 || estimatedContext > 50000;

      // Circuit breaker triggers on hard limits
      // Use dynamic limit if provided (PM estimate × 1.5), otherwise default to 50
      const toolCallLimit = MAX_TOOL_CALLS;
      const messageLimit = MAX_MESSAGES;
      const circuitBreakerTriggered =
        toolCalls > toolCallLimit ||
        messageCount > messageLimit ||
        estimatedContext > 80000;

      // Store conversation turn if sessionId provided
      if (sessionId && this.conversationHistory) {
        try {
          await this.conversationHistory.storeConversationTurn(
            sessionId,
            task,
            output
          );
          console.log(`💾 Stored conversation turn to session ${sessionId}`);
        } catch (error: any) {
          console.warn(`⚠️  Failed to store conversation: ${error.message}`);
        }
      }

      return {
        output,
        conversationHistory,
        tokens: {
          input: this.estimateTokens(this.systemPrompt + task),
          output: this.estimateTokens(output),
        },
        toolCalls,
        intermediateSteps: messages as any[], // Return messages as intermediate steps
        // Circuit breaker metadata for task executor
        metadata: {
          toolCallCount: toolCalls,
          messageCount: messageCount,
          estimatedContextTokens: estimatedContext,
          qcRecommended,
          circuitBreakerTriggered,
          duration: parseFloat(duration),
        },
      };
    } catch (error: any) {
      // Check if this is a tool call parsing error
      const isToolCallError =
        error.message?.includes("error parsing tool call") ||
        error.message?.includes("invalid character") ||
        error.message?.includes("JSON");

      if (isToolCallError && retryCount < maxRetries) {
        console.warn(
          `\n⚠️  Tool call parsing error detected (attempt ${retryCount + 1}/${
            maxRetries + 1
          })`
        );
        console.warn(`   Error: ${error.message.substring(0, 150)}...`);
        console.warn(
          `   Retrying with guidance to use simpler tool calls...\n`
        );

        // Retry with additional guidance
        const retryTask = `${task}

**IMPORTANT**: If using tools, ensure JSON is valid. Keep tool arguments simple and well-formatted.`;

        return await this.executeInternal(retryTask, retryCount + 1, circuitBreakerLimit, sessionId);
      }

      // If not a tool call error or max retries exceeded, provide helpful error message
      const isRecursionError = error.message?.includes("Recursion limit");

      if (isToolCallError) {
        console.error(
          "\n❌ Agent execution failed due to malformed tool calls after retries"
        );
        console.error(
          "💡 Suggestion: This model may not support tool calling reliably."
        );
        console.error("   Consider switching to a more capable model:");
        console.error(
          '   - For PM agent: Use copilot/gpt-4o (set agentDefaults.pm.provider="copilot")'
        );
        console.error(
          "   - For Ollama: Try qwen2.5-coder, deepseek-coder, or llama3.1 instead of gpt-oss"
        );
        console.error(`\n   Original error: ${error.message}\n`);
      } else if (isRecursionError) {
        console.error("\n❌ Agent execution failed: Recursion limit reached");
        console.error(
          "💡 This task is extremely complex or the agent is stuck in a loop."
        );
        console.error("   Possible causes:");
        console.error("   - Task requires an excessive number of tool calls");
        console.error("   - Agent is repeating the same actions");
        console.error("   - Task description is ambiguous, causing confusion");
        console.error("\n   Suggestions:");
        console.error("   - Break this task into smaller subtasks");
        console.error("   - Make task requirements more specific and clear");
        console.error("   - Review the agent preamble for better guidance\n");
      } else {
        console.error("\n❌ Agent execution failed:", error.message);
        console.error("Stack trace:", error.stack);
      }

      throw error;
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Record actual API usage metrics after execution completes.
   * Counts AIMessage objects to determine actual API requests made.
   *
   * Note: Each agent node execution = 1 API request in LangGraph.
   * We count AIMessages because each one represents an agent node execution.
   */
  private recordAPIUsageMetrics(result: {
    toolCalls: number;
    intermediateSteps: any[];
  }): void {
    // Count actual API requests (each AIMessage = 1 request)
    const actualRequests = result.intermediateSteps.filter(
      (msg: any) => msg._getType() === "ai"
    ).length;

    // Log discrepancy for monitoring
    if (actualRequests > 0 && this.rateLimiter) {
      const metrics = this.rateLimiter.getMetrics();
      console.log(
        `📊 API Usage: ${actualRequests} requests, ${result.toolCalls} tool calls`
      );

      // Handle bypass mode display
      if (metrics.remainingCapacity === Infinity) {
        console.log(`📊 Rate Limit: BYPASSED (no limits enforced)`);
      } else {
        const totalCapacity =
          metrics.requestsInCurrentHour + metrics.remainingCapacity;
        console.log(
          `📊 Rate Limit: ${
            metrics.requestsInCurrentHour
          }/${totalCapacity} (${metrics.usagePercent.toFixed(1)}%)`
        );
      }
    }
  }
}
