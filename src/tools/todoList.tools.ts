/**
 * @file src/tools/todoList.tools.ts
 * @description Natural todo and list management MCP tools
 * Split into two focused tools for better discoverability
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IGraphManager } from '../types/IGraphManager.js';
import { TodoManager } from '../managers/TodoManager.js';

export function createTodoListTools(): Tool[] {
  return [
    // ========================================================================
    // TOOL 1: todo - Individual todo operations
    // ========================================================================
    {
      name: 'todo',
      description: `Manage individual todos (tasks). Operations: create, get, update, complete, delete, list.

Todos automatically get semantic embeddings - use vector_search_nodes to find similar tasks or related work.
      
Examples:
- Create: todo(operation='create', title='Fix bug', priority='high')
- Complete: todo(operation='complete', todo_id='todo-123')
- List: todo(operation='list', filters={status: 'pending'})`,
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['create', 'get', 'update', 'complete', 'delete', 'list'],
            description: 'The operation to perform on todos'
          },
          todo_id: {
            type: 'string',
            description: 'ID of the todo (required for get, update, complete, delete)'
          },
          list_id: {
            type: 'string',
            description: 'ID of the list to add the todo to (optional for create)'
          },
          title: {
            type: 'string',
            description: 'Title of the todo (required for create)'
          },
          description: {
            type: 'string',
            description: 'Description of the todo'
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed'],
            description: 'Status of the todo (default: pending)'
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Priority of the todo (default: medium)'
          },
          filters: {
            type: 'object',
            description: 'Filters for list operation (e.g., {status: "pending", priority: "high"})'
          },
          properties: {
            type: 'object',
            description: 'Additional custom properties'
          }
        },
        required: ['operation']
      }
    },

    // ========================================================================
    // TOOL 2: todo_list - List management operations
    // ========================================================================
    {
      name: 'todo_list',
      description: `Manage todo lists (collections of todos). Operations: create, get, update, archive, delete, list, add_todo, remove_todo, get_stats.
      
Examples:
- Create: todo_list(operation='create', title='Sprint 1')
- Get with todos: todo_list(operation='get', list_id='todoList-123')
- Add todo: todo_list(operation='add_todo', list_id='todoList-123', todo_id='todo-456')
- Stats: todo_list(operation='get_stats', list_id='todoList-123')`,
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['create', 'get', 'update', 'archive', 'delete', 'list', 'add_todo', 'remove_todo', 'get_stats'],
            description: 'The operation to perform on todo lists'
          },
          list_id: {
            type: 'string',
            description: 'ID of the list (required for get, update, archive, delete, add_todo, remove_todo, get_stats)'
          },
          todo_id: {
            type: 'string',
            description: 'ID of the todo (required for add_todo, remove_todo)'
          },
          title: {
            type: 'string',
            description: 'Title of the list (required for create)'
          },
          description: {
            type: 'string',
            description: 'Description of the list'
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Priority of the list (default: medium)'
          },
          filters: {
            type: 'object',
            description: 'Filters for list operation (e.g., {archived: false})'
          },
          properties: {
            type: 'object',
            description: 'Additional custom properties'
          },
          remove_completed: {
            type: 'boolean',
            description: 'For archive: whether to delete completed todos (default: false)'
          }
        },
        required: ['operation']
      }
    }
  ];
}

/**
 * Handle todo tool calls (individual todo operations)
 */
export async function handleTodo(
  params: any,
  graphManager: IGraphManager
): Promise<any> {
  const todoManager = new TodoManager(graphManager);
  const { operation } = params;

  try {
    switch (operation) {
      case 'create': {
        const { title, description, status, priority, list_id, properties } = params;
        if (!title) {
          return { status: 'error', message: 'title is required for create' };
        }

        const todo = await todoManager.createTodo({
          title,
          description,
          status: status || 'pending',
          priority: priority || 'medium',
          ...properties
        });

        // Add to list if list_id provided
        if (list_id) {
          await todoManager.addTodoToList(list_id, todo.id);
        }

        return {
          status: 'success',
          operation: 'create',
          todo: {
            id: todo.id,
            title: todo.properties.title,
            description: todo.properties.description,
            status: todo.properties.status,
            priority: todo.properties.priority,
            created: todo.created,
            list_id: list_id || null
          }
        };
      }

      case 'get': {
        const { todo_id } = params;
        if (!todo_id) {
          return { status: 'error', message: 'todo_id is required for get' };
        }

        const todo = await graphManager.getNode(todo_id);
        if (!todo || todo.type !== 'todo') {
          return { status: 'error', message: 'Todo not found' };
        }

        return {
          status: 'success',
          operation: 'get',
          todo: {
            id: todo.id,
            title: todo.properties.title,
            description: todo.properties.description,
            status: todo.properties.status,
            priority: todo.properties.priority,
            created: todo.created,
            updated: todo.updated,
            completed_at: todo.properties.completed_at,
            started_at: todo.properties.started_at
          }
        };
      }

      case 'update': {
        const { todo_id, title, description, status, priority, properties } = params;
        if (!todo_id) {
          return { status: 'error', message: 'todo_id is required for update' };
        }

        const updates: any = { ...properties };
        if (title) updates.title = title;
        if (description) updates.description = description;
        if (status) updates.status = status;
        if (priority) updates.priority = priority;

        const todo = await graphManager.updateNode(todo_id, updates);

        return {
          status: 'success',
          operation: 'update',
          todo: {
            id: todo.id,
            title: todo.properties.title,
            description: todo.properties.description,
            status: todo.properties.status,
            priority: todo.properties.priority,
            updated: todo.updated
          }
        };
      }

      case 'complete': {
        const { todo_id } = params;
        if (!todo_id) {
          return { status: 'error', message: 'todo_id is required for complete' };
        }

        const todo = await todoManager.completeTodo(todo_id);

        return {
          status: 'success',
          operation: 'complete',
          todo: {
            id: todo.id,
            title: todo.properties.title,
            status: todo.properties.status,
            completed_at: todo.properties.completed_at
          }
        };
      }

      case 'delete': {
        const { todo_id } = params;
        if (!todo_id) {
          return { status: 'error', message: 'todo_id is required for delete' };
        }

        const deleted = await graphManager.deleteNode(todo_id);

        return {
          status: 'success',
          operation: 'delete',
          deleted
        };
      }

      case 'list': {
        const { filters } = params;
        const todos = await todoManager.getTodos(filters || {});

        return {
          status: 'success',
          operation: 'list',
          count: todos.length,
          todos: todos.map(t => ({
            id: t.id,
            title: t.properties.title,
            description: t.properties.description,
            status: t.properties.status,
            priority: t.properties.priority,
            created: t.created
          }))
        };
      }

      default:
        return {
          status: 'error',
          message: `Unknown operation: ${operation}. Valid operations: create, get, update, complete, delete, list`
        };
    }
  } catch (error: any) {
    return {
      status: 'error',
      operation,
      message: error.message
    };
  }
}

/**
 * Handle todo_list tool calls (list management operations)
 */
export async function handleTodoList(
  params: any,
  graphManager: IGraphManager
): Promise<any> {
  const todoManager = new TodoManager(graphManager);
  const { operation } = params;

  try {
    switch (operation) {
      case 'create': {
        const { title, description, priority, properties } = params;
        if (!title) {
          return { status: 'error', message: 'title is required for create' };
        }

        const list = await todoManager.createTodoList({
          title,
          description,
          priority: priority || 'medium',
          ...properties
        });

        return {
          status: 'success',
          operation: 'create',
          list: {
            id: list.id,
            title: list.properties.title,
            description: list.properties.description,
            priority: list.properties.priority,
            created: list.created
          }
        };
      }

      case 'get': {
        const { list_id } = params;
        if (!list_id) {
          return { status: 'error', message: 'list_id is required for get' };
        }

        const list = await graphManager.getNode(list_id);
        if (!list || list.type !== 'todoList') {
          return { status: 'error', message: 'List not found' };
        }

        const todos = await todoManager.getTodosInList(list_id);
        const stats = await todoManager.getTodoListStats(list_id);

        return {
          status: 'success',
          operation: 'get',
          list: {
            id: list.id,
            title: list.properties.title,
            description: list.properties.description,
            priority: list.properties.priority,
            archived: list.properties.archived,
            created: list.created,
            updated: list.updated
          },
          todos: todos.map(t => ({
            id: t.id,
            title: t.properties.title,
            description: t.properties.description,
            status: t.properties.status,
            priority: t.properties.priority
          })),
          stats
        };
      }

      case 'update': {
        const { list_id, title, description, priority, properties } = params;
        if (!list_id) {
          return { status: 'error', message: 'list_id is required for update' };
        }

        const updates: any = { ...properties };
        if (title) updates.title = title;
        if (description) updates.description = description;
        if (priority) updates.priority = priority;

        const list = await graphManager.updateNode(list_id, updates);

        return {
          status: 'success',
          operation: 'update',
          list: {
            id: list.id,
            title: list.properties.title,
            description: list.properties.description,
            priority: list.properties.priority,
            updated: list.updated
          }
        };
      }

      case 'archive': {
        const { list_id, remove_completed } = params;
        if (!list_id) {
          return { status: 'error', message: 'list_id is required for archive' };
        }

        const list = await todoManager.archiveTodoList(list_id, remove_completed || false);

        return {
          status: 'success',
          operation: 'archive',
          list: {
            id: list.id,
            title: list.properties.title,
            archived: list.properties.archived,
            archived_at: list.properties.archived_at
          }
        };
      }

      case 'delete': {
        const { list_id } = params;
        if (!list_id) {
          return { status: 'error', message: 'list_id is required for delete' };
        }

        const deleted = await graphManager.deleteNode(list_id);

        return {
          status: 'success',
          operation: 'delete',
          deleted
        };
      }

      case 'add_todo': {
        const { list_id, todo_id } = params;
        if (!list_id || !todo_id) {
          return { status: 'error', message: 'list_id and todo_id are required for add_todo' };
        }

        const edge = await todoManager.addTodoToList(list_id, todo_id);

        return {
          status: 'success',
          operation: 'add_todo',
          list_id,
          todo_id,
          edge_id: edge.id
        };
      }

      case 'remove_todo': {
        const { list_id, todo_id } = params;
        if (!list_id || !todo_id) {
          return { status: 'error', message: 'list_id and todo_id are required for remove_todo' };
        }

        const removed = await todoManager.removeTodoFromList(list_id, todo_id);

        return {
          status: 'success',
          operation: 'remove_todo',
          list_id,
          todo_id,
          removed
        };
      }

      case 'list': {
        const { filters } = params;
        const lists = await todoManager.getTodoLists(filters || {});

        return {
          status: 'success',
          operation: 'list',
          count: lists.length,
          lists: lists.map(l => ({
            id: l.id,
            title: l.properties.title,
            description: l.properties.description,
            priority: l.properties.priority,
            archived: l.properties.archived,
            created: l.created
          }))
        };
      }

      case 'get_stats': {
        const { list_id } = params;
        if (!list_id) {
          return { status: 'error', message: 'list_id is required for get_stats' };
        }

        const stats = await todoManager.getTodoListStats(list_id);

        return {
          status: 'success',
          operation: 'get_stats',
          list_id,
          stats
        };
      }

      default:
        return {
          status: 'error',
          message: `Unknown operation: ${operation}. Valid operations: create, get, update, archive, delete, list, add_todo, remove_todo, get_stats`
        };
    }
  } catch (error: any) {
    return {
      status: 'error',
      operation,
      message: error.message
    };
  }
}
