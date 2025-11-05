// ============================================================================
// TodoManager - Specialized manager for TODO and TodoList operations
// ============================================================================

import type { Node, Edge } from '../types/graph.types.js';
import type { IGraphManager } from '../types/IGraphManager.js';

export interface TodoListStats {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  completion_percentage: number;
}

/**
 * TodoManager - Handles todo and todoList specific operations
 * Delegates to GraphManager for core graph operations
 */
export class TodoManager {
  constructor(private graphManager: IGraphManager) {}

  // ============================================================================
  // TODO OPERATIONS
  // ============================================================================

  /**
   * Create a new todo
   * 
   * @param properties - Todo properties (title, description, status, priority, etc.)
   * @returns Created todo node
   */
  async createTodo(properties: Record<string, any>): Promise<Node> {
    return this.graphManager.addNode('todo', {
      status: 'pending',
      priority: 'medium',
      ...properties
    });
  }

  /**
   * Mark a todo as complete
   * Updates status to 'completed' and sets completed_at timestamp
   * 
   * @param todoId - ID of the todo node
   * @returns Updated todo node
   */
  async completeTodo(todoId: string): Promise<Node> {
    return this.graphManager.updateNode(todoId, {
      status: 'completed',
      completed_at: new Date().toISOString()
    });
  }

  /**
   * Mark a todo as in progress
   * 
   * @param todoId - ID of the todo node
   * @returns Updated todo node
   */
  async startTodo(todoId: string): Promise<Node> {
    return this.graphManager.updateNode(todoId, {
      status: 'in_progress',
      started_at: new Date().toISOString()
    });
  }

  /**
   * Get all todos with optional filters
   * 
   * @param filters - Optional filters (status, priority, etc.)
   * @returns Array of todo nodes
   */
  async getTodos(filters?: Record<string, any>): Promise<Node[]> {
    return this.graphManager.queryNodes('todo', filters);
  }

  // ============================================================================
  // TODOLIST OPERATIONS
  // ============================================================================

  /**
   * Create a new todoList
   * 
   * @param properties - TodoList properties (title, description, etc.)
   * @returns Created todoList node
   */
  async createTodoList(properties: Record<string, any>): Promise<Node> {
    return this.graphManager.addNode('todoList', {
      archived: false,
      ...properties
    });
  }

  /**
   * Add a todo to a todoList
   * Creates a 'contains' edge from todoList to todo
   * 
   * @param todoListId - ID of the todoList node
   * @param todoId - ID of the todo node
   * @returns The created edge
   */
  async addTodoToList(todoListId: string, todoId: string): Promise<Edge> {
    return this.graphManager.addEdge(todoListId, todoId, 'contains');
  }

  /**
   * Remove a todo from a todoList
   * 
   * @param todoListId - ID of the todoList node
   * @param todoId - ID of the todo node
   * @returns True if edge was deleted
   */
  async removeTodoFromList(todoListId: string, todoId: string): Promise<boolean> {
    // Find and delete the edge
    const edges = await this.graphManager.getEdges(todoListId, 'out');
    const edge = edges.find(e => e.target === todoId && e.type === 'contains');
    
    if (edge) {
      return this.graphManager.deleteEdge(edge.id);
    }
    
    return false;
  }

  /**
   * Get all todos in a todoList
   * 
   * @param todoListId - ID of the todoList node
   * @param statusFilter - Optional status filter ('pending', 'in_progress', 'completed')
   * @returns Array of todo nodes
   */
  async getTodosInList(todoListId: string, statusFilter?: string): Promise<Node[]> {
    const neighbors = await this.graphManager.getNeighbors(todoListId, 'contains', 1);
    
    // Filter by status if provided
    if (statusFilter) {
      return neighbors.filter(node => 
        node.type === 'todo' && node.properties.status === statusFilter
      );
    }
    
    return neighbors.filter(node => node.type === 'todo');
  }

  /**
   * Get todoList completion stats
   * 
   * @param todoListId - ID of the todoList node
   * @returns Stats object with counts
   */
  async getTodoListStats(todoListId: string): Promise<TodoListStats> {
    const todos = await this.getTodosInList(todoListId);
    
    const total = todos.length;
    const completed = todos.filter(t => t.properties.status === 'completed').length;
    const in_progress = todos.filter(t => t.properties.status === 'in_progress').length;
    const pending = todos.filter(t => t.properties.status === 'pending').length;
    
    return {
      total,
      completed,
      in_progress,
      pending,
      completion_percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  /**
   * Get all todoLists with optional filters
   * 
   * @param filters - Optional filters (archived, etc.)
   * @returns Array of todoList nodes
   */
  async getTodoLists(filters?: Record<string, any>): Promise<Node[]> {
    return this.graphManager.queryNodes('todoList', filters);
  }

  /**
   * Archive a completed todoList
   * Marks the list as archived and optionally removes completed todos
   * 
   * @param todoListId - ID of the todoList node
   * @param removeCompletedTodos - If true, delete completed todos (default: false)
   * @returns Updated todoList node
   */
  async archiveTodoList(todoListId: string, removeCompletedTodos: boolean = false): Promise<Node> {
    if (removeCompletedTodos) {
      // Get all completed todos and delete them
      const completedTodos = await this.getTodosInList(todoListId, 'completed');
      
      for (const todo of completedTodos) {
        await this.graphManager.deleteNode(todo.id);
      }
    }

    // Mark list as archived
    return this.graphManager.updateNode(todoListId, {
      archived: true,
      archived_at: new Date().toISOString()
    });
  }

  /**
   * Unarchive a todoList
   * 
   * @param todoListId - ID of the todoList node
   * @returns Updated todoList node
   */
  async unarchiveTodoList(todoListId: string): Promise<Node> {
    return this.graphManager.updateNode(todoListId, {
      archived: false,
      archived_at: null
    });
  }

  /**
   * Bulk complete todos in a list
   * 
   * @param todoListId - ID of the todoList node
   * @param todoIds - Array of todo IDs to complete (if empty, completes all pending todos)
   * @returns Array of updated todo nodes
   */
  async bulkCompleteTodos(todoListId: string, todoIds?: string[]): Promise<Node[]> {
    let todosToComplete: Node[];
    
    if (todoIds && todoIds.length > 0) {
      // Complete specific todos
      todosToComplete = await Promise.all(
        todoIds.map(id => this.graphManager.getNode(id))
      ).then(nodes => nodes.filter(n => n !== null) as Node[]);
    } else {
      // Complete all pending todos in the list
      todosToComplete = await this.getTodosInList(todoListId, 'pending');
    }
    
    return Promise.all(
      todosToComplete.map(todo => this.completeTodo(todo.id))
    );
  }
}
