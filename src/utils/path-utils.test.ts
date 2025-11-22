/**
 * @fileoverview Unit tests for cross-platform path utilities
 * 
 * Tests path normalization, tilde expansion, and host/container translation
 * across Windows, macOS, and Linux platforms.
 * 
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import os from 'os';
import * as pathUtils from './path-utils.js';
import {
  normalizeSlashes,
  expandTilde,
  normalizeAndResolve,
  getHostWorkspaceRoot,
  translateHostToContainer,
  translateContainerToHost,
  pathExists,
  validateAndSanitizePath,
} from './path-utils.js';

describe('Path Utilities', () => {
  const originalEnv = process.env.HOST_WORKSPACE_ROOT;
  const originalHomedir = os.homedir;

  beforeEach(() => {
    // Set HOST_WORKSPACE_ROOT for tests
    process.env.HOST_WORKSPACE_ROOT = '/Users/testuser/src';
    
    // Mock os.homedir() for consistent tests
    vi.spyOn(os, 'homedir').mockReturnValue('/Users/testuser');
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      process.env.HOST_WORKSPACE_ROOT = originalEnv;
    } else {
      delete process.env.HOST_WORKSPACE_ROOT;
    }
    
    // Restore os.homedir
    vi.restoreAllMocks();
  });

  describe('normalizeSlashes', () => {
    it('should convert Windows backslashes to forward slashes', () => {
      expect(normalizeSlashes('C:\\Users\\john\\project')).toBe('C:/Users/john/project');
      expect(normalizeSlashes('D:\\Documents\\file.txt')).toBe('D:/Documents/file.txt');
    });

    it('should leave Unix paths unchanged', () => {
      expect(normalizeSlashes('/home/user/project')).toBe('/home/user/project');
      expect(normalizeSlashes('/var/log/app.log')).toBe('/var/log/app.log');
    });

    it('should handle mixed slashes', () => {
      expect(normalizeSlashes('C:\\Users/john\\project')).toBe('C:/Users/john/project');
      expect(normalizeSlashes('/home\\user/project')).toBe('/home/user/project');
    });

    it('should handle empty strings', () => {
      expect(normalizeSlashes('')).toBe('');
    });
  });

  describe('expandTilde', () => {
    it('should expand ~ to home directory', () => {
      expect(expandTilde('~')).toBe('/Users/testuser');
    });

    it('should expand ~/ to home directory with path', () => {
      expect(expandTilde('~/Documents')).toBe('/Users/testuser/Documents');
      expect(expandTilde('~/project/file.txt')).toBe('/Users/testuser/project/file.txt');
    });

    it('should expand ~\\ (Windows style) to home directory', () => {
      expect(expandTilde('~\\Documents')).toBe('/Users/testuser/Documents');
    });

    it('should not expand paths that do not start with ~', () => {
      expect(expandTilde('/absolute/path')).toBe('/absolute/path');
      expect(expandTilde('relative/path')).toBe('relative/path');
      expect(expandTilde('path~with~tildes')).toBe('path~with~tildes');
    });

    it('should handle empty strings', () => {
      expect(expandTilde('')).toBe('');
    });
  });

  describe('normalizeAndResolve', () => {
    it('should resolve tilde paths to absolute paths', () => {
      const result = normalizeAndResolve('~/project');
      expect(result).toBe('/Users/testuser/project');
    });

    it('should normalize Windows paths to Unix style', () => {
      const result = normalizeAndResolve('C:\\Users\\john\\project');
      expect(result).toContain('/');
      expect(result).not.toContain('\\');
    });

    it('should resolve relative paths', () => {
      const result = normalizeAndResolve('../../other', '/home/user/current/sub');
      expect(result).toBe('/home/user/other');
    });

    it('should remove trailing slashes', () => {
      expect(normalizeAndResolve('/home/user/project/')).toBe('/home/user/project');
      expect(normalizeAndResolve('/home/user/project///')).toBe('/home/user/project');
    });

    it('should preserve root slash', () => {
      expect(normalizeAndResolve('/')).toBe('/');
    });

    it('should handle paths with spaces', () => {
      const result = normalizeAndResolve('~/My Documents/project');
      expect(result).toBe('/Users/testuser/My Documents/project');
    });

    it('should normalize multiple slashes', () => {
      const result = normalizeAndResolve('/home//user///project');
      expect(result).not.toContain('//');
    });
  });

  describe('getHostWorkspaceRoot', () => {
    it('should return default ~/src when HOST_WORKSPACE_ROOT not set', () => {
      delete process.env.HOST_WORKSPACE_ROOT;
      const result = getHostWorkspaceRoot();
      expect(result).toBe('/Users/testuser/src');
    });

    it('should return normalized HOST_WORKSPACE_ROOT when set', () => {
      process.env.HOST_WORKSPACE_ROOT = '~/Documents/workspace';
      const result = getHostWorkspaceRoot();
      expect(result).toBe('/Users/testuser/Documents/workspace');
    });

    it('should normalize Windows paths in HOST_WORKSPACE_ROOT', () => {
      process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\john\\workspace';
      const result = getHostWorkspaceRoot();
      expect(result).toContain('/');
      expect(result).not.toContain('\\');
    });

    it('should handle absolute Unix paths', () => {
      process.env.HOST_WORKSPACE_ROOT = '/var/workspace';
      const result = getHostWorkspaceRoot();
      expect(result).toBe('/var/workspace');
    });
  });

  describe('translateHostToContainer', () => {
    beforeEach(() => {
      process.env.HOST_WORKSPACE_ROOT = '/Users/testuser/src';
      process.env.WORKSPACE_ROOT = '/workspace';
      // Mock isRunningInDocker to return true for these tests
      vi.spyOn(pathUtils, 'isRunningInDocker').mockReturnValue(true);
    });

    it('should translate host paths to container paths', () => {
      const result = translateHostToContainer('/Users/testuser/src/project');
      expect(result).toBe('/workspace/project');
    });

    it('should handle tilde paths', () => {
      const result = translateHostToContainer('~/src/project');
      expect(result).toBe('/workspace/project');
    });

    it('should handle Windows paths', () => {
      process.env.HOST_WORKSPACE_ROOT = 'C:/Users/testuser/src';
      const result = translateHostToContainer('C:\\Users\\testuser\\src\\project');
      expect(result).toBe('/workspace/project');
    });

    it('should be idempotent for container paths', () => {
      const result = translateHostToContainer('/workspace/project');
      expect(result).toBe('/workspace/project');
    });

    it('should handle nested paths', () => {
      const result = translateHostToContainer('/Users/testuser/src/sub/deep/project');
      expect(result).toBe('/workspace/sub/deep/project');
    });

    it('should throw for paths outside workspace root', () => {
      expect(() => {
        translateHostToContainer('/other/directory/project');
      }).toThrow('Path is outside workspace root');
    });

    it('should handle exact workspace root', () => {
      const result = translateHostToContainer('/Users/testuser/src');
      expect(result).toBe('/workspace');
    });
  });

  describe('translateContainerToHost', () => {
    beforeEach(() => {
      process.env.HOST_WORKSPACE_ROOT = '/Users/testuser/src';
      process.env.WORKSPACE_ROOT = '/workspace';
      // Mock isRunningInDocker to return true for these tests
      vi.spyOn(pathUtils, 'isRunningInDocker').mockReturnValue(true);
    });

    it('should translate container paths to host paths', () => {
      const result = translateContainerToHost('/workspace/project');
      expect(result).toBe('/Users/testuser/src/project');
    });

    it('should handle nested container paths', () => {
      const result = translateContainerToHost('/workspace/sub/deep/project');
      expect(result).toBe('/Users/testuser/src/sub/deep/project');
    });

    it('should handle /workspace root', () => {
      const result = translateContainerToHost('/workspace');
      expect(result).toBe('/Users/testuser/src');
    });

    it('should return non-workspace paths unchanged', () => {
      const result = translateContainerToHost('/other/path');
      expect(result).toBe('/other/path');
    });

    it('should handle empty strings', () => {
      const result = translateContainerToHost('');
      expect(result).toBe('');
    });
  });

  describe('validateAndSanitizePath', () => {
    it('should validate and normalize tilde paths', () => {
      const result = validateAndSanitizePath('~/project');
      expect(result).toBe('/Users/testuser/project');
    });

    it('should validate and normalize relative paths', () => {
      const result = validateAndSanitizePath('../project');
      expect(result).toContain('/project');
      expect(result).not.toContain('..');
    });

    it('should throw for empty paths', () => {
      expect(() => validateAndSanitizePath('')).toThrow('Path parameter is required');
    });

    it('should throw for null paths', () => {
      expect(() => validateAndSanitizePath(null as any)).toThrow('Path parameter is required');
    });

    it('should throw for non-string paths', () => {
      expect(() => validateAndSanitizePath(123 as any)).toThrow('Path parameter is required');
    });

    it('should throw for paths with control characters', () => {
      expect(() => validateAndSanitizePath('/path/with\x00null')).toThrow('invalid control characters');
      expect(() => validateAndSanitizePath('/path\x01\x02')).toThrow('invalid control characters');
    });

    it('should handle paths with spaces', () => {
      const result = validateAndSanitizePath('~/My Documents/project');
      expect(result).toBe('/Users/testuser/My Documents/project');
    });
  });

  describe('Round-trip translation', () => {
    beforeEach(() => {
      process.env.HOST_WORKSPACE_ROOT = '/Users/testuser/src';
      process.env.WORKSPACE_ROOT = '/workspace';
      // Mock isRunningInDocker to return true for these tests
      vi.spyOn(pathUtils, 'isRunningInDocker').mockReturnValue(true);
    });

    it('should maintain path integrity through host->container->host', () => {
      const original = '/Users/testuser/src/my-project/sub/file.txt';
      const containerPath = translateHostToContainer(original);
      const backToHost = translateContainerToHost(containerPath);
      
      expect(backToHost).toBe(original);
    });

    it('should maintain path integrity through container->host->container', () => {
      const original = '/workspace/my-project/sub/file.txt';
      const hostPath = translateContainerToHost(original);
      const backToContainer = translateHostToContainer(hostPath);
      
      expect(backToContainer).toBe(original);
    });

    it('should handle tilde paths in round-trip', () => {
      // In Docker, tilde paths are expanded and translated
      const original = '~/src/project/file.txt';
      const containerPath = translateHostToContainer(original);
      // In Docker, path is translated to /workspace
      expect(containerPath).toBe('/workspace/project/file.txt');
      
      const hostPath = translateContainerToHost(containerPath);
      expect(hostPath).toBe('/Users/testuser/src/project/file.txt');
    });
  });

  describe('Cross-platform scenarios', () => {
    beforeEach(() => {
      process.env.WORKSPACE_ROOT = '/workspace';
      // Mock isRunningInDocker to return true for these tests
      vi.spyOn(pathUtils, 'isRunningInDocker').mockReturnValue(true);
    });

    it('should handle Windows paths with HOST_WORKSPACE_ROOT on Windows', () => {
      process.env.HOST_WORKSPACE_ROOT = 'C:\\Users\\john\\workspace';
      
      const result = translateHostToContainer('C:\\Users\\john\\workspace\\project');
      // In Docker, path is translated to /workspace
      expect(result).toBe('/workspace/project');
    });

    it('should handle mixed Windows/Unix style in same path', () => {
      const result = normalizeAndResolve('C:\\Users/john\\workspace/project');
      expect(result).not.toContain('\\');
      expect(result).toContain('/');
    });

    it('should handle UNC paths (Windows network paths)', () => {
      const result = normalizeSlashes('\\\\server\\share\\folder');
      expect(result).toBe('//server/share/folder');
    });
  });
});
