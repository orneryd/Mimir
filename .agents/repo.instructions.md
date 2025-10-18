---
applyTo: '**'
---

# Mimir Repository Instructions

## Overview
This is **Mimir v1.0.0** - a production-ready MCP server providing Graph-RAG TODO tracking with multi-agent orchestration capabilities. The system combines hierarchical task management with associative memory networks, backed by Neo4j for persistent storage.

## Current Implementation Status

### ✅ COMPLETED Features
- **Neo4j Graph Database**: Persistent storage with full CRUD operations
- **26 MCP Tools**: 22 graph operations + 4 file indexing tools
- **Multi-Agent Locking**: Optimistic locking for concurrent execution  
- **Context Isolation**: 90%+ context reduction for worker agents
- **File Indexing**: Automatic file watching with .gitignore support
- **Global CLI Tools**: npm-linked binaries (mimir, mimir-chain, mimir-execute)
- **Docker Deployment**: Production containerization
- **LangChain 1.0.1**: Updated to latest LangChain with LangGraph

### 🔄 IN PROGRESS
- Documentation alignment with current implementation
- Migration cleanup from old repository structure
## Key Architecture Decisions

### Database
- **Neo4j**: Primary graph database for persistent storage
- **No in-memory fallback**: All data persists in Neo4j
- **ACID Compliance**: Atomic transactions for data integrity

### Multi-Agent System
- **PM Agents**: Full context research and planning
- **Worker Agents**: Ephemeral execution with filtered context
- **QC Agents**: Adversarial validation and quality control
- **Optimistic Locking**: Race condition prevention
- **Context Filtering**: Agent-specific context delivery

### Technology Stack
- **TypeScript**: ES2022 with strict mode
- **MCP Protocol**: Both stdio and HTTP transports
- **LangChain 1.0.1**: With LangGraph for agent orchestration
- **Docker**: Production containerization
- **Vitest**: Testing framework

## Important Files

### Core Implementation
- `src/index.ts` - Main MCP server entry point
- `src/managers/GraphManager.ts` - Neo4j operations
- `src/managers/ContextManager.ts` - Multi-agent context filtering
- `src/tools/` - MCP tool definitions (26 total)
- `src/orchestrator/` - Multi-agent orchestration system

### Configuration
- `package.json` - ES modules, global binaries configured
- `docker-compose.yml` - Neo4j + optional MCP server
- `tsconfig.json` - ES2022 with ESNext module system
- `.env.example` - Environment configuration template

### Documentation
- `AGENTS.md` - AI agent instructions and workflows
- `README.md` - Project overview and setup
- `docs/` - Comprehensive architecture documentation

## Development Workflow

### Setup
```bash
npm install && npm run build
docker-compose up -d  # Start Neo4j
npm start  # Start MCP server
```

### Global Commands
```bash
npm link  # Install global commands
mimir-chain "Your request here"
mimir-execute output.md
```

### Common Tasks
- **Add MCP Tool**: Create in `src/tools/`, add to index
- **Database Schema**: Modify `src/managers/GraphManager.ts`
- **Multi-Agent**: Update `src/orchestrator/` components
- **Documentation**: Update `AGENTS.md` and `README.md`

## Migration Notes

### From Previous Version
- Migrated from in-memory graphology to persistent Neo4j
- Updated from LangChain 0.3.x to 1.0.1 (major breaking changes)
- Added multi-agent orchestration capabilities
- Implemented optimistic locking and context isolation
- Added file indexing system with automatic watching

### Breaking Changes Resolved
- `AgentExecutor` → `createReactAgent` from `@langchain/langgraph`
- `z.record(z.any())` → `z.record(z.string(), z.any())` for Zod 4.x
- Module system updated to ES modules with proper shebang lines
- Docker Compose version field removed (deprecated)

## Best Practices

### Code Organization
- Follow existing patterns in `src/tools/` for new MCP tools
- Use GraphManager for all database operations
- Implement proper error handling with structured responses
- Add TypeScript types for new features

### Multi-Agent Development
- Use optimistic locking for concurrent access
- Implement context filtering for worker agents
- Store all task context in graph nodes
- Follow PM → Worker → QC validation flow

### Testing
- Add tests for new MCP tools in `tests/`
- Test both success and error cases
- Verify Neo4j integration works correctly
- Test multi-agent locking scenarios

## Common Issues & Solutions

### Neo4j Connection
- Ensure Docker container is running: `docker-compose up -d`
- Check connection string: `bolt://localhost:7687`
- Verify credentials: neo4j/password (default)

### LangChain Issues
- Use `@langchain/langgraph` for agent creation
- Import from correct modules (see migration notes)
- Check LangChain version compatibility

### Docker Issues
- Remove `version:` field from docker-compose.yml
- Stop conflicting containers: `docker stop container_name`
- Clean up: `docker system prune`

### Build Issues
- Ensure TypeScript compiles: `npm run build`
- Check ES module configuration in package.json
- Verify shebang lines in entry points
