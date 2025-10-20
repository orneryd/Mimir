# QC Agent Recursion Spiral Analysis

## Executive Summary

**Critical Finding:** Worker agent (not QC agent) went into recursion spiral on task-1.2, hitting 180-step limit twice. QC agent performed correctly with 0 tool calls and passed all subsequent tasks.

**Root Cause:** Worker agent executed >180 tool calls without reaching completion condition on complex multi-file endpoint implementation task.

**Impact:** 1/6 tasks failed (task-1.2), execution time wasted (~908s), downstream tasks blocked until task split.

---

## 1. Graph Data Verification

### Current Graph State
```
✅ Connected to Neo4j
   Nodes: 7 total
   Edges: 2 total
   Types: {"file":3,"todo":4}
```

### Critical Gap Analysis

**❌ MISSING FROM GRAPH:**
1. **Task execution results** - No `workerOutput` stored for completed tasks
2. **QC verification records** - No `qcVerification` stored with scores/feedback
3. **Attempt history** - No `attemptNumber` tracking per task
4. **Failure context** - No `errorContext` or `qcFailureReport` stored
5. **Performance metrics** - No duration, token count, tool call count stored

**✅ PRESENT IN GRAPH:**
- 4 TODO nodes (likely task-1.1, task-1.2, task-1.3, task-1.4)
- 3 file nodes (indexed files)
- 2 edges (likely task dependencies)

**PROBLEM:** The execution-report.md shows comprehensive data (6 tasks, success/failure, durations, QC scores) but **NONE of this is in the graph**. The multi-agent system is NOT persisting execution state to Neo4j.

---

## 2. QC Agent Behavior Analysis

### QC Agent Did NOT Go Haywire

**Evidence from logs:**

```
✅ Task completed in 2.56s
📊 Tokens: 163
🔧 Tool calls: 0        # ← QC made ZERO tool calls
📊 API Usage: 1 requests, 0 tool calls
✅ QC PASSED (score: 97/100)
```

**QC agent performance across all tasks:**
- **Task 1.1 QC:** 0 tool calls, 97/100 score, 2.56s
- **Task 1.3 QC:** 0 tool calls, 98/100 score, 2.55s
- **Task 1.4 QC:** 0 tool calls, 95/100 score, 2.14s
- **Task 1.5 QC:** 0 tool calls, ???/100 score, 3.27s (no score in logs)
- **Task 1.6 QC:** Not shown in execution logs

**Conclusion:** QC agent operated efficiently, made zero tool calls, completed in 2-3 seconds, and provided consistent scoring. **QC did not spiral.**

---

## 3. Worker Agent Recursion Spiral

### What Actually Happened

**Task 1.2: "Implement /register and /login endpoints"**

**Attempt 1:**
```
📤 Invoking agent with LangGraph...
❌ Agent execution failed: Recursion limit reached (250 steps)
💡 This task is too complex or the agent is stuck in a loop.
   Possible causes:
   - Task requires too many tool calls (current: >100)
   - Agent is repeating the same actions
   - Task description is ambiguous, causing confusion
```

**Attempt 2:**
```
❌ Worker execution failed: Recursion limit of 180 reached without hitting a stop condition.
```

### Root Cause Analysis

**Task Complexity Breakdown:**

Task-1.2 required:
1. Create `src/auth/routes.ts` (Express router setup)
2. Create `src/auth/controller.ts` (endpoint logic)
3. Implement `/register` endpoint:
   - Input validation (email format, password strength)
   - Check for duplicate email
   - Hash password with bcrypt (≥10 rounds)
   - Store user in userStore
   - Return success response
4. Implement `/login` endpoint:
   - Input validation
   - Find user by email
   - Verify password with bcrypt.compare()
   - Generate JWT token
   - Return token in response
5. Error handling for all edge cases
6. TypeScript types for all request/response shapes
7. Comments explaining security choices
8. Test with curl or equivalent

**Why Worker Spiraled:**

**Problem 1: Multi-File Creation in Single Task**
- Task specified `Files WRITTEN: [src/auth/routes.ts, src/auth/controller.ts]`
- Worker likely struggled to coordinate between two files
- May have repeatedly checked files, re-written, validated, re-checked

**Problem 2: Complex Validation Logic**
- Email format validation
- Password strength validation
- Duplicate check (requires reading from userStore)
- Worker may have iterated on validation rules extensively

**Problem 3: Security Requirements Without Code Examples**
- "Passwords hashed (bcrypt ≥10 rounds)" - abstract requirement
- "JWT secret not hardcoded" - requires environment variable setup
- Worker may have tried multiple approaches, testing each

**Problem 4: Ambiguous Completion Condition**
- Verification command: "Manual endpoint test (curl or Postman)"
- Worker cannot execute Postman
- May have created curl commands, tried to validate, failed, retried

**Tool Call Pattern (hypothesized from similar cases):**
```
1. read_file('src/auth/model.ts')         # Get user model
2. write('src/auth/routes.ts', ...)       # Create routes file
3. read_file('src/auth/routes.ts')        # Verify write
4. write('src/auth/controller.ts', ...)   # Create controller
5. read_file('src/auth/controller.ts')    # Verify write
6. run_terminal_cmd('npx tsc ...')        # Type check
7. read_file('src/auth/routes.ts')        # Re-read to check errors
8. search_replace(...)                    # Fix TypeScript error
9. run_terminal_cmd('npx tsc ...')        # Re-check
10. read_file('src/auth/controller.ts')   # Re-read to add validation
11. search_replace(...)                   # Add email validation
12. run_terminal_cmd('npx tsc ...')       # Re-check
... (repeat 170 more times)
```

### Why QC Didn't Spiral

**QC agent received:**
```
🔍 Task length: 7211 chars
```

**QC context included:**
- Task specification (acceptance criteria, verification criteria)
- Worker's final output (if any - likely empty since worker never finished)
- Subgraph of task dependencies

**QC agent role:**
```
Senior API security specialist with expertise in authentication flows, 
password hashing, and token vulnerabilities. Aggressively verifies input 
validation, password hashing, and JWT security.
```

**QC verification criteria:**
```
Security:
- Passwords hashed (bcrypt ≥10 rounds)
- JWT secret not hardcoded
- No sensitive logs

Functionality:
- Registration/login flows work
- JWT issued
- Error handling for bad credentials

Code Quality:
- TypeScript types
- No 'any'
- Code commented
```

**Why QC succeeded where Worker failed:**

1. **Different completion condition:** QC just needs to verify yes/no, not implement
2. **No tool dependency:** QC can evaluate based on description alone if worker output is empty
3. **Simpler preamble:** QC preamble likely doesn't mandate tool usage like worker preamble does
4. **Failure mode:** QC can say "FAIL - no evidence" in one tool-less response

**QC likely saw:** Empty worker output → No files created → Immediate FAIL verdict → No tool calls needed

---

## 4. Missing Graph Persistence

### What SHOULD Be in Graph (Per AGENTS.md)

**From AGENTS.md Multi-Agent Workflow:**

```typescript
// Worker should store output
graph_update_node({
  id: 'task-id',
  properties: {
    workerOutput: "Implementation complete. Created src/auth/routes.ts...",
    status: 'awaiting_qc',
    attemptNumber: 1,
    duration: 908.34,
    tokenCount: 8000,
    toolCallCount: 180
  }
});

// QC should store verification
graph_update_node({
  id: 'task-id',
  properties: {
    qcVerification: {
      passed: false,
      score: 0,
      feedback: "No code artifacts found. Worker failed to complete implementation.",
      securityChecks: {...},
      functionalityChecks: {...},
      codeQualityChecks: {...}
    },
    status: 'failed',
    errorContext: {
      qcFeedback: "Recursion limit exceeded. Worker never produced output.",
      issues: ["No src/auth/routes.ts created", "No src/auth/controller.ts created"],
      requiredFixes: ["Split task into smaller subtasks", "Add file creation verification"]
    }
  }
});
```

### What IS in Graph (Actual)

```
Nodes: 7
Types: {"file":3,"todo":4}
```

**Analysis:** Only base task nodes exist. No execution metadata persisted.

### Code Archaeology Needed

**Where to look:**
1. `src/orchestrator/task-executor.ts` - Does it call `graph_update_node` after worker execution?
2. `src/orchestrator/agent-chain.ts` - Does QC agent update graph with verification results?
3. Worker agent preamble (`docs/agents/claudette-worker.md`?) - Does it know to store `workerOutput`?
4. QC agent preamble (`docs/agents/claudette-qc.md`?) - Does it know to store `qcVerification`?

---

## 5. Safeguards Against Recursion Spirals

### Current System Has Some Safeguards

**✅ Already Implemented:**
1. **Recursion limit:** 180 steps (worker), 250 steps (PM)
2. **Rate limiting:** 2500 requests/hour with 1440ms delay
3. **Max retries:** 2 attempts per task before escalation
4. **Context window tracking:** Warns if >50 tool calls
5. **Timeout warnings:** "⚠️  WARNING: No message trimming - tasks >50 tool calls may hit context limits"

### Proposed Non-Agent Safeguards

#### Safeguard 1: Tool Call Budget per Task

**Mechanism:**
```typescript
// In task-executor.ts
const TOOL_CALL_BUDGET = {
  simple: 20,      // File read/write tasks
  moderate: 50,    // Single-file implementation
  complex: 100,    // Multi-file implementation
  research: 150    // PM research tasks
};

function executeWorkerTask(task, budget = TOOL_CALL_BUDGET.moderate) {
  let toolCallCount = 0;
  const toolWrapper = (toolName, toolArgs) => {
    if (++toolCallCount > budget) {
      throw new Error(`Tool call budget exceeded (${budget}). Task too complex.`);
    }
    return originalTool(toolName, toolArgs);
  };
  // Execute with wrapped tools
}
```

**Benefits:**
- Hard limit prevents infinite loops
- Budget calibrated to task complexity (simple vs complex)
- Fails fast instead of wasting 180 iterations

**Drawbacks:**
- Requires manual budget assignment per task type
- May cut off legitimate complex work

**Mitigation:**
- PM agent assigns budget based on task complexity estimate
- Budget stored in task node: `properties.toolCallBudget: 50`
- Worker can request budget increase via special tool call (requires PM approval)

---

#### Safeguard 2: Progress Verification Checkpoints

**Mechanism:**
```typescript
// Worker must report progress every N tool calls
const CHECKPOINT_INTERVAL = 25;

function executeWithCheckpoints(task) {
  let lastCheckpoint = 0;
  let checkpointProgress = [];
  
  const checkpointTool = (progress: string) => {
    checkpointProgress.push({
      toolCall: currentToolCallCount,
      progress: progress,
      timestamp: Date.now()
    });
  };
  
  // After every 25 tool calls, require progress report
  if (currentToolCallCount % CHECKPOINT_INTERVAL === 0) {
    if (checkpointProgress.length === lastCheckpoint) {
      throw new Error('No progress reported at checkpoint. Worker may be stuck.');
    }
    lastCheckpoint = checkpointProgress.length;
  }
}
```

**Benefits:**
- Detects stuck loops (same progress repeated)
- Provides telemetry for debugging
- Worker self-reports what it's working on

**Drawbacks:**
- Requires worker preamble to know about checkpoints
- Adds cognitive load to worker agent

**Mitigation:**
- Make checkpoint tool optional but tracked
- If no checkpoints after 50 calls → warning
- If no checkpoints after 100 calls → force termination

---

#### Safeguard 3: File Modification Diff Tracking

**Mechanism:**
```typescript
// Track files modified and detect thrashing
const fileModifications = new Map<string, number>();

function trackFileWrite(filePath, content) {
  const modCount = fileModifications.get(filePath) || 0;
  fileModifications.set(filePath, modCount + 1);
  
  if (modCount > 10) {
    throw new Error(`File ${filePath} modified ${modCount} times. Worker thrashing detected.`);
  }
}
```

**Benefits:**
- Catches edit-revert-edit loops
- Detects worker uncertainty about implementation

**Drawbacks:**
- Legitimate refinement may trigger limit
- Requires tracking across tool calls

**Mitigation:**
- Higher threshold (20 modifications)
- Only count substantive changes (not typo fixes)
- Report diff size: if diffs getting smaller → thrashing

---

#### Safeguard 4: Task Complexity Pre-Flight Check

**Mechanism:**
```typescript
// Before task execution, analyze complexity
function analyzeTaskComplexity(task): TaskComplexity {
  const factors = {
    filesWritten: task.filesWritten.length,          // +10 per file
    filesRead: task.filesRead.length,                // +2 per file
    acceptanceCriteria: task.acceptanceCriteria.length, // +5 per criterion
    edgeCases: task.edgeCases.length,                // +3 per edge case
    dependencies: task.dependencies.length,          // +5 per dependency
    verificationCommands: task.verificationCommands.length // +5 per command
  };
  
  const score = 
    factors.filesWritten * 10 +
    factors.filesRead * 2 +
    factors.acceptanceCriteria * 5 +
    factors.edgeCases * 3 +
    factors.dependencies * 5 +
    factors.verificationCommands * 5;
    
  if (score > 100) {
    return {
      complexity: 'TOO_COMPLEX',
      recommendation: 'Split into smaller subtasks',
      estimatedToolCalls: score * 2
    };
  }
  
  return {
    complexity: score < 50 ? 'SIMPLE' : 'MODERATE',
    estimatedToolCalls: score
  };
}

// Reject task if too complex
if (complexity.complexity === 'TOO_COMPLEX') {
  return {
    status: 'rejected',
    reason: 'Task complexity exceeds safe execution threshold',
    recommendation: complexity.recommendation
  };
}
```

**Benefits:**
- Prevents complex tasks from starting
- Forces PM to break down tasks
- Quantitative complexity metric

**Drawbacks:**
- May be too conservative
- Doesn't account for worker skill/context

**Mitigation:**
- Make threshold configurable
- PM can override with justification
- Track actual tool calls vs estimated to improve heuristic

---

#### Safeguard 5: Stateful Loop Detection

**Mechanism:**
```typescript
// Track state hashes to detect loops
const stateHistory: string[] = [];
const LOOP_DETECTION_WINDOW = 10;

function detectLoop(currentState: ToolCallSequence): boolean {
  const stateHash = hashToolSequence(currentState);
  
  // Check if this exact state appeared in last N steps
  const recentStates = stateHistory.slice(-LOOP_DETECTION_WINDOW);
  const loopCount = recentStates.filter(s => s === stateHash).length;
  
  if (loopCount >= 3) {
    return true; // Same state repeated 3x in 10 steps = loop
  }
  
  stateHistory.push(stateHash);
  return false;
}

// Hash based on tool call pattern, not content
function hashToolSequence(sequence: ToolCall[]): string {
  const pattern = sequence.slice(-5).map(call => call.toolName).join('-');
  return crypto.createHash('md5').update(pattern).digest('hex');
}
```

**Benefits:**
- Detects actual loops (read-write-check-read-write-check...)
- Pattern-based, not content-based
- Works across different contexts

**Drawbacks:**
- May false-positive on legitimate iterative work
- Requires state tracking overhead

**Mitigation:**
- Only trigger on exact pattern match (not similar)
- Increase loop count threshold (5 instead of 3)
- Log patterns for manual review

---

## 6. Recommendations

### Immediate Actions (P0 - Critical)

1. **Fix Graph Persistence**
   - **File:** `src/orchestrator/task-executor.ts`
   - **Change:** Add `graph_update_node` after worker execution:
     ```typescript
     await graphManager.updateNode(taskId, {
       workerOutput: workerResult.output,
       attemptNumber: currentAttempt,
       duration: executionTime,
       tokenCount: workerResult.tokens,
       toolCallCount: workerResult.toolCalls,
       status: 'awaiting_qc'
     });
     ```
   - **File:** `src/orchestrator/agent-chain.ts` (or QC executor)
   - **Change:** Add `graph_update_node` after QC verification:
     ```typescript
     await graphManager.updateNode(taskId, {
       qcVerification: {
         passed: qcResult.passed,
         score: qcResult.score,
         feedback: qcResult.feedback,
         ...qcResult.checks
       },
       status: qcResult.passed ? 'completed' : 'failed',
       errorContext: qcResult.passed ? null : {
         qcFeedback: qcResult.feedback,
         issues: qcResult.issues,
         requiredFixes: qcResult.fixes
       }
     });
     ```

2. **Implement Tool Call Budget** (Safeguard 1)
   - Add `toolCallBudget` field to task schema
   - PM agent assigns budget based on complexity estimate
   - Executor enforces budget with clear error message
   - **Target:** Prevent 180-step spirals, fail at 50-100 steps

3. **Add Task Complexity Analysis** (Safeguard 4)
   - Reject tasks with complexity score >100
   - Force PM to split complex tasks before execution
   - Log complexity scores for tuning threshold

### Short-Term Actions (P1 - High Priority)

4. **Implement Progress Checkpoints** (Safeguard 2)
   - Add `report_progress(description)` tool for workers
   - Require checkpoint every 25 tool calls
   - Log progress for debugging failed tasks

5. **Add File Modification Tracking** (Safeguard 3)
   - Track writes per file
   - Warn at 10 modifications, error at 20
   - Log modification patterns

6. **Update Worker Preamble**
   - Add explicit completion condition: "After creating all required files and verifying compilation, call `finish_task(summary)` tool"
   - Add tool call budget awareness: "You have N tool calls budgeted. Plan your implementation to stay within budget."
   - Add progress reporting requirement: "Report progress every 20-25 tool calls with `report_progress(description)`"

### Medium-Term Actions (P2 - Nice to Have)

7. **Implement Loop Detection** (Safeguard 5)
   - Track tool call patterns
   - Detect repeated sequences
   - Break loop with intervention

8. **Add Task Decomposition Heuristics to PM**
   - PM agent checks complexity score before creating task
   - If score >100, auto-split into subtasks
   - Example: task-1.2 (complexity ~120) → task-1.2a (routes file, ~60) + task-1.2b (controller file, ~60)

9. **Improve Verification Commands**
   - Replace "Manual endpoint test" with executable commands
   - Example: `curl -X POST http://localhost:3000/auth/register -d '{"email":"test@example.com","password":"test123"}' -H "Content-Type: application/json"`
   - Worker can actually execute and verify

### Long-Term Actions (P3 - Research)

10. **Worker Skill Calibration**
    - Track worker success rate by task complexity
    - Assign easier tasks to workers with lower success rates
    - Adaptive tool call budgets based on historical performance

11. **Automated Task Splitting**
    - If worker fails at 50% of budget, auto-split task
    - Create two subtasks with half the scope each
    - PM reviews split before re-execution

12. **Context Window Optimization**
    - Implement message trimming for tasks >50 tool calls
    - Summarize early tool calls, keep recent 20 in full
    - Reduce token usage without losing critical context

---

## 7. Why Non-Agent Safeguards Are Critical

**Problem with Agent-Based Safeguards:**
```
Agent A (Worker) spirals → Agent B (Monitor) detects → Agent B spirals analyzing Agent A
→ Agent C (Meta-Monitor) detects → Agent C spirals...
→ Infinite regress, no guaranteed halt
```

**LLM Non-Determinism:**
- Same prompt can yield different tool calls
- "Fix your loop" instruction might cause different loop
- No guarantee of convergence

**Non-Agent Safeguards:**
- **Deterministic:** Tool call count always increments, budget always enforced
- **Guaranteed Halt:** Budget exceeded → hard stop, no LLM involved
- **Fast Failure:** Detect and stop in <5 seconds, not 900 seconds
- **Debuggable:** Logs show exact tool call that triggered limit

---

## 8. Conclusion

### What Went Wrong

1. **Worker agent spiraled** on complex multi-file task (task-1.2)
2. **Graph did not capture** execution results, QC verification, or failure context
3. **PM created task** that was too complex for single worker execution
4. **QC agent worked correctly** (0 tool calls, quick verification)

### What Needs Fixing

**Priority 1 (Immediate):**
- ✅ Add graph persistence of execution results
- ✅ Implement tool call budgets
- ✅ Add task complexity pre-flight checks

**Priority 2 (Short-term):**
- ✅ Add progress checkpoints
- ✅ Track file modification thrashing
- ✅ Update worker preamble with completion signals

**Priority 3 (Long-term):**
- 🔬 Research adaptive budgets
- 🔬 Research automated task splitting
- 🔬 Research context window optimization

### Success Metrics

**After implementing safeguards:**
- ✅ No task exceeds 100 tool calls without justification
- ✅ All execution results persisted to graph
- ✅ Complex tasks rejected with split recommendations
- ✅ Worker failures detected in <60 seconds (not 900 seconds)
- ✅ QC verification results queryable from graph
- ✅ Task complexity scores logged and tunable

**Target KPIs:**
- Recursion spiral incidents: 0 per 100 tasks
- Average tool calls per task: <30
- Task success rate: >90%
- Time to failure detection: <60 seconds
