import { Router, Request, Response } from 'express';
import { requirePermission } from '../middleware/rbac.js';
import { GraphManager } from '../managers/GraphManager.js';

const router = Router();

/**
 * Get current RBAC configuration
 * Requires admin permission
 */
router.get('/', requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const graphManager = new GraphManager(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    );

    // Query for RBAC config node
    const configs = await graphManager.queryNodes(undefined, { type: 'rbacConfig' });
    
    await graphManager.close();

    if (configs.length === 0) {
      // Return default config if none exists
      return res.json({
        claimPath: 'roles',
        defaultRole: 'viewer',
        roles: {
          admin: {
            permissions: ['*']
          },
          developer: {
            permissions: [
              'nodes:read', 'nodes:write', 'nodes:delete',
              'edges:read', 'edges:write', 'edges:delete',
              'todos:read', 'todos:write', 'todos:delete',
              'keys:read', 'keys:write', 'keys:delete'
            ]
          },
          analyst: {
            permissions: [
              'nodes:read', 'edges:read', 'todos:read', 'keys:read'
            ]
          },
          viewer: {
            permissions: ['nodes:read', 'edges:read', 'todos:read']
          }
        }
      });
    }

    const config = configs[0].properties as any;
    res.json({
      claimPath: config.claimPath,
      defaultRole: config.defaultRole,
      roles: JSON.parse(config.rolesJson || '{}')
    });
  } catch (error: any) {
    console.error('[RBAC Config] Get error:', error);
    res.status(500).json({ error: 'Failed to get RBAC config', details: error.message });
  }
});

/**
 * Update RBAC configuration
 * Requires admin permission
 */
router.put('/', requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const { claimPath, defaultRole, roles } = req.body;

    if (!claimPath || !defaultRole || !roles) {
      return res.status(400).json({ error: 'Missing required fields: claimPath, defaultRole, roles' });
    }

    const graphManager = new GraphManager(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    );

    // Check if config exists
    const configs = await graphManager.queryNodes(undefined, { type: 'rbacConfig' });
    
    const configData = {
      type: 'rbacConfig',
      claimPath,
      defaultRole,
      rolesJson: JSON.stringify(roles),
      updatedAt: new Date().toISOString(),
      updatedBy: (req.user as any)?.id || 'unknown'
    };

    if (configs.length === 0) {
      // Create new config
      await graphManager.addNode('custom', {
        id: 'rbac-config-singleton',
        ...configData,
        createdAt: new Date().toISOString()
      });
    } else {
      // Update existing config
      await graphManager.updateNode(configs[0].id, configData);
    }

    await graphManager.close();

    // Clear the RBAC config cache
    const { clearConfigCache } = await import('../config/rbac-config.js');
    clearConfigCache();

    res.json({
      success: true,
      message: 'RBAC configuration updated successfully',
      config: { claimPath, defaultRole, roles }
    });
  } catch (error: any) {
    console.error('[RBAC Config] Update error:', error);
    res.status(500).json({ error: 'Failed to update RBAC config', details: error.message });
  }
});

/**
 * Get available permissions (for UI dropdown)
 */
router.get('/permissions', requirePermission('admin'), async (req: Request, res: Response) => {
  res.json({
    permissions: [
      'nodes:read',
      'nodes:write',
      'nodes:delete',
      'edges:read',
      'edges:write',
      'edges:delete',
      'todos:read',
      'todos:write',
      'todos:delete',
      'keys:read',
      'keys:write',
      'keys:delete',
      'admin',
      '*'
    ]
  });
});

export default router;
