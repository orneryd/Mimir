# Mimir Open-WebUI Integration

This directory contains the **Mimir Planning Assistant Pipeline** for Open-WebUI.

## 🎯 Current Status: Phase 1 Only

**Focus**: Proving MCP connection + PM Agent task breakdown

This simplified pipeline focuses on:
1. ✅ Testing MCP server connectivity
2. ✅ PM Agent (Ecko) creates task breakdown
3. ✅ Displays TODO list in chat
4. ✅ Saves plan to Neo4j

**Not included yet** (Phase 2):
- ❌ Multi-agent execution
- ❌ Real-time monitoring
- ❌ Final report synthesis
- ❌ Sidebar updates

## 📂 Files

- `mimir_orchestrator.py` - Simplified Phase 1 pipeline
- `test_phase1.py` - Connection test script
- `README.md` - This file

## 🚀 Quick Start

### 1. Start Services

```powershell
# From repo root
docker-compose up -d

# Wait 30 seconds for services to initialize
Start-Sleep -Seconds 30
```

### 2. Test MCP Connection (Recommended)

```powershell
# Run test script
cd pipelines
python test_phase1.py
```

Expected output:
```
🔍 Testing MCP Server health...
✅ MCP Server is running

📚 Listing available MCP tools...
✅ Found 15 tools:
   - mimir_chain
   - mimir_execute
   - todo
   - todo_list
   ...

🎯 Testing mimir-chain (PM Agent)...
✅ PM Agent responded successfully
```

### 3. Access Open-WebUI

Open browser: `http://localhost:3000`

1. Create an account (first user is admin)
2. Look for "Mimir: PM Planning Assistant (Phase 1)" in models list
3. Select it and start chatting

### 4. Test PM Agent

Try these prompts:
```
Build a REST API with user authentication

Create a simple TODO app with React frontend

Design a microservices architecture for e-commerce
```

Expected flow:
```
User: Build a REST API with user authentication

🔍 Testing MCP Server Connection...
✅ MCP Connection: OK

🎯 PM Agent (Ecko): Analyzing request and creating task breakdown...

✅ PM Task Breakdown Complete!

📋 TODO List ID: `todoList-abc123`
📊 Tasks Created: 4 tasks

## 📝 Task Plan Summary

Breaking project into 4 phases:
1. Research authentication patterns
2. Design database schema
3. Implement API endpoints
4. Write integration tests

## 📋 Task List

1. ⏳ **Research authentication patterns**
   - Evaluate JWT vs session-based auth
2. ⏳ **Design database schema**
   - Create users, roles, and sessions tables
3. ⏳ **Implement API endpoints**
   - POST /auth/login, /auth/logout, /auth/refresh
4. ⏳ **Write integration tests**
   - Test auth flow end-to-end

---

## 🎯 Next Steps

The task plan has been saved to Neo4j.

**Options:**
1. Review and edit tasks in Neo4j before execution
2. Run `mimir-execute` to start multi-agent execution (coming in Phase 2)
3. Query the plan: `Show me the tasks in list todoList-abc123`

💡 **Workflow saved at**: 2025-11-05T12:34:56.789Z
```

## 🎨 UI Features

### Sidebar (Left Panel)
```
┌──────────────────────────┐
│ 🎯 Mimir Workflow        │
│ ⚙️ Executing (45%)       │
│ ▓▓▓▓▓░░░░░               │
├──────────────────────────┤
│ ✅ Research options      │
│    └─ ecko              │
│ ⚙️ Design schema         │
│    └─ worker (active)   │
│ ⏳ Implement endpoints   │
│    └─ worker            │
│ ⏳ Write tests           │
│    └─ worker            │
├──────────────────────────┤
│ Active Agents            │
│ ● WORKER (2 active)     │
│ ● QC (1 active)         │
└──────────────────────────┘
```

### Main Chat (Right Panel)
```
User: Build a REST API...

🎯 PM Agent: Analyzing request...
✅ PM Summary: Breaking into 4 phases
📋 TODO List ID: todoList-1234 (4 tasks)

[PM Agent Full Reasoning] ▸

⚡ Starting Parallel Execution
🤖 Spawning Worker/QC Agents

✅ Task Completed: Research options (by ecko)
💡 Key Output: JWT with refresh tokens recommended

[Task Details: Research options] ▸

⚙️ Task In Progress: Design schema (by worker)
✅ Task Completed: Design schema (by worker)
💡 Key Output: PostgreSQL with normalized tables

---

📊 Final Report Agent: Synthesizing...

# 📊 Mimir Workflow Final Report
... complete summary ...

💾 Saving workflow to memory bank...
✅ Workflow saved: Memory node memory-1-xyz
```

## ⚙️ Configuration

Edit pipeline settings in Open-WebUI:

1. Go to **Workspace → Models**
2. Click "Mimir: PM Planning Assistant (Phase 1)"
3. Adjust **Valves** (settings):

| Setting | Default | Description |
|---------|---------|-------------|
| `MCP_SERVER_URL` | `http://mcp-server:3000` | MCP server endpoint |
| `SHOW_PM_FULL_OUTPUT` | `true` | Show complete PM reasoning |
| `COLLAPSE_PM_DETAILS` | `true` | Collapse PM output by default |
| `TEST_CONNECTION_ON_STARTUP` | `true` | Test MCP on pipeline load |

## 🔧 How It Works

### Connection Test
```python
GET {MCP_SERVER_URL}/health
→ Returns 200 if MCP server is running
```

### PM Agent Call
```python
POST {MCP_SERVER_URL}/message
Body:
{
  "method": "tools/call",
  "params": {
    "name": "mimir_chain",
    "arguments": {
      "task": "User's request",
      "agent_type": "pm",
      "create_todos": true
    }
  }
}
→ PM analyzes request
→ Creates TODO list in Neo4j
→ Returns task breakdown
```

### Response Parsing
```python
# Pipeline extracts:
- todo_list_id: "todoList-xyz"
- tasks: [{title, description, status}, ...]
- summary: "Breaking into N phases..."
```

## 🐛 Troubleshooting

### Pipeline Not Showing Up in Open-WebUI

```powershell
# Check pipeline is mounted
docker exec mimir-open-webui ls -la /app/pipelines

# Should see: mimir_orchestrator.py
```

**Fix**: Restart Open-WebUI container
```powershell
docker-compose restart open-webui
```

### MCP Connection Failed

```powershell
# Check MCP server is running
docker ps | Select-String mcp-server

# Test from host
curl http://localhost:3000/health

# Test from inside Open-WebUI
docker exec mimir-open-webui curl http://mcp-server:3000/health
```

**Common issues**:
1. MCP server not started: `docker-compose up -d mcp-server`
2. Wrong network: Check `docker-compose.yml` network config
3. Port conflict: Check `docker ps` for port 3000

### PM Agent Returns ERROR

Check MCP server logs:
```powershell
docker logs mcp-server --tail 50
```

Common errors:
- `mimir_chain tool not found` → MCP server needs restart
- `Neo4j connection failed` → Check Neo4j is running
- `Timeout` → Increase timeout in pipeline (default: 300s)

### Empty Task List

PM response might not include TODO list ID. Enable full output:
1. Open-WebUI → Workspace → Models
2. Find "Mimir: PM Planning Assistant"
3. Set `SHOW_PM_FULL_OUTPUT` = `true`
4. Set `COLLAPSE_PM_DETAILS` = `false`
5. Try again and inspect full PM output

### Test Manually

Run test script:
```powershell
cd pipelines
python test_phase1.py
```

This tests:
- MCP health endpoint
- Tool listing
- mimir-chain call
- Response parsing

## 📚 Architecture

```
User Input in Open-WebUI
         ↓
mimir_orchestrator.py (Phase 1 Pipeline)
         ↓
   [Test Connection]
         ↓
   MCP Server (HTTP Transport)
         ↓
   mimir-chain tool
         ↓
   PM Agent (Ecko)
         ↓
   Creates TODO list in Neo4j
         ↓
   Returns task breakdown
         ↓
   Pipeline displays in chat
```

**Phase 2 (Future)**: Add Worker/QC agents, real-time monitoring, final reports

## 🎯 Design Decisions

1. **Why simplify to Phase 1?**
   - Prove MCP connection works first
   - Test PM agent in isolation
   - Easier debugging
   - Build confidence before adding complexity

2. **Why Open-WebUI?**
   - 114k GitHub stars (production-ready)
   - Zero UI code needed
   - Native chat interface
   - Easy customization via Pipelines

3. **Why Python Pipeline vs Function?**
   - Pipelines = Workflow orchestration (our use case)
   - Functions = UI extensions (not needed yet)

4. **Why HTTP transport for MCP?**
   - Docker-friendly (no stdio complexity)
   - Easy to test with curl
   - Works across containers
   - Standard JSON-RPC protocol

## 🚀 Next Steps (Phase 2)

Once Phase 1 is stable:

1. ✅ Add `mimir-execute` call
2. ✅ Implement task monitoring loop
3. ✅ Add real-time progress updates
4. ✅ Create final report synthesis
5. ✅ Save to memory nodes
6. ✅ Add sidebar UI components

## 📖 Related Documentation

- [Open-WebUI Pipelines Docs](https://github.com/open-webui/pipelines)
- [Mimir Architecture](../docs/architecture/MULTI_AGENT_GRAPH_RAG.md)
- [MCP Protocol Spec](https://spec.modelcontextprotocol.io/)
- [Integration Summary](../OPENWEBUI_INTEGRATION.md)

---

**Version**: 1.0.0-phase1  
**Last Updated**: 2025-11-05  
**Status**: Phase 1 - PM Agent Testing  
**Maintainer**: Mimir Development Team
