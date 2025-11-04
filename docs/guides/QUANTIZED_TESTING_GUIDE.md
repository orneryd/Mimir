# Quantized Preamble Testing Guide

This guide explains how to automatically test the quantized Claudette preamble against small language models running on your Ollama server.

---

## Overview

The quantized testing suite (`test:quantized`) allows you to:

- ✅ Test `claudette-quantized.md` against multiple small models (≤10B)
- ✅ Compare performance with the original `claudette-auto.md`
- ✅ Automatically filter out large models (>10B) and cloud APIs
- ✅ Generate detailed comparison reports with scores and metrics
- ✅ Validate behavioral parity across different model sizes

---

## Prerequisites

### 1. Ollama Server Running

You need Ollama running locally or on a network server:

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Or check remote server
curl http://192.168.1.167:11434/api/tags
```

If not running:

- **Local**: Download from [ollama.ai](https://ollama.ai) and start
- **Remote**: Ensure server is accessible on your network

### 2. Pull Recommended Models

The test suite recommends these models (≤10B parameters):

```bash
# Qwen models (1.5B - 7B)
ollama pull qwen2.5-coder:1.5b
ollama pull qwen2.5-coder:3b
ollama pull qwen2.5-coder:7b
ollama pull qwen2.5-coder:7b-instruct-q4_K_M

# Phi models (3.8B)
ollama pull phi3:mini

# Gemma models (2B - 9B)
ollama pull gemma2:2b
ollama pull gemma2:9b

# LLaMA 3.2 (1B - 3B)
ollama pull llama3.2:1b
ollama pull llama3.2:3b

# DeepSeek Coder (1.3B - 6.7B)
ollama pull deepseek-coder:1.3b
ollama pull deepseek-coder:6.7b

# TinyLLaMA (1.1B - baseline)
ollama pull tinyllama:1.1b
```

**Note:** You don't need all models. The test suite will skip unavailable models automatically.

---

## Quick Start

### Basic Usage (Local Ollama)

```bash
# Test with all recommended models on localhost
npm run test:quantized
```

### Connect to Remote Ollama Server

```bash
# Test with remote Ollama server
npm run test:quantized -- --server http://192.168.1.167:11434
```

### Test Specific Models

```bash
# Test only small models
npm run test:quantized -- --models qwen2.5-coder:1.5b,phi3:mini,gemma2:2b

# Test with remote server + specific models
npm run test:quantized -- --server http://192.168.1.167:11434 --models qwen2.5-coder:1.5b,qwen2.5-coder:7b
```

### Test Only Quantized Preamble

```bash
# Skip comparison with claudette-auto.md
npm run test:quantized -- --preambles docs/agents/claudette-quantized.md
```

---

## Command Line Options

```
Usage: npm run test:quantized [options]

Options:
  --server <url>       Ollama server URL (default: http://localhost:11434)
  --models <list>      Comma-separated model names (default: all recommended)
  --preambles <list>   Comma-separated preamble paths (default: quantized + auto)
  --output <dir>       Output directory (default: quantized-test-results)
  --list-models, -l    List recommended models (≤10B parameters)
  --help, -h           Show this help

Model Selection:
  - Only models ≤10B parameters are tested
  - Cloud models (GPT, Claude, Gemini) are automatically excluded
  - Large models (>10B) are automatically filtered out

Examples:
  # Test with remote Ollama server
  npm run test:quantized -- --server http://192.168.1.167:11434

  # Test specific models (will filter out any >10B)
  npm run test:quantized -- --models qwen2.5-coder:1.5b,phi3:mini

  # Test only quantized preamble
  npm run test:quantized -- --preambles docs/agents/claudette-quantized.md

Environment:
  OLLAMA_BASE_URL      Override default Ollama server URL
```

---

## Understanding the Results

### Output Files

The test suite generates:

**Per-test results:**

```
quantized-test-results/
├── 2025-11-01_claudette-quantized_qwen2.5-coder_1.5b.json
├── 2025-11-01_claudette-quantized_qwen2.5-coder_1.5b.md
├── 2025-11-01_claudette-auto_qwen2.5-coder_1.5b.json
├── 2025-11-01_claudette-auto_qwen2.5-coder_1.5b.md
└── ...
```

**Comparison report:**

```
quantized-test-results/
└── 2025-11-01_comparison-report.md
```

### Reading the Comparison Report

**Results Summary Table:**

```markdown
| Preamble            | Model              | Score  | Tool Calls | Duration (s) | Status  |
| ------------------- | ------------------ | ------ | ---------- | ------------ | ------- |
| claudette-quantized | qwen2.5-coder:1.5b | 85/100 | 5          | 12.3         | ✅ Pass |
| claudette-auto      | qwen2.5-coder:1.5b | 88/100 | 5          | 14.7         | ✅ Pass |
```

**Status Indicators:**

- ✅ **Pass**: Score ≥80 (acceptable behavioral parity)
- ⚠️ **Low**: Score <80 (degraded performance)
- ❌ **Error**: Test failed to complete

**Score Breakdown by Preamble:**

```markdown
### claudette-quantized

**Average Score:** 83.5/100
**Average Tool Calls:** 5.2

| Model              | Score  | Tool Calls | Duration |
| ------------------ | ------ | ---------- | -------- |
| qwen2.5-coder:1.5b | 85/100 | 5          | 12.3s    |
| phi3:mini          | 82/100 | 5          | 15.1s    |
```

### Interpreting Scores

**Score Categories:**

- **90-100**: Excellent - Full behavioral parity with original
- **80-89**: Good - Acceptable parity, minor degradation
- **70-79**: Fair - Noticeable degradation, may need optimization
- **<70**: Poor - Significant degradation, not recommended

**What Scores Measure:**

1. **Memory Protocol Adherence** (20 points)

   - Creates `.agents/memory.instruction.md` as first action
   - Structure matches template
   - Updates memory appropriately

2. **TODO Management** (20 points)

   - Creates TODO list with phases
   - References TODO throughout execution
   - Maintains context across conversation

3. **Autonomous Execution** (20 points)

   - Executes tools immediately after announcement
   - No "would you like me to proceed?" patterns
   - Continues until completion

4. **Repository Conservation** (20 points)

   - Detects existing tools/frameworks
   - Uses existing dependencies
   - No competing tool installation

5. **Error Recovery** (20 points)
   - Cleans up temporary files
   - Reverts problematic changes
   - Documents failed approaches

---

## Benchmark Task

The test uses `quantized-preamble-benchmark.json` which tests:

**Scenario**: Multi-file authentication implementation

**Requirements**:

1. Create memory file as first action
2. Analyze existing project structure
3. Create TODO with phases
4. Implement auth module with TypeScript
5. Create tests using existing framework
6. Clean up any temporary files

**Expected Behavior**:

- ✅ Memory file created immediately
- ✅ TODO list maintained throughout
- ✅ No permission-asking patterns
- ✅ Existing tools detected and used
- ✅ Clean workspace at completion

---

## Example Session

```bash
$ npm run test:quantized -- --server http://192.168.1.167:11434 --models qwen2.5-coder:1.5b,phi3:mini

🚀 Quantized Preamble Testing Suite

📡 Server: http://192.168.1.167:11434
🤖 Models: qwen2.5-coder:1.5b, phi3:mini
📋 Preambles: claudette-quantized.md, claudette-auto.md
📊 Benchmark: quantized-preamble-benchmark.json

🔍 Checking Ollama server...
✅ Connected! Found 8 models

✅ qwen2.5-coder:1.5b - available
✅ phi3:mini - available

🎯 Testing 2 models x 2 preambles = 4 runs

================================================================================
🧪 Testing: claudette-quantized with qwen2.5-coder:1.5b
================================================================================

📝 Task: Implement authentication module with login/logout functionality...

✅ Completed in 12.3s
📊 Tool calls: 5, Tokens: 1245

📊 Evaluating output...
📈 Score: 85/100

💾 Saved: quantized-test-results/2025-11-01_claudette-quantized_qwen2.5-coder_1.5b.{json,md}

[... continues for all models ...]

📊 Comparison report: quantized-test-results/2025-11-01_comparison-report.md

✅ Testing complete!
```

---

## Advanced Usage

### Custom Benchmark

Create your own benchmark JSON:

```json
{
  "name": "Custom Benchmark",
  "description": "Test specific behavior",
  "task": "Your task description here...",
  "rubric": {
    "categories": [
      {
        "name": "Custom Category",
        "maxPoints": 20,
        "criteria": [
          {
            "description": "Does X",
            "points": 10,
            "keywords": ["keyword1", "keyword2"]
          }
        ]
      }
    ]
  }
}
```

Run with custom benchmark:

```bash
npm run test:quantized -- --benchmark path/to/custom-benchmark.json
```

### Environment Variables

Set default Ollama server:

```bash
# In .env or shell
export OLLAMA_BASE_URL=http://192.168.1.167:11434

# Now test uses remote server by default
npm run test:quantized
```

### Continuous Integration

Add to CI pipeline:

```yaml
# .github/workflows/test-quantized.yml
name: Test Quantized Preambles

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      ollama:
        image: ollama/ollama
        ports:
          - 11434:11434
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      - run: npm install
      - run: npm run build

      # Pull test models
      - run: |
          ollama pull qwen2.5-coder:1.5b
          ollama pull phi3:mini

      # Run tests
      - run: npm run test:quantized -- --models qwen2.5-coder:1.5b,phi3:mini

      # Upload results
      - uses: actions/upload-artifact@v3
        with:
          name: quantized-test-results
          path: quantized-test-results/
```

---

## Troubleshooting

### "Cannot connect to Ollama server"

**Problem**: Server not accessible

**Solutions**:

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve

# Check firewall (for remote server)
sudo ufw allow 11434
```

### "No valid models available"

**Problem**: Models not pulled or excluded

**Solutions**:

```bash
# List recommended models
npm run test:quantized -- --list-models

# Pull specific model
ollama pull qwen2.5-coder:1.5b

# Check what's available on server
curl http://localhost:11434/api/tags | jq '.models[].name'
```

### Model Size Filtering Issues

**Problem**: Model incorrectly filtered

The test suite automatically filters models by:

1. Checking exclusion list (GPT, Claude, Gemini, Mixtral, etc.)
2. Parsing size from model name (e.g., `14b`, `70b`)
3. Looking up known model sizes in `MODEL_SIZES` table

If a model is incorrectly filtered, you can:

```bash
# Override filtering by specifying exact model
npm run test:quantized -- --models your-model-name
```

### Low Scores

**Problem**: Quantized preamble scores below 80

**Diagnosis**:

1. Check detailed category scores in comparison report
2. Review individual test JSON files for specific failures
3. Compare with claudette-auto.md results on same model

**Common Issues**:

- Model too small (<2B) - try larger quantized models
- Benchmark task too complex - create simpler benchmark
- Preamble optimization too aggressive - adjust structure

---

## Best Practices

### Model Selection

**For validation testing (parity check):**

- Use: `qwen2.5-coder:7b`, `phi3:mini`, `gemma2:9b`
- Goal: ≥95% parity with claudette-auto.md

**For optimization testing (token efficiency):**

- Use: `qwen2.5-coder:1.5b`, `llama3.2:1b`, `tinyllama:1.1b`
- Goal: ≥80% parity with 33% fewer tokens

**For production deployment:**

- Test with actual target model (e.g., quantized on edge device)
- Run multiple benchmarks (simple → complex)
- Validate across different task types

### Interpreting Results

**Good Results:**

- Quantized ≥85% on 7B models
- Quantized ≥80% on 2-4B models
- Tool call counts similar to original
- Duration within 20% of original

**Acceptable Results:**

- Quantized 75-84% on 2-4B models
- Some category degradation (1-2 categories)
- Longer duration acceptable if score maintained

**Poor Results:**

- Quantized <75% on any model
- Multiple category failures
- Significantly higher tool calls (indicates confusion)

### Iteration Strategy

1. **Baseline**: Test original claudette-auto.md on all models
2. **Quantized**: Test claudette-quantized.md on all models
3. **Compare**: Identify degradation patterns by category
4. **Optimize**: Adjust quantized preamble structure for failing categories
5. **Retest**: Validate improvements with focused benchmarks
6. **Repeat**: Iterate until acceptable parity achieved

---

## Related Documentation

- **[claudette-quantized.md](../agents/claudette-quantized.md)** - The quantized preamble

---

**Last Updated:** 2025-11-01  
**Version:** 1.0.0  
**Target Models:** 2-10B parameter quantized LLMs
