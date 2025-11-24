/**
 * @module api/orchestration-api
 * @description Multi-agent orchestration API with workflow execution
 * 
 * Provides HTTP endpoints for managing multi-agent workflows with
 * PM → Worker → QC agent chains. Supports workflow execution, monitoring,
 * and real-time progress updates via Server-Sent Events (SSE).
 * 
 * **Features:**
 * - Workflow execution from JSON definitions
 * - Real-time progress updates via SSE
 * - Agent preamble generation (Agentinator)
 * - Execution state persistence
 * - Multi-agent coordination
 * 
 * **Endpoints:**
 * - `POST /api/orchestration/execute` - Execute a workflow
 * - `GET /api/orchestration/status/:executionId` - Get execution status
 * - `GET /api/orchestration/sse/:executionId` - SSE stream for updates
 * - `POST /api/orchestration/generate-preamble` - Generate agent preambles
 * 
 * @example
 * ```typescript
 * // Execute a workflow
 * fetch('/api/orchestration/execute', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     workflow: {
 *       name: 'Feature Implementation',
 *       agents: [/* agent configs //]
 *     }
 *   })
 * });
 * ```
 */

import { Router, Request, Response } from 'express';
import type { IGraphManager } from '../types/index.js';
import { CopilotAgentClient } from '../orchestrator/llm-client.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import neo4j from 'neo4j-driver';

// Import modular orchestration components
import { 
  sendSSEEvent, 
  registerSSEClient, 
  unregisterSSEClient,
} from './orchestration/sse.js';
import { generatePreambleWithAgentinator } from './orchestration/agentinator.js';
import { 
  executeWorkflowFromJSON, 
  executionStates,
  type ExecutionState,
  type Deliverable 
} from './orchestration/workflow-executor.js';
import { handleVectorSearchNodes } from '../tools/vectorSearch.tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create Express router for orchestration API endpoints
 * 
 * Provides HTTP endpoints for multi-agent orchestration, workflow execution,
 * and agent management. Includes endpoints for:
 * - Agent listing and search
 * - Workflow execution (PM → Workers → QC)
 * - Task management
 * - Agent preamble retrieval
 * - Vector search integration
 * 
 * @param graphManager - Graph manager instance for Neo4j operations
 * @returns Configured Express router with all orchestration endpoints
 * 
 * @example
 * ```ts
 * import express from 'express';
 * import { GraphManager } from './managers/GraphManager.js';
 * import { createOrchestrationRouter } from './api/orchestration-api.js';
 * 
 * const app = express();
 * const graphManager = new GraphManager(driver);
 * 
 * // Mount orchestration routes
 * app.use('/api', createOrchestrationRouter(graphManager));
 * 
 * // Available endpoints:
 * // GET  /api/agents - List agents with search
 * // POST /api/execute-workflow - Execute multi-agent workflow
 * // GET  /api/tasks/:id - Get task status
 * // POST /api/vector-search - Semantic search
 * ```
 */
export function createOrchestrationRouter(graphManager: IGraphManager): Router {
  const router = Router();

  /**
   * GET /api/agents - List agent preambles with search and pagination
   * 
   * Retrieves agent preambles from the knowledge graph with optional text search.
   * Supports filtering by agent type (pm, worker, qc) and pagination.
   * 
   * Query Parameters:
   * - search: Text search across name, role, and content
   * - limit: Maximum results to return (default: 20)
   * - offset: Number of results to skip (default: 0)
   * - type: Filter by agent type ('pm', 'worker', 'qc', 'all')
   * 
   * @returns JSON with agents array, hasMore flag, and total count
   * 
   * @example
   * // List all agents
   * fetch('/api/agents')
   *   .then(res => res.json())
   *   .then(data => {
   *     console.log('Found', data.agents.length, 'agents');
   *     data.agents.forEach(agent => {
   *       console.log('-', agent.name, '(' + agent.agentType + ')');
   *     });
   *   });
   * 
   * @example
   * // Search for authentication-related agents
   * fetch('/api/agents?search=authentication&type=worker')
   *   .then(res => res.json())
   *   .then(data => {
   *     console.log('Auth workers:', data.agents);
   *   });
   * 
   * @example
   * // Paginate through agents
   * async function loadAllAgents() {
   *   let offset = 0;
   *   const limit = 20;
   *   const allAgents = [];
   *   
   *   while (true) {
   *     const res = await fetch('/api/agents?limit=' + limit + '&offset=' + offset);
   *     const data = await res.json();
   *     allAgents.push(...data.agents);
   *     
   *     if (!data.hasMore) break;
   *     offset += limit;
   *   }
   *   
   *   return allAgents;
   * }
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
   * POST /api/agents - Create new agent preamble using Agentinator
   * 
   * Generates a specialized agent preamble from a role description.
   * Uses the Agentinator LLM to create contextual, task-specific instructions.
   * 
   * Request Body:
   * - roleDescription: Description of agent's role and responsibilities (required)
   * - agentType: Type of agent ('worker', 'pm', 'qc') (default: 'worker')
   * - useAgentinator: Whether to use LLM generation (default: true)
   * 
   * @returns JSON with created agent including id, name, role, content
   * 
   * @example
   * // Create a worker agent for authentication
   * fetch('/api/agents', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({
   *     roleDescription: 'Implement JWT-based authentication with refresh tokens',
   *     agentType: 'worker',
   *     useAgentinator: true
   *   })
   * })
   * .then(res => res.json())
   * .then(agent => {
   *   console.log('Created agent:', agent.id);
   *   console.log('Preamble length:', agent.content.length, 'chars');
   * });
   * 
   * @example
   * // Create a QC agent for validation
   * const qcAgent = await fetch('/api/agents', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({
   *     roleDescription: 'Validate API responses match OpenAPI spec',
   *     agentType: 'qc'
   *   })
   * }).then(r => r.json());
   * 
   * console.log('QC Agent:', qcAgent.name);
   * 
   * @example
   * // Create minimal agent without Agentinator
   * const simpleAgent = await fetch('/api/agents', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({
   *     roleDescription: 'Simple task executor',
   *     useAgentinator: false
   *   })
   * }).then(r => r.json());
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
      console.log(`🗑️  DELETE request for agent: ${id}`);
      
      // Don't allow deleting default agents
      if (id.startsWith('default-')) {
        console.warn(`⚠️  Attempted to delete default agent: ${id}`);
        return res.status(403).json({ error: 'Cannot delete default agents' });
      }
      
      // Check if agent exists first
      let agent: any;
      try {
        agent = await graphManager.getNode(id);
      } catch (getError: any) {
        console.error(`❌ Error getting agent ${id}:`, getError);
        return res.status(500).json({
          error: 'Database error while checking agent',
          details: getError.message || 'Failed to query database'
        });
      }
      
      if (!agent) {
        console.warn(`⚠️  Agent not found: ${id}`);
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      if (agent.type !== 'preamble') {
        console.warn(`⚠️  Node ${id} is not a preamble (type: ${agent.type})`);
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      // Delete the agent
      try {
        const deleted = await graphManager.deleteNode(id);
        if (!deleted) {
          console.warn(`⚠️  Agent ${id} was not deleted (returned false)`);
          return res.status(404).json({ error: 'Agent not found or already deleted' });
        }
        console.log(`✅ Successfully deleted agent: ${id}`);
        res.json({ success: true });
      } catch (deleteError: any) {
        console.error(`❌ Error deleting agent ${id}:`, deleteError);
        return res.status(500).json({
          error: 'Database error while deleting agent',
          details: deleteError.message || 'Failed to delete from database'
        });
      }
    } catch (error: any) {
      console.error('❌ Unexpected error deleting agent:', error);
      res.status(500).json({
        error: 'Failed to delete agent',
        details: error.message || 'Unknown error'
      });
    }
  });

  /**
   * POST /api/generate-plan - Generate orchestration plan from project prompt
   * 
   * Uses PM agent to analyze project requirements and generate a structured
   * task breakdown with agent assignments, dependencies, and deliverables.
   * 
   * Request Body:
   * - prompt: Project description and requirements (required)
   * 
   * @returns JSON with generated plan including tasks, agents, and workflow
   * 
   * @example
   * // Generate plan for authentication system
   * fetch('/api/generate-plan', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({
   *     prompt: 'Build a JWT authentication system with user registration, ' +
   *             'login, token refresh, and password reset functionality'
   *   })
   * })
   * .then(res => res.json())
   * .then(plan => {
   *   console.log('Project:', plan.name);
   *   console.log('Tasks:', plan.tasks.length);
   *   plan.tasks.forEach(task => {
   *     console.log('-', task.title, '(' + task.agentType + ')');
   *   });
   * });
   * 
   * @example
   * // Generate plan with specific requirements
   * const plan = await fetch('/api/generate-plan', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({
   *     prompt: `Create a REST API with:
   *       - User CRUD operations
   *       - PostgreSQL database
   *       - OpenAPI documentation
   *       - Unit and integration tests
   *       - Docker deployment`
   *   })
   * }).then(r => r.json());
   * 
   * console.log('Generated', plan.tasks.length, 'tasks');
   * console.log('Estimated duration:', plan.estimatedHours, 'hours');
   */
  router.post('/generate-plan', async (req: any, res: any) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      console.log(`🔍 Performing semantic search on prompt: "${prompt.substring(0, 100)}..."`);
      
      // Perform vector search to get relevant context from Mimir
      let relevantContext = '';
      let contextCount = 0;
      
      try {
        const searchResults = await handleVectorSearchNodes(
          {
            query: prompt,
            types: ['memory', 'orchestration_plan', 'orchestration_execution', 'file', 'concept'], // PM-relevant types
            limit: 8,
            min_similarity: 0.55
          },
          graphManager.getDriver()
        );
        
        if (searchResults && searchResults.length > 0) {
          contextCount = searchResults.length;
          console.log(`✅ Found ${contextCount} relevant context items from knowledge base`);
          
          relevantContext = searchResults.map((result: any, idx: number) => {
            const type = result.type || 'unknown';
            const title = result.title || result.id || 'Untitled';
            const content = result.content || result.summary || '';
            const truncated = content.substring(0, 1000);
            
            return `${idx + 1}. [${type.toUpperCase()}] ${title}\n   ${truncated}${content.length > 1000 ? '...' : ''}`;
          }).join('\n\n');
        } else {
          console.log('ℹ️  No relevant context found in knowledge base');
        }
      } catch (searchError) {
        console.warn('⚠️  Vector search failed:', searchError);
        // Continue without context - don't fail the entire request
      }

      // Load PM agent preamble (JSON version)
      const pmPreamblePath = path.join(__dirname, '../../docs/agents/v2/01-pm-preamble-json.md');
      const pmPreamble = await fs.readFile(pmPreamblePath, 'utf-8');

      // Create PM agent client
      const pmAgent = new CopilotAgentClient({
        preamblePath: pmPreamblePath,
        model: process.env.MIMIR_PM_MODEL || process.env.MIMIR_DEFAULT_MODEL || 'gpt-4.1',
        temperature: 0.2, // Lower temperature for structured output
        agentType: 'pm',
      });

      // Load preamble
      await pmAgent.loadPreamble(pmPreamblePath);

      // Build user request with semantic context + repository context
      let userRequest = `${prompt}\n\n`;
      
      // Add relevant context from Mimir knowledge base
      if (relevantContext) {
        userRequest += `**RELEVANT CONTEXT FROM MIMIR KNOWLEDGE BASE:**
(${contextCount} items retrieved via semantic search - use this to inform your task planning)

${relevantContext}

---

`;
      }
      
      userRequest += `**REPOSITORY CONTEXT:**

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
      if (contextCount > 0) {
        console.log(`   📚 Enriched with ${contextCount} context items from knowledge base`);
      }
      
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
   * POST /api/save-plan - Save orchestration plan to knowledge graph
   * 
   * Persists a generated task plan as a project node with task relationships.
   * Enables plan reuse, versioning, and historical tracking.
   * 
   * Request Body:
   * - plan: Plan object with name, description, and tasks array
   * 
   * @returns JSON with saved project node ID and task count
   * 
   * @example
   * const plan = await fetch('/api/generate-plan', {}).then(r => r.json());
   * const saved = await fetch('/api/save-plan', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ plan })
   * }).then(r => r.json());
   * console.log('Saved project:', saved.projectId);
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
   * GET /api/plans - List all saved orchestration plans
   * 
   * Retrieves all project nodes from knowledge graph with task counts.
   * 
   * @returns JSON array of saved plans with metadata
   * 
   * @example
   * const plans = await fetch('/api/plans').then(r => r.json());
   * plans.forEach(plan => {
   *   console.log(plan.name, '-', plan.taskCount, 'tasks');
   * });
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
   * GET /api/execution-stream/:executionId - Real-time execution progress via SSE
   * 
   * Server-Sent Events stream providing live updates during workflow execution.
   * Emits events for task starts, completions, errors, and deliverables.
   * 
   * @param executionId - Execution ID from execute-workflow response
   * @returns SSE stream with execution events
   * 
   * @example
   * const eventSource = new EventSource('/api/execution-stream/exec-123');
   * eventSource.onmessage = (e) => {
   *   const event = JSON.parse(e.data);
   *   console.log(event.type, event.message);
   * };
   * eventSource.onerror = () => eventSource.close();
   */
  router.get('/execution-stream/:executionId', (req: any, res: any) => {
    const { executionId } = req.params;
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    // Register this client for SSE updates
    registerSSEClient(executionId, res);
    
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
      unregisterSSEClient(executionId, res);
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
   * GET /api/execution-state/:executionId
   * Get current execution state
   * 
   * Returns the current state of a running or completed execution,
   * including status and task statuses.
   * 
   * @since 1.0.0
   */
  router.get('/execution-state/:executionId', (req: any, res: any) => {
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
      taskStatuses: state.taskStatuses,
      currentTaskId: state.currentTaskId,
      startTime: state.startTime,
      endTime: state.endTime,
      cancelled: state.cancelled || false,
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

  /**
   * GET /api/executions/:executionId
   * Get all task executions and telemetry for an execution run
   */
  router.get('/executions/:executionId', async (req: any, res: any) => {
    try {
      const { executionId } = req.params;
      
      const driver = graphManager.getDriver();
      const session = driver.session();
      
      try {
        // Get execution summary
        const summaryResult = await session.run(`
          MATCH (exec:Node {id: $executionId, type: 'orchestration_execution'})
          RETURN exec
        `, { executionId });
        
        // Get all task executions
        const tasksResult = await session.run(`
          MATCH (te:Node)
          WHERE te.type = 'task_execution' AND te.executionId = $executionId
          RETURN te
          ORDER BY te.timestamp
        `, { executionId });
        
        const summary = summaryResult.records.length > 0
          ? summaryResult.records[0].get('exec').properties
          : null;
        
        const tasks = tasksResult.records.map((record: any) => record.get('te').properties);
        
        // Build taskExecutions array with node IDs
        const taskExecutions = tasks.map((task: any) => ({
          nodeId: task.id, // The unique task execution node ID
          taskId: task.taskId,
          taskTitle: task.taskTitle,
          status: task.status,
          duration: task.duration?.toNumber() || 0,
          tokens: {
            input: task.tokensInput?.toNumber() || 0,
            output: task.tokensOutput?.toNumber() || 0,
            total: task.tokensTotal?.toNumber() || 0,
          },
          toolCalls: task.toolCalls?.toNumber() || 0,
          qcPassed: task.qcPassed || false,
          qcScore: task.qcScore?.toNumber() || 0,
          timestamp: task.timestamp,
        }));
        
        res.json({
          executionId,
          summary,
          tasks,
          taskExecutions, // New field with node IDs
          totalTasks: tasks.length,
          totalTokens: summary ? {
            input: summary.tokensInput?.toNumber() || 0,
            output: summary.tokensOutput?.toNumber() || 0,
            total: summary.tokensTotal?.toNumber() || 0,
          } : null,
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error('Error fetching execution:', error);
      res.status(500).json({
        error: 'Failed to fetch execution',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/deliverables/:executionId/download
   * Download all deliverables as a zip archive
   * 
   * Returns a zip file containing all deliverable files from an execution.
   * 
   * @since 1.0.0
   */
  router.get('/deliverables/:executionId/download', async (req: any, res: any) => {
    try {
      const { executionId } = req.params;
      const state = executionStates.get(executionId);

      if (!state) {
        return res.status(404).json({
          error: 'Execution not found',
          executionId,
        });
      }

      if (state.deliverables.length === 0) {
        return res.status(404).json({
          error: 'No deliverables found for this execution',
          executionId,
        });
      }

      // Dynamically import archiver
      const archiver = (await import('archiver')).default;
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      });

      // Set response headers for zip download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="execution-${executionId}-deliverables.zip"`);

      // Pipe archive to response
      archive.pipe(res);

      // Add all deliverable files to the archive
      for (const deliverable of state.deliverables) {
        if (deliverable.content) {
          archive.append(deliverable.content, { name: deliverable.filename });
        }
      }

      // Finalize the archive
      await archive.finalize();

      console.log(`✅ Delivered zip archive with ${state.deliverables.length} files for execution ${executionId}`);
    } catch (error) {
      console.error('Error creating deliverables zip:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to create deliverables archive',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  });

  /**
   * GET /api/deliverables/:executionId
   * Get execution deliverables with node ID metadata
   * 
   * Returns all deliverable files from an execution along with metadata
   * including the execution node ID and all task execution node IDs.
   * 
   * @since 1.0.0
   */
  router.get('/deliverables/:executionId', async (req: any, res: any) => {
    try {
      const { executionId } = req.params;
      const state = executionStates.get(executionId);
      
      if (!state) {
        return res.status(404).json({
          error: 'Execution not found',
          message: `No execution found with ID: ${executionId}`,
        });
      }
      
      // Extract task execution node IDs from results
      const taskExecutionIds = state.results
        .filter(r => r.graphNodeId)
        .map(r => r.graphNodeId as string);
      
      res.json({
        executionId,
        status: state.status,
        taskExecutionIds,
        deliverables: state.deliverables.map(d => ({
          filename: d.filename,
          size: d.size,
          mimeType: d.mimeType,
        })),
        totalDeliverables: state.deliverables.length,
        metadata: {
          startTime: state.startTime,
          endTime: state.endTime,
          duration: state.endTime ? state.endTime - state.startTime : null,
          totalTasks: Object.keys(state.taskStatuses).length,
        },
      });
    } catch (error) {
      console.error('Error fetching deliverables:', error);
      res.status(500).json({
        error: 'Failed to fetch deliverables',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/executions
   * List all executions with summary data
   */
  router.get('/executions', async (req: any, res: any) => {
    try {
      const { limit = '50', offset = '0' } = req.query;
      
      const driver = graphManager.getDriver();
      const session = driver.session();
      
      try {
        const result = await session.run(`
          MATCH (exec:Node {type: 'orchestration_execution'})
          RETURN exec
          ORDER BY exec.startTime DESC
          SKIP $offset
          LIMIT $limit
        `, {
          offset: neo4j.int(parseInt(offset as string)),
          limit: neo4j.int(parseInt(limit as string)),
        });
        
        const executions = result.records.map((record: any) => {
          const props = record.get('exec').properties;
          const executionId = props.id;
          
          // Merge Neo4j data with in-memory deliverables
          const memoryState = executionStates.get(executionId);
          const deliverables = memoryState?.deliverables || [];
          
          return {
            id: executionId,
            executionId: executionId,
            planId: props.planId,
            status: props.status,
            startTime: props.startTime,
            endTime: props.endTime,
            duration: props.duration?.toNumber() || 0,
            tasksTotal: props.tasksTotal?.toNumber() || 0,
            tasksSuccessful: props.tasksSuccessful?.toNumber() || 0,
            tasksFailed: props.tasksFailed?.toNumber() || 0,
            tokensTotal: props.tokensTotal?.toNumber() || 0,
            toolCalls: props.toolCalls?.toNumber() || 0,
            deliverables: deliverables.map(d => ({
              filename: d.filename,
              size: d.size,
              mimeType: d.mimeType,
              downloadUrl: `/api/execution-deliverable/${executionId}/${encodeURIComponent(d.filename)}`,
            })),
          };
        });
        
        res.json({
          executions,
          returned: executions.length,
          offset: parseInt(offset as string),
          limit: parseInt(limit as string),
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error('Error listing executions:', error);
      res.status(500).json({
        error: 'Failed to list executions',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/execute-workflow - Execute multi-agent workflow from Task Canvas
   * 
   * Starts asynchronous execution of a task workflow with parallel agent execution.
   * Each task is assigned to an agent (PM/Worker/QC) and executed with filtered context.
   * Progress can be monitored via SSE stream at /api/execution-stream/:executionId.
   * 
   * Request Body:
   * - tasks: Array of task objects with agent assignments and dependencies (required)
   * 
   * @returns JSON with executionId for tracking progress
   * 
   * @example
   * // Execute a simple workflow
   * fetch('/api/execute-workflow', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({
   *     tasks: [
   *       {
   *         id: 'task-1',
   *         title: 'Design API schema',
   *         agentType: 'worker',
   *         requirements: 'Create OpenAPI 3.0 spec for user API',
   *         dependencies: []
   *       },
   *       {
   *         id: 'task-2',
   *         title: 'Implement endpoints',
   *         agentType: 'worker',
   *         requirements: 'Implement REST endpoints from spec',
   *         dependencies: ['task-1']
   *       },
   *       {
   *         id: 'task-3',
   *         title: 'Validate implementation',
   *         agentType: 'qc',
   *         requirements: 'Verify endpoints match spec',
   *         dependencies: ['task-2']
   *       }
   *     ]
   *   })
   * })
   * .then(res => res.json())
   * .then(data => {
   *   console.log('Execution started:', data.executionId);
   *   // Connect to SSE stream for progress
   *   const eventSource = new EventSource('/api/execution-stream/' + data.executionId);
   *   eventSource.onmessage = (e) => {
   *     const update = JSON.parse(e.data);
   *     console.log('Progress:', update.message);
   *   };
   * });
   * 
   * @example
   * // Execute workflow with parallel tasks
   * const workflow = {
   *   tasks: [
   *     { id: 't1', title: 'Task 1', agentType: 'worker', requirements: '...', dependencies: [] },
   *     { id: 't2', title: 'Task 2', agentType: 'worker', requirements: '...', dependencies: [] },
   *     { id: 't3', title: 'Task 3', agentType: 'worker', requirements: '...', dependencies: ['t1', 't2'] }
   *   ]
   * };
   * 
   * const response = await fetch('/api/execute-workflow', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify(workflow)
   * }).then(r => r.json());
   * 
   * console.log('Execution ID:', response.executionId);
   * // t1 and t2 execute in parallel, t3 waits for both
   */
  router.post('/execute-workflow', async (req: any, res: any) => {
    try {
      const { tasks } = req.body;

      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: 'Invalid workflow: tasks array is required' });
      }

      console.log(`📥 Received workflow execution request with ${tasks.length} tasks`);

      // Generate execution ID
      const executionId = `exec-${Date.now()}`;

      // Start execution asynchronously (don't wait for completion)
      // No file system access needed - everything stored in Neo4j
      executeWorkflowFromJSON(tasks, executionId, graphManager).catch(error => {
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
