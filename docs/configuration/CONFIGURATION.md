# MCP Server Configuration Guide

**Version:** 4.0.0  
**Last Updated:** 2025-10-18

---

## 🎯 Overview

Mimir MCP Server supports two configuration methods:

1. **Environment Variables** (Recommended for Docker) - Set via `.env` file or `docker compose.yml`
2. **Config Files** - `.mimir/llm-config.json` for LLM model selection

**Key principle:** Feature flags and deployment settings use environment variables for Docker-friendly configuration.

---

## 🔧 Environment Variable Configuration

### Database Configuration

| Variable | Description | Default | Docker Value |
|----------|-------------|---------|--------------|
| `NEO4J_URI` | Neo4j connection string | `bolt://localhost:7687` | `bolt://neo4j:7687` |
| `NEO4J_USER` | Database username | `neo4j` | `neo4j` |
| `NEO4J_PASSWORD` | Database password | `password` | Set in `.env` |

### Ollama Configuration

| Variable | Description | Default | Docker Value |
|----------|-------------|---------|--------------|
| `OLLAMA_BASE_URL` | Ollama API endpoint | `http://localhost:11434` | `http://ollama:11434` |

### Feature Flags

| Variable | Description | Default | Notes |
|----------|-------------|---------|-------|
| `MIMIR_FEATURE_PM_MODEL_SUGGESTIONS` | PM agent suggests models | `false` | Experimental |
| `MIMIR_FEATURE_VECTOR_EMBEDDINGS` | Enable semantic search | `false` | Requires Ollama |

### Vector Embeddings Configuration

Only used when `MIMIR_FEATURE_VECTOR_EMBEDDINGS=true`:

| Variable | Description | Default | Notes |
|----------|-------------|---------|-------|
| `MIMIR_EMBEDDINGS_ENABLED` | Generate embeddings | `false` | Must be `true` |
| `MIMIR_EMBEDDINGS_MODEL` | Ollama embedding model | `nomic-embed-text` | See [Vector Embeddings Guide](../guides/VECTOR_EMBEDDINGS_GUIDE.md) |
| `MIMIR_EMBEDDINGS_DIMENSIONS` | Vector dimensions | `768` | Model-specific |
| `MIMIR_EMBEDDINGS_CHUNK_SIZE` | Text chunk size | `512` | Tokens |
| `MIMIR_EMBEDDINGS_CHUNK_OVERLAP` | Chunk overlap | `50` | Tokens |

### Docker Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST_WORKSPACE_ROOT` | Host directory to mount | `~/src` |
| `WORKSPACE_ROOT` | Container mount point | `/workspace` |
| `NODE_ENV` | Node environment | `production` |
| `PORT` | HTTP server port | `3000` |

---

## 📁 Configuration Files

### LLM Model Configuration

**File:** `.mimir/llm-config.json`

Used for LLM model selection and provider configuration. **Feature flags are now in environment variables.**

**Example:**
```json
{
  "defaultProvider": "ollama",
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "defaultModel": "gpt-oss",
      "models": {
        "gpt-oss": {
          "name": "gpt-oss",
          "contextWindow": 32768,
          "description": "Open-source GPT model",
          "recommendedFor": ["pm", "worker", "qc"],
          "config": {
            "numCtx": 32768,
            "temperature": 0.0,
            "numPredict": -1
          }
        }
      }
    }
  }
}
```

**Note:** `baseUrl` can be overridden by `OLLAMA_BASE_URL` environment variable.

---

## ⚙️ Available Configuration Options

### Memory Persistence Settings

| Environment Variable | Description | Default | Example |
|---------------------|-------------|---------|---------|
| `MCP_MEMORY_STORE_PATH` | Path to memory storage file | `.mcp-memory-store.json` | `~/.mcp-memories.json` |
| `MCP_MEMORY_SAVE_INTERVAL` | Operations before auto-save | `10` | `5` |
| `MCP_MEMORY_TODO_TTL` | TODO decay time (milliseconds) | `86400000` (24h) | `172800000` (48h) |
| `MCP_MEMORY_PHASE_TTL` | Phase decay time (milliseconds) | `604800000` (7d) | `1209600000` (14d) |
| `MCP_MEMORY_PROJECT_TTL` | Project decay time (milliseconds) | `-1` (permanent) | `-1` |

### TTL Helpers

**Convert to milliseconds:**
- 1 hour = `3600000` ms
- 1 day = `86400000` ms
- 1 week = `604800000` ms
- Permanent = `-1`

---

## 📝 Configuration Examples

### VSCode / Cursor / Windsurf

**Location:** Settings → `settings.json`

#### Default Configuration (No Changes Needed)

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/you/src/GRAPH-RAG-TODO-main/build/index.js"]
    }
  }
}
```

#### Custom Memory Location

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/you/src/GRAPH-RAG-TODO-main/build/index.js"],
      "env": {
        "MCP_MEMORY_STORE_PATH": "/Users/you/.mcp-memories/project-memories.json"
      }
    }
  }
}
```

#### Faster Auto-Save

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/you/src/GRAPH-RAG-TODO-main/build/index.js"],
      "env": {
        "MCP_MEMORY_SAVE_INTERVAL": "5"
      }
    }
  }
}
```

#### Extended Memory Retention

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/you/src/GRAPH-RAG-TODO-main/build/index.js"],
      "env": {
        "MCP_MEMORY_TODO_TTL": "172800000",
        "MCP_MEMORY_PHASE_TTL": "1209600000"
      }
    }
  }
}
```

**Explanation:**
- TODOs: 48 hours (2 days) instead of 24 hours
- Phases: 14 days instead of 7 days

#### Complete Custom Configuration

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/you/src/GRAPH-RAG-TODO-main/build/index.js"],
      "env": {
        "MCP_MEMORY_STORE_PATH": "~/.mcp-project-memories.json",
        "MCP_MEMORY_SAVE_INTERVAL": "5",
        "MCP_MEMORY_TODO_TTL": "172800000",
        "MCP_MEMORY_PHASE_TTL": "1209600000",
        "MCP_MEMORY_PROJECT_TTL": "-1"
      }
    }
  }
}
```

---

### Claude Desktop

**Location (macOS):** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Location (Windows):** `%APPDATA%\Claude\claude_desktop_config.json`  
**Location (Linux):** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/you/src/GRAPH-RAG-TODO-main/build/index.js"],
      "env": {
        "MCP_MEMORY_STORE_PATH": "/Users/you/.claude-memories.json",
        "MCP_MEMORY_SAVE_INTERVAL": "10"
      }
    }
  }
}
```

---

### Cline

**Location:** `~/.config/cline/mcp_settings.json` (or similar)

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "MCP_MEMORY_STORE_PATH": ".cline-memories.json"
      }
    }
  }
}
```

---

## 🎛️ Configuration Scenarios

### Scenario 1: Per-Project Memory Store

**Use case:** Different memory for each project

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "MCP_MEMORY_STORE_PATH": ".project-memories.json"
      }
    }
  }
}
```

**Benefit:** Each project has its own isolated memory. Switch projects, switch memory.

---

### Scenario 2: Shared Memory Across Projects

**Use case:** One memory store for all projects

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "MCP_MEMORY_STORE_PATH": "~/.mcp-global-memories.json"
      }
    }
  }
}
```

**Benefit:** AI remembers context across all your projects.

---

### Scenario 3: Long-term Project Memory

**Use case:** Year-long project with extended retention

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "MCP_MEMORY_TODO_TTL": "604800000",
        "MCP_MEMORY_PHASE_TTL": "2592000000",
        "MCP_MEMORY_PROJECT_TTL": "-1"
      }
    }
  }
}
```

**Configuration:**
- TODOs: 7 days (week-long sprints)
- Phases: 30 days (monthly milestones)
- Projects: Permanent

---

### Scenario 4: Short-term Prototype

**Use case:** Quick prototype with aggressive decay

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "MCP_MEMORY_TODO_TTL": "14400000",
        "MCP_MEMORY_PHASE_TTL": "86400000"
      }
    }
  }
}
```

**Configuration:**
- TODOs: 4 hours
- Phases: 1 day

---

### Scenario 5: Paranoid Auto-Save

**Use case:** Never lose recent changes

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "MCP_MEMORY_SAVE_INTERVAL": "1"
      }
    }
  }
}
```

**Configuration:** Save after every single write operation

**Trade-off:** More disk I/O, but zero risk of data loss

---

## 🔍 Viewing Active Configuration

When the server starts, it logs the active configuration:

```
🧠 TODO + Memory System MCP Server v3.0 starting...
⚙️  Configuration:
   - Memory store: /Users/you/.mcp-memories.json
   - Save interval: every 5 operations
   - TODO TTL: 24h
   - Phase TTL: 7d
   - Project TTL: permanent
```

Check your server logs to verify your configuration is being applied.

---

## 🛠️ Testing Your Configuration

### 1. Check Environment Variables

```bash
# In your terminal
echo $MCP_MEMORY_STORE_PATH
echo $MCP_MEMORY_SAVE_INTERVAL
```

### 2. Test Memory Location

```bash
# Create a test TODO, then check if file exists
ls -la /path/you/configured/.mcp-memories.json
```

### 3. Verify Save Interval

Watch server logs for `[Persistence] Saved memory store` messages. Count operations between saves.

### 4. Test Decay

```bash
# View memory store timestamps
cat .mcp-memory-store.json | jq '.todos[] | {title, created}'

# Wait past TTL, restart server
npm start

# Check if memories decayed
cat .mcp-memory-store.json | jq '.todos[] | {title, created}'
```

---

## 📊 Configuration Best Practices

### For Individual Developers

**Recommended:**
```json
{
  "env": {
    "MCP_MEMORY_STORE_PATH": "~/.mcp-memories.json",
    "MCP_MEMORY_SAVE_INTERVAL": "10"
  }
}
```

**Why:** Shared memory across projects, standard auto-save.

---

### For Teams (Shared Memory)

**Recommended:**
```json
{
  "env": {
    "MCP_MEMORY_STORE_PATH": "/shared/project/.team-memories.json",
    "MCP_MEMORY_SAVE_INTERVAL": "5"
  }
}
```

**Why:** Team-shared memory (if network filesystem), faster saves.

**Note:** Requires careful concurrency management if multiple users.

---

### For CI/CD

**Recommended:**
```json
{
  "env": {
    "MCP_MEMORY_STORE_PATH": "/tmp/ci-memories-${BUILD_ID}.json",
    "MCP_MEMORY_TODO_TTL": "3600000"
  }
}
```

**Why:** Isolated per-build, aggressive decay (1h).

---

## 🚨 Common Issues

### Issue: Configuration Not Applied

**Symptoms:** Server logs show default values

**Solution:**
1. Check JSON syntax in settings file
2. Restart VSCode/editor completely
3. Verify environment variables in shell:
   ```bash
   node -e "console.log(process.env.MCP_MEMORY_STORE_PATH)"
   ```

---

### Issue: Memory File Not Found

**Symptoms:** `[Persistence] No existing memory store found`

**Solution:**
- This is **normal** on first run
- File will be created automatically
- Check path is writable:
  ```bash
  touch /your/configured/path.json
  ```

---

### Issue: Permission Denied

**Symptoms:** `[Persistence] Health: Memory persistence is not working: EACCES`

**Solution:**
```bash
# Check permissions
ls -l /path/to/memory/store.json

# Fix permissions
chmod 644 /path/to/memory/store.json

# Fix directory permissions
chmod 755 /path/to/memory/
```

---

### Issue: Memory Store in Wrong Location

**Symptoms:** Expected file doesn't exist, but memories persist

**Solution:**
```bash
# Find where it actually is
find ~ -name ".mcp-memory-store.json"

# Check server logs for actual path
# Look for: "📁 Memory store: /actual/path"
```

---

## 🔐 Security Considerations

### Sensitive Data

**Memory stores may contain:**
- File paths
- Project structure
- Error messages
- Decisions and notes

**Recommendations:**
1. **Don't commit memory stores:** Already in `.gitignore`
2. **Use project-specific stores:** Avoid shared stores with sensitive projects
3. **Encrypt if needed:** 
   ```bash
   # Backup encrypted
   tar czf - .mcp-memory-store.json | openssl enc -aes-256-cbc > memories.tar.gz.enc
   ```

---

### Team Sharing

**If sharing memory stores:**
- Use read-only access for viewers
- Implement concurrency control (not built-in)
- Consider separate stores per developer

---

## 📚 Related Documentation

- **[PERSISTENCE.md](./PERSISTENCE.md)** - Detailed persistence guide
- **[MEMORY_GUIDE.md](./MEMORY_GUIDE.md)** - Memory system usage
- **[README.md](./README.md)** - General overview

---

## 🎯 Quick Reference

**Default Values:**
```
MCP_MEMORY_STORE_PATH = .mcp-memory-store.json
MCP_MEMORY_SAVE_INTERVAL = 10
MCP_MEMORY_TODO_TTL = 86400000 (24 hours)
MCP_MEMORY_PHASE_TTL = 604800000 (7 days)
MCP_MEMORY_PROJECT_TTL = -1 (permanent)
```

**VSCode Config Location:**
- macOS/Linux: `~/.vscode/settings.json` or workspace settings
- Windows: `%APPDATA%\Code\User\settings.json`

**Most Common Custom Config:**
```json
{
  "env": {
    "MCP_MEMORY_STORE_PATH": "~/.mcp-memories.json"
  }
}
```

---

**Last Updated:** 2025-10-13  
**Questions:** See README.md for support contacts
