/**
 * PCTX Tool for LangChain Agents
 * 
 * Allows agents to execute TypeScript code in PCTX sandbox with access to all Mimir tools
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Create PCTX execution tool
 * 
 * This tool allows agents to write TypeScript code that executes in PCTX's Deno sandbox.
 * The code has access to all Mimir functions via the `Mimir` namespace.
 * 
 * Benefits:
 * - 90-98% token reduction for multi-step operations
 * - Type-safe TypeScript execution
 * - All 13 Mimir tools available
 * - Batch operations in single call
 */
export function createPCTXTool(pctxUrl: string) {
  return new DynamicStructuredTool({
    name: 'execute_pctx_code',
    description: `Execute TypeScript code in PCTX sandbox with access to all Mimir functions. Use this for multi-step operations to save 90-98% tokens.

Available Mimir functions:
- Mimir.memoryNode({operation, type, properties, ...}) - Create/read/update/delete nodes
- Mimir.memoryEdge({operation, source, target, type, ...}) - Create/manage relationships
- Mimir.memoryBatch({operation, nodes, updates, ...}) - Batch operations
- Mimir.vectorSearchNodes({query, types, limit, ...}) - Semantic search
- Mimir.todo({operation, title, status, ...}) - Task management
- Mimir.todoList({operation, title, ...}) - Task lists
- Mimir.indexFolder({path, ...}) - Index files
- Mimir.listFolders() - List indexed folders
- Mimir.getEmbeddingStats() - Embedding statistics

Example usage:
\`\`\`typescript
// Search and batch update
const results = await Mimir.vectorSearchNodes({
  query: "pending tasks",
  types: ["todo"],
  limit: 10
});

const pending = results.results.filter(r => r.properties.status === "pending");

await Mimir.memoryBatch({
  operation: "update_nodes",
  updates: pending.map(r => ({
    id: r.id,
    properties: { status: "in_progress" }
  }))
});

return { updated: pending.length };
\`\`\`

Use this when you need to:
- Perform multiple Mimir operations
- Filter/transform data without LLM round-trips
- Batch updates
- Complex graph traversals`,
    schema: z.object({
      code: z.string().describe('TypeScript code to execute. Must define async function run() that returns a result.'),
    }),
    func: async ({ code }) => {
      try {
        // Call PCTX to execute the code
        const response = await fetch(`${pctxUrl}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'mcp-session-id': `agent-${Date.now()}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: 'execute',
              arguments: { code }
            },
            id: Date.now()
          })
        });

        if (!response.ok) {
          throw new Error(`PCTX request failed: ${response.status} ${response.statusText}`);
        }

        // Parse SSE response
        const text = await response.text();
        const events = text.split('\n')
          .filter(line => line.startsWith('data: '))
          .map(line => JSON.parse(line.substring(6)));

        const finalEvent = events[events.length - 1];
        
        if (!finalEvent?.result?.content?.[0]?.text) {
          throw new Error('No result from PCTX execution');
        }

        const resultText = finalEvent.result.content[0].text;
        
        // Parse PCTX response format: "Code Executed Successfully: true\n\n# Return Value\n```json\n{...}\n```"
        const jsonMatch = resultText.match(/```json\s*\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[1]);
          return JSON.stringify(result, null, 2);
        }
        
        // Check for execution failure
        if (resultText.includes('Code Executed Successfully: false')) {
          const stderrMatch = resultText.match(/# STDERR\s*\n([\s\S]*?)(\n#|$)/);
          const stderr = stderrMatch ? stderrMatch[1].trim() : 'Unknown error';
          throw new Error(`PCTX execution failed: ${stderr}`);
        }

        return resultText;
      } catch (error: any) {
        return `Error executing PCTX code: ${error.message}`;
      }
    },
  });
}

/**
 * Check if PCTX is configured and available
 */
export async function isPCTXAvailable(pctxUrl?: string): Promise<boolean> {
  if (!pctxUrl) {
    return false;
  }

  try {
    const response = await fetch(`${pctxUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}
