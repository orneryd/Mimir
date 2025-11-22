import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import os from 'os';
import { getHostWorkspaceRoot } from '../utils/path-utils.js';

/**
 * Workspace context for tool execution
 * 
 * This allows us to pass workspace-specific information (like working directory)
 * to tools without modifying their signatures or using global variables.
 * 
 * Uses AsyncLocalStorage for thread-safe context propagation through async calls.
 */
interface WorkspaceContext {
  workingDirectory: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

// AsyncLocalStorage ensures context is isolated per request
const workspaceStorage = new AsyncLocalStorage<WorkspaceContext>();

/**
 * Translate host path to container path
 * 
 * Docker volume mounts map host paths to container paths.
 * Example: /Users/name/src → /workspace
 * 
 * If the incoming path is under HOST_WORKSPACE_ROOT, translate it.
 * Otherwise, assume it's already a container path or use as-is.
 * 
 * @param hostPath Path from VSCode (host filesystem)
 * @returns Path that works inside container
 */
function translatePathToContainer(hostPath: string): string {
  // Get environment variables for path mapping
  const hostWorkspaceRoot = getHostWorkspaceRoot();
  const containerWorkspaceRoot = process.env.WORKSPACE_ROOT || '';
  
  // Normalize paths for comparison
  const normalizedHostPath = path.resolve(hostPath);
  const normalizedHostRoot = hostWorkspaceRoot;
  
  // Check if hostPath is under the mounted host root
  if (normalizedHostPath.startsWith(normalizedHostRoot)) {
    // Calculate relative path from host root
    const relativePath = path.relative(normalizedHostRoot, normalizedHostPath);
    
    // Join with container root
    const containerPath = path.posix.join(containerWorkspaceRoot, relativePath);
    
    console.log(`📁 Path translation: ${hostPath} → ${containerPath}`);
    console.log(`   Host root: ${hostWorkspaceRoot} → Container root: ${containerWorkspaceRoot}`);
    
    return containerPath;
  }
  
  // Path is not under mounted root - might already be a container path or standalone
  // If we're in Docker (WORKSPACE_ROOT is set), warn about unmounted path
  if (process.env.WORKSPACE_ROOT && !hostPath.startsWith('/workspace')) {
    console.warn(`⚠️  Path ${hostPath} is not under HOST_WORKSPACE_ROOT (${hostWorkspaceRoot})`);
    console.warn(`   This path may not be accessible in the container!`);
  }
  
  return hostPath;
}

/**
 * Run a function with workspace context
 * 
 * Automatically translates host paths to container paths if running in Docker.
 * 
 * @example
 * await runWithWorkspaceContext(
 *   { workingDirectory: '/Users/name/src/project' }, // Host path from VSCode
 *   async () => {
 *     await agent.execute('Create a file');
 *     // Tools will use /workspace/project (container path)
 *   }
 * );
 */
export function runWithWorkspaceContext<T>(
  context: WorkspaceContext,
  fn: () => T | Promise<T>
): Promise<T> {
  // Translate working directory if in Docker
  const translatedContext: WorkspaceContext = {
    ...context,
    workingDirectory: translatePathToContainer(context.workingDirectory),
  };
  
  return workspaceStorage.run(translatedContext, () => Promise.resolve(fn()));
}

/**
 * Get current workspace context (if any)
 * 
 * Returns the working directory set by runWithWorkspaceContext,
 * or falls back to process.cwd() if no context is set.
 */
export function getWorkspaceContext(): WorkspaceContext | undefined {
  return workspaceStorage.getStore();
}

/**
 * Get working directory for tool execution
 * 
 * Prefers workspace context, falls back to process.cwd()
 * Returns container-translated paths when in Docker.
 */
export function getWorkingDirectory(): string {
  const context = getWorkspaceContext();
  return context?.workingDirectory || process.cwd();
}

/**
 * Check if running in workspace context
 */
export function hasWorkspaceContext(): boolean {
  return workspaceStorage.getStore() !== undefined;
}

/**
 * Check if running in Docker container
 */
export function isRunningInDocker(): boolean {
  return process.env.WORKSPACE_ROOT !== undefined;
}
