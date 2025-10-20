import { createGraphManager } from './build/managers/index.js';
import { WatchConfigManager } from './build/indexing/WatchConfigManager.js';

async function checkFileWatches() {
  try {
    const graphManager = await createGraphManager();
    console.log('✅ Connected to Neo4j\n');
    
    const configManager = new WatchConfigManager(graphManager.driver);
    
    // Get all watch configurations
    const watches = await configManager.listActive();
    console.log('📋 Active Watch Configurations:');
    if (watches.length === 0) {
      console.log('  (none)');
    } else {
      watches.forEach(watch => {
        console.log(`\n  ID: ${watch.id}`);
        console.log(`  Path: ${watch.path}`);
        console.log(`  Status: ${watch.status}`);
        console.log(`  Files indexed: ${watch.files_indexed}`);
        console.log(`  File patterns: ${watch.file_patterns?.join(', ') || 'all'}`);
        console.log(`  Recursive: ${watch.recursive}`);
      });
    }
    
    // Query indexed files
    console.log('\n📁 Recently Indexed Files:');
    const result = await graphManager.queryNodes('file', {});
    if (result.length === 0) {
      console.log('  (none)');
    } else {
      console.log(`  Total: ${result.length} files\n`);
      result.slice(0, 10).forEach((file) => {
        console.log(`  - ${file.properties.path || file.properties.name}`);
      });
      if (result.length > 10) {
        console.log(`  ... and ${result.length - 10} more`);
      }
    }
    
    await graphManager.close();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkFileWatches();
