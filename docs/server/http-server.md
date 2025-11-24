[**mimir v1.0.0**](README.md)

***

[mimir](README.md) / http-server

# http-server

## Description

HTTP/SSE transport server for Mimir MCP

Provides HTTP transport layer for the MCP server with:
- RESTful API endpoints for MCP tools
- Server-Sent Events (SSE) for streaming
- OAuth and API key authentication
- CORS support for web clients
- File indexing management
- Multi-agent orchestration API
- Chat API for conversational interface

The server runs in shared session mode, allowing multiple agents
to access the same graph database concurrently with optimistic locking.

## Example

```typescript
// Start the HTTP server
import { startHttpServer } from './http-server.js';
await startHttpServer();
// Server running on http://localhost:9042
```
