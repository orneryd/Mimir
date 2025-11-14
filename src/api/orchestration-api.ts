import { Router, Request, Response } from 'express';
import type { IGraphManager } from '../types/index.js';
import { CopilotAgentClient } from '../orchestrator/llm-client.js';
import { CopilotModel } from '../orchestrator/types.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import neo4j from 'neo4j-driver';
import { executeTask, generatePreamble, type TaskDefinition, type ExecutionResult } from '../orchestrator/task-executor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory execution state manager
interface Deliverable {
  filename: string;
  content: string;
  mimeType: string;
  size: number;
}

interface ExecutionState {
  executionId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentTaskId: string | null;
  taskStatuses: Record<string, 'pending' | 'executing' | 'completed' | 'failed'>;
  results: ExecutionResult[];
  deliverables: Deliverable[]; // In-memory file contents
  startTime: number;
  endTime?: number;
  error?: string;
  cancelled?: boolean; // Flag to request cancellation
}

const executionStates = new Map<string, ExecutionState>();
const sseClients = new Map<string, any[]>(); // Use any for SSE streaming

// Helper to send SSE event
function sendSSEEvent(executionId: string, event: string, data: any) {
  const clients = sseClients.get(executionId) || [];
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  clients.forEach((client) => {
    try {
      client.write(message);
    } catch (error) {
      console.error('Failed to send SSE event:', error);
    }
  });
}

/**
 * Generate agent preamble using Agentinator
 */
async function generatePreambleWithAgentinator(
  roleDescription: string,
  agentType: 'worker' | 'qc'
): Promise<{ name: string; role: string; content: string }> {
  try {
    // Load Agentinator preamble
    const agentinatorPath = path.join(__dirname, '../../docs/agents/v2/02-agentinator-preamble.md');
    const agentinatorPreamble = await fs.readFile(agentinatorPath, 'utf-8');

    // Load appropriate template
    const templatePath = path.join(
      __dirname,
      '../../docs/agents/v2/templates',
      agentType === 'worker' ? 'worker-template.md' : 'qc-template.md'
    );
    const template = await fs.readFile(templatePath, 'utf-8');

    // Build Agentinator prompt
    const agentinatorPrompt = `${agentinatorPreamble}

---

## INPUT

<agent_type>
${agentType}
</agent_type>

<role_description>
${roleDescription}
</role_description>

<template_path>
${agentType === 'worker' ? 'templates/worker-template.md' : 'templates/qc-template.md'}
</template_path>

---

<template_content>
${template}
</template_content>

---

Generate the complete ${agentType} preamble now. Output the preamble directly as markdown (no code fences, no explanations).`;

    // Call LLM with Agentinator preamble
    // Use Docker service name for inter-container communication
    const apiUrl = process.env.COPILOT_API_URL || 'http://copilot-api:4141/v1/chat/completions';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-copilot-dummy',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'user',
            content: agentinatorPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 16000, // Large enough for full preambles
      }),
    });

    if (!response.ok) {
      throw new Error(`Agentinator API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const preambleContent = data.choices[0]?.message?.content || '';

    if (!preambleContent) {
      throw new Error('Agentinator returned empty preamble');
    }

    // Extract name from role description (first 3-5 words)
    const words = roleDescription.trim().split(/\s+/);
    const name = words.slice(0, Math.min(5, words.length)).join(' ');

    console.log(`✅ Agentinator generated ${preambleContent.length} character preamble for: ${name}`);

    return {
      name,
      role: roleDescription,
      content: preambleContent,
    };
  } catch (error) {
    console.error('Agentinator generation failed:', error);
    throw new Error(`Failed to generate preamble with Agentinator: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Execute workflow from Task Canvas JSON format
 * Converts UI tasks to TaskDefinition format and executes them
 */
async function executeWorkflowFromJSON(
  uiTasks: any[],
  agentTemplates: any[],
  outputDir: string,
  executionId: string
): Promise<ExecutionResult[]> {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 WORKFLOW EXECUTOR (JSON MODE)');
  console.log('='.repeat(80));
  console.log(`📄 Execution ID: ${executionId}`);
  console.log(`📁 Output Directory: ${outputDir}\n`);

  // Initialize execution state
  const initialTaskStatuses: Record<string, 'pending' | 'executing' | 'completed' | 'failed'> = {};
  uiTasks.forEach(task => {
    initialTaskStatuses[task.id] = 'pending';
  });

  executionStates.set(executionId, {
    executionId,
    status: 'running',
    currentTaskId: null,
    taskStatuses: initialTaskStatuses,
    results: [],
    deliverables: [],
    startTime: Date.now(),
  });

  // Emit execution start event
  sendSSEEvent(executionId, 'execution-start', {
    executionId,
    totalTasks: uiTasks.length,
    startTime: Date.now(),
  });

  // Convert UI tasks to TaskDefinition format
  const taskDefinitions: TaskDefinition[] = uiTasks.map(task => ({
    id: task.id,
    title: task.title || task.id,
    agentRoleDescription: task.agentRoleDescription,
    recommendedModel: task.recommendedModel || 'gpt-4.1',
    prompt: task.prompt,
    dependencies: task.dependencies || [],
    estimatedDuration: task.estimatedDuration || '30 min',
    parallelGroup: task.parallelGroup,
    qcRole: task.qcAgentRoleDescription,
    verificationCriteria: task.verificationCriteria ? task.verificationCriteria.join('\n') : undefined,
    maxRetries: task.maxRetries || 2,
    estimatedToolCalls: task.estimatedToolCalls,
  }));

  console.log(`📋 Converted ${taskDefinitions.length} UI tasks to TaskDefinition format\n`);

  // Generate preambles for each unique role
  console.log('-'.repeat(80));
  console.log('STEP 1: Generate Agent Preambles (Worker + QC)');
  console.log('-'.repeat(80) + '\n');

  const rolePreambles = new Map<string, string>();
  const qcRolePreambles = new Map<string, string>();

  // Group tasks by worker role
  const roleMap = new Map<string, TaskDefinition[]>();
  for (const task of taskDefinitions) {
    const existing = roleMap.get(task.agentRoleDescription) || [];
    existing.push(task);
    roleMap.set(task.agentRoleDescription, existing);
  }

  // Generate worker preambles (from database - returns content)
  console.log('📝 Generating Worker Preambles...\n');
  for (const [role, roleTasks] of roleMap.entries()) {
    console.log(`   Worker (${roleTasks.length} tasks): ${role.substring(0, 60)}...`);
    const preambleContent = await generatePreamble(role, outputDir, roleTasks[0], false);
    rolePreambles.set(role, preambleContent);
  }

  // Group tasks by QC role
  const qcRoleMap = new Map<string, TaskDefinition[]>();
  for (const task of taskDefinitions) {
    if (task.qcRole) {
      const qcExisting = qcRoleMap.get(task.qcRole) || [];
      qcExisting.push(task);
      qcRoleMap.set(task.qcRole, qcExisting);
    }
  }

  // Generate QC preambles (from database - returns content)
  console.log('\n📝 Generating QC Preambles...\n');
  for (const [qcRole, qcTasks] of qcRoleMap.entries()) {
    console.log(`   QC (${qcTasks.length} tasks): ${qcRole.substring(0, 60)}...`);
    const qcPreambleContent = await generatePreamble(qcRole, outputDir, qcTasks[0], true);
    qcRolePreambles.set(qcRole, qcPreambleContent);
  }

  console.log(`\n✅ Generated ${rolePreambles.size} worker preambles`);
  console.log(`✅ Generated ${qcRolePreambles.size} QC preambles\n`);

  // Execute tasks sequentially (parallel execution can be added later)
  console.log('-'.repeat(80));
  console.log('STEP 2: Execute Tasks (Serial Execution)');
  console.log('-'.repeat(80) + '\n');

  const results: ExecutionResult[] = [];
  
  for (let i = 0; i < taskDefinitions.length; i++) {
    const task = taskDefinitions[i];
    const preambleContent = rolePreambles.get(task.agentRoleDescription);
    const qcPreambleContent = task.qcRole ? qcRolePreambles.get(task.qcRole) : undefined;
    
    // Check for cancellation before starting next task
    const state = executionStates.get(executionId);
    if (state?.cancelled) {
      console.log(`\n⛔ Execution ${executionId} was cancelled - stopping`);
      break;
    }
    
    if (!preambleContent) {
      console.error(`❌ No preamble content found for role: ${task.agentRoleDescription}`);
      continue;
    }

    console.log(`\n📦 Task ${i + 1}/${taskDefinitions.length}: Executing ${task.id}`);
    
    // Update state and emit task-start event
    if (state) {
      state.currentTaskId = task.id;
      state.taskStatuses[task.id] = 'executing';
    }
    sendSSEEvent(executionId, 'task-start', {
      taskId: task.id,
      taskTitle: task.title,
      progress: i + 1,
      total: taskDefinitions.length,
    });
    
    try {
      const result = await executeTask(task, preambleContent, qcPreambleContent);
      results.push(result);
      
      // Update state based on result
      if (state) {
        state.taskStatuses[task.id] = result.status === 'success' ? 'completed' : 'failed';
        state.results.push(result);
      }
      
      // Emit task completion event
      sendSSEEvent(executionId, result.status === 'success' ? 'task-complete' : 'task-fail', {
        taskId: task.id,
        taskTitle: task.title,
        status: result.status,
        duration: result.duration,
        progress: i + 1,
        total: taskDefinitions.length,
      });
      
      if (result.status === 'failure') {
        console.error(`\n⛔ Task ${task.id} failed, stopping execution`);
        break;
      }
    } catch (error: any) {
      console.error(`\n❌ Task ${task.id} execution error: ${error.message}`);
      
      // Update state to failed
      if (state) {
        state.taskStatuses[task.id] = 'failed';
      }
      
      // Emit task failure event
      sendSSEEvent(executionId, 'task-fail', {
        taskId: task.id,
        taskTitle: task.title,
        error: error.message,
        progress: i + 1,
        total: taskDefinitions.length,
      });
      
      break;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 EXECUTION SUMMARY');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failure').length;
  const totalDuration = results.reduce((acc, r) => acc + r.duration, 0);
  
  console.log(`\n✅ Successful: ${successful}/${taskDefinitions.length}`);
  console.log(`❌ Failed: ${failed}/${taskDefinitions.length}`);
  console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s\n`);
  
  results.forEach((result, i) => {
    const icon = result.status === 'success' ? '✅' : '❌';
    console.log(`${icon} ${i + 1}. ${result.taskId} (${(result.duration / 1000).toFixed(2)}s)`);
  });
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Update final execution state
  const finalState = executionStates.get(executionId);
  const wasCancelled = finalState?.cancelled || false;
  
  // Determine completion status
  const completionStatus = wasCancelled ? 'cancelled' : (failed > 0 ? 'failed' : 'completed');
  
  if (finalState) {
    // Keep 'cancelled' status if it was set, otherwise determine from results
    if (!wasCancelled) {
      finalState.status = failed > 0 ? 'failed' : 'completed';
    }
    finalState.endTime = Date.now();
    finalState.currentTaskId = null;
    
    // Generate error report if there were failures or errors
    if (failed > 0 || finalState.error) {
      try {
        const errorReport = {
          executionId,
          timestamp: new Date().toISOString(),
          summary: {
            total: taskDefinitions.length,
            successful,
            failed,
            cancelled: wasCancelled,
          },
          failedTasks: results
            .filter(r => r.status === 'failure')
            .map(r => ({
              taskId: r.taskId,
              taskTitle: taskDefinitions.find(t => t.id === r.taskId)?.title || r.taskId,
              duration: r.duration,
              error: r.error || 'Unknown error',
              attemptNumber: r.attemptNumber || 1,
            })),
          executionError: finalState.error,
        };
        
        const errorReportPath = path.join(outputDir, 'ERROR_REPORT.json');
        await fs.writeFile(errorReportPath, JSON.stringify(errorReport, null, 2), 'utf-8');
        console.log(`📋 Generated error report: ${errorReportPath}`);
        
        // Also generate a human-readable markdown version
        const mdReport = `# Execution Error Report

**Execution ID:** ${executionId}  
**Timestamp:** ${errorReport.timestamp}  
**Status:** ${wasCancelled ? 'Cancelled' : 'Failed'}

## Summary

- **Total Tasks:** ${errorReport.summary.total}
- **Successful:** ${errorReport.summary.successful}
- **Failed:** ${errorReport.summary.failed}
- **Cancelled:** ${errorReport.summary.cancelled ? 'Yes' : 'No'}

## Failed Tasks

${errorReport.failedTasks.map((task, i) => `
### ${i + 1}. ${task.taskTitle} (${task.taskId})

- **Duration:** ${(task.duration / 1000).toFixed(2)}s
- **Attempt:** ${task.attemptNumber}
- **Error:** ${task.error}
`).join('\n')}

${finalState.error ? `## Execution Error\n\n${finalState.error}\n` : ''}
`;
        
        const mdReportPath = path.join(outputDir, 'ERROR_REPORT.md');
        await fs.writeFile(mdReportPath, mdReport, 'utf-8');
        console.log(`📋 Generated markdown error report: ${mdReportPath}`);
      } catch (reportError) {
        console.error('Failed to generate error report:', reportError);
      }
    }
    
    // Generate execution summary (always, even for successful runs)
    try {
      const summaryReport = {
        executionId,
        timestamp: new Date().toISOString(),
        status: completionStatus,
        duration: finalState.endTime - finalState.startTime,
        summary: {
          total: taskDefinitions.length,
          successful,
          failed,
          cancelled: wasCancelled,
        },
        tasks: results.map(r => ({
          taskId: r.taskId,
          taskTitle: taskDefinitions.find(t => t.id === r.taskId)?.title || r.taskId,
          status: r.status,
          duration: r.duration,
          attemptNumber: r.attemptNumber || 1,
        })),
      };
      
      const summaryPath = path.join(outputDir, 'EXECUTION_SUMMARY.json');
      await fs.writeFile(summaryPath, JSON.stringify(summaryReport, null, 2), 'utf-8');
      console.log(`📊 Generated execution summary: ${summaryPath}`);
    } catch (summaryError) {
      console.error('Failed to generate execution summary:', summaryError);
    }
    
    // Collect deliverables (preambles, reports, etc.) - read files into memory
    try {
      const files = await fs.readdir(outputDir);
      const deliverables: Deliverable[] = [];
      
      for (const file of files) {
        const filePath = path.join(outputDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          const content = await fs.readFile(filePath, 'utf-8');
          deliverables.push({
            filename: file,
            content,
            mimeType: file.endsWith('.md') ? 'text/markdown' : 
                      file.endsWith('.json') ? 'application/json' : 'text/plain',
            size: content.length,
          });
        }
      }
      
      finalState.deliverables = deliverables;
      
      // Clean up the output directory after reading files into memory
      await fs.rm(outputDir, { recursive: true, force: true });
      console.log(`🗑️  Cleaned up temporary directory: ${outputDir}`);
    } catch (error) {
      console.error('Failed to collect deliverables:', error);
      finalState.deliverables = [];
    }
  }
  
  // Emit appropriate completion event
  const completionEvent = wasCancelled ? 'execution-cancelled' : 'execution-complete';
  
  sendSSEEvent(executionId, completionEvent, {
    executionId,
    status: completionStatus,
    successful,
    failed,
    cancelled: wasCancelled,
    completed: results.length,
    total: taskDefinitions.length,
    totalDuration,
    deliverables: finalState?.deliverables.map(d => ({
      filename: d.filename,
      size: d.size,
      mimeType: d.mimeType,
    })) || [],
    results: results.map(r => ({
      taskId: r.taskId,
      status: r.status,
      duration: r.duration,
    })),
  });
  
  // Clean up SSE clients after a delay (allow final event to be received)
  setTimeout(() => {
    sseClients.delete(executionId);
  }, 5000);
  
  return results;
}

export function createOrchestrationRouter(graphManager: IGraphManager): Router {
  const router = Router();

  /**
   * GET /api/agents
   * List agent preambles with semantic search and pagination
   */
  router.get('/agents', async (req: any, res: any) => {
    try {
      const { search, limit = 20, offset = 0, type = 'all' } = req.query;
      
      let agents: any[];
      
      if (search && typeof search === 'string') {
        // Text-based search (case-insensitive)
        const driver = graphManager.getDriver();
        const session = driver.session();
        
        try {
          const searchLower = search.toLowerCase();
          const limitInt = neo4j.int(Number(limit));
          const offsetInt = neo4j.int(Number(offset));
          
          const result = await session.run(`
            MATCH (n:Node)
            WHERE n.type = 'preamble' 
              AND ($type = 'all' OR n.agentType = $type)
              AND (
                toLower(n.name) CONTAINS $search 
                OR toLower(n.role) CONTAINS $search
                OR toLower(n.content) CONTAINS $search
              )
            RETURN n as node
            ORDER BY n.created DESC
            SKIP $offset
            LIMIT $limit
          `, {
            search: searchLower,
            limit: limitInt,
            offset: offsetInt,
            type
          });
          
          agents = result.records.map((record: any) => {
            const props = record.get('node').properties;
            // Handle both old format (Neo4j label) and new format (Node properties)
            const agentType = props.agentType || props.agent_type || 'worker';
            const roleDesc = props.roleDescription || props.role_description || props.role || '';
            const name = props.name || roleDesc.split(' ').slice(0, 4).join(' ') || 'Unnamed Agent';
            
            // Return only AgentTemplate fields for consistency with default agents
            return {
              id: props.id,
              name,
              role: roleDesc,
              agentType,
              content: props.content || '',
              version: props.version || '1.0',
              created: props.created || props.created_at,
            };
          });
        } finally {
          await session.close();
        }
      } else {
        // Standard query without search - use direct Neo4j query to get full content
        const driver = graphManager.getDriver();
        const session = driver.session();
        
        try {
          const limitInt = neo4j.int(Number(limit));
          const offsetInt = neo4j.int(Number(offset));
          
          const result = await session.run(`
            MATCH (n:Node)
            WHERE n.type = 'preamble' 
              AND ($type = 'all' OR n.agentType = $type)
            RETURN n as node
            ORDER BY n.created DESC
            SKIP $offset
            LIMIT $limit
          `, {
            limit: limitInt,
            offset: offsetInt,
            type
          });
          
          agents = result.records.map((record: any) => {
            const props = record.get('node').properties;
            const agentType = props.agentType || props.agent_type || 'worker';
            const roleDesc = props.roleDescription || props.role_description || props.role || '';
            const name = props.name || roleDesc.split(' ').slice(0, 4).join(' ') || 'Unnamed Agent';
            
            // Return only AgentTemplate fields for consistency with default agents
            return {
              id: props.id,
              name,
              role: roleDesc,
              agentType,
              content: props.content || '',
              version: props.version || '1.0',
              created: props.created || props.created_at,
            };
          });
        } finally {
          await session.close();
        }
      }

      res.json({
        agents,
        hasMore: agents.length === parseInt(limit as string),
        total: agents.length
      });
    } catch (error) {
      console.error('Error fetching agents:', error);
      res.status(500).json({
        error: 'Failed to fetch agents',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/agents/:id
   * Get specific agent preamble
   */
  router.get('/agents/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      // Use direct Neo4j query to get full content (GraphManager strips large content)
      const driver = graphManager.getDriver();
      const session = driver.session();
      
      try {
        const result = await session.run(`
          MATCH (n:Node {id: $id})
          WHERE n.type = 'preamble'
          RETURN n as node
        `, { id });
        
        if (result.records.length === 0) {
          return res.status(404).json({ error: 'Agent not found' });
        }
        
        const props = result.records[0].get('node').properties;
        
        // Return only AgentTemplate fields for consistency with default agents
        res.json({
          id: props.id,
          name: props.name || 'Unnamed Agent',
          role: props.roleDescription || props.role || '',
          agentType: props.agentType || 'worker',
          content: props.content || '',
          version: props.version || '1.0',
          created: props.created || props.created_at,
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error('Error fetching agent:', error);
      res.status(500).json({
        error: 'Failed to fetch agent',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/agents
   * Create new agent preamble using Agentinator
   */
  router.post('/agents', async (req: any, res: any) => {
    try {
      const { roleDescription, agentType = 'worker', useAgentinator = true } = req.body;
      
      if (!roleDescription || typeof roleDescription !== 'string') {
        return res.status(400).json({ error: 'Role description is required' });
      }

      let preambleContent = '';
      let agentName = '';
      let role = roleDescription;

      // Extract name from role description
      agentName = roleDescription.split(' ').slice(0, 4).join(' ');

      if (useAgentinator) {
        console.log(`🤖 Generating ${agentType} preamble with Agentinator...`);
        const generated = await generatePreambleWithAgentinator(roleDescription, agentType);
        agentName = generated.name;
        role = generated.role;
        preambleContent = generated.content;
        console.log(`✅ Generated preamble: ${agentName} (${preambleContent.length} chars)`);
      } else {
        // Create minimal preamble
        preambleContent = `# ${agentName} Agent\n\n` +
          `**Role:** ${roleDescription}\n\n` +
          `Execute tasks according to the role description above.\n`;
      }

      // Generate role hash for caching (MD5 of role description)
      const crypto = await import('crypto');
      const roleHash = crypto.createHash('md5').update(roleDescription).digest('hex').substring(0, 8);

      // Store in Neo4j with full metadata
      const preambleNode = await graphManager.addNode('preamble', {
        name: agentName,
        role,
        agentType,
        content: preambleContent,
        version: '1.0',
        created: new Date().toISOString(),
        generatedBy: useAgentinator ? 'agentinator' : 'manual',
        roleDescription,
        roleHash,
        charCount: preambleContent.length,
        usedCount: 1,
        lastUsed: new Date().toISOString()
      });

      res.json({
        success: true,
        agent: {
          id: preambleNode.id,
          name: agentName,
          role,
          agentType,
          content: preambleContent,
          version: '1.0',
          created: preambleNode.created
        }
      });
    } catch (error) {
      console.error('Error creating agent:', error);
      res.status(500).json({
        error: 'Failed to create agent',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * DELETE /api/agents/:id
   * Delete an agent preamble
   */
  router.delete('/agents/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      
      // Don't allow deleting default agents
      if (id.startsWith('default-')) {
        return res.status(403).json({ error: 'Cannot delete default agents' });
      }
      
      const agent = await graphManager.getNode(id);
      
      if (!agent || agent.type !== 'preamble') {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      await graphManager.deleteNode(id);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting agent:', error);
      res.status(500).json({
        error: 'Failed to delete agent',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/generate-plan
   * Generate a task plan using the PM agent from a project prompt
   */
  router.post('/generate-plan', async (req: any, res: any) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      // Load PM agent preamble (JSON version)
      const pmPreamblePath = path.join(__dirname, '../../docs/agents/v2/01-pm-preamble-json.md');
      const pmPreamble = await fs.readFile(pmPreamblePath, 'utf-8');

      // Create PM agent client
      const pmAgent = new CopilotAgentClient({
        preamblePath: pmPreamblePath,
        model: CopilotModel.GPT_4_TURBO,
        temperature: 0.2, // Lower temperature for structured output
        agentType: 'pm',
      });

      // Load preamble
      await pmAgent.loadPreamble(pmPreamblePath);

      // Build user request with repository context
      const userRequest = `${prompt}

**REPOSITORY CONTEXT:**

Project: Mimir - Graph-RAG TODO tracking with multi-agent orchestration
Location: ${process.cwd()}

**AVAILABLE TOOLS:**
- read_file(path) - Read file contents
- edit_file(path, content) - Create or modify files
- run_terminal_cmd(command) - Execute shell commands
- grep(pattern, path, options) - Search file contents
- list_dir(path) - List directory contents
- memory_node, memory_edge - Graph database operations

**IMPORTANT:** Output ONLY valid JSON matching the ProjectPlan interface. No markdown, no explanations.`;

      console.log('🤖 Invoking PM Agent to generate task plan...');
      
      // Execute PM agent
      const result = await pmAgent.execute(userRequest);
      const response = result.output;

      // Parse JSON response
      let plan: any;
      try {
        // Extract JSON from response (in case there's any text before/after)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in PM agent response');
        }
        
        plan = JSON.parse(jsonMatch[0]);
        
        // Validate required fields
        if (!plan.overview || !plan.tasks || !Array.isArray(plan.tasks)) {
          throw new Error('Invalid plan structure: missing required fields');
        }
        
        console.log(`✅ PM Agent generated ${plan.tasks.length} tasks`);
      } catch (parseError) {
        console.error('Failed to parse PM agent response:', parseError);
        console.error('Raw response:', response.substring(0, 500));
        
        // Return error with partial response for debugging
        return res.status(500).json({
          error: 'Failed to parse PM agent response',
          details: parseError instanceof Error ? parseError.message : 'Invalid JSON',
          rawResponse: response.substring(0, 1000),
        });
      }

      // Store the generated plan in Mimir for future reference
      await graphManager.addNode('memory', {
        type: 'orchestration_plan',
        title: `Plan: ${plan.overview.goal}`,
        content: JSON.stringify(plan, null, 2),
        prompt: prompt,
        category: 'orchestration',
        timestamp: new Date().toISOString(),
        taskCount: plan.tasks.length,
      });

      res.json(plan);
    } catch (error) {
      console.error('Error generating plan:', error);
      res.status(500).json({ 
        error: 'Failed to generate plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/save-plan
   * Save a task plan to the Mimir knowledge graph
   */
  router.post('/save-plan', async (req: any, res: any) => {
    try {
      const { plan } = req.body;
      
      if (!plan) {
        return res.status(400).json({ error: 'Plan is required' });
      }

      // Validate plan structure
      if (!Array.isArray(plan.tasks)) {
        return res.status(400).json({ error: 'Plan must contain a tasks array' });
      }
      
      const tasks = plan.tasks as any[]; // Type-safe after validation

      // Create a project node
      const projectNode = await graphManager.addNode('project', {
        title: plan.overview.goal,
        complexity: plan.overview.complexity,
        totalTasks: plan.overview.totalTasks,
        estimatedDuration: plan.overview.estimatedDuration,
        estimatedToolCalls: plan.overview.estimatedToolCalls,
        reasoning: JSON.stringify(plan.reasoning),
        created: new Date().toISOString(),
      });

      // Create task nodes and link to project
      const taskNodeIds: string[] = [];
      for (const task of tasks) {
        const taskNode = await graphManager.addNode('todo', {
          title: task.title,
          description: task.prompt,
          agentRole: task.agentRoleDescription,
          model: task.recommendedModel,
          status: 'pending',
          priority: 'medium',
          parallelGroup: task.parallelGroup,
          estimatedDuration: task.estimatedDuration,
          estimatedToolCalls: task.estimatedToolCalls,
          dependencies: JSON.stringify(task.dependencies),
          successCriteria: JSON.stringify(task.successCriteria),
          verificationCriteria: JSON.stringify(task.verificationCriteria),
          maxRetries: task.maxRetries,
        });

        taskNodeIds.push(taskNode.id);

        // Link task to project
        await graphManager.addEdge(taskNode.id, projectNode.id, 'belongs_to', {});
      }

      // Create dependency edges between tasks
      if (Array.isArray(tasks)) {
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          const taskNodeId = taskNodeIds[i];

          if (Array.isArray(task.dependencies)) {
            for (const depTaskId of task.dependencies) {
              const depIndex = tasks.findIndex((t: any) => t.id === depTaskId);
              if (depIndex !== -1) {
                await graphManager.addEdge(taskNodeId, taskNodeIds[depIndex], 'depends_on', {});
              }
            }
          }
        }
      }

      res.json({ 
        success: true,
        projectId: projectNode.id,
        taskIds: taskNodeIds,
      });
    } catch (error) {
      console.error('Error saving plan:', error);
      res.status(500).json({ 
        error: 'Failed to save plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/plans
   * Retrieve all saved orchestration plans
   */
  router.get('/plans', async (req: any, res: any) => {
    try {
      const projects = await graphManager.queryNodes('project');

      const plans = await Promise.all(
        projects.map(async (project) => {
          // Get all tasks linked to this project
          const neighbors = await graphManager.getNeighbors(project.id, 'belongs_to');

          return {
            id: project.id,
            overview: {
              goal: project.properties?.title || 'Untitled',
              complexity: project.properties?.complexity || 'Medium',
              totalTasks: project.properties?.totalTasks || 0,
              estimatedDuration: project.properties?.estimatedDuration || 'TBD',
              estimatedToolCalls: project.properties?.estimatedToolCalls || 0,
            },
            taskCount: neighbors.length,
            created: project.created,
          };
        })
      );

      res.json({ plans });
    } catch (error) {
      console.error('Error retrieving plans:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve plans',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/execution-stream/:executionId
   * Server-Sent Events endpoint for real-time execution progress
   */
  router.get('/execution-stream/:executionId', (req: any, res: any) => {
    const { executionId } = req.params;
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    // Add this client to the list
    if (!sseClients.has(executionId)) {
      sseClients.set(executionId, []);
    }
    sseClients.get(executionId)!.push(res);
    
    console.log(`📡 SSE client connected for execution ${executionId}`);
    
    // Send initial state if execution exists
    const state = executionStates.get(executionId);
    if (state) {
      res.write(`event: init\ndata: ${JSON.stringify({
        status: state.status,
        taskStatuses: state.taskStatuses,
        currentTaskId: state.currentTaskId
      })}\n\n`);
    } else {
      res.write(`event: init\ndata: ${JSON.stringify({ status: 'pending' })}\n\n`);
    }
    
    // Handle client disconnect
    req.on('close', () => {
      const clients = sseClients.get(executionId) || [];
      const index = clients.indexOf(res);
      if (index !== -1) {
        clients.splice(index, 1);
      }
      if (clients.length === 0) {
        sseClients.delete(executionId);
      }
      console.log(`📡 SSE client disconnected from execution ${executionId}`);
    });
  });

  /**
   * POST /api/cancel-execution/:executionId
   * Cancel a running workflow execution
   */
  router.post('/cancel-execution/:executionId', (req: any, res: any) => {
    const { executionId } = req.params;
    
    const state = executionStates.get(executionId);
    if (!state) {
      return res.status(404).json({ 
        error: 'Execution not found',
        executionId 
      });
    }
    
    if (state.status !== 'running') {
      return res.status(400).json({ 
        error: `Cannot cancel execution with status: ${state.status}`,
        executionId,
        status: state.status
      });
    }
    
    // Set cancellation flag
    state.cancelled = true;
    state.status = 'cancelled';
    
    console.log(`⛔ Cancellation requested for execution ${executionId}`);
    
    // Emit cancellation event to SSE clients
    sendSSEEvent(executionId, 'execution-cancelled', {
      executionId,
      cancelledAt: Date.now(),
      message: 'Execution cancelled by user',
    });
    
    res.json({
      success: true,
      executionId,
      message: 'Execution cancellation requested',
    });
  });

  /**
   * GET /api/execution-deliverable/:executionId/:filename
   * Download a specific deliverable file from memory
   */
  router.get('/execution-deliverable/:executionId/:filename', (req: any, res: any) => {
    const { executionId, filename } = req.params;
    
    const state = executionStates.get(executionId);
    if (!state) {
      return res.status(404).json({ 
        error: 'Execution not found',
        executionId 
      });
    }
    
    const deliverable = state.deliverables.find(d => d.filename === filename);
    if (!deliverable) {
      return res.status(404).json({ 
        error: 'Deliverable not found',
        executionId,
        filename,
        availableFiles: state.deliverables.map(d => d.filename)
      });
    }
    
    console.log(`📥 Serving deliverable: ${filename} (${deliverable.size} bytes)`);
    
    // Set headers for file download
    res.setHeader('Content-Type', deliverable.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${deliverable.filename}"`);
    res.setHeader('Content-Length', deliverable.size);
    
    res.send(deliverable.content);
  });

  /**
   * GET /api/execution-deliverables/:executionId
   * List all deliverables for an execution
   */
  router.get('/execution-deliverables/:executionId', (req: any, res: any) => {
    const { executionId } = req.params;
    
    const state = executionStates.get(executionId);
    if (!state) {
      return res.status(404).json({ 
        error: 'Execution not found',
        executionId 
      });
    }
    
    res.json({
      executionId,
      status: state.status,
      deliverables: state.deliverables.map(d => ({
        filename: d.filename,
        size: d.size,
        mimeType: d.mimeType,
        downloadUrl: `/api/execution-deliverable/${executionId}/${encodeURIComponent(d.filename)}`,
      })),
    });
  });

  // POST /api/execute-workflow - Execute workflow from Task Canvas JSON
  router.post('/execute-workflow', async (req: any, res: any) => {
    try {
      const { tasks, parallelGroups, agentTemplates, overview } = req.body;

      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: 'Invalid workflow: tasks array is required' });
      }

      console.log(`📥 Received workflow execution request with ${tasks.length} tasks`);

      // Generate execution ID
      const executionId = `exec-${Date.now()}`;
      const outputDir = path.join(process.cwd(), 'generated-agents', executionId);
      await fs.mkdir(outputDir, { recursive: true });

      // Start execution asynchronously (don't wait for completion)
      executeWorkflowFromJSON(tasks, agentTemplates, outputDir, executionId).catch(error => {
        console.error(`❌ Workflow execution ${executionId} failed:`, error);
      });

      res.json({
        success: true,
        executionId,
        message: `Workflow execution started with ${tasks.length} tasks`,
      });
    } catch (error) {
      console.error('Error starting workflow execution:', error);
      res.status(500).json({
        error: 'Failed to start workflow execution',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
