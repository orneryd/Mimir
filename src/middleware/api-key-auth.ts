import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createSecureFetchOptions } from '../utils/fetch-helper.js';

// JWT secret from environment
// Only required when security is enabled
const JWT_SECRET: string = process.env.MIMIR_JWT_SECRET || (() => {
  if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
    throw new Error('MIMIR_JWT_SECRET must be set when MIMIR_ENABLE_SECURITY=true');
  }
  return 'dev-only-secret-not-for-production';
})();

// OAuth userinfo endpoint for token validation (stateless)
const OAUTH_USERINFO_URL = process.env.MIMIR_OAUTH_USERINFO_URL || 
  (process.env.MIMIR_OAUTH_ISSUER ? `${process.env.MIMIR_OAUTH_ISSUER}/oauth2/v1/userinfo` : null);

// Legacy helper functions removed - no longer needed with JWT stateless auth

/**
 * Middleware to authenticate requests using JWT tokens
 * Validates JWT signature and expiration (stateless, no database lookup)
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  // OAuth 2.0 RFC 6750 compliant: Check Authorization: Bearer header first
  let token: string | undefined;
  let source = 'none';
  
  const authHeader = req.headers['authorization'] as string;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7); // Remove 'Bearer ' prefix
    source = 'Authorization header';
  }
  
  // Fallback to X-API-Key header (common alternative)
  if (!token) {
    token = req.headers['x-api-key'] as string;
    if (token) source = 'X-API-Key header';
  }
  
  // Check HTTP-only cookie (for browser UI)
  if (!token && req.cookies) {
    token = req.cookies.mimir_oauth_token;
    if (token) source = 'HTTP-only cookie';
  }
  
  // For SSE (EventSource can't send custom headers), accept query parameters
  // Accept both 'access_token' (OAuth 2.0 RFC 6750) and 'api_key' (common alternative)
  if (!token) {
    token = (req.query.access_token as string) || (req.query.api_key as string);
    if (token) source = 'query parameter';
  }
  
  if (!token) {
    return next(); // No token provided, continue to next middleware
  }
  
  console.log(`[OAuth Auth] Received token from ${source}`);

  // Try JWT validation first (for Mimir-issued tokens)
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    }) as any;

    console.log(`[JWT Auth] Valid JWT for user: ${decoded.email}, roles: ${decoded.roles?.join(', ')}`);

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      roles: decoded.roles || ['viewer']
    };

    return next();
  } catch (jwtError: any) {
    // Not a valid JWT - try OAuth token validation
    if (!OAUTH_USERINFO_URL) {
      console.log('[OAuth Auth] No OAuth provider configured, rejecting non-JWT token');
      return res.status(401).json({ error: 'Invalid token' });
    }

    try {
      console.log('[OAuth Auth] Validating OAuth token with provider...');
      
      // Validate token by calling OAuth provider's userinfo endpoint
      const fetchOptions = createSecureFetchOptions(OAUTH_USERINFO_URL, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const response = await fetch(OAUTH_USERINFO_URL, fetchOptions);
      
      if (!response.ok) {
        console.log(`[OAuth Auth] Token validation failed: ${response.status}`);
        return res.status(401).json({ error: 'Invalid or expired OAuth token' });
      }
      
      const userProfile = await response.json();
      console.log(`[OAuth Auth] Valid OAuth token for user: ${userProfile.email || userProfile.preferred_username}`);
      
      // Extract roles from profile
      const roles = userProfile.roles || userProfile.groups || ['viewer'];
      
      // Attach user info to request
      req.user = {
        id: userProfile.sub || userProfile.id || userProfile.email,
        email: userProfile.email,
        roles: Array.isArray(roles) ? roles : [roles]
      };
      
      return next();
    } catch (oauthError: any) {
      console.error('[OAuth Auth] OAuth validation error:', oauthError.message);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  }
}

// Legacy database-based API key validation removed - now using JWT stateless auth
// Legacy session-based requireAuth removed - now STATELESS ONLY
