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

Defined in: src/tools/todoList.tools.ts:136

Handle todo tool calls (individual todo operations)

#### Parameters

##### params

`any`

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Returns

`Promise`\<`any`\>

***

### handleTodoList()

> **handleTodoList**(`params`, `graphManager`): `Promise`\<`any`\>

Defined in: src/tools/todoList.tools.ts:307

Handle todo_list tool calls (list management operations)

#### Parameters

##### params

`any`

##### graphManager

[`IGraphManager`](../types/IGraphManager.md#igraphmanager)

#### Returns

`Promise`\<`any`\>
