import { createGraphManager } from './build/managers/index.js';

async function addTestData() {
  const manager = await createGraphManager();
  
  // Add some completed work
  const todo1 = await manager.addNode('todo', {
    title: 'Implemented REST API endpoints',
    description: 'Created Express server with health check and status endpoints',
    status: 'completed',
    tags: ['backend', 'api', 'express']
  });
  
  const todo2 = await manager.addNode('todo', {
    title: 'Added Docker support',
    description: 'Containerized application with docker-compose',
    status: 'completed',
    tags: ['devops', 'docker']
  });
  
  const todo3 = await manager.addNode('todo', {
    title: 'Setup TypeScript build pipeline',
    description: 'Configured TypeScript compilation and build scripts',
    status: 'completed',
    tags: ['tooling', 'typescript']
  });
  
  // Add a concept
  const concept1 = await manager.addNode('concept', {
    name: 'MCP Server Architecture',
    description: 'Model Context Protocol server implementation pattern',
    pattern: 'stdio transport with tool definitions'
  });
  
  console.log('✅ Added test data to graph:');
  console.log('  - 3 completed TODOs');
  console.log('  - 1 concept');
  console.log('\nNode IDs:');
  console.log('  -', todo1.id);
  console.log('  -', todo2.id);
  console.log('  -', todo3.id);
  console.log('  -', concept1.id);
  
  await manager.close();
}

addTestData().catch(console.error);
