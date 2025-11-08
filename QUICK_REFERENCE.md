# Mimir + Open-WebUI Quick Reference

## 🚀 Start/Stop

```powershell
# Start everything
.\start-openwebui.ps1

# Stop everything
docker-compose down

# View logs
docker-compose logs -f

# Restart just Open-WebUI
docker-compose restart open-webui
```

## 🌐 Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **Open-WebUI** | http://localhost:3000 | Create on first visit |
| **Neo4j Browser** | http://localhost:7474 | neo4j / password |
| **MCP Server Health** | http://localhost:9042/health | N/A |

## 📋 Workflow Steps

### 1. PM Creates TODO List
```
User sends request
  ↓
mimir-chain (PM agent)
  ↓
TODO list created in Neo4j
  ↓
Returns: todoList-xyz
```

### 2. Parallel Execution
```
mimir-execute receives plan
  ↓
Agents claim tasks
  ↓
Execute in parallel
  ↓
QC verifies each
```

### 3. Real-Time Updates
```
Pipeline polls Neo4j (1s interval)
  ↓
Streams task completions to UI
  ↓
Shows key decisions
  ↓
Collapsible details
```

### 4. Final Report
```
All tasks complete
  ↓
Synthesize report
  ↓
Save to memory node
  ↓
Display in chat
```

## 🎨 UI Elements

### Sidebar Format
```
🎯 Workflow Status
Progress bar (0-100%)
├─ ✅ Completed task
├─ ⚙️ In progress task  ← Active
└─ ⏳ Pending task

Active Agents
● WORKER (2)
● QC (1)
```

### Chat Format
```
🎯 PM Agent: ...          [Highlighted]
✅ PM Summary: ...        [Highlighted]
[PM Details] ▸           [Collapsible]

⚡ Starting Execution...  [Highlighted]

✅ Task Complete: ...     [Highlighted]
💡 Key Output: ...        [Normal]
[Task Details] ▸         [Collapsible]

📊 Final Report          [Highlighted]
... report content ...
💾 Saved: memory-xyz     [Highlighted]
```

## ⚙️ Pipeline Configuration

Edit in Open-WebUI: **Workspace → Models → Mimir**

```python
MCP_SERVER_URL = "http://mcp-server:3000"
SHOW_AGENT_CHATTER = True
COLLAPSE_AGENT_DETAILS = True
POLL_INTERVAL_MS = 1000
```

## 🔧 Common Tasks

### Test MCP Connection
```bash
docker exec mimir-open-webui \
  curl http://mcp-server:3000/health
```

### Check Pipeline Mounted
```bash
docker exec mimir-open-webui \
  ls -la /app/pipelines/mimir_orchestrator.py
```

### Query Neo4j
```bash
docker exec neo4j_db \
  cypher-shell -u neo4j -p password \
  "MATCH (t:Todo) RETURN count(t)"
```

### View Pipeline Logs
```bash
docker logs mimir-open-webui -f --tail 100
```

## 🐛 Quick Fixes

### Pipeline Not Loading
```bash
# Check file exists
docker exec mimir-open-webui cat /app/pipelines/mimir_orchestrator.py

# Restart Open-WebUI
docker-compose restart open-webui
```

### MCP Server Not Responding
```bash
# Check health
curl http://localhost:9042/health

# Restart MCP server
docker-compose restart mcp-server
```

### Neo4j Connection Failed
```bash
# Verify Neo4j is up
docker logs neo4j_db --tail 50

# Test connection
docker exec neo4j_db cypher-shell -u neo4j -p password "RETURN 1"
```

## 📊 File Structure

```
GRAPH-RAG-TODO/
├── pipelines/
│   ├── mimir_orchestrator.py  ← Main pipeline
│   └── README.md              ← Detailed docs
├── docker-compose.yml         ← Services config
├── start-openwebui.ps1        ← Windows start
├── start-openwebui.sh         ← Linux/Mac start
└── OPENWEBUI_INTEGRATION.md   ← This summary
```

## 🎯 Example Prompts

### Simple Task
```
Build a REST API with Express.js
```

### Complex Workflow
```
Create a full-stack app with:
- React frontend
- Node.js backend
- PostgreSQL database
- JWT authentication
- Docker deployment
```

### Specific Requirements
```
Implement a microservices architecture with:
- API Gateway (Kong)
- User service (Node.js)
- Product service (Python)
- Message queue (RabbitMQ)
- Monitoring (Prometheus + Grafana)
```

## 💡 Pro Tips

1. **Watch the sidebar** - Real-time task progress
2. **Expand details** - Click collapsible sections for full context
3. **Check memory bank** - Workflows never get summarized out
4. **Use specific prompts** - More detail = better task breakdown
5. **Monitor logs** - Watch agents work in real-time

## 📚 Documentation Links

- [Pipeline README](pipelines/README.md) - Full usage guide
- [Architecture](docs/architecture/MULTI_AGENT_GRAPH_RAG.md) - System design
- [Open-WebUI Docs](https://docs.openwebui.com/) - UI features
- [MCP Protocol](https://spec.modelcontextprotocol.io/) - Integration spec

## 🎉 Key Benefits

✅ **No custom UI code** - Leverage 114k star project  
✅ **Production ready** - Battle-tested by thousands  
✅ **Real-time updates** - See agents work in parallel  
✅ **Permanent storage** - Never lose workflow history  
✅ **Mobile friendly** - Works on all devices  
✅ **Zero configuration** - Works out of the box  

---

**Quick Start**: `.\start-openwebui.ps1` → Open http://localhost:3000 → Start chatting! 🚀
