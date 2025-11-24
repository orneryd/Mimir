// ============================================================================
// GitignoreHandler - Parse and apply .gitignore rules
// ============================================================================

import ignore, { Ignore } from 'ignore';
import { promises as fs } from 'fs';
import path from 'path';

export class GitignoreHandler {
  private ig: Ignore;

  constructor() {
    this.ig = ignore();
    // Add common patterns that should always be ignored
    this.ig.add([
      'node_modules/',
      '.git/',
      '.DS_Store',
      '*.log',
      'build/',
      'dist/',
      'package-lock.json'  // Always exclude lock files from indexing
    ]);
  }

  /**
   * Load .gitignore file from a folder and add patterns to ignore list
   * 
   * Reads the .gitignore file from the specified folder and adds all patterns
   * to the ignore matcher. If the file doesn't exist, silently continues with
   * default patterns. Handles both standard gitignore syntax and comments.
   * 
   * @param folderPath - Absolute path to folder containing .gitignore
   * 
   * @example
   * // Load .gitignore from project root
   * const handler = new GitignoreHandler();
   * await handler.loadIgnoreFile('/Users/user/my-project');
   * console.log('Loaded .gitignore patterns');
   * 
   * @example
   * // Load from nested directory
   * const handler = new GitignoreHandler();
   * await handler.loadIgnoreFile('/Users/user/my-project/packages/api');
   * // Patterns from this .gitignore are added to defaults
   * 
   * @example
   * // Handle missing .gitignore gracefully
   * const handler = new GitignoreHandler();
   * await handler.loadIgnoreFile('/Users/user/new-project');
   * // No error thrown - uses default patterns only
   */
  async loadIgnoreFile(folderPath: string): Promise<void> {
    const gitignorePath = path.join(folderPath, '.gitignore');
    
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      this.ig.add(content);
      console.log(`✅ Loaded .gitignore from ${gitignorePath}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`⚠️  Failed to load .gitignore: ${error.message}`);
      }
      // If .gitignore doesn't exist, that's fine - use defaults
    }
  }

  /**
   * Add custom ignore patterns to the ignore list
   * 
   * Adds additional patterns to ignore beyond .gitignore and defaults.
   * Useful for programmatically excluding specific files or directories.
   * Supports standard gitignore pattern syntax including wildcards.
   * 
   * @param patterns - Array of gitignore-style patterns to add
   * 
   * @example
   * // Add custom patterns for temporary files
   * const handler = new GitignoreHandler();
   * handler.addPatterns([
   *   '*.tmp',
   *   '*.bak',
   *   'temp/',
   *   '.cache/'
   * ]);
   * 
   * @example
   * // Exclude specific directories
   * handler.addPatterns([
   *   'coverage/',
   *   'test-results/',
   *   '.vscode/'
   * ]);
   * 
   * @example
   * // Add patterns from configuration
   * const config = { ignorePatterns: ['*.secret', 'private/'] };
   * handler.addPatterns(config.ignorePatterns);
   */
  addPatterns(patterns: string[]): void {
    this.ig.add(patterns);
  }

  /**
   * Check if a file path should be ignored based on patterns
   * 
   * Tests whether a file path matches any ignore patterns from .gitignore,
   * defaults, or custom patterns. Uses relative path from root for matching.
   * 
   * @param filePath - Absolute path to file to check
   * @param rootPath - Absolute path to root directory
   * @returns true if file should be ignored, false otherwise
   * 
   * @example
   * // Check if file should be ignored
   * const handler = new GitignoreHandler();
   * await handler.loadIgnoreFile('/Users/user/project');
   * 
   * const shouldSkip = handler.shouldIgnore(
   *   '/Users/user/project/node_modules/package/index.js',
   *   '/Users/user/project'
   * );
   * console.log('Skip file:', shouldSkip); // true
   * 
   * @example
   * // Filter files during directory traversal
   * const files = await readdir('/Users/user/project');
   * for (const file of files) {
   *   const fullPath = path.join('/Users/user/project', file);
   *   if (handler.shouldIgnore(fullPath, '/Users/user/project')) {
   *     console.log('Skipping:', file);
   *     continue;
   *   }
   *   await processFile(fullPath);
   * }
   * 
   * @example
   * // Check multiple files
   * const filesToCheck = [
   *   '/Users/user/project/src/index.ts',
   *   '/Users/user/project/dist/bundle.js',
   *   '/Users/user/project/.env'
   * ];
   * 
   * filesToCheck.forEach(file => {
   *   const ignored = handler.shouldIgnore(file, '/Users/user/project');
   *   console.log(file, ignored ? 'IGNORED' : 'OK');
   * });
   */
  shouldIgnore(filePath: string, rootPath: string): boolean {
    // Get relative path from root
    const relativePath = path.relative(rootPath, filePath);
    
    // Empty path means root directory - don't ignore
    if (!relativePath || relativePath === '.') {
      return false;
    }
    
    // Check if ignored
    return this.ig.ignores(relativePath);
  }

  /**
   * Filter an array of file paths, removing ignored files
   * 
   * Convenience method to filter a list of file paths, keeping only files
   * that should not be ignored. Useful for batch processing of file lists.
   * 
   * @param filePaths - Array of absolute file paths to filter
   * @param rootPath - Absolute path to root directory
   * @returns Array of file paths that should not be ignored
   * 
   * @example
   * // Filter file list from directory scan
   * const handler = new GitignoreHandler();
   * await handler.loadIgnoreFile('/Users/user/project');
   * 
   * const allFiles = [
   *   '/Users/user/project/src/index.ts',
   *   '/Users/user/project/node_modules/lib.js',
   *   '/Users/user/project/dist/bundle.js',
   *   '/Users/user/project/README.md'
   * ];
   * 
   * const validFiles = handler.filterPaths(allFiles, '/Users/user/project');
   * console.log('Files to process:', validFiles.length);
   * // Output: ['/Users/user/project/src/index.ts', '/Users/user/project/README.md']
   * 
   * @example
   * // Use with glob results
   * const globFiles = await glob('/Users/user/project/src/*.ts');
   * const filtered = handler.filterPaths(globFiles, '/Users/user/project');
   * console.log('TypeScript files to index:', filtered.length);
   * 
   * @example
   * // Chain with other filters
   * const allFiles = await getAllFiles('/Users/user/project');
   * const validFiles = handler.filterPaths(allFiles, '/Users/user/project')
   *   .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
   *   .filter(f => f.indexOf('.test.') === -1);
   * 
   * console.log('Final file count:', validFiles.length);
   */
  filterPaths(filePaths: string[], rootPath: string): string[] {
    return filePaths.filter(filePath => !this.shouldIgnore(filePath, rootPath));
  }
}
