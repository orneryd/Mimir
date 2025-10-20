#!/usr/bin/env node

/**
 * Quick script to check graph status after chain execution
 */

import { createGraphManager } from './build/managers/index.js';

async function main() {
  console.log('🔍 Checking graph database status...\n');
  
  const graphManager = await createGraphManager();
  
  try {
    // Get all TODO nodes
    const todos = await graphManager.queryNodes('todo');
    console.log(`📋 TODO Nodes: ${todos.length}`);
    if (todos.length > 0) {
      todos.forEach((node, i) => {
        console.log(`   ${i + 1}. ${node.id} - ${node.properties.title || node.properties.taskId || 'No title'}`);
        console.log(`      Status: ${node.properties.status || 'unknown'}`);
        console.log(`      Type: ${node.properties.taskId ? 'Task' : 'Execution'}`);
      });
    }
    console.log();
    
    // Get all executions
    const executions = await graphManager.searchNodes('exec-', { limit: 10 });
    console.log(`🔄 Execution Nodes: ${executions.length}`);
    if (executions.length > 0) {
      executions.forEach((node, i) => {
        console.log(`   ${i + 1}. ${node.id}`);
        console.log(`      Status: ${node.properties.status || 'unknown'}`);
        console.log(`      User Request: ${(node.properties.userRequest || '').substring(0, 60)}...`);
      });
    }
    console.log();
    
    // Get all file nodes
    const files = await graphManager.queryNodes('file');
    console.log(`📄 File Nodes: ${files.length}`);
    if (files.length > 0) {
      files.forEach((node, i) => {
        console.log(`   ${i + 1}. ${node.properties.path || node.id}`);
      });
    }
    console.log();
    
    // Get stats
    const stats = await graphManager.getStats();
    console.log('📊 Graph Statistics:');
    console.log(`   Total Nodes: ${stats.nodeCount}`);
    console.log(`   Total Edges: ${stats.edgeCount}`);
    console.log(`   Node Types: ${JSON.stringify(stats.nodeTypes)}`);
    console.log(`   Edge Types: ${JSON.stringify(stats.edgeTypes)}`);
    
  } finally {
    await graphManager.close();
  }
}

main().catch(console.error);
