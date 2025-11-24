[**mimir v1.0.0**](../../README.md)

***

[mimir](../../README.md) / api/orchestration/agentinator

# api/orchestration/agentinator

## Fileoverview

Agentinator preamble generation for dynamic agent creation

This module provides functionality for generating customized agent preambles
using the Agentinator system. It loads templates and uses an LLM to create
role-specific preambles for worker and QC agents.

## Since

1.0.0

## Interfaces

### AgentPreamble

Defined in: src/api/orchestration/agentinator.ts:22

Result of successful preamble generation

#### Properties

##### name

> **name**: `string`

Defined in: src/api/orchestration/agentinator.ts:24

Agent name derived from role description (first 3-5 words)

##### role

> **role**: `string`

Defined in: src/api/orchestration/agentinator.ts:26

Full role description provided as input

##### content

> **content**: `string`

Defined in: src/api/orchestration/agentinator.ts:28

Generated preamble content in markdown format

## Functions

### generatePreambleWithAgentinator()

> **generatePreambleWithAgentinator**(`roleDescription`, `agentType`): `Promise`\<[`AgentPreamble`](#agentpreamble)\>

Defined in: src/api/orchestration/agentinator.ts:78

Generate agent preamble using Agentinator

Uses the Agentinator system to dynamically generate customized agent preambles
based on a role description and agent type. Loads the appropriate template,
constructs a specialized prompt, and calls an LLM to generate the final preamble.

#### Parameters

##### roleDescription

`string`

Natural language description of the agent's role

##### agentType

Type of agent ('worker' for task execution or 'qc' for quality control)

`"worker"` | `"qc"`

#### Returns

`Promise`\<[`AgentPreamble`](#agentpreamble)\>

Object containing agent name, role, and generated preamble content

#### Throws

If template files are missing, LLM API fails, or generated content is empty

#### Examples

```ts
// Example 1: Generate worker agent preamble
const workerPreamble = await generatePreambleWithAgentinator(
  'Python developer specializing in Django REST APIs',
  'worker'
);
// Returns: {
//   name: 'Python developer specializing in',
//   role: 'Python developer specializing in Django REST APIs',
//   content: '# Python Developer\n\n...' (full preamble)
// }
```

```ts
// Example 2: Generate QC agent preamble
const qcPreamble = await generatePreambleWithAgentinator(
  'Security auditor for API endpoints',
  'qc'
);
// Uses qc-template.md and generates security-focused QC preamble
```

```ts
// Example 3: Handle generation errors
try {
  const preamble = await generatePreambleWithAgentinator(
    'DevOps engineer with Kubernetes expertise',
    'worker'
  );
  console.log(`Generated ${preamble.content.length} chars for ${preamble.name}`);
} catch (error) {
  console.error('Preamble generation failed:', error.message);
  // Fallback to default preamble or abort task creation
}
```

#### Since

1.0.0
