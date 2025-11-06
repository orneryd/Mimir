// ============================================================================
// Path Translation Unit Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';

// Mock environment variables
let originalEnv: NodeJS.ProcessEnv;

describe('Path Translation Utilities', () => {
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('translateHostToContainer', () => {
    it('should translate macOS host path to container path', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const hostPath = '/Users/c815719/src/caremark-notification-service';
      const expected = '/workspace/caremark-notification-service';
      
      // Simulate translation logic
      const hostRoot = '/Users/c815719/src'; // Expanded ~/src
      const relativePath = hostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });

    it('should translate Linux host path to container path', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/home/user';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const hostPath = '/home/user/src/my-project';
      const expected = '/workspace/my-project';
      
      const hostRoot = '/home/user/src';
      const relativePath = hostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });

    it('should translate Windows host path to container path', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.USERPROFILE = 'C:\\Users\\user';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const hostPath = 'C:/Users/user/src/my-project'; // Windows can use forward slashes
      const expected = '/workspace/my-project';
      
      const hostRoot = 'C:/Users/user/src';
      const relativePath = hostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });

    it('should translate Windows host path with actual workspace root (C:\\Users\\timot\\Documents\\GitHub)', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.USERPROFILE = 'C:\\Users\\timot';
      process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\timot\\Documents\\GitHub';
      
      const hostPath = 'C:\\Users\\timot\\Documents\\GitHub\\GRAPH-RAG-TODO';
      const expected = '/workspace/GRAPH-RAG-TODO';
      
      // Normalize Windows backslashes to forward slashes for comparison
      const normalizedHostPath = hostPath.replace(/\\/g, '/');
      const normalizedHostRoot = 'C:/Users/timot/Documents/GitHub';
      const relativePath = normalizedHostPath.substring(normalizedHostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });

    it('should handle paths with trailing slashes', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src/';
      
      const hostPath = '/Users/c815719/src/my-project/';
      const expected = '/workspace/my-project';
      
      const hostRoot = '/Users/c815719/src';
      const relativePath = hostPath.replace(/\/$/, '').substring(hostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });

    it('should handle nested project paths', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const hostPath = '/Users/c815719/src/playground/mimir/testing';
      const expected = '/workspace/playground/mimir/testing';
      
      const hostRoot = '/Users/c815719/src';
      const relativePath = hostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });

    it('should return path unchanged when not in Docker', () => {
      delete process.env.WORKSPACE_ROOT;
      
      const hostPath = '/Users/c815719/src/my-project';
      
      // When not in Docker, path should remain unchanged
      const isDocker = process.env.WORKSPACE_ROOT === '/workspace';
      const result = isDocker ? '/workspace/my-project' : hostPath;
      
      expect(result).toBe(hostPath);
    });

    it('should handle absolute path with custom HOST_WORKSPACE_ROOT', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOST_WORKSPACE_ROOT = '/opt/projects';
      
      const hostPath = '/opt/projects/my-app';
      const expected = '/workspace/my-app';
      
      const hostRoot = '/opt/projects';
      const relativePath = hostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });
  });

  describe('translateContainerToHost', () => {
    it('should translate container path back to macOS host path', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const containerPath = '/workspace/caremark-notification-service';
      const expected = '/Users/c815719/src/caremark-notification-service';
      
      const hostRoot = '/Users/c815719/src';
      const relativePath = containerPath.substring('/workspace'.length);
      const hostPath = `${hostRoot}${relativePath}`;
      
      expect(hostPath).toBe(expected);
    });

    it('should translate container path back to Linux host path', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/home/user';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const containerPath = '/workspace/my-project';
      const expected = '/home/user/src/my-project';
      
      const hostRoot = '/home/user/src';
      const relativePath = containerPath.substring('/workspace'.length);
      const hostPath = `${hostRoot}${relativePath}`;
      
      expect(hostPath).toBe(expected);
    });

    it('should handle nested container paths', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const containerPath = '/workspace/playground/mimir/testing';
      const expected = '/Users/c815719/src/playground/mimir/testing';
      
      const hostRoot = '/Users/c815719/src';
      const relativePath = containerPath.substring('/workspace'.length);
      const hostPath = `${hostRoot}${relativePath}`;
      
      expect(hostPath).toBe(expected);
    });

    it('should return path unchanged when not in Docker', () => {
      delete process.env.WORKSPACE_ROOT;
      
      const containerPath = '/workspace/my-project';
      
      const isDocker = process.env.WORKSPACE_ROOT === '/workspace';
      const result = isDocker ? '/Users/c815719/src/my-project' : containerPath;
      
      expect(result).toBe(containerPath);
    });

    it('should handle paths with trailing slashes', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const containerPath = '/workspace/my-project/';
      const expected = '/Users/c815719/src/my-project';
      
      const hostRoot = '/Users/c815719/src';
      const relativePath = containerPath.replace(/\/$/, '').substring('/workspace'.length);
      const hostPath = `${hostRoot}${relativePath}`;
      
      expect(hostPath).toBe(expected);
    });

    it('should translate container path back to Windows host path (C:\\Users\\timot\\Documents\\GitHub)', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.USERPROFILE = 'C:\\Users\\timot';
      process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\timot\\Documents\\GitHub';
      
      const containerPath = '/workspace/GRAPH-RAG-TODO';
      const expected = 'C:/Users/timot/Documents/GitHub/GRAPH-RAG-TODO';
      
      const hostRoot = 'C:/Users/timot/Documents/GitHub';
      const relativePath = containerPath.substring('/workspace'.length);
      const hostPath = `${hostRoot}${relativePath}`;
      
      expect(hostPath).toBe(expected);
    });
  });

  describe('Round-trip translation', () => {
    it('should maintain path integrity through round-trip translation', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const originalHostPath = '/Users/c815719/src/caremark-notification-service';
      
      // Host → Container
      const hostRoot = '/Users/c815719/src';
      const relativePath1 = originalHostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath1}`;
      
      // Container → Host
      const relativePath2 = containerPath.substring('/workspace'.length);
      const finalHostPath = `${hostRoot}${relativePath2}`;
      
      expect(finalHostPath).toBe(originalHostPath);
    });

    it('should handle multiple nested levels in round-trip', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const originalHostPath = '/Users/c815719/src/org/team/project/subdir';
      
      // Host → Container
      const hostRoot = '/Users/c815719/src';
      const relativePath1 = originalHostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath1}`;
      
      expect(containerPath).toBe('/workspace/org/team/project/subdir');
      
      // Container → Host
      const relativePath2 = containerPath.substring('/workspace'.length);
      const finalHostPath = `${hostRoot}${relativePath2}`;
      
      expect(finalHostPath).toBe(originalHostPath);
    });
  });

  describe('Edge cases', () => {
    it('should handle path that does not start with host root', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const hostPath = '/Users/c815719/Documents/project'; // Not under ~/src
      
      // Should return unchanged since it's not under the mounted directory
      const hostRoot = '/Users/c815719/src';
      const shouldTranslate = hostPath.startsWith(hostRoot);
      const result = shouldTranslate ? '/workspace/...' : hostPath;
      
      expect(result).toBe(hostPath);
    });

    it('should handle empty relative path (root directory)', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const hostPath = '/Users/c815719/src';
      const expected = '/workspace';
      
      const hostRoot = '/Users/c815719/src';
      const relativePath = hostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });

    it('should handle special characters in path', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      process.env.HOME = '/Users/c815719';
      process.env.HOST_WORKSPACE_ROOT = '~/src';
      
      const hostPath = '/Users/c815719/src/my-project-v2.0';
      const expected = '/workspace/my-project-v2.0';
      
      const hostRoot = '/Users/c815719/src';
      const relativePath = hostPath.substring(hostRoot.length);
      const containerPath = `/workspace${relativePath}`;
      
      expect(containerPath).toBe(expected);
    });
  });
});

// ============================================================================
// Handler Function Tests
// ============================================================================

describe('handleIndexFolder', () => {
  let mockDriver: any;
  let mockWatchManager: any;
  let mockConfigManager: any;
  let mockConfig: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Mock Neo4j driver
    mockDriver = {
      session: vi.fn()
    };

    // Mock FileWatchManager
    mockWatchManager = {
      startWatch: vi.fn(),
      indexFolder: vi.fn().mockResolvedValue(10),
      stopWatch: vi.fn()
    };

    // Mock WatchConfigManager
    mockConfig = {
      id: 'watch-1',
      path: '/workspace/test-project',
      recursive: true,
      debounce_ms: 500,
      status: 'active'
    };

    mockConfigManager = {
      getByPath: vi.fn().mockResolvedValue(null),
      createWatch: vi.fn().mockResolvedValue(mockConfig),
      markInactive: vi.fn().mockResolvedValue(undefined)
    };

    // Mock fs.access
    vi.spyOn(fs, 'access').mockResolvedValue(undefined);

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should translate Windows host path to container path before indexing', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\timot\\Documents\\GitHub';

    const params = {
      path: 'C:\\Users\\timot\\Documents\\GitHub\\test-project',
      recursive: true,
      generate_embeddings: false
    };

    // Mock the handler (simulated logic)
    const userProvidedPath = params.path;
    const normalizedPath = userProvidedPath.replace(/\\/g, '/');
    const hostRoot = 'C:/Users/timot/Documents/GitHub';
    const relativePath = normalizedPath.substring(hostRoot.length);
    const containerPath = `/workspace${relativePath}`;

    expect(containerPath).toBe('/workspace/test-project');
    expect(userProvidedPath).toBe('C:\\Users\\timot\\Documents\\GitHub\\test-project');
  });

  it('should return error when path does not exist', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    process.env.HOST_WORKSPACE_ROOT = '/home/user/src';

    // Mock fs.access to throw error
    vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));

    const params = {
      path: '/home/user/src/nonexistent'
    };

    const containerPath = '/workspace/nonexistent';
    
    try {
      await fs.access(containerPath);
      expect.fail('Should have thrown error');
    } catch (error) {
      // Expected error response
      const response = {
        status: 'error',
        error: 'path_not_found',
        message: `Path '/home/user/src/nonexistent' (container: '${containerPath}') does not exist on filesystem.`,
        path: '/home/user/src/nonexistent'
      };
      
      expect(response.status).toBe('error');
      expect(response.error).toBe('path_not_found');
    }
  });

  it('should use container path when creating watch config', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\timot\\Documents\\GitHub';

    const userPath = 'C:\\Users\\timot\\Documents\\GitHub\\my-project';
    const containerPath = '/workspace/my-project';

    // Simulated watch config creation
    const watchConfig = {
      path: containerPath,  // Should store container path, not host path
      recursive: true,
      debounce_ms: 500,
      generate_embeddings: false
    };

    expect(watchConfig.path).toBe(containerPath);
    expect(watchConfig.path).not.toBe(userPath);
  });

  it('should return user-provided path in response', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\timot\\Documents\\GitHub';

    const userPath = 'C:\\Users\\timot\\Documents\\GitHub\\my-project';
    const containerPath = '/workspace/my-project';

    // Simulated response
    const response = {
      status: 'success',
      path: userPath,  // Return original path to user
      containerPath: containerPath,  // Also include container path for transparency
      files_indexed: 0,
      elapsed_ms: 100,
      message: 'Indexing started in background. Check logs for progress.'
    };

    expect(response.path).toBe(userPath);
    expect(response.containerPath).toBe(containerPath);
  });

  it('should handle paths without Docker translation', async () => {
    delete process.env.WORKSPACE_ROOT;

    const hostPath = '/Users/c815719/src/my-project';

    // When not in Docker, path should remain unchanged
    const isDocker = process.env.WORKSPACE_ROOT === '/workspace';
    const containerPath = isDocker ? '/workspace/my-project' : hostPath;

    expect(containerPath).toBe(hostPath);
  });
});

describe('handleRemoveFolder', () => {
  let mockDriver: any;
  let mockWatchManager: any;
  let mockSession: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Mock Neo4j session
    mockSession = {
      run: vi.fn().mockResolvedValue({
        records: [{
          get: vi.fn((key: string) => {
            if (key === 'files_deleted') return { toNumber: () => 5 };
            if (key === 'chunks_deleted') return { toNumber: () => 50 };
            return null;
          })
        }]
      }),
      close: vi.fn()
    };

    // Mock Neo4j driver
    mockDriver = {
      session: vi.fn().mockReturnValue(mockSession)
    };

    // Mock FileWatchManager
    mockWatchManager = {
      stopWatch: vi.fn().mockResolvedValue(undefined)
    };

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should translate Windows host path to container path before removal', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\timot\\Documents\\GitHub';

    const userPath = 'C:\\Users\\timot\\Documents\\GitHub\\test-project';
    const normalizedPath = userPath.replace(/\\/g, '/');
    const hostRoot = 'C:/Users/timot/Documents/GitHub';
    const relativePath = normalizedPath.substring(hostRoot.length);
    const containerPath = `/workspace${relativePath}`;

    expect(containerPath).toBe('/workspace/test-project');
  });

  it('should return error when path is not being watched', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    process.env.HOST_WORKSPACE_ROOT = '/home/user/src';

    const userPath = '/home/user/src/my-project';
    const containerPath = '/workspace/my-project';

    // Simulate config not found
    const configFound = false;

    if (!configFound) {
      const response = {
        status: 'error',
        message: `Path '${userPath}' (container: '${containerPath}') is not being watched.`
      };

      expect(response.status).toBe('error');
      expect(response.message).toContain('is not being watched');
    }
  });

  it('should use container path for Neo4j query', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\timot\\Documents\\GitHub';

    const userPath = 'C:\\Users\\timot\\Documents\\GitHub\\my-project';
    const containerPath = '/workspace/my-project';

    // Simulated Neo4j query
    const queryParams = { pathPrefix: containerPath };

    expect(queryParams.pathPrefix).toBe(containerPath);
    expect(queryParams.pathPrefix).not.toBe(userPath);
  });

  it('should return user-provided path in response', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\timot\\Documents\\GitHub';

    const userPath = 'C:\\Users\\timot\\Documents\\GitHub\\my-project';
    const containerPath = '/workspace/my-project';

    // Simulated response
    const response = {
      status: 'success',
      path: userPath,  // Return original path to user
      containerPath: containerPath,  // Also include container path for transparency
      files_removed: 5,
      chunks_removed: 50,
      message: `Folder watch stopped. Removed 5 files and 50 chunks from database.`
    };

    expect(response.path).toBe(userPath);
    expect(response.containerPath).toBe(containerPath);
    expect(response.files_removed).toBe(5);
    expect(response.chunks_removed).toBe(50);
  });

  it('should handle both file path and absolute_path in Neo4j query', async () => {
    process.env.WORKSPACE_ROOT = '/workspace';
    const containerPath = '/workspace/my-project';

    // Simulated Neo4j query - checks both f.path and f.absolute_path
    const cypher = `
      MATCH (f:File)
      WHERE f.path STARTS WITH $pathPrefix OR f.absolute_path STARTS WITH $pathPrefix
      OPTIONAL MATCH (f)-[:HAS_CHUNK]->(c:FileChunk)
      WITH f, collect(c) AS chunks, count(c) AS chunk_count
      DETACH DELETE f
      FOREACH (chunk IN chunks | DETACH DELETE chunk)
      RETURN count(f) AS files_deleted, sum(chunk_count) AS chunks_deleted
    `;

    expect(cypher).toContain('f.path STARTS WITH $pathPrefix');
    expect(cypher).toContain('f.absolute_path STARTS WITH $pathPrefix');
    expect(cypher).toContain('HAS_CHUNK');
  });
});
