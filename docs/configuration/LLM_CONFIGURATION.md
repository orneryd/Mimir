# LLM Configuration Guide

## Overview

Mimir uses **Ollama with `gpt-oss` as the default model** for all agent activity (PM, Worker, QC agents). This provides a good balance of quality and speed with a fully open-source stack.

## Current Configuration

### Default Setup (`.mimir/llm-config.json`)

```json
{
  "defaultProvider": "ollama",
  "providers": {
    "ollama": {
      "defaultModel": "gpt-oss",
      ...
    }
  },
  "agentDefaults": {
    "pm": { "provider": "ollama", "model": "gpt-oss" },
    "worker": { "provider": "ollama", "model": "gpt-oss" },
    "qc": { "provider": "ollama", "model": "gpt-oss" }
  },
  "features": {
    "pmModelSuggestions": false
  }
}
```

**Key Points:**
- ✅ **All agents use `gpt-oss` by default** (13B params, 32K context window)
- ✅ **Ollama runs locally** at `http://localhost:11434`
- ✅ **No API keys required** - fully self-hosted
- ✅ **Backup models available**: `tinyllama`, `qwen2.5-coder:1.5b-base`, `deepseek-coder:6.7b`
- 🎯 **Optional PM model suggestions** - PM can recommend task-specific models (disabled by default)

## PM Model Suggestions Feature

### Overview

When enabled, the PM agent can recommend specific models for individual tasks based on their requirements. This allows intelligent model selection while preserving cost control.

**Default: DISABLED** - All agents use configured defaults unless explicitly enabled.

### How It Works

1. **PM Receives Model List**: PM agent sees available models with descriptions when planning
2. **PM Suggests Model**: PM can add `recommendedModel` field to task definitions
   ```json
   {
     "id": "task-1",
     "title": "Optimize database queries",
     "recommendedModel": "ollama/deepseek-coder:6.7b"
   }
   ```
3. **Task Executor Parses Suggestion**: Always parsed and validated, logged for debugging
4. **Conditional Usage**: Only used if `features.pmModelSuggestions = true`
5. **Fallback to Defaults**: Invalid suggestions fall back to agent type defaults

### Enabling PM Model Suggestions

Edit `.mimir/llm-config.json`:

```json
{
  "features": {
    "pmModelSuggestions": true
  }
}
```

### Model Format

PM can suggest models in two formats:

1. **Full Format**: `provider/model`
   - Example: `ollama/deepseek-coder:6.7b`
   - Specifies both provider and model

2. **Short Format**: `model`
   - Example: `gpt-oss`
   - Uses default provider (ollama)

### Example Use Cases

**Code Generation Tasks:**
```json
{
  "id": "implement-api",
  "title": "Implement REST API endpoints",
  "recommendedModel": "ollama/deepseek-coder:6.7b"
}
```

**Complex Planning Tasks:**
```json
{
  "id": "system-architecture",
  "title": "Design system architecture",
  "recommendedModel": "ollama/gpt-oss"
}
```

**Quick Validation Tasks:**
```json
{
  "id": "lint-check",
  "title": "Run linter and fix issues",
  "recommendedModel": "ollama/tinyllama"
}
```

### Benefits

✅ **Task-Specific Optimization**: Use specialized models for specific tasks  
✅ **Cost Control**: Feature disabled by default prevents unintended model switching  
✅ **Backward Compatible**: Existing configs work without changes  
✅ **Fallback Safety**: Invalid suggestions default to configured models  
✅ **Debugging**: All suggestions logged even when feature disabled

### Limitations

⚠️ **PM Must Know Models**: PM sees available models in prompt  
⚠️ **Validation Required**: Invalid models fall back to defaults  
⚠️ **No Runtime Discovery**: Available models loaded from config at startup  
⚠️ **Feature Flag Required**: Must explicitly enable in config

## Agent-Specific Configuration

### PM Agent (Planning/Decomposition)
- **Model**: `gpt-oss` (Ollama)
- **Rationale**: Strong reasoning for task decomposition and planning
- **Context Window**: 32,768 tokens
- **Temperature**: 0.0 (deterministic)

### Worker Agent (Task Execution)
- **Model**: `gpt-oss` (Ollama)
- **Rationale**: Consistent quality for code generation and implementation
- **Context Window**: 32,768 tokens
- **Temperature**: 0.0 (deterministic)
- **PM Override**: If `pmModelSuggestions` enabled, uses task-specific model

### QC Agent (Verification)
- **Model**: `gpt-oss` (Ollama)
- **Rationale**: Strict validation with maximum consistency
- **Context Window**: 32,768 tokens
- **Temperature**: 0.0 (deterministic)

## Alternative Models

### Available in Your Ollama Instance

```bash
$ ollama list
NAME                       SIZE      CONTEXT
gpt-oss:latest            13 GB     32K     ✅ DEFAULT
tinyllama:latest          637 MB    8K      (testing only)
qwen2.5-coder:1.5b-base   986 MB    32K     (fast coding)
deepseek-coder:6.7b       3.8 GB    16K     (coding specialist)
phi:latest                1.6 GB    2K      (not recommended)
```

### To Switch Models

Edit `.mimir/llm-config.json`:

```json
{
  "agentDefaults": {
    "pm": { "model": "gpt-oss" },
    "worker": { "model": "qwen2.5-coder:1.5b-base" },  // Faster for simple tasks
    "qc": { "model": "gpt-oss" }
  }
}
```

## GitHub Copilot Fallback (Optional)

If you have GitHub Copilot Pro and want to use cloud models:

```json
{
  "defaultProvider": "copilot",
  "providers": {
    "copilot": {
      "baseUrl": "http://localhost:4141/v1",
      "defaultModel": "gpt-4o",
      ...
    }
  }
}
```

**Requirements:**
- Active GitHub Copilot subscription
- Copilot proxy running at port 4141

## RAG/Vector Embeddings (Future)

**⚠️ NOT YET IMPLEMENTED**

When the RAG/vector embedding system is added, it will use **separate configuration** from agent LLMs:

```json
{
  "vectorEmbeddings": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "dimensions": 768,
    "baseUrl": "http://localhost:11434"
  }
}
```

**Rationale for Separation:**
- **Agent LLMs**: Need reasoning, code generation, planning (larger models)
- **Embedding Models**: Need semantic similarity only (smaller, specialized models)
- **Different performance profiles**: Embeddings are fast/cheap, LLM inference is expensive
- **Independent scaling**: Can use different hardware/services for each

## Configuration File Locations

1. **Project-specific**: `.mimir/llm-config.json` (git-ignored, recommended)
2. **Environment variable**: `MIMIR_LLM_CONFIG=/path/to/config.json`
3. **Fallback**: Hardcoded defaults in `src/config/LLMConfigLoader.ts`

## Verifying Configuration

```bash
# Check loaded config
npm run test testing/config/llm-config-loader.test.ts

# View current models
ollama list

# Test specific model
ollama run gpt-oss "Hello, world!"
```

## Performance Notes

### `gpt-oss` (13B params)
- **Inference Speed**: ~2-5 tokens/sec (CPU), ~20-50 tokens/sec (GPU)
- **Memory**: ~13GB RAM (full model)
- **Context Window**: 32K tokens
- **Quality**: Good for most tasks

### When to Switch Models

**Use smaller models** (`qwen2.5-coder:1.5b-base`, `tinyllama`) if:
- ❌ Running on resource-constrained hardware
- ❌ Need faster iteration during development
- ❌ Tasks are simple (e.g., basic refactoring)

**Use larger models** (`gpt-oss`, `deepseek-coder:6.7b`) if:
- ✅ Complex reasoning required
- ✅ Quality is critical (production deploys)
- ✅ You have GPU acceleration available

## Troubleshooting

### Model Not Found
```bash
# Pull the model
ollama pull gpt-oss

# Verify it's available
ollama list | grep gpt-oss
```

### Ollama Not Running
```bash
# Start Ollama
ollama serve

# Or check if already running
curl http://localhost:11434/api/tags
```

### Out of Memory
```bash
# Use smaller model
# Edit .mimir/llm-config.json:
"defaultModel": "tinyllama"  # Only 637MB
```

---

**Last Updated**: 2025-10-18  
**Version**: 1.0.0  
**Default Model**: `gpt-oss` (Ollama)
