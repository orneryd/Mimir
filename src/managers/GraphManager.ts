// ============================================================================
// GraphManager - Neo4j Implementation
// Clean, simple, unified node model
// ============================================================================

import neo4j, { Driver, Session, Integer } from 'neo4j-driver';
import type {
  IGraphManager,
  Node,
  Edge,
  NodeType,
  EdgeType,
  SearchOptions,
  BatchDeleteResult,
  GraphStats,
  Subgraph,
  ClearType
} from '../types/index.js';
import { EmbeddingsService } from '../indexing/EmbeddingsService.js';
import { flattenForMCP } from '../tools/mcp/flattenForMCP.js';

export class GraphManager implements IGraphManager {
  private driver: Driver;
  private nodeCounter = 0;
  private edgeCounter = 0;
  private embeddingsService: EmbeddingsService | null = null;

  constructor(uri: string, user: string, password: string) {
    this.driver = neo4j.driver(
      uri,
      neo4j.auth.basic(user, password),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 60000,
        connectionTimeout: 30000
      }
    );
    
    // Initialize embeddings service
    this.embeddingsService = new EmbeddingsService();
    this.embeddingsService.initialize().catch(err => {
      console.warn('⚠️  Failed to initialize embeddings service:', err.message);
      this.embeddingsService = null;
    });
  }

  /**
   * Get the Neo4j driver instance
   */
  getDriver(): Driver {
    return this.driver;
  }

  /**
   * Initialize database: create indexes and constraints
   */
  async initialize(): Promise<void> {
    const session = this.driver.session();
    try {
      // Unique constraint on node IDs
      await session.run(`
        CREATE CONSTRAINT node_id_unique IF NOT EXISTS 
        FOR (n:Node) REQUIRE n.id IS UNIQUE
      `);

      // Full-text search index
      await session.run(`
        CREATE FULLTEXT INDEX node_search IF NOT EXISTS
        FOR (n:Node) ON EACH [n.properties]
      `);

      // Type index for fast filtering
      await session.run(`
        CREATE INDEX node_type IF NOT EXISTS
        FOR (n:Node) ON (n.type)
      `);

      // ─────────────────────────────────────────────────────────────
      // File Indexing Schema (Phase 1)
      // ─────────────────────────────────────────────────────────────
      
      // WatchConfig unique ID constraint
      await session.run(`
        CREATE CONSTRAINT watch_config_id_unique IF NOT EXISTS
        FOR (w:WatchConfig) REQUIRE w.id IS UNIQUE
      `);

      // WatchConfig path index
      await session.run(`
        CREATE INDEX watch_config_path IF NOT EXISTS
        FOR (w:WatchConfig) ON (w.path)
      `);

      // File path index (for fast lookups and updates)
      await session.run(`
        CREATE INDEX file_path IF NOT EXISTS
        FOR (f:File) ON (f.path)
      `);

      // Full-text search on file metadata and chunks
      // Drop old index if it exists (migration from v1 architecture)
      try {
        await session.run(`DROP INDEX file_content_search IF EXISTS`);
      } catch (error) {
        // Ignore if index doesn't exist
      }
      
      await session.run(`
        CREATE FULLTEXT INDEX file_metadata_search IF NOT EXISTS
        FOR (f:File) ON EACH [f.path, f.name, f.language]
      `);
      
      // Full-text search on file chunk content
      await session.run(`
        CREATE FULLTEXT INDEX file_chunk_content_search IF NOT EXISTS
        FOR (c:FileChunk) ON EACH [c.text]
      `);

      // Vector index for semantic search (1024 dimensions for mxbai-embed-large)
      await session.run(`
        CREATE VECTOR INDEX node_embedding_index IF NOT EXISTS
        FOR (n:Node) ON (n.embedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: 1024,
          \`vector.similarity_function\`: 'cosine'
        }}
      `);

      // Migration: Add Node label to existing File nodes and set type property
      await session.run(`
        MATCH (f:File)
        WHERE NOT f:Node
        SET f:Node, f.type = 'file'
      `);

      console.log('✅ Neo4j schema initialized (with file indexing support)');
    } catch (error: any) {
      console.error('❌ Schema initialization failed:', error.message);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    const session = this.driver.session();
    try {
      await session.run('RETURN 1');
      return true;
    } catch (error) {
      return false;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // SINGLE OPERATIONS
  // ============================================================================

  /**
   * Extract text content from node properties for embedding generation
   * Prioritizes: content, description, title, then concatenates all string values
   */
  private extractTextContent(properties: Record<string, any>): string {
    const parts: string[] = [];
    
    // Priority fields
    if (properties.content && typeof properties.content === 'string') {
      parts.push(properties.content);
    }
    if (properties.description && typeof properties.description === 'string') {
      parts.push(properties.description);
    }
    if (properties.title && typeof properties.title === 'string') {
      parts.push(properties.title);
    }
    if (properties.name && typeof properties.name === 'string') {
      parts.push(properties.name);
    }
    
    // If we have priority fields, use those
    if (parts.length > 0) {
      return parts.join('\n\n');
    }
    
    // Otherwise, concatenate all string values
    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        // Skip system fields
        if (!['id', 'type', 'created', 'updated'].includes(key)) {
          parts.push(value);
        }
      }
    }
    
    return parts.join('\n');
  }

  async addNode(type?: NodeType | Record<string, any>, properties?: Record<string, any>): Promise<Node> {
    const session = this.driver.session();
    try {
      // Handle flexible arguments: addNode(properties) or addNode(type, properties)
      let actualType: NodeType;
      let actualProperties: Record<string, any>;

      if (typeof type === 'object' && type !== null) {
        // First arg is properties, use default type
        actualType = 'memory';
        actualProperties = type as Record<string, any>;
      } else {
        // Standard: type specified
        actualType = type || 'memory';
        actualProperties = properties || {};
      }

      // Use provided ID if present, otherwise generate one
      const id = actualProperties.id || `${actualType}-${++this.nodeCounter}-${Date.now()}`;
      const now = new Date().toISOString();

      // Generate embeddings if enabled, not already provided, and content is available
      let embeddingData: any = null;
      const hasExistingEmbedding = actualProperties.embedding || actualProperties.has_embedding === true;
      
      console.error(`🔍 Embedding check for ${actualType} node: service=${!!this.embeddingsService}, hasExisting=${hasExistingEmbedding}`);
      
      if (this.embeddingsService && !hasExistingEmbedding) {
          // Ensure embeddings service is initialized
          if (!this.embeddingsService.isEnabled()) {
            console.error(`🔄 Initializing embeddings service for ${actualType} node`);
            await this.embeddingsService.initialize();
          }
          
          console.error(`📊 Embeddings service enabled: ${this.embeddingsService.isEnabled()}`);
          
          if (this.embeddingsService.isEnabled()) {
            // Extract text content for embedding generation
            const textContent = this.extractTextContent(actualProperties);
            
            console.error(`📝 Extracted text content length: ${textContent?.length || 0} chars`);
            
            if (textContent && textContent.trim().length > 0) {
              try {
                console.error(`🧮 Generating embedding for ${actualType} node: ${id}`);
                const result = await this.embeddingsService.generateEmbedding(textContent);
                embeddingData = {
                  embedding: result.embedding,
                  embedding_dimensions: result.dimensions,
                  embedding_model: result.model,
                  has_embedding: true
                };
                console.error(`✅ Generated embedding for ${actualType} node: ${id} (${result.dimensions} dimensions)`);
              } catch (error: any) {
                console.error(`⚠️  Failed to generate embedding for ${actualType} node: ${error.message}`);
                console.error(error.stack);
              }
            } else {
              console.error(`⏭️  No text content to embed for ${actualType} node: ${id}`);
            }
          }
        } else if (hasExistingEmbedding) {
          console.error(`⏭️  Skipping embedding generation (already exists): ${id}`);
        }

      // Flatten properties into the node (Neo4j doesn't support nested objects)
      const flattenedProps = flattenForMCP(actualProperties || {});
      const nodeProps = {
        id,
        type: actualType,
        created: now,
        updated: now,
        ...flattenedProps,  // Spread flattened properties at top level
        ...(embeddingData || { has_embedding: false })  // Add embedding data if available
      };

      const result = await session.run(
        'CREATE (n:Node $props) RETURN n { .*, embedding: null }',
        { props: nodeProps }
      );

      // Single node operation - return full content (don't strip)
      return this.nodeFromRecord(result.records[0].get('n'), undefined, false);
    } finally {
      await session.close();
    }
  }

  async getNode(id: string): Promise<Node | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (n:Node {id: $id}) RETURN n { .*, embedding: null }',
        { id }
      );

      if (result.records.length === 0) {
        return null;
      }

      // Single node query - return full content (don't strip)
      return this.nodeFromRecord(result.records[0].get('n'), undefined, false);
    } finally {
      await session.close();
    }
  }

  async updateNode(id: string, properties: Partial<Record<string, any>>): Promise<Node> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();

  // Build SET clauses for each property (flatten nested structures)
  const setProperties = { ...flattenForMCP(properties as Record<string, any>), updated: now };

      const result = await session.run(
        `
        MATCH (n:Node {id: $id})
        SET n += $properties
        RETURN n { .*, embedding: null }
        `,
        { id, properties: setProperties }
      );

      if (result.records.length === 0) {
        throw new Error(`Node not found: ${id}`);
      }

      // Single node operation - return full content (don't strip)
      return this.nodeFromRecord(result.records[0].get('n'), undefined, false);
    } finally {
      await session.close();
    }
  }

  async deleteNode(id: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (n:Node {id: $id})
        DETACH DELETE n
        RETURN count(n) as deleted
        `,
        { id }
      );

      const deleted = result.records[0]?.get('deleted').toNumber() || 0;
      return deleted > 0;
    } finally {
      await session.close();
    }
  }

  async addEdge(
    source: string,
    target: string,
    type: EdgeType,
    properties: Record<string, any> = {}
  ): Promise<Edge> {
    const session = this.driver.session();
    try {
      // Validate todoList relationships - can only connect to todo nodes
      const validationResult = await session.run(
        `
        MATCH (s:Node {id: $source})
        MATCH (t:Node {id: $target})
        RETURN s.type AS sourceType, t.type AS targetType
        `,
        { source, target }
      );

      if (validationResult.records.length === 0) {
        throw new Error(`Failed to create edge: source or target not found`);
      }

      const sourceType = validationResult.records[0].get('sourceType');
      const targetType = validationResult.records[0].get('targetType');

      // Enforce todoList constraint: can only contain relationships to todo nodes
      if (sourceType === 'todoList' && targetType !== 'todo') {
        throw new Error(`todoList nodes can only have relationships to todo nodes. Target type: ${targetType}`);
      }

      const id = `edge-${++this.edgeCounter}-${Date.now()}`;
      const now = new Date().toISOString();

      // Flatten properties directly onto the edge (Neo4j doesn't support nested objects)
      const flattenedEdgeProps = flattenForMCP(properties || {});
      const edgeProps = {
        id,
        type,
        created: now,
        ...flattenedEdgeProps  // User properties flattened at the same level
      };

      const result = await session.run(
        `
        MATCH (s:Node {id: $source})
        MATCH (t:Node {id: $target})
        CREATE (s)-[e:EDGE $edgeProps]->(t)
        RETURN e
        `,
        { source, target, edgeProps }
      );

      return this.edgeFromRecord(result.records[0].get('e'), source, target);
    } finally {
      await session.close();
    }
  }

  async deleteEdge(edgeId: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH ()-[e:EDGE {id: $edgeId}]->()
        DELETE e
        RETURN count(e) as deleted
        `,
        { edgeId }
      );

      const deleted = result.records[0]?.get('deleted').toNumber() || 0;
      return deleted > 0;
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  async addNodes(nodes: Array<{ type: NodeType; properties: Record<string, any> }>): Promise<Node[]> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();
      
      // Flatten properties for each node
      const nodesWithIds = nodes.map(n => ({
        id: `${n.type}-${++this.nodeCounter}-${Date.now()}`,
        type: n.type,
        created: now,
        updated: now,
        ...flattenForMCP(n.properties || {})  // Spread flattened properties at top level
      }));

      const result = await session.run(
        `
        UNWIND $nodes as node
        CREATE (n:Node)
        SET n = node
        RETURN n { .*, embedding: null }
        `,
        { nodes: nodesWithIds }
      );

      return result.records.map(r => this.nodeFromRecord(r.get('n')));
    } finally {
      await session.close();
    }
  }

  async updateNodes(updates: Array<{ id: string; properties: Partial<Record<string, any>> }>): Promise<Node[]> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();

      // Add updated timestamp to each update
      const updatesWithTimestamp = updates.map(u => ({
        id: u.id,
        properties: { ...flattenForMCP(u.properties || {}), updated: now }
      }));

      const result = await session.run(
        `
        UNWIND $updates as update
        MATCH (n:Node {id: update.id})
        SET n += update.properties
        RETURN n { .*, embedding: null }
        `,
        { updates: updatesWithTimestamp }
      );

      return result.records.map(r => this.nodeFromRecord(r.get('n')));
    } finally {
      await session.close();
    }
  }

  async deleteNodes(ids: string[]): Promise<BatchDeleteResult> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        UNWIND $ids as id
        MATCH (n:Node {id: id})
        DETACH DELETE n
        RETURN count(n) as deleted
        `,
        { ids }
      );

      const deleted = result.records[0]?.get('deleted').toNumber() || 0;

      return {
        deleted,
        errors: []  // Neo4j handles missing nodes gracefully
      };
    } finally {
      await session.close();
    }
  }

  async addEdges(edges: Array<{
    source: string;
    target: string;
    type: EdgeType;
    properties?: Record<string, any>;
  }>): Promise<Edge[]> {
    const session = this.driver.session();
    try {
      const now = new Date().toISOString();
      const edgesWithIds = edges.map(e => ({
        id: `edge-${++this.edgeCounter}-${Date.now()}`,
        source: e.source,
        target: e.target,
        type: e.type,
        properties: flattenForMCP(e.properties || {}),
        created: now
      }));

      const result = await session.run(
        `
        UNWIND $edges as edge
        MATCH (s:Node {id: edge.source})
        MATCH (t:Node {id: edge.target})
        CREATE (s)-[e:EDGE {
          id: edge.id,
          type: edge.type,
          properties: edge.properties,
          created: edge.created
        }]->(t)
        RETURN e, edge.source as source, edge.target as target
        `,
        { edges: edgesWithIds }
      );

      return result.records.map(r => 
        this.edgeFromRecord(r.get('e'), r.get('source'), r.get('target'))
      );
    } finally {
      await session.close();
    }
  }

  async deleteEdges(edgeIds: string[]): Promise<BatchDeleteResult> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        UNWIND $edgeIds as edgeId
        MATCH ()-[e:EDGE {id: edgeId}]->()
        DELETE e
        RETURN count(e) as deleted
        `,
        { edgeIds }
      );

      const deleted = result.records[0]?.get('deleted').toNumber() || 0;

      return {
        deleted,
        errors: []
      };
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // SEARCH & QUERY
  // ============================================================================

  async queryNodes(type?: NodeType, filters?: Record<string, any>): Promise<Node[]> {
    const session = this.driver.session();
    try {
      let query = 'MATCH (n)';
      const params: any = {};

      if (type) {
        // Match both the label (case-insensitive) and the type property
        // This handles both unified nodes (Node label + type property) and direct labeled nodes (File, WatchConfig, etc.)
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
        query += ` WHERE (n.type = $type OR $capitalizedType IN labels(n))`;
        params.type = type;
        params.capitalizedType = capitalizedType;
      }

      if (filters && Object.keys(filters).length > 0) {
        const filterConditions = Object.entries(filters).map(([key, value], i) => {
          params[`filter${i}`] = value;
          return `(n.${key} = $filter${i} OR n.properties.${key} = $filter${i})`;
        });

        query += type ? ' AND ' : ' WHERE ';
        query += filterConditions.join(' AND ');
      }

      // Strip large content at query level: exclude embedding, conditionally strip content
      query += ` RETURN n {
        .*, 
        embedding: null,
        content: CASE 
          WHEN size(coalesce(n.content, '')) > 1000 
          THEN null 
          ELSE n.content 
        END,
        _contentStripped: CASE 
          WHEN size(coalesce(n.content, '')) > 1000 
          THEN true 
          ELSE null 
        END,
        _contentLength: CASE 
          WHEN size(coalesce(n.content, '')) > 1000 
          THEN size(n.content) 
          ELSE null 
        END
      } as n`;

      const result = await session.run(query, params);
      return result.records.map(r => this.nodeFromRecord(r.get('n'), undefined, false));
    } finally {
      await session.close();
    }
  }

  async searchNodes(query: string, options: SearchOptions = {}): Promise<Node[]> {
    const session = this.driver.session();
    try {
      const limit = options.limit || 100;
      const offset = options.offset || 0;

      // Search across string properties only to avoid type errors with arrays
      // This searches: path, language, content, name, description, status, priority, etc.
      const result = await session.run(
        `
        MATCH (n)
        WHERE (
          (n.path IS NOT NULL AND toLower(n.path) CONTAINS toLower($query)) OR
          (n.language IS NOT NULL AND toLower(n.language) CONTAINS toLower($query)) OR
          (n.content IS NOT NULL AND toLower(n.content) CONTAINS toLower($query)) OR
          (n.name IS NOT NULL AND toLower(n.name) CONTAINS toLower($query)) OR
          (n.description IS NOT NULL AND toLower(n.description) CONTAINS toLower($query)) OR
          (n.status IS NOT NULL AND toLower(n.status) CONTAINS toLower($query)) OR
          (n.priority IS NOT NULL AND toLower(n.priority) CONTAINS toLower($query)) OR
          (n.type IS NOT NULL AND toLower(n.type) CONTAINS toLower($query))
        )
        ${options.types && options.types.length > 0 ? `AND (n.type IN $types OR ANY(t IN $types WHERE (toUpper(left(t, 1)) + substring(t, 1)) IN labels(n)))` : ''}
        WITH n
        RETURN n {
          .*, 
          embedding: null,
          content: CASE 
            WHEN size(coalesce(n.content, '')) > 1000 
            THEN null 
            ELSE n.content 
          END,
          _contentStripped: CASE 
            WHEN size(coalesce(n.content, '')) > 1000 
            THEN true 
            ELSE null 
          END,
          _contentLength: CASE 
            WHEN size(coalesce(n.content, '')) > 1000 
            THEN size(n.content) 
            ELSE null 
          END,
          relevantLines: CASE
            WHEN size(coalesce(n.content, '')) > 1000 AND n.content IS NOT NULL
            THEN [line IN split(n.content, '\\n') WHERE toLower(line) CONTAINS toLower($query) | line][0..10]
            ELSE null
          END
        } as n
        SKIP $offset
        LIMIT $limit
        `,
        { 
          query, 
          types: options.types || [], 
          offset: neo4j.int(offset), 
          limit: neo4j.int(limit) 
        }
      );

      return result.records.map(r => this.nodeFromRecord(r.get('n'), undefined, false));
    } finally {
      await session.close();
    }
  }

  async getEdges(nodeId: string, direction: 'in' | 'out' | 'both' = 'both'): Promise<Edge[]> {
    const session = this.driver.session();
    try {
      let query = '';
      
      if (direction === 'out') {
        query = 'MATCH (n:Node {id: $nodeId})-[e:EDGE]->(t:Node) RETURN e, n.id as source, t.id as target';
      } else if (direction === 'in') {
        query = 'MATCH (s:Node)-[e:EDGE]->(n:Node {id: $nodeId}) RETURN e, s.id as source, n.id as target';
      } else {
        query = 'MATCH (n:Node {id: $nodeId})-[e:EDGE]-(o:Node) RETURN e, n.id as source, o.id as target';
      }

      const result = await session.run(query, { nodeId });
      return result.records.map(r => 
        this.edgeFromRecord(r.get('e'), r.get('source'), r.get('target'))
      );
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // GRAPH OPERATIONS
  // ============================================================================

  async getNeighbors(nodeId: string, edgeType?: EdgeType, depth: number = 1): Promise<Node[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (start:Node {id: $nodeId})-[e:EDGE*1..${depth}]-(neighbor:Node)
        ${edgeType ? 'WHERE ALL(rel IN e WHERE rel.type = $edgeType)' : ''}
        RETURN DISTINCT neighbor {
          .*, 
          embedding: null,
          content: CASE 
            WHEN size(coalesce(neighbor.content, '')) > 1000 
            THEN null 
            ELSE neighbor.content 
          END,
          _contentStripped: CASE 
            WHEN size(coalesce(neighbor.content, '')) > 1000 
            THEN true 
            ELSE null 
          END,
          _contentLength: CASE 
            WHEN size(coalesce(neighbor.content, '')) > 1000 
            THEN size(neighbor.content) 
            ELSE null 
          END
        } as neighbor
        `,
        { nodeId, edgeType }
      );

      return result.records.map(r => this.nodeFromRecord(r.get('neighbor'), undefined, false));
    } finally {
      await session.close();
    }
  }

  async getSubgraph(nodeId: string, depth: number = 2): Promise<Subgraph> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH path = (start:Node {id: $nodeId})-[e:EDGE*0..${depth}]-(connected:Node)
        WITH nodes(path) as pathNodes, relationships(path) as pathEdges
        UNWIND pathNodes as node
        WITH collect(DISTINCT node {
          .*, 
          embedding: null,
          content: CASE 
            WHEN size(coalesce(node.content, '')) > 1000 
            THEN null 
            ELSE node.content 
          END,
          _contentStripped: CASE 
            WHEN size(coalesce(node.content, '')) > 1000 
            THEN true 
            ELSE null 
          END,
          _contentLength: CASE 
            WHEN size(coalesce(node.content, '')) > 1000 
            THEN size(node.content) 
            ELSE null 
          END
        }) as allNodes, pathEdges
        UNWIND pathEdges as edge
        WITH allNodes, collect(DISTINCT edge) as allEdges
        RETURN allNodes, allEdges
        `,
        { nodeId }
      );

      if (result.records.length === 0) {
        return { nodes: [], edges: [] };
      }

      const record = result.records[0];
      const nodes = record.get('allNodes').map((n: any) => this.nodeFromRecord(n, undefined, false));
      const edges = record.get('allEdges').map((e: any) => 
        this.edgeFromRecord(e, e.start, e.end)
      );

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  async getStats(): Promise<GraphStats> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (n:Node)
        RETURN count(n) as nodeCount, 
               collect(DISTINCT n.type) as types
      `);

      const edgeResult = await session.run(`
        MATCH ()-[e:EDGE]->()
        RETURN count(e) as edgeCount
      `);

      const nodeCount = result.records[0]?.get('nodeCount').toNumber() || 0;
      const edgeCount = edgeResult.records[0]?.get('edgeCount').toNumber() || 0;
      const types = result.records[0]?.get('types') || [];

      // Get count per type
      const typeCountResult = await session.run(`
        MATCH (n:Node)
        RETURN n.type as type, count(n) as count
      `);

      const typeCounts: Record<string, number> = {};
      typeCountResult.records.forEach(r => {
        typeCounts[r.get('type')] = r.get('count').toNumber();
      });

      return {
        nodeCount,
        edgeCount,
        types: typeCounts
      };
    } finally {
      await session.close();
    }
  }

  async clear(type?: ClearType): Promise<{ deletedNodes: number; deletedEdges: number }> {
    const session = this.driver.session();
    try {
      // Safety: prevent accidental full-database clears during automated tests unless explicitly allowed.
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || !!(globalThis as any).vitest;
      const allowClearInTest = process.env.ALLOW_CLEAR_ALL_IN_TEST === 'true';
      if (isTestEnv && type === 'ALL' && !allowClearInTest) {
        console.warn('⚠️  Skipping clear(\'ALL\') in test environment to avoid wiping real database. Set ALLOW_CLEAR_ALL_IN_TEST=true to override.');
        return { deletedNodes: 0, deletedEdges: 0 };
      }
      let query: string;
      let params: any = {};
      
      if (type === 'ALL') {
        // Clear ALL data - explicit "ALL" required for safety
        query = `
          MATCH (n)
          OPTIONAL MATCH (n)-[r]-()
          WITH count(DISTINCT n) as nodeCount, count(DISTINCT r) as edgeCount
          MATCH (n)
          DETACH DELETE n
          RETURN nodeCount as deletedNodes, edgeCount as deletedEdges
        `;
        const result = await session.run(query, params);
        const deletedNodes = result.records[0]?.get('deletedNodes').toNumber() || 0;
        const deletedEdges = result.records[0]?.get('deletedEdges').toNumber() || 0;
        
        // Reset counters
        this.nodeCounter = 0;
        this.edgeCounter = 0;
        
        console.log(`✅ Cleared ALL data from graph: ${deletedNodes} nodes, ${deletedEdges} edges`);
        return { deletedNodes, deletedEdges };
      } else if (type) {
        // Clear specific type (check both n.type property and Neo4j labels)
        const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
        query = `
          MATCH (n)
          WHERE (n.type = $type OR $capitalizedType IN labels(n))
          WITH n, COUNT { (n)-[]-() } as edgeCount
          DETACH DELETE n
          RETURN count(n) as deletedNodes, sum(edgeCount) as deletedEdges
        `;
        params = { type, capitalizedType };
        
        const result = await session.run(query, params);
        const deletedNodes = result.records[0]?.get('deletedNodes').toNumber() || 0;
        const deletedEdges = result.records[0]?.get('deletedEdges').toNumber() || 0;
        
        console.log(`✅ Cleared ${deletedNodes} nodes of type '${type}' and ${deletedEdges} edges`);
        return { deletedNodes, deletedEdges };
      } else {
        // No type provided - return zero (safety default)
        console.log(`⚠️  No type provided to clear(). Use clear('ALL') to clear entire graph.`);
        return { deletedNodes: 0, deletedEdges: 0 };
      }
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Convert Neo4j record to Node object
   * Content stripping is now handled at the Neo4j query level for efficiency
   * Handles both node objects (with .properties) and map projections (plain objects)
   */
  private nodeFromRecord(record: any, searchQuery?: string, stripContent: boolean = true): Node {
    // Handle map projection (plain object) vs node object (with .properties)
    const props = record.properties || record;
    
    // Extract system properties
    const { id, type, created, updated, ...userProperties } = props;
    
    // Note: embedding is already stripped at the database level in all queries
    // Keep metadata about embeddings (has_embedding, embedding_dimensions, embedding_model)
    
    return {
      id,
      type,
      properties: userProperties,  // All other properties (content already stripped at query level if needed)
      created,
      updated
    };
  }

  private edgeFromRecord(record: any, source: string, target: string): Edge {
    const props = record.properties;
    
    // Extract system properties and treat the rest as user properties
    const { id, type, created, ...userProperties } = props;
    
    return {
      id,
      source,
      target,
      type,
      properties: userProperties,
      created
    };
  }

  // ========================================================================
  // MULTI-AGENT LOCKING
  // ========================================================================

  /**
   * Acquire exclusive lock on a node (typically a TODO) for multi-agent coordination
   * Uses optimistic locking with automatic expiry
   * 
   * @param nodeId - Node ID to lock
   * @param agentId - Agent claiming the lock
   * @param timeoutMs - Lock expiry in milliseconds (default 300000 = 5 min)
   * @returns true if lock acquired, false if already locked by another agent
   */
  async lockNode(nodeId: string, agentId: string, timeoutMs: number = 300000): Promise<boolean> {
    const session = this.driver.session();
    try {
      const now = new Date();
      const lockExpiresAt = new Date(now.getTime() + timeoutMs);

      // Try to acquire lock using conditional update
      const result = await session.run(
        `
        MATCH (n:Node {id: $nodeId})
        WHERE n.lockedBy IS NULL 
          OR n.lockedBy = $agentId 
          OR (n.lockExpiresAt IS NOT NULL AND n.lockExpiresAt < $now)
        SET n.lockedBy = $agentId,
            n.lockedAt = $now,
            n.lockExpiresAt = $lockExpiresAt,
            n.version = COALESCE(n.version, 0) + 1
        RETURN n { .*, embedding: null }
        `,
        {
          nodeId,
          agentId,
          now: now.toISOString(),
          lockExpiresAt: lockExpiresAt.toISOString()
        }
      );

      // If no records returned, lock was held by another agent
      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Release lock on a node
   * 
   * @param nodeId - Node ID to unlock
   * @param agentId - Agent releasing the lock (must match lock owner)
   * @returns true if lock released, false if not locked or locked by different agent
   */
  async unlockNode(nodeId: string, agentId: string): Promise<boolean> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (n:Node {id: $nodeId})
        WHERE n.lockedBy = $agentId
        REMOVE n.lockedBy, n.lockedAt, n.lockExpiresAt
        RETURN n { .*, embedding: null }
        `,
        { nodeId, agentId }
      );

      return result.records.length > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Query nodes filtered by lock status
   * 
   * @param type - Optional node type filter
   * @param filters - Additional property filters
   * @param includeAvailableOnly - If true, only return unlocked or expired-lock nodes
   * @returns Array of nodes
   */
  async queryNodesWithLockStatus(
    type?: NodeType,
    filters?: Record<string, any>,
    includeAvailableOnly?: boolean
  ): Promise<Node[]> {
    const session = this.driver.session();
    try {
      let cypher = 'MATCH (n:Node)';
      const params: any = {};

      // Type filter
      if (type) {
        cypher += ' WHERE n.type = $type';
        params.type = type;
      }

      // Property filters
      if (filters && Object.keys(filters).length > 0) {
        const whereClause = type ? ' AND ' : ' WHERE ';
        const conditions = Object.entries(filters).map(([key, value], index) => {
          params[`filter_${index}`] = value;
          return `n.${key} = $filter_${index}`;
        });
        cypher += whereClause + conditions.join(' AND ');
      }

      // Lock status filter
      if (includeAvailableOnly) {
        const lockClause = (type || filters) ? ' AND ' : ' WHERE ';
        cypher += lockClause + `(n.lockedBy IS NULL OR (n.lockExpiresAt IS NOT NULL AND n.lockExpiresAt < $now))`;
        params.now = new Date().toISOString();
      }

      // Strip large content at query level
      cypher += ` RETURN n {
        .*, 
        embedding: null,
        content: CASE 
          WHEN size(coalesce(n.content, '')) > 1000 
          THEN null 
          ELSE n.content 
        END,
        _contentStripped: CASE 
          WHEN size(coalesce(n.content, '')) > 1000 
          THEN true 
          ELSE null 
        END,
        _contentLength: CASE 
          WHEN size(coalesce(n.content, '')) > 1000 
          THEN size(n.content) 
          ELSE null 
        END
      } as n`;

      const result = await session.run(cypher, params);
      return result.records.map(record => this.nodeFromRecord(record.get('n'), undefined, false));
    } finally {
      await session.close();
    }
  }

  /**
   * Clean up expired locks across all nodes
   * Should be called periodically by the server
   * 
   * @returns Number of locks cleaned up
   */
  async cleanupExpiredLocks(): Promise<number> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (n:Node)
        WHERE n.lockedBy IS NOT NULL 
          AND n.lockExpiresAt IS NOT NULL 
          AND n.lockExpiresAt < $now
        REMOVE n.lockedBy, n.lockExpiresAt
        RETURN count(n) as cleaned
        `,
        { now: new Date().toISOString() }
      );

      return result.records[0]?.get('cleaned').toNumber() || 0;
    } finally {
      await session.close();
    }
  }

}
