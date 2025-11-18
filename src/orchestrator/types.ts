/**
 * LLM Provider Types
 * 
 * Aliases:
 * - ollama, llama.cpp: Local LLM provider (Ollama or llama.cpp - interchangeable)
 * - copilot, openai: OpenAI-compatible endpoint (GitHub Copilot or OpenAI API)
 */
export enum LLMProvider {
  OLLAMA = 'ollama',
  COPILOT = 'copilot',
  OPENAI = 'openai',
}

/**
 * Normalize provider name to canonical value
 * Handles aliases:
 * - llama.cpp → openai (llama.cpp is OpenAI-compatible)
 * - copilot → openai
 */
export function normalizeProvider(providerName: string | LLMProvider | undefined): LLMProvider {
  if (!providerName) return LLMProvider.OPENAI; // Default
  
  const normalized = String(providerName).toLowerCase().trim();
  
  // Map aliases to canonical values
  switch (normalized) {
    case 'ollama':
      return LLMProvider.OLLAMA; // Native Ollama API (/api/chat)
    case 'llama.cpp':
    case 'openai':
    case 'copilot':
      return LLMProvider.OPENAI; // OpenAI-compatible APIs (/v1/chat/completions)
    default:
      // Try to match enum values
      if (Object.values(LLMProvider).includes(normalized as LLMProvider)) {
        return normalized as LLMProvider;
      }
      // Default fallback
      console.warn(`Unknown provider "${providerName}", defaulting to openai`);
      return LLMProvider.OPENAI;
  }
}

/**
 * Fetch available models from LLM provider endpoint
 * Queries the configured LLM provider's /v1/models endpoint for available models
 * 
 * @param apiUrl - Base URL of the LLM provider API (e.g., http://localhost:11434/v1)
 * @returns Promise of model list with id and owned_by fields
 * 
 * @example
 * const models = await fetchAvailableModels('http://copilot-api:4141/v1');
 * console.log(models.map(m => m.id));
 */
export async function fetchAvailableModels(apiUrl: string): Promise<Array<{ id: string; owned_by: string; object?: string }>> {
  try {
    const modelsEndpoint = `${apiUrl}/models`;
    const response = await fetch(modelsEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch models from ${modelsEndpoint}: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json() as any;
    
    // Handle OpenAI-compatible response format
    if (data.data && Array.isArray(data.data)) {
      return data.data.filter((m: any) => m.id); // Filter valid models
    }
    
    // Fallback if response is directly an array
    if (Array.isArray(data)) {
      return data.filter((m: any) => m.id);
    }

    console.warn(`Unexpected response format from ${modelsEndpoint}:`, data);
    return [];
  } catch (error) {
    console.warn(`Error fetching models from ${apiUrl}:`, error);
    return [];
  }
}

/**
 * Normalize provider name to canonical value
 * Handles aliases: llama.cpp→ollama, copilot→openai
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
  