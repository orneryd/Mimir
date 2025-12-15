# Lambda Guide

Lambdas are lightweight data transformation functions that run between agent tasks in Mimir workflows. They enable splitting, merging, filtering, and transforming data without invoking an LLM.

## Overview

Lambdas execute in a **sandboxed environment** with:
- 30-second timeout
- Access to `require()` for npm packages
- Read-only file system access
- No network access except `fetch()`
- No process control or shell execution

## Supported Languages

| Language | File Extension | Runtime |
|----------|---------------|---------|
| JavaScript | `.js` | Node.js VM sandbox |
| TypeScript | `.ts` | Compiled to JS, then VM sandbox |
| Python | `.py` | Subprocess with restricted builtins |

## Lambda Input Contract

Every lambda receives a **unified input object** with access to all upstream task outputs:

```typescript
interface LambdaInput {
  tasks: TaskResult[];  // All dependency outputs
  meta: LambdaMeta;     // Execution metadata
}

interface TaskResult {
  taskId: string;
  taskTitle: string;
  taskType: 'agent' | 'transformer';
  status: 'success' | 'failure';
  duration: number;
  
  // Agent task fields
  workerOutput?: string;
  qcResult?: QCVerificationResult;
  agentRole?: string;
  
  // Transformer task fields
  transformerOutput?: string;
  lambdaName?: string;
}

interface LambdaMeta {
  transformerId: string;
  lambdaName: string;
  dependencyCount: number;
  executionId: string;
}
```

## Writing Lambdas

### Pattern 1: Module Export (Recommended)

```javascript
// Best for complex lambdas with async operations
module.exports = async function(input) {
  const upstream = input.tasks[0];
  const data = upstream.transformerOutput || upstream.workerOutput;
  
  // Process data...
  const result = JSON.parse(data);
  
  return JSON.stringify(result);
};
```

### Pattern 2: Inline Return (Simple Scripts)

```javascript
// Best for simple one-liners in workflow JSON
// `tasks` is available directly in the sandbox
let output = tasks[0].workerOutput || tasks[0].transformerOutput || '';
const data = JSON.parse(output);
const filtered = data.filter(item => item.status === 'active');
return JSON.stringify(filtered);
```

### Pattern 3: Named Export

```javascript
// Alternative export style
function transform(input) {
  return input.tasks.map(t => t.taskId).join(', ');
}
module.exports = { transform };
```

## Workflow JSON Schema

```json
{
  "id": "my-transformer",
  "taskType": "transformer",
  "title": "Transform Data",
  "lambdaName": "my-transformer-lambda",
  "lambdaLanguage": "javascript",
  "lambdaScript": "const data = JSON.parse(tasks[0].transformerOutput);\nreturn JSON.stringify(data.slice(0, 10));",
  "dependencies": ["upstream-task"],
  "parallelGroup": null,
  "estimatedDuration": "1 sec"
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique task identifier |
| `taskType` | `"transformer"` | Must be "transformer" for lambdas |
| `title` | string | Human-readable task name |
| `lambdaName` | string | Lambda identifier for logging |
| `lambdaLanguage` | `"javascript"` \| `"typescript"` \| `"python"` | Execution runtime |
| `lambdaScript` | string | The lambda code (escaped for JSON) |
| `dependencies` | string[] | Task IDs this lambda depends on |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `parallelGroup` | string \| null | Group name for parallel execution |
| `estimatedDuration` | string | Human-readable estimate |

## Available APIs

### JavaScript/TypeScript Sandbox

#### Globals Available

```javascript
// JavaScript builtins
JSON, Array, Object, String, Number, Boolean, Date, Math, RegExp,
Error, Map, Set, WeakMap, WeakSet, Promise, Proxy, Reflect, Symbol,
BigInt, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder

// Async/timing
setTimeout, clearTimeout, setInterval, clearInterval,
setImmediate, clearImmediate, queueMicrotask

// Network (controlled)
fetch, Headers, Request, Response, FormData,
AbortController, AbortSignal

// Encoding
atob, btoa, encodeURI, encodeURIComponent,
decodeURI, decodeURIComponent

// Console (prefixed output)
console.log, console.error, console.warn, console.info, console.debug

// Node.js require (sandboxed)
require('mammoth')  // npm packages allowed
require('path')     // safe builtins allowed
require('crypto')   // safe builtins allowed
```

#### Blocked Operations

```javascript
// These will throw errors:
require('child_process')  // Blocked
require('fs').writeFileSync()  // Write operations blocked
process.exit()  // Blocked
process.kill()  // Blocked
eval('code')  // Blocked (strings disabled)
```

#### File System (Read-Only)

```javascript
const fs = require('fs');

// Allowed
const content = fs.readFileSync('/path/to/file', 'utf-8');
const exists = fs.existsSync('/path/to/file');
const stats = fs.statSync('/path/to/file');
const files = fs.readdirSync('/path/to/dir');

// Blocked (throws error)
fs.writeFileSync('/path', 'data');  // Error: Write operations blocked
fs.unlinkSync('/path');  // Error: Write operations blocked
```

### Python Sandbox

```python
# Available
import json
import re
import math
import datetime
import collections
import itertools
import functools
import operator
import string
import textwrap
import unicodedata
import base64
import hashlib
import hmac
import secrets
import uuid
import urllib.parse

# Blocked (throws ImportError)
import os           # Blocked
import subprocess   # Blocked
import socket       # Blocked
import pickle       # Blocked
import ctypes       # Blocked
```

## Examples

### Split Data into Batches

```javascript
// Split array into chunks of 36 items
const output = tasks[0].transformerOutput;
const data = JSON.parse(output);
const batchSize = 36;
const batchIndex = 0;  // Change per batch task
const batch = data.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
return JSON.stringify(batch);
```

### Merge Multiple Outputs

```javascript
module.exports = async function(input) {
  const allResults = [];
  
  for (const task of input.tasks) {
    const output = task.transformerOutput || task.workerOutput || '';
    try {
      const parsed = JSON.parse(output);
      if (Array.isArray(parsed)) {
        allResults.push(...parsed);
      }
    } catch (e) {
      console.error(`Failed to parse task ${task.taskId}: ${e.message}`);
    }
  }
  
  // Sort by ID
  allResults.sort((a, b) => {
    const aNum = parseInt(a.id?.match(/\d+/)?.[0] || '0');
    const bNum = parseInt(b.id?.match(/\d+/)?.[0] || '0');
    return aNum - bNum;
  });
  
  return JSON.stringify(allResults, null, 2);
};
```

### Extract Text from DOCX

```javascript
module.exports = async function(input) {
  const mammoth = require('mammoth');
  const fs = require('fs');
  const path = require('path');
  
  const docxPath = path.join(process.env.HOME, 'documents/input.docx');
  const buffer = fs.readFileSync(docxPath);
  
  const result = await mammoth.extractRawText({ buffer });
  const paragraphs = result.value.split(/\n+/).filter(p => p.trim());
  
  const units = paragraphs.map((text, i) => ({
    id: `p${i}`,
    source: text.trim()
  }));
  
  return JSON.stringify(units);
};
```

### Write Results to File

```javascript
module.exports = async function(input) {
  const fs = require('fs');
  const path = require('path');
  
  const data = input.tasks.map(t => t.workerOutput).join('\n\n');
  
  // Write to file (allowed for specific paths)
  const outputPath = path.join(process.env.HOME, 'src/output.json');
  fs.writeFileSync(outputPath, data, 'utf-8');
  
  return `Wrote ${data.length} bytes to ${outputPath}`;
};
```

### Filter and Transform

```javascript
const output = tasks[0].workerOutput || '';
const items = JSON.parse(output);

const transformed = items
  .filter(item => item.score >= 80)
  .map(item => ({
    id: item.id,
    summary: item.text.substring(0, 100),
    passed: true
  }));

return JSON.stringify(transformed);
```

## Error Handling

Lambdas should handle errors gracefully:

```javascript
module.exports = async function(input) {
  try {
    const data = JSON.parse(input.tasks[0].transformerOutput);
    return JSON.stringify(processData(data));
  } catch (error) {
    // Log error for debugging
    console.error('Lambda failed:', error.message);
    
    // Return error info or empty result
    return JSON.stringify({
      error: error.message,
      fallback: []
    });
  }
};
```

## Debugging

### Console Output

All `console.log` calls are prefixed with `[Lambda]`:

```javascript
console.log('Processing', items.length, 'items');
// Output: [Lambda] Processing 42 items
```

### Common Issues

1. **"No JSON array found"** - Upstream task output isn't valid JSON
2. **"Lambda execution timed out"** - Script took >30 seconds
3. **"require is not defined"** - Use `module.exports` pattern or ensure `require` is available
4. **"Write operations blocked"** - Can't write to arbitrary paths

## Best Practices

1. **Keep lambdas focused** - One transformation per lambda
2. **Validate input** - Check for null/undefined before parsing
3. **Handle errors** - Wrap JSON.parse in try/catch
4. **Log progress** - Use console.log for debugging
5. **Return strings** - Always return a string (JSON.stringify for objects)
6. **Use parallelGroup** - Group independent lambdas for parallel execution
