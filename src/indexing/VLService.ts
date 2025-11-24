/**
 * @file src/indexing/VLService.ts
 * @description Vision-Language model service for generating image descriptions
 * 
 * Supports:
 * - llama.cpp (qwen2.5-vl via OpenAI-compatible API)
 * - Ollama (future support)
 */

import { createSecureFetchOptions } from '../utils/fetch-helper.js';

export interface VLConfig {
  provider: string;
  api: string;
  apiPath: string;
  apiKey: string;
  model: string;
  contextSize: number;
  maxTokens: number;
  temperature: number;
}

export interface VLDescriptionResult {
  description: string;
  model: string;
  tokensUsed: number;
  processingTimeMs: number;
}

export class VLService {
  private config: VLConfig;
  private enabled: boolean = false;

  constructor(config: VLConfig) {
    this.config = config;
    this.enabled = true;
  }

  /**
   * Generate a text description of an image using vision-language model
   * 
   * Sends image to VL model (e.g., qwen2.5-vl) to generate natural language
   * description. Used for making images searchable via text embeddings.
   * 
   * @param imageDataURL - Image as data URL (data:image/jpeg;base64,...)
   * @param prompt - Instruction prompt for VL model
   * @returns Description result with text, model info, and timing
   * @throws {Error} If VL service is disabled or API call fails
   * 
   * @example
   * const vlService = new VLService({
   *   provider: 'llama.cpp',
   *   api: 'http://localhost:8080',
   *   apiPath: '/v1/chat/completions',
   *   apiKey: 'none',
   *   model: 'qwen2.5-vl',
   *   contextSize: 4096,
   *   maxTokens: 500,
   *   temperature: 0.7
   * });
   * 
   * const result = await vlService.describeImage(dataURL);
   * console.log('Description:', result.description);
   * console.log('Processing time:', result.processingTimeMs, 'ms');
   * 
   * @example
   * // Custom prompt for specific analysis
   * const result = await vlService.describeImage(
   *   imageDataURL,
   *   'Describe the architecture diagram. What components are shown?'
   * );
   * console.log('Analysis:', result.description);
   * 
   * @example
   * // Use description for embedding
   * const vlResult = await vlService.describeImage(imageDataURL);
   * const embedding = await embeddingsService.generateEmbedding(vlResult.description);
   * await storeImageEmbedding(imagePath, embedding);
   */
  async describeImage(
    imageDataURL: string,
    prompt: string = "Describe this image in detail. What do you see?"
  ): Promise<VLDescriptionResult> {
    if (!this.enabled) {
      throw new Error('VL Service is not enabled');
    }

    const startTime = Date.now();

    try {
      const description = await this.callVLAPI(imageDataURL, prompt);
      const processingTimeMs = Date.now() - startTime;

      return {
        description,
        model: this.config.model,
        tokensUsed: 0, // Will be populated from API response if available
        processingTimeMs
      };
    } catch (error) {
      console.error('❌ VL Service error:', error);
      throw new Error(`Failed to generate image description: ${error}`);
    }
  }

  /**
   * Call VL API (OpenAI-compatible format)
   */
  private async callVLAPI(imageDataURL: string, prompt: string): Promise<string> {
    const url = `${this.config.api}${this.config.apiPath}`;

    const requestBody = {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataURL } }
          ]
        }
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature
    };

    // VL image processing can take 30-60 seconds, use longer timeout
    const timeoutMs = parseInt(process.env.MIMIR_EMBEDDINGS_VL_TIMEOUT || '120000', 10); // 2 minutes default
    
    const fetchOptions = createSecureFetchOptions(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs)
    });

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`VL API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Extract description from OpenAI-compatible response
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }

    throw new Error('Invalid response format from VL API');
  }

  /**
   * Test VL service connectivity and availability
   * 
   * Sends a minimal test image to verify the VL API is accessible
   * and responding correctly. Use during initialization.
   * 
   * @returns true if connection successful, false otherwise
   * 
   * @example
   * const vlService = new VLService(config);
   * const isAvailable = await vlService.testConnection();
   * if (isAvailable) {
   *   console.log('VL service ready');
   * } else {
   *   console.warn('VL service unavailable');
   * }
   * 
   * @example
   * // Check before enabling image indexing
   * if (await vlService.testConnection()) {
   *   await indexImagesWithDescriptions();
   * } else {
   *   console.log('Skipping image indexing - VL service offline');
   * }
   */
  async testConnection(): Promise<boolean> {
    try {
      // Create a tiny 1x1 test image
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const testDataURL = `data:image/png;base64,${testImageBase64}`;
      
      await this.describeImage(testDataURL, 'What color is this?');
      return true;
    } catch (error) {
      console.error('VL Service connection test failed:', error);
      return false;
    }
  }
}
