/**
 * @file testing/indexing/VLService.test.ts
 * @description Unit tests for VLService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VLService } from '../../src/indexing/VLService.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('VLService', () => {
  let service: VLService;
  const mockConfig = {
    provider: 'llama.cpp',
    api: 'http://localhost:8080',
    apiPath: '/v1/chat/completions',
    apiKey: 'test-key',
    model: 'qwen2.5-vl',
    contextSize: 131072,
    maxTokens: 2048,
    temperature: 0.7
  };

  beforeEach(() => {
    service = new VLService(mockConfig);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(service).toBeInstanceOf(VLService);
    });
  });

  describe('describeImage', () => {
    it('should generate description from image data URL', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'A test image showing a red square'
          }
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const testDataURL = 'data:image/jpeg;base64,test123';
      const result = await service.describeImage(testDataURL);

      expect(result.description).toBe('A test image showing a red square');
      expect(result.model).toBe('qwen2.5-vl');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      
      // Verify fetch was called with correct parameters
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          })
        })
      );
    });

    it('should use custom prompt when provided', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'The image contains text'
          }
        }]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const testDataURL = 'data:image/png;base64,test456';
      const customPrompt = 'Extract any text from this image';
      
      await service.describeImage(testDataURL, customPrompt);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.messages[0].content[0].text).toBe(customPrompt);
    });

    it('should include image in request', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Description'
          }
        }]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const testDataURL = 'data:image/jpeg;base64,abc123';
      await service.describeImage(testDataURL);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.messages[0].content).toHaveLength(2);
      expect(requestBody.messages[0].content[1].type).toBe('image_url');
      expect(requestBody.messages[0].content[1].image_url.url).toBe(testDataURL);
    });

    it('should respect maxTokens and temperature config', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Test'
          }
        }]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await service.describeImage('data:image/jpeg;base64,test');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.max_tokens).toBe(2048);
      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.model).toBe('qwen2.5-vl');
    });

    it('should throw error on API failure', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });

      const testDataURL = 'data:image/jpeg;base64,test';
      
      await expect(service.describeImage(testDataURL)).rejects.toThrow('Failed to generate image description');
    });

    it('should throw error on invalid response format', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' })
      });

      const testDataURL = 'data:image/jpeg;base64,test';
      
      await expect(service.describeImage(testDataURL)).rejects.toThrow('Failed to generate image description');
    });

    it('should throw error on network failure', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const testDataURL = 'data:image/jpeg;base64,test';
      
      await expect(service.describeImage(testDataURL)).rejects.toThrow('Failed to generate image description');
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Test response'
          }
        }]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await service.testConnection();
      
      expect(result).toBe(true);
    });

    it('should return false on connection failure', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.testConnection();
      
      expect(result).toBe(false);
    });

    it('should use minimal test image', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Test'
          }
        }]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await service.testConnection();

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const imageURL = requestBody.messages[0].content[1].image_url.url;
      
      expect(imageURL).toMatch(/^data:image\/png;base64,/);
      expect(imageURL.length).toBeLessThan(200); // Small test image
    });
  });

  describe('error handling', () => {
    it('should handle timeout errors gracefully', async () => {
      (global.fetch as any).mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const testDataURL = 'data:image/jpeg;base64,test';
      
      await expect(service.describeImage(testDataURL)).rejects.toThrow();
    });

    it('should handle malformed JSON response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      const testDataURL = 'data:image/jpeg;base64,test';
      
      await expect(service.describeImage(testDataURL)).rejects.toThrow();
    });
  });
});
