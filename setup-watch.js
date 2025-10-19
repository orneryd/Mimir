#!/usr/bin/env node

/**
 * File Watch Setup Helper
 * 
 * Provides an interactive way to set up file watching with better
 * error messages and guidance.
 */

import { createGraphManager } from './build/managers/index.js';
import { FileWatchManager } from './build/indexing/FileWatchManager.js';
import { WatchConfigManager } from './build/indexing/WatchConfigManager.js';
import { existsSync } from 'fs';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const helpFlag = args.includes('--help') || args.includes('-h');
const pathArg = args.find(arg => !arg.startsWith('-'));

if (helpFlag) {
  console.log(`
📚 File Watch Setup Helper

USAGE:
  node setup-watch.js [path]

EXAMPLES:
  # Watch current directory's src folder (auto-detect)
  node setup-watch.js

  # Watch specific directory
  node setup-watch.js /path/to/project/src

  # Using environment variable
  WATCH_PATH=/custom/path node setup-watch.js

ENVIRONMENT:
  WATCH_PATH        Override default watch path (host only)
  WORKSPACE_ROOT    Set by Docker (container detection)
  HOST_WORKSPACE_ROOT  Docker compose host mount point

DOCKER USAGE:
  # Inside container (auto-detects /workspace)
  docker exec mcp_server node setup-watch.js

  # With custom host mount
  export HOST_WORKSPACE_ROOT=/your/projects
  docker-compose up -d
  docker exec mcp_server node setup-watch.js

For more information, see: docs/guides/FILE_WATCHING_GUIDE.md
`);
  process.exit(0);
}

async function setupWatch() {
  console.log('🚀 File Watch Setup Helper\n');

  try {
    // Connect to Neo4j
    console.log('📡 Connecting to Neo4j...');
    const graphManager = await createGraphManager();
    console.log('✅ Connected to Neo4j\n');
    
    const watchManager = new FileWatchManager(graphManager.driver);
    const configManager = new WatchConfigManager(graphManager.driver);
    
    // Determine watch path
    let folderPath;
    
    if (pathArg) {
      // Use command line argument
      folderPath = path.resolve(pathArg);
      console.log('📝 Using command line argument');
    } else if (process.env.WORKSPACE_ROOT) {
      // Running in Docker container
      folderPath = path.join(process.env.WORKSPACE_ROOT, 'src');
      console.log('🐳 Detected Docker container environment');
      console.log(`   WORKSPACE_ROOT: ${process.env.WORKSPACE_ROOT}`);
    } else if (process.env.WATCH_PATH) {
      // Environment variable override
      folderPath = path.resolve(process.env.WATCH_PATH);
      console.log('🔧 Using WATCH_PATH environment variable');
    } else {
      // Default: current directory + /src
      folderPath = path.join(process.cwd(), 'src');
      console.log('💻 Using default path (current directory)');
    }
    
    console.log(`📁 Watch path: ${folderPath}\n`);
    
    // Validate path exists
    if (!existsSync(folderPath)) {
      console.error('❌ Error: Path does not exist!\n');
      console.log('💡 Troubleshooting:\n');
      
      if (process.env.WORKSPACE_ROOT) {
        console.log('   Running in Docker:');
        console.log('   1. Check docker-compose.yml volume mount:');
        console.log('      volumes:');
        console.log(`        - /host/path:${process.env.WORKSPACE_ROOT}:ro`);
        console.log('   2. Verify mount inside container:');
        console.log(`      docker exec mcp_server ls -la ${process.env.WORKSPACE_ROOT}`);
        console.log('   3. Check HOST_WORKSPACE_ROOT environment variable');
      } else {
        console.log('   Running on host:');
        console.log('   1. Specify correct path:');
        console.log(`      node setup-watch.js ${process.cwd()}/src`);
        console.log('   2. Or use environment variable:');
        console.log('      WATCH_PATH=/path/to/src node setup-watch.js');
        console.log('   3. Or change to project directory first:');
        console.log('      cd /your/project && node /path/to/setup-watch.js');
      }
      
      await graphManager.close();
      process.exit(1);
    }
    
    // Check if already watching
    const existingConfig = await configManager.getByPath(folderPath);
    if (existingConfig) {
      console.log('⚠️  This path is already being watched!\n');
      console.log(`   Watch ID: ${existingConfig.id}`);
      console.log(`   Status: ${existingConfig.status}`);
      console.log(`   Files indexed: ${existingConfig.files_indexed}`);
      console.log(`   Last updated: ${new Date(existingConfig.updated_at).toLocaleString()}\n`);
      console.log('💡 To re-index, first remove the old watch or use check-watches.js\n');
      await graphManager.close();
      process.exit(0);
    }
    
    // Create watch config
    console.log('🔧 Creating watch configuration...');
    const config = await configManager.createWatch({
      path: folderPath,
      recursive: true,
      debounce_ms: 500,
      file_patterns: ['*.ts', '*.js', '*.json', '*.md'],
      ignore_patterns: ['*.test.ts', '*.spec.ts', 'node_modules/**', 'build/**', 'dist/**'],
      generate_embeddings: false
    });
    
    console.log(`✅ Watch config created: ${config.id}\n`);
    
    // Start watching (also triggers initial indexing)
    console.log('📂 Starting file watcher and indexing files...');
    console.log('   This may take a moment for large directories...\n');
    
    await watchManager.startWatch(config);
    
    console.log('\n✅ File watching setup complete!\n');
    
    // Show summary
    const watches = await configManager.listActive();
    const thisWatch = watches.find(w => w.id === config.id);
    
    console.log('📊 Summary:');
    console.log(`   Path: ${thisWatch.path}`);
    console.log(`   Files indexed: ${thisWatch.files_indexed}`);
    console.log(`   Status: ${thisWatch.status}`);
    console.log(`   File patterns: ${thisWatch.file_patterns?.join(', ') || 'all'}\n`);
    
    console.log('🎯 Next Steps:');
    console.log('   1. Verify indexing: node check-watches.js');
    console.log('   2. Test with agent: npm run chain "what files do we have?"');
    console.log('   3. See docs: docs/guides/FILE_WATCHING_GUIDE.md\n');
    
    await graphManager.close();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error during setup:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Neo4j connection failed. Make sure Neo4j is running:');
      console.log('   docker-compose up -d neo4j');
    }
    
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

setupWatch();
