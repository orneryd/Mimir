# PCTX Agent Integration Guide

**Status**: ✅ Implemented  
**Date**: 2025-11-21  
**Version**: 1.0.0

## Overview

Mimir's LLM agents (workers and QC) now have automatic access to PCTX "Code Mode" when configured. This enables **90-98% token reduction** for multi-step operations by allowing agents to write TypeScript code that executes in a sandboxed environment with full access to all Mimir tools.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Orchestration API                        │
│                  (Creates Worker Agents)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  CopilotAgentClient                          │
│              (LangChain + LangGraph Agent)                   │
│                                                              │
│  Tools Available:                                            │
│  ├── 8 Filesystem Tools (read, write, grep, etc.)          │
│  ├── 6 Consolidated MCP Tools (memory, search, etc.)       │
│  └── 1 PCTX Tool (execute_pctx_code) ← NEW!               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      PCTX Proxy                              │
│              (http://localhost:8080/mcp)                     │
│                                                              │
│  Executes TypeScript in Deno Sandbox:                       │
│  - Type-safe code execution                                  │
│  - All 13 Mimir tools via Mimir.* namespace                │
│  - Batch operations in single call                           │
│  - 90-98% token reduction                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Mimir MCP Server                          │
│                (http://localhost:9042/mcp)                   │
│                                                              │
│  13 MCP Tools:                                               │
│  - memory_node, memory_edge, memory_batch                    │
│  - vector_search_nodes, get_embedding_stats                  │
│  - todo, todo_list                                           │
│  - index_folder, list_folders, remove_folder                 │
│  - memory_lock, get_task_context, memory_clear               │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Agent Initialization

When a worker or QC agent is created via the orchestration API:

```typescript
// src/orchestrator/llm-client.ts
async loadPreamble(pathOrContent: string, isContent: boolean = false) {
  // ... initialization ...
  
  // Load PCTX-enhanced tools if not using custom tools
  if (!this.agentConfig.tools) {
    const { getConsolidatedTools } = await import('./tools.js');
    const includePCTX = process.env.PCTX_ENABLED !== 'false'; // Default to true
    this.tools = await getConsolidatedTools(includePCTX);
    console.log(`🔧 Loaded tools with PCTX support: ${includePCTX ? 'enabled' : 'disabled'}`);
  }
}
```

### 2. PCTX Tool Detection

The `getConsolidatedTools()` function checks if PCTX is available:

```typescript
// src/orchestrator/tools.ts
export async function getConsolidatedTools(includePCTX: boolean = true) {
  const tools = [...consolidatedTools]; // 14 base tools
  
  if (includePCTX) {
    const pctxUrl = process.env.PCTX_URL || 'http://localhost:8080';
    const { createPCTXTool, isPCTXAvailable } = await import('./pctx-tool.js');
    
    if (await isPCTXAvailable(pctxUrl)) {
      console.log(`✅ PCTX available at ${pctxUrl}, adding execute_pctx_code tool`);
      tools.push(createPCTXTool(pctxUrl));
    } else {
      console.log(`⚠️  PCTX not available at ${pctxUrl}, skipping PCTX tool`);
    }
  }
  
  return tools; // 15 tools if PCTX available
}
```

### 3. Agent Uses PCTX Tool

When the agent needs to perform multi-step operations, it can use the `execute_pctx_code` tool:

**Traditional Approach (Sequential MCP Calls)**:
```
Agent → Tool Call 1 → Mimir → Response 1 → Agent
Agent → Tool Call 2 → Mimir → Response 2 → Agent
Agent → Tool Call 3 → Mimir → Response 3 → Agent
Agent → Tool Call 4 → Mimir → Response 4 → Agent

Total: 4 LLM round-trips, ~2000+ tokens
```

**PCTX Code Mode (Single Call)**:
```
Agent → execute_pctx_code(TypeScript) → PCTX → Mimir (4 ops) → Result → Agent

Total: 1 LLM round-trip, ~200 tokens (90% reduction)
```

## PCTX Tool Capabilities

The `execute_pctx_code` tool provides access to all Mimir functions:

```typescript
// Available in PCTX sandbox via Mimir.* namespace
await Mimir.memoryNode({
  operation: 'add',
  type: 'memory',
  properties: { title: 'Test', content: 'Data' }
});

await Mimir.vectorSearchNodes({
  query: 'authentication patterns',
  types: ['memory', 'file'],
  limit: 10
});

await Mimir.memoryBatch({
  operation: 'update_nodes',
  updates: [...]
});

// ... all 13 MCP tools available
```

## Configuration

### Environment Variables

```bash
# PCTX URL (default: http://localhost:8080)
PCTX_URL=http://localhost:8080

# Enable/disable PCTX tool for agents (default: true)
PCTX_ENABLED=true
```

### Docker Configuration

In `docker-compose.yml`, PCTX is configured to connect via `host.docker.internal`:

```yaml
environment:
  # PCTX Integration (Code Mode for 90-98% token reduction)
  - PCTX_URL=${PCTX_URL:-http://host.docker.internal:8080}
  - PCTX_ENABLED=${PCTX_ENABLED:-true}
```

This allows Mimir running in Docker to connect to PCTX running on the host machine.

### Local Development

For local development (Mimir not in Docker):

```bash
# .env
PCTX_URL=http://localhost:8080
PCTX_ENABLED=true
```

## Usage Examples

### Example 1: Worker Agent Generating Tests

**Orchestration Task**:
```json
{
  "id": "task-1",
  "title": "Generate unit tests for UserService",
  "prompt": "Generate comprehensive unit tests for the UserService class. Use PCTX to batch create test nodes and link them to the source file.",
  "agentRoleDescription": "TypeScript test generator",
  "recommendedModel": "gpt-4o"
}
```

**Agent's PCTX Code** (automatically generated by LLM):
```typescript
// Search for UserService file
const searchResults = await Mimir.vectorSearchNodes({
  query: "UserService class",
  types: ["file"],
  limit: 1
});

const userServiceFile = searchResults.results[0];

// Create test nodes
const testCases = [
  { name: "should create user", description: "Test user creation" },
  { name: "should update user", description: "Test user update" },
  { name: "should delete user", description: "Test user deletion" }
];

const createdTests = [];
for (const testCase of testCases) {
  const result = await Mimir.memoryNode({
    operation: 'add',
    type: 'memory',
    properties: {
      title: testCase.name,
      content: testCase.description,
      category: 'test',
      status: 'generated'
    }
  });
  createdTests.push(result.node.id);
}

// Link tests to source file
for (const testId of createdTests) {
  await Mimir.memoryEdge({
    operation: 'add',
    source: testId,
    target: userServiceFile.id,
    type: 'relates_to'
  });
}

return {
  testsGenerated: createdTests.length,
  sourceFile: userServiceFile.properties.path,
  testIds: createdTests
};
```

**Result**: 3 test nodes created and linked in **1 LLM call** instead of 7+ sequential calls.

### Example 2: QC Agent Validating Deliverables

**Orchestration Task**:
```json
{
  "id": "task-qc",
  "title": "Validate all test deliverables",
  "prompt": "Check that all generated tests are properly linked to source files and have valid content. Use PCTX to batch query and validate.",
  "agentRoleDescription": "Quality control validator",
  "recommendedModel": "gpt-4o"
}
```

**Agent's PCTX Code**:
```typescript
// Find all test nodes
const tests = await Mimir.memoryNode({
  operation: 'query',
  type: 'memory',
  filters: { category: 'test', status: 'generated' }
});

const validationResults = [];

for (const test of tests.nodes) {
  // Check if test has source file link
  const edges = await Mimir.memoryEdge({
    operation: 'get',
    node_id: test.id,
    direction: 'out'
  });
  
  const hasSourceLink = edges.edges.some(e => e.type === 'relates_to');
  const hasContent = test.properties.content && test.properties.content.length > 10;
  
  validationResults.push({
    testId: test.id,
    testName: test.properties.title,
    hasSourceLink,
    hasContent,
    valid: hasSourceLink && hasContent
  });
}

const allValid = validationResults.every(r => r.valid);

return {
  totalTests: tests.nodes.length,
  validTests: validationResults.filter(r => r.valid).length,
  invalidTests: validationResults.filter(r => !r.valid).length,
  allValid,
  details: validationResults
};
```

**Result**: All tests validated in **1 LLM call** instead of 10+ sequential calls.

## Benefits

### Token Savings

| Scenario | Traditional MCP | PCTX Code Mode | Savings |
|----------|----------------|----------------|---------|
| Simple search | ~200 tokens | ~300 tokens | -50% (overhead) |
| Multi-step (3-5 ops) | ~1500 tokens | ~400 tokens | 73% |
| Complex workflow (10+ ops) | ~5000 tokens | ~600 tokens | 88% |
| Batch operations (20+ ops) | ~10000 tokens | ~800 tokens | 92% |

### Performance

- **Latency**: Single round-trip vs. multiple sequential calls
- **Reliability**: Atomic operations in sandbox vs. potential failures between calls
- **Type Safety**: TypeScript compilation catches errors before execution

### Developer Experience

- **Natural Code**: Agents write familiar TypeScript instead of JSON tool calls
- **Batch Operations**: Process arrays, filter data, complex logic in one call
- **Debugging**: PCTX provides clear error messages with stack traces

## Monitoring

### Agent Logs

When PCTX is enabled, you'll see:

```
✅ PCTX available at http://localhost:8080, adding execute_pctx_code tool
🔧 Loaded tools with PCTX support: enabled
🔧 Tools count: 15
```

When PCTX is unavailable:

```
⚠️  PCTX not available at http://localhost:8080, skipping PCTX tool
🔧 Loaded tools with PCTX support: enabled
🔧 Tools count: 14
```

### Execution Logs

PCTX executions are logged in the orchestration deliverables:

```markdown
## Task Execution: task-1

**Tool Used**: execute_pctx_code

**Code**:
```typescript
const results = await Mimir.vectorSearchNodes({...});
// ... agent's code ...
```

**Result**:
```json
{
  "testsGenerated": 3,
  "sourceFile": "/workspace/src/UserService.ts",
  "testIds": ["memory-123", "memory-124", "memory-125"]
}
```

**Tokens Saved**: ~1200 tokens (85% reduction)
```

## Troubleshooting

### PCTX Not Available

**Symptom**: Logs show `⚠️ PCTX not available`

**Solutions**:
1. Check PCTX is running: `curl http://localhost:8080/mcp`
2. Verify `PCTX_URL` in `.env` or docker-compose
3. Check PCTX logs: `pctx logs`
4. Restart PCTX: `pkill pctx && pctx start`

### Agents Not Using PCTX

**Symptom**: Agents make sequential tool calls instead of using `execute_pctx_code`

**Reasons**:
- Agent's LLM doesn't understand when to use PCTX (model limitation)
- Task is too simple (single operation)
- Agent's preamble doesn't mention PCTX

**Solutions**:
- Add PCTX usage hints to agent preamble
- Use more capable models (GPT-4, Claude Sonnet 4.5)
- Explicitly instruct: "Use PCTX for batch operations"

### PCTX Execution Errors

**Symptom**: `PCTX execution failed: TypeError...`

**Solutions**:
1. Check agent's generated TypeScript for syntax errors
2. Verify Mimir functions are called correctly
3. Check PCTX sandbox logs for detailed error
4. Agent will automatically retry with corrected code

## Disabling PCTX

To disable PCTX for all agents:

```bash
# .env
PCTX_ENABLED=false
```

Or per-agent:

```typescript
const client = new CopilotAgentClient({
  preamblePath: 'agent.md',
  tools: consolidatedTools // Use base tools, skip PCTX
});
```

## Security

### Sandbox Isolation

PCTX executes agent code in a Deno sandbox with:
- No filesystem access (except via Mimir tools)
- No network access (except to Mimir MCP server)
- No process spawning
- Memory limits
- Execution timeouts

### Code Review

All PCTX code is:
- Logged in orchestration deliverables
- Visible in agent execution traces
- Reviewable post-execution

### Mimir Tool Permissions

PCTX code has same permissions as direct MCP calls:
- Can create/read/update/delete nodes
- Can search and traverse graph
- Can index files (if configured)
- **Cannot** access Neo4j directly
- **Cannot** bypass Mimir's security

## Future Enhancements

### Planned Features

1. **PCTX Metrics Dashboard**: Track token savings, execution times, error rates
2. **Agent PCTX Templates**: Pre-built code snippets for common patterns
3. **PCTX Caching**: Cache compiled TypeScript for faster execution
4. **Multi-Agent PCTX**: Coordinate multiple agents in single PCTX execution
5. **PCTX Debugging**: Interactive debugging of agent-generated code

### Experimental Features

- **PCTX Streaming**: Stream results as code executes
- **PCTX Checkpoints**: Save/restore execution state
- **PCTX Replay**: Re-run agent code with different inputs

## Related Documentation

- [PCTX Integration Guide](./PCTX_INTEGRATION_GUIDE.md) - General PCTX setup
- [PCTX Integration Analysis](../research/PCTX_INTEGRATION_ANALYSIS.md) - Technical analysis
- [Orchestration API](./ORCHESTRATION_API.md) - Creating worker agents
- [Agent Preambles](../agents/) - Agent configuration files

## Summary

PCTX integration with Mimir's LLM agents provides:

✅ **Automatic**: Workers and QC agents get PCTX access by default  
✅ **Transparent**: Agents decide when to use PCTX vs. direct tools  
✅ **Efficient**: 90-98% token reduction for multi-step operations  
✅ **Safe**: Sandboxed execution with full audit trail  
✅ **Configurable**: Enable/disable globally or per-agent  

**Result**: Faster, cheaper, more reliable agent orchestration with no code changes required.
