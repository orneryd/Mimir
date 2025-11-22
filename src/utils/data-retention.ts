import { Driver } from 'neo4j-driver';

/**
 * Data Retention Configuration
 * Default: Forever (no automatic deletion)
 */
export interface DataRetentionConfig {
  enabled: boolean;
  defaultDays: number; // 0 = forever (default)
  nodeTypePolicies: Record<string, number>; // Override per node type
  auditDays: number; // Audit log retention (0 = forever)
  runIntervalMs: number; // How often to run cleanup
}

/**
 * Load data retention configuration from environment
 */
export function loadDataRetentionConfig(): DataRetentionConfig {
  const enabled = process.env.MIMIR_DATA_RETENTION_ENABLED === 'true';
  
  // Parse node type policies from JSON if provided
  let nodeTypePolicies: Record<string, number> = {};
  if (process.env.MIMIR_DATA_RETENTION_POLICIES) {
    try {
      nodeTypePolicies = JSON.parse(process.env.MIMIR_DATA_RETENTION_POLICIES);
    } catch (error) {
      console.error('Failed to parse MIMIR_DATA_RETENTION_POLICIES:', error);
    }
  }
  
  return {
    enabled,
    defaultDays: parseInt(process.env.MIMIR_DATA_RETENTION_DEFAULT_DAYS || '0', 10), // 0 = forever
    nodeTypePolicies,
    auditDays: parseInt(process.env.MIMIR_DATA_RETENTION_AUDIT_DAYS || '0', 10), // 0 = forever
    runIntervalMs: parseInt(process.env.MIMIR_DATA_RETENTION_INTERVAL_MS || '86400000', 10), // 24 hours
  };
}

/**
 * Get retention days for a specific node type
 */
function getRetentionDays(nodeType: string, config: DataRetentionConfig): number {
  // Check for node-specific policy
  if (config.nodeTypePolicies[nodeType] !== undefined) {
    return config.nodeTypePolicies[nodeType];
  }
  
  // Fall back to default
  return config.defaultDays;
}

/**
 * Run data retention cleanup
 * Deletes nodes older than their retention policy
 */
export async function runDataRetentionCleanup(driver: Driver, config: DataRetentionConfig): Promise<void> {
  if (!config.enabled) {
    return;
  }

  const session = driver.session();
  
  try {
    console.log('[Data Retention] Starting cleanup...');
    
    // Get all node types
    const nodeTypesResult = await session.run(`
      MATCH (n)
      RETURN DISTINCT labels(n) as labels
    `);
    
    const nodeTypes = new Set<string>();
    for (const record of nodeTypesResult.records) {
      const labels = record.get('labels') as string[];
      for (const label of labels) {
        nodeTypes.add(label);
      }
    }
    
    let totalDeleted = 0;
    
    // Process each node type
    for (const nodeType of nodeTypes) {
      const retentionDays = getRetentionDays(nodeType, config);
      
      // Skip if retention is forever (0)
      if (retentionDays === 0) {
        continue;
      }
      
      // Calculate cutoff timestamp
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffTimestamp = cutoffDate.toISOString();
      
      // Delete nodes older than retention period
      const result = await session.run(`
        MATCH (n:${nodeType})
        WHERE n.createdAt < $cutoffTimestamp
        DETACH DELETE n
        RETURN count(n) as deleted
      `, { cutoffTimestamp });
      
      const deleted = result.records[0]?.get('deleted').toNumber() || 0;
      
      if (deleted > 0) {
        console.log(`[Data Retention] Deleted ${deleted} ${nodeType} nodes older than ${retentionDays} days`);
        totalDeleted += deleted;
      }
    }
    
    if (totalDeleted > 0) {
      console.log(`[Data Retention] Cleanup complete - deleted ${totalDeleted} nodes total`);
    } else {
      console.log('[Data Retention] Cleanup complete - no nodes to delete');
    }
    
  } catch (error: any) {
    console.error('[Data Retention] Cleanup failed:', error.message);
  } finally {
    await session.close();
  }
}

/**
 * Start data retention cleanup scheduler
 */
export function startDataRetentionScheduler(driver: Driver, config: DataRetentionConfig): NodeJS.Timeout | null {
  if (!config.enabled) {
    return null;
  }

  console.log('[Data Retention] Scheduler started');
  console.log(`   Default retention: ${config.defaultDays === 0 ? 'Forever' : `${config.defaultDays} days`}`);
  console.log(`   Audit retention: ${config.auditDays === 0 ? 'Forever' : `${config.auditDays} days`}`);
  console.log(`   Run interval: ${config.runIntervalMs / 1000 / 60} minutes`);
  
  if (Object.keys(config.nodeTypePolicies).length > 0) {
    console.log('   Node-specific policies:');
    for (const [nodeType, days] of Object.entries(config.nodeTypePolicies)) {
      console.log(`     ${nodeType}: ${days === 0 ? 'Forever' : `${days} days`}`);
    }
  }

  // Run immediately on start
  runDataRetentionCleanup(driver, config);

  // Schedule recurring cleanup
  return setInterval(() => {
    runDataRetentionCleanup(driver, config);
  }, config.runIntervalMs);
}

/**
 * Stop data retention scheduler
 */
export function stopDataRetentionScheduler(timer: NodeJS.Timeout | null): void {
  if (timer) {
    clearInterval(timer);
    console.log('[Data Retention] Scheduler stopped');
  }
}
