/**
 * Nodes API - Manage non-file nodes in Neo4j
 * Provides endpoints for browsing, viewing, and deleting nodes
 */

import { Router, Request, Response } from 'express';
import neo4j from 'neo4j-driver';
import { requirePermission } from '../middleware/rbac.js';

const router = Router();

/**
 * GET /api/nodes/types
 * Get all node types (excluding file/chunk types)
 */
router.get('/types', requirePermission('nodes:read'), async (req: Request, res: Response) => {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );

  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (n:Node)
      WHERE n.type IS NOT NULL
        AND n.type <> 'file'
        AND n.type <> 'file_chunk'
        AND n.type <> 'node_chunk'
      WITH DISTINCT n.type as nodeType
      MATCH (n:Node {type: nodeType})
      RETURN 
        nodeType,
        count(n) as nodeCount
      ORDER BY nodeType ASC
    `);

    const types = result.records.map(record => ({
      type: record.get('nodeType'),
      count: record.get('nodeCount').toInt()
    }));

    res.json({ types });
  } catch (error: any) {
    console.error('❌ Error fetching node types:', error);
    res.status(500).json({
      error: 'Failed to fetch node types',
      details: error.message
    });
  } finally {
    await session.close();
    await driver.close();
  }
});

/**
 * GET /api/nodes/vector-search
 * Vector search across nodes (excluding files and chunks)
 */
router.get('/vector-search', requirePermission('search:execute'), async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const minSimilarity = parseFloat(req.query.min_similarity as string) || 0.75;
    const depth = parseInt(req.query.depth as string, 10) || 1;
    const typesParam = req.query.types as string;
    
    // RRF configuration parameters (optional)
    const rrfK = req.query.rrf_k ? parseInt(req.query.rrf_k as string, 10) : undefined;
    const rrfVectorWeight = req.query.rrf_vector_weight ? parseFloat(req.query.rrf_vector_weight as string) : undefined;
    const rrfBm25Weight = req.query.rrf_bm25_weight ? parseFloat(req.query.rrf_bm25_weight as string) : undefined;
    const rrfMinScore = req.query.rrf_min_score ? parseFloat(req.query.rrf_min_score as string) : undefined;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Parse types
    let types: string[] | undefined;
    if (typesParam) {
      types = typesParam.split(',').map(t => t.trim());
    }

    // Import GraphManager and handleVectorSearchNodes
    const { GraphManager } = await import('../managers/GraphManager.js');
    const { handleVectorSearchNodes } = await import('../tools/vectorSearch.tools.js');
    
    const graphManager = new GraphManager(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    );

    // Use the same tool handler as chat API for consistency
    const results = await handleVectorSearchNodes(
      {
        query,
        types,
        limit,
        min_similarity: minSimilarity,
        depth,
        rrf_k: rrfK,
        rrf_vector_weight: rrfVectorWeight,
        rrf_bm25_weight: rrfBm25Weight,
        rrf_min_score: rrfMinScore
      },
      graphManager.getDriver()
    );

    // Handle both UnifiedSearchResponse format and tool response format
    const resultArray = results.results || [];
    
    res.json({
      query,
      results: resultArray,
      count: resultArray.length,
      total_results: results.total_results || results.total_candidates || resultArray.length,
      search_method: results.search_method || 'fulltext',
      advanced_metrics: results.advanced_metrics
    });
  } catch (error: any) {
    console.error('❌ Error in vector search:', error);
    res.status(500).json({
      error: 'Vector search failed',
      details: error.message
    });
  }
});

/**
 * GET /api/nodes/types/:type
 * Get paginated list of nodes of a specific type
 */
router.get('/types/:type', requirePermission('nodes:read'), async (req: Request, res: Response) => {
  const { type } = req.params;
  const page = Math.floor(parseInt(req.query.page as string, 10)) || 1;
  const limit = Math.floor(parseInt(req.query.limit as string, 10)) || 20;
  const skip = (page - 1) * limit;

  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );

  const session = driver.session();

  try {
    // Get total count
    const countResult = await session.run(
      `
      MATCH (n:Node {type: $type})
      RETURN count(n) as total
      `,
      { type }
    );

    const total = countResult.records[0].get('total').toInt();

    // Get paginated nodes with edge counts and embedding counts
    const result = await session.run(
      `
      MATCH (n:Node {type: $type})
      OPTIONAL MATCH (n)-[r]-()
      OPTIONAL MATCH (n)-[:HAS_CHUNK]->(chunk:NodeChunk)
      WITH n, 
           count(DISTINCT r) as edgeCount,
           count(DISTINCT chunk) as chunkCount,
           CASE WHEN n.embedding IS NOT NULL THEN 1 ELSE 0 END as hasDirectEmbedding
      WITH n,
           edgeCount,
           CASE 
             WHEN n.has_chunks = true THEN chunkCount
             WHEN hasDirectEmbedding = 1 THEN 1
             ELSE 0
           END as embeddingCount
      RETURN 
        n.id as id,
        n.type as type,
        COALESCE(n.title, n.name, n.id) as displayName,
        n.created as created,
        n.updated as updated,
        edgeCount,
        embeddingCount,
        properties(n) as properties
      ORDER BY n.updated DESC, n.created DESC
      SKIP $skip
      LIMIT $limit
      `,
      { type, skip: neo4j.int(skip), limit: neo4j.int(limit) }
    );

    const nodes = result.records.map(record => ({
      id: record.get('id'),
      type: record.get('type'),
      displayName: record.get('displayName'),
      created: record.get('created'),
      updated: record.get('updated'),
      edgeCount: record.get('edgeCount').toInt(),
      embeddingCount: record.get('embeddingCount').toInt(),
      properties: record.get('properties')
    }));

    res.json({
      nodes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error(`❌ Error fetching nodes of type ${type}:`, error);
    res.status(500).json({
      error: `Failed to fetch nodes of type ${type}`,
      details: error.message
    });
  } finally {
    await session.close();
    await driver.close();
  }
});

/**
 * GET /api/nodes/types/:type/:id/details
 * Get detailed information about a specific node including edges
 */
router.get('/types/:type/:id/details', requirePermission('nodes:read'), async (req: Request, res: Response) => {
  const { type, id } = req.params;

  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );

  const session = driver.session();

  try {
    // Get node properties
    const nodeResult = await session.run(
      `
      MATCH (n:Node {id: $id, type: $type})
      RETURN properties(n) as properties
      `,
      { id, type }
    );

    if (nodeResult.records.length === 0) {
      await session.close();
      await driver.close();
      return res.status(404).json({ error: 'Node not found' });
    }

    const properties = nodeResult.records[0].get('properties');

    // Get outgoing edges
    const outgoingResult = await session.run(
      `
      MATCH (n:Node {id: $id})-[r]->(target)
      RETURN 
        type(r) as relationshipType,
        target.id as targetId,
        target.type as targetType,
        COALESCE(target.title, target.name, target.id) as targetName,
        properties(r) as edgeProperties
      ORDER BY relationshipType, targetName
      `,
      { id }
    );

    const outgoing = outgoingResult.records.map(record => ({
      type: record.get('relationshipType'),
      targetId: record.get('targetId'),
      targetType: record.get('targetType'),
      targetName: record.get('targetName'),
      properties: record.get('edgeProperties')
    }));

    // Get incoming edges
    const incomingResult = await session.run(
      `
      MATCH (source)-[r]->(n:Node {id: $id})
      RETURN 
        type(r) as relationshipType,
        source.id as sourceId,
        source.type as sourceType,
        COALESCE(source.title, source.name, source.id) as sourceName,
        properties(r) as edgeProperties
      ORDER BY relationshipType, sourceName
      `,
      { id }
    );

    const incoming = incomingResult.records.map(record => ({
      type: record.get('relationshipType'),
      sourceId: record.get('sourceId'),
      sourceType: record.get('sourceType'),
      sourceName: record.get('sourceName'),
      properties: record.get('edgeProperties')
    }));

    res.json({
      node: {
        id,
        type,
        properties
      },
      edges: {
        outgoing,
        incoming,
        total: outgoing.length + incoming.length
      }
    });
  } catch (error: any) {
    console.error(`❌ Error fetching node details for ${id}:`, error);
    res.status(500).json({
      error: 'Failed to fetch node details',
      details: error.message
    });
  } finally {
    await session.close();
    await driver.close();
  }
});

/**
 * DELETE /api/nodes/:id
 * Delete a node and all its edges
 */
router.delete('/:id', requirePermission('nodes:delete'), async (req: Request, res: Response) => {
  const { id } = req.params;

  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );

  const session = driver.session();

  try {
    // First, get node info for logging
    const nodeResult = await session.run(
      `
      MATCH (n:Node {id: $id})
      RETURN n.type as type, COALESCE(n.title, n.name, n.id) as name
      `,
      { id }
    );

    if (nodeResult.records.length === 0) {
      await session.close();
      await driver.close();
      return res.status(404).json({ error: 'Node not found' });
    }

    const nodeType = nodeResult.records[0].get('type');
    const nodeName = nodeResult.records[0].get('name');

    // Delete node and all its edges
    const deleteResult = await session.run(
      `
      MATCH (n:Node {id: $id})
      OPTIONAL MATCH (n)-[r]-()
      WITH n, count(DISTINCT r) as edgeCount
      DETACH DELETE n
      RETURN edgeCount
      `,
      { id }
    );

    const edgeCount = deleteResult.records[0].get('edgeCount').toInt();

    console.log(`🗑️  Deleted node ${id} (${nodeType}: ${nodeName}) and ${edgeCount} edges`);

    res.json({
      success: true,
      message: `Node deleted successfully`,
      deleted: {
        id,
        type: nodeType,
        name: nodeName,
        edgesRemoved: edgeCount
      }
    });
  } catch (error: any) {
    console.error(`❌ Error deleting node ${id}:`, error);
    res.status(500).json({
      error: 'Failed to delete node',
      details: error.message
    });
  } finally {
    await session.close();
    await driver.close();
  }
});

/**
 * POST /api/nodes/:id/embeddings
 * Generate or regenerate embeddings for a specific node
 */
router.post('/:id/embeddings', requirePermission('nodes:write'), async (req: Request, res: Response) => {
  const { id } = req.params;

  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );

  const session = driver.session();

  try {
    // Import EmbeddingsService
    const { EmbeddingsService } = await import('../indexing/EmbeddingsService.js');
    const embeddingsService = new EmbeddingsService();
    
    await embeddingsService.initialize();
    
    if (!embeddingsService.isEnabled()) {
      await driver.close();
      return res.status(503).json({ 
        error: 'Embeddings service is not enabled',
        details: 'Check your LLM configuration'
      });
    }

    // Get the node (any label)
    const nodeResult = await session.run(
      `MATCH (n) WHERE n.id = $id RETURN n`,
      { id }
    );

    if (nodeResult.records.length === 0) {
      await driver.close();
      return res.status(404).json({ error: 'Node not found' });
    }

    const node = nodeResult.records[0].get('n').properties;

    console.log(`🔄 Generating embeddings for node ${id} (${node.type})...`);

    // Extract text content for embedding
    const textContent = node.content || node.text || node.title || node.description || '';
    
    if (!textContent || textContent.trim().length === 0) {
      await driver.close();
      return res.status(400).json({ 
        error: 'No text content found',
        details: 'Node must have content, text, title, or description property'
      });
    }

    const chunkSize = parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_SIZE || '768', 10);
    
    // Check if content needs chunking
    if (textContent.length > chunkSize) {
      // Large content - use chunking
      console.log(`📦 Node ${id} has large content (${textContent.length} chars), creating chunks...`);
      
      const chunks = await embeddingsService.generateChunkEmbeddings(textContent);
      
      // Delete existing chunks first
      await session.run(
        `MATCH (n) WHERE n.id = $id
         OPTIONAL MATCH (n)-[r:HAS_CHUNK]->(chunk:NodeChunk)
         DELETE r, chunk`,
        { id }
      );
      
      // Create chunk nodes and relationships
      for (const chunk of chunks) {
        const chunkId = `chunk-${id}-${chunk.chunkIndex}`;
        
        await session.run(
          `
          MATCH (n) WHERE n.id = $nodeId
          CREATE (c:NodeChunk:Node {
            id: $chunkId,
            chunk_index: $chunkIndex,
            text: $text,
            start_offset: $startOffset,
            end_offset: $endOffset,
            embedding: $embedding,
            embedding_dimensions: $dimensions,
            embedding_model: $model,
            type: 'node_chunk',
            indexed_date: datetime(),
            parentNodeId: $nodeId,
            has_embedding: true
          })
          CREATE (n)-[:HAS_CHUNK {index: $chunkIndex}]->(c)
          `,
          {
            nodeId: id,
            chunkId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            embedding: chunk.embedding,
            dimensions: chunk.dimensions,
            model: chunk.model
          }
        );
      }
      
      // Update node to mark it has chunks
      await session.run(
        `MATCH (n) WHERE n.id = $id 
         SET n.has_embedding = true, 
             n.has_chunks = true,
             n.embedding_model = $model
         REMOVE n.embedding`,
        { id, model: chunks[0].model }
      );
      
      console.log(`✅ Generated ${chunks.length} chunk embeddings for node ${id}`);
      
      res.json({
        success: true,
        message: `Generated ${chunks.length} chunk embeddings`,
        embeddingCount: chunks.length,
        chunked: true
      });
    } else {
      // Small content - single embedding
      const result = await embeddingsService.generateEmbedding(textContent);
      
      await session.run(
        `MATCH (n) WHERE n.id = $id
         SET n.embedding = $embedding,
             n.embedding_dimensions = $dimensions,
             n.embedding_model = $model,
             n.has_embedding = true,
             n.has_chunks = false
         WITH n
         OPTIONAL MATCH (n)-[r:HAS_CHUNK]->(chunk:NodeChunk)
         DELETE r, chunk`,
        {
          id,
          embedding: result.embedding,
          dimensions: result.dimensions,
          model: result.model
        }
      );
      
      console.log(`✅ Generated single embedding for node ${id} (${result.dimensions} dimensions)`);
      
      res.json({
        success: true,
        message: 'Generated 1 embedding',
        embeddingCount: 1,
        chunked: false,
        dimensions: result.dimensions,
        model: result.model
      });
    }
  } catch (error: any) {
    console.error('❌ Error generating embeddings:', error);
    res.status(500).json({
      error: 'Failed to generate embeddings',
      details: error.message
    });
  } finally {
    await session.close();
    await driver.close();
  }
});

/**
 * POST /api/nodes
 * Create a new node
 */
router.post('/', requirePermission('nodes:write'), async (req: Request, res: Response) => {
  const { type, properties } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Node type is required' });
  }

  try {
    const { createGraphManager } = await import('../managers/index.js');
    const graphManager = await createGraphManager();

    const node = await graphManager.addNode(type, properties || {});

    await graphManager.close();

    res.status(201).json({
      success: true,
      node
    });
  } catch (error: any) {
    console.error('❌ Error creating node:', error);
    res.status(500).json({
      error: 'Failed to create node',
      details: error.message
    });
  }
});

/**
 * PUT /api/nodes/:id
 * Update a node (full update)
 */
router.put('/:id', requirePermission('nodes:write'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { properties } = req.body;

  if (!properties) {
    return res.status(400).json({ error: 'Properties are required' });
  }

  try {
    const { createGraphManager } = await import('../managers/index.js');
    const graphManager = await createGraphManager();

    const node = await graphManager.updateNode(id, properties);

    await graphManager.close();

    res.json({
      success: true,
      node
    });
  } catch (error: any) {
    console.error('❌ Error updating node:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Node not found',
        details: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to update node',
      details: error.message
    });
  }
});

/**
 * PATCH /api/nodes/:id
 * Partially update a node
 */
router.patch('/:id', requirePermission('nodes:write'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const properties = req.body;

  if (!properties || Object.keys(properties).length === 0) {
    return res.status(400).json({ error: 'At least one property is required' });
  }

  try {
    const { createGraphManager } = await import('../managers/index.js');
    const graphManager = await createGraphManager();

    const node = await graphManager.updateNode(id, properties);

    await graphManager.close();

    res.json({
      success: true,
      node
    });
  } catch (error: any) {
    console.error('❌ Error patching node:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Node not found',
        details: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to patch node',
      details: error.message
    });
  }
});

/**
 * GET /api/nodes/:id
 * Get a single node by ID (catch-all route - must be last)
 */
router.get('/:id', requirePermission('nodes:read'), async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { createGraphManager } = await import('../managers/index.js');
    const graphManager = await createGraphManager();

    const node = await graphManager.getNode(id);

    await graphManager.close();

    if (!node) {
      return res.status(404).json({
        error: 'Node not found'
      });
    }

    res.json(node);
  } catch (error: any) {
    console.error('❌ Error fetching node:', error);
    res.status(500).json({
      error: 'Failed to fetch node',
      details: error.message
    });
  }
});

export default router;
