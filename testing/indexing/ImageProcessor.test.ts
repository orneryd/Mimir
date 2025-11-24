/**
 * @file testing/indexing/ImageProcessor.test.ts
 * @description Unit tests for ImageProcessor
 * 
 * NOTE: These tests create temporary test images in /tmp for testing.
 * No external services are required. Files are cleaned up after tests.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ImageProcessor } from '../../src/indexing/ImageProcessor.js';
import sharp from 'sharp';
import * as fs from 'fs/promises';

describe('ImageProcessor', () => {
  let processor: ImageProcessor;
  const testFiles: string[] = [];

  beforeEach(() => {
    processor = new ImageProcessor({
      maxPixels: 3211264, // ~1792×1792
      targetSize: 1536,
      resizeQuality: 90
    });
  });

  afterAll(async () => {
    // Clean up test files
    for (const file of testFiles) {
      try {
        await fs.unlink(file);
      } catch (e) {
        // Ignore errors - file may not exist
      }
    }
  });

  describe('isImageFile', () => {
    it('should identify image files correctly', () => {
      expect(ImageProcessor.isImageFile('photo.jpg')).toBe(true);
      expect(ImageProcessor.isImageFile('photo.jpeg')).toBe(true);
      expect(ImageProcessor.isImageFile('photo.png')).toBe(true);
      expect(ImageProcessor.isImageFile('photo.webp')).toBe(true);
      expect(ImageProcessor.isImageFile('photo.gif')).toBe(true);
      expect(ImageProcessor.isImageFile('photo.bmp')).toBe(true);
      expect(ImageProcessor.isImageFile('photo.tiff')).toBe(true);
    });

    it('should reject non-image files', () => {
      expect(ImageProcessor.isImageFile('document.pdf')).toBe(false);
      expect(ImageProcessor.isImageFile('code.ts')).toBe(false);
      expect(ImageProcessor.isImageFile('data.json')).toBe(false);
      expect(ImageProcessor.isImageFile('video.mp4')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(ImageProcessor.isImageFile('PHOTO.JPG')).toBe(true);
      expect(ImageProcessor.isImageFile('Photo.PNG')).toBe(true);
    });
  });

  describe('prepareImageForVL', () => {
    it('should process small images without resizing', async () => {
      // Create a small test image (100×100)
      const testImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
        .jpeg()
        .toBuffer();

      const tempPath = '/tmp/test-small-image.jpg';
      testFiles.push(tempPath);
      await sharp(testImage).toFile(tempPath);

      const result = await processor.prepareImageForVL(tempPath);

      expect(result.wasResized).toBe(false);
      expect(result.originalSize.width).toBe(100);
      expect(result.originalSize.height).toBe(100);
      expect(result.processedSize.width).toBe(100);
      expect(result.processedSize.height).toBe(100);
      expect(result.base64).toBeTruthy();
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should resize large images', async () => {
      // Create a large test image (2560×1440 = 3.69 MP, exceeds 3.21 MP limit)
      const testImage = await sharp({
        create: {
          width: 2560,
          height: 1440,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      })
        .jpeg()
        .toBuffer();

      const tempPath = '/tmp/test-large-image.jpg';
      testFiles.push(tempPath);
      await sharp(testImage).toFile(tempPath);

      const result = await processor.prepareImageForVL(tempPath);

      expect(result.wasResized).toBe(true);
      expect(result.originalSize.width).toBe(2560);
      expect(result.originalSize.height).toBe(1440);
      expect(result.processedSize.width).toBeLessThan(2560);
      expect(result.processedSize.height).toBeLessThan(1440);
      
      // Verify aspect ratio is preserved
      const originalAspect = result.originalSize.width / result.originalSize.height;
      const processedAspect = result.processedSize.width / result.processedSize.height;
      expect(Math.abs(originalAspect - processedAspect)).toBeLessThan(0.01);
      
      // Verify it's within limits
      const processedPixels = result.processedSize.width * result.processedSize.height;
      expect(processedPixels).toBeLessThanOrEqual(3211264);
    });

    it('should preserve aspect ratio for portrait images', async () => {
      // Create a portrait image (1080×1920)
      const testImage = await sharp({
        create: {
          width: 1080,
          height: 1920,
          channels: 3,
          background: { r: 0, g: 0, b: 255 }
        }
      })
        .jpeg()
        .toBuffer();

      const tempPath = '/tmp/test-portrait-image.jpg';
      testFiles.push(tempPath);
      await sharp(testImage).toFile(tempPath);

      const result = await processor.prepareImageForVL(tempPath);

      expect(result.wasResized).toBe(false); // 1080×1920 = 2.07 MP, within limit
      
      const originalAspect = result.originalSize.width / result.originalSize.height;
      const processedAspect = result.processedSize.width / result.processedSize.height;
      expect(Math.abs(originalAspect - processedAspect)).toBeLessThan(0.01);
    });

    it('should handle square images', async () => {
      // Create a square image (1792×1792 = 3.21 MP, at the limit)
      const testImage = await sharp({
        create: {
          width: 1792,
          height: 1792,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      })
        .jpeg()
        .toBuffer();

      const tempPath = '/tmp/test-square-image.jpg';
      testFiles.push(tempPath);
      await sharp(testImage).toFile(tempPath);

      const result = await processor.prepareImageForVL(tempPath);

      expect(result.wasResized).toBe(false); // At the limit, no resize needed
      expect(result.originalSize.width).toBe(1792);
      expect(result.originalSize.height).toBe(1792);
    });
  });

  describe('createDataURL', () => {
    it('should create valid data URL for JPEG', () => {
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataURL = processor.createDataURL(base64, 'jpeg');
      
      expect(dataURL).toMatch(/^data:image\/jpeg;base64,/);
      expect(dataURL).toContain(base64);
    });

    it('should create valid data URL for PNG', () => {
      const base64 = 'test123';
      const dataURL = processor.createDataURL(base64, 'png');
      
      expect(dataURL).toBe('data:image/png;base64,test123');
    });

    it('should handle different formats', () => {
      const base64 = 'test';
      
      expect(processor.createDataURL(base64, 'webp')).toMatch(/^data:image\/webp;base64,/);
      expect(processor.createDataURL(base64, 'gif')).toMatch(/^data:image\/gif;base64,/);
      expect(processor.createDataURL(base64, 'bmp')).toMatch(/^data:image\/bmp;base64,/);
    });

    it('should default to jpeg for unknown formats', () => {
      const base64 = 'test';
      const dataURL = processor.createDataURL(base64, 'unknown');
      
      expect(dataURL).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  describe('configuration', () => {
    it('should respect custom maxPixels', async () => {
      const customProcessor = new ImageProcessor({
        maxPixels: 1000000, // 1 MP limit
        targetSize: 1024,
        resizeQuality: 90
      });

      // Create image that exceeds custom limit (1920×1080 = 2.07 MP)
      const testImage = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
        .jpeg()
        .toBuffer();

      const tempPath = '/tmp/test-custom-limit.jpg';
      testFiles.push(tempPath);
      await sharp(testImage).toFile(tempPath);

      const result = await customProcessor.prepareImageForVL(tempPath);

      expect(result.wasResized).toBe(true);
      const processedPixels = result.processedSize.width * result.processedSize.height;
      expect(processedPixels).toBeLessThanOrEqual(1000000);
    });

    it('should respect custom targetSize', async () => {
      const customProcessor = new ImageProcessor({
        maxPixels: 3211264,
        targetSize: 800, // Conservative target
        resizeQuality: 90
      });

      // Create large image
      const testImage = await sharp({
        create: {
          width: 3840,
          height: 2160,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
        .jpeg()
        .toBuffer();

      const tempPath = '/tmp/test-custom-target.jpg';
      testFiles.push(tempPath);
      await sharp(testImage).toFile(tempPath);

      const result = await customProcessor.prepareImageForVL(tempPath);

      expect(result.wasResized).toBe(true);
      expect(Math.max(result.processedSize.width, result.processedSize.height)).toBeLessThanOrEqual(800);
    });
  });
});
