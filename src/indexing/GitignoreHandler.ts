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
   * Load .gitignore file from a folder
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
   * Add custom ignore patterns
   */
  addPatterns(patterns: string[]): void {
    this.ig.add(patterns);
  }

  /**
   * Check if a file path should be ignored
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
   * Filter an array of file paths
   */
  filterPaths(filePaths: string[], rootPath: string): string[] {
    return filePaths.filter(filePath => !this.shouldIgnore(filePath, rootPath));
  }
}
