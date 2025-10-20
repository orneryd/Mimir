// ============================================================================
// MCP HTTP Server
// Provides HTTP transport for the MCP server with unified GraphManager
// ============================================================================

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { server, initializeGraphManager, allTools } from './index.js';

// ============================================================================
// HTTP Server - Shared Session Mode
// ============================================================================

// Global shared transport for all agents - no session isolation
let sharedTransport: any | null = null;
let isSessionInitialized = false;
const SHARED_SESSION_ID = 'shared-global-session';

async function startHttpServer() {
  console.error("🚀 Graph-RAG MCP HTTP Server v4.1 starting...");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("🌐 MODE: Shared Global Session (multi-agent)");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Initialize GraphManager
  try {
    const graphManager = await initializeGraphManager();
    const stats = await graphManager.getStats();
    console.log(`✅ Connected to Neo4j`);
    console.log(`   Nodes: ${stats.nodeCount}`);
    console.log(`   Edges: ${stats.edgeCount}`);
    console.log(`   Types: ${JSON.stringify(stats.types)}`);
  } catch (error: any) {
    console.error(`❌ Failed to initialize GraphManager: ${error.message}`);
    process.exit(1);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📊 ${allTools.length} tools available (globally accessible)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const app = express();
  
  // Add error handler for JSON parsing failures
  app.use(bodyParser.json({ 
    limit: '1mb',
    verify: (req: any, res, buf, encoding) => {
      try {
        const enc = (encoding as BufferEncoding) || 'utf8';
        JSON.parse(buf.toString(enc));
      } catch (e: any) {
        const enc = (encoding as BufferEncoding) || 'utf8';
        console.error('❌ JSON parse error:', e.message);
        console.error('   Raw body preview:', buf.toString(enc).substring(0, 200));
        throw new Error('Invalid JSON in request body');
      }
    }
  }));
  
  app.use(cors({ 
    origin: process.env.MCP_ALLOWED_ORIGIN || '*', 
    methods: ['POST','GET','DELETE'], 
    exposedHeaders: ['Mcp-Session-Id'], 
    // Allow Accept header and the custom mcp-session-id header
    allowedHeaders: ['Content-Type', 'Accept', 'mcp-session-id'], 
    credentials: true 
  }));

  app.post('/mcp', async (req, res) => {
    try {
      const method = req.body?.method || 'unknown';
      console.warn(`[HTTP] Request method: ${method} (shared session mode)`);
      
      // Log headers for debugging content negotiation issues
      const contentType = req.headers['content-type'] || 'not-set';
      const accept = req.headers['accept'] || 'not-set';
      console.warn(`[HTTP] Headers: Content-Type="${contentType}", Accept="${accept}"`);
      
      // Initialize shared transport once on first request
      if (!sharedTransport) {
        console.warn(`[HTTP] Initializing shared global session: ${SHARED_SESSION_ID}`);
        
        sharedTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => SHARED_SESSION_ID,
          enableJsonResponse: true
        } as any);

        // Connect server to shared transport
        await server.connect(sharedTransport);
        console.warn(`[HTTP] Server connected to shared session`);
      }
      
      // Handle re-initialization gracefully - return cached init response
      if (isSessionInitialized && method === 'initialize') {
        console.warn(`[HTTP] Re-initialization request - returning cached response`);
        res.setHeader('Mcp-Session-Id', SHARED_SESSION_ID);
        res.setHeader('Content-Type', 'application/json');
        res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'Mimir-RAG-TODO-MCP',
              version: '4.0.0',
              sessionId: SHARED_SESSION_ID,
              sessionMode: 'shared-global'
            }
          }
        });
        return;
      }
      
      // Auto-initialize: Convert first non-initialize request to initialize
      // This returns the init response, and next request will work normally
      if (!isSessionInitialized && method !== 'initialize') {
        console.warn(`[HTTP] Auto-initializing: First request converted to initialize`);
        req.body.method = 'initialize';
        req.body.params = {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'http-auto-init', version: '1.0' }
        };
        isSessionInitialized = true;
      }
      
      // Mark session as initialized if this is an explicit initialize request
      if (method === 'initialize') {
        isSessionInitialized = true;
      }

      // Always inject the shared session ID into request headers
      if (!req.headers['mcp-session-id']) {
        req.headers['mcp-session-id'] = SHARED_SESSION_ID;
      }

      // Always set the shared session header in response
      res.setHeader('Mcp-Session-Id', SHARED_SESSION_ID);

      // For initialize requests (explicit or auto), intercept response to add sessionId
      if (method === 'initialize' || req.body.method === 'initialize') {
        // Wrap response to capture and modify initialize response
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        let responseData = '';

        res.write = ((chunk: any, ...args: any[]) => {
          if (chunk) responseData += chunk.toString();
          return true;
        }) as any;

        res.end = ((chunk?: any, ...args: any[]) => {
          if (chunk) responseData += chunk.toString();
          
          try {
            // Parse and modify the response
            const parsed = JSON.parse(responseData);
            if (parsed.result && parsed.result.serverInfo) {
              // Add sessionId to serverInfo
              parsed.result.serverInfo.sessionId = SHARED_SESSION_ID;
              parsed.result.serverInfo.sessionMode = 'shared-global';
            }
            responseData = JSON.stringify(parsed);
          } catch (e: any) {
            // If parsing fails, leave response as-is
            console.error('❌ Failed to modify initialize response:', e.message);
            console.error('   Response data preview:', responseData.substring(0, 200));
          }
          
          originalEnd(responseData);
        }) as any;
      }

      // Handle the request
      await sharedTransport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('❌ HTTP /mcp handler error:', error instanceof Error ? error.message : error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
  
  // Health check for Docker HEALTHCHECK
  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', version: '4.1.0', mode: 'shared-session', tools: allTools.length });
  });
  
  // Global error handler for JSON parsing and other errors
  app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && 'body' in err) {
      console.error('❌ Body parse error:', err.message);
      console.error('   Request method:', req.method);
      console.error('   Request path:', req.path);
      return res.status(400).json({ 
        jsonrpc: '2.0',
        error: { 
          code: -32700, 
          message: 'Parse error: Invalid JSON in request body',
          data: { detail: err.message }
        } 
      });
    }
    
    console.error('❌ Unhandled error:', err);
    if (!res.headersSent) {
      res.status(500).json({ 
        jsonrpc: '2.0',
        error: { 
          code: -32603, 
          message: 'Internal error',
          data: { detail: err.message }
        } 
      });
    }
  });

  const port = parseInt(process.env.PORT || process.env.MCP_HTTP_PORT || '3000', 10);
  app.listen(port, () => {
    console.error(`✅ HTTP server listening on http://localhost:${port}/mcp`);
    console.error(`✅ Health check: http://localhost:${port}/health`);
  });
}

startHttpServer().catch(error => {
  console.error('❌ HTTP server failed to start:', error);
  process.exit(1);
});
