# External Memory System for AI Agents

**Version:** 3.0  
**Purpose:** Guide AI agents to use this MCP server as their external memory system

---

## 🧠 What is This?

This MCP server functions as **your external memory**—think of it as RAM and disk storage for AI agents. Instead of keeping all context in your conversation window (which fills up and degrades), you offload information here and recall it on-demand.

**Core Principle:** Your conversation context is **working memory** (limited, temporary). This system is your **long-term memory** (persistent, queryable, associative).

---

## 💡 Memory Paradigm

### How Human Memory Works

```
Working Memory (Conversation)     Long-Term Memory (This System)
┌─────────────────────┐          ┌────────────────────────┐
│ Current task        │ ←──────→ │ Projects               │
│ Active decisions    │  Store   │ Past decisions         │
│ Immediate context   │  Recall  │ File locations         │
│                     │          │ Error solutions        │
│ ~7±2 items          │          │ Relationship networks  │
│ Decays quickly      │          │ Unlimited capacity     │
└─────────────────────┘          └────────────────────────┘
```

### How to Use This System

**Store:** Offload context to external memory  
**Recall:** Retrieve specific memories when needed  
**Associate:** Link memories to build knowledge networks  
**Search:** Find memories by content, not just ID

---

## 📦 Memory Types

### 1. Structured Memories (TODOs)

**What:** Tasks, decisions, progress, errors  
**When:** You have sequential work or need status tracking  
**Tools:** `create_todo`, `get_todo`, `list_todos`, `update_todo`

**Example:**
```typescript
// Store a memory
const memory = await create_todo({
  title: "Implement authentication system",
  description: "JWT-based auth with refresh tokens",
  context: {
    files: ["src/auth/jwt.ts", "src/middleware/auth.ts"],
    decision: "Using bcrypt for password hashing",
    errorEncountered: "Token expiry issue - fixed by adding clockTolerance",
    dependencies: ["jsonwebtoken", "bcrypt"]
  },
  status: "in_progress"
});

// Recall the memory later
const recalled = await get_todo({ id: memory.id });
```

### 2. Associative Memories (Knowledge Graph)

**What:** Entities and their relationships (files, concepts, people, projects)  
**When:** You need to model how information connects  
**Tools:** `memory_add_node`, `memory_add_edge`, `memory_get_neighbors`, `memory_get_subgraph`

**Example:**
```typescript
// Store entities
const authConcept = await memory_add_node({
  type: "concept",
  label: "Authentication System",
  properties: {
    description: "JWT-based authentication",
    security_level: "high"
  }
});

const jwtFile = await memory_add_node({
  type: "file",
  label: "src/auth/jwt.ts",
  properties: {
    purpose: "JWT token generation and validation",
    lastModified: "2025-10-13"
  }
});

// Link them (associative memory)
await memory_add_edge({
  source: authConcept.id,
  target: jwtFile.id,
  type: "contains"
});

// Recall by association
const relatedFiles = await memory_get_neighbors({
  nodeId: authConcept.id,
  direction: "out",
  edgeType: "contains"
});
```

### 3. Hybrid Memories (TODO + Graph)

**What:** Structured task with explicit relationships  
**When:** You want both task tracking AND relationship modeling  
**Tools:** `create_todo_with_graph`, `memory_get_subgraph`

**Example:**
```typescript
// Store structured memory with connections
await create_todo_with_graph({
  title: "Implement user registration endpoint",
  context: {
    endpoint: "/api/auth/register",
    method: "POST"
  },
  graphNode: {
    type: "task"
  },
  edges: [
    { target: authConcept.id, type: "related_to" },
    { target: jwtFile.id, type: "references" }
  ]
});
```

---

## 🎯 Common Memory Operations

### Storing Memories

**1. Store a single memory:**
```typescript
await create_todo({
  title: "Memory title",
  context: { /* all relevant details */ }
});
```

**2. Store multiple related memories:**
```typescript
await batch_create_todos({
  todos: [
    { title: "Task 1", context: {...} },
    { title: "Task 2", context: {...} },
    { title: "Task 3", context: {...} }
  ]
});
```

**3. Add to existing memory:**
```typescript
await update_todo_context({
  id: "memory-id",
  context: {
    newFinding: "Discovered that X causes Y",
    solution: "Fixed by doing Z"
  }
});
```

**4. Add timestamped observation:**
```typescript
await add_todo_note({
  id: "memory-id",
  note: "User reported issue with token refresh"
});
```

### Recalling Memories

**1. Recall specific memory by ID:**
```typescript
const memory = await get_todo({ id: "memory-id" });
```

**2. List memories by criteria:**
```typescript
// Find all in-progress work
const active = await list_todos({ status: "in_progress" });

// Find high-priority memories
const urgent = await list_todos({ priority: "high" });

// Find memories by tag
const authWork = await list_todos({ tags: ["authentication"] });
```

**3. Search memories by content:**
```typescript
// Simple search
const results = await memory_search_nodes({
  searchTerm: "authentication"
});

// Search with ranking (best matches first)
const ranked = await memory_search_nodes_ranked({
  searchTerm: "jwt token error"
});
```

**4. Recall by association:**
```typescript
// What's connected to this memory?
const related = await memory_get_neighbors({
  nodeId: "memory-id"
});

// Get entire memory cluster
const cluster = await memory_get_subgraph({
  startNodeId: "memory-id",
  depth: 2
});
```

### Organizing Memories

**1. Link memories:**
```typescript
await memory_add_edge({
  source: "task-id",
  target: "concept-id",
  type: "related_to"
});
```

**2. Update memory status:**
```typescript
await update_todo({
  id: "memory-id",
  status: "completed"
});
```

**3. Prune obsolete memories:**
```typescript
await delete_todo({ id: "memory-id" });
```

---

## 🎓 Memory Strategies

### Strategy 1: Working Memory Offload

**Problem:** Your context window fills up with details  
**Solution:** Offload details to memory, keep only IDs

```typescript
// ❌ Bad: Keeping everything in conversation
"I'm working on authentication. The files are src/auth/jwt.ts, 
src/middleware/auth.ts, and src/models/user.ts. The JWT secret 
is in .env. We're using bcrypt for hashing. The token expiry 
is 1 hour. Refresh tokens last 7 days..."

// ✅ Good: Offload to memory
const authMemory = await create_todo({
  title: "Authentication implementation",
  context: {
    files: ["src/auth/jwt.ts", "src/middleware/auth.ts", "src/models/user.ts"],
    config: { jwtSecret: ".env", tokenExpiry: "1h", refreshExpiry: "7d" },
    libraries: ["jsonwebtoken", "bcrypt"]
  }
});

// Now just reference the ID
"Working on auth-memory-123. Let me recall the details..."
const details = await get_todo({ id: authMemory.id });
```

### Strategy 2: Associative Recall

**Problem:** You need to find related information  
**Solution:** Use graph relationships for associative memory

```typescript
// Store with relationships
const projectNode = await memory_add_node({
  type: "project",
  label: "E-commerce Platform"
});

const authPhase = await memory_add_node({
  type: "phase",
  label: "Authentication Phase"
});

await memory_add_edge({
  source: projectNode.id,
  target: authPhase.id,
  type: "contains"
});

// Later: "What was the auth work part of?"
const parentProject = await memory_get_neighbors({
  nodeId: authPhase.id,
  direction: "in",
  edgeType: "contains"
});
```

### Strategy 3: Incremental Memory Building

**Problem:** Information comes in pieces over time  
**Solution:** Use `update_todo_context` to append

```typescript
// Initial memory
const taskMemory = await create_todo({
  title: "Fix login bug",
  context: { issue: "Users can't log in" }
});

// Add findings incrementally
await update_todo_context({
  id: taskMemory.id,
  context: {
    root_cause: "Token validation failing",
    affected_users: 50
  }
});

// Add solution
await update_todo_context({
  id: taskMemory.id,
  context: {
    solution: "Added clockTolerance to jwt.verify()",
    fixed_at: "2025-10-13T14:30:00Z"
  }
});
```

### Strategy 4: Memory Hierarchies

**Problem:** Large projects need organization  
**Solution:** Parent-child memory structures

```typescript
// Top-level memory
const project = await create_todo({
  title: "Build E-commerce Platform"
});

// Phase memories (children)
const authPhase = await create_todo({
  title: "Authentication Phase",
  parentId: project.id
});

const checkoutPhase = await create_todo({
  title: "Checkout Phase",
  parentId: project.id
});

// Task memories (grandchildren)
await create_todo({
  title: "Implement JWT",
  parentId: authPhase.id
});

// Recall hierarchy
const allPhases = await list_todos({
  parentId: project.id
});
```

### Strategy 5: Context Recovery After Interruption

**Problem:** Conversation ends, you need to resume  
**Solution:** Search and recall stored memories

```typescript
// When resuming: "What was I working on?"
const inProgress = await list_todos({ status: "in_progress" });

// "What was the auth project about?"
const authMemories = await memory_search_nodes_ranked({
  searchTerm: "authentication"
});

// Get full context
const context = await memory_get_subgraph({
  startNodeId: authMemories[0].id,
  depth: 2,
  linearize: true // Get human-readable description
});
```

---

## 🚨 Anti-Patterns (Don't Do This)

### ❌ Repeating Instead of Recalling

**Bad:**
```typescript
// Repeating file list every message
"I'm working on src/auth/jwt.ts, src/middleware/auth.ts..."
"Still working on src/auth/jwt.ts, src/middleware/auth.ts..."
"Update: src/auth/jwt.ts, src/middleware/auth.ts..."
```

**Good:**
```typescript
// Store once, reference by ID
const files = await create_todo({
  title: "Auth files",
  context: { files: ["src/auth/jwt.ts", "src/middleware/auth.ts"] }
});

"Working on files from memory-id-123"
```

### ❌ Not Using Memory Before Asking User

**Bad:**
```typescript
// After interruption
"What were we working on?"
```

**Good:**
```typescript
// Check memory first
const recent = await list_todos({
  status: "in_progress"
});

if (recent.length > 0) {
  const details = await get_todo({ id: recent[0].id });
  "Resuming work on: " + details.title;
} else {
  "No in-progress work found. What would you like to work on?"
}
```

### ❌ Storing Everything in One Giant Memory

**Bad:**
```typescript
await create_todo({
  title: "Everything",
  context: {
    file1: "...", file2: "...", file3: "...",
    error1: "...", error2: "...", solution1: "...",
    decision1: "...", decision2: "...", decision3: "..."
  }
});
```

**Good:**
```typescript
// Separate memories
await batch_create_todos({
  todos: [
    { title: "Files tracked", context: { files: [...] } },
    { title: "Errors encountered", context: { errors: [...] } },
    { title: "Decisions made", context: { decisions: [...] } }
  ]
});
```

### ❌ Not Linking Related Memories

**Bad:**
```typescript
// Unconnected memories
await create_todo({ title: "Auth task" });
await memory_add_node({ type: "file", properties: { title: "jwt.ts" });
// No relationship = can't find by association
```

**Good:**
```typescript
// Connected memories
const task = await create_todo({ title: "Auth task", addToGraph: true });
const file = await memory_add_node({ type: "file", properties: { title: "jwt.ts" });
await memory_add_edge({
  source: task.id,
  target: file.id,
  type: "references"
});
```

---

## 📊 Memory System Health

### Check Memory Usage

```typescript
// See what's stored
const stats = await memory_get_stats();

console.log(`Memories stored: ${stats.nodeCount}`);
console.log(`Connections: ${stats.edgeCount}`);
console.log(`Memory types: ${JSON.stringify(stats.nodeTypeBreakdown)}`);
```

### Memory Overview

```typescript
// Compact export (60-80% token reduction)
const overview = await memory_export_compact({
  includeEdges: true,
  nodeTypes: ["task", "concept"]
});
```

### Verify Offloading Success

**Good indicators:**
- Message token count stays stable over time
- You reference memory IDs instead of repeating details
- You use `get_todo` and `memory_search_nodes` regularly
- Stats show growing memory graph

**Bad indicators:**
- Repeating same file paths/errors in every message
- Context window filling up
- Forgetting what you stored
- Asking user "what were we working on?"

---

## 🎯 Quick Reference

| Operation | Tool | Example |
|-----------|------|---------|
| Store memory | `create_todo` | Store task with context |
| Recall memory | `get_todo` | Retrieve by ID |
| List memories | `list_todos` | Filter by status/priority |
| Search memories | `memory_search_nodes_ranked` | Find by keyword |
| Link memories | `memory_add_edge` | Build associations |
| Get related | `memory_get_neighbors` | Associative recall |
| Get cluster | `memory_get_subgraph` | Memory neighborhood |
| Append to memory | `update_todo_context` | Incremental updates |
| Bulk store | `batch_create_todos` | Many memories at once |
| Memory stats | `memory_get_stats` | System health |

---

## 🚀 Advanced: Multi-Agent Memory (v3.0+)

**Coming soon:** PM/Worker/QC architecture where:
- **PM Agent:** Research memory (long-lived, full context)
- **Worker Agents:** Task memory (ephemeral, focused context)
- **QC Agent:** Verification memory (short-lived, subgraph access)

See [Multi-Agent Architecture](./research/MULTI_AGENT_GRAPH_RAG.md) for details.

---

## 📚 Related Documentation

- **[AGENTS.md](./AGENTS.md)** - Workflow patterns and best practices
- **[TODO_QUICK_REF.md](./TODO_QUICK_REF.md)** - TODO tools reference
- **[GRAPH_QUICK.md](./GRAPH_QUICK.md)** - Knowledge graph tools reference
- **[GRAPH_GUIDE.md](./GRAPH_GUIDE.md)** - Comprehensive graph guide

---

**Remember:** This isn't just a TODO manager—it's your **external memory system**. Use it like you'd use your own memory: store what you might need later, recall when needed, link related concepts, search when you forget where something is.

**Key Principle:** Don't repeat yourself—offload to memory and recall on-demand.
