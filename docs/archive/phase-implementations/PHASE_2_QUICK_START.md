# Phase 2 Quick Start Guide

**Version:** 1.0  
**Target:** Developers starting Phase 2 implementation  
**Prerequisites:** Phase 1 complete (v3.1)

---

## 📋 Before You Start

### ✅ Prerequisites Checklist
- [ ] Phase 1 complete (multi-agent locking + parallel execution)
- [ ] All tests passing (`npm test` - 107 tests)
- [ ] Neo4j running and accessible
- [ ] Familiar with GraphManager API
- [ ] Read [Phase 2 Implementation Plan](PHASE_2_IMPLEMENTATION_PLAN.md)

### 📚 Required Reading
1. **[PHASE_2_IMPLEMENTATION_PLAN.md](PHASE_2_IMPLEMENTATION_PLAN.md)** - Detailed implementation plan
2. **[MULTI_AGENT_GRAPH_RAG.md](architecture/MULTI_AGENT_GRAPH_RAG.md)** - Architecture v3.1
3. **[GraphManager API](../src/types/IGraphManager.ts)** - Current interface

---

## 🎯 Week 1-2: Context Isolation

### Day 1: Setup
```bash
# Create new types file
touch src/types/context.types.ts

# Create context manager
touch src/managers/ContextManager.ts

# Create test file
touch testing/context-isolation.test.ts
```

### Day 1-2: Define Types
**File:** `src/types/context.types.ts`

Copy the interface definitions from the implementation plan:
- `ContextScope`
- `WorkerContext`
- `PMContext`

### Day 3-5: Implement ContextManager
**File:** `src/managers/ContextManager.ts`

Implement:
1. `filterForAgent()` - Filter context by agent type
2. `calculateReduction()` - Measure context size reduction

**Key requirement:** Worker context must be <10% of PM context

### Day 6-7: Write Tests
**File:** `testing/context-isolation.test.ts`

Minimum 8 tests:
1. Filter PM → worker context (verify 90%+ reduction)
2. Filter PM → QC context (includes requirements)
3. Preserve error context for retries
4. Measure context size reduction
5. Handle missing fields gracefully
6. Verify all required fields present in worker context
7. Test with large PM context (>100KB)
8. Test with minimal context

### Day 8-9: Add MCP Tool
**File:** `src/tools/context.tools.ts`

```typescript
export const contextTools = [
  {
    name: 'get_task_context',
    description: 'Get task context filtered for agent type',
    inputSchema: { /* ... */ }
  }
];
```

**File:** `src/index.ts` - Add handler

```typescript
case 'get_task_context': {
  const { taskId, agentId, agentType } = args;
  const contextManager = new ContextManager(manager);
  const task = await manager.getNode(taskId);
  const filtered = contextManager.filterForAgent(task.properties, agentType);
  return { content: [{ type: 'text', text: JSON.stringify(filtered) }] };
}
```

### Day 10: Integration Testing
Run all tests, verify:
- ✅ 107 + 8 = 115 tests passing
- ✅ Worker context <10% PM context
- ✅ No breaking changes to existing functionality

---

## 🎯 Week 3-4: QC Verification System

### Day 1: Setup
```bash
# Create types
touch src/types/verification.types.ts

# Create manager
touch src/managers/VerificationManager.ts

# Create tools
touch src/tools/verification.tools.ts

# Create tests
touch testing/verification-manager.test.ts
```

### Day 1-2: Define Types
**File:** `src/types/verification.types.ts`

Define:
- `VerificationRule`
- `VerificationContext`
- `ValidationResult`
- `ValidationFailure`

### Day 3-7: Implement VerificationManager
**File:** `src/managers/VerificationManager.ts`

Implement (in order):
1. `registerRule()` - Add verification rule
2. `registerDefaultRules()` - Built-in rules
3. `extractRequirements()` - Parse subgraph
4. `verifyTaskOutput()` - Main verification logic
5. `generateCorrectionPrompt()` - Create fix instructions
6. `calculateScore()` - Score output 0-100

**Default Rules:**
- Required fields present
- Dependencies satisfied
- Output format valid

### Day 8-9: Write Tests
**File:** `testing/verification-manager.test.ts`

Minimum 15 tests covering:
- Rule registration
- All default rules (3 tests)
- Verification with passing output
- Verification with failures
- Verification with warnings only
- Score calculation
- Correction prompt generation
- Requirement extraction
- Edge cases (missing task, empty output, etc.)

### Day 10: Add MCP Tools
**File:** `src/tools/verification.tools.ts`

Add 3 tools:
- `verify_task_output`
- `register_verification_rule`
- `create_correction_task`

**Integration:** Add handlers in `src/index.ts`

### Day 11-12: Integration Testing
- Test end-to-end verification flow
- Verify <100ms per rule
- Test with 10+ concurrent verifications
- ✅ 115 + 15 = 130 tests passing

---

## 🎯 Week 5: Correction Loop

### Day 1-3: Implement Correction Flow
**File:** `src/managers/VerificationManager.ts` - Add method

```typescript
async createCorrectionTask(
  parentTaskId: string,
  validationResult: ValidationResult,
  preserveContext: boolean = true
): Promise<string>
```

**Key features:**
- Link correction task to parent with `corrects` edge
- Track iteration count (max 3 retries)
- Preserve original context if requested
- Include validation failures in task properties

### Day 4-5: Write Tests
**File:** `testing/correction-flow.test.ts`

Minimum 8 tests:
- Create correction task
- Link to parent task
- Preserve context
- Track iteration count
- Handle max retries limit
- Test correction prompt quality
- Verify correction task has all required fields
- Test with multiple failures

### Day 5: Integration
- Wire up in task executor
- Update documentation
- ✅ 130 + 8 = 138 tests passing

---

## 🎯 Week 6-7: Performance Metrics

### Day 1-2: Define Types & Setup
```bash
touch src/types/metrics.types.ts
touch src/managers/MetricsManager.ts
touch src/tools/metrics.tools.ts
touch testing/metrics-manager.test.ts
```

**File:** `src/types/metrics.types.ts`
- `AgentMetrics`
- `SystemMetrics`

### Day 3-7: Implement MetricsManager
**File:** `src/managers/MetricsManager.ts`

Implement:
1. `getAgentMetrics()` - Query graph for agent's tasks
2. `getSystemMetrics()` - Aggregate all agents
3. Helper methods for calculations

### Day 8-10: Tests & Integration
- Write 12 tests
- Add 2 MCP tools
- Integration testing
- ✅ 138 + 12 = 150 tests passing

---

## 📊 Progress Tracking

### Weekly Checkpoints

**Week 1-2 Goal:**
- ✅ ContextManager implemented
- ✅ 8 tests passing
- ✅ `get_task_context` tool working
- ✅ <10% context reduction verified

**Week 3-4 Goal:**
- ✅ VerificationManager implemented
- ✅ 15 tests passing
- ✅ 3 verification tools working
- ✅ <100ms verification time

**Week 5 Goal:**
- ✅ Correction flow implemented
- ✅ 8 tests passing
- ✅ End-to-end correction working

**Week 6-7 Goal:**
- ✅ MetricsManager implemented
- ✅ 12 tests passing
- ✅ 2 metrics tools working
- ✅ Real-time metrics available

---

## 🧪 Testing Commands

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run testing/context-isolation.test.ts

# Run tests in watch mode
npx vitest testing/context-isolation.test.ts

# Run with coverage
npm run test:coverage

# Run benchmark tests (excluded from main suite)
npm run test:benchmark
```

---

## 🐛 Common Issues

### Issue: Tests failing after adding new manager
**Solution:** Make sure to initialize manager in test `beforeEach`:
```typescript
let manager: GraphManager;
let contextManager: ContextManager;

beforeEach(async () => {
  manager = new GraphManager(driver);
  await manager.initialize();
  await manager.clear('ALL');
  
  contextManager = new ContextManager(manager);
});
```

### Issue: Context size not reducing
**Solution:** Verify you're filtering nested objects recursively:
```typescript
// ❌ Wrong - shallow copy includes nested objects
const filtered = { taskId: full.taskId, files: full.files };

// ✅ Right - only include what's needed
const filtered = { 
  taskId: full.taskId, 
  files: full.files?.slice(0, 10) // Limit to 10 files
};
```

### Issue: Verification too slow
**Solution:** Use parallel rule execution:
```typescript
// Run all rules in parallel
const results = await Promise.all(
  Array.from(this.rules.values()).map(rule => 
    rule.validator(output, context)
  )
);
```

---

## 📚 Resources

### Code Examples
- **GraphManager usage:** `testing/multi-agent-locking.test.ts`
- **Task creation:** `src/orchestrator/task-executor.ts`
- **Subgraph queries:** `src/managers/GraphManager.ts` line 450+

### Documentation
- **Neo4j Cypher:** https://neo4j.com/docs/cypher-manual/current/
- **Vitest:** https://vitest.dev/
- **TypeScript:** https://www.typescriptlang.org/docs/

---

## 🚀 Ready to Start?

1. **Create feature branch:**
   ```bash
   git checkout -b feature/phase2-context-isolation
   ```

2. **Read full plan:**
   Open `docs/PHASE_2_IMPLEMENTATION_PLAN.md`

3. **Start coding:**
   Follow Week 1-2 instructions above

4. **Ask questions:**
   If stuck, refer to existing code or ask team

---

**Good luck with Phase 2 implementation!** 🎉

**Last Updated:** 2025-10-17  
**Version:** 1.0  
**Maintainer:** CVS Health Enterprise AI Team
