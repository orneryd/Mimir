# Agent Validation Orchestrator

Automated testing and validation for agent preambles using LangChain + GitHub Copilot API.

---

## 📁 Structure

```
src/orchestrator/
├── validate-agent.ts       # Main validation script
├── llm-client.ts           # GitHub Copilot client wrapper
├── report-generator.ts     # Report formatting
└── evaluators/
    └── index.ts            # LLM-as-judge evaluators
```

---

## 🚀 Usage

### Validate Single Agent

```bash
npm run validate docs/agents/claudette-debug.md benchmarks/debug-benchmark.json
```

**Output**:
```
🔍 Validating agent: docs/agents/claudette-debug.md
📋 Benchmark: benchmarks/debug-benchmark.json

⚙️  Executing benchmark task...
✅ Task completed in 12,451 tokens

📊 Evaluating output against rubric...
  Bug Discovery: 32/35
  Root Cause Analysis: 18/20
  Methodology: 19/20
  Process Quality: 14/15
  Production Impact: 9/10
📈 Total score: 92/100

📄 Report saved to: validation-output/2025-10-15_claudette-debug.md
```

---

## 📦 Prerequisites

1. **GitHub Copilot proxy running**:
   ```bash
   copilot-api start &
   ```

2. **GitHub CLI authenticated**:
   ```bash
   gh auth status
   ```

3. **Dependencies installed**:
   ```bash
   npm install
   ```

---

## 🔧 Components

### `llm-client.ts`
- Wraps GitHub Copilot Chat API via copilot-api proxy
- Loads agent preambles as system prompts
- Executes benchmark tasks
- Captures conversation history and token usage

### `evaluators/index.ts`
- LLM-as-judge pattern for automated scoring
- Evaluates agent output against rubric categories
- Returns scores and feedback

### `report-generator.ts`
- Formats validation results as Markdown
- Includes scoring breakdown, agent output, and conversation history

### `validate-agent.ts`
- Main orchestration script
- CLI entry point
- Ties all components together

---

## 📊 Output Files

### JSON (Raw Data)
```
validation-output/2025-10-15_claudette-debug.json
```
Contains:
- Timestamp
- Agent path
- Benchmark path
- Full conversation history
- Token usage
- Scores and feedback

### Markdown (Readable Report)
```
validation-output/2025-10-15_claudette-debug.md
```
Contains:
- Scoring breakdown
- Category feedback
- Agent output
- Token usage
- Full conversation transcript

---

## 🎯 Creating Benchmarks

See `benchmarks/debug-benchmark.json` for example format:

```json
{
  "name": "Benchmark Name",
  "description": "What this tests",
  "task": "Instructions for the agent...",
  "rubric": {
    "categories": [
      {
        "name": "Category Name",
        "maxPoints": 35,
        "criteria": [
          "Criterion 1",
          "Criterion 2"
        ]
      }
    ]
  }
}
```

---

## 🐛 Troubleshooting

### "Connection refused" error
```bash
# Ensure copilot-api is running
copilot-api start &

# Check it's listening
curl http://localhost:4141/v1/models
```

### "Authentication failed" error
```bash
# Re-authenticate with GitHub CLI
gh auth login

# Verify
gh auth status
```

### TypeScript errors
```bash
# Rebuild
npm run build

# Or run directly with ts-node
ts-node src/orchestrator/validate-agent.ts <agent> <benchmark>
```

---

## 📚 See Also

- **Setup Guide**: `tools/SETUP.md`
- **Full Design**: `docs/agents/VALIDATION_TOOL_DESIGN.md`
- **Benchmark Examples**: `benchmarks/`

