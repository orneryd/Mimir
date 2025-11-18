/**
 * @fileoverview Agentinator preamble generation for dynamic agent creation
 * 
 * This module provides functionality for generating customized agent preambles
 * using the Agentinator system. It loads templates and uses an LLM to create
 * role-specific preambles for worker and QC agents.
 * 
 * @module api/orchestration/agentinator
 * @since 1.0.0
 */

import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Result of successful preamble generation
 */
export interface AgentPreamble {
  /** Agent name derived from role description (first 3-5 words) */
  name: string;
  /** Full role description provided as input */
  role: string;
  /** Generated preamble content in markdown format */
  content: string;
}

/**
 * Generate agent preamble using Agentinator
 * 
 * Uses the Agentinator system to dynamically generate customized agent preambles
 * based on a role description and agent type. Loads the appropriate template,
 * constructs a specialized prompt, and calls an LLM to generate the final preamble.
 * 
 * @param roleDescription - Natural language description of the agent's role
 * @param agentType - Type of agent ('worker' for task execution or 'qc' for quality control)
 * @returns Object containing agent name, role, and generated preamble content
 * @throws {Error} If template files are missing, LLM API fails, or generated content is empty
 * 
 * @example
 * // Example 1: Generate worker agent preamble
 * const workerPreamble = await generatePreambleWithAgentinator(
 *   'Python developer specializing in Django REST APIs',
 *   'worker'
 * );
 * // Returns: {
 * //   name: 'Python developer specializing in',
 * //   role: 'Python developer specializing in Django REST APIs',
 * //   content: '# Python Developer\n\n...' (full preamble)
 * // }
 * 
 * @example
 * // Example 2: Generate QC agent preamble
 * const qcPreamble = await generatePreambleWithAgentinator(
 *   'Security auditor for API endpoints',
 *   'qc'
 * );
 * // Uses qc-template.md and generates security-focused QC preamble
 * 
 * @example
 * // Example 3: Handle generation errors
 * try {
 *   const preamble = await generatePreambleWithAgentinator(
 *     'DevOps engineer with Kubernetes expertise',
 *     'worker'
 *   );
 *   console.log(`Generated ${preamble.content.length} chars for ${preamble.name}`);
 * } catch (error) {
 *   console.error('Preamble generation failed:', error.message);
 *   // Fallback to default preamble or abort task creation
 * }
 * 
 * @since 1.0.0
 */
export async function generatePreambleWithAgentinator(
  roleDescription: string,
  agentType: 'worker' | 'qc'
): Promise<AgentPreamble> {
  try {
    // Load Agentinator preamble
    const agentinatorPath = path.join(__dirname, '../../../docs/agents/v2/02-agentinator-preamble.md');
    const agentinatorPreamble = await fs.readFile(agentinatorPath, 'utf-8');

    // Load appropriate template
    const templatePath = path.join(
      __dirname,
      '../../../docs/agents/v2/templates',
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
    // Simple concatenation: base URL + path
    const baseUrl = process.env.MIMIR_LLM_API || 'http://copilot-api:4141';
    const chatPath = process.env.MIMIR_LLM_API_PATH || '/v1/chat/completions';
    const apiUrl = `${baseUrl}${chatPath}`;
    const apiKey = process.env.MIMIR_LLM_API_KEY || 'dummy-key';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
