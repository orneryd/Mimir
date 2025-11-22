# Using Mimir as an OpenAI-Compatible Model Provider

Mimir exposes an **OpenAI-compatible API endpoint** at `/v1/chat/completions`, allowing it to be used as a drop-in replacement for OpenAI in any tool that supports custom OpenAI endpoints.

## 🌟 Features

When using Mimir as a model provider, you automatically get:

- ✅ **Automatic RAG** - Every query searches your indexed codebase and documentation
- ✅ **MCP Tools** - Access to memory management, vector search, and graph operations
- ✅ **Multi-Agent Support** - Route different tasks to specialized agents
- ✅ **Streaming Responses** - Real-time SSE streaming for fast responses
- ✅ **Function Calling** - Full OpenAI function calling API support
- ✅ **Context-Aware** - Leverages your entire knowledge graph

---

## 🚀 Quick Start

### Prerequisites

1. **Mimir Server Running**
   ```bash
   docker compose up -d
   # Or: npm start
   ```

2. **Configure Server URL** (Optional)
   
   By default, Mimir runs on `http://localhost:9042`. To customize:
   
   ```bash
   # Set in .env file
   MIMIR_SERVER_URL=http://localhost:9042
   MIMIR_PORT=9042                # Primary port config (falls back to PORT if not set)
   
   # Or export as environment variable
   export MIMIR_SERVER_URL=http://localhost:9042
   export MIMIR_PORT=9042
   ```
   
   **When to customize:**
   - Running on a different port
   - Accessing remote Mimir server
   - Docker internal networking
   - Production deployment

2. **Verify Endpoint**
   ```bash
   # Using default URL
   curl http://localhost:9042/v1/chat/completions -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4o",
       "messages": [{"role": "user", "content": "Hello!"}],
       "stream": false
     }'
   
   # Or using MIMIR_SERVER_URL environment variable
   curl ${MIMIR_SERVER_URL:-http://localhost:9042}/v1/chat/completions -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4o",
       "messages": [{"role": "user", "content": "Hello!"}],
       "stream": false
     }'
   ```

---

## 🔧 Configuration by Tool

### 1. **Continue.dev** (VSCode Extension)

Continue.dev is an open-source AI coding assistant that supports custom OpenAI endpoints.

#### Installation
1. Install Continue.dev extension in VSCode
2. Open Continue settings (`Cmd+Shift+P` → "Continue: Open Config")

#### Configuration (~/.continue/config.json)

```json
{
  "models": [
    {
      "title": "Mimir (RAG-Enhanced)",
      "provider": "openai",
      "model": "gpt-4o",
      "apiBase": "${MIMIR_SERVER_URL:-http://localhost:9042}",
      "apiKey": "mimir-local-key"
    }
  ],
  "tabAutocompleteModel": {
    "title": "Mimir Autocomplete",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiBase": "http://localhost:9042",
    "apiKey": "mimir-local-key"
  }
}
```

#### Usage
- Select "Mimir (RAG-Enhanced)" from the model dropdown
- Ask questions - Mimir will automatically search your indexed codebase
- Use `/help` to see available MCP tools

---

### 2. **Cursor** (VSCode Fork)

Cursor supports custom model endpoints, but the configuration method varies by version.

#### Method A: Custom Models (Cursor Pro)

If you have Cursor Pro, you can add custom models:

1. **Open Settings**: `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)
2. **Search for**: `cursor.models`
3. **Add Custom Model**:

```json
{
  "cursor.models": {
    "customModels": [
      {
        "name": "Mimir RAG",
        "apiBase": "http://localhost:9042/v1",
        "apiKey": "mimir-local-key",
        "provider": "openai"
      }
    ]
  }
}
```

#### Method B: OpenAI Override (All Cursor Versions)

Override Cursor's OpenAI endpoint to route all requests through Mimir:

```json
{
  "openai.baseUrl": "http://localhost:9042/v1",
  "openai.apiKey": "mimir-local-key"
}
```

**⚠️ Warning**: This routes ALL Cursor AI requests through Mimir, including autocomplete.

#### Method C: Proxy Configuration

Set up a proxy that routes specific models to Mimir:

```json
{
  "cursor.modelProxy": {
    "enabled": true,
    "url": "http://localhost:9042/v1",
    "models": ["gpt-4o-mimir", "gpt-4-turbo-mimir"]
  }
}
```

---

### 3. **Aider** (Terminal-based AI Coding)

[Aider](https://aider.chat/) is a CLI tool for AI pair programming.

```bash
# Set environment variables
export MIMIR_SERVER_URL=http://localhost:9042  # Optional: customize server URL
export OPENAI_API_BASE=${MIMIR_SERVER_URL:-http://localhost:9042}/v1
export OPENAI_API_KEY=mimir-local-key

# Run aider with Mimir
aider --model gpt-4o

# Or specify directly
aider --model gpt-4o --openai-api-base ${MIMIR_SERVER_URL:-http://localhost:9042}/v1
```

---

### 4. **OpenAI Python Client**

Use Mimir with the official OpenAI Python SDK:

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url=f"{os.getenv('MIMIR_SERVER_URL', 'http://localhost:9042')}/v1",
    api_key="mimir-local-key"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "Explain the authentication flow in my codebase"}
    ],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="")
```

---

### 5. **OpenAI Node.js Client**

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: `${process.env.MIMIR_SERVER_URL || 'http://localhost:9042'}/v1`,
  apiKey: 'mimir-local-key'
});

const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What does the FileIndexer class do?' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

---

### 6. **LangChain**

```python
from langchain_openai import ChatOpenAI
import os

llm = ChatOpenAI(
    base_url=f"{os.getenv('MIMIR_SERVER_URL', 'http://localhost:9042')}/v1",
    api_key="mimir-local-key",
    model="gpt-4o",
    streaming=True
)

response = llm.invoke("How does the vector search work?")
print(response.content)
```

---

## 🎯 Mimir-Specific Features

### RAG Configuration

Mimir automatically performs semantic search on your indexed codebase. Control this behavior:

```json
{
  "model": "gpt-4o",
  "messages": [...],
  "semantic_search_enabled": true,    // Enable/disable RAG (default: true)
  "semantic_search_limit": 10,        // Number of results (default: 10)
  "min_similarity_threshold": 0.75    // Similarity cutoff (default: 0.75)
}
```

### MCP Tools

Mimir exposes MCP tools as OpenAI function calls:

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Search my memories for database decisions"}],
    enable_tools=True,  # Enable MCP tools (default: true)
    max_tool_calls=3    # Limit recursive tool calls
)
```

**Available Tools:**
- `memory_node` - Create/query memory nodes
- `memory_edge` - Create relationships
- `vector_search_nodes` - Semantic search across all nodes
- `todo` - Task management
- `get_task_context` - Agent-scoped context

### Agent Selection

Route to specific agents using the `model` parameter:

```json
{
  "model": "architect",  // Uses the "architect" agent preamble
  "messages": [...]
}
```

If the model doesn't exist as an agent, Mimir uses it as the LLM model name.

---

## ⚙️ Mimir Configuration

Configure Mimir's backend LLM via environment variables:

```bash
# Use GitHub Copilot API
MIMIR_DEFAULT_PROVIDER=openai
MIMIR_LLM_API=http://copilot-api:4141
MIMIR_DEFAULT_MODEL=gpt-4o
MIMIR_LLM_API_KEY=your-copilot-token

# Use local Ollama
MIMIR_DEFAULT_PROVIDER=ollama
MIMIR_LLM_API=http://localhost:11434
MIMIR_DEFAULT_MODEL=qwen2.5-coder:32b

# Use actual OpenAI
MIMIR_DEFAULT_PROVIDER=openai
MIMIR_LLM_API=https://api.openai.com
MIMIR_DEFAULT_MODEL=gpt-4-turbo
MIMIR_LLM_API_KEY=sk-...
```

---

## 🧪 Testing

### Test Basic Completion

```bash
curl http://localhost:9042/v1/chat/completions -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "What is Mimir?"}
    ],
    "stream": false
  }'
```

### Test Streaming

```bash
curl http://localhost:9042/v1/chat/completions -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Explain the FileIndexer class"}
    ],
    "stream": true
  }'
```

### Test RAG

```bash
curl http://localhost:9042/v1/chat/completions -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "How does authentication work in this codebase?"}
    ],
    "semantic_search_enabled": true,
    "semantic_search_limit": 5,
    "stream": false
  }'
```

---

## 🔒 Security Considerations

### Local Development

For local use, the API key can be any string (Mimir doesn't validate it yet):

```json
{
  "apiKey": "mimir-local-key"
}
```

### Production Deployment

If exposing Mimir publicly, add authentication:

```typescript
// src/api/chat-api.ts
router.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const validKey = process.env.MIMIR_API_KEY || 'mimir-default-key';
  
  if (!authHeader || authHeader !== `Bearer ${validKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
});
```

Then set `MIMIR_API_KEY=your-secure-key` in your environment.

---

## 🐛 Troubleshooting

### Connection Refused

**Problem**: `ECONNREFUSED` when connecting to Mimir

**Solution**:
```bash
# Check Mimir is running
docker compose ps

# Check port is accessible
curl http://localhost:9042/health

# Check firewall/network settings
```

### No RAG Results

**Problem**: Mimir isn't searching indexed files

**Solution**:
1. **Verify indexing**: Open Code Intelligence view in VSCode/Cursor
2. **Check embeddings**: Ensure files have embeddings generated
3. **Test vector search**: Use Node Manager to search manually

### Model Not Found

**Problem**: `Model 'xyz' not found`

**Solution**:
```bash
# Check available models in Ollama
docker exec -it mimir-ollama ollama list

# Or check your OpenAI/Copilot API
curl http://copilot-api:4141/v1/models
```

### Rate Limiting

**Problem**: Too many requests

**Solution**: Configure rate limits in `docker-compose.yml`:

```yaml
environment:
  MIMIR_RATE_LIMIT_ENABLED: "true"
  MIMIR_RATE_LIMIT_MAX: "100"
  MIMIR_RATE_LIMIT_WINDOW_MS: "60000"
```

---

## 📚 Additional Resources

- **Mimir Documentation**: `/docs/`
- **OpenAI API Spec**: https://platform.openai.com/docs/api-reference
- **Continue.dev Docs**: https://continue.dev/docs
- **Cursor Docs**: https://cursor.sh/docs
- **MCP Tools Reference**: `/docs/guides/MCP_TOOLS.md`

---

## 🎉 Example Workflows

### Code Review Assistant

```bash
# Configure Continue.dev with Mimir
# Ask: "Review the authentication changes in my latest commit"
# Mimir will:
# 1. Search for authentication-related code
# 2. Analyze the changes
# 3. Provide security recommendations
```

### Architecture Explorer

```bash
# Ask: "Explain the data flow from API to database"
# Mimir will:
# 1. Search for API routes, services, and database models
# 2. Trace connections through the codebase
# 3. Provide a comprehensive explanation
```

### Documentation Generator

```bash
# Ask: "Generate API documentation for the chat endpoints"
# Mimir will:
# 1. Find all chat-related routes
# 2. Extract parameters, responses, and examples
# 3. Generate formatted documentation
```

---

## 🤝 Contributing

Found a tool that works with Mimir? Add it to this guide! Submit a PR or open an issue.

**Tested Tools:**
- ✅ Continue.dev
- ✅ OpenAI Python/Node SDKs
- ✅ LangChain
- ✅ Aider
- ⏳ Cursor (needs testing)
- ⏳ Cody (needs testing)
- ⏳ Tabnine (needs testing)

---

**Last Updated**: 2025-11-20
