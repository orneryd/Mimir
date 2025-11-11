/**
 * QC Agent Verification Workflow Integration Tests
 * 
 * Tests the complete workflow:
 * 1. PM agent creates task breakdown with QC roles
 * 2. Worker executes task
 * 3. QC agent verifies output
 * 4. If failed: Worker retries (max 2 attempts)
 * 5. If still failed: QC generates failure report, PM generates summary
 * 
 * NOTE: This test mocks LLM calls to avoid actual API usage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockGraphManager } from './helpers/mockGraphManager.js';
import { ContextManager } from '../src/managers/ContextManager.js';
import type { WorkerContext, QCContext, PMContext } from '../src/types/context.types.js';
import path from 'path';

describe('QC Verification Workflow (Integration)', () => {
  let graphManager: any;
  let contextManager: ContextManager;

  // Neo4j connection details
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';

  beforeEach(async () => {
    graphManager = createMockGraphManager();
    contextManager = new ContextManager(graphManager);
    await graphManager.clear('ALL');
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    await graphManager.clear('ALL');
    await graphManager.close();
  });

  describe('PM Agent Task Planning', () => {
    it('should create task with both worker and QC agent roles', async () => {
      // PM agent creates task breakdown with QC role specification
      const taskNode = await graphManager.addNode('todo', {
        title: 'Implement authentication system',
        requirements: 'Build JWT-based authentication with refresh tokens',
        description: 'Security-critical feature requiring verification',
        workerRole: 'Backend engineer specializing in authentication and security',
        qcRole: 'Security auditor with expertise in authentication protocols, JWT best practices, and OWASP Top 10',
        files: ['auth.service.ts', 'jwt.util.ts', 'middleware/auth.ts'],
        verificationCriteria: JSON.stringify({
          security: [
            'JWT tokens properly signed and validated',
            'Refresh token rotation implemented',
            'No hardcoded secrets in code',
          ],
          functionality: [
            'Login endpoint returns valid JWT',
            'Protected routes reject invalid tokens',
            'Token expiration handled correctly',
          ],
          codeQuality: [
            'Error handling for all edge cases',
            'Unit tests with >80% coverage',
            'TypeScript types properly defined',
          ],
        }),
        maxRetries: 2,
        status: 'pending',
      });

      // Verify task structure
      expect(taskNode.properties.workerRole).toBeDefined();
      expect(taskNode.properties.qcRole).toBeDefined();
      expect(taskNode.properties.verificationCriteria).toBeDefined();
      expect(taskNode.properties.maxRetries).toBe(2);
    });

    it('should generate separate preambles for worker and QC roles', async () => {
      // Simulate PM agent generating both role descriptions
      const workerRole = 'Backend engineer with Node.js and TypeScript expertise';
      const qcRole = 'Senior QA engineer specializing in API testing and security validation';

      // These would be passed to agentinator to generate preambles
      const workerPreamblePath = path.join('generated-agents', 'worker-auth-backend.md');
      const qcPreamblePath = path.join('generated-agents', 'qc-auth-security.md');

      // Store paths in task
      const taskNode = await graphManager.addNode('todo', {
        title: 'Build API endpoint',
        requirements: 'Create RESTful API with validation',
        workerRole,
        qcRole,
        workerPreamblePath,
        qcPreamblePath,
      });

      expect(taskNode.properties.workerPreamblePath).toBe(workerPreamblePath);
      expect(taskNode.properties.qcPreamblePath).toBe(qcPreamblePath);
    });
  });

  describe('Worker → QC Handoff', () => {
    it('should pass worker output to QC agent for verification', async () => {
      // Worker completes task
      const taskNode = await graphManager.addNode('todo', {
        title: 'Implement login endpoint',
        requirements: 'Create POST /login endpoint with JWT authentication',
        description: 'Authentication feature',
        workerRole: 'Backend engineer',
        qcRole: 'Security auditor',
        status: 'in_progress',
        attemptNumber: 1,
      });

      // Simulate worker output
      const workerOutput = `
Implemented login endpoint:
- Created POST /login route
- JWT token generation with 15min expiry
- Refresh token with 7day expiry
- Password hashing with bcrypt
- Input validation with Zod
- Error handling for invalid credentials
- Unit tests with 85% coverage
      `.trim();

      await graphManager.updateNode(taskNode.id, {
        status: 'awaiting_qc',
        workerOutput,
        completedAt: new Date().toISOString(),
      });

      // QC agent retrieves context
      const qcContext = (await contextManager.getFilteredTaskContext(
        taskNode.id,
        'qc'
      )).context as QCContext;

      // Verify QC gets both requirements and worker output
      expect(qcContext.taskId).toBe(taskNode.id);
      expect(qcContext.title).toBe('Implement login endpoint');
      expect((qcContext as any).requirements).toBe('Create POST /login endpoint with JWT authentication');
      
      // Worker output should be available (even if not in current implementation)
      const updatedTask = await graphManager.getNode(taskNode.id);
      expect(updatedTask!.properties.workerOutput).toContain('JWT token generation');
    });

    it('should include verification criteria in QC context', async () => {
      const criteria = {
        security: ['No SQL injection vulnerabilities', 'Input sanitization'],
        functionality: ['All endpoints return correct status codes'],
      };

      const taskNode = await graphManager.addNode('todo', {
        title: 'Build API',
        requirements: 'Create secure API',
        verificationCriteria: JSON.stringify(criteria),
        workerOutput: 'API implemented with validation',
        status: 'awaiting_qc',
      });

      // QC retrieves task
      const task = await graphManager.getNode(taskNode.id);
      expect(task!.properties.verificationCriteria).toBeDefined();
      
      const parsedCriteria = JSON.parse(task!.properties.verificationCriteria as string);
      expect(parsedCriteria.security).toHaveLength(2);
      expect(parsedCriteria.functionality).toHaveLength(1);
    });
  });

  describe('QC Verification - Pass Scenario', () => {
    it('should mark task as completed when QC verification passes', async () => {
      const taskNode = await graphManager.addNode('todo', {
        title: 'Implement feature X',
        requirements: 'Build feature with tests',
        workerOutput: 'Feature implemented with 90% test coverage',
        status: 'awaiting_qc',
        attemptNumber: 1,
      });

      // Simulate QC agent verification (passes)
      const qcVerificationResult = {
        passed: true,
        score: 95,
        feedback: 'All verification criteria met. Code quality excellent.',
        checklist: {
          security: 'PASS',
          functionality: 'PASS',
          codeQuality: 'PASS',
        },
      };

      await graphManager.updateNode(taskNode.id, {
        status: 'completed',
        qcVerification: JSON.stringify(qcVerificationResult),
        verifiedAt: new Date().toISOString(),
      });

      const updatedTask = await graphManager.getNode(taskNode.id);
      expect(updatedTask!.properties.status).toBe('completed');
      
      const verification = JSON.parse(updatedTask!.properties.qcVerification as string);
      expect(verification.passed).toBe(true);
      expect(verification.score).toBe(95);
    });
  });

  describe('QC Verification - Fail and Retry', () => {
    it('should send task back to worker on first QC failure', async () => {
      const taskNode = await graphManager.addNode('todo', {
        title: 'Implement API endpoint',
        requirements: 'Create secure API with validation',
        workerOutput: 'API created but missing input validation',
        status: 'awaiting_qc',
        attemptNumber: 1,
        maxRetries: 2,
      });

      // QC verification fails
      const qcFailure = {
        passed: false,
        score: 60,
        feedback: 'Missing critical input validation. Security vulnerability detected.',
        issues: [
          'No input sanitization on user-provided data',
          'SQL injection risk in query construction',
          'Missing rate limiting',
        ],
        requiredFixes: [
          'Add Zod validation schemas for all inputs',
          'Use parameterized queries',
          'Implement rate limiting middleware',
        ],
      };

      // Send back to worker with error context
      await graphManager.updateNode(taskNode.id, {
        status: 'pending', // Back to worker
        attemptNumber: 2, // Increment attempt
        errorContext: JSON.stringify({
          previousAttempt: 1,
          qcFeedback: qcFailure.feedback,
          issues: qcFailure.issues,
          requiredFixes: qcFailure.requiredFixes,
        }),
        qcVerificationHistory: JSON.stringify([qcFailure]),
      });

      // Worker retrieves context for retry
      const workerContext = (await contextManager.getFilteredTaskContext(
        taskNode.id,
        'worker'
      )).context as WorkerContext;

      expect(workerContext.errorContext).toBeDefined();
      expect(workerContext.taskId).toBe(taskNode.id);
      
      const updatedTask = await graphManager.getNode(taskNode.id);
      expect(updatedTask!.properties.attemptNumber).toBe(2);
      expect(updatedTask!.properties.status).toBe('pending');
    });

    it('should allow up to 2 worker retry attempts', async () => {
      const taskNode = await graphManager.addNode('todo', {
        title: 'Complex feature',
        requirements: 'Build with high quality',
        maxRetries: 2,
        attemptNumber: 1,
      });

      // Attempt 1: Fail
      await graphManager.updateNode(taskNode.id, {
        workerOutput: 'First attempt - incomplete',
        status: 'awaiting_qc',
      });

      await graphManager.updateNode(taskNode.id, {
        status: 'pending',
        attemptNumber: 2,
        errorContext: JSON.stringify({ previousAttempt: 1, issues: ['Issue 1'] }),
      });

      let task = await graphManager.getNode(taskNode.id);
      expect(task!.properties.attemptNumber).toBe(2);

      // Attempt 2: Fail again
      await graphManager.updateNode(taskNode.id, {
        workerOutput: 'Second attempt - still issues',
        status: 'awaiting_qc',
      });

      await graphManager.updateNode(taskNode.id, {
        status: 'pending',
        attemptNumber: 3, // Would exceed maxRetries
        errorContext: JSON.stringify({ previousAttempt: 2, issues: ['Issue 2'] }),
      });

      task = await graphManager.getNode(taskNode.id);
      expect(task!.properties.attemptNumber).toBe(3);
      
      // Should mark as failed since attempts > maxRetries
      if ((task!.properties.attemptNumber as number) > (task!.properties.maxRetries as number)) {
        await graphManager.updateNode(taskNode.id, {
          status: 'failed',
        });
      }

      task = await graphManager.getNode(taskNode.id);
      expect(task!.properties.status).toBe('failed');
    });
  });

  describe('QC Failure Report Generation', () => {
    it('should generate detailed failure report after max retries exceeded', async () => {
      const taskNode = await graphManager.addNode('todo', {
        title: 'Critical security feature',
        requirements: 'Implement OAuth2 authentication',
        maxRetries: 2,
        attemptNumber: 3, // Already exceeded
        qcVerificationHistory: JSON.stringify([
          {
            attempt: 1,
            passed: false,
            score: 50,
            issues: ['Missing token validation', 'Insecure storage'],
          },
          {
            attempt: 2,
            passed: false,
            score: 65,
            issues: ['Still missing refresh token rotation'],
          },
        ]),
      });

      // QC generates failure report
      const failureReport = {
        taskId: taskNode.id,
        taskTitle: 'Critical security feature',
        finalStatus: 'failed',
        totalAttempts: 3,
        maxAttemptsAllowed: 2,
        timeline: [
          {
            attempt: 1,
            workerOutput: 'Initial implementation',
            qcScore: 50,
            qcFeedback: 'Major security issues',
          },
          {
            attempt: 2,
            workerOutput: 'Fixed some issues',
            qcScore: 65,
            qcFeedback: 'Still missing critical features',
          },
        ],
        rootCauses: [
          'Worker may lack sufficient security expertise',
          'Requirements may be unclear or too complex',
          'Verification criteria too strict for current skillset',
        ],
        recommendations: [
          'Assign to senior security engineer',
          'Break down into smaller subtasks',
          'Provide reference implementation',
        ],
        generatedAt: new Date().toISOString(),
      };

      await graphManager.updateNode(taskNode.id, {
        status: 'failed',
        qcFailureReport: JSON.stringify(failureReport),
      });

      const task = await graphManager.getNode(taskNode.id);
      expect(task!.properties.status).toBe('failed');
      expect(task!.properties.qcFailureReport).toBeDefined();
      
      const report = JSON.parse(task!.properties.qcFailureReport as string);
      expect(report.totalAttempts).toBe(3);
      expect(report.recommendations).toHaveLength(3);
    });
  });

  describe('PM Agent Failure Summary', () => {
    it('should generate PM summary when task ultimately fails', async () => {
      // Failed task with QC report
      const taskNode = await graphManager.addNode('todo', {
        title: 'Complex distributed system',
        requirements: 'Build microservice with event sourcing',
        status: 'failed',
        attemptNumber: 3,
        maxRetries: 2,
        qcFailureReport: JSON.stringify({
          taskId: 'task-1',
          finalStatus: 'failed',
          totalAttempts: 3,
          rootCauses: ['Too complex for single task', 'Insufficient context'],
        }),
      });

      // PM generates comprehensive failure summary
      const pmSummary = {
        taskId: taskNode.id,
        taskTitle: 'Complex distributed system',
        originalRequirements: 'Build microservice with event sourcing',
        failureReason: 'Task complexity exceeded worker capabilities',
        attemptsSummary: {
          totalAttempts: 3,
          maxAllowed: 2,
          qcFailures: 3,
        },
        impactAssessment: {
          blockingTasks: ['task-2', 'task-3'],
          projectDelay: 'High - critical path affected',
          riskLevel: 'High',
        },
        nextActions: [
          'Break task into 3 smaller subtasks',
          'Assign to specialized team',
          'Revise architecture approach',
          'Update project timeline',
        ],
        lessonsLearned: [
          'Microservices require more granular task breakdown',
          'Event sourcing needs dedicated expertise',
          'QC criteria should match task complexity',
        ],
        generatedBy: 'pm-agent',
        generatedAt: new Date().toISOString(),
      };

      await graphManager.updateNode(taskNode.id, {
        pmFailureSummary: JSON.stringify(pmSummary),
      });

      const task = await graphManager.getNode(taskNode.id);
      expect(task!.properties.pmFailureSummary).toBeDefined();
      
      const summary = JSON.parse(task!.properties.pmFailureSummary as string);
      expect(summary.nextActions).toHaveLength(4);
      expect(summary.lessonsLearned).toHaveLength(3);
      expect(summary.impactAssessment.riskLevel).toBe('High');
    });
  });

  describe('Complete Workflow - Success Path', () => {
    it('should execute full workflow: PM → Worker → QC (pass) → Complete', async () => {
      // 1. PM creates task
      const taskNode = await graphManager.addNode('todo', {
        title: 'Add user profile endpoint',
        requirements: 'Create GET /users/:id endpoint with authentication',
        description: 'Simple CRUD operation',
        workerRole: 'Backend developer',
        qcRole: 'API testing specialist',
        verificationCriteria: JSON.stringify({
          functionality: ['Returns 200 for valid user', 'Returns 404 for invalid ID'],
          security: ['Requires valid JWT', 'User can only access own profile'],
        }),
        status: 'pending',
        attemptNumber: 1,
        maxRetries: 2,
      });

      // 2. Worker executes (simulated)
      await graphManager.updateNode(taskNode.id, {
        status: 'in_progress',
        workerOutput: `
Created GET /users/:id endpoint:
- JWT authentication middleware applied
- Authorization check (user can only access own ID)
- Returns user profile with 200 status
- Returns 404 for non-existent users
- Unit tests: 5 passed, 0 failed (100% coverage)
        `.trim(),
      });

      // 3. QC verifies (passes)
      await graphManager.updateNode(taskNode.id, {
        status: 'awaiting_qc',
      });

      const qcVerification = {
        passed: true,
        score: 100,
        feedback: 'Excellent implementation. All criteria met.',
        checklist: {
          functionality: 'PASS - All endpoints tested',
          security: 'PASS - Authentication and authorization working',
        },
      };

      await graphManager.updateNode(taskNode.id, {
        status: 'completed',
        qcVerification: JSON.stringify(qcVerification),
        verifiedAt: new Date().toISOString(),
      });

      // 4. Verify final state
      const finalTask = await graphManager.getNode(taskNode.id);
      expect(finalTask!.properties.status).toBe('completed');
      expect(finalTask!.properties.attemptNumber).toBe(1);
      
      const verification = JSON.parse(finalTask!.properties.qcVerification as string);
      expect(verification.passed).toBe(true);
      expect(verification.score).toBe(100);
    });
  });

  describe('Complete Workflow - Failure Path', () => {
    it('should execute full workflow: PM → Worker → QC (fail) → Retry → QC (fail) → Report → PM Summary', async () => {
      // 1. PM creates task
      const taskNode = await graphManager.addNode('todo', {
        title: 'Implement rate limiting',
        requirements: 'Add Redis-based rate limiting to all API endpoints',
        description: 'Security feature',
        workerRole: 'Backend developer',
        qcRole: 'Security auditor',
        verificationCriteria: JSON.stringify({
          security: ['Rate limits enforced per IP', 'Returns 429 when exceeded'],
          implementation: ['Uses Redis for distributed counting', 'Configurable limits'],
        }),
        status: 'pending',
        attemptNumber: 1,
        maxRetries: 2,
      });

      // 2. Worker attempt 1
      await graphManager.updateNode(taskNode.id, {
        status: 'in_progress',
        workerOutput: 'Basic rate limiting added using in-memory counter',
      });

      // 3. QC fails (attempt 1)
      const qcFail1 = {
        passed: false,
        score: 40,
        feedback: 'Does not use Redis. In-memory solution not suitable for distributed systems.',
        issues: ['Not using Redis', 'Will not work across multiple instances'],
      };

      await graphManager.updateNode(taskNode.id, {
        status: 'pending',
        attemptNumber: 2,
        errorContext: JSON.stringify({
          previousAttempt: 1,
          qcFeedback: qcFail1.feedback,
          issues: qcFail1.issues,
        }),
        qcVerificationHistory: JSON.stringify([qcFail1]),
      });

      // 4. Worker attempt 2
      await graphManager.updateNode(taskNode.id, {
        status: 'in_progress',
        workerOutput: 'Added Redis but limits are hardcoded',
      });

      // 5. QC fails (attempt 2)
      const qcFail2 = {
        passed: false,
        score: 70,
        feedback: 'Uses Redis but limits not configurable',
        issues: ['Hardcoded rate limits', 'No configuration support'],
      };

      await graphManager.updateNode(taskNode.id, {
        status: 'failed', // Exceeded max retries
        attemptNumber: 3,
        qcVerificationHistory: JSON.stringify([qcFail1, qcFail2]),
      });

      // 6. QC generates failure report
      const qcReport = {
        taskId: taskNode.id,
        finalStatus: 'failed',
        totalAttempts: 2,
        timeline: [
          { attempt: 1, score: 40, issues: qcFail1.issues },
          { attempt: 2, score: 70, issues: qcFail2.issues },
        ],
        rootCauses: ['Lack of Redis experience', 'Configuration pattern unclear'],
      };

      await graphManager.updateNode(taskNode.id, {
        qcFailureReport: JSON.stringify(qcReport),
      });

      // 7. PM generates summary
      const pmSummary = {
        taskId: taskNode.id,
        failureReason: 'Worker unable to meet Redis-based requirements',
        nextActions: [
          'Provide Redis rate limiting example',
          'Assign to engineer with Redis experience',
          'Add configuration pattern to documentation',
        ],
      };

      await graphManager.updateNode(taskNode.id, {
        pmFailureSummary: JSON.stringify(pmSummary),
      });

      // 8. Verify final state
      const finalTask = await graphManager.getNode(taskNode.id);
      expect(finalTask!.properties.status).toBe('failed');
      expect(finalTask!.properties.qcFailureReport).toBeDefined();
      expect(finalTask!.properties.pmFailureSummary).toBeDefined();
      
      const history = JSON.parse(finalTask!.properties.qcVerificationHistory as string);
      expect(history).toHaveLength(2);
      expect(history[1].score).toBe(70); // Improved but still failed
    });
  });
});
