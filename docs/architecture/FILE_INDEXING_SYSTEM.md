# File Indexing & Watching System for RAG

**Date:** 2025-10-17  
**Status:** Design Phase  
**Version:** 1.0  
**Related:** [NEO4J_MIGRATION_PLAN.md](NEO4J_MIGRATION_PLAN.md)

---

## 📋 Executive Summary

**Goal:** Automatic file indexing and watching system that continuously monitors codebases, indexes content into Neo4j, and automatically enriches RAG retrievals with related file content.

**Key Features:**
- ✅ **Manual Indexing**: MCP tool to manually trigger folder indexing
- ✅ **Auto-Watch**: Persistent folder watching across server restarts
- ✅ **Gitignore Respect**: Honor `.gitignore` patterns automatically
- ✅ **RAG Integration**: Auto-include related files in TODO/node retrievals
- ✅ **Docker-Persistent Config**: Flat file list stored in Docker volume
- ✅ **Real-time Updates**: File watcher triggers re-indexing on changes

---

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    File Indexing System                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │ MCP Tools        │    │ Watch Manager    │                  │
│  │                  │    │                  │                  │
│  │ • index_folder   │───▶│ • Add/Remove     │                  │
│  │   (auto-watch)   │    │ • List active    │                  │
│  │ • remove_folder  │    │ • Load config    │                  │
│  │ • list_watched_  │    │ • Save config    │                  │
│  │   folders        │    │                  │                  │
│  └──────────────────┘    └────────┬─────────┘                  │
│                                   │                             │
│                                   ▼                             │
│  ┌─────────────────────────────────────────────┐                │
│  │ File Watcher (chokidar)                     │                │
│  │                                             │                │
│  │ • Monitor file changes                      │                │
│  │ • Respect .gitignore                        │                │
│  │ • Debounce events (500ms)                   │                │
│  │ • Queue processing                          │                │
│  └──────────────────┬──────────────────────────┘                │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────┐                │
│  │ File Indexer                                │                │
│  │                                             │                │
│  │ • Parse files (AST analysis)                │                │
│  │ • Extract metadata                          │                │
│  │ • Generate embeddings (optional)            │                │
│  │ • Create Neo4j nodes                        │                │
│  └──────────────────┬──────────────────────────┘                │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────┐                │
│  │ Neo4j Graph Database                        │                │
│  │                                             │                │
│  │ • File nodes                                │                │
│  │ • Function/Class nodes                      │                │
│  │ • Relationships (CONTAINS, IMPORTS)         │                │
│  │ • Full-text indexes                         │                │
│  │ • Vector indexes                            │                │
│  └─────────────────────────────────────────────┘                │
│                                                                 │
│  ┌─────────────────────────────────────────────┐                │
│  │ Persistent Config (./data/watch-config.json)│                │
│  │                                             │                │
│  │ {                                           │                │
│  │   "folders": [                              │                │
│  │     "/workspace/project-a",                 │                │
│  │     "/workspace/project-b"                  │                │
│  │   ]                                         │                │
│  │ }                                           │                │
│  └─────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User/Agent Call                     System Processing
┌────────────┐                      ┌──────────────────┐
│ index_     │                      │ 1. Read folder   │
│ folder()   │─────────────────────▶│ 2. Apply .ignore │
└────────────┘                      │ 3. Parse files   │
                                    │ 4. Index to Neo4j│
                                    │ 5. Start watcher │
                                    │ 6. Save to config│
                                    └──────────────────┘
                                              │
                                              ▼
┌────────────┐                      ┌──────────────────┐
│ remove_    │                      │ 1. Stop watcher  │
│ folder()   │─────────────────────▶│ 2. Remove config │
└────────────┘                      │ 3. Monitor events│
                                    └──────────────────┘
                                              │
                                              ▼
┌──────────────────┐                 ┌──────────────────┐
│ memory_get_node() │                │ 1. Fetch node    │
│                  │────────────────▶│ 2. Find related  │
└──────────────────┘                │    files (graph) │
                                    │ 3. Enrich payload│
                                    └──────────────────┘
```

---

## 🛠️ MCP Tool Definitions

### Tool 1: `index_folder`

**Purpose:** Manually trigger indexing of a folder (must be watched first)

**⚠️ VALIDATION REQUIRED:**
1. Path must exist on filesystem
2. Path must be in watch list (call `watch_folder` first)

```typescript
{
  name: "index_folder",
  description: "Index all files in a folder. REQUIRES: Path must exist and be in watch list (use watch_folder first).",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute path to folder to index (must already be watched)"
      },
      recursive: {
        type: "boolean",
        description: "Recursively index subdirectories (default: true)",
        default: true
      },
      file_patterns: {
        type: "array",
        items: { type: "string" },
        description: "Optional glob patterns to filter files (e.g., ['*.ts', '*.js'])",
        default: null
      },
      generate_embeddings: {
        type: "boolean",
        description: "Generate vector embeddings (Phase 2, default: false)",
        default: false
      }
    },
    required: ["path"]
  }
}
```

**Success Response:**
```json
{
  "status": "success",
  "indexed": {
    "files": 147,
    "functions": 423,
    "classes": 89,
    "total_lines": 15234
  },
  "duration_ms": 4523,
  "folder": "/workspace/my-project"
}
```

**Error Response (Not Watched):**
```json
{
  "status": "error",
  "error": "folder_not_watched",
  "message": "Path '/workspace/my-project' is not in watch list. Call watch_folder first.",
  "path": "/workspace/my-project",
  "hint": "Use watch_folder tool to add this path to the watch list"
}
```

**Error Response (Path Not Found):**
```json
{
  "status": "error",
  "error": "path_not_found",
  "message": "Path '/workspace/nonexistent' does not exist on filesystem.",
  "path": "/workspace/nonexistent"
}
```

### Tool 2: `watch_folder`

**Purpose:** Start watching a folder for changes and persist to config

```typescript
{
  name: "watch_folder",
  description: "Start watching a folder for file changes and automatically re-index on updates. Watch persists across server restarts.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute or relative path to the folder to watch"
      },
      recursive: {
        type: "boolean",
        description: "Watch subdirectories recursively (default: true)",
        default: true
      },
      debounce_ms: {
        type: "number",
        description: "Debounce delay for file change events (default: 500ms)",
        default: 500
      },
      generate_embeddings: {
        type: "boolean",
        description: "Generate embeddings on file changes (default: false)",
        default: false
      }
    },
    required: ["path"]
  }
}
```

**Response:**
```json
{
  "status": "success",
  "watch_id": "watch-1-1234567890",
  "folder": "/workspace/my-project",
  "files_watched": 147,
  "persisted": true,
  "message": "Watching folder. Will re-index on file changes."
}
```

### Tool 3: `unwatch_folder`

**Purpose:** Stop watching a folder and remove from persistent config

```typescript
{
  name: "unwatch_folder",
  description: "Stop watching a folder and remove from persistent configuration",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the folder to stop watching"
      }
    },
    required: ["path"]
  }
}
```

**Response:**
```json
{
  "status": "success",
  "folder": "/workspace/my-project",
  "removed": true,
  "message": "Folder watch removed and config updated"
}
```

### Tool 4: `list_folders`

**Purpose:** List all currently watched folders

```typescript
{
  name: "list_folders",
  description: "List all folders currently being watched for file changes",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

**Response:**
```json
{
  "watches": [
    {
      "watch_id": "watch-1-1234567890",
      "folder": "/workspace/my-project",
      "recursive": true,
      "files_indexed": 147,
      "last_update": "2025-10-17T10:30:00Z",
      "active": true
    },
    {
      "watch_id": "watch-2-1234567891",
      "folder": "/workspace/shared-lib",
      "recursive": true,
      "files_indexed": 89,
      "last_update": "2025-10-17T09:15:00Z",
      "active": true
    }
  ],
  "total": 2
}
```

---

## 💾 Persistent Configuration Storage

### Neo4j-Based Configuration (Not JSON Files)

**Design Decision:** Store watch configurations in Neo4j, not flat files.

**Benefits:**
- ✅ Single source of truth (Neo4j volume)
- ✅ Transactional updates (atomic operations)
- ✅ Query alongside indexed data
- ✅ Automatic persistence (Neo4j handles durability)
- ✅ Can relate watches to indexed files via graph edges

**Neo4j Schema:**

```cypher
// WatchConfig node type
CREATE (w:WatchConfig {
  id: 'watch-1-1234567890',
  path: '/workspace/my-project',
  recursive: true,
  debounce_ms: 500,
  generate_embeddings: false,
  added_date: '2025-10-17T10:30:00Z',
  last_indexed: '2025-10-17T10:35:00Z',
  file_patterns: ['*.ts', '*.js', '*.py'],
  ignore_patterns: ['node_modules/', 'dist/'],
  status: 'active',
  files_indexed: 147,
  last_updated: '2025-10-17T11:00:00Z'
});

```

**Startup Process (Loading Watch Configs from Neo4j):**

```typescript
// src/index.ts - MCP Server Initialization
import neo4j, { Driver } from 'neo4j-driver';
import { FileWatchManager } from './managers/FileWatchManager.js';

async function initializeFileWatchers(
  neo4jDriver: Driver,
  watchManager: FileWatchManager
): Promise<void> {
  console.log('🔄 Loading watch configurations from Neo4j...');
  
  const session = neo4jDriver.session();
  
  try {
    // Query Neo4j for all active watch configurations
    const result = await session.run(`
      MATCH (w:WatchConfig)
      WHERE w.status = 'active'
      RETURN 
        w.id AS id,
        w.path AS path,
        w.recursive AS recursive,
        w.debounce_ms AS debounce_ms,
        w.file_patterns AS file_patterns,
        w.ignore_patterns AS ignore_patterns,
        w.generate_embeddings AS generate_embeddings
      ORDER BY w.added_date ASC
    `);
    
    console.log(`Found ${result.records.length} active watch configurations`);
    
    // Restore each watcher
    for (const record of result.records) {
      const config = {
        id: record.get('id'),
        path: record.get('path'),
        recursive: record.get('recursive'),
        debounce_ms: record.get('debounce_ms'),
        file_patterns: record.get('file_patterns') || null,
        ignore_patterns: record.get('ignore_patterns') || [],
        generate_embeddings: record.get('generate_embeddings') || false
      };
      
      // Validate path exists before starting watcher
      try {
        const pathExists = await fs.access(config.path).then(() => true).catch(() => false);
        
        if (pathExists) {
          await watchManager.startWatch(config);
          console.log(`✅ Restored watcher: ${config.path}`);
        } else {
          console.warn(`⚠️  Path no longer exists: ${config.path}`);
          
          // Mark watch as inactive in Neo4j
          await session.run(`
            MATCH (w:WatchConfig {id: $id})
            SET 
              w.status = 'inactive',
              w.error = 'path_not_found',
              w.last_updated = datetime()
          `, { id: config.id });
        }
      } catch (error) {
        console.error(`❌ Failed to restore watcher: ${config.path}`, error);
      }
    }
    
    console.log('✅ File watcher initialization complete');
    
  } finally {
    await session.close();
  }
}

// Main server startup
async function main() {
  // Initialize Neo4j driver
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );
  
  // Initialize file watch manager
  const watchManager = new FileWatchManager(driver);
  
  // Restore watchers from Neo4j
  await initializeFileWatchers(driver, watchManager);
  
  // Start MCP server
  // ... rest of server initialization
}

main().catch(console.error);
```

**Query Operations:**

```cypher
// List all watched folders
MATCH (w:WatchConfig)
WHERE w.status = 'active'
RETURN w.id, w.path, w.files_indexed, w.last_indexed
ORDER BY w.added_date DESC;

// Check if path is watched
MATCH (w:WatchConfig {path: $path, status: 'active'})
RETURN w;

// Add new watch
CREATE (w:WatchConfig {
  id: $id,
  path: $path,
  status: 'active',
  added_date: datetime(),
  ...
});

// Remove watch
MATCH (w:WatchConfig {path: $path})
SET w.status = 'inactive', w.removed_date = datetime();
```

**Validation Implementation:**

```typescript
async function validateIndexRequest(path: string): Promise<ValidationResult> {
  // 1. Check filesystem
  if (!await fs.exists(path)) {
    return {
      valid: false,
      error: 'path_not_found',
      message: `Path '${path}' does not exist on filesystem.`
    };
  }
  
  // 2. Check if watched
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (w:WatchConfig {path: $path, status: 'active'})
      RETURN w
    `, { path });
    
    if (result.records.length === 0) {
      return {
        valid: false,
        error: 'folder_not_watched',
        message: `Path '${path}' is not in watch list. Call watch_folder first.`
      };
    }
    
    return { valid: true };
  } finally {
    await session.close();
  }
}
```

---

## 🔍 Gitignore Handling

### Implementation Strategy

Use `ignore` npm package for robust `.gitignore` parsing:

```typescript
import ignore from 'ignore';
import fs from 'fs/promises';
import path from 'path';

class GitignoreHandler {
  private ig: ReturnType<typeof ignore>;

  async loadIgnoreFile(folderPath: string): Promise<void> {
    this.ig = ignore();
    
    // Load .gitignore if exists
    const gitignorePath = path.join(folderPath, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      this.ig.add(content);
    } catch {
      // No .gitignore, use defaults
    }
    
    // Always ignore common patterns
    this.ig.add([
      'node_modules/',
      '.git/',
      'dist/',
      'build/',
      '*.log',
      '.env',
      '.DS_Store'
    ]);
  }

  shouldIgnore(filePath: string, rootPath: string): boolean {
    const relativePath = path.relative(rootPath, filePath);
    return this.ig.ignores(relativePath);
  }
}
```

---

## 🔄 RAG Integration: Auto-Enrichment

### Enhanced Retrieval Pattern

When a node is fetched, automatically include related file content:

```typescript
// Original: memory_get_node returns just the node
{
  "id": "node-todo-123",
  "type": "todo",
  "title": "Fix authentication bug",
  "description": "Users can't log in",
  "context": {
    "file": "src/auth/login.ts",
    "line": 42
  }
}

// Enhanced: memory_get_node with RAG enrichment
{
  "id": "node-todo-123",
  "type": "todo",
  "title": "Fix authentication bug",
  "description": "Users can't log in",
  "context": {
    "file": "src/auth/login.ts",
    "line": 42
  },
  "related_files": [
    {
      "path": "src/auth/login.ts",
      "content": "export async function login(username, password) {\n  // ... full file content ...\n}",
      "language": "typescript",
      "relevance_score": 1.0,
      "reason": "directly_referenced"
    },
    {
      "path": "src/auth/session.ts",
      "content": "export class SessionManager {\n  // ... full file content ...\n}",
      "language": "typescript",
      "relevance_score": 0.85,
      "reason": "imported_by_login"
    },
    {
      "path": "src/models/user.ts",
      "content": "export interface User {\n  // ... full file content ...\n}",
      "language": "typescript",
      "relevance_score": 0.75,
      "reason": "used_by_login"
    }
  ],
  "related_functions": [
    {
      "name": "validatePassword",
      "signature": "validatePassword(password: string): boolean",
      "file": "src/auth/login.ts",
      "line_start": 10,
      "line_end": 25,
      "body": "function validatePassword(password: string): boolean {\n  // ...\n}"
    }
  ]
}
```

### Implementation

```typescript
async enrichWithRelatedFiles(
  nodeId: string,
  maxFiles: number = 5,
  maxDepth: number = 2
): Promise<RelatedFile[]> {
  const session = this.neo4jDriver.session();
  
  try {
    // Cypher query to find related files via graph relationships
    const result = await session.run(`
      MATCH (start {id: $nodeId})
      OPTIONAL MATCH path = (start)-[r:REFERENCES|CONTAINS|IMPORTS*1..${maxDepth}]-(file:File)
      WITH file, 
           LENGTH(path) AS distance,
           CASE 
             WHEN (start)-[:REFERENCES]->(file) THEN 'directly_referenced'
             WHEN (start)<-[:CONTAINS]-(file) THEN 'contains_node'
             WHEN (start)-[:IMPORTS]->(file) THEN 'imported_by'
             ELSE 'related'
           END AS reason
      WHERE file IS NOT NULL
      RETURN file, 
             (1.0 / (distance + 1)) AS relevance_score,
             reason
      ORDER BY relevance_score DESC
      LIMIT $maxFiles
    `, { nodeId, maxFiles });
    
    return result.records.map(r => ({
      path: r.get('file').properties.path,
      content: r.get('file').properties.content,
      language: r.get('file').properties.language,
      relevance_score: r.get('relevance_score'),
      reason: r.get('reason')
    }));
  } finally {
    await session.close();
  }
}
```

---

## 📁 File Parsing & Indexing

### Supported Languages

| Language | Parser | Extracts |
|----------|--------|----------|
| TypeScript/JavaScript | `@typescript-eslint/parser` | Functions, classes, imports, exports |
| Python | `python-ast-parser` | Functions, classes, imports, decorators |
| Java | `java-parser` | Classes, methods, packages |
| Go | `go-ast-parser` | Functions, structs, packages |
| Generic | Line-based | File content only |

### Indexing Pipeline

```typescript
class FileIndexer {
  async indexFile(filePath: string, rootPath: string): Promise<IndexResult> {
    // 1. Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(rootPath, filePath);
    const language = this.detectLanguage(filePath);
    
    // 2. Create File node
    const fileNode = await this.neo4j.addNode('File', {
      path: relativePath,
      absolute_path: filePath,
      name: path.basename(filePath),
      extension: path.extname(filePath),
      content: content,
      language: language,
      size_bytes: content.length,
      line_count: content.split('\n').length,
      last_modified: (await fs.stat(filePath)).mtime.toISOString(),
      indexed_date: new Date().toISOString()
    });
    
    // 3. Parse and extract entities (if supported language)
    if (this.hasSupportedParser(language)) {
      const entities = await this.parseFile(content, language);
      
      // Create Function nodes
      for (const func of entities.functions) {
        const funcNode = await this.neo4j.addNode('Function', {
          name: func.name,
          signature: func.signature,
          docstring: func.docstring,
          body: func.body,
          line_start: func.line_start,
          line_end: func.line_end,
          complexity: func.complexity
        });
        
        // Link: File -[:CONTAINS]-> Function
        await this.neo4j.addEdge(
          fileNode.id,
          funcNode.id,
          'CONTAINS',
          { line_start: func.line_start }
        );
      }
      
      // Create Class nodes
      for (const cls of entities.classes) {
        const classNode = await this.neo4j.addNode('Class', {
          name: cls.name,
          docstring: cls.docstring,
          line_start: cls.line_start,
          line_end: cls.line_end,
          is_abstract: cls.is_abstract
        });
        
        await this.neo4j.addEdge(fileNode.id, classNode.id, 'CONTAINS');
      }
      
      // Create import relationships
      for (const imp of entities.imports) {
        const importedFileNode = await this.findOrCreateFileNode(imp.path);
        await this.neo4j.addEdge(
          fileNode.id,
          importedFileNode.id,
          'IMPORTS',
          { import_statement: imp.statement }
        );
      }
    }
    
    // 4. Generate embedding (if enabled)
    if (this.config.generate_embeddings) {
      const embedding = await this.generateEmbedding(content);
      await this.neo4j.updateNode(fileNode.id, { embedding });
    }
    
    return {
      file_node_id: fileNode.id,
      entities_created: entities.functions.length + entities.classes.length
    };
  }
  
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp'
    };
    return languageMap[ext] || 'generic';
  }
}
```

---

## 📡 File Watcher Implementation

### Using Chokidar

```typescript
import chokidar from 'chokidar';

class FileWatchManager {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private config: WatchConfig;
  private indexQueue: IndexQueue;
  
  async startWatch(watchConfig: WatchEntry): Promise<void> {
    const { path, recursive, debounce_ms } = watchConfig;
    
    // Load gitignore
    const gitignoreHandler = new GitignoreHandler();
    await gitignoreHandler.loadIgnoreFile(path);
    
    // Create watcher
    const watcher = chokidar.watch(path, {
      ignored: (filePath: string) => {
        return gitignoreHandler.shouldIgnore(filePath, path);
      },
      persistent: true,
      ignoreInitial: false,
      depth: recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: debounce_ms,
        pollInterval: 100
      }
    });
    
    // Handle events
    watcher
      .on('add', (filePath) => this.handleFileAdded(filePath, watchConfig))
      .on('change', (filePath) => this.handleFileChanged(filePath, watchConfig))
      .on('unlink', (filePath) => this.handleFileDeleted(filePath, watchConfig))
      .on('error', (error) => console.error(`Watcher error: ${error}`));
    
    this.watchers.set(watchConfig.id, watcher);
    
    console.log(`✅ Watching: ${path} (${this.watchers.size} total watches)`);
  }
  
  private async handleFileAdded(filePath: string, config: WatchEntry): Promise<void> {
    console.log(`📄 File added: ${filePath}`);
    await this.indexQueue.enqueue({
      operation: 'index',
      filePath,
      rootPath: config.path,
      generateEmbeddings: config.generate_embeddings
    });
  }
  
  private async handleFileChanged(filePath: string, config: WatchEntry): Promise<void> {
    console.log(`📝 File changed: ${filePath}`);
    await this.indexQueue.enqueue({
      operation: 'reindex',
      filePath,
      rootPath: config.path,
      generateEmbeddings: config.generate_embeddings
    });
  }
  
  private async handleFileDeleted(filePath: string, config: WatchEntry): Promise<void> {
    console.log(`🗑️  File deleted: ${filePath}`);
    
    // Delete from Neo4j
    const relativePath = path.relative(config.path, filePath);
    await this.neo4j.deleteNodeByProperty('File', 'path', relativePath);
  }
  
  async stopWatch(watchId: string): Promise<void> {
    const watcher = this.watchers.get(watchId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(watchId);
      console.log(`❌ Stopped watching: ${watchId}`);
    }
  }
  
  async loadPersistedWatches(): Promise<void> {
    const config = await this.loadConfig();
    
    console.log(`📂 Loading ${config.watches.length} persisted watches...`);
    
    for (const watch of config.watches) {
      try {
        await this.startWatch(watch);
      } catch (error) {
        console.error(`Failed to start watch for ${watch.path}:`, error);
      }
    }
  }
}
```

---

## 🎯 Implementation Plan

### Phase 1: Core Indexing (Week 1)

**Tasks:**
1. ✅ Install dependencies: `chokidar`, `ignore`, `@typescript-eslint/parser`
2. ✅ Create `FileIndexer` class with basic parsing
3. ✅ Implement `GitignoreHandler`
4. ✅ Create `index_folder` MCP tool
5. ✅ Test with TypeScript/JavaScript files

**Deliverables:**
- `src/indexing/FileIndexer.ts`
- `src/indexing/GitignoreHandler.ts`
- `src/tools/indexing.tools.ts`

### Phase 2: File Watching (Week 2)

**Tasks:**
1. ✅ Create `FileWatchManager` class
2. ✅ Implement persistent config (`watch-config.json`)
3. ✅ Create `watch_folder`, `unwatch_folder`, `list_folders` tools
4. ✅ Add server startup hook to load persisted watches
5. ✅ Implement debouncing and queue management

**Deliverables:**
- `src/indexing/FileWatchManager.ts`
- `src/indexing/IndexQueue.ts`
- Updated MCP tools

### Phase 3: RAG Integration (Week 3)

**Tasks:**
1. ✅ Implement `enrichWithRelatedFiles()` method
2. ✅ Update `memory_get_node` tool to auto-include related files
3. ✅ Update `memory_search_nodes` tool to auto-include related files
4. ✅ Add relevance scoring algorithm
5. ✅ Add configuration for max related files

**Deliverables:**
- Updated `Neo4jManager.ts` with enrichment
- Updated `todo.tools.ts` and `kg.tools.ts`

### Phase 4: Multi-Language Support (Week 4)

**Tasks:**
1. ✅ Add Python parser
2. ✅ Add Java parser (optional)
3. ✅ Add Go parser (optional)
4. ✅ Generic fallback for unsupported languages
5. ✅ Test with multi-language projects

**Deliverables:**
- `src/indexing/parsers/PythonParser.ts`
- `src/indexing/parsers/JavaParser.ts`
- `src/indexing/parsers/GenericParser.ts`

### Phase 5: Optimization & Testing (Week 5)

**Tasks:**
1. ✅ Batch indexing for large folders
2. ✅ Progress reporting
3. ✅ Error handling and retry logic
4. ✅ Performance benchmarking
5. ✅ Integration tests

---

## 📊 Data Schema Extensions

### New Node Properties

**File Node Extensions:**
```cypher
(:File {
  // ... existing properties ...
  indexed_date: DateTime,          // When file was first indexed
  last_indexed: DateTime,          // Last re-index time
  watch_id: String,               // Which watch added this file
  parse_errors: [String],         // Any parsing errors encountered
  hash: String                    // SHA-256 hash for change detection
})
```

### New Relationship Properties

**REFERENCES Relationship:**
```cypher
(TODO)-[:REFERENCES {
  line: Integer,                  // Line number reference
  context_lines: Integer,         // How many lines to include
  added_date: DateTime
}]->(File)
```

---

## 🔧 Configuration Options

### Environment Variables

```bash
# File Indexing Configuration
FILE_INDEXING_ENABLED=true
FILE_WATCH_ENABLED=true
FILE_INDEX_BATCH_SIZE=50
FILE_WATCH_DEBOUNCE_MS=500
FILE_INDEX_MAX_FILE_SIZE_MB=10
FILE_INDEX_GENERATE_EMBEDDINGS=false

# Paths
WATCH_CONFIG_PATH=/app/data/watch-config.json
```

### MCP Server Config

Add to existing `.env`:

```bash
# Enable file indexing
FILE_INDEXING_ENABLED=true

# Watch configuration
WATCH_CONFIG_PATH=./data/watch-config.json
MAX_WATCHED_FOLDERS=10
MAX_INDEXED_FILES_PER_FOLDER=10000

# RAG enrichment
AUTO_ENRICH_TODOS=true
MAX_RELATED_FILES=5
RELATED_FILES_MAX_DEPTH=2
```

---

## 📈 Success Metrics

**Performance Targets:**
- Indexing: >100 files/second (small files)
- Watch event latency: <500ms from file change to re-index start
- Related file lookup: <100ms (p95)
- Config load time: <50ms

**Scalability Targets:**
- Support 10+ watched folders simultaneously
- Handle 100,000+ files per folder
- Max memory overhead: +500MB for file watching

---

## 🚀 Usage Examples

### Example 1: Index a TypeScript Project

```typescript
// Call via MCP tool
await mcp.call('index_folder', {
  path: '/workspace/my-app',
  recursive: true,
  file_patterns: ['*.ts', '*.tsx'],
  generate_embeddings: false
});

// Response:
{
  "status": "success",
  "indexed": {
    "files": 245,
    "functions": 876,
    "classes": 123,
    "total_lines": 34567
  },
  "duration_ms": 3456
}
```

### Example 2: Watch a Project with Auto-Embeddings

```typescript
await mcp.call('watch_folder', {
  path: '/workspace/shared-lib',
  recursive: true,
  generate_embeddings: true,
  debounce_ms: 1000
});

// File changes automatically re-indexed
// Config persisted to ./data/watch-config.json
```

### Example 3: Get TODO Node with Related Files

```typescript
await mcp.call('memory_get_node', { id: 'node-todo-123' });

// Response includes:
{
  "id": "node-todo-123",
  "type": "todo",
  "title": "Fix authentication",
  "status": "pending",
  "related_files": [
    {
      "path": "src/auth/login.ts",
      "content": "// full file content...",
      "relevance_score": 1.0,
      "reason": "directly_referenced"
    }
  ],
  "related_functions": [
    {
      "name": "validatePassword",
      "signature": "validatePassword(password: string): boolean",
      "body": "// function body..."
    }
  ]
}
```

---

## 🔒 Security Considerations

**Access Control:**
- Only index folders explicitly added via MCP tools
- Respect `.gitignore` and never index secrets
- Add additional patterns: `.env`, `*.key`, `*.pem`, `secrets/`

**File Size Limits:**
- Skip files >10MB (configurable)
- Skip binary files automatically
- Log skipped files for transparency

**Resource Limits:**
- Max 10 concurrent indexing operations
- Max 100 files in indexing queue
- Auto-pause if memory usage >80%

---

## 📚 Dependencies

### New npm Packages

```json
{
  "dependencies": {
    "chokidar": "^3.6.0",          // File watching
    "ignore": "^5.3.0",            // .gitignore parsing
    "@typescript-eslint/parser": "^6.0.0",  // TypeScript AST
    "glob": "^10.3.0",             // File globbing
    "fast-glob": "^3.3.0"          // Fast file scanning
  }
}
```

---

## 🎯 Next Steps

**This Week:**
1. Review and approve this design
2. Update Neo4j schema to support file indexing
3. Install required npm packages
4. Create skeleton classes

**Week 2-5:**
- Follow phased implementation plan
- Continuous testing
- Documentation updates
- Performance optimization

---

**Last Updated:** 2025-10-17  
**Version:** 1.0  
**Status:** Ready for Implementation
