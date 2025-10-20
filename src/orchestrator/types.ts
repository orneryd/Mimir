/**
 * LLM Provider Types
 */
export enum LLMProvider {
  OLLAMA = 'ollama',
  COPILOT = 'copilot',
  OPENAI = 'openai',
}

/**
 * Available models via GitHub Copilot API
 */
export enum CopilotModel {
    // GPT Models
    GPT_4_1 = 'gpt-4.1',
    GPT_4_1_COPILOT = 'gpt-41-copilot',
    GPT_4_1_LATEST = 'gpt-4.1-2025-04-14',
    GPT_5 = 'gpt-5',
    GPT_4O = 'gpt-4o',
    GPT_4O_LATEST = 'gpt-4o-2024-11-20',
    GPT_4O_MINI = 'gpt-4o-mini',
    GPT_4 = 'gpt-4',
    GPT_4_TURBO = 'gpt-4-0125-preview',
    GPT_3_5_TURBO = 'gpt-3.5-turbo',
    
    // O-Series Models
    O3_MINI = 'o3-mini',
    O3_MINI_LATEST = 'o3-mini-2025-01-31',
    
    // Claude Models
    CLAUDE_SONNET_4 = 'claude-sonnet-4',
    CLAUDE_3_7_SONNET = 'claude-3.7-sonnet',
    CLAUDE_3_7_SONNET_THINKING = 'claude-3.7-sonnet-thought',
    CLAUDE_3_5_SONNET = 'claude-3.5-sonnet',
    
    // Gemini Models
    GEMINI_2_5_PRO = 'gemini-2.5-pro',
    GEMINI_2_0_FLASH = 'gemini-2.0-flash-001',
  }
  