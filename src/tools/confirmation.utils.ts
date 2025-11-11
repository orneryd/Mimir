// ============================================================================
// Confirmation Flow Utilities
// Provides secure token generation and validation for destructive operations
// ============================================================================

import crypto from 'crypto';

/**
 * Secret key for HMAC token generation (in production, load from env or secure store)
 * For now, using a per-process secret
 */
const SECRET_KEY = process.env.CONFIRMATION_SECRET || crypto.randomBytes(32).toString('hex');

/**
 * Token expiry time in milliseconds (default: 5 minutes)
 */
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Pending confirmations (in-memory store for simplicity)
 * In production, consider using Redis or database for distributed systems
 */
const pendingConfirmations = new Map<string, {
  action: string;
  params: any;
  createdAt: number;
  expiresAt: number;
}>();

/**
 * Generate a secure confirmation token for a destructive action
 * 
 * @param action - Action identifier (e.g., 'memory_clear', 'delete_node')
 * @param params - Parameters of the action (for verification)
 * @returns Confirmation ID that can be used to confirm the action
 */
export function generateConfirmationToken(action: string, params: any): string {
  const confirmationId = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  
  // Store pending confirmation
  pendingConfirmations.set(confirmationId, {
    action,
    params,
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY_MS
  });
  
  // Cleanup expired tokens periodically (simple approach)
  cleanupExpiredTokens();
  
  return confirmationId;
}

/**
 * Validate a confirmation token
 * 
 * @param confirmationId - Token to validate
 * @param action - Expected action identifier
 * @param params - Expected parameters (for verification)
 * @returns true if token is valid, false otherwise
 */
export function validateConfirmationToken(
  confirmationId: string,
  action: string,
  params: any
): boolean {
  const pending = pendingConfirmations.get(confirmationId);
  
  if (!pending) {
    return false; // Token not found
  }
  
  // Check expiry
  if (Date.now() > pending.expiresAt) {
    pendingConfirmations.delete(confirmationId);
    return false; // Token expired
  }
  
  // Verify action matches
  if (pending.action !== action) {
    return false; // Action mismatch
  }
  
  // Verify params match (basic comparison)
  if (JSON.stringify(pending.params) !== JSON.stringify(params)) {
    return false; // Params changed
  }
  
  return true;
}

/**
 * Consume a confirmation token (one-time use)
 * 
 * @param confirmationId - Token to consume
 */
export function consumeConfirmationToken(confirmationId: string): void {
  pendingConfirmations.delete(confirmationId);
}

/**
 * Clean up expired confirmation tokens
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [id, pending] of pendingConfirmations.entries()) {
    if (now > pending.expiresAt) {
      pendingConfirmations.delete(id);
    }
  }
}

/**
 * Get stats about pending confirmations (for monitoring)
 */
export function getConfirmationStats(): {
  pending: number;
  oldestAge: number | null;
} {
  const now = Date.now();
  let oldestAge: number | null = null;
  
  for (const pending of pendingConfirmations.values()) {
    const age = now - pending.createdAt;
    if (oldestAge === null || age > oldestAge) {
      oldestAge = age;
    }
  }
  
  return {
    pending: pendingConfirmations.size,
    oldestAge
  };
}
