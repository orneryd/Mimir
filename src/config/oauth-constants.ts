/**
 * @file src/config/oauth-constants.ts
 * @description Centralized OAuth configuration constants
 * 
 * This file consolidates OAuth-related constants used across the application
 * to ensure consistency and make configuration changes easier to maintain.
 */

/**
 * Default timeout for OAuth userinfo requests in milliseconds
 * Can be overridden via MIMIR_OAUTH_TIMEOUT_MS environment variable
 */
export const DEFAULT_OAUTH_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Get configured OAuth timeout from environment or use default
 * @returns Timeout in milliseconds
 */
export function getOAuthTimeout(): number {
  const envTimeout = process.env.MIMIR_OAUTH_TIMEOUT_MS;
  if (!envTimeout) {
    return DEFAULT_OAUTH_TIMEOUT_MS;
  }
  
  const timeoutMs = parseInt(envTimeout, 10);
  if (isNaN(timeoutMs) || timeoutMs <= 0) {
    console.warn(`[OAuth] Invalid MIMIR_OAUTH_TIMEOUT_MS value: ${envTimeout}, using default ${DEFAULT_OAUTH_TIMEOUT_MS}ms`);
    return DEFAULT_OAUTH_TIMEOUT_MS;
  }
  
  return timeoutMs;
}
