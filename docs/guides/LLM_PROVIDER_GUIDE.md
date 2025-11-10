# LLM Provider Configuration Guide

**Version:** 1.0.0  
**Last Updated:** 2025-11-10

This guide explains how to configure which LLM models are used by Mimir's multi-agent orchestration system.

---

## Table of Contents

1. [Overview](#overview)
2. [Default Configuration (GPT-4.1)](#default-configuration-gpt-41)
3. [Switching to Premium Models](#switching-to-premium-models)
4. [Using Local Ollama](#using-local-ollama)
5. [Per-Agent Model Configuration](#per-agent-model-configuration)
6. [Configuration Methods](#configuration-methods)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Mimir's orchestration pipeline uses different LLM models for different agent roles:

| Agent Role | Default Model | Purpose |
|------------|---------------|---------|
| **Ecko** (Prompt Architect) | gpt-4.1 | Optimize user prompts |
| **PM** (Project Manager) | gpt-4.1 | Research & planning |
| **Worker** (Task Executor) | gpt-4.1 | Execute individual tasks |
| **QC** (Quality Control) | gpt-4.1 | Verify worker output |

**Why GPT-4.1 by default?**
- ✅ Avoids premium request usage (if you have Copilot Pro)
- ✅ Fast response times
- ✅ Good quality for most tasks
- ✅ Lower cost

---

## Default Configuration (GPT-4.1)

### What You Get Out of the Box

When you run `docker compose up`, Mimir uses **GPT-4.1** for all agents via GitHub Copilot API.

**No configuration needed!** This is the recommended setup for most users.

### Available Models via Copilot API

Check what models are available:

```bash
# View available models
curl http://localhost:4141/v1/models | jq '.data[].id'
```

Typical output:
```
gpt-4.1
gpt-4o
gpt-4o-mini
o1-preview
o1-mini
claude-3.5-sonnet
```

> 💡 **Note**: Available models depend on your GitHub Copilot subscription (Individual, Business, or Enterprise).

---

## Switching to Premium Models

### Option 1: Via Open-WebUI (Easiest)

1. Open Open-WebUI: http://localhost:3000
2. Click the **Settings** icon (⚙️) in the top right
3. Go to **Admin Panel** → **Settings** → **Pipelines**
4. Find **Mimir Multi-Agent Orchestrator**
5. Click **Edit** (pencil icon)
6. Modify the **Valves** (configuration):

```json
{
  "PM_MODEL": "gpt-4o",
  "WORKER_MODEL": "gpt-4o",
  "QC_MODEL": "gpt-4o"
}
```

7. Click **Save**
8. Test with a new chat

### Option 2: Edit Python Pipeline Directly

Edit `/Users/c815719/src/playground/mimir/pipelines/mimir_orchestrator.py`:

```python:66:82:pipelines/mimir_orchestrator.py
PM_MODEL: str = Field(
    default="gpt-4o",  # Changed from gpt-4.1
    description="Model to use for PM agent (planning)."
)

WORKER_MODEL: str = Field(
    default="gpt-4o",  # Changed from gpt-4.1
    description="Model to use for worker agents (task execution)."
)

QC_MODEL: str = Field(
    default="gpt-4o",  # Changed from gpt-4.1
    description="Model to use for QC agents (verification)."
)
```

Then rebuild:

```bash
# Rebuild the Open-WebUI container with updated pipeline
docker compose restart open-webui

# Or rebuild from scratch
docker compose down
docker compose up -d --build open-webui
```

### Premium Model Options

| Model | Speed | Quality | Cost | Best For |
|-------|-------|---------|------|----------|
| **gpt-4.1** | ⚡⚡⚡ Fast | ✅ Good | 💰 Low | General tasks, default |
| **gpt-4o** | ⚡⚡ Medium | ✅✅ Better | 💰💰 Medium | Complex reasoning |
| **gpt-4o-mini** | ⚡⚡⚡ Fast | ✅ Good | 💰 Low | Simple tasks |
| **o1-preview** | ⚡ Slow | ✅✅✅ Best | 💰💰💰 High | Hard problems, deep reasoning |
| **o1-mini** | ⚡⚡ Medium | ✅✅ Better | 💰💰 Medium | Moderate reasoning |
| **claude-3.5-sonnet** | ⚡⚡ Medium | ✅✅ Better | 💰💰 Medium | Code generation |

> ⚠️ **Warning**: Premium models (gpt-4o, o1-*) count against your Copilot Pro usage limits. Use sparingly or upgrade your plan.

---

## Using Local Ollama

### Why Use Ollama?

- ✅ Fully offline (no internet required)
- ✅ No usage limits
- ✅ Free (after hardware investment)
- ⚠️ Requires GPU for good performance
- ⚠️ Lower quality than GPT-4

### Step 1: Enable Ollama Service

Uncomment the Ollama service in `docker-compose.yml`:

```yaml:50:96:docker-compose.yml
ollama:
  build:
    context: ./docker/ollama
    dockerfile: Dockerfile
    args:
      - EMBEDDING_MODEL=${MIMIR_EMBEDDINGS_MODEL:-mxbai-embed-large}
    tags:
      - mimir-ollama:${VERSION:-1.0.0}
      - mimir-ollama:latest
  image: mimir-ollama:${VERSION:-1.0.0}
  container_name: ollama_server
  ports:
    - "11434:11434"  # Ollama API
  volumes:
    - ./data/ollama:/root/.ollama  # Persist models
  environment:
    - OLLAMA_HOST=0.0.0.0:11434
    - OLLAMA_ORIGINS=*
  restart: unless-stopped
  healthcheck:
    test: ["CMD", "ollama", "list"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 30s
  networks:
    - mcp_network
  # Uncomment if you have GPU support (NVIDIA)
  # deploy:
  #   resources:
  #     reservations:
  #       devices:
  #         - driver: nvidia
  #           count: 1
  #           capabilities: [gpu]
```

### Step 2: Start Ollama

```bash
# Stop current services
docker compose down

# Start with Ollama
docker compose up -d

# Wait for Ollama to start (30-60 seconds)
docker compose logs -f ollama
```

### Step 3: Pull Models

```bash
# Pull a model (inside container)
docker exec -it ollama_server ollama pull llama3.1:8b

# Or pull from host (if Ollama CLI installed)
ollama pull llama3.1:8b

# Verify models are available
docker exec -it ollama_server ollama list
```

### Step 4: Configure Pipeline to Use Ollama

Edit `pipelines/mimir_orchestrator.py`:

```python:42:50:pipelines/mimir_orchestrator.py
# Change Copilot API URL to Ollama
COPILOT_API_URL: str = Field(
    default="http://ollama:11434/v1",  # Changed from copilot-api:4141
    description="Ollama API base URL",
)

# Models must match what you pulled
PM_MODEL: str = Field(
    default="llama3.1:8b",  # Changed from gpt-4.1
    description="Model to use for PM agent"
)

WORKER_MODEL: str = Field(
    default="llama3.1:8b",
    description="Model to use for worker agents"
)

QC_MODEL: str = Field(
    default="llama3.1:8b",
    description="Model to use for QC agents"
)
```

### Step 5: Restart and Test

```bash
# Restart Open-WebUI to pick up changes
docker compose restart open-webui

# Test in Open-WebUI
# http://localhost:3000
```

### Recommended Ollama Models

| Model | Size | RAM Needed | Quality | Speed | Best For |
|-------|------|------------|---------|-------|----------|
| **llama3.1:8b** | 4.7GB | 8GB | ✅✅ Good | ⚡⚡ Fast | General tasks |
| **llama3.1:70b** | 40GB | 64GB | ✅✅✅ Excellent | ⚡ Slow | Complex reasoning |
| **qwen2.5:7b** | 4.7GB | 8GB | ✅✅ Good | ⚡⚡ Fast | Code generation |
| **codellama:13b** | 7.4GB | 16GB | ✅✅ Good | ⚡⚡ Medium | Code-specific tasks |
| **mistral:7b** | 4.1GB | 8GB | ✅ Decent | ⚡⚡⚡ Fast | Simple tasks |

> 💡 **Tip**: Start with `llama3.1:8b` for a good balance of quality and speed.

---

## Per-Agent Model Configuration

You can use different models for different agent roles:

### Example: Optimize for Cost and Quality

```python:66:82:pipelines/mimir_orchestrator.py
# Fast, cheap model for PM (planning is quick)
PM_MODEL: str = Field(
    default="gpt-4.1",
    description="Fast planning"
)

# High-quality model for Workers (critical execution)
WORKER_MODEL: str = Field(
    default="gpt-4o",
    description="High-quality execution"
)

# Medium model for QC (verification needs accuracy)
QC_MODEL: str = Field(
    default="gpt-4o",
    description="Thorough verification"
)
```

### Example: All Local (Ollama)

```python:66:82:pipelines/mimir_orchestrator.py
PM_MODEL: str = Field(default="llama3.1:8b")
WORKER_MODEL: str = Field(default="qwen2.5:7b")  # Better at code
QC_MODEL: str = Field(default="llama3.1:8b")
```

### Example: Hybrid (Copilot + Ollama)

```python:42:82:pipelines/mimir_orchestrator.py
# Use Copilot for PM and QC (strategic)
COPILOT_API_URL: str = Field(default="http://copilot-api:4141/v1")
PM_MODEL: str = Field(default="gpt-4o")
QC_MODEL: str = Field(default="gpt-4o")

# Use Ollama for Workers (execution, many calls)
# NOTE: This requires custom logic to switch base URLs per agent
# Not currently supported out of the box
WORKER_MODEL: str = Field(default="llama3.1:8b")
```

> ⚠️ **Limitation**: Currently, all agents must use the same API endpoint (either Copilot or Ollama). Hybrid setups require code modifications.

---

## Configuration Methods

### Method 1: Open-WebUI Valves (Recommended)

**Pros:**
- ✅ No code changes
- ✅ Changes take effect immediately
- ✅ Per-user configuration
- ✅ Easy to test different models

**Cons:**
- ❌ Settings lost if container recreated
- ❌ Must configure via UI

**How to:**
1. Open-WebUI → Settings → Admin Panel → Pipelines
2. Edit **Mimir Multi-Agent Orchestrator**
3. Modify **Valves** JSON
4. Save

### Method 2: Edit Python Source (Persistent)

**Pros:**
- ✅ Changes persist across container recreations
- ✅ Version controlled (git)
- ✅ Applies to all users

**Cons:**
- ❌ Requires container rebuild
- ❌ Requires editing code

**How to:**
1. Edit `pipelines/mimir_orchestrator.py`
2. Modify the `Valves` class defaults
3. Rebuild: `docker compose restart open-webui`

### Method 3: Environment Variables (Advanced)

**Pros:**
- ✅ No code changes
- ✅ Easy to change via `.env`
- ✅ Supports different configs per environment

**Cons:**
- ❌ Requires adding environment variable support to code
- ❌ Not currently implemented

**Future feature** - would allow:
```bash
# In .env
MIMIR_PM_MODEL=gpt-4o
MIMIR_WORKER_MODEL=gpt-4.1
MIMIR_QC_MODEL=gpt-4o
```

---

## Troubleshooting

### Problem: Model not found

**Symptoms:**
```
Error: Model 'gpt-5' not found
```

**Solution:**
```bash
# Check available models
curl http://localhost:4141/v1/models | jq '.data[].id'

# Use a model from the list
```

### Problem: Ollama models not loading

**Symptoms:**
```
Error: Failed to connect to Ollama
```

**Solution:**
```bash
# Check Ollama is running
docker compose ps ollama

# Check Ollama logs
docker compose logs ollama

# Pull model if missing
docker exec -it ollama_server ollama pull llama3.1:8b

# Verify model is available
docker exec -it ollama_server ollama list
```

### Problem: Premium model usage limits hit

**Symptoms:**
```
Error: Rate limit exceeded
```

**Solution:**
1. Switch back to `gpt-4.1` (non-premium)
2. Or upgrade your GitHub Copilot plan
3. Or use local Ollama

### Problem: Changes not taking effect

**Symptoms:** Model still using old configuration

**Solution:**
```bash
# If using Open-WebUI Valves: refresh page
# If using Python source: rebuild container
docker compose restart open-webui

# Nuclear option: full rebuild
docker compose down
docker compose up -d --build
```

### Problem: Slow performance with Ollama

**Symptoms:** Responses take 30+ seconds

**Solution:**
1. **Check GPU**: Ollama needs GPU for good performance
   ```bash
   # Check if GPU is available
   docker exec -it ollama_server nvidia-smi
   ```

2. **Use smaller model**: Switch from 70b → 8b
   ```python
   WORKER_MODEL: str = Field(default="llama3.1:8b")  # Not 70b
   ```

3. **Increase resources**: Docker Desktop → Settings → Resources
   - RAM: 16GB minimum
   - CPUs: 4+ cores

---

## Best Practices

### 1. Start with Defaults

Use `gpt-4.1` for everything until you identify bottlenecks.

### 2. Profile Your Workload

Track which agents consume the most tokens:
- **PM**: Usually 1-2K tokens (planning)
- **Workers**: Usually 2-5K tokens each (execution)
- **QC**: Usually 1-2K tokens (verification)

### 3. Optimize Strategically

- **High-volume agents** (Workers) → Use cheaper models
- **Critical agents** (QC) → Use better models
- **Fast agents** (PM) → Use faster models

### 4. Monitor Usage

Check your Copilot usage:
```bash
# Via copilot-api
curl http://localhost:4141/usage

# Or visit the usage dashboard
open "https://ericc-ch.github.io/copilot-api?endpoint=http://localhost:4141/usage"
```

### 5. Test Before Committing

Test model changes with simple tasks before running complex orchestrations.

---

## Summary

| Scenario | Recommended Configuration |
|----------|---------------------------|
| **Default (most users)** | All agents: `gpt-4.1` (Copilot) |
| **Premium quality** | All agents: `gpt-4o` (Copilot) |
| **Cost-optimized** | PM/QC: `gpt-4.1`, Workers: `gpt-4o-mini` |
| **Fully offline** | All agents: `llama3.1:8b` (Ollama) |
| **Best quality** | All agents: `o1-preview` (Copilot, expensive) |
| **Code-focused** | Workers: `qwen2.5:7b` (Ollama) or `claude-3.5-sonnet` (Copilot) |

---

## Related Documentation

- **[QUICKSTART.md](../../QUICKSTART.md)** - Initial setup
- **[AGENTS.md](../../AGENTS.md)** - Multi-agent workflows
- **[copilot-api README](https://github.com/ericc-ch/copilot-api)** - Copilot API documentation
- **[Ollama Models](https://ollama.com/library)** - Available Ollama models

---

**Need Help?**
- 🐛 [Report Issues](https://github.com/orneryd/Mimir/issues)
- 💬 [Discussions](https://github.com/orneryd/Mimir/discussions)
