[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / api/orchestration-api

# api/orchestration-api

## Description

Multi-agent orchestration API with workflow execution

Provides HTTP endpoints for managing multi-agent workflows with
PM → Worker → QC agent chains. Supports workflow execution, monitoring,
and real-time progress updates via Server-Sent Events (SSE).

**Features:**
- Workflow execution from JSON definitions
- Real-time progress updates via SSE
- Agent preamble generation (Agentinator)
- Execution state persistence
- Multi-agent coordination

**Endpoints:**
- `POST /api/orchestration/execute` - Execute a workflow
- `GET /api/orchestration/status/:executionId` - Get execution status
- `GET /api/orchestration/sse/:executionId` - SSE stream for updates
- `POST /api/orchestration/generate-preamble` - Generate agent preambles

## Example

```typescript
// Execute a workflow
fetch('/api/orchestration/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workflow: {
      name: 'Feature Implementation',
      agents: [/* agent configs //]
    }
  })
});
```

## Functions

### createOrchestrationRouter()

> **createOrchestrationRouter**(`graphManager`): `Router`

Defined in: src/api/orchestration-api.ts:97

Create Express router for orchestration API endpoints

Provides HTTP endpoints for multi-agent orchestration, workflow execution,
and agent management. Includes endpoints for:
- Agent listing and search
- Workflow execution (PM → Workers → QC)
- Task management
- Agent preamble retrieval
- Vector search integration

#### Parameters

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

Graph manager instance for Neo4j operations

#### Returns

`Router`

Configured Express router with all orchestration endpoints

#### Example

```ts
import express from 'express';
import { GraphManager } from './managers/GraphManager.js';
import { createOrchestrationRouter } from './api/orchestration-api.js';

const app = express();
const graphManager = new GraphManager(driver);

// Mount orchestration routes
app.use('/api', createOrchestrationRouter(graphManager));

// Available endpoints:
// GET  /api/agents - List agents with search
// POST /api/execute-workflow - Execute multi-agent workflow
// GET  /api/tasks/:id - Get task status
// POST /api/vector-search - Semantic search
```
