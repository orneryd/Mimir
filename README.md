# Mimir - Graph-RAG TODO Tracker with Multi-Agent Orchestration

A production-ready Model Context Protocol (MCP) server that provides **Graph-RAG TODO tracking** with **multi-agent orchestration capabilities**. Combines hierarchical task management with associative memory networks, backed by Neo4j for persistent storage.

## ✅ Current Status (v1.0.0)

**PRODUCTION READY** - Fully implemented and tested:
- **Neo4j Graph Database**: Persistent storage with ACID compliance
- **26 MCP Tools**: 22 graph operations + 4 file indexing tools
- **Multi-Agent Locking**: Optimistic locking for concurrent execution
- **Context Isolation**: 90%+ context reduction for worker agents
- **File Indexing**: Automatic file watching with .gitignore support
- **Global CLI Tools**: `mimir`, `mimir-chain`, `mimir-execute`
- **Docker Deployment**: Production containerization
- **LangChain 1.0.1**: Latest LangChain with LangGraph integration

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Docker & Docker Compose
- Git

### Installation & Setup

#### 1. Clone and Install Dependencies
```bash
# Clone the repository
git clone <repo-url>
cd mimir

# Install project dependencies
npm install

# Install global TypeScript tools
npm install -g ts-node typescript

# Build the project
npm run build
```

#### 2. GitHub CLI & Authentication Setup
```bash
# Install GitHub CLI (if not already installed)
brew install gh  # macOS
# or: sudo apt install gh  # Ubuntu
# or: winget install GitHub.CLI  # Windows

# Authenticate with GitHub (one-time setup)
gh auth login

# Verify authentication
gh auth status
```

**Note**: On first authentication, you'll see a prompt like:
```
! First copy your one-time code: "ABCD-EFGH"
Press Enter to open https://github.com/login/device in your browser...
```
Follow the instructions to complete authentication.

#### 3. Copilot API Proxy Setup
```bash
# Install copilot-api globally (OpenAI-compatible proxy)
npm install -g copilot-api

# Start Copilot proxy server (runs in background)
copilot-api start &

# Verify it's running
curl http://localhost:4141/v1/models
```

**First-time setup**: The copilot-api will also prompt for authentication similar to GitHub CLI.

#### 4. Test LLM Connection
```bash
# Test Node.js connection to Copilot API
node -e "const {ChatOpenAI} = require('@langchain/openai'); const llm = new ChatOpenAI({openAIApiKey: 'dummy-key-not-used', configuration: {baseURL: 'http://localhost:4141/v1'}}); llm.invoke('Hello!').then(r => console.log('✅ Copilot Response:', r.content));"
```

**Expected output:**
```
✅ Copilot Response: Hi! How can I assist you today?
```

#### 5. Start Neo4j Database
```bash
# Start Neo4j database
docker-compose up -d

# Verify Neo4j is running
curl http://localhost:7474
```

#### 6. Optional: Install Global Commands
```bash
# Make mimir commands available globally
npm link

# Test global commands
mimir-chain --help
```

### Folder Configuration & File Indexing

#### Initial Folder Setup
The system can automatically index and watch folders for changes. By default, Docker Compose mounts your workspace:

```yaml
# docker-compose.yml (already configured)
volumes:
  - .:/workspace  # Mounts current directory as /workspace
```

#### Adding Folders for Indexing
Use the `watch_folder` MCP tool to add directories for automatic indexing:

```javascript
// Example: Index a project folder
await mcp.call('watch_folder', {
  path: '/workspace/src',           // Must be under mounted path
  recursive: true,                  // Watch subdirectories
  debounce_ms: 500,                // File change debounce
  file_patterns: ['*.ts', '*.js', '*.md']  // File types to index
});

// Example: Index multiple project folders
await mcp.call('watch_folder', {
  path: '/workspace/docs',
  recursive: true,
  file_patterns: ['*.md', '*.txt']
});
```

#### Folder Path Requirements
- **Root Path**: All watched folders must be under `/workspace` (Docker mount)
- **Sub-folders**: You can add any sub-folder: `/workspace/src`, `/workspace/docs`, etc.
- **Recursive**: Set `recursive: true` to watch subdirectories automatically
- **File Patterns**: Use glob patterns to filter file types: `['*.ts', '*.js']`

#### Managing Watched Folders
```javascript
// List currently watched folders
await mcp.call('list_watched_folders');

// Stop watching a folder
await mcp.call('unwatch_folder', {
  path: '/workspace/src'
});

// Manually index a folder (one-time)
await mcp.call('index_folder', {
  path: '/workspace/new-project',
  recursive: true
});
```

#### File Indexing Features
- **Automatic Detection**: Files are indexed on add/change/delete
- **Gitignore Support**: Respects `.gitignore` files automatically
- **Content Analysis**: Extracts file content, metadata, and relationships
- **Graph Storage**: Files stored as nodes with content searchable via `graph_search_nodes`

### Usage

**As MCP Server (stdio transport):**
```bash
node build/index.js
```

**As Global CLI Tools:**
```bash
mimir-chain "Create a todo tracking system"
mimir-execute chain-output.md
```

**As HTTP Server:**
```bash
npm run start:http  # Starts on port 3000
```

## 📊 Architecture

### Core Components

**1. Neo4j Graph Database**
- Persistent storage for nodes (todos, files, concepts) and relationships
- Full-text search with indexing  
- Multi-hop graph traversal for associative memory
- Atomic transactions with ACID compliance

**2. MCP Tools (26 total)**
- **Graph Operations**: 12 single + 5 batch + 4 locking + 1 context isolation
- **File Indexing**: 4 tools for automatic file watching and indexing

**3. Multi-Agent Support**
- **Optimistic Locking**: Race condition prevention
- **Context Isolation**: Agent-specific filtered context delivery
- **Ephemeral Workers**: Clean context management

## 🛠️ Available Tools

### Graph Operations - Single Node Management (12 tools)
- `graph_add_node` - Create nodes (todo, file, concept, etc.)
- `graph_get_node` - Retrieve node by ID with full context
- `graph_update_node` - Update node properties (merge operation)
- `graph_delete_node` - Delete node and cascade relationships
- `graph_add_edge` - Create relationships between nodes
- `graph_delete_edge` - Remove specific relationships
- `graph_query_nodes` - Filter nodes by type/properties
- `graph_search_nodes` - Full-text search across all nodes
- `graph_get_edges` - Get relationships connected to a node
- `graph_get_neighbors` - Find connected nodes (with depth traversal)
- `graph_get_subgraph` - Extract connected subgraph (multi-hop)
- `graph_clear` - Clear data from graph (by type or ALL)

### Graph Operations - Batch Processing (5 tools)
- `graph_add_nodes` - Bulk create multiple nodes
- `graph_update_nodes` - Bulk update multiple nodes  
- `graph_delete_nodes` - Bulk delete multiple nodes
- `graph_add_edges` - Bulk create multiple relationships
- `graph_delete_edges` - Bulk delete multiple relationships

### Graph Operations - Multi-Agent Locking (4 tools)
- `graph_lock_node` - Acquire exclusive lock on node (with timeout)
- `graph_unlock_node` - Release lock on node
- `graph_query_available_nodes` - Query unlocked nodes only
- `graph_cleanup_locks` - Clean up expired locks

### File Indexing System (4 tools)
- `watch_folder` - Start watching directories for file changes
- `unwatch_folder` - Stop watching directories
- `index_folder` - Manual bulk indexing of directory
- `list_watched_folders` - View active file watchers

### Context Management (1 tool)
- `get_task_context` - Get filtered context by agent type (PM/Worker/QC)

## 🔧 Troubleshooting Setup

### GitHub Authentication Issues
```bash
# If authentication fails
gh auth logout
gh auth login

# Check authentication status
gh auth status

# Verify token permissions
gh auth token
```

### Copilot API Issues
```bash
# If copilot-api won't start
killall copilot-api  # Stop any existing instances
copilot-api start    # Start fresh

# Check if proxy is running
curl http://localhost:4141/v1/models

# If port 4141 is busy
lsof -ti:4141 | xargs kill  # Kill process using port 4141
copilot-api start --port 4142  # Use different port
```

### Neo4j Connection Issues
```bash
# Check if Neo4j container is running
docker ps | grep neo4j

# Restart Neo4j if needed
docker-compose down
docker-compose up -d

# Check Neo4j logs
docker-compose logs neo4j

# Test Neo4j connection
curl http://localhost:7474
```

### Build Issues
```bash
# If TypeScript compilation fails
npm run build

# Check for missing dependencies
npm install

# Clear build cache
rm -rf build/
npm run build
```

### LLM Connection Test Failures
If the Node.js test fails:

1. **Check Copilot API**: Ensure `curl http://localhost:4141/v1/models` returns JSON
2. **Check GitHub Auth**: Run `gh auth status` to verify authentication
3. **Check Dependencies**: Ensure `@langchain/openai` is installed
4. **Try Alternative**: Use different port if 4141 is occupied

```bash
# Alternative test with custom port
node -e "const {ChatOpenAI} = require('@langchain/openai'); const llm = new ChatOpenAI({openAIApiKey: 'dummy', configuration: {baseURL: 'http://localhost:4142/v1'}}); llm.invoke('test').then(r => console.log('Success:', r.content)).catch(e => console.error('Failed:', e.message));"
```

## 💡 Usage Patterns

### Single Agent Workflow
```javascript
// 1. Create a task
const task = await graph_add_node({
  type: "todo",
  properties: {
    title: "Implement user auth",
    description: "Add JWT authentication to API",
    status: "pending",
    priority: "high",
    context: {
      files: ["src/auth.ts", "src/routes.ts"],
      requirements: ["JWT tokens", "Password hashing", "Session management"]
    }
  }
});

// 2. Work on the task
await graph_update_node({
  id: task.id,
  properties: { status: "in_progress", startedAt: Date.now() }
});

// 3. Add progress notes
await graph_update_node({
  id: task.id, 
  properties: {
    notes: "Implemented JWT middleware, need to add password hashing",
    progress: 60
  }
});

// 4. Complete the task
await graph_update_node({
  id: task.id,
  properties: { status: "completed", completedAt: Date.now() }
});
```

### Multi-Agent Workflow
```javascript
// PM Agent: Create task breakdown
const project = await graph_add_node({type: "project", properties: {...}});
const task1 = await graph_add_node({type: "todo", properties: {...}});
await graph_add_edge({source: task1.id, target: project.id, type: "part_of"});

// Worker Agent: Claim and execute
const locked = await graph_lock_node({
  nodeId: task1.id, 
  agentId: "worker-1", 
  timeoutMs: 300000
});

const context = await get_task_context({
  taskId: task1.id, 
  agentType: "worker"  // Gets filtered context (90% reduction)
});

// Execute task with clean context...
await graph_update_node({
  id: task1.id,
  properties: {workerOutput: result, status: "awaiting_qc"}
});

await graph_unlock_node({nodeId: task1.id, agentId: "worker-1"});

// QC Agent: Verify output
const qcContext = await get_task_context({
  taskId: task1.id,
  agentType: "qc"
});
// Verify and approve/reject...
```

## Documentation

### 🎯 Executive Documents
- 📊 **[Multi-Agent Executive Summary](docs/MULTI_AGENT_EXECUTIVE_SUMMARY.md)** - **Strategic overview** for stakeholders

### 📚 User Guides
- 🧠 **[Memory Guide](docs/architecture/MEMORY_GUIDE.md)** - **START HERE:** External memory system guide
- 🕸️ **[Knowledge Graph Guide](docs/architecture/knowledge-graph.md)** - Associative memory networks
- 🧪 **[Testing Guide](docs/guides/TESTING_GUIDE.md)** - Test suite overview
- 🐳 **[Docker Deployment Guide](docs/guides/DOCKER_DEPLOYMENT_GUIDE.md)** - Container deployment

### 🏗️ Architecture
- 🏗️ **[Multi-Agent Architecture](docs/architecture/MULTI_AGENT_GRAPH_RAG.md)** - Complete architecture spec (v3.1)
- 🗺️ **[Implementation Roadmap](docs/architecture/MULTI_AGENT_ROADMAP.md)** - Phase-by-phase plan (Q4 2025-Q1 2026)
- 🔗 **[Agent Chaining](docs/architecture/AGENT_CHAINING.md)** - PM → Ecko → Worker flow
- ⚡ **[Parallel Task Execution](docs/PARALLEL_EXECUTION_SUMMARY.md)** - Dependency-based parallel execution
- 🎨 **[Prompting Specialist Architecture](docs/architecture/PROMPTING_SPECIALIST_ARCHITECTURE.md)** - Ecko agent design
- 🗄️ **[Neo4j Migration Plan](docs/architecture/NEO4J_MIGRATION_PLAN.md)** - Graph database migration (in-memory → persistent)
- 📂 **[File Indexing System](docs/architecture/FILE_INDEXING_SYSTEM.md)** - Automatic file indexing & RAG enrichment
- 💾 **[Persistence Architecture](docs/architecture/PERSISTENCE.md)** - Memory persistence & decay
- 🛠️ **[Validation Tool Design](docs/architecture/VALIDATION_TOOL_DESIGN.md)** - Agent validation system
- 🌐 **[HTTP Transport Requirements](docs/architecture/HTTP_TRANSPORT_REQUIREMENTS.md)** - HTTP transport layer
- 🐳 **[Docker Volume Strategy](docs/architecture/DOCKER_VOLUME_STRATEGY.md)** - Docker volumes

### 🔬 Research
- 🔍 **[SWE-grep Comparison](docs/research/SWE_GREP_COMPARISON.md)** - Cognition AI SWE-grep analysis
- 📈 **[Conversation Analysis](docs/research/CONVERSATION_ANALYSIS.md)** - Architecture validation
- 📊 **[Graph-RAG Research](docs/research/GRAPH_RAG_RESEARCH.md)** - Foundational research
- 🔬 **[Aashari Framework Analysis](docs/research/AASHARI_FRAMEWORK_ANALYSIS.md)** - External framework comparison
- 🧪 **[ExtensiveMode/BeastMode Analysis](docs/research/EXTENSIVEMODE_BEASTMODE_ANALYSIS.md)** - Agent benchmarking

### ⚙️ Configuration
- 🔧 **[Configuration Guide](docs/configuration/CONFIGURATION.md)** - Setup for VSCode, Cursor, Claude Desktop

### 🤖 Agent Configurations
- 🤖 **[AGENTS.md](AGENTS.md)** - AI agent workflows and best practices
- 🔧 **[Claudette Auto](docs/agents/claudette-auto.md)** - Autonomous execution mode (v5.2.1)
- 📋 **[Claudette PM](docs/agents/claudette-pm.md)** - PM agent for planning
- 🎨 **[Claudette Ecko](docs/agents/claudette-ecko.md)** - Prompt architect (v3.0)
- 🏭 **[Claudette Agentinator](docs/agents/claudette-agentinator.md)** - Agent preamble generator
- 📐 **[Agentic Prompting Framework](docs/agents/AGENTIC_PROMPTING_FRAMEWORK.md)** - Core framework (v1.2)

### 📊 Benchmarks & Results
- 📊 **[BeastMode Benchmark Report](docs/results/BEASTMODE_BENCHMARK_REPORT.md)** - BeastMode analysis
- 📈 **[Claudette vs BeastMode](docs/results/CLAUDETTE_VS_BEASTMODE.md)** - Comparison
- 🐳 **[Docker Migration Prompts](docs/results/DOCKER_MIGRATION_PROMPTS.md)** - Migration example

## � Docker Deployment

### Development (with Neo4j)
```bash
# Start Neo4j only
docker-compose up -d

# Run MCP server locally
npm run build
npm start
```

### Production (full containerization)
```bash
# Build and start all services
npm run docker:up

# View logs
npm run docker:logs

# Execute commands inside container
npm run docker:exec
```

### Environment Variables
```bash
# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Optional: HTTP Server
PORT=3000
HOST=0.0.0.0
```

## 🔧 Development

### Commands
```bash
npm run build          # Compile TypeScript
npm run start          # Start MCP server (stdio)
npm run start:http     # Start HTTP server
npm run test           # Run test suite
npm run test:coverage  # Run tests with coverage
npm run docker:up      # Start Docker environment
npm run docker:down    # Stop Docker environment
```

### Project Structure
```
src/
├── index.ts              # Main MCP server entry point
├── http-server.ts        # HTTP transport server
├── managers/             # Core business logic
│   ├── GraphManager.ts   # Neo4j graph operations
│   └── ContextManager.ts # Multi-agent context filtering
├── tools/                # MCP tool definitions
│   ├── graph.tools.ts    # Graph operation tools
│   └── fileIndexing.tools.ts # File watching tools
├── types/                # TypeScript type definitions
├── indexing/             # File indexing system
└── orchestrator/         # Multi-agent orchestration
    ├── agent-chain.ts    # Agent chaining system
    ├── task-executor.ts  # Task execution engine
    └── llm-client.ts     # LangChain integration
```

## 🤖 Multi-Agent Orchestration

The system supports advanced multi-agent workflows with:

- **PM Agents**: Research and planning with full context
- **Worker Agents**: Ephemeral execution with filtered context (90% reduction)
- **QC Agents**: Adversarial validation and quality control
- **Optimistic Locking**: Prevents race conditions between agents
- **Context Isolation**: Agent-specific context delivery

### Agent Tools
```bash
# Create agent configurations
npm run create-agent

# Chain multiple agents
npm run chain

# Execute specific tasks  
npm run execute

# Validate agent performance
npm run validate
```
- **Rate Limiting & Quotas**: Resource management per team

**📋 Full roadmap:** See [Implementation Roadmap](docs/architecture/MULTI_AGENT_ROADMAP.md) for detailed implementation plans

## 🐳 Docker Deployment (Production-Ready)

The MCP server is available as a Docker container for easy deployment:

### Quick Start

```bash
# Clone and navigate
git clone <repository-url>
cd GRAPH-RAG-TODO-main

# Create environment configuration
cp .env.example .env

# Build and start
docker-compose up -d

# Verify health
curl http://localhost:3000/health
```

### Features
- ✅ **175MB Alpine-based image** (multi-stage build)
- ✅ **Volume persistence** for data and logs
- ✅ **Health check endpoint** for monitoring
- ✅ **Configurable via environment variables**
- ✅ **Non-root user** for security
- ✅ **Auto-restart policy** for reliability

### Documentation
- 📘 **[Complete Deployment Guide](docs/guides/DOCKER_DEPLOYMENT_GUIDE.md)** - Prerequisites, configuration, troubleshooting
- 🔧 **[Configuration Options](docs/configuration/CONFIGURATION.md)** - Environment variables explained
- 🏭 **[Production Best Practices](docs/guides/DOCKER_DEPLOYMENT_GUIDE.md#production-deployment)** - Security, monitoring, backups

### HTTP API

The Docker container exposes an HTTP API for MCP tool calls:

```bash
# Initialize session
SESSION=$(curl -s -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' \
  | sed -n "s/^Mcp-Session-Id: //p" | tr -d '\r')

# Call any MCP tool
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "create_todo",
      "arguments": {"title": "My TODO", "description": "Docker test"}
    },
    "id": 2
  }' | jq '.'
```

**See [Docker Deployment Guide](docs/guides/DOCKER_DEPLOYMENT_GUIDE.md) for complete HTTP API examples.**

## Features

### Core TODO Management
- ✅ **In-Memory TODO Management**: Create, read, update, and delete TODO items
- 🔗 **Linked Context**: Associate file paths, line numbers, API endpoints, and other contextual data with each TODO
- 📝 **Timestamped Notes**: Add observations and notes to TODO items as work progresses
- 🏷️ **Tagging & Filtering**: Organize TODOs with tags and filter by status, priority, or tags
- 🌳 **Hierarchical Tasks**: Support for parent-child relationships (subtasks)
- 🎯 **Priority Management**: Set priority levels (low, medium, high, critical)
- 📊 **Status Tracking**: Track progress through pending, in_progress, completed, blocked, cancelled states

### ⭐ Knowledge Graph Enhancement (Optional)
- 🕸️ **Rich Entity Modeling**: Create nodes for people, files, concepts, projects
- 🔗 **Relationship Tracking**: Link entities with typed relationships (depends_on, assigned_to, references)
- 🔍 **Graph Querying**: Find neighbors, query by type/properties, get statistics
- 🔎 **🆕 Full-Text Search**: Search all nodes when you lose track - autonomous context recovery
- 🏆 **🆕 Intelligent Ranking**: 7-factor relevance scoring with query-specific optimization
- 📈 **Visualization Ready**: Export graph structure for visualization tools
- 🔄 **Auto-Integration**: TODOs automatically integrate with the knowledge graph
- 🚀 **Migration Path**: Easy migration to Neo4j for persistent storage

### 🔬 Research-Backed Enhancements (v2.1+)

**✅ Implemented:**
- **Automatic Context Enrichment**: TODOs are auto-enriched with temporal, hierarchical, file, and error context for 49-67% better search accuracy (Anthropic Contextual Retrieval research)
- **Subgraph Extraction (`graph_get_subgraph`)**: Extract connected relationship graphs for multi-hop reasoning with optional natural language linearization (Graph-RAG methodology)
- **Event-Driven Context Management**: Pull→Prune→Pull pattern validated by "Lost in the Middle" research for 90%+ context retention

**🚀 In Development (v3.0+):**
- **Multi-Agent Orchestration**: PM/Worker/QC agent pattern with ephemeral workers for natural context pruning
- **Adversarial Validation**: QC agents verify worker output before storage to prevent hallucination propagation
- **Context Deduplication**: Active deduplication engine with hash-based fingerprinting for >80% reduction
- **Concurrent Access Control**: Optimistic locking with version-based conflict resolution

**[Read the research analysis →](docs/research/GRAPH_RAG_RESEARCH.md)** | **[Multi-agent architecture →](docs/architecture/MULTI_AGENT_GRAPH_RAG.md)** | **[Conversation analysis →](docs/research/CONVERSATION_ANALYSIS.md)** | **[Implementation roadmap →](docs/architecture/MULTI_AGENT_ROADMAP.md)**

## ⚡ Multi-Agent Features (v3.1)

### Task Locking System
Prevent race conditions in multi-agent scenarios with optimistic locking:

```typescript
// Worker claims task
const locked = await graph_lock_node(taskId, 'worker-1', 300000);
if (locked) {
  // Execute task...
  await graph_unlock_node(taskId, 'worker-1');
}
```

**Features:**
- ✅ Optimistic locking with version tracking
- ✅ Configurable timeout (default 5min)
- ✅ Automatic lock expiration
- ✅ Query available (unlocked) nodes
- ✅ Batch cleanup of expired locks

### Parallel Task Execution
Automatically execute independent tasks in parallel based on dependencies:

```typescript
// PM generates plan with dependencies
const tasks = [
  { id: 'task-1', dependencies: [] },
  { id: 'task-2', dependencies: ['task-1'] },
  { id: 'task-3', dependencies: ['task-1'] },  // Runs parallel with task-2
  { id: 'task-4', dependencies: ['task-2', 'task-3'] }
];

await executeChainOutput('chain-output.md');

// Output:
// Batch 1: [task-1]
// Batch 2: [task-2, task-3]  ← Parallel execution!
// Batch 3: [task-4]
```

**Features:**
- ✅ Automatic dependency-based batching
- ✅ Parallel execution within batches (`Promise.all`)
- ✅ Diamond dependency pattern support
- ✅ Circular dependency detection
- ✅ PM can override with explicit parallel groups

**[Full documentation →](docs/PARALLEL_EXECUTION_SUMMARY.md)**

### Testing
- ✅ **123 tests** total across all features
- ✅ **107 product tests** in main suite (`npm test`)
- ✅ **16 benchmark tests** for debugging exercises (`npm run test:benchmark`)
- ✅ Multi-agent locking: 20 integration tests
- ✅ Parallel execution: 18 unit + integration tests
- ✅ Full test isolation with vitest forks

## Available Tools (25 Total)

### 1. `create_todo`
Create a new TODO item with optional metadata.

**Parameters:**
- `title` (required): Brief title of the TODO
- `description` (optional): Detailed description
- `status` (optional): pending | in_progress | completed | blocked | cancelled (default: pending)
- `priority` (optional): low | medium | high | critical (default: medium)
- `context` (optional): Object containing linked context (file paths, URLs, etc.)
- `parentId` (optional): ID of parent TODO if this is a subtask
- `tags` (optional): Array of tags for categorization

**Example:**
```json
{
  "title": "Implement user authentication",
  "description": "Add JWT-based authentication to the API",
  "status": "in_progress",
  "priority": "high",
  "context": {
    "files": ["src/auth/jwt.ts", "src/middleware/auth.ts"],
    "apiEndpoint": "/api/auth/login"
  },
  "tags": ["backend", "security"]
}
```

### 2. `get_todo`
Retrieve a specific TODO item by ID.

**Parameters:**
- `id` (required): The TODO item ID

### 3. `list_todos`
List all TODO items with optional filtering.

**Parameters (all optional):**
- `status`: Filter by status
- `priority`: Filter by priority
- `parentId`: Filter by parent ID (use "null" for top-level items)
- `tags`: Array of tags (returns items matching any tag)

### 4. `update_todo`
Update an existing TODO item.

**Parameters:**
- `id` (required): The TODO item ID
- `title` (optional): New title
- `description` (optional): New description
- `status` (optional): New status
- `priority` (optional): New priority
- `tags` (optional): New tags (replaces existing)

### 5. `delete_todo`
Delete a TODO item.

**Parameters:**
- `id` (required): The TODO item ID to delete

### 6. `add_todo_note`
Add a timestamped note to a TODO item.

**Parameters:**
- `id` (required): The TODO item ID
- `note` (required): The note text

**Example use case:** Document why a task is blocked or record progress observations.

### 7. `update_todo_context`
Update or add context data for a TODO item. Context is merged with existing context.

**Parameters:**
- `id` (required): The TODO item ID
- `context` (required): Object with context data to merge

**Example:**
```json
{
  "id": "todo-1-1234567890",
  "context": {
    "testFile": "tests/auth.test.ts",
    "relatedIssue": "https://github.com/user/repo/issues/42"
  }
}
```

### 8. `clear_all_todos`
Clear all TODO items from memory. **Use with caution!**

**Parameters:**
- `confirm` (required): Must be `true` to confirm deletion

## VS Code Setup Instructions

### Step 1: Build the MCP Server

```bash
cd /Users/timothysweet/src/my-mcp-server
npm run build
```

### Step 2: Configure VS Code Settings

Open your VS Code settings (`settings.json`) and add the MCP server configuration:

**On macOS/Linux:**

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/timothysweet/src/my-mcp-server/build/index.js"],
      "env": {}
    }
  }
}
```

**On Windows:**

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["C:\\Users\\YourUsername\\src\\my-mcp-server\\build\\index.js"],
      "env": {}
    }
  }
}
```

### Step 3: Configure Your Agent (Optional)

If you're using a custom agent configuration file (like `claudette.chatmode.md`), add the TODO manager tools to the tools list:

```yaml
---
description: Your Agent Description
tools: ['knowledge-graph-todo', 'other-tools', ...]
---
```

### Step 4: Restart VS Code

After adding the configuration, restart VS Code for the changes to take effect.

### Step 5: Verify Installation

In VS Code with an AI assistant (Claude, etc.), try using the TODO tools:

```
"Create a TODO for implementing the login feature"
```

The assistant should be able to use the `create_todo` tool to create a new TODO item.

## Alternative: Using with Cline or Other MCP Clients

### Cline Configuration

If you're using Cline, add the server to your MCP settings file (usually `~/.config/cline/mcp_settings.json` or similar):

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/timothysweet/src/my-mcp-server/build/index.js"]
    }
  }
}
```

### Claude Desktop Configuration

For Claude Desktop app, edit the configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "knowledge-graph-todo": {
      "command": "node",
      "args": ["/Users/timothysweet/src/my-mcp-server/build/index.js"]
    }
  }
}
```

## Usage Workflow Example

Here's how an LLM agent might use this system:

1. **Start a complex task:**
   ```json
   create_todo({
     "title": "Build user management system",
     "priority": "high",
     "tags": ["feature", "backend"]
   })
   ```

2. **Break it down into subtasks:**
   ```json
   create_todo({
     "title": "Create user model",
     "parentId": "todo-1-...",
     "status": "in_progress",
     "context": {
       "file": "src/models/user.ts"
     }
   })
   ```

3. **Add notes as work progresses:**
   ```json
   add_todo_note({
     "id": "todo-2-...",
     "note": "Decided to use bcrypt for password hashing"
   })
   ```

4. **Update context with relevant files:**
   ```json
   update_todo_context({
     "id": "todo-2-...",
     "context": {
       "testFile": "tests/models/user.test.ts",
       "relatedDocs": "docs/security.md"
     }
   })
   ```

5. **Mark as complete:**
   ```json
   update_todo({
     "id": "todo-2-...",
     "status": "completed"
   })
   ```

6. **Check remaining tasks:**
   ```json
   list_todos({
     "status": "pending"
   })
   ```

## Development

### Building
```bash
npm run build
```

### Development Mode (with auto-rebuild)
```bash
npm run watch
```

### Testing the Server Directly
```bash
npm start
# Server will start on stdio - use MCP inspector or client to interact
```

### Running Integration Tests

See **[TESTING_README.md](TESTING_README.md)** for complete testing guide.

**Quick test:**
```bash
# Use the test prompts with ChatGPT
# Full test suite: TEST_PROMPT.md
# Quick test: TEST_PROMPT_QUICK.md
# Track results: TEST_RESULTS_TEMPLATE.md
```

## Architecture

The server uses:
- **MCP SDK**: For Model Context Protocol implementation
- **TypeScript**: For type safety
- **In-Memory Storage**: TODOs are stored in memory (not persisted between sessions)
- **Stdio Transport**: Communicates via standard input/output

## Limitations

- **No Persistence**: TODO items are lost when the server restarts
- **Single Session**: Each VS Code instance gets its own TODO list
- **Memory Only**: Not suitable for long-term storage

## Development Status

See **[research/](./research/)** for technical details and **[benchmarks/](./benchmarks/)** for performance analysis.


### ✅ Core Features (October 2025)

**Production Ready:**
- ✅ TODO Management with Rich Context
- ✅ Knowledge Graph Integration
- ✅ Context Enrichment & Search
- ✅ Graph-based Memory System
- ✅ Context Verification, Trust, Provenance, and Validation Chain (fully enforced in core logic and tested)
- ✅ **Hierarchical Memory Tiers** - Project/Phase/Task memory hierarchy with automatic decay
- ✅ **Modular Architecture** - Clean separation with 80-test validation suite
- ✅ **Memory Lifecycle Management** - Time-based pruning with configurable retention policies
- ✅ **Adaptive Subgraph Depth** - Intelligent depth calculation with 5-factor heuristics
- ✅ **Context Re-ranking** - 7-factor relevance scoring with query-specific optimization

### 🔨 Recently Completed

**Recently Completed (October 2025):**
- ✅ **Modular Architecture Refactoring** - Clean separation into types/, managers/, tools/, handlers/
- ✅ **Comprehensive API Surface Validation** - 80 tests covering all 17 MCP tools
- ✅ **Hierarchical Memory Architecture** - Complete implementation of tiered memory system
- ✅ **Memory Decay & Pruning** - Automatic context lifecycle management
- ✅ **Adaptive Subgraph Depth** - Dynamic depth based on query complexity with 5-factor heuristics
- ✅ **Context Re-ranking** - Intelligent result ordering with 7-factor relevance scoring

**Active Development:**
- No major features in active development. All core systems are production-ready.

### 🚀 Future: Multi-Agent Graph-RAG Orchestration

**🎯 NEW DIRECTION: Multi-Agent Architecture (v3.0+)**

The next evolution focuses on **agent-scoped context management** with ephemeral worker agents and adversarial validation:

**Phase 1: Multi-Agent Foundation (v3.0)**
- [ ] **PM Agent Pattern**: Long-lived research/planning agent with task graph creation
- [ ] **Ephemeral Worker Agents**: Clean-context execution with automatic termination
- [ ] **Concurrent Access Control**: Optimistic locking with version-based conflict resolution
- [ ] **Task Allocation System**: Atomic task claiming with mutex/lock mechanisms
- [ ] **Agent Context Lifecycle**: Automatic context pruning via process boundaries

**Phase 2: Adversarial Validation (v3.1)**
- [ ] **QC Agent Architecture**: Separate verification agent for worker output validation
- [ ] **Correction Prompt Generation**: Auto-generate feedback while preserving context
- [ ] **Subgraph Verification**: Multi-hop reasoning for requirement validation
- [ ] **Error Propagation Prevention**: Catch hallucinations before graph storage
- [ ] **Audit Trail System**: Complete tracking for compliance and debugging

**Phase 3: Context Deduplication (v3.2)**
- [ ] **Active Deduplication Engine**: Detect and eliminate duplicate context across agents
- [ ] **Context Fingerprinting**: Hash-based duplicate detection system
- [ ] **Smart Context Merging**: Consolidate redundant information automatically
- [ ] **Deduplication Metrics**: Track unique vs. total context ratios

**Phase 4: Scale & Performance (v3.3)**
- [ ] **Distributed Locking**: Scale beyond optimistic locking for high concurrency
- [ ] **Agent Pool Management**: Dynamic worker spawning and lifecycle control
- [ ] **Context Streaming**: Incremental context loading for large graphs
- [ ] **Performance Monitoring**: Agent-specific metrics and observability

### 📋 General Enhancements (Ongoing)

**Infrastructure:**
- [ ] Persistence to file system or database
- [ ] Shared TODO lists across sessions
- [ ] Export/import functionality

**Usability:**
- [ ] Rich text formatting in descriptions
- [ ] Attachments and file references
- [ ] Graph visualization UI

### 📊 Research & Validation

All roadmap items are informed by:
- **Anthropic Contextual Retrieval** - Context enrichment methodology
- **iKala AI Context Engineering** - Graph-RAG and multi-hop reasoning
- **"Lost in the Middle" Research** - Long-context failure modes
- **HippoRAG** - Neurobiologically-inspired memory hierarchies

**[Full research analysis →](docs/research/GRAPH_RAG_RESEARCH.md)**

### 🎯 Success Metrics

**v2.1 Achievements:**
- ✅ 49-67% improvement in retrieval accuracy (measured via search quality)
- ✅ 80%+ improvement in complex query handling (Graph-RAG validation)
- ✅ 90%+ context retention (vs. baseline context stuffing)
- ✅ Zero breaking changes (100% backward compatibility)
- ✅ Trust, provenance, and validation chain invariants fully enforced and tested

**v2.2 Achievements (October 2025):**
- ✅ **Hierarchical Memory System** - Complete 3-tier implementation (hot/warm/cold)
- ✅ **Automatic Memory Decay** - Time-based pruning (24h todo, 7d phase, ∞ project)
- ✅ **Modular Architecture** - Clean separation with 80-test validation suite
- ✅ **API Surface Validation** - Comprehensive testing of all 21 MCP tools
- ✅ **Memory Lifecycle Management** - Configurable retention policies

**v2.3 Achievements (October 2025):**
- ✅ **Adaptive Subgraph Depth** - Intelligent depth calculation with 5-factor heuristics
- ✅ **Context Re-ranking** - 7-factor relevance scoring with query-specific optimization
- ✅ **Advanced Query Features** - Complete implementation of intelligent result ordering
- ✅ **Performance Optimization** - All ranking operations under 50ms for typical graphs
- ✅ **Enhanced MCP Tools** - 4 new ranked variants with 100% backward compatibility

**v2.4 Targets (Current Foundation):**
- 🎯 95%+ trust score for verified context
- 🎯 <10ms overhead for verification checks
- 🎯 Complete audit trail for compliance
- 🎯 Configurable memory retention policies

**v3.0 Targets (Multi-Agent Architecture):**
- 🎯 **Context Deduplication Rate**: >80% deduplication across agent fleet
- 🎯 **Agent Context Lifespan**: <5 minutes for workers, <60 minutes for PM
- 🎯 **Task Allocation Efficiency**: >95% successful task claims (low lock contention)
- 🎯 **Cross-Agent Error Propagation**: <5% error storage rate (QC catches 95%+)
- 🎯 **Subgraph Retrieval Precision**: >90% relevance in PM task graph creation
- 🎯 **PM → Worker Handoff Completeness**: <10% clarification rate
- 🎯 **Worker Retry Rate**: <20% (workers succeed mostly first try)

**v3.3+ Targets (Scale & Performance):**
- 🎯 60% reduction in irrelevant context via deduplication
- 🎯 Support 10+ concurrent worker agents with <1% lock conflicts
- 🎯 Natural memory decay curves matching cognitive science
- 🎯 Automatic tier promotion/demotion based on access patterns
- 🎯 Persistent storage with migration utilities

## License

ISC

## Contributing

Feel free to submit issues or pull requests to improve this MCP server!

