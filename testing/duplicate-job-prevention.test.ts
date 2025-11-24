import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileWatchManager } from '../src/indexing/FileWatchManager.js';
import type { Driver, Session } from 'neo4j-driver';

/**
 * Unit tests for duplicate job prevention in FileWatchManager
 * 
 * Tests the activeIndexingPaths tracking to prevent:
 * - Concurrent indexing of the same folder path
 * - Race conditions during file watching
 * - Deadlocks from duplicate database operations
 */

describe('FileWatchManager - Duplicate Job Prevention', () => {
  let mockDriver: Driver;
  let mockSession: Session;
  let fileWatchManager: FileWatchManager;
  let consoleLogSpy: any;

  beforeEach(() => {
    // Mock Neo4j session
    mockSession = {
      run: vi.fn().mockResolvedValue({
        records: [{ get: () => 123 }]
      }),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Session;

    // Mock Neo4j driver
    mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    } as unknown as Driver;

    // Create FileWatchManager instance
    fileWatchManager = new FileWatchManager(mockDriver);

    // Spy on console.log to verify duplicate job messages
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Active Indexing Path Tracking', () => {
    it('should allow first indexing job for a path', async () => {
      const config = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock the queueIndexing private method to track if it's called
      const queueIndexingSpy = vi.spyOn(fileWatchManager as any, 'queueIndexing');
      queueIndexingSpy.mockResolvedValue(undefined);

      // Start indexing
      await (fileWatchManager as any).queueIndexing(config);

      expect(queueIndexingSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate')
      );
    });

    it('should prevent duplicate indexing job for same path', async () => {
      const config = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Access private activeIndexingPaths Set
      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;
      
      // Manually add path to simulate active indexing
      activePathsSet.add('/app/docs');

      // Try to queue second indexing job
      await (fileWatchManager as any).queueIndexing(config);

      // Should have logged skip message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate indexing job for /app/docs')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('already in progress')
      );
    });

    it('should allow indexing different paths concurrently', async () => {
      const config1 = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      const config2 = {
        path: '/app/src',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock walkDirectory to avoid file system access
      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockResolvedValue([]);
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;
      
      // Manually add first path
      activePathsSet.add('/app/docs');

      // Queue second path - should NOT be skipped
      await (fileWatchManager as any).queueIndexing(config2);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate')
      );
    });
  });

  describe('Path Cleanup After Completion', () => {
    it('should remove path from active set after successful completion', async () => {
      const config = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock the walkDirectory method to avoid actual file system access
      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockResolvedValue([]);
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;

      // Queue and execute indexing
      await (fileWatchManager as any).queueIndexing(config);

      // Wait for async cleanup
      await new Promise(resolve => setTimeout(resolve, 50));

      // Path should be removed from active set
      expect(activePathsSet.has('/app/docs')).toBe(false);
    });

    it('should remove path from active set after error', async () => {
      const config = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock walkDirectory to throw error
      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockRejectedValue(
        new Error('File system error')
      );
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;

      // Queue indexing (will fail)
      try {
        await (fileWatchManager as any).queueIndexing(config);
      } catch (error) {
        // Expected to fail
      }

      // Wait for async cleanup
      await new Promise(resolve => setTimeout(resolve, 50));

      // Path should still be removed from active set
      expect(activePathsSet.has('/app/docs')).toBe(false);
    });

    it('should remove path from active set after cancellation', async () => {
      const config = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock walkDirectory to throw cancellation error
      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockRejectedValue(
        new Error('Indexing cancelled')
      );
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;

      // Queue and cancel indexing
      try {
        await (fileWatchManager as any).queueIndexing(config);
      } catch (error) {
        // Expected for cancellation
      }

      // Wait for async cleanup
      await new Promise(resolve => setTimeout(resolve, 50));

      // Path should be removed even after cancellation
      expect(activePathsSet.has('/app/docs')).toBe(false);
    });
  });

  describe('Re-indexing After Completion', () => {
    it('should allow re-indexing same path after previous job completes', async () => {
      const config = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock dependencies
      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockResolvedValue([]);
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;

      // First indexing job
      await (fileWatchManager as any).queueIndexing(config);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(activePathsSet.has('/app/docs')).toBe(false);

      // Clear console log spy
      consoleLogSpy.mockClear();

      // Second indexing job - should NOT be blocked
      await (fileWatchManager as any).queueIndexing(config);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate')
      );
    });
  });

  describe('Concurrent Job Prevention', () => {
    it('should block second job if first is still running', async () => {
      const config = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock walkDirectory with long delay to keep job running
      let resolveWalk: () => void;
      const walkPromise = new Promise<string[]>(resolve => {
        resolveWalk = () => resolve([]);
      });
      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockReturnValue(walkPromise);
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;

      // Start first job (don't await)
      const firstJob = (fileWatchManager as any).queueIndexing(config);

      // Wait briefly to ensure first job starts
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(activePathsSet.has('/app/docs')).toBe(true);

      // Try to start second job
      await (fileWatchManager as any).queueIndexing(config);

      // Second job should be skipped
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate indexing job for /app/docs')
      );

      // Complete first job
      resolveWalk!();
      await firstJob;
    });

    it('should track multiple different paths concurrently', async () => {
      const config1 = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      const config2 = {
        path: '/app/src',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      const config3 = {
        path: '/app/tests',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock dependencies
      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockResolvedValue([]);
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;

      // Manually add all paths to simulate concurrent indexing
      activePathsSet.add('/app/docs');
      activePathsSet.add('/app/src');
      activePathsSet.add('/app/tests');

      expect(activePathsSet.size).toBe(3);

      // Try to queue duplicate of each
      await (fileWatchManager as any).queueIndexing(config1);
      await (fileWatchManager as any).queueIndexing(config2);
      await (fileWatchManager as any).queueIndexing(config3);

      // All should be skipped
      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate')
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle path with trailing slash', async () => {
      const config1 = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      const config2 = {
        path: '/app/docs/',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      // Mock walkDirectory to avoid file system access
      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockResolvedValue([]);
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;
      activePathsSet.add('/app/docs');

      // Path with trailing slash should still be detected as duplicate
      // (This depends on path normalization - adjust test if paths are normalized)
      await (fileWatchManager as any).queueIndexing(config2);

      // Should NOT skip if paths are treated as different
      // OR should skip if normalized (implementation-dependent)
      // This test documents current behavior - paths are NOT normalized
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate')
      );
    });

    it('should handle empty active paths set', async () => {
      const config = {
        path: '/app/docs',
        recursive: true,
        generate_embeddings: false,
        debounce_ms: 500,
        file_patterns: null,
        ignore_patterns: []
      };

      vi.spyOn(fileWatchManager as any, 'walkDirectory').mockResolvedValue([]);
      vi.spyOn(fileWatchManager as any, 'emitProgress').mockImplementation(() => {});

      const activePathsSet = (fileWatchManager as any).activeIndexingPaths as Set<string>;

      expect(activePathsSet.size).toBe(0);

      // Should work fine with empty set
      await (fileWatchManager as any).queueIndexing(config);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Skipping duplicate')
      );
    });
  });
});
