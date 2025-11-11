# AI Agent Instructions for This Repository

This repository contains **Mimir** - a production-ready MCP (Model Context Protocol) server that provides **Graph-RAG TODO tracking** with **multi-agent orchestration capabilities**. The system combines hierarchical task management with associative memory networks, backed by Neo4j for persistent storage.

---

## 🚀 Quick Start

**✅ PRODUCTION READY** - The system is fully implemented and tested:

1. **Install & Build**: `npm install && npm run build`
2. **Start Neo4j**: `docker-compose up -d` (removes existing containers automatically)
3. **Use as MCP Server**: Connect via stdio transport
4. **Use as Global Commands**: Available as `mimir`, `mimir-chain`, `mimir-execute` (via npm link)

---

## 🎯 Current Implementation Status (v1.0.0)

### ✅ **COMPLETED** - Core Infrastructure

- **Neo4j Graph Database**: Persistent storage with full CRUD operations
- **MCP Server**: 13 tools (6 memory + 3 file indexing + 2 vector search + 2 todo management)
- **File Indexing**: Automatic file watching and indexing with .gitignore support
- **Multi-Agent Locking**: Optimistic locking for concurrent agent execution
- **Context Isolation**: Filtered context delivery per agent type (PM/Worker/QC)
- **LangChain 1.0.1 Migration**: Updated to latest LangChain with LangGraph
- **Global CLI Tools**: npm-linked binaries for system-wide usage
- **Docker Deployment**: Production-ready containerization

### ✅ **COMPLETED** - Advanced Multi-Agent Features (Phase 2)

- **Worker Agent Context Isolation**: 90%+ context reduction for focused execution
- **QC Agent Verification System**: Adversarial validation with feedback loops
- **Agent Performance Metrics**: Task completion tracking and scoring
- **Optimistic Locking**: Race condition prevention for concurrent agents

### 🔄 **IN PROGRESS** - Documentation & Migration Cleanup

- **Documentation Updates**: Aligning docs with current implementation
- **Migration Artifacts**: Cleaning up from old repository structure

---

## 📚 Architecture Overview

### Core Components

**1. Graph Database (Neo4j)**

- Persistent storage for nodes (TODOs, files, concepts) and relationships
- Full-text search with indexing
- **Vector embeddings**: Automatic semantic embeddings for ALL node types (1024 dimensions, nomic-embed-text model)
- Multi-hop graph traversal for associative memory
- Atomic transactions with ACID compliance

**2. MCP Tools (13 total)**

- **Memory Operations**: 6 consolidated tools (node, edge, batch, lock, clear, get_task_context)
- **File Indexing**: 3 tools for automatic file watching and indexing
- **Vector Search**: 2 tools for semantic search with embeddings
- **Todo Management**: 2 tools for todo and todo list operations

**3. Agent Orchestration**

- **PM Agent**: Research, planning, task breakdown with full context
- **Worker Agents**: Ephemeral execution with filtered context (90% reduction)
- **QC Agent**: Adversarial validation with requirement verification

**4. Context Management**

- **Memory Offloading**: Store rich context in graph nodes vs. conversation
- **Associative Recall**: Find related information through graph relationships
- **Context Filtering**: Agent-specific context delivery (PM/Worker/QC)

---

## 📚 Documentation Structure

### 🎯 Executive Documents (`docs/architecture/`)

- **[MULTI_AGENT_EXECUTIVE_SUMMARY.md](docs/architecture/MULTI_AGENT_EXECUTIVE_SUMMARY.md)** - **Strategic overview** for stakeholders

### 📖 User Guides (`docs/guides/`)

- **[MEMORY_GUIDE.md](docs/guides/MEMORY_GUIDE.md)** - **START HERE:** External memory system guide
- **[KNOWLEDGE_GRAPH_GUIDE.md](docs/guides/knowledge-graph.md)** - Associative memory networks guide
- **[TESTING_GUIDE.md](docs/testing/TESTING_GUIDE.md)** - Test suite guide
- **[DOCKER_DEPLOYMENT_GUIDE.md](docs/guides/DOCKER_DEPLOYMENT_GUIDE.md)** - Docker deployment

### 🏗️ Architecture (`docs/architecture/`)

- **[MULTI_AGENT_GRAPH_RAG.md](docs/architecture/MULTI_AGENT_GRAPH_RAG.md)** - Complete architecture spec (v3.1)
- **[MULTI_AGENT_ROADMAP.md](docs/architecture/MULTI_AGENT_ROADMAP.md)** - Implementation plan (Q4 2025-Q1 2026)
- **[AGENT_CHAINING.md](docs/architecture/AGENT_CHAINING.md)** - PM → Ecko → Worker flow
- **[PARALLEL_EXECUTION_SUMMARY.md](docs/PARALLEL_EXECUTION_SUMMARY.md)** - ⚡ **NEW:** Parallel task execution
- **[PROMPTING_SPECIALIST_ARCHITECTURE.md](docs/architecture/PROMPTING_SPECIALIST_ARCHITECTURE.md)** - Ecko agent design
- **[NEO4J_MIGRATION_PLAN.md](docs/architecture/NEO4J_MIGRATION_PLAN.md)** - Neo4j migration plan (in-memory → persistent)
- **[FILE_INDEXING_SYSTEM.md](docs/architecture/FILE_INDEXING_SYSTEM.md)** - Automatic file indexing & RAG enrichment
- **[PERSISTENCE.md](docs/architecture/PERSISTENCE.md)** - Memory persistence & decay
- **[VALIDATION_TOOL_DESIGN.md](docs/architecture/VALIDATION_TOOL_DESIGN.md)** - Agent validation system
- **[HTTP_TRANSPORT_REQUIREMENTS.md](docs/architecture/HTTP_TRANSPORT_REQUIREMENTS.md)** - HTTP transport layer
- **[DOCKER_VOLUME_STRATEGY.md](docs/architecture/DOCKER_VOLUME_STRATEGY.md)** - Docker volumes

### 🔬 Research (`docs/research/`)

- **[SWE_GREP_COMPARISON.md](docs/research/SWE_GREP_COMPARISON.md)** - Cognition AI SWE-grep analysis
- **[CONVERSATION_ANALYSIS.md](docs/research/CONVERSATION_ANALYSIS.md)** - Architecture validation
- **[GRAPH_RAG_RESEARCH.md](docs/research/GRAPH_RAG_RESEARCH.md)** - Foundational Graph-RAG research
- **[AASHARI_FRAMEWORK_ANALYSIS.md](docs/research/AASHARI_FRAMEWORK_ANALYSIS.md)** - External framework comparison
- **[EXTENSIVEMODE_BEASTMODE_ANALYSIS.md](docs/research/EXTENSIVEMODE_BEASTMODE_ANALYSIS.md)** - Agent benchmarking

### ⚙️ Configuration (`docs/configuration/`)

- **[CONFIGURATION.md](docs/configuration/CONFIGURATION.md)** - Setup for VSCode, Cursor, Claude Desktop

### 🤖 Agent Configurations (`docs/agents/`)

**Active v2 Preambles:**

- **[00-ecko-preamble.md](docs/agents/v2/00-ecko-preamble.md)** - Prompt architect (v2.0)
- **[01-pm-preamble.md](docs/agents/v2/01-pm-preamble.md)** - PM agent for planning (v2.0)
- **[02-agentinator-preamble.md](docs/agents/v2/02-agentinator-preamble.md)** - Agent preamble generator (v2.1)
- **[03-final-report-preamble.md](docs/agents/v2/03-final-report-preamble.md)** - Final report synthesizer (v2.0)
- **[worker-template.md](docs/agents/v2/templates/worker-template.md)** - Worker agent template
- **[qc-template.md](docs/agents/v2/templates/qc-template.md)** - QC agent template

**Quantized Model Optimizations (2-4B parameters):**

- **[claudette-quantized.md](docs/agents/claudette-quantized.md)** - ⚡ **NEW:** Optimized for Qwen-1.8B/7B-Int4, Phi-3-mini, Gemma 2B-7B (v1.0.0)

**Standard Preambles (7B+ models):**

- **[claudette-auto.md](docs/agents/claudette-auto.md)** - Autonomous execution mode (v5.2.1) - Use for 7B+ models
- **[claudette.md](docs/agents/claudette.md)** - Universal abstract version (domain-agnostic)
- **[claudette-condensed.md](docs/agents/claudette-condensed.md)** - Token-efficient version

**Legacy v1 (Archived):**

- **[claudette-pm.md](docs/agents/claudette-pm.md)** - Old PM agent (superseded by v2)
- **[claudette-ecko.md](docs/agents/claudette-ecko.md)** - Old Ecko (superseded by v2)
- **[claudette-agentinator.md](docs/agents/claudette-agentinator.md)** - Old Agentinator (superseded by v2)
- **[AGENTIC_PROMPTING_FRAMEWORK.md](docs/agents/AGENTIC_PROMPTING_FRAMEWORK.md)** - Core framework (v1.2)

### 📊 Benchmarks & Results (`docs/results/`)

- **[BEASTMODE_BENCHMARK_REPORT.md](docs/results/BEASTMODE_BENCHMARK_REPORT.md)** - BeastMode analysis
- **[CLAUDETTE_VS_BEASTMODE.md](docs/results/CLAUDETTE_VS_BEASTMODE.md)** - Comparison
- **[DOCKER_MIGRATION_PROMPTS.md](docs/results/DOCKER_MIGRATION_PROMPTS.md)** - Migration example

---

## 🔧 Available MCP Tools (13 Total)

**Memory Operations (6 consolidated tools):**

- `memory_node` - All node operations (add, get, update, delete, query, search)
  - **add**: Create nodes with type and properties
  - **get**: Retrieve node by ID with full context
  - **update**: Update node properties (merge operation)
  - **delete**: Delete node and cascade relationships
  - **query**: Filter nodes by type/properties
  - **search**: Full-text search across all nodes
  
- `memory_edge` - All edge/relationship operations (add, delete, get, neighbors, subgraph)
  - **add**: Create relationships between nodes
  - **delete**: Remove specific relationships
  - **get**: Get relationships connected to a node
  - **neighbors**: Find connected nodes (with depth traversal)
  - **subgraph**: Extract connected subgraph (multi-hop)
  
- `memory_batch` - Bulk operations (add_nodes, update_nodes, delete_nodes, add_edges, delete_edges)
  - **add_nodes**: Bulk create multiple nodes
  - **update_nodes**: Bulk update multiple nodes
  - **delete_nodes**: Bulk delete multiple nodes
  - **add_edges**: Bulk create multiple relationships
  - **delete_edges**: Bulk delete multiple relationships
  
- `memory_lock` - Multi-agent locking (acquire, release, query_available, cleanup)
  - **acquire**: Acquire exclusive lock on node (with timeout)
  - **release**: Release lock on node
  - **query_available**: Query unlocked nodes only
  - **cleanup**: Clean up expired locks
  
- `memory_clear` - Clear data from graph (by type or ALL)

- `get_task_context` - Get filtered context by agent type (PM/Worker/QC)

**File Indexing System (3 tools):**

- `index_folder` - Index files in a directory and automatically start watching for changes
- `remove_folder` - Stop watching a directory and remove indexed files from database
- `list_folders` - View active file watchers

**Vector Search (2 tools):**

- `vector_search_nodes` - Semantic search across ALL node types (todos, memories, files, concepts) using vector embeddings
- `get_embedding_stats` - Get statistics about nodes with embeddings, broken down by type

**Todo Management (2 tools):**

- `todo` - Individual todo operations (create, get, update, complete, delete, list)
- `todo_list` - Todo list operations (create, get, update, archive, delete, list, add_todo, remove_todo, get_stats)

---

## 🎯 Usage Patterns

## 🎯 Usage Patterns

### This System is Two Things:

**1. TODO Tracker** - Manage tasks, track progress, organize work hierarchically  
**2. Memory System** - Store context, recall on-demand, build associative knowledge networks

**Core Paradigm:** Your conversation is **working memory** (7±2 items, temporary). This MCP server is your **long-term memory** (unlimited, persistent, associative). Store TODO tasks with rich context, track them through completion, and build knowledge graphs of relationships.

### When to Use MCP Tools

**ALWAYS use for:**

- ✅ Multi-file projects (>3 files) → track tasks + store file context + semantic search across codebase
- ✅ Complex tasks with multiple phases → hierarchical TODO structure + memory network
- ✅ Long conversations (>50 messages) → prevent context overflow via TODO/memory offloading
- ✅ Team collaboration and handoffs → shared TODO list + knowledge base
- ✅ Any work requiring audit trails → timestamped TODO notes + provenance tracking
- ✅ Multi-agent orchestration scenarios → agent-scoped TODO assignment + context isolation
- ✅ Finding related information → semantic search to recall similar concepts, bugs, or solutions by meaning

### Standard Workflow (Single Agent)

**For TODO Tracking:**

1. **Create TODOs**: `memory_node(operation='add', type='todo', properties={...})` for tasks/phases with rich context
2. **Track Progress**: Update status (`pending` → `in_progress` → `completed`)
3. **Add Context**: Store file paths, errors, decisions in node properties
4. **Organize**: Use `memory_edge(operation='add', source='todo-1', target='project-1', type='part_of')`

**For Memory Management:**

1. **Store Context**: `memory_node(operation='add', properties={...})` to offload file paths, errors, decisions
2. **Reference by ID**: Use "Working on node-1-xxx" instead of repeating details in every message
3. **Recall On-Demand**: `memory_node(operation='get', id='node-1-xxx')` to retrieve stored context when actively working
4. **Search When Lost**: 
   - Text search: `memory_node(operation='search', query='keyword')` for exact matches
   - Semantic search: `vector_search_nodes(query='concept or question', limit=10)` for meaning-based retrieval
5. **Build Knowledge Graph**: Link related entities with `memory_edge(operation='add', ...)`

**For Semantic Search (Universal Embeddings):**

1. **Automatic Embeddings**: ALL nodes (todos, memories, files, concepts) get vector embeddings automatically
2. **Find Related Content**: Use `vector_search_nodes(query='your question or concept')` to find semantically similar nodes
3. **Cross-Type Search**: Search returns results across all node types ranked by similarity
4. **Example Use Cases**:
   - "Find all discussions about authentication" → returns todos, files, and memory nodes
   - "What do we know about API design?" → semantic retrieval across documentation and code
   - "Similar bugs or issues" → find related problems by meaning, not just keywords

**Combined Approach:** Store TODOs with rich context, track them to completion, link them to knowledge graph entities (files, concepts, dependencies), and use semantic search to recall relevant information by meaning

### Multi-Agent Orchestration (✅ IMPLEMENTED)

**🎯 Goal:** Agent-scoped context management with ephemeral workers and adversarial validation

**Architecture Pattern:**

```
PM Agent (Long-lived)          Worker Agents (Ephemeral)        QC Agent (Validator)
┌─────────────┐                ┌──────────┐                    ┌─────────────┐
│ Research    │                │ Task 1   │                    │ Verify      │
│ Planning    │ ──creates──→   │ (clean   │ ──output──→       │ Against     │
│ Task Graph  │                │ context) │                    │ Requirements│
└─────────────┘                └──────────┘                    └─────────────┘
                               ┌──────────┐                           │
                               │ Task 2   │                    ✅ Pass │ ❌ Fail
                               │ (clean   │                           ↓
                               │ context) │                    Generate
                               └──────────┘                    Correction
```

**PM Agent Workflow:**

1. **Research Phase**: Gather requirements with full context
2. **Task Breakdown**: Create `memory_node(operation='add', type='todo', properties={...})` for each subtask
3. **Dependency Mapping**: Link tasks with `memory_edge(operation='add', source='task-1', target='task-2', type='depends_on')`
4. **Context Handoff**: Store ALL necessary context in task node properties
5. **Sleep**: PM exits or monitors, doesn't execute tasks

**Worker Agent Workflow:**

1. **Claim Task**: Atomically lock task (prevents duplicate work)
   ```javascript
   memory_lock({
     operation: "acquire",
     node_id: "task-id",
     agent_id: "worker-1",
     timeout_ms: 300000,
   });
   ```
2. **Pull Filtered Context**: Use `get_task_context` for automatic 90%+ context reduction
   ```javascript
   get_task_context({ taskId: "task-id", agentType: "worker" });
   ```
   - Returns ONLY: title, requirements, description, workerRole, files (max 10), dependencies (max 5)
   - Strips 90%+ of PM research, planningNotes, alternatives, full subgraph
3. **Execute**: Complete task with focused context (zero prior conversation history)
4. **Store Output**: `memory_node(operation='update', id='task-id', properties={workerOutput, status: 'awaiting_qc'})`
5. **Release Lock**: `memory_lock(operation='release', node_id='task-id', agent_id='worker-1')`
6. **Terminate**: Worker exits immediately (context naturally pruned)

**QC Agent Workflow:**

1. **Pull QC Context**: Get requirements + worker output for verification
   ```javascript
   get_task_context({ taskId: "task-id", agentType: "qc" });
   memory_edge(operation='subgraph', node_id='task-id', depth=2); // For dependencies
   ```
   - QC context includes: requirements, workerOutput, verificationCriteria
   - No unnecessary PM research or worker implementation details
2. **Verify Requirements**: Compare output against verification criteria from graph
3. **Decision**:
   - ✅ **Pass**: `memory_node(operation='update', id='task-id', properties={qcVerification: {passed: true, score, feedback}, status: 'completed'})`
   - ❌ **Fail**: `memory_node(operation='update', id='task-id', properties={status: 'pending', attemptNumber: ++, errorContext: {qcFeedback, issues, requiredFixes}})`
4. **Feedback Loop**: Failed tasks go back to worker (if attemptNumber ≤ maxRetries) with errorContext

**Key Benefits:**

- 🧹 **Natural Context Pruning**: Worker termination = automatic cleanup
- 🎯 **Focused Execution**: Each worker has single-task context only
- 🔒 **Race Condition Prevention**: Optimistic locking prevents conflicts
- 🛡️ **Hallucination Prevention**: QC catches errors before graph storage
- 📊 **Audit Trail**: Complete task history in graph

**Concurrency Control (Critical):**

```javascript
// Optimistic Locking Pattern
const result = await memory_lock({
  operation: "acquire",
  node_id: "task-id",
  agent_id: "worker-1",
  timeout_ms: 300000, // 5 min auto-expiry
});

if (!result.locked) {
  // Another worker claimed task - retry with different task
}
```

### Anti-Patterns (Don't Do This)

**Single Agent:**
❌ Not tracking tasks with TODOs (losing sight of what's pending/in-progress/completed)  
❌ Repeating file lists in every message (store in TODO context once, recall by ID)  
❌ Restating error messages already stored in TODOs (memory duplication)  
❌ Asking user "what were we working on?" (check `memory_node(operation='query', type='todo', filters={status: 'in_progress'})` first)  
❌ Abandoning TODO tracker after 20+ messages (exactly when task tracking is most valuable!)  
❌ Not using graph relationships for complex projects (flat lists instead of hierarchical structure)

**Multi-Agent:**
❌ Workers accessing PM's full research context (context bloat)  
❌ No locking mechanism (race conditions)  
❌ Storing unverified worker output (hallucination propagation)  
❌ QC agent without subgraph access (can't verify requirements)  
❌ Workers retrying with different context (breaks correction loop)

---

## Quick Checklist for Agents

Before starting work:

- [ ] Verify MCP server is built (`npm run build`)
- [ ] Understand context offloading workflow (see above)
- [ ] Know when to use TODOs vs. knowledge graph
- [ ] Set up periodic refresh (every 15 messages: check active todos)

---

## 🚨 Critical Reminders

### Context Drift Prevention

**Every 15 messages, you MUST:**

1. Call `memory_node(operation='query', type='todo', filters={status: 'in_progress'})` to sync
2. Review progress on current TODO
3. Update TODO status if completed
4. Add progress notes via `memory_node(operation='update', ...)`

### After Context Summarization

**IMMEDIATELY:**

1. Call `memory_node(operation='query', type='todo', filters={status: 'in_progress'})`
2. Call `memory_node(operation='get', id='...')` for each active TODO
3. Use `memory_node(operation='search', query='keyword')` if details are missing
4. **NEVER** ask user "what were we working on?"

---

## 💡 Pro Tips

1. **Store, don't repeat**: 90% context reduction by using MCP tools
2. **Query on-demand**: Only retrieve context when actively working on it
3. **Use the graph**: Model relationships instead of flat lists
4. **Search when lost**: `memory_node(operation='search', ...)` is your recovery tool
5. **Periodic refresh**: Don't abandon tools over time

---

**Last Updated:** 2025-10-18  
**Version:** 1.0.0  
**Maintainer:** Mimir Development Team

---

_This file is automatically discovered by GitHub Copilot and other AI agents when working in this repository._
