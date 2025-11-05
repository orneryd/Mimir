# PM Agent Contradiction Analysis

**Date:** 2025-10-22  
**Issue:** Task-1.1 failure due to contradictory requirements  
**Root Cause:** PM agent created impossible success criteria  

---

## 🔍 PROBLEM SUMMARY

The PM agent created task-1.1 with **fundamentally contradictory requirements**:

1. **Prompt (line 132):** "List all files and directories in the current directory using the `list_dir` tool."
2. **Success Criteria (line 147):** "Output matches the result of `ls -la`"
3. **Reality:** `list_dir` tool **cannot** match `ls -la` output (no hidden file support)

**Result:** Worker agent executed correctly but failed QC because the task requirements were impossible.

---

## 📊 EXECUTION EVIDENCE

### Task-1.1 Execution Results

**Worker Output:**
```json
{
  "list_dir_output": ["bin/", "build/", "coverage/", ...],
  "ls_la_output": "total 824\ndrwxrwxr-x@ 44 c815719 staff 1408 Oct 22 07:40 .\n...\ndrwxr-xr-x@ 4 c815719 staff 128 Oct 20 06:41 .agents\n...",
  "notes": "The `list_dir` tool does NOT include hidden files (dotfiles), as shown by comparison with the authoritative `ls -la` output."
}
```

**QC Feedback (Score: 50/100):**
- ❌ Issue 1: Hidden files missing from `list_dir` output
- ❌ Issue 2: Output doesn't match `ls -la` results
- ❌ Issue 3: Worker used wrong tool to meet requirements

**Required Fixes:**
1. Use `run_terminal_cmd('ls -la')` instead of `list_dir`
2. Store `ls -la` output as authoritative listing
3. Document that `list_dir` doesn't include hidden files

### Analysis

**Worker Agent:** ✅ Performed correctly
- Followed explicit instruction to use `list_dir`
- Ran `ls -la` for cross-verification
- **Explicitly documented the tool limitation**

**QC Agent:** ✅ Performed correctly
- Identified the discrepancy
- Provided root cause analysis
- Recommended the correct fix

**PM Agent:** ❌ Created impossible requirements
- Mandated use of `list_dir` tool
- Required output to match `ls -la`
- Did not account for tool limitations

---

## 🔎 ROOT CAUSE ANALYSIS

### 1. Missing Tool Capability Documentation

**Current State:**
- PM preamble does NOT document tool limitations
- No reference guide for tool capabilities
- PM agent must infer tool behavior from general knowledge

**Evidence from PM Preamble:**
```markdown
## 📚 KNOWLEDGE ACCESS MODE
**Mode:** Hybrid (Context + General Knowledge)

**Required Context Gathering:**
1. read_file('package.json') - Check dependencies and scripts
2. read_file('README.md') - Understand project purpose
3. list_dir('.') - Survey project structure
4. grep('test', '.', type: 'js') - Find testing patterns
5. read_file('[relevant-config]') - Check configuration
```

**Problem:** No step to "verify tool capabilities and limitations"

### 2. No Anti-Pattern for Tool Mismatches

**Current Anti-Patterns (v2.0):**
1. Vague task descriptions
2. Missing dependencies
3. Unmeasurable success criteria
4. Generic role descriptions
5. No tool call estimates
6. Skipping task-0
7. Monolithic tasks
8. Code generation tasks
9. Duplicate dependencies
10. Self-reference dependencies
11. No dependencies when needed

**Missing:** Anti-pattern for "Contradictory Tool Requirements"

### 3. Task-0 Template Doesn't Validate Tool Capabilities

**Current Task-0 Template (lines 260-321):**
```markdown
**Required Validations:**

1. **Tool Availability:**
   - Execute: `run_terminal_cmd('which node')`
   - Execute: `run_terminal_cmd('which npm')`
   - Expected: Paths to executables

2. **Dependencies:**
   - Execute: `run_terminal_cmd('npm list --depth=0')`
   - Expected: All package.json dependencies listed

3. **Build System:**
   - Execute: `run_terminal_cmd('npm run build')`
   - Expected: Exit code 0, no errors

4. **Configuration Files:**
   - Execute: `read_file('package.json')`
   - Execute: `read_file('[required-config-file]')`
   - Expected: Files exist with valid content
```

**Problem:** Validates system tools, but not MCP tool capabilities (e.g., "does `list_dir` support hidden files?")

### 4. Success Criteria Guidelines Don't Address Tool Limitations

**Current Guidelines (lines 186-217):**
```markdown
**Success Criteria Pattern:**
- [ ] Specific: [Exact file, exact command, exact output]
- [ ] Measurable: [Number, percentage, boolean]
- [ ] Achievable: [Within worker's capabilities]
- [ ] Relevant: [Directly tied to requirement]
- [ ] Testable: [Can be verified with tool command]
```

**Problem:** "Achievable" is mentioned but not enforced. No guidance on "verify tool can actually produce required output."

---

## 🛠️ PROPOSED SOLUTIONS

### Solution 1: Add Tool Capability Reference to PM Preamble

**Location:** `docs/agents/v2/01-pm-preamble.md` (after line 471)

**New Section:**
```markdown
## 🔧 TOOL CAPABILITIES & LIMITATIONS

**CRITICAL:** Before creating tasks, understand what each tool CAN and CANNOT do.

### Filesystem Tools

**`list_dir(path)`**
- ✅ Lists files and directories in a path
- ✅ Returns structured array of names
- ❌ Does NOT include hidden files (dotfiles like `.git`, `.env`)
- ❌ Does NOT include file metadata (permissions, size, dates)
- **Use When:** You need a simple list of visible files
- **Don't Use When:** You need hidden files or file metadata

**`run_terminal_cmd('ls -la')`**
- ✅ Lists ALL files including hidden files
- ✅ Includes full metadata (permissions, size, owner, dates)
- ✅ Supports all `ls` flags and options
- ❌ Returns unstructured string output
- **Use When:** You need complete directory listing with metadata
- **Don't Use When:** You need structured/parseable output

**`read_file(path)`**
- ✅ Reads file contents
- ✅ Supports text files of any size
- ❌ Does NOT list directory contents
- ❌ Does NOT support binary files
- **Use When:** You need file contents
- **Don't Use When:** You need directory listing

### Graph Tools

**`memory_search_nodes(query, options)`**
- ✅ Full-text search across all node properties
- ✅ Case-insensitive search with `toLower()`
- ✅ Filter by node types
- ❌ Requires exact substring match (CONTAINS operator)
- ❌ Does NOT support fuzzy matching or word boundaries
- **Use When:** You know exact keywords or phrases
- **Don't Use When:** You need fuzzy search or multi-word queries

### Terminal Tools

**`run_terminal_cmd(command)`**
- ✅ Executes any shell command
- ✅ Returns stdout, stderr, exit code
- ✅ Supports pipes, redirects, and complex commands
- ❌ Requires command to be installed on system
- ❌ May have different behavior across OS (Linux vs macOS vs Windows)
- **Use When:** You need system-level operations
- **Don't Use When:** Structured MCP tools exist for the task

### Rule: Verify Tool Compatibility

**Before creating success criteria:**
1. Identify which tool the prompt mandates
2. Identify what the success criteria requires
3. Verify the tool can actually produce that output
4. If mismatch: Either change the tool OR change the criteria

**Example:**
```markdown
❌ BAD:
**Prompt:** Use `list_dir` to list files
**Success Criteria:** Output matches `ls -la` results
**Problem:** `list_dir` cannot match `ls -la` (no hidden files)

✅ GOOD Option 1 (Change Tool):
**Prompt:** Use `run_terminal_cmd('ls -la')` to list files
**Success Criteria:** Output includes all files including hidden files

✅ GOOD Option 2 (Change Criteria):
**Prompt:** Use `list_dir` to list files
**Success Criteria:** Output includes all visible files (hidden files excluded)
```
```

### Solution 2: Add Anti-Pattern 12 - Contradictory Tool Requirements

**Location:** `docs/agents/v2/01-pm-preamble.md` (after line 565)

**New Anti-Pattern:**
```markdown
### Anti-Pattern 12: Contradictory Tool Requirements ⚠️ CRITICAL
```markdown
❌ BAD:
**Prompt:** Use `list_dir` to list all files
**Success Criteria:** Output matches `ls -la` results
**Problem:** `list_dir` cannot include hidden files, so it can never match `ls -la`

✅ GOOD:
**Prompt:** Use `run_terminal_cmd('ls -la')` to list all files including hidden files
**Success Criteria:** Output includes hidden files (files starting with '.')

OR

**Prompt:** Use `list_dir` to list visible files
**Success Criteria:** Output includes all non-hidden files
**Context:** Hidden files are excluded by design (use `ls -la` for complete listing)
```

**Rule:** The tool specified in the prompt MUST be capable of satisfying the success criteria. Verify tool capabilities before creating tasks.
```
```

### Solution 3: Enhance Task-0 Template with Tool Capability Validation

**Location:** `docs/agents/v2/01-pm-preamble.md` (lines 278-297)

**Enhanced Task-0 Template:**
```markdown
**Required Validations:**

1. **Tool Availability:**
   - Execute: `run_terminal_cmd('which [required-tool]')`
   - Expected: Paths to executables

2. **MCP Tool Capabilities:** ⭐ NEW
   - Execute: `list_dir('.')`
   - Execute: `run_terminal_cmd('ls -la')`
   - Compare: Document differences (hidden files, metadata)
   - Expected: Understand tool limitations for task planning

3. **Dependencies:**
   - Execute: `run_terminal_cmd('npm list --depth=0')`
   - Expected: All package.json dependencies listed

4. **Build System:**
   - Execute: `run_terminal_cmd('npm run build')`
   - Expected: Exit code 0, no errors

5. **Configuration Files:**
   - Execute: `read_file('package.json')`
   - Execute: `read_file('[required-config-file]')`
   - Expected: Files exist with valid content
```

### Solution 4: Add Verification Step to Final Checklist

**Location:** `docs/agents/v2/01-pm-preamble.md` (line 488, before "If ANY checkbox is unchecked")

**New Checklist Item:**
```markdown
- [ ] Did you verify tool capabilities match success criteria (no contradictions)?
```

### Solution 5: Add Tool Compatibility Check to STEP 5 (Success Criteria)

**Location:** `docs/agents/v2/01-pm-preamble.md` (after line 217)

**New Subsection:**
```markdown
### Tool Compatibility Verification

**CRITICAL:** Before finalizing success criteria, verify the specified tool can satisfy them.

**Verification Process:**
1. Identify tool mandated in prompt: `[tool_name]`
2. Identify required output in success criteria: `[expected_output]`
3. Check tool capabilities reference (see Tool Capabilities section)
4. Verify: Can `[tool_name]` produce `[expected_output]`?
5. If NO: Either change tool OR change criteria

**Example:**
```markdown
Task Prompt: "Use list_dir to list all files"
Success Criteria: "Output matches ls -la results"

Verification:
1. Tool: list_dir
2. Expected: matches ls -la (includes hidden files)
3. Capability: list_dir does NOT support hidden files
4. Result: ❌ CONTRADICTION DETECTED

Fix Option 1 (Change Tool):
Task Prompt: "Use run_terminal_cmd('ls -la') to list all files"
Success Criteria: "Output includes all files including hidden files"

Fix Option 2 (Change Criteria):
Task Prompt: "Use list_dir to list all files"
Success Criteria: "Output includes all visible files (hidden files excluded)"
Context: "Note: list_dir does not include hidden files by design"
```
```

---

## 📈 IMPACT ASSESSMENT

### Current Failure Pattern

**Execution 1 (from execution-report.md):**
- Task-0: ✅ Success (100 score)
- Task-0 (duplicate): ✅ Success (100 score)
- Task-1.1: ❌ Failure (50 score) - Tool limitation

**Execution 2 (latest):**
- Task-0: ✅ Success (100 score)
- Task-0 (duplicate): ✅ Success (100 score)
- Task-1.1: ❌ Failure (50 score) - Same tool limitation

**Pattern:** 100% failure rate on task-1.1 due to PM planning error, not worker or QC error.

### Expected Impact of Solutions

**With Tool Capability Reference:**
- PM agent would know `list_dir` doesn't support hidden files
- Would either mandate `ls -la` OR adjust success criteria
- Estimated failure reduction: 80-90%

**With Anti-Pattern 12:**
- PM agent would recognize contradiction pattern
- Would verify tool-criteria compatibility
- Estimated failure reduction: 70-80%

**With Enhanced Task-0:**
- Workers would document tool limitations upfront
- PM agent would have tool capability data for planning
- Estimated failure reduction: 60-70%

**Combined Impact:**
- Estimated failure reduction: 95%+
- Remaining 5%: Novel tool limitations not yet documented

---

## 🎯 IMPLEMENTATION PRIORITY

### Phase 1: Immediate (High Impact, Low Effort)

1. ✅ **Add Anti-Pattern 12** to PM preamble (5 minutes)
2. ✅ **Add checklist item** for tool compatibility (2 minutes)

### Phase 2: Short-Term (High Impact, Medium Effort)

3. ✅ **Add Tool Capabilities Reference** to PM preamble (30 minutes)
4. ✅ **Add Tool Compatibility Verification** to STEP 5 (15 minutes)

### Phase 3: Medium-Term (Medium Impact, High Effort)

5. ⏳ **Enhance Task-0 Template** with MCP tool validation (20 minutes)
6. ⏳ **Create standalone tool reference doc** (1 hour)

### Phase 4: Long-Term (Systemic Improvements)

7. ⏳ **Add automated tool-criteria validation** to task executor (2-3 hours)
8. ⏳ **Create tool capability test suite** (4-5 hours)

---

## 📝 RECOMMENDED ACTIONS

### Immediate Actions (Today)

1. Update `docs/agents/v2/01-pm-preamble.md`:
   - Add Anti-Pattern 12 (Contradictory Tool Requirements)
   - Add tool compatibility checklist item
   - Add Tool Compatibility Verification subsection to STEP 5

2. Regenerate PM agent for next execution:
   - Delete old PM preamble cache (if exists)
   - Force regeneration with updated template

### Short-Term Actions (This Week)

3. Create `docs/reference/TOOL_CAPABILITIES.md`:
   - Document all MCP tools
   - List capabilities and limitations
   - Provide usage guidelines
   - Include examples of correct/incorrect usage

4. Update PM preamble to reference tool capabilities doc:
   - Add link to reference doc
   - Mandate reading before task creation

### Medium-Term Actions (This Month)

5. Add automated validation to `task-executor.ts`:
   - Parse task prompt for tool mentions
   - Parse success criteria for expected outputs
   - Cross-reference against tool capability database
   - Warn if potential contradiction detected

6. Create tool capability test suite:
   - Test each tool's actual behavior
   - Document edge cases and limitations
   - Update reference doc with findings

---

## 🔬 LESSONS LEARNED

### What Worked

1. ✅ **Worker agents correctly identified tool limitations**
   - Documented in output notes
   - Provided comparison between tools
   - Recommended correct approach

2. ✅ **QC agents correctly identified contradictions**
   - Root cause analysis was accurate
   - Required fixes were specific and actionable
   - Feedback was clear and directive

3. ✅ **Task-0 environment validation succeeded**
   - System-level validation worked perfectly
   - Tool availability checks passed
   - Foundation was solid

### What Didn't Work

1. ❌ **PM agent created impossible requirements**
   - No awareness of tool limitations
   - No verification of tool-criteria compatibility
   - Assumed tools were interchangeable

2. ❌ **No tool capability reference available**
   - PM agent had to infer from general knowledge
   - No authoritative source for tool limitations
   - Led to incorrect assumptions

3. ❌ **No anti-pattern for contradictory requirements**
   - PM preamble didn't warn against this
   - No checklist item to catch it
   - Pattern repeated across multiple executions

### Key Insight

**The failure was NOT in execution, but in planning.**

- Workers executed correctly
- QC validated correctly
- PM planned incorrectly

**Solution:** Improve PM planning guidance, not worker/QC templates.

---

## 📊 SUCCESS METRICS

### Current Metrics (Before Improvements)

- Task-0 success rate: 100% (4/4)
- Task-1.1 success rate: 0% (0/2)
- Overall success rate: 66% (4/6)
- PM planning accuracy: 50% (1/2 tasks planned correctly)

### Target Metrics (After Improvements)

- Task-0 success rate: >95%
- Task-1.1+ success rate: >80%
- Overall success rate: >85%
- PM planning accuracy: >90%

### Measurement Plan

1. Run 10 test executions with updated PM preamble
2. Track task success rates by type
3. Analyze failure patterns for new contradictions
4. Iterate on tool capability documentation
5. Achieve >90% success rate before declaring complete

---

**Status:** ✅ Analysis Complete  
**Next Step:** Implement Phase 1 improvements to PM preamble  
**Owner:** Mimir Development Team  
**Target Date:** 2025-10-22 (Today)
