#!/usr/bin/env node
import { createGraphManager } from './build/managers/index.js';

async function queryGraph() {
  const manager = await createGraphManager();
  
  console.log('📊 KNOWLEDGE GRAPH QUERY DEMO\n');
  console.log('='.repeat(60));
  
  // 1. Search for API-related content
  console.log('\n🔍 Search: "REST API"');
  const apiResults = await manager.searchNodes('REST API', { limit: 3 });
  apiResults.forEach((node, i) => {
    console.log(`  ${i + 1}. [${node.type}] ${node.properties.title || node.properties.name}`);
    if (node.properties.description) {
      console.log(`     ${node.properties.description.substring(0, 80)}...`);
    }
  });
  
  // 2. Get all completed TODOs
  console.log('\n\n✅ Completed TODOs:');
  const completed = await manager.queryNodes('todo', { status: 'completed' });
  completed.forEach((node, i) => {
    console.log(`  ${i + 1}. ${node.properties.title}`);
    console.log(`     ${node.properties.description}`);
  });
  
  // 3. Get all concepts
  console.log('\n\n💡 Concepts:');
  const concepts = await manager.queryNodes('concept');
  concepts.forEach((node, i) => {
    console.log(`  ${i + 1}. ${node.properties.name || node.properties.title}`);
    if (node.properties.description) {
      console.log(`     ${node.properties.description}`);
    }
  });
  
  // 4. Get indexed files
  console.log('\n\n📁 Indexed Files:');
  const files = await manager.queryNodes('file');
  console.log(`  Total: ${files.length} files`);
  files.slice(0, 5).forEach((node, i) => {
    console.log(`  ${i + 1}. ${node.properties.path}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Query complete!\n');
  
  await manager.close();
}

queryGraph().catch(console.error);
