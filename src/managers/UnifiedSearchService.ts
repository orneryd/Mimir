/**
 * @file src/managers/UnifiedSearchService.ts
 * @description Unified search service with automatic fallback from vector to full-text search
 * 
 * Search Strategy:
 * 1. If embeddings enabled AND query can be embedded → vector search (semantic)
 * 2. If vector search returns no results OR embeddings disabled → full-text search (keyword)
 * 
 * Used by:
 * - vector_search_nodes tool (primary semantic search interface)
 * - memory_node(operation='search') (semantic by default, keyword fallback)
 * - File indexing (stores full content for fallback when embeddings disabled)
 */

import { Driver, Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { EmbeddingsService } from '../indexing/EmbeddingsService.js';
import { Node } from '../types/index.js';
import { ReciprocalRankFusion, RRFResult } from '../utils/reciprocal-rank-fusion.js';

export interface SearchResult {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  similarity?: number;
  avg_similarity?: number;
  relevance?: number;
  content_preview: string;
  path?: string;
  absolute_path?: string; // Absolute filesystem path for agent access
  chunk_text?: string; // Full chunk text content for RAG injection
  chunk_index?: number;
  chunks_matched?: number; // For file_chunk results: number of chunks that matched
  parent_file?: {
    path: string;
    absolute_path?: string; // Absolute path to parent file
    name: string;
    language: string;
  };
}

export interface UnifiedSearchOptions {
  types?: string[];
  limit?: number;
  minSimilarity?: number;
  offset?: number;
  
  // RRF Configuration (Reciprocal Rank Fusion - combines vector + BM25)
  rrfK?: number;              // RRF constant k (default: 60, higher = less emphasis on top ranks)
  rrfVectorWeight?: number;   // Weight for vector search ranking (default: 1.0)
  rrfBm25Weight?: number;     // Weight for BM25 keyword ranking (default: 1.0)
  rrfMinScore?: number;       // Minimum RRF score to include result (default: 0.01)
}

export interface UnifiedSearchResponse {
  status: 'success' | 'error';
  query: string;
  results: SearchResult[];
  total_candidates: number;
  returned: number;
  search_method: 'rrf_hybrid' | 'fulltext';
  fallback_triggered?: boolean;
  message?: string;
  advanced_metrics?: {
    stage1Time: number;
    stage2Time: number;
    stage3Time: number;
    stage4Time: number;
    totalTime: number;
    candidatesPerMethod: Record<string, number>;
  };
}

export class UnifiedSearchService {
  private driver: Driver;
  private embeddingsService: EmbeddingsService;
  private initialized: boolean = false;
  private isNornicDB: boolean = false;
  private providerDetected: boolean = false;

  constructor(driver: Driver) {
    this.driver = driver;
    this.embeddingsService = new EmbeddingsService();
  }

  /**
   * Detect whether we're connected to NornicDB or Neo4j
   * NornicDB supports server-side embedding generation for vector queries
   */
  private async detectDatabaseProvider(): Promise<void> {
    if (this.providerDetected) return;
    
    // Check for manual override
    const manualProvider = process.env.MIMIR_DATABASE_PROVIDER?.toLowerCase();
    if (manualProvider === 'nornicdb') {
      this.isNornicDB = true;
      this.providerDetected = true;
      return;
    } else if (manualProvider === 'neo4j') {
      this.isNornicDB = false;
      this.providerDetected = true;
      return;
    }

    // Auto-detect via server metadata
    const session = this.driver.session();
    try {
      const result = await session.run('RETURN 1 as test');
      const serverAgent = result.summary.server?.agent || '';
      
      if (serverAgent.toLowerCase().includes('nornicdb')) {
        this.isNornicDB = true;
      } else {
        this.isNornicDB = false;
      }
    } catch (error) {
      // Default to Neo4j on error
      this.isNornicDB = false;
    } finally {
      await session.close();
    }
    this.providerDetected = true;
  }

  /**
   * Initialize the embeddings service for semantic search
   * 
   * Sets up vector embeddings support for semantic search. If initialization fails,
   * the service falls back to full-text search only. Safe to call multiple times.
   * 
   * @returns Promise that resolves when initialization is complete
   * 
   * @example
   * // Initialize on service startup
   * const searchService = new UnifiedSearchService(driver);
   * await searchService.initialize();
   * console.log('Search service ready');
   * 
   * @example
   * // Automatic initialization on first search
   * const searchService = new UnifiedSearchService(driver);
   * // No need to call initialize() - happens automatically
   * const results = await searchService.search('authentication');
   * 
   * @example
   * // Handle initialization errors gracefully
   * try {
   *   await searchService.initialize();
   * } catch (error) {
   *   console.warn('Embeddings disabled, using full-text only');
   * }
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Detect database provider first
    await this.detectDatabaseProvider();
    
    try {
      // Only initialize client-side embeddings for Neo4j
      // NornicDB handles embeddings server-side
      if (!this.isNornicDB) {
        await this.embeddingsService.initialize();
      }
      this.initialized = true;
      
      if (this.isNornicDB) {
        console.log('✅ UnifiedSearchService: NornicDB detected - using server-side hybrid search');
      } else if (this.embeddingsService.isEnabled()) {
        console.log('✅ UnifiedSearchService: Vector search enabled');
      } else {
        console.log('ℹ️  UnifiedSearchService: Vector search disabled, using full-text only');
      }
    } catch (error: any) {
      console.warn('⚠️  Failed to initialize embeddings service:', error.message);
      this.initialized = true; // Mark as initialized anyway, just disabled
    }
  }

  /**
   * Unified search with automatic semantic and keyword search
   * 
   * Intelligently combines vector similarity search (semantic) with BM25 full-text
   * search (keyword) using Reciprocal Rank Fusion (RRF). Automatically falls back
   * to full-text only if embeddings are disabled.
   * 
   * Search Strategy:
   * 1. If embeddings enabled: RRF hybrid search (vector + BM25)
   * 2. If embeddings disabled: Full-text search only
   * 
   * @param query - Search query string
   * @param options - Search options (types, limit, similarity threshold, RRF config)
   * @returns Search response with results and metadata
   * 
   * @example
   * // Basic semantic search
   * const response = await searchService.search('user authentication');
   * console.log(`Found ${response.returned} results`);
   * for (const result of response.results) {
   *   console.log(`${result.title}: ${result.similarity}`);
   * }
   * 
   * @example
   * // Search specific node types with limit
   * const response = await searchService.search('API endpoint', {
   *   types: ['file', 'memory'],
   *   limit: 10,
   *   minSimilarity: 0.7
   * });
   * console.log(`Method: ${response.search_method}`);
   * 
   * @example
   * // Advanced RRF hybrid search configuration
   * const response = await searchService.search('database query', {
   *   types: ['file'],
   *   limit: 20,
   *   rrfK: 60,              // RRF constant (higher = less top-rank bias)
   *   rrfVectorWeight: 1.5,  // Boost semantic results
   *   rrfBm25Weight: 1.0,    // Standard keyword weight
   *   rrfMinScore: 0.01      // Filter low-relevance results
   * });
   * 
   * @example
   * // Handle search with pagination
   * const page1 = await searchService.search('React components', {
   *   limit: 10,
   *   offset: 0
   * });
   * const page2 = await searchService.search('React components', {
   *   limit: 10,
   *   offset: 10
   * });
   * 
   * @example
   * // Search with fallback detection
   * const response = await searchService.search('error handling');
   * if (response.fallback_triggered) {
   *   console.log('Used full-text fallback');
   * }
   * if (response.search_method === 'rrf_hybrid') {
   *   console.log('Used hybrid semantic + keyword search');
   * }
   */
  async search(query: string, options: UnifiedSearchOptions = {}): Promise<UnifiedSearchResponse> {
    await this.initialize();

    // Handle empty query - return empty results gracefully
    if (!query || query.trim().length === 0) {
      return {
        status: 'success',
        query: query || '',
        results: [],
        total_candidates: 0,
        returned: 0,
        search_method: 'fulltext',
        fallback_triggered: false
      };
    }

    // Use NornicDB's native hybrid search (server-side embeddings + RRF)
    if (this.isNornicDB) {
      return await this.nornicDBHybridSearch(query, options);
    }
    
    // Use client-side RRF hybrid search if embeddings enabled (Neo4j)
    if (this.embeddingsService.isEnabled()) {
      return await this.rrfHybridSearch(query, options);
    }
    
    // Fall back to full-text search if embeddings disabled
    const fulltextResults = await this.fullTextSearch(query, options);
    
    return {
      status: 'success',
      query,
      results: fulltextResults,
      total_candidates: fulltextResults.length,
      returned: fulltextResults.length,
      search_method: 'fulltext',
      fallback_triggered: false,
      message: 'Vector embeddings disabled. Using full-text search.'
    };
  }

  /**
   * NornicDB native hybrid search using server-side embeddings
   * 
   * NornicDB can accept string queries directly and generates embeddings server-side,
   * eliminating the need for client-side embedding generation. Both NornicDB and Neo4j
   * return cosine similarity (0-1 range) from db.index.vector.queryNodes.
   */
  private async nornicDBHybridSearch(query: string, options: UnifiedSearchOptions): Promise<UnifiedSearchResponse> {
    const session = this.driver.session();
    const startTime = Date.now();
    
    try {
      const limit = Math.floor(options.limit || 50);
      // Cosine similarity threshold (0-1 range), same as Neo4j
      const minSimilarity = options.minSimilarity !== undefined ? options.minSimilarity : 0.5;
      
      console.log(`🔍 NornicDB: Hybrid search for "${query}" (min_score: ${minSimilarity}, limit: ${limit})`);
      
      // Build type filter if provided
      let typeFilter = '';
      const queryParams: any = {
        searchQuery: query,
        searchLimit: neo4j.int(limit * 2), // Get more candidates for filtering
        minScore: minSimilarity,
        finalLimit: neo4j.int(limit)
      };
      
      if (options.types && Array.isArray(options.types) && options.types.length > 0) {
        const expandedTypes = options.types.flatMap(type => {
          if (type === 'file') {
            return ['file', 'file_chunk'];
          }
          return type;
        });
        typeFilter = 'AND node.type IN $types';
        queryParams.types = expandedTypes;
      }

      // NornicDB accepts string queries directly - it generates embeddings server-side
      // This uses NornicDB's native hybrid search (vector + BM25 with RRF fusion)
      // Use parameterized query to prevent Cypher injection attacks
      const result = await session.run(`
        CALL db.index.vector.queryNodes('node_embedding_index', $searchLimit, $searchQuery)
        YIELD node, score
        WHERE score >= $minScore ${typeFilter}
        
        // For FileChunk nodes, get parent File information
        OPTIONAL MATCH (node)<-[:HAS_CHUNK]-(parentFile:File)
        
        RETURN CASE 
                 WHEN node.type = 'file_chunk' AND parentFile IS NOT NULL 
                 THEN parentFile.path 
                 ELSE COALESCE(node.id, node.path)
               END AS id,
               node.type AS type,
               CASE 
                 WHEN node.type = 'file_chunk' AND parentFile IS NOT NULL 
                 THEN parentFile.name 
                 ELSE COALESCE(node.title, node.name)
               END AS title,
               node.name AS name,
               node.description AS description,
               node.content AS content,
               node.path AS path,
               CASE 
                 WHEN node.type = 'file_chunk' AND parentFile IS NOT NULL 
                 THEN parentFile.absolute_path 
                 ELSE node.absolute_path
               END AS absolute_path,
               node.text AS chunk_text,
               node.chunk_index AS chunk_index,
               score AS similarity,
               parentFile.path AS parent_file_path,
               parentFile.absolute_path AS parent_file_absolute_path,
               parentFile.name AS parent_file_name,
               parentFile.language AS parent_file_language
        ORDER BY score DESC
        LIMIT $finalLimit
      `, queryParams);

      const results = result.records.map(record => this.formatSearchResult(record, 'vector'));
      const totalTime = Date.now() - startTime;
      
      console.log(`🔍 NornicDB: Found ${results.length} results in ${totalTime}ms`);
      
      return {
        status: 'success',
        query,
        results,
        total_candidates: results.length,
        returned: results.length,
        search_method: 'rrf_hybrid',
        fallback_triggered: false,
        message: 'NornicDB native hybrid search (server-side embeddings + RRF)',
        advanced_metrics: {
          stage1Time: 0,
          stage2Time: 0,
          stage3Time: 0,
          stage4Time: 0,
          totalTime,
          candidatesPerMethod: {
            nornicdb_hybrid: results.length
          }
        }
      };
      
    } catch (error: any) {
      console.error('❌ NornicDB hybrid search error:', error.message);
      
      // Fall back to full-text search
      try {
        console.log('⚠️  Falling back to full-text search...');
        const fulltextResults = await this.fullTextSearch(query, options);
        
        return {
          status: 'success',
          query,
          results: fulltextResults,
          total_candidates: fulltextResults.length,
          returned: fulltextResults.length,
          search_method: 'fulltext',
          fallback_triggered: true,
          message: `NornicDB hybrid search failed: ${error.message}. Fell back to full-text search.`
        };
      } catch (fulltextError: any) {
        return {
          status: 'success',
          query,
          results: [],
          total_candidates: 0,
          returned: 0,
          search_method: 'fulltext',
          fallback_triggered: true,
          message: `Search unavailable: ${error.message}`
        };
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(query: string, options: UnifiedSearchOptions): Promise<SearchResult[]> {
    const session = this.driver.session();
    
    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingsService.generateEmbedding(query);
      
      const limit = Math.floor(options.limit || 10);
      const minSimilarity = options.minSimilarity || 0.75;

      // Build type filter if provided
      let typeFilter = '';
      const queryParams: any = {
        queryVector: queryEmbedding.embedding,
        limit: Math.floor(limit * 2) // Get more candidates for filtering
      };
      
      if (options.types && Array.isArray(options.types) && options.types.length > 0) {
        // Expand 'file' to include 'file_chunk' since File nodes don't have embeddings
        const expandedTypes = options.types.flatMap(type => {
          if (type === 'file') {
            return ['file', 'file_chunk'];
          }
          return type;
        });
        
        typeFilter = 'AND node.type IN $types';
        queryParams.types = expandedTypes;
      }

      // Use Neo4j's native vector similarity search
      // For file_chunk results: aggregate by parent file to show match counts
      const result = await session.run(`
        CALL db.index.vector.queryNodes('node_embedding_index', toInteger($limit), $queryVector)
        YIELD node, score
        WHERE score >= $minSimilarity ${typeFilter}
        
        // For FileChunk nodes, get parent File information
        OPTIONAL MATCH (node)<-[:HAS_CHUNK]-(parentFile:File)
        
        // Determine the grouping key (file path for chunks, node id for others)
        WITH node, score, parentFile,
             CASE 
               WHEN node.type = 'file_chunk' AND parentFile IS NOT NULL THEN parentFile.path
               ELSE COALESCE(node.id, node.path)
             END AS groupKey,
             CASE 
               WHEN node.type = 'file_chunk' THEN parentFile.path 
               ELSE null 
             END AS filePathForChunks
        
        // Aggregate by groupKey (this groups all chunks from the same file together)
        WITH groupKey,
             filePathForChunks,
             // Collect all matching nodes and their scores for this group
             collect({
               node: node, 
               score: score, 
               parentFile: parentFile
             }) AS matches,
             max(score) AS best_similarity,
             avg(score) AS avg_similarity,
             // Count only file_chunk nodes in this group
             count(CASE WHEN node.type = 'file_chunk' THEN 1 END) AS chunks_matched
        
        // Get the best match from the group for returning
        // Sort matches by score DESC and take the first one
        WITH groupKey,
             filePathForChunks,
             matches,
             best_similarity,
             avg_similarity,
             chunks_matched,
             [m IN matches WHERE m.score = best_similarity][0] AS bestMatch
        
        // Extract fields from the best match
        WITH groupKey,
             bestMatch.node AS node,
             bestMatch.score AS similarity,
             bestMatch.parentFile AS parentFile,
             best_similarity,
             avg_similarity,
             // Only set chunks_matched for file_chunk results
             CASE WHEN bestMatch.node.type = 'file_chunk' THEN chunks_matched ELSE null END AS chunks_matched
        
        ORDER BY similarity DESC
        LIMIT toInteger($finalLimit)
        
        RETURN CASE 
                 WHEN node.type = 'file_chunk' AND parentFile IS NOT NULL 
                 THEN parentFile.path 
                 ELSE COALESCE(node.id, node.path)
               END AS id,
               node.type AS type,
               CASE 
                 WHEN node.type = 'file_chunk' AND parentFile IS NOT NULL 
                 THEN parentFile.name 
                 ELSE COALESCE(node.title, node.name)
               END AS title,
               node.name AS name,
               node.description AS description,
               node.content AS content,
               node.path AS path,
               CASE 
                 WHEN node.type = 'file_chunk' AND parentFile IS NOT NULL 
                 THEN parentFile.absolute_path 
                 ELSE node.absolute_path
               END AS absolute_path,
               node.text AS chunk_text,
               node.chunk_index AS chunk_index,
               node.id AS chunk_id,
               similarity,
               chunks_matched,
               avg_similarity,
               parentFile.path AS parent_file_path,
               parentFile.absolute_path AS parent_file_absolute_path,
               parentFile.name AS parent_file_name,
               parentFile.language AS parent_file_language
      `, { ...queryParams, minSimilarity, finalLimit: limit });

      return result.records.map(record => this.formatSearchResult(record, 'vector'));
      
    } finally {
      await session.close();
    }
  }

  /**
   * Full-text keyword search using Neo4j's native BM25-powered Lucene index
   * Supports fuzzy matching, proximity search, field boosting, and boolean operators
   */
  private async fullTextSearch(query: string, options: UnifiedSearchOptions): Promise<SearchResult[]> {
    const session = this.driver.session();
    
    try {
      const limit = options.limit || 100;

      // Expand 'file' to include 'file_chunk' for type filtering
      let expandedTypes = options.types;
      if (options.types && options.types.length > 0) {
        expandedTypes = options.types.flatMap(type => {
          if (type === 'file') {
            return ['file', 'file_chunk'];
          }
          return type;
        });
      }

      // Use Neo4j's native BM25-powered full-text search
      const result = await session.run(
        `
        CALL db.index.fulltext.queryNodes('node_search', $query)
        YIELD node, score
        
        // Filter by type if specified
        ${expandedTypes && expandedTypes.length > 0 ? 'WHERE node.type IN $types' : ''}
        
        // For FileChunk nodes, get parent File information
        OPTIONAL MATCH (node)<-[:HAS_CHUNK]-(parentFile:File)
        
        RETURN COALESCE(node.id, node.path) AS id,
               node.type AS type,
               COALESCE(node.title, node.name) AS title,
               node.name AS name,
               node.description AS description,
               node.content AS content,
               node.path AS path,
               CASE 
                 WHEN node.type = 'file_chunk' AND parentFile IS NOT NULL 
                 THEN parentFile.absolute_path 
                 ELSE node.absolute_path
               END AS absolute_path,
               node.text AS chunk_text,
               node.chunk_index AS chunk_index,
               parentFile.path AS parent_file_path,
               parentFile.absolute_path AS parent_file_absolute_path,
               parentFile.name AS parent_file_name,
               parentFile.language AS parent_file_language,
               score AS relevance
        ORDER BY score DESC
        LIMIT $limit
        `,
        { 
          query, 
          types: expandedTypes || [],
          limit: neo4j.int(limit) 
        }
      );

      return result.records.map(record => this.formatSearchResult(record, 'fulltext'));
      
    } catch (error: any) {
      // Fallback to basic search if full-text index doesn't exist
      if (error.code === 'Neo.ClientError.Schema.IndexNotFound') {
        console.warn('⚠️  Full-text index "node_search" not found. Creating it...');
        console.warn('⚠️  Run: CREATE FULLTEXT INDEX node_search FOR (n:File|FileChunk|Memory|Todo|Concept) ON EACH [n.content, n.text, n.title, n.name, n.description]');
        
        // Return empty results for now
        return [];
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Format search result from Neo4j record
   */
  private formatSearchResult(record: any, searchMethod: 'vector' | 'fulltext'): SearchResult {
    const content = record.get('content');
    const description = record.get('description');
    const title = record.get('title');
    const name = record.get('name');
    const path = record.get('path');
    const absolutePath = record.get('absolute_path');
    const chunkText = record.get('chunk_text');
    const chunkIndex = record.get('chunk_index');
    // chunk_id only exists in vector search results
    const chunkId = record.has('chunk_id') ? record.get('chunk_id') : null;
    const chunksMatched = record.has('chunks_matched') ? record.get('chunks_matched') : null;
    const avgSimilarity = record.has('avg_similarity') ? record.get('avg_similarity') : null;
    const parentFilePath = record.get('parent_file_path');
    const parentFileAbsolutePath = record.get('parent_file_absolute_path');
    const parentFileName = record.get('parent_file_name');
    const parentFileLanguage = record.get('parent_file_language');
    const nodeType = record.get('type');
    
    // Create a preview from available text fields
    let preview = '';
    if (chunkText) preview = chunkText.substring(0, 200);
    else if (title) preview = title;
    else if (name) preview = name;
    else if (description) preview = description;
    else if (content && typeof content === 'string') preview = content.substring(0, 200);
    
    const resultObj: SearchResult = {
      id: record.get('id'),
      type: nodeType,
      title: title || name || null,
      description: description || null,
      content_preview: preview
    };
    
    // Add score based on search method
    if (searchMethod === 'vector') {
      resultObj.similarity = record.get('similarity');
      if (avgSimilarity) {
        resultObj.avg_similarity = avgSimilarity;
      }
    } else {
      resultObj.relevance = record.get('relevance');
    }
    
    // Add chunk-specific information
    if (nodeType === 'file_chunk') {
      if (chunkIndex !== null && chunkIndex !== undefined) {
        resultObj.chunk_index = chunkIndex;
      }
      if (chunksMatched && chunksMatched > 0) {
        resultObj.chunks_matched = typeof chunksMatched.toNumber === 'function' 
          ? chunksMatched.toNumber() 
          : chunksMatched;
      }
      if (parentFilePath) {
        resultObj.parent_file = {
          path: parentFilePath,
          absolute_path: parentFileAbsolutePath,
          name: parentFileName,
          language: parentFileLanguage
        };
      }
      // For chunks, include the chunk text as content for RAG
      if (chunkText) {
        resultObj.chunk_text = chunkText;
      }
    }
    
    // Add path for file nodes (both relative and absolute)
    if (path) {
      resultObj.path = path;
    }
    if (absolutePath) {
      resultObj.absolute_path = absolutePath;
    }
    
    return resultObj;
  }

  /**
   * Hybrid search using Reciprocal Rank Fusion (RRF)
   * Industry-standard method for combining vector and BM25 rankings
   */
  private async rrfHybridSearch(query: string, options: UnifiedSearchOptions): Promise<UnifiedSearchResponse> {
    const startTime = Date.now();
    
    try {
      const limit = Math.floor(options.limit || 50);
      
      console.log(`🔍 RRF: Starting hybrid search for query: "${query}"`);
      
      // Step 1: Get vector search results (cosine similarity ranking)
      const vectorResults = await this.vectorSearch(query, {
        ...options,
        limit: Math.floor(limit * 2) // Get more candidates for better fusion
      });
      
      console.log(`🔍 RRF: Vector search returned ${vectorResults.length} results`);
      
      // Step 2: Get BM25 keyword search results
      const bm25Results = await this.fullTextSearch(query, {
        ...options,
        limit: Math.floor(limit * 2)
      });
      
      console.log(`🔍 RRF: BM25 search returned ${bm25Results.length} results`);
      
      if (vectorResults.length === 0 && bm25Results.length === 0) {
        return {
          status: 'success',
          query,
          results: [],
          total_candidates: 0,
          returned: 0,
          search_method: 'rrf_hybrid',
          fallback_triggered: false,
          message: 'No results found'
        };
      }
      
      // Step 3: Fuse rankings using RRF
      // Use custom config if provided, otherwise use adaptive config based on query
      const rrfConfig = (options.rrfK || options.rrfVectorWeight || options.rrfBm25Weight || options.rrfMinScore)
        ? {
            k: options.rrfK || 60,
            vectorWeight: options.rrfVectorWeight || 1.0,
            bm25Weight: options.rrfBm25Weight || 1.0,
            minScore: options.rrfMinScore || 0.01
          }
        : ReciprocalRankFusion.getAdaptiveConfig(query);
      
      const rrf = new ReciprocalRankFusion(rrfConfig);
      
      console.log(`🔍 RRF: Using config - k=${rrfConfig.k}, vectorWeight=${rrfConfig.vectorWeight}, bm25Weight=${rrfConfig.bm25Weight}`);
      
      const fusedResults = rrf.fuse(vectorResults, bm25Results);
      
      // Step 4: Limit to requested number of results
      const finalResults = fusedResults.slice(0, limit);
      
      const totalTime = Date.now() - startTime;
      
      return {
        status: 'success',
        query,
        results: finalResults,
        total_candidates: fusedResults.length,
        returned: finalResults.length,
        search_method: 'rrf_hybrid',
        fallback_triggered: false,
        message: 'Reciprocal Rank Fusion (Vector + BM25)',
        advanced_metrics: {
          stage1Time: 0,
          stage2Time: 0,
          stage3Time: 0,
          stage4Time: 0,
          totalTime,
          candidatesPerMethod: {
            vector: vectorResults.length,
            bm25: bm25Results.length,
            fused: fusedResults.length
          }
        }
      };
      
    } catch (error: any) {
      console.error('❌ RRF hybrid search error:', error);
      
      // Try vector search fallback first
      try {
        console.log('⚠️  Falling back to standard vector search...');
        const vectorResults = await this.vectorSearch(query, options);
        
        return {
          status: 'success',
          query,
          results: vectorResults,
          total_candidates: vectorResults.length,
          returned: vectorResults.length,
          search_method: 'rrf_hybrid',
          fallback_triggered: true,
          message: `RRF hybrid search failed: ${error.message}. Fell back to vector-only search.`
        };
      } catch (vectorError: any) {
        // Vector search also failed - try full-text search as last resort
        console.error('❌ Vector search fallback also failed:', vectorError.message);
        
        try {
          console.log('⚠️  Falling back to full-text search...');
          const fulltextResults = await this.fullTextSearch(query, options);
          
          return {
            status: 'success',
            query,
            results: fulltextResults,
            total_candidates: fulltextResults.length,
            returned: fulltextResults.length,
            search_method: 'fulltext',
            fallback_triggered: true,
            message: `Vector search unavailable. Using full-text search only.`
          };
        } catch (fulltextError: any) {
          // All search methods failed - return empty results gracefully
          console.error('❌ All search methods failed:', fulltextError.message);
          
          return {
            status: 'success', // Still return success to not crash the caller
            query,
            results: [],
            total_candidates: 0,
            returned: 0,
            search_method: 'fulltext', // Use fulltext as default type even though search failed
            fallback_triggered: true,
            message: `Search unavailable: ${error.message}. Returning empty results.`
          };
        }
      }
    }
  }

  /**
   * Check if vector embeddings are enabled for semantic search
   * 
   * Returns true if the embeddings service is initialized and functional.
   * Use this to determine if semantic search is available.
   * 
   * @returns True if embeddings enabled, false otherwise
   * 
   * @example
   * // Check before using vector-specific features
   * if (searchService.isEmbeddingsEnabled()) {
   *   console.log('Semantic search available');
   * } else {
   *   console.log('Using keyword search only');
   * }
   * 
   * @example
   * // Conditional search strategy
   * const searchService = new UnifiedSearchService(driver);
   * await searchService.initialize();
   * 
   * if (searchService.isEmbeddingsEnabled()) {
   *   // Use semantic search for conceptual queries
   *   const results = await searchService.search('authentication patterns');
   * } else {
   *   // Use exact keyword matching
   *   const results = await searchService.search('AuthService.login');
   * }
   */
  isEmbeddingsEnabled(): boolean {
    return this.embeddingsService.isEnabled();
  }

  /**
   * Get the underlying embeddings service instance
   * 
   * Provides direct access to the embeddings service for advanced use cases
   * like generating custom embeddings or checking embedding statistics.
   * 
   * @returns EmbeddingsService instance
   * 
   * @example
   * // Generate custom embedding
   * const embeddingsService = searchService.getEmbeddingsService();
   * const result = await embeddingsService.generateEmbedding('custom text');
   * console.log(`Embedding dimensions: ${result.dimensions}`);
   * 
   * @example
   * // Check embedding model info
   * const embeddingsService = searchService.getEmbeddingsService();
   * if (embeddingsService.isEnabled()) {
   *   console.log('Using embeddings for semantic search');
   * }
   */
  getEmbeddingsService(): EmbeddingsService {
    return this.embeddingsService;
  }
}
