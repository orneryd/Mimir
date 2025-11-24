[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / api/mcp-tools-api

# api/mcp-tools-api

## Description

REST API wrapper for MCP tools

Provides HTTP endpoints that expose all 13 MCP tools as REST APIs.
Each tool can be called via POST with JSON parameters.

**Available Tools:**
- Memory operations (6): memory_node, memory_edge, memory_batch, memory_lock, memory_clear, get_task_context
- File indexing (3): index_folder, remove_folder, list_folders
- Vector search (2): vector_search_nodes, get_embedding_stats
- TODO management (2): todo, todo_list

**Endpoints:**
- `GET /api/mcp/tools` - List all available tools
- `POST /api/mcp/tools/:toolName` - Execute a specific tool

## Example

```typescript
// Call memory_node tool
fetch('/api/mcp/tools/memory_node', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operation: 'add',
    type: 'memory',
    properties: { title: 'Test', content: 'Content' }
  })
});
```

## Functions

### createMCPToolsRouter()

> **createMCPToolsRouter**(`graphManager`): `Router`

Defined in: src/api/mcp-tools-api.ts:37

#### Parameters

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Returns

`Router`
