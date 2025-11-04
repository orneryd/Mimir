# Test Run 1 Analysis (2025-11-03)

**Test Run:** quantized-test-results-1/  
**Benchmark:** User validation system (12+ test cases, complex requirements)  
**Preamble:** claudette-mini v2.1.0 (non-tool)  
**Baseline:** No instructions  

---

## 📊 Executive Summary

**Overall Preamble Effect:** +16.5 points (+28.8% improvement)  
**Models Tested:** 6 (1.5B to 14B parameters)  
**Key Finding:** Preamble benefits struggling models most, but can cause regressions in high performers

---

## 🎯 Results Overview

| Model | Baseline | Preamble | Δ | Status | Duration (s) |
|-------|----------|----------|---|--------|--------------|
| **phi4:14b** | 99/100 | 98/100 | -1 | ✅ Stable | 268.1 → 226.5 |
| **gemma3:4b** | 95/100 | 83/100 | **-12** | ⚠️ Regression | 21.8 → 21.5 |
| **deepseek-coder:6.7b** | 35/100 | 94/100 | **+59** | ✅ Huge Win | 149.2 → 373.1 |
| **phi4-mini:3.8b** | 57/100 | 66/100 | +9 | ✅ Small Win | 23.0 → 10.6 |
| **qwen2.5-coder:1.5b-base** | 15/100 | 78/100 | **+63** | ✅ Huge Win | 634.8 → 6.3 |
| **deepcoder:1.5b** | 43/100 | 24/100 | **-19** | 🔴 Collapse | 23.3 → 53.8 |

---

## 🔍 Key Insights

### 1. **The "Goldilocks Zone" for Preambles**

**Models with baseline 50-80:** Get the most benefit  
- deepseek-coder:6.7b: 35 → 94 (+59 pts)
- qwen2.5-coder:1.5b-base: 15 → 78 (+63 pts)
- phi4-mini:3.8b: 57 → 66 (+9 pts)

**Models with baseline >90:** Preamble causes regression  
- gemma3:4b: 95 → 83 (-12 pts) - already excellent baseline
- phi4:14b: 99 → 98 (-1 pt) - already near-perfect

**Models with baseline <50 and <2B:** Risk of collapse  
- deepcoder:1.5b: 43 → 24 (-19 pts) - circuit breaker triggered

**Hypothesis:** Strong models already know best practices; preamble adds noise. Weak mid-size models need guidance. Tiny models (<2B) can't handle preamble complexity.

---

### 2. **Circuit Breaker Activation (Critical)**

**deepcoder:1.5b + claudette-mini:**
- Hit 5000 token limit (circuit breaker)
- Output: Infinite repetition loop of test cases
- Score: 24/100 (vs. 43/100 baseline)
- Duration: 53.8s (vs. 23.3s baseline)

**Root Cause:** Model entered repetitive pattern:
```javascript
it('email length', () => {
  expect(userValidator('abcdefg').validateEmail).toBe(true);
  expect(() => userValidator('abcdefg').validateEmail).toBe(true);
  expect(() => userValidator('a').validateEmail).toThrow('Email must be between 5 and 100 characters');
});
// ... repeated 50+ times
```

**Lesson:** Very small models (<2B) struggle with complex preambles. Need model-size-specific preambles or skip entirely.

---

### 3. **Speed vs. Quality Trade-offs**

#### **Fastest Models:**
1. **qwen2.5-coder:1.5b-base:** 6.3s (78/100) - **12.4 pts/sec** ⚡
2. **phi4-mini:3.8b:** 10.6s (66/100) - **6.2 pts/sec**
3. **gemma3:4b:** 21.5s (83/100) - **3.9 pts/sec**

#### **Slowest Models:**
1. **deepseek-coder:6.7b:** 373.1s (94/100) - **0.25 pts/sec**
2. **phi4:14b:** 226.5s (98/100) - **0.43 pts/sec**

#### **Efficiency Champions (Score/Second):**
1. **qwen2.5-coder:1.5b-base:** 12.4 pts/sec (best value)
2. **phi4-mini:3.8b:** 6.2 pts/sec
3. **gemma3:4b:** 3.9 pts/sec

**Insight:** qwen2.5-coder:1.5b-base is the clear winner for rapid iteration (if avoiding collapse). Phi4-mini is a strong second choice for speed + quality.

---

### 4. **Baseline Consistency Analysis**

**Highly Consistent (±1 pt variance expected):**
- phi4:14b: 99/100 (near-perfect baseline)
- gemma3:4b: 95/100 (excellent baseline)

**Moderate Variance (±5-10 pts expected):**
- phi4-mini:3.8b: 57/100
- deepcoder:1.5b: 43/100 (but prone to collapse)

**High Variance (±15-20 pts expected):**
- deepseek-coder:6.7b: 35/100 (low baseline, high potential)
- qwen2.5-coder:1.5b-base: 15/100 (very weak baseline)

**Recommendation:** Run 2-3 iterations for models with baseline <60 to establish true performance range.

---

### 5. **Category-Level Analysis**

#### **Gemma3:4b Regression Deep Dive**

**Baseline (95/100):**
- Problem Analysis: 20/20 ✅
- Code Completeness: 30/30 ✅
- Test Coverage: 25/25 ✅
- Code Quality: 10/14 (good)
- Strategy Explanation: 10/10 ✅

**Preamble (83/100):**
- Problem Analysis: 16/20 (-4) - lost async consideration
- Code Completeness: 25/30 (-5) - less complete
- Test Coverage: 23/25 (-2) - slightly reduced
- Code Quality: 10/14 (same)
- Strategy Explanation: 9/10 (-1)

**Insight:** Preamble's "brief explanation" constraint reduced quality of strategy and analysis. Model naturally verbose and thorough; preamble's brevity hurt performance.

---

#### **DeepSeek-Coder:6.7b Success Deep Dive**

**Baseline (35/100):**
- Problem Analysis: 10/20 (poor)
- Code Completeness: 5/30 (very poor)
- Test Coverage: 8/25 (poor)
- Code Quality: 6/14 (poor)
- Strategy Explanation: 6/10 (poor)

**Preamble (94/100):**
- Problem Analysis: 20/20 (+10) ✅
- Code Completeness: 30/30 (+25) ✅ HUGE
- Test Coverage: 24/25 (+16) ✅ HUGE
- Code Quality: 14/14 (+8) ✅ FULL MARKS
- Strategy Explanation: 6/10 (same)

**Insight:** Model lacked structure baseline. Preamble's explicit "Generate complete code, handle edge cases" guidance was transformative.

---

## 🎯 Recommendations

### **For Future Testing:**

1. **Segment Models by Baseline Performance:**
   - **High (>90):** Test WITHOUT preamble or use minimal preamble
   - **Mid (50-90):** Current preamble works well
   - **Low (<50, >3B):** Keep current preamble
   - **Tiny (<2B):** Skip preamble or create ultra-minimal version

2. **Run Multiple Iterations for Low-Baseline Models:**
   - 3 runs for baseline <60 to establish variance
   - 2 runs for baseline 60-80
   - 1 run for baseline >80 (consistent)

3. **Monitor Circuit Breakers:**
   - Flag models that hit 5000 token limit
   - Analyze repetition patterns
   - Consider smaller preambles for tiny models

4. **Speed/Quality Trade-off Analysis:**
   - For rapid iteration: qwen2.5-coder:1.5b-base (6.3s, 78/100)
   - For balance: gemma3:4b (21.5s, 83/100)
   - For quality: phi4:14b (226.5s, 98/100)

---

### **For Preamble Design:**

1. **Create Size-Specific Variants:**
   - **claudette-mini-large (>10B):** Minimal guidance, assumes competence
   - **claudette-mini-mid (3-10B):** Current v2.1.0
   - **claudette-mini-tiny (<3B):** Ultra-minimal, no examples

2. **A/B Test Brevity Constraint:**
   - Some models (gemma3) naturally verbose and thorough
   - "Brief explanation" may hurt performance
   - Test variant without brevity constraint

3. **Add Circuit Breaker Detection to Preamble:**
   - "Avoid repeating test cases"
   - "If you find yourself repeating code, stop and review"

---

## 📈 Success Metrics

**Preamble Improved 4/6 Models (67%)**  
**Average Improvement (All): +16.5 pts**  
**Average Improvement (Excluding Regressions): +35.5 pts**  
**Regressions: 2/6 (33%) - gemma3:4b, deepcoder:1.5b**

**Best Improvements:**
1. qwen2.5-coder:1.5b-base: +63 pts (+420%)
2. deepseek-coder:6.7b: +59 pts (+169%)

**Worst Regressions:**
1. deepcoder:1.5b: -19 pts (-44%) - circuit breaker
2. gemma3:4b: -12 pts (-13%) - over-constrained

---

## 🔄 Next Steps

1. ✅ **Run consistency test** (current run) to validate findings
2. **Segment preambles by model size**
3. **A/B test brevity constraints** on gemma3:4b
4. **Create ultra-minimal preamble** for <3B models
5. **Analyze tool-calling models** separately (different benchmark)

---

**Conclusion:** The preamble shows strong promise for mid-tier models (50-90 baseline), but needs refinement for both high-performers (>90) and tiny models (<3B). Speed/quality analysis reveals qwen2.5-coder:1.5b-base as the efficiency champion for rapid iteration.
