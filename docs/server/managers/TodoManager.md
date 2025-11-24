[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / managers/TodoManager

# managers/TodoManager

## Classes

### TodoManager

Defined in: src/managers/TodoManager.ts:20

TodoManager - Handles todo and todoList specific operations
Delegates to GraphManager for core graph operations

#### Constructors

##### Constructor

> **new TodoManager**(`graphManager`): [`TodoManager`](#todomanager)

Defined in: src/managers/TodoManager.ts:21

###### Parameters

###### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

###### Returns

[`TodoManager`](#todomanager)

#### Methods

##### createTodo()

> **createTodo**(`properties`): `Promise`\<[`Node`](../types/graph.types.md#node)\>

Defined in: src/managers/TodoManager.ts:68

Create a new todo task with default status and priority

Creates a todo node in the graph with 'pending' status and 'medium' priority
by default. Automatically generates embeddings from title and description.

###### Parameters

###### properties

`Record`\<`string`, `any`\>

Todo properties (title, description, status, priority, assignee, etc.)

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)\>

Created todo node with generated ID

###### Examples

```ts
// Create a basic todo
const todo = await todoManager.createTodo({
  title: 'Implement authentication',
  description: 'Add JWT-based auth with refresh tokens'
});
console.log(todo.id); // 'todo-1-1732456789'
console.log(todo.properties.status); // 'pending'
console.log(todo.properties.priority); // 'medium'
```

```ts
// Create todo with custom status and priority
const urgentTodo = await todoManager.createTodo({
  title: 'Fix production bug',
  description: 'Users cannot login after deployment',
  status: 'in_progress',
  priority: 'critical',
  assignee: 'worker-agent-1',
  deadline: '2024-12-01T00:00:00Z'
});
```

```ts
// Create todo with metadata for tracking
const featureTodo = await todoManager.createTodo({
  title: 'Add dark mode support',
  description: 'Implement theme switching with user preference persistence',
  priority: 'low',
  tags: ['ui', 'feature', 'enhancement'],
  estimated_hours: 8,
  epic: 'UI-Improvements'
});
```

##### completeTodo()

> **completeTodo**(`todoId`): `Promise`\<[`Node`](../types/graph.types.md#node)\>

Defined in: src/managers/TodoManager.ts:109

Mark a todo as complete with automatic timestamp

Updates the todo status to 'completed' and records the completion time.
Useful for tracking task completion and calculating metrics.

###### Parameters

###### todoId

`string`

ID of the todo node to complete

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)\>

Updated todo node with completed status

###### Examples

```ts
// Complete a todo after finishing work
const completed = await todoManager.completeTodo('todo-1-1732456789');
console.log(completed.properties.status); // 'completed'
console.log(completed.properties.completed_at); // '2024-11-24T14:30:00Z'
```

```ts
// Complete todos in a workflow
const todos = await todoManager.getTodos({ status: 'in_progress' });
for (const todo of todos) {
  if (await isTaskDone(todo.id)) {
    await todoManager.completeTodo(todo.id);
    console.log(`✅ Completed: ${todo.properties.title}`);
  }
}
```

```ts
// Complete and calculate duration
const todo = await todoManager.completeTodo('todo-123');
const started = new Date(todo.properties.started_at);
const completed = new Date(todo.properties.completed_at);
const durationHours = (completed - started) / (1000 * 60 * 60);
console.log(`Task took ${durationHours.toFixed(1)} hours`);
```

##### startTodo()

> **startTodo**(`todoId`): `Promise`\<[`Node`](../types/graph.types.md#node)\>

Defined in: src/managers/TodoManager.ts:151

Mark a todo as in progress with automatic timestamp

Updates the todo status to 'in_progress' and records when work started.
Use this when an agent or user begins working on a task.

###### Parameters

###### todoId

`string`

ID of the todo node to start

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)\>

Updated todo node with in_progress status

###### Examples

```ts
// Start working on a todo
const todo = await todoManager.startTodo('todo-1-1732456789');
console.log(todo.properties.status); // 'in_progress'
console.log(todo.properties.started_at); // '2024-11-24T14:00:00Z'
```

```ts
// Agent claims and starts a todo
const availableTodos = await todoManager.getTodos({ 
  status: 'pending',
  priority: 'high' 
});
if (availableTodos.length > 0) {
  const todo = availableTodos[0];
  await todoManager.startTodo(todo.id);
  console.log(`Agent started: ${todo.properties.title}`);
}
```

```ts
// Start todo with additional context
await todoManager.startTodo('todo-123');
await graphManager.updateNode('todo-123', {
  assignee: 'worker-agent-2',
  notes: 'Starting implementation with TDD approach'
});
```

##### getTodos()

> **getTodos**(`filters?`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/TodoManager.ts:198

Query todos with flexible filtering

Retrieves todos from the graph database with optional filters.
Supports filtering by any property (status, priority, assignee, tags, etc.).

###### Parameters

###### filters?

`Record`\<`string`, `any`\>

Optional filters as key-value pairs

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Array of matching todo nodes

###### Examples

```ts
// Get all pending todos
const pending = await todoManager.getTodos({ status: 'pending' });
console.log(`${pending.length} pending tasks`);
```

```ts
// Get high priority todos in progress
const urgent = await todoManager.getTodos({
  status: 'in_progress',
  priority: 'high'
});
for (const todo of urgent) {
  console.log(`⚠️ ${todo.properties.title}`);
}
```

```ts
// Get todos assigned to specific agent
const myTodos = await todoManager.getTodos({
  assignee: 'worker-agent-1'
});
console.log(`Agent has ${myTodos.length} assigned tasks`);
```

```ts
// Get all todos (no filter)
const allTodos = await todoManager.getTodos();
const stats = {
  total: allTodos.length,
  pending: allTodos.filter(t => t.properties.status === 'pending').length,
  completed: allTodos.filter(t => t.properties.status === 'completed').length
};
```

##### createTodoList()

> **createTodoList**(`properties`): `Promise`\<[`Node`](../types/graph.types.md#node)\>

Defined in: src/managers/TodoManager.ts:244

Create a new todo list to organize related tasks

Creates a todoList node that can contain multiple todos.
Useful for grouping tasks by project, sprint, or feature.

###### Parameters

###### properties

`Record`\<`string`, `any`\>

TodoList properties (title, description, etc.)

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)\>

Created todoList node with generated ID

###### Examples

```ts
// Create a project todo list
const projectList = await todoManager.createTodoList({
  title: 'Authentication Feature',
  description: 'All tasks for implementing user authentication',
  project: 'user-management',
  sprint: 'sprint-12'
});
console.log(projectList.id); // 'todoList-1-1732456789'
```

```ts
// Create a sprint todo list
const sprintList = await todoManager.createTodoList({
  title: 'Sprint 12 - Q4 2024',
  description: 'Tasks for December sprint',
  start_date: '2024-12-01',
  end_date: '2024-12-14',
  team: 'backend'
});
```

```ts
// Create a bug fix todo list
const bugList = await todoManager.createTodoList({
  title: 'Production Hotfixes',
  description: 'Critical bugs found in production',
  priority: 'critical',
  tags: ['bugs', 'production', 'hotfix']
});
```

##### addTodoToList()

> **addTodoToList**(`todoListId`, `todoId`): `Promise`\<[`Edge`](../types/graph.types.md#edge)\>

Defined in: src/managers/TodoManager.ts:289

Add a todo to a todo list by creating a relationship

Creates a 'contains' edge from the todoList to the todo node.
This allows organizing todos into hierarchical structures.

###### Parameters

###### todoListId

`string`

ID of the todoList node

###### todoId

`string`

ID of the todo node to add

###### Returns

`Promise`\<[`Edge`](../types/graph.types.md#edge)\>

The created edge relationship

###### Examples

```ts
// Add todo to a project list
const list = await todoManager.createTodoList({
  title: 'API Development'
});
const todo = await todoManager.createTodo({
  title: 'Implement /users endpoint'
});
await todoManager.addTodoToList(list.id, todo.id);
console.log('Todo added to list');
```

```ts
// Organize multiple todos into a sprint
const sprintList = await todoManager.createTodoList({
  title: 'Sprint 12'
});
const todoIds = ['todo-1', 'todo-2', 'todo-3'];
for (const todoId of todoIds) {
  await todoManager.addTodoToList(sprintList.id, todoId);
}
console.log(`Added ${todoIds.length} todos to sprint`);
```

```ts
// Move todo from one list to another
await todoManager.removeTodoFromList('old-list-id', 'todo-123');
await todoManager.addTodoToList('new-list-id', 'todo-123');
console.log('Todo moved to new list');
```

##### removeTodoFromList()

> **removeTodoFromList**(`todoListId`, `todoId`): `Promise`\<`boolean`\>

Defined in: src/managers/TodoManager.ts:330

Remove a todo from a todo list by deleting the relationship

Deletes the 'contains' edge between todoList and todo.
The todo node itself is not deleted, only the relationship.

###### Parameters

###### todoListId

`string`

ID of the todoList node

###### todoId

`string`

ID of the todo node to remove

###### Returns

`Promise`\<`boolean`\>

True if edge was deleted, false if not found

###### Examples

```ts
// Remove completed todo from active sprint
const removed = await todoManager.removeTodoFromList(
  'sprint-12-list',
  'todo-123'
);
if (removed) {
  console.log('Todo removed from sprint');
}
```

```ts
// Clean up completed todos from a list
const todos = await todoManager.getTodosInList('project-list');
const completed = todos.filter(t => t.properties.status === 'completed');
for (const todo of completed) {
  await todoManager.removeTodoFromList('project-list', todo.id);
}
console.log(`Removed ${completed.length} completed todos`);
```

```ts
// Move todo to different list
const success = await todoManager.removeTodoFromList('old-list', 'todo-1');
if (success) {
  await todoManager.addTodoToList('new-list', 'todo-1');
  console.log('Todo moved successfully');
}
```

##### getTodosInList()

> **getTodosInList**(`todoListId`, `statusFilter?`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/TodoManager.ts:380

Get all todos in a todo list with optional status filtering

Retrieves todos connected to the todoList via 'contains' edges.
Optionally filter by status to get only pending, in_progress, or completed todos.

###### Parameters

###### todoListId

`string`

ID of the todoList node

###### statusFilter?

`string`

Optional status filter ('pending', 'in_progress', 'completed')

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Array of todo nodes in the list

###### Examples

```ts
// Get all todos in a sprint
const allTodos = await todoManager.getTodosInList('sprint-12-list');
console.log(`Sprint has ${allTodos.length} total todos`);
```

```ts
// Get only pending todos from a project
const pending = await todoManager.getTodosInList(
  'project-list',
  'pending'
);
console.log(`${pending.length} tasks remaining`);
for (const todo of pending) {
  console.log(`- ${todo.properties.title}`);
}
```

```ts
// Get in-progress todos to check status
const inProgress = await todoManager.getTodosInList(
  'sprint-list',
  'in_progress'
);
for (const todo of inProgress) {
  const started = new Date(todo.properties.started_at);
  const hoursActive = (Date.now() - started.getTime()) / (1000 * 60 * 60);
  console.log(`${todo.properties.title}: ${hoursActive.toFixed(1)}h`);
}
```

##### getTodoListStats()

> **getTodoListStats**(`todoListId`): `Promise`\<[`TodoListStats`](#todoliststats)\>

Defined in: src/managers/TodoManager.ts:428

Get completion statistics for a todo list

Calculates total, completed, in_progress, pending counts and completion percentage.
Useful for progress tracking and reporting.

###### Parameters

###### todoListId

`string`

ID of the todoList node

###### Returns

`Promise`\<[`TodoListStats`](#todoliststats)\>

Stats object with counts and completion percentage

###### Examples

```ts
// Get sprint progress
const stats = await todoManager.getTodoListStats('sprint-12-list');
console.log(`Sprint Progress: ${stats.completion_percentage}%`);
console.log(`Completed: ${stats.completed}/${stats.total}`);
console.log(`In Progress: ${stats.in_progress}`);
console.log(`Pending: ${stats.pending}`);
```

```ts
// Check if sprint is complete
const stats = await todoManager.getTodoListStats('sprint-list');
if (stats.completion_percentage === 100) {
  console.log('🎉 Sprint complete!');
  await todoManager.archiveTodoList('sprint-list');
} else {
  console.log(`${stats.pending} tasks remaining`);
}
```

```ts
// Generate progress report for all projects
const lists = await todoManager.getTodoLists();
for (const list of lists) {
  const stats = await todoManager.getTodoListStats(list.id);
  console.log(`${list.properties.title}: ${stats.completion_percentage}%`);
}
```

##### getTodoLists()

> **getTodoLists**(`filters?`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/TodoManager.ts:474

Query todo lists with flexible filtering

Retrieves todoList nodes from the graph with optional filters.
Supports filtering by any property (archived, project, team, etc.).

###### Parameters

###### filters?

`Record`\<`string`, `any`\>

Optional filters as key-value pairs

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Array of matching todoList nodes

###### Examples

```ts
// Get all active (non-archived) lists
const active = await todoManager.getTodoLists({ archived: false });
console.log(`${active.length} active projects`);
```

```ts
// Get lists for a specific project
const projectLists = await todoManager.getTodoLists({
  project: 'user-management'
});
for (const list of projectLists) {
  const stats = await todoManager.getTodoListStats(list.id);
  console.log(`${list.properties.title}: ${stats.completion_percentage}%`);
}
```

```ts
// Get all lists (no filter)
const allLists = await todoManager.getTodoLists();
console.log(`Total lists: ${allLists.length}`);
```

##### archiveTodoList()

> **archiveTodoList**(`todoListId`, `removeCompletedTodos`): `Promise`\<[`Node`](../types/graph.types.md#node)\>

Defined in: src/managers/TodoManager.ts:516

Archive a todo list and optionally clean up completed todos

Marks the list as archived with timestamp. Optionally deletes all
completed todos to clean up the graph. Useful for sprint/project completion.

###### Parameters

###### todoListId

`string`

ID of the todoList node to archive

###### removeCompletedTodos

`boolean` = `false`

If true, delete completed todos (default: false)

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)\>

Updated todoList node with archived status

###### Examples

```ts
// Archive completed sprint
const archived = await todoManager.archiveTodoList('sprint-12-list');
console.log('Sprint archived:', archived.properties.archived_at);
```

```ts
// Archive and clean up completed todos
const stats = await todoManager.getTodoListStats('project-list');
if (stats.completion_percentage === 100) {
  await todoManager.archiveTodoList('project-list', true);
  console.log('Project archived and completed todos removed');
}
```

```ts
// Archive old sprints automatically
const lists = await todoManager.getTodoLists({ archived: false });
for (const list of lists) {
  const created = new Date(list.properties.created);
  const daysOld = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld > 30) {
    const stats = await todoManager.getTodoListStats(list.id);
    if (stats.completion_percentage === 100) {
      await todoManager.archiveTodoList(list.id, true);
      console.log(`Archived old list: ${list.properties.title}`);
    }
  }
}
```

##### unarchiveTodoList()

> **unarchiveTodoList**(`todoListId`): `Promise`\<[`Node`](../types/graph.types.md#node)\>

Defined in: src/managers/TodoManager.ts:558

Unarchive a todo list to make it active again

Removes the archived flag and clears the archived_at timestamp.
Use this to reopen a previously archived list.

###### Parameters

###### todoListId

`string`

ID of the todoList node to unarchive

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)\>

Updated todoList node with archived=false

###### Examples

```ts
// Reopen an archived sprint
const list = await todoManager.unarchiveTodoList('sprint-12-list');
console.log('Sprint reopened:', list.properties.title);
```

```ts
// Unarchive if more work is needed
const archivedLists = await todoManager.getTodoLists({ archived: true });
const listToReopen = archivedLists.find(l => 
  l.properties.title === 'Q4 Features'
);
if (listToReopen) {
  await todoManager.unarchiveTodoList(listToReopen.id);
  console.log('List reactivated for additional work');
}
```

##### bulkCompleteTodos()

> **bulkCompleteTodos**(`todoListId`, `todoIds?`): `Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Defined in: src/managers/TodoManager.ts:597

Complete multiple todos at once for efficiency

Completes specific todos by ID, or all pending todos if no IDs provided.
Useful for batch operations and sprint completion.

###### Parameters

###### todoListId

`string`

ID of the todoList node

###### todoIds?

`string`[]

Array of todo IDs to complete (if empty, completes all pending todos)

###### Returns

`Promise`\<[`Node`](../types/graph.types.md#node)[]\>

Array of updated todo nodes with completed status

###### Examples

```ts
// Complete specific todos
const completed = await todoManager.bulkCompleteTodos(
  'sprint-list',
  ['todo-1', 'todo-2', 'todo-3']
);
console.log(`Completed ${completed.length} todos`);
```

```ts
// Complete all pending todos in a list
const allCompleted = await todoManager.bulkCompleteTodos('project-list');
console.log(`Marked ${allCompleted.length} pending todos as complete`);
```

```ts
// Complete todos matching criteria
const todos = await todoManager.getTodosInList('sprint-list');
const lowPriorityIds = todos
  .filter(t => t.properties.priority === 'low' && t.properties.status === 'pending')
  .map(t => t.id);
await todoManager.bulkCompleteTodos('sprint-list', lowPriorityIds);
console.log(`Bulk completed ${lowPriorityIds.length} low priority tasks`);
```

## Interfaces

### TodoListStats

Defined in: src/managers/TodoManager.ts:8

#### Properties

##### total

> **total**: `number`

Defined in: src/managers/TodoManager.ts:9

##### completed

> **completed**: `number`

Defined in: src/managers/TodoManager.ts:10

##### in\_progress

> **in\_progress**: `number`

Defined in: src/managers/TodoManager.ts:11

##### pending

> **pending**: `number`

Defined in: src/managers/TodoManager.ts:12

##### completion\_percentage

> **completion\_percentage**: `number`

Defined in: src/managers/TodoManager.ts:13
