// ============================================================================
// Graph Manager Exports
// ============================================================================

import { GraphManager } from './GraphManager.js';
import { TodoManager } from './TodoManager.js';
import type { IGraphManager } from '../types/index.js';

export { GraphManager, TodoManager };
export type { IGraphManager };

/**
 * Create and initialize a GraphManager instance
 */
export async function createGraphManager(): Promise<GraphManager> {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';

  const manager = new GraphManager(uri, user, password);
  
  // Initialize schema
  await manager.initialize();
  
  // Test connection
  const connected = await manager.testConnection();
  if (!connected) {
    throw new Error('Failed to connect to Neo4j database');
  }

  console.log('✅ GraphManager initialized and connected to Neo4j');
  
  return manager;
}

/**
 * Create a TodoManager instance
 * Requires an initialized GraphManager
 */
export function createTodoManager(graphManager: IGraphManager): TodoManager {
  return new TodoManager(graphManager);
}
