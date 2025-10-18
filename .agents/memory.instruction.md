---
applyTo: '**'
---

# Coding Preferences
- **TypeScript**: Strict mode enabled, ES2022 target
- **Build System**: TypeScript compiler with ES modules
- **Package Manager**: npm (package-lock.json committed)
- **Code Style**: Consistent with existing codebase patterns
- **Testing**: Vitest for unit testing, coverage reporting
- **Linting**: TypeScript ESLint parser configured

# Project Architecture
- **Type**: TypeScript MCP Server with stdio/HTTP transports
- **Core Dependencies**: @modelcontextprotocol/sdk, neo4j-driver, langchain 1.0.1
- **Database**: Neo4j graph database (persistent storage)
- **Build**: TypeScript → build/ directory (ES modules)
- **Entry Points**: 
  - MCP Server: src/index.ts → build/index.js
  - HTTP Server: src/http-server.ts → build/http-server.js
  - Global CLIs: bin/mimir-chain, bin/mimir-execute
- **Multi-Agent**: LangChain + LangGraph integration for agent orchestration
- **File Indexing**: Automatic file watching with chokidar + .gitignore support

# Solutions Repository
- **Neo4j Connection**: Use GraphManager with connection pooling and retries
- **MCP Tool Patterns**: Follow existing tool structure in src/tools/
- **Error Handling**: Always return success/error objects with structured responses
- **Zod Validation**: Use z.record(z.string(), z.any()) for object schemas (Zod 4.x)
- **Multi-Agent Locking**: Use optimistic locking patterns with timeouts
- **Context Isolation**: Use get_task_context for filtered agent context delivery
- **LangChain Migration**: Use @langchain/langgraph for agent creation (not langchain/agents)
- **Docker Issues**: Remove version field from docker-compose.yml (deprecated)
- **Global CLIs**: Use npm link for global command installation
