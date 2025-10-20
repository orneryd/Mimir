/**
 * @file src/tools/vectorSearch.tools.ts
 * @description Vector search MCP tools for semantic file search
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Driver } from 'neo4j-driver';
import { EmbeddingsService } from '../indexing/EmbeddingsService.js';

export function createVectorSearchTools(driver: Driver): Tool[] {
  const embeddingsService = new EmbeddingsService();
  let initialized = false;

  return [
    // ========================================================================
    // vector_search_files
    // ========================================================================
    {
      name: 'vector_search_files',
      description: 'Semantic search for files using vector embeddings. Returns files most similar to the query text. Requires embeddings to be enabled in config.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query (e.g., "authentication code", "database connections")'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
            default: 5
          },
          min_similarity: {
            type: 'number',
            description: 'Minimum cosine similarity threshold 0-1 (default: 0.5)',
            default: 0.5
          }
        },
        required: ['query']
      }
    },

    // ========================================================================
    // get_embedding_stats
    // ========================================================================
    {
      name: 'get_embedding_stats',
      description: 'Get statistics about indexed files with embeddings',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
  ];
}

/**
 * Handle vector_search_files tool call
 */
export async function handleVectorSearchFiles(
  params: any,
  driver: Driver
): Promise<any> {
  const embeddingsService = new EmbeddingsService();
  await embeddingsService.initialize();

  if (!embeddingsService.isEnabled()) {
    return {
      status: 'error',
      message: 'Vector embeddings not enabled. Set features.vectorEmbeddings=true in .mimir/llm-config.json'
    };
  }

  const session = driver.session();
  
  try {
    // Generate embedding for query
    const queryEmbedding = await embeddingsService.generateEmbedding(params.query);

    // Get all files with embeddings
    const result = await session.run(`
      MATCH (f:File)
      WHERE f.has_embedding = true
      RETURN f.path AS path, 
             f.name AS name,
             f.language AS language,
             f.size_bytes AS size_bytes,
             f.embedding AS embedding,
             f.content AS content
      LIMIT 1000
    `);

    if (result.records.length === 0) {
      return {
        status: 'success',
        results: [],
        message: 'No files with embeddings found. Run file watch with generate_embeddings=true'
      };
    }

    // Calculate similarities
    const candidates = result.records.map(record => ({
      embedding: record.get('embedding'),
      metadata: {
        path: record.get('path'),
        name: record.get('name'),
        language: record.get('language'),
        size_bytes: record.get('size_bytes'),
        content_preview: record.get('content')?.substring(0, 200) || ''
      }
    }));

    const limit = params.limit || 5;
    const minSimilarity = params.min_similarity || 0.5;

    const similarFiles = embeddingsService.findMostSimilar(
      queryEmbedding.embedding,
      candidates,
      limit * 2 // Get more than needed for filtering
    );

    // Filter by minimum similarity
    const filtered = similarFiles.filter(f => f.similarity >= minSimilarity);

    return {
      status: 'success',
      query: params.query,
      results: filtered.slice(0, limit).map(f => ({
        path: f.metadata.path,
        name: f.metadata.name,
        language: f.metadata.language,
        similarity: f.similarity,
        content_preview: f.metadata.content_preview
      })),
      total_candidates: result.records.length,
      returned: Math.min(filtered.length, limit)
    };

  } catch (error: any) {
    return {
      status: 'error',
      message: error.message
    };
  } finally {
    await session.close();
  }
}

/**
 * Handle get_embedding_stats tool call
 */
export async function handleGetEmbeddingStats(
  params: any,
  driver: Driver
): Promise<any> {
  const session = driver.session();
  
  try {
    const result = await session.run(`
      MATCH (f:File)
      RETURN 
        COUNT(f) AS total_files,
        SUM(CASE WHEN f.has_embedding = true THEN 1 ELSE 0 END) AS files_with_embeddings,
        SUM(CASE WHEN f.has_embedding = false THEN 1 ELSE 0 END) AS files_without_embeddings,
        COLLECT(DISTINCT f.embedding_model)[0] AS embedding_model,
        COLLECT(DISTINCT f.embedding_dimensions)[0] AS embedding_dimensions
    `);

    const record = result.records[0];

    return {
      status: 'success',
      stats: {
        total_files: record.get('total_files').toNumber(),
        files_with_embeddings: record.get('files_with_embeddings').toNumber(),
        files_without_embeddings: record.get('files_without_embeddings').toNumber(),
        embedding_model: record.get('embedding_model'),
        embedding_dimensions: record.get('embedding_dimensions')?.toNumber() || null
      }
    };

  } catch (error: any) {
    return {
      status: 'error',
      message: error.message
    };
  } finally {
    await session.close();
  }
}
