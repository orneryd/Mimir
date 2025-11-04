import { ChatOpenAI } from '@langchain/openai';
import { CopilotModel } from '../types.js';

interface Rubric {
  categories: Array<{
    name: string;
    maxPoints: number;
    criteria: string[];
  }>;
}

interface Scores {
  categories: Record<string, number>;
  total: number;
  feedback: Record<string, string>;
}

interface Metadata {
  toolCallCount?: number;
  toolCalls?: number;
  [key: string]: any;
}

export async function evaluateAgent(
  agentOutput: string,
  rubric: Rubric,
  metadata?: Metadata
): Promise<Scores> {
  // Use GitHub Copilot for evaluation (LLM-as-judge)
  const evaluator = new ChatOpenAI({
    apiKey: 'dummy-key-not-used', // Required by OpenAI client but not used by proxy
    model: CopilotModel.GPT_4_1, // Default to GPT-4.1
    configuration: {
      baseURL: 'http://localhost:4141/v1', // copilot-api proxy
    },
    temperature: 0.0, // Deterministic scoring
  });

  const scores: Scores = {
    categories: {},
    total: 0,
    feedback: {},
  };

  // Get actual tool call count from metadata
  const actualToolCalls = metadata?.toolCallCount ?? metadata?.toolCalls ?? 0;
  
  // Evaluate each category
  for (const category of rubric.categories) {
    // Check if this is a tool-usage related category
    const isToolCategory = category.name.toLowerCase().includes('tool') || 
                          category.name.toLowerCase().includes('autonomous') ||
                          category.name.toLowerCase().includes('verification') ||
                          category.name.toLowerCase().includes('discovery');
    
    const evaluationPrompt = `
You are an expert evaluator. Score the following agent output against this rubric category:

**Category**: ${category.name} (Max: ${category.maxPoints} points)

**Criteria**:
${category.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**Agent Output**:
${agentOutput}

${isToolCategory ? `
**CRITICAL - Tool Usage Verification**:
- Actual tool calls made: ${actualToolCalls}
- If actual tool calls = 0, then:
  * "Tool Usage" category MUST score 0 points
  * "Autonomous Execution" category MUST score 0 points (no execution happened)
  * "Verification" category MUST score 0 points (nothing was verified)
  * "Discovery & Analysis" category MUST score 0 points (nothing was discovered)
  
**IMPORTANT**: Descriptions of tool calls in text DO NOT COUNT as tool usage.
- Example of FAKE tool usage (score 0): Model writes "read_file config.json" or "edit_file src/main.py" in a code block
- Example of REAL tool usage (can score >0): actualToolCalls > 0 (actual function calls were made)

Only actual function calls (actualToolCalls > 0) count as tool usage.
Pseudocode, descriptions, or mentions of tool names DO NOT count.
` : ''}

**Instructions**:
1. Assign a score from 0 to ${category.maxPoints} based on how well the output meets the criteria.
2. ${isToolCategory ? 'CHECK actualToolCalls field FIRST. If 0, score MUST be 0 regardless of text output.' : ''}
3. Provide brief feedback explaining the score.
4. Format your response EXACTLY as:
   SCORE: <number>
   FEEDBACK: <explanation>
`.trim();

    const response = await evaluator.invoke(evaluationPrompt);
    const responseText = response.content.toString();

    // Parse score
    const scoreMatch = responseText.match(/SCORE:\s*(\d+)/);
    const feedbackMatch = responseText.match(/FEEDBACK:\s*(.+)/s);

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'No feedback provided';

    scores.categories[category.name] = Math.min(score, category.maxPoints);
    scores.feedback[category.name] = feedback;
    scores.total += scores.categories[category.name];
    
    // Validation: Warn if tool-related category got points but no tools were called
    if (isToolCategory && score > 0 && actualToolCalls === 0) {
      console.warn(`⚠️  JUDGE SCORING ERROR DETECTED:`);
      console.warn(`   Category: ${category.name}`);
      console.warn(`   Score given: ${score}/${category.maxPoints}`);
      console.warn(`   Actual tool calls: ${actualToolCalls}`);
      console.warn(`   This indicates the judge scored descriptions instead of execution.`);
      console.warn(`   The score should be 0 for this category.\n`);
    }
  }

  return scores;
}

