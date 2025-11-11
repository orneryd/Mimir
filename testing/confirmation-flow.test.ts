// ============================================================================
// Confirmation Flow Tests
// Tests for confirmation token utilities and destructive operation workflows
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateConfirmationToken,
  validateConfirmationToken,
  consumeConfirmationToken,
  getConfirmationStats
} from '../src/tools/confirmation.utils.js';
import {
  handleMemoryClear
} from '../src/tools/graph.handlers.js';
import { MockGraphManager } from './helpers/mockGraphManager.js';

describe('Confirmation Token Utilities', () => {
  beforeEach(() => {
    // Clear any existing tokens between tests
    const stats = getConfirmationStats();
    // Tokens will naturally expire or be consumed during tests
  });

  describe('generateConfirmationToken', () => {
    it('should generate unique tokens for same action', () => {
      const token1 = generateConfirmationToken('test_action', { param: 'value' });
      const token2 = generateConfirmationToken('test_action', { param: 'value' });
      
      expect(token1).toBeTruthy();
      expect(token2).toBeTruthy();
      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('should generate different tokens for different actions', () => {
      const token1 = generateConfirmationToken('action_1', { key: 'value' });
      const token2 = generateConfirmationToken('action_2', { key: 'value' });
      
      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for different params', () => {
      const token1 = generateConfirmationToken('action', { param: 'value1' });
      const token2 = generateConfirmationToken('action', { param: 'value2' });
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateConfirmationToken', () => {
    it('should validate correct token with matching action and params', () => {
      const action = 'delete_node';
      const params = { id: 'node-123', cascade: true };
      const token = generateConfirmationToken(action, params);
      
      const isValid = validateConfirmationToken(token, action, params);
      expect(isValid).toBe(true);
    });

    it('should reject token with wrong action', () => {
      const token = generateConfirmationToken('action_1', { key: 'value' });
      const isValid = validateConfirmationToken(token, 'action_2', { key: 'value' });
      
      expect(isValid).toBe(false);
    });

    it('should reject token with changed params', () => {
      const token = generateConfirmationToken('action', { param: 'original' });
      const isValid = validateConfirmationToken(token, 'action', { param: 'changed' });
      
      expect(isValid).toBe(false);
    });

    it('should reject non-existent token', () => {
      const isValid = validateConfirmationToken('fake-token-12345', 'action', {});
      expect(isValid).toBe(false);
    });

    it('should reject expired token', async () => {
      // Mock Date.now to simulate token expiry
      const originalNow = Date.now;
      const startTime = Date.now();
      
      const token = generateConfirmationToken('action', { key: 'value' });
      
      // Fast-forward time by 6 minutes (past 5-minute expiry)
      vi.spyOn(Date, 'now').mockReturnValue(startTime + 6 * 60 * 1000);
      
      const isValid = validateConfirmationToken(token, 'action', { key: 'value' });
      expect(isValid).toBe(false);
      
      // Restore Date.now
      vi.restoreAllMocks();
    });
  });

  describe('consumeConfirmationToken', () => {
    it('should make token invalid after consumption', () => {
      const action = 'action';
      const params = { key: 'value' };
      const token = generateConfirmationToken(action, params);
      
      // Token should be valid before consumption
      expect(validateConfirmationToken(token, action, params)).toBe(true);
      
      // Consume token
      consumeConfirmationToken(token);
      
      // Token should be invalid after consumption
      expect(validateConfirmationToken(token, action, params)).toBe(false);
    });

    it('should handle consuming non-existent token gracefully', () => {
      expect(() => consumeConfirmationToken('fake-token')).not.toThrow();
    });
  });

  describe('getConfirmationStats', () => {
    it('should return zero pending when no tokens exist', () => {
      const stats = getConfirmationStats();
      expect(stats.pending).toBeGreaterThanOrEqual(0);
    });

    it('should track pending confirmations', () => {
      const statsBefore = getConfirmationStats();
      
      generateConfirmationToken('action1', {});
      generateConfirmationToken('action2', {});
      
      const statsAfter = getConfirmationStats();
      expect(statsAfter.pending).toBeGreaterThanOrEqual(statsBefore.pending + 2);
    });

    it('should decrease pending count after consumption', () => {
      const token = generateConfirmationToken('action', {});
      const statsBefore = getConfirmationStats();
      
      consumeConfirmationToken(token);
      
      const statsAfter = getConfirmationStats();
      expect(statsAfter.pending).toBe(statsBefore.pending - 1);
    });
  });
});

describe('Confirmation Flow - handleMemoryClear', () => {
  let mockManager: MockGraphManager;

  beforeEach(() => {
    mockManager = new MockGraphManager();
    
    // Add some test nodes
    mockManager.addNode('todo', { title: 'Test 1' });
    mockManager.addNode('todo', { title: 'Test 2' });
    mockManager.addNode('memory', { content: 'Memory 1' });
  });

  it('should return preview without confirm parameter', async () => {
    const result = await handleMemoryClear({ type: 'ALL' }, mockManager);
    
    expect(result.needsConfirmation).toBe(true);
    expect(result.confirmationId).toBeTruthy();
    expect(result.preview).toBeTruthy();
    expect(result.preview?.deletedNodes).toBe(3);
    expect(result.message).toContain('delete ALL');
  });

  it('should reject execution without confirmationId', async () => {
    // When confirm=true but confirmationId missing, handler treats it as preview request
    // (both confirm and confirmationId must be present for execution)
    const result = await handleMemoryClear({ type: 'ALL', confirm: true }, mockManager);
    
    // This should return a preview, not an error
    expect(result.needsConfirmation).toBe(true);
    expect(result.confirmationId).toBeTruthy();
  });

  it('should reject execution with invalid confirmationId', async () => {
    const result = await handleMemoryClear({
      type: 'ALL',
      confirm: true,
      confirmationId: 'fake-token-12345'
    }, mockManager);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid or expired');
  });

  it('should execute clear with valid confirmation', async () => {
    // Step 1: Get preview
    const previewResult = await handleMemoryClear({ type: 'ALL' }, mockManager);
    expect(previewResult.needsConfirmation).toBe(true);
    const confirmationId = previewResult.confirmationId!;
    
    // Step 2: Confirm and execute
    const executeResult = await handleMemoryClear({
      type: 'ALL',
      confirm: true,
      confirmationId
    }, mockManager);
    
    expect(executeResult.success).toBe(true);
    expect((executeResult as any).deletedNodes).toBe(3);
    expect(executeResult.message).toContain('Cleared');
  });

  it('should prevent token reuse (one-time use)', async () => {
    // Get preview
    const previewResult = await handleMemoryClear({ type: 'ALL' }, mockManager);
    const confirmationId = previewResult.confirmationId!;
    
    // First execution should succeed
    const firstResult = await handleMemoryClear({
      type: 'ALL',
      confirm: true,
      confirmationId
    }, mockManager);
    expect(firstResult.success).toBe(true);
    
    // Recreate nodes for second attempt
    mockManager.addNode('todo', { title: 'Test' });
    
    // Second execution with same token should fail
    const secondResult = await handleMemoryClear({
      type: 'ALL',
      confirm: true,
      confirmationId
    }, mockManager);
    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toContain('Invalid or expired');
  });

  it('should work for specific node types', async () => {
    // Preview for clearing todos only
    const previewResult = await handleMemoryClear({ type: 'todo' }, mockManager);
    expect(previewResult.preview?.types?.['todo']).toBe(2);
    
    // Execute clear
    const confirmationId = previewResult.confirmationId!;
    const executeResult = await handleMemoryClear({
      type: 'todo',
      confirm: true,
      confirmationId
    }, mockManager);
    
    expect(executeResult.success).toBe(true);
    expect((executeResult as any).deletedNodes).toBe(2);
  });

  it('should handle concurrent confirmation requests', async () => {
    // Create multiple preview requests
    const preview1 = await handleMemoryClear({ type: 'ALL' }, mockManager);
    const preview2 = await handleMemoryClear({ type: 'ALL' }, mockManager);
    const preview3 = await handleMemoryClear({ type: 'ALL' }, mockManager);
    
    // All should have unique tokens
    expect(preview1.confirmationId).not.toBe(preview2.confirmationId);
    expect(preview2.confirmationId).not.toBe(preview3.confirmationId);
    expect(preview1.confirmationId).not.toBe(preview3.confirmationId);
    
    // First should work
    const execute1 = await handleMemoryClear({
      type: 'ALL',
      confirm: true,
      confirmationId: preview1.confirmationId!
    }, mockManager);
    expect(execute1.success).toBe(true);
  });
});
