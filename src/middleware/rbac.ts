import { Request, Response, NextFunction } from 'express';
import { getRBACConfig } from '../config/rbac-config.js';
import { extractRolesWithDefault } from './claims-extractor.js';

/**
 * Get all permissions for a user based on their roles
 */
export function getUserPermissions(user: any): Set<string> {
  const permissions = new Set<string>();
  
  if (!user) {
    return permissions;
  }
  
  const config = getRBACConfig();
  
  // Extract roles using configurable claim path with default role fallback
  const roles = extractRolesWithDefault(
    user, 
    config.claimPath || 'roles',
    config.defaultRole
  );
  
  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return permissions;
  }
  
  for (const role of roles) {
    const roleConfig = config.roleMappings[role];
    if (roleConfig && roleConfig.permissions) {
      for (const permission of roleConfig.permissions) {
        permissions.add(permission);
      }
    }
  }
  
  return permissions;
}

/**
 * Check if user has a specific permission
 * Supports wildcards: 'nodes:*' matches 'nodes:read', 'nodes:write', etc.
 */
export function hasPermission(userPermissions: Set<string>, requiredPermission: string): boolean {
  // Check for exact match
  if (userPermissions.has(requiredPermission)) {
    return true;
  }
  
  // Check for wildcard '*' (admin)
  if (userPermissions.has('*')) {
    return true;
  }
  
  // Check for namespace wildcards (e.g., 'nodes:*' matches 'nodes:read')
  const [namespace] = requiredPermission.split(':');
  if (namespace && userPermissions.has(`${namespace}:*`)) {
    return true;
  }
  
  return false;
}

/**
 * Middleware to require a specific permission
 * Usage: app.post('/api/nodes', requirePermission('nodes:write'), handler)
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if RBAC is disabled
    if (process.env.MIMIR_ENABLE_RBAC !== 'true') {
      return next();
    }
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    // Get user permissions
    const userPermissions = getUserPermissions(req.user);
    
    // Check if user has required permission
    if (hasPermission(userPermissions, permission)) {
      return next();
    }
    
    // Permission denied
    return res.status(403).json({
      error: 'Forbidden',
      message: `Permission denied: ${permission} required`,
      userRoles: (req.user as any).roles || []
    });
  };
}

/**
 * Middleware to require ANY of the specified permissions
 * Usage: app.get('/api/data', requireAnyPermission(['nodes:read', 'files:read']), handler)
 */
export function requireAnyPermission(permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if RBAC is disabled
    if (process.env.MIMIR_ENABLE_RBAC !== 'true') {
      return next();
    }
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    // Get user permissions
    const userPermissions = getUserPermissions(req.user);
    
    // Check if user has any of the required permissions
    for (const permission of permissions) {
      if (hasPermission(userPermissions, permission)) {
        return next();
      }
    }
    
    // Permission denied
    return res.status(403).json({
      error: 'Forbidden',
      message: `Permission denied: One of [${permissions.join(', ')}] required`,
      userRoles: (req.user as any).roles || []
    });
  };
}

/**
 * Middleware to require ALL of the specified permissions
 * Usage: app.post('/api/admin', requireAllPermissions(['admin:read', 'admin:write']), handler)
 */
export function requireAllPermissions(permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if RBAC is disabled
    if (process.env.MIMIR_ENABLE_RBAC !== 'true') {
      return next();
    }
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    // Get user permissions
    const userPermissions = getUserPermissions(req.user);
    
    // Check if user has all required permissions
    for (const permission of permissions) {
      if (!hasPermission(userPermissions, permission)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Permission denied: All of [${permissions.join(', ')}] required`,
          userRoles: (req.user as any).roles || [],
          missingPermission: permission
        });
      }
    }
    
    return next();
  };
}
