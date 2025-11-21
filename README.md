<img width="283" height="380" alt="image" src="https://github.com/user-attachments/assets/f4e3be80-79fe-4e10-b010-9a39b5f70584" />

# M.I.M.I.R - Multi-agent Intelligent Memory & Insight Repository 

## AI-Powered Memory Bank + Task Management Orchestration with Knowledge Graphs

[![Docker](https://img.shields.io/badge/docker-ready-blue?logo=docker)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green?logo=node.js)](https://nodejs.org/)
[![Neo4j](https://img.shields.io/badge/neo4j-5.15-008CC1?logo=neo4j)](https://neo4j.com/)
[![MCP](https://img.shields.io/badge/MCP-compatible-orange)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Official VSCode Extension](https://marketplace.visualstudio.com/items?itemName=OrneryD.mimir-chat)

**Give your AI agents a persistent memory with relationship understanding.**

Imagine your AI assistant that can remember every task you've discussed, understand how they relate to each other, and recall relevant context from weeks ago. Mimir makes this possible by combining Neo4j's powerful graph database with AI embeddings and the Model Context Protocol. Your AI doesn't just store isolated facts—it builds a living knowledge graph that grows smarter with every conversation. Perfect for developers managing complex projects where tasks depend on each other, contexts overlap, and you need an AI that truly understands your work.

Mimir is a Model Context Protocol (MCP) server that provides AI assistants (Claude, ChatGPT, etc.) with a persistent graph database to store tasks, context, and relationships. Instead of forgetting everything between conversations, your AI can remember, learn, and build knowledge over time.

---

**📖 Table of Contents**
- [Why Mimir?](#-why-mimir) - What problems does it solve?
- [Quick Start](#-quick-start-3-steps) - Get running in 5 minutes
- [Configuration](#%EF%B8%8F-configuration) - Environment setup
- [Usage](#-usage) - How to use with AI agents
- [File Indexing](#file-indexing) - Index your codebase for RAG
- [Architecture](#%EF%B8%8F-architecture) - How it works
- [Features](#-key-features) - What can it do?
- [PCTX Integration](#-pctx-integration-code-mode) - 98% token reduction with Code Mode
- [Troubleshooting](#-troubleshooting) - Common issues
- [Documentation](#-documentation) - Learn more

---

## 🎯 Why Mimir?

**Without Mimir:**
- AI forgets context between conversations
- No persistent task tracking
- Can't see relationships between tasks
- Limited to current conversation context

**With Mimir:**
- AI remembers all tasks and context
- Persistent Neo4j graph database
- Discovers relationships automatically
- Multi-agent coordination
- Semantic search with AI embeddings

**Perfect for:**
- Long-term software projects
- Multi-agent AI workflows
- Complex task orchestration
- Knowledge graph building

## ⚡ Quick Start (3 Steps)

> 💡 **New to Mimir?** Check out the [5-minute Quick Start Guide](docs/getting-started/QUICKSTART.md) for a step-by-step walkthrough.

> 🔌 **Connecting to IDE?** See the [IDE Integration Guide](docs/guides/IDE_INTEGRATION_GUIDE.md) for VS Code, Cursor, and Windsurf setup!

> 🎯 **VS Code Users?** Try the [Dev Container setup](.devcontainer/README.md) for instant environment with zero configuration!

### 1. Prerequisites

- **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/)
- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)

### 2. Install & Start

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

### 3. Verify It's Working

```bash
# Check that all services are running
npm run status
# Or manually: docker compose ps

# View logs
npm run logs

# Open Mimir Web UI (includes file indexing, orchestration studio, and portal)
# Visit: http://localhost:9042

# Open Neo4j Browser (default password: "password")
# Visit: http://localhost:7474

# Check MCP server health
curl http://localhost:9042/health
```

**Available Commands:**
- `npm run start` - Start all services
- `npm run stop` - Stop all services
- `npm run restart` - Restart services
- `npm run logs` - View logs
- `npm run status` - Check service status
- `npm run rebuild` - Full rebuild without cache

See [scripts/START_SCRIPT.md](scripts/START_SCRIPT.md) for more details.

**You're ready!** The Mimir Web UI is now available at `http://localhost:9042`

**What you get:**
- 🎯 **Portal**: Main hub with navigation and file indexing http://localhost:9042/portal
- 🎨 **Orchestration Studio**: Visual workflow builder (beta) http://localhost:9042/studio
- 🔌 **MCP API**: RESTful API at `http://localhost:9042/mcp`
- 💬 **Chat API**: Conversational interface at `http://localhost:9042/api/chat`

## ⚙️ Configuration

### Environment Variables

Edit the `.env` file to customize your setup. **Most users can use the defaults.**

#### Core Settings (Required)

```bash
# Neo4j Database
NEO4J_PASSWORD=password          # Change in production!

# Docker Workspace Mount
HOST_WORKSPACE_ROOT=~/src        # Your main workspace area
```

#### LLM Configuration (For Chat API & Orchestration)

```bash
# Provider Selection
MIMIR_DEFAULT_PROVIDER=openai                    # Options: openai, copilot, ollama, llama.cpp

# LLM API Configuration  
MIMIR_LLM_API=http://copilot-api:4141           # Base URL (required)
MIMIR_LLM_API_PATH=/v1/chat/completions         # Optional (default: /v1/chat/completions)
MIMIR_LLM_API_MODELS_PATH=/v1/models            # Optional (default: /v1/models)
MIMIR_LLM_API_KEY=dummy-key                     # Optional (use for OpenAI API)

# Model Selection
MIMIR_DEFAULT_MODEL=gpt-4.1                     # Default: gpt-4.1

# Embeddings Configuration
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large        # Default: mxbai-embed-large
MIMIR_EMBEDDINGS_API=http://llama-server:8080  # Embeddings endpoint
MIMIR_EMBEDDINGS_API_PATH=/v1/embeddings       # Optional (default: /v1/embeddings)
MIMIR_EMBEDDINGS_DIMENSIONS=1024               # Default: 1024
MIMIR_EMBEDDINGS_CHUNK_SIZE=768                # Default: 768
```

**Provider Options:**
- `openai` or `copilot`: OpenAI-compatible endpoints (GitHub Copilot, OpenAI API, or any compatible service)
- `ollama` or `llama.cpp`: Local LLM providers (Ollama or llama.cpp - interchangeable)

**Configuration Examples:**

**Example 1: Copilot API** (GitHub Copilot license, recommended for development):
```bash
MIMIR_DEFAULT_PROVIDER=openai
MIMIR_LLM_API=http://copilot-api:4141
MIMIR_DEFAULT_MODEL=gpt-4.1
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
MIMIR_EMBEDDINGS_DIMENSIONS=1024
MIMIR_EMBEDDINGS_CHUNK_SIZE=768
```

**Example 2: Local Ollama** (offline, fully local):
```bash
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_LLM_API=http://ollama:11434
MIMIR_DEFAULT_MODEL=qwen2.5-coder
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
```

**Example 3: OpenAI API** (cloud-based, requires API key):
```bash
MIMIR_DEFAULT_PROVIDER=openai
MIMIR_LLM_API=https://api.openai.com
MIMIR_LLM_API_PATH=/v1/chat/completions
MIMIR_LLM_API_KEY=sk-...
MIMIR_DEFAULT_MODEL=gpt-4
MIMIR_EMBEDDINGS_MODEL=text-embedding-3-small
MIMIR_EMBEDDINGS_DIMENSIONS=1536
```

**Available Models (Dynamic):**

Models are **fetched dynamically** from your configured LLM provider at runtime. To see available models:

```bash
# Query Mimir's models endpoint
curl http://localhost:9042/api/models

# Or query your LLM provider directly
curl $LLM_API_URL/v1/models
```

All models from the LLM provider's `/v1/models` endpoint are automatically available - no hardcoded list!

**Switching Providers:** Change `MIMIR_DEFAULT_PROVIDER` and `MIMIR_LLM_API` in `.env`, then restart:
```bash
docker compose restart mimir-server
```
Existing conversations remain unchanged - the new provider is used for subsequent messages.

#### Embeddings (Optional - for semantic search)

```bash
# Enable vector embeddings for AI semantic search
MIMIR_EMBEDDINGS_ENABLED=true
MIMIR_FEATURE_VECTOR_EMBEDDINGS=true

# Embedding provider (uses same endpoints as LLM by default)
MIMIR_EMBEDDINGS_API=http://llama-server:8080
MIMIR_EMBEDDINGS_MODEL=nomic-embed-text
MIMIR_EMBEDDINGS_DIMENSIONS=1024
```

Embeddings can use the same endpoint as your LLM, or a separate specialized service (like llama.cpp for embeddings only).

**Supported Embedding Models:**
- `nomic-embed-text` (default - lightweight, 768 dims)
- `mxbai-embed-large` (higher quality, 1024 dims)
- `text-embedding-3-small` (OpenAI, 1536 dims - requires OpenAI LLM provider)

#### Advanced Settings (Optional)

```bash
# Auto-index Mimir documentation on startup (default: true)
# Allows users to immediately query Mimir's docs via semantic search
MIMIR_AUTO_INDEX_DOCS=true

# Per-agent model overrides (optional - defaults to MIMIR_DEFAULT_MODEL)
MIMIR_PM_MODEL=gpt-4.1               # PM agent model
MIMIR_WORKER_MODEL=gpt-4o-mini       # Worker agent model  
MIMIR_QC_MODEL=gpt-4.1               # QC agent model

# Corporate Proxy (if needed)
HTTP_PROXY=http://proxy.company.com:8080
HTTPS_PROXY=http://proxy.company.com:8080

# Custom CA Certificates (if needed)
SSL_CERT_FILE=/path/to/corporate-ca.crt
```

**Documentation Auto-Indexing:**

By default, Mimir automatically indexes its own documentation (`/app/docs`) on startup. This allows you to immediately query Mimir's documentation using semantic search:

```
"How do I configure embeddings?"
"Show me the IDE integration guide"
"Explain the multi-agent architecture"
```

To disable auto-indexing, set in `.env`:
```bash
MIMIR_AUTO_INDEX_DOCS=false
```

See `.env.example` or `docker-compose.yml` for complete list of configuration options.

### Optional Services

By default, only the core services run (Mimir Server, Neo4j, Copilot API). You can enable additional services by uncommenting them in `docker-compose.yml`:

#### Enable Ollama (Local LLM Provider)

**Why enable?** Run LLMs completely offline, no external dependencies.

```bash
# 1. Edit docker-compose.yml - uncomment the ollama service
# 2. Update .env file:
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_LLM_API=http://ollama:11434
MIMIR_DEFAULT_MODEL=qwen2.5-coder

# 3. Restart services
docker compose up -d
```

**Using External Ollama Instead:**

If you already have Ollama running on your host or another machine:

```bash
# In .env file:
MIMIR_LLM_API=http://192.168.1.100:11434  # Your Ollama server

# Restart Mimir
docker compose restart mimir-server
```

#### Enable Open-WebUI (Alternative Chat Interface)

**Why enable?** Alternative web UI for chatting with Ollama models, useful for testing.

```bash
# 1. Edit docker-compose.yml - uncomment the open-webui service and volumes
# 2. Restart services
docker compose up -d

# 3. Access Open-WebUI at http://localhost:3000
```

**Configuration:**
- Uses Copilot API by default for models
- Can be configured to use Ollama instead
- See `docker/open-webui/README.md` for details

## 🎯 Usage

### VSCode Extension (⭐ NEW!)

**Mimir Chat Assistant** brings Graph-RAG directly into VSCode with native chat integration.

#### Installation

1. **Package the extension:**
   ```bash
   cd vscode-extension
   npm install
   npm run compile
   npm run package  # Creates mimir-chat-0.1.0.vsix
   ```

2. **Install in VSCode:**
   - `Cmd+Shift+P` → "Extensions: Install from VSIX..."
   - Select `mimir-chat-0.1.0.vsix`
   - Reload VSCode

#### Usage

Type `@mimir` in the VSCode Chat window:

```
@mimir what is Neo4j?
@mimir -u research how does graph RAG work?
@mimir -m gpt-4.1 -d 3 explain multi-agent orchestration
```

#### Flags (Per-Message Overrides)

| Flag | Short | Description | Example |
|------|-------|-------------|---------|
| `--use` | `-u` | Preamble/chatmode | `@mimir -u research ...` |
| `--model` | `-m` | Model override | `@mimir -m gpt-4o ...` |
| `--depth` | `-d` | Graph depth (1-3) | `@mimir -d 3 ...` |
| `--limit` | `-l` | Max results | `@mimir -l 20 ...` |
| `--similarity` | `-s` | Threshold (0-1) | `@mimir -s 0.7 ...` |
| `--max-tools` | `-t` | Max tool calls | `@mimir -t 5 ...` |
| `--no-tools` | | Disable tools | `@mimir --no-tools ...` |

#### Extension Settings

Configure via `Preferences > Settings > Mimir`:

```json
{
  "mimir.apiUrl": "http://localhost:9042",
  "mimir.defaultPreamble": "mimir-v2",
  "mimir.model": "gpt-4.1",
  "mimir.vectorSearch.depth": 1,
  "mimir.vectorSearch.limit": 10,
  "mimir.vectorSearch.minSimilarity": 0.5,
  "mimir.enableTools": true,
  "mimir.maxToolCalls": 3
}
```

**Model Selection:**
- The extension respects the **VS Code Chat dropdown** (the "Claude Sonnet 4.5" selector in Chat UI)
- Override with `-m` flag: `@mimir -m gpt-4.1 ...`
- Fallback to `mimir.model` setting if dropdown not available

**Chatmode/Preamble Behavior:**
- First message: Uses `mimir.defaultPreamble` setting
- Follow-ups: Keeps existing preamble from conversation
- Switch with `-u` flag: `@mimir -u hackerman analyze this`

#### See Also
- [vscode-extension/README.md](vscode-extension/README.md) - Detailed extension documentation
- [vscode-extension/TESTING.md](vscode-extension/TESTING.md) - Testing and development

---

### Using with AI Agents (MCP)

Mimir works as an MCP server - AI assistants can call it to store and retrieve information.

**Example conversation with Claude/ChatGPT:**

```
You: "Create a TODO for implementing user authentication"

AI: [Uses create_todo tool]
✓ Created TODO: "Implement user authentication" (todo-123)

You: "Add context about which files are involved"

AI: [Uses update_todo_context tool]
✓ Added context: src/auth.ts, src/middleware/auth.ts

You: "Show me all pending tasks"

AI: [Uses list_todos tool]
Found 3 pending tasks:
1. Implement user authentication
2. Set up database migrations
3. Write API documentation
```

### Available Tools

Mimir provides **13 MCP tools** for AI agents:

**Memory Operations** (6 tools):
- `memory_node` - Create/read/update nodes (tasks, files, concepts)
- `memory_edge` - Create relationships between nodes  
- `memory_batch` - Bulk operations for efficiency
- `memory_lock` - Multi-agent coordination
- `memory_clear` - Clear data (use carefully!)
- `get_task_context` - Get filtered context by agent type

**File Indexing** (3 tools):
- `index_folder` - Index code files into graph
- `remove_folder` - Stop watching folder
- `list_folders` - Show watched folders

**Vector Search** (2 tools):
- `vector_search_nodes` - Semantic search with AI embeddings
- `get_embedding_stats` - Embedding statistics

**Todo Management** (2 tools):
- `todo` - Manage individual tasks
- `todo_list` - Manage task lists

### File Indexing

Mimir can automatically index your codebase for semantic search and RAG (Retrieval-Augmented Generation). Files are watched for changes and re-indexed automatically.

#### Quick Start

**Add a folder to index:**
```bash
# Using local path (recommended)
npm run index:add /path/to/your/project

# Or using workspace mount path (if local path fails)
npm run index:add /workspace/my-project

# With embeddings (slower but enables semantic search)
npm run index:add /path/to/your/project --embeddings
```

**List indexed folders:**
```bash
npm run index:list
```

**Remove a folder:**
```bash
npm run index:remove /path/to/your/project
```

> ⚠️ **Note**: Large folders may take several minutes to index. Don't kill the process! Watch the logs to see chunking progress. The script will show "✨ Done!" when complete.

#### Supported File Types

**✅ Fully Supported (with syntax highlighting):**
- **Languages**: TypeScript (.ts, .tsx), JavaScript (.js, .jsx), Python (.py), Java (.java), Go (.go), Rust (.rs), C/C++ (.c, .cpp), C# (.cs), Ruby (.rb), PHP (.php)
- **Markup**: Markdown (.md), HTML (.html), XML (.xml)
- **Data**: JSON (.json), YAML (.yaml, .yml), SQL (.sql)
- **Styles**: CSS (.css), SCSS (.scss)
- **Documents**: PDF (.pdf), DOCX (.docx) - text extraction

**✅ Generic Support (plain text indexing):**
- Any text file not in the skip list below

**❌ Automatically Skipped:**
- **Images**: .png, .jpg, .jpeg, .gif, .bmp, .ico, .svg, .webp, .tiff
- **Videos**: .mp4, .avi, .mov, .wmv, .flv, .webm, .mkv
- **Audio**: .mp3, .wav, .ogg, .m4a, .flac, .aac
- **Archives**: .zip, .tar, .gz, .rar, .7z, .bz2
- **Binaries**: .exe, .dll, .so, .dylib, .bin, .wasm
- **Compiled**: .pyc, .pyo, .class, .o, .obj
- **Databases**: .db, .sqlite, .sqlite3
- **Lock files**: package-lock.json, yarn.lock, pnpm-lock.yaml

#### .gitignore Respect

Mimir **automatically respects your `.gitignore` file**:

```bash
# Your .gitignore
node_modules/
dist/
.env
*.log

# These will NOT be indexed ✅
```

**Additional patterns:**
- Hidden files (`.git/`, `.DS_Store`)
- Build artifacts (`build/`, `dist/`, `out/`)
- Dependencies (`node_modules/`, `venv/`, `vendor/`)

#### Indexing Examples

**Index a single project:**
```bash
npm run index:add ~/projects/my-app
```

**Index multiple projects:**
```bash
# Bash/Zsh
for dir in ~/projects/*/; do
  npm run index:add "$dir"
done

# PowerShell
Get-ChildItem ~/projects -Directory | ForEach-Object {
  npm run index:add $_.FullName
}
```

**Check what's indexed:**
```bash
# List all indexed folders
npm run index:list

# Or query Neo4j directly for file count
curl -u neo4j:password -X POST http://localhost:7474/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -d '{"statements":[{"statement":"MATCH (f:File) RETURN count(f) as file_count"}]}'
```

#### How It Works

1. **Scan**: Walks directory tree, respecting `.gitignore`
2. **Parse**: Extracts text content (or from PDF/DOCX)
3. **Chunk**: Splits large files into 1000-char chunks
4. **Embed**: Generates vector embeddings for semantic search (optional)
5. **Store**: Creates File nodes and FileChunk nodes in Neo4j
6. **Watch**: Monitors for changes and re-indexes automatically

#### Storage Details

**File Node Properties:**
- `path`: Relative path from workspace root
- `absolute_path`: Full filesystem path
- `name`: Filename
- `extension`: File extension
- `language`: Detected language (typescript, python, etc.)
- `content`: Full file content
- `size_bytes`: File size
- `line_count`: Number of lines
- `last_modified`: Last modification timestamp

**FileChunk Node Properties:**
- `text`: Chunk content (max 1000 chars)
- `chunk_index`: Position in file (0, 1, 2...)
- `embedding`: Vector embedding (1024 dimensions)

**Relationships:**
- `File -[:HAS_CHUNK]-> FileChunk`

#### Performance

- **Small projects** (<100 files): ~5-10 seconds
- **Medium projects** (100-1000 files): ~30-60 seconds
- **Large projects** (1000+ files): ~2-5 minutes

**With embeddings enabled**: Add ~50% more time for vector generation.

#### Troubleshooting

**Problem: Local path fails to index**
```bash
# If local machine path fails, use workspace mount path instead
npm run index:add /workspace/my-project/subfolder

# The workspace mount path matches the internal Docker mount
# Check your docker-compose.yml for the workspace mount location
```

**Problem: Files not being indexed**
```bash
# Check .gitignore patterns
cat .gitignore

# Verify file is not in skip list (see "Automatically Skipped" section above)

# Check file is readable
ls -la /path/to/file
```

**Problem: Process seems stuck**
```bash
# Don't kill it! Large folders take time to index.
# Watch the logs to see progress:
docker compose logs -f mimir-server

# You should see:
# - "📄 Indexing file: ..." (scanning)
# - "📝 Created chunk X for file Y" (chunking)
# - "✨ Done!" (complete)
```

**Problem: Too many files indexed**
```bash
# Add patterns to .gitignore
echo "node_modules/" >> .gitignore
echo "dist/" >> .gitignore

# Re-index (will respect new .gitignore)
npm run index:remove /path/to/project
npm run index:add /path/to/project
```

**Problem: Embeddings not working**
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Verify model is available
docker exec -it ollama_server ollama list | grep mxbai

# If Ollama is running but the embedding model isn't present (or you see
# embedding errors at runtime), you can pull the model using the npm helper
# script instead of calling Docker directly. Default model for code embeddings:
# `nomic-embed-text`
npm run ollama:pull nomic-embed-text

# or Pull embedding model manually

docker exec -it ollama_server ollama pull nomic-embed-text
```
### Web UI

Access Mimir through your browser at `http://localhost:9042`:

**🎯 Portal (Main Hub)**
- File indexing management (add/remove folders)
- Navigation to other features
- System status and health

**🎨 Orchestration Studio (Coming Soon)**
- Visual workflow builder
- Agent coordination
- Task dependency graphs

### HTTP APIs

Mimir provides multiple APIs for different use cases:

**1. MCP API** - For AI assistants (Claude, ChatGPT, etc.)
```bash
# Initialize MCP session
curl -X POST http://localhost:9042/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "my-app", "version": "1.0.0"}
    },
    "id": 1
  }'

# Call a tool (create TODO)
curl -X POST http://localhost:9042/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "todo",
      "arguments": {
        "operation": "create",
        "title": "My Task",
        "priority": "high"
      }
    },
    "id": 2
  }'
```

**2. Chat API** - For conversational interfaces
```bash
# Send a message (streaming response)
curl -X POST http://localhost:9042/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a todo for implementing authentication",
    "conversationId": "my-session-123"
  }'
```

### Chat API with MCP Tools & RAG

The Chat API (`/api/chat`) provides OpenAI-compatible chat completions with **built-in MCP tool support** and **Retrieval-Augmented Generation (RAG)**.

#### Features
- **Full MCP Tool Support**: Access all 13 Mimir tools (memory, file indexing, semantic search, todos)
- **Semantic Search**: Automatically retrieves relevant context from indexed files
- **Conversation Memory**: Persists conversations with thread IDs
- **Multi-Provider LLM Support**: Switch between Ollama, OpenAI, copilot-api with one config

#### LLM Configuration

The Chat API uses a **unified LLM configuration** - switch providers by changing environment variables only:

```bash
# Provider Selection
MIMIR_DEFAULT_PROVIDER=openai        # Options: openai, ollama

# API Endpoint
MIMIR_LLM_API=http://copilot-api:4141

# Model Selection
MIMIR_DEFAULT_MODEL=gpt-4.1          # Default: gpt-4.1

# Embedding Model
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
```

#### Provider Examples

**Using Copilot API** (GitHub Copilot license - recommended for development)
```bash
MIMIR_DEFAULT_PROVIDER=openai
MIMIR_LLM_API=http://copilot-api:4141
MIMIR_DEFAULT_MODEL=gpt-4.1
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
```

**Using Local Ollama**
```bash
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_LLM_API=http://ollama:11434
MIMIR_DEFAULT_MODEL=qwen2.5-coder
MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large
```

**Using OpenAI API**
```bash
MIMIR_DEFAULT_PROVIDER=openai
MIMIR_LLM_API=https://api.openai.com
MIMIR_LLM_API_KEY=sk-...
MIMIR_DEFAULT_MODEL=gpt-4-turbo
```

#### Chat API Request Format

```bash
POST /api/chat
Content-Type: application/json

{
  "message": "Create a TODO and index my project",
  "conversationId": "my-session-123",
  "enable_tools": true,           # Enable MCP tool access (default: true)
  "enable_rag": true,             # Enable semantic search context (default: true)
  "system_prompt": "You are a helpful AI assistant..."  # Optional custom system prompt
}
```

#### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `message` | string | âœ… | - | The user's message |
| `conversationId` | string | ✅ | new UUID | Conversation thread identifier |
| `enable_tools` | boolean | ✅ | true | Enable MCP tools (memory, todos, semantic search) |
| `enable_rag` | boolean | ✅ | true | Enable Retrieval-Augmented Generation |
| `system_prompt` | string | ✅ | default | Custom system prompt for this conversation |

#### Response Format (Streaming)

```json
{
  "type": "message",
  "content": "I've created a TODO and indexed your project...",
  "conversationId": "my-session-123",
  "toolCalls": [
    {
      "tool": "todo",
      "operation": "create",
      "result": "todo-456"
    },
    {
      "tool": "index_folder",
      "path": "/workspace/my-project",
      "result": "âœ“ Indexed 127 files"
    }
  ]
}
```

#### Switching Providers at Runtime

To switch providers, update `.env` and restart:

```bash
# Switch from copilot-api to Ollama
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_LLM_API=http://ollama:11434
docker compose restart mimir-server
```

All existing conversations and chat history remain intact. The new provider is used for subsequent messages.

#### Embedding Models

The embedding model determines semantic search quality. **mxbai-embed-large** is the default (high quality, efficient):

| Model | Dimensions | Speed | Notes |
|-------|-----------|-------|-------|
| `mxbai-embed-large` | 1024 | Fast | **Default - recommended** |
| `nomic-embed-text` | 768 | Fast | Lightweight alternative |
| `text-embedding-3-small` | 1536 | Fast | OpenAI-compatible, excellent quality |

Change in `.env`:
```bash
MIMIR_EMBEDDINGS_MODEL=text-embedding-3-small  # For OpenAI providers
MIMIR_EMBEDDINGS_DIMENSIONS=1536
```

**3. Orchestration API** - For workflow execution
```bash
# Execute a plan with multiple tasks
curl -X POST http://localhost:9042/api/orchestrate/execute \
  -H "Content-Type: application/json" \
  -d '{
    "plan": {
      "tasks": [
        {"id": "1", "title": "Setup project", "dependencies": []}
      ]
    }
  }'
```

## Architecture

### What's Running?

When you run `docker compose up -d`, you get these services:

| Service | Port | Purpose | URL |
|---------|------|---------|-----|
| **Mimir Server** | 9042 | Web UI + MCP API + Chat API | http://localhost:9042 |
| **Neo4j** | 7474, 7687 | Graph database storage | http://localhost:7474 |
| **Copilot API** | 4141 | AI model access (OpenAI-compatible) | http://localhost:4141 |

**Optional Services (commented out by default):**

| Service | Port | Purpose | Enable With |
|---------|------|---------|-------------|
| **Ollama** | 11434 | Local LLM embeddings | Uncomment in docker-compose.yml |
| **Open-WebUI** | 3000 | Alternative chat UI | Uncomment in docker-compose.yml |

> **Unified LLM Configuration**: The Chat API supports **any OpenAI-compatible endpoint**:
> - **Copilot API** (GitHub Copilot license) - Default provider
> - **Ollama** (local, offline)
> - **OpenAI API** (cloud-based)
> 
> Switch providers by changing `MIMIR_DEFAULT_PROVIDER` and `MIMIR_LLM_API` in `.env`

> **Embeddings**: Semantic search uses `MIMIR_EMBEDDINGS_MODEL` (default: `mxbai-embed-large` @ 1024 dimensions):
> - Set `MIMIR_EMBEDDINGS_API` to match your embeddings provider
> - Can use same endpoint as LLM or separate specialized service
> - See embeddings configuration section above for details

> **Open-WebUI**: Optional alternative chat interface. Useful for testing Ollama models locally. To enable, uncomment the `open-webui` service in docker-compose.yml and restart.

**Optional Services (commented out by default):**

| Service | Port | Purpose | Enable With |
|---------|------|---------|-------------|
| **Ollama** | 11434 | Local LLM embeddings | Uncomment in docker-compose.yml |
| **Open-WebUI** | 3000 | Alternative chat UI | Uncomment in docker-compose.yml |

> ï¿½ **Embeddings**: For semantic search, you need embeddings. Options:
> - Use external Ollama server (recommended - set `OLLAMA_BASE_URL` in .env)
> - Enable built-in Ollama service (uncomment in docker-compose.yml)
> - Use Copilot embeddings (experimental - set `MIMIR_EMBEDDINGS_PROVIDER=copilot`)
> - Use any OpenAI-compatible embeddings endpoint

> � **Copilot API**: Required for orchestration workflows. Provides OpenAI-compatible API using your GitHub Copilot license. Any OpenAI-compatible API also works.

> � **Open-WebUI**: Optional alternative chat interface. Useful for testing Ollama models locally. To enable, uncomment the `open-webui` service in docker-compose.yml and restart.

### How It Works

```
┌─────────────────────────────────────────┐
│          Mimir Server (Port 9042)       │
│  ┌─────────────────────────────────┐   │
│  │     Frontend (React + Vite)     │   │  ← Web UI
│  │  - Portal with file indexing     │   │
│  │  - Orchestration Studio          │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │      Backend (Node.js)          │   │
│  │  - MCP API  (/mcp)              │   │  ← AI Assistants
│  │  - Chat API (/api/chat)         │   │  ← Conversational
│  │  - Orchestration API (/api/...)  │   │  ← Workflows
│  └─────────────────────────────────┘   │
└───────────────┬─────────────────────────┘
                │
                ▼
┌───────────────────────────────────────┐
│       Neo4j DB (Ports 7474, 7687)     │  ← Persistent Storage
│  - Tasks, files, relationships        │
│  - Vector embeddings (semantic)       │
└───────────────────────────────────────┘
```

**Key Points:**
- **Mimir Server** provides both Web UI and APIs on port 9042
- **Neo4j** stores everything (tasks, relationships, files, embeddings)
- **Copilot API** provides AI models for orchestration (optional)
- **Ollama** provides embeddings for semantic search (optional, can be external)
- **All data persists** between restarts in `./data/neo4j/`

### Data Persistence

Your data is stored in local directories:

```
./data/neo4j/     # Database files (tasks, relationships, etc.)
./logs/           # Application logs
./copilot-data/   # GitHub authentication tokens
```

**✅ Stopping containers doesn't delete data!** Your tasks and knowledge graph persist.

## 🔧 Troubleshooting

### Common Issues

**Services won't start:**
```bash
# Check Docker is running
docker info

# Check for port conflicts
docker compose ps
docker compose logs

# Restart services
docker compose down
docker compose up -d
```

**Can't connect to Neo4j:**
```bash
# Wait for Neo4j to fully start (takes 30-60 seconds)
docker compose logs neo4j

# Check it's responding
curl http://localhost:7474

# Reset Neo4j data (⚠️ deletes everything!)
docker compose down
rm -rf ./data/neo4j
docker compose up -d
```

**Embeddings not working:**
```bash
# Check your .env file
cat .env | grep EMBEDDINGS

# If using Ollama, start it with profile
docker compose --profile ollama up -d

# Check Ollama is responding
curl http://localhost:11434/api/tags

# If using Copilot, verify authentication
docker compose logs copilot-api
```

**Port conflicts:**

If ports are already in use, edit `docker-compose.yml`:

```yaml
services:
  mimir-server:
    ports:
      - "9043:3000"  # Change 9043 to any available port
      
  neo4j:
    ports:
      - "7475:7474"  # Change 7475 to any available port
      - "7688:7687"  # Change 7688 to any available port
      
  copilot-api:
    ports:
      - "4142:4141"  # Change 4142 to any available port
```

### Need Help?

1. **Check logs:** `docker compose logs [service-name]`
2. **Service status:** `docker compose ps`
3. **Health checks:** 
   - Mimir Web UI: http://localhost:9042
   - Mimir API Health: http://localhost:9042/health
   - Neo4j Browser: http://localhost:7474
4. **GitHub Issues:** [Report a problem](https://github.com/orneryd/Mimir/issues)

## 💡 Usage Examples

### Basic Task Management

**Create a task:**
```javascript
{
  "operation": "create",
  "title": "Implement user authentication",
  "description": "Add JWT-based auth to API",
  "priority": "high",
  "status": "pending"
}
```

**Add context to task:**
```javascript
{
  "operation": "update",
  "id": "todo-123",
  "context": {
    "files": ["src/auth.ts", "src/middleware/auth.ts"],
    "apiEndpoint": "/api/auth/login"
  }
}
```

**List all tasks:**
```javascript
{
  "operation": "list",
  "status": "pending"  // Filter by status
}
```

### Knowledge Graph Features

**Create relationships:**
```javascript
// Link a task to a project
{
  "operation": "add",
  "source": "todo-123",
  "target": "project-456",
  "type": "part_of"
}
```

**Find related items:**
```javascript
// Get all tasks related to a project
{
  "operation": "neighbors",
  "node_id": "project-456",
  "edge_type": "part_of"
}
```

**Search with AI:**
```javascript
// Semantic search using embeddings
{
  "query": "authentication and security tasks",
  "limit": 5,
  "types": ["todo", "file"]
}
```

## 📚 Documentation

**Getting Started:**
- 🧠 [Memory Guide](docs/guides/MEMORY_GUIDE.md) - How to use the memory system
- 🕸️ [Knowledge Graph Guide](docs/guides/knowledge-graph.md) - Understanding graph relationships
- 🐳 [Docker Deployment](docs/guides/DOCKER_DEPLOYMENT_GUIDE.md) - Production deployment
- 🎨 **[Portal UI User Guide](docs/UI_USER_GUIDE.md) - Complete web interface tutorial** ⭐
- 🔌 **[Model Provider Guide](docs/guides/MIMIR_AS_MODEL_PROVIDER.md) - Use Mimir in Cursor, Continue.dev, and more** 🆕

**For AI Agent Developers:**
- 🤖 [AGENTS.md](docs/AGENTS.md) - Complete agent workflow guide
- 🔧 [Configuration Guide](docs/configuration/CONFIGURATION.md) - VSCode, Cursor, Claude Desktop setup
- 🧪 [Testing Guide](docs/testing/TESTING_GUIDE.md) - Test suite overview

**Advanced Topics:**
- 🏗️ [Multi-Agent Architecture](docs/architecture/MULTI_AGENT_GRAPH_RAG.md) - System architecture
- 🛣️ [Implementation Roadmap](docs/architecture/MULTI_AGENT_ROADMAP.md) - Development roadmap
- 📊 [Research](docs/research/) - Academic research and analysis

## 🔧 Development

**Start services:**
```bash
docker compose up -d      # Start all services
docker compose down       # Stop all services
docker compose logs       # View logs
```

**Local development:**
```bash
npm install              # Installs dependencies for all workspaces including frontend
npm run build           # Compile TypeScript
npm test                # Run tests
```

**Project structure:**
```
src/
├── index.ts           # MCP server entry point
├── managers/          # Core business logic
├── tools/             # MCP tool definitions
└── orchestrator/      # Multi-agent system
```

## ✨ Key Features

**Core Capabilities:**
- ✅ **Persistent Memory** - Tasks and context stored in Neo4j graph database
- ✅ **Knowledge Graph** - Connect tasks, files, and concepts with relationships
- ✅ **AI Semantic Search** - Find tasks by meaning, not just keywords
- ✅ **Multi-Agent Support** - Multiple AI agents can work together safely
- ✅ **File Indexing** - Automatically track and index your codebase
- ✅ **MCP Standard** - Works with any MCP-compatible AI assistant

**Advanced Features:**
- 🔐 **Task Locking** - Prevent conflicts when multiple agents work simultaneously
- 📊 **Context Enrichment** - Automatic relationship discovery
- 🔍 **Vector Embeddings** - Optional semantic search with AI embeddings
- 📈 **Graph Visualization** - View your task network in Neo4j Browser

## 🚀 PCTX Integration (Code Mode)

**NEW:** Mimir now supports [PCTX](https://github.com/portofcontext/pctx) for **Code Mode** execution, reducing token usage by up to 98%!

Instead of sequential tool calls, AI agents can write TypeScript code that executes in a sandboxed environment:

```typescript
// Traditional MCP: 3 separate calls, 50K+ tokens
// With PCTX Code Mode: Single execution, ~2K tokens (96% reduction!)

async function run() {
  const results = await Mimir.vectorSearchNodes({
    query: "authentication tasks",
    types: ["todo"],
    limit: 10
  });
  
  const pending = results.results.filter(r => r.properties.status === "pending");
  
  await Mimir.memoryBatch({
    operation: "update_nodes",
    updates: pending.map(r => ({id: r.id, properties: {status: "in_progress"}}))
  });
  
  return {updated: pending.length};
}
```

**Benefits:**
- ✅ **98% token reduction** for complex operations
- ✅ **Type-safe TypeScript** with instant feedback
- ✅ **Secure sandbox** execution (Deno)
- ✅ **All 13 Mimir tools** available via `Mimir.*` namespace
- ✅ **Multi-server workflows** (combine Mimir + GitHub + Slack)

**Quick Start:**
```bash
# Install PCTX
brew install portofcontext/tap/pctx

# Start PCTX (Mimir must be running)
cd Mimir
pctx start

# Connect your AI to: http://localhost:8080/mcp
```

**Documentation:**
- 📖 [PCTX Integration Guide](docs/guides/PCTX_INTEGRATION_GUIDE.md) - Complete usage guide with examples
- 🔬 [Integration Analysis](docs/research/PCTX_INTEGRATION_ANALYSIS.md) - Architecture and rationale

## 🗺️ Roadmap

**Current Status (v1.0):** Production ready with core features

**Coming Soon:**
- Multi-agent orchestration patterns (PM/Worker/QC)
- Enhanced context deduplication
- Agent performance monitoring
- Distributed task execution

See [full roadmap](docs/architecture/MULTI_AGENT_ROADMAP.md) for details.

## 📋 Quick Reference

### Common Commands

```bash
# Start/stop services
docker compose up -d              # Start all services
docker compose down               # Stop all services
docker compose restart            # Restart all services

# View logs
docker compose logs               # All services
docker compose logs neo4j         # Neo4j only
docker compose logs mimir-server  # Mimir server only

# Check status
docker compose ps                 # Container status
curl http://localhost:9042/health # MCP health
curl http://localhost:7474        # Neo4j browser
```

### Important URLs

- **Mimir Web UI:** http://localhost:9042 (Portal, file indexing, APIs)
- **Neo4j Browser:** http://localhost:7474 (user: `neo4j`, pass: `password`)
- **Copilot API:** http://localhost:4141 (AI model access)
- **Ollama** (if external): http://localhost:11434 (embeddings)
- **Open-WebUI** (if enabled): http://localhost:3000 (alternative chat UI)

### Data Locations

- **Neo4j data:** `./data/neo4j/`
- **Logs:** `./logs/`
- **Config:** `.env` (100% ENV-based, no config files needed)

## 🏆 Why Choose Mimir?

Mimir is the **only open-source solution** that combines Graph-RAG (graph relationships + vector embeddings) with multi-agent orchestration and AI assistant integration.

### Feature Comparison

| Feature | Mimir | Pinecone | Weaviate | Milvus | Qdrant |
|---------|-------|----------|----------|--------|--------|
| **Graph Relationships** | ✅ Native | ❌ None | ⚠️ Limited | ❌ None | ❌ None |
| **Vector Search** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **ACID Transactions** | ✅ Full | ❌ None | ❌ None | ❌ None | ❌ None |
| **Graph Algorithms** | ✅ Built-in | ❌ None | ❌ None | ❌ None | ❌ None |
| **MCP Integration** | ✅ Native | ❌ None | ❌ None | ❌ None | ❌ None |
| **Multi-Agent Support** | ✅ Built-in | ❌ None | ❌ None | ❌ None | ❌ None |
| **Self-Hosting** | ✅ Free | ❌ Cloud-only | ✅ Yes | ✅ Yes | ✅ Yes |
| **Open Source** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Starting Cost** | 💰 Free | 💰 $70/mo | 💰 $25/mo | 💰 Free | 💰 Free |

**Mimir's Unique Advantages:**
- 🕸️ **Only solution with native graph traversal + vector search** - Understand relationships, not just similarity
- 🤖 **Built-in multi-agent orchestration** - PM → Worker → QC workflows out of the box
- 🔌 **Direct AI assistant integration** - Works with Claude, ChatGPT via MCP protocol
- 💾 **ACID transactions** - Your data is always consistent and reliable
- 🆓 **100% open-source and free** - No vendor lock-in, full control

Perfect for developers building AI agents that need to understand how tasks relate to each other, not just find similar items.

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT License with additional terms for AI/ML systems - see [LICENSE](LICENSE) for details

## 🙏 Acknowledgments

Built on research from Anthropic, Microsoft, and the Graph-RAG community.

---

**Questions?** [Open an issue](https://github.com/orneryd/Mimir/issues) or check the [documentation](docs/)

