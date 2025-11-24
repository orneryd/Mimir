[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / tools/todoList.tools

# tools/todoList.tools

## Functions

### createTodoListTools()

> **createTodoListTools**(): `object`[]

Defined in: src/tools/todoList.tools.ts:11

#### Returns

`object`[]

***

### handleTodo()

> **handleTodo**(`params`, `graphManager`): `Promise`\<`any`\>

Defined in: src/tools/todoList.tools.ts:186

Handle todo tool calls - Individual TODO operations

#### Parameters

##### params

`any`

TODO operation parameters

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

Graph manager instance

#### Returns

`Promise`\<`any`\>

Promise with operation result

#### Description

Manages individual TODO tasks with operations for creating,
updating, completing, and querying todos. Todos automatically get semantic
embeddings for vector search. Supports custom properties and list assignment.

#### Examples

```typescript
// Create a TODO
const result = await handleTodo({
  operation: 'create',
  title: 'Implement authentication',
  description: 'Add JWT-based auth with refresh tokens',
  priority: 'high',
  status: 'pending'
}, graphManager);
// Returns: { status: 'success', todo: { id: 'todo-123', ... } }
```

```typescript
// Complete a TODO
const result = await handleTodo({
  operation: 'complete',
  todo_id: 'todo-123'
}, graphManager);
```

```typescript
// List pending high-priority TODOs
const result = await handleTodo({
  operation: 'list',
  filters: { status: 'pending', priority: 'high' }
}, graphManager);
// Returns: { status: 'success', todos: [...] }
```

***

### handleTodoList()

> **handleTodoList**(`params`, `graphManager`): `Promise`\<`any`\>

Defined in: src/tools/todoList.tools.ts:417

Handle todo_list tool calls - TODO list management operations

#### Parameters

##### params

`any`

TODO list operation parameters

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

Graph manager instance

#### Returns

`Promise`\<`any`\>

Promise with operation result

#### Description

Manages TODO lists (collections of todos) with operations for
creating, updating, archiving lists, and managing list membership. Supports
adding/removing todos from lists and getting list statistics.

#### Examples

```typescript
// Create a TODO list
const result = await handleTodoList({
  operation: 'create',
  title: 'Sprint 1 Tasks',
  description: 'Q1 2025 Sprint 1',
  priority: 'high'
}, graphManager);
// Returns: { status: 'success', list: { id: 'todoList-123', ... } }
```

```typescript
// Add TODO to list
const result = await handleTodoList({
  operation: 'add_todo',
  list_id: 'todoList-123',
  todo_id: 'todo-456'
}, graphManager);
```

```typescript
// Get list statistics
const result = await handleTodoList({
  operation: 'get_stats',
  list_id: 'todoList-123'
}, graphManager);
// Returns: { total: 10, pending: 5, in_progress: 3, completed: 2 }
```

```typescript
// Archive list and remove completed todos
const result = await handleTodoList({
  operation: 'archive',
  list_id: 'todoList-123',
  remove_completed: true
}, graphManager);
```
