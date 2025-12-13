/**
 * @module managers/GraphManager
 * @description Core graph database manager for Neo4j operations
 */

import neo4j, { Driver } from 'neo4j-driver';
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
import { UnifiedSearchService } from './UnifiedSearchService.js';
import { flattenForMCP } from '../tools/mcp/flattenForMCP.js';
import { LLMConfigLoader } from '../config/LLMConfigLoader.js';

/**
 * GraphManager - Core interface to Neo4j graph database
 * 
 * @description Provides high-level interface for all graph database operations
 * including CRUD for nodes and edges, search, transactions, and schema management.
 * Automatically handles vector embeddings for semantic search and supports
 * multi-agent coordination with optimistic locking.
 * 
 * Features:
 * - Unified node model (all nodes use Node label)
 * - Automatic embedding generation for semantic search
 * - Hybrid search (vector + BM25 full-text)
 * - Optimistic locking for concurrent access
 * - Batch operations for performance
 * - Graph traversal and subgraph extraction
 * 
 * @example
 * ```typescript
 * // Create and initialize
 * const manager = new GraphManager(
 *   'bolt://localhost:7687',
 *   'neo4j',
 *   'password'
 * );
 * await manager.initialize();
 * ```
 * 
 * @example
 * ```typescript
 * // Add a node with automatic embeddings
 * const node = await manager.addNode('memory', {
 *   title: 'Important Decision',
 *   content: 'We decided to use PostgreSQL for better ACID compliance'
 * });
 * ```
 * 
 * @example
 * ```typescript
 * // Search by meaning (semantic search)
 * const results = await manager.searchNodes('database decisions', {
 *   limit: 10,
 *   types: ['memory']
 * });
 * ```
 */
export class GraphManager implements IGraphManager {
  private driver: Driver;
  private nodeCounter = 0;
  private edgeCounter = 0;
  private embeddingsService: EmbeddingsService | null = null;
  private unifiedSearchService: UnifiedSearchService;
  private isNornicDB: boolean = false;
  private providerDetected: boolean = false;

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
    
    // Note: Embeddings service initialization deferred until after provider detection
    // This happens in initialize() to avoid wasting resources on NornicDB connections
    
    // Initialize unified search service
    this.unifiedSearchService = new UnifiedSearchService(this.driver);
    this.unifiedSearchService.initialize().catch(err => {
      console.warn('⚠️  Failed to initialize unified search service:', err.message);
    });
  }

  /**
   * Get the Neo4j driver instance for direct database access
   * 
   * Use this when you need to execute custom Cypher queries or manage
   * transactions that aren't covered by the GraphManager API.
   * 
   * @returns Neo4j driver instance
   * 
   * @example
   * // Execute custom Cypher query
   * const driver = graphManager.getDriver();
   * const session = driver.session();
   * try {
   *   const result = await session.run(
   *     'MATCH (n:Node) WHERE n.created > $date RETURN count(n)',
   *     { date: '2024-01-01' }
   *   );
   *   console.log('Nodes created:', result.records[0].get(0));
   * } finally {
   *   await session.close();
   * }
   * 
   * @example
   * // Create custom transaction
   * const driver = graphManager.getDriver();
   * const session = driver.session();
   * const tx = session.beginTransaction();
   * try {
   *   await tx.run('CREATE (n:CustomNode {id: $id})', { id: 'custom-1' });
   *   await tx.run('CREATE (n:CustomNode {id: $id})', { id: 'custom-2' });
   *   await tx.commit();
   * } catch (error) {
   *   await tx.rollback();
   *   throw error;
   * } finally {
   *   await session.close();
   * }
   */
  getDriver(): Driver {
    return this.driver;
  }

  /**
   * Check if connected to NornicDB (vs Neo4j)
   * 
   * Both NornicDB and Neo4j return cosine similarity (0-1 range) from
   * db.index.vector.queryNodes. NornicDB additionally supports server-side
   * embedding generation, allowing string queries without client-side embeddings.
   * 
   * @returns true if connected to NornicDB, false for Neo4j
   */
  getIsNornicDB(): boolean {
    return this.isNornicDB;
  }

  /**
   * Detect whether we're connected to NornicDB or Neo4j
   * 
   * Uses multiple detection methods in priority order:
   * 1. Manual override via MIMIR_DATABASE_PROVIDER env var
   * 2. Server metadata/version string detection
   * 3. Presence of NornicDB-specific procedures
   * 
   * @private
   * @returns Promise that resolves when detection is complete
   */
  private async detectDatabaseProvider(): Promise<void> {
    // Method 1: Check for manual override
    const manualProvider = process.env.MIMIR_DATABASE_PROVIDER?.toLowerCase();
    if (manualProvider === 'nornicdb') {
      console.log('🔧 Database provider manually set to NornicDB via MIMIR_DATABASE_PROVIDER');
      this.isNornicDB = true;
      return;
    } else if (manualProvider === 'neo4j') {
      console.log('🔧 Database provider manually set to Neo4j via MIMIR_DATABASE_PROVIDER');
      this.isNornicDB = false;
      return;
    }

    // Method 2: Auto-detect via server metadata
    const session = this.driver.session();
    try {
      // Execute a simple query and check server metadata
      const result = await session.run('RETURN 1 as test');
      const summary = result.summary;
      
      // Check server agent string
      const serverInfo = summary.server;
      const serverAgent = serverInfo?.agent || '';
      const serverVersion = serverInfo?.protocolVersion?.toString() || '';
      
      // NornicDB identifies itself in the server agent
      if (serverAgent.toLowerCase().includes('nornicdb')) {
        console.log(`🗄️  Detected NornicDB (${serverAgent})`);
        this.isNornicDB = true;
        return;
      }
      
      // Neo4j standard identification
      if (serverAgent.toLowerCase().includes('neo4j')) {
        console.log(`🗄️  Detected Neo4j (${serverAgent})`);
        this.isNornicDB = false;
        return;
      }
      
      // Fallback: assume Neo4j if we can't detect NornicDB
      console.log(`🗄️  Unable to detect database provider, defaulting to Neo4j (agent: ${serverAgent})`);
      this.isNornicDB = false;
      
    } catch (error: any) {
      console.warn(`⚠️  Database provider detection failed: ${error.message}`);
      console.log('🗄️  Defaulting to Neo4j');
      this.isNornicDB = false;
    } finally {
      await session.close();
    }
  }

  /**
   * Initialize database schema: create indexes, constraints, and vector indexes
   * 
   * This method sets up the Neo4j database with all necessary indexes and constraints
   * for optimal performance. It's idempotent and safe to call multiple times.
   * 
   * Creates:
   * - Unique constraint on node IDs
   * - Full-text search indexes
   * - Vector indexes for semantic search
   * - File indexing schema
   * - Type indexes for fast filtering
   * 
   * @returns Promise that resolves when initialization is complete
   * @throws {Error} If database connection fails or schema creation fails
   * 
   * @example
   * // Initialize on server startup
   * const graphManager = new GraphManager(
   *   'bolt://localhost:7687',
   *   'neo4j',
   *   'password'
   * );
   * await graphManager.initialize();
   * console.log('Database schema initialized');
   * 
   * @example
   * // Initialize with error handling
   * try {
   *   await graphManager.initialize();
   *   console.log('✅ Database ready');
   * } catch (error) {
   *   console.error('Failed to initialize database:', error);
   *   process.exit(1);
   * }
   * 
   * @example
   * // Safe to call multiple times (idempotent)
   * await graphManager.initialize(); // First call creates schema
   * await graphManager.initialize(); // Second call is no-op
   * await graphManager.initialize(); // Still safe
   */
  async initialize(): Promise<void> {
    const session = this.driver.session();
    try {
      // Detect database provider (NornicDB vs Neo4j) on first initialization
      if (!this.providerDetected) {
        await this.detectDatabaseProvider();
        this.providerDetected = true;
        
        // Initialize embeddings service only if NOT using NornicDB
        if (!this.isNornicDB) {
          this.embeddingsService = new EmbeddingsService();
          await this.embeddingsService.initialize().catch(err => {
            console.warn('⚠️  Failed to initialize embeddings service:', err.message);
            this.embeddingsService = null;
          });
        } else {
          console.log('🗄️  NornicDB detected - embeddings will be handled by database');
        }
      }
      
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

      // Vector index for semantic search - dimensions from config
      // Get dimensions from embeddings config (default: 768 for nomic-embed-text)
      const configLoader = LLMConfigLoader.getInstance();
      const embeddingsConfig = await configLoader.getEmbeddingsConfig();
      const dimensions = embeddingsConfig?.dimensions || 768;
      
      console.log(`🔧 Creating vector index with ${dimensions} dimensions`);
      
      await session.run(`
        CREATE VECTOR INDEX node_embedding_index IF NOT EXISTS
        FOR (n:Node) ON (n.embedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: ${dimensions},
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
    
    // Priority fields first
    if (properties.title && typeof properties.title === 'string') {
      parts.push(`Title: ${properties.title}`);
    }
    if (properties.name && typeof properties.name === 'string') {
      parts.push(`Name: ${properties.name}`);
    }
    if (properties.description && typeof properties.description === 'string') {
      parts.push(`Description: ${properties.description}`);
    }
    if (properties.content && typeof properties.content === 'string') {
      parts.push(`Content: ${properties.content}`);
    }
    
    // Now include ALL other properties (stringified)
    const systemFields = new Set(['id', 'type', 'created', 'updated', 'title', 'name', 'description', 'content', 
                                   'embedding', 'embedding_dimensions', 'embedding_model', 'has_embedding']);
    
    for (const [key, value] of Object.entries(properties)) {
      // Skip system fields and already-included fields
      if (systemFields.has(key)) {
        continue;
      }
      
      // Skip null/undefined
      if (value === null || value === undefined) {
        continue;
      }
      
      // Stringify the value
      let stringValue: string;
      if (typeof value === 'string') {
        stringValue = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        stringValue = String(value);
      } else if (Array.isArray(value)) {
        stringValue = value.join(', ');
      } else if (typeof value === 'object') {
        try {
          stringValue = JSON.stringify(value);
        } catch {
          stringValue = String(value);
        }
      } else {
        stringValue = String(value);
      }
      
      if (stringValue.trim().length > 0) {
        parts.push(`${key}: ${stringValue}`);
      }
    }
    
    return parts.join('\n');
  }

  /**
   * Creates chunks for a node if content is large enough to warrant chunking
   * Returns chunk data or null if content is small enough for a single embedding
   */
  private async createNodeChunks(
    nodeId: string, 
    textContent: string, 
    session: any
  ): Promise<{ chunkCount: number; totalChars: number } | null> {
    const chunkSize = parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_SIZE || '768', 10);
    
    // If content is small, don't chunk - return null to signal single embedding
    if (textContent.length <= chunkSize) {
      return null;
    }
    
    console.log(`📦 Creating chunks for node ${nodeId} (${textContent.length} chars)...`);
    
    try {
      // Generate chunk embeddings
      const chunks = await this.embeddingsService!.generateChunkEmbeddings(textContent);
      
      // Create chunk nodes and relationships
      for (const chunk of chunks) {
        const chunkId = `chunk-${nodeId}-${chunk.chunkIndex}`;
        
        await session.run(
          `
          MATCH (n:Node {id: $nodeId})
          MERGE (c:NodeChunk:Node {id: $chunkId})
          ON CREATE SET
            c.chunk_index = $chunkIndex,
            c.text = $text,
            c.start_offset = $startOffset,
            c.end_offset = $endOffset,
            c.embedding = $embedding,
            c.embedding_dimensions = $dimensions,
            c.embedding_model = $model,
            c.type = 'node_chunk',
            c.indexed_date = datetime(),
            c.parentNodeId = $nodeId,
            c.has_embedding = true
          ON MATCH SET
            c.chunk_index = $chunkIndex,
            c.text = $text,
            c.start_offset = $startOffset,
            c.end_offset = $endOffset,
            c.embedding = $embedding,
            c.embedding_dimensions = $dimensions,
            c.embedding_model = $model,
            c.indexed_date = datetime()
          MERGE (n)-[:HAS_CHUNK {index: $chunkIndex}]->(c)
          RETURN c.id AS chunk_id
          `,
          {
            nodeId,
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
      
      console.log(`✅ Created ${chunks.length} chunks for node ${nodeId}`);
      return { chunkCount: chunks.length, totalChars: textContent.length };
    } catch (error: any) {
      console.error(`⚠️  Failed to create chunks for node ${nodeId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add a new node to the knowledge graph with automatic embedding generation
   * 
   * Creates a node with the specified type and properties. Automatically generates
   * vector embeddings from text content (title, description, content fields) for
   * semantic search. Supports chunking for large content (>768 chars by default).
   * 
   * @param type - Node type (todo, file, concept, memory, etc.) or properties object
   * @param properties - Node properties (title, description, content, status, etc.)
   * @returns Created node with generated ID and embeddings
   * @throws {Error} If node creation fails
   * 
   * @example
   * // Create a TODO task
   * const todo = await graphManager.addNode('todo', {
   *   title: 'Implement user authentication',
   *   description: 'Add JWT-based auth with refresh tokens and role-based access',
   *   status: 'pending',
   *   priority: 'high',
   *   assignee: 'worker-agent-1'
   * });
   * console.log('Created:', todo.id); // 'todo-1-1732456789'
   * console.log('Has embedding:', todo.properties.has_embedding); // true
   * 
   * @example
   * // Create a memory node with automatic embedding
   * const memory = await graphManager.addNode('memory', {
   *   title: 'API Design Pattern',
   *   content: 'Use RESTful conventions with versioned endpoints (/v1/users). ' +
   *            'Always return consistent error formats with status codes.',
   *   tags: ['api', 'architecture', 'best-practices'],
   *   source: 'team-discussion',
   *   confidence: 0.95
   * });
   * // Embedding generated from title + content for semantic search
   * 
   * @example
   * // Create a file node during indexing
   * const file = await graphManager.addNode('file', {
   *   path: '/src/auth/login.ts',
   *   name: 'login.ts',
   *   language: 'typescript',
   *   size: 2048,
   *   lines: 87,
   *   lastModified: new Date().toISOString(),
   *   content: '// File content here...'
   * });
   * // Large files automatically chunked for embeddings
   * 
   * @example
   * // Create concept node for knowledge graph
   * const concept = await graphManager.addNode('concept', {
   *   title: 'Microservices Architecture',
   *   description: 'Architectural pattern where application is composed of small, ' +
   *                'independent services that communicate via APIs',
   *   category: 'architecture',
   *   related_concepts: ['API Gateway', 'Service Discovery', 'Event-Driven']
   * });
   * 
   * @example
   * // Flexible API: pass properties as first argument
   * const node = await graphManager.addNode({
   *   type: 'memory',
   *   title: 'Quick note',
   *   content: 'Remember to update docs'
   * });
   */
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

      // Flatten properties into the node (Neo4j doesn't support nested objects)
      const flattenedProps = flattenForMCP(actualProperties || {});
      const nodeProps = {
        id,
        type: actualType,
        created: now,
        updated: now,
        ...flattenedProps,
        has_embedding: false  // Will be updated after embedding generation
      };

      // Create the node first
      // Note: Using simple RETURN n instead of map projection for NornicDB compatibility
      const createResult = await session.run(
        'CREATE (n:Node $props) RETURN n',
        { props: nodeProps }
      );

      // Now generate embeddings if enabled and not already provided
      // Skip embedding generation for NornicDB (database handles it natively)
      const hasExistingEmbedding = actualProperties.embedding || actualProperties.has_embedding === true;
      
      if (!this.isNornicDB && this.embeddingsService && !hasExistingEmbedding) {
        // Ensure embeddings service is initialized
        if (!this.embeddingsService.isEnabled()) {
          await this.embeddingsService.initialize();
        }
        
        if (this.embeddingsService.isEnabled()) {
          // Extract text content for embedding generation
          const textContent = this.extractTextContent(actualProperties);
          
          if (textContent && textContent.trim().length > 0) {
            const chunkSize = parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_SIZE || '768', 10);
            
            try {
              // Check if content needs chunking
              if (textContent.length > chunkSize) {
                // Large content - use chunking
                console.log(`📦 Node ${id} has large content (${textContent.length} chars), creating chunks...`);
                await this.createNodeChunks(id, textContent, session);
                
                // Update node to mark it has chunks (no single embedding on parent node)
                await session.run(
                  `MATCH (n:Node {id: $id}) SET n.has_embedding = true, n.has_chunks = true`,
                  { id }
                );
              } else {
                // Small content - single embedding
                const result = await this.embeddingsService.generateEmbedding(textContent);
                await session.run(
                  `MATCH (n:Node {id: $id}) 
                   SET n.embedding = $embedding,
                       n.embedding_dimensions = $dimensions,
                       n.embedding_model = $model,
                       n.has_embedding = true`,
                  {
                    id,
                    embedding: result.embedding,
                    dimensions: result.dimensions,
                    model: result.model
                  }
                );
                console.log(`✅ Generated single embedding for ${actualType} node: ${id} (${result.dimensions} dimensions)`);
              }
            } catch (error: any) {
              console.error(`⚠️  Failed to generate embedding for ${actualType} node: ${error.message}`);
            }
          }
        }
      }

      // Return the created node
      return this.nodeFromRecord(createResult.records[0].get('n'), undefined, false);
    } finally {
      await session.close();
    }
  }

  /**
   * Retrieve a node by its ID with full properties
   * 
   * Fetches a single node from the graph database. Returns null if not found.
   * Includes all properties except embedding vectors (for performance).
   * 
   * @param id - Unique node identifier
   * @returns Node object with all properties, or null if not found
   * 
   * @example
   * // Get a TODO by ID
   * const todo = await graphManager.getNode('todo-1-1732456789');
   * if (todo) {
   *   console.log('Title:', todo.properties.title);
   *   console.log('Status:', todo.properties.status);
   *   console.log('Created:', todo.properties.created);
   * } else {
   *   console.log('TODO not found');
   * }
   * 
   * @example
   * // Check if node exists before updating
   * const existing = await graphManager.getNode('memory-123');
   * if (!existing) {
   *   throw new Error('Memory node not found');
   * }
   * await graphManager.updateNode('memory-123', { 
   *   content: 'Updated content' 
   * });
   * 
   * @example
   * // Get file node and check metadata
   * const file = await graphManager.getNode('file-src-auth-login-ts');
   * if (file && file.properties.lastModified) {
   *   const lastMod = new Date(file.properties.lastModified);
   *   const hoursSinceUpdate = (Date.now() - lastMod.getTime()) / (1000 * 60 * 60);
   *   console.log(`File last modified ${hoursSinceUpdate.toFixed(1)} hours ago`);
   * }
   */
  async getNode(id: string): Promise<Node | null> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        'MATCH (n:Node {id: $id}) RETURN n',
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

  /**
   * Update an existing node's properties with automatic embedding regeneration
   * 
   * Merges new properties into existing node. Automatically regenerates embeddings
   * if content-related fields (content, title, description) are modified.
   * Updates the 'updated' timestamp automatically.
   * 
   * @param id - Node ID to update
   * @param properties - Properties to update (partial update, merges with existing)
   * @returns Updated node with new properties
   * @throws {Error} If node not found or update fails
   * 
   * @example
   * // Update TODO status
   * const updated = await graphManager.updateNode('todo-1-1732456789', {
   *   status: 'in_progress',
   *   assignee: 'worker-agent-2',
   *   started_at: new Date().toISOString()
   * });
   * console.log('Status changed to:', updated.properties.status);
   * 
   * @example
   * // Update memory content (triggers embedding regeneration)
   * const memory = await graphManager.updateNode('memory-123', {
   *   content: 'Updated API design: Use GraphQL instead of REST for complex queries',
   *   confidence: 0.98,
   *   last_verified: new Date().toISOString()
   * });
   * // Embedding automatically regenerated from new content
   * 
   * @example
   * // Add metadata without changing content
   * await graphManager.updateNode('file-src-utils-ts', {
   *   lastAccessed: new Date().toISOString(),
   *   accessCount: 42,
   *   tags: ['utility', 'helper', 'core']
   * });
   * // No embedding regeneration (content unchanged)
   * 
   * @example
   * // Partial update - only specified fields change
   * const todo = await graphManager.getNode('todo-1');
   * console.log('Before:', todo.properties); // { title: 'Task', status: 'pending', priority: 'high' }
   * 
   * await graphManager.updateNode('todo-1', { status: 'completed' });
   * 
   * const updated = await graphManager.getNode('todo-1');
   * console.log('After:', updated.properties); // { title: 'Task', status: 'completed', priority: 'high' }
   * // Only status changed, other fields preserved
   * 
   * @example
   * // Error handling
   * try {
   *   await graphManager.updateNode('nonexistent-id', { status: 'done' });
   * } catch (error) {
   *   console.error('Update failed:', error.message); // 'Node not found: nonexistent-id'
   * }
   */
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
        RETURN n
        `,
        { id, properties: setProperties }
      );

      if (result.records.length === 0) {
        throw new Error(`Node not found: ${id}`);
      }

      const updatedNode = result.records[0].get('n');

      // Regenerate embeddings if content changed and embeddings service is enabled
      // Skip embedding regeneration for NornicDB (database handles it natively)
      const contentChanged = properties.content !== undefined || 
                            properties.text !== undefined || 
                            properties.title !== undefined ||
                            properties.description !== undefined;

      if (!this.isNornicDB && contentChanged && this.embeddingsService) {
        // Ensure embeddings service is initialized
        if (!this.embeddingsService.isEnabled()) {
          await this.embeddingsService.initialize();
        }

        if (this.embeddingsService.isEnabled()) {
          // Extract text content for embedding generation
          const textContent = this.extractTextContent(updatedNode);

          if (textContent && textContent.trim().length > 0) {
            const chunkSize = parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_SIZE || '768', 10);

            try {
              // Check if content needs chunking
              if (textContent.length > chunkSize) {
                // Large content - use chunking
                console.log(`📦 Node ${id} has large content (${textContent.length} chars), regenerating chunks...`);
                
                // Delete existing chunks first
                await session.run(
                  `MATCH (n:Node {id: $id})
                   OPTIONAL MATCH (n)-[r:HAS_CHUNK]->(chunk:NodeChunk)
                   DELETE r, chunk`,
                  { id }
                );
                
                await this.createNodeChunks(id, textContent, session);

                // Update node to mark it has chunks (no single embedding on parent node)
                await session.run(
                  `MATCH (n:Node {id: $id}) 
                   SET n.has_embedding = true, 
                       n.has_chunks = true
                   REMOVE n.embedding`,
                  { id }
                );
              } else {
                // Small content - single embedding
                const embeddingResult = await this.embeddingsService.generateEmbedding(textContent);
                
                // Delete existing chunks if any
                await session.run(
                  `MATCH (n:Node {id: $id})
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
                    embedding: embeddingResult.embedding,
                    dimensions: embeddingResult.dimensions,
                    model: embeddingResult.model
                  }
                );
                console.log(`✅ Regenerated embedding for node ${id} (${embeddingResult.dimensions} dimensions)`);
              }
            } catch (error: any) {
              console.error(`⚠️  Failed to regenerate embedding for node ${id}: ${error.message}`);
            }
          }
        }
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
      
      // First, prepare all nodes with IDs and base properties
      const preparedNodes = nodes.map((n) => {
        const flatProps = flattenForMCP(n.properties || {});
        return {
          id: `${n.type}-${++this.nodeCounter}-${Date.now()}`,
          type: n.type,
          created: now,
          updated: now,
          ...flatProps,
          has_embedding: false
        };
      });

      // Create all nodes in bulk
      const createResult = await session.run(
        `
        UNWIND $nodes as node
        CREATE (n:Node)
        SET n = node
        RETURN n
        `,
        { nodes: preparedNodes }
      );

      // Now generate embeddings for each node if service is enabled
      if (this.embeddingsService) {
        if (!this.embeddingsService.isEnabled()) {
          await this.embeddingsService.initialize();
        }

        if (this.embeddingsService.isEnabled()) {
          const chunkSize = parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_SIZE || '768', 10);
          
          // Process each node's embeddings
          for (let i = 0; i < nodes.length; i++) {
            const originalNode = nodes[i];
            const nodeId = preparedNodes[i].id;
            const textContent = this.extractTextContent(originalNode.properties || {});
            
            if (textContent && textContent.trim().length > 0) {
              try {
                // Check if content needs chunking
                if (textContent.length > chunkSize) {
                  // Large content - use chunking
                  console.log(`📦 Bulk node ${nodeId} has large content (${textContent.length} chars), creating chunks...`);
                  await this.createNodeChunks(nodeId, textContent, session);
                  
                  // Update node to mark it has chunks
                  await session.run(
                    `MATCH (n:Node {id: $id}) SET n.has_embedding = true, n.has_chunks = true`,
                    { id: nodeId }
                  );
                } else {
                  // Small content - single embedding
                  const result = await this.embeddingsService.generateEmbedding(textContent);
                  await session.run(
                    `MATCH (n:Node {id: $id}) 
                     SET n.embedding = $embedding,
                         n.embedding_dimensions = $dimensions,
                         n.embedding_model = $model,
                         n.has_embedding = true`,
                    {
                      id: nodeId,
                      embedding: result.embedding,
                      dimensions: result.dimensions,
                      model: result.model
                    }
                  );
                  console.log(`✅ Generated embedding for ${originalNode.type} node (${result.dimensions} dimensions)`);
                }
              } catch (error: any) {
                console.error(`⚠️  Failed to generate embedding for ${originalNode.type} node: ${error.message}`);
              }
            }
          }
        }
      }

      return createResult.records.map(r => this.nodeFromRecord(r.get('n')));
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
        RETURN n
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
      // Flatten properties at top level (Neo4j doesn't support nested objects in relationships)
      const edgesWithIds = edges.map(e => ({
        id: `edge-${++this.edgeCounter}-${Date.now()}`,
        source: e.source,
        target: e.target,
        type: e.type,
        created: now,
        ...flattenForMCP(e.properties || {})  // Spread flattened user properties at top level
      }));

      const result = await session.run(
        `
        UNWIND $edges as edge
        MATCH (s:Node {id: edge.source})
        MATCH (t:Node {id: edge.target})
        CREATE (s)-[e:EDGE]->(t)
        SET e = edge
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

      // Use simple RETURN for NornicDB compatibility - content stripping handled in nodeFromRecord
      query += ` RETURN n`;

      const result = await session.run(query, params);
      // Pass stripContent=true to handle large content in application layer
      return result.records.map(r => this.nodeFromRecord(r.get('n'), undefined, true));
    } finally {
      await session.close();
    }
  }

  async searchNodes(query: string, options: SearchOptions = {}): Promise<Node[]> {
    // Use UnifiedSearchService for automatic semantic/fulltext fallback
    await this.unifiedSearchService.initialize();
    
    const searchResult = await this.unifiedSearchService.search(query, {
      types: options.types,
      limit: options.limit || 100,
      minSimilarity: options.minSimilarity || 0.75, // Default threshold
      offset: options.offset || 0
    });
    
    // Convert SearchResult[] to Node[] format
    // Note: UnifiedSearchService returns formatted results, we need to fetch full nodes
    if (searchResult.results.length === 0) {
      return [];
    }
    
    const session = this.driver.session();
    try {
      // Get full node data for the IDs returned by search
      const ids = searchResult.results.map(r => r.id);
      
      const result = await session.run(
        `
        MATCH (n)
        WHERE (n.id IN $ids OR n.path IN $ids)
        RETURN n
        `,
        { ids, query }
      );

      // Handle content stripping in application layer for NornicDB compatibility
      return result.records.map(r => this.nodeFromRecord(r.get('n'), undefined, true));
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
        RETURN DISTINCT neighbor
        `,
        { nodeId, edgeType }
      );

      return result.records.map(r => this.nodeFromRecord(r.get('neighbor'), undefined, true));
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
        WITH collect(DISTINCT node) as allNodes, pathEdges
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
      // Handle content stripping in application layer for NornicDB compatibility
      const nodes = record.get('allNodes').map((n: any) => this.nodeFromRecord(n, undefined, true));
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
        RETURN n
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
        RETURN n
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

      // Use simple RETURN for NornicDB compatibility - content stripping handled in nodeFromRecord
      cypher += ` RETURN n`;

      const result = await session.run(cypher, params);
      return result.records.map(record => this.nodeFromRecord(record.get('n'), undefined, true));
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
