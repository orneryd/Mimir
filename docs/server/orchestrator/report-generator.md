[**mimir v1.0.0**](../README.md)

***

[mimir](../README.md) / orchestrator/report-generator

# orchestrator/report-generator

## Functions

### generateReport()

> **generateReport**(`data`): `string`

Defined in: src/orchestrator/report-generator.ts:72

Generate a comprehensive validation report for agent execution

Creates a markdown-formatted report containing:
- Execution metadata (agent, benchmark, model, date)
- Performance metrics (tokens, tool calls)
- Scoring breakdown by category with feedback
- Complete agent output
- Full conversation history

This report is used for:
- Agent validation and benchmarking
- Performance analysis and optimization
- Debugging agent behavior
- Documentation and audit trails

#### Parameters

##### data

`ReportData`

Report data including agent info, execution results, and scores

#### Returns

`string`

Markdown-formatted report string

#### Example

```ts
const reportData = {
  agent: 'worker-a3f2b8c1',
  benchmark: 'golang-crypto-task',
  model: 'gpt-4.1',
  result: {
    output: 'Task completed successfully...',
    conversationHistory: [
      { role: 'user', content: 'Implement RSA encryption' },
      { role: 'assistant', content: 'I will implement...' }
    ],
    tokens: { input: 1500, output: 2000 },
    toolCalls: 12
  },
  scores: {
    categories: {
      'Correctness': 25,
      'Code Quality': 20,
      'Documentation': 15
    },
    total: 85,
    feedback: {
      'Correctness': 'Implementation is correct and handles edge cases',
      'Code Quality': 'Well-structured with good error handling',
      'Documentation': 'Clear comments and examples provided'
    }
  }
};

const report = generateReport(reportData);
fs.writeFileSync('validation-report.md', report);
```
