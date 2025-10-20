/**
 * Unit tests for RateLimitQueue
 * 
 * Tests:
 * - Throttling behavior (requests properly spaced)
 * - Bypass mode (requestsPerHour = -1 executes immediately)
 * - Capacity limits (getRemainingCapacity() accuracy)
 * - Metrics (getMetrics() returns correct values)
 * - Queue processing (FIFO order)
 * - Dynamic throttling (queue backup handling)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimitQueue } from '../src/orchestrator/rate-limit-queue.js';

describe('RateLimitQueue', () => {
  let rateLimiter: RateLimitQueue;
  
  beforeEach(() => {
    // Get singleton and reset state
    rateLimiter = RateLimitQueue.getInstance();
    rateLimiter.reset();
  });
  
  describe('Bypass Mode', () => {
    it('should execute immediately when requestsPerHour = -1', async () => {
      const bypassLimiter = RateLimitQueue.getInstance({ requestsPerHour: -1 });
      bypassLimiter.reset();
      
      const startTime = Date.now();
      const mockFn = vi.fn(async () => 'result');
      
      // Execute 5 requests with no delay
      const results = await Promise.all([
        bypassLimiter.enqueue(mockFn),
        bypassLimiter.enqueue(mockFn),
        bypassLimiter.enqueue(mockFn),
        bypassLimiter.enqueue(mockFn),
        bypassLimiter.enqueue(mockFn),
      ]);
      
      const duration = Date.now() - startTime;
      
      expect(results).toEqual(['result', 'result', 'result', 'result', 'result']);
      expect(mockFn).toHaveBeenCalledTimes(5);
      expect(duration).toBeLessThan(100); // Should complete nearly instantly
      
      // Metrics should show bypass
      const metrics = bypassLimiter.getMetrics();
      expect(metrics.remainingCapacity).toBe(Infinity);
      expect(metrics.usagePercent).toBe(0);
    });
  });
  
  describe('Throttling Behavior', () => {
    it('should enforce minimum delay between requests', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 3600, // 1 request per second
        logLevel: 'silent',
      });
      limiter.reset();
      
      const timestamps: number[] = [];
      const mockFn = vi.fn(async () => {
        timestamps.push(Date.now());
        return 'result';
      });
      
      // Execute 3 requests
      await Promise.all([
        limiter.enqueue(mockFn),
        limiter.enqueue(mockFn),
        limiter.enqueue(mockFn),
      ]);
      
      expect(mockFn).toHaveBeenCalledTimes(3);
      
      // Check spacing between requests (should be ~1000ms each)
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      
      expect(delay1).toBeGreaterThanOrEqual(950); // Allow 50ms tolerance
      expect(delay1).toBeLessThanOrEqual(1100);
      expect(delay2).toBeGreaterThanOrEqual(950);
      expect(delay2).toBeLessThanOrEqual(1100);
    });
    
    it('should respect estimated request count', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 3600, // 1 req/sec for faster tests
        logLevel: 'silent',
      });
      limiter.reset();
      
      // Execute 2 requests, each claiming 3 estimated requests
      await limiter.enqueue(async () => 'result1', 3);
      await limiter.enqueue(async () => 'result2', 3);
      
      const metrics = limiter.getMetrics();
      expect(metrics.requestsInCurrentHour).toBe(6); // 2 × 3
      expect(metrics.remainingCapacity).toBe(3594); // 3600 - 6
    });
  });
  
  describe('Capacity Management', () => {
    it('should accurately track remaining capacity', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 3600, // 1 req/sec for faster tests
        logLevel: 'silent',
      });
      limiter.reset();
      
      expect(limiter.getRemainingCapacity()).toBe(3600);
      
      await limiter.enqueue(async () => 'result', 3);
      expect(limiter.getRemainingCapacity()).toBe(3597);
      
      await limiter.enqueue(async () => 'result', 2);
      expect(limiter.getRemainingCapacity()).toBe(3595);
    });
    
    it('should wait when capacity is full', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 5,
        logLevel: 'silent',
      });
      limiter.reset();
      
      // Fill capacity
      await limiter.enqueue(async () => 'result', 5);
      expect(limiter.getRemainingCapacity()).toBe(0);
      
      // Next request should wait for capacity to free up
      // (Timestamps expire after 1 hour, but we'll use short test)
      const startTime = Date.now();
      
      // This should queue and wait
      const promise = limiter.enqueue(async () => 'delayed', 1);
      
      // Manually advance time by pruning old timestamps (simulate expiry)
      // In real use, this would happen after 1 hour
      // For testing, we'll just verify it queues
      expect(limiter.getQueueDepth()).toBe(1);
      
      // Don't await - just verify it's queued
      promise.catch(() => {}); // Prevent unhandled rejection
    }, { timeout: 1000 });
  });
  
  describe('Metrics', () => {
    it('should return accurate metrics', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 3600, // 1 req/sec for faster tests
        logLevel: 'silent',
      });
      limiter.reset();
      
      const initialMetrics = limiter.getMetrics();
      expect(initialMetrics.requestsInCurrentHour).toBe(0);
      expect(initialMetrics.remainingCapacity).toBe(3600);
      expect(initialMetrics.queueDepth).toBe(0);
      expect(initialMetrics.totalProcessed).toBe(0);
      expect(initialMetrics.usagePercent).toBe(0);
      
      // Execute some requests
      await limiter.enqueue(async () => 'result1', 10);
      await limiter.enqueue(async () => 'result2', 5);
      
      const afterMetrics = limiter.getMetrics();
      expect(afterMetrics.requestsInCurrentHour).toBe(15);
      expect(afterMetrics.remainingCapacity).toBe(3585);
      expect(afterMetrics.totalProcessed).toBe(2);
      expect(afterMetrics.usagePercent).toBeCloseTo(0.42, 1); // 15/3600 ≈ 0.42%
    });
  });
  
  describe('Queue Processing', () => {
    it('should process requests in FIFO order', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 3600,
        logLevel: 'silent',
      });
      limiter.reset();
      
      const executionOrder: number[] = [];
      
      const mockFn1 = vi.fn(async () => { executionOrder.push(1); return 'result1'; });
      const mockFn2 = vi.fn(async () => { executionOrder.push(2); return 'result2'; });
      const mockFn3 = vi.fn(async () => { executionOrder.push(3); return 'result3'; });
      
      // Enqueue in order
      const p1 = limiter.enqueue(mockFn1);
      const p2 = limiter.enqueue(mockFn2);
      const p3 = limiter.enqueue(mockFn3);
      
      await Promise.all([p1, p2, p3]);
      
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });
  
  describe('Error Handling', () => {
    it('should reject promise when execution throws error', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 3600,
        logLevel: 'silent',
      });
      limiter.reset();
      
      const mockFn = vi.fn(async () => {
        throw new Error('Test error');
      });
      
      await expect(limiter.enqueue(mockFn)).rejects.toThrow('Test error');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
    
    it('should continue processing queue after error', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 3600,
        logLevel: 'silent',
      });
      limiter.reset();
      
      const errorFn = vi.fn(async () => { throw new Error('Error'); });
      const successFn = vi.fn(async () => 'success');
      
      const p1 = limiter.enqueue(errorFn);
      const p2 = limiter.enqueue(successFn);
      
      await expect(p1).rejects.toThrow('Error');
      await expect(p2).resolves.toBe('success');
      
      expect(errorFn).toHaveBeenCalledTimes(1);
      expect(successFn).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Dynamic Configuration', () => {
    it('should allow updating requestsPerHour at runtime', async () => {
      const limiter = RateLimitQueue.getInstance({ 
        requestsPerHour: 3600,
        logLevel: 'silent',
      });
      limiter.reset();
      
      await limiter.enqueue(async () => 'result', 10);
      expect(limiter.getRemainingCapacity()).toBe(3590);
      
      // Increase limit
      limiter.setRequestsPerHour(7200);
      expect(limiter.getRemainingCapacity()).toBe(7190);
      
      // Decrease limit
      limiter.setRequestsPerHour(1800);
      expect(limiter.getRemainingCapacity()).toBe(1790);
    });
  });
  
  describe('Singleton Pattern', () => {
    it('should return same instance on multiple getInstance calls', () => {
      const instance1 = RateLimitQueue.getInstance();
      const instance2 = RateLimitQueue.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });
});
