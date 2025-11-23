/**
 * @file src/utils/auth-helper.ts
 * @description Centralized authentication helper functions
 */

import { Request } from 'express';

/**
 * Check if a request has any form of authentication credentials
 * Checks multiple authentication sources in this order:
 * 1. Authorization: Bearer header (OAuth 2.0 RFC 6750)
 * 2. X-API-Key header (common alternative)
 * 3. mimir_oauth_token cookie (for browser/UI)
 * 4. access_token query parameter (for SSE which can't send custom headers)
 * 5. api_key query parameter (legacy support)
 * 
 * @param req - Express request object
 * @returns true if any authentication credential is present
 */
export function hasAuthCredentials(req: Request): boolean {
  const authHeader = req.headers['authorization'] as string;
  
  return !!(
    authHeader || 
    req.headers['x-api-key'] || 
    req.cookies?.mimir_oauth_token ||
    req.query.access_token ||
    req.query.api_key
  );
}
