# Docker Bind Mount RAG Strategy (Strategy 1 - Revised)

**Date:** 2025-10-17  
**Status:** Design Phase  
**Version:** 2.0  
**Related:** [DOCKER_FILE_INDEXING_STRATEGY.md](DOCKER_FILE_INDEXING_STRATEGY.md), [FILE_INDEXING_SYSTEM.md](FILE_INDEXING_SYSTEM.md)

---

## 📋 Executive Summary

**Strategy:** Use Docker bind mounts with polling-based file watching combined with Neo4j full-text search and graph traversal to automatically enrich query responses and node retrievals with relevant file content, code snippets, and contextual information. Vector embeddings are **optional** and can be added later without changing the core architecture.

**Key Innovation:** When an agent queries for "orchestration", the system automatically:
1. **Searches** indexed codebase for related files/nodes (full-text + graph traversal)
2. **Ranks** results by relevance (keyword match, graph distance, *optionally* vector similarity)
3. **Enriches** response with file content, function signatures, and relationships
4. **Returns** comprehensive context without additional tool calls

**Phase 1 (Current):** Full-text + Graph traversal only  
**Phase 2 (Future):** Add vector embeddings for semantic search (no architecture changes needed)

**Goal:** Zero-friction RAG where every query automatically includes relevant codebase context.

---

## 🎯 Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    User/Agent Query                              │
│          "Show me nodes related to orchestration"                │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MCP Graph Search Tool                          │
│                 graph_search_nodes()                             │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              Neo4j Multi-Strategy Search                         │
│  ┌────────────┬────────────────────┬──────────────────────┐     │
│  │ Full-Text  │ Graph Traversal    │ [Vector - Future]    │     │
│  │ Index      │ (RELATES_TO edges) │ (optional Phase 2)   │     │
│  │ (Phase 1)  │ (Phase 1)          │                      │     │
│  └────────────┴────────────────────┴──────────────────────┘     │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Result Ranking & Fusion                        │
│  • Phase 1: Combine keyword + graph signals                     │
│  • Score: 0.6*text + 0.4*graph                                  │
│  • Phase 2: Add vector (0.4*text + 0.3*vector + 0.3*graph)     │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                Context Enrichment Pipeline                       │
│  1. Fetch matched nodes (files, functions, TODOs)               │
│  2. Traverse graph for related entities (1-2 hops)              │
│  3. Load file content from synced volume                        │
│  4. Extract relevant code snippets                              │
│  5. Include import relationships                                │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Enriched Response                               │
│  {                                                               │
│    "query": "orchestration",                                     │
│    "nodes": [...],                                               │
│    "related_files": [                                            │
│      {                                                           │
│        "path": "src/orchestration/WorkflowManager.ts",           │
│        "content": "...",                                         │
│        "relevance": 0.95,                                        │
│        "reason": "keyword_match + imports_orchestration"         │
│      }                                                           │
│    ],                                                            │
│    "related_functions": [...],                                   │
│    "related_concepts": [...]                                     │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Docker Bind Mount Strategy

### Why Bind Mounts? (Revised Decision)

**Simplicity:**
- ✅ No external dependencies (no mutagen/docker-sync)
- ✅ Native Docker feature
- ✅ Simpler configuration and deployment
- ✅ Works out-of-the-box

**File Access:**
- ✅ Direct host filesystem access
- ✅ No sync latency (immediate visibility)
- ✅ Easy to mount multiple directories

**File Watching:**
- ⚠️ Events don't propagate on macOS/Windows
- ✅ Solved with polling (chokidar `usePolling: true`)
- ✅ 1s polling interval = acceptable latency
- ✅ 2-5% CPU overhead (reasonable trade-off)

**Trade-offs:**
- ⚠️ Polling required for file events
- ⚠️ Slightly higher CPU usage (~2-5%)
- ⚠️ 1-2s event detection latency
- ✅ But: No external tools, simpler setup

**Decision:** For a development/single-machine tool, simplicity > performance. Bind mounts are the right choice.

---

### Docker Compose Configuration

```yaml
# docker compose.yml
version: '3.8'

services:
  mcp-server:
    build: .
    container_name: mcp-graph-rag
    ports:
      - "3000:3000"
    volumes:
      # Bind mount: Root directory containing all projects (read-only)
      # ${WORKSPACE_ROOT} comes from .env file or environment variable
      # Example: WORKSPACE_ROOT=/Users/timothysweet/src
      # This mounts your entire src directory into /workspace/src in the container
      - ${WORKSPACE_ROOT:~/src}:/workspace/src:ro
      
      # Persistent config and data (read-write)
      - ./data:/app/data
      
    environment:
      # File indexing config
      DOCKER_ENV: "true"
      FILE_WATCH_ENABLED: "true"
      FILE_WATCH_POLLING: "true"  # Required for bind mounts
      FILE_WATCH_INTERVAL: "1000"  # Poll every 1s
      WORKSPACE_PATH: "/workspace/src"
      WATCH_CONFIG_PATH: "/app/data/watch-config.json"
      
      # RAG config
      RAG_AUTO_ENRICH: "true"
      RAG_MAX_RELATED_FILES: "10"
      RAG_MAX_DEPTH: "2"
      RAG_MIN_RELEVANCE: "0.3"
      
      # Neo4j connection
      NEO4J_URI: bolt://neo4j:7687
      NEO4J_USER: neo4j
      NEO4J_PASSWORD: ${NEO4J_PASSWORD}
      
    depends_on:
      neo4j:
        condition: service_healthy
    networks:
      - app-network

  neo4j:
    image: neo4j:5.15-community
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
      NEO4J_PLUGINS: '["apoc"]'
      # Enable full-text indexes
      NEO4J_dbms_security_procedures_unrestricted: apoc.*
    volumes:
      - ./data/neo4j:/data
      - ./data/neo4j-logs:/logs
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "${NEO4J_PASSWORD}", "RETURN 1"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

networks:
  app-network:
```

**Concrete Example (What Actually Happens):**

```yaml
# If your .env file contains:
# WORKSPACE_ROOT=/Users/timothysweet/src

# Then Docker resolves this:
volumes:
  - ${WORKSPACE_ROOT:~/src}:/workspace/src:ro

# To this actual mount:
volumes:
  - /Users/timothysweet/src:/workspace/src:ro

# Meaning:
# Host path:      /Users/timothysweet/src
# Container path: /workspace/src
# Mode:           :ro (read-only)
```

**Alternative: Hardcoded Path (No Environment Variable)**

```yaml
# If you prefer not to use environment variables:
volumes:
  - /Users/timothysweet/src:/workspace/src:ro
  - ./data:/app/data

# This works too! Just less flexible across different machines.
```

### Real-World Example: Mount Root, Configure What to Index

**Scenario:** You have multiple projects under `/Users/timothysweet/src/` but only want to index specific ones.

**Strategy:** 
1. Mount the entire `/src/` directory (read-only)
2. Use `watch-config.json` to specify which subdirectories to index
3. Add/remove folders via MCP tools (`watch_folder` / `unwatch_folder`)

**Host Path:** `/Users/timothysweet/src`  
**Container Path:** `/workspace/src`

```yaml
# docker compose.yml
services:
  mcp-server:
    volumes:
      # Mount entire src directory (read-only)
      - /Users/timothysweet/src:/workspace/src:ro
      
      # Data and config (read-write)
      - ./data:/app/data
```

**Inside the container, the file structure will be:**

```
/workspace/src/
  ├── GRAPH-RAG-TODO-main/
  │   ├── src/
  │   ├── docs/
  │   └── package.json
  ├── my-web-app/
  │   ├── components/
  │   └── pages/
  ├── research-project/
  │   └── experiments/
  └── personal-notes/
      └── ideas/
```

**Configuration Storage: Neo4j (Not JSON Files)**

Instead of flat file config, watch configurations are stored as Neo4j nodes:

```cypher
// Watch configuration nodes in Neo4j
CREATE (w:WatchConfig {
  id: 'watch-1-1234567890',
  path: '/workspace/src/GRAPH-RAG-TODO-main',
  recursive: true,
  debounce_ms: 500,
  generate_embeddings: false,
  added_date: '2025-10-17T10:30:00Z',
  last_indexed: '2025-10-17T10:35:00Z',
  file_patterns: ['*.ts', '*.js', '*.md'],
  ignore_patterns: ['node_modules/', 'dist/', '*.test.ts'],
  status: 'active',
  files_indexed: 147
});

CREATE (w:WatchConfig {
  id: 'watch-2-1234567891',
  path: '/workspace/src/my-web-app',
  recursive: true,
  debounce_ms: 500,
  generate_embeddings: false,
  added_date: '2025-10-17T11:45:00Z',
  last_indexed: '2025-10-17T11:50:00Z',
  file_patterns: ['*.tsx', '*.ts', '*.jsx', '*.js'],
  ignore_patterns: ['node_modules/', '.next/', 'build/'],
  status: 'active',
  files_indexed: 89
});
```

**Benefits of Neo4j Storage:**
- ✅ Single source of truth (no file sync issues)
- ✅ Transactional updates (no race conditions)
- ✅ Query watch status alongside indexed files
- ✅ Automatic persistence (Neo4j volume)
- ✅ Simple startup query (no complex relationships needed)

**To add a folder for indexing via MCP tool:**

```typescript
// Agent calls:
await mcp.call('watch_folder', {
  path: '/workspace/src/research-project',  // Container path
  recursive: true,
  file_patterns: ['*.py', '*.ipynb', '*.md']
});

// System validates and executes:
// 1. ✅ Check if path exists on filesystem
// 2. ✅ Create WatchConfig node in Neo4j
// 3. ✅ Start chokidar watcher
// 4. ✅ Return watch_id: "watch-3-xxx"

// Response:
{
  "watch_id": "watch-3-xxx",
  "path": "/workspace/src/research-project",
  "status": "active",
  "message": "Folder is now being watched. Indexing will begin."
}
```

**To manually trigger indexing (with validation):**

```typescript
// Agent calls:
await mcp.call('index_folder', {
  path: '/workspace/src/research-project'
});

// System validates:
// 1. ✅ Check if path exists on filesystem
// 2. ✅ Check if path is in WatchConfig (must be watched first!)
// 3. ✅ If valid: index all matching files
// 4. ❌ If invalid: return error with instructions

// Success response:
{
  "status": "success",
  "path": "/workspace/src/research-project",
  "files_indexed": 47,
  "elapsed_ms": 1250
}

// Error response (not watched):
{
  "status": "error",
  "error": "folder_not_watched",
  "message": "Path '/workspace/src/research-project' is not in watch list. Call watch_folder first.",
  "path": "/workspace/src/research-project"
}

// Error response (doesn't exist):
{
  "status": "error",
  "error": "path_not_found",
  "message": "Path '/workspace/src/nonexistent' does not exist.",
  "path": "/workspace/src/nonexistent"
}
```

**To remove a folder from indexing:**

```typescript
// Agent calls:
await mcp.call('unwatch_folder', {
  path: '/workspace/src/personal-notes'
});

// System:
// 1. Stops chokidar watcher
// 2. Updates WatchConfig node: status = 'inactive'
// 3. Optionally: Removes indexed files from Neo4j

// Response:
{
  "status": "success",
  "path": "/workspace/src/personal-notes",
  "files_removed": 23,
  "message": "Folder watch stopped and indexed data removed."
}
```

**Query example after indexing:**

```typescript
// Agent searches across ALL indexed projects:
await mcp.call('graph_search_nodes', {
  query: 'GraphManager Neo4j'
});

// Response includes results from:
// - /workspace/src/GRAPH-RAG-TODO-main/src/managers/GraphManager.ts
// - /workspace/src/my-web-app/lib/graphql-client.ts (if related)
// - Cross-project relationships automatically discovered
```

**Benefits:**
- ✅ Single mount point for all projects
- ✅ Selective indexing via config file
- ✅ Easy to add/remove projects dynamically
- ✅ Config persists across restarts
- ✅ Cross-project search and relationships

---

### Environment Configuration

```bash
# .env (Real Example)
NEO4J_PASSWORD=your_secure_password

# Mount root directory containing all projects
WORKSPACE_ROOT=/Users/timothysweet/src

# File watching config
FILE_WATCH_ENABLED=true
FILE_WATCH_POLLING=true
FILE_WATCH_INTERVAL=1000
WATCH_CONFIG_PATH=/app/data/watch-config.json

# RAG config
RAG_AUTO_ENRICH=true
RAG_MAX_RELATED_FILES=10
RAG_MAX_DEPTH=2
RAG_MIN_RELEVANCE=0.3
```

**Key Concept:** 
- Mount ONE broad directory (`WORKSPACE_ROOT`)
- Config file controls WHICH subdirectories to index
- Add/remove via MCP tools, not environment variables

### Starting the System

**Example 1: Mount Root Directory**

```bash
# Set environment variable (mount entire src directory)
export WORKSPACE_ROOT=/Users/timothysweet/src

# Start Docker services
docker compose up -d

# Verify the mount worked (all projects visible)
docker exec mcp-graph-rag ls -la /workspace/src

# You should see ALL your projects:
# drwxr-xr-x  GRAPH-RAG-TODO-main/
# drwxr-xr-x  my-web-app/
# drwxr-xr-x  research-project/
# drwxr-xr-x  personal-notes/

# Check logs
docker compose logs -f mcp-server

# Expected output (NO watches yet - empty config):
# 📂 Loading persisted watches...
# 📂 Loading 0 persisted watches...
# 🎯 File watching initialized (0 active)
```

**Example 2: Add Projects to Index (via MCP)**

```typescript
// Agent adds first project
await mcp.call('watch_folder', {
  path: '/workspace/src/GRAPH-RAG-TODO-main',
  recursive: true,
  file_patterns: ['*.ts', '*.js', '*.md']
});

// Response:
{
  "status": "success",
  "watch_id": "watch-1-xxx",
  "folder": "/workspace/src/GRAPH-RAG-TODO-main",
  "files_indexed": 147,
  "persisted": true
}

// Agent adds second project
await mcp.call('watch_folder', {
  path: '/workspace/src/my-web-app',
  recursive: true,
  file_patterns: ['*.tsx', '*.ts', '*.jsx']
});

// Both entries now in ./data/watch-config.json
// On restart: Both automatically resume watching
```

**Example 3: Check What's Being Watched**

```typescript
// Agent checks current watches
await mcp.call('list_watched_folders');

// Response:
{
  "watches": [
    {
      "watch_id": "watch-1-xxx",
      "folder": "/workspace/src/GRAPH-RAG-TODO-main",
      "recursive": true,
      "files_indexed": 147,
      "last_update": "2025-10-17T10:30:00Z",
      "active": true
    },
    {
      "watch_id": "watch-2-xxx",
      "folder": "/workspace/src/my-web-app",
      "recursive": true,
      "files_indexed": 89,
      "last_update": "2025-10-17T11:45:00Z",
      "active": true
    }
  ],
  "total": 2
}
```

**Example 4: Remove a Folder from Indexing**

```typescript
// Agent removes folder
await mcp.call('unwatch_folder', {
  path: '/workspace/src/personal-notes'
});

// System:
// 1. Stops file watching
// 2. Removes from ./data/watch-config.json
// 3. Optionally: Purges indexed data from Neo4j

// Next restart: Only remaining folders in config auto-resume
```

### Adding New Folders Dynamically

**Option 1: Via MCP Tool (Recommended)**

```typescript
// Agent calls this tool
await mcp.call('watch_folder', {
  path: '/workspace/project1',  // Inside container
  recursive: true
});

// System:
// 1. Starts watching /workspace/project1
// 2. Saves to ./data/watch-config.json
// 3. On restart: Automatically resumes watching
```

**Option 2: Update docker compose.yml (Requires Restart)**

```yaml
# Add new bind mount
volumes:
  - /Users/username/new-project:/workspace/project3:ro
```

```bash
docker compose down
docker compose up -d
```

---

### Complete Workflow Example

**Step 1: Setup and Mount Root Directory**

```bash
# Terminal 1: Set up environment
cd /Users/timothysweet/src/GRAPH-RAG-TODO-main

# Create .env file
cat > .env << EOF
NEO4J_PASSWORD=mysecurepassword
WORKSPACE_ROOT=/Users/timothysweet/src
EOF

# Verify docker compose.yml volumes section
# volumes:
#   - ${WORKSPACE_ROOT}:/workspace/src:ro
#   - ./data:/app/data

# Start services
docker compose up -d

# Verify ALL projects are visible (but not indexed yet)
docker exec mcp-graph-rag ls /workspace/src
# Output: GRAPH-RAG-TODO-main/  my-web-app/  research-project/

# Check specific project
docker exec mcp-graph-rag ls /workspace/src/GRAPH-RAG-TODO-main/src
# Output: index.ts  managers/  tools/  types/  utils/

# Check logs - no watches yet
docker compose logs mcp-server
# Output: 📂 Loading 0 persisted watches...
```

**Step 2: Index Specific Projects via MCP Tool**

```typescript
// Agent (via Cursor MCP) adds GRAPH-RAG-TODO for indexing:
await mcp.call('watch_folder', {
  path: '/workspace/src/GRAPH-RAG-TODO-main',
  recursive: true,
  file_patterns: ['*.ts', '*.js', '*.md']
});

// Response:
{
  "status": "success",
  "watch_id": "watch-1-1234567890",
  "folder": "/workspace/src/GRAPH-RAG-TODO-main",
  "files_indexed": 147,
  "persisted": true,
  "message": "Watching folder. Will re-index on file changes."
}

// Agent adds another project:
await mcp.call('watch_folder', {
  path: '/workspace/src/my-web-app',
  recursive: true,
  file_patterns: ['*.tsx', '*.ts', '*.jsx']
});

// Response:
{
  "status": "success",
  "watch_id": "watch-2-1234567891",
  "folder": "/workspace/src/my-web-app",
  "files_indexed": 89,
  "persisted": true
}

// Both entries saved to ./data/watch-config.json
// Both will auto-resume on restart
```

**Step 3: Query for Context**

```typescript
// Agent searches for "GraphManager"
await mcp.call('graph_search_nodes', {
  query: 'GraphManager Neo4j implementation',
  max_results: 5,
  include_content: true
});

// Response (auto-enriched):
{
  "query": "GraphManager Neo4j implementation",
  "results": [
    {
      "id": "file-1-xxx",
      "type": "file",
      "properties": {
        "path": "src/managers/GraphManager.ts",
        "language": "typescript",
        "line_count": 605
      },
      "relevance": 0.95
    }
  ],
  "related_files": [
    {
      "path": "src/managers/GraphManager.ts",
      "content": "import neo4j from 'neo4j-driver';\n\nexport class GraphManager implements IGraphManager {\n  private driver: neo4j.Driver;\n  \n  async addNode(type: string, properties: any): Promise<Node> {\n    // ... full implementation ...\n  }\n  // ... 600 lines of code ...\n}",
      "language": "typescript",
      "relevance": 0.95,
      "reason": "RELATES_TO → keyword_match",
      "distance": 1
    },
    {
      "path": "src/types/IGraphManager.ts",
      "content": "export interface IGraphManager {\n  addNode(type: string, properties: any): Promise<Node>;\n  // ...\n}",
      "relevance": 0.82,
      "reason": "IMPORTS",
      "distance": 1
    }
  ],
  "related_functions": [
    {
      "name": "addNode",
      "signature": "addNode(type: string, properties: any): Promise<Node>",
      "file_path": "src/managers/GraphManager.ts",
      "line_start": 45,
      "line_end": 78,
      "body": "async addNode(type: string, properties: any): Promise<Node> {\n  const session = this.driver.session();\n  // ...\n}",
      "relevance": 0.90
    }
  ],
  "execution_time_ms": 145
}
```

**Step 4: Agent Uses Context**

```typescript
// Agent now has:
// ✅ Full GraphManager.ts source code
// ✅ Interface definition
// ✅ Related functions with implementations
// ✅ Import relationships

// Agent can answer questions like:
// - "How does addNode work?" → See full implementation
// - "What methods are available?" → See interface
// - "Where is Neo4j driver used?" → See imports and usage

// All from a SINGLE tool call!
```

**Step 5: File Changes Auto-Detected**

```bash
# Terminal 2: Make a change to an indexed project
echo "// New feature" >> /Users/timothysweet/src/GRAPH-RAG-TODO-main/src/managers/GraphManager.ts

# System automatically (within 1-2 seconds):
# 1. Detects file change (via polling)
# 2. Re-indexes GraphManager.ts
# 3. Updates Neo4j graph
# 4. Next query includes updated content

# Check logs:
docker compose logs -f mcp-server
# 📝 File changed: /workspace/src/GRAPH-RAG-TODO-main/src/managers/GraphManager.ts
# ✅ reindex: /workspace/src/GRAPH-RAG-TODO-main/src/managers/GraphManager.ts (87ms)

# Make a change to non-indexed project (ignored)
echo "// Comment" >> /Users/timothysweet/src/personal-notes/ideas.txt
# No logs - not in watch-config.json, so not monitored
```

**Step 6: Remove a Project from Indexing**

```typescript
// Agent decides to stop indexing my-web-app
await mcp.call('unwatch_folder', {
  path: '/workspace/src/my-web-app'
});

// Response:
{
  "status": "success",
  "folder": "/workspace/src/my-web-app",
  "removed": true,
  "message": "Folder watch removed and config updated"
}

// System:
// 1. Stops watching /workspace/src/my-web-app
// 2. Removes entry from ./data/watch-config.json
// 3. On restart: Only GRAPH-RAG-TODO-main auto-resumes
```

---

## 📊 Neo4j Graph Schema for RAG

### Node Types

```cypher
// File nodes - Source code files
CREATE (f:File {
  id: "file-1-xxx",
  type: "file",
  path: "src/orchestration/WorkflowManager.ts",
  name: "WorkflowManager.ts",
  language: "typescript",
  content: "...",  // Full file content
  size_bytes: 15234,
  line_count: 456,
  last_modified: datetime(),
  indexed_date: datetime(),
  hash: "sha256-xxx"
})

// Function nodes - Extracted functions
CREATE (fn:Function {
  id: "func-1-xxx",
  type: "function",
  name: "orchestrateWorkflow",
  signature: "orchestrateWorkflow(config: WorkflowConfig): Promise<void>",
  file_path: "src/orchestration/WorkflowManager.ts",
  line_start: 45,
  line_end: 78,
  body: "...",  // Full function body
  docstring: "Orchestrates multi-agent workflow execution",
  complexity: 12,
  async: true
})

// Class nodes
CREATE (c:Class {
  id: "class-1-xxx",
  type: "class",
  name: "WorkflowOrchestrator",
  file_path: "src/orchestration/WorkflowManager.ts",
  line_start: 10,
  line_end: 150,
  docstring: "Manages workflow orchestration and agent coordination",
  methods: ["start", "stop", "pause", "resume"]
})

// Concept nodes - Abstract concepts
CREATE (concept:Concept {
  id: "concept-1-xxx",
  type: "concept",
  name: "orchestration",
  description: "Multi-agent workflow coordination and execution",
  keywords: ["workflow", "orchestration", "agent", "coordination"],
  created: datetime()
})

// TODO nodes (existing)
CREATE (todo:Todo {
  id: "todo-1-xxx",
  type: "todo",
  title: "Implement workflow orchestration",
  description: "Add multi-agent orchestration support",
  status: "in_progress",
  priority: "high"
})
```

### Relationship Types

```cypher
// File contains function
CREATE (file:File)-[:CONTAINS {line_start: 45}]->(func:Function)

// File imports another file
CREATE (file1:File)-[:IMPORTS {
  import_statement: "import { Orchestrator } from './orchestration'"
}]->(file2:File)

// Function calls another function
CREATE (func1:Function)-[:CALLS {
  line: 56,
  call_type: "direct"
}]->(func2:Function)

// TODO references file
CREATE (todo:Todo)-[:REFERENCES {
  line: 42,
  context: "Implementation needed here"
}]->(file:File)

// Node relates to concept (for semantic search)
CREATE (file:File)-[:RELATES_TO {
  relevance: 0.85,
  reason: "keyword_match"
}]->(concept:Concept)

CREATE (func:Function)-[:RELATES_TO {
  relevance: 0.95,
  reason: "name_match + docstring"
}]->(concept:Concept)

// Class extends another class
CREATE (class1:Class)-[:EXTENDS]->(class2:Class)

// Function implements interface
CREATE (func:Function)-[:IMPLEMENTS]->(interface:Interface)
```

---

## 🔍 RAG Search Implementation

### Multi-Strategy Search

```typescript
// src/rag/RAGSearchEngine.ts
import { Driver, Session } from 'neo4j-driver';

export interface RAGSearchOptions {
  query: string;
  maxResults?: number;
  minRelevance?: number;
  includeContent?: boolean;
  maxDepth?: number;
  strategies?: ('fulltext' | 'graph' | 'vector')[];  // Phase 1: fulltext+graph, Phase 2: add vector
  enableVectorSearch?: boolean;  // Future: enable when embeddings are added
}

export interface RAGSearchResult {
  query: string;
  results: EnrichedNode[];
  related_files: FileContext[];
  related_functions: FunctionContext[];
  related_concepts: ConceptContext[];
  execution_time_ms: number;
}

export class RAGSearchEngine {
  constructor(
    private driver: Driver,
    private enableVectorSearch: boolean = false  // Phase 1: disabled by default
  ) {}
  
  async search(options: RAGSearchOptions): Promise<RAGSearchResult> {
    const startTime = Date.now();
    
    // 1. Execute multi-strategy search (Phase 1: fulltext + graph only)
    const searchPromises = [
      this.fulltextSearch(options.query),
      this.graphSearch(options.query)
    ];
    
    // Phase 2: Add vector search when enabled
    if (this.enableVectorSearch && options.enableVectorSearch !== false) {
      searchPromises.push(this.vectorSearch(options.query));
    }
    
    const results = await Promise.all(searchPromises);
    const [fulltextResults, graphResults, vectorResults] = results;
    
    // 2. Fuse and rank results
    const rankedNodes = this.fuseResults(
      fulltextResults,
      graphResults,
      vectorResults || [],  // Empty array if vector search disabled
      options.minRelevance || 0.3
    );
    
    // 3. Enrich with context
    const enrichedResults = await this.enrichWithContext(
      rankedNodes.slice(0, options.maxResults || 10),
      options.maxDepth || 2
    );
    
    return {
      query: options.query,
      results: enrichedResults.nodes,
      related_files: enrichedResults.files,
      related_functions: enrichedResults.functions,
      related_concepts: enrichedResults.concepts,
      execution_time_ms: Date.now() - startTime
    };
  }
  
  // Strategy 1: Full-text search (keyword matching)
  private async fulltextSearch(query: string): Promise<SearchMatch[]> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        // Search file content
        CALL db.index.fulltext.queryNodes('file_content', $query)
        YIELD node, score
        WHERE node:File
        RETURN 
          node.id AS id,
          'file' AS type,
          score AS relevance,
          'fulltext_content' AS match_type
        
        UNION
        
        // Search function names and docstrings
        CALL db.index.fulltext.queryNodes('function_search', $query)
        YIELD node, score
        WHERE node:Function
        RETURN 
          node.id AS id,
          'function' AS type,
          score AS relevance,
          'fulltext_function' AS match_type
        
        UNION
        
        // Search class names and docstrings
        CALL db.index.fulltext.queryNodes('class_search', $query)
        YIELD node, score
        WHERE node:Class
        RETURN 
          node.id AS id,
          'class' AS type,
          score AS relevance,
          'fulltext_class' AS match_type
        
        ORDER BY relevance DESC
        LIMIT 50
      `, { query });
      
      return result.records.map(r => ({
        id: r.get('id'),
        type: r.get('type'),
        relevance: r.get('relevance'),
        matchType: r.get('match_type')
      }));
    } finally {
      await session.close();
    }
  }
  
  // Strategy 2: Vector similarity search (PHASE 2 - FUTURE)
  // This method is prepared but not used in Phase 1
  private async vectorSearch(query: string): Promise<SearchMatch[]> {
    // Phase 1: Return empty results (vector search disabled)
    if (!this.enableVectorSearch) {
      return [];
    }
    
    // Phase 2: Implement when embeddings are added
    const session = this.driver.session();
    
    try {
      // Generate embedding for query (would use actual embedding service)
      const queryEmbedding = await this.generateEmbedding(query);
      
      const result = await session.run(`
        // Vector similarity search using cosine distance
        CALL db.index.vector.queryNodes('file_embeddings', $k, $embedding)
        YIELD node, score
        RETURN 
          node.id AS id,
          node.type AS type,
          score AS relevance,
          'vector_similarity' AS match_type
        ORDER BY score DESC
      `, { 
        k: 50,  // Top 50 results
        embedding: queryEmbedding 
      });
      
      return result.records.map(r => ({
        id: r.get('id'),
        type: r.get('type'),
        relevance: r.get('relevance'),
        matchType: r.get('match_type')
      }));
    } finally {
      await session.close();
    }
  }
  
  // Strategy 3: Graph traversal (relationship-based)
  private async graphSearch(query: string): Promise<SearchMatch[]> {
    const session = this.driver.session();
    
    try {
      // Find concept nodes matching query, then traverse to related entities
      const result = await session.run(`
        // Find matching concepts
        MATCH (c:Concept)
        WHERE c.name CONTAINS toLower($query)
           OR any(kw IN c.keywords WHERE kw CONTAINS toLower($query))
        
        // Traverse to related nodes
        OPTIONAL MATCH (c)<-[r:RELATES_TO]-(entity)
        WHERE entity:File OR entity:Function OR entity:Class
        
        WITH entity, 
             avg(r.relevance) AS avg_relevance,
             count(r) AS relation_count
        WHERE entity IS NOT NULL
        
        RETURN 
          entity.id AS id,
          entity.type AS type,
          (avg_relevance * log(1 + relation_count)) AS relevance,
          'graph_traversal' AS match_type
        ORDER BY relevance DESC
        LIMIT 50
      `, { query });
      
      return result.records.map(r => ({
        id: r.get('id'),
        type: r.get('type'),
        relevance: r.get('relevance'),
        matchType: r.get('match_type')
      }));
    } finally {
      await session.close();
    }
  }
  
  // Fuse results from multiple strategies
  private fuseResults(
    fulltext: SearchMatch[],
    graph: SearchMatch[],
    vector: SearchMatch[],  // Empty array in Phase 1
    minRelevance: number
  ): RankedNode[] {
    const nodeScores = new Map<string, {
      id: string;
      type: string;
      scores: { [key: string]: number };
      matchTypes: string[];
    }>();
    
    // Determine weights based on whether vector search is enabled
    const hasVector = vector.length > 0;
    const weights = hasVector
      ? { fulltext: 0.4, graph: 0.3, vector: 0.3 }  // Phase 2: All strategies
      : { fulltext: 0.6, graph: 0.4, vector: 0.0 };  // Phase 1: No vector
    
    // Aggregate scores by node ID
    [
      ...fulltext.map(m => ({ ...m, strategy: 'fulltext', weight: weights.fulltext })),
      ...graph.map(m => ({ ...m, strategy: 'graph', weight: weights.graph })),
      ...vector.map(m => ({ ...m, strategy: 'vector', weight: weights.vector }))
    ].forEach(match => {
      const existing = nodeScores.get(match.id) || {
        id: match.id,
        type: match.type,
        scores: {},
        matchTypes: []
      };
      
      existing.scores[match.strategy] = match.relevance * match.weight;
      existing.matchTypes.push(match.matchType);
      
      nodeScores.set(match.id, existing);
    });
    
    // Calculate final scores and rank
    const ranked = Array.from(nodeScores.values())
      .map(node => ({
        id: node.id,
        type: node.type,
        relevance: Object.values(node.scores).reduce((a, b) => a + b, 0),
        matchTypes: [...new Set(node.matchTypes)],
        scoreBreakdown: node.scores
      }))
      .filter(node => node.relevance >= minRelevance)
      .sort((a, b) => b.relevance - a.relevance);
    
    return ranked;
  }
  
  // Enrich results with context
  private async enrichWithContext(
    nodes: RankedNode[],
    maxDepth: number
  ): Promise<EnrichedResults> {
    const session = this.driver.session();
    
    try {
      const nodeIds = nodes.map(n => n.id);
      
      const result = await session.run(`
        // Get primary nodes
        MATCH (n)
        WHERE n.id IN $nodeIds
        
        // Traverse to related entities (up to maxDepth hops)
        OPTIONAL MATCH path = (n)-[*1..${maxDepth}]-(related)
        WHERE related:File OR related:Function OR related:Class OR related:Concept
        
        WITH n, related, 
             length(path) AS distance,
             relationships(path) AS rels
        
        // Calculate relevance based on distance
        WITH n, related, 
             (1.0 / (distance + 1)) AS proximity_score,
             [r IN rels | type(r)] AS relationship_chain
        
        // Group results
        RETURN 
          n,
          collect(DISTINCT {
            node: related,
            relevance: proximity_score,
            relationships: relationship_chain,
            distance: distance
          }) AS context
      `, { nodeIds, maxDepth });
      
      // Parse and structure results
      const enrichedNodes: EnrichedNode[] = [];
      const relatedFiles: FileContext[] = [];
      const relatedFunctions: FunctionContext[] = [];
      const relatedConcepts: ConceptContext[] = [];
      
      for (const record of result.records) {
        const primaryNode = record.get('n');
        const context = record.get('context');
        
        // Add primary node
        enrichedNodes.push(await this.nodeToEnriched(primaryNode));
        
        // Process context
        for (const ctx of context) {
          const related = ctx.node;
          if (!related) continue;
          
          const relatedType = related.properties.type;
          
          if (relatedType === 'file') {
            relatedFiles.push({
              path: related.properties.path,
              content: related.properties.content,
              language: related.properties.language,
              relevance: ctx.relevance,
              reason: ctx.relationships.join(' → '),
              distance: ctx.distance
            });
          } else if (relatedType === 'function') {
            relatedFunctions.push({
              name: related.properties.name,
              signature: related.properties.signature,
              file_path: related.properties.file_path,
              line_start: related.properties.line_start,
              line_end: related.properties.line_end,
              body: related.properties.body,
              docstring: related.properties.docstring,
              relevance: ctx.relevance,
              reason: ctx.relationships.join(' → ')
            });
          } else if (relatedType === 'concept') {
            relatedConcepts.push({
              name: related.properties.name,
              description: related.properties.description,
              keywords: related.properties.keywords,
              relevance: ctx.relevance
            });
          }
        }
      }
      
      // Deduplicate and sort by relevance
      return {
        nodes: enrichedNodes,
        files: this.deduplicateAndSort(relatedFiles, 'path'),
        functions: this.deduplicateAndSort(relatedFunctions, 'signature'),
        concepts: this.deduplicateAndSort(relatedConcepts, 'name')
      };
      
    } finally {
      await session.close();
    }
  }
  
  private async nodeToEnriched(node: any): Promise<EnrichedNode> {
    const props = node.properties;
    
    return {
      id: props.id,
      type: props.type,
      properties: props,
      created: props.created,
      updated: props.updated
    };
  }
  
  private deduplicateAndSort<T extends { relevance: number }>(
    items: T[],
    key: keyof T
  ): T[] {
    const seen = new Set<any>();
    return items
      .filter(item => {
        const k = item[key];
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);  // Limit to top 10
  }
  
  private async generateEmbedding(text: string): Promise<number[]> {
    // PHASE 2 - FUTURE: Integrate with embedding service
    // Options: OpenAI text-embedding-3-small, Voyage Code, local Sentence-Transformers
    // For now, this method is not called (enableVectorSearch = false)
    throw new Error('Vector embeddings not yet implemented. Enable in Phase 2.');
  }
}
```

---

## 🛠️ Neo4j Index Setup

### Phase 1: Full-Text Indexes (Required)

```cypher
// File content search
CREATE FULLTEXT INDEX file_content FOR (n:File) 
ON EACH [n.content, n.path, n.name];

// Function search
CREATE FULLTEXT INDEX function_search FOR (n:Function) 
ON EACH [n.name, n.signature, n.docstring, n.body];

// Class search
CREATE FULLTEXT INDEX class_search FOR (n:Class) 
ON EACH [n.name, n.docstring];

// Concept search
CREATE FULLTEXT INDEX concept_search FOR (n:Concept) 
ON EACH [n.name, n.description, n.keywords];
```

### Phase 2: Vector Indexes (Future - Optional)

**⚠️ Not implemented yet. Add these when embedding support is ready.**

```cypher
// File embeddings
CREATE VECTOR INDEX file_embeddings FOR (n:File) 
ON n.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
};

// Function embeddings
CREATE VECTOR INDEX function_embeddings FOR (n:Function) 
ON n.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
};
```

---

## 🎯 MCP Tool Integration

### Updated `graph_search_nodes` Tool

```typescript
// src/tools/graph.tools.ts
export const GRAPH_SEARCH_TOOL = {
  name: "graph_search_nodes",
  description: `
Search the knowledge graph and automatically retrieve related files, functions, and context.

**RAG-Enhanced Search:** Results automatically include:
- Matched nodes (files, functions, classes, TODOs)
- Related file content (full source code)
- Related functions (signatures + bodies)
- Related concepts and keywords
- Graph relationships explaining relevance

**Example Usage:**
query = "orchestration"

Response includes:
- All files containing "orchestration" keyword
- Functions with "orchestrate" in name/docstring
- Classes related to workflow management
- TODOs referencing orchestration
- Import chains and call graphs

**Search Strategies:**
1. Full-text: Keyword matching in content
2. Vector: Semantic similarity (if embeddings enabled)
3. Graph: Relationship traversal from concept nodes

**When to use:**
- Exploring codebase: "Show me authentication code"
- Finding implementations: "Where is error handling?"
- Understanding architecture: "How does caching work?"
- Context for TODO: "What files relate to this bug?"

**Memory Tip:** Use this instead of manually listing files. The graph knows relationships!
  `,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (keywords, concepts, or natural language)"
      },
      max_results: {
        type: "number",
        description: "Maximum number of primary results (default: 10)",
        default: 10
      },
      min_relevance: {
        type: "number",
        description: "Minimum relevance score 0-1 (default: 0.3)",
        default: 0.3
      },
      include_content: {
        type: "boolean",
        description: "Include full file content in response (default: true)",
        default: true
      },
      max_depth: {
        type: "number",
        description: "Max graph traversal depth for context (default: 2)",
        default: 2
      }
    },
    required: ["query"]
  }
};

// Tool handler
export async function handleGraphSearch(
  args: any,
  ragEngine: RAGSearchEngine
): Promise<ToolResponse> {
  const result = await ragEngine.search({
    query: args.query,
    maxResults: args.max_results || 10,
    minRelevance: args.min_relevance || 0.3,
    includeContent: args.include_content !== false,
    maxDepth: args.max_depth || 2
  });
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}
```

### Updated `graph_get_node` Tool (Auto-Enriched)

```typescript
export const GRAPH_GET_NODE_TOOL = {
  name: "graph_get_node",
  description: `
Get a node by ID with automatic RAG context enrichment.

**Auto-Enriched Response:** Includes:
- Primary node data
- Related files (imports, references)
- Related functions (calls, implementations)
- Related TODOs (if any)
- Graph neighborhood (1-2 hops)

**Example:**
get_node({ id: "todo-1-xxx" })

Response includes:
- The TODO itself
- Files referenced in TODO context
- Functions mentioned or modified
- Related TODOs (same component/feature)
- Recent commits touching same files

**Memory Tip:** Single tool call gets comprehensive context. No need to manually traverse graph!
  `,
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Node ID to retrieve"
      },
      include_context: {
        type: "boolean",
        description: "Include related nodes (default: true)",
        default: true
      },
      max_depth: {
        type: "number",
        description: "Max graph traversal depth (default: 2)",
        default: 2
      }
    },
    required: ["id"]
  }
};

// Tool handler
export async function handleGetNode(
  args: any,
  graphManager: GraphManager,
  ragEngine: RAGSearchEngine
): Promise<ToolResponse> {
  // Get primary node
  const node = await graphManager.getNode(args.id);
  
  if (!node) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: "Node not found", id: args.id })
      }]
    };
  }
  
  // Enrich with context if requested
  if (args.include_context !== false) {
    const context = await ragEngine.enrichWithContext(
      [{ id: node.id, type: node.type, relevance: 1.0, matchTypes: [] }],
      args.max_depth || 2
    );
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          node,
          related_files: context.files,
          related_functions: context.functions,
          related_concepts: context.concepts
        }, null, 2)
      }]
    };
  }
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ node }, null, 2)
    }]
  };
}
```

---

## 📝 Example Query: "orchestration"

### Request

```json
{
  "tool": "graph_search_nodes",
  "arguments": {
    "query": "orchestration",
    "max_results": 5,
    "min_relevance": 0.4,
    "include_content": true,
    "max_depth": 2
  }
}
```

### Response (Enriched)

```json
{
  "query": "orchestration",
  "results": [
    {
      "id": "file-1-xxx",
      "type": "file",
      "properties": {
        "path": "src/orchestration/WorkflowManager.ts",
        "name": "WorkflowManager.ts",
        "language": "typescript",
        "line_count": 456
      },
      "relevance": 0.95,
      "match_types": ["fulltext_content", "graph_traversal"],
      "score_breakdown": {
        "fulltext": 0.38,
        "vector": 0.27,
        "graph": 0.30
      }
    },
    {
      "id": "func-2-xxx",
      "type": "function",
      "properties": {
        "name": "orchestrateWorkflow",
        "signature": "orchestrateWorkflow(config: WorkflowConfig): Promise<void>",
        "file_path": "src/orchestration/WorkflowManager.ts"
      },
      "relevance": 0.89,
      "match_types": ["fulltext_function", "vector_similarity"]
    },
    {
      "id": "class-3-xxx",
      "type": "class",
      "properties": {
        "name": "WorkflowOrchestrator",
        "docstring": "Manages workflow orchestration and agent coordination"
      },
      "relevance": 0.87,
      "match_types": ["fulltext_class", "graph_traversal"]
    },
    {
      "id": "todo-4-xxx",
      "type": "todo",
      "properties": {
        "title": "Implement workflow orchestration",
        "description": "Add multi-agent orchestration support",
        "status": "in_progress"
      },
      "relevance": 0.75,
      "match_types": ["fulltext_content"]
    }
  ],
  
  "related_files": [
    {
      "path": "src/orchestration/WorkflowManager.ts",
      "content": "import { Agent } from '../agents/Agent';\nimport { WorkflowConfig } from './types';\n\n/**\n * Manages workflow orchestration and agent coordination\n */\nexport class WorkflowOrchestrator {\n  private agents: Map<string, Agent> = new Map();\n  \n  async orchestrateWorkflow(config: WorkflowConfig): Promise<void> {\n    // Initialize agents\n    for (const agentConfig of config.agents) {\n      const agent = await this.createAgent(agentConfig);\n      this.agents.set(agent.id, agent);\n    }\n    \n    // Execute workflow steps\n    for (const step of config.steps) {\n      await this.executeStep(step);\n    }\n  }\n  \n  private async executeStep(step: WorkflowStep): Promise<void> {\n    const agent = this.agents.get(step.agentId);\n    if (!agent) throw new Error(`Agent not found: ${step.agentId}`);\n    \n    const result = await agent.execute(step.task);\n    return result;\n  }\n}\n",
      "language": "typescript",
      "relevance": 0.95,
      "reason": "RELATES_TO → contains",
      "distance": 1
    },
    {
      "path": "src/agents/Agent.ts",
      "content": "export interface Agent {\n  id: string;\n  name: string;\n  execute(task: Task): Promise<Result>;\n}\n\nexport class BaseAgent implements Agent {\n  constructor(\n    public id: string,\n    public name: string\n  ) {}\n  \n  async execute(task: Task): Promise<Result> {\n    // Base implementation\n    return { success: true };\n  }\n}\n",
      "language": "typescript",
      "relevance": 0.72,
      "reason": "IMPORTS → CONTAINS",
      "distance": 2
    },
    {
      "path": "src/orchestration/types.ts",
      "content": "export interface WorkflowConfig {\n  name: string;\n  agents: AgentConfig[];\n  steps: WorkflowStep[];\n}\n\nexport interface WorkflowStep {\n  id: string;\n  agentId: string;\n  task: Task;\n  dependencies: string[];\n}\n",
      "language": "typescript",
      "relevance": 0.68,
      "reason": "IMPORTS",
      "distance": 1
    }
  ],
  
  "related_functions": [
    {
      "name": "orchestrateWorkflow",
      "signature": "orchestrateWorkflow(config: WorkflowConfig): Promise<void>",
      "file_path": "src/orchestration/WorkflowManager.ts",
      "line_start": 45,
      "line_end": 78,
      "body": "async orchestrateWorkflow(config: WorkflowConfig): Promise<void> {\n  // Initialize agents\n  for (const agentConfig of config.agents) {\n    const agent = await this.createAgent(agentConfig);\n    this.agents.set(agent.id, agent);\n  }\n  \n  // Execute workflow steps\n  for (const step of config.steps) {\n    await this.executeStep(step);\n  }\n}",
      "docstring": "Orchestrates multi-agent workflow execution",
      "relevance": 0.95,
      "reason": "CONTAINS"
    },
    {
      "name": "executeStep",
      "signature": "executeStep(step: WorkflowStep): Promise<void>",
      "file_path": "src/orchestration/WorkflowManager.ts",
      "line_start": 80,
      "line_end": 90,
      "body": "private async executeStep(step: WorkflowStep): Promise<void> {\n  const agent = this.agents.get(step.agentId);\n  if (!agent) throw new Error(`Agent not found: ${step.agentId}`);\n  \n  const result = await agent.execute(step.task);\n  return result;\n}",
      "docstring": null,
      "relevance": 0.85,
      "reason": "CALLS → CONTAINS"
    },
    {
      "name": "createAgent",
      "signature": "createAgent(config: AgentConfig): Promise<Agent>",
      "file_path": "src/orchestration/WorkflowManager.ts",
      "line_start": 30,
      "line_end": 43,
      "body": "private async createAgent(config: AgentConfig): Promise<Agent> {\n  const agent = new BaseAgent(config.id, config.name);\n  // Configure agent\n  return agent;\n}",
      "docstring": "Creates and configures a new agent instance",
      "relevance": 0.78,
      "reason": "CALLS"
    }
  ],
  
  "related_concepts": [
    {
      "name": "orchestration",
      "description": "Multi-agent workflow coordination and execution",
      "keywords": ["workflow", "orchestration", "agent", "coordination", "multi-agent"],
      "relevance": 1.0
    },
    {
      "name": "agent-architecture",
      "description": "Agent-based system design patterns",
      "keywords": ["agent", "architecture", "design-pattern"],
      "relevance": 0.65
    }
  ],
  
  "execution_time_ms": 145
}
```

---

## 🚀 Implementation Checklist

### **PHASE 1: Core RAG (No Vector Embeddings) - CURRENT FOCUS**

#### 1.1: Docker Bind Mount Setup (Week 1)
- [ ] Update `docker compose.yml` with bind mount volumes
- [ ] Configure environment variables for watched folders
- [ ] Test polling performance (CPU usage, event latency)
- [ ] Configure chokidar with `usePolling: true`
- [ ] Document setup for team

#### 1.2: Neo4j Schema & Indexes (Week 1-2)
- [ ] Create node types (File, Function, Class, Concept)
- [ ] Create relationship types (CONTAINS, IMPORTS, CALLS, RELATES_TO)
- [ ] ✅ Set up full-text indexes (REQUIRED)
- [ ] ❌ Skip vector indexes (Phase 2)
- [ ] Create concept nodes for common terms
- [ ] Test index performance

#### 1.3: RAG Search Engine - Full-Text + Graph Only (Week 2-3)
- [ ] Implement `RAGSearchEngine` class with `enableVectorSearch = false`
- [ ] ✅ Implement full-text search strategy
- [ ] ✅ Implement graph traversal strategy
- [ ] ❌ Skip vector search (Phase 2)
- [ ] Implement result fusion (60% fulltext + 40% graph)
- [ ] Implement context enrichment
- [ ] Add caching for performance
- [ ] Test with real queries

#### 1.4: File Indexing Pipeline (Week 3-4)
- [ ] Implement file watcher with polling
- [ ] Implement file parser (TypeScript/JavaScript)
- [ ] Extract functions, classes, imports
- [ ] Generate concept relationships
- [ ] ❌ Skip embeddings (Phase 2)
- [ ] Batch indexing for existing files
- [ ] Incremental updates on file changes

#### 1.5: MCP Tool Integration (Week 4)
- [ ] Update `graph_search_nodes` tool
- [ ] Update `graph_get_node` tool
- [ ] Add RAG config environment variables
- [ ] Test end-to-end workflow
- [ ] Performance optimization
- [ ] Documentation and examples

---

### **PHASE 2: Add Vector Embeddings (Future - Optional Enhancement)**

**Prerequisites:** Phase 1 complete and working

#### 2.1: Embedding Service Integration
- [ ] Choose embedding model (OpenAI text-embedding-3-small recommended)
- [ ] Implement `generateEmbedding()` method
- [ ] Add environment variables for embedding API
- [ ] Test embedding generation speed

#### 2.2: Neo4j Vector Indexes
- [ ] Create vector indexes for File nodes
- [ ] Create vector indexes for Function nodes
- [ ] Test vector similarity queries
- [ ] Benchmark performance vs full-text

#### 2.3: Enable Vector Search
- [ ] Set `enableVectorSearch = true` in RAGSearchEngine
- [ ] Update result fusion (40% text + 30% vector + 30% graph)
- [ ] Re-index existing files with embeddings
- [ ] Test semantic search quality

#### 2.4: Performance Tuning
- [ ] Optimize embedding batch size
- [ ] Add embedding caching
- [ ] Compare quality with/without embeddings
- [ ] Document cost implications (API usage)

**Note:** This phase can be skipped entirely. Phase 1 provides excellent results using full-text + graph only.

---

## 📊 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| File Event Latency | 1-2s | Polling interval + detection |
| Search Latency | <200ms | Query to results (p95) |
| Indexing Speed | >100 files/s | Initial bulk indexing |
| Re-index Speed | <100ms | Single file update |
| Context Enrichment | <100ms | Adding related files to response |
| Memory Overhead | <1GB | For 100k indexed files |
| CPU Usage (Polling) | 2-5% | Per watched folder at 1s interval |
| CPU Usage (Idle) | <1% | No file changes |

**Scalability:** 100k+ indexed files, 10 watched folders

---

## �� Success Criteria

**Agent Experience:**
1. ✅ Single tool call (`graph_search_nodes`) returns comprehensive context
2. ✅ No manual file listing or traversal needed
3. ✅ Results explain relevance (why this file/function matters)
4. ✅ Response includes actual code, not just references
5. ✅ Follow-up queries use cached context (fast)

**Technical:**
1. ✅ Multi-strategy search (keyword + semantic + graph)
2. ✅ Sub-200ms query latency
3. ✅ Automatic updates on file changes (via polling)
4. ✅ Scales to 100k+ files
5. ✅ Bind mounts work reliably across platforms (Linux/macOS/Windows)

---

**Last Updated:** 2025-10-17  
**Version:** 2.0  
**Status:** Design Complete → Ready for Implementation
