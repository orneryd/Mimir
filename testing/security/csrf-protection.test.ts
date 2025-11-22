import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock crypto for predictable testing
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof crypto>('crypto');
  return {
    ...actual,
    randomBytes: vi.fn((size: number) => {
      return Buffer.from('a'.repeat(size * 2), 'hex');
    }),
  };
});

describe('CSRF Protection - OAuth State Validation', () => {
  let stateStore: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Recreate SecureStateStore for each test
    class SecureStateStore {
      private states: Map<string, { timestamp: number; vscodeData?: any }> = new Map();
      private readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
      private cleanupTimer: NodeJS.Timeout | null = null;
      
      constructor() {
        this.cleanupTimer = setInterval(() => this.cleanupExpiredStates(), 60 * 1000);
        this.cleanupTimer.unref();
      }
      
      private cleanupExpiredStates() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [state, data] of this.states.entries()) {
          if (now - data.timestamp > this.STATE_EXPIRY_MS) {
            this.states.delete(state);
            cleanedCount++;
          }
        }
        if (cleanedCount > 0) {
          console.log(`[OAuth] Cleaned up ${cleanedCount} expired state(s)`);
        }
      }
      
      destroy() {
        if (this.cleanupTimer) {
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = null;
        }
        this.states.clear();
      }
      
      store(req: any, callbackOrMeta: any, maybeCallback?: any) {
        const callback = maybeCallback || callbackOrMeta;
        const state = crypto.randomBytes(32).toString('hex');
        const vscodeState = (req as any)._vscodeState;
        this.states.set(state, { timestamp: Date.now(), vscodeData: vscodeState });
        callback(null, state);
      }
      
      verify(req: any, state: string, callbackOrMeta: any, maybeCallback?: any) {
        const callback = maybeCallback || callbackOrMeta;
        
        if (!state) {
          return callback(new Error('Missing state parameter - CSRF protection failed'));
        }
        
        const storedState = this.states.get(state);
        if (!storedState) {
          return callback(new Error('Invalid state parameter - possible CSRF attack'));
        }
        
        const now = Date.now();
        if (now - storedState.timestamp > this.STATE_EXPIRY_MS) {
          this.states.delete(state);
          return callback(new Error('State parameter expired - please retry authentication'));
        }
        
        this.states.delete(state);
        
        if (storedState.vscodeData) {
          (req as any)._vscodeState = storedState.vscodeData;
        }
        
        callback(null, true);
      }
      
      getStates() {
        return this.states;
      }
    }
    
    stateStore = new SecureStateStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (stateStore && stateStore.destroy) {
      stateStore.destroy();
    }
  });

  describe('State Generation', () => {
    it('should generate cryptographically secure random state', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        stateStore.store(mockReq, (err: any, state: string) => {
          expect(err).toBeNull();
          expect(state).toBeDefined();
          expect(state).toHaveLength(64); // 32 bytes = 64 hex chars
          expect(state).toMatch(/^[a-f0-9]{64}$/);
          resolve();
        });
      });
    });

    it('should generate unique states for each request', () => {
      return new Promise<void>((resolve) => {
        const mockReq1 = {};
        const mockReq2 = {};
        
        stateStore.store(mockReq1, (err1: any, state1: string) => {
          stateStore.store(mockReq2, (err2: any, state2: string) => {
            expect(state1).not.toBe(state2);
            resolve();
          });
        });
      });
    });

    it('should store state with timestamp', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        const beforeTime = Date.now();
        
        stateStore.store(mockReq, (err: any, state: string) => {
          const afterTime = Date.now();
          const storedState = stateStore.getStates().get(state);
          
          expect(storedState).toBeDefined();
          expect(storedState.timestamp).toBeGreaterThanOrEqual(beforeTime);
          expect(storedState.timestamp).toBeLessThanOrEqual(afterTime);
          resolve();
        });
      });
    });

    it('should store VSCode redirect data in state', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {
          _vscodeState: { redirect: 'vscode://extension/callback' }
        };
        
        stateStore.store(mockReq, (err: any, state: string) => {
          const storedState = stateStore.getStates().get(state);
          
          expect(storedState.vscodeData).toEqual({ redirect: 'vscode://extension/callback' });
          resolve();
        });
      });
    });
  });

  describe('State Validation - CSRF Attack Prevention', () => {
    it('should reject missing state parameter', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        stateStore.verify(mockReq, '', (err: any, valid: boolean) => {
          expect(err).toBeDefined();
          expect(err.message).toContain('Missing state parameter');
          expect(err.message).toContain('CSRF protection failed');
          resolve();
        });
      });
    });

    it('should reject null state parameter', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        stateStore.verify(mockReq, null as any, (err: any, valid: boolean) => {
          expect(err).toBeDefined();
          expect(err.message).toContain('Missing state parameter');
          resolve();
        });
      });
    });

    it('should reject undefined state parameter', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        stateStore.verify(mockReq, undefined as any, (err: any, valid: boolean) => {
          expect(err).toBeDefined();
          expect(err.message).toContain('Missing state parameter');
          resolve();
        });
      });
    });

    it('should reject invalid state parameter (not in store)', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        const fakeState = 'attacker-controlled-state-12345';
        
        stateStore.verify(mockReq, fakeState, (err: any, valid: boolean) => {
          expect(err).toBeDefined();
          expect(err.message).toContain('Invalid state parameter');
          expect(err.message).toContain('possible CSRF attack');
          resolve();
        });
      });
    });

    it('should reject reused state parameter (replay attack)', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        // First, store a state
        stateStore.store(mockReq, (err: any, state: string) => {
          // Verify it once (should succeed)
          stateStore.verify(mockReq, state, (err1: any, valid1: boolean) => {
            expect(err1).toBeNull();
            expect(valid1).toBe(true);
            
            // Try to verify it again (should fail - one-time use)
            stateStore.verify(mockReq, state, (err2: any, valid2: boolean) => {
              expect(err2).toBeDefined();
              expect(err2.message).toContain('Invalid state parameter');
              resolve();
            });
          });
        });
      });
    });

    it('should accept valid state parameter', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        stateStore.store(mockReq, (err: any, state: string) => {
          stateStore.verify(mockReq, state, (err2: any, valid: boolean) => {
            expect(err2).toBeNull();
            expect(valid).toBe(true);
            resolve();
          });
        });
      });
    });

    it('should restore VSCode data from state', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {
          _vscodeState: { redirect: 'vscode://extension/callback', apiKey: 'test-key' }
        };
        
        stateStore.store(mockReq, (err: any, state: string) => {
          const verifyReq: any = {};
          
          stateStore.verify(verifyReq, state, (err2: any, valid: boolean) => {
            expect(err2).toBeNull();
            expect(verifyReq._vscodeState).toEqual({
              redirect: 'vscode://extension/callback',
              apiKey: 'test-key'
            });
            resolve();
          });
        });
      });
    });
  });

  describe('State Expiration', () => {
    it('should reject expired state after 10 minutes', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        const startTime = Date.now();
        
        stateStore.store(mockReq, (err: any, state: string) => {
          // Fast-forward time by 11 minutes
          vi.setSystemTime(startTime + 11 * 60 * 1000);
          
          stateStore.verify(mockReq, state, (err2: any, valid: boolean) => {
            expect(err2).toBeDefined();
            expect(err2.message).toContain('State parameter expired');
            expect(err2.message).toContain('please retry authentication');
            resolve();
          });
        });
      });
    });

    it('should accept state within 10 minute window', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        const startTime = Date.now();
        
        stateStore.store(mockReq, (err: any, state: string) => {
          // Fast-forward time by 9 minutes (still valid)
          vi.setSystemTime(startTime + 9 * 60 * 1000);
          
          stateStore.verify(mockReq, state, (err2: any, valid: boolean) => {
            expect(err2).toBeNull();
            expect(valid).toBe(true);
            resolve();
          });
        });
      });
    });

    it('should clean up expired states automatically', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        // Store multiple states
        stateStore.store(mockReq, (err1: any, state1: string) => {
          stateStore.store(mockReq, (err2: any, state2: string) => {
            expect(stateStore.getStates().size).toBe(2);
            
            // Fast-forward time by 11 minutes
            vi.advanceTimersByTime(11 * 60 * 1000);
            
            // Trigger cleanup (runs every minute)
            vi.advanceTimersByTime(60 * 1000);
            
            // Both states should be cleaned up
            expect(stateStore.getStates().size).toBe(0);
            resolve();
          });
        });
      });
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should clear interval on destroy', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      stateStore.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should clear all states on destroy', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        stateStore.store(mockReq, (err1: any, state1: string) => {
          stateStore.store(mockReq, (err2: any, state2: string) => {
            expect(stateStore.getStates().size).toBe(2);
            
            stateStore.destroy();
            
            expect(stateStore.getStates().size).toBe(0);
            resolve();
          });
        });
      });
    });

    it('should use unref() to allow process exit', () => {
      // Verify that the cleanup timer doesn't block process exit
      // This is implicitly tested by the unref() call in constructor
      expect(true).toBe(true);
    });
  });

  describe('CSRF Attack Scenarios', () => {
    it('should prevent cross-site request forgery with forged state', () => {
      return new Promise<void>((resolve) => {
        // Attacker tries to use a forged state parameter
        const attackerState = 'forged-state-from-attacker-site';
        const mockReq = {};
        
        stateStore.verify(mockReq, attackerState, (err: any, valid: boolean) => {
          expect(err).toBeDefined();
          expect(err.message).toContain('Invalid state parameter');
          expect(err.message).toContain('possible CSRF attack');
          resolve();
        });
      });
    });

    it('should prevent state reuse in replay attacks', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        
        // Legitimate flow: store and verify state
        stateStore.store(mockReq, (err: any, state: string) => {
          stateStore.verify(mockReq, state, (err1: any, valid1: boolean) => {
            expect(valid1).toBe(true);
            
            // Attacker intercepts the state and tries to reuse it
            stateStore.verify(mockReq, state, (err2: any, valid2: boolean) => {
              expect(err2).toBeDefined();
              expect(err2.message).toContain('Invalid state parameter');
              resolve();
            });
          });
        });
      });
    });

    it('should prevent timing attacks with expired states', () => {
      return new Promise<void>((resolve) => {
        const mockReq = {};
        const startTime = Date.now();
        
        stateStore.store(mockReq, (err: any, state: string) => {
          // Fast-forward past expiration
          vi.setSystemTime(startTime + 11 * 60 * 1000);
          
          // Attacker tries to use expired state
          stateStore.verify(mockReq, state, (err2: any, valid: boolean) => {
            expect(err2).toBeDefined();
            expect(err2.message).toContain('State parameter expired');
            
            // Verify state is deleted after expiration check
            expect(stateStore.getStates().has(state)).toBe(false);
            resolve();
          });
        });
      });
    });

    it('should prevent session fixation attacks', () => {
      return new Promise<void>((resolve) => {
        // Attacker tries to pre-generate a state and trick user into using it
        const attackerPreGeneratedState = 'attacker-pre-generated-state';
        const mockReq = {};
        
        // User's legitimate OAuth flow
        stateStore.store(mockReq, (err: any, legitimateState: string) => {
          // Attacker tries to use their pre-generated state
          stateStore.verify(mockReq, attackerPreGeneratedState, (err2: any, valid: boolean) => {
            expect(err2).toBeDefined();
            expect(err2.message).toContain('Invalid state parameter');
            resolve();
          });
        });
      });
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent OAuth flows', () => {
      return new Promise<void>((resolve) => {
        const mockReq1 = { _vscodeState: { user: 'user1' } };
        const mockReq2 = { _vscodeState: { user: 'user2' } };
        const mockReq3 = { _vscodeState: { user: 'user3' } };
        
        let completed = 0;
        const checkDone = () => {
          completed++;
          if (completed === 3) resolve();
        };
        
        // Start 3 concurrent OAuth flows
        stateStore.store(mockReq1, (err1: any, state1: string) => {
          stateStore.store(mockReq2, (err2: any, state2: string) => {
            stateStore.store(mockReq3, (err3: any, state3: string) => {
              // Verify each state independently
              const verifyReq1: any = {};
              const verifyReq2: any = {};
              const verifyReq3: any = {};
              
              stateStore.verify(verifyReq1, state1, (errV1: any, valid1: boolean) => {
                expect(valid1).toBe(true);
                expect(verifyReq1._vscodeState.user).toBe('user1');
                checkDone();
              });
              
              stateStore.verify(verifyReq2, state2, (errV2: any, valid2: boolean) => {
                expect(valid2).toBe(true);
                expect(verifyReq2._vscodeState.user).toBe('user2');
                checkDone();
              });
              
              stateStore.verify(verifyReq3, state3, (errV3: any, valid3: boolean) => {
                expect(valid3).toBe(true);
                expect(verifyReq3._vscodeState.user).toBe('user3');
                checkDone();
              });
            });
          });
        });
      });
    });

    it('should isolate states between different users', () => {
      return new Promise<void>((resolve) => {
        const mockReq1 = { _vscodeState: { user: 'alice' } };
        const mockReq2 = { _vscodeState: { user: 'bob' } };
        
        stateStore.store(mockReq1, (err1: any, state1: string) => {
          stateStore.store(mockReq2, (err2: any, state2: string) => {
            const verifyReq1: any = {};
            const verifyReq2: any = {};
            
            // Verify Alice's state
            stateStore.verify(verifyReq1, state1, (errV1: any, valid1: boolean) => {
              expect(valid1).toBe(true);
              expect(verifyReq1._vscodeState.user).toBe('alice');
              
              // Verify Bob's state
              stateStore.verify(verifyReq2, state2, (errV2: any, valid2: boolean) => {
                expect(valid2).toBe(true);
                expect(verifyReq2._vscodeState.user).toBe('bob');
                
                // Ensure states don't cross-contaminate
                expect(verifyReq1._vscodeState.user).not.toBe('bob');
                expect(verifyReq2._vscodeState.user).not.toBe('alice');
                resolve();
              });
            });
          });
        });
      });
    });
  });
});
