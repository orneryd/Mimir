[**mimir v1.0.0**](README.md)

***

[mimir](README.md) / index

# index

## Description

Main MCP server entry point for Mimir Graph-RAG

Provides Model Context Protocol (MCP) server with 13 tools for:
- Memory operations (6 tools): node, edge, batch, lock, clear, get_task_context
- File indexing (3 tools): index_folder, remove_folder, list_folders
- Vector search (2 tools): vector_search_nodes, get_embedding_stats
- TODO management (2 tools): todo, todo_list

The server uses Neo4j as the graph database backend and supports:
- Persistent memory with semantic embeddings
- Multi-agent coordination with optimistic locking
- Automatic file indexing with .gitignore support
- Hybrid search (vector + BM25)
- TODO tracking with hierarchical lists

## Examples

```typescript
// Run as MCP server (stdio transport)
import { server, initializeGraphManager } from './index.js';
await initializeGraphManager();
await server.connect(new StdioServerTransport());
```

```typescript
// Use in HTTP mode
import { startHttpServer } from './http-server.js';
await startHttpServer();
```

## Variables

### fileWatchManager

> **fileWatchManager**: [`FileWatchManager`](indexing/FileWatchManager.md#filewatchmanager)

Defined in: src/index.ts:93

***

### allTools

> **allTools**: `any`[] = `[]`

Defined in: src/index.ts:94

***

### server

> `const` **server**: `Server`\<\{ \}, \{ \}, \{\[`key`: `string`\]: `unknown`; \}\>

Defined in: src/index.ts:100

## Functions

### initializeGraphManager()

> **initializeGraphManager**(): `Promise`\<[`IGraphManager`](types/IGraphManager.md#igraphmanager)\>

Defined in: src/index.ts:403

#### Returns

`Promise`\<[`IGraphManager`](types/IGraphManager.md#igraphmanager)\>
