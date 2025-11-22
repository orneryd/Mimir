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
export function normalizeAndResolve(filepath: string, basePath?: string): string {
  if (!filepath) return filepath;
  
  // Step 1: Expand tilde
  let normalized = expandTilde(filepath);
  
  // Step 2: Normalize slashes to forward slashes
  normalized = normalizeSlashes(normalized);
  
  // Step 3: Resolve to absolute path
  if (basePath) {
    normalized = path.resolve(basePath, normalized);
  } else {
    normalized = path.resolve(normalized);
  }
  
  // Step 4: Final slash normalization (resolve might add backslashes on Windows)
  normalized = normalizeSlashes(normalized);
  
  // Step 5: Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  
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
 * Maps paths from the host filesystem to the Docker container's /workspace directory.
 * Handles:
 * - Absolute host paths
 * - Relative paths (resolved relative to host workspace root)
 * - Tilde paths
 * - Already-translated container paths (idempotent)
 * 
 * @param hostPath - Path on the host system
 * @returns Path inside the container (/workspace/...)
 * 
 * @example
 * ```ts
 * // HOST_WORKSPACE_ROOT=/Users/john/src
 * translateHostToContainer('/Users/john/src/project')  // => '/workspace/project'
 * translateHostToContainer('~/src/project')            // => '/workspace/project'
 * translateHostToContainer('C:\\Users\\john\\project') // => '/workspace/project' (Windows)
 * translateHostToContainer('/workspace/project')       // => '/workspace/project' (idempotent)
 * ```
 */
export function translateHostToContainer(hostPath: string): string {
  if (!hostPath) return hostPath;
  
  // Skip translation if running locally (not in Docker)
  if (!isRunningInDocker()) {
    console.log(`💻 Running locally - no path translation needed: ${hostPath}`);
    return normalizeAndResolve(hostPath);
  }
  
  // Normalize and resolve the input path
  const normalizedPath = normalizeAndResolve(hostPath);
  
  // Get normalized host root
  const hostRootEnv = process.env.HOST_WORKSPACE_ROOT;
  
  if (!hostRootEnv) {
    console.warn('⚠️  HOST_WORKSPACE_ROOT not set, cannot translate path');
    return normalizedPath;
  }
  
  // If HOST_WORKSPACE_ROOT contains tilde, we can't use it for string matching
  // Instead, we need to figure out the actual host path from the mounted workspace
  // Docker mounts host path to /workspace, so we can infer the mapping
  let hostRoot: string;
  
  if (hostRootEnv.startsWith('~')) {
    // We can't expand ~ reliably in Docker (os.homedir() returns container's home)
    // So we need to infer from the normalized path itself
    // If the path starts with common patterns, extract the workspace root
    const pathParts = normalizedPath.split('/');
    
    // Common workspace root patterns by depth:
    // Depth 4: /Users/username/src          (macOS: /Users/<user>/<workspace>)
    //          /home/username/workspace     (Linux: /home/<user>/<workspace>)
    // Depth 5: /Users/username/Documents/workspace  (macOS: /Users/<user>/Documents/<workspace>)
    //          /home/username/dev/projects          (Linux: /home/<user>/dev/<workspace>)
    const WORKSPACE_ROOT_DEPTH_SHALLOW = 4;  // /Users/username/src
    const WORKSPACE_ROOT_DEPTH_NESTED = 5;   // /Users/username/Documents/workspace
    
    if (pathParts.length >= WORKSPACE_ROOT_DEPTH_SHALLOW) {
      // Try to find a common workspace pattern
      const possibleRoots = [
        pathParts.slice(0, WORKSPACE_ROOT_DEPTH_SHALLOW).join('/'),  // Shallow: /Users/username/src
        pathParts.slice(0, WORKSPACE_ROOT_DEPTH_NESTED).join('/'),   // Nested: /Users/username/Documents/workspace
      ];
      
      // Use the shallow root (most common pattern)
      // Note: This is a heuristic - actual workspace root should be explicitly configured
      hostRoot = possibleRoots[0];
      console.log(`📍 Inferred host root from path: ${hostRoot} (env has unexpanded tilde: ${hostRootEnv})`);
    } else {
      console.warn(`⚠️  Cannot infer host root from short path: ${normalizedPath}`);
      hostRoot = hostRootEnv;  // Fallback
    }
  } else {
    hostRoot = normalizeSlashes(hostRootEnv);
  }
  
  // If already a container path, return as-is (idempotent)
  if (normalizedPath.startsWith('/workspace')) {
    return normalizedPath;
  }
  
  // Special exception: /app paths are built-in container paths (docs, node_modules, etc.)
  // These are always accessible inside the container and don't need translation
  if (normalizedPath.startsWith('/app/docs')) {
    console.log(`📦 Using built-in container path: ${normalizedPath}`);
    return normalizedPath;
  }
  
  // Check if the path is under the host workspace root
  if (normalizedPath.startsWith(hostRoot)) {
    // Calculate relative path from host root
    const relativePath = normalizedPath.substring(hostRoot.length);
    
    // Build container path
    const containerPath = `/workspace${relativePath}`;
    
    console.log(`📍 Host -> Container: ${hostPath} -> ${containerPath}`);
    return containerPath;
  }
  
  // Path is outside workspace root - this might be an error
  console.warn(`⚠️  Path is outside workspace root: ${normalizedPath} (root: ${hostRoot})`);
  
  // Try to make it relative to workspace root anyway
  // This handles cases where the user provides a relative path
  const relativePath = path.relative(hostRoot, normalizedPath);
  
  // If the relative path goes up (..), it's truly outside the workspace
  if (relativePath.startsWith('..')) {
    console.error(`❌ Path is outside workspace root and cannot be translated: ${normalizedPath}`);
    throw new Error(`Path is outside workspace root: ${normalizedPath} (root: ${hostRoot})`);
  }
  
  const containerPath = `/workspace/${relativePath}`;
  console.log(`📍 Host -> Container (relative): ${hostPath} -> ${containerPath}`);
  return normalizeSlashes(containerPath);
}

/**
 * Translate container path to host path
 * 
 * Maps paths from the Docker container's /workspace directory back to the host filesystem.
 * 
 * @param containerPath - Path inside the container (/workspace/...)
 * @returns Path on the host system
 * 
 * @example
 * ```ts
 * // HOST_WORKSPACE_ROOT=/Users/john/src
 * translateContainerToHost('/workspace/project')      // => '/Users/john/src/project'
 * translateContainerToHost('/workspace/sub/file.txt') // => '/Users/john/src/sub/file.txt'
 * translateContainerToHost('/other/path')             // => '/other/path' (passthrough)
 * ```
 */
export function translateContainerToHost(containerPath: string): string {
  if (!containerPath) return containerPath;
  
  // Skip translation if running locally (not in Docker)
  if (!isRunningInDocker()) {
    console.log(`💻 Running locally - no path translation needed: ${containerPath}`);
    return normalizeSlashes(containerPath);
  }
  
  // Normalize the container path
  const normalizedPath = normalizeSlashes(containerPath);
  
  // Get host root
  const hostRoot = getHostWorkspaceRoot();
  
  // Check if the path starts with /workspace
  if (normalizedPath.startsWith('/workspace')) {
    // Calculate relative path from /workspace
    const relativePath = normalizedPath.substring('/workspace'.length);
    
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
export function validateAndSanitizePath(userPath: string, allowRelative: boolean = true): string {
  // Check for empty/null
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Path parameter is required and must be a string');
  }
  
  // Normalize and resolve
  const resolved = normalizeAndResolve(userPath);
  
  // Security check: ensure the original path doesn't contain suspicious patterns
  // after resolution (e.g., null bytes, control characters)
  if (/[\x00-\x1f]/.test(userPath)) {
    throw new Error('Path contains invalid control characters');
  }
  
  return resolved;
}
