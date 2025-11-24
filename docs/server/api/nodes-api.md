[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / api/nodes-api

# api/nodes-api

## Description

REST API endpoints for managing graph nodes

Provides HTTP endpoints for browsing, viewing, and managing nodes in the
Neo4j graph database. Excludes file nodes which are handled separately.

**Endpoints:**
- `GET /api/nodes/types` - List all node types with counts
- `GET /api/nodes/list` - List nodes by type with pagination
- `GET /api/nodes/:id` - Get detailed node information
- `DELETE /api/nodes/:id` - Delete a node and its relationships

All endpoints require appropriate RBAC permissions.

## Example

```typescript
// Get all node types
fetch('/api/nodes/types')
  .then(r => r.json())
  .then(data => console.log(data.types));

// List todos
fetch('/api/nodes/list?type=todo&limit=20')
  .then(r => r.json())
  .then(data => console.log(data.nodes));
```

## Variables

### default

> `const` **default**: `Router`

Defined in: src/api/nodes-api.ts:34
