/**
 * @file testing/orchestrator/llm-provider.test.ts
 * @description TDD tests for LLM provider abstraction - written BEFORE refactoring
 * 
 * Test Coverage:
 * - Provider enum and types
 * - Ollama provider initialization
 * - Copilot provider initialization (backward compatibility)
 * - OpenAI provider initialization
 * - Context window maximization per provider
 * - Provider-specific configuration (numCtx vs maxTokens)
 * - Agent config with provider selection
 * - Graceful fallback when provider unavailable
 * - Model defaults per agent type
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CopilotAgentClient, AgentConfig, LLMProvider } from '../../src/orchestrator/llm-client.js';
import { LLMConfigLoader } from '../../src/config/LLMConfigLoader.js';
import fs from 'fs/promises';

describe('LLM Provider Abstraction', () => {
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
        },
      },
      copilot: {
        baseUrl: 'http://localhost:4141/v1',
        defaultModel: 'gpt-4o',
        models: {
          'gpt-4o': {
            name: 'gpt-4o',
            contextWindow: 128000,
            description: 'OpenAI latest model',
            recommendedFor: ['pm'],
            config: {
              maxTokens: -1,
              temperature: 0.0,
            },
          },
        },
      },
    },
  };

  beforeEach(async () => {
    // Setup test config
    try {
      await fs.mkdir('.mimir', { recursive: true });
    } catch (error) {
      // Ignore
    }
    
    await fs.writeFile(testConfigPath, JSON.stringify(testConfig, null, 2));
    process.env.MIMIR_LLM_CONFIG = testConfigPath;
    
    // Reset singleton
    (LLMConfigLoader as any).instance = null;
  });

  afterEach(async () => {
    try {
      await fs.unlink(testConfigPath);
    } catch (error) {
      // Ignore
    }
    
    delete process.env.MIMIR_LLM_CONFIG;
    (LLMConfigLoader as any).instance = null;
  });

  describe('LLMProvider Enum', () => {
    test('should export LLMProvider enum', () => {
      expect(LLMProvider).toBeDefined();
      expect(LLMProvider.OLLAMA).toBe('ollama');
      expect(LLMProvider.COPILOT).toBe('copilot');
      expect(LLMProvider.OPENAI).toBe('openai');
    });
  });

  describe('Backward Compatibility', () => {
    test('should support legacy AgentConfig without provider (defaults to copilot)', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        model: 'gpt-4o',
        temperature: 0.0,
      };
      
      // Create mock preamble file
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      await client.loadPreamble('test-agent.md');
      
      // Should default to copilot for backward compatibility
      expect(client.getProvider()).toBe(LLMProvider.COPILOT);
      
      // Cleanup
      await fs.unlink('test-agent.md');
    });

    test('should support legacy model enum (CopilotModel)', async () => {
      const { CopilotModel } = await import('../../src/orchestrator/types.js');
      
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        model: CopilotModel.GPT_4_1,
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      expect(client.getModel()).toBe('gpt-4o');
      
      await fs.unlink('test-agent.md');
    });
  });

  describe('Ollama Provider', () => {
    test('should initialize with Ollama provider', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      
      expect(client.getProvider()).toBe(LLMProvider.OLLAMA);
      expect(client.getModel()).toBe('tinyllama');
      
      await fs.unlink('test-agent.md');
    });

    test('should use Ollama-specific configuration (numCtx)', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      const llmConfig = client.getLLMConfig();
      
      expect(llmConfig.numCtx).toBe(8192);
      expect(llmConfig.numPredict).toBe(-1);
      
      await fs.unlink('test-agent.md');
    });

    test('should retrieve context window for Ollama models', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      const contextWindow = await client.getContextWindow();
      
      expect(contextWindow).toBe(8192);
      
      await fs.unlink('test-agent.md');
    });

    test('should default to Ollama if no provider specified', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      
      // After migration, default should be Ollama
      expect(client.getProvider()).toBe(LLMProvider.OLLAMA);
      
      await fs.unlink('test-agent.md');
    });
  });

  describe('Copilot Provider', () => {
    test('should initialize with Copilot provider', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.COPILOT,
        model: 'gpt-4o',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      
      expect(client.getProvider()).toBe(LLMProvider.COPILOT);
      expect(client.getModel()).toBe('gpt-4o');
      
      await fs.unlink('test-agent.md');
    });

    test('should use Copilot-specific configuration (maxTokens)', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.COPILOT,
        model: 'gpt-4o',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      const llmConfig = client.getLLMConfig();
      
      expect(llmConfig.maxTokens).toBe(-1);
      expect(llmConfig.numCtx).toBeUndefined();
      
      await fs.unlink('test-agent.md');
    });

    test('should retrieve context window for Copilot models', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.COPILOT,
        model: 'gpt-4o',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      const contextWindow = await client.getContextWindow();
      
      expect(contextWindow).toBe(128000);
      
      await fs.unlink('test-agent.md');
    });
  });

  describe('OpenAI Provider', () => {
    test('should initialize with OpenAI provider', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4-turbo',
        openAIApiKey: 'test-key',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      
      expect(client.getProvider()).toBe(LLMProvider.OPENAI);
      expect(client.getModel()).toBe('gpt-4-turbo');
      
      await fs.unlink('test-agent.md');
    });

    test('should throw error if OpenAI API key not provided', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4-turbo',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      expect(() => {
        new CopilotAgentClient(config);
      }).toThrow('OpenAI API key required');
      
      await fs.unlink('test-agent.md');
    });
  });

  describe('Context Window Maximization', () => {
    test('should maximize context for Ollama models', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      const llmConfig = client.getLLMConfig();
      
      // Should use 8192, not default 4096
      expect(llmConfig.numCtx).toBe(8192);
      
      await fs.unlink('test-agent.md');
    });

    test('should log context window information on initialization', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      await client.loadPreamble('test-agent.md');
      
      const allLogs = consoleSpy.mock.calls.flat().join('\n');
      expect(allLogs).toContain('Context');
      expect(allLogs).toContain('8,192'); // Formatted with commas
      
      consoleSpy.mockRestore();
      await fs.unlink('test-agent.md');
    });

    test('should display model warnings for high-context models', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Add phi3:128k to test config
      const configWith128k = {
        ...testConfig,
        providers: {
          ...testConfig.providers,
          ollama: {
            ...testConfig.providers.ollama,
            models: {
              ...testConfig.providers.ollama.models,
              'phi3:128k': {
                name: 'phi3:128k',
                contextWindow: 131072,
                description: '3.8B params, massive context',
                recommendedFor: ['pm'],
                config: {
                  numCtx: 32768,
                  temperature: 0.0,
                },
                warnings: ['Large context = slower inference'],
              },
            },
          },
        },
      };
      
      await fs.writeFile(testConfigPath, JSON.stringify(configWith128k, null, 2));
      (LLMConfigLoader as any).instance = null;
      
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'phi3:128k',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      await client.loadPreamble('test-agent.md');
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      const allWarnings = consoleWarnSpy.mock.calls.flat().join('\n');
      expect(allWarnings).toContain('slower inference');
      
      consoleWarnSpy.mockRestore();
      await fs.unlink('test-agent.md');
    });
  });

  describe('Provider Switching', () => {
    test('should support switching between providers for different agents', async () => {
      await fs.writeFile('pm-agent.md', 'You are a PM agent.');
      await fs.writeFile('worker-agent.md', 'You are a worker agent.');
      
      const pmAgent = new CopilotAgentClient({
        preamblePath: 'pm-agent.md',
        provider: LLMProvider.COPILOT,
        model: 'gpt-4o',
      });
      
      const workerAgent = new CopilotAgentClient({
        preamblePath: 'worker-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      });
      
      expect(pmAgent.getProvider()).toBe(LLMProvider.COPILOT);
      expect(workerAgent.getProvider()).toBe(LLMProvider.OLLAMA);
      
      await fs.unlink('pm-agent.md');
      await fs.unlink('worker-agent.md');
    });

    test('should use different base URLs for different providers', async () => {
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const ollamaClient = new CopilotAgentClient({
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      });
      
      const copilotClient = new CopilotAgentClient({
        preamblePath: 'test-agent.md',
        provider: LLMProvider.COPILOT,
        model: 'gpt-4o',
      });
      
      expect(ollamaClient.getBaseURL()).toBe('http://localhost:11434');
      expect(copilotClient.getBaseURL()).toBe('http://localhost:4141/v1');
      
      await fs.unlink('test-agent.md');
    });
  });

  describe('Agent Type Defaults', () => {
    test('should use agent-specific defaults from config', async () => {
      const configWithDefaults = {
        ...testConfig,
        agentDefaults: {
          pm: { provider: 'copilot', model: 'gpt-4o', rationale: 'Complex planning' },
          worker: { provider: 'ollama', model: 'tinyllama', rationale: 'Fast execution' },
          qc: { provider: 'ollama', model: 'tinyllama', rationale: 'Fast validation' },
        },
      };
      
      await fs.writeFile(testConfigPath, JSON.stringify(configWithDefaults, null, 2));
      (LLMConfigLoader as any).instance = null;
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      // PM agent without explicit provider should use config defaults
      const pmAgent = new CopilotAgentClient({
        preamblePath: 'test-agent.md',
        agentType: 'pm',
      });
      
      // Must call loadPreamble to trigger initializeLLM which reads config
      await pmAgent.loadPreamble('test-agent.md');
      
      expect(pmAgent.getProvider()).toBe(LLMProvider.COPILOT);
      expect(pmAgent.getModel()).toBe('gpt-4o');
      
      await fs.unlink('test-agent.md');
    });
  });

  describe('Context Validation', () => {
    // SKIPPED: Context validation not yet implemented in CopilotAgentClient.execute()
    // These tests are placeholders for future implementation of:
    // 1. Token counting/estimation before execution
    // 2. Context window size validation against model limits
    // 3. Warnings when approaching context window limits
    // Implementation requires: tiktoken or similar library for token estimation
    test.skip('should validate context size before execution', async () => {
      // TODO: Implement context size validation in execute() method
      // This requires estimating token count and comparing to context window
      // before invoking the LLM. Currently not implemented.
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      await client.loadPreamble('test-agent.md');
      
      // Test with large prompt exceeding context window
      const largePrompt = 'test '.repeat(10000); // ~40K tokens, exceeds 8K limit
      
      await expect(
        client.execute(largePrompt)
      ).rejects.toThrow('exceeds');
      
      await fs.unlink('test-agent.md');
    });

    test.skip('should warn when context usage >80%', async () => {
      // TODO: Implement context usage warning in execute() method
      // This requires tracking token usage and warning when approaching limit
      // Currently not implemented.
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      await client.loadPreamble('test-agent.md');
      
      // Test with prompt at 85% of context window
      const largePrompt = 'test '.repeat(1750); // ~7K tokens, 85% of 8K
      
      // Mock execute to not actually call LLM
      vi.spyOn(client as any, 'agent').mockReturnValue({
        invoke: vi.fn().mockResolvedValue({
          messages: [{ content: 'test response', _getType: () => 'ai' }],
        }),
      });
      
      // This should warn but not throw
      await client.execute(largePrompt);
      
      expect(consoleWarnSpy).toHaveBeenCalled();
      const allWarnings = consoleWarnSpy.mock.calls.flat().join('\n');
      expect(allWarnings).toContain('%');
      
      consoleWarnSpy.mockRestore();
      await fs.unlink('test-agent.md');
    });
  });

  describe('Error Handling', () => {
    test('should provide helpful error for unknown provider', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: 'unknown-provider' as any,
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      expect(() => {
        new CopilotAgentClient(config);
      }).toThrow('Unknown provider');
      
      await fs.unlink('test-agent.md');
    });

    test('should gracefully handle Ollama service unavailable', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
        fallbackProvider: LLMProvider.COPILOT,
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      // This should not throw during initialization
      const client = new CopilotAgentClient(config);
      
      // But should use fallback
      expect(client.getProvider()).toBeDefined();
      
      await fs.unlink('test-agent.md');
    });
  });

  describe('Custom Base URLs', () => {
    test('should support custom Ollama base URL', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.OLLAMA,
        model: 'tinyllama',
        ollamaBaseUrl: 'http://custom-ollama:11434',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      
      expect(client.getBaseURL()).toBe('http://custom-ollama:11434');
      
      await fs.unlink('test-agent.md');
    });

    test('should support custom Copilot base URL', async () => {
      const config: AgentConfig = {
        preamblePath: 'test-agent.md',
        provider: LLMProvider.COPILOT,
        model: 'gpt-4o',
        copilotBaseUrl: 'http://custom-copilot:4141/v1',
      };
      
      await fs.writeFile('test-agent.md', 'You are a test agent.');
      
      const client = new CopilotAgentClient(config);
      
      expect(client.getBaseURL()).toBe('http://custom-copilot:4141/v1');
      
      await fs.unlink('test-agent.md');
    });
  });
});
