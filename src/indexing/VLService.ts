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
   * Generate a text description of an image using VL model
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
   * Test VL service connectivity
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
