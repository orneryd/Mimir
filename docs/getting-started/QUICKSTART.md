# Mimir Quick Start Guide

Get Mimir running in 5 minutes with simple step-by-step instructions.

## Prerequisites

Before starting, install these tools:

- **Docker Desktop** → https://www.docker.com/products/docker-desktop/
- **Node.js 18+** → https://nodejs.org/
- **Git** → https://git-scm.com/

**System Requirements:**
- **RAM**: 
  - **4GB minimum** (base installation with Neo4j + embeddings)
  - **8GB minimum** with vision models (2B Qwen2.5-VL)
  - **16GB recommended** with vision models (7B Qwen2.5-VL)
- **Disk**: 
  - **2GB** (base installation)
  - **5GB** with 2B vision model
  - **8GB** with 7B vision model
- **OS**: macOS, Linux, or Windows with WSL2

> 💡 **Docker Memory**: Base Mimir needs **3-4GB RAM**. With vision models enabled: **8GB for 2B model** (faster inference, lower memory), **16GB for 7B model** (higher quality descriptions). Neo4j uses 512MB-2GB heap + 512MB page cache. Check: Docker Desktop → Settings → Resources → Memory

---

## Step 1: Install & Start

```bash
# Clone the repository
git clone https://github.com/orneryd/Mimir.git
cd Mimir

# Copy environment template
cp env.example .env

# Start all services (automatically detects your platform)
npm run start
# Or manually: docker compose up -d
```

That's it! Services will start in the background. The startup script automatically detects your platform (macOS ARM64, Linux, Windows) and uses the optimized docker-compose file.

---

## Step 2: Configure Workspace Access (REQUIRED)

**⚠️ IMPORTANT**: You must configure `HOST_WORKSPACE_ROOT` in `.env` before indexing files.

Edit `.env` and set your source code directory:

```bash
# Your main source code directory (will be mounted to container)
# Examples:
#   Windows: C:\Users\YourName\Documents\GitHub
#   macOS:   ~/Documents/projects
#   Linux:   ~/workspace
HOST_WORKSPACE_ROOT=~/src
```

**What this does:**
- Gives Mimir access to your source code for file indexing
- Default mount is **read-write** (allows file editing)
- You manually choose which folders to index via UI or VSCode plugin

**For read-only access**, edit `docker-compose.yml`:

```yaml
volumes:
  - ./data:/app/data
  - ./logs:/app/logs
  - ${HOST_WORKSPACE_ROOT:-~/src}:${WORKSPACE_ROOT:-/workspace}:ro  # Add :ro for read-only
```

**Other optional settings:**
```bash
NEO4J_PASSWORD=password          # Change in production!
MIMIR_DEFAULT_PROVIDER=openai    # LLM provider (openai, copilot, ollama)
MIMIR_DEFAULT_MODEL=gpt-4.1      # LLM model
```

---

## Step 3: Verify Services

```bash
# Check that all services are running
npm run status
# Or manually: docker compose ps
```

You should see all services as `healthy`:
```
NAME                  STATUS
neo4j                 Up (healthy)
copilot-api           Up (healthy)  [Optional - only if using Copilot]
mimir-server          Up (healthy)
```

**Access the services:**
```bash
# Mimir Web UI (Portal + File Indexing + Orchestration)
open http://localhost:9042

# Neo4j Browser
open http://localhost:7474
# Username: neo4j, Password: password (or your custom password)

# Health Check
curl http://localhost:9042/health
# Should return: {"status":"ok"}
```

**📚 Documentation Auto-Indexed:**

On first startup, Mimir automatically indexes its own documentation for semantic search. You can immediately query Mimir's documentation using natural language:

```
"How do I configure embeddings?"
"Show me the IDE integration guide"
"Explain the multi-agent architecture"
```

To disable this feature, set in `.env`:
```bash
MIMIR_AUTO_INDEX_DOCS=false
```

---

## Step 4: Access Mimir Web UI

The Mimir Web UI provides a portal with file indexing and access to all features:

```
http://localhost:9042
```

**What's Available:**
1. **Portal (Main Hub)** - Navigation and file indexing management
2. **File Indexing** - Add/remove folders to index your codebase
3. **Orchestration Studio** - Visual workflow builder (coming soon)
4. **MCP API** - Available at `/mcp` endpoint for AI assistants
5. **Chat API** - Available at `/api/chat` for conversational interfaces

**Try these features:**
- Add a folder to index your codebase
- View indexed files in Neo4j Browser
- Call MCP tools via the API

### (Optional) Enable Open-WebUI

If you want a ChatGPT-like interface:

1. Edit `docker-compose.yml` and uncomment the `open-webui` service
2. Restart: `docker compose up -d`
3. Access at http://localhost:3000
4. Create an admin account (first user becomes admin)
5. Select model: **gpt-4.1** (default, avoids premium usage)

---

## Step 5: (Optional) Configure LLM Provider

By default, Mimir uses the Copilot API proxy (requires GitHub Copilot subscription). To use other providers:

**Option 1: OpenAI Direct**
```bash
# Edit .env
MIMIR_DEFAULT_PROVIDER=openai
MIMIR_LLM_API=https://api.openai.com/v1
MIMIR_LLM_API_KEY=sk-your-api-key
```

**Option 2: Local Ollama**
```bash
# Edit .env
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_LLM_API=http://host.docker.internal:11434
MIMIR_DEFAULT_MODEL=llama3.1
```

See [LLM Provider Guide](../guides/LLM_PROVIDER_GUIDE.md) for detailed configuration.

**Restart after changes:**
```bash
npm run restart
# Or: docker compose restart mimir-server
```

---

## 🎉 You're Done!

Your AI agents now have:
- ✅ Persistent memory (Neo4j graph database)
- ✅ GitHub Copilot LLM access
- ✅ Multi-agent orchestration
- ✅ Web UI with Portal and file indexing (http://localhost:9042)
- ✅ File indexing and semantic search
- ✅ MCP API for AI assistant integration
- ✅ Chat API for conversational interfaces

---

## Quick Commands Reference

```bash
# View logs (all services)
docker compose logs -f

# View logs (specific service)
docker compose logs -f mimir-server
docker compose logs -f copilot-api

# Restart a service
docker compose restart copilot-api
docker compose restart mimir-server

# Stop everything
docker compose down

# Start everything (after first run)
docker compose up -d

# Rebuild after code changes
npm run build:docker
docker compose up -d --build mimir-server

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
# 1. Docker memory too low (need 16GB)
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
# Docker Desktop → Settings → Resources → Memory (need 16GB)
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

# Restart Mimir server after Neo4j is ready
docker compose restart mimir-server
```

---

## Next Steps

### 1. Configure LLM Providers

By default, Mimir uses **gpt-4.1** to avoid premium usage. To switch models:

- **See**: [LLM_PROVIDER_GUIDE.md](docs/guides/LLM_PROVIDER_GUIDE.md) for detailed instructions
- **Options**: GPT-4.1 (default), GPT-4o (premium), O1-preview (premium), local Ollama

### 2. Learn the Architecture

- **[AGENTS.md](../AGENTS.md)** - Multi-agent workflows and best practices
- **[README.md](README.md)** - Complete feature documentation
- **[docs/architecture/MULTI_AGENT_GRAPH_RAG.md](docs/architecture/MULTI_AGENT_GRAPH_RAG.md)** - Technical architecture

### 3. Enable Mimir Pipelines in Open-WebUI

After starting Open-WebUI, enable the pre-packaged Mimir pipelines:

1. Go to http://localhost:3000
2. Click your username (bottom-left) → **"Admin Panel"**
3. Navigate to **"Pipelines"** tab
4. Toggle each Mimir pipeline to enable it:
   - ✅ **Mimir Orchestrator** - Full PM → Worker → QC workflow
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
# Inside the mimir-server container
docker exec -it mimir_server node /app/scripts/setup-watch.js /workspace

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
