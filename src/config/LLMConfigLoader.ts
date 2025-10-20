/**
 * @file src/config/LLMConfigLoader.ts
 * @description Configuration loader for LLM providers with context window management
 * 
 * Implementation created using TDD - all tests in testing/config/llm-config-loader.test.ts must pass
 */

import fs from 'fs/promises';
import path from 'path';

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
    vectorEmbeddings?: boolean;
  };
}

export class LLMConfigLoader {
  private static instance: LLMConfigLoader;
  private config: LLMConfig | null = null;
  private configPath: string;

  private constructor() {
    this.configPath = process.env.MIMIR_LLM_CONFIG || '.mimir/llm-config.json';
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
    // Override Ollama baseUrl
    if (process.env.OLLAMA_BASE_URL && config.providers.ollama) {
      config.providers.ollama.baseUrl = process.env.OLLAMA_BASE_URL;
      console.log(`🔧 Ollama URL: ${process.env.OLLAMA_BASE_URL}`);
    }

    // Feature flags
    if (process.env.MIMIR_FEATURE_PM_MODEL_SUGGESTIONS !== undefined) {
      config.features = config.features || {};
      config.features.pmModelSuggestions = process.env.MIMIR_FEATURE_PM_MODEL_SUGGESTIONS === 'true';
      console.log(`🔧 PM Model Suggestions: ${config.features.pmModelSuggestions}`);
    }

    if (process.env.MIMIR_FEATURE_VECTOR_EMBEDDINGS !== undefined) {
      config.features = config.features || {};
      config.features.vectorEmbeddings = process.env.MIMIR_FEATURE_VECTOR_EMBEDDINGS === 'true';
      console.log(`🔧 Vector Embeddings Feature: ${config.features.vectorEmbeddings}`);
    }

    // Embeddings configuration
    if (process.env.MIMIR_EMBEDDINGS_ENABLED !== undefined) {
      config.embeddings = config.embeddings || {
        enabled: false,
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
        chunkSize: 512,
        chunkOverlap: 50
      };
      config.embeddings.enabled = process.env.MIMIR_EMBEDDINGS_ENABLED === 'true';
      console.log(`🔧 Embeddings Enabled: ${config.embeddings.enabled}`);
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

    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configContent);
      
      // Validate required fields
      if (!parsedConfig.defaultProvider || !parsedConfig.providers) {
        throw new Error('Invalid config: missing defaultProvider or providers');
      }
      
      // Apply environment variable overrides (Docker-friendly)
      this.applyEnvironmentOverrides(parsedConfig);
      
      this.config = parsedConfig;
      return this.config!;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn(`⚠️  LLM config not found at ${this.configPath}, using defaults`);
        this.config = this.getDefaultConfig();
        return this.config;
      }
      
      // JSON parse error or validation error
      console.warn(`⚠️  Error loading LLM config: ${error.message}, using defaults`);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  private getDefaultConfig(): LLMConfig {
    const config: LLMConfig = {
      defaultProvider: 'ollama',
      providers: {
        ollama: {
          baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          defaultModel: 'gpt-oss',
          models: {
            'gpt-oss': {
              name: 'gpt-oss',
              contextWindow: 32768,
              description: 'Open-source GPT model (13B params), good balance of quality and speed',
              recommendedFor: ['pm', 'worker', 'qc'],
              config: {
                numCtx: 32768,
                temperature: 0.0,
                numPredict: -1,
              },
            },
            tinyllama: {
              name: 'tinyllama',
              contextWindow: 8192,
              description: '1.1B params, very fast inference (backup/testing only)',
              recommendedFor: ['testing'],
              config: {
                numCtx: 8192,
                temperature: 0.0,
                numPredict: -1,
              },
            },
          },
        },
      },
    };

    // Apply environment overrides (including embeddings config)
    this.applyEnvironmentOverrides(config);
    
    return config;
  }

  async getModelConfig(provider: string, model: string): Promise<ModelConfig> {
    const config = await this.load();
    const providerConfig = config.providers[provider];
    
    if (!providerConfig) {
      throw new Error(`Provider '${provider}' not found in config`);
    }

    const modelConfig = providerConfig.models[model];
    
    if (!modelConfig) {
      throw new Error(`Model '${model}' not found for provider '${provider}'`);
    }

    return modelConfig;
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
    return config.features?.vectorEmbeddings === true && config.embeddings?.enabled === true;
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
