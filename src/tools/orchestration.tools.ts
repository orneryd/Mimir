/**
 * Orchestration Tools
 * 
 * MCP tools for executing workflows with LLM agents via Mimir's orchestration API
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const orchestrationTools: Tool[] = [
  {
    name: 'execute_workflow',
    description: 'Execute a workflow with parallel LLM agents. Each task uses the copilot-api to generate actual content (code, tests, docs). Returns execution ID for tracking progress. Tasks can have dependencies and run in parallel groups.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Array of tasks to execute. Tasks with same parallelGroup run in parallel.',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique task ID (e.g., "task-1")'
              },
              title: {
                type: 'string',
                description: 'Task title'
              },
              prompt: {
                type: 'string',
                description: 'Prompt for the LLM agent to execute'
              },
              agentRoleDescription: {
                type: 'string',
                description: 'Role description for the agent (e.g., "TypeScript test generator")'
              },
              recommendedModel: {
                type: 'string',
                description: 'LLM model to use (e.g., "gpt-4o", "claude-sonnet-4.5")',
                default: 'gpt-4o'
              },
              parallelGroup: {
                type: 'number',
                description: 'Tasks with same group number run in parallel',
                default: 1
              },
              dependencies: {
                type: 'array',
                description: 'Array of task IDs this task depends on',
                items: { type: 'string' },
                default: []
              },
              successCriteria: {
                type: 'array',
                description: 'Criteria for task success',
                items: { type: 'string' },
                default: []
              },
              maxRetries: {
                type: 'number',
                description: 'Maximum retry attempts',
                default: 2
              }
            },
            required: ['id', 'title', 'prompt', 'agentRoleDescription']
          }
        }
      },
      required: ['tasks']
    }
  },
  {
    name: 'get_execution_status',
    description: 'Get the current status of a workflow execution',
    inputSchema: {
      type: 'object',
      properties: {
        execution_id: {
          type: 'string',
          description: 'ID of the execution (returned from execute_workflow)'
        }
      },
      required: ['execution_id']
    }
  },
  {
    name: 'get_execution_results',
    description: 'Get the results from a completed workflow execution, including all task outputs and deliverables',
    inputSchema: {
      type: 'object',
      properties: {
        execution_id: {
          type: 'string',
          description: 'ID of the execution'
        }
      },
      required: ['execution_id']
    }
  },
  {
    name: 'cancel_execution',
    description: 'Cancel a running workflow execution',
    inputSchema: {
      type: 'object',
      properties: {
        execution_id: {
          type: 'string',
          description: 'ID of the execution to cancel'
        }
      },
      required: ['execution_id']
    }
  }
];
