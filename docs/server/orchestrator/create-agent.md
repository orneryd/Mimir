[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/create-agent

# orchestrator/create-agent

## Functions

### createAgent()

> **createAgent**(`roleDescription`, `outputDir`, `model`, `taskExample?`, `isQC?`): `Promise`\<`string`\>

Defined in: src/orchestrator/create-agent.ts:98

Create a new agent preamble using the Agentinator system

This function orchestrates the agent creation process:
1. Loads the appropriate template (Worker or QC)
2. Initializes the Agentinator agent
3. Generates a customized preamble based on role description
4. Saves the preamble to a hashed filename for caching

The generated agent follows strict template structure preservation rules
to ensure consistency across all generated agents.

#### Parameters

##### roleDescription

`string`

Natural language description of the agent's role
  Example: "senior golang developer with cryptography expertise"

##### outputDir

`string` = `'generated-agents'`

Directory to save generated agent preambles (default: 'generated-agents')

##### model

`string` = `...`

LLM model to use for generation (default: from MIMIR_DEFAULT_MODEL env)

##### taskExample?

`any`

Optional task object to provide context for generation

##### isQC?

`boolean` = `false`

Whether to generate a QC agent (true) or Worker agent (false)

#### Returns

`Promise`\<`string`\>

Path to the generated agent preamble file

#### Example

```ts
// Create a worker agent
const agentPath = await createAgent(
  'senior golang developer',
  'generated-agents',
  'gpt-4.1'
);
console.log(`Agent saved to: ${agentPath}`);
// Output: Agent saved to: generated-agents/worker-a3f2b8c1.md

// Create a QC agent with task context
const qcPath = await createAgent(
  'security auditor',
  'generated-agents',
  'gpt-4.1',
  { id: 't1', title: 'Audit auth system', prompt: '...' },
  true
);
```
