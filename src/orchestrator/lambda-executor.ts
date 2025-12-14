/**
 * @fileoverview Lambda Executor - Executes transformer Lambda scripts
 * 
 * Supports TypeScript/JavaScript and Python scripts for data transformation
 * between agent tasks in the workflow.
 * 
 * Features:
 * - TypeScript compilation and validation
 * - Sandboxed execution with require() for node_modules
 * - Access to safe Node.js builtins (path, url, crypto, etc.)
 * - NO file system write access (read-only for modules)
 * - NO process manipulation
 * - Default export convention for transform functions
 * - Python execution via subprocess with restricted access
 * - Unified input contract for N parallel agents
 * 
 * @module orchestrator/lambda-executor
 * @since 1.1.0
 */

import { spawn, ChildProcess } from 'child_process';
import * as vm from 'vm';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import * as ts from 'typescript';
import { createRequire } from 'module';
import { type CancellationToken } from './cancellation.js';

// ============================================================================
// Safe Node.js Builtins for Sandbox
// ============================================================================

// Create a require function rooted at the project's node_modules
const projectRequire = createRequire(path.join(process.cwd(), 'node_modules'));

/**
 * List of allowed Node.js builtin modules (read-only or safe utilities)
 */
const ALLOWED_BUILTINS = new Set([
  // Safe utilities
  'path',
  'url',
  'querystring',
  'util',
  'assert',
  'events',
  'stream',
  'string_decoder',
  'buffer',
  'crypto',        // Cryptographic functions (hashing, etc.)
  'zlib',          // Compression
  'punycode',
  'tty',
  // Data formats
  'json',
]);

/**
 * Blocked modules that could cause harm
 */
const BLOCKED_MODULES = new Set([
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'domain',
  'http',
  'http2',
  'https',
  'net',
  'readline',
  'repl',
  'tls',
  'vm',
  'worker_threads',
  // File system - we provide a restricted version
  'fs',
  'fs/promises',
  // Process control
  'process',
  'v8',
  'perf_hooks',
  'async_hooks',
]);

/**
 * Create a sandboxed require function
 * - Allows all packages from node_modules
 * - Allows safe Node.js builtins
 * - Blocks dangerous builtins (fs write, child_process, etc.)
 */
function createSandboxedRequire() {
  return function sandboxedRequire(moduleName: string): any {
    // Special case: provide read-only fs subset (check BEFORE blocked modules)
    if (moduleName === 'fs' || moduleName === 'fs/promises') {
      return createReadOnlyFs();
    }
    
    // Check if it's a blocked builtin
    if (BLOCKED_MODULES.has(moduleName)) {
      throw new Error(`Module "${moduleName}" is blocked in Lambda sandbox for security`);
    }
    
    // Allow safe builtins - use projectRequire (ESM doesn't have global require)
    if (ALLOWED_BUILTINS.has(moduleName)) {
      return projectRequire(moduleName);
    }
    
    // Try to load from node_modules
    try {
      return projectRequire(moduleName);
    } catch (err: any) {
      // If not found in node_modules, check if it's a blocked builtin we missed
      if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
        // Check if it's a Node.js builtin
        try {
          projectRequire.resolve(moduleName);
          // It exists as a builtin but wasn't in our allowed list
          throw new Error(`Node.js builtin "${moduleName}" is not allowed in Lambda sandbox`);
        } catch {
          // Not a builtin, propagate the original error
          throw new Error(`Cannot find module "${moduleName}" - ensure it's installed in node_modules`);
        }
      }
      throw err;
    }
  };
}

/**
 * Create a read-only fs module (no write operations)
 */
function createReadOnlyFs() {
  return {
    // Read-only operations only
    readFileSync: fsSync.readFileSync.bind(fsSync),
    readFile: fsSync.readFile.bind(fsSync),
    existsSync: fsSync.existsSync.bind(fsSync),
    statSync: fsSync.statSync.bind(fsSync),
    readdirSync: fsSync.readdirSync.bind(fsSync),
    
    // Blocked write operations - throw helpful errors
    writeFileSync: () => { throw new Error('fs.writeFileSync is blocked in Lambda sandbox'); },
    writeFile: () => { throw new Error('fs.writeFile is blocked in Lambda sandbox'); },
    appendFileSync: () => { throw new Error('fs.appendFileSync is blocked in Lambda sandbox'); },
    appendFile: () => { throw new Error('fs.appendFile is blocked in Lambda sandbox'); },
    unlinkSync: () => { throw new Error('fs.unlinkSync is blocked in Lambda sandbox'); },
    unlink: () => { throw new Error('fs.unlink is blocked in Lambda sandbox'); },
    mkdirSync: () => { throw new Error('fs.mkdirSync is blocked in Lambda sandbox'); },
    mkdir: () => { throw new Error('fs.mkdir is blocked in Lambda sandbox'); },
    rmdirSync: () => { throw new Error('fs.rmdirSync is blocked in Lambda sandbox'); },
    rmdir: () => { throw new Error('fs.rmdir is blocked in Lambda sandbox'); },
    rmSync: () => { throw new Error('fs.rmSync is blocked in Lambda sandbox'); },
    rm: () => { throw new Error('fs.rm is blocked in Lambda sandbox'); },
    renameSync: () => { throw new Error('fs.renameSync is blocked in Lambda sandbox'); },
    rename: () => { throw new Error('fs.rename is blocked in Lambda sandbox'); },
    copyFileSync: () => { throw new Error('fs.copyFileSync is blocked in Lambda sandbox'); },
    copyFile: () => { throw new Error('fs.copyFile is blocked in Lambda sandbox'); },
    chmodSync: () => { throw new Error('fs.chmodSync is blocked in Lambda sandbox'); },
    chmod: () => { throw new Error('fs.chmod is blocked in Lambda sandbox'); },
    chownSync: () => { throw new Error('fs.chownSync is blocked in Lambda sandbox'); },
    chown: () => { throw new Error('fs.chown is blocked in Lambda sandbox'); },
    createWriteStream: () => { throw new Error('fs.createWriteStream is blocked in Lambda sandbox'); },
    // Allow read streams
    createReadStream: fsSync.createReadStream.bind(fsSync),
    
    // Constants
    constants: fsSync.constants,
  };
}

// ============================================================================
// Lambda Input/Output Contract
// ============================================================================

/**
 * QC verification result from an agent task
 */
export interface QCVerificationResult {
  passed: boolean;
  score: number;
  feedback: string;
  issues: string[];
  requiredFixes: string[];
}

/**
 * Result from a single upstream task (agent or transformer)
 */
export interface TaskResult {
  /** Unique task identifier */
  taskId: string;
  /** Human-readable task title */
  taskTitle: string;
  /** Type of task */
  taskType: 'agent' | 'transformer';
  /** Task execution status */
  status: 'success' | 'failure';
  /** Duration in milliseconds */
  duration: number;
  
  // Agent-specific fields
  /** Worker agent output (for agent tasks) */
  workerOutput?: string;
  /** QC verification result (for agent tasks) */
  qcResult?: QCVerificationResult;
  /** Agent role description (for agent tasks) */
  agentRole?: string;
  
  // Transformer-specific fields
  /** Transformer output (for transformer tasks) */
  transformerOutput?: string;
  /** Lambda name that was executed (for transformer tasks) */
  lambdaName?: string;
}

/**
 * Metadata about the Lambda execution context
 */
export interface LambdaMeta {
  /** Current transformer task ID */
  transformerId: string;
  /** Name of this Lambda */
  lambdaName: string;
  /** Number of upstream dependencies */
  dependencyCount: number;
  /** Execution ID for the workflow */
  executionId: string;
}

/**
 * Unified Lambda input contract
 * 
 * This is the ONLY input type Lambdas receive. It provides:
 * - Structured access to ALL dependency outputs
 * - Both worker output AND QC feedback for each agent task
 * - Consistent API whether 1 task or N parallel tasks
 * - No conditional logic needed in Lambda code
 * 
 * @example
 * ```typescript
 * function transform(input: LambdaInput): string {
 *   // Process all upstream task outputs
 *   const summaries = input.tasks.map(task => {
 *     if (task.taskType === 'agent') {
 *       return `${task.taskTitle}: ${task.workerOutput?.substring(0, 100)}...`;
 *     } else {
 *       return `${task.lambdaName}: ${task.transformerOutput?.substring(0, 100)}...`;
 *     }
 *   });
 *   
 *   return summaries.join('\n\n');
 * }
 * ```
 */
export interface LambdaInput {
  /** Array of results from all upstream dependencies */
  tasks: TaskResult[];
  /** Metadata about this Lambda execution */
  meta: LambdaMeta;
}

/**
 * Result from Lambda execution
 */
export interface LambdaResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

/**
 * Result from Lambda compilation/validation
 */
export interface LambdaValidationResult {
  valid: boolean;
  compiledCode?: string;
  errors?: string[];
}

// ============================================================================
// DEPRECATED - Old context interface (kept for backward compatibility)
// ============================================================================

/**
 * @deprecated Use LambdaInput instead. This interface is kept for backward
 * compatibility but will be removed in a future version.
 */
export interface LambdaContext {
  /** @deprecated Use input.tasks instead */
  workerOutputs: string[];
  /** @deprecated Use input.tasks[].qcResult instead */
  previousContext: string;
  /** @deprecated Use input.meta.transformerId instead */
  previousTaskId: string;
  /** @deprecated Check input.tasks[].taskType instead */
  previousWasLambda: boolean;
}

// ============================================================================
// TypeScript Compilation
// ============================================================================

/**
 * Compile TypeScript to JavaScript
 */
function compileTypeScript(script: string): { success: boolean; code?: string; error?: string } {
  try {
    const result = ts.transpileModule(script, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        strict: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        noImplicitAny: false,
      },
      reportDiagnostics: true,
    });

    if (result.diagnostics && result.diagnostics.length > 0) {
      const errors = result.diagnostics.map(d => 
        typeof d.messageText === 'string' 
          ? d.messageText 
          : d.messageText.messageText
      );
      const hasErrors = result.diagnostics.some(d => d.category === ts.DiagnosticCategory.Error);
      if (hasErrors) {
        return { success: false, error: errors.join('\n') };
      }
    }

    return { success: true, code: result.outputText };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a Lambda script and check for transform function
 */
export function validateLambdaScript(
  script: string,
  language: 'typescript' | 'javascript' | 'python'
): LambdaValidationResult {
  const errors: string[] = [];

  if (language === 'python') {
    if (!script.includes('def transform(')) {
      errors.push('Python script must define: def transform(input):');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  let codeToValidate = script;

  if (language === 'typescript') {
    const compileResult = compileTypeScript(script);
    if (!compileResult.success) {
      return { valid: false, errors: [compileResult.error || 'TypeScript compilation failed'] };
    }
    codeToValidate = compileResult.code!;
  }

  const hasDefaultExport = /export\s+default/.test(script) || 
                           /module\.exports\s*=/.test(codeToValidate) ||
                           /exports\.default\s*=/.test(codeToValidate);
  const hasTransformFunction = /function\s+transform\s*\(/.test(script) ||
                               /const\s+transform\s*=/.test(script) ||
                               /let\s+transform\s*=/.test(script) ||
                               /var\s+transform\s*=/.test(script);

  if (!hasDefaultExport && !hasTransformFunction) {
    errors.push('Lambda script must export a default function or define a transform function');
  }

  try {
    new vm.Script(codeToValidate, { filename: 'lambda-validation.js' });
  } catch (parseError: any) {
    errors.push(`Syntax error: ${parseError.message}`);
  }

  return {
    valid: errors.length === 0,
    compiledCode: codeToValidate,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ============================================================================
// JavaScript/TypeScript Execution
// ============================================================================

/**
 * Execute a TypeScript/JavaScript Lambda script with the new unified input
 * 
 * Security features:
 * - Sandboxed VM execution with timeout
 * - require() access to node_modules packages
 * - Safe Node.js builtins (path, url, crypto, etc.)
 * - Read-only file system access
 * - Blocked: child_process, net, http, file writes, process control
 * - fetch() for HTTP requests
 */
async function executeJSLambda(
  script: string,
  language: 'typescript' | 'javascript',
  input: LambdaInput,
  cancellationToken?: CancellationToken
): Promise<LambdaResult> {
  const startTime = Date.now();
  
  try {
    // Check for cancellation
    cancellationToken?.throwIfCancelled();
    
    // Compile TypeScript if needed
    let jsCode = script;
    if (language === 'typescript') {
      const compileResult = compileTypeScript(script);
      if (!compileResult.success) {
        return {
          success: false,
          output: '',
          error: `TypeScript compilation failed: ${compileResult.error}`,
          duration: Date.now() - startTime,
        };
      }
      jsCode = compileResult.code!;
    }

    // Create sandboxed require function
    const sandboxedRequire = createSandboxedRequire();

    // Create a restricted process object (read-only, no control)
    const restrictedProcess = {
      env: { ...process.env }, // Copy of env vars (read-only)
      cwd: () => process.cwd(),
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      versions: { ...process.versions },
      // Block dangerous operations
      exit: () => { throw new Error('process.exit is blocked in Lambda sandbox'); },
      kill: () => { throw new Error('process.kill is blocked in Lambda sandbox'); },
      abort: () => { throw new Error('process.abort is blocked in Lambda sandbox'); },
      chdir: () => { throw new Error('process.chdir is blocked in Lambda sandbox'); },
      setuid: () => { throw new Error('process.setuid is blocked in Lambda sandbox'); },
      setgid: () => { throw new Error('process.setgid is blocked in Lambda sandbox'); },
      umask: () => { throw new Error('process.umask is blocked in Lambda sandbox'); },
    };

    // Create sandbox with allowed globals
    const sandbox: any = {
      // Console (prefixed output)
      console: {
        log: (...args: any[]) => console.log('[Lambda]', ...args),
        error: (...args: any[]) => console.error('[Lambda Error]', ...args),
        warn: (...args: any[]) => console.warn('[Lambda Warn]', ...args),
        info: (...args: any[]) => console.info('[Lambda Info]', ...args),
        debug: (...args: any[]) => console.debug('[Lambda Debug]', ...args),
        trace: (...args: any[]) => console.trace('[Lambda Trace]', ...args),
        table: (...args: any[]) => console.table(...args),
        dir: (...args: any[]) => console.dir(...args),
        time: console.time.bind(console),
        timeEnd: console.timeEnd.bind(console),
        timeLog: console.timeLog.bind(console),
        assert: console.assert.bind(console),
        count: console.count.bind(console),
        countReset: console.countReset.bind(console),
        group: console.group.bind(console),
        groupEnd: console.groupEnd.bind(console),
        groupCollapsed: console.groupCollapsed.bind(console),
        clear: () => {}, // Disabled
      },
      
      // JavaScript builtins
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Date,
      Math,
      RegExp,
      Error,
      TypeError,
      SyntaxError,
      RangeError,
      ReferenceError,
      URIError,
      EvalError,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      Proxy,
      Reflect,
      Symbol,
      BigInt,
      ArrayBuffer,
      SharedArrayBuffer,
      DataView,
      Int8Array,
      Uint8Array,
      Uint8ClampedArray,
      Int16Array,
      Uint16Array,
      Int32Array,
      Uint32Array,
      Float32Array,
      Float64Array,
      BigInt64Array,
      BigUint64Array,
      
      // Node.js globals
      Buffer,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      
      // Async/timing
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      setImmediate: globalThis.setImmediate,
      clearImmediate: globalThis.clearImmediate,
      queueMicrotask: globalThis.queueMicrotask,
      
      // Network (fetch only - controlled HTTP access)
      fetch: globalThis.fetch,
      Headers: globalThis.Headers,
      Request: globalThis.Request,
      Response: globalThis.Response,
      FormData: globalThis.FormData,
      AbortController: globalThis.AbortController,
      AbortSignal: globalThis.AbortSignal,
      
      // Encoding
      atob: globalThis.atob,
      btoa: globalThis.btoa,
      encodeURI,
      encodeURIComponent,
      decodeURI,
      decodeURIComponent,
      escape,
      unescape,
      
      // Math/parsing
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      NaN,
      Infinity,
      undefined,
      
      // Sandboxed require for node_modules
      require: sandboxedRequire,
      
      // Restricted process object
      process: restrictedProcess,
      
      // Globals
      global: {}, // Empty global object
      globalThis: {}, // Empty globalThis
      
      // The unified input object
      __input: input,
      
      // Module support
      module: { exports: {} },
      exports: {},
      __filename: 'lambda.js',
      __dirname: process.cwd(),
      
      // Output placeholders
      __result: undefined as any,
      __error: undefined as any,
    };
    
    // Make sandbox.global and sandbox.globalThis reference sandbox itself
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;

    // Lambda timeout in milliseconds (30 seconds)
    const LAMBDA_TIMEOUT_MS = 30000;
    
    // Wrap script to handle different export conventions with proper async timeout
    const wrappedScript = `
      (async function() {
        try {
          ${jsCode}
          
          // Find the transform function
          let transformFn = null;
          
          if (typeof module.exports === 'function') {
            transformFn = module.exports;
          } else if (typeof module.exports.default === 'function') {
            transformFn = module.exports.default;
          } else if (typeof exports.default === 'function') {
            transformFn = exports.default;
          } else if (typeof transform === 'function') {
            transformFn = transform;
          } else if (typeof module.exports.transform === 'function') {
            transformFn = module.exports.transform;
          }
          
          if (!transformFn) {
            throw new Error('Lambda must export a default function or define transform(input)');
          }
          
          // Execute with the unified input - handle both sync and async
          const resultOrPromise = transformFn(__input);
          
          // Check if result is a Promise
          if (resultOrPromise && typeof resultOrPromise.then === 'function') {
            // It's a Promise - store it for external timeout handling
            __pendingPromise = resultOrPromise;
          } else {
            // Synchronous result
            __result = resultOrPromise;
          }
        } catch (err) {
          __error = err.message || String(err);
        }
      })();
    `;

    // Add pending promise placeholder to sandbox
    sandbox.__pendingPromise = null;

    // Run in VM sandbox with timeout for synchronous code
    const vmScript = new vm.Script(wrappedScript, { 
      filename: 'lambda.js',
      lineOffset: 0,
      columnOffset: 0,
    });
    const vmContext = vm.createContext(sandbox, {
      name: 'Lambda Sandbox',
      codeGeneration: {
        strings: false, // Disable eval() from strings
        wasm: false,    // Disable WebAssembly
      },
    });
    
    // Execute synchronous part with timeout
    await vmScript.runInContext(vmContext, { 
      timeout: LAMBDA_TIMEOUT_MS,
      breakOnSigint: true,
    });
    
    // If there's a pending promise, wait for it with timeout
    if (sandbox.__pendingPromise) {
      try {
        // Create a timeout promise that rejects after LAMBDA_TIMEOUT_MS
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Lambda async operation timed out after ${LAMBDA_TIMEOUT_MS / 1000} seconds`));
          }, LAMBDA_TIMEOUT_MS);
        });
        
        // Race between the actual promise and the timeout
        const result = await Promise.race([
          sandbox.__pendingPromise,
          timeoutPromise
        ]);
        
        sandbox.__result = result;
      } catch (asyncError: any) {
        // Handle rejected promises or timeouts
        sandbox.__error = asyncError.message || String(asyncError);
      }
    } else {
      // Wait a bit for any microtasks to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Check for cancellation after execution
    cancellationToken?.throwIfCancelled();

    if (sandbox.__error) {
      return {
        success: false,
        output: '',
        error: sandbox.__error,
        duration: Date.now() - startTime,
      };
    }

    let output = sandbox.__result;
    if (output === undefined || output === null) {
      output = '';
    } else if (typeof output !== 'string') {
      output = JSON.stringify(output, null, 2);
    }

    return {
      success: true,
      output,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    // Handle timeout specifically
    if (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      return {
        success: false,
        output: '',
        error: 'Lambda execution timed out (30 second limit)',
        duration: Date.now() - startTime,
      };
    }
    
    return {
      success: false,
      output: '',
      error: error.message || String(error),
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Python Execution
// ============================================================================

/**
 * Execute a Python Lambda script with the new unified input
 * 
 * Security features:
 * - Runs in subprocess with timeout
 * - Restricted builtins (no os.system, subprocess, etc.)
 * - fetch() helper for HTTP requests
 * - File write operations blocked
 * - stdin/stdout for I/O only
 */
async function executePythonLambda(
  script: string,
  input: LambdaInput,
  cancellationToken?: CancellationToken
): Promise<LambdaResult> {
  const startTime = Date.now();
  
  try {
    cancellationToken?.throwIfCancelled();
    
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, `lambda_${Date.now()}.py`);
    
    // Wrap with unified input handling and comprehensive sandboxing
    const wrappedScript = `
import sys
import json
import builtins

# ============================================================================
# COMPREHENSIVE SANDBOX: Block ALL dangerous operations
# ============================================================================

# Save original functions we need
_original_open = builtins.open
_original_import = builtins.__import__

# ============================================================================
# BLOCKED MODULES - Dangerous built-in modules
# ============================================================================
BLOCKED_MODULES = {
    # Process/System control
    'os', 'subprocess', 'shutil', 'pathlib', 'tempfile',
    'signal', 'resource', 'sysconfig', 'platform',
    
    # Networking (direct - use fetch() instead)
    'socket', 'ssl', 'http', 'http.client', 'http.server',
    'ftplib', 'smtplib', 'poplib', 'imaplib', 'nntplib', 'telnetlib',
    'socketserver', 'xmlrpc', 'ipaddress',
    
    # Parallelism/Threading
    'multiprocessing', 'threading', 'concurrent', '_thread',
    'queue', 'sched', 'contextvars',
    
    # C extensions / FFI (can bypass Python restrictions)
    'ctypes', 'cffi', 'ffi',
    
    # Serialization (can execute arbitrary code on load)
    'pickle', 'cPickle', 'shelve', 'dbm', 'marshal',
    
    # Code execution/compilation
    'code', 'codeop', 'compile', 'compileall', 'py_compile',
    'ast', 'dis', 'symtable', 'token', 'tokenize',
    
    # Import system manipulation
    'importlib', 'imp', 'pkgutil', 'modulefinder', 'zipimport',
    
    # Terminal/PTY (can spawn shells)
    'pty', 'tty', 'termios', 'curses', 'readline',
    
    # Debugging/Inspection (can access internals)
    'inspect', 'traceback', 'gc', 'sys', 'warnings',
    'faulthandler', 'tracemalloc',
    
    # Async (can escape sandbox timing)
    'asyncio', 'selectors', 'select',
    
    # Logging (can write to files)
    'logging',
    
    # Database (file access)
    'sqlite3',
    
    # Dangerous pip packages that wrap system calls
    'sh', 'invoke', 'plumbum', 'pexpect', 'fabric', 'paramiko',
    'psutil', 'pyautogui', 'keyboard', 'mouse',
    'watchdog', 'inotify',
}

# ============================================================================
# BLOCKED BUILTINS - Dangerous built-in functions
# ============================================================================
BLOCKED_BUILTINS = {
    'exec', 'eval', 'compile',
    '__import__',  # We provide our own
    'open',        # We provide our own
    'input',       # No interactive input
    'breakpoint',  # No debugging
    'help',        # No pydoc
    'credits', 'copyright', 'license',  # No interactive stuff
}

# ============================================================================
# Sandboxed import function
# ============================================================================
def _sandboxed_import(name, globals=None, locals=None, fromlist=(), level=0):
    """Restricted import - blocks dangerous modules"""
    # Get base module name
    base_module = name.split('.')[0]
    
    # Check if module or any parent is blocked
    if base_module in BLOCKED_MODULES:
        raise ImportError(f"Module '{name}' is blocked in Lambda sandbox for security")
    
    # Check full module path too
    if name in BLOCKED_MODULES:
        raise ImportError(f"Module '{name}' is blocked in Lambda sandbox for security")
    
    # Import the module
    module = _original_import(name, globals, locals, fromlist, level)
    
    # Post-import checks: some modules expose dangerous submodules
    # Block access to os through other modules
    if hasattr(module, 'os'):
        delattr(module, 'os') if not isinstance(getattr(module, 'os', None), type) else None
    
    return module

# ============================================================================
# Sandboxed open function
# ============================================================================
def _sandboxed_open(file, mode='r', *args, **kwargs):
    """Restricted open - read-only, no /proc, /dev, etc."""
    # Block write modes
    if any(m in str(mode) for m in ['w', 'a', 'x', '+']):
        raise PermissionError("File writing is blocked in Lambda sandbox")
    
    # Block dangerous paths
    file_str = str(file)
    dangerous_paths = ['/proc', '/sys', '/dev', '/etc/passwd', '/etc/shadow', 
                       '~/.ssh', '~/.aws', '~/.config', '/root', '/home']
    for path in dangerous_paths:
        if path in file_str or file_str.startswith(path):
            raise PermissionError(f"Access to '{path}' is blocked in Lambda sandbox")
    
    return _original_open(file, mode, *args, **kwargs)

# ============================================================================
# Apply all sandbox restrictions
# ============================================================================

# Replace import
builtins.__import__ = _sandboxed_import

# Replace open
builtins.open = _sandboxed_open

# Block dangerous builtins
def _make_blocker(name):
    def blocked(*args, **kwargs):
        raise PermissionError(f"{name}() is blocked in Lambda sandbox")
    return blocked

for name in BLOCKED_BUILTINS:
    if hasattr(builtins, name):
        setattr(builtins, name, _make_blocker(name))

# Block getattr/setattr on modules (prevent accessing _module internals)
_original_getattr = builtins.getattr
def _sandboxed_getattr(obj, name, *default):
    # Block access to dunder attributes that can escape sandbox
    if name.startswith('__') and name.endswith('__'):
        allowed_dunders = {'__name__', '__doc__', '__dict__', '__class__', 
                          '__str__', '__repr__', '__len__', '__iter__',
                          '__getitem__', '__setitem__', '__contains__',
                          '__add__', '__sub__', '__mul__', '__truediv__',
                          '__eq__', '__ne__', '__lt__', '__gt__', '__le__', '__ge__',
                          '__bool__', '__int__', '__float__', '__hash__'}
        if name not in allowed_dunders:
            if default:
                return default[0]
            raise AttributeError(f"Access to '{name}' is blocked in Lambda sandbox")
    return _original_getattr(obj, name, *default) if default else _original_getattr(obj, name)

builtins.getattr = _sandboxed_getattr

# Block globals() and locals() manipulation
_original_globals = builtins.globals
_original_locals = builtins.locals

def _sandboxed_globals():
    g = _original_globals()
    # Return a copy without builtins manipulation access
    return {k: v for k, v in g.items() if not k.startswith('_')}

def _sandboxed_locals():
    return _original_locals()

builtins.globals = _sandboxed_globals
builtins.locals = _sandboxed_locals

# Clean up sys module access (we need stdin/stdout but not dangerous stuff)
# Note: We already blocked 'sys' import, but clean up the one we imported
if 'sys' in dir():
    # Only keep safe attributes
    _safe_sys_attrs = {'stdin', 'stdout', 'stderr', 'version', 'version_info', 
                       'platform', 'maxsize', 'float_info', 'int_info'}
    for attr in list(dir(sys)):
        if attr not in _safe_sys_attrs and not attr.startswith('_'):
            try:
                delattr(sys, attr)
            except:
                pass

# ============================================================================
# Utility functions for Lambdas
# ============================================================================

import urllib.request
import urllib.error

def fetch(url, method='GET', headers=None, body=None):
    """Simple fetch implementation for Python Lambdas"""
    req_headers = headers or {}
    data = body.encode('utf-8') if body else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return {
                'ok': response.status < 400,
                'status': response.status,
                'text': response.read().decode('utf-8'),
            }
    except urllib.error.URLError as e:
        return {'ok': False, 'status': 0, 'error': str(e)}

# ============================================================================
# Input handling
# ============================================================================

# Parse unified input from stdin
input_data = json.loads(sys.stdin.read())

# Convert to object-like access
class DictToObject:
    def __init__(self, d):
        for k, v in d.items():
            if isinstance(v, dict):
                setattr(self, k, DictToObject(v))
            elif isinstance(v, list):
                setattr(self, k, [DictToObject(i) if isinstance(i, dict) else i for i in v])
            else:
                setattr(self, k, v)

# Create input object
input = DictToObject(input_data)

# ============================================================================
# User Lambda Script
# ============================================================================

${script}

# ============================================================================
# Execute transform
# ============================================================================

# Call transform with the unified input object
if 'transform' in dir():
    result = transform(input)
else:
    raise Exception('Lambda must define: def transform(input):')

# Output result
if isinstance(result, str):
    print(result)
else:
    print(json.dumps(result, indent=2, default=str))
`;

    await fs.writeFile(scriptPath, wrappedScript, 'utf8');

    return new Promise((resolve) => {
      // Run Python with restricted options but allow site-packages
      const python: ChildProcess = spawn('python3', [
        '-E',           // Ignore PYTHON* environment variables
        '-s',           // Don't add user site-packages to path (lowercase)
        scriptPath
      ], {
        timeout: 30000,
        env: {
          // Minimal environment - allow access to system pip packages
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          LANG: process.env.LANG || 'en_US.UTF-8',
          // Don't write .pyc files
          PYTHONDONTWRITEBYTECODE: '1',
          // Keep site-packages available for pip packages
          // PYTHONNOUSERSITE: '1', // Removed - we want pip packages
        },
      });

      let stdout = '';
      let stderr = '';

      // Register cancellation callback to kill subprocess
      const unsubscribe = cancellationToken?.onCancel(() => {
        python.kill('SIGTERM');
      });

      python.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Send input via stdin
      const inputJson = JSON.stringify(input);
      python.stdin?.write(inputJson);
      python.stdin?.end();

      python.on('close', async (code) => {
        unsubscribe?.();
        try { await fs.unlink(scriptPath); } catch { /* ignore */ }

        if (code === 0) {
          resolve({
            success: true,
            output: stdout.trim(),
            duration: Date.now() - startTime,
          });
        } else {
          resolve({
            success: false,
            output: '',
            error: stderr || `Python exited with code ${code}`,
            duration: Date.now() - startTime,
          });
        }
      });

      python.on('error', async (err) => {
        unsubscribe?.();
        try { await fs.unlink(scriptPath); } catch { /* ignore */ }

        resolve({
          success: false,
          output: '',
          error: `Failed to execute Python: ${err.message}`,
          duration: Date.now() - startTime,
        });
      });
    });
  } catch (error: any) {
    return {
      success: false,
      output: '',
      error: error.message || String(error),
      duration: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Main Execution Entry Point
// ============================================================================

/**
 * Execute a Lambda script with the unified input contract
 */
export async function executeLambda(
  script: string,
  language: 'typescript' | 'javascript' | 'python',
  input: LambdaInput,
  cancellationToken?: CancellationToken
): Promise<LambdaResult> {
  console.log(`\n🔮 Executing Lambda (${language})...`);
  console.log(`   Input tasks: ${input.tasks.length}`);
  console.log(`   Lambda: ${input.meta.lambdaName}`);
  
  if (input.tasks.length > 0) {
    console.log(`   Task summaries:`);
    input.tasks.forEach((task, i) => {
      const preview = task.taskType === 'agent' 
        ? task.workerOutput?.substring(0, 50) 
        : task.transformerOutput?.substring(0, 50);
      console.log(`     ${i + 1}. ${task.taskTitle} (${task.taskType}): ${preview}...`);
    });
  }

  if (language === 'python') {
    return executePythonLambda(script, input, cancellationToken);
  } else {
    return executeJSLambda(script, language, input, cancellationToken);
  }
}

/**
 * Create a pass-through Lambda result (for transformers without scripts)
 */
export function createPassThroughResult(input: LambdaInput): LambdaResult {
  console.log(`\n🔮 Pass-through transformer (no Lambda assigned)`);
  
  // Concatenate all outputs
  const outputs = input.tasks.map(task => {
    if (task.taskType === 'agent') {
      return task.workerOutput || '';
    } else {
      return task.transformerOutput || '';
    }
  });
  
  const output = outputs.filter(o => o).join('\n\n---\n\n');
    
  return {
    success: true,
    output,
    duration: 0,
  };
}

// ============================================================================
// Helper to build LambdaInput from task outputs
// ============================================================================

/**
 * Build a LambdaInput from the task outputs registry
 */
export function buildLambdaInput(
  transformerId: string,
  transformerTitle: string,
  lambdaName: string,
  executionId: string,
  dependencies: string[],
  taskOutputsRegistry: Map<string, any>
): LambdaInput {
  const tasks: TaskResult[] = [];
  
  for (const depId of dependencies) {
    const depOutput = taskOutputsRegistry.get(depId);
    if (depOutput) {
      tasks.push({
        taskId: depId,
        taskTitle: depOutput.taskTitle || depId,
        taskType: depOutput.lambdaName ? 'transformer' : 'agent',
        status: 'success',
        duration: depOutput.duration || 0,
        // Agent fields
        workerOutput: depOutput.workerOutputs?.[0],
        qcResult: depOutput.qcResult,
        agentRole: depOutput.agentRole,
        // Transformer fields
        transformerOutput: depOutput.lambdaName ? depOutput.workerOutputs?.[0] : undefined,
        lambdaName: depOutput.lambdaName,
      });
    }
  }
  
  return {
    tasks,
    meta: {
      transformerId,
      lambdaName: lambdaName || transformerTitle,
      dependencyCount: dependencies.length,
      executionId,
    },
  };
}
