# Mimir Quick Start Guide

Get Mimir running in 10 minutes with step-by-step instructions.

## Prerequisites

Before starting, install these tools:

- **Docker Desktop** (with > 2 GB RAM allocated) → https://www.docker.com/products/docker-desktop/
- **Node.js 18+** → https://nodejs.org/
- **Git** → https://git-scm.com/
- **GitHub Copilot Subscription** (Individual, Business, or Enterprise)

> 💡 **Docker Memory**: Mimir requires Docker Desktop with ** > 2 GB RAM** allocated. Check: Docker Desktop → Settings → Resources → Memory

---

## Step 1: Clone Repository

```bash
git clone https://github.com/orneryd/Mimir.git
cd Mimir
```

---

## Step 2: Configure Environment

```bash
# Copy the example environment file
cp env.example .env

# (Optional) Edit .env to customize settings
# Default Neo4j password is "password" - change for production!
# Default workspace path is ~/src - change if needed
```

**Key settings in `.env`:**
```bash
NEO4J_PASSWORD=password          # Change in production!
HOST_WORKSPACE_ROOT=~/src        # Your code workspace
```

---

## Step 3: Build Docker Images

```bash
# Build the MCP server Docker image
npm run build:docker
```

This command:
- Builds the TypeScript MCP server
- Creates a Docker image with all dependencies
- Takes 2-5 minutes on first run

---

## Step 4: Start All Services

```bash
# Start Neo4j, Copilot API, MCP Server, and Open-WebUI
docker compose up
```

> ⚠️ **Important**: Do NOT use `-d` (detached mode) on first run. You need to see the logs for authentication.

You'll see logs from multiple services starting up. **This is normal:**
- `neo4j_db` - Database initialization
- `copilot_api_server` - GitHub authentication
- `mcp_server` - MCP server startup
- `mimir-open-webui` - Web interface

---

## Step 5: Authenticate with GitHub Copilot

### If Already Logged In

If you see this message, you're good to go:
```
copilot_api_server  | ✔ Logged in as <your-github-username>
copilot_api_server  | ℹ Available models:
copilot_api_server  | - gpt-4.1
copilot_api_server  | - gpt-4o
copilot_api_server  | - o1-preview
```

**Skip to Step 6!**

### If NOT Logged In

You'll see this message (possibly intermixed with Neo4j logs):

```
copilot_api_server  | ℹ Not logged in, getting new access token
copilot_api_server  | ℹ Please enter the code "HD56-PAQW" in https://github.com/login/device
```

**Follow these steps QUICKLY (you have ~5 minutes):**

1. **Copy the 8-digit code** (e.g., `HD56-PAQW`)
2. **Open the URL** in your browser: https://github.com/login/device
3. **Paste the code** and authorize GitHub Copilot
4. **Wait for confirmation** in the terminal:
   ```
   copilot_api_server  | ✔ Logged in as <your-github-username>
   ```

> 💡 **Tip**: The logs might be intermixed with Neo4j startup messages. Look for lines starting with `copilot_api_server`.

> ⏱️ **Timing**: If you authenticate fast enough (within 1-2 minutes), the health checks will pass automatically. If you're too slow, you may need to restart: `docker compose restart copilot-api`

---

## Step 6: Verify Services Are Running

Once all services are healthy, you should see:

```
copilot_api_server  | ✔ Logged in as <username>
copilot_api_server  | ℹ Available models: ...
mcp_server          | MCP server listening on port 3000
neo4j_db            | Started.
```

**Check service status:**
```bash
# In a new terminal (keep docker compose up running)
docker compose ps
```

You should see all services as `healthy`:
```
NAME                  STATUS
neo4j_db              Up (healthy)
copilot_api_server    Up (healthy)
mcp_server            Up (healthy)
mimir-open-webui      Up
```

**Test the endpoints:**
```bash
# Neo4j Browser (should open in browser)
open http://localhost:7474
# Username: neo4j, Password: password

# MCP Server Health Check
curl http://localhost:9042/health
# Should return: {"status":"ok"}

# Copilot API Models
curl http://localhost:4141/v1/models
# Should return JSON with available models
```

---

## Step 7: Access Open-WebUI

Open-WebUI provides a ChatGPT-like interface with Mimir integration:

```
http://localhost:3000
```

**First-time setup:**
1. Create an admin account (first user becomes admin)
2. Select model: **gpt-4.1** (default, avoids premium usage)
3. Start chatting!

**Try these commands:**
```
Create a TODO for implementing user authentication

Show me all pending tasks

Search for files related to authentication
```

---

## Step 8: (Optional) Run in Background

Once authenticated and verified, you can run in detached mode:

```bash
# Stop the current run (Ctrl+C)
docker compose down

# Start in background
docker compose up -d

# View logs anytime
docker compose logs -f
```

---

## 🎉 You're Done!

Your AI agents now have:
- ✅ Persistent memory (Neo4j graph database)
- ✅ GitHub Copilot LLM access
- ✅ Multi-agent orchestration
- ✅ Web interface (Open-WebUI)
- ✅ File indexing and semantic search

---

## Quick Commands Reference

```bash
# View logs (all services)
docker compose logs -f

# View logs (specific service)
docker compose logs -f mcp-server
docker compose logs -f copilot-api

# Restart a service
docker compose restart copilot-api
docker compose restart mcp-server

# Stop everything
docker compose down

# Start everything (after first run)
docker compose up -d

# Rebuild after code changes
npm run build:docker
docker compose up -d --build mcp-server

# Check service health
docker compose ps
```

---

## Troubleshooting

### Problem: Copilot API won't authenticate

**Symptoms:**
```
copilot_api_server  | ℹ Not logged in, getting new access token
copilot_api_server  | ℹ Please enter the code "XXXX-XXXX" in https://github.com/login/device
```

**Solution:**
1. Make sure you have a GitHub Copilot subscription
2. Open https://github.com/login/device in your browser
3. Enter the code QUICKLY (within 5 minutes)
4. If you miss the window, restart: `docker compose restart copilot-api`

### Problem: Can't find the authentication code in logs

**Symptoms:** Logs are too busy, can't see the code

**Solution:**
```bash
# Filter logs to see only copilot-api messages
docker compose logs copilot-api | grep "Please enter"
```

### Problem: Services won't start

**Symptoms:** `docker compose ps` shows services as `unhealthy`

**Solution:**
```bash
# Check what's wrong
docker compose logs

# Common fixes:
# 1. Docker memory too low (need > 2GB)
# 2. Ports already in use (7474, 4141, 9042, 3000)
# 3. Neo4j taking too long to start (wait 60 seconds)

# Nuclear option: clean restart
docker compose down -v  # WARNING: Deletes all data!
docker compose up
```

### Problem: Neo4j Browser won't open

**Symptoms:** http://localhost:7474 doesn't load

**Solution:**
```bash
# Wait longer (Neo4j takes 30-60 seconds to start)
docker compose logs neo4j

# Check if it's running
docker compose ps neo4j

# If unhealthy, check memory allocation
# Docker Desktop → Settings → Resources → Memory (need > 2GB)
```

### Problem: Port conflicts

**Symptoms:**
```
Error: bind: address already in use
```

**Solution:**
Edit `docker-compose.yml` and change the **first** port number:
```yaml
ports:
  - "7475:7474"  # Change 7474 → 7475 (or any free port)
```

### Problem: MCP server can't connect to Neo4j

**Symptoms:**
```
mcp_server  | Error: Failed to connect to Neo4j
```

**Solution:**
```bash
# Make sure Neo4j is healthy first
docker compose ps neo4j

# Check Neo4j password matches .env
docker compose logs neo4j | grep password

# Restart MCP server after Neo4j is ready
docker compose restart mcp-server
```

---

## Next Steps

### 1. Configure LLM Providers

By default, Mimir uses **gpt-4.1** to avoid premium usage. To switch models:

- **See**: [LLM_PROVIDER_GUIDE.md](docs/guides/LLM_PROVIDER_GUIDE.md) for detailed instructions
- **Options**: GPT-4.1 (default), GPT-4o (premium), O1-preview (premium), local Ollama

### 2. Learn the Architecture

- **[AGENTS.md](AGENTS.md)** - Multi-agent workflows and best practices
- **[README.md](README.md)** - Complete feature documentation
- **[docs/architecture/MULTI_AGENT_GRAPH_RAG.md](docs/architecture/MULTI_AGENT_GRAPH_RAG.md)** - Technical architecture

### 3. Enable Mimir Pipelines in Open-WebUI

After starting Open-WebUI, enable the pre-packaged Mimir pipelines:

1. Go to http://localhost:3000
2. Click your username (bottom-left) → **"Admin Panel"**
3. Navigate to **"Pipelines"** tab
4. Toggle each Mimir pipeline to enable it:
   - ✅ **Mimir Multi-Agent Orchestrator** - Full PM → Worker → QC workflow
   - ✅ **Mimir RAG Auto** - Chat with semantic search
   - ✅ **Mimir File Browser** - Browse indexed files
   - ✅ **Mimir Tools Wrapper** - Command shortcuts (`/list_folders`, `/search`)

**See**: [PIPELINE_CONFIGURATION.md](docs/guides/PIPELINE_CONFIGURATION.md) for detailed instructions and LLM provider switching.

### 4. Explore the Web Interface

Open-WebUI at http://localhost:3000 provides:
- ChatGPT-like interface
- Mimir pipeline integration (after enabling)
- File browser actions
- Model selection
- Chat history

### 5. Index Your Codebase

Enable file indexing to let AI agents search your code:

```bash
# Inside the mcp-server container
docker exec -it mcp_server node /app/scripts/setup-watch.js /workspace

# Or from Open-WebUI, use the file browser pipeline
```

---

## Need Help?

- 📖 **Documentation**: [README.md](README.md)
- 🐛 **Issues**: https://github.com/orneryd/Mimir/issues
- 💬 **Discussions**: https://github.com/orneryd/Mimir/discussions
- 📚 **Architecture**: [docs/architecture/](docs/architecture/)

---

## Token Persistence

Your GitHub token is saved in `./copilot-data/` and persists across restarts. You only need to authenticate once unless you:
- Delete the `copilot-data` directory
- Run `docker compose down -v` (removes volumes)
- Revoke the token on GitHub

---

**Last Updated:** 2025-11-10  
**Version:** 1.1.0
