import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { createSecureFetchOptions } from '../utils/fetch-helper.js';

/**
 * Audit Event Structure (Generic, Not Domain-Specific)
 */
export interface AuditEvent {
  timestamp: string;
  userId: string | null;
  action: string;
  resource: string;
  method: string;
  outcome: 'success' | 'failure';
  statusCode: number;
  metadata: {
    ipAddress: string;
    userAgent?: string;
    duration?: number;
    errorMessage?: string;
    [key: string]: any;
  };
}

/**
 * Audit Logger Configuration
 */
export interface AuditLoggerConfig {
  enabled: boolean;
  destination: 'stdout' | 'file' | 'webhook' | 'all';
  format: 'json' | 'text';
  level: 'info' | 'debug' | 'warn' | 'error';
  filePath?: string;
  webhookUrl?: string;
  webhookAuthHeader?: string;
  batchSize?: number;
  batchIntervalMs?: number;
}

/**
 * Load audit logger configuration from environment
 */
export function loadAuditLoggerConfig(): AuditLoggerConfig {
  const enabled = process.env.MIMIR_ENABLE_AUDIT_LOGGING === 'true';
  
  return {
    enabled,
    destination: (process.env.MIMIR_AUDIT_LOG_DESTINATION as any) || 'stdout',
    format: (process.env.MIMIR_AUDIT_LOG_FORMAT as any) || 'json',
    level: (process.env.MIMIR_AUDIT_LOG_LEVEL as any) || 'info',
    filePath: process.env.MIMIR_AUDIT_LOG_FILE,
    webhookUrl: process.env.MIMIR_AUDIT_WEBHOOK_URL,
    webhookAuthHeader: process.env.MIMIR_AUDIT_WEBHOOK_AUTH_HEADER,
    batchSize: parseInt(process.env.MIMIR_AUDIT_WEBHOOK_BATCH_SIZE || '100', 10),
    batchIntervalMs: parseInt(process.env.MIMIR_AUDIT_WEBHOOK_BATCH_INTERVAL_MS || '5000', 10),
  };
}

/**
 * Webhook batch queue
 */
let webhookBatch: AuditEvent[] = [];
let webhookTimer: NodeJS.Timeout | null = null;

/**
 * Flush webhook batch
 */
async function flushWebhookBatch(config: AuditLoggerConfig) {
  if (webhookBatch.length === 0 || !config.webhookUrl) {
    return;
  }

  const events = [...webhookBatch];
  webhookBatch = [];

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.webhookAuthHeader) {
      headers['Authorization'] = config.webhookAuthHeader;
    }

    const fetchOptions = createSecureFetchOptions(config.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ events }),
    });

    const response = await fetch(config.webhookUrl, fetchOptions);

    if (!response.ok) {
      console.error(`[Audit] Webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error: any) {
    console.error(`[Audit] Webhook error:`, error.message);
  }
}

/**
 * Write audit event to configured destinations
 */
export function writeAuditEvent(event: AuditEvent, config: AuditLoggerConfig) {
  if (!config.enabled) {
    return;
  }

  const output = config.format === 'json' 
    ? JSON.stringify(event)
    : `[${event.timestamp}] ${event.userId || 'anonymous'} ${event.method} ${event.resource} ${event.outcome} ${event.statusCode}`;

  // Write to stdout
  if (config.destination === 'stdout' || config.destination === 'all') {
    console.log(output);
  }

  // Write to file
  if ((config.destination === 'file' || config.destination === 'all') && config.filePath) {
    try {
      const dir = path.dirname(config.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(config.filePath, output + '\n');
    } catch (error: any) {
      console.error(`[Audit] File write error:`, error.message);
    }
  }

  // Queue for webhook
  if ((config.destination === 'webhook' || config.destination === 'all') && config.webhookUrl) {
    webhookBatch.push(event);

    // Flush if batch size reached
    if (webhookBatch.length >= (config.batchSize || 100)) {
      flushWebhookBatch(config);
    } else {
      // Set timer to flush batch
      if (!webhookTimer) {
        webhookTimer = setTimeout(() => {
          flushWebhookBatch(config);
          webhookTimer = null;
        }, config.batchIntervalMs || 5000);
      }
    }
  }
}

/**
 * Extract user ID from request
 */
function getUserId(req: Request): string | null {
  if (req.user) {
    const user = req.user as any;
    return user.id || user.email || user.username || 'authenticated';
  }
  return null;
}

/**
 * Get action from request
 */
function getAction(req: Request): string {
  const method = req.method;

  // Map HTTP methods to actions
  if (method === 'GET') return 'read';
  if (method === 'POST') return 'write';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  if (method === 'DELETE') return 'delete';
  
  return method.toLowerCase();
}

/**
 * Audit Logger Middleware
 * Logs all API requests with user, action, resource, and outcome
 */
export function auditLogger(config: AuditLoggerConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if audit logging disabled
    if (!config.enabled) {
      return next();
    }

    // Skip health check endpoint
    if (req.path === '/health') {
      return next();
    }

    const startTime = Date.now();

    // Capture response
    const originalSend = res.send;
    res.send = function (data: any) {
      const duration = Date.now() - startTime;

      const event: AuditEvent = {
        timestamp: new Date().toISOString(),
        userId: getUserId(req),
        action: getAction(req),
        resource: req.path,
        method: req.method,
        outcome: res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure',
        statusCode: res.statusCode,
        metadata: {
          ipAddress: (req.headers['x-real-ip'] as string) || 
                     (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                     req.ip || 
                     'unknown',
          userAgent: req.headers['user-agent'],
          duration,
        },
      };

      // Add error message for failures
      if (event.outcome === 'failure' && typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error || parsed.message) {
            event.metadata.errorMessage = parsed.error || parsed.message;
          }
        } catch {
          // Not JSON, ignore
        }
      }

      // Write audit event
      writeAuditEvent(event, config);

      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Shutdown handler - flush remaining webhook events
 */
export async function shutdownAuditLogger(config: AuditLoggerConfig) {
  if (webhookTimer) {
    clearTimeout(webhookTimer);
    webhookTimer = null;
  }
  await flushWebhookBatch(config);
}
