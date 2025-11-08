# Historical Tracking System for Task Orchestration

## 🎯 Design Goal
**Track every single task execution with complete historical context, failure analysis, and success patterns.**

## ✅ Implementation Complete

### 1. Globally Unique Task IDs
**Problem Solved:** Tasks with same logical ID (e.g., `task-1.1`) from different orchestrations were creating duplicates.

**Solution:**
```python
# Make task IDs globally unique
task['id'] = f"{orchestration_id}-{task['id']}"  
# Example: "orchestration-1730923456-task-1.1"

# Keep original for display
task['original_id'] = task['id']  # "task-1.1"
```

**Benefits:**
- ✅ Every execution creates a new node
- ✅ No duplicates or overwrites
- ✅ Complete historical record
- ✅ Can query all attempts at `task-1.1` across time

### 2. Enhanced Todo Node Schema
```cypher
(:todo {
  // Unique identifiers
  id: "orchestration-1730923456-task-1.1",
  originalTaskId: "task-1.1",
  orchestrationId: "orchestration-1730923456",
  
  // Task metadata
  type: "todo",
  title: "Task title",
  description: "Task prompt",
  status: "completed" | "failed" | "pending" | "worker_executing" | "qc_executing",
  priority: "medium",
  
  // Agent roles
  workerRole: "Worker agent role description",
  qcRole: "QC agent role description",
  verificationCriteria: "QC criteria",
  
  // Execution tracking
  dependencies: ["task-0"],
  parallelGroup: 1,
  attemptNumber: 2,
  maxRetries: 2,
  createdAt: datetime,
  
  // Worker output (Phase 3)
  workerOutput: "Full output (50k char limit)",
  workerCompletedAt: datetime,
  
  // QC results (Phase 6)
  qcScore: 95,
  qcPassed: true,
  qcFeedback: "QC feedback",
  qcIssues: ["issue1"],
  qcRequiredFixes: ["fix1"],
  qcCompletedAt: datetime,
  qcAttemptNumber: 2,
  
  // Final metrics (Phase 8/9)
  verifiedAt: datetime,
  totalAttempts: 2,
  qcPassedOnAttempt: 2,
  // OR for failures:
  totalQCFailures: 3,
  improvementNeeded: true,
  failedAt: datetime,
  qcFailureReport: "Error details",
  qcAttemptMetrics: "{...}"  // JSON
})
```

### 3. Success Analysis Nodes (NEW!)
**For every successful task:**

```cypher
// Success analysis node
(:memory {
  id: "orchestration-1730923456-task-1.1-success-1730923789",
  type: "memory",
  category: "success_analysis",
  title: "Success Analysis: QC Score 95/100",
  content: "## Success Summary\n**QC Score:** 95/100\n**Attempts:** 2\n...",
  taskId: "orchestration-1730923456-task-1.1",
  qcScore: 95,
  totalAttempts: 2,
  passedOnAttempt: 2,
  createdAt: datetime
})

// Success factors (extracted from QC feedback)
(:memory {
  id: "orchestration-1730923456-task-1.1-factor-123",
  type: "memory",
  category: "success_factor",
  title: "Success Factor",
  content: "Well-structured output",
  taskId: "orchestration-1730923456-task-1.1",
  createdAt: datetime
})

// Relationships
(:todo)-[:has_success_analysis]->(:memory {category: "success_analysis"})
(:memory {category: "success_analysis"})-[:identified_factor]->(:memory {category: "success_factor"})
```

**Success Factors Extracted:**
- Well-structured output
- Comprehensive coverage
- Accurate information
- Clear communication
- Complete requirements coverage
- Succeeded on first attempt / Improved through N iterations
- Quality tier (Exceptional >= 95, High >= 85, Acceptable >= 80)

### 4. Failure Analysis Nodes (NEW!)
**For every failed task:**

```cypher
// Failure analysis node
(:memory {
  id: "orchestration-1730923456-task-1.1-failure-1730923789",
  type: "memory",
  category: "failure_analysis",
  title: "Failure Analysis: QC failed after 3 attempts",
  content: "## Failure Summary\n**Error:** QC failed...\n**QC Score:** 65/100\n...",
  taskId: "orchestration-1730923456-task-1.1",
  qcScore: 65,
  totalAttempts: 3,
  createdAt: datetime
})

// Suggested fixes (extracted from QC feedback)
(:memory {
  id: "orchestration-1730923456-task-1.1-fix-456",
  type: "memory",
  category: "suggested_fix",
  title: "Suggested Fix",
  content: "Add explicit endpoint references",
  taskId: "orchestration-1730923456-task-1.1",
  createdAt: datetime
})

// Relationships
(:todo)-[:has_failure_analysis]->(:memory {category: "failure_analysis"})
(:memory {category: "failure_analysis"})-[:suggests_fix]->(:memory {category: "suggested_fix"})
```

**Failure Data Captured:**
- Error message
- QC score
- Total attempts
- QC feedback (full text)
- Suggested fixes (extracted from QC history)
- Recommended actions

### 5. TodoList Schema (Enhanced)
```cypher
(:todoList {
  id: "todoList-orchestration-1730923456",
  type: "todoList",
  orchestrationId: "orchestration-1730923456",
  title: "Orchestration: User request...",
  description: "Multi-agent orchestration run for: ...",
  archived: false,
  priority: "high",
  createdAt: datetime
})

// Relationships
(:todoList)-[:contains]->(:todo)
```

### 6. Complete Graph Structure

```
┌─────────────┐
│  todoList   │ (orchestration run)
└──────┬──────┘
       │ :contains
       ↓
┌─────────────┐
│    todo     │ (task instance)
└──────┬──────┘
       │ :depends_on
       ├──────────────────────┐
       │                      ↓
       │              ┌─────────────┐
       │              │    todo     │ (dependency)
       │              └─────────────┘
       │
       │ :has_success_analysis (if succeeded)
       ↓
┌─────────────────────┐
│ memory              │
│ (success_analysis)  │
└──────┬──────────────┘
       │ :identified_factor
       ↓
┌─────────────────────┐
│ memory              │
│ (success_factor)    │
└─────────────────────┘

       │ :has_failure_analysis (if failed)
       ↓
┌─────────────────────┐
│ memory              │
│ (failure_analysis)  │
└──────┬──────────────┘
       │ :suggests_fix
       ↓
┌─────────────────────┐
│ memory              │
│ (suggested_fix)     │
└─────────────────────┘
```

## 📊 Query Examples

### Historical Analysis

```cypher
// Get all attempts at a specific task across orchestrations
MATCH (t:todo)
WHERE t.originalTaskId = 'task-1.1'
RETURN t.id, t.orchestrationId, t.status, t.qcScore, t.createdAt
ORDER BY t.createdAt DESC

// Success rate for a task type
MATCH (t:todo)
WHERE t.originalTaskId = 'task-1.1'
RETURN 
  count(t) as total,
  sum(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as succeeded,
  sum(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) as failed,
  avg(t.qcScore) as avg_qc_score

// Get all success factors for a task type
MATCH (t:todo)-[:has_success_analysis]->(s:memory)-[:identified_factor]->(f:memory)
WHERE t.originalTaskId = 'task-1.1' AND t.status = 'completed'
RETURN f.content as factor, count(*) as frequency
ORDER BY frequency DESC

// Get all failure patterns
MATCH (t:todo)-[:has_failure_analysis]->(fa:memory)-[:suggests_fix]->(fix:memory)
WHERE t.originalTaskId = 'task-1.1' AND t.status = 'failed'
RETURN fa.content as failure_analysis, collect(fix.content) as suggested_fixes
ORDER BY t.createdAt DESC

// Compare orchestration runs
MATCH (tl:todoList)-[:contains]->(t:todo)
RETURN 
  tl.id,
  tl.createdAt,
  count(t) as total_tasks,
  sum(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
  sum(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) as failed,
  avg(t.qcScore) as avg_qc_score
ORDER BY tl.createdAt DESC

// Get worker output for failed task
MATCH (t:todo {id: 'orchestration-1730923456-task-1.1'})
RETURN t.workerOutput, t.qcFeedback, t.qcFailureReport

// Find similar successful tasks for learning
MATCH (t1:todo {id: 'orchestration-1730923456-task-1.1', status: 'failed'})
MATCH (t2:todo {originalTaskId: t1.originalTaskId, status: 'completed'})
MATCH (t2)-[:has_success_analysis]->(s:memory)-[:identified_factor]->(f:memory)
RETURN t2.id, t2.qcScore, collect(f.content) as success_factors
ORDER BY t2.qcScore DESC
LIMIT 5
```

### Learning from History

```cypher
// What makes task-1.1 succeed?
MATCH (t:todo {originalTaskId: 'task-1.1', status: 'completed'})
MATCH (t)-[:has_success_analysis]->(s:memory)-[:identified_factor]->(f:memory)
RETURN f.content as factor, count(*) as frequency
ORDER BY frequency DESC

// What makes task-1.1 fail?
MATCH (t:todo {originalTaskId: 'task-1.1', status: 'failed'})
MATCH (t)-[:has_failure_analysis]->(fa:memory)
RETURN fa.qcScore as score, fa.content as analysis
ORDER BY score ASC

// Best performing orchestrations
MATCH (tl:todoList)-[:contains]->(t:todo)
WITH tl, 
     avg(t.qcScore) as avg_score,
     sum(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
     count(t) as total
WHERE total > 0
RETURN tl.id, tl.title, avg_score, completed, total, (completed * 100.0 / total) as success_rate
ORDER BY success_rate DESC, avg_score DESC
LIMIT 10
```

## 🎯 Benefits

1. **Complete Audit Trail**: Every execution is preserved
2. **Historical Analysis**: Compare performance over time
3. **Pattern Recognition**: Identify what works and what doesn't
4. **Knowledge Base**: Success factors and failure fixes are searchable
5. **Continuous Improvement**: Learn from past executions
6. **Debugging**: Full worker output and QC feedback for every attempt
7. **Metrics**: Track QC scores, attempt counts, success rates
8. **Resume Capability**: Can query failed tasks and retry with context

## 🚀 Future Enhancements

- [ ] Automatic pattern detection (ML on success/failure factors)
- [ ] Recommendation engine (suggest fixes based on similar failures)
- [ ] Performance trending (track improvements over time)
- [ ] Anomaly detection (flag unusual failures)
- [ ] Cross-task learning (apply success patterns across task types)

---

**Last Updated**: 2025-11-06
**Status**: ✅ Production Ready
