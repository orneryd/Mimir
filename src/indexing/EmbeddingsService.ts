/**
 * @file src/indexing/EmbeddingsService.ts
 * @description Vector embeddings service supporting multiple providers
 * 
 * Supports:
 * - Ollama (local models like nomic-embed-text)
 * - OpenAI/Copilot (text-embedding-ada-002, text-embedding-3-small, text-embedding-3-large)
 * 
 * Feature flag controlled via LLM configuration.
 */

import { LLMConfigLoader } from '../config/LLMConfigLoader.js';
import { createSecureFetchOptions } from '../utils/fetch-helper.js';

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  model: string;
}

export interface ChunkEmbeddingResult {
  text: string;
  embedding: number[];
  dimensions: number;
  model: string;
  startOffset: number;
  endOffset: number;
  chunkIndex: number;
}

export interface TextChunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

// Chunking configuration based on model context limits
// Model limits: all-minilm (512 tokens), nomic-embed-text (2048 tokens), nomic-embed-text (512 tokens)
// Configurable via environment variables for flexibility
const getChunkSize = () => parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_SIZE || '768', 10);
const getChunkOverlap = () => parseInt(process.env.MIMIR_EMBEDDINGS_CHUNK_OVERLAP || '10', 10);
const getMaxRetries = () => parseInt(process.env.MIMIR_EMBEDDINGS_MAX_RETRIES || '3', 10);

export class EmbeddingsService {
  private configLoader: LLMConfigLoader;
  public enabled: boolean = false;
  private provider: string = 'ollama';
  private baseUrl: string = 'http://localhost:11434';
  private model: string = 'nomic-embed-text';
  private apiKey: string = 'dummy-key-not-used';

  constructor() {
    this.configLoader = LLMConfigLoader.getInstance();
  }

  /**
   * Initialize the embeddings service
   */
  async initialize(): Promise<void> {
    const config = await this.configLoader.getEmbeddingsConfig();
    
    if (!config || !config.enabled) {
      this.enabled = false;
      console.log('ℹ️  Vector embeddings disabled');
      return;
    }

    this.enabled = true;
    this.provider = config.provider;
    this.model = config.model;
    
    // Use embeddings-specific API URL if provided, otherwise fall back to LLM provider config
    if (process.env.MIMIR_EMBEDDINGS_API) {
      this.baseUrl = process.env.MIMIR_EMBEDDINGS_API;
    } else {
      // Fallback: Get provider base URL from llmConfig
      const llmConfig = await this.configLoader.load();
      const providerConfig = llmConfig.providers[config.provider];
      if (providerConfig?.baseUrl) {
        this.baseUrl = providerConfig.baseUrl;
      }
    }
    
    // Use embeddings-specific API key if provided
    if (process.env.MIMIR_EMBEDDINGS_API_KEY) {
      this.apiKey = process.env.MIMIR_EMBEDDINGS_API_KEY;
    } else if (this.provider === 'copilot' || this.provider === 'openai') {
      // Fallback: For OpenAI/Copilot, use dummy key
      this.apiKey = 'dummy-key-not-used';
    }

    console.log(`✅ Vector embeddings enabled: ${config.provider}/${config.model}`);
    console.log(`   Base URL: ${this.baseUrl}`);
    console.log(`   Dimensions: ${config.dimensions || 'auto'}`);
  }

  /**
   * Check if embeddings are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Chunk text into smaller pieces for embedding
   * Uses sliding window with overlap to maintain context
   */
  private chunkText(text: string): string[] {
    if (text.length <= getChunkSize()) {
      return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + getChunkSize();
      
      // If this isn't the last chunk, try to break at a natural boundary
      if (end < text.length) {
        // Try to break at paragraph boundary
        const paragraphBreak = text.lastIndexOf('\n\n', end);
        if (paragraphBreak > start + getChunkSize() / 2) {
          end = paragraphBreak + 2;
        } else {
          // Try to break at sentence boundary
          const sentenceBreak = text.lastIndexOf('. ', end);
          if (sentenceBreak > start + getChunkSize() / 2) {
            end = sentenceBreak + 2;
          } else {
            // Try to break at word boundary
            const wordBreak = text.lastIndexOf(' ', end);
            if (wordBreak > start + getChunkSize() / 2) {
              end = wordBreak + 1;
            }
          }
        }
      }

      chunks.push(text.substring(start, end).trim());
      
      // Move start position with overlap for context continuity
      start = end - getChunkOverlap();
      if (start < 0) start = 0;
    }

    return chunks;
  }

  /**
   * Generate embedding for a single text
   * Automatically chunks large texts and averages embeddings
   * @deprecated Use generateChunkEmbeddings for industry-standard chunking
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.enabled) {
      throw new Error('Embeddings not enabled. Check embeddings.enabled in config');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    // Chunk text if it's too large
    const chunks = this.chunkText(text);
    
    // If only one chunk, process normally
    if (chunks.length === 1) {
      if (this.provider === 'copilot' || this.provider === 'openai' || this.provider === 'llama.cpp') {
        return this.generateOpenAIEmbedding(text);
      } else {
        return this.generateOllamaEmbedding(text);
      }
    }

    // For multiple chunks, generate embeddings for each and average them
    console.log(`📄 Chunking large text into ${chunks.length} pieces`);
    const embeddings: number[][] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        let result: EmbeddingResult;
        if (this.provider === 'copilot' || this.provider === 'openai' || this.provider === 'llama.cpp') {
          result = await this.generateOpenAIEmbedding(chunks[i]);
        } else {
          result = await this.generateOllamaEmbedding(chunks[i]);
        }
        embeddings.push(result.embedding);
        
        // Small delay between chunks to avoid overwhelming the API
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error: any) {
        console.warn(`⚠️  Failed to generate embedding for chunk ${i + 1}/${chunks.length}: ${error.message}`);
        // Continue with other chunks
      }
    }

    if (embeddings.length === 0) {
      throw new Error('Failed to generate embeddings for all chunks');
    }

    // Average the embeddings
    const dimensions = embeddings[0].length;
    const avgEmbedding = new Array(dimensions).fill(0);
    
    for (const emb of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        avgEmbedding[i] += emb[i];
      }
    }
    
    for (let i = 0; i < dimensions; i++) {
      avgEmbedding[i] /= embeddings.length;
    }

    return {
      embedding: avgEmbedding,
      dimensions: dimensions,
      model: this.model,
    };
  }

  /**
   * Generate separate embeddings for each chunk (Industry Standard)
   * Returns array of chunk embeddings with text, offsets, and metadata
   * Each chunk becomes a separate searchable unit
   */
  async generateChunkEmbeddings(text: string): Promise<ChunkEmbeddingResult[]> {
    if (!this.enabled) {
      throw new Error('Embeddings not enabled. Check embeddings.enabled in config');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embeddings for empty text');
    }

    const chunkSize = getChunkSize();
    const chunkOverlap = getChunkOverlap();
    const chunks: ChunkEmbeddingResult[] = [];
    
    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {
      let end = start + chunkSize;
      
      // If this isn't the last chunk, try to break at a natural boundary
      if (end < text.length) {
        // Try to break at paragraph boundary
        const paragraphBreak = text.lastIndexOf('\n\n', end);
        if (paragraphBreak > start + chunkSize / 2) {
          end = paragraphBreak + 2;
        } else {
          // Try to break at sentence boundary
          const sentenceBreak = text.lastIndexOf('. ', end);
          if (sentenceBreak > start + chunkSize / 2) {
            end = sentenceBreak + 2;
          } else {
            // Try to break at word boundary
            const wordBreak = text.lastIndexOf(' ', end);
            if (wordBreak > start + chunkSize / 2) {
              end = wordBreak + 1;
            }
          }
        }
      }

      const chunkText = text.substring(start, end).trim();
      
      if (chunkText.length > 0) {
        try {
          // Generate embedding for this chunk
          let result: EmbeddingResult;
          if (this.provider === 'copilot' || this.provider === 'openai' || this.provider === 'llama.cpp') {
            result = await this.generateOpenAIEmbedding(chunkText);
          } else {
            result = await this.generateOllamaEmbedding(chunkText);
          }

          chunks.push({
            text: chunkText,
            embedding: result.embedding,
            dimensions: result.dimensions,
            model: result.model,
            startOffset: start,
            endOffset: end,
            chunkIndex: chunkIndex
          });

          chunkIndex++;

          // Small delay between chunks to avoid overwhelming the API
          if (start + chunkSize < text.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (error: any) {
          console.warn(`⚠️  Failed to generate embedding for chunk ${chunkIndex}: ${error.message}`);
          // Continue with other chunks
        }
      }
      
      // Move start position with overlap for context continuity
      start = end - chunkOverlap;
      if (start < 0) start = 0;
      
      // Prevent infinite loop
      if (start >= end) {
        start = end;
      }
    }

    if (chunks.length === 0) {
      throw new Error('Failed to generate embeddings for any chunks');
    }

    console.log(`📄 Generated ${chunks.length} chunk embeddings for text (${text.length} chars)`);
    return chunks;
  }

  /**
   * Retry wrapper for embedding generation with exponential backoff
   * Handles EOF errors, 503 (model loading), and other transient failures from Ollama
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    operation: string,
    maxRetries: number = getMaxRetries()
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Check for retryable errors
        const isEOFError = error.message?.includes('EOF') || 
                          error.message?.includes('unexpected end') ||
                          error.code === 'ECONNRESET';
        
        const isModelLoading = error.message?.includes('503') || 
                              error.message?.includes('Loading model') ||
                              error.message?.includes('unavailable_error');
        
        const isFetchFailed = error.message?.includes('fetch failed');
        
        const isRetryable = isEOFError || isModelLoading || isFetchFailed;
        
        // Only retry on transient errors, not on other errors
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff with longer delays for model loading
        // Model loading: 3s, 6s, 12s, 20s
        // Other errors: 1s, 2s, 4s, 8s
        const baseDelay = isModelLoading ? 3000 : 1000;
        const delayMs = Math.min(baseDelay * Math.pow(2, attempt), 20000);
        
        const errorType = isModelLoading ? 'model loading' : 
                         isFetchFailed ? 'fetch failed' : 'EOF';
        
        console.warn(
          `⚠️  ${operation} failed with ${errorType} error (attempt ${attempt + 1}/${maxRetries + 1}). ` +
          `Retrying in ${delayMs}ms...`
        );
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw lastError || new Error(`${operation} failed after ${maxRetries + 1} attempts`);
  }

  /**
   * Generate embedding using Ollama
   */
  private async generateOllamaEmbedding(text: string): Promise<EmbeddingResult> {
    return this.retryWithBackoff(async () => {
      try {
        // Simple concatenation: base URL + path
        const baseUrl = process.env.MIMIR_EMBEDDINGS_API || this.baseUrl || 'http://localhost:11434';
        const embeddingsPath = process.env.MIMIR_EMBEDDINGS_API_PATH || '/api/embeddings';
        const embeddingsUrl = `${baseUrl}${embeddingsPath}`;
        const apiKey = process.env.MIMIR_EMBEDDINGS_API_KEY;
        
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (apiKey && apiKey !== 'dummy-key') {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        const fetchOptions = createSecureFetchOptions(embeddingsUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.model,
            prompt: text,
          }),
        });
        
        const response = await fetch(embeddingsUrl, fetchOptions);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        
        if (!data.embedding || !Array.isArray(data.embedding)) {
          throw new Error('Invalid response from Ollama: missing embedding array');
        }

        return {
          embedding: data.embedding,
          dimensions: data.embedding.length,
          model: this.model,
        };

      } catch (error: any) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. Make sure Ollama is running.`);
        }
        throw error;
      }
    }, `Ollama embedding (${text.substring(0, 50)}...)`);
  }

  /**
   * Generate embedding using OpenAI/Copilot/llama.cpp API (all use OpenAI-compatible format)
   */
  private async generateOpenAIEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      // Simple concatenation: base URL + path
      const baseUrl = process.env.MIMIR_EMBEDDINGS_API || this.baseUrl || 'http://localhost:11434';
      const embeddingsPath = process.env.MIMIR_EMBEDDINGS_API_PATH || '/v1/embeddings';
      const embeddingsUrl = `${baseUrl}${embeddingsPath}`;
      const apiKey = process.env.MIMIR_EMBEDDINGS_API_KEY || this.apiKey;
      
      // Build headers - llama.cpp doesn't need Authorization header
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Only add Authorization if we have a key and not llama.cpp
      if (this.provider !== 'llama.cpp' && apiKey && apiKey !== 'dummy-key') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      const requestBody = JSON.stringify({
        model: this.model,
        input: text,
      });
      
      const fetchOptions = createSecureFetchOptions(embeddingsUrl, {
        method: 'POST',
        headers,
        body: requestBody,
      });
      
      const response = await fetch(embeddingsUrl, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('Invalid response from OpenAI: missing data array');
      }

      const embedding = data.data[0].embedding;
      
      if (!Array.isArray(embedding)) {
        throw new Error('Invalid response from OpenAI: embedding is not an array');
      }

      return {
        embedding: embedding,
        dimensions: embedding.length,
        model: this.model,
      };

    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to OpenAI API at ${this.baseUrl}. Make sure copilot-api is running.`);
      }
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.enabled) {
      throw new Error('Embeddings not enabled');
    }

    const results: EmbeddingResult[] = [];
    
    for (const text of texts) {
      if (text && text.trim().length > 0) {
        const result = await this.generateEmbedding(text);
        results.push(result);
      } else {
        // Push empty placeholder for empty texts
        results.push({
          embedding: [],
          dimensions: 0,
          model: this.model,
        });
      }
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find most similar embeddings using cosine similarity
   */
  findMostSimilar(
    query: number[],
    candidates: Array<{ embedding: number[]; metadata: any }>,
    topK: number = 5
  ): Array<{ similarity: number; metadata: any }> {
    const similarities = candidates.map(candidate => ({
      similarity: this.cosineSimilarity(query, candidate.embedding),
      metadata: candidate.metadata,
    }));

    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, topK);
  }

  /**
   * Verify embedding model is available
   */
  async verifyModel(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    if (this.provider === 'copilot' || this.provider === 'openai') {
      return this.verifyOpenAIModel();
    } else {
      return this.verifyOllamaModel();
    }
  }

  /**
   * Verify Ollama model is available
   */
  private async verifyOllamaModel(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      
      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      const models = data.models || [];
      
      const modelExists = models.some((m: any) => m.name.includes(this.model));
      
      if (!modelExists) {
        console.warn(`⚠️  Embeddings model '${this.model}' not found in Ollama`);
        console.warn(`   Run: ollama pull ${this.model}`);
      }

      return modelExists;

    } catch (error) {
      console.error('Error verifying Ollama model:', error);
      return false;
    }
  }

  /**
   * Verify OpenAI/Copilot model is available
   */
  private async verifyOpenAIModel(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        console.warn(`⚠️  Cannot verify OpenAI model availability (${response.status})`);
        console.warn(`   Make sure copilot-api is running: copilot-api start`);
        return false;
      }

      const data = await response.json();
      const models = data.data || [];
      
      // Check if model exists in available models
      const modelExists = models.some((m: any) => 
        m.id === this.model || m.id.includes(this.model)
      );
      
      if (!modelExists) {
        console.warn(`⚠️  Embeddings model '${this.model}' not found in available models`);
        console.warn(`   Available embedding models: text-embedding-ada-002, text-embedding-3-small, text-embedding-3-large`);
      }

      return modelExists;

    } catch (error) {
      console.error('Error verifying OpenAI model:', error);
      return false;
    }
  }
}
