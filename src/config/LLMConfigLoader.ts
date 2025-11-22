/**
 * @file src/config/LLMConfigLoader.ts
 * @description Configuration loader for LLM providers with context window management
 * 
 * Implementation created using TDD - all tests in testing/config/llm-config-loader.test.ts must pass
 */

// No file I/O needed - everything is dynamic from ENV + provider APIs
import { createSecureFetchOptions } from '../utils/fetch-helper.js';

export interface ModelConfig {
  name: string;
  contextWindow: number;
  extendedContextWindow?: number;
  description: string;
  recommendedFor: string[];
  config: Record<string, any>;
  costPerMToken?: {
    input: number;
    output: number;
  };
  warnings?: string[];
  supportsTools?: boolean; // NEW: Does this model support function/tool calling?
}

export interface ProviderConfig {
  baseUrl?: string;
  defaultModel: string;
  models: Record<string, ModelConfig>;
  enabled?: boolean;
  requiresAuth?: boolean;
  authInstructions?: string;
}

export interface EmbeddingsConfig {
  enabled: boolean;
  provider: string;
  model: string;
  dimensions?: number;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface LLMConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  agentDefaults?: Record<string, {
    provider: string;
    model: string;
    rationale: string;
  }>;
  embeddings?: EmbeddingsConfig;
  features?: {
    pmModelSuggestions?: boolean;
  };
}

export class LLMConfigLoader {
  private static instance: LLMConfigLoader;
  private config: LLMConfig | null = null;

  private constructor() {
    // No config file - everything is ENV-based
  }

  static getInstance(): LLMConfigLoader {
    if (!LLMConfigLoader.instance) {
      LLMConfigLoader.instance = new LLMConfigLoader();
    }
    return LLMConfigLoader.instance;
  }

  /**
   * Reset cached config (for testing)
   */
  resetCache(): void {
    this.config = null;
  }

  /**
   * Apply environment variable overrides to config
   * Allows docker-compose.yml to control feature flags and settings
   */
  private applyEnvironmentOverrides(config: LLMConfig): void {
    // During unit tests we want deterministic behavior and to avoid picking up
    // environment variables from the developer machine (for example a local
    // `.env` file). If running under the test runner, skip env overrides.
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    // Override LLM base URL for the active provider (simple concat)
    if (process.env.MIMIR_LLM_API) {
      const activeProvider = config.defaultProvider;
      if (config.providers[activeProvider]) {
        config.providers[activeProvider].baseUrl = process.env.MIMIR_LLM_API;
        console.log(`🔧 LLM Base URL (${activeProvider}): ${process.env.MIMIR_LLM_API}`);
        const chatPath = process.env.MIMIR_LLM_API_PATH || '/v1/chat/completions';
        const modelsPath = process.env.MIMIR_LLM_API_MODELS_PATH || '/v1/models';
        console.log(`🔧 Chat Path: ${chatPath}`);
        console.log(`🔧 Models Path: ${modelsPath}`);
      }
    }

    // Feature flags
    if (process.env.MIMIR_FEATURE_PM_MODEL_SUGGESTIONS !== undefined) {
      config.features = config.features || {};
      config.features.pmModelSuggestions = process.env.MIMIR_FEATURE_PM_MODEL_SUGGESTIONS === 'true';
      console.log(`🔧 PM Model Suggestions: ${config.features.pmModelSuggestions}`);
    }



    // Embeddings configuration
    // Initialize embeddings config if any embeddings variable is set
    if (process.env.MIMIR_EMBEDDINGS_ENABLED !== undefined ||
        process.env.MIMIR_EMBEDDINGS_PROVIDER !== undefined ||
        process.env.MIMIR_EMBEDDINGS_MODEL !== undefined) {
      config.embeddings = config.embeddings || {
        enabled: false,
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 50
      };
    }

    if (process.env.MIMIR_EMBEDDINGS_ENABLED !== undefined && config.embeddings) {
      config.embeddings.enabled = process.env.MIMIR_EMBEDDINGS_ENABLED === 'true';
      console.log(`🔧 Embeddings Enabled: ${config.embeddings.enabled}`);
    }

    if (process.env.MIMIR_EMBEDDINGS_PROVIDER && config.embeddings) {
      config.embeddings.provider = process.env.MIMIR_EMBEDDINGS_PROVIDER;
      console.log(`🔧 Embeddings Provider: ${config.embeddings.provider}`);
    }

    if (process.env.MIMIR_EMBEDDINGS_MODEL && config.embeddings) {
      config.embeddings.model = process.env.MIMIR_EMBEDDINGS_MODEL;
      console.log(`🔧 Embeddings Model: ${config.embeddings.model}`);
    }

    if (process.env.MIMIR_EMBEDDINGS_DIMENSIONS && config.embeddings) {
      config.embeddings.dimensions = parseInt(process.env.MIMIR_EMBEDDINGS_DIMENSIONS, 10);
    }

    if (process.env.MIMIR_EMBEDDINGS_CHUNK_SIZE && config.embeddings) {
      config.embeddings.chunkSize = parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_SIZE, 10);
    }

    if (process.env.MIMIR_EMBEDDINGS_CHUNK_OVERLAP && config.embeddings) {
      config.embeddings.chunkOverlap = parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_OVERLAP, 10);
    }
  }

  async load(): Promise<LLMConfig> {
    if (this.config) {
      return this.config;
    }

    // Build config dynamically from ENV variables
    this.config = this.getDefaultConfig();
    this.applyEnvironmentOverrides(this.config);
    
    // Query providers for available models (async population)
    await this.discoverModels(this.config);
    
    return this.config;
  }

  /**
   * Discover available models from provider API
   */
  private async discoverModels(config: LLMConfig): Promise<void> {
    const defaultProvider = config.defaultProvider;
    const providerConfig = config.providers[defaultProvider];
    
    if (!providerConfig) {
      console.warn(`⚠️  Default provider '${defaultProvider}' not configured`);
      return;
    }

    try {
      if (defaultProvider === 'ollama') {
        await this.discoverOllamaModels(providerConfig);
      } else if (defaultProvider === 'copilot' || defaultProvider === 'openai') {
        await this.discoverOpenAIModels(providerConfig, defaultProvider);
      }
    } catch (error: any) {
      console.warn(`⚠️  Failed to discover models from ${defaultProvider}: ${error.message}`);
      console.warn(`   Falling back to default model configuration`);
    }
  }

  /**
   * Discover Ollama models via API
   */
  private async discoverOllamaModels(providerConfig: ProviderConfig): Promise<void> {
    try {
      // Simple concatenation: base URL + models path
      const baseUrl = providerConfig.baseUrl;
      const modelsPath = process.env.MIMIR_LLM_API_MODELS_PATH || '/api/tags';
      const modelsUrl = `${baseUrl}${modelsPath}`;
      
      const response = await fetch(modelsUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const models = data.models || [];
      
      // Build models dynamically from API response
      providerConfig.models = {};
      
      for (const model of models) {
        const modelName = model.name;
        const sizeGB = model.size ? (model.size / (1024 * 1024 * 1024)).toFixed(1) : '?';
        const family = model.details?.family || 'Unknown';
        const paramSize = model.details?.parameter_size || '';
        
        // Try to extract context window from model info or use ENV/default
        const contextWindow = this.getContextWindowFromEnvOrDefault(modelName);
        
        providerConfig.models[modelName] = {
          name: modelName,
          contextWindow,
          description: `${family}${paramSize ? ' ' + paramSize : ''} (${sizeGB}GB)`,
          recommendedFor: this.guessRecommendedFor(modelName),
          config: {
            numCtx: contextWindow,
            temperature: 0.0,
            numPredict: -1,
          },
          supportsTools: this.guessToolSupport(modelName),
        };
      }
      
      console.log(`✅ Discovered ${models.length} Ollama models from ${modelsUrl}`);
    } catch (error: any) {
      console.warn(`⚠️  Failed to query Ollama API: ${error.message}`);
      throw error;
    }
  }

  /**
   * Discover OpenAI/Copilot models via API
   */
  private async discoverOpenAIModels(providerConfig: ProviderConfig, provider: string): Promise<void> {
    try {
      // Simple concatenation: base URL + models path
      const baseUrl = providerConfig.baseUrl;
      const modelsPath = process.env.MIMIR_LLM_API_MODELS_PATH || '/v1/models';
      const modelsUrl = `${baseUrl}${modelsPath}`;
      
      console.log(`🔍 [${provider}] Attempting to connect to: ${modelsUrl}`);
      console.log(`🔍 [${provider}] Base URL: ${baseUrl}`);
      console.log(`🔍 [${provider}] Models Path: ${modelsPath}`);
      console.log(`🔍 [${provider}] API Key configured: ${process.env.MIMIR_LLM_API_KEY ? 'YES (length: ' + process.env.MIMIR_LLM_API_KEY.length + ')' : 'NO'}`);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Add authorization header if API key is configured
      if (process.env.MIMIR_LLM_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.MIMIR_LLM_API_KEY}`;
        console.log(`🔍 [${provider}] Authorization header added`);
      } else {
        console.warn(`⚠️  [${provider}] No API key found in MIMIR_LLM_API_KEY`);
      }
      
      // Configure fetch options with SSL handling
      const fetchOptions = createSecureFetchOptions(modelsUrl, { headers });
      
      if (modelsUrl.startsWith('https://') && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
        console.log(`🔍 [${provider}] SSL verification disabled (NODE_TLS_REJECT_UNAUTHORIZED=0)`);
      }
      
      const response = await fetch(modelsUrl, fetchOptions);
      
      console.log(`🔍 [${provider}] Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.error(`❌ [${provider}] API Error Response: ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const models = data.data || [];
      
      console.log(`🔍 [${provider}] Received ${models.length} models from API`);
      
      // Build models dynamically from API response
      providerConfig.models = {};
      
      for (const model of models) {
        const modelId = model.id;
        
        // Use context_length from API if available, otherwise ENV or default
        const contextWindow = model.context_length 
          || model.max_tokens
          || this.getContextWindowFromEnvOrDefault(modelId);
        
        providerConfig.models[modelId] = {
          name: modelId,
          contextWindow,
          description: model.description || `${provider} model via API`,
          recommendedFor: this.guessRecommendedForOpenAI(modelId),
          config: {
            temperature: 0.0,
            maxTokens: -1,
          },
          supportsTools: true, // All OpenAI/Copilot models support tools
        };
      }
      
      console.log(`✅ Discovered ${models.length} ${provider} models from ${modelsUrl}`);
    } catch (error: any) {
      console.error(`❌ [${provider}] Failed to query API:`);
      console.error(`   Error type: ${error.name}`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Error stack: ${error.stack?.split('\n')[0]}`);
      throw error;
    }
  }

  /**
   * Get context window from ENV variable or use intelligent default
   * ENV variable format: MIMIR_CONTEXT_WINDOW_<MODEL_NAME>=<tokens>
   * Example: MIMIR_CONTEXT_WINDOW_GPT_4_1=128000
   */
  private getContextWindowFromEnvOrDefault(modelName: string): number {
    // Normalize model name for ENV var lookup (replace special chars with underscore)
    const envVarName = `MIMIR_CONTEXT_WINDOW_${modelName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    const envValue = process.env[envVarName];
    
    if (envValue) {
      const parsed = parseInt(envValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        console.log(`🔧 Using ENV context window for ${modelName}: ${parsed.toLocaleString()} tokens`);
        return parsed;
      }
    }
    
    // Global default from ENV
    const globalDefault = process.env.MIMIR_DEFAULT_CONTEXT_WINDOW;
    if (globalDefault) {
      const parsed = parseInt(globalDefault, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    
    // Use intelligent defaults based on model name patterns
    const name = modelName.toLowerCase();
    
    // Premium models with large context
    if (name.includes('gpt-4') || name.includes('claude') || name.includes('gemini')) {
      return 128000; // 128k default for GPT-4 class models
    }
    
    if (name.includes('o1') || name.includes('o3')) {
      return 200000; // 200k for reasoning models
    }
    
    // Open source large context models
    if (name.includes('gemma2') || name.includes('qwen2.5') || name.includes('qwen3')) {
      return 128000; // Modern open source models support large contexts
    }
    
    // Medium context models
    if (name.includes('llama3') || name.includes('llama-3')) {
      return 8192;
    }
    
    if (name.includes('deepseek')) {
      return 16384;
    }
    
    // Small/fast models
    if (name.includes('tiny') || name.includes('mini') || name.includes('1.5b')) {
      return 8192;
    }
    
    // Default: 128k for modern models (err on the side of generosity)
    return 128000;
  }

  /**
   * Guess recommended agent types from model name
   */
  private guessRecommendedFor(modelName: string): string[] {
    const name = modelName.toLowerCase();
    
    // Small/fast models for workers
    if (name.includes('1.5b') || name.includes('tiny') || name.includes('mini')) {
      return ['worker'];
    }
    
    // Medium models for all agents
    if (name.includes('7b') || name.includes('8b')) {
      return ['pm', 'worker', 'qc'];
    }
    
    // Large models for PM/QC
    if (name.includes('13b') || name.includes('70b')) {
      return ['pm', 'qc'];
    }
    
    // Default: all agents
    return ['pm', 'worker', 'qc'];
  }

  /**
   * Guess recommended agent types from OpenAI model ID
   */
  private guessRecommendedForOpenAI(modelId: string): string[] {
    const name = modelId.toLowerCase();
    
    if (name.includes('mini')) {
      return ['worker'];
    }
    
    if (name.includes('o1') || name.includes('o3') || name.includes('claude')) {
      return ['pm', 'qc'];
    }
    
    return ['pm', 'worker', 'qc'];
  }

  /**
   * Guess tool support from model name
   */
  private guessToolSupport(modelName: string): boolean {
    const name = modelName.toLowerCase();
    
    // Known models WITHOUT tool support
    if (name.includes('tinyllama') || name.includes('phi')) {
      return false;
    }
    
    // Qwen, Llama 3+, DeepSeek, and most modern models support tools
    if (name.includes('qwen') || name.includes('llama3') || name.includes('deepseek')) {
      return true;
    }
    
    // Default: assume yes for modern models
    return true;
  }

  private getDefaultConfig(): LLMConfig {
    // Get provider from ENV with fallback
    const defaultProvider = (process.env.MIMIR_DEFAULT_PROVIDER || 'copilot') as string;
    const defaultModel = process.env.MIMIR_DEFAULT_MODEL || 'gpt-4.1';
    
    // Use base URL directly from MIMIR_LLM_API
    const llmBaseUrl = process.env.MIMIR_LLM_API;
    
    const config: LLMConfig = {
      defaultProvider,
      providers: {
        copilot: {
          baseUrl: (defaultProvider === 'copilot' && llmBaseUrl) || 'http://localhost:4141',
          defaultModel: defaultModel,
          models: {},
        },
        ollama: {
          baseUrl: (defaultProvider === 'ollama' && llmBaseUrl) || 'http://localhost:11434',
          defaultModel: defaultModel,
          models: {},
        },
        openai: {
          baseUrl: (defaultProvider === 'openai' && llmBaseUrl) || 'https://api.openai.com',
          defaultModel: defaultModel,
          models: {},
        },
      },
      // Agent defaults from ENV (all use default provider)
      agentDefaults: {
        pm: {
          provider: defaultProvider,
          model: process.env.MIMIR_PM_MODEL || defaultModel,
          rationale: 'PM agent for planning and task breakdown',
        },
        worker: {
          provider: defaultProvider,
          model: process.env.MIMIR_WORKER_MODEL || defaultModel,
          rationale: 'Worker agent for task execution',
        },
        qc: {
          provider: defaultProvider,
          model: process.env.MIMIR_QC_MODEL || defaultModel,
          rationale: 'QC agent for verification',
        },
      },
    };

    return config;
  }

  async getModelConfig(provider: string, model: string): Promise<ModelConfig> {
    const config = await this.load();
    const providerConfig = config.providers[provider];
    
    if (!providerConfig) {
      throw new Error(`Provider '${provider}' not found in config`);
    }

    // Check if we have cached model config
    const modelConfig = providerConfig.models[model];
    
    if (modelConfig) {
      return modelConfig;
    }
    
    // No cached config - return sensible defaults without validation
    // Let the downstream API decide if the model is valid
    return {
      name: model,
      contextWindow: process.env.MIMIR_DEFAULT_CONTEXT_WINDOW 
        ? parseInt(process.env.MIMIR_DEFAULT_CONTEXT_WINDOW) 
        : 128000,
      description: `Model: ${model}`,
      recommendedFor: ['pm', 'worker', 'qc'],
      config: {
        temperature: 0.0,
      },
      supportsTools: true, // Assume modern models support tools
    };
  }

  async getContextWindow(provider: string, model: string): Promise<number> {
    const modelConfig = await this.getModelConfig(provider, model);
    return modelConfig.contextWindow;
  }

  async validateContextSize(
    provider: string,
    model: string,
    tokenCount: number
  ): Promise<{ valid: boolean; warning?: string }> {
    const contextWindow = await this.getContextWindow(provider, model);
    
    // Handle negative or zero token counts (valid but unusual)
    if (tokenCount <= 0) {
      return { valid: true };
    }
    
    if (tokenCount > contextWindow) {
      return {
        valid: false,
        warning: `Context size (${tokenCount} tokens) exceeds ${model} limit (${contextWindow} tokens). Content will be truncated.`,
      };
    }

    // Warn if using >80% of context window (but NOT exactly at limit)
    const percentUsed = (tokenCount / contextWindow) * 100;
    if (percentUsed > 80 && tokenCount < contextWindow) {
      return {
        valid: true,
        warning: `Context size (${tokenCount} tokens) is ${Math.round(percentUsed)}% of ${model} limit. Consider using a model with larger context.`,
      };
    }

    return { valid: true };
  }

  async getAgentDefaults(agentType: 'pm' | 'worker' | 'qc'): Promise<{
    provider: string;
    model: string;
  }> {
    const config = await this.load();
    const defaults = config.agentDefaults?.[agentType];
    
    if (!defaults) {
      // Fallback to global default
      return {
        provider: config.defaultProvider,
        model: config.providers[config.defaultProvider].defaultModel,
      };
    }

    return {
      provider: defaults.provider,
      model: defaults.model,
    };
  }

  async displayModelWarnings(provider: string, model: string): Promise<void> {
    const modelConfig = await this.getModelConfig(provider, model);
    
    if (modelConfig.warnings && modelConfig.warnings.length > 0) {
      console.warn(`\n⚠️  Warnings for ${provider}/${model}:`);
      modelConfig.warnings.forEach(warning => {
        console.warn(`   - ${warning}`);
      });
      console.warn('');
    }
  }

  async isPMModelSuggestionsEnabled(): Promise<boolean> {
    const config = await this.load();
    return config.features?.pmModelSuggestions === true;
  }

  async isVectorEmbeddingsEnabled(): Promise<boolean> {
    const config = await this.load();
    return config.embeddings?.enabled === true;
  }

  async getEmbeddingsConfig(): Promise<EmbeddingsConfig | null> {
    const config = await this.load();
    if (!config.embeddings?.enabled) {
      return null;
    }
    return config.embeddings;
  }

  async getAvailableModels(provider?: string): Promise<Array<{
    provider: string;
    model: string;
    description: string;
    contextWindow: number;
    recommendedFor: string[];
  }>> {
    const config = await this.load();
    const providersToQuery = provider ? [provider] : Object.keys(config.providers);
    
    const models: Array<{
      provider: string;
      model: string;
      description: string;
      contextWindow: number;
      recommendedFor: string[];
    }> = [];

    for (const providerName of providersToQuery) {
      const providerConfig = config.providers[providerName];
      if (!providerConfig) continue;

      for (const [modelName, modelConfig] of Object.entries(providerConfig.models)) {
        models.push({
          provider: providerName,
          model: modelName,
          description: modelConfig.description,
          contextWindow: modelConfig.contextWindow,
          recommendedFor: modelConfig.recommendedFor || [],
        });
      }
    }

    return models;
  }

  async formatAvailableModelsForPM(): Promise<string> {
    const pmSuggestionsEnabled = await this.isPMModelSuggestionsEnabled();
    const config = await this.load();
    
    if (!pmSuggestionsEnabled) {
      return `**Model Selection**: DISABLED (using configured defaults only)

Current agent defaults:
- PM: ${config.agentDefaults?.pm?.model || config.providers[config.defaultProvider].defaultModel}
- Worker: ${config.agentDefaults?.worker?.model || config.providers[config.defaultProvider].defaultModel}
- QC: ${config.agentDefaults?.qc?.model || config.providers[config.defaultProvider].defaultModel}`;
    }

    const models = await this.getAvailableModels();
    
    let output = `**Model Selection**: ENABLED - You can suggest specific models for tasks\n\n`;
    output += `**Available Models:**\n\n`;

    // Group by provider
    const byProvider = models.reduce((acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = [];
      acc[m.provider].push(m);
      return acc;
    }, {} as Record<string, typeof models>);

    for (const [provider, providerModels] of Object.entries(byProvider)) {
      output += `### ${provider.toUpperCase()}\n\n`;
      for (const model of providerModels) {
        output += `- **${model.model}**\n`;
        output += `  - Context: ${model.contextWindow.toLocaleString()} tokens\n`;
        output += `  - Description: ${model.description}\n`;
        output += `  - Recommended for: ${model.recommendedFor.join(', ')}\n\n`;
      }
    }

    output += `\n**Default Agent Configuration:**\n`;
    output += `- PM: ${config.agentDefaults?.pm?.provider}/${config.agentDefaults?.pm?.model}\n`;
    output += `- Worker: ${config.agentDefaults?.worker?.provider}/${config.agentDefaults?.worker?.model}\n`;
    output += `- QC: ${config.agentDefaults?.qc?.provider}/${config.agentDefaults?.qc?.model}\n\n`;
    
    output += `**Instructions for Model Selection:**\n`;
    output += `When creating tasks, you can specify a different model in the "Recommended Model" field.\n`;
    output += `Format: \`provider/model\` (e.g., \`ollama/deepseek-coder:6.7b\`)\n`;
    output += `If not specified or feature is disabled, the default for that agent type will be used.\n`;

    return output;
  }
}
