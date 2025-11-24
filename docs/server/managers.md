[**mimir v1.0.0**](README.md)

***

[mimir](README.md) / managers

# managers

## Functions

### createGraphManager()

> **createGraphManager**(): `Promise`\<[`GraphManager`](managers/GraphManager.md#graphmanager)\>

Defined in: src/managers/index.ts:16

Create and initialize a GraphManager instance

#### Returns

`Promise`\<[`GraphManager`](managers/GraphManager.md#graphmanager)\>

***

### createTodoManager()

> **createTodoManager**(`graphManager`): [`TodoManager`](managers/TodoManager.md#todomanager)

Defined in: src/managers/index.ts:41

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
