# Agent Chain Execution Tracking

**Version:** 1.0.0  
**Last Updated:** 2025-10-19  
**Status:** ✅ Implemented

---

## 🎯 Overview

Every agent chain execution is now **fully tracked in the Neo4j knowledge graph**, creating a complete audit trail of:
- ✅ What was requested
- ✅ What steps were executed
- ✅ What succeeded and what failed
- ✅ **Failure patterns for future learning**
- ✅ Token usage and performance metrics

This enables **workers to learn from past mistakes** and avoid repeating failed approaches.

---

## 🏗️ Architecture

### Node Types

#### 1. `chain_execution` - Top-level execution record

```typescript
{
  id: "exec-1729324800000-abc123",
  userRequest: "add authentication to this app for users",
  status: "completed" | "running" | "failed",
  startTime: "2025-10-19T10:00:00.000Z",
  endTime: "2025-10-19T10:02:30.000Z",
  duration: 150000, // milliseconds
  totalTokens: 15000,
  inputTokens: 8000,
  outputTokens: 7000,
  stepCount: 2,
  errorMessage: null, // or error message if failed
  errorStack: null    // or stack trace if failed
}
```

#### 2. `agent_step` - Individual agent execution

```typescript
{
  id: "exec-1729324800000-abc123-step-0",
  executionId: "exec-1729324800000-abc123",
  stepIndex: 0,
  agentName: "Ecko Agent",
  agentRole: "Request Optimization",
  status: "completed" | "failed",
  input: "User request and context...",
  output: "Optimized specification...",
  toolCalls: 3,
  inputTokens: 4000,
  outputTokens: 3500,
  duration: 75000,
  timestamp: "2025-10-19T10:00:00.000Z",
  errorMessage: null,
  errorStack: null
}
```

#### 3. `failure_pattern` - Failure learning record

```typescript
{
  id: "failure-1729324800000-xyz789",
  executionId: "exec-1729324800000-abc123",
  stepIndex: 1,
  agentName: "PM Agent",
  taskDescription: "Create authentication system",
  errorType: "Error",
  errorMessage: "Missing required dependency: passport",
  errorStack: "Error: Missing required dependency...",
  context: "User requested authentication, existing codebase has...",
  timestamp: "2025-10-19T10:01:30.000Z",
  lessons: "Failed when: Missing required dependency: passport. Context: User requested authentication..."
}
```

### Relationships

```
chain_execution
  ↑ belongs_to
agent_step
  ↑ follows
agent_step (previous)
  
chain_execution
  ↑ occurred_in
failure_pattern
```

---

## 🔄 Tracking Flow

### 1. Execution Start

When `npm run chain "request"` is called:

```typescript
const executionId = `exec-${Date.now()}-${randomId}`;

await graphManager.addNode('chain_execution', {
  id: executionId,
  userRequest: "add authentication to this app",
  status: 'running',
  startTime: new Date().toISOString()
});
```

**Result:** Creates execution record in graph with status "running"

### 2. Step Execution

For each agent step (Ecko, PM):

```typescript
// Before execution
const stepStart = Date.now();

// Execute agent
const result = await agent.execute(input);

// After execution
const step = {
  agentName: 'Ecko Agent',
  agentRole: 'Request Optimization',
  input: input,
  output: result.output,
  toolCalls: result.toolCalls,
  tokens: result.tokens,
  duration: Date.now() - stepStart
};

// Store in graph
await storeStepInGraph(executionId, step, stepIndex, 'completed');
```

**Result:** Creates `agent_step` node linked to execution

### 3. Success Path

On successful completion:

```typescript
await graphManager.updateNode(executionId, {
  status: 'completed',
  endTime: new Date().toISOString(),
  duration: totalDuration,
  totalTokens: inputTokens + outputTokens,
  stepCount: steps.length
});
```

**Result:** Execution marked as completed with metrics

### 4. Failure Path

On any step failure:

```typescript
// Store failed step
await storeStepInGraph(executionId, failedStep, stepIndex, 'failed', error);

// Store failure pattern for learning
await storeFailurePattern(
  executionId,
  stepIndex,
  agentName,
  taskDescription,
  error,
  context
);

// Update execution status
await graphManager.updateNode(executionId, {
  status: 'failed',
  endTime: new Date().toISOString(),
  errorMessage: error.message,
  errorStack: error.stack
});
```

**Result:** Complete failure information stored for future learning

---

## 📚 Learning from Failures

### Querying Past Failures

Before executing a new request, the system queries for similar past failures:

```typescript
async function findSimilarFailures(taskDescription: string): Promise<string> {
  const failures = await graphManager.queryNodes('failure_pattern');
  
  // Find relevant failures based on keywords
  const relevant = failures.filter(f => {
    const desc = f.properties.taskDescription?.toLowerCase() || '';
    const keywords = taskDescription.toLowerCase().split(' ');
    return keywords.some(k => desc.includes(k));
  });
  
  // Format as warnings
  return relevant.map(f => 
    `⚠️  Previous failure: ${f.errorMessage}\n   Lesson: ${f.lessons}`
  ).join('\n\n');
}
```

### Injecting into Agent Context

Warnings are added to agent prompts:

```typescript
const agentInput = `
${graphContext}

## ⚠️  LESSONS FROM PAST FAILURES

${pastFailures}

**Important**: Review these failures and avoid similar mistakes.

---

## USER REQUEST

${userRequest}
`;
```

**Result:** Agents see past failures and can avoid repeating mistakes

---

## 🔍 Example Execution

### Request

```bash
npm run chain "add authentication to this app for users"
```

### Graph Structure Created

```
chain_execution (exec-1729324800000-abc123)
├── status: completed
├── duration: 150000ms
├── totalTokens: 15000
└── steps:
    ├── agent_step (step-0: Ecko Agent)
    │   ├── status: completed
    │   ├── duration: 75000ms
    │   ├── toolCalls: 3
    │   └── output: "Optimized authentication spec..."
    │
    └── agent_step (step-1: PM Agent)
        ├── status: completed
        ├── duration: 75000ms
        ├── toolCalls: 8
        └── output: "Task breakdown: 5 phases..."
```

### Query Execution History

```cypher
// Get all executions
MATCH (e:chain_execution)
RETURN e
ORDER BY e.startTime DESC
LIMIT 10

// Get failed executions
MATCH (e:chain_execution)
WHERE e.status = 'failed'
RETURN e.userRequest, e.errorMessage, e.timestamp

// Get execution with steps
MATCH (e:chain_execution {id: 'exec-1729324800000-abc123'})
OPTIONAL MATCH (s:agent_step)-[:belongs_to]->(e)
RETURN e, collect(s) as steps

// Find failure patterns
MATCH (f:failure_pattern)
WHERE f.taskDescription CONTAINS 'authentication'
RETURN f.errorMessage, f.lessons, f.timestamp
```

---

## 📊 Metrics & Analytics

### Available Metrics

From graph queries, you can analyze:

**Performance:**
- Average execution time per request type
- Token usage trends
- Tool call frequency

**Success Rate:**
- Completion rate by request type
- Common failure points
- Time to failure

**Agent Performance:**
- Which agents succeed/fail most
- Token usage per agent
- Duration per agent

**Learning Effectiveness:**
- Are repeated failures decreasing?
- Are warnings being heeded?
- Which failure patterns are most common?

### Example Queries

```cypher
// Average execution time
MATCH (e:chain_execution)
WHERE e.status = 'completed'
RETURN avg(e.duration) as avgDuration

// Success rate
MATCH (e:chain_execution)
WITH count(e) as total,
     count(CASE WHEN e.status = 'completed' THEN 1 END) as successes
RETURN (successes * 100.0 / total) as successRate

// Most common failures
MATCH (f:failure_pattern)
RETURN f.errorMessage, count(*) as occurrences
ORDER BY occurrences DESC
LIMIT 10

// Token usage by agent
MATCH (s:agent_step)
RETURN s.agentName,
       avg(s.inputTokens) as avgInputTokens,
       avg(s.outputTokens) as avgOutputTokens,
       count(*) as executions
```

---

## 🎯 Benefits

### 1. **Complete Audit Trail** ✅

Every execution is recorded with:
- What was requested
- How it was processed
- What tools were used
- How long it took
- What failed and why

### 2. **Failure Learning** ✅

Workers can:
- See what has failed before
- Avoid repeating mistakes
- Learn from error patterns
- Get contextual warnings

### 3. **Performance Monitoring** ✅

Track:
- Execution times
- Token usage
- Success rates
- Bottlenecks

### 4. **Debugging** ✅

When things fail:
- Full stack traces preserved
- Input/output context available
- Step-by-step execution visible
- Error patterns identifiable

### 5. **Continuous Improvement** ✅

Over time:
- Failure rates should decrease
- Execution times should improve
- Token usage should optimize
- Success patterns emerge

---

## 🔧 Configuration

### Enable/Disable Tracking

Tracking is automatic but requires Neo4j connection. To disable:

```typescript
// In agent-chain.ts
const chain = new AgentChain('docs/agents');
await chain.initialize();

// Tracking happens automatically if Neo4j is connected
// If Neo4j fails, chain continues without tracking
```

### Storage Limits

**Considerations:**
- Long inputs/outputs are truncated to 5000 chars
- Full content stored in execution records
- Old executions can be archived/deleted
- Consider retention policy for production

### Performance Impact

**Minimal overhead:**
- Graph writes are async (non-blocking)
- Failures to track don't break execution
- Average overhead: ~50-100ms per execution

---

## 🚀 Usage Examples

### Run Chain with Tracking

```bash
npm run chain "add authentication to this app"
```

**Output:**
```
🔗 Initializing Agent Chain...
✅ Neo4j schema initialized
✅ GraphManager initialized and connected to Neo4j

🚀 AGENT CHAIN EXECUTION
📝 User Request: add authentication to this app
🆔 Execution ID: exec-1729324800000-abc123

🔍 Gathering context from knowledge graph...
  - Searching for related concepts...
  - Checking completed TODOs...
  - Checking indexed files...
    Found 31 indexed files
✅ Context gathered (3 sections, 734 chars)

⚠️  LESSONS FROM PAST FAILURES:
1. Previous failure: Missing passport dependency
   Lesson: Always check package.json before implementing auth

STEP 1: Ecko Agent - Request Optimization
✅ Ecko completed optimization in 75.00s
📝 Step 0 tracked in graph

STEP 2: PM Agent - Task Breakdown
✅ PM completed task breakdown in 75.00s
📝 Step 1 tracked in graph

📊 CHAIN EXECUTION SUMMARY
🆔 Execution ID: exec-1729324800000-abc123
⏱️  Total Duration: 150.50s
🎫 Total Tokens: 15000
💾 Execution tracked in graph: exec-1729324800000-abc123
```

### Query Execution History

```bash
# Via Neo4j Browser
http://localhost:7474

# Run Cypher query
MATCH (e:chain_execution)
RETURN e
ORDER BY e.startTime DESC
LIMIT 10
```

### Analyze Failures

```cypher
MATCH (f:failure_pattern)
RETURN f.taskDescription, f.errorMessage, f.lessons, f.timestamp
ORDER BY f.timestamp DESC
```

---

## 🔄 Future Enhancements

### Phase 2: Advanced Learning

- [ ] **Semantic failure matching** using embeddings
- [ ] **Success pattern extraction** from completed executions
- [ ] **Automatic retry strategies** based on failure type
- [ ] **Performance prediction** based on request similarity

### Phase 3: Analytics Dashboard

- [ ] Real-time execution monitoring
- [ ] Success rate trends
- [ ] Token usage optimization suggestions
- [ ] Failure pattern visualization

### Phase 4: Self-Improvement

- [ ] Automatic prompt optimization based on failure patterns
- [ ] Dynamic tool selection based on success history
- [ ] Context gathering optimization
- [ ] Agent routing based on performance

---

## 📖 Related Documentation

- [Multi-Agent Architecture](./MULTI_AGENT_GRAPH_RAG.md)
- [Agent Chaining](./AGENT_CHAINING.md)
- [Knowledge Graph Guide](./knowledge-graph.md)
- [Memory Guide](./MEMORY_GUIDE.md)

---

**Questions?** Check the implementation in `src/orchestrator/agent-chain.ts`
