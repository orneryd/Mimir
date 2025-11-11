# Open-WebUI Pipeline Configuration Guide

**Version:** 1.0.0  
**Last Updated:** 2025-11-10

This guide explains how to configure and use the pre-packaged Mimir pipelines in Open-WebUI, including how to enable them and switch between different LLM providers.

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Packaged Pipelines](#pre-packaged-pipelines)
3. [First-Time Setup](#first-time-setup)
4. [Enabling Pipelines](#enabling-pipelines)
5. [Switching LLM Providers](#switching-llm-providers)
6. [Pipeline Configuration](#pipeline-configuration)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Mimir comes with **4 pre-packaged pipelines** that are automatically copied into your Open-WebUI container:

1. **Mimir Multi-Agent Orchestrator** - Full PM → Worker → QC orchestration
2. **Mimir RAG Auto** - Semantic search with automatic context enrichment
3. **Mimir File Browser** - Browse and search indexed files
4. **Mimir Tools Wrapper** - Command shortcuts (`/list_folders`, `/search`, etc.)

These pipelines are **pre-installed** but must be **manually enabled** on first use.

---

## Pre-Packaged Pipelines

### Pipeline Locations

After building the Docker image, pipelines are located at:

```
/app/backend/data/pipelines/
├── mimir_orchestrator.py      # Multi-agent orchestration
├── mimir_rag_auto.py           # RAG with semantic search
├── mimir_file_browser.py       # File browsing actions
└── mimir_tools_wrapper.py      # Command wrapper filter
```

### Pipeline Types

| Pipeline | Type | Purpose |
|----------|------|---------|
| **mimir_orchestrator.py** | Pipe | Full multi-agent workflow (Ecko → PM → Workers → QC) |
| **mimir_rag_auto.py** | Pipe | Chat with semantic search context enrichment |
| **mimir_file_browser.py** | Action | File browsing and statistics |
| **mimir_tools_wrapper.py** | Filter | Command shortcuts for tools |

---

## First-Time Setup

### Step 1: Build the Docker Image

The pipelines are automatically copied during the Docker build:

```bash
# Build the Open-WebUI image with Mimir pipelines
docker compose build open-webui

# Or rebuild everything
npm run build:docker
docker compose up -d --build
```

### Step 2: Verify Pipelines Are Copied

Check that pipeline files are in the container:

```bash
# List pipeline files
docker exec -it mimir-open-webui ls -la /app/backend/data/pipelines/

# Should show:
# mimir_orchestrator.py
# mimir_rag_auto.py
# mimir_file_browser.py
# mimir_tools_wrapper.py
```

### Step 3: Access Open-WebUI

```
http://localhost:3000
```

**First-time setup:**
1. Create an admin account (first user becomes admin)
2. You'll be redirected to the chat interface

---

## Enabling Pipelines

Pipelines are **pre-installed** but **disabled by default**. You must enable them manually.

### Method 1: Via Admin Panel (Recommended)

1. **Open Admin Panel**:
   - Click your username (bottom-left)
   - Select **"Admin Panel"**

2. **Navigate to Pipelines**:
   - Click **"Admin Panel"** in the sidebar
   - Select **"Pipelines"** tab

3. **Enable Mimir Pipelines**:
   You should see 4 Mimir pipelines listed:
   
   - ✅ **Mimir Multi-Agent Orchestrator**
   - ✅ **Mimir RAG Auto**
   - ✅ **Mimir File Browser**
   - ✅ **Mimir Tools Wrapper**

4. **Toggle Each Pipeline**:
   - Click the **toggle switch** next to each pipeline to enable it
   - The switch should turn green/blue when enabled

5. **Verify**:
   - Go back to the chat interface
   - You should now see the pipelines available in model selection

### Method 2: Via API (Advanced)

If you have an API key, you can enable pipelines programmatically:

```bash
# Get your API key from: Settings → Account → API Keys

# Enable a pipeline
curl -X POST http://localhost:3000/api/v1/pipelines/enable \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_id": "mimir_orchestrator"
  }'
```

---

## Switching LLM Providers

All Mimir pipelines support switching between **Copilot API** (default) and **Ollama** (local).

### Default Configuration (Copilot API)

Out of the box, all pipelines use GitHub Copilot API:

```python
COPILOT_API_URL: str = Field(
    default="http://copilot-api:4141/v1",
    description="Copilot API base URL"
)

PM_MODEL: str = Field(default="gpt-4.1")
WORKER_MODEL: str = Field(default="gpt-4.1")
QC_MODEL: str = Field(default="gpt-4.1")
```

### Switching to Ollama

#### Option 1: Via Pipeline Valves (Easiest)

1. **Open Admin Panel** → **Pipelines**
2. **Click the pipeline** you want to configure (e.g., "Mimir Multi-Agent Orchestrator")
3. **Click the gear icon** (⚙️) to edit Valves
4. **Modify the configuration**:

```json
{
  "COPILOT_API_URL": "http://ollama:11434/v1",
  "PM_MODEL": "llama3.1:8b",
  "WORKER_MODEL": "llama3.1:8b",
  "QC_MODEL": "llama3.1:8b"
}
```

5. **Save** and test with a new chat

#### Option 2: Edit Pipeline Source (Persistent)

1. **Edit the pipeline file** in your local repository:

```bash
# Edit the orchestrator pipeline
nano pipelines/mimir_orchestrator.py
```

2. **Change the Valves defaults**:

```python
class Valves(BaseModel):
    # Change Copilot API URL to Ollama
    COPILOT_API_URL: str = Field(
        default="http://ollama:11434/v1",  # Changed
        description="Ollama API base URL"
    )
    
    # Change models to Ollama models
    PM_MODEL: str = Field(
        default="llama3.1:8b",  # Changed
        description="Model for PM agent"
    )
    
    WORKER_MODEL: str = Field(
        default="llama3.1:8b",  # Changed
        description="Model for worker agents"
    )
    
    QC_MODEL: str = Field(
        default="llama3.1:8b",  # Changed
        description="Model for QC agents"
    )
```

3. **Rebuild and restart**:

```bash
docker compose build open-webui
docker compose up -d --no-deps open-webui
```

### Hybrid Configuration (Advanced)

You can use different providers for different agents:

```python
# Use Copilot for PM and QC (strategic)
PM_MODEL: str = Field(default="gpt-4o")
QC_MODEL: str = Field(default="gpt-4o")

# Use Ollama for Workers (high volume)
WORKER_MODEL: str = Field(default="llama3.1:8b")
```

> ⚠️ **Limitation**: Currently, all agents must use the same API endpoint. Hybrid setups require code modifications to switch base URLs per agent.

---

## Pipeline Configuration

### Mimir Multi-Agent Orchestrator

**Purpose**: Full multi-agent workflow with PM, Workers, and QC agents

**Key Configuration Options**:

```python
# Agent Enablement
ECKO_ENABLED: bool = True          # Enable prompt architect
PM_ENABLED: bool = True            # Enable planning stage
WORKERS_ENABLED: bool = True       # Enable worker execution

# Model Selection
PM_MODEL: str = "gpt-4.1"          # PM agent model
WORKER_MODEL: str = "gpt-4.1"      # Worker agent model
QC_MODEL: str = "gpt-4.1"          # QC agent model

# Context Enrichment
SEMANTIC_SEARCH_ENABLED: bool = True
SEMANTIC_SEARCH_LIMIT: int = 10
```

**Usage**:
1. Select "Mimir Multi-Agent Orchestrator" as your model
2. Type your request (e.g., "Build a user authentication system")
3. The pipeline will:
   - Optimize your prompt (Ecko)
   - Create a task plan (PM)
   - Execute tasks (Workers)
   - Verify output (QC)
   - Generate final report

### Mimir RAG Auto

**Purpose**: Chat with automatic semantic search context enrichment

**Key Configuration Options**:

```python
# LLM Backend
LLM_BACKEND: str = "copilot"       # "copilot" or "ollama"

# Model Selection
DEFAULT_MODEL: str = "gpt-4.1"

# Semantic Search
SEMANTIC_SEARCH_ENABLED: bool = True
SEMANTIC_SEARCH_LIMIT: int = 10

# Embedding Configuration
EMBEDDING_MODEL: str = "nomic-embed-text"
```

**Usage**:
1. Select "Mimir RAG Auto" as your model
2. Ask questions about your indexed codebase
3. The pipeline automatically enriches context with relevant files

### Mimir File Browser

**Purpose**: Browse and get statistics on indexed files

**Actions Available**:
- `list_watched_folders` - List all watched folders
- `get_folder_stats` - Get statistics for a specific folder

**Usage**:
1. In the chat interface, click the **"+"** button
2. Select **"Actions"**
3. Choose **"Mimir File Browser"**
4. Select an action (e.g., "list_watched_folders")

### Mimir Tools Wrapper

**Purpose**: Command shortcuts for common operations

**Commands Available**:
- `/list_folders` - List watched folders
- `/folder_stats <path>` - Get folder statistics
- `/search <query>` - Semantic search
- `/orchestration <id>` - Get orchestration details

**Usage**:
1. Enable "Mimir Tools Wrapper" in Pipelines
2. In any chat, type a command (e.g., `/list_folders`)
3. The command is intercepted and executed directly

---

## Troubleshooting

### Problem: Pipelines Not Showing Up

**Symptoms**: No Mimir pipelines visible in Admin Panel

**Solution**:
```bash
# 1. Verify files are in container
docker exec -it mimir-open-webui ls -la /app/backend/data/pipelines/

# 2. Check Open-WebUI logs
docker compose logs open-webui | grep -i pipeline

# 3. Rebuild the image
docker compose build open-webui --no-cache
docker compose up -d --force-recreate open-webui
```

### Problem: Pipeline Fails to Enable

**Symptoms**: Toggle switch doesn't stay enabled

**Solution**:
```bash
# 1. Check for Python syntax errors
docker exec -it mimir-open-webui python3 -m py_compile \
  /app/backend/data/pipelines/mimir_orchestrator.py

# 2. Check dependencies are installed
docker exec -it mimir-open-webui pip list | grep -E "neo4j|aiohttp|pydantic"

# 3. Check Open-WebUI logs for errors
docker compose logs open-webui | tail -50
```

### Problem: Pipeline Can't Connect to Neo4j

**Symptoms**: Error about Neo4j connection

**Solution**:
```bash
# 1. Verify Neo4j is running
docker compose ps neo4j

# 2. Check Neo4j connection from Open-WebUI container
docker exec -it mimir-open-webui ping neo4j_db

# 3. Verify Neo4j credentials in pipeline Valves:
# NEO4J_URL: bolt://neo4j_db:7687
# NEO4J_USER: neo4j
# NEO4J_PASSWORD: password
```

### Problem: Pipeline Can't Connect to Copilot API

**Symptoms**: Error about Copilot API connection

**Solution**:
```bash
# 1. Verify Copilot API is running
docker compose ps copilot-api

# 2. Check Copilot API from Open-WebUI container
docker exec -it mimir-open-webui curl http://copilot-api:4141/v1/models

# 3. Verify Copilot API URL in pipeline Valves:
# COPILOT_API_URL: http://copilot-api:4141/v1
```

### Problem: Ollama Models Not Found

**Symptoms**: Error: Model 'llama3.1:8b' not found

**Solution**:
```bash
# 1. Enable Ollama service (uncomment in docker-compose.yml)
docker compose up -d ollama

# 2. Pull the model
docker exec -it ollama_server ollama pull llama3.1:8b

# 3. Verify model is available
docker exec -it ollama_server ollama list
```

### Problem: Pipeline Changes Not Taking Effect

**Symptoms**: Modified Valves but behavior unchanged

**Solution**:
```bash
# 1. Refresh the page (Ctrl+Shift+R)

# 2. Clear browser cache

# 3. Restart Open-WebUI
docker compose restart open-webui

# 4. If editing source files, rebuild
docker compose build open-webui --no-cache
docker compose up -d --force-recreate open-webui
```

---

## Best Practices

### 1. Start with Defaults

Use the default Copilot API + gpt-4.1 configuration until you identify specific needs.

### 2. Enable Pipelines Incrementally

Don't enable all 4 pipelines at once. Start with:
1. **Mimir RAG Auto** - For general chat with context
2. **Mimir Tools Wrapper** - For command shortcuts
3. **Mimir Multi-Agent Orchestrator** - For complex tasks

### 3. Test Configuration Changes

Always test Valve changes with a simple query before running complex orchestrations.

### 4. Monitor Resource Usage

- **Copilot API**: Monitor usage at http://localhost:4141/usage
- **Ollama**: Monitor GPU/RAM usage with `docker stats ollama_server`

### 5. Keep Pipelines Updated

When updating Mimir:
```bash
# Pull latest changes
git pull

# Rebuild with updated pipelines
docker compose build open-webui --no-cache
docker compose up -d --force-recreate open-webui
```

---

## Summary

| Task | Method |
|------|--------|
| **Enable pipelines** | Admin Panel → Pipelines → Toggle switches |
| **Switch to Ollama** | Edit Valves → Change COPILOT_API_URL and models |
| **Update pipelines** | Edit source → Rebuild → Restart |
| **Troubleshoot** | Check logs → Verify connections → Rebuild if needed |

---

## Related Documentation

- **[QUICKSTART.md](../../QUICKSTART.md)** - Initial setup
- **[LLM_PROVIDER_GUIDE.md](LLM_PROVIDER_GUIDE.md)** - Detailed LLM configuration
- **[AGENTS.md](../../AGENTS.md)** - Multi-agent workflows
- **[Open-WebUI Docs](https://docs.openwebui.com/)** - Official documentation

---

**Need Help?**
- 🐛 [Report Issues](https://github.com/orneryd/Mimir/issues)
- 💬 [Discussions](https://github.com/orneryd/Mimir/discussions)
