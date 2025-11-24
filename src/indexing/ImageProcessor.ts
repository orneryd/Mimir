/**
 * @file src/indexing/ImageProcessor.ts
 * @description Image processing utilities for vision-language models
 * 
 * Handles:
 * - Automatic image resizing to fit within VL model limits
 * - Aspect ratio preservation
 * - Base64 encoding for API transmission
 */

import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ProcessedImage {
  buffer: Buffer;
  base64: string;
  wasResized: boolean;
  originalSize: { width: number; height: number };
  processedSize: { width: number; height: number };
  format: string;
  sizeBytes: number;
}

export interface ImageProcessorConfig {
  maxPixels: number;      // Maximum total pixels (e.g., 3211264 for ~1792×1792)
  targetSize: number;     // Target dimension for largest side
  resizeQuality: number;  // JPEG quality (1-100)
}

export class ImageProcessor {
  private config: ImageProcessorConfig;

  constructor(config: ImageProcessorConfig) {
    this.config = config;
  }

  /**
   * Check if a file is a supported image format
   */
  static isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext);
  }

  /**
   * Prepare an image for VL model processing
   * Automatically resizes if needed, converts to Base64
   */
  async prepareImageForVL(imagePath: string): Promise<ProcessedImage> {
    // Read image and get metadata
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error(`Unable to read image dimensions: ${imagePath}`);
    }

    const currentPixels = metadata.width * metadata.height;
    const originalSize = { width: metadata.width, height: metadata.height };

    let processedBuffer: Buffer;
    let processedSize = originalSize;
    let wasResized = false;

    // Check if resize is needed
    if (currentPixels > this.config.maxPixels) {
      const result = await this.resizeImage(image, metadata);
      processedBuffer = result.buffer;
      processedSize = result.size;
      wasResized = true;
    } else {
      // No resize needed, just convert to buffer
      processedBuffer = await image.toBuffer();
    }

    // Convert to Base64
    const base64 = processedBuffer.toString('base64');

    return {
      buffer: processedBuffer,
      base64,
      wasResized,
      originalSize,
      processedSize,
      format: metadata.format || 'unknown',
      sizeBytes: processedBuffer.length
    };
  }

  /**
   * Resize image to fit within maxPixels while preserving aspect ratio
   */
  private async resizeImage(
    image: sharp.Sharp,
    metadata: sharp.Metadata
  ): Promise<{ buffer: Buffer; size: { width: number; height: number } }> {
    const { width, height } = metadata;
    if (!width || !height) {
      throw new Error('Invalid image dimensions');
    }

    // Calculate scale factor to fit within maxPixels
    const currentPixels = width * height;
    const scale = Math.sqrt(this.config.maxPixels / currentPixels);

    // Calculate new dimensions
    let newWidth = Math.floor(width * scale);
    let newHeight = Math.floor(height * scale);

    // Alternative: Use targetSize for largest dimension (more conservative)
    const aspectRatio = width / height;
    if (aspectRatio > 1) {
      // Landscape
      newWidth = Math.min(newWidth, this.config.targetSize);
      newHeight = Math.floor(newWidth / aspectRatio);
    } else {
      // Portrait or square
      newHeight = Math.min(newHeight, this.config.targetSize);
      newWidth = Math.floor(newHeight * aspectRatio);
    }

    // Perform resize
    const buffer = await image
      .resize(newWidth, newHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: this.config.resizeQuality })
      .toBuffer();

    return {
      buffer,
      size: { width: newWidth, height: newHeight }
    };
  }

  /**
   * Create a Data URL for image (for API transmission)
   */
  createDataURL(base64: string, format: string): string {
    const mimeType = this.getMimeType(format);
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Get MIME type from image format
   */
  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'jpeg': 'image/jpeg',
      'jpg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'tiff': 'image/tiff'
    };
    return mimeTypes[format.toLowerCase()] || 'image/jpeg';
  }
}
