 /**
 * @fileoverview Cross-platform path utilities for workspace path translation
 * 
 * Handles path normalization between host systems (Windows/Mac/Linux) and
 * Docker container paths. Supports:
 * - Tilde (~) expansion to home directory
 * - Relative paths (../, ./)
 * - Windows drive letters (C:\, D:\)
 * - Unix absolute paths (/home/user)
 * - Consistent forward-slash normalization
 * 
 * @module utils/path-utils
 * @since 1.0.0
 */

import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';

/**
 * Normalize a path to Unix-style forward slashes
 * Converts Windows backslashes to forward slashes for consistency
 * 
 * @param filepath - Path to normalize
 * @returns Path with forward slashes
 * 
 * @example
 * ```ts
 * normalizeSlashes('C:\\Users\\john\\project') // => 'C:/Users/john/project'
 * normalizeSlashes('/home/user/project')       // => '/home/user/project'
 * ```
 */
/**
 * Normalize path slashes to forward slashes
 * @example normalizeSlashes('C:\\Users\\file') // => 'C:/Users/file'
 */
export function normalizeSlashes(filepath: string): string {
  return filepath.replace(/\\/g, '/');
}

/**
 * Expand tilde (~) to user's home directory
 * Handles both ~ and ~/ prefixes
 * 
 * @param filepath - Path that may start with ~
 * @returns Expanded path with home directory
 * 
 * @example
 * ```ts
 * expandTilde('~/Documents/file.txt')  // => '/Users/john/Documents/file.txt'
 * expandTilde('~')                      // => '/Users/john'
 * expandTilde('/absolute/path')         // => '/absolute/path'
 * ```
 */
/**
 * Expand tilde to home directory
 * @example expandTilde('~/src/project') // => '/Users/john/src/project'
 */
export function expandTilde(filepath: string): string {
  if (!filepath) return filepath;
  
  // Only expand if it starts with ~ or ~/
  if (filepath === '~') {
    return os.homedir();
  }
  
  if (filepath.startsWith('~/') || filepath.startsWith('~\\')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  
  return filepath;
}

/**
 * Normalize and resolve a path to its absolute form
 * 
 * Handles:
 * - Tilde expansion (~/)
 * - Relative paths (../, ./)
 * - Multiple slashes (//)
 * - Mixed slashes (\\ and /)
 * - Windows drive letters
 * 
 * @param filepath - Path to normalize
 * @param basePath - Optional base path for relative resolution (default: process.cwd())
 * @returns Absolute normalized path with forward slashes
 * 
 * @example
 * ```ts
 * normalizeAndResolve('~/project')           // => '/Users/john/project'
 * normalizeAndResolve('../other', '/home')   // => '/other'
 * normalizeAndResolve('C:\\Users\\file.txt') // => 'C:/Users/file.txt'
 * ```
 */
/**
 * Normalize and resolve path
 * @example normalizeAndResolve('~/project') // => '/Users/john/project'
 */
export function normalizeAndResolve(filepath: string, basePath?: string): string {
  if (!filepath) return filepath;
  
  // Step 1: Expand tilde
  let normalized = expandTilde(filepath);
  
  // Step 2: Normalize slashes to forward slashes
  normalized = normalizeSlashes(normalized);
  
  // Step 3: Check if this is already an absolute path
  // Windows absolute: starts with drive letter (C:/, D:/, etc.)
  // Unix absolute: starts with /
  const isWindowsAbsolute = /^[a-zA-Z]:\//.test(normalized);
  const isUnixAbsolute = normalized.startsWith('/');
  const isAbsolute = isWindowsAbsolute || isUnixAbsolute;
  
  // Step 4: Resolve to absolute path (only if not already absolute or if basePath provided)
  if (basePath) {
    normalized = path.resolve(basePath, normalized);
  } else if (!isAbsolute) {
    // Only resolve relative paths - don't resolve absolute paths as they'd get prefixed with cwd
    normalized = path.resolve(normalized);
  }
  // If already absolute, keep as-is
  
  // Step 5: Final slash normalization (resolve might add backslashes on Windows)
  normalized = normalizeSlashes(normalized);
  
  // Step 6: Remove trailing slashes (except for root)
  // Remove all trailing slashes, not just one
  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/, '');
  }
  
  // Step 7: Collapse multiple consecutive slashes into single slash
  normalized = normalized.replace(/\/\/+/g, '/');
  
  return normalized;
}

/**
 * Get the host workspace root from environment with expansion
 * 
 * Resolves HOST_WORKSPACE_ROOT with:
 * - Tilde expansion
 * - Relative path resolution
 * - Absolute path normalization
 * 
 * @returns Normalized absolute path to host workspace root
 * 
 * @example
 * ```ts
 * // With HOST_WORKSPACE_ROOT=~/src
 * getHostWorkspaceRoot() // => '/Users/john/src'
 * 
 * // With HOST_WORKSPACE_ROOT=C:\Users\john\Documents
 * getHostWorkspaceRoot() // => 'C:/Users/john/Documents'
 * ```
 */
/**
 * Check if we're running inside a Docker container
 * 
 * @returns true if running in Docker, false otherwise
 */
/**
 * Check if running in Docker container
 * @example if (isRunningInDocker()) console.log('In Docker');
 */
export function isRunningInDocker(): boolean {
  // Check for common Docker indicators
  // 1. /.dockerenv file exists (most reliable)
  // 2. WORKSPACE_ROOT environment variable is set (our Docker convention)
  
  try {
    // Check for .dockerenv file
    if (fsSync.existsSync('/.dockerenv')) {
      return true;
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Check if WORKSPACE_ROOT is set (our Docker convention)
  // When running locally, this should NOT be set
  if (process.env.WORKSPACE_ROOT) {
    return true;
  }
  
  return false;
}

/**
 * Get host workspace root path
 * @example const root = getHostWorkspaceRoot(); // => '/Users/john/src'
 */
export function getHostWorkspaceRoot(): string {
  const hostRoot = process.env.HOST_WORKSPACE_ROOT;
  
  // If not set, use default ~/src
  if (!hostRoot) {
    const defaultRoot = normalizeAndResolve('~/src');
    console.log(`🏠 Host workspace root (default): ${defaultRoot}`);
    return defaultRoot;
  }
  
  // When running in Docker with tilde in HOST_WORKSPACE_ROOT:
  // Docker Compose already expanded ~ in the volume mount, so we just need to expand it here too
  // Note: /proc/mounts doesn't work on Docker Desktop (shows VM paths like /run/host_mark)
  if (isRunningInDocker() && hostRoot.startsWith('~')) {
    // Expand tilde manually (can't use os.homedir() in Docker - it returns container's home)
    // Standard Unix tilde expansion: ~ -> /home/username or /Users/username
    // Since we're in Docker, we need to infer the actual home directory from the env var itself
    // The user likely set HOST_WORKSPACE_ROOT=~/src in .env, which means their home + /src
    
    // CRITICAL: Just use the value as-is and let file queries match against it
    // Files are stored with host paths, and queries should use the same format
    // console.log(`🏠 Host workspace root (Docker with tilde): keeping as ${hostRoot} for path matching`);
    return normalizeSlashes(hostRoot);
  }
  
  // When running in Docker without tilde, use as-is
  if (isRunningInDocker()) {
    const normalized = normalizeSlashes(hostRoot);
    // console.log(`🏠 Host workspace root (Docker): ${hostRoot} -> ${normalized}`);
    return normalized;
  }
  
  // When running locally (not in Docker), expand tilde and resolve normally
  const normalizedRoot = normalizeAndResolve(hostRoot);
  // console.log(`🏠 Host workspace root (local): ${hostRoot} -> ${normalizedRoot}`);
  return normalizedRoot;
}

/**
 * Translate host path to container path
 * 
 * Maps paths from the host filesystem to the Docker container's workspace directory.
 * Uses WORKSPACE_ROOT environment variable (defaults to /workspace).
 * 
 * Handles:
 * - Absolute host paths (when HOST_WORKSPACE_ROOT is absolute)
 * - Relative paths (always supported)
 * - Tilde paths in input (expanded if possible)
 * - Already-translated container paths (idempotent)
 * 
 * Environment Variables:
 * - WORKSPACE_ROOT: Container workspace path (default: /workspace)
 * - HOST_WORKSPACE_ROOT: Host-side workspace path to translate from
 * - HOST_HOME: Host's home directory (for expanding ~ in HOST_WORKSPACE_ROOT)
 * 
 * Tilde Expansion:
 * If HOST_WORKSPACE_ROOT contains ~ (e.g., ~/src), the function will:
 * 1. Try to expand using HOST_HOME if available (recommended)
 * 2. Log a warning and return the path unchanged if HOST_HOME is not set
 * 
 * Pass HOST_HOME to Docker: docker run -e HOST_HOME=$HOME ...
 * 
 * Works with ANY depth of nesting:
 * - C:\ or / (root)
 * - C:\Windows\Some\Deep\Nested\Path
 * - /some/deeply/nested/unix/path
 * 
 * @param hostPath - Path on the host system
 * @returns Path inside the container (WORKSPACE_ROOT/...)
 * 
 * @example
 * ```ts
 * // WORKSPACE_ROOT=/workspace, HOST_WORKSPACE_ROOT=/Users/john/src
 * translateHostToContainer('/Users/john/src/project')  // => '/workspace/project'
 * translateHostToContainer('C:\\Users\\john\\project') // => '/workspace/project' (Windows)
 * translateHostToContainer('/workspace/project')       // => '/workspace/project' (idempotent)
 * 
 * // WORKSPACE_ROOT=/mnt/data, HOST_WORKSPACE_ROOT=/Users/john/src
 * translateHostToContainer('/Users/john/src/project')  // => '/mnt/data/project'
 * 
 * // HOST_WORKSPACE_ROOT=~/src with HOST_HOME=/Users/john (tilde expansion)
 * translateHostToContainer('/Users/john/src/project')  // => '/workspace/project'
 * 
 * // HOST_WORKSPACE_ROOT=~/src without HOST_HOME (cannot expand, returns path unchanged)
 * translateHostToContainer('/Users/john/src/project')  // => '/Users/john/src/project' (with warning)
 * ```
 */
/**
 * Translate host path to container path
 * @example translateHostToContainer('/Users/john/src/project') // => '/workspace/project'
 */
export function translateHostToContainer(hostPath: string): string {
  if (!hostPath) return hostPath;
  
  // Skip translation if running locally (not in Docker)
  if (!isRunningInDocker()) {
    console.log(`💻 Running locally - no path translation needed: ${hostPath}`);
    return normalizeAndResolve(hostPath);
  }
  
  // Get container workspace root (defaults to /workspace for backwards compatibility)
  const containerRoot = process.env.WORKSPACE_ROOT || '/workspace';
  
  // Normalize and resolve the input path
  const normalizedPath = normalizeAndResolve(hostPath);
  
  // If already a container path, return as-is (idempotent)
  if (normalizedPath.startsWith(containerRoot)) {
    return normalizedPath;
  }
  
  // Special exception: /app paths are built-in container paths (docs, node_modules, etc.)
  // These are always accessible inside the container and don't need translation
  if (normalizedPath.startsWith('/app')) {
    return normalizedPath;
  }
  
  // Get host root from environment
  const hostRootEnv = process.env.HOST_WORKSPACE_ROOT;
  
  if (!hostRootEnv) {
    console.warn('⚠️  HOST_WORKSPACE_ROOT not set, cannot translate path');
    return normalizedPath;
  }
  
  // Normalize the host root (handles Windows backslashes)
  let hostRoot = normalizeSlashes(hostRootEnv).replace(/\/$/, ''); // Remove trailing slash
  
  // Check if HOST_WORKSPACE_ROOT contains tilde
  const hasTilde = hostRoot.includes('~');
  
  if (hasTilde) {
    // Tilde cannot be expanded using os.homedir() in Docker because it returns container's home
    // Instead, check for HOST_HOME environment variable (host's $HOME passed to container)
    const hostHome = process.env.HOST_HOME;
    
    if (hostHome) {
      // Expand tilde using HOST_HOME
      const expandedRoot = hostRoot.replace(/^~/, hostHome);
      console.log(`🏠 Expanded tilde using HOST_HOME: ${hostRoot} -> ${expandedRoot}`);
      
      // Update hostRoot with expanded path (reuse the variable)
      hostRoot = normalizeSlashes(expandedRoot).replace(/\/$/, '');
      
      // Continue with normal processing using expanded path
      // (fall through to the code below)
    } else {
      // HOST_HOME not available - cannot expand tilde
      console.warn(
        '⚠️  HOST_WORKSPACE_ROOT contains tilde (~) but HOST_HOME is not set.\n' +
        '    Tilde expressions cannot be automatically expanded.\n' +
        `    Current value: ${hostRootEnv}\n\n` +
        '    Solutions:\n' +
        '    1. Pass HOST_HOME to container: docker run -e HOST_HOME=$HOME ...\n' +
        '    2. Expand tilde in Docker config: HOST_WORKSPACE_ROOT=$HOME/src\n' +
        '    3. Use absolute path: HOST_WORKSPACE_ROOT=/Users/john/src\n'
      );
      
      // Return normalized path as-is (cannot translate without knowing host root)
      return normalizedPath;
    }
  }
  
  // HOST_WORKSPACE_ROOT is absolute - we can do proper string matching
  // Check if the path is under the host workspace root
  if (normalizedPath.startsWith(hostRoot)) {
    // Calculate relative path from host root
    let relativePath = normalizedPath.substring(hostRoot.length);
    
    // Ensure relative path starts with / for clean joining
    if (!relativePath.startsWith('/')) {
      relativePath = '/' + relativePath;
    }
    
    // Build container path and normalize (remove trailing slashes)
    let containerPath = `${containerRoot}${relativePath}`;
    
    // Remove trailing slashes (except for root)
    if (containerPath.length > 1) {
      containerPath = containerPath.replace(/\/+$/, '');
    }
    
    console.log(`📍 Host -> Container: ${hostPath} -> ${containerPath}`);
    return containerPath;
  }
  
  // Path is outside workspace root - try to make it relative
  console.warn(`⚠️  Path is outside workspace root: ${normalizedPath} (root: ${hostRoot})`);
  
  // Try to make it relative to workspace root
  const relativePath = path.relative(hostRoot, normalizedPath);
  
  // If the relative path goes up (..), it's truly outside the workspace
  if (relativePath.startsWith('..')) {
    console.error(`❌ Path is outside workspace root and cannot be translated: ${normalizedPath}`);
    throw new Error(`Path is outside workspace root: ${normalizedPath} (root: ${hostRoot})`);
  }
  
  let containerPath = `${containerRoot}/${relativePath}`;
  
  // Remove trailing slashes (except for root)
  if (containerPath.length > 1) {
    containerPath = containerPath.replace(/\/+$/, '');
  }
  
  console.log(`📍 Host -> Container (relative): ${hostPath} -> ${containerPath}`);
  return containerPath;
}

/**
 * Translate container path to host path
 * 
 * Maps paths from the Docker container's workspace directory back to the host filesystem.
 * Uses WORKSPACE_ROOT environment variable (defaults to /workspace).
 * 
 * Environment Variables:
 * - WORKSPACE_ROOT: Container workspace path (default: /workspace)
 * - HOST_WORKSPACE_ROOT: Host-side workspace path to translate to
 * 
 * @param containerPath - Path inside the container (WORKSPACE_ROOT/...)
 * @returns Path on the host system
 * 
 * @example
 * ```ts
 * // WORKSPACE_ROOT=/workspace, HOST_WORKSPACE_ROOT=/Users/john/src
 * translateContainerToHost('/workspace/project')      // => '/Users/john/src/project'
 * translateContainerToHost('/workspace/sub/file.txt') // => '/Users/john/src/sub/file.txt'
 * translateContainerToHost('/other/path')             // => '/other/path' (passthrough)
 * 
 * // WORKSPACE_ROOT=/mnt/data, HOST_WORKSPACE_ROOT=/Users/john/src
 * translateContainerToHost('/mnt/data/project')       // => '/Users/john/src/project'
 * ```
 */
/**
 * Translate container path to host path
 * @example translateContainerToHost('/workspace/project') // => '/Users/john/src/project'
 */
export function translateContainerToHost(containerPath: string): string {
  if (!containerPath) return containerPath;
  
  // Skip translation if running locally (not in Docker)
  if (!isRunningInDocker()) {
    console.log(`💻 Running locally - no path translation needed: ${containerPath}`);
    return normalizeSlashes(containerPath);
  }
  
  // Get container workspace root (defaults to /workspace for backwards compatibility)
  const containerRoot = process.env.WORKSPACE_ROOT || '/workspace';
  
  // Normalize the container path
  const normalizedPath = normalizeSlashes(containerPath);
  
  // Get host root
  const hostRoot = getHostWorkspaceRoot();
  
  // Check if the path starts with container workspace root
  if (normalizedPath.startsWith(containerRoot)) {
    // Calculate relative path from container root
    const relativePath = normalizedPath.substring(containerRoot.length);
    
    // Build host path
    const hostPath = `${hostRoot}${relativePath}`;
    
    console.log(`📍 Container -> Host: ${containerPath} -> ${hostPath}`);
    return hostPath;
  }
  
  // Not a workspace path - return as-is
  return containerPath;
}

/**
 * Validate that a path exists on the filesystem
 * 
 * @param filepath - Path to validate
 * @returns true if path exists, false otherwise
 */
export async function pathExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize a user-provided path
 * 
 * Performs security checks and normalization:
 * - Rejects empty/null paths
 * - Expands tilde and resolves relative paths
 * - Normalizes to absolute path
 * - Does NOT check if path exists (use pathExists for that)
 * 
 * @param userPath - User-provided path
 * @param allowRelative - Whether to allow relative paths (default: true)
 * @returns Sanitized absolute path
 * @throws Error if path is invalid or fails security checks
 * 
 * @example
 * ```ts
 * validateAndSanitizePath('~/project')     // => '/Users/john/project'
 * validateAndSanitizePath('../other')      // => '/absolute/path/to/other'
 * validateAndSanitizePath('')              // throws Error
 * ```
 */
/**
 * Validate and sanitize user-provided path
 * @example validateAndSanitizePath('~/project') // => '/Users/john/project'
 */
export function validateAndSanitizePath(userPath: string, allowRelative: boolean = true): string {
  // Check for empty/null
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Path parameter is required and must be a string');
  }
  
  // Normalize and resolve
  const resolved = normalizeAndResolve(userPath);
  
  // Security check: ensure the original path doesn't contain suspicious patterns
  // after resolution (e.g., null bytes, control characters)
  // Check for ASCII control characters (0-31) without using regex to avoid linter warnings
  for (let i = 0; i < userPath.length; i++) {
    const charCode = userPath.charCodeAt(i);
    if (charCode >= 0 && charCode <= 31) {
      throw new Error('Path contains invalid control characters');
    }
  }
  
  return resolved;
}
