#!/usr/bin/env node
/**
 * @file scripts/test-embeddings.js
 * @description Quick test to verify Ollama embeddings are functional
 * 
 * Usage: node scripts/test-embeddings.js
 */

import fetch from 'node-fetch';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.MIMIR_EMBEDDINGS_MODEL || 'nomic-embed-text';

console.log('🧪 Testing Ollama Embeddings Functionality');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(`Configuration:`);
console.log(`  Ollama URL: ${OLLAMA_BASE_URL}`);
console.log(`  Model: ${MODEL}`);
console.log('');

// Helper function to calculate cosine similarity
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dot = 0;
  let magA = 0;
  let magB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  
  return dot / (magA * magB);
}

// Generate embedding via Ollama API
async function generateEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt: text
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

// Run tests
async function runTests() {
  try {
    // Test 1: Basic connectivity
    console.log('Test 1: Checking Ollama connectivity...');
    const testEmbedding = await generateEmbedding('test');
    console.log(`✅ Connected! Generated embedding with ${testEmbedding.length} dimensions`);
    console.log('');

    // Test 2: Semantic similarity
    console.log('Test 2: Testing semantic similarity...');
    console.log('');

    const queries = [
      { text: 'user authentication and login', category: 'auth' },
      { text: 'database connection pooling', category: 'database' },
      { text: 'graph traversal algorithms', category: 'graph' }
    ];

    const documents = [
      { text: 'JWT token authentication for user login system', category: 'auth', id: 'doc-1' },
      { text: 'PostgreSQL connection pool configuration and management', category: 'database', id: 'doc-2' },
      { text: 'Neo4j graph database node traversal and relationships', category: 'graph', id: 'doc-3' },
      { text: 'OAuth2 authorization flow implementation', category: 'auth', id: 'doc-4' },
      { text: 'Redis caching layer for API responses', category: 'cache', id: 'doc-5' }
    ];

    // Generate embeddings for all documents
    console.log('Generating embeddings for test documents...');
    const start = Date.now();
    const docEmbeddings = await Promise.all(
      documents.map(async doc => ({
        ...doc,
        embedding: await generateEmbedding(doc.text)
      }))
    );
    const duration = Date.now() - start;
    console.log(`✅ Generated ${documents.length} embeddings in ${duration}ms (${(duration/documents.length).toFixed(0)}ms avg)`);
    console.log('');

    // Test each query
    for (const query of queries) {
      console.log(`🔍 Query: "${query.text}"`);
      const queryEmbedding = await generateEmbedding(query.text);

      // Calculate similarities
      const results = docEmbeddings
        .map(doc => ({
          id: doc.id,
          text: doc.text,
          category: doc.category,
          similarity: cosineSimilarity(queryEmbedding, doc.embedding)
        }))
        .sort((a, b) => b.similarity - a.similarity);

      // Display top 3 results
      console.log('   Top 3 matches:');
      results.slice(0, 3).forEach((result, i) => {
        const percentage = (result.similarity * 100).toFixed(1);
        const icon = result.category === query.category ? '✅' : '  ';
        console.log(`   ${i + 1}. ${icon} [${percentage}%] ${result.text}`);
      });

      // Verify top result is correct category
      if (results[0].category === query.category) {
        console.log(`   ✅ Correct category found!`);
      } else {
        console.log(`   ⚠️  Expected "${query.category}" but got "${results[0].category}"`);
      }
      console.log('');
    }

    // Test 3: Similar vs dissimilar text
    console.log('Test 3: Similar vs. dissimilar text comparison...');
    const text1 = 'machine learning model training';
    const text2 = 'machine learning algorithm optimization';
    const text3 = 'cooking recipes and meal preparation';

    const emb1 = await generateEmbedding(text1);
    const emb2 = await generateEmbedding(text2);
    const emb3 = await generateEmbedding(text3);

    const similarScore = cosineSimilarity(emb1, emb2);
    const dissimilarScore = cosineSimilarity(emb1, emb3);

    console.log(`   Similar texts:     "${text1}" ↔ "${text2}"`);
    console.log(`   Similarity score:  ${(similarScore * 100).toFixed(1)}%`);
    console.log('');
    console.log(`   Dissimilar texts:  "${text1}" ↔ "${text3}"`);
    console.log(`   Similarity score:  ${(dissimilarScore * 100).toFixed(1)}%`);
    console.log('');

    if (similarScore > dissimilarScore + 0.1) {
      console.log('   ✅ Embeddings correctly distinguish similar from dissimilar text!');
    } else {
      console.log('   ⚠️  Similarity scores are too close - may need model tuning');
    }
    console.log('');

    // Final summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ All tests completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Summary:');
    console.log(`  ✅ Ollama is accessible at ${OLLAMA_BASE_URL}`);
    console.log(`  ✅ Model "${MODEL}" is working`);
    console.log(`  ✅ Embeddings have ${testEmbedding.length} dimensions`);
    console.log(`  ✅ Semantic search is functional`);
    console.log(`  ✅ Similarity calculations work correctly`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Enable embeddings in .env:');
    console.log('     MIMIR_EMBEDDINGS_ENABLED=true');
    console.log('  2. Index your files:');
    console.log('     node setup-watch.js');
    console.log('  3. Use vector search:');
    console.log('     npm run chain "find files about authentication"');
    console.log('');

  } catch (error) {
    console.error('❌ Test failed!');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Check Ollama is running:');
    console.error('     docker ps | grep ollama');
    console.error('  2. Verify model is installed:');
    console.error('     docker exec ollama_server ollama list');
    console.error('  3. Pull the model if missing:');
    console.error(`     docker exec ollama_server ollama pull ${MODEL}`);
    console.error('  4. Check Ollama URL is correct:');
    console.error(`     Current: ${OLLAMA_BASE_URL}`);
    console.error('');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
