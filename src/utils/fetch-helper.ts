/**
 * @file src/utils/fetch-helper.ts
 * @description Utility for SSL-aware fetch requests with automatic certificate handling
 */

import https from 'https';

/**
 * Create fetch options with SSL handling based on NODE_TLS_REJECT_UNAUTHORIZED
 * 
 * @param url - The URL to fetch
 * @param options - Base fetch options
 * @returns Fetch options with SSL agent configured if needed
 */
export function createFetchOptions(url: string, options: RequestInit = {}): RequestInit {
  const fetchOptions = { ...options };
  
  // Handle NODE_TLS_REJECT_UNAUTHORIZED for HTTPS requests
  if (url.startsWith('https://') && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    // For Node.js fetch (undici), we need to pass an agent
    (fetchOptions as any).agent = new https.Agent({
      rejectUnauthorized: false
    });
  }
  
  return fetchOptions;
}

/**
 * Add Authorization header to fetch options if API key is configured
 * 
 * @param options - Fetch options
 * @param apiKeyEnvVar - Environment variable name for API key (default: MIMIR_LLM_API_KEY)
 * @returns Fetch options with Authorization header if API key exists
 */
export function addAuthHeader(options: RequestInit, apiKeyEnvVar: string = 'MIMIR_LLM_API_KEY'): RequestInit {
  const apiKey = process.env[apiKeyEnvVar];
  
  if (apiKey) {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);
    return { ...options, headers };
  }
  
  return options;
}

/**
 * Create an AbortSignal with timeout
 * 
 * @param timeoutMs - Timeout in milliseconds (default: 10000ms = 10s)
 * @returns AbortSignal that will abort after timeout
 */
export function createTimeoutSignal(timeoutMs: number = 10000): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

/**
 * Validate OAuth bearer token format
 * Prevents SSRF and injection attacks by ensuring token is properly formatted
 * 
 * @param token - The token to validate
 * @returns true if token format is valid
 * @throws Error if token format is invalid
 */
export function validateOAuthTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }
  
  // Token should not be excessively long (max 8KB for OAuth tokens)
  if (token.length > 8192) {
    throw new Error('Token exceeds maximum length');
  }
  
  // Token should only contain valid base64url characters, dots, hyphens, and underscores
  // This prevents injection of newlines, control characters, or other malicious content
  const validTokenPattern = /^[A-Za-z0-9\-_\.~\+\/=]+$/;
  if (!validTokenPattern.test(token)) {
    throw new Error('Token contains invalid characters');
  }
  
  // Token should not contain suspicious patterns that could indicate injection attempts
  const suspiciousPatterns = [
    /[\r\n]/,           // Newlines (HTTP header injection)
    /[<>]/,             // HTML/XML tags
    /javascript:/i,     // JavaScript protocol
    /data:/i,           // Data protocol
    /file:/i,           // File protocol
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(token)) {
      throw new Error('Token contains suspicious patterns');
    }
  }
  
  return true;
}

/**
 * Validate OAuth userinfo URL to prevent SSRF attacks
 * 
 * @param url - The URL to validate
 * @returns true if URL is safe
 * @throws Error if URL is unsafe
 */
export function validateOAuthUserinfoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }
  
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error('Invalid URL format');
  }
  // Check if HTTP is explicitly allowed (for local OAuth testing)
  const allowHttp = process.env.MIMIR_OAUTH_ALLOW_HTTP === 'true';
  
  // Only allow HTTPS in production (unless explicitly overridden)
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !allowHttp && parsedUrl.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed in production (set MIMIR_OAUTH_ALLOW_HTTP=true to override)');
  }
  
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only HTTP/HTTPS protocols are allowed');
  }
  
  // Block private IP ranges and localhost (except in development)
  const hostname = parsedUrl.hostname.toLowerCase();
  
  // Allow localhost and host.docker.internal in development ONLY
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (isDevelopment) {
    const allowedDevHosts = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];
    if (allowedDevHosts.includes(hostname)) {
      return true;
    }
  }
  
  // Block private IP ranges in production
  const privateIpPatterns = [
    /^127\./,                    // 127.0.0.0/8 (loopback)
    /^10\./,                     // 10.0.0.0/8 (private)
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 (private)
    /^192\.168\./,               // 192.168.0.0/16 (private)
    /^169\.254\./,               // 169.254.0.0/16 (link-local)
    /^::1$/,                     // IPv6 loopback
    /^fe80:/,                    // IPv6 link-local
    /^fc00:/,                    // IPv6 unique local
    /^fd00:/,                    // IPv6 unique local
  ];
  
  for (const pattern of privateIpPatterns) {
    if (pattern.test(hostname)) {
      throw new Error('Private IP addresses are not allowed');
    }
  }
  
  // Block localhost variations
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Localhost is not allowed in production');
  }
  
  return true;
}

/**
 * Convenience function: Create SSL-aware fetch options with optional auth and timeout
 * 
 * @param url - The URL to fetch
 * @param options - Base fetch options
 * @param apiKeyEnvVar - Optional environment variable name for API key
 * @param timeoutMs - Optional timeout in milliseconds (default: 10000ms = 10s)
 * @returns Fetch options with SSL, auth, and timeout configured
 */
export function createSecureFetchOptions(
  url: string,
  options: RequestInit = {},
  apiKeyEnvVar?: string,
  timeoutMs: number = 10000
): RequestInit {
  let fetchOptions = createFetchOptions(url, options);
  
  if (apiKeyEnvVar) {
    fetchOptions = addAuthHeader(fetchOptions, apiKeyEnvVar);
  }
  
  // Add timeout signal if not already provided
  if (!fetchOptions.signal) {
    fetchOptions.signal = createTimeoutSignal(timeoutMs);
  }
  
  return fetchOptions;
}
