import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createSecureFetchOptions, validateOAuthTokenFormat, validateOAuthUserinfoUrl } from '../utils/fetch-helper.js';
import { JWT_SECRET } from '../utils/jwt-secret.js';

// OAuth userinfo endpoint for token validation (stateless)
// Must be explicitly configured - different providers use different paths
const OAUTH_USERINFO_URL = process.env.MIMIR_OAUTH_USERINFO_URL;

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
      
      // SECURITY: Validate token format to prevent SSRF and injection attacks
      try {
        validateOAuthTokenFormat(token);
      } catch (validationError: any) {
        console.error('[OAuth Auth] Invalid token format:', validationError.message);
        return res.status(401).json({ error: 'Invalid token format' });
      }
      
      // SECURITY: Validate userinfo URL to prevent SSRF attacks
      try {
        validateOAuthUserinfoUrl(OAUTH_USERINFO_URL);
      } catch (validationError: any) {
        console.error('[OAuth Auth] Invalid userinfo URL:', validationError.message);
        return res.status(500).json({ error: 'Invalid OAuth configuration' });
      }
      
      // Configure timeout for OAuth validation (default 10s, configurable via env)
      const timeoutMs = getOAuthTimeout();
      
      // Validate token by calling OAuth provider's userinfo endpoint with timeout
      const fetchOptions = createSecureFetchOptions(
        OAUTH_USERINFO_URL,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        },
        undefined, // no API key env var
        timeoutMs  // explicit timeout
      );
      
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
      // Handle timeout specifically
      if (oauthError.name === 'AbortError') {
        console.error(`[OAuth Auth] Token validation timed out after ${getOAuthTimeout()}ms`);
        return res.status(401).json({ error: 'OAuth token validation timed out' });
      }
      
      console.error('[OAuth Auth] OAuth validation error:', oauthError.message);
      return res.status(401).json({ error: 'Authentication failed' });
    }
  }
}

// Legacy database-based API key validation removed - now using JWT stateless auth
// Legacy session-based requireAuth removed - now STATELESS ONLY
