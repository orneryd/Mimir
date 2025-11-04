# Agent Configurations

This directory contains AI agent configuration files for specialized workflows in the GRAPH-RAG-TODO project.

---

## 📁 Agent Selection Guide

### By Model Size

**For 2-4B Parameter Models (Quantized):**

- **[claudette-quantized.md](./claudette-quantized.md)** (v1.0.0) - Optimized for Qwen-1.8B/7B-Int4, Phi-3-mini, Gemma 2B-7B
  - 33% token reduction from full version
  - All instructions preserved

**For 7B+ Parameter Models:**

- **[claudette-auto.md](./claudette-auto.md)** (v5.2.1) - Full autonomous execution mode
- **[claudette-condensed.md](./claudette-condensed.md)** - Token-efficient version
- **[claudette.md](./claudette.md)** - Universal abstract version (domain-agnostic)

**For Multi-Agent Orchestration:**

- **[v2/01-pm-preamble.md](./v2/01-pm-preamble.md)** (v2.0) - PM agent for planning
- **[v2/00-ecko-preamble.md](./v2/00-ecko-preamble.md)** (v2.0) - Prompt architect
- **[v2/templates/worker-template.md](./v2/templates/worker-template.md)** - Worker agent template
- **[v2/templates/qc-template.md](./v2/templates/qc-template.md)** - QC agent template

### By Task Type

**Autonomous Coding (End-to-End):**

- [claudette-auto.md](./claudette-auto.md) - Full autonomy, memory management, TODO tracking
- [claudette-quantized.md](./claudette-quantized.md) - Same as above, optimized for small models

**Debugging (Root Cause Analysis):**

- [claudette-debug.md](./claudette-debug.md) (v1.3.1) - Find bugs with evidence, don't fix them

**Project Planning:**

- [v2/01-pm-preamble.md](./v2/01-pm-preamble.md) - Research, task breakdown, dependency mapping

**Prompt Design:**

- [v2/00-ecko-preamble.md](./v2/00-ecko-preamble.md) - Create optimized agent preambles
- [v2/02-agentinator-preamble.md](./v2/02-agentinator-preamble.md) - Generate new agent preambles

**Universal/Abstract:**

- [claudette.md](./claudette.md) - Domain-agnostic version for any task type

---

## 🆕 Quantized Model Support (NEW)

### Claudette Quantized v1.0.0

**Optimized for 2-4B parameter quantized models** without losing any instructions from the full version.

**Target Models:**

- Qwen-1.8B / Qwen-7B-Chat-Int4 / Qwen-7B-Chat-Int8
- Phi-3-mini (3.8B)
- Gemma 2B / Gemma 7B (quantized)

**Key Improvements:**

- 33% token reduction (4,500 → 3,000 tokens)
- Shorter sentences (15-20 words vs 25+)
- Front-loaded critical instructions
- Consistent formatting throughout
- Flattened logic hierarchy
- Zero instruction loss

**Documentation:**

- **[claudette-quantized.md](./claudette-quantized.md)** - Optimized preamble

**When to Use:**

- Local inference on consumer hardware
- Edge deployments with limited memory
- Faster inference needs
- Budget-constrained deployments

**When NOT to Use:**

- 14B+ models (use original claudette-auto.md)
- Cloud API deployments with large context windows
- When maximum verbosity helpful for complex tasks

---

## 📁 Available Agents

### 🚀 [claudette-quantized.md](./claudette-quantized.md) (v1.0.0) ⚡ NEW

**Autonomous Coding Agent (Optimized for Small Models)** - All features of claudette-auto.md with 33% fewer tokens.

**When to Use**:

- Qwen-1.8B, Qwen-7B-Int4/Int8
- Phi-3-mini (3.8B parameters)
- Gemma 2B-7B (quantized)
- Local inference on limited hardware

**Key Features**:

- All claudette-auto.md behaviors preserved
- Shorter sentences (15-20 words)
- Front-loaded critical instructions
- Consistent formatting
- Memory management (.agents/memory.instruction.md)
- TODO tracking & context maintenance
- Autonomous execution

**Performance**: Expected >95% parity with claudette-auto.md on 7B-Int4 models

**Quick Start**:

```
Prompt: "Fix the login bug in src/auth.ts"
[Agent creates memory, analyzes repo, implements fix autonomously]
```

---

### 🤖 [claudette-auto.md](./claudette-auto.md) (v5.2.1)

**Enterprise Autonomous Coding Agent** - Full-featured version for 7B+ models.

**When to Use**:

- Qwen-14B+, GPT-4, Claude Sonnet
- Full-precision models (FP16, BF16)
- Complex multi-file projects
- When maximum context helpful

**Key Features**:

- Memory management protocol
- 3-phase execution (analysis, planning, implementation)
- Repository conservation rules
- TODO tracking & segue management
- Error debugging protocols
- Failure recovery & cleanup
- Autonomous operation principles

**Performance**: Proven in production use

**Quick Start**:

```
Prompt: "Implement OAuth authentication with Google"
[Agent researches, plans, implements, tests autonomously]
```

---

### 🔍 [claudette-debug.md](./claudette-debug.md) (v1.3.1)

**Root Cause Analysis Specialist** - Debugging agent that finds bugs, proves them with evidence, and hands off to implementation teams.

**When to Use**:

- Investigating test failures or hangs
- Reproducing reported bugs
- Tracing execution paths
- Analyzing race conditions or edge cases
- Creating reproduction test cases
- **NOT for fixing bugs** (only for finding and proving them)

**Key Features**:

- Evidence-driven investigation (no theoretical analysis)
- Progressive hypothesis refinement
- Strategic instrumentation with debug markers
- Chain-of-thought documentation
- Automatic cleanup of debug markers

**Performance**: 90/100 (Tier S) - Expected with v1.3.1

**Quick Start**:

```
Prompt: "investigate the failing test in [file.test.ts]"
```

---

## 📊 Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history and changes.

### Latest Releases

| Version    | Date       | Score    | Key Feature               |
| ---------- | ---------- | -------- | ------------------------- |
| **v1.3.1** | 2025-10-15 | 90 (exp) | Action enforcement        |
| v1.3.0     | 2025-10-15 | 63       | Role boundary (DON'T FIX) |
| v1.2.0     | 2025-10-14 | 45       | ACTION-FIRST approach     |
| v1.1.0     | 2025-10-13 | 75-80    | CREATE, don't propose     |
| v1.0.0     | 2025-10-12 | 55-60    | Initial release           |

---

## 🎯 Agent Design Philosophy

### Core Principles

1. **Specialized Roles** - Each agent has a narrow, well-defined role
   - claudette-debug: Find bugs, don't fix them (Detective, not Mechanic)
2. **Evidence-Based** - All claims must be backed by concrete evidence

   - Test output, debug logs, execution traces
   - No theoretical analysis without proof

3. **Action-First** - Do, don't propose

   - Create test files immediately (not "I'll create...")
   - Show actual output (not "I would show...")
   - Complete work in first response (not "Next, I'll...")

4. **Clear Boundaries** - Explicit constraints on what NOT to do
   - Detective doesn't fix bugs
   - Implementation agent doesn't investigate
   - QC agent doesn't implement or debug

### Token Efficiency Strategy

**Research-Backed Approach** (2024-2025):

- **Primacy effect**: First 200-300 tokens weighted most heavily
- **Sweet spot**: 500-1,500 tokens for system prompts
- **Risk zone**: >2,000 tokens = instruction loss

**Implementation**:

- Front-load critical constraints in first 400 tokens
- Role boundaries visible immediately
- Action enforcement via explicit checklists
- Appendix material for reference (lower priority)

---

## 🧪 Benchmarking & Testing

### Debugging Benchmark (v2.0)

Located in: `testing/agentic/`

**Structure**:

- Multi-file e-commerce order processing system
- 24 intentional bugs (cache, concurrency, floating point, etc.)
- 16 passing tests that deliberately miss the bugs
- Realistic production-grade complexity

**Purpose**:

- Validate agent debugging capabilities
- Measure evidence-based investigation
- Test action enforcement (do vs propose)

**Scoring Rubric** (100 points):

- Bug Discovery (35 pts)
- Root Cause Analysis (20 pts)
- Methodology (30 pts) - **Critical: Tests created, markers added, evidence shown**
- Production Impact (10 pts)
- Process Quality (5 pts)

**Tiers**:

- **S** (90-100): Evidence-based, 3+ bugs with tests
- **A** (75-89): Good analysis, some tests
- **B** (60-74): Decent analysis, proposals
- **C** (50-59): Code reading, theoretical
- **D** (25-49): Basic understanding, wrong approach
- **F** (0-24): Failed to understand task

### Performance History

| Version | Benchmark Score | Tier | Key Achievement                        |
| ------- | --------------- | ---- | -------------------------------------- |
| v1.3.1  | 90 (expected)   | S    | Action enforcement                     |
| v1.3.0  | 63              | B    | No source edits (role boundary worked) |
| v1.2.0  | 45              | D    | Edited source code (role confusion)    |
| v1.1.0  | ~75             | A    | Created tests (but asked first)        |
| v1.0.0  | ~55             | C    | Analysis only                          |

---

## 🚀 Usage Guide

### For claudette-debug.md

**1. Basic Investigation**

```
Prompt: "investigate the test failure in order-processor.test.ts"

Expected Output:
1. Baseline test run
2. Bug identified (line number)
3. Reproduction test created
4. Test run showing failure
5. Debug markers added
6. Evidence displayed
7. Cleanup completed
```

**2. Specific Bug Report**

```
Prompt: "Customer reports: orders processed twice when submitted rapidly.
Files: order-processor.ts, order-processor.test.ts"

Expected Output:
1. Baseline
2. Race condition identified (line 136)
3. Concurrent test created
4. Failure demonstrated
5. Evidence: [DEBUG] both threads passed check
6. Root cause: check-and-add not atomic
```

**3. Multi-Bug Investigation**

```
Prompt: "investigate the AGENTS.md in testing/agentic"

Expected Output:
1. Baseline (16 tests pass)
2. Bug #1: Payment race (line 136) → Test → Evidence → Clean
3. Bug #2: Cache invalidation (line 74) → Test → Evidence → Clean
4. Bug #3: Floating point (line 168) → Test → Evidence → Clean
... continues in same response
```

---

## 🔧 Development & Iteration

### Adding New Agents

1. **Define Role** - Narrow, specific responsibility

   ```markdown
   YOU ARE: [Metaphor] (specific action)
   YOU ARE NOT: [Metaphor] (forbidden action)
   ```

2. **Set Boundaries** - Explicit FORBIDDEN list

   ```markdown
   ❌ FORBIDDEN: [specific actions]
   ✅ REQUIRED: [specific actions]
   ```

3. **Add Anti-Patterns** - Show actual failures

   ```markdown
   ❌ Agent did X → Result: Failed
   ✅ Agent did Y → Result: Success
   ```

4. **Completion Criteria** - Explicit checklist

   ```markdown
   YOUR FIRST RESPONSE MUST INCLUDE:

   - ✅ [Specific item 1]
   - ✅ [Specific item 2]
   ```

5. **Test & Iterate** - Benchmark against real tasks

### Improving Existing Agents

**Data-Driven Approach**:

1. Run agent on benchmark
2. Score performance (100-point rubric)
3. Identify failure mode (what went wrong?)
4. Root cause analysis (why did it happen?)
5. Targeted fix (minimal changes to address root cause)
6. Re-test and measure improvement

**Example (claudette-debug)**:

- v1.2.0: 45/100 → Edited source code
- Root cause: Role boundary buried at token 350
- Fix: Move "DON'T FIX" to token 200 (primacy effect)
- v1.3.0: 63/100 (+18 pts)

- v1.3.0: 63/100 → Stopped at "Next, I'll..."
- Root cause: Interpreted as collaborative, waited for confirmation
- Fix: Add "DO THIS NOW", completion checklist, "DO IT IN THIS RESPONSE"
- v1.3.1: 90/100 (+27 pts) - Expected

---

## 📚 Related Documentation

### Architecture

- [Multi-Agent Architecture](../../research/MULTI_AGENT_COLLABORATION.md) - PM/Worker/QC pattern
- [Memory vs Knowledge Graph](../../research/MEMORY_VS_KG.md) - Architecture comparison

### Testing

- [Testing Guide](../../testing/TESTING_GUIDE.md) - Test suite guide
- [Benchmark Prompt](../../benchmarks/BENCHMARK_PROMPT.md) - Standard benchmark setup

### Configuration

- Main project: [README.md](../../README.md)
- Instructions: [.agents/cvs.instructions.md](../../.agents/cvs.instructions.md)

---

## 🤝 Contributing

### Reporting Issues

If an agent doesn't perform as expected:

1. Provide the exact prompt used
2. Include agent's full response
3. Describe expected vs actual behavior
4. Benchmark score (if applicable)

### Suggesting Improvements

1. Identify specific failure mode
2. Provide evidence (benchmark run, example output)
3. Propose targeted fix (with reasoning)
4. Expected performance improvement

---

## 📊 Metrics & Goals

### Current State (v1.3.1)

- **claudette-debug**: 90/100 (Tier S) - Expected
- **Token efficiency**: 3,350 tokens (within optimal range)
- **ROI**: 12.9 points per 100 tokens added

### Future Goals

1. **Maintain Tier S** performance (90+) across all agents
2. **Optimize tokens** - Target 2,000 tokens per agent (40% reduction)
3. **Add specialized agents**:
   - Implementation agent (takes debug reports, fixes bugs)
   - QC agent (validates fixes against requirements)
   - PM agent (coordinates multi-agent workflows)

---

**Last Updated**: 2025-10-15  
**Version**: v1.3.1  
**Status**: Production-ready  
**Maintainer**: CVS Health Enterprise AI Team
