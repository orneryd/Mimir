#!/usr/bin/env node

/**
 * Check and Reset Embeddings
 * 
 * This script:
 * 1. Checks Neo4j vector index configuration
 * 2. Checks existing embeddings and their dimensions
 * 3. Compares with currently configured dimensions from environment
 * 4. Offers to reset the embedding space if mismatches are found
 * 
 * Usage (via npm):
 *   npm run embeddings:check                                      # Check only
 *   npm run embeddings:reset                                      # Reset and regenerate embeddings
 *   npm run embeddings:force-reset                                # Force reset without asking
 *   npm run embeddings:clear                                      # Clear embeddings without regenerating
 *   npm run embeddings:generate-missing                           # Generate embeddings only for items without them
 * 
 * Usage (direct):
 *   node scripts/check-and-reset-embeddings.js                    # Check only
 *   node scripts/check-and-reset-embeddings.js --reset            # Reset and regenerate embeddings
 *   node scripts/check-and-reset-embeddings.js --force            # Force reset without asking
 *   node scripts/check-and-reset-embeddings.js --reset --clear-only  # Clear embeddings without regenerating
 *   node scripts/check-and-reset-embeddings.js --generate-missing # Generate embeddings only for items without them
 */

import neo4j from 'neo4j-driver';
import readline from 'readline';
import { EmbeddingsService } from '../build/indexing/EmbeddingsService.js';

// Configuration from environment or defaults
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const CONFIGURED_DIMENSIONS = parseInt(process.env.MIMIR_EMBEDDINGS_DIMENSIONS || '1024', 10);
const CONFIGURED_MODEL = process.env.MIMIR_EMBEDDINGS_MODEL || 'mxbai-embed-large';

// Ensure embeddings are enabled for regeneration
process.env.MIMIR_EMBEDDINGS_ENABLED = 'true';
process.env.MIMIR_FEATURE_VECTOR_EMBEDDINGS = 'true';
process.env.MIMIR_EMBEDDINGS_PROVIDER = process.env.MIMIR_EMBEDDINGS_PROVIDER || 'llama.cpp';
process.env.MIMIR_EMBEDDINGS_MODEL = CONFIGURED_MODEL;
process.env.MIMIR_EMBEDDINGS_DIMENSIONS = CONFIGURED_DIMENSIONS.toString();
process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';

// Parse command line arguments
const args = process.argv.slice(2);
const shouldReset = args.includes('--reset') || args.includes('--force');
const forceReset = args.includes('--force');
const clearOnly = args.includes('--clear-only');
const generateMissing = args.includes('--generate-missing');

/**
 * Prompt user for confirmation
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

/**
 * Check vector index configuration
 */
async function checkVectorIndex(session) {
  console.log('\n🔍 Checking vector index configuration...');
  
  try {
    const result = await session.run(`
      SHOW INDEXES
      YIELD name, type, labelsOrTypes, properties, options
      WHERE name = 'node_embedding_index'
      RETURN name, type, options
    `);
    
    if (result.records.length === 0) {
      console.log('⚠️  No vector index found (node_embedding_index does not exist)');
      return { exists: false, dimensions: null };
    }
    
    const record = result.records[0];
    const options = record.get('options');
    const indexConfig = options?.indexConfig || {};
    const dimensions = indexConfig['vector.dimensions'];
    
    console.log(`✅ Vector index exists: node_embedding_index`);
    console.log(`   Type: ${record.get('type')}`);
    console.log(`   Dimensions: ${dimensions}`);
    console.log(`   Similarity: ${indexConfig['vector.similarity_function'] || 'cosine'}`);
    
    return { exists: true, dimensions: parseInt(dimensions, 10) };
  } catch (error) {
    console.error('❌ Error checking vector index:', error.message);
    return { exists: false, dimensions: null, error: error.message };
  }
}

/**
 * Check existing embeddings in database
 */
async function checkExistingEmbeddings(session) {
  console.log('\n🔍 Checking existing embeddings...');
  
  try {
    // Count nodes with embeddings (any label)
    const countResult = await session.run(`
      MATCH (n)
      WHERE n.embedding IS NOT NULL
      RETURN count(n) as count
    `);
    
    const totalCountValue = countResult.records[0].get('count');
    const totalCount = typeof totalCountValue === 'object' && totalCountValue.toNumber ? totalCountValue.toNumber() : totalCountValue;
    
    if (totalCount === 0) {
      console.log('ℹ️  No embeddings found in database');
      return { count: 0, models: [], dimensions: [] };
    }
    
    // Get embedding statistics (any label)
    const statsResult = await session.run(`
      MATCH (n)
      WHERE n.embedding IS NOT NULL
      RETURN 
        n.embedding_model as model,
        n.embedding_dimensions as dimensions,
        size(n.embedding) as actualDims,
        count(n) as count
      ORDER BY count DESC
    `);
    
    console.log(`✅ Found ${totalCount} nodes with embeddings:`);
    
    const models = [];
    const dimensions = [];
    
    statsResult.records.forEach(record => {
      const model = record.get('model') || 'unknown';
      const dimsValue = record.get('dimensions');
      const actualDimsValue = record.get('actualDims');
      // Prefer stored dimensions, fall back to actual size of embedding array
      const dims = dimsValue 
        ? (typeof dimsValue === 'object' && dimsValue.toNumber ? dimsValue.toNumber() : dimsValue)
        : (actualDimsValue ? (typeof actualDimsValue === 'object' && actualDimsValue.toNumber ? actualDimsValue.toNumber() : actualDimsValue) : null);
      const countValue = record.get('count');
      const count = typeof countValue === 'object' && countValue.toNumber ? countValue.toNumber() : countValue;
      
      models.push({ model, dimensions: dims, count });
      if (dims) dimensions.push(dims);
      
      console.log(`   ${model} (${dims || '?'} dims): ${count} nodes`);
    });
    
    return { count: totalCount, models, dimensions };
  } catch (error) {
    console.error('❌ Error checking embeddings:', error.message);
    return { count: 0, models: [], dimensions: [], error: error.message };
  }
}

/**
 * Check for chunk embeddings
 */
async function checkChunkEmbeddings(session) {
  console.log('\n🔍 Checking chunk embeddings...');
  
  try {
    const result = await session.run(`
      MATCH (n)-[:HAS_CHUNK]->(c:FileChunk)
      WHERE c.embedding IS NOT NULL
      RETURN count(c) as count, 
             c.embedding_dimensions as dimensions,
             size(c.embedding) as actualDims
      LIMIT 1
    `);
    
    if (result.records.length === 0) {
      console.log('ℹ️  No chunk embeddings found');
      return { count: 0, dimensions: null };
    }
    
    const countValue = result.records[0].get('count');
    const count = typeof countValue === 'object' && countValue.toNumber ? countValue.toNumber() : countValue;
    const dimsValue = result.records[0].get('dimensions');
    const dimensions = dimsValue ? (typeof dimsValue === 'object' && dimsValue.toNumber ? dimsValue.toNumber() : dimsValue) : null;
    
    console.log(`✅ Found ${count} chunks with embeddings (${dimensions || '?'} dims)`);
    
    return { count, dimensions };
  } catch (error) {
    console.error('❌ Error checking chunk embeddings:', error.message);
    return { count: 0, dimensions: null, error: error.message };
  }
}

/**
 * Analyze mismatches and report
 */
function analyzeMismatches(indexInfo, embeddingsInfo, chunksInfo) {
  console.log('\n📊 Analysis:');
  console.log(`   Configured dimensions: ${CONFIGURED_DIMENSIONS}`);
  console.log(`   Configured model: ${CONFIGURED_MODEL}`);
  
  const mismatches = [];
  
  // Check index dimensions
  if (indexInfo.exists && indexInfo.dimensions !== CONFIGURED_DIMENSIONS) {
    console.log(`   ⚠️  Index dimensions (${indexInfo.dimensions}) != configured (${CONFIGURED_DIMENSIONS})`);
    mismatches.push('index');
  } else if (indexInfo.exists) {
    console.log(`   ✅ Index dimensions match configured`);
  }
  
  // Check embedding dimensions
  const uniqueDims = [...new Set(embeddingsInfo.dimensions)];
  if (uniqueDims.length > 0) {
    const allMatch = uniqueDims.every(d => d === CONFIGURED_DIMENSIONS);
    if (!allMatch) {
      console.log(`   ⚠️  Embedding dimensions ${JSON.stringify(uniqueDims)} != configured (${CONFIGURED_DIMENSIONS})`);
      mismatches.push('embeddings');
    } else {
      console.log(`   ✅ All embedding dimensions match configured`);
    }
  }
  
  // Check chunk dimensions
  if (chunksInfo.count > 0 && chunksInfo.dimensions !== CONFIGURED_DIMENSIONS) {
    console.log(`   ⚠️  Chunk dimensions (${chunksInfo.dimensions}) != configured (${CONFIGURED_DIMENSIONS})`);
    mismatches.push('chunks');
  } else if (chunksInfo.count > 0) {
    console.log(`   ✅ Chunk dimensions match configured`);
  }
  
  return mismatches;
}

/**
 * Find nodes with mismatched embeddings
 */
async function findMismatchedNodes(session) {
  console.log('\n🔍 Finding nodes with mismatched embeddings...');
  
  try {
    const result = await session.run(`
      MATCH (n)
      WHERE n.embedding IS NOT NULL 
        AND (n.embedding_dimensions IS NULL 
             OR n.embedding_dimensions <> $configuredDims
             OR n.embedding_model IS NULL
             OR n.embedding_model <> $configuredModel
             OR size(n.embedding) <> $configuredDims)
      RETURN n.id as id, 
             n.type as type, 
             n.title as title, 
             n.content as content, 
             n.text as text,
             n.embedding_dimensions as currentDims,
             n.embedding_model as currentModel,
             size(n.embedding) as actualDims
      ORDER BY n.type, n.id
    `, { 
      configuredDims: CONFIGURED_DIMENSIONS,
      configuredModel: CONFIGURED_MODEL
    });
    
    const nodes = result.records.map(r => {
      const dimsValue = r.get('currentDims');
      const dims = dimsValue ? (typeof dimsValue === 'object' && dimsValue.toNumber ? dimsValue.toNumber() : dimsValue) : null;
      
      return {
        id: r.get('id'),
        type: r.get('type'),
        title: r.get('title'),
        content: r.get('content'),
        text: r.get('text'),
        currentDims: dims,
        currentModel: r.get('currentModel')
      };
    });
    
    if (nodes.length === 0) {
      console.log('   ✅ No mismatched nodes found');
    } else {
      console.log(`   ⚠️  Found ${nodes.length} nodes with mismatched embeddings`);
    }
    
    return nodes;
  } catch (error) {
    console.error('❌ Error finding mismatched nodes:', error.message);
    throw error;
  }
}

/**
 * Find nodes without embeddings
 */
async function findNodesWithoutEmbeddings(session) {
  console.log('\n🔍 Finding nodes and chunks without embeddings...');
  
  // Find both regular nodes and FileChunks without embeddings
  const result = await session.run(`
    MATCH (n)
    WHERE (n.type IS NOT NULL OR n:FileChunk)
      AND (n.embedding IS NULL OR size(n.embedding) = 0)
      AND (n.content IS NOT NULL OR n.text IS NOT NULL)
    RETURN n.id as id, 
           labels(n)[0] as type, 
           coalesce(n.content, n.text) as content
    LIMIT 10000
  `);
  
  const nodes = result.records.map(record => ({
    id: record.get('id'),
    type: record.get('type'),
    content: record.get('content')
  }));
  
  console.log(`   Found ${nodes.length} nodes without embeddings`);
  return nodes;
}

/**
 * Generate embeddings for nodes that don't have them
 */
async function generateMissingEmbeddings(session) {
  console.log('\n🔄 Generating missing embeddings...');
  
  // Initialize embeddings service
  const embeddingsService = new EmbeddingsService();
  await embeddingsService.initialize();
  
  if (!embeddingsService.isEnabled()) {
    console.error('❌ Embeddings service is not enabled. Check your configuration.');
    throw new Error('Embeddings service not enabled');
  }
  
  // Find nodes without embeddings
  const nodes = await findNodesWithoutEmbeddings(session);
  
  if (nodes.length === 0) {
    console.log('   ✅ All nodes already have embeddings');
    return;
  }
  
  console.log(`   Model: ${CONFIGURED_MODEL}`);
  console.log(`   Dimensions: ${CONFIGURED_DIMENSIONS}`);
  console.log(`   Processing ${nodes.length} nodes...`);
  
  let processed = 0;
  let errors = 0;
  
  for (const node of nodes) {
    try {
      if (!node.content) continue;
      
      // Generate embedding
      const embeddingResult = await embeddingsService.generateEmbedding(node.content);
      
      // Extract just the embedding array if it's wrapped in an object
      const embedding = Array.isArray(embeddingResult) 
        ? embeddingResult 
        : (embeddingResult.embedding || embeddingResult);
      
      // Verify it's an array of numbers
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(`Invalid embedding format: expected array, got ${typeof embedding}`);
      }
      
      // Update node with embedding
      await session.run(
        `MATCH (n {id: $id})
         SET n.embedding = $embedding`,
        { id: node.id, embedding }
      );
      
      processed++;
      if (processed % 10 === 0) {
        console.log(`   Progress: ${processed}/${nodes.length}`);
      }
    } catch (error) {
      errors++;
      console.error(`   ⚠️  Failed for node ${node.id} (${node.type}): ${error.message}`);
    }
  }
  
  console.log(`\n✅ Generated embeddings for ${processed} nodes (${errors} errors)`);
  
  // Verify embeddings were stored
  console.log('\n🔍 Verifying embeddings in database...');
  const verifyResult = await session.run(`
    MATCH (n)
    WHERE n.embedding IS NOT NULL
    RETURN count(n) as total,
           avg(size(n.embedding)) as avgDimensions,
           min(size(n.embedding)) as minDimensions,
           max(size(n.embedding)) as maxDimensions
  `);
  
  const verify = verifyResult.records[0];
  console.log(`   Total nodes with embeddings: ${verify.get('total')}`);
  console.log(`   Embedding dimensions: min=${verify.get('minDimensions')}, max=${verify.get('maxDimensions')}, avg=${Math.round(verify.get('avgDimensions'))}`);
  
  if (errors > 0) {
    console.log(`\n⚠️  ${errors} nodes failed to generate embeddings`);
  }
}

/**
 * Regenerate embeddings for mismatched nodes
 */
async function regenerateEmbeddings(session, nodes) {
  console.log('\n🔄 Regenerating embeddings...');
  
  // Initialize embeddings service
  const embeddingsService = new EmbeddingsService();
  await embeddingsService.initialize();
  
  if (!embeddingsService.isEnabled()) {
    console.error('❌ Embeddings service is not enabled. Check your configuration.');
    throw new Error('Embeddings service not enabled');
  }
  
  console.log(`   Model: ${CONFIGURED_MODEL}`);
  console.log(`   Dimensions: ${CONFIGURED_DIMENSIONS}`);
  console.log(`   Processing ${nodes.length} nodes...\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const progress = `[${i + 1}/${nodes.length}]`;
    
    console.log(`${progress} Processing: ${node.type} - ${node.id}`);
    if (node.title) {
      console.log(`          Title: ${node.title.substring(0, 60)}${node.title.length > 60 ? '...' : ''}`);
    }
    if (node.currentModel) {
      console.log(`          Current: ${node.currentModel} (${node.currentDims || '?'} dims)`);
    }
    
    // Get text content for embedding
    const textContent = node.content || node.text || node.title || '';
    
    if (!textContent) {
      console.log('          ⚠️  No text content found, skipping');
      errorCount++;
      continue;
    }
    
    try {
      // Generate new embedding
      const embeddingResult = await embeddingsService.generateEmbedding(textContent);
      
      // Extract just the embedding array if it's wrapped in an object
      const embedding = Array.isArray(embeddingResult) 
        ? embeddingResult 
        : (embeddingResult.embedding || embeddingResult);
      
      // Verify it's an array of numbers
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(`Invalid embedding format: expected array, got ${typeof embedding}`);
      }
      
      // Update node with new embedding
      await session.run(`
        MATCH (n:Node {id: $id})
        SET n.embedding = $embedding,
            n.embedding_model = $model,
            n.embedding_dimensions = $dimensions,
            n.has_embedding = true
        REMOVE n.needs_embedding
      `, {
        id: node.id,
        embedding: embedding,
        model: embeddingResult.model || CONFIGURED_MODEL,
        dimensions: embedding.length
      });
      
      console.log(`          ✅ Updated (${embeddingResult.dimensions} dims)`);
      successCount++;
      
      // Small delay to avoid overwhelming the service
      if (i < nodes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`          ❌ Failed: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n✅ Regeneration complete!`);
  console.log(`   Success: ${successCount} nodes`);
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount} nodes`);
  }
  
  return { successCount, errorCount };
}

/**
 * Reset embedding space (full reset)
 */
async function resetEmbeddingSpace(session, regenerate = true) {
  console.log('\n🔄 Resetting embedding space...');
  
  try {
    // Step 1: Drop vector index
    console.log('\n1️⃣  Dropping vector index...');
    await session.run('DROP INDEX node_embedding_index IF EXISTS');
    console.log('   ✅ Vector index dropped');
    
    // Step 2: Create new vector index with configured dimensions
    console.log(`\n2️⃣  Creating vector index with ${CONFIGURED_DIMENSIONS} dimensions...`);
    await session.run(`
      CREATE VECTOR INDEX node_embedding_index IF NOT EXISTS
      FOR (n:Node) ON (n.embedding)
      OPTIONS {indexConfig: {
        \`vector.dimensions\`: ${CONFIGURED_DIMENSIONS},
        \`vector.similarity_function\`: 'cosine'
      }}
    `);
    console.log('   ✅ Vector index created');
    
    if (!regenerate) {
      // Step 3a: Clear embeddings from nodes (if not regenerating)
      console.log('\n3️⃣  Clearing embeddings from nodes (any label)...');
      const nodeResult = await session.run(`
        MATCH (n)
        WHERE n.embedding IS NOT NULL
        REMOVE n.embedding, n.embedding_model, n.embedding_dimensions, n.has_embedding
        RETURN count(n) as count
      `);
      const nodeCountValue = nodeResult.records[0].get('count');
      const nodeCount = typeof nodeCountValue === 'object' && nodeCountValue.toNumber ? nodeCountValue.toNumber() : nodeCountValue;
      console.log(`   ✅ Cleared embeddings from ${nodeCount} nodes`);
      
      // Step 4: Clear embeddings from chunks
      console.log('\n4️⃣  Clearing embeddings from FileChunks...');
      const chunkResult = await session.run(`
        MATCH (c:FileChunk)
        WHERE c.embedding IS NOT NULL
        REMOVE c.embedding, c.embedding_model, c.embedding_dimensions
        RETURN count(c) as count
      `);
      const chunkCountValue = chunkResult.records[0].get('count');
      const chunkCount = typeof chunkCountValue === 'object' && chunkCountValue.toNumber ? chunkCountValue.toNumber() : chunkCountValue;
      console.log(`   ✅ Cleared embeddings from ${chunkCount} chunks`);
      
      console.log('\n✅ Embedding space reset complete!');
      console.log('\n📝 Next steps:');
      console.log('   Re-index your files to generate new embeddings:');
      console.log('   npm run index-docs');
    } else {
      // Step 3b: Find and regenerate mismatched embeddings
      const nodes = await findMismatchedNodes(session);
      
      if (nodes.length > 0) {
        await regenerateEmbeddings(session, nodes);
      }
      
      console.log('\n✅ Embedding space reset complete!');
    }
    
  } catch (error) {
    console.error('\n❌ Error resetting embedding space:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Mimir Embedding Space Checker\n');
  console.log('Configuration:');
  console.log(`   Neo4j URI: ${NEO4J_URI}`);
  console.log(`   Dimensions: ${CONFIGURED_DIMENSIONS}`);
  console.log(`   Model: ${CONFIGURED_MODEL}`);
  
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );
  
  const session = driver.session();
  
  try {
    // Handle generate-missing mode separately
    if (generateMissing) {
      console.log('\n📝 Generate Missing Mode: Will only generate embeddings for items without them\n');
      await generateMissingEmbeddings(session);
      console.log('\n✅ Done!');
      return;
    }
    
    // Check current state
    const indexInfo = await checkVectorIndex(session);
    const embeddingsInfo = await checkExistingEmbeddings(session);
    const chunksInfo = await checkChunkEmbeddings(session);
    
    // Analyze mismatches
    const mismatches = analyzeMismatches(indexInfo, embeddingsInfo, chunksInfo);
    
    // If force or clear-only is set, proceed regardless of mismatches
    if (!forceReset && !shouldReset && mismatches.length === 0) {
      console.log('\n✅ All embeddings match configured dimensions. No action needed.');
      return;
    }
    
    // Report mismatches (if any)
    if (mismatches.length > 0) {
    console.log('\n⚠️  Mismatches detected:');
    for (const m of mismatches) {
      console.log(`   - ${m}`);
      }
    } else if (forceReset || shouldReset) {
      console.log('\n✅ No mismatches detected, but proceeding with reset as requested...');
    }
    
    // Decide whether to reset
    let doReset = false;
    
    if (forceReset) {
      console.log('\n🔨 Force reset enabled. Proceeding without confirmation...');
      doReset = true;
    } else if (shouldReset) {
      if (clearOnly) {
        console.log('\n⚠️  WARNING: This will:');
        console.log('   1. Drop the existing vector index');
        console.log('   2. Clear all embeddings from nodes and chunks');
        console.log('   3. Create a new vector index with configured dimensions');
        console.log('   4. You will need to re-index files to generate new embeddings');
      } else {
        console.log('\n⚠️  WARNING: This will:');
        console.log('   1. Drop the existing vector index');
        console.log('   2. Create a new vector index with configured dimensions');
        console.log('   3. Find all nodes with mismatched embeddings');
        console.log('   4. Regenerate embeddings for those nodes (this may take a while)');
      }
      
      const answer = await askQuestion('\nProceed with reset? (yes/no): ');
      doReset = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
    } else {
      console.log('\n💡 Tip: Run with --reset to fix mismatches automatically');
      console.log('   npm run embeddings:reset');
      console.log('   or: node scripts/check-and-reset-embeddings.js --reset');
      return;
    }
    
    if (doReset) {
      await resetEmbeddingSpace(session, !clearOnly);
    } else {
      console.log('\n❌ Reset cancelled by user.');
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    throw error;
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the script
main()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
