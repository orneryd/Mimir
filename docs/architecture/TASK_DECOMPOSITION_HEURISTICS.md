# Task Decomposition Heuristics for PM Agents

**Version**: 1.0.0  
**Date**: 2025-10-20  
**Purpose**: Automated heuristics for PM agents to decompose large discovery/inventory/analysis tasks into manageable subtasks

---

## Overview

Large discovery tasks (inventories, audits, analyses) frequently fail due to:
1. **Output truncation** (>5000 characters)
2. **Tool call budget exhaustion** (>80 tool calls)
3. **Worker confusion** (too many items to track)
4. **Duplicate entries** (lack of systematic approach)

This document provides **automated heuristics** that PM agents should apply during task breakdown to prevent these failures.

---

## Core Principle

**When a task involves discovering/processing N items where N is unknown or large:**
1. **Detect** the task type (inventory, audit, analysis, migration)
2. **Estimate** the scope (file count, line count, entity count)
3. **Decompose** if scope exceeds thresholds
4. **Specify** output format and constraints explicitly
5. **Verify** with deduplication and completeness checks

---

## Detection Patterns

### 1. Inventory Tasks

**Trigger Words**: "inventory", "list all", "enumerate", "catalog", "index"

**Detection Logic**:
```regex
/(inventory|list all|enumerate|catalog|find all|index).*(files?|directories|folders|modules|functions|classes|components|endpoints|routes|dependencies)/i
```

**Examples**:
- "Inventory all documentation files"
- "List all API endpoints in the codebase"
- "Enumerate all React components"
- "Catalog all external dependencies"

**Scope Estimation**:
```bash
# For file inventories
find <target_path> -type f | wc -l

# For code entity inventories
grep -r "export (function|class|const)" <target_path> | wc -l

# For dependency inventories
cat package.json | jq '.dependencies | length'
```

---

### 2. Audit Tasks

**Trigger Words**: "audit", "review all", "check every", "verify all", "validate all"

**Detection Logic**:
```regex
/(audit|review all|check every|verify all|validate all).*(security|dependencies|configurations|settings|permissions|licenses)/i
```

**Examples**:
- "Audit all security configurations"
- "Review all environment variables"
- "Check every API route for authentication"
- "Verify all database migrations"

**Scope Estimation**:
```bash
# For security audits
grep -r "password|token|secret|key" <target_path> | wc -l

# For config audits
find . -name "*.config.*" -o -name ".env*" | wc -l
```

---

### 3. Analysis Tasks

**Trigger Words**: "analyze all", "assess every", "evaluate all", "examine all"

**Detection Logic**:
```regex
/(analyze|assess|evaluate|examine) (all|every).*(performance|complexity|dependencies|imports|exports|patterns)/i
```

**Examples**:
- "Analyze all import statements for circular dependencies"
- "Assess every function for cyclomatic complexity"
- "Evaluate all database queries for N+1 problems"

**Scope Estimation**:
```bash
# For import analysis
grep -r "^import\|^from" <target_path> | wc -l

# For function analysis
grep -r "function\|=>" <target_path> | wc -l
```

---

### 4. Migration Tasks

**Trigger Words**: "migrate all", "convert all", "refactor all", "update all"

**Detection Logic**:
```regex
/(migrate|convert|refactor|update) (all|every).*(from|to).*(version|format|framework|library)/i
```

**Examples**:
- "Migrate all class components to functional components"
- "Convert all JavaScript files to TypeScript"
- "Update all imports from lodash to lodash-es"

**Scope Estimation**:
```bash
# For component migrations
grep -r "class.*extends React.Component" <target_path> | wc -l

# For file type migrations
find <target_path> -name "*.js" | wc -l
```

---

## Decomposition Thresholds

### Threshold Table

| Scope Type | Threshold | Action | Reasoning |
|------------|-----------|--------|-----------|
| **File Count** | >30 files | Split by directory | Worker can handle ~25 files per task without truncation |
| **Code Entities** | >50 items | Split by file or module | Worker can list ~40-50 items with descriptions |
| **Line Count** | >5000 lines | Split by logical sections | Output limit is ~5000 chars, ~50 chars/line avg |
| **Directory Depth** | >3 levels | Split by top-level folders | Deep nesting causes confusion and duplication |
| **Tool Calls** | >60 estimated | Split task in half | Worker has 80 tool call limit, leave 20 for exploration |
| **Dependencies** | >40 packages | Split by category | Group into: runtime, dev, peer, optional |

### Decomposition Strategies

#### Strategy 1: Spatial Decomposition (File/Folder Based)

**When**: Inventory or audit tasks spanning multiple directories

**How**:
```markdown
# Original Task
"Inventory all documentation files in the repository"

# Decomposed Tasks
- task-1.1: Inventory docs/agents/ folder (12 files)
- task-1.2: Inventory docs/architecture/ folder (18 files)
- task-1.3: Inventory docs/research/ folder (15 files)
- task-1.4: Inventory docs/guides/ folder (8 files)
- task-1.5: Inventory docs/results/ folder (6 files)
- task-1.6: Inventory root-level markdown files (5 files)
- task-1.7: Consolidate and deduplicate all inventories
```

**Dependencies**: Tasks 1.1-1.6 → Task 1.7 (parallel → sequential)

---

#### Strategy 2: Categorical Decomposition (Entity Type Based)

**When**: Analysis tasks with multiple entity types

**How**:
```markdown
# Original Task
"Analyze all code exports for unused declarations"

# Decomposed Tasks
- task-2.1: Analyze function exports (estimated 40 functions)
- task-2.2: Analyze class exports (estimated 15 classes)
- task-2.3: Analyze constant exports (estimated 30 constants)
- task-2.4: Analyze type exports (estimated 25 types)
- task-2.5: Cross-reference all exports with imports
- task-2.6: Generate unused exports report
```

**Dependencies**: Tasks 2.1-2.4 → Task 2.5 → Task 2.6

---

#### Strategy 3: Quantitative Decomposition (Batch Processing)

**When**: Large uniform datasets (e.g., 200 files of same type)

**How**:
```markdown
# Original Task
"Migrate all 120 JavaScript files to TypeScript"

# Decomposed Tasks
- task-3.1: Migrate files 1-20 (src/components/A*.js to K*.js)
- task-3.2: Migrate files 21-40 (src/components/L*.js to P*.js)
- task-3.3: Migrate files 41-60 (src/components/Q*.js to Z*.js)
- task-3.4: Migrate files 61-80 (src/utils/*)
- task-3.5: Migrate files 81-100 (src/services/*)
- task-3.6: Migrate files 101-120 (src/hooks/* and src/contexts/*)
- task-3.7: Verify all migrations and update import paths
```

**Dependencies**: Tasks 3.1-3.6 (parallel) → Task 3.7

---

#### Strategy 4: Hierarchical Decomposition (Complexity Based)

**When**: Tasks with natural parent-child relationships

**How**:
```markdown
# Original Task
"Audit all API security configurations"

# Decomposed Tasks
- task-4.1: Audit authentication layer
  - task-4.1.1: Check JWT configuration
  - task-4.1.2: Verify OAuth2 setup
  - task-4.1.3: Review session management
- task-4.2: Audit authorization layer
  - task-4.2.1: Check RBAC implementation
  - task-4.2.2: Verify permission checks
  - task-4.2.3: Review resource access controls
- task-4.3: Audit data validation
  - task-4.3.1: Check input sanitization
  - task-4.3.2: Verify output encoding
  - task-4.3.3: Review SQL injection prevention
- task-4.4: Consolidate findings and prioritize vulnerabilities
```

**Dependencies**: Complex tree structure with task-4.4 as final consolidation

---

## Output Format Specification

### Format Templates by Task Type

#### Template 1: File Inventory

```markdown
## Output Format (MANDATORY)

### Folder: <folder_path>/
- **<filename1>** - <one-sentence description>
- **<filename2>** - <one-sentence description>
- **<filename3>** - <one-sentence description>
...
**Total Files**: <count>

### Folder: <folder_path2>/
...

## Constraints
- Use structured sections (NOT tables)
- Each file listed exactly once
- Maximum 5000 characters total
- If >30 files in folder, summarize: "<count> files covering <topics>"

## Example
### Folder: src/components/
- **Button.tsx** - Reusable button component with variant support
- **Input.tsx** - Form input with validation and error display
- **Modal.tsx** - Accessible modal dialog component
...
**Total Files**: 12
```

---

#### Template 2: Code Entity Analysis

```markdown
## Output Format (MANDATORY)

### File: <file_path>

**Exports**:
- `<entityName>` (type: <function|class|const>) - <purpose>
- `<entityName>` (type: <function|class|const>) - <purpose>

**Imports**:
- From: `<module>` - Used for: <purpose>

**Issues Found**: <count>
- Issue 1: <description>
- Issue 2: <description>

## Constraints
- Maximum 3 files per task
- Each entity with type and purpose
- Issues list capped at 10 per file
- Use code blocks for examples

## Example
### File: src/auth/AuthService.ts

**Exports**:
- `login` (function) - Authenticates user with email/password
- `logout` (function) - Clears session and redirects to login
- `AuthService` (class) - Main authentication service

**Imports**:
- From: `jsonwebtoken` - Used for: JWT token generation/validation

**Issues Found**: 1
- Hardcoded secret key on line 45 (security risk)
```

---

#### Template 3: Audit Results

```markdown
## Output Format (MANDATORY)

### Category: <security|performance|maintainability>

**Items Checked**: <count>
**Issues Found**: <count>
**Severity**: <Critical|High|Medium|Low>

**Findings**:
1. **<Issue Title>** (Severity: <level>)
   - Location: <file:line>
   - Problem: <one-sentence description>
   - Fix: <one-sentence recommendation>

2. **<Issue Title>** (Severity: <level>)
   ...

## Constraints
- Maximum 10 findings per category
- Sort by severity (Critical → Low)
- Each finding with location, problem, fix
- Use severity labels consistently

## Example
### Category: Security

**Items Checked**: 15
**Issues Found**: 3
**Severity**: Critical

**Findings**:
1. **Hardcoded API Keys** (Severity: Critical)
   - Location: src/config/api.ts:12
   - Problem: API keys committed to repository
   - Fix: Move to environment variables with .env.example template
```

---

## Verification Criteria Enhancement

### Standard Criteria for All Discovery Tasks

```markdown
## Verification Criteria (QC Agent)

### Completeness
- [ ] All required categories/folders/entities covered
- [ ] File/entity counts match actual filesystem/codebase
- [ ] No placeholder text or "TODO" entries
- [ ] Summary statistics provided (total count, by category)

### Accuracy
- [ ] No hallucinated files, functions, or entities
- [ ] File paths are valid and accessible
- [ ] Descriptions match actual file/entity content
- [ ] No outdated or stale information

### Deduplication
- [ ] No duplicate file paths
- [ ] No duplicate entity names within same scope
- [ ] Cross-references clearly marked (not duplicated)
- [ ] Consolidation task properly merges subtask outputs

### Format Compliance
- [ ] Uses specified output format (NOT tables for >20 items)
- [ ] Output length < 5000 characters
- [ ] Markdown formatting correct (headings, lists, code blocks)
- [ ] Consistent naming and capitalization

### Technical Quality
- [ ] File/entity descriptions are accurate and specific
- [ ] Issues/findings have severity labels
- [ ] Recommendations are actionable and specific
- [ ] No vague language ("some files", "various issues")
```

---

## Automated Decomposition Algorithm

### Pseudocode for PM Agent

```python
def decompose_discovery_task(task_description: str, context: dict) -> list[Task]:
    """
    Automatically decompose large discovery tasks into manageable subtasks
    """
    
    # Step 1: Detect task type
    task_type = detect_task_type(task_description)
    if task_type not in ['inventory', 'audit', 'analysis', 'migration']:
        return [task_description]  # No decomposition needed
    
    # Step 2: Estimate scope
    scope = estimate_scope(task_description, context)
    
    # Step 3: Check thresholds
    if scope['file_count'] <= 30 and scope['estimated_tool_calls'] <= 60:
        # Small enough for single task - add output format template
        return [enhance_with_template(task_description, task_type)]
    
    # Step 4: Choose decomposition strategy
    strategy = choose_strategy(task_type, scope)
    
    # Step 5: Generate subtasks
    subtasks = []
    
    if strategy == 'spatial':
        # Split by directory
        folders = list_top_level_folders(scope['target_path'])
        for folder in folders:
            file_count = count_files(folder)
            if file_count > 0:
                subtask = create_subtask(
                    f"Inventory {folder}/ folder ({file_count} files)",
                    template=get_template(task_type),
                    constraints={'max_chars': 5000, 'format': 'structured_sections'}
                )
                subtasks.append(subtask)
        
        # Add consolidation task
        consolidation = create_subtask(
            "Consolidate and deduplicate all inventories",
            dependencies=[t.id for t in subtasks],
            template=get_consolidation_template(task_type)
        )
        subtasks.append(consolidation)
    
    elif strategy == 'categorical':
        # Split by entity type
        categories = detect_categories(task_description, scope)
        for category in categories:
            entity_count = estimate_entity_count(category, scope)
            subtask = create_subtask(
                f"Analyze {category} exports (estimated {entity_count} items)",
                template=get_template(task_type),
                constraints={'max_entities': 50}
            )
            subtasks.append(subtask)
        
        # Add cross-reference task
        cross_ref = create_subtask(
            "Cross-reference all entities and generate report",
            dependencies=[t.id for t in subtasks]
        )
        subtasks.append(cross_ref)
    
    elif strategy == 'quantitative':
        # Split into batches
        batch_size = 20  # Files per batch
        total_items = scope['file_count']
        num_batches = (total_items + batch_size - 1) // batch_size
        
        for i in range(num_batches):
            start = i * batch_size + 1
            end = min((i + 1) * batch_size, total_items)
            subtask = create_subtask(
                f"Process items {start}-{end} ({task_description})",
                template=get_template(task_type),
                constraints={'batch_start': start, 'batch_end': end}
            )
            subtasks.append(subtask)
        
        # Add verification task
        verification = create_subtask(
            "Verify all batches processed and consolidate results",
            dependencies=[t.id for t in subtasks]
        )
        subtasks.append(verification)
    
    # Step 6: Add verification criteria to all subtasks
    for subtask in subtasks:
        subtask.verification_criteria = get_verification_criteria(task_type)
    
    return subtasks


def choose_strategy(task_type: str, scope: dict) -> str:
    """Choose best decomposition strategy based on task characteristics"""
    
    if scope['has_directory_structure']:
        return 'spatial'
    
    elif scope['has_multiple_entity_types']:
        return 'categorical'
    
    elif scope['uniform_items'] and scope['file_count'] > 60:
        return 'quantitative'
    
    elif scope['hierarchical_complexity']:
        return 'hierarchical'
    
    else:
        return 'spatial'  # Default fallback
```

---

## Implementation Checklist

### For PM Agent Preamble

- [ ] Add task decomposition heuristics to PM agent instructions
- [ ] Include detection patterns for inventory/audit/analysis/migration tasks
- [ ] Provide threshold table for automatic decomposition
- [ ] Include output format templates for each task type
- [ ] Add verification criteria enhancement logic
- [ ] Include pseudocode/examples for decomposition strategies

### For Task Executor

- [ ] Add scope estimation tools (file count, entity count)
- [ ] Implement automatic task splitting based on thresholds
- [ ] Create template injection system for subtasks
- [ ] Add consolidation task generation for parallel subtasks
- [ ] Implement deduplication verification in QC agent

### For Documentation

- [ ] Document decomposition patterns in AGENTS.md
- [ ] Create examples for each strategy type
- [ ] Add troubleshooting guide for large task failures
- [ ] Update PM agent preamble with new heuristics

---

## Examples

### Example 1: File Inventory (Spatial Decomposition)

**Original Task**:
```markdown
Inventory all documentation files in the repository
```

**Scope Estimation**:
```bash
$ find docs/ -type f -name "*.md" | wc -l
87
```

**Threshold Check**: 87 files > 30 → **DECOMPOSE**

**Generated Subtasks**:
```markdown
task-1.1: Inventory docs/agents/ folder (12 files)
task-1.2: Inventory docs/architecture/ folder (18 files)
task-1.3: Inventory docs/research/ folder (15 files)
task-1.4: Inventory docs/guides/ folder (8 files)
task-1.5: Inventory docs/results/ folder (6 files)
task-1.6: Inventory docs/benchmarks/ folder (4 files)
task-1.7: Inventory docs/configuration/ folder (7 files)
task-1.8: Inventory root-level markdown files (17 files)
task-1.9: Consolidate and deduplicate all inventories
```

**Dependencies**: Tasks 1.1-1.8 (parallel) → Task 1.9

---

### Example 2: Code Analysis (Categorical Decomposition)

**Original Task**:
```markdown
Analyze all exports in src/ for circular dependencies
```

**Scope Estimation**:
```bash
$ grep -r "^export" src/ | wc -l
143
```

**Threshold Check**: 143 entities > 50 → **DECOMPOSE**

**Generated Subtasks**:
```markdown
task-2.1: Analyze function exports in src/ (est. 60 functions)
task-2.2: Analyze class exports in src/ (est. 25 classes)
task-2.3: Analyze type/interface exports in src/ (est. 40 types)
task-2.4: Analyze constant exports in src/ (est. 18 constants)
task-2.5: Build dependency graph from all exports
task-2.6: Detect circular dependencies and generate report
```

**Dependencies**: Tasks 2.1-2.4 → Task 2.5 → Task 2.6

---

### Example 3: Migration (Quantitative Decomposition)

**Original Task**:
```markdown
Migrate all 95 class components to functional components with hooks
```

**Scope Estimation**:
```bash
$ grep -r "class.*extends React.Component" src/ | wc -l
95
```

**Threshold Check**: 95 components / 20 per batch = 5 batches → **DECOMPOSE**

**Generated Subtasks**:
```markdown
task-3.1: Migrate components 1-20 (src/components/A*.tsx - src/components/E*.tsx)
task-3.2: Migrate components 21-40 (src/components/F*.tsx - src/components/M*.tsx)
task-3.3: Migrate components 41-60 (src/components/N*.tsx - src/components/S*.tsx)
task-3.4: Migrate components 61-80 (src/components/T*.tsx - src/components/Z*.tsx)
task-3.5: Migrate components 81-95 (src/containers/* and src/views/*)
task-3.6: Verify all migrations, update tests, and validate hooks usage
```

**Dependencies**: Tasks 3.1-3.5 (parallel) → Task 3.6

---

## Conclusion

These heuristics enable PM agents to **automatically detect and decompose** large discovery tasks, preventing the common failure modes:

✅ **No output truncation** (subtasks stay under 5000 chars)  
✅ **No tool call exhaustion** (each subtask < 60 tool calls)  
✅ **No duplicate entries** (spatial/categorical separation)  
✅ **Clear consolidation** (explicit merge/dedup tasks)  
✅ **Verified completeness** (enhanced QC criteria)

**Next Step**: Implement these heuristics in the PM agent preamble and task executor.

---

**Last Updated**: 2025-10-20  
**Status**: Ready for Implementation  
**Maintainer**: Mimir Multi-Agent System
