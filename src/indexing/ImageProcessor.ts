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
   * 
   * @param filePath - Path to file to check
   * @returns true if file extension is a supported image format
   * 
   * @example
   * if (ImageProcessor.isImageFile('/path/to/photo.jpg')) {
   *   console.log('Image file detected');
   * }
   * 
   * @example
   * const files = await readdir('/images');
   * const images = files.filter(f => ImageProcessor.isImageFile(f));
   * console.log('Found', images.length, 'images');
   */
  static isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext);
  }

  /**
   * Prepare an image for vision-language model processing
   * 
   * Automatically resizes large images to fit within VL model limits while
   * preserving aspect ratio. Converts to Base64 for API transmission.
   * 
   * @param imagePath - Absolute path to image file
   * @returns Processed image with metadata and Base64 encoding
   * @throws {Error} If image cannot be read or processed
   * 
   * @example
   * const processor = new ImageProcessor({
   *   maxPixels: 3211264,
   *   targetSize: 1792,
   *   resizeQuality: 85
   * });
   * 
   * const result = await processor.prepareImageForVL('/path/to/large-image.jpg');
   * if (result.wasResized) {
   *   console.log('Resized from', result.originalSize, 'to', result.processedSize);
   * }
   * console.log('Base64 size:', result.base64.length, 'chars');
   * 
   * @example
   * // Process image for VL API
   * const processed = await processor.prepareImageForVL(imagePath);
   * const dataURL = processor.createDataURL(processed.base64, processed.format);
   * await vlModel.describeImage(dataURL);
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
   * 
   * Formats Base64 image data as a data URL with proper MIME type.
   * Used for sending images to vision-language APIs.
   * 
   * @param base64 - Base64-encoded image data
   * @param format - Image format (jpeg, png, webp, etc.)
   * @returns Data URL string ready for API transmission
   * 
   * @example
   * const processed = await processor.prepareImageForVL(imagePath);
   * const dataURL = processor.createDataURL(processed.base64, processed.format);
   * console.log('Data URL:', dataURL.substring(0, 50) + '...');
   * // Output: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA...
   * 
   * @example
   * // Send to VL API
   * const dataURL = processor.createDataURL(base64, 'png');
   * const response = await fetch('https://api.vl-model.com/describe', {
   *   method: 'POST',
   *   body: JSON.stringify({ image: dataURL })
   * });
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
