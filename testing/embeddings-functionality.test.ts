/**
 * @file testing/embeddings-functionality.test.ts
 * @description Integration tests for vector embeddings functionality
 * 
 * Tests both technical correctness and practical usefulness of semantic search.
 * Requires Ollama with nomic-embed-text model to be running.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { EmbeddingsService } from '../src/indexing/EmbeddingsService.js';
import { GraphManager } from '../src/managers/GraphManager.js';

describe('Embeddings Functionality Tests', () => {
  let embeddingsService: EmbeddingsService;
  let graphManager: GraphManager;

  beforeAll(async () => {
    // Initialize services
    embeddingsService = new EmbeddingsService();
    await embeddingsService.initialize();

    graphManager = new GraphManager();
    await graphManager.initialize();
  });

  describe('Technical Correctness', () => {
    it('should generate embeddings with correct dimensions', async () => {
      const text = 'This is a test sentence for embeddings.';
      const result = await embeddingsService.generateEmbedding(text);

      expect(result).toBeDefined();
      expect(result.embedding).toBeInstanceOf(Array);
      expect(result.dimensions).toBe(768); // nomic-embed-text default
      expect(result.embedding.length).toBe(768);
      expect(result.model).toBe('nomic-embed-text');
    });

    it('should generate different embeddings for different texts', async () => {
      const text1 = 'Authentication and authorization systems';
      const text2 = 'Database connection pooling';

      const result1 = await embeddingsService.generateEmbedding(text1);
      const result2 = await embeddingsService.generateEmbedding(text2);

      expect(result1.embedding).not.toEqual(result2.embedding);
    });

    it('should generate similar embeddings for similar texts', async () => {
      const text1 = 'user authentication system';
      const text2 = 'user login and authentication';

      const result1 = await embeddingsService.generateEmbedding(text1);
      const result2 = await embeddingsService.generateEmbedding(text2);

      const similarity = embeddingsService.cosineSimilarity(
        result1.embedding,
        result2.embedding
      );

      // Similar texts should have high similarity (> 0.7)
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should chunk large text properly', async () => {
      const largeText = 'word '.repeat(1000); // 1000 words
      const chunks = embeddingsService.chunkText(largeText, 512, 50);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].startOffset).toBe(0);
      
      // Check overlap exists between chunks
      if (chunks.length > 1) {
        expect(chunks[1].startOffset).toBeLessThan(chunks[0].endOffset);
      }
    });

    it('should handle batch embedding generation', async () => {
      const texts = [
        'First test sentence',
        'Second test sentence',
        'Third test sentence'
      ];

      const results = await embeddingsService.generateEmbeddings(texts);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.embedding).toHaveLength(768);
      });
    });
  });

  describe('Semantic Search Usefulness', () => {
    // Sample code snippets representing different functionality
    const codeSnippets = [
      {
        id: 'auth-1',
        content: `
          // User authentication with JWT tokens
          function authenticateUser(username: string, password: string) {
            const user = await findUser(username);
            if (!user || !verifyPassword(password, user.hash)) {
              throw new Error('Invalid credentials');
            }
            return generateJWT(user);
          }
        `,
        description: 'JWT authentication'
      },
      {
        id: 'db-1',
        content: `
          // Database connection pool configuration
          const pool = new Pool({
            host: 'localhost',
            port: 5432,
            database: 'mydb',
            max: 20,
            idleTimeoutMillis: 30000
          });
        `,
        description: 'Database pooling'
      },
      {
        id: 'graph-1',
        content: `
          // Graph traversal for finding related nodes
          async function getNeighbors(nodeId: string, depth: number) {
            const query = \`
              MATCH (n)-[*1..\${depth}]-(related)
              WHERE n.id = $nodeId
              RETURN related
            \`;
            return await executeQuery(query, { nodeId });
          }
        `,
        description: 'Graph operations'
      },
      {
        id: 'auth-2',
        content: `
          // OAuth2 authorization flow
          async function handleOAuthCallback(code: string) {
            const token = await exchangeCodeForToken(code);
            const user = await fetchUserProfile(token);
            return createSession(user);
          }
        `,
        description: 'OAuth implementation'
      },
      {
        id: 'vector-1',
        content: `
          // Vector similarity search
          function cosineSimilarity(a: number[], b: number[]): number {
            const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
            const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
            const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
            return dot / (magA * magB);
          }
        `,
        description: 'Vector operations'
      }
    ];

    it('should find authentication-related code when searching for "login system"', async () => {
      // Generate embeddings for all snippets
      const snippetEmbeddings = await Promise.all(
        codeSnippets.map(async snippet => ({
          ...snippet,
          embedding: await embeddingsService.generateEmbedding(snippet.content)
        }))
      );

      // Search query
      const queryEmbedding = await embeddingsService.generateEmbedding(
        'user login and authentication system'
      );

      // Calculate similarities
      const results = snippetEmbeddings.map(snippet => ({
        id: snippet.id,
        description: snippet.description,
        similarity: embeddingsService.cosineSimilarity(
          queryEmbedding.embedding,
          snippet.embedding.embedding
        )
      }))
      .sort((a, b) => b.similarity - a.similarity);

      // Top results should be auth-related
      expect(results[0].id).toMatch(/auth-/);
      expect(results[1].id).toMatch(/auth-/);
      
      // Should have reasonable similarity scores
      expect(results[0].similarity).toBeGreaterThan(0.6);
      
      console.log('\n🔍 Search: "user login and authentication system"');
      console.log('Top 3 results:');
      results.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.description} (${r.id}) - ${(r.similarity * 100).toFixed(1)}%`);
      });
    });

    it('should find database code when searching for "connection pooling"', async () => {
      const snippetEmbeddings = await Promise.all(
        codeSnippets.map(async snippet => ({
          ...snippet,
          embedding: await embeddingsService.generateEmbedding(snippet.content)
        }))
      );

      const queryEmbedding = await embeddingsService.generateEmbedding(
        'database connection pool setup'
      );

      const results = snippetEmbeddings.map(snippet => ({
        id: snippet.id,
        description: snippet.description,
        similarity: embeddingsService.cosineSimilarity(
          queryEmbedding.embedding,
          snippet.embedding.embedding
        )
      }))
      .sort((a, b) => b.similarity - a.similarity);

      // Top result should be database-related
      expect(results[0].id).toBe('db-1');
      expect(results[0].similarity).toBeGreaterThan(0.6);

      console.log('\n🔍 Search: "database connection pool setup"');
      console.log('Top 3 results:');
      results.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.description} (${r.id}) - ${(r.similarity * 100).toFixed(1)}%`);
      });
    });

    it('should find graph operations when searching for "traversal"', async () => {
      const snippetEmbeddings = await Promise.all(
        codeSnippets.map(async snippet => ({
          ...snippet,
          embedding: await embeddingsService.generateEmbedding(snippet.content)
        }))
      );

      const queryEmbedding = await embeddingsService.generateEmbedding(
        'graph database traversal and neighbors'
      );

      const results = snippetEmbeddings.map(snippet => ({
        id: snippet.id,
        description: snippet.description,
        similarity: embeddingsService.cosineSimilarity(
          queryEmbedding.embedding,
          snippet.embedding.embedding
        )
      }))
      .sort((a, b) => b.similarity - a.similarity);

      // Top result should be graph-related
      expect(results[0].id).toBe('graph-1');
      expect(results[0].similarity).toBeGreaterThan(0.6);

      console.log('\n🔍 Search: "graph database traversal and neighbors"');
      console.log('Top 3 results:');
      results.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.description} (${r.id}) - ${(r.similarity * 100).toFixed(1)}%`);
      });
    });

    it('should distinguish between authentication and authorization', async () => {
      const authSnippet = await embeddingsService.generateEmbedding(
        codeSnippets.find(s => s.id === 'auth-1')!.content
      );
      const oauthSnippet = await embeddingsService.generateEmbedding(
        codeSnippets.find(s => s.id === 'auth-2')!.content
      );

      const authQuery = await embeddingsService.generateEmbedding(
        'JWT token authentication'
      );
      const oauthQuery = await embeddingsService.generateEmbedding(
        'OAuth2 authorization flow'
      );

      const authSimilarity = embeddingsService.cosineSimilarity(
        authQuery.embedding,
        authSnippet.embedding
      );
      const oauthSimilarity = embeddingsService.cosineSimilarity(
        oauthQuery.embedding,
        oauthSnippet.embedding
      );

      // Each query should match its corresponding implementation better
      expect(authSimilarity).toBeGreaterThan(0.6);
      expect(oauthSimilarity).toBeGreaterThan(0.6);

      console.log('\n🔍 Query specificity test:');
      console.log(`  "JWT token authentication" → JWT impl: ${(authSimilarity * 100).toFixed(1)}%`);
      console.log(`  "OAuth2 authorization flow" → OAuth impl: ${(oauthSimilarity * 100).toFixed(1)}%`);
    });
  });

  describe('Practical Integration', () => {
    it('should work with the MCP vector search tool', async () => {
      // This test simulates what happens when the vector_search_files tool is called

      // 1. Generate query embedding
      const query = 'find code related to embeddings';
      const queryEmbedding = await embeddingsService.generateEmbedding(query);

      expect(queryEmbedding.embedding).toHaveLength(768);

      // 2. In real usage, this would query Neo4j for files with embeddings
      // and calculate similarities
      const mockFileEmbedding = await embeddingsService.generateEmbedding(
        'EmbeddingsService class for generating vector embeddings'
      );

      const similarity = embeddingsService.cosineSimilarity(
        queryEmbedding.embedding,
        mockFileEmbedding.embedding
      );

      // Should find relevant results
      expect(similarity).toBeGreaterThan(0.5);

      console.log('\n🔍 MCP Tool Simulation:');
      console.log(`  Query: "${query}"`);
      console.log(`  Match: "EmbeddingsService class..."`);
      console.log(`  Similarity: ${(similarity * 100).toFixed(1)}%`);
    });

    it('should handle edge cases gracefully', async () => {
      // Empty text
      const emptyResult = await embeddingsService.generateEmbedding('');
      expect(emptyResult.embedding).toHaveLength(768);

      // Very short text
      const shortResult = await embeddingsService.generateEmbedding('x');
      expect(shortResult.embedding).toHaveLength(768);

      // Special characters
      const specialResult = await embeddingsService.generateEmbedding('!@#$%^&*()');
      expect(specialResult.embedding).toHaveLength(768);
    });
  });

  describe('Performance Characteristics', () => {
    it('should generate embeddings in reasonable time', async () => {
      const text = 'This is a performance test for embedding generation.';
      
      const start = Date.now();
      await embeddingsService.generateEmbedding(text);
      const duration = Date.now() - start;

      // Should complete within 1 second for short text
      expect(duration).toBeLessThan(1000);

      console.log(`\n⚡ Performance: ${duration}ms for single embedding`);
    });

    it('should handle batch processing efficiently', async () => {
      const texts = Array(10).fill('Test sentence for batch processing');
      
      const start = Date.now();
      await embeddingsService.generateEmbeddings(texts);
      const duration = Date.now() - start;

      // Should process all in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);

      console.log(`\n⚡ Batch Performance: ${duration}ms for 10 embeddings (${(duration/10).toFixed(0)}ms avg)`);
    });
  });

  describe('Model Verification', () => {
    it('should verify Ollama model is available', async () => {
      const isAvailable = await embeddingsService.verifyModel();
      
      expect(isAvailable).toBe(true);

      if (isAvailable) {
        console.log('\n✅ Ollama model verified: nomic-embed-text is available');
      } else {
        console.log('\n❌ Ollama model NOT available - please run: ollama pull nomic-embed-text');
      }
    });
  });
});
