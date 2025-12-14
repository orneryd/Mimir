#!/usr/bin/env node
/**
 * Run a JSON workflow file from the command line
 * Usage: node bin/run-workflow.mjs <workflow.json>
 *    or: npm run workflow <workflow.json>
 */
import fs from 'fs';
import path from 'path';

const workflowFile = process.argv[2];

if (!workflowFile) {
  console.error('Usage: npm run workflow <workflow.json>');
  console.error('Example: npm run workflow testing/workflows/healthcare-spanish-translation-2.json');
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), workflowFile);

if (!fs.existsSync(absolutePath)) {
  console.error(`❌ Workflow file not found: ${absolutePath}`);
  process.exit(1);
}

const serverUrl = process.env.MIMIR_SERVER_URL || 'http://localhost:3000';

console.log(`🚀 Executing workflow: ${workflowFile}`);
console.log(`📡 Server: ${serverUrl}`);
console.log('');

// Read and parse the workflow JSON
const workflowContent = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));

try {
  const response = await fetch(`${serverUrl}/api/execute-workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflowContent)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ Server error: ${response.status}`);
    console.error(error);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`✅ Execution started: ${result.executionId}`);
  console.log(`📊 Monitor at: ${serverUrl}/api/orchestration/status/${result.executionId}`);
  console.log('');
  console.log('To investigate results:');
  console.log(`  npm run inv ${result.executionId}`);
} catch (error) {
  console.error(`❌ Failed to connect to server: ${error.message}`);
  console.error('Make sure the server is running: npm run start:http');
  process.exit(1);
}
