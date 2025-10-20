# File Watching System Guide

**Version:** 1.0.0  
**Last Updated:** 2025-10-18

---

## 🎯 Overview

The MCP server includes an automatic **file indexing system** that watches directories for changes and keeps the Neo4j knowledge graph synchronized with your codebase. This enables the agent chain to always have up-to-date context about your project files.

---

## 🏗️ Architecture

### Mount Points

The system uses **environment-based path detection** to work seamlessly in both host and Docker environments:

| Environment | Detection | Default Watch Path | Configuration |
|-------------|-----------|-------------------|---------------|
| **Docker Container** | `WORKSPACE_ROOT` env var exists | `/workspace/src` | Set in `docker compose.yml` |
| **Host Machine** | No `WORKSPACE_ROOT` | `$(pwd)/src` | Override with `WATCH_PATH` env var |

### Docker Configuration

The `docker compose.yml` bind mount configuration:

```yaml
mcp-server:
  environment:
    - WORKSPACE_ROOT=/workspace
  volumes:
    - ${HOST_WORKSPACE_ROOT:-~/src}:/workspace:ro
```

**Key points:**
- **Host side**: Configurable via `HOST_WORKSPACE_ROOT` (defaults to `~/src`)
- **Container side**: Always `/workspace` (standardized)
- **Mode**: `ro` (read-only) - best practice for file watching
- **Auto-detection**: `WORKSPACE_ROOT` env var signals Docker environment

---

## 🚀 Quick Start

### Option 1: Use Default Paths (Recommended)

**On Host:**
```bash
# Watches ./src in current directory
node setup-file-watch.js
```

**In Docker:**
```bash
# Watches /workspace/src (mounted from host)
docker exec mcp_server node setup-file-watch.js
```

### Option 2: Custom Path

**On Host:**
```bash
# Watch a specific directory
WATCH_PATH=/path/to/your/project/src node setup-file-watch.js
```

**In Docker (change docker compose.yml):**
```yaml
mcp-server:
  volumes:
    - /path/to/your/project:/workspace:ro
```

---

## 📝 Setup Instructions

### Initial Setup

1. **Build the project:**
   ```bash
   npm install && npm run build
   ```

2. **Start Neo4j:**
   ```bash
   docker compose up -d neo4j
   ```

3. **Set up file watching:**
   ```bash
   node setup-file-watch.js
   ```

4. **Verify indexing:**
   ```bash
   node check-watches.js
   ```

### Docker Deployment

1. **Set host workspace path** (optional - defaults to `~/src`):
   ```bash
   export HOST_WORKSPACE_ROOT=/path/to/your/projects
   ```

2. **Start all services:**
   ```bash
   docker compose up -d
   ```

3. **Set up file watching in container:**
   ```bash
   docker exec mcp_server node setup-file-watch.js
   ```

4. **Verify from container:**
   ```bash
   docker exec mcp_server node check-watches.js
   ```

---

## 🔧 Configuration

### File Patterns

Default patterns watched:
- `*.ts` - TypeScript files
- `*.js` - JavaScript files
- `*.json` - Configuration files
- `*.md` - Documentation

### Ignore Patterns

Default exclusions:
- `*.test.ts`, `*.spec.ts` - Test files
- `node_modules/**` - Dependencies
- `build/**` - Build artifacts
- `.git/**` - Git metadata

### Custom Configuration

Edit `setup-file-watch.js` to customize:

```javascript
const config = await configManager.createWatch({
  path: folderPath,
  recursive: true,
  debounce_ms: 500,
  file_patterns: ['*.ts', '*.js', '*.json', '*.md', '*.py'], // Add Python
  ignore_patterns: ['*.test.ts', '*.spec.ts', 'node_modules/**', 'build/**', 'dist/**'],
  generate_embeddings: false // Controlled by MIMIR_EMBEDDINGS_ENABLED env var
});
```

**For vector embeddings support**, see [Vector Embeddings Guide](./VECTOR_EMBEDDINGS_GUIDE.md) and set environment variables in `.env`:
```bash
MIMIR_FEATURE_VECTOR_EMBEDDINGS=true
MIMIR_EMBEDDINGS_ENABLED=true
```

---

## 📊 Monitoring

### Check Active Watches

```bash
node check-watches.js
```

**Output:**
```
📋 Active Watch Configurations:
  ID: watch-1760854355537-b4139e54
  Path: /Users/timothysweet/src/mimir/src
  Status: active
  Files indexed: 31
  File patterns: *.ts, *.js, *.json, *.md
  Recursive: true

📁 Recently Indexed Files:
  Total: 31 files
  - indexing/FileIndexer.ts
  - indexing/FileWatchManager.ts
  - managers/GraphManager.ts
  ...
```

### Query Indexed Files via Agent Chain

```bash
npm run chain "what files do we have in the project?"
```

The agent will use the graph context to answer based on indexed files.

---

## 🐛 Troubleshooting

### Path Does Not Exist

**Error:**
```
❌ Path does not exist: /workspace/src
```

**Solutions:**

1. **On host:** Specify correct path
   ```bash
   WATCH_PATH=/correct/path/to/src node setup-file-watch.js
   ```

2. **In Docker:** Check mount configuration
   ```bash
   docker inspect mcp_server | grep Mounts -A 20
   ```

3. **Verify mount point:**
   ```bash
   docker exec mcp_server ls -la /workspace
   ```

### Already Watching

**Output:**
```
⚠️  Already watching this folder: watch-1760854355537-b4139e54
   Status: active
   Files indexed: 31
```

This is **normal** - the watch is already active. To re-index:

```bash
# Remove old watch (optional)
# Then re-run setup
node setup-file-watch.js
```

### No Files Indexed

**Check:**

1. **Patterns match your files:**
   ```javascript
   file_patterns: ['*.ts', '*.js', '*.json', '*.md']
   ```

2. **Not excluded by .gitignore:**
   - File watcher respects `.gitignore`
   - Check if files are git-ignored

3. **Path is correct:**
   ```bash
   ls -la /path/to/watch/directory
   ```

### Docker Container Path Issues

**Symptom:** Container can't find files at `/workspace`

**Check mount:**
```bash
docker compose config | grep -A 10 volumes
```

**Expected output:**
```yaml
volumes:
  - /Users/you/src:/workspace:ro
```

**Fix:** Set `HOST_WORKSPACE_ROOT` before starting:
```bash
export HOST_WORKSPACE_ROOT=/your/projects/dir
docker compose up -d
```

---

## 🎯 Best Practices

### 1. Use Read-Only Mounts

Docker containers should mount workspaces as **read-only** (`ro`) for security:

```yaml
volumes:
  - ${HOST_WORKSPACE_ROOT:-~/src}:/workspace:ro
```

### 2. Watch Specific Subdirectories

For large projects, watch only relevant directories:

```bash
WATCH_PATH=/workspace/src node setup-file-watch.js  # Source only
WATCH_PATH=/workspace/docs node setup-file-watch.js # Docs only
```

### 3. Set Up Watches After Container Start

Add to your deployment automation:

```bash
#!/bin/bash
docker compose up -d
sleep 5  # Wait for services
docker exec mcp_server node setup-file-watch.js
```

### 4. Environment Variables for Teams

**Team setup (`.env.example`):**
```bash
# Docker configuration
HOST_WORKSPACE_ROOT=/path/to/team/project
NEO4J_PASSWORD=secure_password

# Watch configuration
WATCH_PATH=/workspace/src
```

**Individual developer:**
```bash
# Copy and customize
cp .env.example .env
# Edit .env with your local paths
```

---

## 📚 Integration with Agent Chain

### How It Works

1. **Files indexed** → Stored as `file` nodes in Neo4j
2. **Agent chain query** → `gatherGraphContext()` searches indexed files
3. **Context injection** → File information included in agent prompts
4. **Agents reference files** → Informed decisions based on codebase

### Example Workflow

```bash
# 1. Set up file watching
node setup-file-watch.js

# 2. Verify files indexed
node check-watches.js
# Output: Total: 31 files

# 3. Run agent chain with file context
npm run chain "explain the GraphManager architecture"

# 4. Agent output references indexed files:
# "Based on the indexed files, GraphManager is defined in managers/GraphManager.ts..."
```

### Graph Context Output

When agent chain runs:
```
🔍 Gathering context from knowledge graph...
  - Checking indexed files...
    Found 31 indexed files
✅ Context gathered (7 sections, 734 chars)
```

Files are included in agent prompts, enabling them to:
- Reference existing code
- Avoid duplicating functionality
- Suggest modifications to correct files
- Understand project structure

---

## 🔄 Next Steps

### Vector Embeddings & Semantic Search (Available Now!)

Enable vector embeddings for semantic file search via environment variables:

**Edit `.env`:**
```bash
MIMIR_FEATURE_VECTOR_EMBEDDINGS=true
MIMIR_EMBEDDINGS_ENABLED=true
MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
```

**Start with Ollama:**
```bash
docker compose --profile ollama up -d
docker exec ollama_server ollama pull nomic-embed-text
```

**Re-index with embeddings:**
```bash
docker exec mcp_server node setup-watch.js
```

This enables queries like:
- "Find files related to authentication"
- "Which files implement graph operations?"
- "Show me database connection code"

**See [Vector Embeddings Guide](./VECTOR_EMBEDDINGS_GUIDE.md) for complete documentation.**

### Phase 3: Real-Time Updates

Currently using **manual indexing** (one-time scan). Future:
- Automatic re-indexing on file changes
- Incremental updates (only changed files)
- Change event propagation to active agents

---

## 📖 Related Documentation

- **[Multi-Agent Architecture](../architecture/MULTI_AGENT_GRAPH_RAG.md)** - System overview
- **[File Indexing System](../architecture/FILE_INDEXING_SYSTEM.md)** - Technical design
- **[Docker Deployment Guide](./DOCKER_DEPLOYMENT_GUIDE.md)** - Container setup
- **[Memory Guide](../architecture/MEMORY_GUIDE.md)** - Knowledge graph usage
- **[Configuration Guide](../configuration/CONFIGURATION.md)** - MCP client setup

---

**Questions?** Check [GitHub Issues](https://github.com/orneryd/GRAPH-RAG-TODO/issues) or the project README.
