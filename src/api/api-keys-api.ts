import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

/**
 * POST /api/keys/generate
 * Generate a new API key for the authenticated user
 * RBAC: Requires 'keys:write' permission
 * Note: Use /auth/token (OAuth 2.0 RFC 6749) for initial authentication
 */
router.post('/generate', requirePermission('keys:write'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, expiresInDays, permissions } = req.body;

    // Generate secure API key
    const apiKey = `mimir_${crypto.randomBytes(32).toString('base64url')}`;
    const keyId = `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Calculate expiration
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Store in Neo4j
    const { GraphManager } = await import('../managers/GraphManager.js');
    const graphManager = new GraphManager(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    );

    await graphManager.addNode('custom', {
      id: keyId,
      type: 'apiKey',
      name: name || 'Unnamed API Key',
      keyHash: crypto.createHash('sha256').update(apiKey).digest('hex'), // Store hash, not plaintext
      userId: user.id,
      userEmail: user.email,
      permissions: permissions || user.roles || ['viewer'], // Inherit user's roles by default
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      lastUsedAt: null,
      lastValidated: new Date().toISOString(), // Initialize validation timestamp for periodic re-validation
      usageCount: 0,
      status: 'active'
    });

    await graphManager.close();

    // Return API key ONCE (never shown again)
    res.json({
      success: true,
      apiKey, // Only time we return the plaintext key
      keyId,
      name: name || 'Unnamed API Key',
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      permissions: permissions || user.roles || ['viewer'],
      warning: 'Save this API key now. You will not be able to see it again.'
    });
  } catch (error: any) {
    console.error('[API Keys] Generate error:', error);
    res.status(500).json({ error: 'Failed to generate API key', details: error.message });
  }
});

/**
 * GET /api/keys
 * List all API keys for the authenticated user
 * RBAC: Requires 'keys:read' permission
 */
router.get('/', requirePermission('keys:read'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { GraphManager } = await import('../managers/GraphManager.js');
    const graphManager = new GraphManager(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    );

    const result = await graphManager.queryNodes(undefined, { type: 'apiKey', userId: user.id });

    await graphManager.close();

    // Never return keyHash in list
    const keys = result.map((node: any) => ({
      id: node.id,
      name: node.name,
      permissions: node.permissions,
      createdAt: node.createdAt,
      expiresAt: node.expiresAt,
      lastUsedAt: node.lastUsedAt,
      usageCount: node.usageCount,
      status: node.status
    }));

    res.json({ keys });
  } catch (error: any) {
    console.error('[API Keys] List error:', error);
    res.status(500).json({ error: 'Failed to list API keys', details: error.message });
  }
});

/**
 * DELETE /api/keys/:keyId
 * Revoke an API key by ID
 * RBAC: Requires 'keys:delete' permission
 */
router.delete('/:keyId', requirePermission('keys:delete'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { keyId } = req.params;

    const { GraphManager } = await import('../managers/GraphManager.js');
    const graphManager = new GraphManager(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    );

    // Verify key belongs to user
    const keys = await graphManager.queryNodes(undefined, { type: 'apiKey', id: keyId, userId: user.id });

    if (keys.length === 0) {
      await graphManager.close();
      return res.status(404).json({ error: 'API key not found or does not belong to you' });
    }

    // Mark as revoked instead of deleting (for audit trail)
    await graphManager.updateNode(keyId, {
      status: 'revoked',
      revokedAt: new Date().toISOString()
    });

    await graphManager.close();

    res.json({ success: true, message: 'API key revoked' });
  } catch (error: any) {
    console.error('[API Keys] Revoke error:', error);
    res.status(500).json({ error: 'Failed to revoke API key', details: error.message });
  }
});

export default router;
