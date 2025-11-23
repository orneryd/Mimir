// ============================================================================
// MCP HTTP Server
// Provides HTTP transport for the MCP server with unified GraphManager
// ============================================================================

// Load environment variables from .env file
import dotenv from 'dotenv';
import {hasAuthCredentials} from './utils/auth-helper.js';
dotenv.config();

// Set fallback environment variables
// NODE_ENV falls back to MIMIR_ENV if not defined
if (!process.env.NODE_ENV && process.env.MIMIR_ENV) {
  process.env.NODE_ENV = process.env.MIMIR_ENV;
}
// PORT falls back to MIMIR_PORT if not defined (MIMIR_PORT takes precedence in actual usage)
if (!process.env.PORT && process.env.MIMIR_PORT) {
  process.env.PORT = process.env.MIMIR_PORT;
}

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { server, initializeGraphManager, allTools } from './index.js';
import { createOrchestrationRouter } from './api/orchestration-api.js';
import { createChatRouter } from './api/chat-api.js';
import { createMCPToolsRouter } from './api/mcp-tools-api.js';
import indexRouter from './api/index-api.js';
import nodesRouter from './api/nodes-api.js';
import apiKeysRouter from './api/api-keys-api.js';
import { FileWatchManager } from './indexing/FileWatchManager.js';
import type { IGraphManager } from './types/index.js';
import passport from './config/passport.js';
import authRouter from './api/auth-api.js';
import { apiKeyAuth } from './middleware/api-key-auth.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  let graphManager: IGraphManager;
  let watchManager: FileWatchManager;
  try {
    graphManager = await initializeGraphManager();
    const stats = await graphManager.getStats();
    console.log(`✅ Connected to Neo4j`);
    console.log(`   Nodes: ${stats.nodeCount}`);
    console.log(`   Edges: ${stats.edgeCount}`);
    console.log(`   Types: ${JSON.stringify(stats.types)}`);

    // Get FileWatchManager instance from index.ts (already initialized there)
    const { fileWatchManager: indexWatchManager } = await import('./index.js');
    watchManager = indexWatchManager;
    console.log(`✅ Using FileWatchManager instance from index.ts`);
    
    // Make watchManager globally accessible for API routes
    (globalThis as any).fileWatchManager = watchManager;
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
  
  // Add URL-encoded body parser for form submissions (needed for Passport login)
  app.use(bodyParser.urlencoded({ extended: true }));
  
  app.use(cors({ 
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      
      // Allow vscode-webview origins for the extension
      if (origin.startsWith('vscode-webview://')) {
        return callback(null, true);
      }
      
      // Allow configured origin or all origins if not set
      const allowedOrigin = process.env.MCP_ALLOWED_ORIGIN || '*';
      if (allowedOrigin === '*') {
        return callback(null, true);
      }
      
      if (origin === allowedOrigin) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['POST','GET','DELETE','PATCH','PUT'], 
    exposedHeaders: ['Mcp-Session-Id'], 
    // OAuth 2.0 RFC 6750: Allow Authorization header for Bearer tokens
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'mcp-session-id', 'Cache-Control', 'X-API-Key'], 
    credentials: true 
  }));

  // Initialize audit logging (if enabled)
  let auditConfig: any = null;
  if (process.env.MIMIR_ENABLE_AUDIT_LOGGING === 'true') {
    const { loadAuditLoggerConfig, auditLogger } = await import('./middleware/audit-logger.js');
    auditConfig = loadAuditLoggerConfig();
    
    console.log('📝 Audit logging enabled');
    console.log(`   Destination: ${auditConfig.destination}`);
    console.log(`   Format: ${auditConfig.format}`);
    if (auditConfig.filePath) {
      console.log(`   File: ${auditConfig.filePath}`);
    }
    if (auditConfig.webhookUrl) {
      console.log(`   Webhook: ${auditConfig.webhookUrl}`);
    }
    
    // Add audit logger middleware (before routes)
    app.use(auditLogger(auditConfig));
  }

  // Security: Authentication & RBAC (Stateless with API keys)
  if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
    console.log('🔐 Security enabled - stateless API key authentication');
    
    if (process.env.MIMIR_ENABLE_RBAC === 'true') {
      console.log('🔒 RBAC enabled - role-based access control active');
      
      // Initialize RBAC config (supports remote URIs)
      const { initRBACConfig } = await import('./config/rbac-config.js');
      await initRBACConfig();
    } else {
      console.log('ℹ️  RBAC disabled - all authenticated users have full access');
    }
  }

  // Cookie parser for HTTP-only cookie authentication
  app.use(cookieParser());

  // Initialize passport for OAuth (stateless, no sessions)
  app.use(passport.initialize());

  // Mount auth routes FIRST (must be public for login to work)
  // Auth routes: /auth/login, /auth/logout, /auth/status, /auth/config, /auth/oauth/callback
  app.use(authRouter);

  // Protect API routes (only if security enabled)
  if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
    console.log('🔐 Security ENABLED - API routes require authentication');
    app.use('/api', async (req, res, next) => {
      // Skip auth check for health endpoint
      if (req.path === '/health') {
        return next();
      }
      
      // Check for any form of authentication:
      // 1. Authorization: Bearer header (OAuth 2.0 RFC 6750)
      // 2. X-API-Key header (common alternative)
      // 3. Cookie (for browser/UI)
      // 4. Query parameters (for SSE which can't send custom headers)
      if (hasAuthCredentials(req)) {
        // Let apiKeyAuth middleware handle validation
        return apiKeyAuth(req, res, next);
      }
      
      // No authentication provided
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    });
  } else {
    console.log('🔓 Security DISABLED - all API requests allowed (auth headers ignored)');
  }

  // Mount chat API routes (OpenAI-compatible, at root level)
  app.use('/', createChatRouter(graphManager));
  
  // Mount orchestration API routes
  app.use('/api', createOrchestrationRouter(graphManager));
  
  // Mount MCP tools API routes
  app.use('/api', createMCPToolsRouter(graphManager));
  
  // Mount index management API routes
  app.use('/api', indexRouter);
  
  // Mount nodes management API routes
  app.use('/api/nodes', nodesRouter);
  
  // Mount API keys management routes
  app.use('/api/keys', apiKeysRouter);

  // Mount RBAC config management routes (admin only)
  const rbacConfigRouter = (await import('./api/rbac-config-api.js')).default;
  app.use('/api/rbac', rbacConfigRouter);

  // Debug middleware - log ALL requests
  app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.path}`);
    next();
  });

  // Serve static frontend files (assets only, not HTML)
  const frontendDistPath = path.join(__dirname, '../frontend/dist');
  console.log(`📁 Serving frontend from: ${frontendDistPath}`);
  app.use(express.static(frontendDistPath, {
    index: false, // Don't serve index.html automatically
    setHeaders: (res, filepath) => {
      // Only serve actual asset files, not HTML
      if (filepath.endsWith('.html')) {
        res.status(404).end();
      }
    }
  }));

  // SSE endpoint for PCTX and other clients that need event streams
  app.get('/mcp', async (req, res) => {
    try {
      console.warn(`[HTTP] SSE connection request (shared session mode)`);
      
      // Initialize shared transport once on first request
      if (!sharedTransport) {
        console.warn(`[HTTP] Initializing shared global session: ${SHARED_SESSION_ID}`);
        
        sharedTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => SHARED_SESSION_ID,
          enableJsonResponse: true
        } as any);

        // Connect server to shared transport
        await (server as any).connect(sharedTransport);
        console.warn(`[HTTP] Server connected to shared session`);
      }
      
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Mcp-Session-Id', SHARED_SESSION_ID);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.flushHeaders();
      
      console.warn(`[HTTP] SSE stream established for session: ${SHARED_SESSION_ID}`);
      
      // Keep connection alive with periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30000);
      
      // Clean up on disconnect
      req.on('close', () => {
        clearInterval(heartbeatInterval);
        console.warn(`[HTTP] SSE client disconnected`);
      });
      
      // Handle the SSE request through transport
      await sharedTransport.handleRequest(req, res, null);
    } catch (error) {
      console.error('❌ HTTP /mcp SSE handler error:', error instanceof Error ? error.message : error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  app.post('/mcp', async (req, res) => {
    try {
      // CENTRALIZED AUTH CHECK: If security enabled, require authentication (stateless JWT/OAuth)
      if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
        if (!hasAuthCredentials(req)) {
          return res.status(401).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Unauthorized: Authentication required' },
            id: req.body?.id || null
          });
        }
        
        // Validate token using stateless apiKeyAuth (JWT/OAuth - NO SESSIONS)
        await new Promise<void>((resolve, reject) => {
          apiKeyAuth(req, res, (err?: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      // If security disabled: BYPASS ALL AUTH CHECKS
      
      let method = req.body?.method || 'unknown';
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
        await (server as any).connect(sharedTransport);
        console.warn(`[HTTP] Server connected to shared session`);
      }
      
      // Auto-initialize: Convert first non-initialize request to initialize
      // Only do this if we haven't initialized yet
      if (!isSessionInitialized && method !== 'initialize') {
        console.warn(`[HTTP] Auto-initializing: Converting '${method}' request to 'initialize'`);
        req.body.method = 'initialize';
        req.body.params = {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'http-auto-init', version: '1.0' }
        };
        method = 'initialize'; // Update the method variable too!
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
      
      // Mark session as initialized AFTER transport handles the initialize request
      if (method === 'initialize') {
        // Let transport handle the request first, then mark as initialized
        
        // Always inject the shared session ID into request headers
        if (!req.headers['mcp-session-id']) {
          req.headers['mcp-session-id'] = SHARED_SESSION_ID;
        }
        res.setHeader('Mcp-Session-Id', SHARED_SESSION_ID);
        
        // Intercept response to add sessionId and mark as initialized
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
            const parsed = JSON.parse(responseData);
            if (parsed.result && parsed.result.serverInfo) {
              parsed.result.serverInfo.sessionId = SHARED_SESSION_ID;
              parsed.result.serverInfo.sessionMode = 'shared-global';
            }
            responseData = JSON.stringify(parsed);
            console.warn(`[HTTP] Initialization complete - session ready`);
            isSessionInitialized = true;  // Mark as initialized AFTER successful init
          } catch (e: any) {
            console.error('❌ Failed to modify initialize response:', e.message);
          }
          
          originalEnd(responseData);
        }) as any;
        
        // Handle the initialize request
        await sharedTransport.handleRequest(req, res, req.body);
        return;
      }

      // Always inject the shared session ID into request headers
      if (!req.headers['mcp-session-id']) {
        req.headers['mcp-session-id'] = SHARED_SESSION_ID;
      }

      // Always set the shared session header in response
      res.setHeader('Mcp-Session-Id', SHARED_SESSION_ID);

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
  
  // SPA catch-all route - serve index.html for all non-API routes
  // This must come AFTER all API routes but BEFORE error handlers
  // Use a regex pattern instead of '*' to avoid path-to-regexp errors
  // Note: With stateless API key auth, the frontend handles routing/auth checks
  app.get(/^\/(?!api|v1|mcp|health|models|auth).*$/, (req, res) => {
    // Always serve the SPA - frontend will handle auth checks via API key
    res.sendFile(path.join(frontendDistPath, 'index.html'));
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

  // Port configuration: MIMIR_PORT takes precedence, falls back to PORT, then MIMIR_ENV-based default
  const port = parseInt(process.env.MIMIR_PORT || process.env.PORT || '3000', 10);
  const httpServer = app.listen(port, () => {
    console.error(`✅ HTTP server listening on http://localhost:${port}/mcp`);
    console.error(`✅ Health check: http://localhost:${port}/health`);
    console.error(`🎨 Mimir Portal UI: http://localhost:${port}/portal`);
    console.error(`🎭 Orchestration Studio: http://localhost:${port}/studio`);
    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received - starting graceful shutdown...`);
    
    // Flush audit logs if enabled
    if (auditConfig && auditConfig.enabled) {
      const { shutdownAuditLogger } = await import('./middleware/audit-logger.js');
      await shutdownAuditLogger(auditConfig);
      console.log('✅ Audit logs flushed');
    }
    
    // Close server
    httpServer.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startHttpServer().catch(error => {
  console.error('❌ HTTP server failed to start:', error);
  process.exit(1);
});
