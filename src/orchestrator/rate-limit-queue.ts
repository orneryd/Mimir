/**
 * RateLimitQueue - Centralized queue-based rate limiter for LLM API calls
 * 
 * Features:
 * - Sliding 1-hour window tracking
 * - FIFO queue processing
 * - Dynamic throttling when queue backs up
 * - Bypass mode (requestsPerHour = -1)
 * - Metrics and monitoring
 */

interface PendingRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  estimatedRequests: number;
}

export interface RateLimitConfig {
  requestsPerHour: number;
  enableDynamicThrottling: boolean;
  warningThreshold: number;
  logLevel: 'silent' | 'normal' | 'verbose';
}

export class RateLimitQueue {
  private static instances: Map<string, RateLimitQueue> = new Map();
  
  // Configuration
  private config: RateLimitConfig;
  private requestsPerHour!: number;
  private requestsPerMinute!: number;
  private requestsPerSecond!: number;
  private minMsBetweenRequests!: number;
  
  // State
  private requestTimestamps: number[] = [];
  private queue: PendingRequest<any>[] = [];
  private processing: boolean = false;
  private lastRequestTime: number = 0;
  
  // Metrics
  private totalRequestsProcessed: number = 0;
  private totalWaitTimeMs: number = 0;
  
  private constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      requestsPerHour: 2500,
      enableDynamicThrottling: true,
      warningThreshold: 0.80,
      logLevel: 'normal',
      ...config
    };
    
    this.updateDerivedValues();
  }
  
  static getInstance(config?: Partial<RateLimitConfig>, instanceKey: string = 'default'): RateLimitQueue {
    if (!RateLimitQueue.instances.has(instanceKey)) {
      RateLimitQueue.instances.set(instanceKey, new RateLimitQueue(config));
    } else if (config) {
      // Update config on existing instance if provided
      const instance = RateLimitQueue.instances.get(instanceKey)!;
      instance.config = {
        ...instance.config,
        ...config,
      };
      instance.updateDerivedValues();
    }
    return RateLimitQueue.instances.get(instanceKey)!;
  }
  
  /**
   * Recalculate derived timing values from requestsPerHour
   */
  private updateDerivedValues(): void {
    this.requestsPerHour = this.config.requestsPerHour;
    
    // Only calculate if not bypassed
    if (this.requestsPerHour !== -1) {
      this.requestsPerMinute = this.requestsPerHour / 60;
      this.requestsPerSecond = this.requestsPerHour / 3600;
      this.minMsBetweenRequests = (3600 * 1000) / this.requestsPerHour;
      
      if (this.config.logLevel !== 'silent') {
        console.log(`🎛️  Rate Limiter Initialized:`);
        console.log(`   Requests/hour: ${this.requestsPerHour}`);
        console.log(`   Requests/minute: ${this.requestsPerMinute.toFixed(2)}`);
        console.log(`   Min delay between requests: ${this.minMsBetweenRequests.toFixed(0)}ms`);
      }
    } else {
      if (this.config.logLevel !== 'silent') {
        console.log(`⚡ Rate Limiter: BYPASSED (requestsPerHour = -1)`);
      }
    }
  }
  
  /**
   * Update requestsPerHour dynamically
   */
  public setRequestsPerHour(newLimit: number): void {
    this.config.requestsPerHour = newLimit;
    this.updateDerivedValues();
  }
  
  /**
   * Enqueue a request for rate-limited execution
   * 
   * @param execute - Function that makes the LLM API call
   * @param estimatedRequests - How many API calls this will make (default: 1)
   * @returns Promise that resolves when request completes
   * 
   * Note: If requestsPerHour is set to -1, rate limiting is bypassed entirely.
   */
  public async enqueue<T>(
    execute: () => Promise<T>,
    estimatedRequests: number = 1
  ): Promise<T> {
    // Bypass rate limiting if requestsPerHour is -1
    if (this.config.requestsPerHour === -1) {
      if (this.config.logLevel === 'verbose') {
        console.log(`⚡ Rate limiting bypassed (requestsPerHour = -1)`);
      }
      return execute();
    }
    
    return new Promise<T>((resolve, reject) => {
      const request: PendingRequest<T> = {
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        execute,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        estimatedRequests,
      };
      
      this.queue.push(request);
      
      if (this.config.logLevel === 'verbose') {
        console.log(`📥 Enqueued request ${request.id} (estimated: ${estimatedRequests} calls)`);
        console.log(`   Queue depth: ${this.queue.length}`);
      }
      
      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Process the queue, respecting rate limits
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue[0];
      
      // Calculate wait time needed
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const waitTime = Math.max(0, this.minMsBetweenRequests - timeSinceLastRequest);
      
      // Check capacity
      this.pruneOldTimestamps();
      const currentRequestsInWindow = this.requestTimestamps.length;
      const remainingCapacity = this.requestsPerHour - currentRequestsInWindow;
      
      // Warn if approaching limit
      const usagePercent = currentRequestsInWindow / this.requestsPerHour;
      if (usagePercent >= this.config.warningThreshold && this.config.logLevel !== 'silent') {
        console.warn(`⚠️  Rate limit at ${(usagePercent * 100).toFixed(1)}% (${currentRequestsInWindow}/${this.requestsPerHour})`);
      }
      
      // Critical: If no capacity, wait until oldest request expires
      if (remainingCapacity < request.estimatedRequests) {
        const oldestTimestamp = this.requestTimestamps[0];
        const timeUntilExpiry = (oldestTimestamp + 3600000) - now;
        
        if (this.config.logLevel !== 'silent') {
          console.warn(`🚨 Rate limit FULL (${currentRequestsInWindow}/${this.requestsPerHour})`);
          console.warn(`   Waiting ${(timeUntilExpiry / 1000).toFixed(1)}s for capacity...`);
        }
        
        await new Promise(resolve => setTimeout(resolve, timeUntilExpiry + 100));
        continue;
      }
      
      // Wait for minimum delay between requests
      if (waitTime > 0) {
        if (this.config.logLevel === 'verbose') {
          console.log(`⏱️  Waiting ${waitTime}ms before next request...`);
        }
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Remove from queue and execute
      this.queue.shift();
      const executeStart = Date.now();
      
      try {
        if (this.config.logLevel === 'verbose') {
          console.log(`🚀 Executing request ${request.id}...`);
        }
        
        const result = await request.execute();
        
        // Record successful execution
        this.lastRequestTime = Date.now();
        for (let i = 0; i < request.estimatedRequests; i++) {
          this.requestTimestamps.push(this.lastRequestTime);
        }
        this.totalRequestsProcessed++;
        
        const waitTimeMs = executeStart - request.enqueuedAt;
        this.totalWaitTimeMs += waitTimeMs;
        
        if (this.config.logLevel === 'verbose') {
          console.log(`✅ Request ${request.id} completed (waited ${waitTimeMs}ms)`);
        }
        
        request.resolve(result);
      } catch (error: any) {
        if (this.config.logLevel !== 'silent') {
          console.error(`❌ Request ${request.id} failed:`, error.message);
        }
        request.reject(error);
      }
      
      // Dynamic throttling: Adjust delay if queue is backing up
      if (this.config.enableDynamicThrottling && this.queue.length > 10) {
        const backupFactor = Math.min(this.queue.length / 10, 3);
        const adjustedDelay = this.minMsBetweenRequests * backupFactor;
        
        if (this.config.logLevel !== 'silent') {
          console.warn(`⚠️  Queue backed up (${this.queue.length} pending), throttling by ${backupFactor.toFixed(1)}x`);
        }
        
        await new Promise(resolve => setTimeout(resolve, adjustedDelay - this.minMsBetweenRequests));
      }
    }
    
    this.processing = false;
  }
  
  /**
   * Remove timestamps older than 1 hour
   */
  private pruneOldTimestamps(): void {
    const oneHourAgo = Date.now() - 3600000;
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneHourAgo);
  }
  
  /**
   * Get remaining capacity in current hour
   */
  public getRemainingCapacity(): number {
    if (this.config.requestsPerHour === -1) return Infinity;
    this.pruneOldTimestamps();
    return Math.max(0, this.requestsPerHour - this.requestTimestamps.length);
  }
  
  /**
   * Get current queue depth
   */
  public getQueueDepth(): number {
    return this.queue.length;
  }
  
  /**
   * Get metrics for monitoring
   */
  public getMetrics(): {
    requestsInCurrentHour: number;
    remainingCapacity: number;
    queueDepth: number;
    totalProcessed: number;
    avgWaitTimeMs: number;
    usagePercent: number;
  } {
    this.pruneOldTimestamps();
    const requestsInHour = this.requestTimestamps.length;
    const capacity = this.config.requestsPerHour === -1 ? Infinity : this.requestsPerHour;
    
    return {
      requestsInCurrentHour: requestsInHour,
      remainingCapacity: this.getRemainingCapacity(),
      queueDepth: this.queue.length,
      totalProcessed: this.totalRequestsProcessed,
      avgWaitTimeMs: this.totalRequestsProcessed > 0 
        ? this.totalWaitTimeMs / this.totalRequestsProcessed 
        : 0,
      usagePercent: this.config.requestsPerHour === -1 ? 0 : (requestsInHour / capacity) * 100,
    };
  }
  
  /**
   * Reset metrics (for testing)
   */
  public reset(): void {
    this.requestTimestamps = [];
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
    this.totalRequestsProcessed = 0;
    this.totalWaitTimeMs = 0;
  }
}
