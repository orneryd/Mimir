[**mimir v1.0.0**](README.md)

***

[mimir](README.md) / managers

# managers

## Description

Core manager classes for Mimir graph database operations

This module exports the main manager classes that provide high-level
interfaces to the Neo4j graph database:

- **GraphManager**: Core CRUD operations, search, locking, transactions
- **TodoManager**: TODO and TODO list management
- **UnifiedSearchService**: Hybrid search (vector + BM25)

## Example

```typescript
// Create and use managers
import { createGraphManager, TodoManager } from './managers/index.js';

const graphManager = await createGraphManager();
const todoManager = new TodoManager(graphManager);

// Use the managers
const node = await graphManager.addNode('memory', { title: 'Test' });
const todo = await todoManager.createTodo({ title: 'Task 1' });
```

## Functions

### createGraphManager()

> **createGraphManager**(): `Promise`\<[`GraphManager`](managers/GraphManager.md#graphmanager)\>

Defined in: src/managers/index.ts:70

Create and initialize a GraphManager instance

#### Returns

`Promise`\<[`GraphManager`](managers/GraphManager.md#graphmanager)\>

Promise resolving to initialized GraphManager instance

#### Description

Factory function that creates a GraphManager with connection
details from environment variables, initializes the database schema,
and tests the connection. This is the recommended way to create a
GraphManager instance.

Environment variables used:
- NEO4J_URI (default: bolt://localhost:7687)
- NEO4J_USER (default: neo4j)
- NEO4J_PASSWORD (default: password)

#### Throws

If connection to Neo4j fails

#### Examples

```typescript
// Create with environment variables
const manager = await createGraphManager();

// Now ready to use
const stats = await manager.getStats();
console.log(`Connected: ${stats.nodeCount} nodes`);
```

```typescript
// Set custom connection in .env
// NEO4J_URI=bolt://production:7687
// NEO4J_USER=admin
// NEO4J_PASSWORD=secure_password

const manager = await createGraphManager();
```

***

### createTodoManager()

> **createTodoManager**(`graphManager`): [`TodoManager`](managers/TodoManager.md#todomanager)

Defined in: src/managers/index.ts:95

Create a TodoManager instance
Requires an initialized GraphManager

#### Parameters

##### graphManager

[`IGraphManager`](types/IGraphManager.md#igraphmanager)

#### Returns

[`TodoManager`](managers/TodoManager.md#todomanager)

## References

### GraphManager

Re-exports [GraphManager](managers/GraphManager.md#graphmanager)

***

### TodoManager

Re-exports [TodoManager](managers/TodoManager.md#todomanager)

***

### UnifiedSearchService

Re-exports [UnifiedSearchService](managers/UnifiedSearchService.md#unifiedsearchservice)

***

### IGraphManager

Re-exports [IGraphManager](types/IGraphManager.md#igraphmanager)
