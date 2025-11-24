/**
 * DocumentParser - Extracts text content from binary document formats
 * Supports PDF and DOCX files for indexing and embedding generation
 */

import * as mammoth from 'mammoth';

export class DocumentParser {
  /**
   * Extract plain text from PDF or DOCX files for indexing
   * 
   * Parses binary document formats and extracts readable text content.
   * Used by FileIndexer to make documents searchable and embeddable.
   * Automatically detects format from extension and uses appropriate parser.
   * 
   * Supported Formats:
   * - **PDF**: Uses pdf-parse library for text extraction
   * - **DOCX**: Uses mammoth library for text extraction
   * 
   * @param buffer - File content as Buffer
   * @param extension - File extension (.pdf, .docx)
   * @returns Extracted plain text content
   * @throws {Error} If format is unsupported or extraction fails
   * 
   * @example
   * // Extract text from PDF file
   * const parser = new DocumentParser();
   * const pdfBuffer = await fs.readFile('/path/to/document.pdf');
   * const text = await parser.extractText(pdfBuffer, '.pdf');
   * console.log('Extracted', text.length, 'characters');
   * console.log('First 100 chars:', text.substring(0, 100));
   * 
   * @example
   * // Extract text from DOCX file
   * const docxBuffer = await fs.readFile('/path/to/document.docx');
   * const text = await parser.extractText(docxBuffer, '.docx');
   * console.log('Document text:', text);
   * 
   * @example
   * // Handle extraction errors
   * try {
   *   const buffer = await fs.readFile('/path/to/doc.pdf');
   *   const text = await parser.extractText(buffer, '.pdf');
   *   if (text.length === 0) {
   *     console.warn('Document is empty');
   *   }
   * } catch (error) {
   *   if (error.message.includes('no extractable text')) {
   *     console.log('PDF is image-based or encrypted');
   *   } else {
   *     console.error('Extraction failed:', error.message);
   *   }
   * }
   * 
   * @example
   * // Use in file indexing pipeline
   * const files = await glob('docs/*.{pdf,docx}');
   * for (const file of files) {
   *   const buffer = await fs.readFile(file);
   *   const ext = path.extname(file);
   *   const text = await parser.extractText(buffer, ext);
   *   await indexDocument(file, text);
   * }
   */
  async extractText(buffer: Buffer, extension: string): Promise<string> {
    try {
      if (extension === '.pdf') {
        return await this.extractPdfText(buffer);
      } else if (extension === '.docx') {
        return await this.extractDocxText(buffer);
      } else {
        throw new Error(`Unsupported document format: ${extension}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to extract text from ${extension}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Extract text from PDF using pdf-parse
   * @param buffer PDF file buffer
   * @returns Extracted text content
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    // pdf-parse exports PDFParse as a named export
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    
    // getText() returns TextResult object with text property
    if (!textResult.text || textResult.text.trim().length === 0) {
      throw new Error('PDF contains no extractable text content');
    }
    
    return textResult.text;
  }

  /**
   * Extract text from DOCX using mammoth
   * @param buffer DOCX file buffer
   * @returns Extracted text content
   */
  private async extractDocxText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    
    // mammoth returns { value: string, messages: [] }
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('DOCX contains no extractable text content');
    }
    
    // Log warnings if any (e.g., unsupported features)
    if (result.messages && result.messages.length > 0) {
      console.warn('DOCX extraction warnings:', result.messages);
    }
    
    return result.value;
  }

  /**
   * Check if a file extension is supported for document parsing
   * 
   * Tests whether the parser can extract text from files with the given
   * extension. Use this before attempting extraction to avoid errors.
   * 
   * @param extension - File extension (e.g., '.pdf', '.docx')
   * @returns true if format is supported, false otherwise
   * 
   * @example
   * // Check before parsing
   * const parser = new DocumentParser();
   * const file = '/path/to/document.pdf';
   * const ext = path.extname(file);
   * 
   * if (parser.isSupportedFormat(ext)) {
   *   const buffer = await fs.readFile(file);
   *   const text = await parser.extractText(buffer, ext);
   *   console.log('Extracted:', text.length, 'chars');
   * } else {
   *   console.log('Unsupported format:', ext);
   * }
   * 
   * @example
   * // Filter files by supported formats
   * const allFiles = await glob('documents/*.*');
   * const supportedFiles = allFiles.filter(file => {
   *   const ext = path.extname(file);
   *   return parser.isSupportedFormat(ext);
   * });
   * console.log('Can parse', supportedFiles.length, 'files');
   * 
   * @example
   * // Build supported extensions list
   * const extensions = ['.pdf', '.docx', '.txt', '.md', '.doc'];
   * const supported = extensions.filter(ext => parser.isSupportedFormat(ext));
   * console.log('Supported:', supported.join(', '));
   * // Output: Supported: .pdf, .docx
   */
  isSupportedFormat(extension: string): boolean {
    return ['.pdf', '.docx'].includes(extension.toLowerCase());
  }
}
