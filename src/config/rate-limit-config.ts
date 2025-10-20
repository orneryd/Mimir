/**
 * Rate Limiter Configuration
 * 
 * Defines rate limits for different LLM providers.
 * Set requestsPerHour to -1 to bypass rate limiting entirely.
 */

export interface RateLimitSettings {
  requestsPerHour: number;
  enableDynamicThrottling: boolean;
  warningThreshold: number;
  logLevel: 'silent' | 'normal' | 'verbose';
}

export const DEFAULT_RATE_LIMITS: Record<string, RateLimitSettings> = {
  copilot: {
    requestsPerHour: 2500, // Conservative limit (50% of 5000 to account for estimation errors)
    enableDynamicThrottling: true,
    warningThreshold: 0.80, // Warn at 80% capacity
    logLevel: 'normal',
  },
  ollama: {
    requestsPerHour: -1, // Bypass rate limiting for local models
    enableDynamicThrottling: false,
    warningThreshold: 0.80,
    logLevel: 'silent',
  },
  openai: {
    requestsPerHour: 3000, // Default for OpenAI API
    enableDynamicThrottling: true,
    warningThreshold: 0.80,
    logLevel: 'normal',
  },
  anthropic: {
    requestsPerHour: 1000, // Conservative for Claude API
    enableDynamicThrottling: true,
    warningThreshold: 0.80,
    logLevel: 'normal',
  },
};

/**
 * Load rate limit configuration for a specific provider
 * 
 * @param provider - LLM provider name ('copilot', 'ollama', etc.)
 * @param overrides - Optional overrides for specific settings
 * @returns Complete rate limit configuration
 */
export function loadRateLimitConfig(
  provider: string,
  overrides?: Partial<RateLimitSettings>
): RateLimitSettings {
  const baseConfig = DEFAULT_RATE_LIMITS[provider.toLowerCase()] || DEFAULT_RATE_LIMITS.copilot;
  
  return {
    ...baseConfig,
    ...overrides,
  };
}

/**
 * Update rate limit for a provider at runtime
 * 
 * @param provider - LLM provider name
 * @param newLimit - New requests per hour limit
 */
export function updateRateLimit(provider: string, newLimit: number): void {
  if (DEFAULT_RATE_LIMITS[provider.toLowerCase()]) {
    DEFAULT_RATE_LIMITS[provider.toLowerCase()].requestsPerHour = newLimit;
  }
}
