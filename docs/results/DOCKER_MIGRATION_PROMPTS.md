# Docker Migration LLM Prompts

**Project**: MCP Server Dockerization  
**Date**: 2025-10-14 (Updated)  
**Knowledge Graph ID**: `docker-project-root`

---

## Project Context

**Completed Preparatory Work:**
- ✅ Analysis Phase: Architecture docs, HTTP requirements, Docker volume strategy
- ✅ Task 1.1: Add Express & HTTP Dependencies → package.json updated
- ✅ Task 1.2: Create HTTP Server Entry Point → `src/http-server.ts` created
- ✅ Task 1.3: Implement Session Management → Session management implemented

**Remaining Work:** 3 phases, 9 tasks

---

## How to Use These Prompts

Each task below is a standalone prompt that can be given to an LLM with zero context. The LLM should:

1. Use the knowledge graph tool to retrieve the full task context: `graph_get_node('<task-id>')`
2. Execute the task based on the stored context
3. Update the task status when complete: `graph_update_node('<task-id>', {properties: {status: 'completed', completed_at: '<timestamp>'}})`
4. Store any output or findings back in the knowledge graph using `graph_update_node()`

**⚠️ CRITICAL: These are Knowledge Graph nodes, NOT TODO items. Use `graph_update_node()`, NOT `update_todo()`**

**⚠️ HTTP/JSON-RPC Format**: If calling via HTTP, use the correct MCP protocol format:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "graph_update_node",
    "arguments": {
      "id": "node-4-1760410374474",
      "properties": {
        "status": "completed",
        "completed_at": "2025-10-14T12:00:00.000Z",
        "result": "Task completed successfully"
      }
    }
  }
}
```

---

## Phase 1: Final HTTP Setup

### Task 1.1: Add Health Check Endpoint
**Task ID**: `node-4-1760410374474`

```
I need you to add a health check endpoint for Docker monitoring.

INSTRUCTIONS:
1. Retrieve task context: graph_get_node('node-4-1760410374474')
2. In src/http-server.ts, add GET /health endpoint
3. Return JSON: { "status": "healthy", "version": "3.0.0" }
4. Use this for Docker HEALTHCHECK directive later
5. Test with: curl http://localhost:3000/health
6. Update task status using KG API:
   graph_update_node('node-4-1760410374474', {
     properties: {status: 'completed', completed_at: '<timestamp>', result: 'Health endpoint added'}
   })

COMPLETED INPUTS AVAILABLE:
- src/http-server.ts (HTTP server with session management)

CONTEXT RETRIEVAL:
Start by running: graph_get_node('node-4-1760410374474')

NOTE: Quick task, < 1 hour.
```

---

## Phase 2: Docker Configuration

### Task 2.1: Create Dockerfile
**Task ID**: `node-5-1760410374474`

```
I need you to create a production-ready Dockerfile with multi-stage build.

INSTRUCTIONS:
1. Retrieve task context: graph_get_node('node-5-1760410374474')
2. Create Dockerfile with stages:
   - Stage 1: Install dependencies (FROM node:20-alpine)
   - Stage 2: Build TypeScript (npm run build)
   - Stage 3: Production image (copy only build/ and node_modules)
3. Security:
   - Use non-root user (node)
   - Set working directory /app
4. EXPOSE 3000
5. CMD ["node", "build/http-server.js"]
6. Optimize for minimal image size
7. Update task status using KG API:
   graph_update_node('node-5-1760410374474', {
     properties: {status: 'completed', completed_at: '<timestamp>', result: 'Dockerfile created'}
   })

COMPLETED INPUTS AVAILABLE:
- docs/architecture/DOCKER_VOLUME_STRATEGY.md (volume and security requirements)
- docs/architecture/CURRENT_ARCHITECTURE.md (build process)
- src/http-server.ts (HTTP server entry point)

DEPENDENCIES:
- This task depends on: Task 1.1 (Health endpoint for HEALTHCHECK)

CONTEXT RETRIEVAL:
Start by running: graph_get_node('node-5-1760410374474')

TARGET: Image size < 200MB
```

### Task 2.2: Create Docker Compose Configuration
**Task ID**: `node-6-1760410374474`

```
I need you to create a docker compose.yml for easy deployment.

INSTRUCTIONS:
1. Retrieve task context: graph_get_node('node-6-1760410374474')
2. Create docker compose.yml with:
   - Service name: mcp-server
   - Build from Dockerfile
   - Port mapping: 3000:3000
   - Volume mounts:
     * ./data:/app/data (persistence)
     * ./logs:/app/logs (optional)
   - Environment variables (from .env)
   - Restart policy: unless-stopped
   - Health check using /health endpoint
3. Test with: docker compose up
4. Update task status using KG API:
   graph_update_node('node-6-1760410374474', {
     properties: {status: 'completed', completed_at: '<timestamp>', result: 'docker compose.yml created'}
   })

COMPLETED INPUTS AVAILABLE:
- docs/architecture/DOCKER_VOLUME_STRATEGY.md (complete volume strategy)

DEPENDENCIES:
- This task depends on: Task 2.1 (Dockerfile created)

CONTEXT RETRIEVAL:
Start by running: graph_get_node('node-6-1760410374474')
```

### Task 2.3: Create Environment Configuration
**Task ID**: `node-7-1760410374474`

```
I need you to create environment variable configuration files.

INSTRUCTIONS:
1. Retrieve task context: graph_get_node('node-7-1760410374474')
2. Create .env.example with all configurable variables:
   - PORT=3000
   - MCP_MEMORY_STORE_PATH=/app/data/.mcp-memory-store.json
   - MCP_MEMORY_SAVE_INTERVAL=10
   - MCP_MEMORY_TODO_TTL=86400000
   - MCP_MEMORY_PHASE_TTL=604800000
   - MCP_MEMORY_PROJECT_TTL=-1
   - NODE_ENV=production
3. Document each variable in comments
4. Update .gitignore to exclude .env
5. Update task status using KG API:
   graph_update_node('node-7-1760410374474', {
     properties: {status: 'completed', completed_at: '<timestamp>', result: '.env.example created'}
   })

COMPLETED INPUTS AVAILABLE:
- docs/architecture/DOCKER_VOLUME_STRATEGY.md (complete env var list)

DEPENDENCIES:
- This task depends on: Task 2.1 (Dockerfile created)

CONTEXT RETRIEVAL:
Start by running: graph_get_node('node-7-1760410374474')

NOTE: Do NOT commit actual .env file with secrets
```

### Task 2.4: Create .dockerignore File
**Task ID**: `node-8-1760410374474`

```
I need you to create a .dockerignore file to optimize Docker builds.

INSTRUCTIONS:
1. Retrieve task context: graph_get_node('node-8-1760410374474')
2. Create .dockerignore with exclusions:
   - node_modules
   - build
   - .git
   - *.md (except !README.md)
   - coverage
   - testing
   - .mcp-memory-store.json
   - .env
3. Test that Docker build is faster
4. Update task status using KG API:
   graph_update_node('node-8-1760410374474', {
     properties: {status: 'completed', completed_at: '<timestamp>', result: '.dockerignore created'}
   })

DEPENDENCIES:
- This task depends on: Task 2.1 (Dockerfile created)

CONTEXT RETRIEVAL:
Start by running: graph_get_node('node-8-1760410374474')

NOTE: Quick task, reduces build context size significantly
```

---

## Phase 3: Testing & Validation

### Task 3.1: Test Docker Build
**Task ID**: `node-9-1760410374474`

```
I need you to test the Docker build process.

INSTRUCTIONS:
1. Retrieve task context: graph_get_node('node-9-1760410374474')
2. Build the image:
   docker build -t mcp-server:latest .
3. Verify:
   - Build completes without errors
   - Image size is < 200MB (docker images)
   - All files are present in /app
4. Document any issues and fixes
5. Store build output using KG API:
   graph_update_node('node-9-1760410374474', {
     properties: {
       status: 'completed',
       completed_at: '<timestamp>',
       result: 'Docker build verified',
       build_output: '<paste build output here>'
     }
   })

DEPENDENCIES:
- This task depends on: Task 2.2 (docker compose created)

CONTEXT RETRIEVAL:
Start by running: graph_get_node('node-9-1760410374474')

VALIDATION: Image must build successfully
```

### Task 3.2: Test Container Startup & Persistence
**Task ID**: `node-10-1760410374474`

```
I need you to test container startup and verify persistence works.

INSTRUCTIONS:
1. Retrieve task context: graph_get_node('node-10-1760410374474')
2. Start container: docker compose up -d
3. Check logs: docker compose logs -f
4. Create a TODO via HTTP POST to /mcp
5. Verify data/.mcp-memory-store.json created on host
6. Restart container: docker compose restart
7. Verify TODO still exists (persistence working)
8. Test failure: docker compose down && docker compose up
9. Document all test results
10. Update task status using KG API:
    graph_update_node('node-10-1760410374474', {
      properties: {
        status: 'completed',
        completed_at: '<timestamp>',
        result: 'Persistence verified across restarts',
        test_results: 'All persistence tests passed'
      }
    })

DEPENDENCIES:
- This task depends on: Task 3.1 (build tested)

CONTEXT RETRIEVAL:
Start by running: graph_get_node('node-10-1760410374474')

CRITICAL: Persistence MUST survive restarts
```

### Task 3.3: Test HTTP Endpoints
**Task ID**: `node-11-1760410374474`

```
I need you to test all MCP HTTP endpoints.

INSTRUCTIONS:
1. Retrieve task context: graph_get_node('node-11-1760410374474')
2. Test health check: curl http://localhost:3000/health
3. Test MCP endpoints via HTTP POST to /mcp:
   - initialize (get session ID)
   - create_todo
   - list_todos
   - graph_add_node
   - graph_get_stats
4. Verify session persistence across requests
5. Test error handling (invalid session, bad requests)
6. Create curl examples for documentation
7. Store test results and curl commands using KG API:
   graph_update_node('node-11-1760410374474', {
     properties: {
       status: 'completed',
       completed_at: '<timestamp>',
       result: 'All endpoints tested',
       curl_examples: '<paste examples here>'
     }
   })

DEPENDENCIES:
- This task depends on: Task 3.2 (container running)

CONTEXT RETRIEVAL:
Start by running: graph_get_node('node-11-1760410374474')

DELIVERABLE: Working curl examples for all major tools
```

### Task 3.4: Create Deployment Documentation
**Task ID**: `node-12-1760410374474`

```
I need you to write comprehensive deployment documentation.

INSTRUCTIONS:
1. Retrieve task context using the MCP tool:
   graph_get_node({"id": "node-12-1760410374474"})

2. Create: docs/DOCKER_DEPLOYMENT.md

3. Include sections:
   - Prerequisites (Docker, docker compose)
   - Quick Start (5-minute setup)
   - Configuration (all env vars explained)
   - Volume Management (backup, restore)
   - HTTP API Usage (curl examples)
   - Troubleshooting (common issues)
   - Production Deployment (recommendations)

4. Include all curl examples from testing (get them from Task 3.3)

5. Add docker compose commands reference

6. Update main README.md with Docker section

7. When complete, update task status using the KG tool:
   graph_update_node({
     "id": "node-12-1760410374474",
     "properties": {
       "status": "completed",
       "completed_at": "<ISO timestamp>",
       "result": "Deployment documentation complete"
     }
   })

DEPENDENCIES:
- This task depends on: Task 3.3 (endpoints tested)
- Get curl examples from node-11-1760410374474 (Task 3.3)

CONTEXT RETRIEVAL:
First, retrieve the task node: graph_get_node({"id": "node-12-1760410374474"})
Then, retrieve curl examples: graph_get_node({"id": "node-11-1760410374474"})

DELIVERABLE: Complete deployment guide for end users

NOTE: Use proper MCP tool call syntax with JSON objects as arguments, not JavaScript syntax.
```

---

## Quick Start for Worker LLMs

If you're an LLM picking up one of these tasks:

1. **Retrieve the task**: 
   ```
   graph_get_node('<task-id>')
   ```

2. **Check dependencies**:
   ```
   graph_get_neighbors('<task-id>', {edgeType: 'depends_on', direction: 'out'})
   ```

3. **Get phase context**:
   ```
   graph_get_subgraph('<task-id>', {depth: 2})
   ```

4. **Execute the task** using the instructions in the prompt above

5. **Update status when complete** (⚠️ Use KG API, NOT TODO API):
   ```
   graph_update_node('<task-id>', {
     properties: {
       status: 'completed',
       completed_at: '2025-10-14T02:00:00.000Z',
       result: 'Brief description of what was accomplished'
     }
   })
   ```

---

## Project Overview

**Knowledge Graph Structure**:
- Project Node: `docker-project-root`
- 3 Phase Nodes: Phase 1 (Final HTTP Setup), Phase 2 (Docker Config), Phase 3 (Testing)
- 9 Task Nodes: 1.1, 2.1-2.4, 3.1-3.4
- All tasks have `depends_on` edges for proper sequencing

**To view the entire plan**:
```
graph_get_subgraph('docker-project-root', {depth: 3, linearize: true})
```

**To see pending tasks**:
```
graph_query_nodes({type: 'task', properties: {status: 'pending'}})
```

---

## ⚠️ Critical API Usage Notes

**These tasks are Knowledge Graph nodes (type: 'task'), NOT TODO items!**

**✅ CORRECT - Use KG API:**
```javascript
// Get task
graph_get_node('node-4-1760410374474')

// Update status to completed
graph_update_node('node-4-1760410374474', {
  properties: {
    status: 'completed',
    completed_at: '2025-10-14T02:00:00.000Z',
    result: 'Health endpoint added successfully'
  }
})

// Check dependencies
graph_get_neighbors('node-4-1760410374474', {edgeType: 'depends_on'})

// Query all tasks
graph_query_nodes({type: 'task', properties: {status: 'pending'}})
```

**❌ WRONG - Don't use TODO API:**
```javascript
update_todo('node-4-1760410374474', ...) // ❌ Will fail - not a TODO
list_todos({status: 'pending'}) // ❌ Won't find KG tasks
get_todo('node-4-1760410374474') // ❌ Wrong API
```

---

## 🌐 HTTP/JSON-RPC Protocol Format

If you're calling the MCP server via HTTP (e.g., using curl or a script), you MUST use the correct JSON-RPC 2.0 format:

### ✅ Correct HTTP Request Format

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: <your-session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "graph_update_node",
      "arguments": {
        "id": "node-4-1760410374474",
        "properties": {
          "status": "completed",
          "completed_at": "2025-10-14T12:00:00.000Z",
          "result": "Health endpoint added successfully"
        }
      }
    }
  }'
```

### Key Points:

1. **Method is always `"tools/call"`** - Not the tool name directly
2. **Tool name goes in `params.name`** - e.g., `"graph_update_node"`
3. **Tool arguments go in `params.arguments`** - The actual parameters for the tool
4. **Session ID header required** - `X-Session-ID` header for persistent sessions
5. **JSON-RPC 2.0 format** - Include `"jsonrpc": "2.0"` and `"id"`

### ❌ Wrong HTTP Request Format

```bash
# DON'T DO THIS - Method cannot be the tool name directly
curl -X POST http://localhost:3000/mcp \
  -d '{
    "method": "graph_update_node",
    "params": { "id": "...", "properties": {...} }
  }'
```

### Example: Retrieving a Task

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: <your-session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "graph_get_node",
      "arguments": {
        "id": "node-10-1760410374474"
      }
    }
  }'
```

### Example: Querying Pending Tasks

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: <your-session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "graph_query_nodes",
      "arguments": {
        "type": "task",
        "properties": {
          "status": "pending"
        }
      }
    }
  }'
```

### Getting a Session ID

First, initialize a session:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 0,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "worker-agent",
        "version": "1.0.0"
      }
    }
  }'
```

The response will include a session ID in the `X-Session-ID` response header. Use this in all subsequent requests.

---

**Last Updated**: 2025-10-14  
**PM**: Claude (Claudette v5.2)  
**Status**: Ready for Worker Execution - Starting at Task 1.1 (Health Check Endpoint)
