# Agent Chain Execution Tracking

**Version:** 1.0.0  
**Last Updated:** 2025-10-18  
**Status:** ✅ Implemented

---

## 🎯 Overview

Every agent chain execution is now **fully tracked in the knowledge graph**, creating a complete audit trail for learning from both successes and failures. This enables workers to find similar past tasks and learn what NOT to do.

---

## 🏗️ Architecture

### Graph Schema

**New Node Types:**
- `chain_execution` - Complete agent chain run
- `agent_step` - Individual agent step within a chain
- `failure_pattern` - Failed execution patterns for learning

**New Edge Types:**
- `belongs_to` - Step belongs to execution
- `follows` - Step follows previous step  
- `occurred_in` - Failure occurred in execution

### Data Flow

```
User Request
     ↓
Agent Chain Execution (tracked)
     ├─ Step 1: Ecko Agent (tracked)
     │   └─ Success/Failure (tracked)
     └─ Step 2: PM Agent (tracked)
         └─ Success/Failure (tracked)
              ↓
         Knowledge Graph
```

---

## 📊 What Gets Tracked

### 1. Execution Metadata

**Stored for every run:**
```typescript
{
  id: "exec-1760800000000-abc123",
  userRequest: "implement authentication system",
  status: "completed" | "running" | "failed",
  startTime: "2025-10-18T10:00:00.000Z",
  endTime: "2025-10-18T10:00:45.000Z",
  duration: 45000, // milliseconds
  totalTokens: 12000,
  inputTokens: 8000,
  outputTokens: 4000,
  stepCount: 2,
  errorMessage?: "Connection timeout",
  errorStack?: "Error: Connection timeout\n  at..."
}
```

### 2. Individual Steps

**Tracked for each agent:**
```typescript
{
  id: "exec-1760800000000-abc123-step-0",
  executionId: "exec-1760800000000-abc123",
  stepIndex: 0,
  agentName: "Ecko Agent",
  agentRole: "Request Optimization",
  status: "completed" | "failed",
  input: "User request + graph context...",
  output: "Optimized specification...",
  toolCalls: 5,
  inputTokens: 2000,
  outputTokens: 1000,
  duration: 15000,
  timestamp: "2025-10-18T10:00:15.000Z"
}
```

### 3. Failure Patterns

**Captured for learning:**
```typescript
{
  id: "failure-1760800000000-xyz789",
  executionId: "exec-1760800000000-abc123",
  stepIndex: 1,
  agentName: "PM Agent",
  taskDescription: "Break down authentication system implementation",
  errorType: "TypeError",
  errorMessage: "Cannot read property 'split' of undefined",
  errorStack: "TypeError: Cannot read property...",
  context: "While processing task breakdown with incomplete spec...",
  timestamp: "2025-10-18T10:00:30.000Z",
  lessons: "Failed when: Cannot read property 'split' of undefined. Context: While processing task breakdown..."
}
```

---

## 🔍 Query Examples

### Find Past Executions for Similar Tasks

```cypher
// Find executions related to authentication
MATCH (e:chain_execution)
WHERE e.userRequest CONTAINS 'auth'
RETURN e
ORDER BY e.startTime DESC
LIMIT 10
```

### Find All Failures

```cypher
// Get all failure patterns
MATCH (f:failure_pattern)
RETURN f.agentName, f.errorMessage, f.lessons, f.timestamp
ORDER BY f.timestamp DESC
```

### Analyze Agent Performance

```cypher
// Get success rate by agent
MATCH (s:agent_step)
WITH s.agentName AS agent, 
     COUNT(*) AS total,
     SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS successes
RETURN agent, total, successes, (successes * 100.0 / total) AS successRate
ORDER BY successRate DESC
```

### Find Similar Past Failures

```cypher
// Find failures for similar tasks
MATCH (f:failure_pattern)
WHERE f.taskDescription CONTAINS $keyword
RETURN f.errorMessage, f.lessons, f.timestamp
ORDER BY f.timestamp DESC
LIMIT 3
```

---

## 🤖 Learning from Failures

### How It Works

**1. Before Execution:**
```typescript
// Agent chain queries for similar past failures
const pastFailures = await findSimilarFailures(userRequest);
```

**2. Injected into Agent Context:**
```markdown
## ⚠️  LESSONS FROM PAST FAILURES

1. ⚠️  Previous failure: Cannot read property 'split' of undefined
   Lesson: Failed when: Cannot read property 'split' of undefined. Context: While processing task breakdown...

2. ⚠️  Previous failure: Invalid JSON response
   Lesson: Failed when: Invalid JSON response. Context: API returned HTML error page...

**Important**: Review these failures and avoid similar mistakes.
```

**3. Agents Learn:**
- Ecko sees failures during optimization
- PM sees failures during task breakdown
- Both can adjust approach to avoid repeating mistakes

---

## 📈 Usage Example

```bash
# Run a chain (automatically tracked)
npm run chain "implement user authentication with JWT"

# Output includes:
🆔 Execution ID: exec-1760800000000-abc123
📊 Execution exec-1760800000000-abc123 tracked in graph (running)
  📝 Step 0 tracked in graph
  📝 Step 1 tracked in graph
💾 Execution tracked in graph: exec-1760800000000-abc123
```

### Querying Execution History

```typescript
// In worker agent or PM
const executions = await graphManager.queryNodes('chain_execution', {
  status: 'completed'
});

// Find my execution
const myExecution = await graphManager.getNode('exec-1760800000000-abc123');

// Get all steps
const steps = await graphManager.queryNodes('agent_step', {
  executionId: 'exec-1760800000000-abc123'
});

// Find similar failures
const failures = await graphManager.queryNodes('failure_pattern');
const relevant = failures.filter(f => 
  f.properties.taskDescription.includes('authentication')
);
```

---

## 🎓 Benefits

### 1. Complete Audit Trail ✅

Every execution is traceable:
- Who requested it (user request)
- What was done (agent steps)
- How long it took (duration)
- What went wrong (failures)

### 2. Learning from Failures ✅

Workers automatically see:
- Similar past task failures
- Error messages and contexts
- Lessons learned
- What NOT to do

### 3. Performance Analysis ✅

Track metrics:
- Success rates by agent
- Average execution time
- Token usage patterns
- Common failure modes

### 4. Debugging Support ✅

When things go wrong:
- Full input/output history
- Exact error messages and stacks
- Context at time of failure
- Relationship to other executions

---

## 🔧 Configuration

### Enable/Disable Tracking

Tracking is automatic when GraphManager is available. To disable:

```typescript
// In agent-chain.ts
const chain = new AgentChain(agentsDir);
await chain.initialize(); // Will warn if Neo4j not available

// Tracking gracefully degrades if Neo4j is down
```

### Storage Limits

To prevent huge property values:
- Input/output truncated to 5000 chars
- Task descriptions truncated to 500 chars
- Context truncated to 1000 chars
- Error stacks stored in full (for debugging)

---

## 📊 Example Graph Structure

```
(exec-001:chain_execution)
     ├─[:belongs_to]─(step-0:agent_step {agentName: "Ecko Agent"})
     │                    └─[:follows]─(step-1:agent_step {agentName: "PM Agent"})
     └─[:occurred_in]─(failure-001:failure_pattern)

(exec-002:chain_execution)
     └─[:belongs_to]─(step-0:agent_step {agentName: "Ecko Agent"})
                         └─[:follows]─(step-1:agent_step {agentName: "PM Agent"})
```

---

## 🐛 Troubleshooting

### Tracking Not Working

**Problem:** No execution nodes in graph

**Check:**
```bash
# Verify Neo4j is running
docker compose ps | grep neo4j

# Check connection in logs
npm run chain "test" 2>&1 | grep "Neo4j"
# Should see: "✅ PM Agent loaded" not "⚠️  Could not connect to Neo4j"
```

### Too Much Data in Graph

**Problem:** Graph getting large

**Solution:** Periodic cleanup
```cypher
// Delete executions older than 30 days
MATCH (e:chain_execution)
WHERE datetime(e.startTime) < datetime() - duration('P30D')
DETACH DELETE e

// Keep only recent failures
MATCH (f:failure_pattern)
WHERE datetime(f.timestamp) < datetime() - duration('P90D')
DELETE f
```

### Performance Issues

**Problem:** Queries slow with many executions

**Solutions:**
1. Create indexes:
```cypher
CREATE INDEX execution_status FOR (e:chain_execution) ON (e.status);
CREATE INDEX execution_timestamp FOR (e:chain_execution) ON (e.startTime);
CREATE INDEX failure_timestamp FOR (f:failure_pattern) ON (f.timestamp);
```

2. Limit query results:
```typescript
const recent = await graphManager.queryNodes('chain_execution', {
  status: 'completed'
}, { limit: 100 });
```

---

## 🚀 Future Enhancements

- [ ] **Vector embeddings for failure matching** - Use semantic similarity instead of keyword matching
- [ ] **Automatic failure clustering** - Group similar failures
- [ ] **Success pattern extraction** - Learn what DOES work, not just failures
- [ ] **Performance trend analysis** - Track token usage over time
- [ ] **Recommendation engine** - Suggest similar successful approaches
- [ ] **Visualization dashboard** - Neo4j Browser + custom UI

---

## 📚 Related Documentation

- [Multi-Agent Architecture](./MULTI_AGENT_GRAPH_RAG.md)
- [Knowledge Graph Guide](./knowledge-graph.md)
- [Memory Guide](./MEMORY_GUIDE.md)
- [Agent Chain README](../src/orchestrator/README.md)

---

**Remember:** Every execution is a learning opportunity. The more you run chains, the smarter the system becomes at avoiding past mistakes! 🧠
