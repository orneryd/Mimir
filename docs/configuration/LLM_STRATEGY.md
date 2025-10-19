# LLM Configuration Strategy

## Current Configuration (Updated: October 18, 2025)

### Agent LLMs: Copilot GPT-4.1 (Cloud)

All agents now use **GPT-4.1 via GitHub Copilot** for superior reasoning and task execution:

- **PM Agent**: GPT-4.1 for research, planning, and task decomposition
- **Worker Agent**: GPT-4.1 for high-quality task execution
- **QC Agent**: GPT-4.1 for strict validation and consistency

**Why GPT-4.1:**
- ✅ Superior reasoning capabilities
- ✅ Excellent tool calling and function execution
- ✅ 128K context window
- ✅ Fast response times (cloud infrastructure)
- ✅ Consistent, reliable output

### Embeddings: Ollama nomic-embed-text (Local)

Vector embeddings for RAG search and file indexing use **local Ollama models**:

- **Model**: `nomic-embed-text` (137M params, 768 dimensions)
- **Use Cases**: 
  - File content indexing
  - Semantic search
  - Document similarity
  - RAG retrieval

**Why Local Embeddings:**
- ✅ **Privacy**: File content stays local
- ✅ **Cost**: No API costs for embeddings
- ✅ **Speed**: Local inference is fast for small embedding models
- ✅ **Offline**: Works without internet connection

## Configuration File

Location: `.mimir/llm-config.json`

```json
{
  "defaultProvider": "copilot",
  "agentDefaults": {
    "pm": {
      "provider": "copilot",
      "model": "gpt-4.1"
    },
    "worker": {
      "provider": "copilot",
      "model": "gpt-4.1"
    },
    "qc": {
      "provider": "copilot",
      "model": "gpt-4.1"
    },
    "embeddings": {
      "provider": "ollama",
      "model": "nomic-embed-text"
    }
  }
}
```

## Future RAG Implementation

When implementing vector embeddings and RAG search:

1. **Use `agentDefaults.embeddings`** configuration
2. **Model**: `nomic-embed-text` via Ollama
3. **Pull model**: `ollama pull nomic-embed-text`
4. **Integration**: File indexing system will use local embeddings

## Switching Back to Ollama (If Needed)

To switch agents back to local Ollama models:

```json
{
  "defaultProvider": "ollama",
  "agentDefaults": {
    "pm": {
      "provider": "ollama",
      "model": "qwen3:8b"
    },
    "worker": {
      "provider": "ollama",
      "model": "qwen2.5-coder:1.5b-base"
    },
    "qc": {
      "provider": "ollama",
      "model": "qwen3:8b"
    }
  }
}
```

**Note**: Requires 16GB RAM allocated to Docker for qwen3:8b model.

## Prerequisites

### For Copilot (Current Setup)

1. **GitHub Copilot Subscription**: Active subscription required
2. **GitHub CLI Auth**: `gh auth login`
3. **Copilot API Proxy**: Running on `http://localhost:4141/v1`

### For Ollama Embeddings (Next Project)

1. **Docker Allocated RAM**: 16GB recommended
2. **Pull Embedding Model**: `docker exec ollama_server ollama pull nomic-embed-text`
3. **Verify**: `docker exec ollama_server ollama list`

## Testing Configuration

```bash
# Test with current config (Copilot)
npm run chain "test simple task"

# Check config is loaded correctly
grep -A 10 "agentDefaults" .mimir/llm-config.json
```

## Benefits of Hybrid Approach

| Component | Provider | Benefit |
|-----------|----------|---------|
| **Agent Reasoning** | Copilot GPT-4.1 | Best-in-class performance, fast cloud inference |
| **Vector Embeddings** | Ollama Local | Privacy, no API costs, offline capability |

This hybrid approach provides:
- 🎯 **Best Performance**: Cloud LLMs for complex reasoning
- 🔒 **Privacy**: Local embeddings keep file content private
- 💰 **Cost Efficiency**: Embeddings are free (local), pay only for agent inference
- 🚀 **Speed**: Fast cloud LLMs + fast local embeddings

---

**Next Steps:**
1. ✅ Configuration updated to use Copilot GPT-4.1
2. 🔄 Test agent chain with new configuration
3. 📋 Next project: Implement RAG with local embeddings (`nomic-embed-text`)
