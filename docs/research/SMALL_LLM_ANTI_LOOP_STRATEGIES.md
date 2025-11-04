# Anti-Loop Strategies for Small LLMs (<3B Parameters)

**Research Date:** 2025-11-03  
**Triggered By:** deepcoder:1.5b circuit breaker incident (infinite test case repetition)  
**Context:** Quantized models <2B parameters showing propensity for repetitive output loops

---

## 🔬 Research Summary

Small language models (<3B parameters, especially <2B) have a **documented propensity** for infinite looping and repetitive output, particularly when:
- Prompts are ambiguous or open-ended
- Task complexity exceeds model capacity
- Preambles are too verbose or complex
- Stopping criteria are unclear

**Our Empirical Finding:** deepcoder:1.5b + claudette-mini v2.1.0 triggered circuit breaker at 5000 tokens with identical test case repeated 50+ times.

---

## 📊 Root Causes of Infinite Looping

### 1. **Cognitive Overload**
- Small models have limited "working memory"
- Complex preambles (>500 tokens) can overwhelm attention mechanisms
- Model "forgets" original instruction and latches onto repetitive pattern

### 2. **Pattern Completion Bias**
- Training on code datasets emphasizes pattern repetition
- Model sees `it('email length', ...)` and continues pattern indefinitely
- Lacks meta-awareness to recognize when pattern is complete

### 3. **Weak Stop Signal Recognition**
- Small models struggle with implicit stopping criteria
- "Write comprehensive tests" → model doesn't know when "comprehensive" is satisfied
- Temperature 0.0 + greedy decoding = deterministic loops

### 4. **Context Window Saturation**
- As output grows, attention to original prompt weakens
- Model focuses on recent tokens (self-generated repetition)
- Loses track of global task objective

---

## 🛡️ Prevention Strategies

### **Category 1: Prompt Engineering (Preamble-Level)**

#### ✅ **1. Explicit Output Limits (CRITICAL)**

**Problem:** "Write comprehensive tests" → model doesn't know when to stop  
**Solution:** Specify exact quantity and format

```markdown
❌ BAD: "Write comprehensive tests for the validation system"

✅ GOOD: "Write exactly 5 test cases:
1. One test for valid input
2. One test for missing input
3. One test for invalid format
4. One test for boundary values
5. One test for error messages

After completing test 5, write 'TESTS COMPLETE' and stop."
```

**Implementation for claudette-mini-tiny:**
```markdown
## Output Requirements (MANDATORY)

Generate EXACTLY:
- 3-5 test cases (no more, no less)
- Each test in one `it()` block
- After final test, write "// END OF TESTS"

DO NOT:
- Repeat test cases
- Continue after "// END OF TESTS"
- Write more than 5 tests
```

---

#### ✅ **2. Explicit Stop Sequences**

**Problem:** Model doesn't recognize when task is complete  
**Solution:** Define explicit termination markers

```markdown
## Stopping Criteria (CRITICAL)

After completing the task, you MUST write:

END_OF_OUTPUT

Do NOT generate any text after this marker.
If you find yourself repeating code, STOP IMMEDIATELY and write END_OF_OUTPUT.
```

**Rationale:** Gives model a concrete token sequence to target as completion signal.

---

#### ✅ **3. Anti-Repetition Warnings (META-INSTRUCTION)**

**Problem:** Model enters loop without self-awareness  
**Solution:** Explicit warning against repetition

```markdown
## Anti-Repetition Rule (CRITICAL)

⚠️ NEVER repeat the same test case twice.
⚠️ If you notice you're writing similar code, STOP and move to next test.
⚠️ Each test must be UNIQUE - different input, different assertion.

Self-check: "Have I already written this test?" → If yes, SKIP IT.
```

**Rationale:** Activates meta-cognitive processes (if model has any).

---

#### ✅ **4. Task Decomposition with Checkpoints**

**Problem:** Large task → model loses track → loops  
**Solution:** Break into numbered steps with explicit checkpoints

```markdown
## Task Steps (Follow in Order)

Step 1: Write test for valid email
[Write test here]
✓ CHECKPOINT 1 COMPLETE - Move to Step 2

Step 2: Write test for invalid email
[Write test here]
✓ CHECKPOINT 2 COMPLETE - Move to Step 3

Step 3: Write test for password validation
[Write test here]
✓ CHECKPOINT 3 COMPLETE - TASK DONE

After Step 3, write "ALL STEPS COMPLETE" and STOP.
```

**Rationale:** Gives model explicit progress tracking and reduces cognitive load.

---

#### ✅ **5. Role-Based Constraint**

**Problem:** Open-ended task → model improvises → loops  
**Solution:** Constrain output to specific role/format

```markdown
You are a TEST CASE GENERATOR (not a writer, not an explainer).

Your ONLY job:
1. Generate test code in proper format
2. ONE test per requirement
3. STOP after generating 5 tests

You CANNOT:
- Explain your reasoning (forbidden)
- Repeat tests (forbidden)
- Generate more than 5 tests (forbidden)
- Add comments like "TODO" or "more tests..." (forbidden)
```

**Rationale:** Narrow role definition reduces degrees of freedom → less chance of loops.

---

#### ✅ **6. Length Budgeting**

**Problem:** Model doesn't estimate output length  
**Solution:** Explicit token/line budget

```markdown
## Output Budget (STRICT LIMIT)

Maximum output: 50 lines of code
Maximum per test: 10 lines

If you reach 45 lines, you MUST conclude with final test and STOP.
Do NOT exceed 50 lines under any circumstances.
```

**Rationale:** Gives model quantitative stopping criterion.

---

### **Category 2: Inference-Time Parameters (LLM Config)**

#### ✅ **7. Repetition Penalty**

**Current Config (deepcoder:1.5b):**
```json
{
  "numCtx": 8192,
  "temperature": 0.0,
  "numPredict": -1  // ← UNLIMITED = DANGEROUS
}
```

**Recommended Config:**
```json
{
  "numCtx": 8192,
  "temperature": 0.1,  // ← Small non-zero reduces deterministic loops
  "numPredict": 2000,  // ← Hard limit (was -1 = unlimited)
  "repeatPenalty": 1.3,  // ← Penalize token repetition
  "frequencyPenalty": 0.5,  // ← Reduce repeated n-grams
  "presencePenalty": 0.3,  // ← Discourage repeating patterns
  "stop": ["END_OF_OUTPUT", "TESTS COMPLETE", "// END"]  // ← Stop sequences
}
```

**Key Parameters:**

| Parameter | Purpose | Recommended Value | Effect |
|-----------|---------|-------------------|--------|
| `numPredict` | Max output tokens | 1000-2000 | Hard cap prevents runaway |
| `repeatPenalty` | Penalize token repetition | 1.2-1.5 | Discourages exact repeats |
| `temperature` | Sampling randomness | 0.1-0.3 | Breaks deterministic loops |
| `stop` | Stop sequences | `["END", "COMPLETE"]` | Explicit termination |

**Rationale:** Temperature 0.0 + no output limit = infinite deterministic loops. Adding small temperature breaks cycles.

---

#### ✅ **8. Stop Sequences (Ollama API)**

**Implementation:**
```typescript
// In llm-config.json
"config": {
  "numCtx": 8192,
  "temperature": 0.1,
  "numPredict": 2000,
  "stop": [
    "END_OF_OUTPUT",
    "TESTS COMPLETE",
    "// END OF TESTS",
    "```\n\n\n",  // Multiple blank lines after code fence
    "it('", "it('"  // Repeated test start (catches loops early)
  ]
}
```

**Rationale:** Multiple stop sequences increase chance of catching loops.

---

### **Category 3: Preamble Size Reduction**

#### ✅ **9. Token Budget for Tiny Models**

**Research Finding:** Small models struggle with preambles >300 tokens

**Current claudette-mini v2.1.0:** ~400 tokens (too large for <2B models)

**Recommended claudette-mini-tiny:** <200 tokens

**Example Ultra-Minimal Preamble:**

```markdown
# Claudette Mini Tiny v1.0.0 (<2B Models)

Generate complete, working code. No placeholders. No TODOs.

## Rules
1. ✅ Write exactly 3-5 test cases
2. ✅ Each test must be unique
3. ❌ Never repeat the same test
4. ❌ Stop after 5 tests

## Format
```language
describe('Test', () => {
  it('test 1', () => { /* code */ });
  it('test 2', () => { /* code */ });
  it('test 3', () => { /* code */ });
});
// END OF TESTS
```

After writing 5 tests, write "// END OF TESTS" and STOP.
```

**Token Count:** ~180 tokens (55% reduction from v2.1.0)

---

### **Category 4: Circuit Breaker Improvements**

#### ✅ **10. Early Loop Detection**

**Current Circuit Breaker:** Triggers at 5000 tokens (too late)

**Proposed Enhancement:**

```typescript
// In test-quantized.ts or llm-client.ts
const ANTI_LOOP_CONFIG = {
  maxTokens: 2000,  // Hard limit (was 5000)
  repetitionWindow: 100,  // Check last N tokens
  repetitionThreshold: 0.7,  // If >70% identical → STOP
  earlyStopPatterns: [
    /it\('.*',\s*\(\)\s*=>\s*{[\s\S]*}\);[\s\S]*it\('.*',\s*\(\)\s*=>\s*{[\s\S]*}\);[\s\S]*it\('.*',/g,
    // Matches 3+ consecutive identical test structures
  ]
};

function detectInfiniteLoop(output: string): boolean {
  // Check for repetitive patterns
  const lines = output.split('\n');
  const lastN = lines.slice(-10);  // Last 10 lines
  const uniqueLines = new Set(lastN);
  
  if (uniqueLines.size < 3) {
    // Only 3 unique lines in last 10 → likely looping
    return true;
  }
  
  // Check for repeated test case patterns
  const testCases = output.match(/it\([^)]+\)/g) || [];
  const uniqueTests = new Set(testCases);
  
  if (testCases.length > 10 && testCases.length / uniqueTests.size > 3) {
    // More than 3x repetition of test patterns
    return true;
  }
  
  return false;
}
```

---

## 🎯 Recommended Strategy by Model Size

### **Large Models (>10B):**
- Use standard claudette-mini v2.1.0
- No special anti-loop measures needed
- Temperature: 0.0 (deterministic fine)

### **Mid Models (3-10B):**
- Use claudette-mini v2.1.0
- Add explicit output limits
- Temperature: 0.0-0.1

### **Small Models (2-3B):**
- Use claudette-mini-small (300 tokens)
- Explicit stop sequences
- Temperature: 0.1-0.2
- `numPredict`: 2000

### **Tiny Models (<2B):**
- Use claudette-mini-tiny (<200 tokens)
- Numbered step checkpoints
- Temperature: 0.2-0.3
- `numPredict`: 1000
- `repeatPenalty`: 1.5
- Multiple stop sequences

---

## 📋 Implementation Checklist

For deepcoder:1.5b and similar tiny models:

- [ ] Create `claudette-mini-tiny.md` (<200 tokens)
- [ ] Add explicit output limits: "Write exactly 5 tests"
- [ ] Add stop sequences: "END_OF_TESTS"
- [ ] Add anti-repetition warning
- [ ] Add numbered checkpoints
- [ ] Update `llm-config.json`:
  - [ ] `temperature`: 0.1 (was 0.0)
  - [ ] `numPredict`: 1000 (was -1)
  - [ ] `repeatPenalty`: 1.3
  - [ ] `stop`: ["END_OF_OUTPUT", "// END OF TESTS"]
- [ ] Enhance circuit breaker with early loop detection
- [ ] Test on deepcoder:1.5b to validate fixes

---

## 📚 References

**Research Sources:**
1. Prompt Engineering for Small Models: [CodeSignal Blog](https://codesignal.com/blog/strategies-used-in-prompt-engineering/)
2. Anti-Hallucination Strategies: [Symbio6 Blog](https://symbio6.nl/en/blog/prompting-strategies-prevent-ai-hallucinations)
3. Chain-of-Thought for Reasoning: [Rohan Paul](https://www.rohan-paul.com/p/latest-prompt-engineering-techniques)
4. Iterative Refinement: [Daniel Lopes Journal](https://journal.daniellopes.dev/p/prompt-engineering-techniques)

**Empirical Evidence:**
- deepcoder:1.5b + claudette-mini v2.1.0: Circuit breaker at 5000 tokens
- Repetition pattern: 50+ identical test cases
- Root cause: Unlimited output + temperature 0.0 + complex preamble

---

## 🔄 Next Steps

1. ✅ Create `claudette-mini-tiny.md` preamble
2. ✅ Update `llm-config.json` for tiny models
3. ✅ Implement early loop detection in circuit breaker
4. ✅ A/B test tiny preamble vs. no preamble on deepcoder:1.5b
5. ✅ Validate strategies on qwen2.5-coder:1.5b-base
6. Document findings and iterate

---

**Conclusion:** Small LLMs (<2B) require specialized prompting strategies with explicit constraints, stop sequences, and inference-time parameters to prevent infinite loops. The standard claudette-mini preamble is too complex for these models and must be simplified to <200 tokens with explicit quantitative limits.
