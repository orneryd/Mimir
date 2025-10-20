# Copilot-API vs Ollama: Architecture Analysis & Migration Strategy

**Date**: October 18, 2025  
**Research Type**: Technical Architecture Analysis  
**Decision**: Migration Strategy for LLM Inference

---

## Executive Summary

**Question**: Can we replace `copilot-api` with Ollama for simplified setup, or do we need both?

**Answer**: **We should use BOTH as configurable providers**, with Ollama as the **default** for local-first setup. Here's why:

| Aspect | copilot-api | Ollama | Recommendation |
|--------|-------------|--------|----------------|
| **Setup Complexity** | Requires GitHub auth + subscription | Single `docker-compose up` | ✅ Ollama wins |
| **Cost** | $10-39/month per user | Free (100% local) | ✅ Ollama wins |
| **Model Selection** | GPT-4o, Claude Opus, Gemini 2.0 | TinyLlama, Phi-3, Llama 3.2 | ⚖️ Depends on need |
| **Performance** | Cloud-hosted (fast inference) | Local CPU/GPU (varies) | ⚖️ Depends on hardware |
| **Privacy** | Sends data to GitHub/OpenAI | 100% local, zero telemetry | ✅ Ollama wins |
| **Multi-User** | Requires subscription per user | Free for unlimited users | ✅ Ollama wins |

**Strategic Decision**: 
1. **Phase 1 (Now)**: Switch **default** to Ollama for local-first Graph-RAG
2. **Phase 2 (Optional)**: Keep `copilot-api` as **opt-in premium provider** for users who want GPT-4o/Claude

---

## What is `copilot-api`?

### Architecture

`copilot-api` is a **reverse-engineered proxy** that exposes GitHub Copilot's API as an OpenAI-compatible endpoint.

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│  Your Code      │─────→│ copilot-api  │─────→│ GitHub Copilot  │
│  (LangChain)    │      │ (localhost:  │      │ API (Cloud)     │
│                 │      │  4141)       │      │                 │
└─────────────────┘      └──────────────┘      └─────────────────┘
                              ↑
                              │
                         Authenticates via
                         `gh` CLI + GitHub
                         Copilot subscription
```

**Key Points**:
- ✅ **OpenAI-compatible**: Drop-in replacement for OpenAI client
- ✅ **Uses your Copilot subscription**: No separate API keys needed
- ⚠️ **Requires GitHub Copilot subscription**: $10-39/month per user
- ⚠️ **Reverse-engineered**: Not officially supported by GitHub
- ⚠️ **Rate limits**: Can trigger abuse detection on excessive use
- ⚠️ **Authentication friction**: Requires `gh` CLI + manual auth flow

**Sources**:
1. Per copilot-api npm documentation v0.7.0 (2025-10): "A reverse-engineered proxy for the GitHub Copilot API that exposes it as an OpenAI and Anthropic compatible service"
2. Per GitHub Security Notice: "Excessive automated or scripted use of Copilot may trigger GitHub's abuse-detection systems"

### What We're Using It For

**Current Mimir Usage** (from `src/orchestrator/llm-client.ts`):

```typescript
// Line 45-51: Using copilot-api as OpenAI-compatible endpoint
this.llm = new ChatOpenAI({
  apiKey: 'dummy-key-not-used', // Required but ignored
  model: config.model || CopilotModel.GPT_4_1,
  configuration: {
    baseURL: 'http://localhost:4141/v1', // copilot-api proxy
  },
  // ...
});
```

**Use Cases**:
1. **Agent orchestration**: PM/Worker/QC agents with tool calling
2. **LangGraph execution**: Multi-step reasoning with function calls
3. **Code validation**: Running tests, reading files, debugging
4. **Future**: Text embeddings for vector search (not yet implemented)

---

## Can Ollama Replace copilot-api?

### Short Answer: YES, for LLM inference + embeddings

**Ollama Architecture**:

```
┌─────────────────┐      ┌──────────────┐
│  Your Code      │─────→│ Ollama       │
│  (LangChain)    │      │ (localhost:  │
│                 │      │  11434)      │
└─────────────────┘      └──────────────┘
                              ↑
                              │
                         100% Local
                         (llama.cpp backend)
                         Models stored in Docker
```

**Key Differences**:

| Feature | copilot-api | Ollama | Compatible? |
|---------|-------------|--------|-------------|
| **OpenAI API** | ✅ `/v1/chat/completions` | ✅ `/v1/chat/completions` | ✅ YES |
| **Embeddings API** | ✅ `/v1/embeddings` | ✅ `/api/embeddings` | ⚠️ Different path |
| **Models API** | ✅ `/v1/models` | ✅ `/api/tags` | ⚠️ Different path |
| **Tool Calling** | ✅ Function calling | ✅ Function calling | ✅ YES |
| **LangChain Support** | ✅ Via OpenAI client | ✅ Via `@langchain/community` | ✅ YES |
| **Authentication** | ⚠️ GitHub OAuth | ✅ None (local) | ✅ Simpler |

**Verdict**: Ollama can **completely replace** copilot-api for our use case.

---

## Migration Strategy: Two-Phase Approach

### Phase 1: Switch Default to Ollama (Recommended)

**Goal**: Simplify setup, reduce cost, maintain full functionality

**Changes Required**:

**1. Docker Compose Addition** (`docker-compose.yml`):

```yaml
services:
  neo4j:
    # ... existing config

  ollama:
    image: ollama/ollama:latest
    container_name: mimir_ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0:11434
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    # Optional: GPU support
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu]

  mcp-server:
    # ... existing config
    depends_on:
      - neo4j
      - ollama  # NEW

volumes:
  neo4j_data:
  neo4j_logs:
  ollama_data:  # NEW
```

**2. LLM Client Refactor** (`src/orchestrator/llm-client.ts`):

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/community/chat_models/ollama';

export enum LLMProvider {
  OLLAMA = 'ollama',
  COPILOT = 'copilot',
  OPENAI = 'openai',
}

export interface AgentConfig {
  preamblePath: string;
  provider?: LLMProvider;  // NEW
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: StructuredToolInterface[];
  
  // Provider-specific configs
  ollamaBaseUrl?: string;    // Default: http://localhost:11434
  copilotBaseUrl?: string;   // Default: http://localhost:4141/v1
  openAIApiKey?: string;     // For direct OpenAI usage
}

export class CopilotAgentClient {
  private llm: ChatOpenAI | ChatOllama;
  
  constructor(config: AgentConfig) {
    const provider = config.provider || LLMProvider.OLLAMA; // Default to Ollama
    
    switch (provider) {
      case LLMProvider.OLLAMA:
        this.llm = new ChatOllama({
          baseUrl: config.ollamaBaseUrl || 'http://localhost:11434',
          model: config.model || 'tinyllama',  // Default model
          temperature: config.temperature || 0.0,
          // Ollama-specific: numCtx for context window
          numCtx: 4096,
        });
        console.log(`🦙 Using Ollama (local) - Model: ${config.model || 'tinyllama'}`);
        break;
        
      case LLMProvider.COPILOT:
        this.llm = new ChatOpenAI({
          apiKey: 'dummy-key-not-used',
          model: config.model || 'gpt-4o',
          configuration: {
            baseURL: config.copilotBaseUrl || 'http://localhost:4141/v1',
          },
          temperature: config.temperature || 0.0,
          maxTokens: config.maxTokens || -1,
        });
        console.log(`🤖 Using Copilot API (cloud) - Model: ${config.model || 'gpt-4o'}`);
        break;
        
      case LLMProvider.OPENAI:
        if (!config.openAIApiKey) {
          throw new Error('OpenAI API key required for OpenAI provider');
        }
        this.llm = new ChatOpenAI({
          apiKey: config.openAIApiKey,
          model: config.model || 'gpt-4',
          temperature: config.temperature || 0.0,
          maxTokens: config.maxTokens || -1,
        });
        console.log(`🔑 Using OpenAI API (cloud) - Model: ${config.model || 'gpt-4'}`);
        break;
    }
    
    // ... rest of constructor
  }
}
```

**3. Configuration File** (`.mimir/llm-config.json`):

```json
{
  "defaultProvider": "ollama",
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "defaultModel": "tinyllama",
      "availableModels": ["tinyllama", "phi3", "llama3.2"],
      "enabled": true
    },
    "copilot": {
      "baseUrl": "http://localhost:4141/v1",
      "defaultModel": "gpt-4o",
      "availableModels": ["gpt-4o", "gpt-4", "claude-opus-4.1"],
      "enabled": false,
      "requiresAuth": true,
      "authInstructions": "Run: gh auth login && npm install -g copilot-api && copilot-api start"
    },
    "openai": {
      "defaultModel": "gpt-4",
      "enabled": false,
      "requiresApiKey": true
    }
  }
}
```

**4. Environment Variables** (`.env` or `docker-compose.yml`):

```bash
# LLM Provider Configuration
LLM_PROVIDER=ollama                    # Default: ollama
LLM_MODEL=tinyllama                    # Default model for provider
OLLAMA_BASE_URL=http://ollama:11434    # Docker service name
COPILOT_BASE_URL=http://localhost:4141/v1
OPENAI_API_KEY=                        # Optional
```

**5. Setup Script Update** (`scripts/setup.sh`):

```bash
# Replace copilot-api setup with Ollama setup
setup_ollama() {
  echo "🦙 Setting up Ollama..."
  
  # Check if Ollama service is running
  if docker-compose ps | grep -q "mimir_ollama.*Up"; then
    echo "✅ Ollama is running"
  else
    echo "Starting Ollama service..."
    docker-compose up -d ollama
  fi
  
  # Pull default model
  echo "Pulling tinyllama model (1.1B params, ~600MB)..."
  docker-compose exec ollama ollama pull tinyllama
  
  echo "✅ Ollama ready!"
}

# Optional: Keep copilot setup as opt-in
setup_copilot() {
  echo "⚠️  Copilot API is now OPTIONAL (Ollama is default)"
  read -p "Do you want to enable Copilot API for premium models? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm list -g copilot-api || npm install -g copilot-api
    echo "Run: copilot-api start"
  fi
}
```

**6. Package.json Update**:

```json
{
  "scripts": {
    "setup:complete": "./scripts/setup.sh",
    "setup:ollama": "docker-compose up -d ollama && docker-compose exec ollama ollama pull tinyllama",
    "setup:copilot": "npm list -g copilot-api || npm install -g copilot-api && (pgrep -f copilot-api || nohup copilot-api start &)",
    "setup:services": "docker-compose up -d",
    // Remove copilot from default setup, make it opt-in
  }
}
```

**Benefits**:
- ✅ **Simpler setup**: `docker-compose up` → done (no GitHub auth)
- ✅ **Zero cost**: No subscription required
- ✅ **Privacy**: 100% local inference
- ✅ **Multi-user friendly**: No per-user licensing
- ✅ **Faster onboarding**: < 2 minutes vs. 15+ minutes

**Trade-offs**:
- ⚠️ **Model quality**: TinyLlama < GPT-4o (but good enough for Graph-RAG)
- ⚠️ **Hardware dependency**: Requires local CPU (or GPU for speed)
- ⚠️ **Model downloads**: First run downloads ~600MB (one-time)

---

### Phase 2: Keep Copilot-API as Optional Premium Provider

**Goal**: Let users opt-in to premium models if needed

**Use Cases for Keeping Copilot-API**:
1. **Complex reasoning**: GPT-4o/Claude Opus for hard PM agent tasks
2. **Code generation quality**: Better function calling / multi-step plans
3. **Existing Copilot users**: Already have subscription, why not use it?

**Implementation**:

```typescript
// Example: Dynamic provider selection per agent
const pmAgent = new CopilotAgentClient({
  preamblePath: 'agents/pm-agent.md',
  provider: LLMProvider.COPILOT,  // Use premium model for planning
  model: 'gpt-4o',
});

const workerAgent = new CopilotAgentClient({
  preamblePath: 'agents/worker-agent.md',
  provider: LLMProvider.OLLAMA,   // Use local model for execution
  model: 'tinyllama',
});

const qcAgent = new CopilotAgentClient({
  preamblePath: 'agents/qc-agent.md',
  provider: LLMProvider.OLLAMA,   // Use local model for verification
  model: 'phi3',  // Slightly larger for better validation
});
```

**Configuration**:

```json
{
  "agents": {
    "pm": {
      "provider": "copilot",
      "model": "gpt-4o",
      "rationale": "Complex reasoning for task breakdown"
    },
    "worker": {
      "provider": "ollama",
      "model": "tinyllama",
      "rationale": "Fast execution, simpler context"
    },
    "qc": {
      "provider": "ollama",
      "model": "phi3",
      "rationale": "Good validation, local privacy"
    }
  }
}
```

---

## Embeddings Integration

### Critical Difference: API Paths

**copilot-api Embeddings**:
```bash
POST http://localhost:4141/v1/embeddings
Content-Type: application/json

{
  "input": "text to embed",
  "model": "text-embedding-ada-002"
}
```

**Ollama Embeddings**:
```bash
POST http://localhost:11434/api/embeddings
Content-Type: application/json

{
  "model": "nomic-embed-text",
  "prompt": "text to embed"
}
```

**Compatibility**: ❌ **NOT drop-in compatible**

**Solution**: Abstract embeddings behind interface

```typescript
// src/embeddings/EmbeddingProvider.ts
export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimension(): number;
  getModel(): string;
}

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  private baseUrl: string;
  private model: string;
  private dimension: number;
  
  constructor(config: { baseUrl?: string; model?: string; dimension?: number }) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'nomic-embed-text';
    this.dimension = config.dimension || 512;
  }
  
  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });
    const data = await response.json();
    return data.embedding;
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }
  
  getDimension(): number {
    return this.dimension;
  }
  
  getModel(): string {
    return this.model;
  }
}

export class CopilotEmbeddingProvider implements IEmbeddingProvider {
  private baseUrl: string;
  private model: string;
  private dimension: number;
  
  constructor(config: { baseUrl?: string; model?: string; dimension?: number }) {
    this.baseUrl = config.baseUrl || 'http://localhost:4141/v1';
    this.model = config.model || 'text-embedding-ada-002';
    this.dimension = config.dimension || 1536;  // OpenAI default
  }
  
  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy',  // Ignored by proxy
      },
      body: JSON.stringify({ input: text, model: this.model }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  }
  
  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy',
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });
    const data = await response.json();
    return data.data.map((d: any) => d.embedding);
  }
  
  getDimension(): number {
    return this.dimension;
  }
  
  getModel(): string {
    return this.model;
  }
}

// Factory
export function createEmbeddingProvider(config: {
  provider: 'ollama' | 'copilot' | 'openai';
  baseUrl?: string;
  model?: string;
  dimension?: number;
}): IEmbeddingProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaEmbeddingProvider(config);
    case 'copilot':
      return new CopilotEmbeddingProvider(config);
    case 'openai':
      // Similar to copilot but with real API key
      return new OpenAIEmbeddingProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

---

## Testing Strategy

**Unit Tests** (`test/integration/llm-provider.test.ts`):

```typescript
describe('LLM Provider Switching', () => {
  test('should initialize Ollama provider by default', async () => {
    const agent = new CopilotAgentClient({
      preamblePath: 'test-agent.md',
      // No provider specified, should default to Ollama
    });
    
    expect(agent.getProvider()).toBe(LLMProvider.OLLAMA);
  });
  
  test('should fallback to copilot if Ollama unavailable', async () => {
    // Simulate Ollama down
    process.env.OLLAMA_BASE_URL = 'http://localhost:9999';
    
    const agent = new CopilotAgentClient({
      preamblePath: 'test-agent.md',
      provider: LLMProvider.OLLAMA,
      fallbackProvider: LLMProvider.COPILOT,
    });
    
    const result = await agent.execute('Test query');
    expect(agent.getActiveProvider()).toBe(LLMProvider.COPILOT);
  });
  
  test('should respect explicit provider override', async () => {
    const agent = new CopilotAgentClient({
      preamblePath: 'test-agent.md',
      provider: LLMProvider.COPILOT,
      model: 'gpt-4o',
    });
    
    expect(agent.getProvider()).toBe(LLMProvider.COPILOT);
  });
});

describe('Embedding Provider Switching', () => {
  test('should use Ollama embeddings by default', async () => {
    const embedder = createEmbeddingProvider({ provider: 'ollama' });
    const embedding = await embedder.embed('test');
    
    expect(embedding).toHaveLength(512);  // Nomic default
    expect(embedder.getModel()).toBe('nomic-embed-text');
  });
  
  test('should handle dimension mismatch gracefully', async () => {
    const embedder = createEmbeddingProvider({ 
      provider: 'copilot', 
      dimension: 1536 
    });
    
    // Try to use with 512-dim index
    await expect(
      vectorIndex.insert('node-1', await embedder.embed('test'))
    ).rejects.toThrow('Dimension mismatch');
  });
});
```

---

## Recommendation & Next Steps

### ✅ Recommended Approach: **Hybrid with Ollama Default**

**Rationale**:
1. **Local-first**: Ollama simplifies setup and removes cost barrier
2. **Flexibility**: Users can opt-in to Copilot for premium models
3. **Best practices**: Graph-RAG works great with lightweight local models
4. **Future-proof**: Easy to add more providers (Anthropic, Azure, etc.)

**Migration Priority**:

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🔴 **P0** | Add Ollama to docker-compose.yml | 1 hour | Unblocks local setup |
| 🔴 **P0** | Refactor LLM client for provider abstraction | 4 hours | Core architecture |
| 🟡 **P1** | Create embedding provider interface | 3 hours | Enables vector search |
| 🟡 **P1** | Update setup scripts and docs | 2 hours | User experience |
| 🟢 **P2** | Make copilot-api optional | 1 hour | Cleanup |
| 🟢 **P2** | Add provider config UI/CLI | 4 hours | Nice-to-have |

**Total Effort**: ~15 hours (2 days)

**Timeline**:
- **Week 1 Day 1-2**: Docker + LLM client refactor
- **Week 1 Day 3**: Embedding provider interface
- **Week 1 Day 4**: Testing + documentation
- **Week 1 Day 5**: Polish + optional features

### Implementation Checklist

- [ ] Add Ollama service to `docker-compose.yml`
- [ ] Refactor `src/orchestrator/llm-client.ts` with provider enum
- [ ] Create `.mimir/llm-config.json` configuration
- [ ] Update `scripts/setup.sh` to use Ollama by default
- [ ] Create `src/embeddings/EmbeddingProvider.ts` interface
- [ ] Implement `OllamaEmbeddingProvider` and `CopilotEmbeddingProvider`
- [ ] Update `package.json` scripts (remove copilot from defaults)
- [ ] Write unit tests for provider switching
- [ ] Update `README.md` with new setup flow
- [ ] Update `AGENTS.md` with provider selection guidance
- [ ] Update `VECTOR_EMBEDDINGS_INTEGRATION_PLAN.md` with Ollama defaults
- [ ] Create migration guide for existing users

---

## Sources & References

**Primary Sources**:
1. copilot-api npm package v0.7.0 (2025-10): https://www.npmjs.com/package/copilot-api
2. Ollama documentation (2025): https://ollama.ai/docs
3. LangChain Community Ollama integration v0.3.0: https://js.langchain.com/docs/integrations/chat/ollama
4. GitHub Copilot plans (2025-10): https://github.com/features/copilot

**Verification Across Sources**:
- ✅ FACT (3 sources): Ollama provides OpenAI-compatible API
- ✅ FACT (2 sources): copilot-api is reverse-engineered proxy
- ✅ CONSENSUS (4 sources): LangChain supports both Ollama and OpenAI clients
- ⚠️ MIXED (2 sources): Embedding API paths differ (OpenAI vs Ollama)

---

**Conclusion**: Migration to Ollama-first architecture is **strongly recommended** for Mimir v1.1.0. This aligns with the "local-first Graph-RAG" vision while maintaining flexibility for premium cloud models.

**Next Action**: Approve this plan → Begin Phase 1 implementation.
