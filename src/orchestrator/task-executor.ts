/**
 * Task Executor - Executes tasks from chain output
 * 
 * Flow:
 * 1. Parse chain-output.md to extract tasks
 * 2. For each unique agent role, generate preamble via agentinator
 * 3. Execute tasks sequentially with appropriate preambles
 */

import { CopilotAgentClient } from './llm-client.js';
import { LLMConfigLoader } from '../config/LLMConfigLoader.js';
import { createGraphManager } from '../managers/index.js';
import type { GraphManager } from '../managers/GraphManager.js';
import { consolidatedTools } from './tools.js';
import { CancellationError, type CancellationToken } from './cancellation.js';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Module-level GraphManager instance (initialized on first use)
let graphManagerInstance: GraphManager | null = null;

/**
 * Get or create GraphManager instance
 */
async function getGraphManager(): Promise<GraphManager> {
  if (!graphManagerInstance) {
    graphManagerInstance = await createGraphManager();
  }
  return graphManagerInstance;
}

/**
 * Parse PM-recommended model string
 * Format can be: "provider/model" or just "model" (uses default provider)
 * No validation - trust the downstream API to validate model names
 */
async function parsePMRecommendedModel(
  recommendedModel: string
): Promise<{ provider: string; model: string } | null> {
  if (!recommendedModel || recommendedModel.trim() === '') {
    return null;
  }

  const configLoader = LLMConfigLoader.getInstance();
  const recommended = recommendedModel.trim();
  
  if (recommended.includes('/')) {
    // Format: "ollama/gpt-oss" or "copilot/gpt-4o"
    const [provider, model] = recommended.split('/').map(s => s.trim());
    return { provider, model };
  } else {
    // Format: just "gpt-oss" - use default provider
    const config = await configLoader.load();
    const defaultProvider = config.defaultProvider;
    return { provider: defaultProvider, model: recommended };
  }
}

/**
 * Resolve model selection based on PM suggestion and feature flag
 * Returns { provider?, model?, agentType? } for CopilotAgentClient constructor
 */
async function resolveModelSelection(
  task: TaskDefinition,
  agentType: 'pm' | 'worker' | 'qc'
): Promise<{ provider?: string; model?: string; agentType?: 'pm' | 'worker' | 'qc' }> {
  const configLoader = LLMConfigLoader.getInstance();
  const pmSuggestionsEnabled = await configLoader.isPMModelSuggestionsEnabled();
  
  // Always parse the PM's recommendation (for logging/debugging)
  const pmSuggestion = await parsePMRecommendedModel(task.recommendedModel);
  
  // Only use PM suggestion if feature is enabled AND parsing succeeded
  if (pmSuggestionsEnabled && pmSuggestion) {
    console.log(`✨ Using PM-suggested model: ${pmSuggestion.provider}/${pmSuggestion.model}`);
    return { provider: pmSuggestion.provider, model: pmSuggestion.model };
  }
  
  // Feature disabled or no valid PM suggestion - use agent type defaults
  if (pmSuggestion && !pmSuggestionsEnabled) {
    console.log(`📋 PM suggested ${pmSuggestion.provider}/${pmSuggestion.model} but feature is disabled, using ${agentType} defaults`);
  }
  
  return { agentType };
}

export interface TaskDefinition {
  id: string;
  title: string;
  agentRoleDescription: string;
  recommendedModel: string;
  prompt: string;
  dependencies: string[];
  estimatedDuration: string;
  parallelGroup?: number; // Tasks with same parallelGroup can run concurrently
  
  // Task type - 'agent' (default) or 'transformer'
  taskType?: 'agent' | 'transformer';
  
  // Transformer-specific fields
  lambdaId?: string; // Reference to Lambda script for transformer tasks
  lambdaScript?: string; // Inline Lambda script content
  lambdaLanguage?: 'typescript' | 'javascript' | 'python';
  lambdaName?: string; // Name of the lambda for logging
  
  // QC Verification fields
  qcRole?: string; // QC Agent Role Description
  verificationCriteria?: string; // Checklist for QC verification
  maxRetries?: number; // Max retry attempts before failure
  qcPreamblePath?: string; // Path to generated QC preamble
  estimatedToolCalls?: number; // PM's estimate for circuit breaker (system applies 1.5x multiplier)
}

export interface QCResult {
  passed: boolean;
  score: number;
  feedback: string;
  issues: string[];
  requiredFixes: string[];
  timestamp?: string;
}

export interface ExecutionResult {
  taskId: string;
  status: 'success' | 'failure';
  output: string;
  error?: string;
  duration: number;
  preamblePath: string;
  agentRoleDescription?: string;
  prompt?: string;
  tokens?: {
    input: number;
    output: number;
  };
  toolCalls?: number;
  graphNodeId?: string; // ID of graph node storing this result
  
  // QC Verification results
  qcVerification?: QCResult; // Final QC result
  qcVerificationHistory?: QCResult[]; // All QC attempts
  qcFailureReport?: string; // QC-generated failure report if maxRetries exceeded
  attemptNumber?: number; // Which attempt this result represents
  
  // Circuit Breaker results
  circuitBreakerAnalysis?: string; // QC analysis when circuit breaker triggers
  
  // Agent chatter for SSE logging (truncated for browser console)
  preamblePreview?: string; // First 500 chars of preamble
  outputPreview?: string; // First 1000 chars of output
}

/**
 * Organize tasks into parallel execution batches based on dependencies
 * 
 * Analyzes task dependencies and creates execution batches where tasks
 * with satisfied dependencies can run in parallel. Supports explicit
 * parallel groups for fine-grained control over concurrent execution.
 * 
 * **Features**:
 * - Automatic dependency resolution
 * - Parallel execution of independent tasks
 * - Explicit parallel groups via `parallelGroup` property
 * - Circular dependency detection
 * 
 * @param tasks - Array of task definitions with dependencies
 * @returns Array of task batches for parallel execution
 * @throws {Error} If circular dependencies or invalid task graph detected
 * 
 * @example
 * // Simple parallel execution - independent tasks run together
 * const tasks = [
 *   { id: 't1', dependencies: [], title: 'Setup database' },
 *   { id: 't2', dependencies: [], title: 'Setup API' },
 *   { id: 't3', dependencies: ['t1', 't2'], title: 'Run tests' }
 * ];
 * const batches = organizeTasks(tasks);
 * // Returns: [[t1, t2], [t3]]
 * // Batch 1: t1 and t2 run in parallel
 * // Batch 2: t3 runs after both complete
 * 
 * @example
 * // Sequential execution - each task depends on previous
 * const tasks = [
 *   { id: 't1', dependencies: [], title: 'Build' },
 *   { id: 't2', dependencies: ['t1'], title: 'Test' },
 *   { id: 't3', dependencies: ['t2'], title: 'Deploy' }
 * ];
 * const batches = organizeTasks(tasks);
 * // Returns: [[t1], [t2], [t3]]
 * // Each task runs sequentially
 * 
 * @example
 * // Explicit parallel groups - PM controls parallelism
 * const tasks = [
 *   { id: 't1', dependencies: [], parallelGroup: 1, title: 'Frontend' },
 *   { id: 't2', dependencies: [], parallelGroup: 1, title: 'Backend' },
 *   { id: 't3', dependencies: [], parallelGroup: 2, title: 'Database' },
 *   { id: 't4', dependencies: ['t1', 't2', 't3'], title: 'Integration' }
 * ];
 * const batches = organizeTasks(tasks);
 * // Returns: [[t1, t2], [t3], [t4]]
 * // Group 1: t1 and t2 run together
 * // Group 2: t3 runs separately
 * // t4 runs after all complete
 * 
 * @example
 * // Error handling - circular dependency
 * const tasks = [
 *   { id: 't1', dependencies: ['t2'] },
 *   { id: 't2', dependencies: ['t1'] }
 * ];
 * try {
 *   organizeTasks(tasks);
 * } catch (error) {
 *   console.error('Circular dependency:', error.message);
 *   // Error: Cannot resolve dependencies for tasks: t1, t2
 * }
 */
export function organizeTasks(tasks: TaskDefinition[]): TaskDefinition[][] {
  const batches: TaskDefinition[][] = [];
  const completed = new Set<string>();
  const remaining = new Set(tasks.map(t => t.id));
  
  while (remaining.size > 0) {
    // Find all tasks whose dependencies are satisfied
    const ready = tasks.filter(task => 
      remaining.has(task.id) && 
      task.dependencies.every(dep => completed.has(dep))
    );
    
    if (ready.length === 0) {
      // Circular dependency or invalid task graph
      const remainingTasks = Array.from(remaining).join(', ');
      throw new Error(`Cannot resolve dependencies for tasks: ${remainingTasks}`);
    }
    
    // Group tasks by parallelGroup if specified, otherwise treat each as its own group
    const groupMap = new Map<number, TaskDefinition[]>();
    ready.forEach(task => {
      const group = task.parallelGroup ?? -1; // -1 for ungrouped tasks
      const existing = groupMap.get(group) || [];
      existing.push(task);
      groupMap.set(group, existing);
    });
    
    // If PM explicitly marked tasks with same parallelGroup, they run together
    // Otherwise, all ready tasks in this batch can run in parallel
    if (groupMap.size === 1 && groupMap.has(-1)) {
      // All ungrouped - they can all run in parallel
      batches.push(ready);
    } else {
      // Has explicit groups - create separate batches for each group
      groupMap.forEach(groupTasks => {
        batches.push(groupTasks);
      });
    }
    
    // Mark these tasks as completed for next iteration
    ready.forEach(task => {
      completed.add(task.id);
      remaining.delete(task.id);
    });
  }
  
  return batches;
}

/**
 * Parse tasks from chain output markdown
 * 
 * Expected format:
 * ### Task ID: task-1.1
 * #### **Agent Role Description**
 * [role text]
 * #### **Recommended Model**
 * [model]
 * #### **Optimized Prompt**
 * <details>...```markdown\n[prompt]\n```...</details>
 * #### **Dependencies**
 * [deps]
 * #### **Estimated Duration**
 * [duration]
 * #### **QC Agent Role**
 * [qc role text]
 * #### **Verification Criteria**
 * [criteria]
 * #### **Max Retries**
 * [number]
 */
/**
 * Parse chain output markdown into task definitions
 * 
 * Extracts structured task information from PM-generated markdown with
 * flexible field matching to handle variations in PM output format.
 * 
 * **Supported Fields**:
 * - **Task ID**: Required, format `task-N.M`
 * - **Agent Role Description**: Worker agent role (with aliases)
 * - **Recommended Model**: LLM model suggestion (optional)
 * - **Optimized Prompt**: Task instructions (supports `<details>` and `<prompt>` tags)
 * - **Dependencies**: Task IDs this task depends on
 * - **Estimated Duration**: Time estimate (optional)
 * - **QC Agent Role**: QC verification role (optional)
 * - **Verification Criteria**: Success criteria for QC (optional)
 * - **Max Retries**: Retry limit (default: 2)
 * - **Estimated Tool Calls**: For circuit breaker (optional)
 * - **Parallel Group**: Group ID for parallel execution (optional)
 * 
 * **Flexible Parsing**:
 * - Case-insensitive field names
 * - Multiple aliases per field (e.g., "Agent Role" or "Worker Role")
 * - Handles `<details>` collapsible sections
 * - Extracts from `<prompt>` XML tags
 * - Deduplicates dependencies
 * - Removes self-references
 * 
 * @param markdown - Chain output markdown content from PM agent
 * @returns Array of parsed task definitions ready for execution
 * 
 * @example
 * // Parse PM output from file
 * const markdown = await fs.readFile('chain-output.md', 'utf-8');
 * const tasks = parseChainOutput(markdown);
 * console.log(`Parsed ${tasks.length} tasks`);
 * 
 * tasks.forEach(task => {
 *   console.log(`Task ${task.id}:`);
 *   console.log(`  Role: ${task.agentRoleDescription}`);
 *   console.log(`  Dependencies: ${task.dependencies.join(', ') || 'none'}`);
 *   console.log(`  QC: ${task.qcRole ? 'enabled' : 'disabled'}`);
 * });
 * 
 * @example
 * // Standard PM output format
 * const markdown = `
 * **Task ID:** task-1.1
 * **Agent Role Description**
 * Senior Backend Developer
 * **Recommended Model**
 * ollama/qwen2.5-coder:32b
 * **Optimized Prompt**
 * <details>
 * <summary>Click to expand</summary>
 * <prompt>
 * Implement user authentication with JWT tokens.
 * </prompt>
 * </details>
 * **Dependencies**
 * None
 * **Estimated Duration**
 * 2 hours
 * **QC Agent Role**
 * Security Auditor
 * **Verification Criteria**
 * - JWT tokens properly signed
 * - Refresh token rotation implemented
 * - Password hashing uses bcrypt
 * **Max Retries**
 * 3
 * `;
 * 
 * const tasks = parseChainOutput(markdown);
 * console.log(tasks[0].id); // 'task-1.1'
 * console.log(tasks[0].agentRoleDescription); // 'Senior Backend Developer'
 * console.log(tasks[0].maxRetries); // 3
 * 
 * @example
 * // With dependencies and parallel groups
 * const markdown = `
 * **Task ID:** task-1.1
 * **Agent Role Description:** Frontend Developer
 * **Parallel Group:** 1
 * **Dependencies:** None
 * 
 * **Task ID:** task-1.2
 * **Agent Role Description:** Backend Developer  
 * **Parallel Group:** 1
 * **Dependencies:** None
 * 
 * **Task ID:** task-2.1
 * **Agent Role Description:** Integration Tester
 * **Dependencies:** task-1.1, task-1.2
 * `;
 * 
 * const tasks = parseChainOutput(markdown);
 * // task-1.1 and task-1.2 can run in parallel (same group)
 * // task-2.1 waits for both to complete
 * console.log(tasks[0].parallelGroup); // 1
 * console.log(tasks[1].parallelGroup); // 1
 * console.log(tasks[2].dependencies); // ['task-1.1', 'task-1.2']
 */
export function parseChainOutput(markdown: string): TaskDefinition[] {
  const tasks: TaskDefinition[] = [];
  
  // FLEXIBLE TASK SECTION SPLITTING
  // Handles the standard format:
  // **Task ID:** task-1.1
  // This is consistent with other field names like **Agent Role Description**, **Recommended Model**, etc.
  // Split on lines that start with **Task ID:** (with optional whitespace before)
  const possibleTaskSections = markdown.split(/\n(?=\s*\*\*Task ID:\*\*)/i);
  
  for (const section of possibleTaskSections) {
    if (!section.trim()) continue;
    
    // FLEXIBLE TASK ID EXTRACTION
    // MUST match **Task ID:** field specifically (not just any "task-N" reference)
    // Examples: **Task ID:** task-1.1, **Task ID:** task 1.1, **TASK ID:** Task-1.1
    const taskIdMatch = section.match(/\*\*Task\s+ID:\*\*\s*task[-\s]*(\d+(?:\.\d+)?)/i);
    if (!taskIdMatch) continue;
    
    const taskId = `task-${taskIdMatch[1]}`;
    
    // FLEXIBLE FIELD EXTRACTION
    // Match field names with bold markers and colons:
    // **Field Name:** content
    // Captures content until next field (must have **FieldName:**) or end of section
    const extractField = (fieldName: string, aliases: string[] = []): string | undefined => {
      const allNames = [fieldName, ...aliases];
      
      for (const name of allNames) {
        // Pattern: **FieldName:** followed by content
        // Captures until next **FieldName:** pattern or end of section
        // Lookahead matches: newline + **SomeText:**** (field name pattern)
        const pattern = new RegExp(
          `\\*\\*${name}:\\*\\*\\s*\\n?([\\s\\S]+?)(?=\\n\\*\\*[A-Za-z][A-Za-z\\s]+:\\*\\*|$)`,
          'i'
        );
        const match = section.match(pattern);
        if (match) return match[1].trim();
      }
      
      return undefined;
    };
    
    // Extract fields with LOOSE matching (multiple aliases for each field)
    
    // Parallel Group (optional)
    const parallelGroupText = extractField('Parallel Group', ['Parallel', 'Group']);
    const parallelGroup = parallelGroupText ? parseInt(parallelGroupText, 10) : undefined;
    
    // Agent Role / Worker Role (try multiple names)
    const agentRole = extractField('Agent Role Description', ['Worker Role', 'Agent Role', 'Role Description', 'Role']) 
                   || extractField('Worker Role', [])
                   || extractField('Agent Role', []);
    
    // Use taskId as fallback if no role found
    const finalAgentRole = agentRole || `Agent for ${taskId}`;
    
    // Recommended Model (optional - default to gpt-4.1)
    const model = extractField('Recommended Model', ['Model', 'Recommended']) || 'gpt-4.1';
    
    // Prompt (try multiple field names, be very loose)
    let prompt: string | undefined;
    const promptSection = extractField('Optimized Prompt', ['Prompt', 'Task Description', 'Description', 'Instructions', 'Work'])
                       || extractField('Prompt', [])
                       || extractField('Description', []);
    
    if (promptSection) {
      // First, check if there's a <details> block and extract content from it
      const detailsMatch = promptSection.match(/<details>[\s\S]*?<\/summary>\s*([\s\S]+?)\s*<\/details>/i);
      let contentToSearch = detailsMatch ? detailsMatch[1] : promptSection;
      
      // Now try to extract from <prompt> tags
      const promptTagMatch = contentToSearch.match(/<prompt>\s*([\s\S]+?)\s*<\/prompt>/i);
      if (promptTagMatch) {
        prompt = promptTagMatch[1].trim();
      } else {
        // Strip HTML tags and use content
        prompt = contentToSearch.replace(/<[^>]+>/g, '').trim();
      }
    }
    
    // If still no prompt, try to extract from the section content itself
    if (!prompt || prompt.length < 20) {
      // Look for any substantial paragraph after the task ID
      const paragraphs = section.split(/\n\n+/);
      for (const para of paragraphs) {
        const cleaned = para.replace(/^\s*[-*]\s*\*\*[^*]+\*\*[:\s]*/gm, '').trim();
        if (cleaned.length > 50 && !cleaned.match(/^#{1,4}\s/)) {
          prompt = cleaned;
          break;
        }
      }
    }
    
    // If still no prompt, use section content
    if (!prompt) {
      prompt = section.substring(0, 500).trim() || `Task ${taskId}`;
    }
    
    // Dependencies (very loose - look for task IDs)
    const depsText = extractField('Dependencies', ['Depends On', 'Requires', 'After']);
    let deps: string[] = [];
    if (depsText) {
      if (depsText.toLowerCase().includes('none') || depsText.toLowerCase().includes('n/a')) {
        deps = [];
      } else {
        // Extract all task-X.Y patterns from the text
        const taskIdMatches = depsText.match(/task[-\s]*\d+\.\d+/gi);
        if (taskIdMatches) {
          deps = taskIdMatches.map(t => t.replace(/\s/g, '-').toLowerCase());
        } else {
          // Fallback: split by comma
          deps = depsText.split(/[,;]/).map(d => d.trim()).filter(d => d);
        }
      }
      
      // DEDUPLICATION: Remove duplicates and self-references
      deps = [...new Set(deps)]; // Remove exact duplicates
      deps = deps.filter(d => d !== taskId); // Remove self-references
    }
    
    // Estimated Duration (optional - default to "30 min")
    const duration = extractField('Estimated Duration', ['Duration', 'Time', 'Estimate']) || '30 min';
    
    // QC Agent Role (optional)
    const qcRole = extractField('QC Agent Role', ['QC Role', 'Verification Role', 'Reviewer']);
    
    // Verification Criteria (optional)
    const verificationCriteria = extractField('Verification Criteria', ['Criteria', 'Acceptance Criteria', 'Success Criteria', 'Checks']);
    
    // Max Retries (optional - default to 2)
    const retriesText = extractField('Max Retries', ['Retries', 'Max Attempts', 'Attempts']);
    const maxRetries = retriesText ? parseInt(retriesText, 10) : 2;
    
    // Estimated Tool Calls (optional - for dynamic circuit breaker)
    const toolCallsText = extractField('Estimated Tool Calls', ['Tool Calls', 'Tool Call Estimate', 'Expected Tool Calls']);
    let estimatedToolCalls: number | undefined;
    if (toolCallsText) {
      // Extract first number from text (handles formats like "15" or "15 calls" or "~20")
      const numberMatch = toolCallsText.match(/\d+/);
      if (numberMatch) {
        estimatedToolCalls = parseInt(numberMatch[0], 10);
      }
    }
    
    // DEBUG: Log what we extracted
    console.log(`\n🔍 DEBUG: Parsed task ${taskId}:`);
    console.log(`   Agent Role: "${finalAgentRole}"`);
    console.log(`   QC Role: "${qcRole || 'none'}"`);
    console.log(`   Prompt length: ${prompt.length} chars`);
    
    tasks.push({
      id: taskId,
      title: taskId,
      agentRoleDescription: finalAgentRole,
      recommendedModel: model,
      prompt: prompt,
      dependencies: deps,
      estimatedDuration: duration,
      parallelGroup,
      qcRole,
      verificationCriteria,
      maxRetries,
      estimatedToolCalls,
    });
  }
  
  console.log(`\n✅ Parsed ${tasks.length} tasks total\n`);
  return tasks;
}

/**
 * Save generated preamble to Neo4j for later retrieval and reuse
 */
async function savePreambleToDatabase(
  roleDescription: string,
  content: string,
  roleHash: string,
  isQC: boolean,
  generatedBy: string | boolean
): Promise<void> {
  try {
    const graphManager = await getGraphManager();
    
    // Extract name from role description (first 3-5 words)
    const words = roleDescription.trim().split(/\s+/);
    const name = words.slice(0, Math.min(5, words.length)).join(' ');
    
    const agentType = isQC ? 'qc' : 'worker';
    const generatedByStr = typeof generatedBy === 'boolean' 
      ? (generatedBy ? 'agentinator' : 'manual')
      : generatedBy;
    
    // Store in Neo4j with full metadata
    await graphManager.addNode('preamble', {
      name,
      role: roleDescription,
      agentType,
      content,
      version: '1.0',
      created: new Date().toISOString(),
      generatedBy: generatedByStr,
      roleDescription,
      roleHash,
      charCount: content.length,
      usedCount: 1,
      lastUsed: new Date().toISOString()
    });
    
    console.log(`  💾 Saved preamble to database (roleHash: ${roleHash})`);
  } catch (error: any) {
    console.error(`  ⚠️  Failed to save preamble to database: ${error.message}`);
    // Don't throw - this is not critical for execution to continue
  }
}

/**
 * Generate agent preamble via Agentinator
 * 
 * Creates specialized agent preamble for given role using LLM generation.
 * 
 * @param roleDescription - Description of agent role and responsibilities
 * @param outputDir - Directory to save generated preamble
 * @param taskExample - Optional task for context
 * @returns Generated preamble content
 * 
 * @example
 * const preamble = await generatePreamble(
 *   'Implement authentication with JWT tokens',
 *   'generated-agents'
 * );
 */
export async function generatePreamble(
  roleDescription: string,
  outputDir: string = 'generated-agents',
  taskExample?: TaskDefinition, // Optional: first task using this role for context
  isQC: boolean = false // Whether this is a QC agent
): Promise<string> {
  // Create hash of role description for database lookup
  const roleHash = crypto.createHash('md5').update(roleDescription).digest('hex').substring(0, 8);
  
  // CHECK DATABASE FIRST for existing preamble by roleHash (NO DISK I/O)
  try {
    const graphManager = await getGraphManager();
    const driver = graphManager.getDriver();
    const session = driver.session();
    
    try {
      const result = await session.run(`
        MATCH (n:Node {type: 'preamble'})
        WHERE n.roleHash = $roleHash
        RETURN n.content as content, n.id as id, n.usedCount as usedCount
        LIMIT 1
      `, { roleHash });
      
      if (result.records.length > 0) {
        const content = result.records[0].get('content');
        const nodeId = result.records[0].get('id');
        const rawUsedCount = result.records[0].get('usedCount') || 0;
        // TODO: Remove BigInt cast once NornicDB returns integers as Number instead of BigInt
        const usedCount = typeof rawUsedCount === 'bigint' ? Number(rawUsedCount) : (rawUsedCount?.toNumber?.() || rawUsedCount || 0);
        
        // Update usedCount and lastUsed
        await graphManager.updateNode(nodeId, {
          usedCount: usedCount + 1,
          lastUsed: new Date().toISOString()
        });
        
        console.log(`  ♻️  Reusing preamble from database (${content.length} chars, used ${usedCount + 1}x)`);
        return content; // Return content directly - NO DISK I/O
      }
    } finally {
      await session.close();
    }
  } catch (dbError: any) {
    console.error(`  ⚠️  Database check failed: ${dbError.message}`);
    // Continue to generation if database check fails
  }
  
  console.log(`  🔨 Generating preamble for role: ${roleDescription.substring(0, 60)}...`);
  
  // Try agentinator first, but fall back to simple preamble if it fails
  let preambleContent = '';
  let usedAgentinator = false;
  
  try {
    // Call Agentinator API directly (NO DISK I/O)
    const agentType = isQC ? 'qc' : 'worker';
    const agentinatorPath = path.join(__dirname, '../../docs/agents/v2/02-agentinator-preamble.md');
    const agentinatorPreamble = await fs.readFile(agentinatorPath, 'utf-8');
    const templatePath = path.join(__dirname, '../../docs/agents/v2/templates', agentType === 'worker' ? 'worker-template.md' : 'qc-template.md');
    const template = await fs.readFile(templatePath, 'utf-8');
    
    const agentinatorPrompt = `${agentinatorPreamble}\n\n---\n\n## INPUT\n\n<agent_type>\n${agentType}\n</agent_type>\n\n<role_description>\n${roleDescription}\n</role_description>\n\n<template_path>\n${agentType === 'worker' ? 'templates/worker-template.md' : 'templates/qc-template.md'}\n</template_path>\n\n---\n\n<template_content>\n${template}\n</template_content>\n\n---\n\nGenerate the complete ${agentType} preamble now. Output the preamble directly as markdown (no code fences, no explanations).`;
    
    // Simple concatenation: base URL + path
    const baseUrl = process.env.MIMIR_LLM_API || 'http://copilot-api:4141';
    const chatPath = process.env.MIMIR_LLM_API_PATH || '/v1/chat/completions';
    const apiUrl = `${baseUrl}${chatPath}`;
    const apiKey = process.env.MIMIR_LLM_API_KEY || 'dummy-key';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: 'gpt-4.1', messages: [{ role: 'user', content: agentinatorPrompt }], temperature: 0.3, max_tokens: 16000 }),
    });
    
    if (!response.ok) throw new Error(`Agentinator API error: ${response.status}`);
    const data = await response.json();
    preambleContent = data.choices[0]?.message?.content || '';
    if (!preambleContent) throw new Error('Agentinator returned empty preamble');
    
    usedAgentinator = true;
    console.log(`  ✅ Agentinator generated ${preambleContent.length} char preamble`);
    await savePreambleToDatabase(roleDescription, preambleContent, roleHash, isQC, usedAgentinator);
    return preambleContent; // Return content - NO DISK I/O
  } catch (error: any) {
    console.error(`  ❌ Agentinator failed: ${error.message}`);
    console.warn(`  ⚠️  Falling back to simple preamble...`);
  }
  
  // Fallback: Create a simple but effective preamble directly (NO DISK I/O)
  const simplePreamble = `# Agent Preamble

## Role Description

${roleDescription}

## Instructions

You are an expert software engineer tasked with completing this specific role. Follow these guidelines:

1. **Read the task prompt carefully** - Understand all requirements before starting
2. **Use available tools** - You have access to filesystem, terminal, and search tools
3. **Work incrementally** - Make small changes and verify they work
4. **Be thorough** - Complete all aspects of the task
5. **Handle errors** - If something fails, debug and fix it
6. **Follow best practices** - Write clean, maintainable, well-tested code
7. **Document changes** - Add comments and update documentation as needed

## Available Tools

You have access to:
- **File operations**: read_file, write, search_replace, list_dir, grep, delete_file
- **Terminal**: run_terminal_cmd (for running commands, tests, builds)
- **Search**: web_search (for looking up documentation, examples)
- **Graph operations**: For storing/retrieving context from the knowledge graph

## Success Criteria

Your task is complete when:
- All requirements in the task prompt are met
- Code compiles/runs without errors
- Tests pass (if applicable)
- No regressions introduced
- Changes are well-documented

## Communication Style

- Be concise but thorough
- Explain your reasoning briefly
- Report what you're doing as you work
- Ask for clarification if requirements are ambiguous
`;

  console.log(`  ✅ Created simple preamble (${simplePreamble.length} chars)`);
  await savePreambleToDatabase(roleDescription, simplePreamble, roleHash, isQC, false);
  return simplePreamble; // Return content - NO DISK I/O
}

/**
 * Store task execution result in the knowledge graph for later retrieval
 */
async function storeTaskResultInGraph(
  task: TaskDefinition,
  result: Omit<ExecutionResult, 'graphNodeId'>
): Promise<string> {
  try {
    const graphManager = await getGraphManager();
    
    const node = await graphManager.addNode('todo', {
      title: `Task Execution: ${task.id}`,
      taskId: task.id,
      agentRole: task.agentRoleDescription,
      recommendedModel: task.recommendedModel,
      status: result.status,
      output: result.output, // Store FULL output (not truncated)
      duration: result.duration,
      tokens: result.tokens ? `${result.tokens.input} input, ${result.tokens.output} output` : 'N/A',
      toolCalls: result.toolCalls || 0,
      estimatedDuration: task.estimatedDuration,
      preamblePath: result.preamblePath,
      error: result.error || null,
      executedAt: new Date().toISOString(),
      
      // Additional execution metadata for analysis
      qcVerification: result.qcVerification ? JSON.stringify({
        passed: result.qcVerification.passed,
        score: result.qcVerification.score,
        feedback: result.qcVerification.feedback,
        issuesCount: result.qcVerification.issues?.length || 0,
        timestamp: result.qcVerification.timestamp,
      }) : null,
      qcVerificationHistory: result.qcVerificationHistory ? JSON.stringify(
        result.qcVerificationHistory.map(qc => ({
          passed: qc.passed,
          score: qc.score,
          timestamp: qc.timestamp,
        }))
      ) : null,
      attemptNumber: result.attemptNumber || 1,
      
      // Store individual QC fields for easier querying (FULL content, no truncation)
      qcFeedback: result.qcVerification?.feedback || null,
      qcScore: result.qcVerification?.score || null,
      qcPassed: result.qcVerification?.passed || null,
      qcIssues: result.qcVerification?.issues ? JSON.stringify(result.qcVerification.issues) : null,
      qcRequiredFixes: result.qcVerification?.requiredFixes ? JSON.stringify(result.qcVerification.requiredFixes) : null,
      qcIssuesCount: result.qcVerification?.issues?.length || null,
      qcRequiredFixesCount: result.qcVerification?.requiredFixes?.length || null,
    });
    
    console.log(`💾 Stored in graph: ${node.id}`);
    return node.id;
  } catch (error: any) {
    console.warn(`⚠️  Failed to store result in graph: ${error.message}`);
    return '';
  }
}

/**
 * Build QC verification prompt
 */
function buildQCPrompt(task: TaskDefinition, workerOutput: string, attemptNumber: number, qcContext: string): string {
  return `# QC VERIFICATION TASK

${qcContext}

## YOUR ROLE
${task.qcRole}

## VERIFICATION CRITERIA
${task.verificationCriteria}

## WORKER OUTPUT TO VERIFY (Attempt ${attemptNumber})
\`\`\`
${workerOutput.substring(0, 10000)}${workerOutput.length > 10000 ? '\n\n... (truncated for review, full output available)' : ''}
\`\`\`

## YOUR TASK: EVALUATE THE DELIVERABLE (NOT THE PROCESS)
1. **Focus on deliverable quality**: Does the output meet requirements? Is it complete, accurate, usable?
2. **Verify with tools**: Read files, run tests, execute commands to check the deliverable
3. **Check completeness**: All required sections/files present and detailed
4. **Validate accuracy**: Content is correct, examples work, claims are verifiable
5. **Check for hallucinations**: Fabricated libraries, fake APIs, made-up standards in the deliverable
6. **Ignore process metrics**: Tool call count, worker explanations, evidence quality → tracked by system, not QC
7. **Score the outcome**: If deliverable meets criteria → PASS (regardless of how it was created)

## OUTPUT FORMAT (CRITICAL - MUST FOLLOW EXACTLY)

### QC VERDICT: [PASS or FAIL]

### SCORE: [0-100]

### FEEDBACK:
[2-3 sentences max. Be specific and concise about what passed/failed.]

### ISSUES FOUND (if FAIL):
- Issue 1: [What's missing/wrong in deliverable] | Gap: [Which requirement not met] | Evidence: [Tool verification result]
- Issue 2: [What's missing/wrong in deliverable] | Gap: [Which requirement not met] | Evidence: [Tool verification result]
- Issue 3: [What's missing/wrong in deliverable] | Gap: [Which requirement not met] | Evidence: [Tool verification result]
(Maximum 10 issues - focus on DELIVERABLE gaps, not process issues)

### REQUIRED FIXES (if FAIL):
- Fix 1: [What to add/change in deliverable - specific content/file/section]
- Fix 2: [What to add/change in deliverable - specific content/file/section]
- Fix 3: [What to add/change in deliverable - specific content/file/section]
(Maximum 10 fixes - tell worker what the deliverable needs, not how to create it)

**IMPORTANT CONSTRAINTS:**
- **MAXIMUM OUTPUT LENGTH: 2000 characters**
- Be THOROUGH but CONCISE
- Each issue/fix: ONE sentence maximum
- Feedback: 2-3 sentences maximum
- If you find ANY hallucinations in deliverable, mark as FAIL with specific evidence
- DO NOT write verbose explanations - keep responses SHORT and DIRECT
- DO NOT repeat information - state each point ONCE
- **CRITICAL**: Focus on WHAT the deliverable needs, not HOW to create it
- **CRITICAL**: Ignore process issues (tool usage, evidence) - only evaluate deliverable quality

**SCORING PHILOSOPHY:**
- Deliverable meets requirements → PASS (regardless of process)
- Deliverable has gaps/errors → FAIL with specific fixes
- Partial completion → Score proportionally (e.g., 7/10 sections = 70/100)

**EXAMPLE OF GOOD vs BAD FEEDBACK:**
❌ BAD: "Worker didn't show tool output" (process issue)
✅ GOOD: "File X missing required section Y. Add: [specific content]" (deliverable gap)`;
}

/**
 * Parse QC agent response
 */
function parseQCResponse(response: string): QCResult {
  const verdictMatch = response.match(/###\s+QC VERDICT:\s+(PASS|FAIL)/i);
  const scoreMatch = response.match(/###\s+SCORE:\s+(\d+)/);
  const feedbackMatch = response.match(/###\s+FEEDBACK:\s+([\s\S]+?)(?=###|$)/);
  const issuesMatch = response.match(/###\s+ISSUES FOUND[^:]*:\s+([\s\S]+?)(?=###|$)/);
  const fixesMatch = response.match(/###\s+REQUIRED FIXES[^:]*:\s+([\s\S]+?)(?=###|$)/);
  
  const passed = verdictMatch?.[1]?.toUpperCase() === 'PASS';
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
  const feedback = feedbackMatch?.[1]?.trim() || '';
  
  // Extract issues and fixes as arrays of strings
  const issuesText = issuesMatch?.[1]?.trim() || '';
  const issues = issuesText
    .split('\n')
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
  
  const fixesText = fixesMatch?.[1]?.trim() || '';
  const requiredFixes = fixesText
    .split('\n')
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
  
  return {
    passed,
    score,
    feedback,
    issues: issues.length > 0 ? issues : (passed ? [] : ['No specific issues provided by QC']),
    requiredFixes: requiredFixes.length > 0 ? requiredFixes : (passed ? [] : ['Review output against verification criteria']),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute QC agent to verify worker output
 */
async function executeQCAgent(
  task: TaskDefinition,
  workerOutput: string,
  attemptNumber: number,
  qcPreambleContent: string
): Promise<QCResult> {
  if (!qcPreambleContent) {
    throw new Error(`No QC preamble content for task ${task.id}`);
  }
  
  console.log(`\n🔍 Running QC verification (attempt ${attemptNumber})...`);
  console.log(`📥 Pre-fetching QC context from graph...`);
  
  try {
    // Pre-fetch QC context
    const qcContext = await fetchTaskContext(task.id, 'qc');
    
    // Build QC prompt with pre-fetched context
    const qcPrompt = buildQCPrompt(task, workerOutput, attemptNumber, qcContext);
    
    // Resolve model selection based on PM suggestion and feature flag
    const modelSelection = await resolveModelSelection(task, 'qc');
    
    // Calculate circuit breaker limit from PM's estimate (10x multiplier for generous buffer)
    const circuitBreakerLimit = task.estimatedToolCalls 
      ? Math.ceil(task.estimatedToolCalls * 10)
      : undefined;
    
    // Initialize QC agent with strict output limits and circuit breaker
    const qcAgent = new CopilotAgentClient({
      preamblePath: 'memory', // Dummy value - content passed directly
      ...modelSelection, // Spread provider/model or agentType
      temperature: 0.0, // Maximum consistency and strictness
      maxTokens: 1000, // STRICT LIMIT: Force concise responses (prevents verbose QC bloat)
      tools: consolidatedTools, // QC needs tools to verify worker outputer output
    });
    
    await qcAgent.loadPreamble(qcPreambleContent, true); // true = isContent
    
    // Execute QC verification with circuit breaker
    const result = await qcAgent.execute(qcPrompt, 0, circuitBreakerLimit);
    
    // 🚨 CHECK: QC agent circuit breaker
    if (result.metadata?.circuitBreakerTriggered) {
      const { toolCallCount, messageCount, estimatedContextTokens } = result.metadata;
      console.log(`\n${'🚨'.repeat(40)}`);
      console.log(`🚨 QC AGENT CIRCUIT BREAKER TRIGGERED - TASK FAILED`);
      console.log(`   Tool Calls: ${toolCallCount} (limit: 50)`);
      console.log(`   Messages: ${messageCount} (limit: 60)`);
      console.log(`   Estimated Context: ~${estimatedContextTokens.toLocaleString()} tokens (limit: 80k)`);
      console.log(`   ❌ QC agents cannot exceed limits - task marked as failed`);
      console.log(`${'🚨'.repeat(40)}\n`);
      
      throw new Error(`QC agent circuit breaker triggered: ${toolCallCount} tool calls exceeded limit. Task failed.`);
    }
    
    // Parse QC response
    const qcResult = parseQCResponse(result.output);
    
    console.log(`${qcResult.passed ? '✅' : '❌'} QC ${qcResult.passed ? 'PASSED' : 'FAILED'} (score: ${qcResult.score}/100)`);
    
    return qcResult;
  } catch (error: any) {
    console.error(`❌ QC agent execution failed: ${error.message}`);
    // If circuit breaker triggered, re-throw to fail the task
    if (error.message.includes('circuit breaker triggered')) {
    throw error;
    }
    // Return a FAIL result if QC agent crashes for other reasons
    return {
      passed: false,
      score: 0,
      feedback: `QC agent execution failed: ${error.message}`,
      issues: ['QC agent crashed or failed to execute'],
      requiredFixes: ['Fix the QC agent execution error'],
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Generate QC failure report after maxRetries exhausted
 */
async function generateQCFailureReport(
  task: TaskDefinition,
  qcHistory: QCResult[],
  finalWorkerOutput: string
): Promise<string> {
  if (!task.qcPreamblePath) {
    return 'QC failure report generation failed: No QC preamble path';
  }
  
  console.log(`\n📋 Generating QC failure report for ${task.id}...`);
  console.log(`📥 Pre-fetching QC context from graph...`);
  
  // Pre-fetch QC context
  const qcContext = await fetchTaskContext(task.id, 'qc');
  
  const reportPrompt = `# QC FAILURE REPORT GENERATION

${qcContext}

## YOUR ROLE
${task.qcRole}

## CONTEXT
Task ${task.id} has FAILED after ${qcHistory.length} verification attempts. Generate a comprehensive failure report.

## VERIFICATION HISTORY
${qcHistory.map((qc, i) => `
### Attempt ${i + 1}
- **Score:** ${qc.score}/100
- **Feedback:** ${qc.feedback}
- **Issues:** ${qc.issues.join('; ')}
- **Required Fixes:** ${qc.requiredFixes.join('; ')}
`).join('\n')}

## FINAL WORKER OUTPUT
\`\`\`
${finalWorkerOutput.substring(0, 5000)}${finalWorkerOutput.length > 5000 ? '\n\n... (truncated)' : ''}
\`\`\`

## YOUR TASK
Generate a CONCISE failure report (MAXIMUM 3000 characters) including:
1. **Root Cause Analysis**: Why did this task fail repeatedly? (2-3 sentences)
2. **Pattern Analysis**: Common issues across attempts? (2-3 sentences)
3. **Technical Assessment**: Specific technical problems? (3-5 bullet points, one sentence each)
4. **Recommendations**: What would need to change? (3-5 bullet points, one sentence each)

**CRITICAL CONSTRAINTS:**
- MAXIMUM OUTPUT LENGTH: 3000 characters
- Each section: SHORT and DIRECT
- NO verbose explanations or repetition
- Use bullet points, not paragraphs
- Be specific but CONCISE`;

  try {
    // Resolve model selection based on PM suggestion and feature flag
    const modelSelection = await resolveModelSelection(task, 'qc');
    
    // Calculate circuit breaker limit from PM's estimate (10x multiplier for generous buffer)
    const circuitBreakerLimit = task.estimatedToolCalls 
      ? Math.ceil(task.estimatedToolCalls * 10)
      : undefined;
    
    const qcAgent = new CopilotAgentClient({
      preamblePath: task.qcPreamblePath,
      ...modelSelection, // Spread provider/model or agentType
      temperature: 0.0,
      maxTokens: 2000, // STRICT LIMIT: Concise failure reports only
      tools: consolidatedTools, // QC needs tools to verify worker output
    });
    
    await qcAgent.loadPreamble(task.qcPreamblePath);
    const result = await qcAgent.execute(reportPrompt, 0, circuitBreakerLimit);
    
    // 🚨 CHECK: QC agent circuit breaker during failure report generation
    if (result.metadata?.circuitBreakerTriggered) {
      const { toolCallCount } = result.metadata;
      console.log(`⚠️  QC agent circuit breaker triggered during failure report generation (${toolCallCount} tool calls)`);
      console.log(`   Returning fallback failure report...`);
      
      return `## QC Failure Report (Circuit Breaker Triggered)

**Note:** QC agent exceeded limits (${toolCallCount} tool calls) while generating this report.

### Summary
Task ${task.id} failed after ${qcHistory.length} attempts. QC verification consistently identified issues that were not adequately addressed.

### Failure Pattern
${qcHistory.map((qc, i) => `- Attempt ${i + 1}: Score ${qc.score}/100 - ${qc.feedback.substring(0, 100)}...`).join('\n')}

### Recommendation
Review the QC verification history and worker output in the graph node for detailed analysis.`;
    }
    
    return result.output;
  } catch (error: any) {
    console.error(`❌ QC failure report generation failed: ${error.message}`);
    return `QC failure report generation failed: ${error.message}`;
  }
}

/**
 * Pre-fetch task context from graph and format for agent prompt
 */
async function fetchTaskContext(taskId: string, agentType: 'worker' | 'qc'): Promise<string> {
  const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000/mcp';
  
  try {
    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'get_task_context',
          arguments: { taskId, agentType }
        }
      })
    });

    const result = await response.json();
    
    // Handle task not found (graceful fallback for new tasks)
    if (result.error && result.error.message?.includes('Task not found')) {
      console.warn(`⚠️  Task context not yet indexed (task just started) - skipping pre-fetch`);
      return `## ℹ️ TASK CONTEXT NOT YET AVAILABLE\n\nThis task was just created and context pre-fetch is not available yet.\nYou will have access to the full task prompt below.\n\n`;
    }
    
    if (result.error) {
      console.warn(`⚠️  Failed to fetch context for ${taskId}: ${result.error.message}`);
      return `## ⚠️ CONTEXT UNAVAILABLE\n\nFailed to retrieve task context from graph. Use get_task_context({taskId: '${taskId}', agentType: '${agentType}'}) to retry.\n\n`;
    }

    const contextData = result.result?.content?.[0]?.text;
    if (!contextData) {
      return `## ⚠️ CONTEXT UNAVAILABLE\n\nNo context data returned. Use get_task_context({taskId: '${taskId}', agentType: '${agentType}'}) to query directly.\n\n`;
    }

    // Parse the context JSON
    let parsedContext: any;
    try {
      parsedContext = JSON.parse(contextData);
    } catch (parseError: any) {
      console.error(`❌ Failed to parse context data: ${parseError.message}`);
      return `## ⚠️ CONTEXT PARSE ERROR\n\nFailed to parse context JSON: ${parseError.message}\n\nRaw data: ${contextData.substring(0, 500)}\n\n`;
    }

    const { context, metrics } = parsedContext;
    
    if (!context) {
      console.warn(`⚠️  Context object empty - task may be newly indexed`);
      return `## ℹ️ TASK CONTEXT NOT YET COMPLETE\n\nTask was found but context is still being indexed. You will have access to the full task prompt below.\n\n`;
    }

    // Format context for agent consumption
    let formatted = `## 📋 YOUR TASK CONTEXT (Pre-fetched from Graph)

**Task ID:** ${context.taskId || taskId}
**Title:** ${context.title || 'N/A'}
**Requirements:** ${context.requirements || 'N/A'}

`;

    if (context.workerRole) {
      formatted += `**Your Role:** ${context.workerRole}\n\n`;
    }

    if (context.description) {
      formatted += `**Description:**\n${context.description}\n\n`;
    }

    if (context.files && context.files.length > 0) {
      formatted += `**Files to Work With:** (${context.files.length} files)\n${context.files.map((f: string) => `- ${f}`).join('\n')}\n\n`;
    }

    if (context.dependencies && context.dependencies.length > 0) {
      formatted += `**Dependencies:** (${context.dependencies.length})\n${context.dependencies.map((d: string) => `- ${d}`).join('\n')}\n\n`;
    }

    if (agentType === 'worker' && context.attemptNumber > 1) {
      formatted += `**⚠️ Retry Attempt:** This is attempt ${context.attemptNumber}/${context.maxRetries}\n\n`;
    }

    if (agentType === 'qc') {
      formatted += `**Verification Criteria:**\n${context.verificationCriteria || 'See task requirements'}\n\n`;
      if (context.workerOutput) {
        formatted += `**Worker Output to Verify:**\n\`\`\`\n${context.workerOutput.substring(0, 5000)}${context.workerOutput.length > 5000 ? '\n... (truncated, full output in graph)' : ''}\n\`\`\`\n\n`;
      }
    }

    formatted += `**Context Efficiency:** ${metrics.reductionPercent.toFixed(1)}% reduction (${metrics.originalSize} → ${metrics.filteredSize} bytes)\n\n---\n\n**💡 Note:** If you need to refresh or see more details, you can query:\n\`\`\`\nget_task_context({taskId: '${taskId}', agentType: '${agentType}'})\n\`\`\`\n\n`;

    return formatted;
  } catch (error: any) {
    console.error(`❌ Error fetching task context: ${error.message}`);
    return `## ⚠️ CONTEXT FETCH ERROR\n\nFailed to retrieve context: ${error.message}\n\nUse get_task_context({taskId: '${taskId}', agentType: '${agentType}'}) to query directly.\n\n`;
  }
}

/**
 * Helper to wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
    )
  ]);
}

/**
 * Create task node in graph for tracking (idempotent)
 * Has 5 second timeout to prevent hanging on DB issues
 */
async function createGraphNode(taskId: string, properties: Record<string, any>): Promise<void> {
  const TIMEOUT_MS = 5000;
  
  try {
    const graphManager = await withTimeout(getGraphManager(), TIMEOUT_MS, 'getGraphManager');
    
    try {
      // Try to get existing node first
      const existing = await withTimeout(graphManager.getNode(taskId), TIMEOUT_MS, 'getNode');
      
      if (existing) {
        console.log(`♻️  Task node ${taskId} already exists, updating instead`);
        await withTimeout(graphManager.updateNode(taskId, properties), TIMEOUT_MS, 'updateNode');
        return;
      }
    } catch (error: any) {
      // Node doesn't exist or timed out, try to create it
      if (!error.message?.includes('timed out')) {
        // Node doesn't exist, continue to create
      } else {
        console.warn(`⚠️  Graph getNode timed out for ${taskId}, skipping graph node creation`);
        return;
      }
    }
    
    // Create new node
    console.log(`💾 Creating task node: ${taskId}`);
    await withTimeout(graphManager.addNode('todo', {
      id: taskId,
      ...properties,
    }), TIMEOUT_MS, 'addNode');
    console.log(`✅ Task node created: ${taskId}`);
  } catch (error: any) {
    console.warn(`⚠️  Graph operation failed for ${taskId}: ${error.message} - continuing without graph node`);
    // Don't throw - log and continue (allows execution to proceed even if graph fails)
  }
}

/**
 * Update task node in graph
 */
async function updateGraphNode(taskId: string, properties: Record<string, any>): Promise<void> {
  const TIMEOUT_MS = 5000;
  
  try {
    const graphManager = await withTimeout(getGraphManager(), TIMEOUT_MS, 'getGraphManager');
    await withTimeout(graphManager.updateNode(taskId, properties), TIMEOUT_MS, 'updateNode');
  } catch (error: any) {
    console.warn(`⚠️  Failed to update graph node: ${error.message}`);
  }
}

/**
 * Analyze circuit breaker failure using QC agent
 * Provides diagnostic analysis of why the worker failed
 */
async function analyzeCircuitBreakerFailure(
  task: TaskDefinition,
  workerOutput: string,
  workerResult: any,
  attemptNumber: number
): Promise<string> {
  console.log(`\n🔍 Analyzing circuit breaker failure...`);
  
  const analysisPrompt = `# CIRCUIT BREAKER ANALYSIS REQUEST

You are a QC agent analyzing why a worker agent exceeded safety thresholds.

## Task
${task.title}

## Original Prompt
${task.prompt}

## Worker Behavior
- **Tool Calls:** ${workerResult.metadata?.toolCallCount || 0} (limit: 50)
- **Messages:** ${workerResult.metadata?.messageCount || 0}
- **Context Tokens:** ~${workerResult.metadata?.estimatedContextTokens?.toLocaleString() || 'unknown'}
- **Duration:** ${workerResult.metadata?.duration?.toFixed(2) || 'unknown'}s
- **Attempt:** ${attemptNumber}

## Worker Output (Last 2000 chars)
${workerOutput.slice(-2000)}

## Conversation History (Last 10 messages)
${JSON.stringify(workerResult.conversationHistory?.slice(-10) || [], null, 2).substring(0, 3000)}

---

## YOUR ANALYSIS TASK

Analyze what went wrong and provide:

1. **Root Cause**: Why did the worker exceed limits?
   - Was it stuck in a loop?
   - Did it repeat the same actions?
   - Was the task unclear or too complex?
   - Did it fail to recognize completion?

2. **Specific Mistakes**: What did the worker do wrong?
   - List 3-5 specific mistakes with examples
   - Quote tool calls or actions that were problematic

3. **Recommended Fix**: How should the worker approach this task?
   - Provide a step-by-step plan (max 5 steps)
   - Be specific about what to do differently
   - Focus on completing the task efficiently

Keep your analysis concise and actionable (max 1000 words).`;

  try {
    // Use QC preamble if available, otherwise create a minimal analysis agent
    const qcPreamblePath = task.qcPreamblePath || await generateAnalysisPreamble();
    
    // Calculate circuit breaker limit from PM's estimate (10x multiplier for generous buffer)
    const circuitBreakerLimit = task.estimatedToolCalls 
      ? Math.ceil(task.estimatedToolCalls * 10)
      : undefined;
    
    const analysisAgent = new CopilotAgentClient({
      preamblePath: qcPreamblePath,
      agentType: 'qc',
      temperature: 0.0,
      tools: consolidatedTools, // Analysis agent needs tools to inspect worker output
    });
    
    await analysisAgent.loadPreamble(qcPreamblePath);
    const result = await analysisAgent.execute(analysisPrompt, 0, circuitBreakerLimit);
    
    // 🚨 CHECK: QC agent circuit breaker during circuit breaker analysis
    if (result.metadata?.circuitBreakerTriggered) {
      const { toolCallCount } = result.metadata;
      console.log(`⚠️  QC agent circuit breaker triggered during analysis (${toolCallCount} tool calls)`);
      console.log(`   Returning fallback analysis...`);
      
      return `## Circuit Breaker Analysis (QC Also Exceeded Limits)

**Note:** Analysis agent also exceeded limits (${toolCallCount} tool calls) while analyzing this failure.

### Worker Failure
- Tool Calls: ${workerResult.metadata?.toolCallCount || 0} (limit: 50)
- Messages: ${workerResult.metadata?.messageCount || 0} (limit: 60)
- Attempt: ${attemptNumber}

### Likely Root Cause
The worker agent likely got stuck in a repetitive loop or the task complexity exceeded reasonable bounds.

### Recommended Approach
1. Simplify the task into smaller, more focused subtasks
2. Add explicit completion criteria to the prompt
3. Reduce the scope of what needs to be accomplished
4. Consider if the task requires human intervention

### Fallback Guidance
Review the last few actions in the conversation history and avoid repeating the same tool calls.`;
    }
    
    console.log(`✅ Circuit breaker analysis complete`);
    console.log(`   Analysis length: ${result.output.length} chars`);
    
    return result.output;
  } catch (error: any) {
    console.error(`❌ Circuit breaker analysis failed: ${error.message}`);
    return `## Circuit Breaker Analysis Failed

Error: ${error.message}

**Fallback Guidance:**
- Task exceeded safety thresholds (${workerResult.metadata?.toolCallCount || 0} tool calls)
- Review the last few actions in the conversation history
- Simplify your approach and avoid repetitive actions
- If stuck, break the task into smaller steps`;
  }
}

/**
 * Generate a minimal analysis preamble for circuit breaker QC
 */
async function generateAnalysisPreamble(): Promise<string> {
  const preamblePath = path.join('generated-agents', 'circuit-breaker-qc.md');
  
  // Check if already exists
  try {
    await fs.access(preamblePath);
    return preamblePath;
  } catch {
    // Create minimal preamble
    const preamble = `# Circuit Breaker QC Agent

You are a diagnostic QC agent specialized in analyzing why worker agents fail.

Your role is to:
1. Review worker execution metrics and output
2. Identify root causes of failure (loops, confusion, incorrect approach)
3. Provide specific, actionable remediation guidance

Keep your analysis concise, evidence-based, and focused on helping the worker succeed on retry.`;

    await fs.writeFile(preamblePath, preamble, 'utf-8');
    return preamblePath;
  }
}

/**
 * Auto-generate QC role when PM agent didn't provide one
 * Analyzes task to determine appropriate verification expertise
 */
async function autoGenerateQCRole(task: TaskDefinition): Promise<string> {
  const prompt = task.prompt.toLowerCase();
  const title = task.title.toLowerCase();
  const combined = `${title} ${prompt}`;
  
  // Detect task domain and risk level
  const isSecurity = /auth|password|token|jwt|secret|credential|encrypt|hash/.test(combined);
  const isAPI = /api|endpoint|route|request|response|http/.test(combined);
  const isDatabase = /database|db|sql|query|migration|schema/.test(combined);
  const isFileSystem = /file|directory|write|read|path/.test(combined);
  const isConfig = /config|env|environment|setting/.test(combined);
  const isTest = /test|spec|jest|mocha/.test(combined);
  const isDocs = /document|readme|doc|guide/.test(combined);
  
  // Estimate complexity/risk
  const estimatedToolCalls = parseInt(task.estimatedDuration) || 30; // Default 30min = ~10 tool calls
  const isHighRisk = isSecurity || isDatabase || estimatedToolCalls > 15;
  const isMediumRisk = isAPI || isFileSystem || isConfig;
  
  // Generate role based on domain
  let role = 'Senior ';
  let expertise: string[] = [];
  let verificationFocus: string[] = [];
  let standards = '';
  
  if (isSecurity) {
    role += 'security auditor';
    expertise = ['authentication protocols', 'cryptography', 'OWASP Top 10'];
    verificationFocus = ['input validation', 'token handling', 'secure storage', 'error messages'];
    standards = 'OWASP and OAuth2 RFC expert';
  } else if (isAPI) {
    role += 'API architect';
    expertise = ['RESTful design', 'HTTP standards', 'API security'];
    verificationFocus = ['endpoint correctness', 'status codes', 'error handling', 'request validation'];
    standards = 'REST API best practices and OpenAPI expert';
  } else if (isDatabase) {
    role += 'database architect';
    expertise = ['schema design', 'data integrity', 'query optimization'];
    verificationFocus = ['schema correctness', 'data validation', 'transaction safety', 'migration rollback'];
    standards = 'SQL standards and database normalization expert';
  } else if (isTest) {
    role += 'QA engineer';
    expertise = ['test coverage', 'edge case analysis', 'test frameworks'];
    verificationFocus = ['test completeness', 'edge cases', 'assertion quality', 'test independence'];
    standards = 'Testing best practices and TDD expert';
  } else if (isDocs) {
    role += 'technical writer';
    expertise = ['documentation clarity', 'API documentation', 'code examples'];
    verificationFocus = ['clarity', 'completeness', 'accuracy', 'code example correctness'];
    standards = 'Technical writing standards expert';
  } else {
    role += 'code reviewer';
    expertise = ['code quality', 'TypeScript/JavaScript', 'best practices'];
    verificationFocus = ['correctness', 'maintainability', 'error handling', 'edge cases'];
    standards = 'Clean Code and SOLID principles expert';
  }
  
  const qcRole = `${role} with expertise in ${expertise.join(', ')}. Aggressively verifies ${verificationFocus.join(', ')}. ${standards}.`;
  
  return qcRole;
}

/**
 * Auto-generate verification criteria when PM agent didn't provide them
 */
async function autoGenerateVerificationCriteria(task: TaskDefinition): Promise<string> {
  const qcRole = task.qcRole || await autoGenerateQCRole(task);
  const prompt = task.prompt.toLowerCase();
  
  const criteria: string[] = [];
  
  // Security criteria
  if (/auth|password|token|jwt|secret/.test(prompt) || /security/.test(qcRole)) {
    criteria.push('- [ ] No hardcoded secrets or credentials');
    criteria.push('- [ ] Input validation prevents injection attacks');
    criteria.push('- [ ] Sensitive data properly encrypted/hashed');
  }
  
  // Functionality criteria (always present)
  criteria.push('- [ ] All specified requirements implemented');
  criteria.push('- [ ] No runtime errors or exceptions');
  criteria.push('- [ ] Edge cases handled appropriately');
  
  // Code quality criteria (always present)
  criteria.push('- [ ] Code follows repository conventions');
  criteria.push('- [ ] Error handling is comprehensive');
  criteria.push('- [ ] Comments explain complex logic');
  
  // Test criteria
  if (/test/.test(prompt)) {
    criteria.push('- [ ] Test coverage includes happy path and edge cases');
    criteria.push('- [ ] Tests are independent and repeatable');
  }
  
  return criteria.join('\n');
}

/**
 * Execute single task with Worker → QC → Retry flow
 * 
 * Runs task with worker agent, validates with QC, retries on failure.
 * 
 * @param task - Task definition to execute
 * @param preambleContent - Worker agent preamble
 * @param qcPreambleContent - Optional QC agent preamble
 * @returns Execution result with status and outputs
 * 
 * @example
 * const result = await executeTask(task, workerPreamble, qcPreamble);
 * if (result.status === 'success') {
 *   console.log('Task completed:', result.outputs);
 * }
 */
export async function executeTask(
  task: TaskDefinition,
  preambleContent: string,
  qcPreambleContent?: string,
  executionId?: string,
  sendSSE?: (event: string, data: any) => void,
  cancellationToken?: CancellationToken
): Promise<ExecutionResult> {
  // Check for cancellation before starting
  cancellationToken?.throwIfCancelled();
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 Executing Task: ${task.title}`);
  console.log(`🆔 Task ID: ${task.id}`);
  console.log(`🤖 Worker Preamble: ${preambleContent.length} chars`);
  if (qcPreambleContent) {
    console.log(`🔍 QC Preamble: ${qcPreambleContent.length} chars`);
    console.log(`🔁 Max Retries: ${task.maxRetries || 2}`);
  }
  console.log(`⏱️  Estimated Duration: ${task.estimatedDuration}`);
  console.log('='.repeat(80) + '\n');
  
  console.log(`[DEBUG] Task prompt length: ${task.prompt?.length || 0} chars`);
  
  const startTime = Date.now();
  const maxRetries = task.maxRetries || 2;
  let attemptNumber = 1;
  let workerOutput = '';
  const qcVerificationHistory: QCResult[] = [];
  let errorContext: any = null;
  
  // 🚨 PHASE 4: QC IS NOW MANDATORY FOR ALL TASKS
  // QC roles and preambles should have been generated during task parsing
  // This is a safety check in case executeTask is called directly
  if (!task.qcRole || !qcPreambleContent) {
    throw new Error(`Task ${task.id} missing QC configuration. QC is now mandatory for all tasks. Please regenerate chain-output.md with QC roles.`);
  }
  
  console.log(`[DEBUG] QC check passed, creating graph node...`);
  
  // Create initial task node in graph for tracking
  await createGraphNode(task.id, {
    taskId: task.id,
    title: task.title,
    description: task.prompt,
    requirements: task.prompt,
    status: 'pending',
    workerRole: task.agentRoleDescription,
    qcRole: task.qcRole || 'None',
    verificationCriteria: task.verificationCriteria || 'Verify output meets requirements',
    maxRetries: maxRetries,
    hasQcVerification: true,
    startedAt: new Date().toISOString(),
    files: [], // Will be populated by context manager if needed
    dependencies: [], // Will be populated by context manager if needed
  });
  
  console.log(`[DEBUG] Graph node created, starting worker loop...`);
  
  // Worker → QC → Retry loop
  while (attemptNumber <= maxRetries) {
    // Check for cancellation at start of each attempt
    cancellationToken?.throwIfCancelled();
    
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔄 ATTEMPT ${attemptNumber}/${maxRetries}`);
    console.log('─'.repeat(80));
    
    try {
      // STEP 1: Execute Worker
      console.log(`\n👷 Executing worker agent...`);
      console.log(`📥 Pre-fetching task context from graph...`);
      
      // Pre-fetch context from graph
      const workerContext = await fetchTaskContext(task.id, 'worker');
      
      // Worker execution guidance (from WORKER_TOOL_EXECUTION.md)
      const workerGuidance = `
═══════════════════════════════════════════════════════════════════════════════
📋 WORKER EXECUTION GUIDANCE
═══════════════════════════════════════════════════════════════════════════════

## 🎯 Core Principle

**You have access to powerful tools. Use them. Don't write code.**

This task includes a "Tool-Based Execution" section that tells you:
- **Use:** Which tools to use
- **Execute:** How to execute (in-memory, existing script, etc.)
- **Store:** What to return in your response
- **Do NOT:** What you should NOT create

**Follow these instructions exactly. Do NOT deviate.**

## 📦 Execution Patterns

### Pattern 1: In-Memory Processing
- Read data using specified tool
- Process in your code (in-memory)
- Return results in your final response
- Do NOT create any new files

### Pattern 2: Existing Script Execution
- Execute specified command using tool
- Capture the output
- Return output in your final response
- Do NOT modify or create scripts

### Pattern 3: Data Transformation
- Retrieve data using specified tool
- Transform in your code (in-memory)
- Return or write output as specified
- Do NOT create utility files

## 📦 Returning Task Results

**Return your task output in your final response. The system will store it automatically.**

Simply return your results:
\`\`\`
{
  [data as specified in "Store:" line]
}
\`\`\`

**Note:** 
- The system automatically stores your output in the graph
- The system captures diagnostic data (status, timestamps, tokens, etc.)
- You focus on producing quality output, the system handles storage

## ❌ What NOT to Create

**Never create:**
- New source files (.ts, .js, .py, etc.)
- New utility modules
- New parser scripts
- New validation scripts
- New generator scripts
- New test files (unless explicitly requested)

**Why:** You have tools for these tasks. Use them.

## ✅ Success Criteria

Your task is successful when:
1. ✅ You followed Tool-Based Execution instructions exactly
2. ✅ You used specified tools (not created new code)
3. ✅ You returned results as specified in "Store:" line
4. ✅ You did NOT create any new files (unless explicitly requested)
5. ✅ Results are complete and accurate

**QC will verify the quality of your output. The system automatically handles storage and diagnostic tracking.**

═══════════════════════════════════════════════════════════════════════════════
`;
      
      // Build worker prompt with pre-fetched context and guidance
      // Add tool call examples based on estimated tool calls
      const estimatedCalls = task.estimatedToolCalls || 6;
      const toolExamples = `

═══════════════════════════════════════════════════════════════════════════════
## 🔧 TOOL CALL EXAMPLES (YOU MUST USE TOOLS LIKE THIS)

**CRITICAL:** Your output MUST include actual tool calls with their output. Here are examples:

**Example 1: Verification Task**
\`\`\`
I will verify the system has the required tools.

Tool: run_terminal_cmd('which ls')
Output: /bin/ls

Tool: run_terminal_cmd('which pwd')  
Output: /bin/pwd

Result: Both tools are available. ✅
\`\`\`

**Example 2: Read/Analysis Task**
\`\`\`
I will read the configuration file.

Tool: read_file('config.yaml')
Output: [actual file contents shown here]

Analysis: Configuration contains 5 sections. ✅
\`\`\`

**Example 3: Modification Task**
\`\`\`
I will update the resource.

Tool: read_file('resource.txt')
Output: [current contents]

Tool: write('resource.txt', 'updated contents')
Output: File written successfully

Tool: read_file('resource.txt')
Output: [new contents]

Verification: Resource updated correctly. ✅
\`\`\`

**YOUR TASK REQUIRES APPROXIMATELY ${estimatedCalls} TOOL CALLS.**

**If you make fewer than ${Math.floor(estimatedCalls * 0.5)} tool calls, you will FAIL QC.**

═══════════════════════════════════════════════════════════════════════════════
`;

      let workerPrompt = `${workerContext}

${workerGuidance}

${task.prompt}

${toolExamples}`;
      
      if (attemptNumber > 1 && errorContext) {
        workerPrompt = `${workerGuidance}

## ⚠️ PREVIOUS ATTEMPT FAILED - QC FEEDBACK

**Attempt Number:** ${attemptNumber - 1}
**QC Score:** ${errorContext.qcScore}/100
**QC Feedback:** ${errorContext.qcFeedback}

**Issues Found:**
${errorContext.issues.map((issue: string) => `- ${issue}`).join('\n')}

**Required Fixes:**
${errorContext.requiredFixes.map((fix: string) => `- ${fix}`).join('\n')}

**IMPORTANT:** Address ALL issues above in your revised output. The QC agent will verify your fixes.

---

${task.prompt}`;
      }
      
      // PHASE 2: Worker Execution Start
      console.log(`[DEBUG] Building worker prompt complete, starting worker execution...`);
      const workerStartTime = new Date().toISOString();
      await updateGraphNode(task.id, {
        status: 'worker_executing',
        attemptNumber,
        workerStartTime,
        workerPromptLength: workerPrompt.length,
        workerContextFetched: workerContext.length > 0,
        isRetry: attemptNumber > 1,
        retryReason: errorContext ? 'qc_failure' : null,
      });
      
      // Send SSE: Worker execution start
      if (sendSSE && executionId) {
        sendSSE('worker-start', {
          taskId: task.id,
          taskTitle: task.title,
          phase: 'worker',
          attemptNumber,
          isRetry: attemptNumber > 1,
          message: attemptNumber > 1 
            ? `🔄 Worker retrying (attempt ${attemptNumber}/${maxRetries})`
            : `🤖 Worker executing: ${task.title}`
        });
      }
      
      // Resolve model selection based on PM suggestion and feature flag
      const modelSelection = await resolveModelSelection(task, 'worker');
      
      const workerAgent = new CopilotAgentClient({
        preamblePath: 'memory', // Dummy value - content passed directly
        ...modelSelection, // Spread provider/model or agentType
        temperature: 0.0,
        tools: consolidatedTools, // Worker needs tools to execute tasks (filesystem + graph)
      });
      
      await workerAgent.loadPreamble(preambleContent, true); // true = isContent
      
      // Calculate circuit breaker limit from PM's estimate (apply 10x multiplier for generous buffer)
      // If no estimate, use undefined (defaults to 100 in LLM client)
      const circuitBreakerLimit = task.estimatedToolCalls 
        ? Math.ceil(task.estimatedToolCalls * 10)
        : undefined;
      
      if (circuitBreakerLimit) {
        console.log(`🔒 Using dynamic circuit breaker: ${circuitBreakerLimit} tool calls (PM estimate: ${task.estimatedToolCalls} × 10)`);
      } else {
        console.log(`🔒 Using default circuit breaker: 100 tool calls`);
      }
      
      // Execute worker prompt with dynamic circuit breaker
      const workerResult = await workerAgent.execute(workerPrompt, 0, circuitBreakerLimit);
      workerOutput = workerResult.output;
      
      const workerDuration = Date.now() - startTime;
      console.log(`✅ Worker completed in ${(workerDuration / 1000).toFixed(2)}s`);
      console.log(`📊 Tokens: ${workerResult.tokens.input + workerResult.tokens.output}`);
      console.log(`🔧 Tool calls: ${workerResult.toolCalls}`);
      
      // PHASE 3: Worker Execution Complete
      await updateGraphNode(task.id, {
        status: 'worker_completed',
        workerOutput: workerOutput.substring(0, 50000),
        workerOutputLength: workerOutput.length,
        workerDuration,
        workerTokensInput: workerResult.tokens.input,
        workerTokensOutput: workerResult.tokens.output,
        workerTokensTotal: workerResult.tokens.input + workerResult.tokens.output,
        workerToolCalls: workerResult.toolCalls,
        workerCompletedAt: new Date().toISOString(),
        workerMessageCount: workerResult.metadata?.messageCount,
        workerEstimatedContextTokens: workerResult.metadata?.estimatedContextTokens,
      });
      
      // Send SSE: Worker execution complete
      if (sendSSE && executionId) {
        sendSSE('worker-complete', {
          taskId: task.id,
          taskTitle: task.title,
          phase: 'worker',
          duration: workerDuration,
          toolCalls: workerResult.toolCalls,
          message: `✅ Worker completed (${(workerDuration / 1000).toFixed(1)}s, ${workerResult.toolCalls} tool calls)`
        });
      }
      
      // 🚨 CIRCUIT BREAKER: Check if hard limit exceeded
      if (workerResult.metadata) {
        const { qcRecommended, circuitBreakerTriggered, toolCallCount, messageCount, estimatedContextTokens } = workerResult.metadata;
        
        if (circuitBreakerTriggered) {
          console.log(`\n${'🚨'.repeat(40)}`);
          console.log(`🚨 CIRCUIT BREAKER TRIGGERED - HARD LIMIT EXCEEDED`);
          console.log(`   Tool Calls: ${toolCallCount} (limit: 50)`);
          console.log(`   Messages: ${messageCount} (limit: 60)`);
          console.log(`   Estimated Context: ~${estimatedContextTokens.toLocaleString()} tokens (limit: 80k)`);
          console.log(`${'🚨'.repeat(40)}\n`);
          
          // Invoke QC for emergency analysis
          console.log(`🔍 Invoking QC agent for emergency analysis...`);
          
          const circuitBreakerAnalysis = await analyzeCircuitBreakerFailure(
            task,
            workerOutput,
            workerResult,
            attemptNumber
          );
          
          // Store circuit breaker analysis in graph
          await updateGraphNode(task.id, {
            status: 'circuit_breaker_triggered',
            attemptNumber,
            workerOutput: workerOutput.substring(0, 50000),
            workerToolCalls: toolCallCount,
            workerDuration: workerDuration,
            circuitBreakerAnalysis: circuitBreakerAnalysis.substring(0, 5000),
            lastUpdated: new Date().toISOString(),
          });
          
          if (attemptNumber < maxRetries) {
            console.log(`\n♻️  Preparing retry with circuit breaker guidance...`);
            errorContext = {
              qcScore: 0,
              qcFeedback: `Circuit breaker triggered: ${toolCallCount} tool calls (limit: 50)`,
              issues: [
                `Excessive tool usage: ${toolCallCount} calls`,
                `Worker may be stuck in a loop`,
                `Approaching context limits: ~${estimatedContextTokens.toLocaleString()} tokens`,
              ],
              requiredFixes: [
                `CRITICAL: Review the circuit breaker analysis below`,
                `DO NOT repeat the same actions`,
                `Focus on completing the task with minimal tool calls`,
                `If stuck, simplify your approach`,
              ],
              previousAttempt: attemptNumber,
              circuitBreakerAnalysis,
            };
            attemptNumber++;
            // ✅ FIXED: Do NOT skip QC - fall through to normal QC flow below
            // The errorContext will be used to guide the next worker attempt
          } else {
            // Max retries exhausted with circuit breaker
    const duration = Date.now() - startTime;
            await updateGraphNode(task.id, {
              status: 'failed',
              completedAt: new Date().toISOString(),
              totalDuration: duration,
              finalAttempt: maxRetries,
              outcome: 'failure',
              failureReason: `Circuit breaker triggered after ${maxRetries} attempts`,
            });
    
    return {
              taskId: task.id,
              status: 'failure',
              output: workerOutput,
              duration,
              tokens: workerResult.tokens,
              toolCalls: toolCallCount,
              preamblePath: 'database',
              agentRoleDescription: task.agentRoleDescription,
              prompt: task.prompt,
              error: `Circuit breaker triggered: ${toolCallCount} tool calls exceeded limit`,
              circuitBreakerAnalysis,
              attemptNumber: maxRetries,
              graphNodeId: task.id,
              // Truncated previews for SSE logging
              preamblePreview: preambleContent.substring(0, 500) + (preambleContent.length > 500 ? '...' : ''),
              outputPreview: workerOutput.substring(0, 1000) + (workerOutput.length > 1000 ? '...' : ''),
            };
          }
        }
        
        // ⚠️ WARNING: Approaching circuit breaker limits (log only, no intervention)
        if (qcRecommended) {
          console.log(`\n⚠️  WARNING: Approaching circuit breaker limits`);
          console.log(`   Tool Calls: ${toolCallCount} (warning threshold: 30, hard limit: 50)`);
          console.log(`   Messages: ${messageCount} (warning threshold: 40, hard limit: 60)`);
          console.log(`   Estimated Context: ~${estimatedContextTokens.toLocaleString()} tokens (warning threshold: 50k, hard limit: 80k)`);
          console.log(`   💡 Continuing to QC verification...\n`);
        }
      }
      
      // Store worker output in graph immediately (status: awaiting_qc)
      await updateGraphNode(task.id, {
        status: 'awaiting_qc',
        attemptNumber,
        workerOutput: workerOutput.substring(0, 50000), // Store first 50k chars
        workerTokens: `${workerResult.tokens.input} input, ${workerResult.tokens.output} output`,
        workerToolCalls: workerResult.toolCalls,
        workerDuration: workerDuration,
        lastUpdated: new Date().toISOString(),
      });
      
      // STEP 2: Execute QC Agent
      
      // PHASE 5: QC Execution Start
      const qcStartTime = new Date().toISOString();
      await updateGraphNode(task.id, {
        status: 'qc_executing',
        qcStartTime,
        qcAttemptNumber: attemptNumber,
      });
      
      // Send SSE: QC verification start
      if (sendSSE && executionId) {
        sendSSE('qc-start', {
          taskId: task.id,
          taskTitle: task.title,
          phase: 'qc',
          attemptNumber,
          message: `🔍 QC verifying worker output (attempt ${attemptNumber}/${maxRetries})`
        });
      }
      
      let qcResult: QCResult;
      try {
        qcResult = await executeQCAgent(task, workerOutput, attemptNumber, qcPreambleContent || '');
      } catch (qcError: any) {
        // 🚨 QC agent circuit breaker triggered - fail the task immediately
        if (qcError.message.includes('circuit breaker triggered')) {
          const duration = Date.now() - startTime;
          console.log(`\n🚨 TASK FAILED: QC agent circuit breaker triggered`);
          
          await updateGraphNode(task.id, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            totalDuration: duration,
            finalAttempt: attemptNumber,
            outcome: 'failure',
            failureReason: `QC agent circuit breaker triggered: ${qcError.message}`,
          });
    
    return {
            taskId: task.id,
            status: 'failure',
            output: workerOutput,
            duration,
            preamblePath: 'database',
            agentRoleDescription: task.agentRoleDescription,
            prompt: task.prompt,
            error: `QC agent circuit breaker triggered: ${qcError.message}`,
            attemptNumber,
            graphNodeId: task.id,
            // Truncated previews for SSE logging
            preamblePreview: preambleContent.substring(0, 500) + (preambleContent.length > 500 ? '...' : ''),
            outputPreview: workerOutput.substring(0, 1000) + (workerOutput.length > 1000 ? '...' : ''),
          };
        }
        // Re-throw other errors
        throw qcError;
      }
      
      // Truncate QC output to prevent context explosion (critical for retries)
      // Store FULL QC result (no truncation - worker needs complete feedback)
      qcVerificationHistory.push(qcResult);
      
      // Store QC result in graph immediately (FULL feedback, no truncation)
      await updateGraphNode(task.id, {
        // PHASE 6 ENHANCEMENT: Add immediate status update
        status: qcResult.passed ? 'qc_passed' : 'qc_failed',
        qcScore: qcResult.score,
        qcPassed: qcResult.passed,
        qcFeedback: qcResult.feedback, // FULL feedback
        qcIssuesCount: qcResult.issues.length,
        qcIssues: JSON.stringify(qcResult.issues), // ALL issues
        qcRequiredFixesCount: qcResult.requiredFixes.length,
        qcRequiredFixes: JSON.stringify(qcResult.requiredFixes), // ALL fixes
        qcCompletedAt: new Date().toISOString(),
        [`qcAttempt${attemptNumber}`]: JSON.stringify({
          passed: qcResult.passed,
          score: qcResult.score,
          feedback: qcResult.feedback, // FULL feedback
          issuesCount: qcResult.issues.length,
          timestamp: qcResult.timestamp,
        }),
        qcVerificationHistory: JSON.stringify(qcVerificationHistory.map(qc => ({
          passed: qc.passed,
          score: qc.score,
          timestamp: qc.timestamp,
        }))),
        lastQcScore: qcResult.score,
        lastQcPassed: qcResult.passed,
        lastUpdated: new Date().toISOString(),
      });
      
      // STEP 3: Check QC Result
      if (qcResult.passed) {
        // ✅ SUCCESS - QC approved the output
        const duration = Date.now() - startTime;
        console.log(`\n✅ TASK COMPLETED SUCCESSFULLY after ${attemptNumber} attempt(s)`);
        
        // Send SSE: QC verification passed
        if (sendSSE && executionId) {
          sendSSE('qc-complete', {
            taskId: task.id,
            taskTitle: task.title,
            phase: 'qc',
            passed: true,
            score: qcResult.score,
            attemptNumber,
            message: `✅ QC passed (Score: ${qcResult.score}/100, Attempt ${attemptNumber}/${maxRetries})`
          });
        }
        
        // Update graph with final success status
        await updateGraphNode(task.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          totalDuration: duration,
          finalAttempt: attemptNumber,
          outcome: 'success',
          // PHASE 8 ENHANCEMENT: Add aggregated metrics
          totalAttempts: attemptNumber,
          totalTokensUsed: workerResult.tokens.input + workerResult.tokens.output,
          totalToolCalls: workerResult.toolCalls || 0,
          qcFailuresCount: qcVerificationHistory.filter(qc => !qc.passed).length,
          retriesNeeded: attemptNumber - 1,
          qcScore: qcResult.score, // PRIMARY FIELD: Final QC score (what matters)
          qcPassed: qcResult.passed,
          qcFeedback: qcResult.feedback, // FULL feedback
          qcPassedOnAttempt: attemptNumber,
          // Debugging/analytics only - NOT for reporting
          qcAttemptMetrics: JSON.stringify({
            totalAttempts: attemptNumber,
            avgScore: Math.round(qcVerificationHistory.reduce((sum, qc) => sum + qc.score, 0) / qcVerificationHistory.length),
            maxScore: Math.max(...qcVerificationHistory.map(qc => qc.score)),
            minScore: Math.min(...qcVerificationHistory.map(qc => qc.score)),
            history: qcVerificationHistory.map((qc, idx) => ({
              attempt: idx + 1,
              score: qc.score,
              passed: qc.passed,
            })),
          }),
        });
        
        const executionResult: Omit<ExecutionResult, 'graphNodeId'> = {
      taskId: task.id,
      status: 'success',
          output: workerOutput,
      duration,
      preamblePath: 'database',
      agentRoleDescription: task.agentRoleDescription,
      prompt: task.prompt,
          tokens: workerResult.tokens,
          toolCalls: workerResult.toolCalls,
          qcVerification: qcResult, // FULL QC result
          qcVerificationHistory,
          attemptNumber,
          // Truncated previews for SSE logging
          preamblePreview: preambleContent.substring(0, 500) + (preambleContent.length > 500 ? '...' : ''),
          outputPreview: workerOutput.substring(0, 1000) + (workerOutput.length > 1000 ? '...' : ''),
        };
        
        const graphNodeId = await storeTaskResultInGraph(task, executionResult);
        
        return {
          ...executionResult,
          graphNodeId,
        };
      }
      
      // ❌ QC FAILED
      console.log(`\n❌ QC FAILED on attempt ${attemptNumber}`);
      console.log(`   Score: ${qcResult.score}/100`);
      console.log(`   Issues: ${qcResult.issues.length}`);
      
      // Send SSE: QC verification failed with gap information
      if (sendSSE && executionId) {
        sendSSE('qc-complete', {
          taskId: task.id,
          taskTitle: task.title,
          phase: 'qc',
          passed: false,
          score: qcResult.score,
          attemptNumber,
          message: attemptNumber < maxRetries
            ? `❌ QC failed (Score: ${qcResult.score}/100) - Retrying (${attemptNumber}/${maxRetries})`
            : `❌ QC failed after ${maxRetries} attempts (Final score: ${qcResult.score}/100)`,
          gap: {
            feedback: qcResult.feedback,
            issues: qcResult.issues,
            requiredFixes: qcResult.requiredFixes
          }
        });
      }
      
      if (attemptNumber < maxRetries) {
        // Prepare error context for next retry (FULL feedback - worker needs complete guidance)
        errorContext = {
          qcScore: qcResult.score,
          qcFeedback: qcResult.feedback, // FULL feedback
          issues: qcResult.issues, // ALL issues
          requiredFixes: qcResult.requiredFixes, // ALL fixes
          previousAttempt: attemptNumber,
        };
        
        // PHASE 7: Retry Preparation
        await updateGraphNode(task.id, {
          status: 'preparing_retry',
          nextAttemptNumber: attemptNumber + 1,
          retryReason: 'qc_failure',
          retryErrorContext: JSON.stringify(errorContext),
          retryPreparedAt: new Date().toISOString(),
        });
        
        console.log(`\n🔁 Retrying with QC feedback...`);
        attemptNumber++;
      } else {
        // Max retries exhausted - TASK FAILED
        break;
      }
    
  } catch (error: any) {
      console.error(`\n❌ Worker execution failed: ${error.message}`);
      
      if (attemptNumber < maxRetries) {
        errorContext = {
          qcScore: 0,
          qcFeedback: `Worker execution crashed: ${error.message}`,
          issues: ['Worker agent crashed or failed to execute'],
          requiredFixes: ['Fix the worker agent execution error'],
          previousAttempt: attemptNumber,
        };
        attemptNumber++;
      } else {
        // Max retries exhausted due to crashes
        break;
      }
    }
  }
  
  // STEP 4: All retries exhausted - Generate failure report
    const duration = Date.now() - startTime;
  console.log(`\n🚨 TASK FAILED after ${maxRetries} attempts`);
  
  const qcFailureReport = await generateQCFailureReport(task, qcVerificationHistory, workerOutput);
  
  // Update graph with final failure status
  await updateGraphNode(task.id, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    totalDuration: duration,
    finalAttempt: maxRetries,
    outcome: 'failure',
    failureReason: `QC verification failed after ${maxRetries} attempts`,
    qcFailureReport: qcFailureReport.substring(0, 5000), // Store first 5k chars
    // PRIMARY FIELDS: Final QC results (what matters for reporting)
    qcScore: qcVerificationHistory[qcVerificationHistory.length - 1]?.score || 0, // FINAL score only
    qcPassed: false, // Explicitly mark as failed
    qcFeedback: qcVerificationHistory[qcVerificationHistory.length - 1]?.feedback || '',
    // PHASE 9 ENHANCEMENT: Add comprehensive failure metrics
    totalAttempts: maxRetries,
    totalQCFailures: qcVerificationHistory.filter(qc => !qc.passed).length,
    qcFailureReportGenerated: true,
    finalWorkerOutput: workerOutput.substring(0, 50000), // Store final output (truncated)
    finalWorkerOutputLength: workerOutput.length, // Store full length
    improvementNeeded: true,
    failureAnalysisCompleted: true,
    // Debugging/analytics only - NOT for reporting
    qcAttemptMetrics: JSON.stringify({
      totalAttempts: maxRetries,
      lowestScore: Math.min(...qcVerificationHistory.map(qc => qc.score)),
      highestScore: Math.max(...qcVerificationHistory.map(qc => qc.score)),
      avgScore: Math.round(qcVerificationHistory.reduce((sum, qc) => sum + qc.score, 0) / qcVerificationHistory.length),
      history: qcVerificationHistory.map((qc, idx) => ({
        attempt: idx + 1,
        score: qc.score,
        passed: qc.passed,
      })),
      commonIssues: qcVerificationHistory
        .flatMap(qc => qc.issues || [])
        .slice(0, 10),
    }),
  });
  
  const executionResult: Omit<ExecutionResult, 'graphNodeId'> = {
      taskId: task.id,
      status: 'failure',
    output: workerOutput,
      duration,
      preamblePath: 'database',
    agentRoleDescription: task.agentRoleDescription,
    prompt: task.prompt,
    error: `QC verification failed after ${maxRetries} attempts`,
    qcVerification: qcVerificationHistory[qcVerificationHistory.length - 1],
    qcVerificationHistory,
    qcFailureReport,
    attemptNumber: maxRetries,
    // Truncated previews for SSE logging
    preamblePreview: preambleContent.substring(0, 500) + (preambleContent.length > 500 ? '...' : ''),
    outputPreview: workerOutput.substring(0, 1000) + (workerOutput.length > 1000 ? '...' : ''),
  };
  
  const graphNodeId = await storeTaskResultInGraph(task, executionResult);
  
  return {
    ...executionResult,
    graphNodeId,
  };
}


/**
 * Execute all tasks from chain output with parallel batching
 * 
 * Orchestrates full workflow execution with dependency-based parallelization.
 * 
 * @param chainOutputPath - Path to chain-output.md
 * @param outputDir - Directory for generated agents
 * @returns Array of execution results
 * 
 * @example
 * const results = await executeChainOutput('chain-output.md');
 * const successful = results.filter(r => r.status === 'success');
 * console.log(`${successful.length}/${results.length} tasks succeeded`);
 */
export async function executeChainOutput(
  chainOutputPath: string,
  outputDir: string = 'generated-agents'
): Promise<ExecutionResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 TASK EXECUTOR');
  console.log('='.repeat(80));
  console.log(`📄 Chain Output: ${chainOutputPath}`);
  console.log(`📁 Output Directory: ${outputDir}\n`);
  
  // Read chain output
  const markdown = await fs.readFile(chainOutputPath, 'utf-8');
  
  // Parse tasks
  const tasks = parseChainOutput(markdown);
  console.log(`📋 Found ${tasks.length} tasks to execute\n`);
  
  if (tasks.length === 0) {
    console.warn('⚠️  No tasks found in chain output');
    return [];
  }
  
  // ✅ NEW: Create all task definition nodes in graph BEFORE execution
  console.log('-'.repeat(80));
  console.log('STEP 0: Create Task Definitions in Graph');
  console.log('-'.repeat(80) + '\n');
  
  console.log('💾 Creating task definition nodes in graph...\n');
  for (const task of tasks) {
    await createGraphNode(task.id, {
      taskId: task.id,
      title: task.title || `Task ${task.id}`,
      description: task.prompt.substring(0, 1000), // First 1k chars
      requirements: task.prompt,
      status: 'pending',
      workerRole: task.agentRoleDescription,
      qcRole: task.qcRole || 'To be auto-generated',
      verificationCriteria: task.verificationCriteria || 'To be auto-generated',
      maxRetries: task.maxRetries || 2,
      hasQcVerification: !!task.qcRole,
      dependencies: task.dependencies || [],
      estimatedDuration: task.estimatedDuration,
      parallelGroup: task.parallelGroup,
      createdAt: new Date().toISOString(),
    });
  }
  console.log(`✅ Created ${tasks.length} task definition nodes\n`);
  
  // ✅ NEW: Create dependency edges
  console.log('🔗 Creating task dependency edges...\n');
  const graphManager = await getGraphManager();
  let edgeCount = 0;
  for (const task of tasks) {
    if (task.dependencies && task.dependencies.length > 0) {
      for (const depId of task.dependencies) {
        try {
          await graphManager.addEdge(task.id, depId, 'depends_on', {
            createdBy: 'task-executor',
            createdAt: new Date().toISOString(),
          });
          edgeCount++;
          console.log(`   ✓ ${task.id} → depends_on → ${depId}`);
        } catch (error: any) {
          console.warn(`   ⚠️  Failed to create edge ${task.id} → ${depId}: ${error.message}`);
        }
      }
    }
  }
  console.log(`\n✅ Created ${edgeCount} dependency edges\n`);
  
  // Group tasks by agent role (for preamble reuse)
  const roleMap = new Map<string, TaskDefinition[]>();
  const qcRoleMap = new Map<string, TaskDefinition[]>();
  
  for (const task of tasks) {
    // Group worker roles
    const existing = roleMap.get(task.agentRoleDescription) || [];
    existing.push(task);
    roleMap.set(task.agentRoleDescription, existing);
    
    // Group QC roles (if present)
    if (task.qcRole) {
      const qcExisting = qcRoleMap.get(task.qcRole) || [];
      qcExisting.push(task);
      qcRoleMap.set(task.qcRole, qcExisting);
    }
  }
  
  console.log(`👥 ${roleMap.size} unique worker roles identified`);
  console.log(`👥 ${qcRoleMap.size} unique QC roles identified\n`);
  
  // Generate preambles for each unique role
  console.log('-'.repeat(80));
  console.log('STEP 1: Generate Agent Preambles (Worker + QC)');
  console.log('-'.repeat(80) + '\n');
  
  const rolePreambles = new Map<string, string>();
  const qcRolePreambles = new Map<string, string>();
  
  // Generate worker preambles
  console.log('📝 Generating Worker Preambles...\n');
  for (const [role, roleTasks] of roleMap.entries()) {
    console.log(`\n🔍 DEBUG: Generating preamble for role:`);
    console.log(`   Role: "${role}"`);
    console.log(`   Tasks using this role: ${roleTasks.map(t => t.id).join(', ')}`);
    console.log(`   Worker (${roleTasks.length} tasks): ${role.substring(0, 60)}...`);
    // Pass first task as example to provide concrete context
    const preamblePath = await generatePreamble(role, outputDir, roleTasks[0], false); // false = worker agent
    rolePreambles.set(role, preamblePath);
  }
  
  // Generate QC preambles (now mandatory for ALL tasks)
  console.log('\n📝 Generating QC Preambles...\n');
  
  // Auto-generate QC roles for tasks without them (Phase 4: QC mandatory)
  let autoGeneratedCount = 0;
  for (const task of tasks) {
    if (!task.qcRole) {
      task.qcRole = await autoGenerateQCRole(task);
      task.verificationCriteria = task.verificationCriteria || await autoGenerateVerificationCriteria(task);
      autoGeneratedCount++;
      console.log(`   🤖 Auto-generated QC for ${task.id}: ${task.qcRole.substring(0, 60)}...`);
      
      // Add to QC role map
      const qcExisting = qcRoleMap.get(task.qcRole) || [];
      qcExisting.push(task);
      qcRoleMap.set(task.qcRole, qcExisting);
    }
  }
  
  if (autoGeneratedCount > 0) {
    console.log(`\n   ℹ️  Auto-generated QC roles for ${autoGeneratedCount} tasks (QC now mandatory)\n`);
  }
  
  // Generate preambles for all QC roles
  for (const [qcRole, qcTasks] of qcRoleMap.entries()) {
    console.log(`   QC (${qcTasks.length} tasks): ${qcRole.substring(0, 60)}...`);
    // Pass first task as example to provide concrete context
    const qcPreamblePath = await generatePreamble(qcRole, outputDir, qcTasks[0], true); // true = QC agent
    qcRolePreambles.set(qcRole, qcPreamblePath);
    
    // Store QC preamble path on each task
    for (const task of qcTasks) {
      task.qcPreamblePath = qcPreamblePath;
    }
  }
  
  console.log(`\n✅ Generated ${rolePreambles.size} worker preambles`);
  console.log(`✅ Generated ${qcRolePreambles.size} QC preambles (${autoGeneratedCount} auto-generated)\n`);
  
  // Feature flag for parallel execution (default: false for testing)
  const enableParallelExecution = process.env.MIMIR_PARALLEL_EXECUTION === 'true';
  
  // Organize tasks into batches
  console.log('-'.repeat(80));
  if (enableParallelExecution) {
    console.log('STEP 2: Organize Tasks into Parallel Batches');
  } else {
    console.log('STEP 2: Organize Tasks into Serial Execution Order');
  }
  console.log('-'.repeat(80) + '\n');
  
  const batches = enableParallelExecution 
    ? organizeTasks(tasks)
    : tasks.map(t => [t]); // Serial: one task per batch
  
  if (enableParallelExecution) {
    console.log(`👥 ${batches.length} parallel execution batches identified\n`);
  } else {
    console.log(`🔄 Serial execution mode: ${tasks.length} tasks will execute one at a time\n`);
  }
  
  // Execute batches
  console.log('-'.repeat(80));
  if (enableParallelExecution) {
    console.log('STEP 3: Execute Tasks (Parallel Within Batches)');
  } else {
    console.log('STEP 3: Execute Tasks (Serial Execution)');
  }
  console.log('-'.repeat(80));
  
  const results: ExecutionResult[] = [];
  let shouldStop = false;
  
  for (let i = 0; i < batches.length; i++) {
    if (shouldStop) break;
    
    const batch = batches[i];
    const batchTasks = batch.map(t => t.id).join(', ');
    
    if (batch.length === 1) {
      console.log(`\n📦 Batch ${i + 1}/${batches.length}: Executing ${batchTasks}`);
    } else {
      console.log(`\n📦 Batch ${i + 1}/${batches.length}: Executing ${batch.length} tasks in PARALLEL`);
      console.log(`   Tasks: ${batchTasks}`);
    }
    
    // Execute tasks in batch (parallel if enabled, otherwise serial)
    const batchResults = enableParallelExecution
      ? await Promise.all(
          batch.map(task => executeTask(task, rolePreambles.get(task.agentRoleDescription)!))
        )
      : await Promise.all(
          batch.map(task => executeTask(task, rolePreambles.get(task.agentRoleDescription)!))
        ); // Same for now since batch size is 1 in serial mode
    
    results.push(...batchResults);
    
    // Check for failures in batch
    const failures = batchResults.filter(r => r.status === 'failure');
    if (failures.length > 0) {
      console.error(`\n⛔ ${failures.length} task(s) failed in batch ${i + 1}`);
      failures.forEach(f => {
        console.error(`   ❌ ${f.taskId}: ${f.error}`);
      });
      shouldStop = true;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 EXECUTION SUMMARY');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failure').length;
  const totalDuration = results.reduce((acc, r) => acc + r.duration, 0);
  
  console.log(`\n✅ Successful: ${successful}/${tasks.length}`);
  console.log(`❌ Failed: ${failed}/${tasks.length}`);
  console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s\n`);
  
  results.forEach((result, i) => {
    const icon = result.status === 'success' ? '✅' : '❌';
    console.log(`${icon} ${i + 1}. ${result.taskId} (${(result.duration / 1000).toFixed(2)}s)`);
  });
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  return results;
}

/**
 * Generate final PM report summarizing execution results
 * 
 * Creates comprehensive report with success rates and deliverables.
 * 
 * @param tasks - All task definitions
 * @param results - Execution results
 * @param outputPath - Path to save report
 * 
 * @example
 * await generateFinalReport(tasks, results, 'final-report.md');
 */
export async function generateFinalReport(
  tasks: TaskDefinition[],
  results: ExecutionResult[],
  outputPath: string,
  chainOutputPath: string
): Promise<string> {
  console.log('\n' + '='.repeat(80));
  console.log('📝 GENERATING FINAL EXECUTION REPORT');
  console.log('='.repeat(80) + '\n');
  
  // Read original plan for comparison
  const originalPlan = await fs.readFile(chainOutputPath, 'utf-8');
  
  // Build comprehensive context for Final Report agent
  let reportPrompt = `# Final Execution Report Request

You are the Final Report agent reviewing the completed multi-agent execution. Generate a comprehensive final report comparing the original plan with actual execution results.

## Original Plan
The following was the original plan from ${path.basename(chainOutputPath)}:

<original_plan>
${originalPlan}
</original_plan>

## Execution Overview

**Total Tasks:** ${tasks.length}
**Successful:** ${results.filter(r => r.status === 'success').length}
**Failed:** ${results.filter(r => r.status === 'failure').length}
**Total Duration:** ${(results.reduce((acc, r) => acc + r.duration, 0) / 1000).toFixed(2)}s

---

## Task Execution Details

`;

  // Add each task's details
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const task = tasks.find(t => t.id === result.taskId);
    
    reportPrompt += `### Task ${i + 1}: ${result.taskId}

**Status:** ${result.status === 'success' ? '✅ SUCCESS' : '❌ FAILED'}
**Agent Role:** ${result.agentRoleDescription || 'Unknown'}
**Duration:** ${(result.duration / 1000).toFixed(2)}s
**Tokens:** ${result.tokens ? `${result.tokens.input} input, ${result.tokens.output} output` : 'N/A'}
**Tool Calls:** ${result.toolCalls || 0}
**Graph Node ID:** ${result.graphNodeId || 'Not stored'}

**To retrieve full output later, use:**
\`\`\`
memory_get_node('${result.graphNodeId}')
\`\`\`

`;

    // Add QC verification info if present
    if (result.qcVerification) {
      reportPrompt += `**QC Verification:**
- Attempts: ${result.attemptNumber || 1}/${task?.maxRetries || 2}
- Final Score: ${result.qcVerification.score}/100
- Status: ${result.qcVerification.passed ? '✅ PASSED' : '❌ FAILED'}
- Feedback: ${result.qcVerification.feedback.substring(0, 200)}${result.qcVerification.feedback.length > 200 ? '...' : ''}

`;
    }

    // Add failure details if task failed
    if (result.status === 'failure') {
      if (result.qcVerificationHistory && result.qcVerificationHistory.length > 0) {
        reportPrompt += `**QC Verification History:**
${result.qcVerificationHistory.map((qc, idx) => `
Attempt ${idx + 1}:
- Score: ${qc.score}/100
- Issues: ${qc.issues.length}
- Top Issue: ${qc.issues[0] || 'N/A'}
`).join('\n')}

`;
      }

      if (result.qcFailureReport) {
        reportPrompt += `**QC Failure Report:**
\`\`\`
${result.qcFailureReport.substring(0, 1000)}${result.qcFailureReport.length > 1000 ? '\n\n... (Full report in graph node)' : ''}
\`\`\`

`;
      }
    }

    reportPrompt += `**Agent Output Summary (first 2000 chars):**
\`\`\`
${result.output.substring(0, 2000)}${result.output.length > 2000 ? '\n\n... (Full output stored in graph node above)' : ''}
\`\`\`

${result.error ? `**Error:** ${result.error}\n` : ''}
---

`;
  }

  // Add PM failure summary section if there are failures
  const failures = results.filter(r => r.status === 'failure');
  if (failures.length > 0) {
    reportPrompt += `
## ⚠️ FAILURE ANALYSIS (PM LEVEL)

${failures.length} out of ${results.length} tasks FAILED. As the PM agent, analyze:

1. **Root Cause Patterns**: Are there common reasons across failures?
2. **Technical Feasibility**: Were tasks technically impossible or just poorly executed?
3. **QC Effectiveness**: Did QC correctly identify issues?
4. **Strategic Impact**: How do these failures affect project viability?
5. **Recommendations**: Should we:
   - Revise task definitions?
   - Break tasks into smaller pieces?
   - Change technology approach?
   - Abandon certain goals?

Be honest and strategic in your analysis.

---

`;
  }

  reportPrompt += `
## Report Requirements

Generate a CONCISE final report (MAXIMUM 5000 characters) with the following sections:

### 1. Executive Summary
- 2-3 sentences max summarizing what was accomplished
- Overall success/failure status
- Key metrics (files changed, duration, tokens used)

### 2. Files Changed
For each file (max 20 files):
- **File path**
- **Change type** (created/modified/deleted)
- **Summary** (ONE sentence only)

### 3. Agent Reasoning Summary
For each task (${results.length} total, max 3 sentences per task):
- **Task ID and purpose**
- **Agent approach** (1-2 sentences summarizing strategy)
- **Key decisions** (1 sentence on choices made)
- **Outcome** (1 sentence: success/failure, what was produced)

### 4. Recommendations
- Max 5 bullet points
- ONE sentence per recommendation
- Focus on actionable next steps only

### 5. Metrics Summary
- Bullet points only
- No verbose explanations

**CRITICAL CONSTRAINTS:**
- MAXIMUM OUTPUT LENGTH: 10000 characters
- NO verbose prose - use bullets and short sentences
- Each section: SHORT and DIRECT
- If file list exceeds 20 items, show top 20 and note "... X more files"

**Output Format:**
- Generate markdown content directly (DO NOT wrap in code blocks or triple backticks)
- Start immediately with "# Final Execution Report"
- Use proper markdown headings (##, ###) for sections
- This output will be saved directly to a .md file
`;

  // Load Final Report preamble (v2)
  // Use Mimir installation directory for preambles
  const mimirInstallDir = process.env.MIMIR_INSTALL_DIR || process.cwd();
  const mimirAgentsDir = process.env.MIMIR_AGENTS_DIR || path.join(mimirInstallDir, 'docs', 'agents');
  const reportPreamblePath = path.join(mimirAgentsDir, 'v2', '03-final-report-preamble.md');
  
  try {
    await fs.access(reportPreamblePath);
  } catch {
    console.warn(`⚠️  Final Report preamble not found at ${reportPreamblePath}, using default`);
  }
  
  console.log('🤖 Initializing Final Report agent...');
  
  // Resolve model selection based on feature flag
  // Note: For final report, we use a dummy task object since there's no specific task
  const dummyTask: Partial<TaskDefinition> = { id: 'final-report', title: 'Final Report' };
  const modelSelection = await resolveModelSelection(dummyTask as TaskDefinition, 'pm');
  
  const reportAgent = new CopilotAgentClient({
    preamblePath: reportPreamblePath,
    ...modelSelection, // Spread provider/model or agentType
    temperature: 0.0,
    maxTokens: 3000, // STRICT LIMIT: Concise reports only (prevents verbose bloat)
  });
  
  await reportAgent.loadPreamble(reportPreamblePath);
  
  console.log('📊 Generating comprehensive report...\n');
  
  const reportResult = await reportAgent.execute(reportPrompt);
  
  // Save report
  await fs.writeFile(outputPath, reportResult.output, 'utf-8');
  
  console.log(`✅ Final report saved to: ${outputPath}`);
  console.log(`📊 Report generation: ${reportResult.tokens.input + reportResult.tokens.output} tokens\n`);
  
  return reportResult.output;
}

/**
 * CLI Entry Point
 */
export async function main() {
  const chainOutputPath = process.argv[2] || 'generated-agents/chain-output.md';
  
  if (!chainOutputPath) {
    console.error('❌ Usage: npm run execute <chain-output.md>');
    process.exit(1);
  }
  
  try {
    // Determine output directory (same directory as chain output, or current working directory)
    const outputDir = path.join(path.dirname(chainOutputPath), 'generated-agents');
    
    // Execute tasks (this will parse the chain output internally)
    const results = await executeChainOutput(chainOutputPath, outputDir);
    
    // Parse tasks for the final report (we need the task definitions)
    const markdown = await fs.readFile(chainOutputPath, 'utf-8');
    const tasks = parseChainOutput(markdown);
    
    // Generate final execution report
    const reportPath = path.join(path.dirname(chainOutputPath), 'execution-report.md');
    await generateFinalReport(tasks, results, reportPath, chainOutputPath);
    
    const failed = results.filter(r => r.status === 'failure').length;
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (error: any) {
    console.error(`\n❌ Execution failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

