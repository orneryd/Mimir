import { DynamicStructuredTool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getWorkingDirectory, hasWorkspaceContext } from './workspace-context.js';

const execAsync = promisify(exec);

/**
 * Tool: Execute shell command
 */
export const runCommandTool = new DynamicStructuredTool({
  name: 'run_terminal_cmd',
  description: 'Execute a shell command and return its output (stdout + stderr). Use this to run tests, grep output, or any terminal commands.',
  schema: z.object({
    command: z.string().describe('The shell command to execute'),
    is_background: z.boolean().default(false).describe('Whether to run in background (not recommended for validation)'),
  }),
  func: async ({ command, is_background }) => {
    try {
      const workingDir = getWorkingDirectory();
      const contextInfo = hasWorkspaceContext() ? ` (workspace: ${workingDir})` : '';
      
      if (is_background) {
        // For background tasks, just start and return
        exec(command, { cwd: workingDir });
        return `Command started in background: ${command}${contextInfo}`;
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 300000, // 5 minute timeout
      });

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
      return output || `Command completed with no output${contextInfo}`;
    } catch (error: any) {
      return `Error executing command: ${error.message}\nExit code: ${error.code || 'unknown'}\n${error.stdout || ''}\n${error.stderr || ''}`;
    }
  },
});

/**
 * Tool: Read file contents
 */
export const readFileTool = new DynamicStructuredTool({
  name: 'read_file',
  description: 'Read and return the contents of a file. Optionally specify line offset and limit for large files.',
  schema: z.object({
    target_file: z.string().describe('Path to the file to read'),
    offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
    limit: z.number().optional().describe('Number of lines to read'),
  }),
  func: async ({ target_file, offset, limit }) => {
    try {
      const content = await fs.readFile(target_file, 'utf-8');
      const lines = content.split('\n');

      if (offset || limit) {
        const start = (offset || 1) - 1;
        const end = limit ? start + limit : lines.length;
        const selectedLines = lines.slice(start, end);
        
        return selectedLines.map((line, idx) => {
          const lineNum = start + idx + 1;
          return `${lineNum.toString().padStart(6)}|${line}`;
        }).join('\n');
      }

      return lines.map((line, idx) => {
        return `${(idx + 1).toString().padStart(6)}|${line}`;
      }).join('\n');
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  },
});

/**
 * Tool: Write/create file
 */
export const writeFileTool = new DynamicStructuredTool({
  name: 'write',
  description: 'Create a new file or overwrite an existing file with the provided contents.',
  schema: z.object({
    file_path: z.string().describe('Path where to write the file'),
    contents: z.string().describe('Contents to write to the file'),
  }),
  func: async ({ file_path, contents }) => {
    try {
      // Ensure directory exists
      const dir = path.dirname(file_path);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(file_path, contents, 'utf-8');
      return `File written successfully: ${file_path}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  },
});

/**
 * Tool: Search/replace in file
 */
export const searchReplaceTool = new DynamicStructuredTool({
  name: 'search_replace',
  description: 'Replace exact text in a file. The old_string must match exactly (including whitespace). Use replace_all to replace all occurrences.',
  schema: z.object({
    file_path: z.string().describe('Path to the file to modify'),
    old_string: z.string().describe('Exact text to find and replace'),
    new_string: z.string().describe('Text to replace with'),
    replace_all: z.boolean().default(false).describe('Replace all occurrences (default: false)'),
  }),
  func: async ({ file_path, old_string, new_string, replace_all }) => {
    try {
      const content = await fs.readFile(file_path, 'utf-8');
      
      if (!content.includes(old_string)) {
        return `Error: old_string not found in ${file_path}. Make sure the string matches exactly, including all whitespace.`;
      }

      let newContent: string;
      if (replace_all) {
        newContent = content.split(old_string).join(new_string);
      } else {
        newContent = content.replace(old_string, new_string);
      }

      await fs.writeFile(file_path, newContent, 'utf-8');
      return `File updated successfully: ${file_path}`;
    } catch (error: any) {
      return `Error modifying file: ${error.message}`;
    }
  },
});

/**
 * Tool: List directory
 */
export const listDirTool = new DynamicStructuredTool({
  name: 'list_dir',
  description: 'List files and directories in a given path.',
  schema: z.object({
    target_directory: z.string().describe('Directory to list'),
    ignore_globs: z.array(z.string()).optional().describe('Optional glob patterns to ignore (e.g., "node_modules", "*.log")'),
  }),
  func: async ({ target_directory, ignore_globs }) => {
    try {
      const entries = await fs.readdir(target_directory, { withFileTypes: true });
      
      let filtered = entries.filter(entry => !entry.name.startsWith('.'));
      
      if (ignore_globs) {
        // Simple glob matching (just contains check for now)
        filtered = filtered.filter(entry => {
          return !ignore_globs.some(pattern => {
            const cleanPattern = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
            return entry.name.includes(cleanPattern);
          });
        });
      }

      const dirs = filtered.filter(e => e.isDirectory()).map(e => `${e.name}/`);
      const files = filtered.filter(e => e.isFile()).map(e => e.name);

      return [...dirs, ...files].join('\n') || 'Empty directory';
    } catch (error: any) {
      return `Error listing directory: ${error.message}`;
    }
  },
});

/**
 * Tool: Grep/search files
 */
export const grepTool = new DynamicStructuredTool({
  name: 'grep',
  description: 'Search for patterns in files using regex. Returns matching lines with line numbers.',
  schema: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('File or directory to search (defaults to current directory)'),
    type: z.string().optional().describe('File type filter (e.g., "ts", "js", "md")'),
    output_mode: z.enum(['content', 'files_with_matches', 'count']).default('content').describe('Output mode'),
    case_insensitive: z.boolean().default(false).describe('Case insensitive search'),
  }),
  func: async ({ pattern, path: searchPath, type, output_mode, case_insensitive }) => {
    try {
      let cmd = `rg --json "${pattern.replace(/"/g, '\\"')}"`;
      
      if (case_insensitive) cmd += ' -i';
      if (type) cmd += ` --type ${type}`;
      if (output_mode === 'files_with_matches') cmd += ' -l';
      if (output_mode === 'count') cmd += ' -c';
      if (searchPath) cmd += ` "${searchPath}"`;

      const { stdout } = await execAsync(cmd, {
        cwd: getWorkingDirectory(),
        maxBuffer: 10 * 1024 * 1024,
      });

      return stdout || 'No matches found';
    } catch (error: any) {
      if (error.code === 1) {
        return 'No matches found';
      }
      return `Error searching: ${error.message}`;
    }
  },
});

/**
 * Tool: Delete file
 */
export const deleteFileTool = new DynamicStructuredTool({
  name: 'delete_file',
  description: 'Delete a file from the filesystem.',
  schema: z.object({
    target_file: z.string().describe('Path to the file to delete'),
  }),
  func: async ({ target_file }) => {
    try {
      await fs.unlink(target_file);
      return `File deleted: ${target_file}`;
    } catch (error: any) {
      return `Error deleting file: ${error.message}`;
    }
  },
});

/**
 * Tool: Web fetch
 */
export const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Search the web for information. Use this to fetch documentation, research best practices, or find current information. For search queries, returns a summary. For direct URLs, fetches the full content.',
  schema: z.object({
    search_term: z.string().describe('The search query or URL to fetch'),
  }),
  func: async ({ search_term }) => {
    try {
      // Check if it's a direct URL
      const isUrl = search_term.startsWith('http://') || search_term.startsWith('https://');
      
      if (isUrl) {
        // Direct fetch
        const response = await fetch(search_term, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });
        
        if (!response.ok) {
          return `Error fetching URL: ${response.status} ${response.statusText}`;
        }
        
        const text = await response.text();
        
        // Limit response size
        const maxLength = 50000;
        if (text.length > maxLength) {
          return text.substring(0, maxLength) + '\n\n[Content truncated - response was too long]';
        }
        
        return text;
      } else {
        // Search query - provide a helpful response with recommended approach
        return `Web search for "${search_term}":

RECOMMENDATION: For the most accurate and up-to-date information, please use one of these approaches:

1. **Use your general knowledge** to provide a baseline answer about ${search_term}
2. **Check local files** using grep or list_dir to see if relevant documentation exists
3. **Fetch specific documentation URLs** if you know them (e.g., official docs, GitHub repos)

EXAMPLE URLS TO TRY:
- Official documentation sites (e.g., https://docs.pinecone.io, https://weaviate.io/developers/weaviate, https://qdrant.tech/documentation/)
- GitHub repositories (e.g., https://github.com/pinecone-io/pinecone-python-client)
- API reference pages

NOTE: Automated web search scraping is unreliable due to anti-bot protections. If you need current pricing or feature information, provide a structured response based on general knowledge and clearly mark what information is missing or needs manual verification.`;
      }
    } catch (error: any) {
      // Check if it's a timeout
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        return `Error: Request timed out after 10 seconds. The URL may be slow or unreachable.`;
      }
      return `Error with web search: ${error.message}`;
    }
  },
});

/**
 * Export file system tools
 */
export const fileSystemTools = [
  runCommandTool,
  readFileTool,
  writeFileTool,
  searchReplaceTool,
  listDirTool,
  grepTool,
  deleteFileTool,
  webSearchTool,
];

/**
 * Export all tools (includes MCP tools)
 */
import { mcpTools, consolidatedMCPTools, getMCPToolNames } from './mcp-tools.js';
import { memoryNodeTool, memoryEdgeTool } from './mcp-tools.js';

/**
 * Consolidated tools (8 filesystem + 6 MCP = 14 total, +1 PCTX if configured)
 * RECOMMENDED for chat agents to avoid tool limit and reduce API calls
 */
export const consolidatedTools = [
  ...fileSystemTools,
  ...consolidatedMCPTools,
];

/**
 * Get consolidated tools with optional PCTX support
 * Call this instead of using consolidatedTools directly to get PCTX integration
 */
export async function getConsolidatedTools(includePCTX: boolean = true): Promise<StructuredToolInterface[]> {
  const tools: StructuredToolInterface[] = [...consolidatedTools];
  
  if (includePCTX) {
    const pctxUrl = process.env.PCTX_URL || 'http://localhost:8080';
    const { createPCTXTool, isPCTXAvailable } = await import('./pctx-tool.js');
    
    if (await isPCTXAvailable(pctxUrl)) {
      console.log(`✅ PCTX available at ${pctxUrl}, adding execute_pctx_code tool`);
      tools.push(createPCTXTool(pctxUrl) as StructuredToolInterface);
    } else {
      console.log(`⚠️  PCTX not available at ${pctxUrl}, skipping PCTX tool`);
    }
  }
  
  return tools;
}

/**
 * Planning tools for PM/Ecko agents (8 filesystem + 2 MCP = 10 total)
 * Minimal toolset for planning and high-level coordination
 */
export const planningTools = [
  ...fileSystemTools,
  memoryNodeTool,  // All node operations: add, get, update, delete, query, search
  memoryEdgeTool,  // All edge operations: add, delete, get, neighbors, subgraph
];

/**
 * Get tool names for logging
 */
export function getToolNames(): string[] {
  const fsTools = fileSystemTools.map(tool => tool.name);
  const mcp = getMCPToolNames();
  return [...fsTools, ...mcp];
}

