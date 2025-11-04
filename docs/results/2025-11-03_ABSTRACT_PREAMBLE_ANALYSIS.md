# Technology-Agnostic Preamble Analysis (Run 3 vs Run 4)

**Run 3:** claudette-mini v2.1.0 (JavaScript/Jest-specific examples)  
**Run 4:** claudette-mini v2.2.0 (Technology-agnostic examples)  
**Test Date:** 2025-11-03  
**Models Tested:** 3 non-tool models (1.5B-6.7B)  

---

## 🎯 Executive Summary

**VERDICT: Technology-Agnostic Changes Improved Overall Performance**

- **Overall Average:** Run 3: 71/100 → Run 4: 76/100 (+7% improvement)
- **Biggest Winner:** deepseek-coder:6.7b (+26 pts, 69 → 95)
- **Biggest Loser:** phi4-mini:3.8b (-11 pts, 65 → 54)
- **Loop-Prone Model:** qwen2.5-coder:1.5b-base (79 → 79, perfectly stable)

**Key Finding:** Abstract syntax benefits models that UNDERSTAND abstractions (6.7B+) but CONFUSES models that need concrete examples (3-4B).

---

## 📊 Head-to-Head Comparison

| Model | Run 3 (v2.1.0) | Run 4 (v2.2.0) | Δ | Verdict |
|-------|----------------|----------------|---|---------|
| **deepseek-coder:6.7b** | 69/100 (120.8s) | 95/100 (134.9s) | **+26** | 🚀 **HUGE WIN** |
| **phi4-mini:3.8b** | 65/100 (5.3s) | 54/100 (5.6s) | **-11** | ⚠️ **REGRESSION** |
| **qwen2.5-coder:1.5b-base** | 79/100 (6.2s) | 79/100 (6.2s) | **0** | ✅ **STABLE** |
| **AVERAGE** | **71.0/100** | **76.0/100** | **+5** | ✅ **IMPROVED** |

---

## 🔬 Detailed Model Analysis

### 1. deepseek-coder:6.7b (6.7B) - MASSIVE IMPROVEMENT

**Run 3 (Jest-specific):** 69/100, 857 tokens, 120.8s  
**Run 4 (Abstract):** 95/100, 1,048 tokens, 134.9s  
**Improvement:** +26 pts (+38%)

**Category Breakdown:**

| Category | Run 3 | Run 4 | Δ |
|----------|-------|-------|---|
| Problem Analysis | 18/20 | 20/20 | **+2** |
| Code Completeness | 18/35 | 30/35 | **+12** 🚀 |
| Test Coverage | 16/25 | 25/25 | **+9** 🚀 |
| Code Quality | 10/15 | 15/15 | **+5** 🚀 |
| Strategy Explanation | 7/5 | 5/5 | -2 |

**What Changed:**

**Run 3 Issue:** Model wrote comment `// Repeat the above tests for validatePassword and validateAge...` instead of actual tests
- Only 13 test cases shown (7 for validateEmail, 6 for validateUser)
- Missing tests for validatePassword and validateAge
- Judge: "Tests for validatePassword and validateAge are mentioned but not actually provided"

**Run 4 Success:** Model generated COMPLETE test suite with 20 test cases
- 6 tests for validateEmail
- 6 tests for validatePassword
- 5 tests for validateAge
- 3 tests for validateUser
- NO placeholder comments
- Judge: "20 distinct, well-structured test cases covering all major edge cases"

**Why Abstract Syntax Helped:**
- Generic pseudo-code examples freed the model from Jest-specific patterns
- Model focused on LOGIC (what to test) vs SYNTAX (how Jest does it)
- Abstract structure `test_suite "name": test "case":` is more pattern-like
- Model could generalize better without concrete framework constraints

**Conclusion:** 6.7B models BENEFIT from abstraction because they can understand patterns and apply them correctly.

---

### 2. phi4-mini:3.8b (3.8B) - REGRESSION

**Run 3 (Jest-specific):** 65/100, 5.3s  
**Run 4 (Abstract):** 54/100, 5.6s  
**Regression:** -11 pts (-17%)

**Category Breakdown:**

| Category | Run 3 | Run 4 | Δ |
|----------|-------|-------|---|
| Problem Analysis | 18/20 | 16/20 | **-2** |
| Code Completeness | 10/35 | 8/35 | **-2** |
| Test Coverage | 20/25 | 13/25 | **-7** ⚠️ |
| Code Quality | 8/15 | 8/15 | 0 |
| Strategy Explanation | 9/5 | 9/5 | 0 |

**What Changed:**

**Run 3 Issue:** Model wrote some placeholders but had decent structure
- Test Coverage: 20/25 (good)
- Judge: "Partial output, some placeholders, but recognizes boundary values"

**Run 4 Issue:** Model wrote EVEN MORE placeholders with abstract syntax
- Test Coverage: 13/25 (worse)
- Judge: "Only a few examples, several placeholder comments indicating where more tests should go"
- Code Completeness: "Does not provide 12+ distinct test cases—only outlines"

**Why Abstract Syntax Hurt:**
- 3.8B models need CONCRETE examples to follow
- Generic pseudo-code `test_suite "name":` was too vague
- Model interpreted abstract syntax as "here's a pattern, you fill it in"
- Without concrete Jest syntax to copy, model defaulted to outlines

**Example from Run 4 output:**
```
test_suite "validatePassword":
  // Similar tests for password validation
  // ... (test cases for password)
```

**Conclusion:** 3-4B models NEED concrete, technology-specific examples. Abstract syntax is interpreted as permission to use placeholders.

---

### 3. qwen2.5-coder:1.5b-base (1.5B) - PERFECTLY STABLE

**Run 3 (Jest-specific):** 79/100, 872 tokens, 6.2s  
**Run 4 (Abstract):** 79/100, 872 tokens, 6.2s  
**Change:** 0 pts (100% consistent)

**Category Breakdown:**

| Category | Run 3 | Run 4 | Δ |
|----------|-------|-------|---|
| Problem Analysis | 18/20 | 18/20 | 0 |
| Code Completeness | 28/35 | 28/35 | 0 |
| Test Coverage | 18/25 | 18/25 | 0 |
| Code Quality | 13/15 | 13/15 | 0 |
| Strategy Explanation | 2/5 | 2/5 | 0 |

**Why Abstract Syntax Had Zero Impact:**

This model is loop-prone and relies HEAVILY on the preamble's structure. The key factors:
1. **Structured pattern** (identify → code → explain) remained the same
2. **Anti-patterns section** remained the same
3. **Quality checklist** remained the same

The specific syntax (Jest vs pseudo-code) didn't matter because the model:
- Follows the 3-step pattern mechanically
- Uses the checklist to self-correct
- Generates actual JavaScript (task context is JavaScript)
- Doesn't get confused by pseudo-code examples because it's focused on the pattern

**Conclusion:** For <2B models, the STRUCTURE matters more than the syntax of examples. As long as the pattern is clear, they perform consistently.

---

## 💡 Key Insights

### 1. **Abstraction Benefits Scale with Model Size**

**6.7B models (deepseek-coder):**
- ✅ Understand abstract patterns
- ✅ Apply patterns to specific languages
- ✅ Generate complete, diverse code
- ✅ Freed from framework constraints

**3-4B models (phi4-mini):**
- ❌ Interpret abstract examples as "templates to fill"
- ❌ Generate more placeholders
- ❌ Need concrete syntax to copy
- ❌ Abstract = permission to be vague

**<2B models (qwen2.5-coder):**
- ➖ Pattern structure matters more than syntax
- ➖ Follow mechanical steps regardless of examples
- ➖ Abstract vs concrete = no difference
- ➖ Focus on preamble structure, not examples

### 2. **Code Completeness is the Critical Category**

**deepseek-coder:6.7b improvement:**
- Code Completeness: 18 → 30 (+12 pts, 67% increase)
- This single category accounted for 46% of total improvement

**Why this matters:**
- Abstract syntax encouraged "generating everything" vs "outlining some things"
- Jest-specific syntax created mental model of "show examples, skip details"
- Generic pseudo-code had no implicit "this is optional" signal

### 3. **The "Placeholder Trap" for Mid-Sized Models**

**Pattern identified in phi4-mini:**

Jest-specific examples:
```javascript
describe('validateEmail', () => {
  it('accepts valid email', () => { ... });
  // Model sees this as complete example
});
```

Abstract examples:
```[language]
test_suite "email validator":
  test "accepts valid email": ...
  // Model sees this as template to customize
```

**Result:** Abstract syntax triggered "fill in the template" behavior in 3-4B models.

### 4. **Stability is Model-Dependent**

**Stable models:**
- qwen2.5-coder:1.5b-base: 79 → 79 (0 change)
- claudette-tiny scores: ~1 pt variance across runs

**Variable models:**
- deepseek-coder:6.7b: 69 → 95 (+26 pts)
- phi4-mini:3.8b: 65 → 54 (-11 pts)

**Conclusion:** Larger models are MORE sensitive to preamble changes (both positively and negatively).

---

## 🎯 Recommendations

### Use Technology-Agnostic Preambles For:
1. ✅ **6-7B+ models** (deepseek-coder:6.7b, gemma3:4b)
   - Benefit from abstraction
   - Generate more complete code
   - Freed from framework constraints

2. ✅ **<2B models** (qwen2.5-coder:1.5b-base, deepcoder:1.5b)
   - Pattern structure matters more than syntax
   - No negative impact from abstraction
   - Stable performance regardless

### Use Technology-Specific Preambles For:
1. ⚠️ **3-4B models** (phi4-mini:3.8b)
   - Need concrete examples to follow
   - Abstract syntax increases placeholders
   - Benefit from seeing exact Jest/framework syntax

### Hybrid Approach (Recommended):
Create model-specific preamble selection:
```typescript
function selectPreamble(model: string, paramCount: number) {
  if (paramCount >= 6.0) {
    return "claudette-mini-abstract.md"; // v2.2.0
  } else if (paramCount >= 3.0 && paramCount < 6.0) {
    return "claudette-mini-concrete.md"; // v2.1.0
  } else {
    return "claudette-mini-abstract.md"; // <2B stable with either
  }
}
```

---

## 📈 Statistical Summary

### Overall Effectiveness (All Models)

| Metric | Run 3 (v2.1.0) | Run 4 (v2.2.0) | Change |
|--------|----------------|----------------|--------|
| **Average Score** | 71.0/100 | 76.0/100 | **+7%** |
| **Models Improved** | - | 1/3 (33%) | - |
| **Models Stable** | - | 1/3 (33%) | - |
| **Models Regressed** | - | 1/3 (33%) | - |
| **Max Improvement** | - | +26 pts | deepseek-coder |
| **Max Regression** | - | -11 pts | phi4-mini |

### By Model Size

| Size | Run 3 Avg | Run 4 Avg | Change |
|------|-----------|-----------|--------|
| **6-7B** | 69/100 | 95/100 | **+38%** |
| **3-4B** | 65/100 | 54/100 | **-17%** |
| **1-2B** | 79/100 | 79/100 | **0%** |

---

## ✅ Conclusion

**Technology-agnostic preambles are BENEFICIAL overall (+7% average improvement).**

**However, effectiveness is model-size-dependent:**

1. **6-7B models:** HUGE WIN (+38%, 69 → 95)
   - Abstract syntax frees them from framework constraints
   - Generates more complete, diverse code
   - Understands patterns and applies correctly

2. **3-4B models:** REGRESSION (-17%, 65 → 54)
   - Abstract syntax interpreted as templates
   - Increases placeholders and incompleteness
   - Needs concrete examples to copy

3. **<2B models:** STABLE (0%, 79 → 79)
   - Pattern structure matters more than syntax
   - No impact from abstraction
   - Follows mechanical steps regardless

**Final Recommendation:** **Use model-size-based preamble selection:**
- 6-7B+: Abstract (v2.2.0)
- 3-4B: Concrete (v2.1.0)
- <2B: Abstract (v2.2.0, same performance)

This maximizes performance across all model sizes.

---

**Last Updated:** 2025-11-03  
**Test Runs Analyzed:** Run 3 (v2.1.0) vs Run 4 (v2.2.0)  
**Models:** deepseek-coder:6.7b, phi4-mini:3.8b, qwen2.5-coder:1.5b-base
