#!/usr/bin/env node
import { createGraphManager } from './build/managers/index.js';
import { FileWatchManager } from './build/indexing/FileWatchManager.js';
import { WatchConfigManager } from './build/indexing/WatchConfigManager.js';
import { existsSync } from 'fs';
import path from 'path';

console.log('🚀 Starting file watch setup...');

async function watchCurrentFolder() {
  console.log('📍 Entering watchCurrentFolder function');
  try {
    console.log('📡 Creating GraphManager...');
    const graphManager = await createGraphManager();
    console.log('✅ GraphManager initialized and connected to Neo4j');
    
    const watchManager = new FileWatchManager(graphManager.driver);
    const configManager = new WatchConfigManager(graphManager.driver);
    
    // Auto-detect environment: Docker container vs host
    // Docker: Use WORKSPACE_ROOT env var (set in docker-compose.yml)
    // Host: Use current working directory
    let folderPath;
    
    if (process.env.WORKSPACE_ROOT) {
      // Running in Docker container
      folderPath = path.join(process.env.WORKSPACE_ROOT, 'src');
      console.log('🐳 Running in Docker container');
    } else {
      // Running on host - use current directory
      folderPath = process.env.WATCH_PATH || path.join(process.cwd(), 'src');
      console.log('💻 Running on host');
    }
    
    console.log(`📁 Setting up file watcher for: ${folderPath}`);
    
    // Validate path exists
    if (!existsSync(folderPath)) {
      console.error(`❌ Path does not exist: ${folderPath}`);
      console.log('\n💡 Tips:');
      console.log('  - On host: Set WATCH_PATH environment variable');
      console.log('  - In Docker: WORKSPACE_ROOT should be set to /workspace');
      console.log(`  - Example: WATCH_PATH="${process.cwd()}/src" node setup-file-watch.js`);
      process.exit(1);
    }
    
    // Check if already watching
    const existingConfig = await configManager.getByPath(folderPath);
    if (existingConfig) {
      console.log('⚠️  Already watching this folder:', existingConfig.id);
      console.log(`   Status: ${existingConfig.status}`);
      console.log(`   Files indexed: ${existingConfig.files_indexed}`);
      await graphManager.close();
      return;
    }
    
    // Create watch config
    const config = await configManager.createWatch({
      path: folderPath,
      recursive: true,
      debounce_ms: 500,
      file_patterns: ['*.ts', '*.js', '*.json', '*.md'],
      ignore_patterns: ['*.test.ts', '*.spec.ts', 'node_modules/**', 'build/**'],
      generate_embeddings: false
    });
    
    console.log(`✅ Watch config created: ${config.id}`);
    
    // Start watching (this also auto-indexes the folder)
    await watchManager.startWatch(config);
    
    console.log('✅ File watcher started successfully!');
    
    // List active watches
    const watches = await configManager.listActive();
    console.log('\n� Active watches:');
    watches.forEach(watch => {
      console.log(`  - ${watch.path} (${watch.status}) - ${watch.files_indexed} files indexed`);
    });
    
    console.log('\n🔒 Closing Neo4j connection...');
    await graphManager.close();
    console.log('✅ All done!');
  } catch (error) {
    console.error('❌ Error setting up watcher:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

console.log('🎬 Calling watchCurrentFolder...');
watchCurrentFolder()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Unhandled error:', err);
    process.exit(1);
  });
