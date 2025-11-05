# QC Verification System Implementation Plan

**Status:** 🚨 NOT IMPLEMENTED  
**Priority:** P0 - Critical Feature Missing  
**Target:** v3.1.1  
**Est. Time:** 4-6 hours

---

## Executive Summary

The adversarial QC verification system **exists as tests and documentation only**. The actual execution flow in `task-executor.ts` completely bypasses QC agents, allowing hallucinated worker outputs to pass as "success" without verification.

**Current State:**
- ✅ QC workflow tests exist (`testing/qc-verification-workflow.test.ts`)
- ✅ PM agent generates QC roles in `chain-output.md`
- ✅ Documentation describes QC flow
- ❌ **Task executor never invokes QC agents**
- ❌ **No retry logic implemented**
- ❌ **No failure reporting implemented**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT (BROKEN) FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PM Agent ──→ Worker Agent ──→ ✅ Success (no verification!)   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    TARGET (CORRECT) FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PM Agent                                                       │
│     │                                                           │
│     ├──→ Worker Agent (Attempt 1)                              │
│     │       │                                                   │
│     │       └──→ QC Agent                                       │
│     │              │                                            │
│     │              ├──✅ Pass → Success                         │
│     │              └──❌ Fail → Retry                           │
│     │                                                           │
│     ├──→ Worker Agent (Attempt 2) [with QC feedback]           │
│     │       │                                                   │
│     │       └──→ QC Agent                                       │
│     │              │                                            │
│     │              ├──✅ Pass → Success                         │
│     │              └──❌ Fail → Generate QC Failure Report      │
│     │                                                           │
│     └──→ PM Agent (Generate PM Failure Summary)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Parse QC Data from chain-output.md (30 min)

**File:** `src/orchestrator/task-executor.ts`

**Current `parseChainOutput` extracts:**
- ✅ `id`
- ✅ `agentRoleDescription` (worker)
- ✅ `recommendedModel`
- ✅ `optimizedPrompt`
- ✅ `dependencies`
- ✅ `estimatedDuration`

**Add extraction for:**
- ❌ `qcRole` (from `#### **QC Agent Role**`)
- ❌ `verificationCriteria` (from `#### **Verification Criteria**`)
- ❌ `maxRetries` (from `#### **Max Retries**`)

**Implementation:**
```typescript
interface TaskDefinition {
  // ... existing fields
  qcRole?: string;
  verificationCriteria?: string;
  maxRetries?: number;
}

function parseChainOutput(markdown: string): TaskDefinition[] {
  // ... existing parsing
  
  // Add QC role extraction
  const qcRoleMatch = taskSection.match(/####\s+\*\*QC Agent Role\*\*\s+([^\n]+(?:\n(?!####)[^\n]+)*)/);
  task.qcRole = qcRoleMatch ? qcRoleMatch[1].trim() : undefined;
  
  // Add verification criteria extraction
  const verificationMatch = taskSection.match(/####\s+\*\*Verification Criteria\*\*\s+([\s\S]+?)(?=####|---|\z)/);
  task.verificationCriteria = verificationMatch ? verificationMatch[1].trim() : undefined;
  
  // Add max retries extraction
  const retriesMatch = taskSection.match(/####\s+\*\*Max Retries\*\*\s+(\d+)/);
  task.maxRetries = retriesMatch ? parseInt(retriesMatch[1], 10) : 2;
  
  return tasks;
}
```

**Verification:**
- Unit test in `testing/parse-chain-output.test.ts`
- Ensure QC fields are correctly extracted

---

### Phase 2: Generate QC Agent Preambles (30 min)

**File:** `src/orchestrator/task-executor.ts`

**Current:** Only worker preambles are generated via Agentinator

**Add:** Generate QC preambles alongside worker preambles

**Implementation:**
```typescript
async function generateAgentPreambles(tasks: TaskDefinition[]): Promise<void> {
  for (const task of tasks) {
    // Existing worker preamble generation
    const workerPreamblePath = await generatePreamble(task.agentRoleDescription);
    task.preamblePath = workerPreamblePath;
    
    // NEW: Generate QC preamble
    if (task.qcRole) {
      const qcPreamblePath = await generatePreamble(task.qcRole);
      task.qcPreamblePath = qcPreamblePath;
      console.log(`✅ Generated QC preamble: ${qcPreamblePath}`);
    }
  }
}
```

**Verification:**
- Check `generated-agents/` directory for `qc-*.md` files
- Ensure QC preambles contain verification criteria

---

### Phase 3: Implement Worker → QC Execution Loop (2 hours)

**File:** `src/orchestrator/task-executor.ts`

**Current `executeTask` function:**
```typescript
async function executeTask(task: TaskDefinition): Promise<ExecutionResult> {
  // 1. Generate worker preamble
  // 2. Execute worker
  // 3. Return success (NO QC!)
}
```

**New `executeTask` function:**
```typescript
async function executeTask(task: TaskDefinition): Promise<ExecutionResult> {
  let attemptNumber = 1;
  const maxRetries = task.maxRetries || 2;
  let workerOutput = '';
  let qcVerificationHistory: any[] = [];
  let errorContext: any = null;
  
  // Loop: Worker → QC → Retry (up to maxRetries)
  while (attemptNumber <= maxRetries) {
    console.log(`\n🔄 Attempt ${attemptNumber}/${maxRetries} for ${task.id}`);
    
    // STEP 1: Execute Worker
    const workerResult = await executeWorkerAgent(task, attemptNumber, errorContext);
    workerOutput = workerResult.output;
    
    // STEP 2: Store worker output in graph (status: 'awaiting_qc')
    await storeWorkerOutputInGraph(task.id, {
      workerOutput,
      attemptNumber,
      status: 'awaiting_qc'
    });
    
    // STEP 3: Execute QC Agent
    const qcResult = await executeQCAgent(task, workerOutput, attemptNumber);
    
    // STEP 4: Store QC verification in history
    qcVerificationHistory.push({
      attemptNumber,
      passed: qcResult.passed,
      score: qcResult.score,
      feedback: qcResult.feedback,
      timestamp: new Date().toISOString()
    });
    
    // STEP 5: Check QC result
    if (qcResult.passed) {
      console.log(`✅ QC PASSED on attempt ${attemptNumber}`);
      
      // Update graph: success
      await updateGraphNode(task.id, {
        status: 'completed',
        qcVerification: qcVerificationHistory[qcVerificationHistory.length - 1],
        qcVerificationHistory
      });
      
      // Store final result in graph
      const graphNodeId = await storeTaskResultInGraph(task, {
        status: 'success',
        output: workerOutput,
        qcVerification: qcResult,
        attemptNumber
      });
      
      return {
        taskId: task.id,
        status: 'success',
        output: workerOutput,
        qcVerification: qcResult,
        attemptNumber,
        graphNodeId
      };
    }
    
    // QC FAILED
    console.log(`❌ QC FAILED on attempt ${attemptNumber}: ${qcResult.feedback}`);
    
    // STEP 6: Prepare error context for next retry
    errorContext = {
      qcFeedback: qcResult.feedback,
      issues: qcResult.issues,
      requiredFixes: qcResult.requiredFixes,
      previousAttempt: attemptNumber
    };
    
    // Update graph: pending retry
    await updateGraphNode(task.id, {
      status: 'pending',
      attemptNumber,
      errorContext: JSON.stringify(errorContext),
      qcVerificationHistory
    });
    
    attemptNumber++;
  }
  
  // STEP 7: All retries exhausted - Generate QC Failure Report
  console.log(`🚨 Task ${task.id} FAILED after ${maxRetries} attempts`);
  
  const qcFailureReport = await generateQCFailureReport(task, qcVerificationHistory, workerOutput);
  
  // Update graph: failed
  await updateGraphNode(task.id, {
    status: 'failed',
    qcFailureReport,
    qcVerificationHistory
  });
  
  // Store final result in graph
  const graphNodeId = await storeTaskResultInGraph(task, {
    status: 'failed',
    output: workerOutput,
    qcFailureReport,
    qcVerificationHistory
  });
  
  return {
    taskId: task.id,
    status: 'failed',
    output: workerOutput,
    qcFailureReport,
    qcVerificationHistory,
    graphNodeId
  };
}
```

**Helper Functions to Implement:**

1. **`executeWorkerAgent(task, attemptNumber, errorContext)`**
   - Load worker preamble
   - Create worker prompt (include errorContext if retry)
   - Execute via LLM client
   - Return output

2. **`executeQCAgent(task, workerOutput, attemptNumber)`**
   - Load QC preamble
   - Create QC prompt (include verification criteria + worker output)
   - Execute via LLM client
   - Parse QC response for: `passed`, `score`, `feedback`, `issues`, `requiredFixes`
   - Return QC result

3. **`generateQCFailureReport(task, history, output)`**
   - Use QC agent to generate final failure report
   - Include: all attempts, issues found, recommendations
   - Return structured report

4. **`storeWorkerOutputInGraph(taskId, data)`**
   - Call `memory_update_node` via MCP
   - Update task node with worker output and status

5. **`updateGraphNode(taskId, properties)`**
   - Call `memory_update_node` via MCP
   - Update task node properties

---

### Phase 4: QC Prompt Engineering (1 hour)

**File:** `src/orchestrator/task-executor.ts`

**QC Agent Prompt Structure:**
```typescript
function buildQCPrompt(task: TaskDefinition, workerOutput: string, attemptNumber: number): string {
  return `
# QC VERIFICATION TASK

## YOUR ROLE
${task.qcRole}

## VERIFICATION CRITERIA
${task.verificationCriteria}

## WORKER OUTPUT TO VERIFY (Attempt ${attemptNumber})
\`\`\`
${workerOutput}
\`\`\`

## YOUR TASK
1. **Aggressively verify** the worker output against EVERY criterion above
2. **Check for hallucinations**: Fabricated libraries, fake version numbers, non-existent APIs
3. **Verify claims**: If worker cites sources, they must be real and accurate
4. **Check completeness**: All required sections present and detailed

## OUTPUT FORMAT (CRITICAL - MUST FOLLOW EXACTLY)

### QC VERDICT: [PASS or FAIL]

### SCORE: [0-100]

### FEEDBACK:
[Detailed feedback on what passed/failed]

### ISSUES FOUND (if FAIL):
- Issue 1: [Specific problem]
- Issue 2: [Specific problem]

### REQUIRED FIXES (if FAIL):
- Fix 1: [What worker must correct]
- Fix 2: [What worker must correct]

**IMPORTANT:** Be AGGRESSIVE. If you find ANY hallucinations, fabricated data, or 
unverified claims, mark as FAIL immediately.
`;
}
```

**QC Response Parser:**
```typescript
function parseQCResponse(response: string): QCResult {
  const verdictMatch = response.match(/###\s+QC VERDICT:\s+(PASS|FAIL)/i);
  const scoreMatch = response.match(/###\s+SCORE:\s+(\d+)/);
  const feedbackMatch = response.match(/###\s+FEEDBACK:\s+([\s\S]+?)(?=###|$)/);
  const issuesMatch = response.match(/###\s+ISSUES FOUND[^:]*:\s+([\s\S]+?)(?=###|$)/);
  const fixesMatch = response.match(/###\s+REQUIRED FIXES[^:]*:\s+([\s\S]+?)(?=###|$)/);
  
  return {
    passed: verdictMatch?.[1]?.toUpperCase() === 'PASS',
    score: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
    feedback: feedbackMatch?.[1]?.trim() || '',
    issues: issuesMatch?.[1]?.trim().split('\n').filter(Boolean) || [],
    requiredFixes: fixesMatch?.[1]?.trim().split('\n').filter(Boolean) || []
  };
}
```

---

### Phase 5: PM Failure Summary Generation (1 hour)

**File:** `src/orchestrator/task-executor.ts`

**After all tasks complete, check for failures:**

```typescript
async function generateFinalReport(results: ExecutionResult[]): Promise<string> {
  const failures = results.filter(r => r.status === 'failed');
  
  if (failures.length === 0) {
    // Existing success report generation
    return generateSuccessReport(results);
  }
  
  // NEW: Generate PM failure summary
  console.log(`\n🚨 Generating PM Failure Summary for ${failures.length} failed tasks`);
  
  const pmSummaryPrompt = buildPMFailureSummaryPrompt(failures);
  const pmAgent = new CopilotAgentClient({ role: 'pm' });
  const pmSummary = await pmAgent.execute(pmSummaryPrompt);
  
  // Combine success and failure reports
  return generateMixedReport(results, pmSummary);
}

function buildPMFailureSummaryPrompt(failures: ExecutionResult[]): string {
  return `
# PM FAILURE SUMMARY TASK

## YOUR ROLE
You are the PM agent. Multiple worker tasks have FAILED after QC verification.
Your job is to:
1. Analyze WHY tasks failed
2. Identify patterns (e.g., hallucinations, missing data, technical impossibility)
3. Provide strategic recommendations for project continuation

## FAILED TASKS

${failures.map((f, i) => `
### Task ${i + 1}: ${f.taskId}
**Attempts:** ${f.attemptNumber}/${f.qcVerificationHistory?.length || 0}
**QC Failure Report:**
\`\`\`
${f.qcFailureReport}
\`\`\`
`).join('\n')}

## OUTPUT FORMAT

### Executive Summary
[High-level overview of failures]

### Root Cause Analysis
[Why did these tasks fail? Common patterns?]

### Impact Assessment
[How does this affect project goals?]

### Recommendations
- Recommendation 1: [Concrete next step]
- Recommendation 2: [Concrete next step]

### Revised Task Plan (Optional)
[If project should continue, what tasks should replace failed ones?]
`;
}
```

---

### Phase 6: Update Interfaces & Types (15 min)

**File:** `src/orchestrator/task-executor.ts`

**Update `TaskDefinition`:**
```typescript
interface TaskDefinition {
  id: string;
  agentRoleDescription: string;
  recommendedModel: string;
  optimizedPrompt: string;
  dependencies: string[];
  estimatedDuration: string;
  parallelGroup?: number;
  preamblePath?: string;
  
  // NEW QC fields
  qcRole?: string;
  qcPreamblePath?: string;
  verificationCriteria?: string;
  maxRetries?: number;
}
```

**Update `ExecutionResult`:**
```typescript
interface ExecutionResult {
  taskId: string;
  status: 'success' | 'failed';
  output: string;
  duration?: number;
  tokens?: { input: number; output: number };
  toolCalls?: number;
  agentRoleDescription?: string;
  preamblePath?: string;
  error?: string;
  graphNodeId?: string;
  
  // NEW QC fields
  qcVerification?: QCResult;
  qcVerificationHistory?: QCResult[];
  qcFailureReport?: string;
  attemptNumber?: number;
}

interface QCResult {
  passed: boolean;
  score: number;
  feedback: string;
  issues: string[];
  requiredFixes: string[];
  timestamp?: string;
}
```

---

### Phase 7: Integration Tests (1 hour)

**File:** `testing/qc-execution-integration.test.ts` (NEW)

**Test cases:**
1. ✅ Worker output passes QC on first attempt
2. ✅ Worker output fails QC, succeeds on retry
3. ✅ Worker output fails QC twice, QC generates failure report
4. ✅ PM generates failure summary after all tasks complete
5. ✅ QC preambles are generated correctly
6. ✅ Worker receives errorContext on retry
7. ✅ Graph nodes are updated with correct statuses
8. ✅ Task results are stored in graph with QC data

**Mock Strategy:**
- Mock LLM client responses for worker/QC/PM
- Use real GraphManager with test database
- Verify graph state after each phase

---

## Testing Strategy

### Unit Tests
- ✅ `parseChainOutput` extracts QC fields
- ✅ `buildQCPrompt` generates correct format
- ✅ `parseQCResponse` handles PASS/FAIL correctly
- ✅ Retry logic counts correctly

### Integration Tests
- ✅ Full Worker → QC → Retry flow
- ✅ Graph storage at each step
- ✅ PM failure summary generation

### Manual E2E Test
```bash
# Run the hallucination-inducing prompt
npm run chain "Create a quantum blockchain with CRISPR..."

# Expected outcome:
# - Worker generates hallucinated output
# - QC catches hallucinations and fails
# - Worker retries with QC feedback
# - After 2 failures, QC generates failure report
# - PM generates failure summary
# - Execution report shows FAILED status
```

---

## Success Criteria

✅ **Parsing:** QC roles, verification criteria, maxRetries extracted from markdown  
✅ **Preambles:** QC preambles generated via Agentinator  
✅ **Execution:** Worker → QC loop implemented with retry logic  
✅ **Verification:** QC agent aggressively checks for hallucinations  
✅ **Retry:** Worker receives errorContext and improves on retry  
✅ **Failure Reporting:** QC generates detailed failure report  
✅ **PM Summary:** PM analyzes failures and provides recommendations  
✅ **Graph Storage:** All statuses, outputs, and QC data stored in graph  
✅ **Tests:** Unit + integration tests pass  
✅ **E2E:** Hallucination prompt triggers QC failure as expected  

---

## Rollout Plan

1. **Phase 1-2:** Parsing + Preamble generation (1 hour)
2. **Phase 3-4:** Core execution loop + QC prompts (3 hours)
3. **Phase 5-6:** PM summary + types (1.25 hours)
4. **Phase 7:** Integration tests (1 hour)
5. **Manual E2E validation** (30 min)

**Total Estimated Time:** 4-6 hours

---

## Known Risks

1. **QC Prompt Quality:** If QC prompt is too lenient, it won't catch hallucinations
   - *Mitigation:* Test with known hallucinations, iterate on prompt
   
2. **Retry Loop Complexity:** Worker may not improve on retry
   - *Mitigation:* Ensure errorContext is clear and actionable
   
3. **Performance:** QC adds 2-3x execution time per task
   - *Mitigation:* This is expected; quality over speed
   
4. **Graph Storage Overhead:** Many updates per task
   - *Mitigation:* Batch updates where possible

---

**Next Step:** Proceed to Option C (Debug current execution flow)
