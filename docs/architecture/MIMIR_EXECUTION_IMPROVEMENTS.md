# Mimir Execution System Improvements

**Date:** 2025-10-20  
**Updated:** 2025-10-21  
**Status:** PHASE 2 COMPLETE - CRITICAL ISSUES REMAIN  
**Priority:** P0 (System Reliability)

---

## 📈 PROGRESS SUMMARY

**Overall Progress:** 2.5/4 phases complete (62.5%)

| Phase | Status | Progress | Impact |
|-------|--------|----------|--------|
| Phase 2: Observability | ✅ Complete | 100% | 100% diagnostic capture achieved |
| Phase 1: Critical Fixes | 🔄 In Progress | 80% | 4/5 items complete |
| Phase 3: Usability | ⏳ Not Started | 0% | Improves UX |
| Phase 4: Testing | ⏳ Not Started | 0% | Validates improvements |

**Key Metrics:**
- ✅ Diagnostic Data Capture: 0% → 100% (ACHIEVED)
- ✅ Circuit Breaker: Dynamic limits implemented (ACHIEVED)
- ✅ Graph Storage: Automatic capture + worker guidance (ACHIEVED)
- ✅ Environment Validation: Task 0 mandatory for external dependencies (ACHIEVED)
- ❌ Task Success Rate: 41.7% (needs Phase 1.5 completion)

**Next Priority:** Phase 1.5 (Prevent Script Execution) - Final critical fix

---

## ✅ COMPLETED WORK

### Phase 2: Observability (COMPLETED - 2025-10-21)

**✅ 2.1: Automatic Diagnostic Data Capture**
- **Status:** FULLY IMPLEMENTED
- **File:** `src/orchestrator/task-executor.ts`
- **Documentation:** `docs/architecture/AUTOMATIC_DIAGNOSTIC_CAPTURE.md`
- **Test Coverage:** 30/30 tests passing (`testing/automatic-diagnostic-capture.test.ts`)

**Implementation Details:**
- ✅ **Phase 1:** Task Initialization - Creates initial graph node with task metadata
- ✅ **Phase 2:** Worker Execution Start - Captures worker start time, attempt number, context
- ✅ **Phase 3:** Worker Execution Complete - Captures output, tokens, tool calls, duration
- ✅ **Phase 4:** Circuit Breaker Triggered - Captures circuit breaker events
- ✅ **Phase 5:** QC Execution Start - Captures QC start time, attempt number
- ✅ **Phase 6:** QC Execution Complete - Captures QC results, score, feedback, issues
- ✅ **Phase 7:** Retry Preparation - Captures retry context, error details
- ✅ **Phase 8:** Task Success - Captures aggregated metrics, final QC score
- ✅ **Phase 9:** Task Failure - Captures failure metrics, QC history, common issues
- ✅ **Phase 10:** Circuit Breaker Failure - Captures circuit breaker failure details

**Key Features:**
- System-level capture (no reliance on agent prompts)
- Comprehensive metadata at every execution phase
- Full QC verification history tracking
- Retry attempt tracking with error context
- Aggregated success/failure metrics
- Circuit breaker integration

**Benefits Achieved:**
- 100% diagnostic data capture (was 0%)
- Full execution traceability
- Detailed failure analysis capability
- QC history tracking for learning
- Performance metrics per task

---

## 📊 EXECUTIVE SUMMARY

**Execution Analyzed:** Translation validation workflow (12 tasks, 3.3 hours)  
**Success Rate:** 41.7% (5/12 tasks succeeded)  
**Critical Issues:** 5 major system failures identified  
**Graph Data:** 0 nodes stored (complete diagnostic failure)

**Primary Root Cause:** PM agent did not apply Tool-Based Execution template, resulting in vague task prompts that caused workers to write code instead of using tools, hit recursion limits, and fail to store diagnostic data.

---

## 🚨 CRITICAL ISSUES

### Issue #1: Recursion Limit Exceeded (250 steps)

**Symptom:**
```
❌ Agent execution failed: Recursion limit reached (250 steps)
💡 This task is too complex or the agent is stuck in a loop.
   Possible causes:
   - Task requires too many tool calls (current: >100)
   - Agent is repeating the same actions
   - Task description is ambiguous, causing confusion
```

**Root Cause:**
- Workers received vague task prompts ("Connect to MongoDB", "Query database")
- Workers attempted to figure out implementation details through trial and error
- Each failed attempt consumed tool calls
- No circuit breaker to stop execution before hitting limit

**Impact:**
- Tasks aborted mid-execution
- No results stored
- Wasted compute resources (3.3 hours)

**Fix Required:**
1. Add `maxToolCalls: 50` limit per task
2. Add early warning at 30 tool calls
3. Add automatic task splitting for complex tasks
4. Strengthen PM prompts to provide explicit instructions

---

### Issue #2: PM Agent Ignored Tool-Based Execution Template

**Symptom:**
PM agent generated OLD-style prompts without Tool-Based Execution template:

```markdown
❌ OLD (What was generated):
- Connect to MongoDB using provided connection string.
- Query `caremark-translation` for all page URLs.
- Output: CSV file with columns: Page URL, Page ID (if available).

✅ NEW (What should have been generated):
**Tool-Based Execution:**
- Use: run_terminal_cmd to execute Node.js script that queries Prisma
- Execute: One-liner Prisma query to get distinct pages
- Store: memory_add_node with properties: { pagesInDB: [urls], totalPagesInDB: N }
- Do NOT: Create new query scripts
```

**Root Cause:**
- PM agent prompt doesn't REQUIRE Tool-Based Execution template
- Template is optional, not mandatory
- No validation to catch missing templates
- No examples in PM prompt showing correct format

**Impact:**
- Workers interpreted vague instructions as "write code"
- Workers created 15+ new files (translationBatchFetcher.ts, etc.)
- No graph storage → no diagnostic data
- Exactly the behavior the template was designed to prevent

**Fix Required:**
1. Make Tool-Based Execution template MANDATORY in PM prompt
2. Add validation checklist to PM agent
3. Add before/after examples to PM prompt
4. Add automatic detection of vague instructions

---

### Issue #3: No Graph Storage Instructions

**Symptom:**
- Graph database completely empty (0 nodes)
- No diagnostic data captured
- No intermediate results stored
- Workers created CSV files instead of graph nodes

**Root Cause:**
- PM agent didn't specify `memory_add_node` in ANY task prompt
- PM agent specified "Output: CSV file" instead of "Store: graph node"
- Workers defaulted to file creation
- No enforcement mechanism for graph storage

**Impact:**
- Cannot analyze what went wrong (no diagnostic data)
- Cannot resume failed workflows (no intermediate state)
- Cannot track task progress (no status updates)
- Complete loss of observability

**Fix Required:**
1. PM agent MUST specify `memory_add_node` in every task
2. Add "Do NOT create new files" to every task
3. Add graph storage verification to QC agent
4. Add automatic graph node creation at task start

---

### Issue #4: Environment Mismatch (Prisma/MongoDB)

**Symptom:**
```
task-1.2: Query DB for distinct pages; agent noted missing Prisma/MongoDB, 
described expected code, but did not execute; failed due to environment mismatch.
```

**Root Cause:**
- PM agent assumed Prisma/MongoDB available in worker environment
- No pre-task environment validation
- No fallback strategy specified
- Workers couldn't execute Prisma queries

**Impact:**
- 2 tasks failed due to missing dependencies
- Workers wasted time trying to initialize Prisma
- No graceful degradation

**Fix Required:**
1. Add Task 0: Environment Validation (before all other tasks)
2. PM agent must query available tools before task breakdown
3. Add fallback strategies for missing dependencies
4. Add environment requirements to task specifications

---

### Issue #5: Script Execution (Double-Hop Agent Problem)

**Symptom:**
```markdown
Task 3.1.x Prompt:
- For assigned page URL, run:  
  `node tools/translation-validator/validate-translations.js --page=<Page URL>`
```

**Root Cause:**
- PM agent specified direct script execution
- Script spawns another LLM agent (double-hop)
- Violates the entire purpose of MIMIR_DIRECT_PROMPT.md
- PM agent used OLD approach instead of direct LLM usage

**Impact:**
- Slower execution (subprocess overhead)
- Complex error handling (two layers)
- Harder to debug (nested execution)
- Wasted resources (two agents for one task)

**Fix Required:**
1. Add explicit "Do NOT execute validate-translations.js" to PM prompt
2. Strengthen Tool-Based Execution template with script execution prevention
3. Add validation to catch script execution in task prompts
4. Add examples showing direct LLM usage vs. script execution

---

## 📋 FAILURE BREAKDOWN

### Task Failures (6 out of 12):

| Task ID | Failure Reason | Root Cause | Fix |
|---------|----------------|------------|-----|
| task-1.1 | No code execution, just description | Vague prompt | Tool-Based Execution template |
| task-1.2 | Environment mismatch (Prisma missing) | No environment validation | Add Task 0 |
| task-2.1 | Prisma not initialized | Environment mismatch | Add Task 0 |
| task-1.1 (dup) | No test code or error handling | Vague prompt | Tool-Based Execution template |
| task-2.1 (dup) | In-memory batching, not DB-side | Vague prompt | Tool-Based Execution template |
| task-3.1 (dup) | No code or evidence | Vague prompt | Tool-Based Execution template |

### Common Failure Patterns:
- ❌ Workers described plan but didn't execute (3 tasks)
- ❌ Environment mismatch (Prisma/MongoDB) (2 tasks)
- ❌ No test evidence or verification (2 tasks)
- ❌ Wrong implementation approach (1 task)

### Success Patterns (5 out of 12):
- ✅ Tasks with clear, executable instructions
- ✅ Tasks using existing tools (validate-translations.js review)
- ✅ Tasks with mock data (CSV generation demo)
- ✅ Tasks with structured output (executive summary)

---

## 🎯 REQUIRED IMPROVEMENTS

### Priority 1 (Critical - System Reliability):

#### 1.1: Make Tool-Based Execution Template Mandatory
**File:** `docs/agents/claudette-pm.md`  
**Change:** Add MANDATORY requirement for Tool-Based Execution template in every task

**Current:**
```markdown
### 5. Tool-Based Execution Template

**CRITICAL**: When tasks require data processing or execution, specify which TOOLS to use...
```

**Required:**
```markdown
### 5. Tool-Based Execution Template (MANDATORY FOR ALL TASKS)

**CRITICAL**: EVERY task MUST include a Tool-Based Execution section. No exceptions.

**Validation Checklist:**
- [ ] "Use:" line specifies exact tool (run_terminal_cmd, memory_add_node, etc.)
- [ ] "Execute:" line specifies execution mode (in-memory, existing script, etc.)
- [ ] "Store:" line specifies output location (graph node, stdout, file path)
- [ ] "Do NOT:" line explicitly states what NOT to create
```

#### 1.2: Add Recursion Limit Circuit Breaker
**File:** `src/orchestrator/llm-client.ts`  
**Change:** Add `maxToolCalls` limit to agent configuration

**Implementation:**
```typescript
export interface AgentConfig {
  // ... existing fields
  maxToolCalls?: number; // Default: 50, Max: 100
  toolCallWarningThreshold?: number; // Default: 30
}

// In AgentExecutor initialization:
const executor = new AgentExecutor({
  agent,
  tools: this.tools,
  maxIterations: config.maxToolCalls || 50, // Circuit breaker
  // ... other config
});
```

#### 1.3: Enforce Graph Storage
**File:** `src/orchestrator/agent-chain.ts`  
**Change:** Add graph storage requirement to PM Step 2 prompt

**Addition:**
```typescript
**CRITICAL: Graph Storage Requirements**

EVERY task MUST store its output in the graph using memory_add_node. No exceptions.

**Required in every task prompt:**
- Store: memory_add_node with properties: { [task-specific data] }
- Do NOT: Create new files, write to filesystem (except final reports)

**Validation:**
- QC agent will verify graph node was created
- QC agent will verify node contains expected properties
- Task fails if no graph node created
```

#### 1.4: Add Environment Validation (Task 0)
**File:** `src/orchestrator/agent-chain.ts`  
**Change:** Add Task 0 generation before all other tasks

**Implementation:**
```typescript
// In PM Step 2, before task breakdown:
**MANDATORY: Task 0 - Environment Validation**

Before breaking down user requirements, create Task 0:

**Task ID:** task-0
**Title:** Validate execution environment and available tools
**Worker Role:** DevOps engineer with environment validation expertise

**Prompt:**
**Tool-Based Execution:**
- Use: run_terminal_cmd to check available tools
- Execute: which node && which npm && which docker
- Store: memory_add_node with properties: { availableTools: [...], missingTools: [...] }
- Do NOT: Create new validation scripts

**Verification Criteria:**
- [ ] All required tools identified (node, npm, docker, etc.)
- [ ] Missing tools flagged with alternatives
- [ ] Graph node created with tool inventory

**Dependencies:** None (runs first)
```

#### 1.5: Prevent Script Execution
**File:** `docs/agents/claudette-pm.md`  
**Change:** Add explicit script execution prevention to Tool-Based Execution template

**Addition:**
```markdown
**Script Execution Prevention:**

When tasks involve validation, processing, or analysis, workers MUST use their 
built-in LLM reasoning directly. Do NOT execute external scripts.

❌ **NEVER specify:**
- "Run validate-translations.js"
- "Execute [script-name].js"
- "Call [tool-name] script"

✅ **ALWAYS specify:**
- "Use your built-in LLM tool to validate"
- "Use run_terminal_cmd for data fetching only"
- "Use graph operations for storage"

**Why:** External scripts may spawn additional LLM agents (double-hop), 
causing slower execution, complex error handling, and resource waste.
```

---

### Priority 2 (High - Observability):

#### ✅ 2.1: Add Diagnostic Data Capture
**Status:** ✅ COMPLETED (2025-10-21)  
**File:** `src/orchestrator/task-executor.ts`  
**Documentation:** `docs/architecture/AUTOMATIC_DIAGNOSTIC_CAPTURE.md`  
**Tests:** `testing/automatic-diagnostic-capture.test.ts` (30/30 passing)

**Implemented:**
- ✅ Automatic graph node creation at task start (Phase 1)
- ✅ Worker execution tracking (Phases 2-3)
- ✅ QC execution tracking (Phases 5-6)
- ✅ Retry preparation tracking (Phase 7)
- ✅ Success/failure metrics (Phases 8-9)
- ✅ Circuit breaker tracking (Phases 4, 10)

**Benefits:**
- 100% diagnostic data capture (was 0%)
- Full execution traceability
- No reliance on agent prompts

#### 2.2: Add Tool Call Monitoring
**Status:** ⏳ PARTIALLY IMPLEMENTED  
**File:** `src/orchestrator/llm-client.ts`  
**Current:** Circuit breaker exists but needs enhancement

**Remaining Work:**
```typescript
// Add to AgentConfig:
export interface AgentConfig {
  maxToolCalls?: number; // Default: 50, Max: 100
  toolCallWarningThreshold?: number; // Default: 30
}

// Add warning system:
if (toolCallCount === WARNING_THRESHOLD) {
  console.warn(`⚠️ Tool call count: ${toolCallCount}/${MAX_TOOL_CALLS}`);
  console.warn('   Task may be too complex. Consider breaking into subtasks.');
}
```

**Priority:** Medium (circuit breaker already prevents runaway, this adds warnings)

#### 2.3: Add QC Graph Storage Verification
**Status:** ⏳ PARTIALLY IMPLEMENTED  
**File:** `src/orchestrator/task-executor.ts`  
**Current:** QC verifies output, but not graph storage explicitly

**Remaining Work:**
Add to QC prompt generation:
```markdown
**Graph Storage Verification (CRITICAL):**

1. Verify task created graph node using memory_get_node
2. Verify node contains expected properties
3. Verify node status is 'completed' or 'awaiting_qc'
4. If no graph node found: FAIL with score 0

**QC Checklist:**
- [ ] Graph node exists for this task
- [ ] Node contains task output data
- [ ] Node status reflects task completion
- [ ] Node timestamp is recent (within task duration)
```

**Priority:** High (prevents workers from skipping graph storage)

---

### Priority 3 (Medium - Usability):

#### 3.1: Add PM Agent Validation Checklist
**File:** `src/orchestrator/agent-chain.ts`  
**Change:** Add self-validation step to PM Step 2

**Addition:**
```typescript
**SELF-VALIDATION CHECKLIST (PM Agent):**

Before finalizing task breakdown, verify EVERY task includes:

- [ ] Tool-Based Execution section (Use/Execute/Store/Do NOT)
- [ ] Explicit tool names (run_terminal_cmd, memory_add_node, etc.)
- [ ] Graph storage instruction (memory_add_node with properties)
- [ ] "Do NOT" statement (create new files, write code, etc.)
- [ ] Verification criteria (measurable, testable)
- [ ] Time estimate with multipliers
- [ ] Dependencies listed

If ANY task is missing ANY item, revise before proceeding.
```

#### 3.2: Add Task Complexity Analyzer
**File:** `src/orchestrator/agent-chain.ts`  
**Change:** Add automatic task splitting for complex tasks

**Implementation:**
```typescript
**Task Complexity Guidelines:**

If a task requires >30 tool calls (estimated), split into subtasks:
- Subtask size: 15-20 tool calls each
- Each subtask stores intermediate results in graph
- Next subtask retrieves from graph using memory_get_node

**Complexity Indicators:**
- Multiple data sources (>2)
- Nested processing (parse → transform → validate)
- Large datasets (>100 items)
- Multiple output formats (CSV + JSON + HTML)

**Auto-split pattern:**
- Task N.1: Fetch and store data in graph
- Task N.2: Process data from graph, store results
- Task N.3: Generate final output from graph results
```

#### 3.3: Add Fallback Strategies
**File:** `docs/agents/claudette-pm.md`  
**Change:** Add fallback strategy template

**Addition:**
```markdown
### Fallback Strategy Template

For tasks with external dependencies, specify fallback:

**Primary Approach:**
- Tool: Prisma client
- Command: prisma.translation.findMany(...)
- If fails: Proceed to fallback

**Fallback Approach:**
- Tool: run_terminal_cmd with MongoDB CLI
- Command: mongosh --eval "db.translations.find()"
- If fails: Mark as BLOCKER and halt

**Escalation:**
- If both approaches fail, escalate to PM for redesign
- Store error details in graph for debugging
```

---

## 📊 EXPECTED IMPACT

### Before Any Improvements:
- Success Rate: 41.7% (5/12 tasks)
- Recursion Limit Failures: 100% (all complex tasks)
- Graph Storage: 0% (no nodes created)
- Environment Failures: 16.7% (2/12 tasks)
- Code Bloat: 15+ new files created

### After Phase 2 (Current State):
- Success Rate: 41.7% (unchanged - Phase 1 needed)
- Recursion Limit Failures: 100% (unchanged - Phase 1 needed)
- Graph Storage: 100% ✅ (automatic capture implemented)
- Environment Failures: 16.7% (unchanged - Phase 1 needed)
- Code Bloat: 15+ new files (unchanged - Phase 1 needed)

**Key Achievement:** 100% diagnostic data capture enables debugging and analysis

### After All Improvements (Target):
- Success Rate: 90%+ (11/12 tasks)
- Recursion Limit Failures: 0% (circuit breaker prevents)
- Graph Storage: 100% (already achieved + worker enforcement)
- Environment Failures: 0% (Task 0 catches issues)
- Code Bloat: 0 new files (Tool-Based Execution prevents)

---

## 🚀 IMPLEMENTATION PLAN

### ✅ Phase 2: Observability (COMPLETED - 2025-10-21)
- [x] 2.1: Add diagnostic data capture ✅
  - All 10 phases implemented
  - 30/30 tests passing
  - 100% diagnostic coverage achieved
- [ ] 2.2: Add tool call monitoring ⏳
  - Circuit breaker exists
  - Warning system needs enhancement
- [ ] 2.3: Add QC graph storage verification ⏳
  - QC verification works
  - Explicit graph storage check needed

**Status:** Core observability complete. Enhancements remain.

---

### Phase 1: Critical Fixes (IN PROGRESS - 40% Complete)

- [x] **1.1: Make Tool-Based Execution template mandatory** ✅ COMPLETE
  - **Status:** Implemented in PM preamble v1.2.0
  - **Files:** `docs/agents/claudette-pm.md`
  - **Changes:**
    - Added 🚨 MANDATORY markers to Tool-Based Execution section
    - Added validation checklist for PM self-validation
    - Added "Script Execution Prevention" section
    - Updated Specificity Checklist with Tool-Based requirements
  - **Impact:** Forces PM to provide concrete tool usage instructions
  
- [x] **1.2: Add dynamic circuit breaker limits** ✅ COMPLETE
  - **Status:** Implemented with PM-driven estimates
  - **Files:** `docs/agents/claudette-pm.md`, `src/orchestrator/task-executor.ts`, `src/orchestrator/llm-client.ts`
  - **Changes:**
    - Added "Estimated Tool Calls" as required PM field
    - Created Section 5.1: Tool Call Estimation guide
    - System applies 1.5x multiplier to PM estimate
    - Dynamic recursion limit: `MAX_MESSAGES = MAX_TOOL_CALLS × 3`
    - Default 50 tool calls if no estimate provided
  - **Impact:** 
    - Task-specific limits (simple tasks fail faster, complex tasks get more room)
    - PM accountability for resource planning
    - Prevents 250-step spirals (now fails at PM estimate × 1.5)
  
- [x] **1.3: Enforce graph storage** ✅ COMPLETE
  - **Status:** System-level automatic capture + worker guidance updated
  - **Files:** `src/orchestrator/task-executor.ts`, `docs/agents/claudette-pm.md`, `docs/agents/WORKER_TOOL_EXECUTION.md`
  - **Changes:**
    - Phase 2 automatic diagnostic capture stores worker output (line 1405)
    - Removed `memory_add_node`/`memory_update_node` from worker tool list
    - Updated PM examples to use "Store: Return { ... }" instead of "Store: memory_add_node"
    - Updated worker guidance: "Return your task output. The system will store it automatically."
    - Updated PM validation checklist to verify "Return" pattern
  - **Impact:**
    - Workers no longer told to store results themselves
    - System handles all graph storage automatically
    - Clear separation: workers produce output, system stores it
    - Prevents workers from creating files instead of returning results
  
- [x] **1.4: Add environment validation (Task 0)** ✅ COMPLETE
  - **Status:** PM preamble updated with mandatory Task 0 guidance
  - **Files:** `docs/agents/claudette-pm.md`
  - **Changes:**
    - Added Phase 0: Environment Validation section with complete Task 0 template
    - Added Rule #12: Task 0 is mandatory for external dependencies
    - Added Task 0 validation to Specificity Checklist (3 new items)
    - Added Task 0 verification to self-validation checklist
    - Provided validation commands for common dependencies (Prisma, MongoDB, Docker, npm packages)
    - Specified fallback strategies for missing dependencies
  - **Impact:**
    - Prevents 16.7% of failures due to missing dependencies
    - Early detection of environment issues (5-10 minutes vs. hours of wasted work)
    - Graceful degradation with fallback strategies
    - Clear go/no-go decision before executing main workflow
    - Prevents cascading failures when early tasks depend on environment setup
  
- [ ] 1.5: Prevent script execution
  - **Blocker:** Double-hop agent problem
  - **Impact:** Slower execution, complex errors

**Priority:** P0 - These fixes are CRITICAL for system reliability  
**Progress:** 4/5 complete (80%)

---

### Phase 3: Usability (Week 2)
- [ ] 3.1: Add PM agent validation checklist
- [ ] 3.2: Add task complexity analyzer
- [ ] 3.3: Add fallback strategies

**Priority:** P1 - Improves user experience and reduces manual intervention

---

### Phase 4: Testing & Validation (Week 3)
- [ ] Re-run translation validation workflow
- [ ] Verify 90%+ success rate (was 41.7%)
- [ ] Verify graph storage (100% of tasks, was 0%)
- [ ] Verify no recursion limit failures (was 100%)
- [ ] Document lessons learned

**Success Criteria:**
- Success Rate: 90%+ (currently 41.7%)
- Graph Storage: 100% (currently 100% via automatic capture)
- Recursion Failures: 0% (currently 100% on complex tasks)
- Environment Failures: 0% (currently 16.7%)

---

## 📝 LESSONS LEARNED

1. **Template Enforcement:** Optional templates are ignored. Make critical templates mandatory with validation.

2. **Circuit Breakers:** Complex tasks need automatic limits to prevent runaway execution.

3. **Observability:** Without graph storage, failures are impossible to debug.

4. **Environment Validation:** Assume nothing about worker environment. Validate first.

5. **Explicit Instructions:** Vague prompts ("Connect to DB") cause workers to write code. Be explicit ("Use run_terminal_cmd with this exact command").

6. **Script Execution:** External scripts that spawn LLMs create double-hop problems. Use worker's built-in LLM directly.

7. **QC Verification:** QC must verify graph storage, not just task output.

8. **Fallback Strategies:** Every external dependency needs a fallback or escalation path.

---

**Status:** READY FOR IMPLEMENTATION  
**Priority:** P0 (Critical)  
**Owner:** Mimir Development Team  
**Target Date:** 2025-11-01
