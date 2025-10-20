/**
 * @file testing/config/llm-config-loader.test.ts
 * @description TDD tests for LLMConfigLoader - written BEFORE implementation
 * 
 * Test Coverage:
 * - Config loading and parsing
 * - Context window retrieval
 * - Context size validation
 * - Warning thresholds (80% usage)
 * - Agent defaults
 * - Model warnings display
 * - Error handling (missing provider, missing model)
 * - Default config fallback
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMConfigLoader } from '../../src/config/LLMConfigLoader.js';
import fs from 'fs/promises';
import path from 'path';

describe('LLMConfigLoader', () => {
  const testConfigPath = '.mimir/test-llm-config.json';
  const testConfig = {
    defaultProvider: 'ollama',
    providers: {
      ollama: {
        baseUrl: 'http://localhost:11434',
        defaultModel: 'tinyllama',
        models: {
          tinyllama: {
            name: 'tinyllama',
            contextWindow: 8192,
            description: '1.1B params, fast inference',
            recommendedFor: ['worker', 'qc'],
            config: {
              numCtx: 8192,
              temperature: 0.0,
              numPredict: -1,
            },
          },
          phi3: {
            name: 'phi3',
            contextWindow: 4096,
            description: '3.8B params, better reasoning',
            recommendedFor: ['pm', 'worker'],
            config: {
              numCtx: 4096,
              temperature: 0.0,
              numPredict: -1,
            },
          },
          'phi3:128k': {
            name: 'phi3:128k',
            contextWindow: 131072,
            description: '3.8B params, massive context',
            recommendedFor: ['pm'],
            config: {
              numCtx: 32768,
              temperature: 0.0,
              numPredict: -1,
            },
            warnings: [
              'Large context = slower inference (5-10x)',
              'Requires 16GB+ RAM',
              'Use only for complex multi-file tasks',
            ],
          },
        },
      },
      copilot: {
        baseUrl: 'http://localhost:4141/v1',
        defaultModel: 'gpt-4o',
        enabled: false,
        models: {
          'gpt-4o': {
            name: 'gpt-4o',
            contextWindow: 128000,
            description: 'OpenAI latest multimodal model',
            recommendedFor: ['pm'],
            config: {
              maxTokens: -1,
              temperature: 0.0,
            },
            costPerMToken: {
              input: 5.0,
              output: 15.0,
            },
          },
        },
      },
    },
    agentDefaults: {
      pm: {
        provider: 'ollama',
        model: 'phi3',
        rationale: 'Need balanced context for planning',
      },
      worker: {
        provider: 'ollama',
        model: 'tinyllama',
        rationale: 'Fast execution with focused context',
      },
      qc: {
        provider: 'ollama',
        model: 'tinyllama',
        rationale: 'Fast validation',
      },
    },
  };

  beforeEach(async () => {
    // Ensure .mimir directory exists
    try {
      await fs.mkdir('.mimir', { recursive: true });
    } catch (error) {
      // Directory already exists
    }
    
    // Write test config
    await fs.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
    
    // Set environment variable to use test config
    process.env.MIMIR_LLM_CONFIG = testConfigPath;
    
    // Reset singleton instance
    (LLMConfigLoader as any).instance = null;
  });

  afterEach(async () => {
    // Clean up test config
    try {
      await fs.unlink(testConfigPath);
    } catch (error) {
      // File doesn't exist, ignore
    }
    
    // Reset environment variable
    delete process.env.MIMIR_LLM_CONFIG;
    
    // Reset singleton instance
    (LLMConfigLoader as any).instance = null;
  });

  describe('Singleton Pattern', () => {
    test('should return the same instance on multiple calls', () => {
      const instance1 = LLMConfigLoader.getInstance();
      const instance2 = LLMConfigLoader.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Config Loading', () => {
    test('should load config from file', async () => {
      const loader = LLMConfigLoader.getInstance();
      const config = await loader.load();
      
      expect(config).toBeDefined();
      expect(config.defaultProvider).toBe('ollama');
      expect(config.providers.ollama).toBeDefined();
      expect(config.providers.copilot).toBeDefined();
    });

    test('should cache loaded config on subsequent calls', async () => {
      const loader = LLMConfigLoader.getInstance();
      
      const config1 = await loader.load();
      const config2 = await loader.load();
      
      expect(config1).toBe(config2); // Same object reference
    });

    test('should use default config if file not found', async () => {
      // Delete test config
      await fs.unlink(testConfigPath);
      
      const loader = LLMConfigLoader.getInstance();
      const config = await loader.load();
      
      expect(config).toBeDefined();
      expect(config.defaultProvider).toBe('ollama');
      expect(config.providers.ollama.defaultModel).toBe('gpt-oss'); // Updated default
    });

    test('should respect MIMIR_LLM_CONFIG environment variable', async () => {
      const customPath = '.mimir/custom-config.json';
      process.env.MIMIR_LLM_CONFIG = customPath;
      
      const customConfig = { ...testConfig, defaultProvider: 'copilot' };
      await fs.writeFile(customPath, JSON.stringify(customConfig, null, 2));
      
      // Reset singleton to pick up new env var
      (LLMConfigLoader as any).instance = null;
      const loader = LLMConfigLoader.getInstance();
      const config = await loader.load();
      
      expect(config.defaultProvider).toBe('copilot');
      
      // Cleanup
      await fs.unlink(customPath);
    });
  });

  describe('Model Configuration Retrieval', () => {
    test('should get model config by provider and model name', async () => {
      const loader = LLMConfigLoader.getInstance();
      const modelConfig = await loader.getModelConfig('ollama', 'tinyllama');
      
      expect(modelConfig).toBeDefined();
      expect(modelConfig.name).toBe('tinyllama');
      expect(modelConfig.contextWindow).toBe(8192);
      expect(modelConfig.config.numCtx).toBe(8192);
    });

    test('should throw error for unknown provider', async () => {
      const loader = LLMConfigLoader.getInstance();
      
      await expect(
        loader.getModelConfig('unknown-provider', 'some-model')
      ).rejects.toThrow("Provider 'unknown-provider' not found");
    });

    test('should throw error for unknown model', async () => {
      const loader = LLMConfigLoader.getInstance();
      
      await expect(
        loader.getModelConfig('ollama', 'unknown-model')
      ).rejects.toThrow("Model 'unknown-model' not found for provider 'ollama'");
    });

    test('should retrieve different models for same provider', async () => {
      const loader = LLMConfigLoader.getInstance();
      
      const tinyllama = await loader.getModelConfig('ollama', 'tinyllama');
      const phi3 = await loader.getModelConfig('ollama', 'phi3');
      
      expect(tinyllama.contextWindow).toBe(8192);
      expect(phi3.contextWindow).toBe(4096);
    });
  });

  describe('Context Window Retrieval', () => {
    test('should get context window for model', async () => {
      const loader = LLMConfigLoader.getInstance();
      const contextWindow = await loader.getContextWindow('ollama', 'tinyllama');
      
      expect(contextWindow).toBe(8192);
    });

    test('should get different context windows for different models', async () => {
      const loader = LLMConfigLoader.getInstance();
      
      const tinyllamaCtx = await loader.getContextWindow('ollama', 'tinyllama');
      const phi3Ctx = await loader.getContextWindow('ollama', 'phi3');
      const phi3128kCtx = await loader.getContextWindow('ollama', 'phi3:128k');
      
      expect(tinyllamaCtx).toBe(8192);
      expect(phi3Ctx).toBe(4096);
      expect(phi3128kCtx).toBe(131072);
    });

    test('should get context window for cloud models', async () => {
      const loader = LLMConfigLoader.getInstance();
      const gpt4oCtx = await loader.getContextWindow('copilot', 'gpt-4o');
      
      expect(gpt4oCtx).toBe(128000);
    });
  });

  describe('Context Size Validation', () => {
    test('should validate token count within context window', async () => {
      const loader = LLMConfigLoader.getInstance();
      const validation = await loader.validateContextSize('ollama', 'tinyllama', 4000);
      
      expect(validation.valid).toBe(true);
      expect(validation.warning).toBeUndefined();
    });

    test('should reject token count exceeding context window', async () => {
      const loader = LLMConfigLoader.getInstance();
      const validation = await loader.validateContextSize('ollama', 'tinyllama', 10000);
      
      expect(validation.valid).toBe(false);
      expect(validation.warning).toBeDefined();
      expect(validation.warning).toContain('exceeds');
      expect(validation.warning).toContain('tinyllama');
      expect(validation.warning).toContain('8192');
    });

    test('should warn when using >80% of context window', async () => {
      const loader = LLMConfigLoader.getInstance();
      const tokenCount = Math.ceil(8192 * 0.85); // 85% of 8192
      const validation = await loader.validateContextSize('ollama', 'tinyllama', tokenCount);
      
      expect(validation.valid).toBe(true);
      expect(validation.warning).toBeDefined();
      expect(validation.warning).toContain('85%');
    });

    test('should not warn when using <80% of context window', async () => {
      const loader = LLMConfigLoader.getInstance();
      const tokenCount = Math.ceil(8192 * 0.5); // 50% of 8192
      const validation = await loader.validateContextSize('ollama', 'tinyllama', tokenCount);
      
      expect(validation.valid).toBe(true);
      expect(validation.warning).toBeUndefined();
    });

    test('should validate exactly at context window limit', async () => {
      const loader = LLMConfigLoader.getInstance();
      const validation = await loader.validateContextSize('ollama', 'tinyllama', 8192);
      
      expect(validation.valid).toBe(true);
      expect(validation.warning).toBeUndefined();
    });

    test('should handle large context windows (128K)', async () => {
      const loader = LLMConfigLoader.getInstance();
      const validation = await loader.validateContextSize('ollama', 'phi3:128k', 100000);
      
      expect(validation.valid).toBe(true);
      expect(validation.warning).toBeUndefined();
    });
  });

  describe('Agent Defaults', () => {
    test('should get agent defaults for PM agent', async () => {
      const loader = LLMConfigLoader.getInstance();
      const defaults = await loader.getAgentDefaults('pm');
      
      expect(defaults).toBeDefined();
      expect(defaults.provider).toBe('ollama');
      expect(defaults.model).toBe('phi3');
    });

    test('should get agent defaults for Worker agent', async () => {
      const loader = LLMConfigLoader.getInstance();
      const defaults = await loader.getAgentDefaults('worker');
      
      expect(defaults.provider).toBe('ollama');
      expect(defaults.model).toBe('tinyllama');
    });

    test('should get agent defaults for QC agent', async () => {
      const loader = LLMConfigLoader.getInstance();
      const defaults = await loader.getAgentDefaults('qc');
      
      expect(defaults.provider).toBe('ollama');
      expect(defaults.model).toBe('tinyllama');
    });

    test('should fallback to global default if agent defaults not defined', async () => {
      // Remove agent defaults from config
      const configWithoutDefaults: any = { ...testConfig };
      delete configWithoutDefaults.agentDefaults;
      
      await fs.writeFile(testConfigPath, JSON.stringify(configWithoutDefaults, null, 2));
      
      // Reset singleton
      (LLMConfigLoader as any).instance = null;
      const loader = LLMConfigLoader.getInstance();
      const defaults = await loader.getAgentDefaults('pm');
      
      expect(defaults.provider).toBe('ollama');
      expect(defaults.model).toBe('tinyllama');
    });
  });

  describe('Model Warnings', () => {
    test('should display warnings for models with warnings', async () => {
      const loader = LLMConfigLoader.getInstance();
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await loader.displayModelWarnings('ollama', 'phi3:128k');
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      const allCalls = consoleWarnSpy.mock.calls.flat().join('\n');
      expect(allCalls).toContain('phi3:128k');
      expect(allCalls).toContain('slower inference');
      expect(allCalls).toContain('16GB+ RAM');
      
      consoleWarnSpy.mockRestore();
    });

    test('should not display warnings for models without warnings', async () => {
      const loader = LLMConfigLoader.getInstance();
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await loader.displayModelWarnings('ollama', 'tinyllama');
      
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Cost Information', () => {
    test('should retrieve cost information for cloud models', async () => {
      const loader = LLMConfigLoader.getInstance();
      const modelConfig = await loader.getModelConfig('copilot', 'gpt-4o');
      
      expect(modelConfig.costPerMToken).toBeDefined();
      expect(modelConfig.costPerMToken?.input).toBe(5.0);
      expect(modelConfig.costPerMToken?.output).toBe(15.0);
    });

    test('should not have cost info for local models', async () => {
      const loader = LLMConfigLoader.getInstance();
      const modelConfig = await loader.getModelConfig('ollama', 'tinyllama');
      
      expect(modelConfig.costPerMToken).toBeUndefined();
    });
  });

  describe('Provider Availability', () => {
    test('should check if provider is enabled', async () => {
      const loader = LLMConfigLoader.getInstance();
      const config = await loader.load();
      
      // Ollama should be enabled (default true)
      expect(config.providers.ollama.enabled).toBeUndefined(); // Undefined = enabled
      
      // Copilot explicitly disabled
      expect(config.providers.copilot.enabled).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle malformed JSON gracefully', async () => {
      await fs.writeFile(testConfigPath, '{ invalid json }');
      
      const loader = LLMConfigLoader.getInstance();
      const config = await loader.load();
      
      // Should fall back to default config
      expect(config.defaultProvider).toBe('ollama');
    });

    test('should handle empty config file', async () => {
      await fs.writeFile(testConfigPath, '{}');
      
      const loader = LLMConfigLoader.getInstance();
      
      // Should fall back to default config gracefully
      const config = await loader.load();
      expect(config.defaultProvider).toBe('ollama');
      expect(config.providers).toBeDefined();
    });

    test('should handle zero context window', async () => {
      const loader = LLMConfigLoader.getInstance();
      const validation = await loader.validateContextSize('ollama', 'tinyllama', 0);
      
      expect(validation.valid).toBe(true);
      expect(validation.warning).toBeUndefined();
    });

    test('should handle negative token count', async () => {
      const loader = LLMConfigLoader.getInstance();
      const validation = await loader.validateContextSize('ollama', 'tinyllama', -100);
      
      expect(validation.valid).toBe(true); // Negative is technically within bounds
    });
  });

  describe('Multiple Providers', () => {
    test('should handle switching between providers', async () => {
      const loader = LLMConfigLoader.getInstance();
      
      const ollamaModel = await loader.getModelConfig('ollama', 'tinyllama');
      const copilotModel = await loader.getModelConfig('copilot', 'gpt-4o');
      
      expect(ollamaModel.config.numCtx).toBeDefined();
      expect(copilotModel.config.maxTokens).toBeDefined();
      expect(ollamaModel.config.maxTokens).toBeUndefined();
      expect(copilotModel.config.numCtx).toBeUndefined();
    });
  });

  describe('PM Model Suggestions Feature', () => {
    beforeEach(async () => {
      await fs.mkdir('.mimir', { recursive: true });
    });

    test('should return false when feature flag is undefined', async () => {
      const config = {
        ...testConfig,
        // No features field
      };
      await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

      const loader = LLMConfigLoader.getInstance();
      loader.resetCache();
      const enabled = await loader.isPMModelSuggestionsEnabled();

      expect(enabled).toBe(false);
    });

    test('should return false when feature flag is explicitly false', async () => {
      const config = {
        ...testConfig,
        features: {
          pmModelSuggestions: false,
        },
      };
      await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

      const loader = LLMConfigLoader.getInstance();
      loader.resetCache();
      const enabled = await loader.isPMModelSuggestionsEnabled();

      expect(enabled).toBe(false);
    });

    test('should return true when feature flag is explicitly true', async () => {
      const config = {
        ...testConfig,
        features: {
          pmModelSuggestions: true,
        },
      };
      await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

      const loader = LLMConfigLoader.getInstance();
      loader.resetCache();
      const enabled = await loader.isPMModelSuggestionsEnabled();

      expect(enabled).toBe(true);
    });

    test('should return available models from all providers', async () => {
      const loader = LLMConfigLoader.getInstance();
      const models = await loader.getAvailableModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('provider');
      expect(models[0]).toHaveProperty('model');
      expect(models[0]).toHaveProperty('contextWindow');
      expect(models[0]).toHaveProperty('description');
      expect(models[0]).toHaveProperty('recommendedFor');

      // Should have models from both ollama and copilot
      const providers = new Set(models.map(m => m.provider));
      expect(providers.has('ollama')).toBe(true);
      expect(providers.has('copilot')).toBe(true);
    });

    test('should filter available models by provider', async () => {
      const loader = LLMConfigLoader.getInstance();
      const ollamaModels = await loader.getAvailableModels('ollama');

      expect(ollamaModels.length).toBeGreaterThan(0);
      expect(ollamaModels.every(m => m.provider === 'ollama')).toBe(true);
    });

    test('should return empty array for non-existent provider', async () => {
      const loader = LLMConfigLoader.getInstance();
      const models = await loader.getAvailableModels('non-existent-provider');

      expect(models).toEqual([]);
    });

    test('should format available models for PM when feature enabled', async () => {
      const config = {
        ...testConfig,
        features: {
          pmModelSuggestions: true,
        },
      };
      await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

      const loader = LLMConfigLoader.getInstance();
      loader.resetCache();
      const formatted = await loader.formatAvailableModelsForPM();

      // Should contain markdown formatting
      expect(formatted).toContain('**Model Selection**: ENABLED');
      expect(formatted).toContain('**Available Models:**');
      expect(formatted).toContain('OLLAMA');
      expect(formatted).toContain('tinyllama');
      expect(formatted).toContain('Context:');
      expect(formatted).toContain('provider/model');
    });

    test('should return disabled message when feature disabled', async () => {
      const config = {
        ...testConfig,
        features: {
          pmModelSuggestions: false,
        },
      };
      await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

      const loader = LLMConfigLoader.getInstance();
      loader.resetCache();
      const formatted = await loader.formatAvailableModelsForPM();

      expect(formatted).toContain('**Model Selection**: DISABLED');
      expect(formatted).toContain('configured defaults');
      expect(formatted).not.toContain('**Available Models:**');
    });

    test('should include usage instructions in formatted output', async () => {
      const config = {
        ...testConfig,
        features: {
          pmModelSuggestions: true,
        },
      };
      await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

      const loader = LLMConfigLoader.getInstance();
      loader.resetCache();
      const formatted = await loader.formatAvailableModelsForPM();

      expect(formatted).toContain('**Instructions for Model Selection:**');
      expect(formatted).toContain('provider/model');
      expect(formatted).toContain('ollama/');
    });

    test('should group models by provider in formatted output', async () => {
      const config = {
        ...testConfig,
        features: {
          pmModelSuggestions: true,
        },
      };
      await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

      const loader = LLMConfigLoader.getInstance();
      loader.resetCache();
      const formatted = await loader.formatAvailableModelsForPM();

      // Check for provider sections (uppercase format)
      expect(formatted).toContain('### OLLAMA');
      expect(formatted).toContain('### COPILOT');
    });

    test('should handle missing features field gracefully in format', async () => {
      const config = {
        ...testConfig,
        // No features field
      };
      await fs.writeFile(testConfigPath, JSON.stringify(config, null, 2));

      const loader = LLMConfigLoader.getInstance();
      loader.resetCache();
      const formatted = await loader.formatAvailableModelsForPM();

      expect(formatted).toContain('DISABLED');
      expect(formatted).not.toContain('**Available Models:**');
    });
  });
});
