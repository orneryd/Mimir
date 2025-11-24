import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileIndexer } from '../src/indexing/FileIndexer.js';
import type { Driver, Session } from 'neo4j-driver';

/**
 * Unit tests for Neo4j retry logic in FileIndexer
 * 
 * Tests the retryNeo4jTransaction method's ability to handle:
 * - Deadlock errors (ForsetiClient conflicts)
 * - Lock timeout errors
 * - Transient errors (Neo.TransientError.*)
 * - Exponential backoff with jitter
 * - Non-retryable errors (fail immediately)
 */

describe('FileIndexer - Neo4j Retry Logic', () => {
  let mockDriver: Driver;
  let mockSession: Session;
  let fileIndexer: FileIndexer;
  let consoleWarnSpy: any;

  beforeEach(() => {
    // Mock Neo4j session
    mockSession = {
      run: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Session;

    // Mock Neo4j driver
    mockDriver = {
      session: vi.fn().mockReturnValue(mockSession),
    } as unknown as Driver;

    // Create FileIndexer instance
    fileIndexer = new FileIndexer(mockDriver);

    // Spy on console.warn to verify retry messages
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Deadlock Detection', () => {
    it('should retry on ForsetiClient deadlock errors', async () => {
      const deadlockError = new Error(
        "ForsetiClient[transactionId=177, clientId=1] can't acquire UpdateLock on NODE_RELATIONSHIP_GROUP_DELETE(40) " +
        "because holders of that lock are waiting for ForsetiClient[transactionId=177, clientId=1]"
      );

      let attemptCount = 0;
      const mockOperation = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw deadlockError;
        }
        return { success: true };
      });

      // Access private method via any cast for testing
      const result = await (fileIndexer as any).retryNeo4jTransaction(
        mockOperation,
        'Test operation',
        3
      );

      expect(result).toEqual({ success: true });
      expect(attemptCount).toBe(3);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2); // Failed on attempts 1 and 2
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('deadlock');
    });

    it('should retry on "can\'t acquire" lock errors', async () => {
      const lockError = new Error("can't acquire lock on resource");
      lockError.code = 'Neo.TransientError.Transaction.DeadlockDetected';

      let attemptCount = 0;
      const mockOperation = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw lockError;
        }
        return { success: true };
      });

      const result = await (fileIndexer as any).retryNeo4jTransaction(
        mockOperation,
        'Test lock operation'
      );

      expect(result).toEqual({ success: true });
      expect(attemptCount).toBe(2);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lock Timeout Errors', () => {
    it('should retry on LockClient errors', async () => {
      const lockTimeoutError = new Error('LockClient stopped');
      lockTimeoutError.code = 'Neo.TransientError.Transaction.LockClientStopped';

      let attemptCount = 0;
      const mockOperation = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw lockTimeoutError;
        }
        return { success: true };
      });

      const result = await (fileIndexer as any).retryNeo4jTransaction(
        mockOperation,
        'Test timeout operation'
      );

      expect(result).toEqual({ success: true });
      expect(attemptCount).toBe(2);
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('lock timeout');
    });
  });

  describe('Transient Errors', () => {
    it('should retry on generic Neo4j transient errors', async () => {
      const transientError = new Error('Database temporarily unavailable');
      transientError.code = 'Neo.TransientError.Database.Unavailable';

      let attemptCount = 0;
      const mockOperation = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw transientError;
        }
        return { success: true };
      });

      const result = await (fileIndexer as any).retryNeo4jTransaction(
        mockOperation,
        'Test transient operation'
      );

      expect(result).toEqual({ success: true });
      expect(attemptCount).toBe(2);
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('transient');
    });
  });

  describe('Non-Retryable Errors', () => {
    it('should not retry on syntax errors', async () => {
      const syntaxError = new Error('Invalid Cypher syntax');
      syntaxError.code = 'Neo.ClientError.Statement.SyntaxError';

      const mockOperation = vi.fn().mockRejectedValue(syntaxError);

      await expect(
        (fileIndexer as any).retryNeo4jTransaction(mockOperation, 'Test syntax operation')
      ).rejects.toThrow('Invalid Cypher syntax');

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not retry on client errors', async () => {
      const clientError = new Error('Constraint violation');
      clientError.code = 'Neo.ClientError.Schema.ConstraintValidationFailed';

      const mockOperation = vi.fn().mockRejectedValue(clientError);

      await expect(
        (fileIndexer as any).retryNeo4jTransaction(mockOperation, 'Test constraint operation')
      ).rejects.toThrow('Constraint violation');

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should fail after max retries on persistent deadlock', async () => {
      const deadlockError = new Error('ForsetiClient deadlock');

      const mockOperation = vi.fn().mockRejectedValue(deadlockError);

      await expect(
        (fileIndexer as any).retryNeo4jTransaction(mockOperation, 'Test max retry', 3)
      ).rejects.toThrow('ForsetiClient deadlock');

      expect(mockOperation).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Exponential Backoff', () => {
    it('should implement exponential backoff with increasing delays', async () => {
      const deadlockError = new Error('ForsetiClient deadlock');
      const delays: number[] = [];
      const startTimes: number[] = [];

      let attemptCount = 0;
      const mockOperation = vi.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        attemptCount++;
        if (attemptCount < 4) {
          throw deadlockError;
        }
        return { success: true };
      });

      // Mock setTimeout to track delays
      const originalSetTimeout = global.setTimeout;
      vi.spyOn(global, 'setTimeout').mockImplementation(((fn: any, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0); // Execute immediately for test
      }) as any);

      await (fileIndexer as any).retryNeo4jTransaction(mockOperation, 'Test backoff', 3);

      expect(delays.length).toBe(3);
      
      // Verify exponential growth: each delay should be roughly double the previous
      // Allow for jitter (0-50ms) in comparisons
      expect(delays[0]).toBeGreaterThanOrEqual(100); // ~100ms
      expect(delays[0]).toBeLessThan(200); // 100 + 50 (jitter)
      
      expect(delays[1]).toBeGreaterThanOrEqual(200); // ~200ms
      expect(delays[1]).toBeLessThan(300); // 200 + 50 (jitter)
      
      expect(delays[2]).toBeGreaterThanOrEqual(400); // ~400ms
      expect(delays[2]).toBeLessThan(500); // 400 + 50 (jitter)
    });

    it('should cap maximum delay at 2000ms', async () => {
      const deadlockError = new Error('ForsetiClient deadlock');
      const delays: number[] = [];

      let attemptCount = 0;
      const mockOperation = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 6) {
          throw deadlockError;
        }
        return { success: true };
      });

      // Save original setTimeout before mocking
      const originalSetTimeout = global.setTimeout;
      vi.spyOn(global, 'setTimeout').mockImplementation(((fn: any, delay: number) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0); // Use original setTimeout to avoid recursion
      }) as any);

      await (fileIndexer as any).retryNeo4jTransaction(mockOperation, 'Test max delay', 5);

      // After several retries, delay should be capped at 2000ms
      const maxDelay = Math.max(...delays);
      expect(maxDelay).toBeLessThanOrEqual(2050); // 2000 + 50 (jitter)
    });
  });

  describe('Operation Context', () => {
    it('should include operation name in warning messages', async () => {
      const deadlockError = new Error('ForsetiClient deadlock');
      
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue({ success: true });

      await (fileIndexer as any).retryNeo4jTransaction(
        mockOperation,
        'Index file /app/docs/README.md'
      );

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('Index file /app/docs/README.md');
    });

    it('should preserve original error after exhausting retries', async () => {
      const originalError = new Error('Persistent deadlock with specific details');
      originalError.code = 'Neo.TransientError.Transaction.DeadlockDetected';

      const mockOperation = vi.fn().mockRejectedValue(originalError);

      try {
        await (fileIndexer as any).retryNeo4jTransaction(mockOperation, 'Test operation', 2);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBe('Persistent deadlock with specific details');
        expect(error.code).toBe('Neo.TransientError.Transaction.DeadlockDetected');
      }
    });
  });

  describe('Success Cases', () => {
    it('should return result immediately on first success', async () => {
      const mockOperation = vi.fn().mockResolvedValue({ data: 'success' });

      const result = await (fileIndexer as any).retryNeo4jTransaction(
        mockOperation,
        'Test immediate success'
      );

      expect(result).toEqual({ data: 'success' });
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return result after single retry', async () => {
      const deadlockError = new Error('ForsetiClient deadlock');
      
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(deadlockError)
        .mockResolvedValue({ data: 'success after retry' });

      const result = await (fileIndexer as any).retryNeo4jTransaction(
        mockOperation,
        'Test single retry'
      );

      expect(result).toEqual({ data: 'success after retry' });
      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
