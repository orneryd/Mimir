# Quick Start Guide - Mimir Phase 1

## ✅ Services Status

All services are running and healthy:

```
✅ mimir-open-webui    → http://localhost:3000
✅ mcp_server          → http://localhost:9042  
✅ neo4j_db            → http://localhost:7474
```

## 🚀 Test the Pipeline

### Option 1: Test in Open-WebUI (Recommended)

1. **Open browser**: http://localhost:3000

2. **Create account** (first user is admin)

3. **Find the pipeline**:
   - Look for "Mimir: PM Planning Assistant (Phase 1)" in the model dropdown
   - Or go to Workspace → Models

4. **Try these prompts**:
   ```
   Build a REST API with user authentication
   
   Create a simple TODO app with React frontend
   
   Design a microservices architecture for e-commerce
   ```

5. **What to expect**:
   ```
   🔍 Testing MCP Server Connection...
   ✅ MCP Connection: OK
   
   🎯 PM Agent (Ecko): Analyzing request...
   
   ✅ PM Task Breakdown Complete!
   
   📋 TODO List ID: todoList-abc123
   📊 Tasks Created: 4 tasks
   
   ## 📝 Task Plan Summary
   Breaking project into 4 phases...
   
   ## 📋 Task List
   1. ⏳ Research authentication patterns
   2. ⏳ Design database schema
   3. ⏳ Implement API endpoints
   4. ⏳ Write integration tests
   ```

### Option 2: Test Connection via Script

```powershell
cd pipelines
python test_phase1.py
```

Expected output:
```
🔍 Testing MCP Server health...
✅ MCP Server is running

📚 Listing available MCP tools...
✅ Found 13 tools:
   - mimir_chain
   - mimir_execute
   - todo
   - todo_list
   ...

🎯 Testing mimir-chain (PM Agent)...
✅ PM Agent responded successfully

🎉 All tests passed! Pipeline is ready to use.
```

## 🔧 Configuration

### Pipeline Settings (Optional)

Go to: Open-WebUI → Workspace → Models → "Mimir: PM Planning Assistant"

Available settings:
- **MCP_SERVER_URL**: `http://mcp-server:3000` (default)
- **SHOW_PM_FULL_OUTPUT**: `true` (show full PM reasoning)
- **COLLAPSE_PM_DETAILS**: `true` (collapse by default)
- **TEST_CONNECTION_ON_STARTUP**: `true` (test on load)

## 🐛 Troubleshooting

### Pipeline not showing up?

```powershell
# Restart Open-WebUI
docker-compose restart open-webui

# Wait 10 seconds
Start-Sleep -Seconds 10

# Check pipeline is mounted
docker exec mimir-open-webui ls -la /app/pipelines/mimir_orchestrator.py
```

### Connection test fails?

```powershell
# Test from host
curl http://localhost:9042/health

# Test from container
docker exec mimir-open-webui curl http://mcp-server:3000/health

# Should return: {"status":"healthy",...}
```

### PM Agent returns ERROR?

```powershell
# Check MCP logs
docker logs mcp-server --tail 50

# Check Neo4j is running
docker ps | Select-String neo4j

# Test Neo4j connection
curl http://localhost:7474
```

### Empty response or timeout?

1. Enable full output in pipeline settings
2. Increase timeout (default: 300s)
3. Check if PM agent has access to Neo4j:
   ```powershell
   docker exec mcp_server node -e "console.log('Testing connection...')"
   ```

## 📊 Verify TODO List in Neo4j

1. Open: http://localhost:7474
2. Login: `neo4j` / `password`
3. Run query:
   ```cypher
   MATCH (list:TodoList)-[:CONTAINS]->(todo:Todo)
   RETURN list.id, list.title, collect(todo.title) as tasks
   ORDER BY list.created DESC
   LIMIT 5
   ```

## ✨ What Works in Phase 1

- ✅ MCP connection testing
- ✅ PM agent task breakdown
- ✅ TODO list creation in Neo4j
- ✅ Task display in chat
- ✅ Collapsible PM details
- ✅ Error handling
- ✅ Configuration via valves

## 🚧 What's NOT Included (Phase 2)

- ❌ Multi-agent execution
- ❌ Worker/QC agents
- ❌ Real-time task monitoring
- ❌ Progress updates
- ❌ Final report synthesis
- ❌ Memory node storage
- ❌ Sidebar UI

## 📚 More Information

- **Full README**: `pipelines/README.md`
- **Status Document**: `pipelines/PHASE1_STATUS.md`
- **Integration Plan**: `OPENWEBUI_INTEGRATION.md`

---

**Ready to test!** 🎉

Open http://localhost:3000 and try the PM agent.
