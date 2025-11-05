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
    // vector_search_nodes
    // ========================================================================
    {
      name: 'vector_search_nodes',
      description: 'Semantic search across all nodes using vector embeddings. Returns nodes most similar to the query by MEANING (not exact text match). Use this to find related concepts, similar problems, or relevant context when you don\'t know exact keywords. Works with todos, memories, files, and all other node types. Complements memory_node search (which finds exact text matches).',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query (e.g., "authentication code", "database connections", "pending tasks")'
          },
          types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: Filter by node types (e.g., ["todo", "memory", "file"]). If not provided, searches all types.'
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
      description: 'Get statistics about nodes with embeddings, broken down by type',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
  ];
}

/**
 * Handle vector_search_nodes tool call
 */
export async function handleVectorSearchNodes(
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

    const limit = Math.floor(params.limit || 5);
    const minSimilarity = params.min_similarity || 0.5;

    // Build type filter if provided
    let typeFilter = '';
    const queryParams: any = {
      queryVector: queryEmbedding.embedding,
      limit: Math.floor(limit * 2) // Get more candidates for filtering
    };
    
    if (params.types && Array.isArray(params.types) && params.types.length > 0) {
      typeFilter = 'AND node.type IN $types';
      queryParams.types = params.types;
    }

    // Use Neo4j's native vector similarity search
    // Note: Neo4j requires integer parameters, not floats
    const result = await session.run(`
      CALL db.index.vector.queryNodes('node_embedding_index', toInteger($limit), $queryVector)
      YIELD node, score
      WHERE score >= $minSimilarity ${typeFilter}
      RETURN COALESCE(node.id, node.path) AS id,
             node.type AS type,
             COALESCE(node.title, node.name) AS title,
             node.name AS name,
             node.description AS description,
             node.content AS content,
             node.path AS path,
             score AS similarity
      ORDER BY score DESC
      LIMIT toInteger($finalLimit)
    `, { ...queryParams, minSimilarity, finalLimit: limit });

    if (result.records.length === 0) {
      return {
        status: 'success',
        query: params.query,
        results: [],
        total_candidates: 0,
        returned: 0,
        message: 'No similar nodes found. Try lowering min_similarity or check if nodes have embeddings.'
      };
    }

    // Format results
    const results = result.records.map(record => {
      const content = record.get('content');
      const description = record.get('description');
      const title = record.get('title');
      const name = record.get('name');
      const path = record.get('path');
      
      // Create a preview from available text fields
      let preview = '';
      if (title) preview = title;
      else if (name) preview = name;
      else if (description) preview = description;
      else if (content && typeof content === 'string') preview = content.substring(0, 200);
      
      const resultObj: any = {
        id: record.get('id'),
        type: record.get('type'),
        title: title || name || null,
        description: description || null,
        similarity: record.get('similarity'),
        content_preview: preview
      };
      
      // Add path for file nodes
      if (path) {
        resultObj.path = path;
      }
      
      return resultObj;
    });

    return {
      status: 'success',
      query: params.query,
      results,
      total_candidates: result.records.length,
      returned: result.records.length
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
    // Get total count and breakdown by type
    const result = await session.run(`
      MATCH (n:Node)
      WHERE n.has_embedding = true
      RETURN n.type AS type, count(*) AS count
      ORDER BY count DESC
    `);

    const byType: Record<string, number> = {};
    let total = 0;

    for (const record of result.records) {
      const type = record.get('type');
      const countValue = record.get('count');
      const count = typeof countValue === 'object' && countValue.toNumber ? countValue.toNumber() : Number(countValue);
      byType[type] = count;
      total += count;
    }

    return {
      status: 'success',
      total_nodes_with_embeddings: total,
      breakdown_by_type: byType
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
