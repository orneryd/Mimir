# Multi-Agent Architecture Implementation Roadmap

**Status:** Planning → Implementation (v3.0)  
**Timeline:** Q4 2025 - Q1 2026  
**Owner:** CVS Health Enterprise AI Team

---

## 📚 Related Documentation

This is the **phase-by-phase implementation roadmap** for multi-agent orchestration. For related documents:

- **📋 [Executive Summary](../MULTI_AGENT_EXECUTIVE_SUMMARY.md)**: High-level overview for stakeholders
- **🏗️ [Architecture Specification](MULTI_AGENT_GRAPH_RAG.md)**: Complete technical architecture (v3.1)
- **🗺️ This Document**: Implementation roadmap with timelines and code examples

---

## 📋 Overview

This roadmap outlines the step-by-step implementation of multi-agent Graph-RAG orchestration, transforming the MCP server from single-agent context management to PM/Worker/QC architecture.

**Research Foundation:**
- [Multi-Agent Graph-RAG Architecture](MULTI_AGENT_GRAPH_RAG.md) (Technical Specification)
- [Conversation Analysis Validation](../research/CONVERSATION_ANALYSIS.md) (Research Validation)
- [Original Graph-RAG Research](../research/GRAPH_RAG_RESEARCH.md) (Foundational Research)

---

## 🎯 Implementation Phases

### ✅ Phase 0: Foundation (v2.0-2.3) - COMPLETE

**Status:** ✅ **COMPLETE**

**Achievements:**
- ✅ Knowledge Graph with full CRUD operations
- ✅ Subgraph extraction (`graph_get_subgraph`)
- ✅ Context enrichment and search
- ✅ Hierarchical memory architecture
- ✅ 80-test validation suite

**Why this matters for multi-agent:**
These features enable PM agents to create task graphs and QC agents to verify against requirements using subgraph extraction.

---

### 🔨 Phase 1: Multi-Agent Foundation (v3.0)

**Target:** December 2025  
**Priority:** HIGH - Enables core multi-agent pattern

#### 1.1 Task Locking System

**Objective:** Prevent race conditions when multiple workers claim tasks

**Implementation:**

**Step 1: Add version field to TODO type**
```typescript
// src/types/todo.types.ts

export interface Todo {
  // ... existing fields ...
  version: number;           // ← NEW: Optimistic locking
  lockedBy?: string;         // ← NEW: Agent ID holding lock
  lockedAt?: Date;          // ← NEW: When lock was acquired
  lockExpiresAt?: Date;     // ← NEW: Auto-expiry timestamp
}
```

**Step 2: Implement lock acquisition**
```typescript
// src/managers/TodoManager.ts

async lockTodo(
  id: string, 
  agentId: string, 
  timeoutMs: number = 300000
): Promise<boolean> {
  const todo = this.todos.get(id);
  
  if (!todo) throw new Error(`Todo ${id} not found`);
  
  // Check if already locked by another agent
  if (todo.lockedBy && todo.lockedBy !== agentId) {
    if (todo.lockExpiresAt && new Date() < todo.lockExpiresAt) {
      return false; // Still locked by another agent
    }
    // Lock expired - can claim
  }
  
  // Acquire lock
  todo.lockedBy = agentId;
  todo.lockedAt = new Date();
  todo.lockExpiresAt = new Date(Date.now() + timeoutMs);
  todo.version++;
  
  return true;
}

async releaseLock(id: string, agentId: string): Promise<void> {
  const todo = this.todos.get(id);
  
  if (!todo) throw new Error(`Todo ${id} not found`);
  
  // Only release if this agent holds the lock
  if (todo.lockedBy === agentId) {
    delete todo.lockedBy;
    delete todo.lockedAt;
    delete todo.lockExpiresAt;
  }
}
```

**Step 3: Add MCP tools**
```typescript
// src/tools/todo.tools.ts

{
  name: 'lock_todo',
  description: 'Acquire exclusive lock on a TODO task for multi-agent coordination',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Todo ID to lock' },
      agentId: { type: 'string', description: 'Agent claiming the lock' },
      timeoutMs: { 
        type: 'number', 
        description: 'Lock expiry in milliseconds (default 300000 = 5 min)',
        default: 300000
      }
    },
    required: ['id', 'agentId']
  }
},
{
  name: 'release_lock',
  description: 'Release lock on a TODO task',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      agentId: { type: 'string' }
    },
    required: ['id', 'agentId']
  }
}
```

**Success Criteria:**
- [ ] Zero race conditions in parallel task claiming
- [ ] Automatic lock expiry after timeout
- [ ] Agent can query available (unlocked) tasks

**Testing:**
```typescript
// testing/task-locking.test.ts

describe('Task Locking', () => {
  it('should prevent double claiming', async () => {
    const taskId = 'task-1';
    const agent1 = 'worker-1';
    const agent2 = 'worker-2';
    
    const lock1 = await lockTodo(taskId, agent1);
    expect(lock1).toBe(true);
    
    const lock2 = await lockTodo(taskId, agent2);
    expect(lock2).toBe(false); // Already locked
  });
  
  it('should auto-expire locks', async () => {
    const taskId = 'task-1';
    await lockTodo(taskId, 'worker-1', 100); // 100ms timeout
    
    await sleep(150);
    
    const lock2 = await lockTodo(taskId, 'worker-2');
    expect(lock2).toBe(true); // Lock expired
  });
});
```

#### 1.2 Agent Context Isolation

**Objective:** Workers only see task-specific context, not full PM context

**Implementation:**

**Step 1: Add context scope filtering**
```typescript
// src/managers/TodoManager.ts

async getTodoForWorker(id: string): Promise<Todo> {
  const todo = this.todos.get(id);
  
  if (!todo) throw new Error(`Todo ${id} not found`);
  
  // Return only task-specific context
  return {
    ...todo,
    context: this.filterWorkerContext(todo.context)
  };
}

private filterWorkerContext(context: any): any {
  // Remove PM research context, keep only:
  // - Task requirements
  // - Direct dependencies
  // - Required file paths
  // - Error context (if retry)
  
  return {
    requirements: context.requirements,
    files: context.files,
    dependencies: context.dependencies,
    errorContext: context.errorContext // Only for retries
    // NO: Full research notes, alternative approaches, etc.
  };
}
```

**Step 2: Add MCP tool**
```typescript
{
  name: 'get_todo_for_worker',
  description: 'Get TODO with worker-scoped context (no PM research)',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      agentId: { type: 'string', description: 'Worker agent ID' }
    },
    required: ['id', 'agentId']
  }
}
```

**Success Criteria:**
- [ ] Worker context <10% of PM context size
- [ ] Workers still have all necessary info to complete task
- [ ] <10% clarification rate (workers rarely need to ask PM)

#### 1.3 Agent Lifecycle Management

**Objective:** Track agent spawning, execution, and termination

**Implementation:**

**Step 1: Create agent registry**
```typescript
// src/managers/AgentManager.ts

export interface Agent {
  id: string;
  type: 'pm' | 'worker' | 'qc';
  status: 'active' | 'idle' | 'terminated';
  spawnedAt: Date;
  terminatedAt?: Date;
  currentTask?: string;
  contextSize: number; // Tokens in current context
}

export class AgentManager {
  private agents = new Map<string, Agent>();
  
  async spawnAgent(type: 'pm' | 'worker' | 'qc'): Promise<Agent> {
    const agent: Agent = {
      id: `${type}-${Date.now()}`,
      type,
      status: 'active',
      spawnedAt: new Date(),
      contextSize: 0
    };
    
    this.agents.set(agent.id, agent);
    return agent;
  }
  
  async terminateAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'terminated';
      agent.terminatedAt = new Date();
      // Release any locks held by this agent
      await this.releaseAllLocks(agentId);
    }
  }
  
  async getMetrics() {
    return {
      activeAgents: Array.from(this.agents.values())
        .filter(a => a.status === 'active').length,
      avgContextSize: this.calculateAvgContextSize(),
      avgLifespan: this.calculateAvgLifespan()
    };
  }
}
```

**Step 2: Add MCP tools**
```typescript
{
  name: 'spawn_agent',
  description: 'Spawn a new PM, worker, or QC agent',
  inputSchema: {
    type: 'object',
    properties: {
      type: { 
        type: 'string', 
        enum: ['pm', 'worker', 'qc'],
        description: 'Agent type'
      }
    },
    required: ['type']
  }
},
{
  name: 'terminate_agent',
  description: 'Terminate agent and release resources',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: { type: 'string' }
    },
    required: ['agentId']
  }
},
{
  name: 'get_agent_metrics',
  description: 'Get multi-agent system metrics',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}
```

**Success Criteria:**
- [ ] Agent lifecycle tracked from spawn to termination
- [ ] Metrics show avg context lifespan <5 min for workers
- [ ] Automatic cleanup on agent termination

**Deliverables for Phase 1:**
- [ ] 3 new MCP tools: `lock_todo`, `get_todo_for_worker`, `spawn_agent`
- [ ] AgentManager class with lifecycle tracking
- [ ] 15+ tests for locking and isolation
- [ ] Documentation: Multi-agent quick start guide
- [ ] Proof-of-concept: 3 workers claiming 10 tasks with zero conflicts

---

### 🔬 Phase 2: Adversarial Validation (v3.1)

**Target:** January 2026  
**Priority:** HIGH - Prevents error propagation

#### 2.1 QC Agent Verification System

**Objective:** Verify worker output before storing in graph

**Implementation:**

**Step 1: Define verification schema**
```typescript
// src/types/verification.types.ts

export interface VerificationRule {
  id: string;
  type: 'required_field' | 'format' | 'dependency' | 'custom';
  description: string;
  validator: (output: any, context: any) => ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  failures: ValidationFailure[];
  score: number; // 0-100
}

export interface ValidationFailure {
  rule: string;
  severity: 'error' | 'warning';
  description: string;
  suggestedFix?: string;
}
```

**Step 2: Implement verification engine**
```typescript
// src/managers/VerificationManager.ts

export class VerificationManager {
  private rules = new Map<string, VerificationRule>();
  
  async verifyTaskOutput(
    taskId: string,
    output: any
  ): Promise<ValidationResult> {
    const task = await getTodo(taskId);
    const subgraph = await graph_get_subgraph(taskId, 2);
    
    const requirements = this.extractRequirements(subgraph);
    const failures: ValidationFailure[] = [];
    
    // Run all applicable rules
    for (const rule of this.rules.values()) {
      const result = rule.validator(output, { task, requirements });
      if (!result.passed) {
        failures.push(...result.failures);
      }
    }
    
    return {
      passed: failures.filter(f => f.severity === 'error').length === 0,
      failures,
      score: this.calculateScore(failures)
    };
  }
  
  async generateCorrectionPrompt(
    taskId: string,
    failures: ValidationFailure[]
  ): Promise<string> {
    const task = await getTodo(taskId);
    
    return `
Task: ${task.title}

Your previous output had these issues:
${failures.map(f => `- ${f.description}`).join('\n')}

Suggested fixes:
${failures.map(f => f.suggestedFix).filter(Boolean).join('\n')}

Please revise your output to address these issues while maintaining your original approach.
    `.trim();
  }
}
```

**Step 3: Add MCP tools**
```typescript
{
  name: 'verify_task_output',
  description: 'QC agent verifies worker output against requirements',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      output: { type: 'object', description: 'Worker output to verify' },
      agentId: { type: 'string', description: 'QC agent ID' }
    },
    required: ['taskId', 'output', 'agentId']
  }
},
{
  name: 'create_correction_task',
  description: 'Create correction task for failed verification',
  inputSchema: {
    type: 'object',
    properties: {
      parentTaskId: { type: 'string' },
      failures: { 
        type: 'array',
        items: { type: 'object' },
        description: 'Validation failures'
      },
      preserveContext: { 
        type: 'boolean',
        default: true,
        description: 'Preserve original worker context for retry'
      }
    },
    required: ['parentTaskId', 'failures']
  }
}
```

**Success Criteria:**
- [ ] <5% error propagation (QC catches 95%+ of errors)
- [ ] Correction prompts preserve original context
- [ ] <20% worker retry rate

#### 2.2 Audit Trail System

**Objective:** Complete tracking for compliance and debugging

**Implementation:**

**Step 1: Create audit log**
```typescript
// src/types/audit.types.ts

export interface AuditEvent {
  id: string;
  timestamp: Date;
  agentId: string;
  agentType: 'pm' | 'worker' | 'qc';
  eventType: 
    | 'task_created'
    | 'task_claimed'
    | 'task_completed'
    | 'task_verified'
    | 'task_failed'
    | 'correction_generated';
  taskId: string;
  metadata: any;
}

export class AuditLogger {
  private events: AuditEvent[] = [];
  
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    this.events.push({
      ...event,
      id: `audit-${Date.now()}`,
      timestamp: new Date()
    });
  }
  
  async getTaskHistory(taskId: string): Promise<AuditEvent[]> {
    return this.events.filter(e => e.taskId === taskId);
  }
  
  async exportForCompliance(): Promise<string> {
    // Export audit trail in compliance format
    return JSON.stringify(this.events, null, 2);
  }
}
```

**Success Criteria:**
- [ ] Every agent action logged
- [ ] Complete task history reconstructable from audit log
- [ ] Export format suitable for compliance review

**Deliverables for Phase 2:**
- [ ] VerificationManager with rule engine
- [ ] 2 new MCP tools: `verify_task_output`, `create_correction_task`
- [ ] Audit logging system
- [ ] 10+ tests for verification logic
- [ ] Documentation: QC agent workflow guide

---

### 🧹 Phase 3: Context Deduplication (v3.2)

**Target:** February 2026  
**Priority:** MEDIUM - Optimization for scale

#### 3.1 Context Fingerprinting

**Objective:** Detect duplicate context across agents

**Implementation:**

```typescript
// src/utils/deduplication.ts

import crypto from 'crypto';

export class ContextDeduplicator {
  private fingerprints = new Map<string, ContextFingerprint>();
  
  fingerprint(content: string): string {
    // Normalize before hashing
    const normalized = this.normalize(content);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
  
  private normalize(content: string): string {
    return content
      .toLowerCase()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/['"]/g, '') // Remove quotes
      .trim();
  }
  
  deduplicate(contexts: string[]): string[] {
    const seen = new Set<string>();
    return contexts.filter(content => {
      const hash = this.fingerprint(content);
      if (seen.has(hash)) return false;
      seen.set(hash);
      return true;
    });
  }
  
  async getDeduplicationRate(): Promise<number> {
    const totalContexts = this.fingerprints.size;
    const uniqueHashes = new Set(
      Array.from(this.fingerprints.values()).map(f => f.hash)
    ).size;
    
    return 1 - (uniqueHashes / totalContexts);
  }
}
```

**Success Criteria:**
- [ ] >80% deduplication rate across agent fleet
- [ ] <10ms overhead per deduplication check

#### 3.2 Smart Context Merging

**Objective:** Consolidate redundant information

**Success Criteria:**
- [ ] Zero information loss in merge operations
- [ ] Merged contexts are semantically equivalent to originals

**Deliverables for Phase 3:**
- [ ] ContextDeduplicator utility
- [ ] Deduplication metrics endpoint
- [ ] 8+ tests for fingerprinting and merging
- [ ] Performance benchmarks

---

### 🚀 Phase 4: Scale & Performance (v3.3)

**Target:** March 2026  
**Priority:** LOW - Scale beyond 10 workers

#### 4.1 Distributed Locking (Redis)

**Objective:** Replace optimistic locking with distributed locks

**Implementation:** Move from in-memory version checks to Redis-based distributed locks

**Success Criteria:**
- [ ] Support 50+ concurrent workers
- [ ] <1% lock conflict rate
- [ ] <50ms P99 task claim latency

#### 4.2 Agent Pool Management

**Objective:** Dynamic worker spawning and lifecycle

**Success Criteria:**
- [ ] Auto-scale workers based on task queue depth
- [ ] Health checks and automatic worker restart
- [ ] Pool metrics and observability

**Deliverables for Phase 4:**
- [ ] Redis integration for distributed locking
- [ ] AgentPool class with auto-scaling
- [ ] Performance monitoring dashboard
- [ ] Load testing: 100 tasks, 50 workers

---

## 🚀 Phase 4: Deployment Infrastructure (v3.1)

**Target:** Q1 2026  
**Priority:** HIGH - Production readiness

### 4.1 Remote Centralized Server

**Objective:** Deploy as centralized memory service for distributed agent teams

**Architecture:**

```
┌─────────────────┐         ┌─────────────────┐
│  Agent Team A   │         │  Agent Team B   │
│  (VSCode)       │         │  (Claude Desktop)│
└────────┬────────┘         └────────┬────────┘
         │                           │
         │     HTTPS + Auth          │
         └──────────┬─────────────────┘
                    │
         ┌──────────▼──────────┐
         │  MCP Memory Server  │
         │  (Centralized)      │
         │                     │
         │  - HTTP/WebSocket   │
         │  - Authentication   │
         │  - Multi-tenancy    │
         │  - Rate limiting    │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │  Persistent Storage │
         │  (PostgreSQL/Redis) │
         └─────────────────────┘
```

#### Implementation Steps

**Step 1: HTTP Server Wrapper**

```typescript
// src/server/http-server.ts

import express from 'express';
import { MCPServer } from './mcp-server.js';
import { authenticateRequest } from './middleware/auth.js';
import { rateLimiter } from './middleware/rate-limit.js';

export class HttpMcpServer {
  private app: express.Application;
  private mcpServer: MCPServer;

  constructor() {
    this.app = express();
    this.mcpServer = new MCPServer();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(authenticateRequest);
    this.app.use(rateLimiter);
  }

  private setupRoutes() {
    // MCP tool endpoints
    this.app.post('/mcp/call/:toolName', async (req, res) => {
      const { toolName } = req.params;
      const { arguments: args } = req.body;
      const userId = req.user.id;

      try {
        const result = await this.mcpServer.callTool(toolName, args, userId);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', version: '3.1.0' });
    });
  }

  listen(port: number) {
    this.app.listen(port, () => {
      console.log(`MCP HTTP Server listening on port ${port}`);
    });
  }
}
```

**Step 2: Authentication Middleware**

```typescript
// src/server/middleware/auth.ts

import jwt from 'jsonwebtoken';

export async function authenticateRequest(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.userId,
      teamId: decoded.teamId,
      permissions: decoded.permissions
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Step 3: Multi-Tenancy Support**

```typescript
// src/managers/TodoManager.ts

export class TodoManager {
  private todos: Map<string, Map<string, TodoItem>>; // teamId -> todoId -> todo

  constructor() {
    this.todos = new Map();
  }

  createTodo(teamId: string, todo: TodoItem): TodoItem {
    if (!this.todos.has(teamId)) {
      this.todos.set(teamId, new Map());
    }

    const teamTodos = this.todos.get(teamId)!;
    teamTodos.set(todo.id, todo);

    return todo;
  }

  getTodos(teamId: string): TodoItem[] {
    const teamTodos = this.todos.get(teamId);
    return teamTodos ? Array.from(teamTodos.values()) : [];
  }
}
```

**Step 4: Database Persistence**

```typescript
// src/persistence/database.ts

import { Pool } from 'pg';

export class DatabasePersistence {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  }

  async saveTodo(teamId: string, todo: TodoItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO todos (id, team_id, data, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = $3, updated_at = NOW()`,
      [todo.id, teamId, JSON.stringify(todo)]
    );
  }

  async loadTodos(teamId: string): Promise<TodoItem[]> {
    const result = await this.pool.query(
      `SELECT data FROM todos WHERE team_id = $1 AND deleted_at IS NULL`,
      [teamId]
    );
    return result.rows.map(row => row.data);
  }
}
```

### 4.2 Deployment Configurations

**Docker Compose:**

```yaml
# docker compose.yml

version: '3.8'

services:
  mcp-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=mcp_memory
      - POSTGRES_USER=mcp
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

**Kubernetes Deployment:**

```yaml
# k8s/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-memory-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-memory
  template:
    metadata:
      labels:
        app: mcp-memory
    spec:
      containers:
      - name: mcp-server
        image: mcp-memory-server:3.1.0
        ports:
        - containerPort: 3000
        env:
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: host
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

---

## 🏢 Phase 5: Enterprise Features (v3.2)

**Target:** Q2 2026  
**Priority:** CRITICAL - Enterprise production requirements

### 5.1 Audit Trail System

**Objective:** Complete audit trail for compliance and debugging

**Implementation:**

```typescript
// src/types/audit.types.ts

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOCK' | 'VERIFY';
  resourceType: 'TODO' | 'GRAPH_NODE' | 'GRAPH_EDGE';
  resource: string;
  agentId: string;
  agentType: 'PM' | 'WORKER' | 'QC' | 'USER';
  teamId: string;
  action: string;
  before?: any;
  after?: any;
  metadata: {
    requestId: string;
    sessionId: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface AuditQuery {
  teamId: string;
  startDate?: Date;
  endDate?: Date;
  agentId?: string;
  resourceType?: string;
  eventType?: string;
}
```

**Audit Logger:**

```typescript
// src/managers/AuditManager.ts

export class AuditManager {
  private events: AuditEvent[] = [];
  private db: DatabasePersistence;

  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      ...event,
      id: generateId('audit'),
      timestamp: new Date()
    };

    // Store in memory for fast access
    this.events.push(auditEvent);

    // Persist to database
    await this.db.saveAuditEvent(auditEvent);

    // If critical event, also log to external system
    if (this.isCriticalEvent(event)) {
      await this.sendToExternalAudit(auditEvent);
    }
  }

  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    return this.db.queryAuditEvents(query);
  }

  async generateAuditReport(
    teamId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AuditReport> {
    const events = await this.queryEvents({ teamId, startDate, endDate });

    return {
      period: { start: startDate, end: endDate },
      totalEvents: events.length,
      eventsByType: this.groupByType(events),
      agentActivity: this.groupByAgent(events),
      anomalies: this.detectAnomalies(events),
      compliance: this.checkCompliance(events)
    };
  }
}
```

### 5.2 Agent Activity Tracking

**Objective:** Monitor agent behavior and performance

```typescript
// src/managers/AgentTracker.ts

export interface AgentMetrics {
  agentId: string;
  agentType: 'PM' | 'WORKER' | 'QC';
  teamId: string;
  metrics: {
    tasksCreated: number;
    tasksCompleted: number;
    tasksVerified: number;
    averageTaskDuration: number;
    successRate: number;
    errorRate: number;
    lockConflicts: number;
  };
  activityLog: {
    timestamp: Date;
    action: string;
    duration: number;
    status: 'success' | 'failure';
  }[];
}

export class AgentTracker {
  private metrics: Map<string, AgentMetrics> = new Map();

  async trackAgentAction(
    agentId: string,
    action: string,
    startTime: Date,
    status: 'success' | 'failure'
  ): Promise<void> {
    const duration = Date.now() - startTime.getTime();
    
    let agent = this.metrics.get(agentId);
    if (!agent) {
      agent = this.initializeAgentMetrics(agentId);
      this.metrics.set(agentId, agent);
    }

    agent.activityLog.push({
      timestamp: new Date(),
      action,
      duration,
      status
    });

    this.updateMetrics(agent, action, status, duration);
  }

  async getAgentMetrics(agentId: string): Promise<AgentMetrics | null> {
    return this.metrics.get(agentId) || null;
  }

  async getTeamMetrics(teamId: string): Promise<AgentMetrics[]> {
    return Array.from(this.metrics.values())
      .filter(m => m.teamId === teamId);
  }

  async detectAnomalousAgents(teamId: string): Promise<string[]> {
    const teamMetrics = await this.getTeamMetrics(teamId);
    const anomalous: string[] = [];

    for (const agent of teamMetrics) {
      // High error rate
      if (agent.metrics.errorRate > 0.5) {
        anomalous.push(agent.agentId);
      }

      // Excessive lock conflicts
      if (agent.metrics.lockConflicts > 10) {
        anomalous.push(agent.agentId);
      }

      // Low success rate
      if (agent.metrics.successRate < 0.5) {
        anomalous.push(agent.agentId);
      }
    }

    return [...new Set(anomalous)];
  }
}
```

### 5.3 Validation Chain

**Objective:** End-to-end validation with provenance tracking

```typescript
// src/managers/ValidationChain.ts

export interface ValidationStep {
  stepId: string;
  stepType: 'CONTEXT_VERIFY' | 'OUTPUT_VERIFY' | 'DEPENDENCY_CHECK' | 'SECURITY_SCAN';
  validator: string; // Agent ID
  timestamp: Date;
  status: 'passed' | 'failed' | 'warning';
  findings: string[];
  evidence: any;
}

export interface ValidationChain {
  taskId: string;
  chainId: string;
  steps: ValidationStep[];
  finalStatus: 'valid' | 'invalid' | 'pending';
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
}

export class ValidationChainManager {
  private chains: Map<string, ValidationChain> = new Map();

  async startValidationChain(taskId: string, creatorId: string): Promise<string> {
    const chain: ValidationChain = {
      taskId,
      chainId: generateId('chain'),
      steps: [],
      finalStatus: 'pending',
      createdBy: creatorId,
      createdAt: new Date()
    };

    this.chains.set(chain.chainId, chain);
    return chain.chainId;
  }

  async addValidationStep(
    chainId: string,
    step: Omit<ValidationStep, 'stepId' | 'timestamp'>
  ): Promise<void> {
    const chain = this.chains.get(chainId);
    if (!chain) throw new Error(`Chain ${chainId} not found`);

    const validationStep: ValidationStep = {
      ...step,
      stepId: generateId('step'),
      timestamp: new Date()
    };

    chain.steps.push(validationStep);

    // Auto-complete chain if all steps done
    if (this.isChainComplete(chain)) {
      chain.finalStatus = this.calculateFinalStatus(chain);
      chain.completedAt = new Date();
    }
  }

  async getValidationChain(chainId: string): Promise<ValidationChain | null> {
    return this.chains.get(chainId) || null;
  }

  async getTaskValidation(taskId: string): Promise<ValidationChain[]> {
    return Array.from(this.chains.values())
      .filter(c => c.taskId === taskId);
  }

  private calculateFinalStatus(chain: ValidationChain): 'valid' | 'invalid' {
    const hasFailed = chain.steps.some(s => s.status === 'failed');
    return hasFailed ? 'invalid' : 'valid';
  }
}
```

### 5.4 Compliance & Reporting

**Objective:** Generate compliance reports for enterprise requirements

```typescript
// src/reporting/ComplianceReporter.ts

export interface ComplianceReport {
  reportId: string;
  teamId: string;
  period: { start: Date; end: Date };
  generated: Date;
  
  summary: {
    totalTasks: number;
    validatedTasks: number;
    failedValidations: number;
    complianceRate: number;
  };

  agentActivity: {
    totalAgents: number;
    activeAgents: number;
    anomalousAgents: string[];
  };

  auditTrail: {
    totalEvents: number;
    criticalEvents: number;
    securityEvents: number;
  };

  violations: {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    taskId: string;
    agentId: string;
  }[];

  recommendations: string[];
}

export class ComplianceReporter {
  constructor(
    private auditManager: AuditManager,
    private agentTracker: AgentTracker,
    private validationChain: ValidationChainManager
  ) {}

  async generateReport(
    teamId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    // Gather data from all sources
    const auditEvents = await this.auditManager.queryEvents({ teamId, startDate, endDate });
    const agentMetrics = await this.agentTracker.getTeamMetrics(teamId);
    const anomalousAgents = await this.agentTracker.detectAnomalousAgents(teamId);

    // Analyze compliance
    const violations = this.detectViolations(auditEvents, agentMetrics);
    const complianceRate = this.calculateComplianceRate(auditEvents, violations);

    return {
      reportId: generateId('report'),
      teamId,
      period: { start: startDate, end: endDate },
      generated: new Date(),
      summary: {
        totalTasks: this.countTasks(auditEvents),
        validatedTasks: this.countValidatedTasks(auditEvents),
        failedValidations: this.countFailedValidations(auditEvents),
        complianceRate
      },
      agentActivity: {
        totalAgents: agentMetrics.length,
        activeAgents: agentMetrics.filter(m => m.metrics.tasksCompleted > 0).length,
        anomalousAgents
      },
      auditTrail: {
        totalEvents: auditEvents.length,
        criticalEvents: auditEvents.filter(e => this.isCritical(e)).length,
        securityEvents: auditEvents.filter(e => e.eventType === 'VERIFY').length
      },
      violations,
      recommendations: this.generateRecommendations(violations, agentMetrics)
    };
  }

  async exportReport(report: ComplianceReport, format: 'JSON' | 'PDF' | 'CSV'): Promise<Buffer> {
    switch (format) {
      case 'JSON':
        return Buffer.from(JSON.stringify(report, null, 2));
      case 'PDF':
        return this.generatePDF(report);
      case 'CSV':
        return this.generateCSV(report);
    }
  }
}
```

### 5.5 Rate Limiting & Quotas

**Objective:** Prevent abuse and ensure fair resource usage

```typescript
// src/middleware/rate-limit.ts

export interface TeamQuota {
  teamId: string;
  limits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    maxStorageMB: number;
    maxAgents: number;
  };
  current: {
    requestsThisMinute: number;
    requestsThisHour: number;
    storageMB: number;
    activeAgents: number;
  };
}

export class RateLimiter {
  private quotas: Map<string, TeamQuota> = new Map();

  async checkQuota(teamId: string): Promise<{ allowed: boolean; reason?: string }> {
    const quota = this.quotas.get(teamId);
    if (!quota) return { allowed: true };

    // Check requests per minute
    if (quota.current.requestsThisMinute >= quota.limits.requestsPerMinute) {
      return { allowed: false, reason: 'Rate limit: requests per minute exceeded' };
    }

    // Check storage
    if (quota.current.storageMB >= quota.limits.maxStorageMB) {
      return { allowed: false, reason: 'Storage quota exceeded' };
    }

    return { allowed: true };
  }

  async recordRequest(teamId: string): Promise<void> {
    const quota = this.quotas.get(teamId);
    if (!quota) return;

    quota.current.requestsThisMinute++;
    quota.current.requestsThisHour++;
  }
}
```

---

## 📊 Success Metrics

### Phase 4 (Deployment)
- ✅ 99.9% uptime SLA
- ✅ <100ms p95 latency for API calls
- ✅ Support for 100+ concurrent agents
- ✅ Zero-downtime deployments

### Phase 5 (Enterprise)
- ✅ Complete audit trail for all operations
- ✅ Real-time anomaly detection (<5min)
- ✅ Compliance report generation (<1min)
- ✅ 100% validation coverage for critical tasks
- ✅ GDPR/SOC2 compliance ready

---

## 🎯 Long-term Vision (v4.0+)

### Advanced Features
- **AI-powered anomaly detection**: ML models to detect unusual agent behavior
- **Predictive scaling**: Auto-scale based on predicted agent workload
- **Cross-organization sharing**: Secure memory sharing between teams
- **Blockchain audit trail**: Immutable audit logs for critical operations
- **Advanced analytics**: Task completion prediction, bottleneck detection

---

**Last Updated:** 2025-10-13  
**Next Review:** 2026-01-01

---

## Appendix: Example POC Code

### PM Agent Creating Task Graph

```typescript
// Example: PM agent workflow

const pm = {
  id: 'pm-1',
  type: 'pm' as const
};

// 1. Research phase (PM has full context)
const requirements = await researchRequirements("Build auth system");

// 2. Create task graph
const tasks = [
  await create_todo({
    title: "Design user model",
    description: requirements.userModel,
    context: {
      requirements: requirements.userModel,
      files: ['src/models/']
    }
  }),
  await create_todo({
    title: "Implement JWT middleware",
    description: requirements.jwt,
    context: {
      requirements: requirements.jwt,
      files: ['src/middleware/'],
      dependencies: [tasks[0].id] // Depends on user model
    }
  }),
  // ... more tasks
];

// 3. Link dependencies
await graph_add_edge(tasks[1].id, 'depends_on', tasks[0].id);
```

### Worker Agent Claiming and Executing Task

```typescript
// Example: Worker agent workflow

const worker = {
  id: 'worker-1',
  type: 'worker' as const
};

// 1. Claim task
const availableTasks = await list_todos({ status: 'pending' });
const task = availableTasks[0];

const locked = await lock_todo({
  id: task.id,
  agentId: worker.id,
  timeoutMs: 300000 // 5 min
});

if (!locked) {
  // Try different task
  return;
}

// 2. Pull clean context (only task-specific)
const taskContext = await get_todo_for_worker({
  id: task.id,
  agentId: worker.id
});

// 3. Execute (worker has ZERO PM context)
const output = await executeTask(taskContext);

// 4. Store output
await update_todo({
  id: task.id,
  status: 'completed',
  context: {
    ...taskContext.context,
    output: output
  }
});

// 5. Release lock
await release_lock({ id: task.id, agentId: worker.id });

// 6. Terminate (context naturally pruned)
await terminate_agent({ agentId: worker.id });
```

### QC Agent Verifying Output

```typescript
// Example: QC agent workflow

const qc = {
  id: 'qc-1',
  type: 'qc' as const
};

// 1. Get completed tasks
const completedTasks = await list_todos({ status: 'completed' });

for (const task of completedTasks) {
  // 2. Pull task + subgraph for verification
  const taskData = await get_todo({ id: task.id });
  const subgraph = await graph_get_subgraph({
    startNodeId: task.id,
    depth: 2
  });
  
  // 3. Verify against requirements
  const result = await verify_task_output({
    taskId: task.id,
    output: taskData.context.output,
    agentId: qc.id
  });
  
  // 4. Decision
  if (result.passed) {
    // ✅ Pass
    await update_todo({
      id: task.id,
      status: 'completed',
      context: {
        ...taskData.context,
        verified: true,
        verifiedBy: qc.id,
        verifiedAt: new Date()
      }
    });
  } else {
    // ❌ Fail - create correction task
    await create_correction_task({
      parentTaskId: task.id,
      failures: result.failures,
      preserveContext: true
    });
  }
}
```
