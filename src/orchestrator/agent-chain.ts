/**
 * Agent Composition Pattern for Multi-Agent Orchestration
 * 
 * Flow: User Request → PM Agent → Ecko Agent → PM Agent (Decomposition) → Workers
 * 
 * Inspired by DOCKER_MIGRATION_PROMPTS.md pattern where:
 * 1. PM analyzes high-level request
 * 2. Ecko optimizes individual task prompts
 * 3. PM creates task graph with optimized prompts
 * 4. Workers execute with zero-context prompts
 */

import { CopilotAgentClient, AgentConfig } from './llm-client.js';
import { CopilotModel } from './types.js';
import { planningTools } from './tools.js';
import { LLMConfigLoader } from '../config/LLMConfigLoader.js';
import { createGraphManager } from '../managers/index.js';
import type { GraphManager } from '../managers/GraphManager.js';
import path from 'path';

/**
 * Result from each agent in the chain
 */
export interface AgentChainStep {
  agentName: string;
  agentRole: string;
  input: string;
  output: string;
  toolCalls: number;
  tokens: { input: number; output: number };
  duration: number;
}

/**
 * Complete chain execution result
 */
export interface AgentChainResult {
  steps: AgentChainStep[];
  finalOutput: string;
  totalTokens: { input: number; output: number };
  totalDuration: number;
  taskGraph?: TaskGraphNode; // Optional: parsed task graph from PM
}

/**
 * Task graph node (similar to DOCKER_MIGRATION_PROMPTS.md structure)
 */
export interface TaskGraphNode {
  id: string;
  type: 'project' | 'phase' | 'task';
  title: string;
  description?: string;
  prompt?: string; // Optimized by Ecko
  dependencies?: string[];
  status?: 'pending' | 'in_progress' | 'completed';
  children?: TaskGraphNode[];
}

/**
 * Agent Chain Orchestrator
 * 
 * Chains multiple agents together in a sequential workflow:
 * 1. PM Agent: Analyzes user request and plans approach
 * 2. Ecko Agent: Optimizes prompts for individual tasks
 * 3. PM Agent: Creates final task graph with optimized prompts
 */
export class AgentChain {
  private pmAgent: CopilotAgentClient;
  private eckoAgent: CopilotAgentClient;
  private agentsDir: string;
  private graphManager: GraphManager | null = null;

  constructor(agentsDir: string = 'docs/agents') {
    this.agentsDir = agentsDir;
    
    // Initialize PM Agent with limited tools (prevents OpenAI 128 tool limit)
    this.pmAgent = new CopilotAgentClient({
      preamblePath: path.join(agentsDir, 'claudette-pm.md'),
      provider: 'copilot', // Explicitly set provider
      model: 'gpt-4.1', // Explicitly set model
      copilotBaseUrl: 'http://localhost:4141/v1', // Explicitly set base URL
      temperature: 0.0,
      maxTokens: -1,
      tools: planningTools, // Filesystem + 5 graph search tools = 12 tools
    });

    // Initialize Ecko Agent (Prompt Architect) WITHOUT tools - it only optimizes prompts
    this.eckoAgent = new CopilotAgentClient({
      preamblePath: path.join(agentsDir, 'claudette-ecko.md'),
      provider: 'copilot', // Explicitly set provider
      model: 'gpt-4.1', // Explicitly set model
      copilotBaseUrl: 'http://localhost:4141/v1', // Explicitly set base URL
      temperature: 0.0,
      maxTokens: -1,
      tools: [], // NO TOOLS - Ecko just analyzes text and outputs optimized specs
    });
  }

  /**
   * Initialize all agents (load preambles)
   */
  async initialize(): Promise<void> {
    console.log('🔗 Initializing Agent Chain...\n');
    
    // Initialize GraphManager
    try {
      this.graphManager = await createGraphManager();
    } catch (error) {
      console.warn('⚠️  Could not connect to Neo4j:', error instanceof Error ? error.message : String(error));
      console.warn('   Continuing without graph context...\n');
    }
    
    await this.pmAgent.loadPreamble(path.join(this.agentsDir, 'claudette-pm.md'));
    console.log('✅ PM Agent loaded\n');
    
    await this.eckoAgent.loadPreamble(path.join(this.agentsDir, 'claudette-ecko.md'));
    console.log('✅ Ecko Agent loaded\n');
  }

  /**
   * Clean up resources (close Neo4j connection)
   */
  async cleanup(): Promise<void> {
    if (this.graphManager) {
      try {
        await this.graphManager.close();
        console.log('✅ Neo4j connection closed');
      } catch (error) {
        console.warn('⚠️  Error closing Neo4j:', error instanceof Error ? error.message : String(error));
      }
    }
  }

  /**
   * Gather context from knowledge graph for a given query
   */
  private async gatherGraphContext(userRequest: string): Promise<string> {
    if (!this.graphManager) {
      return '## Knowledge Graph: Not available (Neo4j not connected)';
    }

    console.log('🔍 Gathering context from knowledge graph...');
    const contextParts: string[] = [];
    
    try {
      // Search for related concepts
      console.log('  - Searching for related concepts...');
      const searchQuery = userRequest.substring(0, 100);
      const searchResults = await this.graphManager.searchNodes(searchQuery, { limit: 5 });
      if (searchResults.length > 0) {
        contextParts.push('## Related Concepts from Knowledge Graph:');
        searchResults.forEach((node, i) => {
          const props = node.properties;
          const summary = props.title || props.name || props.description || JSON.stringify(props).substring(0, 80);
          contextParts.push(`${i + 1}. [${node.type}] ${summary}`);
          console.log(`    Found: [${node.type}] ${summary.substring(0, 60)}...`);
        });
      }
    } catch (error) {
      console.warn('  ⚠️  Graph search error:', error instanceof Error ? error.message : String(error));
      contextParts.push('## Graph Search: No results (error occurred)');
    }

    try {
      // Check for completed TODOs
      console.log('  - Checking completed TODOs...');
      const completedTodos = await this.graphManager.queryNodes('todo', { status: 'completed' });
      if (completedTodos.length > 0) {
        contextParts.push('\n## Recently Completed Work:');
        completedTodos.slice(0, 5).forEach((node, i) => {
          const title = node.properties.title || 'Untitled';
          const desc = node.properties.description ? ` - ${node.properties.description.substring(0, 80)}` : '';
          contextParts.push(`${i + 1}. ${title}${desc}`);
          console.log(`    ✓ ${title}`);
        });
      }
    } catch (error) {
      console.warn('  ⚠️  Query completed todos error:', error instanceof Error ? error.message : String(error));
    }

    try {
      // Check for existing files
      console.log('  - Checking indexed files...');
      const files = await this.graphManager.queryNodes('file');
      if (files.length > 0) {
        contextParts.push('\n## Indexed Files in Project:');
        contextParts.push(`Total: ${files.length} files`);
        const fileList = files.slice(0, 15).map(f => f.properties.path || 'unknown');
        contextParts.push(`Sample: ${fileList.join(', ')}`);
        console.log(`    Found ${files.length} indexed files`);
      }
    } catch (error) {
      console.warn('  ⚠️  Query files error:', error instanceof Error ? error.message : String(error));
    }

    const contextSummary = contextParts.join('\n');
    console.log(`✅ Context gathered (${contextParts.length} sections, ${contextSummary.length} chars)\n`);
    return contextParts.length > 0 ? contextSummary : '## No relevant context found in knowledge graph';
  }

  /**
   * Execute the full agent chain
   * 
   * @param userRequest - High-level user request (e.g., "Draft up plan X")
   * @returns Complete chain result with task graph
   */
  async execute(userRequest: string): Promise<AgentChainResult> {
    const steps: AgentChainStep[] = [];
    const startTime = Date.now();

    console.log('\n' + '='.repeat(80));
    console.log('🚀 AGENT CHAIN EXECUTION (Ecko → PM)');
    console.log('='.repeat(80));
    console.log(`📝 User Request: ${userRequest}\n`);

    // Gather context from knowledge graph ONCE
    const graphContext = await this.gatherGraphContext(userRequest);

    // STEP 1: Ecko Agent - Request Analysis & Optimization
    console.log('\n' + '-'.repeat(80));
    console.log('STEP 1: Ecko Agent - Request Optimization');
    console.log('-'.repeat(80) + '\n');

    const eckoStep1Start = Date.now();
    const eckoStep1Input = `${graphContext}

---

## USER REQUEST

${userRequest}

---

## YOUR TASK

Analyze the user request and knowledge graph context above.

Provide an optimized specification that:
1. Clarifies what needs to be built/done
2. References relevant existing work or files from the graph
3. Defines key requirements and constraints
4. Establishes success criteria
5. Notes any assumptions or clarifications

Keep it concise and actionable.`;

    const eckoStep1Result = await this.eckoAgent.execute(eckoStep1Input);
    
    steps.push({
      agentName: 'Ecko Agent',
      agentRole: 'Request Optimization',
      input: eckoStep1Input,
      output: eckoStep1Result.output,
      toolCalls: eckoStep1Result.toolCalls,
      tokens: eckoStep1Result.tokens,
      duration: Date.now() - eckoStep1Start,
    });

    console.log(`\n✅ Ecko completed optimization in ${((Date.now() - eckoStep1Start) / 1000).toFixed(2)}s`);
    console.log(`📊 Tool calls: ${eckoStep1Result.toolCalls}`);
    console.log(`🎯 Output preview:\n${eckoStep1Result.output.substring(0, 300)}...\n`);

    // STEP 2: PM Agent - Task Breakdown based on Ecko's optimized spec
    console.log('\n' + '-'.repeat(80));
    console.log('STEP 2: PM Agent - Task Breakdown');
    console.log('-'.repeat(80) + '\n');

    const pmStep2Start = Date.now();
    const pmStep2Input = `${graphContext}

---

## OPTIMIZED SPECIFICATION FROM ECKO

${eckoStep1Result.output}

---

## ORIGINAL USER REQUEST

${userRequest}

---

## YOUR TASK

Create a complete task breakdown and execution plan based on Ecko's optimized specification.

Provide:
1. Analysis of what needs to be done
2. References to existing files/work from knowledge graph
3. Task breakdown into phases
4. For each task:
   - Task ID (task-x.y format)
   - Title
   - Worker role description
   - Complete self-contained prompt
   - Dependencies
   - Estimated duration
   - Verification criteria

Output in markdown format ready for worker execution.`;

    const pmStep2Result = await this.pmAgent.execute(pmStep2Input);
    
    steps.push({
      agentName: 'PM Agent',
      agentRole: 'Task Breakdown',
      input: pmStep2Input,
      output: pmStep2Result.output,
      toolCalls: pmStep2Result.toolCalls,
      tokens: pmStep2Result.tokens,
      duration: Date.now() - pmStep2Start,
    });

    console.log(`\n✅ PM completed task breakdown in ${((Date.now() - pmStep2Start) / 1000).toFixed(2)}s`);
    console.log(`📊 Tool calls: ${pmStep2Result.toolCalls}`);
    console.log(`🎯 Output preview:\n${pmStep2Result.output.substring(0, 300)}...\n`);

    // Calculate totals
    const totalTokens = steps.reduce(
      (acc, step) => ({
        input: acc.input + step.tokens.input,
        output: acc.output + step.tokens.output,
      }),
      { input: 0, output: 0 }
    );

    const totalDuration = Date.now() - startTime;

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 CHAIN EXECUTION SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`🎫 Total Tokens: ${totalTokens.input + totalTokens.output}`);
    console.log(`   - Input: ${totalTokens.input}`);
    console.log(`   - Output: ${totalTokens.output}`);
    console.log(`🔧 Total Tool Calls: ${steps.reduce((acc, s) => acc + s.toolCalls, 0)}`);
    console.log(`\n� Steps Executed:`);
    steps.forEach((step, i) => {
      console.log(`   ${i + 1}. ${step.agentName} (${step.agentRole}): ${step.duration}ms, ${step.toolCalls} tools`);
    });
    console.log('\n' + '='.repeat(80) + '\n');

    return {
      steps,
      finalOutput: pmStep2Result.output,
      totalTokens,
      totalDuration,
    };
  }
}

/**
 * CLI Entry Point
 * 
 * Usage: npm run chain "Draft migration plan for Docker"
 */
export async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let agentsDir = 'docs/agents'; // Default
  let userRequest = '';
  
  // Check for --agents-dir flag
  const agentsDirIndex = args.indexOf('--agents-dir');
  if (agentsDirIndex !== -1 && args[agentsDirIndex + 1]) {
    agentsDir = args[agentsDirIndex + 1];
    // Remove --agents-dir and its value from args
    args.splice(agentsDirIndex, 2);
  }
  
  // Also check environment variable as fallback
  if (process.env.MIMIR_AGENTS_DIR) {
    agentsDir = process.env.MIMIR_AGENTS_DIR;
  }
  
  userRequest = args.join(' ');
  
  if (!userRequest) {
    console.error('❌ Error: No user request provided');
    console.error('\nUsage: npm run chain "Your request here"');
    console.error('       mimir-chain "Your request here"');
    console.error('Example: npm run chain "Draft migration plan for Docker containerization"');
    process.exit(1);
  }

  const chain = new AgentChain(agentsDir);
  
  try {
    await chain.initialize();
    const result = await chain.execute(userRequest);
    
    // Write final output to file
    const fs = await import('fs/promises');
    const outputPath = path.join(process.cwd(), 'chain-output.md');
    await fs.writeFile(outputPath, result.finalOutput, 'utf-8');
    
    console.log(`\n✅ Final output written to: ${outputPath}`);
    console.log('\n📄 Preview:\n');
    console.log(result.finalOutput.substring(0, 500) + '...\n');
    
  } catch (error: any) {
    console.error('\n❌ Chain execution failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up resources
    await chain.cleanup();
    process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

