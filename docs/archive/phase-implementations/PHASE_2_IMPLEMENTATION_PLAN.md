# Phase 2 Implementation Plan: Advanced Multi-Agent Features

**Version:** 3.2  
**Target Date:** Q4 2025  
**Status:** Planning → Implementation  
**Prerequisites:** ✅ Phase 1 Complete (Multi-agent locking + Parallel execution)

---

## 📋 Overview

Phase 2 focuses on four core capabilities that enable robust multi-agent orchestration:

1. **Worker Agent Context Isolation** - Clean, task-specific context
2. **QC Agent Verification System** - Catch errors before graph storage
3. **Adversarial Validation** - Correction loop for failed tasks
4. **Agent Performance Metrics** - Monitor and optimize agent behavior

---

## 🎯 Feature 1: Worker Agent Context Isolation

### Objective
Ensure worker agents receive only task-specific context, not full PM research, reducing context size by 90% and preventing confusion.

### Current State
✅ Task locking system exists  
✅ GraphManager can store and retrieve tasks  
❌ No context filtering mechanism  
❌ Workers see full TODO context including PM notes

### Implementation Steps

#### Step 1.1: Define Context Scopes (Week 1)
**File:** `src/types/context.types.ts` (NEW)

```typescript
export interface ContextScope {
  type: 'pm' | 'worker' | 'qc';
  allowedFields: string[];
}

export interface WorkerContext {
  // Essential fields only
  taskId: string;
  title: string;
  requirements: string;
  files?: string[];
  dependencies?: string[];
  errorContext?: any; // Only present for retries
  // NO: PM research, alternative approaches, full subgraph
}

export interface PMContext extends WorkerContext {
  // Full context for planning
  research: any;
  alternatives: any;
  fullSubgraph: any;
  notes: any;
}
```

**Tests:** `testing/context-isolation.test.ts` (NEW)
- Test worker context <10% of PM context size
- Test worker context contains all required fields
- Test PM context retains full research

#### Step 1.2: Implement Context Filter (Week 1-2)
**File:** `src/managers/ContextManager.ts` (NEW)

```typescript
export class ContextManager {
  /**
   * Filter context based on agent scope
   */
  filterForAgent(
    fullContext: PMContext,
    agentType: 'pm' | 'worker' | 'qc'
  ): WorkerContext | PMContext {
    switch (agentType) {
      case 'pm':
        return fullContext;
      
      case 'worker':
        return {
          taskId: fullContext.taskId,
          title: fullContext.title,
          requirements: fullContext.requirements,
          files: fullContext.files,
          dependencies: fullContext.dependencies,
          errorContext: fullContext.errorContext, // Only for retries
        };
      
      case 'qc':
        // QC needs requirements + output for comparison
        return {
          ...this.filterForAgent(fullContext, 'worker'),
          originalRequirements: fullContext.requirements,
        };
    }
  }
  
  /**
   * Measure context size reduction
   */
  calculateReduction(
    fullContext: PMContext,
    filteredContext: WorkerContext
  ): number {
    const fullSize = JSON.stringify(fullContext).length;
    const filteredSize = JSON.stringify(filteredContext).length;
    return ((fullSize - filteredSize) / fullSize) * 100;
  }
}
```

**Tests:** 8 tests
- Filter PM context → worker context (90%+ reduction)
- Filter PM context → QC context (includes requirements)
- Preserve error context for retries
- Measure context size reduction

#### Step 1.3: Add MCP Tool (Week 2)
**File:** `src/tools/context.tools.ts` (NEW)

```typescript
{
  name: 'get_task_context',
  description: 'Get task context filtered for agent type',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      agentId: { type: 'string' },
      agentType: { 
        type: 'string',
        enum: ['pm', 'worker', 'qc'] 
      }
    },
    required: ['taskId', 'agentId', 'agentType']
  }
}
```

**Integration:** `src/index.ts` - Add handler for `get_task_context`

**Success Metrics:**
- ✅ Worker context <10% of PM context size
- ✅ Workers complete tasks without asking for clarification
- ✅ <5% worker clarification rate

**Timeline:** 2 weeks  
**Complexity:** Medium  
**Dependencies:** None (uses existing graph tools)

---

## 🎯 Feature 2: QC Agent Verification System

### Objective
Verify worker output against requirements before storing in graph, catching errors early and preventing error propagation.

### Current State
✅ Subgraph extraction exists (`graph_get_subgraph`)  
✅ Task storage in graph  
❌ No verification mechanism  
❌ No requirement extraction from subgraph  
❌ No validation rules engine

### Implementation Steps

#### Step 2.1: Define Verification Types (Week 3)
**File:** `src/types/verification.types.ts` (NEW)

```typescript
export interface VerificationRule {
  id: string;
  type: 'required_field' | 'format' | 'dependency' | 'custom';
  description: string;
  severity: 'error' | 'warning';
  validator: (output: any, context: VerificationContext) => Promise<RuleResult>;
}

export interface VerificationContext {
  task: any;
  requirements: string[];
  subgraph: any;
  originalContext: any;
}

export interface RuleResult {
  passed: boolean;
  message?: string;
  suggestedFix?: string;
}

export interface ValidationResult {
  taskId: string;
  passed: boolean; // All errors passed
  failures: ValidationFailure[];
  warnings: ValidationFailure[];
  score: number; // 0-100
  verifiedBy: string; // QC agent ID
  verifiedAt: Date;
}

export interface ValidationFailure {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  suggestedFix?: string;
}
```

**Tests:** `testing/verification-types.test.ts` (NEW)
- Test rule definition and registration
- Test validation result structure

#### Step 2.2: Implement Verification Engine (Week 3-4)
**File:** `src/managers/VerificationManager.ts` (NEW)

```typescript
export class VerificationManager {
  private rules = new Map<string, VerificationRule>();
  
  constructor(private graphManager: IGraphManager) {
    this.registerDefaultRules();
  }
  
  /**
   * Register default verification rules
   */
  private registerDefaultRules() {
    // Rule 1: Required fields present
    this.registerRule({
      id: 'required-fields',
      type: 'required_field',
      description: 'Check all required fields are present in output',
      severity: 'error',
      validator: async (output, context) => {
        const required = this.extractRequiredFields(context.requirements);
        const missing = required.filter(f => !output[f]);
        return {
          passed: missing.length === 0,
          message: missing.length > 0 
            ? `Missing required fields: ${missing.join(', ')}`
            : undefined,
          suggestedFix: missing.length > 0
            ? `Add the following fields: ${missing.join(', ')}`
            : undefined
        };
      }
    });
    
    // Rule 2: Dependencies satisfied
    this.registerRule({
      id: 'dependencies-satisfied',
      type: 'dependency',
      description: 'Verify all task dependencies are referenced',
      severity: 'error',
      validator: async (output, context) => {
        const deps = context.task.dependencies || [];
        const referenced = this.findDependencyReferences(output);
        const missing = deps.filter(d => !referenced.includes(d));
        return {
          passed: missing.length === 0,
          message: missing.length > 0
            ? `Missing dependency references: ${missing.join(', ')}`
            : undefined
        };
      }
    });
    
    // Rule 3: Output format valid
    this.registerRule({
      id: 'format-valid',
      type: 'format',
      description: 'Verify output matches expected format',
      severity: 'warning',
      validator: async (output, context) => {
        // Check for common format issues
        const issues = [];
        if (typeof output !== 'object') {
          issues.push('Output should be an object');
        }
        if (!output.summary) {
          issues.push('Missing summary field (recommended)');
        }
        return {
          passed: issues.length === 0,
          message: issues.join('; ')
        };
      }
    });
  }
  
  /**
   * Register a custom verification rule
   */
  registerRule(rule: VerificationRule) {
    this.rules.set(rule.id, rule);
  }
  
  /**
   * Verify task output against requirements
   */
  async verifyTaskOutput(
    taskId: string,
    output: any,
    qcAgentId: string
  ): Promise<ValidationResult> {
    // Get task and subgraph
    const taskNode = await this.graphManager.getNode(taskId);
    if (!taskNode) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    const subgraph = await this.graphManager.getSubgraph(taskId, 2);
    
    // Extract requirements from subgraph
    const requirements = this.extractRequirements(subgraph);
    
    const context: VerificationContext = {
      task: taskNode,
      requirements,
      subgraph,
      originalContext: taskNode.properties
    };
    
    // Run all rules
    const failures: ValidationFailure[] = [];
    const warnings: ValidationFailure[] = [];
    
    for (const rule of this.rules.values()) {
      const result = await rule.validator(output, context);
      if (!result.passed) {
        const failure: ValidationFailure = {
          ruleId: rule.id,
          severity: rule.severity,
          message: result.message || rule.description,
          suggestedFix: result.suggestedFix
        };
        
        if (rule.severity === 'error') {
          failures.push(failure);
        } else {
          warnings.push(failure);
        }
      }
    }
    
    return {
      taskId,
      passed: failures.length === 0,
      failures,
      warnings,
      score: this.calculateScore(failures, warnings),
      verifiedBy: qcAgentId,
      verifiedAt: new Date()
    };
  }
  
  /**
   * Generate correction prompt for failed verification
   */
  async generateCorrectionPrompt(
    taskId: string,
    failures: ValidationFailure[]
  ): Promise<string> {
    const task = await this.graphManager.getNode(taskId);
    
    const failureMessages = failures.map((f, i) => 
      `${i + 1}. ${f.message}${f.suggestedFix ? `\n   Fix: ${f.suggestedFix}` : ''}`
    ).join('\n');
    
    return `
# Task Correction Required

**Task:** ${task?.properties.title}
**Original Requirements:** ${task?.properties.requirements}

## Verification Failures (${failures.length})

${failureMessages}

## Instructions

Please revise your output to address the issues above while maintaining your original approach and all correct elements. Focus only on fixing the identified problems.
    `.trim();
  }
  
  /**
   * Extract requirements from subgraph
   */
  private extractRequirements(subgraph: any): string[] {
    // Extract requirement nodes and edges
    const reqNodes = subgraph.nodes.filter((n: any) => 
      n.type === 'requirement' || n.properties.isRequirement
    );
    return reqNodes.map((n: any) => n.properties.description);
  }
  
  /**
   * Calculate verification score (0-100)
   */
  private calculateScore(
    failures: ValidationFailure[],
    warnings: ValidationFailure[]
  ): number {
    const errorPenalty = failures.length * 20; // -20 per error
    const warningPenalty = warnings.length * 5; // -5 per warning
    return Math.max(0, 100 - errorPenalty - warningPenalty);
  }
  
  private extractRequiredFields(requirements: string[]): string[] {
    // Parse requirements text for "must include", "should have", etc.
    const fieldPattern = /(?:must include|should have|requires?)\s+([a-zA-Z_]+)/gi;
    const fields: string[] = [];
    requirements.forEach(req => {
      const matches = req.matchAll(fieldPattern);
      for (const match of matches) {
        fields.push(match[1]);
      }
    });
    return fields;
  }
  
  private findDependencyReferences(output: any): string[] {
    // Search output for dependency IDs
    const text = JSON.stringify(output);
    const depPattern = /task-\d+-\w+/g;
    return Array.from(text.matchAll(depPattern)).map(m => m[0]);
  }
}
```

**Tests:** `testing/verification-manager.test.ts` (NEW) - 15 tests
- Register and retrieve rules
- Verify output with all rules passing
- Verify output with failures
- Verify output with warnings only
- Calculate verification score
- Generate correction prompt
- Extract requirements from subgraph
- Handle missing task gracefully

#### Step 2.3: Add MCP Tools (Week 4)
**File:** `src/tools/verification.tools.ts` (NEW)

```typescript
export const verificationTools = [
  {
    name: 'verify_task_output',
    description: 'QC agent verifies worker output against requirements',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to verify' },
        output: { 
          type: 'object', 
          description: 'Worker output to verify' 
        },
        qcAgentId: { 
          type: 'string', 
          description: 'QC agent performing verification' 
        }
      },
      required: ['taskId', 'output', 'qcAgentId']
    }
  },
  {
    name: 'register_verification_rule',
    description: 'Register a custom verification rule',
    inputSchema: {
      type: 'object',
      properties: {
        ruleId: { type: 'string' },
        type: { 
          type: 'string',
          enum: ['required_field', 'format', 'dependency', 'custom']
        },
        description: { type: 'string' },
        severity: { 
          type: 'string',
          enum: ['error', 'warning']
        }
      },
      required: ['ruleId', 'type', 'description', 'severity']
    }
  },
  {
    name: 'create_correction_task',
    description: 'Create correction task for failed verification',
    inputSchema: {
      type: 'object',
      properties: {
        parentTaskId: { type: 'string' },
        validationResult: { 
          type: 'object',
          description: 'Validation result with failures' 
        },
        preserveContext: { 
          type: 'boolean',
          default: true,
          description: 'Preserve original worker context for retry'
        }
      },
      required: ['parentTaskId', 'validationResult']
    }
  }
];
```

**Integration:** `src/index.ts` - Add handlers for verification tools

**Success Metrics:**
- ✅ <5% error propagation rate
- ✅ 95%+ error catch rate by QC
- ✅ <20% worker retry rate
- ✅ Correction prompts preserve context

**Timeline:** 2 weeks  
**Complexity:** High  
**Dependencies:** Subgraph extraction (exists)

---

## 🎯 Feature 3: Adversarial Validation Loop

### Objective
Implement correction loop where failed tasks are retried with preserved context and specific fix instructions.

### Current State
✅ Task creation exists  
✅ Context storage exists  
✅ Verification system (from Feature 2)  
❌ No correction task flow  
❌ No retry tracking

### Implementation Steps

#### Step 3.1: Implement Correction Flow (Week 5)
**File:** Update `src/managers/VerificationManager.ts`

```typescript
/**
 * Create correction task from failed verification
 */
async createCorrectionTask(
  parentTaskId: string,
  validationResult: ValidationResult,
  preserveContext: boolean = true
): Promise<string> {
  const parentTask = await this.graphManager.getNode(parentTaskId);
  if (!parentTask) {
    throw new Error(`Parent task ${parentTaskId} not found`);
  }
  
  // Generate correction prompt
  const correctionPrompt = await this.generateCorrectionPrompt(
    parentTaskId,
    validationResult.failures
  );
  
  // Create correction task node
  const correctionTaskId = await this.graphManager.addNode({
    type: 'todo',
    properties: {
      title: `Fix: ${parentTask.properties.title}`,
      requirements: correctionPrompt,
      isCorrection: true,
      correctionIteration: (parentTask.properties.correctionIteration || 0) + 1,
      originalContext: preserveContext ? parentTask.properties : undefined,
      validationFailures: validationResult.failures
    }
  });
  
  // Link to parent
  await this.graphManager.addEdge({
    source: correctionTaskId,
    target: parentTaskId,
    type: 'corrects',
    properties: {
      verificationScore: validationResult.score,
      attemptNumber: (parentTask.properties.correctionIteration || 0) + 1
    }
  });
  
  return correctionTaskId;
}
```

**Tests:** `testing/correction-flow.test.ts` (NEW) - 8 tests
- Create correction task from validation failures
- Preserve original context in correction task
- Link correction task to parent
- Track correction iteration count
- Handle max retries (3) limit

#### Step 3.2: Add Retry Tracking (Week 5)
**File:** `src/types/task.types.ts` - Update interfaces

```typescript
export interface TaskMetrics {
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  lastVerificationScore?: number;
  avgVerificationScore?: number;
}
```

**Success Metrics:**
- ✅ Correction tasks preserve worker context
- ✅ <3 retry attempts average
- ✅ 80%+ success rate on first retry

**Timeline:** 1 week  
**Complexity:** Medium  
**Dependencies:** Feature 2 (Verification System)

---

## 🎯 Feature 4: Agent Performance Metrics

### Objective
Track and expose agent performance metrics for monitoring and optimization.

### Current State
✅ Graph statistics exist  
❌ No agent-specific metrics  
❌ No performance tracking  
❌ No metric visualization

### Implementation Steps

#### Step 4.1: Define Metrics Schema (Week 6)
**File:** `src/types/metrics.types.ts` (NEW)

```typescript
export interface AgentMetrics {
  agentId: string;
  agentType: 'pm' | 'worker' | 'qc';
  
  // Lifecycle
  spawnedAt: Date;
  terminatedAt?: Date;
  lifespanMs?: number;
  
  // Context
  avgContextSize: number;
  maxContextSize: number;
  contextReduction: number; // % for workers
  
  // Task execution
  tasksCompleted: number;
  tasksStarted: number;
  tasksFailed: number;
  avgTaskDuration: number;
  
  // QC specific
  verificationsPerformed?: number;
  errorsCaught?: number;
  avgVerificationScore?: number;
  
  // Performance
  successRate: number; // %
  retryRate: number; // %
}

export interface SystemMetrics {
  totalAgents: number;
  activeAgents: number;
  avgAgentLifespan: number;
  avgWorkerContextReduction: number;
  overallSuccessRate: number;
  qcCatchRate: number;
  avgVerificationScore: number;
}
```

#### Step 4.2: Implement Metrics Collection (Week 6-7)
**File:** `src/managers/MetricsManager.ts` (NEW)

```typescript
export class MetricsManager {
  constructor(
    private graphManager: IGraphManager
  ) {}
  
  /**
   * Get metrics for specific agent
   */
  async getAgentMetrics(agentId: string): Promise<AgentMetrics> {
    // Query graph for agent's tasks
    const tasks = await this.graphManager.queryNodes({
      type: 'todo',
      filters: { assignedTo: agentId }
    });
    
    const completed = tasks.filter(t => t.properties.status === 'completed');
    const failed = tasks.filter(t => t.properties.status === 'failed');
    
    return {
      agentId,
      agentType: this.inferAgentType(agentId),
      spawnedAt: new Date(), // TODO: Track in graph
      tasksCompleted: completed.length,
      tasksStarted: tasks.length,
      tasksFailed: failed.length,
      avgTaskDuration: this.calculateAvgDuration(completed),
      successRate: (completed.length / tasks.length) * 100,
      retryRate: this.calculateRetryRate(tasks),
      avgContextSize: this.calculateAvgContextSize(tasks),
      maxContextSize: this.calculateMaxContextSize(tasks),
      contextReduction: 0 // TODO: Calculate from context manager
    };
  }
  
  /**
   * Get system-wide metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const allTasks = await this.graphManager.queryNodes({
      type: 'todo'
    });
    
    const agentIds = new Set(allTasks.map(t => t.properties.assignedTo).filter(Boolean));
    
    // Calculate aggregate metrics
    const agentMetrics = await Promise.all(
      Array.from(agentIds).map(id => this.getAgentMetrics(id))
    );
    
    return {
      totalAgents: agentIds.size,
      activeAgents: agentMetrics.filter(m => !m.terminatedAt).length,
      avgAgentLifespan: this.calculateAvgLifespan(agentMetrics),
      avgWorkerContextReduction: this.calculateAvgContextReduction(agentMetrics),
      overallSuccessRate: this.calculateAvgSuccessRate(agentMetrics),
      qcCatchRate: this.calculateQCCatchRate(allTasks),
      avgVerificationScore: this.calculateAvgVerificationScore(allTasks)
    };
  }
  
  private calculateAvgDuration(tasks: any[]): number {
    const durations = tasks
      .filter(t => t.properties.completedAt && t.properties.startedAt)
      .map(t => 
        new Date(t.properties.completedAt).getTime() - 
        new Date(t.properties.startedAt).getTime()
      );
    return durations.reduce((a, b) => a + b, 0) / durations.length || 0;
  }
  
  private calculateRetryRate(tasks: any[]): number {
    const retries = tasks.filter(t => t.properties.isCorrection).length;
    return (retries / tasks.length) * 100;
  }
  
  // ... more helper methods
}
```

**Tests:** `testing/metrics-manager.test.ts` (NEW) - 12 tests
- Calculate agent metrics
- Calculate system metrics
- Handle agents with no tasks
- Track verification scores
- Calculate context reduction

#### Step 4.3: Add MCP Tool (Week 7)
**File:** `src/tools/metrics.tools.ts` (NEW)

```typescript
export const metricsTools = [
  {
    name: 'get_agent_metrics',
    description: 'Get performance metrics for specific agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' }
      },
      required: ['agentId']
    }
  },
  {
    name: 'get_system_metrics',
    description: 'Get system-wide multi-agent metrics',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];
```

**Success Metrics:**
- ✅ Real-time metrics available via MCP
- ✅ <100ms metric query time
- ✅ Accurate success/retry rate tracking

**Timeline:** 2 weeks  
**Complexity:** Medium  
**Dependencies:** All previous features

---

## 📊 Timeline Summary

| Week | Feature | Deliverables |
|------|---------|--------------|
| 1-2 | Context Isolation | `ContextManager`, `get_task_context` tool, 8 tests |
| 3-4 | QC Verification | `VerificationManager`, 3 verification tools, 15 tests |
| 5 | Correction Loop | Correction flow, retry tracking, 8 tests |
| 6-7 | Performance Metrics | `MetricsManager`, 2 metrics tools, 12 tests |

**Total:** 7 weeks  
**New Files:** 12  
**New Tests:** 43  
**New MCP Tools:** 7

---

## 🧪 Testing Strategy

### Unit Tests (43 total)
- Context isolation: 8 tests
- Verification engine: 15 tests
- Correction flow: 8 tests
- Metrics collection: 12 tests

### Integration Tests (10 total)
- End-to-end worker context isolation
- PM → Worker → QC → Correction flow
- Multi-agent metrics aggregation
- Concurrent verification operations

### Performance Tests (5 total)
- Context filtering <10ms
- Verification <100ms per rule
- Metrics query <100ms
- Handle 100+ concurrent agents

---

## 📈 Success Criteria

### Feature 1: Context Isolation
- ✅ Worker context <10% of PM context size
- ✅ <5% worker clarification rate
- ✅ All required fields present in worker context

### Feature 2: QC Verification
- ✅ <5% error propagation rate
- ✅ 95%+ error catch rate
- ✅ <100ms verification time per rule

### Feature 3: Correction Loop
- ✅ <3 retry attempts average
- ✅ 80%+ success on first retry
- ✅ Correction tasks preserve context

### Feature 4: Metrics
- ✅ Real-time metrics available
- ✅ <100ms metric query time
- ✅ Accurate tracking of all metrics

---

## 🚀 Deployment Plan

### Week 8: Integration & Testing
- Integrate all features
- Run full test suite (150+ tests total)
- Performance benchmarking
- Documentation updates

### Week 9: Beta Testing
- Deploy to staging environment
- Test with real PM/Worker/QC workflows
- Collect feedback
- Fix issues

### Week 10: Production Release
- Final testing
- Update documentation
- Release v3.2
- Create migration guide

---

## 📚 Documentation Deliverables

1. **Phase 2 Architecture Guide** - Complete technical spec
2. **QC Agent Handbook** - How to use verification tools
3. **Metrics Dashboard Guide** - Understanding performance metrics
4. **Migration Guide** - Upgrading from v3.1 to v3.2
5. **API Reference** - All new MCP tools documented

---

## 🔗 Dependencies

### External
- None (all features use existing Neo4j infrastructure)

### Internal
- ✅ Phase 1: Multi-agent locking (complete)
- ✅ Phase 1: Parallel execution (complete)
- ✅ GraphManager with subgraph extraction (complete)

---

## 🎯 Next Steps

1. **Week 1:** Start with Context Isolation (highest priority)
2. **Create issues:** One GitHub issue per feature
3. **Set up tracking:** Add to project board
4. **Assign resources:** Allocate developer time
5. **Schedule reviews:** Weekly progress reviews

---

**Document Version:** 1.0  
**Created:** 2025-10-17  
**Status:** Ready for Implementation  
**Owner:** CVS Health Enterprise AI Team
