/**
 * Clean up orphaned File nodes in Neo4j
 * Orphaned = File nodes with no relationships and no embeddings
 */

import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'your-password'
  )
);

async function findOrphanedFiles() {
  const session = driver.session();
  try {
    console.log('🔍 Finding orphaned File nodes...\n');
    
    // Find files with no relationships and no embeddings
    const result = await session.run(`
      MATCH (f:File)
      WHERE NOT (f)-[]-()
        AND f.embedding IS NULL
      RETURN f.path AS path, 
             f.relativePath AS relativePath,
             f.language AS language,
             f.indexed AS indexed,
             f.lastModified AS lastModified
      ORDER BY f.path
      LIMIT 100
    `);
    
    console.log(`Found ${result.records.length} orphaned files:\n`);
    
    result.records.forEach((record, idx) => {
      console.log(`${idx + 1}. ${record.get('relativePath') || record.get('path')}`);
      console.log(`   Language: ${record.get('language') || 'unknown'}`);
      console.log(`   Indexed: ${record.get('indexed')}`);
      console.log(`   Last Modified: ${record.get('lastModified')}`);
      console.log('');
    });
    
    return result.records.length;
  } finally {
    await session.close();
  }
}

async function cleanupOrphanedFiles() {
  const session = driver.session();
  try {
    console.log('🧹 Cleaning up orphaned File nodes...\n');
    
    // Delete files with no relationships and no embeddings
    const result = await session.run(`
      MATCH (f:File)
      WHERE NOT (f)-[]-()
        AND f.embedding IS NULL
      WITH f, f.relativePath AS path
      DELETE f
      RETURN count(f) AS deleted, collect(path)[0..10] AS samplePaths
    `);
    
    const deleted = result.records[0].get('deleted').toNumber();
    const samplePaths = result.records[0].get('samplePaths');
    
    console.log(`✅ Deleted ${deleted} orphaned File nodes\n`);
    
    if (samplePaths.length > 0) {
      console.log('Sample deleted files:');
      samplePaths.forEach((path, idx) => {
        console.log(`  ${idx + 1}. ${path}`);
      });
    }
    
    return deleted;
  } finally {
    await session.close();
  }
}

async function getFileStats() {
  const session = driver.session();
  try {
    console.log('\n📊 File Statistics:\n');
    
    // Get overall stats
    const statsResult = await session.run(`
      MATCH (f:File)
      OPTIONAL MATCH (f)-[r]-()
      WITH f, count(r) AS relCount
      RETURN 
        count(f) AS totalFiles,
        sum(CASE WHEN relCount = 0 AND f.embedding IS NULL THEN 1 ELSE 0 END) AS orphaned,
        sum(CASE WHEN f.embedding IS NOT NULL THEN 1 ELSE 0 END) AS withEmbeddings,
        sum(CASE WHEN relCount > 0 THEN 1 ELSE 0 END) AS withRelationships
    `);
    
    const stats = statsResult.records[0];
    console.log(`Total Files:           ${stats.get('totalFiles').toNumber()}`);
    console.log(`With Embeddings:       ${stats.get('withEmbeddings').toNumber()}`);
    console.log(`With Relationships:    ${stats.get('withRelationships').toNumber()}`);
    console.log(`Orphaned (no data):    ${stats.get('orphaned').toNumber()}`);
    
  } finally {
    await session.close();
  }
}

async function main() {
  try {
    console.log('🗄️  Neo4j Orphaned File Cleanup\n');
    console.log('=' .repeat(50) + '\n');
    
    // Show stats before
    await getFileStats();
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Find orphaned files
    const orphanedCount = await findOrphanedFiles();
    
    if (orphanedCount === 0) {
      console.log('✨ No orphaned files found! Database is clean.\n');
      return;
    }
    
    console.log('='.repeat(50) + '\n');
    
    // Ask for confirmation (auto-confirm in script)
    console.log('⚠️  About to delete these orphaned files...\n');
    
    // Cleanup
    await cleanupOrphanedFiles();
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Show stats after
    await getFileStats();
    
    console.log('\n✅ Cleanup complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await driver.close();
  }
}

main().catch(console.error);
