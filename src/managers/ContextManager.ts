/**
 * Context Manager - Multi-Agent Context Isolation
 * 
 * Filters task context based on agent type to prevent context pollution
 * and reduce worker memory footprint by 90%+
 */

import type {
  AgentType,
  WorkerContext,
  PMContext,
  QCContext,
  ContextFilterOptions,
  ContextMetrics,
  DEFAULT_CONTEXT_SCOPES
} from '../types/context.types.js';
import { DEFAULT_CONTEXT_SCOPES as SCOPES } from '../types/context.types.js';
import type { IGraphManager } from '../types/IGraphManager.js';

export class ContextManager {
  constructor(private graphManager: IGraphManager) {}

  /**
   * Filter context for a specific agent type with automatic scope reduction
   * 
   * Applies agent-specific filtering to reduce context size and prevent pollution.
   * PM agents receive full context, while workers get 90%+ reduction for focused
   * execution. QC agents receive worker context plus validation data.
   * 
   * Context Reduction Strategy:
   * - **PM Agent**: Full context (0% reduction) - needs complete project view
   * - **Worker Agent**: 90%+ reduction - only task essentials
   * - **QC Agent**: Worker context + validation criteria
   * 
   * @param fullContext - Complete PM context with all project data
   * @param agentType - Agent type ('pm', 'worker', 'qc')
   * @param options - Optional filtering configuration
   * @returns Filtered context appropriate for agent type
   * 
   * @example
   * // Filter for worker agent (90%+ reduction)
   * const pmContext: PMContext = {
   *   taskId: 'task-123',
   *   title: 'Implement authentication',
   *   requirements: 'Add JWT-based auth',
   *   description: 'Full implementation details...',
   *   files: ['src/auth.ts', 'src/middleware.ts'],
   *   research: '50 pages of OAuth research...',
   *   planningNotes: 'Extensive planning docs...',
   *   allFiles: ['100+ files in project...'],
   *   status: 'in_progress',
   *   priority: 'high'
   * };
   * 
   * const workerContext = contextManager.filterForAgent(pmContext, 'worker');
   * // Returns: { taskId, title, requirements, description, files (limited), status, priority }
   * // Removes: research, planningNotes, allFiles, fullSubgraph
   * 
   * @example
   * // PM agent gets full context
   * const pmContext = contextManager.filterForAgent(fullContext, 'pm');
   * // Returns: fullContext unchanged (0% reduction)
   * console.log('PM has access to all project data');
   * 
   * @example
   * // QC agent gets worker context + validation data
   * const qcContext = contextManager.filterForAgent(pmContext, 'qc');
   * // Returns: worker context + originalRequirements + verificationCriteria
   * console.log('QC can validate against requirements');
   * 
   * @example
   * // Custom filtering options
   * const workerContext = contextManager.filterForAgent(pmContext, 'worker', {
   *   maxFiles: 5,              // Limit to 5 files instead of default 10
   *   maxDependencies: 3,       // Limit dependencies
   *   includeErrorContext: true // Include error details for retry tasks
   * });
   */
  filterForAgent(
    fullContext: PMContext,
    agentType: AgentType,
    options?: Partial<ContextFilterOptions>
  ): WorkerContext | PMContext | QCContext {
    const scope = SCOPES[agentType];
    
    switch (agentType) {
      case 'pm':
        // PM gets full context
        return fullContext;
      
      case 'worker':
        return this.filterForWorker(fullContext, options);
      
      case 'qc':
        return this.filterForQC(fullContext, options);
      
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
  }

  /**
   * Filter context for worker agent
   * Only includes essential fields for task execution
   */
  private filterForWorker(
    fullContext: PMContext,
    options?: Partial<ContextFilterOptions>
  ): WorkerContext {
    const maxFiles = options?.maxFiles ?? 10;
    const maxDependencies = options?.maxDependencies ?? 5;
    const includeErrorContext = options?.includeErrorContext ?? true;

    const workerContext: WorkerContext = {
      taskId: fullContext.taskId,
      title: fullContext.title,
      requirements: fullContext.requirements,
      description: fullContext.description,
      status: fullContext.status,
      priority: fullContext.priority
    };

    // Add worker role if present
    if (fullContext.workerRole) {
      workerContext.workerRole = fullContext.workerRole;
    }

    // Add attempt tracking
    if (fullContext.attemptNumber !== undefined) {
      workerContext.attemptNumber = fullContext.attemptNumber;
    }
    if (fullContext.maxRetries !== undefined) {
      workerContext.maxRetries = fullContext.maxRetries;
    }

    // Limit file list size to prevent context bloat
    if (fullContext.files && fullContext.files.length > 0) {
      workerContext.files = fullContext.files.slice(0, maxFiles);
    }

    // Limit dependencies
    if (fullContext.dependencies && fullContext.dependencies.length > 0) {
      workerContext.dependencies = fullContext.dependencies.slice(0, maxDependencies);
    }

    // Include error context only for retry tasks (pass through as-is, could be string or object)
    if (includeErrorContext && fullContext.errorContext) {
      workerContext.errorContext = fullContext.errorContext;
    }

    return workerContext;
  }

  /**
   * Filter context for QC agent
   * Includes requirements and validation data
   */
  private filterForQC(
    fullContext: PMContext,
    options?: Partial<ContextFilterOptions>
  ): QCContext {
    const workerContext = this.filterForWorker(fullContext, options);

    return {
      ...workerContext,
      originalRequirements: fullContext.requirements,
      workerOutput: (fullContext as any).workerOutput,
      verificationCriteria: (fullContext as any).verificationCriteria,
      qcRole: (fullContext as any).qcRole
    };
  }

  /**
   * Calculate context size reduction metrics for validation
   * 
   * Measures the effectiveness of context filtering by comparing byte sizes
   * and tracking which fields were removed. Used to verify 90%+ reduction
   * target for worker agents.
   * 
   * @param fullContext - Original PM context
   * @param filteredContext - Filtered worker or QC context
   * @returns Metrics including sizes, reduction percentage, and field changes
   * 
   * @example
   * // Verify worker context reduction
   * const pmContext = buildFullContext();
   * const workerContext = contextManager.filterForAgent(pmContext, 'worker');
   * const metrics = contextManager.calculateReduction(pmContext, workerContext);
   * 
   * console.log('Original:', metrics.originalSize, 'bytes');
   * console.log('Filtered:', metrics.filteredSize, 'bytes');
   * console.log('Reduction:', metrics.reductionPercent.toFixed(1) + '%');
   * console.log('Removed fields:', metrics.fieldsRemoved.join(', '));
   * // Output: "Reduction: 92.3%"
   * // Removed fields: research, planningNotes, fullSubgraph, allFiles
   * 
   * @example
   * // Monitor context efficiency in production
   * const result = await contextManager.getFilteredTaskContext(
   *   'task-123',
   *   'worker'
   * );
   * 
   * if (result.metrics.reductionPercent < 90) {
   *   console.warn('Low reduction:', result.metrics.reductionPercent + '%');
   *   console.warn('Consider removing:', result.metrics.fieldsRetained.join(', '));
   * }
   * 
   * @example
   * // Compare different agent types
   * const workerMetrics = contextManager.calculateReduction(pmCtx, workerCtx);
   * const qcMetrics = contextManager.calculateReduction(pmCtx, qcCtx);
   * 
   * console.log('Worker reduction:', workerMetrics.reductionPercent + '%');
   * console.log('QC reduction:', qcMetrics.reductionPercent + '%');
   * // QC typically has slightly less reduction due to validation data
   */
  calculateReduction(
    fullContext: PMContext,
    filteredContext: WorkerContext | QCContext
  ): ContextMetrics {
    const fullSize = this.calculateSize(fullContext);
    const filteredSize = this.calculateSize(filteredContext);
    const reductionPercent = ((fullSize - filteredSize) / fullSize) * 100;

    const fullKeys = new Set(Object.keys(fullContext));
    const filteredKeys = new Set(Object.keys(filteredContext));
    
    const fieldsRemoved = Array.from(fullKeys).filter(k => !filteredKeys.has(k));
    const fieldsRetained = Array.from(filteredKeys);

    return {
      originalSize: fullSize,
      filteredSize,
      reductionPercent,
      fieldsRemoved,
      fieldsRetained
    };
  }

  /**
   * Calculate size of context object in bytes
   */
  private calculateSize(context: any): number {
    const json = JSON.stringify(context);
    // Use Buffer for accurate byte count (handles UTF-8)
    return Buffer.byteLength(json, 'utf8');
  }

  /**
   * Get task context from graph with automatic agent-specific filtering
   * 
   * Main entry point for multi-agent orchestration. Fetches task from Neo4j,
   * builds complete PM context, filters for agent type, and returns both
   * filtered context and reduction metrics.
   * 
   * Workflow:
   * 1. Fetch task node from graph database
   * 2. Build complete PM context from properties
   * 3. Optionally fetch subgraph for PM agents
   * 4. Filter context based on agent type
   * 5. Calculate and return reduction metrics
   * 
   * @param taskId - Task node ID in graph database
   * @param agentType - Agent type requesting context
   * @param options - Optional filtering configuration
   * @returns Filtered context and reduction metrics
   * @throws {Error} If task not found in database
   * 
   * @example
   * // Worker agent fetching task context
   * const result = await contextManager.getFilteredTaskContext(
   *   'task-auth-123',
   *   'worker'
   * );
   * 
   * console.log('Task:', result.context.title);
   * console.log('Requirements:', result.context.requirements);
   * console.log('Files:', result.context.files?.join(', '));
   * console.log('Context reduced by', result.metrics.reductionPercent.toFixed(1) + '%');
   * 
   * // Worker executes with minimal context
   * await executeTask(result.context);
   * 
   * @example
   * // PM agent fetching full context with subgraph
   * const pmResult = await contextManager.getFilteredTaskContext(
   *   'task-planning-456',
   *   'pm'
   * );
   * 
   * // PM gets everything including subgraph
   * console.log('Research:', pmResult.context.research);
   * console.log('Planning notes:', pmResult.context.planningNotes);
   * console.log('Subgraph nodes:', pmResult.context.fullSubgraph?.nodes.length);
   * console.log('All project files:', pmResult.context.allFiles?.length);
   * 
   * @example
   * // QC agent validating worker output
   * const qcResult = await contextManager.getFilteredTaskContext(
   *   'task-completed-789',
   *   'qc'
   * );
   * 
   * // QC gets worker context + validation data
   * const passed = validateOutput(
   *   qcResult.context.workerOutput,
   *   qcResult.context.originalRequirements,
   *   qcResult.context.verificationCriteria
   * );
   * 
   * @example
   * // Custom filtering for retry tasks
   * const retryResult = await contextManager.getFilteredTaskContext(
   *   'task-retry-999',
   *   'worker',
   *   {
   *     maxFiles: 5,
   *     includeErrorContext: true  // Include previous error for debugging
   *   }
   * );
   * 
   * if (retryResult.context.errorContext) {
   *   console.log('Previous error:', retryResult.context.errorContext);
   *   console.log('Attempt', retryResult.context.attemptNumber + '/' + retryResult.context.maxRetries);
   * }
   */
  async getFilteredTaskContext(
    taskId: string,
    agentType: AgentType,
    options?: Partial<ContextFilterOptions>
  ): Promise<{
    context: WorkerContext | PMContext | QCContext;
    metrics: ContextMetrics;
  }> {
    // Fetch task from graph
    const taskNode = await this.graphManager.getNode(taskId);
    if (!taskNode) {
      throw new Error(`Task not found`);
    }

    // Build full PM context from node properties
    let fullContext: PMContext = {
      taskId: taskNode.id,
      title: taskNode.properties.title || '',
      requirements: taskNode.properties.requirements || '',
      description: taskNode.properties.description,
      files: taskNode.properties.files || [],
      dependencies: taskNode.properties.dependencies || [],
      errorContext: taskNode.properties.errorContext,
      status: taskNode.properties.status,
      priority: taskNode.properties.priority,
      research: taskNode.properties.research,
      fullSubgraph: taskNode.properties.fullSubgraph,
      planningNotes: taskNode.properties.planningNotes,
      architectureDecisions: taskNode.properties.architectureDecisions,
      allFiles: taskNode.properties.allFiles
    };

    // Add fields needed for worker/QC contexts
    if (taskNode.properties.workerRole) fullContext.workerRole = taskNode.properties.workerRole;
    if (taskNode.properties.qcRole) fullContext.qcRole = taskNode.properties.qcRole;
    if (taskNode.properties.verificationCriteria) fullContext.verificationCriteria = taskNode.properties.verificationCriteria;
    if (taskNode.properties.workerOutput) fullContext.workerOutput = taskNode.properties.workerOutput;
    if (taskNode.properties.attemptNumber !== undefined) fullContext.attemptNumber = taskNode.properties.attemptNumber;
    if (taskNode.properties.maxRetries !== undefined) fullContext.maxRetries = taskNode.properties.maxRetries;

    // If PM agent and subgraph not already cached, fetch it
    if (agentType === 'pm' && !fullContext.fullSubgraph) {
      try {
        const subgraph = await this.graphManager.getSubgraph(taskId, 2);
        fullContext.fullSubgraph = subgraph as any;
      } catch (err) {
        // Subgraph fetch failed, continue without it
        console.warn(`Failed to fetch subgraph for task ${taskId}:`, err);
      }
    }

    // Filter based on agent type
    const filteredContext = this.filterForAgent(fullContext, agentType, options);
    
    // Calculate metrics
    const metrics = this.calculateReduction(fullContext, filteredContext as any);
    
    return {
      context: filteredContext,
      metrics
    };
  }

  /**
   * Validate that worker context meets 90%+ reduction requirement
   * 
   * Ensures worker context is <10% of PM context size to maintain
   * focused execution and prevent context pollution. Use this to
   * verify filtering effectiveness in tests or production monitoring.
   * 
   * @param fullContext - Original PM context
   * @param workerContext - Filtered worker context
   * @returns Validation result with boolean and detailed metrics
   * 
   * @example
   * // Validate context reduction in tests
   * const pmContext = buildPMContext(task);
   * const workerContext = contextManager.filterForAgent(pmContext, 'worker');
   * const validation = contextManager.validateContextReduction(
   *   pmContext,
   *   workerContext
   * );
   * 
   * expect(validation.valid).toBe(true);
   * expect(validation.metrics.reductionPercent).toBeGreaterThanOrEqual(90);
   * console.log('Context reduced by', validation.metrics.reductionPercent.toFixed(1) + '%');
   * 
   * @example
   * // Production monitoring with alerts
   * const validation = contextManager.validateContextReduction(
   *   pmContext,
   *   workerContext
   * );
   * 
   * if (!validation.valid) {
   *   console.error('Context reduction failed:', validation.metrics.reductionPercent + '%');
   *   console.error('Original:', validation.metrics.originalSize, 'bytes');
   *   console.error('Filtered:', validation.metrics.filteredSize, 'bytes');
   *   console.error('Fields retained:', validation.metrics.fieldsRetained.join(', '));
   *   
   *   // Alert ops team
   *   await alertOps('Context reduction below 90%', validation.metrics);
   * }
   * 
   * @example
   * // Validate custom filtering options
   * const customWorker = contextManager.filterForAgent(pmContext, 'worker', {
   *   maxFiles: 20  // More files than default
   * });
   * 
   * const validation = contextManager.validateContextReduction(
   *   pmContext,
   *   customWorker
   * );
   * 
   * if (!validation.valid) {
   *   console.warn('Increase maxFiles caused validation failure');
   *   console.warn('Consider reducing maxFiles to maintain 90% reduction');
   * }
   */
  validateContextReduction(
    fullContext: PMContext,
    workerContext: WorkerContext
  ): { valid: boolean; metrics: ContextMetrics } {
    const metrics = this.calculateReduction(fullContext, workerContext);
    const valid = metrics.reductionPercent >= 90; // At least 90% reduction

    return { valid, metrics };
  }

  /**
   * Get context scope definition for agent type
   * 
   * Returns the configured scope that defines which fields each agent
   * type is allowed to access. Used internally by filtering logic.
   * 
   * @param agentType - Agent type to get scope for
   * @returns Scope configuration with allowed fields
   * 
   * @example
   * // Check what fields worker agents can access
   * const workerScope = contextManager.getScope('worker');
   * console.log('Worker can access:', workerScope.fields);
   * // Output: ['taskId', 'title', 'requirements', 'description', 'files', ...]
   * 
   * @example
   * // Compare scopes across agent types
   * const pmScope = contextManager.getScope('pm');
   * const workerScope = contextManager.getScope('worker');
   * const qcScope = contextManager.getScope('qc');
   * 
   * console.log('PM fields:', pmScope.fields.length);
   * console.log('Worker fields:', workerScope.fields.length);
   * console.log('QC fields:', qcScope.fields.length);
   * 
   * @example
   * // Validate custom context against scope
   * const workerScope = contextManager.getScope('worker');
   * const customContext = buildCustomContext();
   * 
   * const invalidFields = Object.keys(customContext).filter(
   *   key => !workerScope.fields.includes(key)
   * );
   * 
   * if (invalidFields.length > 0) {
   *   console.warn('Invalid fields for worker:', invalidFields.join(', '));
   * }
   */
  getScope(agentType: AgentType) {
    return SCOPES[agentType];
  }
}
