/**
 * Task Executor - Executes tasks from chain output
 * 
 * Flow:
 * 1. Parse chain-output.md to extract tasks
 * 2. For each unique agent role, generate preamble via agentinator
 * 3. Execute tasks sequentially with appropriate preambles
 */

import { CopilotAgentClient } from './llm-client.js';
import { CopilotModel } from './types.js';
import { LLMConfigLoader } from '../config/LLMConfigLoader.js';
import { createGraphManager } from '../managers/index.js';
import type { GraphManager } from '../managers/GraphManager.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
 * Returns null if parsing fails or model not found in config
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
    
    try {
      // Validate that this provider/model exists in config
      await configLoader.getModelConfig(provider, model);
      return { provider, model };
    } catch (error: any) {
      console.warn(`⚠️  PM-suggested model "${provider}/${model}" not found in config`);
      return null;
    }
  } else {
    // Format: just "gpt-oss" - try to find it in default provider
    const config = await configLoader.load();
    const defaultProvider = config.defaultProvider;
    
    try {
      await configLoader.getModelConfig(defaultProvider, recommended);
      return { provider: defaultProvider, model: recommended };
    } catch (error: any) {
      console.warn(`⚠️  PM-suggested model "${recommended}" not found in default provider`);
      return null;
    }
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

/**
 * Map friendly model names to actual CopilotModel enum values
 */
function mapModelName(friendlyName: string): CopilotModel {
  const normalized = friendlyName.toLowerCase().trim();
  
  // Direct mappings
  const modelMap: Record<string, CopilotModel> = {
    'gpt-4.1': CopilotModel.GPT_4_1,
    'gpt-4': CopilotModel.GPT_4,
    'gpt-4o': CopilotModel.GPT_4O,
    'gpt-4o-mini': CopilotModel.GPT_4O_MINI,
    'claude sonnet 4': CopilotModel.CLAUDE_SONNET_4,
    'claude-sonnet-4': CopilotModel.CLAUDE_SONNET_4,
    'claude 3.7 sonnet': CopilotModel.CLAUDE_3_7_SONNET,
    'claude-3.7-sonnet': CopilotModel.CLAUDE_3_7_SONNET,
    'o3-mini': CopilotModel.O3_MINI,
    'gemini-2.5-pro': CopilotModel.GEMINI_2_5_PRO,
  };
  
  // Try exact match first
  if (modelMap[normalized]) {
    return modelMap[normalized];
  }
  
  // Fallback: default to GPT-4.1 for testing
  console.warn(`⚠️  Unknown model "${friendlyName}", defaulting to GPT-4.1`);
  return CopilotModel.GPT_4_1;
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
  
  // QC Verification fields
  qcRole?: string; // QC Agent Role Description
  verificationCriteria?: string; // Checklist for QC verification
  maxRetries?: number; // Max retry attempts before failure
  qcPreamblePath?: string; // Path to generated QC preamble
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
}

/**
 * Organize tasks into parallel execution batches based on dependencies
 * Tasks with no dependencies or whose dependencies are satisfied can run in parallel
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
export function parseChainOutput(markdown: string): TaskDefinition[] {
  const tasks: TaskDefinition[] = [];
  
  // LOOSE PARSING: Try multiple patterns to find task sections
  // Pattern 1: ### Task ID: or #### Task ID: or **Task ID:**
  // Pattern 2: task-X.Y anywhere in a heading
  // Pattern 3: Task X.Y: Title format
  
  // Split by any heading that might contain a task
  const possibleTaskSections = markdown.split(/(?=#{2,4}\s+Task|\*\*Task)/i);
  
  for (const section of possibleTaskSections) {
    if (!section.trim()) continue;
    
    // Try to extract task ID using multiple patterns (LOOSE)
    let taskId: string | undefined;
    
    // Pattern 1: ### Task ID: task-X.Y or #### Task ID: task-X.Y
    const taskIdPattern1 = section.match(/#{2,4}\s+Task\s+ID[:\s]+([^\n]+)/i);
    if (taskIdPattern1) {
      taskId = taskIdPattern1[1].trim();
    }
    
    // Pattern 2: **Task ID:** task-X.Y or - **Task ID:** task-X.Y
    if (!taskId) {
      const taskIdPattern2 = section.match(/\*\*Task\s+ID[:\s]*\*\*[:\s]*([^\n]+)/i);
      if (taskIdPattern2) {
        taskId = taskIdPattern2[1].trim();
      }
    }
    
    // Pattern 3: task-X.Y anywhere in first line
    if (!taskId) {
      const taskIdPattern3 = section.match(/task[-\s]*(\d+\.\d+)/i);
      if (taskIdPattern3) {
        taskId = `task-${taskIdPattern3[1]}`;
      }
    }
    
    // Pattern 4: Task X.Y: anywhere in heading
    if (!taskId) {
      const taskIdPattern4 = section.match(/Task\s+(\d+\.\d+)[:\s]/i);
      if (taskIdPattern4) {
        taskId = `task-${taskIdPattern4[1]}`;
      }
    }
    
    if (!taskId) continue;
    
    // Helper function to extract field value (VERY LOOSE)
    // Try multiple patterns and return first match
    const extractField = (fieldName: string, aliases: string[] = []): string | undefined => {
      const allNames = [fieldName, ...aliases];
      
      for (const name of allNames) {
        // Pattern 1: **Field Name**\nValue or **Field Name:**\nValue
        const pattern1 = new RegExp(`\\*\\*${name}[:\\s]*\\*\\*[:\\s]*\\n([\\s\\S]+?)(?=\\n\\*\\*[A-Z]|\\n---|\\n#{2,4}|$)`, 'i');
        const match1 = section.match(pattern1);
        if (match1) return match1[1].trim();
        
        // Pattern 2: - **Field Name**: Value or - **Field Name:** Value
        const pattern2 = new RegExp(`-\\s*\\*\\*${name}[:\\s]*\\*\\*[:\\s]*([^\\n]+)`, 'i');
        const match2 = section.match(pattern2);
        if (match2) return match2[1].trim();
        
        // Pattern 3: **Field Name**: Value (inline)
        const pattern3 = new RegExp(`\\*\\*${name}[:\\s]*\\*\\*[:\\s]*([^\\n]+)`, 'i');
        const match3 = section.match(pattern3);
        if (match3) return match3[1].trim();
        
        // Pattern 4: Field Name: Value (no bold)
        const pattern4 = new RegExp(`${name}[:\\s]+([^\\n]+)`, 'i');
        const match4 = section.match(pattern4);
        if (match4) return match4[1].trim();
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
    
    // Skip if no role found (but be lenient - use taskId as fallback)
    const finalAgentRole = agentRole || `Agent for ${taskId}`;
    
    // Recommended Model (optional - default to gpt-4.1)
    const model = extractField('Recommended Model', ['Model', 'Recommended']) || 'gpt-4.1';
    
    // Prompt (try multiple field names, be very loose)
    let prompt: string | undefined;
    const promptSection = extractField('Optimized Prompt', ['Prompt', 'Task Description', 'Description', 'Instructions', 'Work'])
                       || extractField('Prompt', [])
                       || extractField('Description', []);
    
    if (promptSection) {
      // Try to extract from <prompt> tags if present
      const promptTagMatch = promptSection.match(/<prompt>\s*([\s\S]+?)\s*<\/prompt>/i);
      if (promptTagMatch) {
        prompt = promptTagMatch[1].trim();
      } else {
        // Use raw content, strip HTML tags
        prompt = promptSection.replace(/<[^>]+>/g, '').trim();
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
      prompt = section.substring(0, 500).trim();
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
    });
  }
  
  return tasks;
}

/**
 * Generate preamble for agent role via agentinator (or create a simple one as fallback)
 */
export async function generatePreamble(
  roleDescription: string,
  outputDir: string = 'generated-agents'
): Promise<string> {
  // Create hash of role description for filename
  const roleHash = crypto.createHash('md5').update(roleDescription).digest('hex').substring(0, 8);
  const preamblePath = path.join(outputDir, `worker-${roleHash}.md`);
  
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });
  
  // Check if preamble already exists (reuse)
  try {
    await fs.access(preamblePath);
    console.log(`  ♻️  Reusing existing preamble: ${preamblePath}`);
    return preamblePath;
  } catch {
    // Doesn't exist, generate it
  }
  
  console.log(`  🔨 Generating preamble for role: ${roleDescription.substring(0, 60)}...`);
  
  // Try agentinator first, but fall back to simple preamble if it fails
  try {
    // Determine the Mimir installation directory
    const mimirInstallDir = process.env.MIMIR_INSTALL_DIR || process.cwd();
    
    // Call agentinator via npm script (must run from Mimir directory)
    const command = `npm run create-agent "${roleDescription}"`;
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: mimirInstallDir,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000, // 30 second timeout
    });
    
    // Agentinator outputs to its own generated-agents/ directory
    const mimirGeneratedDir = path.join(mimirInstallDir, 'generated-agents');
    const files = await fs.readdir(mimirGeneratedDir);
    const mdFiles = files
      .filter(f => f.endsWith('.md') && f.startsWith('2025-'))
      .sort()
      .reverse();
    
    if (mdFiles.length > 0) {
      // Copy the generated file to user's output directory
      const generatedFile = path.join(mimirGeneratedDir, mdFiles[0]);
      const content = await fs.readFile(generatedFile, 'utf-8');
      await fs.writeFile(preamblePath, content, 'utf-8');
      console.log(`  ✅ Generated: ${path.basename(preamblePath)}`);
      return preamblePath;
    }
  } catch (error: any) {
    console.warn(`  ⚠️  Agentinator failed (${error.message}), creating simple preamble...`);
  }
  
  // Fallback: Create a simple but effective preamble directly
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

  await fs.writeFile(preamblePath, simplePreamble, 'utf-8');
  console.log(`  ✅ Created simple preamble: ${path.basename(preamblePath)}`);
  return preamblePath;
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

## YOUR TASK
1. **Aggressively verify** the worker output against EVERY criterion above
2. **Check for hallucinations**: Fabricated libraries, fake version numbers, non-existent APIs, made-up standards
3. **Verify claims**: If worker cites sources, frameworks, or specifications, they must be real and accurate
4. **Check completeness**: All required sections present and detailed
5. **Validate technical accuracy**: Code examples must be syntactically correct and use real libraries

## OUTPUT FORMAT (CRITICAL - MUST FOLLOW EXACTLY)

### QC VERDICT: [PASS or FAIL]

### SCORE: [0-100]

### FEEDBACK:
[2-3 sentences max. Be specific and concise about what passed/failed.]

### ISSUES FOUND (if FAIL):
- Issue 1: [One sentence max per issue]
- Issue 2: [One sentence max per issue]
- Issue 3: [One sentence max per issue]
(Maximum 10 issues)

### REQUIRED FIXES (if FAIL):
- Fix 1: [One sentence max per fix]
- Fix 2: [One sentence max per fix]
- Fix 3: [One sentence max per fix]
(Maximum 10 fixes)

**IMPORTANT CONSTRAINTS:**
- **MAXIMUM OUTPUT LENGTH: 2000 characters**
- Be AGGRESSIVE and THOROUGH but CONCISE
- Each issue/fix: ONE sentence maximum
- Feedback: 2-3 sentences maximum
- If you find ANY hallucinations, mark as FAIL immediately with specific evidence
- DO NOT write verbose explanations - keep responses SHORT and DIRECT
- DO NOT repeat information - state each point ONCE

DO NOT give the worker the benefit of the doubt. If something seems questionable, investigate it and mark as FAIL if you cannot verify it.`;
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
  attemptNumber: number
): Promise<QCResult> {
  if (!task.qcPreamblePath) {
    throw new Error(`No QC preamble path for task ${task.id}`);
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
    
    // Initialize QC agent with strict output limits
    const qcAgent = new CopilotAgentClient({
      preamblePath: task.qcPreamblePath,
      ...modelSelection, // Spread provider/model or agentType
      temperature: 0.0, // Maximum consistency and strictness
      maxTokens: 1000, // STRICT LIMIT: Force concise responses (prevents verbose QC bloat)
    });
    
    await qcAgent.loadPreamble(task.qcPreamblePath);
    
    // Execute QC verification
    const result = await qcAgent.execute(qcPrompt);
    
    // Parse QC response
    const qcResult = parseQCResponse(result.output);
    
    console.log(`${qcResult.passed ? '✅' : '❌'} QC ${qcResult.passed ? 'PASSED' : 'FAILED'} (score: ${qcResult.score}/100)`);
    
    return qcResult;
  } catch (error: any) {
    console.error(`❌ QC agent execution failed: ${error.message}`);
    // Return a FAIL result if QC agent crashes
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
    
    const qcAgent = new CopilotAgentClient({
      preamblePath: task.qcPreamblePath,
      ...modelSelection, // Spread provider/model or agentType
      temperature: 0.0,
      maxTokens: 2000, // STRICT LIMIT: Concise failure reports only
    });
    
    await qcAgent.loadPreamble(task.qcPreamblePath);
    const result = await qcAgent.execute(reportPrompt);
    
    return result.output;
  } catch (error: any) {
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
    let parsedContext;
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
 * Create task node in graph for tracking (idempotent)
 */
async function createGraphNode(taskId: string, properties: Record<string, any>): Promise<void> {
  const graphManager = await getGraphManager();
  
  try {
    // Try to get existing node first
    const existing = await graphManager.getNode(taskId);
    
    if (existing) {
      console.log(`♻️  Task node ${taskId} already exists, updating instead`);
      await graphManager.updateNode(taskId, properties);
      return;
    }
  } catch (error) {
    // Node doesn't exist, create it
  }
  
  // Create new node
  console.log(`💾 Creating task node: ${taskId}`);
  try {
    await graphManager.addNode('todo', {
      id: taskId,
      ...properties,
    });
    console.log(`✅ Task node created: ${taskId}`);
  } catch (error: any) {
    console.error(`❌ Failed to create graph node ${taskId}:`, error.message);
    // Don't throw - log and continue (allows execution to proceed even if graph fails)
  }
}

/**
 * Update task node in graph
 */
async function updateGraphNode(taskId: string, properties: Record<string, any>): Promise<void> {
  try {
    const graphManager = await getGraphManager();
    
    await graphManager.updateNode(taskId, properties);
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
- **Tool Calls:** ${workerResult.metadata?.toolCallCount || 0} (limit: 80)
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
    
    const analysisAgent = new CopilotAgentClient({
      preamblePath: qcPreamblePath,
      agentType: 'qc',
      temperature: 0.0,
    });
    
    await analysisAgent.loadPreamble(qcPreamblePath);
    const result = await analysisAgent.execute(analysisPrompt);
    
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
 * Execute a single task with Worker → QC → Retry flow
 */
export async function executeTask(
  task: TaskDefinition,
  preamblePath: string
): Promise<ExecutionResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 Executing Task: ${task.title}`);
  console.log(`🆔 Task ID: ${task.id}`);
  console.log(`🤖 Worker Preamble: ${preamblePath}`);
  if (task.qcPreamblePath) {
    console.log(`🔍 QC Preamble: ${task.qcPreamblePath}`);
    console.log(`🔁 Max Retries: ${task.maxRetries || 2}`);
  }
  console.log(`⏱️  Estimated Duration: ${task.estimatedDuration}`);
  console.log('='.repeat(80) + '\n');
  
  const startTime = Date.now();
  const maxRetries = task.maxRetries || 2;
  let attemptNumber = 1;
  let workerOutput = '';
  const qcVerificationHistory: QCResult[] = [];
  let errorContext: any = null;
  
  // 🚨 PHASE 4: QC IS NOW MANDATORY FOR ALL TASKS
  // QC roles and preambles should have been generated during task parsing
  // This is a safety check in case executeTask is called directly
  if (!task.qcRole || !task.qcPreamblePath) {
    throw new Error(`Task ${task.id} missing QC configuration. QC is now mandatory for all tasks. Please regenerate chain-output.md with QC roles.`);
  }
  
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
  
  // Worker → QC → Retry loop
  while (attemptNumber <= maxRetries) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔄 ATTEMPT ${attemptNumber}/${maxRetries}`);
    console.log('─'.repeat(80));
    
    try {
      // STEP 1: Execute Worker
      console.log(`\n👷 Executing worker agent...`);
      console.log(`📥 Pre-fetching task context from graph...`);
      
      // Pre-fetch context from graph
      const workerContext = await fetchTaskContext(task.id, 'worker');
      
      // Resolve model selection based on PM suggestion and feature flag
      const modelSelection = await resolveModelSelection(task, 'worker');
      
      const workerAgent = new CopilotAgentClient({
        preamblePath,
        ...modelSelection, // Spread provider/model or agentType
        temperature: 0.0,
      });
      
      await workerAgent.loadPreamble(preamblePath);
      
      // Build worker prompt with pre-fetched context
      let workerPrompt = `${workerContext}

${task.prompt}`;
      
      if (attemptNumber > 1 && errorContext) {
        workerPrompt = `${workerContext}

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
      
      const workerResult = await workerAgent.execute(workerPrompt);
      workerOutput = workerResult.output;
      
      const workerDuration = Date.now() - startTime;
      console.log(`✅ Worker completed in ${(workerDuration / 1000).toFixed(2)}s`);
      console.log(`📊 Tokens: ${workerResult.tokens.input + workerResult.tokens.output}`);
      console.log(`🔧 Tool calls: ${workerResult.toolCalls}`);
      
      // 🚨 CIRCUIT BREAKER: Check if intervention needed
      if (workerResult.metadata) {
        const { qcRecommended, circuitBreakerTriggered, toolCallCount, messageCount, estimatedContextTokens } = workerResult.metadata;
        
        if (circuitBreakerTriggered) {
          console.log(`\n${'🚨'.repeat(40)}`);
          console.log(`🚨 CIRCUIT BREAKER TRIGGERED - HARD LIMIT EXCEEDED`);
          console.log(`   Tool Calls: ${toolCallCount} (limit: 80)`);
          console.log(`   Messages: ${messageCount}`);
          console.log(`   Estimated Context: ~${estimatedContextTokens.toLocaleString()} tokens`);
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
              qcFeedback: `Circuit breaker triggered: ${toolCallCount} tool calls (limit: 80)`,
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
            continue; // Skip normal QC, go straight to retry with guidance
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
              preamblePath,
              agentRoleDescription: task.agentRoleDescription,
              prompt: task.prompt,
              error: `Circuit breaker triggered: ${toolCallCount} tool calls exceeded limit`,
              circuitBreakerAnalysis,
              attemptNumber: maxRetries,
              graphNodeId: task.id,
            };
          }
        }
        
        if (qcRecommended) {
          console.log(`\n⚠️  QC INTERVENTION RECOMMENDED`);
          console.log(`   Tool Calls: ${toolCallCount}`);
          console.log(`   Messages: ${messageCount}`);
          console.log(`   Estimated Context: ~${estimatedContextTokens.toLocaleString()} tokens`);
          console.log(`   💡 QC will review for potential issues\n`);
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
      const qcResult = await executeQCAgent(task, workerOutput, attemptNumber);
      
      // Truncate QC output to prevent context explosion (critical for retries)
      const truncatedQCResult: QCResult = {
        passed: qcResult.passed,
        score: qcResult.score,
        feedback: qcResult.feedback.substring(0, 500), // Max 500 chars
        issues: qcResult.issues.slice(0, 10).map(issue => issue.substring(0, 200)), // Max 10 issues, 200 chars each
        requiredFixes: qcResult.requiredFixes.slice(0, 10).map(fix => fix.substring(0, 200)), // Max 10 fixes, 200 chars each
        timestamp: qcResult.timestamp,
      };
      
      qcVerificationHistory.push(truncatedQCResult);
      
      // Store QC result in graph immediately
      await updateGraphNode(task.id, {
        [`qcAttempt${attemptNumber}`]: JSON.stringify({
          passed: truncatedQCResult.passed,
          score: truncatedQCResult.score,
          feedback: truncatedQCResult.feedback.substring(0, 500),
          issuesCount: truncatedQCResult.issues.length,
          timestamp: truncatedQCResult.timestamp,
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
      if (truncatedQCResult.passed) {
        // ✅ SUCCESS - QC approved the output
        const duration = Date.now() - startTime;
        console.log(`\n✅ TASK COMPLETED SUCCESSFULLY after ${attemptNumber} attempt(s)`);
        
        // Update graph with final success status
        await updateGraphNode(task.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          totalDuration: duration,
          finalAttempt: attemptNumber,
          outcome: 'success',
        });
        
        const executionResult: Omit<ExecutionResult, 'graphNodeId'> = {
          taskId: task.id,
          status: 'success',
          output: workerOutput,
          duration,
          preamblePath,
          agentRoleDescription: task.agentRoleDescription,
          prompt: task.prompt,
          tokens: workerResult.tokens,
          toolCalls: workerResult.toolCalls,
          qcVerification: truncatedQCResult,
          qcVerificationHistory,
          attemptNumber,
        };
        
        const graphNodeId = await storeTaskResultInGraph(task, executionResult);
        
        return {
          ...executionResult,
          graphNodeId,
        };
      }
      
      // ❌ QC FAILED
      console.log(`\n❌ QC FAILED on attempt ${attemptNumber}`);
      console.log(`   Score: ${truncatedQCResult.score}/100`);
      console.log(`   Issues: ${truncatedQCResult.issues.length}`);
      
      if (attemptNumber < maxRetries) {
        // Prepare error context for next retry (use truncated version to prevent bloat)
        errorContext = {
          qcScore: truncatedQCResult.score,
          qcFeedback: truncatedQCResult.feedback,
          issues: truncatedQCResult.issues,
          requiredFixes: truncatedQCResult.requiredFixes,
          previousAttempt: attemptNumber,
        };
        
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
  });
  
  const executionResult: Omit<ExecutionResult, 'graphNodeId'> = {
    taskId: task.id,
    status: 'failure',
    output: workerOutput,
    duration,
    preamblePath,
    agentRoleDescription: task.agentRoleDescription,
    prompt: task.prompt,
    error: `QC verification failed after ${maxRetries} attempts`,
    qcVerification: qcVerificationHistory[qcVerificationHistory.length - 1],
    qcVerificationHistory,
    qcFailureReport,
    attemptNumber: maxRetries,
  };
  
  const graphNodeId = await storeTaskResultInGraph(task, executionResult);
  
  return {
    ...executionResult,
    graphNodeId,
  };
}

/**
 * Legacy task execution (no QC verification)
 */
async function executeTaskLegacy(
  task: TaskDefinition,
  preamblePath: string,
  startTime: number
): Promise<ExecutionResult> {
  try {
    const agent = new CopilotAgentClient({
      preamblePath,
      agentType: 'worker', // Use worker agent defaults from config
      temperature: 0.0,
    });
    
    await agent.loadPreamble(preamblePath);
    const result = await agent.execute(task.prompt);
    
    const duration = Date.now() - startTime;
    
    console.log(`\n✅ Task completed in ${(duration / 1000).toFixed(2)}s`);
    console.log(`📊 Tokens: ${result.tokens.input + result.tokens.output}`);
    console.log(`🔧 Tool calls: ${result.toolCalls}`);
    
    // 🚨 Check for circuit breaker issues (legacy tasks without QC)
    if (result.metadata?.qcRecommended) {
      console.log(`\n⚠️  WARNING: Task exceeded safety thresholds`);
      console.log(`   Tool Calls: ${result.metadata.toolCallCount}`);
      console.log(`   Messages: ${result.metadata.messageCount}`);
      console.log(`   Context: ~${result.metadata.estimatedContextTokens.toLocaleString()} tokens`);
      console.log(`   💡 Consider adding QC verification to this task type\n`);
    }
    
    if (result.metadata?.circuitBreakerTriggered) {
      console.log(`\n${'🚨'.repeat(40)}`);
      console.log(`🚨 WARNING: Circuit breaker would have triggered`);
      console.log(`   This task completed but exceeded safety limits`);
      console.log(`   Tool Calls: ${result.metadata.toolCallCount} (limit: 80)`);
      console.log(`   💡 RECOMMENDATION: Add QC verification to prevent runaway execution`);
      console.log(`${'🚨'.repeat(40)}\n`);
    }
    
    const executionResult: Omit<ExecutionResult, 'graphNodeId'> = {
      taskId: task.id,
      status: 'success',
      output: result.output,
      duration,
      preamblePath,
      agentRoleDescription: task.agentRoleDescription,
      prompt: task.prompt,
      tokens: result.tokens,
      toolCalls: result.toolCalls,
    };
    
    const graphNodeId = await storeTaskResultInGraph(task, executionResult);
    
    return {
      ...executionResult,
      graphNodeId,
    };
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    console.error(`\n❌ Task failed after ${(duration / 1000).toFixed(2)}s`);
    console.error(`Error: ${error.message}`);
    
    const executionResult: Omit<ExecutionResult, 'graphNodeId'> = {
      taskId: task.id,
      status: 'failure',
      output: '',
      error: error.message,
      duration,
      preamblePath,
      agentRoleDescription: task.agentRoleDescription,
      prompt: task.prompt,
    };
    
    const graphNodeId = await storeTaskResultInGraph(task, executionResult);
    
    return {
      ...executionResult,
      graphNodeId,
    };
  }
}

/**
 * Execute all tasks from chain output
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
    console.log(`   Worker (${roleTasks.length} tasks): ${role.substring(0, 60)}...`);
    const preamblePath = await generatePreamble(role, outputDir);
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
    const qcPreamblePath = await generatePreamble(qcRole, outputDir);
    qcRolePreambles.set(qcRole, qcPreamblePath);
    
    // Store QC preamble path on each task
    for (const task of qcTasks) {
      task.qcPreamblePath = qcPreamblePath;
    }
  }
  
  console.log(`\n✅ Generated ${rolePreambles.size} worker preambles`);
  console.log(`✅ Generated ${qcRolePreambles.size} QC preambles (${autoGeneratedCount} auto-generated)\n`);
  
  // Organize tasks into parallel batches
  console.log('-'.repeat(80));
  console.log('STEP 2: Organize Tasks into Parallel Batches');
  console.log('-'.repeat(80) + '\n');
  
  const batches = organizeTasks(tasks);
  console.log(`👥 ${batches.length} parallel execution batches identified\n`);
  
  // Execute batches sequentially, tasks within batch in parallel
  console.log('-'.repeat(80));
  console.log('STEP 3: Execute Tasks (Parallel Within Batches)');
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
    
    // Execute all tasks in batch concurrently
    const batchResults = await Promise.all(
      batch.map(task => executeTask(task, rolePreambles.get(task.agentRoleDescription)!))
    );
    
    results.push(...batchResults);
    
    // Check for failures in batch
    const failures = batchResults.filter(r => r.status === 'failure');
    if (failures.length > 0) {
      console.error(`\n⛔ ${failures.length} task(s) failed in batch ${i + 1}`);
      failures.forEach(f => console.error(`   ❌ ${f.taskId}: ${f.error}`));
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
 * Generate final PM report summarizing all execution results
 */
export async function generateFinalReport(
  tasks: TaskDefinition[],
  results: ExecutionResult[],
  outputPath: string
): Promise<string> {
  console.log('\n' + '='.repeat(80));
  console.log('📝 GENERATING FINAL PM REPORT');
  console.log('='.repeat(80) + '\n');
  
  // Build comprehensive context for PM
  let reportPrompt = `# Final Execution Report Request

You are the PM agent reviewing the completed multi-agent execution. Generate a comprehensive final report.

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
graph_get_node('${result.graphNodeId}')
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
- MAXIMUM OUTPUT LENGTH: 5000 characters
- NO verbose prose - use bullets and short sentences
- Each section: SHORT and DIRECT
- If file list exceeds 20 items, show top 20 and note "... X more files"

**Output Format:** Generate this as a well-structured markdown document ready to save as a file.
`;

  // Load PM preamble
  // Use Mimir installation directory for PM preamble
  const mimirInstallDir = process.env.MIMIR_INSTALL_DIR || process.cwd();
  const mimirAgentsDir = process.env.MIMIR_AGENTS_DIR || path.join(mimirInstallDir, 'docs', 'agents');
  const pmPreamblePath = path.join(mimirAgentsDir, 'claudette-pm.md');
  
  try {
    await fs.access(pmPreamblePath);
  } catch {
    console.warn(`⚠️  PM preamble not found at ${pmPreamblePath}, using default`);
  }
  
  console.log('🤖 Initializing PM agent for final report...');
  
  // Resolve model selection based on PM suggestion and feature flag
  // Note: For final report, we use a dummy task object since there's no specific task
  const dummyTask: Partial<TaskDefinition> = { id: 'final-report', title: 'Final Report' };
  const modelSelection = await resolveModelSelection(dummyTask as TaskDefinition, 'pm');
  
  const pmAgent = new CopilotAgentClient({
    preamblePath: pmPreamblePath,
    ...modelSelection, // Spread provider/model or agentType
    temperature: 0.0,
    maxTokens: 3000, // STRICT LIMIT: Concise reports only (prevents verbose PM bloat)
  });
  
  await pmAgent.loadPreamble(pmPreamblePath);
  
  console.log('📊 Generating comprehensive report...\n');
  
  const reportResult = await pmAgent.execute(reportPrompt);
  
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
    // Read and parse tasks
    const markdown = await fs.readFile(chainOutputPath, 'utf-8');
    const tasks = parseChainOutput(markdown);
    
    // Determine output directory (same directory as chain output, or current working directory)
    const outputDir = path.join(path.dirname(chainOutputPath), 'generated-agents');
    
    // Execute tasks
    const results = await executeChainOutput(chainOutputPath, outputDir);
    
    // Generate final PM report
    const reportPath = path.join(path.dirname(chainOutputPath), 'execution-report.md');
    await generateFinalReport(tasks, results, reportPath);
    
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

