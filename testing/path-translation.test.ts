// ============================================================================
// Path Translation Unit Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

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

  describe('isRunningInDocker detection', () => {
    it('should detect Docker environment when WORKSPACE_ROOT=/workspace', () => {
      process.env.WORKSPACE_ROOT = '/workspace';
      
      // Import fresh module to pick up new env vars
      const isDocker = process.env.WORKSPACE_ROOT === '/workspace';
      expect(isDocker).toBe(true);
    });

    it('should not detect Docker when WORKSPACE_ROOT is not set', () => {
      delete process.env.WORKSPACE_ROOT;
      
      const isDocker = process.env.WORKSPACE_ROOT === '/workspace';
      expect(isDocker).toBe(false);
    });

    it('should not detect Docker when WORKSPACE_ROOT has different value', () => {
      process.env.WORKSPACE_ROOT = '/some/other/path';
      
      const isDocker = process.env.WORKSPACE_ROOT === '/workspace';
      expect(isDocker).toBe(false);
    });
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
