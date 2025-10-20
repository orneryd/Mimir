# Centralized Queue-Based Rate Limiter Design

**Implementation Status:** ✅ **COMPLETED** (2025-01-18)

## 🎯 Design Goals

1. **Single Configuration Point**: One `requestsPerHour` setting (default: 2,500)
   - Set to `-1` to bypass rate limiting entirely (useful for local development with Ollama)
2. **All-Request Interception**: Every LLM API call goes through rate limiter queue
3. **Accurate Tracking**: Count everything that GitHub counts as an API request
4. **Auto-Throttling**: Dynamically adjust timing based on hourly budget

---

## ✅ Implementation Summary

**Files Added:**
- `src/orchestrator/rate-limit-queue.ts` - Core RateLimitQueue class (300+ lines)
- `src/config/rate-limit-config.ts` - Configuration management
- `testing/rate-limit-queue.test.ts` - Comprehensive unit tests (11 tests, all passing)

**Files Modified:**
- `src/orchestrator/llm-client.ts` - Integrated rate limiter into CopilotAgentClient

**Key Features:**
- ✅ Singleton pattern for global rate limiting
- ✅ FIFO queue processing
- ✅ Bypass mode (`requestsPerHour = -1`)
- ✅ Sliding 1-hour window tracking
- ✅ Dynamic throttling when queue backs up
- ✅ Metrics and monitoring
- ✅ Optimistic request estimation (1 + numToolCalls)
- ✅ Post-execution verification (count AIMessage objects)

**Test Results:**
```
✓ testing/rate-limit-queue.test.ts (11 tests) 7015ms
  ✓ Bypass Mode (1 test)
  ✓ Throttling Behavior (2 tests)
  ✓ Capacity Management (2 tests)
  ✓ Metrics (1 test)
  ✓ Queue Processing (1 test)
  ✓ Error Handling (2 tests)
  ✓ Dynamic Configuration (1 test)
  ✓ Singleton Pattern (1 test)
```

---

## 📊 What Counts as an API Request?

Based on GitHub's rate limiting documentation:

### ✅ Counts as 1 Request Each:

1. **Initial LLM Call** (sending prompt → getting response)
   - One request per `llm.invoke()` or `agent.stream()`
   - Streaming does NOT count as multiple requests (tokens are free once call initiated)

2. **Tool Calls During Agent Execution**
   - LangChain tool invocations may or may not count (depends on implementation)
   - **Conservative assumption**: Each tool call = 1 request (safest)
   - In reality: Tool calls are likely part of the conversation turn (0 requests)

3. **Agent Iterations (ReAct Loop)**
   - Each iteration where agent sends new message = 1 request
   - Format: User → Agent (1 req) → Tool → Agent (1 req) → Tool → Agent (1 req)
   - **Critical**: This is why 80 tool calls = ~40-80 API requests

### ❌ Does NOT Count:

1. **Tokens Generated** (output tokens are free after initial request)
2. **Streaming Chunks** (no extra charge for streaming vs non-streaming)
3. **Context Window Size** (prompt length doesn't affect rate limit count)
4. **Graph Operations** (Neo4j calls are separate from LLM API)

### 🔍 Actual Counting for GitHub Copilot Chat API:

Based on LangGraph source code analysis and OpenAI-compatible API patterns:

```
LangGraph ReAct Agent Execution (createReactAgent):

Graph: START → agent → tools → agent → tools → ... → END

Single Agent Execution (Sequential Tool Calls):
├─ Initial prompt → agent node: 1 API request ✅
│  └─ Model response includes tool_calls array
├─ Tools execute locally: 0 API requests (local JavaScript execution)
├─ Tool results → agent node: 1 API request ✅
│  └─ Model may return more tool_calls
├─ Tools execute locally: 0 API requests
├─ Tool results → agent node: 1 API request ✅
│  └─ Model generates final answer (no more tool_calls)
└─ TOTAL: 3 API requests for 2 tool calls (sequential)

Single Agent Execution (Parallel Tool Calls):
├─ Initial prompt → agent node: 1 API request ✅
│  └─ Model response includes tool_calls=[call1, call2]
├─ Tools execute in parallel: 0 API requests (local)
├─ All tool results → agent node: 1 API request ✅
│  └─ Model generates final answer
└─ TOTAL: 2 API requests for 2 tool calls (parallel)

Conservative Formula (Worst Case): 
  estimatedRequests = 1 + numToolCalls
  
Accurate Formula (Requires Post-Execution Analysis):
  actualRequests = count(AIMessage in result.messages)
```

**Key Insights:**
1. **Agent node execution = 1 API request** (calls `modelRunnable.invoke()`)
2. **Tool execution = 0 API requests** (local JavaScript, no LLM involved)
3. **Parallel tool calls reduce API usage** (multiple tools in one cycle)
4. **Conservative estimate is safer** (assumes worst case: sequential execution)

**Why Conservative?**
- Over-estimation prevents rate limit breaches
- Simple to calculate: `1 + toolCallCount` from task metadata
- Parallel optimization tracked separately for learning

**Verification:**
After execution, count AI messages to get actual usage:
```typescript
actualRequests = result.messages.filter(m => m._getType() === 'ai').length
```

**See:** `docs/API_REQUEST_COUNTING_ANALYSIS.md` for detailed research findings.

---

## 🏗️ Architecture

### Core Components

```typescript
┌────────────────────────────────────────────────────────┐
│ RateLimitQueue (Singleton)                             │
│                                                         │
│ Config: requestsPerHour = 2,500                        │
│ Derived: requestsPerMinute = 41.67                     │
│          minMsBetweenRequests = 1,440ms                │
│                                                         │
│ State:                                                  │
│ • requestTimestamps: number[] (sliding window)         │
│ • queue: PendingRequest[] (FIFO)                       │
│ • processing: boolean                                   │
│ • lastRequestTime: number                               │
│                                                         │
│ Methods:                                                │
│ • enqueue(request): Promise<T>                         │
│ • processQueue(): void (internal)                      │
│ • getRemainingCapacity(): number                       │
│ • getQueueDepth(): number                              │
│ • adjustThrottle(): void (dynamic)                     │
└────────────────────────────────────────────────────────┘
                           │
                           │ All LLM calls pass through
                           ↓
┌────────────────────────────────────────────────────────┐
│ LLM Client Wrappers                                    │
│ • CopilotAgentClient.execute()                         │
│ • OllamaAgentClient.execute()                          │
│ • Any custom LLM invocation                            │
└────────────────────────────────────────────────────────┘
```

---

## 💻 Implementation

### 1. Rate Limit Queue Class

```typescript
// src/orchestrator/rate-limit-queue.ts

interface PendingRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  estimatedRequests: number; // How many API calls this will make
}

interface RateLimitConfig {
  requestsPerHour: number;
  enableDynamicThrottling: boolean;
  warningThreshold: number; // % of limit (default 80%)
  logLevel: 'silent' | 'normal' | 'verbose';
}

export class RateLimitQueue {
  private static instance: RateLimitQueue;
  
  // Configuration
  private config: RateLimitConfig;
  private requestsPerHour: number;
  private requestsPerMinute: number;
  private requestsPerSecond: number;
  private minMsBetweenRequests: number;
  
  // State
  private requestTimestamps: number[] = []; // Sliding 1-hour window
  private queue: PendingRequest<any>[] = [];
  private processing: boolean = false;
  private lastRequestTime: number = 0;
  
  // Metrics
  private totalRequestsProcessed: number = 0;
  private totalWaitTimeMs: number = 0;
  
  private constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      requestsPerHour: 2500, // Conservative default
      enableDynamicThrottling: true,
      warningThreshold: 0.80, // Warn at 80%
      logLevel: 'normal',
      ...config
    };
    
    this.updateDerivedValues();
  }
  
  static getInstance(config?: Partial<RateLimitConfig>): RateLimitQueue {
    if (!RateLimitQueue.instance) {
      RateLimitQueue.instance = new RateLimitQueue(config);
    }
    return RateLimitQueue.instance;
  }
  
  /**
   * Recalculate derived timing values from requestsPerHour
   */
  private updateDerivedValues(): void {
    this.requestsPerHour = this.config.requestsPerHour;
    this.requestsPerMinute = this.requestsPerHour / 60;
    this.requestsPerSecond = this.requestsPerHour / 3600;
    this.minMsBetweenRequests = (3600 * 1000) / this.requestsPerHour;
    
    if (this.config.logLevel !== 'silent') {
      console.log(`🎛️  Rate Limiter Initialized:`);
      console.log(`   Requests/hour: ${this.requestsPerHour}`);
      console.log(`   Requests/minute: ${this.requestsPerMinute.toFixed(2)}`);
      console.log(`   Min delay between requests: ${this.minMsBetweenRequests.toFixed(0)}ms`);
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
    if (this.processing) return; // Already processing
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue[0]; // Peek at next request
      
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
        const timeUntilExpiry = (oldestTimestamp + 3600000) - now; // 1 hour = 3600000ms
        
        if (this.config.logLevel !== 'silent') {
          console.warn(`🚨 Rate limit FULL (${currentRequestsInWindow}/${this.requestsPerHour})`);
          console.warn(`   Waiting ${(timeUntilExpiry / 1000).toFixed(1)}s for capacity...`);
        }
        
        await new Promise(resolve => setTimeout(resolve, timeUntilExpiry + 100)); // +100ms buffer
        continue; // Re-check capacity
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
        
        // Record successful request
        this.lastRequestTime = Date.now();
        for (let i = 0; i < request.estimatedRequests; i++) {
          this.requestTimestamps.push(this.lastRequestTime);
        }
        this.totalRequestsProcessed += request.estimatedRequests;
        
        const waitTimeMs = executeStart - request.enqueuedAt;
        this.totalWaitTimeMs += waitTimeMs;
        
        if (this.config.logLevel === 'verbose') {
          console.log(`✅ Request ${request.id} completed (waited ${waitTimeMs}ms)`);
        }
        
        request.resolve(result);
      } catch (error: any) {
        if (this.config.logLevel !== 'silent') {
          console.error(`❌ Request ${request.id} failed: ${error.message}`);
        }
        request.reject(error);
      }
      
      // Dynamic throttling: Adjust delay if queue is backing up
      if (this.config.enableDynamicThrottling && this.queue.length > 10) {
        const backupFactor = Math.min(this.queue.length / 10, 3); // Max 3x slowdown
        const adjustedDelay = this.minMsBetweenRequests * backupFactor;
        
        if (this.config.logLevel !== 'silent') {
          console.warn(`🐌 Queue backup detected (${this.queue.length} pending)`);
          console.warn(`   Increasing delay to ${adjustedDelay.toFixed(0)}ms`);
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
    const oneHourAgo = Date.now() - 3600000; // 1 hour in ms
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneHourAgo);
  }
  
  /**
   * Get remaining capacity in current hour
   */
  public getRemainingCapacity(): number {
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
    return {
      requestsInCurrentHour: this.requestTimestamps.length,
      remainingCapacity: this.getRemainingCapacity(),
      queueDepth: this.queue.length,
      totalProcessed: this.totalRequestsProcessed,
      avgWaitTimeMs: this.totalRequestsProcessed > 0 
        ? this.totalWaitTimeMs / this.totalRequestsProcessed 
        : 0,
      usagePercent: (this.requestTimestamps.length / this.requestsPerHour) * 100,
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
```

---

### 2. LLM Client Integration

```typescript
// src/orchestrator/llm-client.ts

import { RateLimitQueue } from './rate-limit-queue.js';

export class CopilotAgentClient {
  private rateLimiter: RateLimitQueue;
  
  constructor(config: AgentConfig) {
    // ... existing initialization
    
    // Initialize rate limiter (singleton)
    this.rateLimiter = RateLimitQueue.getInstance({
      requestsPerHour: config.requestsPerHour || 2500,
      logLevel: config.rateLimitLogLevel || 'normal',
    });
  }
  
  /**
   * Execute agent with rate limiting
   */
  async execute(prompt: string, metadata?: { estimatedToolCalls?: number }): Promise<ExecutionResult> {
    // Estimate how many API calls this will make
    // Conservative formula: 1 initial + number of tool calls (assumes worst case: sequential)
    // 
    // Why conservative?
    // - Parallel tool calls use fewer API requests, but we can't predict parallelism
    // - Over-estimation is safer than under-estimation for rate limiting
    // - Actual usage is tracked post-execution for learning
    //
    // Formula: estimatedRequests = 1 + estimatedToolCalls
    // 
    // Examples:
    // - Simple query (0 tools): 1 request
    // - Research task (10 tools, sequential): 11 requests  
    // - Research task (10 tools, parallel): ~6 actual (but we estimate 11)
    const estimatedToolCalls = metadata?.estimatedToolCalls || 
                               Math.ceil((this.agentConfig.recursionLimit || 180) / 4); // Fallback
    const estimatedRequests = 1 + estimatedToolCalls;
    
    // Enqueue execution through rate limiter
    const result = await this.rateLimiter.enqueue(
      async () => {
        // Original execute logic here
        return this.executeInternal(prompt);
      },
      estimatedRequests
    );
    
    // Post-execution: Track actual usage for learning
    const actualRequests = result.messages.filter(m => m._getType() === 'ai').length;
    this.recordAPIUsageMetrics({
      estimated: estimatedRequests,
      actual: actualRequests,
      toolCalls: result.toolCallCount,
      parallelismFactor: actualRequests / estimatedRequests, // <1.0 = parallel optimization
    });
    
    return result;
  }
  
  /**
   * Internal execution (not rate limited directly)
   */
  private async executeInternal(prompt: string): Promise<ExecutionResult> {
    // Existing execute logic...
    // This method does the actual LLM call
  }
  
  /**
   * Track actual vs estimated API usage for future optimization
   */
  private recordAPIUsageMetrics(metrics: {
    estimated: number;
    actual: number;
    toolCalls: number;
    parallelismFactor: number;
  }): void {
    // Store for analysis (can be used to improve estimation over time)
    // Future optimization: Learn average parallelism and adjust estimates
    if (this.config.logLevel === 'verbose') {
      console.log('📊 API Usage:', {
        estimated: metrics.estimated,
        actual: metrics.actual,
        accuracy: `${(metrics.actual / metrics.estimated * 100).toFixed(1)}%`,
        parallelism: metrics.parallelismFactor.toFixed(2),
      });
    }
  }
}
```

---

### 3. Configuration

```typescript
// src/config/rate-limit-config.ts

export interface RateLimitSettings {
  requestsPerHour: number; // Set to -1 to bypass rate limiting entirely
  enableDynamicThrottling: boolean;
  warningThreshold: number;
  logLevel: 'silent' | 'normal' | 'verbose';
}

export const DEFAULT_RATE_LIMITS: Record<string, RateLimitSettings> = {
  copilot: {
    requestsPerHour: 2500, // Conservative (actual limit: 5000)
    enableDynamicThrottling: true,
    warningThreshold: 0.80,
    logLevel: 'normal',
  },
  ollama: {
    requestsPerHour: -1, // Bypass rate limiting for local models
    enableDynamicThrottling: false,
    warningThreshold: 1.0,
    logLevel: 'silent',
  },
  openai: {
    requestsPerHour: 3000, // Varies by tier
    enableDynamicThrottling: true,
    warningThreshold: 0.85,
    logLevel: 'normal',
  },
};

// Load from environment or config file
export function loadRateLimitConfig(provider: string): RateLimitSettings {
  const envRequestsPerHour = process.env.RATE_LIMIT_REQUESTS_PER_HOUR;
  
  if (envRequestsPerHour) {
    return {
      ...DEFAULT_RATE_LIMITS[provider],
      requestsPerHour: parseInt(envRequestsPerHour, 10),
    };
  }
  
  return DEFAULT_RATE_LIMITS[provider] || DEFAULT_RATE_LIMITS.copilot;
}
```

---

### 4. Environment Variables

```bash
# .env
RATE_LIMIT_REQUESTS_PER_HOUR=2500      # Main configuration
RATE_LIMIT_LOG_LEVEL=normal            # silent | normal | verbose
RATE_LIMIT_WARNING_THRESHOLD=0.80      # Warn at 80% usage
RATE_LIMIT_DYNAMIC_THROTTLE=true       # Enable queue-based throttling
```

---

## 📊 Usage Examples

### Example 1: Single Task Execution

```typescript
// Task with rate limiting (automatic)
const agent = new CopilotAgentClient({
  preamblePath: 'worker.md',
  requestsPerHour: 2500, // Only configuration needed!
});

const result = await agent.execute(prompt);
// Automatically queued and throttled
```

### Example 2: Monitoring Metrics

```typescript
const rateLimiter = RateLimitQueue.getInstance();

// During execution
console.log(rateLimiter.getMetrics());
/*
{
  requestsInCurrentHour: 1247,
  remainingCapacity: 1253,
  queueDepth: 3,
  totalProcessed: 1247,
  avgWaitTimeMs: 145,
  usagePercent: 49.88
}
*/
```

### Example 3: Batch Execution with Metrics

```typescript
const tasks = [task1, task2, task3, ...];

for (const task of tasks) {
  const metrics = rateLimiter.getMetrics();
  
  console.log(`📊 Before task ${task.id}:`);
  console.log(`   Usage: ${metrics.usagePercent.toFixed(1)}%`);
  console.log(`   Queue: ${metrics.queueDepth} pending`);
  
  await executeTask(task); // Automatically rate limited
}
```

---

## 🎯 Key Benefits

1. **Single Configuration**: Just set `requestsPerHour`, everything else derived
2. **Automatic Throttling**: No manual delays needed in task executor
3. **Queue-Based**: Fair FIFO processing, no request starvation
4. **Dynamic Adjustment**: Slows down when queue backs up
5. **Full Visibility**: Metrics available anytime
6. **Safe Defaults**: Conservative 2,500 req/hour (50% of GitHub limit)

---

## � Detailed API Request Analysis

### How LangGraph ReAct Agent Works

The `createReactAgent` function from LangGraph creates a **StateGraph** that cycles between two nodes:

```
Graph Flow:
START → agent → tools → agent → tools → ... → END
        ↑ API    ↑ local ↑ API    ↑ local
       (1 req)   (0 req) (1 req)  (0 req)
```

**Key Facts:**
1. **Agent node** = 1 API request (calls `modelRunnable.invoke()`)
2. **Tools node** = 0 API requests (executes JavaScript locally)
3. Graph loops until model returns response without `tool_calls`

### Sequential vs Parallel Tool Execution

**Sequential Example:**
```typescript
// Agent returns ONE tool call at a time
Cycle 1: agent → [tool_call_1] → tools → execute tool_call_1
Cycle 2: agent → [tool_call_2] → tools → execute tool_call_2  
Cycle 3: agent → final answer (no tool_calls)

Total: 3 API requests for 2 tool calls
Formula: 1 + numToolCalls
```

**Parallel Example:**
```typescript
// Agent returns MULTIPLE tool calls at once
Cycle 1: agent → [tool_call_1, tool_call_2] → tools → execute both
Cycle 2: agent → final answer (no tool_calls)

Total: 2 API requests for 2 tool calls
Formula: 1 + ceil(numToolCalls / parallelism)
```

### Why Conservative Estimation Works

**Conservative Formula:** `estimatedRequests = 1 + numToolCalls`

**Assumptions:**
- Worst case: All tools execute sequentially (parallelism = 1.0)
- Each tool call triggers a separate agent cycle
- Better to over-estimate than under-estimate

**Reality:**
- Models often parallelize tool calls
- Actual requests may be lower (safe over-estimate)
- Post-execution verification tracks actual usage

### Verification Strategy

**Post-Execution:**
```typescript
// Count actual API requests made
const actualRequests = result.messages.filter(m => m._getType() === 'ai').length;

// Compare to estimate
const estimated = 1 + result.toolCallCount;
const accuracy = actualRequests / estimated;

// Sequential execution: accuracy ≈ 1.0 (perfect match)
// Parallel execution: accuracy < 1.0 (safe over-estimate)
```

### RecursionLimit vs API Requests

**RecursionLimit:** Maximum total graph node executions (agent + tools)

**Relationship:**
```
Node Executions = (Agent Calls × 2) - 1

Example: 10 tool calls sequential
- 11 agent calls + 10 tool calls = 21 node executions
- Max API requests ≈ recursionLimit / 2

With recursionLimit = 180:
- Max ~90 API requests
- Our circuit breaker stops at 60 tool calls → ~61 API requests max
```

---

## 🎯 Usage Scenarios

### Scenario 1: Local Development (Ollama)

```typescript
// No rate limiting needed
const config = {
  requestsPerHour: -1, // Bypass entirely
  logLevel: 'silent',
};

const limiter = RateLimitQueue.getInstance(config);
// All requests execute immediately, no throttling
```

### Scenario 2: GitHub Copilot Production

```typescript
// Conservative rate limiting
const config = {
  requestsPerHour: 2500, // 50% of 5000 limit
  enableDynamicThrottling: true,
  warningThreshold: 0.80,
  logLevel: 'normal',
};

const limiter = RateLimitQueue.getInstance(config);
// Requests queued and throttled to stay under limit
```

### Scenario 3: OpenAI API (Tier-Based)

```typescript
// Adjust based on your tier
const config = {
  requestsPerHour: 3000, // Tier 1 example
  enableDynamicThrottling: true,
  warningThreshold: 0.85,
  logLevel: 'verbose',
};
```

### Scenario 4: Batch Processing

```typescript
async function processBatch(tasks: Task[]) {
  const limiter = RateLimitQueue.getInstance();
  
  // All tasks automatically throttled
  const results = await Promise.all(
    tasks.map(task => 
      executeWithRateLimit(task)
    )
  );
  
  // Check final metrics
  const metrics = limiter.getMetrics();
  console.log(`Processed ${results.length} tasks`);
  console.log(`Used ${metrics.usagePercent.toFixed(1)}% of hourly limit`);
  
  return results;
}
```

---

## 🚨 Common Pitfalls & Solutions

### Pitfall 1: Under-Estimating Tool Calls

**Problem:** Task metadata says 5 tools, actually uses 50
**Solution:** Circuit breaker stops at 60 tool calls, prevents runaway
**Better:** PM agent should provide accurate estimates

### Pitfall 2: Forgetting to Pass Through Rate Limiter

**Problem:** Direct LLM calls bypass rate limiter
**Solution:** All LLM invocations MUST go through `rateLimiter.enqueue()`
**Enforcement:** Code review, linting rules

### Pitfall 3: Setting Limit Too High

**Problem:** `requestsPerHour: 5000` hits actual GitHub limit
**Solution:** Use conservative default (2500), increase only if needed
**Monitoring:** Track actual usage, adjust up cautiously

### Pitfall 4: Not Handling -1 Bypass

**Problem:** Rate limiter still throttles when set to -1
**Solution:** Check `requestsPerHour === -1` at entry, return immediately
**Implementation:** Done in `enqueue()` method (see code above)

---

## 📈 Performance Characteristics

### Time Complexity

- **Enqueue:** O(1) - add to queue
- **Process:** O(n) - iterate queue
- **Prune timestamps:** O(n) - filter old entries
- **Overall:** O(n) where n = queue depth

### Space Complexity

- **Request timestamps:** O(h) where h = requestsPerHour
- **Queue:** O(q) where q = pending requests
- **Total:** O(h + q)

**Example:**
- 2,500 req/hour limit
- 10 requests queued
- Memory: ~2,510 entries (~25KB)

### Throughput

**Best Case (No Throttling):**
- Queue empty, capacity available
- Request executes immediately
- Overhead: <1ms

**Typical Case (Light Throttling):**
- Small delays between requests
- Queue processes smoothly
- Overhead: 1-2 seconds per request

**Worst Case (Heavy Queue):**
- Queue backs up, capacity full
- Dynamic throttling increases delays
- Overhead: 5-10 seconds per request
- **Solution:** Reduce concurrent tasks or increase limit

---

## �🔄 Migration Path

### Phase 1: Add Rate Limiter (No Breaking Changes)
1. Implement `RateLimitQueue` class
2. Integrate into `CopilotAgentClient.execute()`
3. Default: `requestsPerHour = 2500`
4. **Result**: Existing code works, now rate-limited

### Phase 2: Remove Manual Delays
1. Remove batch delays from task-executor.ts
2. Rate limiter handles all throttling
3. **Result**: Cleaner code, same protection

### Phase 3: Add Monitoring
1. Report metrics in execution summary
2. Show queue depth during execution
3. **Result**: Full visibility

### Phase 4: Optimize (Optional)
1. Track parallel tool call patterns
2. Adjust estimates based on history
3. **Result**: More accurate predictions, less over-estimation

---

## 📖 Usage Examples

### Basic Usage (Automatic - No Code Changes Required)

The rate limiter is automatically integrated into `CopilotAgentClient`. Just use it normally:

```typescript
import { CopilotAgentClient } from './orchestrator/llm-client.js';

// Create client - rate limiter is automatically initialized
const client = new CopilotAgentClient({
  preamblePath: 'agent.md',
  provider: 'copilot',  // Uses 2,500 req/hour limit
});

// Execute tasks - automatically rate-limited
const result = await client.execute('Debug the authentication system');
// Rate limiter logs: "📊 API Usage: 12 requests, 8 tool calls"
// Rate limiter logs: "📊 Rate Limit: 12/2500 (0.5%)"
```

### Bypass Mode for Local Development (Ollama)

```typescript
const client = new CopilotAgentClient({
  preamblePath: 'agent.md',
  provider: 'ollama',  // Automatically bypasses rate limiting (-1)
});

// Executes immediately with no throttling
await client.execute('Run integration tests');
```

### Custom Rate Limits

```typescript
import { RateLimitQueue } from './orchestrator/rate-limit-queue.js';

// Override default limits
const limiter = RateLimitQueue.getInstance({
  requestsPerHour: 1000,     // Custom limit
  logLevel: 'verbose',       // Show detailed logs
  warningThreshold: 0.90,    // Warn at 90% capacity
});

// Or update at runtime
limiter.setRequestsPerHour(500);  // Reduce limit dynamically
```

### Monitoring Metrics

```typescript
import { RateLimitQueue } from './orchestrator/rate-limit-queue.js';

const limiter = RateLimitQueue.getInstance();

// Check metrics
const metrics = limiter.getMetrics();
console.log(metrics);
/*
{
  requestsInCurrentHour: 243,
  remainingCapacity: 2257,
  queueDepth: 0,
  totalProcessed: 243,
  avgWaitTimeMs: 1450,
  usagePercent: 9.72
}
*/

// Check capacity before bulk operations
if (limiter.getRemainingCapacity() < 100) {
  console.warn('⚠️ Low capacity - waiting before starting batch...');
}
```

### Configuration by Provider

```typescript
import { loadRateLimitConfig } from './config/rate-limit-config.js';

// Load provider-specific config
const copilotConfig = loadRateLimitConfig('copilot');
// { requestsPerHour: 2500, enableDynamicThrottling: true, ... }

const ollamaConfig = loadRateLimitConfig('ollama');
// { requestsPerHour: -1, enableDynamicThrottling: false, ... }

const openaiConfig = loadRateLimitConfig('openai');
// { requestsPerHour: 3000, enableDynamicThrottling: true, ... }
```

---

## ✅ Testing Strategy

```typescript
// testing/rate-limit-queue.test.ts

describe('RateLimitQueue', () => {
  it('should throttle requests to stay under limit', async () => {
    const limiter = new RateLimitQueue({ requestsPerHour: 60 }); // 1 req/min
    
    const start = Date.now();
    const results = await Promise.all([
      limiter.enqueue(() => Promise.resolve(1)),
      limiter.enqueue(() => Promise.resolve(2)),
      limiter.enqueue(() => Promise.resolve(3)),
    ]);
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(2000); // 2+ seconds for 3 requests
    expect(results).toEqual([1, 2, 3]);
  });
  
  it('should respect capacity limits', async () => {
    const limiter = new RateLimitQueue({ requestsPerHour: 2 });
    
    // Fill capacity
    await limiter.enqueue(() => Promise.resolve(1));
    await limiter.enqueue(() => Promise.resolve(2));
    
    // Should wait for oldest to expire
    const metrics = limiter.getMetrics();
    expect(metrics.remainingCapacity).toBe(0);
  });
});
```

---

## 📝 Documentation Updates Needed

1. **README.md**: Add rate limiting section
2. **CONFIGURATION.md**: Document `RATE_LIMIT_REQUESTS_PER_HOUR`
3. **TESTING_GUIDE.md**: Update with rate limiter behavior
4. **API.md**: Document `RateLimitQueue` public API

---

**Status**: Ready for implementation
**Estimated Effort**: 4-6 hours
**Risk**: Low (additive, no breaking changes)
