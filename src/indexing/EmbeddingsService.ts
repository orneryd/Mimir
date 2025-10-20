/**
 * @file src/indexing/EmbeddingsService.ts
 * @description Vector embeddings service for Ollama
 * 
 * Supports generating embeddings for text content and semantic search.
 * Feature flag controlled via LLM configuration.
 */

import { LLMConfigLoader } from '../config/LLMConfigLoader.js';

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
  model: string;
}

export interface TextChunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

export class EmbeddingsService {
  private configLoader: LLMConfigLoader;
  private enabled: boolean = false;
  private baseUrl: string = 'http://localhost:11434';
  private model: string = 'nomic-embed-text';

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
    this.model = config.model;
    
    // Get provider base URL
    const llmConfig = await this.configLoader.load();
    const providerConfig = llmConfig.providers[config.provider];
    if (providerConfig?.baseUrl) {
      this.baseUrl = providerConfig.baseUrl;
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
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.enabled) {
      throw new Error('Embeddings not enabled. Set features.vectorEmbeddings=true in config');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
      });

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
   * Split text into chunks for embedding
   */
  async chunkText(text: string): Promise<TextChunk[]> {
    const config = await this.configLoader.getEmbeddingsConfig();
    const chunkSize = config?.chunkSize || 512;
    const chunkOverlap = config?.chunkOverlap || 50;

    const chunks: TextChunk[] = [];
    const lines = text.split('\n');
    
    let currentChunk = '';
    let startOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const potentialChunk = currentChunk + (currentChunk ? '\n' : '') + line;

      if (potentialChunk.length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          text: currentChunk,
          startOffset: startOffset,
          endOffset: startOffset + currentChunk.length,
        });

        // Start new chunk with overlap
        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = overlapText + '\n' + line;
        startOffset = startOffset + currentChunk.length - overlapText.length - 1;
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push({
        text: currentChunk,
        startOffset: startOffset,
        endOffset: startOffset + currentChunk.length,
      });
    }

    return chunks;
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
   * Verify Ollama model is available
   */
  async verifyModel(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

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
}
