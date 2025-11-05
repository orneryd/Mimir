# Research-Backed Agentic Prompting Principles (2025) v1.2.0

**With Lessons from claudette-debug, claudette-auto & Advanced Discipline Principles**

---

## 🎯 CORE PRINCIPLES (Research-Backed + Validated)

**Foundation Principles** (1-7):
- Proven through claudette-debug (92/100) and claudette-auto (92/100)
- Validated across multiple agent types and tasks

**Advanced Discipline Principles** (8-10) 🆕:
- Adopted from Autonomous Agent Prompting Framework analysis
- Research-backed with citations (Perez et al., Wang et al., Yao et al.)
- Focus on professional communication, verification, and autonomy

### 1. CHAIN-OF-THOUGHT (CoT) WITH EXECUTION

**Research**: CoT prompting improves accuracy and logical coherence by guiding LLM through intermediate reasoning steps.

**claudette-debug application** ✅:
- Phase 0-4 workflow (explicit reasoning steps)
- "After each action, state what you found and what you're doing next"
- Multi-Bug Workflow Example showing step-by-step progression
- Debugging Techniques section (5 explicit types)

**claudette-auto application** ✅:
- Phase 1-3 execution protocol
- "Before performing any task, briefly list the sub-steps you intend to follow"
- Detailed TODO with sub-phases (1.1, 1.2, etc.)
- "As you perform each step, state what you are checking or changing"

**PROVEN PATTERN**:
```markdown
✅ DO: Provide explicit phase structure with sub-steps
✅ DO: Require agent to narrate progress as it works
✅ DO: Use numbered hierarchies (Phase → Step → Action)
❌ DON'T: Ask for reasoning without requiring execution
❌ DON'T: Allow silent execution without progress updates
```

---

### 2. CLEAR ROLE DEFINITION (Identity Over Instructions)

**Research**: Assigning specific roles helps structure interactions and ensures the agent operates within defined parameters.

**claudette-debug application** ✅:
- "Debug Specialist" (not "implementation agent")
- "Detective, not surgeon" (memorable metaphor)
- "Role: Investigate and document, don't fix"
- MANDATORY RULE #6: NO IMPLEMENTATION

**claudette-auto application** ✅:
- "Enterprise Software Development Agent"
- "Continue working until the problem is completely solved"
- Identity stated in first paragraph (not buried)
- Role includes emotional tone: "conversational, feminine, empathetic"

**PROVEN PATTERN**:
```markdown
✅ DO: State role in first 3 lines (identity before instructions)
✅ DO: Use memorable metaphors ("Detective, not surgeon")
✅ DO: Include emotional/tonal guidance in identity
✅ DO: Reinforce role at decision points (Completion Criteria)
❌ DON'T: Bury role definition after 500 tokens
❌ DON'T: Use generic "you are an assistant" language
```

---

### 3. AGENTIC PROMPTING (Step Sequence During Reasoning)

**Research**: Providing specific step sequences during reasoning enables LLMs to execute complex tasks autonomously.

**claudette-debug application** ✅:
- MANDATORY RULES at top (10 explicit rules)
- Phase 0: Verify Context (5-step checklist)
- Phase 1-4: Explicit workflows
- "Bug N/M" tracking format (concrete progress marker)

**claudette-auto application** ✅:
- PRODUCTIVE BEHAVIORS section (always do these)
- Replace patterns: "❌ X → ✅ Y" (explicit alternatives)
- Phase 1: MANDATORY Repository Analysis (7-step checklist)
- Memory Management: 5-step retrieval protocol

**PROVEN PATTERN**:
```markdown
✅ DO: Provide step-by-step checklists at critical phases
✅ DO: Use checkboxes [ ] for multi-step workflows
✅ DO: Show concrete examples of step sequences
✅ DO: Require explicit progress markers ("Bug 1/8", "Phase 2 complete")
❌ DON'T: Provide goals without concrete steps to achieve them
❌ DON'T: Allow agent to self-define workflow structure
```

---

### 4. REFLECTION MECHANISMS (Self-Verification)

**Research**: Encouraging LLMs to review and verify outputs reduces errors and improves reliability.

**claudette-debug application** ✅:
- MANDATORY RULE #4: CLEAN UP EVERYTHING
- Completion Criteria: 7/7 checklist (must verify all)
- Cleanup Verification: "git diff" command required
- "Final reminder: Before saying you're done, verify ZERO debug markers"

**claudette-auto application** ✅:
- Phase 3: "Run tests after each significant change"
- "Continue working until ALL requirements satisfied"
- TODO Management: "Review remaining TODO items after each phase"
- Context Refresh Triggers (5 explicit reminders)

**PROVEN PATTERN**:
```markdown
✅ DO: Require explicit verification steps before completion
✅ DO: Provide concrete verification commands (git diff, test suite)
✅ DO: Use checklists for self-verification (Completion Criteria)
✅ DO: Add verification triggers throughout workflow
❌ DON'T: Trust agent to "figure out" when it's done
❌ DON'T: Allow completion without explicit verification evidence
```

---

### 5. CONTEXTUAL ADAPTABILITY (Recovery Paths)

**Research**: Ensuring agents can adjust behavior based on context and recover from misunderstandings is vital for robust interactions.

**claudette-debug application** ✅:
- MANDATORY RULE #9: Verify context FIRST
- Phase 0: "Read user's request, identify actual failing test"
- Anti-Pattern warnings: "Taking example scenarios as your task"
- MANDATORY RULE #8: "Examples are NOT your task"

**claudette-auto application** ✅:
- Memory Management: Check .agents/memory.instruction.md at task start
- "When resuming, summarize what you remember"
- Context Refresh Triggers: "After any pause/interruption"
- "Before asking user: Let me check my TODO list first..."

**PROVEN PATTERN**:
```markdown
✅ DO: Require context verification as first action
✅ DO: Provide explicit warnings about common misunderstandings
✅ DO: Add recovery triggers ("Before asking user...")
✅ DO: Show anti-patterns with ❌ vs ✅ examples
❌ DON'T: Assume agent will understand context correctly
❌ DON'T: Allow agent to proceed without verification step
```

---

### 6. ESCALATION PROTOCOLS (When to Stop vs Continue)

**Research**: Defining clear escalation rules helps agents recognize when to seek additional information or continue autonomously.

**claudette-debug application** ✅:
- MANDATORY RULE #5: "Don't stop after finding one bug"
- MANDATORY RULE #7: NO SUMMARY AFTER ONE BUG
- MANDATORY RULE #10: "Don't stop until N = M"
- Work Style: "Without stopping to ask for direction"
- Completion Criteria: "IMMEDIATELY start next bug"

**claudette-auto application** ✅:
- CORE IDENTITY: "Continue working until the problem is completely solved"
- PRODUCTIVE BEHAVIORS: "Continue until ALL requirements are met"
- Replace patterns: "❌ Would you like me to proceed? → ✅ Now updating"
- "Execute plans as you create them" (no permission needed)

**PROVEN PATTERN** (THIS IS THE BREAKTHROUGH):
```markdown
✅ DO: Use negative prohibitions ("Don't stop", "Don't ask")
✅ DO: Replace questions with actions (see "Permission-Seeking Anti-Pattern" Rule #4)
✅ DO: State stop condition explicitly ("until N = M", "ALL requirements")
✅ DO: Add continuation triggers at decision points
❌ DON'T: Use collaborative language (see "Permission-Seeking Anti-Pattern")
❌ DON'T: Allow ambiguous stop conditions ("when done", "if complete")
❌ DON'T: Use language that implies optional continuation
```

**CRITICAL INSIGHT** (From claudette-debug v1.0.0 → 92/100):

**What WORKED** (+17 points, 75 → 92):
1. "Don't stop after finding one bug" (negative prohibition)
2. "Continue investigating until..." (explicit end condition)
3. "Bug 1/8 complete. Investigating Bug 2/8 now..." (template)
4. "Don't implement. Don't ask about implementation." (double negative)
5. "immediately start next bug" (no gap for pausing)

**What FAILED** (v1.4.0 → 66/100, -26 points):
1. "Continue investigating each bug" (positive framing)
2. "Work through all bugs" (vague stop condition)
3. Removed "Don't stop" language
4. Used "when complete" instead of "until N = M"

**LESSON**: Negative prohibitions ("Don't stop", "Don't ask") are MORE effective than positive instructions ("Continue", "Keep going") for preventing premature stopping.

---

### 7. STRUCTURED OUTPUTS (Reproducible Results)

**Research**: Crafting prompts that lead to predictable, structured outputs is essential for integrating LLM agents into larger systems.

**claudette-debug application** ✅:
- "Bug N/M" format (concrete tracking structure)
- Completion Criteria: 7-point checklist
- Root Cause Template: "One sentence" + "Specific line numbers"
- Multi-Bug Workflow Example (shows exact format)

**claudette-auto application** ✅:
- TODO format: "Phase X: Name" with sub-items
- Memory Structure Template (YAML front matter + sections)
- "Before performing any task, briefly list the sub-steps"
- Segue format: "Step X/N complete. Now doing Y..."

**PROVEN PATTERN**:
```markdown
✅ DO: Provide exact output templates (not descriptions)
✅ DO: Show examples with real data (not placeholders)
✅ DO: Require progress markers in specific format ("Bug 1/8")
✅ DO: Use checklists for structured completion
❌ DON'T: Say "report results" without showing format
❌ DON'T: Allow free-form progress updates
```

---

### 8. ANTI-SYCOPHANCY (Professional Communication) 🆕

**Research**: Addresses sycophancy bias in RLHF models ([Perez et al., 2022](https://arxiv.org/abs/2212.09251)) - models validate user statements regardless of accuracy, reducing trust.

**Problem**: Agents waste tokens on flattery, creating false confidence and unprofessional communication.

**Solution**:
```markdown
❌ NEVER use:
- "You're absolutely right!"
- "Excellent point!"
- "Perfect!"
- "Great idea!"

✅ Use instead:
- "Got it." (brief acknowledgment)
- "Confirmed: [factual statement]" (only when verifiable)
- Proceed silently with action
```

**PROVEN PATTERN**:
```markdown
✅ DO: Brief, factual acknowledgments only
✅ DO: Validate only verifiable facts ("Tests pass", "File exists")
✅ DO: Proceed with action instead of praising
❌ DON'T: Validate non-factual user statements
❌ DON'T: Use conversational filler or flattery
❌ DON'T: Say "right" when user made no claim to evaluate
```

**Why This Matters**:
- Reduces token waste (10-15% in some agents)
- Maintains professional, technical communication
- Improves user trust in agent accuracy
- Prevents misrepresentation of statements as evaluable claims

**Application in Agents**:
- All agents: Replace praise with action
- Worker agents: "Got it." then execute
- QC agents: Only factual pass/fail, never "Great work!"
- Research agents: Cite findings, don't validate questions

---

### 9. SELF-AUDIT MANDATORY (Evidence-Based Completion) 🆕

**Research**: Self-consistency and Constitutional AI self-critique ([Wang et al., 2022](https://arxiv.org/abs/2203.11171), [Bai et al., 2022](https://arxiv.org/abs/2212.08073))

**Problem**: Agents report completion without verifying work meets requirements, leading to hallucinated success.

**Solution**:
```markdown
**RULE #X: SELF-AUDIT MANDATORY**
Don't stop until you PROVE your work is correct:
- [ ] All requirements verified (with evidence)
- [ ] Tests executed and passed (output shown)
- [ ] No regressions introduced (checked)
- [ ] Output matches specification (compared)

Show evidence for each verification step.
```

**PROVEN PATTERN**:
```markdown
✅ DO: Run tests and show output before claiming done
✅ DO: Provide verification commands with results
✅ DO: Show "git diff" or equivalent proof
✅ DO: Compare actual vs expected (with data)
❌ DON'T: Say "tests pass" without showing output
❌ DON'T: Claim completion without proof
❌ DON'T: Skip verification steps
```

**Why This Matters**:
- Catches errors before QC/user review (30-40% error reduction)
- Provides audit trail for decisions
- Reduces retry loops (get it right first time)
- Builds confidence in agent reliability

**Application in Agents**:
- Worker agents: Run tests, show output, verify file changes
- Research agents: Verify sources exist, cite with URLs
- PM agents: Verify task graph consistency with commands
- Debug agents: Verify reproduction tests actually fail/pass

**Example Evidence**:
```markdown
✅ GOOD:
- Tests: `npm test` output shows "All 23 tests passed"
- Files: `git status` shows 3 files modified
- Verification: `curl localhost:3000/health` returns {"status":"ok"}

❌ BAD:
- "I ran the tests and they passed"
- "The code looks correct"
- "Everything should work now"
```

---

### 10. CLARIFICATION LADDER (Exhaust Research Before Asking) 🆕

**Research**: ReAct (Reasoning + Acting) framework ([Yao et al., 2022](https://arxiv.org/abs/2210.03629)) - exhaust reasoning before escalating

**Problem**: Agents ask for clarification prematurely when they could infer from context, breaking autonomous flow.

**Solution**:
```markdown
**CLARIFICATION LADDER** (Exhaust in order):
1. Check local files (README, package.json, docs/)
2. Pull from knowledge graph (memory_get_node, memory_get_subgraph)
3. Search web for official documentation
4. Infer from industry standards/conventions
5. Make educated assumption (document reasoning)
6. ONLY THEN: Ask user with specific question

❌ WRONG: "What framework should I use?"
✅ CORRECT: Check package.json → Find React 18 → Proceed
```

**PROVEN PATTERN**:
```markdown
✅ DO: Exhaust all 5 rungs before asking
✅ DO: Document what you checked at each rung
✅ DO: Make educated assumptions with reasoning
✅ DO: Only ask when truly blocked (security, ambiguous requirements)
❌ DON'T: Ask without checking local files first
❌ DON'T: Skip research steps
❌ DON'T: Ask vague questions ("What should I do?")
```

**Why This Matters**:
- Reduces user interruptions (50-70% fewer clarifying questions)
- Demonstrates research capability
- Increases autonomous execution percentage (60% → 85%+)
- Documents decision-making process

**Application in Agents**:
- All agents: Must check local files + search before asking
- Ecko: Check package.json + README + web search before inferring
- PM agents: Research architecture files before asking about patterns
- Worker agents: Check dependencies before asking about tooling

**Exception**: Security-critical decisions (deployment, auth, data access) may ask immediately.

**Example Flow**:
```markdown
✅ GOOD:
"Need to add authentication. Checked:
1. README.md: No auth mentioned
2. package.json: No auth library installed
3. Searched 'Express auth best practices 2025' → Found Passport.js standard
4. Assuming Passport.js with JWT strategy (industry standard)
Proceeding with implementation..."

❌ BAD:
"Need to add authentication. What library should I use?"
[Didn't check anything]
```

---

## 🚨 CRITICAL ANTI-PATTERNS (Research + Validated)

### Stopping Triggers (From claudette-debug campaign)

**Patterns that cause premature stopping:**

1. **"Am I done?" triggers**:
   - ❌ Writing "Summary" after one task
   - ❌ Writing "Next steps if you want..."
   - ❌ Using "Bug 1/?" (unknown total)
   - ❌ Asking "Should I continue?"

2. **Collaborative language**: (See "ANTI-PATTERN: Permission-Seeking Mindset" for detailed examples)

3. **Vague completion conditions**:
   - ❌ "When analysis is complete"
   - ❌ "After investigating"
   - ❌ "Once I've examined"
   - ❌ "If done"

**Fixes that worked:**

1. **Explicit stop conditions**:
   - ✅ "Don't stop until N = M"
   - ✅ "Continue until ALL requirements met"
   - ✅ "Only terminate when problem is completely solved"

2. **Negative prohibitions**:
   - ✅ "Do NOT write 'Summary'"
   - ✅ "Do NOT ask about implementation"
   - ✅ "Don't stop after one bug"
   - ✅ "NEVER use 'Bug 1/?'"

3. **Immediate continuation patterns**:
   - ✅ "Bug 1/8 complete. Investigating Bug 2/8 now..."
   - ✅ "After documenting, IMMEDIATELY start next bug"
   - ✅ "Now updating" instead of "Would you like me to update"

---

### ANTI-PATTERN: PERMISSION-SEEKING MINDSET (Research Agents)

**What it looks like:**
- Agent stops mid-task to ask "Shall I proceed?"
- Agent offers to fetch data but waits for user approval
- Agent repeats offers without executing
- Agent treats authoritative sources as requiring permission

**Evidence**: BeastMode research agent (76/100) vs Claudette (90/100)

**Cost**: -5 to -7 points (incomplete execution + repetition)

**Failing Pattern:**
```markdown
Question 2/5: Library Landscape
- Fetched official docs for Redux, Zustand, Jotai
- "I will now fetch the live npm pages for those five packages 
  and return an exact snapshot of weekly download counts, 
  latest version, and publish date. Proceed?"
[WAITS FOR USER RESPONSE]

- "Action required (choose one)"
[WAITS FOR USER RESPONSE]

- "Shall I proceed to fetch npm pages?"
[WAITS FOR USER RESPONSE - 3rd time asking]
```

**Working Pattern:** See "PATTERN: Autonomous Data Collection" complete example (lines 403-424).

**Rules to Prevent Permission-Seeking:**

1. **NEVER ask "Shall I proceed?" mid-task**
   ```markdown
   ❌ WRONG: "I will fetch [data]. Shall I proceed?"
   ❌ WRONG: "Would you like me to continue with [action]?"
   ❌ WRONG: "Action required (choose one)"
   ❌ WRONG: "Let me know if you want me to [fetch data]"
   
   ✅ CORRECT: "Fetching [data]... [executes immediately]"
   ✅ CORRECT: "Question 2/5: [researches + fetches + synthesizes]"
   ✅ CORRECT: "Now fetching npm registry data..."
   ```

2. **Treat authoritative sources as requiring NO approval**
   
   (See "PATTERN: Autonomous Data Collection" Rule #4 for complete categorized list)
   
   Rule: If source is authoritative, fetch it during research (not as follow-up).
   Don't offer to fetch. Don't ask permission. Just fetch.

3. **Replace questions with actions**
   ```markdown
   ❌ "Should I fetch [data]?" → ✅ "Fetching [data]..."
   ❌ "Would you like me to [action]?" → ✅ "Now doing [action]..."
   ❌ "Shall I proceed?" → ✅ "Proceeding with [next step]..."
   ❌ "Let me know if..." → ✅ [Just do it, then report result]
   ```

4. **No repeated offers without execution**
   ```markdown
   ❌ WRONG: Offer to fetch data 3+ times without executing
   ✅ CORRECT: Mention plan once, then execute immediately
   ```

**Why This Matters:**

- **User Experience**: Requires 3-4 user interactions instead of 1
- **Autonomy**: Breaks continuous workflow
- **Production Readiness**: Not deployable (needs handholding)
- **Score Impact**: -5 pts (incomplete execution) + -2 pts (repetition)

**Detection Pattern:**

If your agent output contains ANY of these phrases, you have permission-seeking:
- "Shall I proceed?"
- "Would you like me to..."
- "Action required"
- "Let me know if you want..."
- "I can [do X] if you approve"

**Fix**: Remove the question, execute the action, report the result.

---

### PATTERN: AUTONOMOUS DATA COLLECTION (Research Agents)

**Core Principle**: Fetch all required data DURING the research phase, not as a follow-up offer.

**Complete Research Workflow:**
```markdown
Question N/M: [Research Question]

1. Identify required data types:
   - Official docs (for features, architecture)
   - Package registries (for versions, downloads, dates)
   - Industry surveys (for satisfaction, adoption)
   - Benchmarks (for performance data)

2. Fetch ALL authoritative sources (no approval needed):
   - Fetch official docs
   - Fetch npm/PyPI/registry pages
   - Fetch survey data (if available)
   - Fetch benchmark reports (if available)

3. Synthesize findings with complete citations

4. Mark question complete and continue

Question N/M complete. Question (N+1)/M starting now...
```

**Example - Complete Data Collection:**
```markdown
Question 2/5: Top 5 state management libraries

Step 1: Fetching official docs (Redux, Zustand, Jotai, MobX, Recoil)...
Step 2: Fetching npm registry pages for download counts...
Step 3: Fetching State of JS Survey 2024 for satisfaction scores...

FINDING: Top 5 by npm downloads (as of 2025-10-15):
1. Redux: v5.0.1, 8.5M weekly downloads, 72% satisfaction (State of JS 2024)
2. Zustand: v4.5.0, 2.1M weekly downloads, 86% satisfaction (State of JS 2024)
3. Jotai: v2.6.0, 890K weekly downloads, 82% satisfaction (State of JS 2024)
4. MobX: v6.12.0, 760K weekly downloads, 68% satisfaction (State of JS 2024)
5. Recoil: v0.7.7, 520K weekly downloads, 71% satisfaction (State of JS 2024)

Sources:
1. Per npm registry (2025-10-15): [download counts and versions]
2. Per State of JS Survey 2024 (20,435 responses): [satisfaction scores]
3. Per official docs: [feature comparisons]

Question 2/5 complete. Question 3/5 starting now...
```

**Anti-Pattern - Incomplete Collection:**
```markdown
Question 2/5: Top 5 state management libraries

Step 1: Fetched official docs (Redux, Zustand, Jotai, MobX, Recoil)

FINDING: Common libraries are Redux, Zustand, Jotai, MobX, Recoil.
Note: Exact npm download counts and satisfaction scores are not in 
official docs. I can fetch npm registry pages if you'd like.

Shall I proceed to fetch exact numbers?
[WAITS - INCOMPLETE]
```

**Rules for Data Collection:**

1. **Identify data requirements upfront**
   ```markdown
   Question requires:
   - [ ] Official docs (features, architecture)
   - [ ] Package metadata (versions, downloads, dates)
   - [ ] Survey data (satisfaction, adoption)
   - [ ] Benchmarks (performance numbers)
   
   Fetch all checked items before marking question complete.
   ```

2. **No placeholders - fetch actual data**
   ```markdown
   ❌ WRONG: "Per Redux v[X.Y.Z] ([Date])"
   ✅ CORRECT: "Per Redux v5.0.1 (2024-01-15)"
   
   If you can't fetch actual data, state explicitly:
   "Unable to verify: [what's missing] - [why]"
   ```

3. **Fetch during research, not after**
   ```markdown
   ❌ WRONG: "Question 2: Listed libraries. I can fetch npm data if you'd like."
   ✅ CORRECT: "Question 2: Fetching library docs and npm registry data... [complete]"
   ```

4. **Use authoritative sources (no approval needed)**
   ```markdown
   Authoritative sources to fetch autonomously:
   
   For package data:
   - npm registry (npmjs.com/package/[name])
   - PyPI (pypi.org/project/[name])
   - GitHub releases (github.com/[org]/[repo]/releases)
   
   For satisfaction/adoption data:
   - State of JS Survey (10k+ responses, published methodology)
   - Stack Overflow Developer Survey (90k+ responses)
   
   For performance data:
   - Official benchmarks (maintained by projects)
   - js-framework-benchmark (standardized tests)
   
   Rule: If source is authoritative, fetch it. No permission needed.
   ```

5. **Complete citations (version + date + data)**
   ```markdown
   ✅ Package registry citation:
   "Per npm registry (2025-10-15): Zustand v4.5.0, 2.1M weekly downloads"
   
   ✅ Survey citation:
   "Per State of JS Survey 2024 (20,435 responses): Redux satisfaction 72%"
   
   ✅ Benchmark citation:
   "Per js-framework-benchmark v2024.1 (2024-09): Solid 1.2x faster than React"
   ```

**Why This Matters:**

- **Completeness**: Research questions require numeric data, not just qualitative
- **Autonomy**: No user follow-up prompts needed
- **Production Readiness**: Single interaction completes research
- **Score Impact**: +3 to +7 points (complete data + no incomplete execution penalty)

**Expected Pattern in Output:**

```markdown
Question 1/N: [research + synthesize] → complete
Question 2/N: [research + fetch npm + fetch survey + synthesize] → complete
Question 3/N: [research + fetch benchmarks + synthesize] → complete
...
Question N/N: [research + synthesize] → complete

All N/N questions researched. Final summary...
```

**NOT:**
```markdown
Question 1/N: [research] → complete
Question 2/N: [partial research]
"I can fetch npm data. Shall I proceed?"
[INCOMPLETE - WAITING]
```

---

## 📊 COMPARATIVE ANALYSIS (Both Gold Standards)

### claudette-auto (92/100 equivalent performance)

**Strengths**:
1. ✅ Immediate action patterns ("Execute as you plan")
2. ✅ Replace patterns section (❌ vs ✅ explicit)
3. ✅ Memory management (cross-session intelligence)
4. ✅ Context maintenance over long conversations
5. ✅ "Continue working until completely solved" (clear identity)

**Structure**:
- Lines: 475
- Tokens: ~3,500
- MANDATORY sections: CORE IDENTITY, PRODUCTIVE BEHAVIORS at top
- Pattern: Identity → Behaviors → Execution → Examples

---

### claudette-debug (92/100 validated)

**Strengths**:
1. ✅ 10 MANDATORY RULES at top (first 500 tokens)
2. ✅ Multi-bug autonomy ("Don't stop until N = M")
3. ✅ Negative prohibitions ("Don't implement", "Don't ask")
4. ✅ Concrete tracking format ("Bug 1/8 complete")
5. ✅ Explicit role boundary ("Detective, not surgeon")

**Structure**:
- Lines: 718
- Tokens: ~5,300
- MANDATORY sections: MANDATORY RULES (10), CORE IDENTITY at top
- Pattern: Rules → Identity → Workflow → Examples → Completion

---

## 🏆 UNIFIED PROMPTING FRAMEWORK (Gold Standard Pattern)

### Top 500 Tokens (CRITICAL - Place Enforcement Here)

```markdown
1. **CORE IDENTITY** (3-5 lines)
   - Role with memorable metaphor
   - Emotional/tonal guidance
   - Primary objective ("Continue until X")

2. **MANDATORY RULES** (5-10 rules)
   - FIRST ACTION (what to do immediately)
   - Critical prohibitions (negative language)
   - Output format requirements
   - Stop conditions (explicit, quantifiable)

3. **PRODUCTIVE BEHAVIORS** or **OPERATING PRINCIPLES**
   - Replace patterns (❌ vs ✅)
   - Immediate action templates
   - Progress update format
```

### Workflow Structure (Middle Section)

```markdown
4. **PHASE-BY-PHASE EXECUTION**
   - Phase 0: Context verification (mandatory first steps)
   - Phase 1-N: Work phases with checklists
   - Each phase: [ ] checkboxes + concrete actions

5. **CONCRETE EXAMPLES**
   - Multi-task workflow example (show progression)
   - Anti-patterns with ❌ DON'T
   - Correct patterns with ✅ DO
```

### Completion Enforcement (Last 200 Tokens)

```markdown
6. **COMPLETION CRITERIA**
   - Checklist of required evidence
   - Verification commands (git diff, test suite)
   - Stop condition restated

7. **FINAL REMINDERS**
   - Role restatement
   - "AFTER EACH X: immediately start next X"
   - Negative prohibitions ("Don't stop", "Don't ask")
```

---

## 🎯 ACTIONABLE RECOMMENDATIONS

### For New Agent Development:

1. **Start with identity** (first 50 tokens)
   - State role, tone, and primary objective
   - Use memorable metaphor if possible

2. **Front-load enforcement** (tokens 50-500)
   - MANDATORY RULES section (5-10 rules)
   - FIRST ACTION rule (what to do immediately)
   - Stop conditions (explicit, quantifiable)

3. **Use negative prohibitions** (throughout)
   - "Don't stop after X"
   - "Do NOT write Y"
   - "NEVER use Z pattern"

4. **Provide concrete examples** (middle section)
   - Show full workflow with real data
   - Include anti-patterns with ❌
   - Show correct patterns with ✅

5. **Add multiple reinforcement points** (throughout)
   - Restate stop conditions at decision points
   - Add continuation triggers ("IMMEDIATELY start next")
   - End with role restatement + prohibitions

6. **Require structured outputs** (throughout)
   - Explicit templates (not descriptions)
   - Progress markers ("Step N/M")
   - Checklists for verification

---

## 📈 EXPECTED PERFORMANCE BY PATTERN ADHERENCE

| Pattern Adherence | Expected Score | Tier | Notes |
|-------------------|---------------|------|-------|
| All 10 principles | 95-100 | S++ | Gold standard + discipline |
| 7-9 principles | 90-94 | S+ | Gold standard |
| 5-6 principles | 80-89 | S | Production ready |
| 3-4 principles | 70-79 | A | Good, needs refinement |
| 1-2 principles | 60-69 | B | Significant gaps |
| 0 principles | <60 | C-F | Likely to fail |

**Critical principles** (must have for 80+):
1. ✅ Clear role definition (identity first)
2. ✅ Negative prohibitions (don't stop, don't ask)
3. ✅ Explicit stop conditions (until N = M)
4. ✅ Structured outputs (templates + examples)
5. ✅ Multiple reinforcement points (top + middle + end)

**Advanced principles** (adds +5-10 points for 90+):
6. ✅ Anti-sycophancy (professional communication)
7. ✅ Self-audit mandatory (evidence-based completion)
8. ✅ Clarification ladder (exhaust research first)

---

## 🔬 VALIDATION METHODOLOGY

### How to Test New Agent Prompts:

1. **Baseline run** (first test)
   - Run agent on benchmark task
   - Score: Bug discovery, methodology, autonomy
   - Expected: 70-75 (decent but stops prematurely)

2. **Add negative prohibitions** (iteration 1)
   - Add "Don't stop after X"
   - Add "Do NOT ask about Y"
   - Expected: +10-15 points (85-90)

3. **Add explicit stop conditions** (iteration 2)
   - Add "until N = M" or "ALL requirements"
   - Add progress tracking ("Step 1/N complete")
   - Expected: +5-10 points (90-95)

4. **Add continuation triggers** (iteration 3)
   - Add "IMMEDIATELY start next"
   - Add "After X: Document, then start Y"
   - Expected: +0-5 points (95-100, peak performance)

**Regression test**: If score drops >5 points, revert last change.

---

## 💡 KEY INSIGHTS (Research + Validated)

### 1. Negative Language > Positive Language (for continuity)

**Research says**: Positive framing is better for user experience.  
**Reality check**: For LLM agent autonomy, negative prohibitions work better.

**Why?**
- "Continue" is ambiguous (continue how long? until what?)
- "Don't stop" is concrete (stop = terminate turn)
- Positive language creates decision points ("Should I continue?")
- Negative language blocks premature stopping triggers

**Evidence**: claudette-debug v1.0.0 (92/100) vs v1.4.0 (66/100)
- v1.0.0: Used "Don't stop", "Don't ask" → autonomous multi-bug
- v1.4.0: Removed negatives, used "Continue" → stopped after 1 bug

### 2. Stop Conditions Must Be Quantifiable

**Vague (fails)**:
- "When analysis is complete"
- "After investigating issues"
- "Once you've examined the code"

**Quantifiable (works)**:
- "Don't stop until N = M" (bug counting)
- "Continue until ALL requirements met" (checklist)
- "Only terminate when problem is completely solved" (objective)

**Why?**
- LLMs need concrete stop signals
- Subjective conditions trigger "Am I done?" loop
- Quantifiable conditions are verifiable

### 3. Multiple Reinforcement Points Required

**Single mention (fails)**:
- Put "Continue until done" once at top
- Agent forgets after 20-30 tool calls

**Multiple reinforcement (works)**:
- MANDATORY RULE #5: "Don't stop after one bug"
- MANDATORY RULE #10: "Don't stop until N = M"
- Work Style: "Without stopping to ask"
- Completion Criteria: "IMMEDIATELY start next"
- End of document: "Continue until all documented"

**Why?**
- LLMs have recency bias (recent context matters more)
- Decision points need local reinforcement
- Multiple angles prevent misinterpretation

### 4. Examples Must Show Continuity

**Static example (limited value)**:
```
Bug 1: [investigation]
Root cause: X
```

**Continuity example (high value)**:
```
Bug 1/8: [investigation] → "Bug 1/8 complete. Bug 2/8 now..."
Bug 2/8: [investigation] → "Bug 2/8 complete. Bug 3/8 now..."
❌ DON'T: "Bug 1/?: ...unless you want me to stop"
```

**Why?**
- Shows the transition moment (critical decision point)
- Demonstrates progress tracking
- Explicitly forbids stopping pattern

### 5. Role Identity > Detailed Instructions

**Instruction-heavy (moderate success)**:
- "After finding a bug, document it, then..."
- "When investigation is complete, move to..."
- "For each bug, create reproduction test, add markers..."

**Identity-heavy (high success)**:
- "Debug Specialist that investigates... don't fix"
- "Detective, not surgeon"
- "Your role: Investigate and document"

**Why?**
- Identity creates persistent behavior (not step-dependent)
- Metaphors are memorable across long context
- Role boundaries are clearer than process rules

---

## 🚀 NEXT STEPS FOR FRAMEWORK APPLICATION

1. **Audit existing agents**:
   - Check placement of identity (first 50 tokens?)
   - Count reinforcement points for critical behaviors
   - Identify vague vs quantifiable stop conditions

2. **Create agent templates**:
   - Gold standard structure (identity → rules → workflow → examples)
   - Boilerplate sections (MANDATORY RULES, PRODUCTIVE BEHAVIORS)
   - Reusable patterns (❌ vs ✅, checklists, progress markers)

3. **Establish benchmarking process**:
   - Define 3-5 representative tasks per agent type
   - Score: autonomy, accuracy, completion, methodology
   - Track: baseline → iteration 1 → iteration 2 → peak

4. **Document lessons learned**:
   - What worked (+X points)
   - What failed (-X points)
   - What patterns are reusable across agents

5. **Build prompt library**:
   - Proven MANDATORY RULES (copy-paste ready)
   - Proven continuation patterns
   - Proven role definitions
   - Proven examples templates

---

## 📚 REFERENCES

### Research Sources (2025):
- **Chain-of-Thought Prompting**: SolutionBrick - "Prompt Engineering and Model Context Protocol"
- **Agentic Prompting Techniques**: Press.ai - "Agentic Prompting for LLMs: The Hype it Deserves"
- **Role-Based Prompting**: Clarifai - "Agentic Prompt Engineering"
- **Reflection Mechanisms**: Medium - "Stop Prompting, Start Designing: 5 Agentic AI Patterns That Actually Work"
- **Contextual Adaptability**: Medium - "Architecting Prompts for Agentic Systems"

### Validated Implementations:
- **claudette-debug v1.0.0**: 718 lines, ~5,300 tokens, 92/100 score (Tier S)
- **claudette-auto v5.2.1**: 475 lines, ~3,500 tokens, 92/100 equivalent (Tier S)

### Campaign Results:
- **Baseline** (v1.0.0 initial): 75/100
- **Peak** (v1.0.0 final): 92/100 (+17 points, +23%)
- **Failure** (v1.4.0): 66/100 (-26 points from peak)
- **Key breakthrough**: Negative prohibitions > Positive framing

---

**Last Updated**: 2025-10-16  
**Version**: 1.2.0  
**Status**: Production Framework  
**Changelog**:  
- v1.2.0: Added 3 Advanced Discipline Principles (Anti-Sycophancy, Self-Audit Mandatory, Clarification Ladder) with research citations; expanded from 7 to 10 core principles
- v1.1.0: Added "Permission-Seeking Anti-Pattern" and "Autonomous Data Collection" patterns; consolidated duplications (~5% reduction)  
**Maintainer**: CVS Health Enterprise AI Team

