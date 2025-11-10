#!/usr/bin/env node

/**
 * Test script for folder indexing via MCP HTTP endpoints
 * 
 * Usage:
 *   node scripts/test-folder-indexing.js <folder_path>                    # Add folder
 *   node scripts/test-folder-indexing.js <folder_path> --remove           # Remove folder
 *   node scripts/test-folder-indexing.js <folder_path> --embeddings       # Add with embeddings
 *   node scripts/test-folder-indexing.js --list                           # List watched folders
 * 
 * Examples:
 *   node scripts/test-folder-indexing.js C:\Users\timot\Documents\GitHub\test-project
 *   node scripts/test-folder-indexing.js C:\Users\timot\Documents\GitHub\test-project --remove
 *   node scripts/test-folder-indexing.js C:\Users\timot\Documents\GitHub\test-project --embeddings
 */

import http from 'http';
import path from 'path';

// Configuration
const MCP_HOST = process.env.MCP_HOST || 'localhost';
const MCP_PORT = process.env.MCP_PORT || 9042;

// Parse command line arguments
const args = process.argv.slice(2);
const folderPath = args.find(arg => !arg.startsWith('--'));
const addFlag = args.includes('--add');
const removeFlag = args.includes('--remove');
const embeddingsFlag = args.includes('--embeddings');
const listFlag = args.includes('--list');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

// Track session ID across requests
let sessionId = null;

/**
 * Make HTTP request to MCP server
 */
function makeRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    
    const options = {
      hostname: MCP_HOST,
      port: MCP_PORT,
      path: endpoint,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(sessionId && { 'mcp-session-id': sessionId }),
        ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
      }
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          
          // Capture session ID from response headers
          const mcpSessionId = res.headers['mcp-session-id'];
          if (mcpSessionId && !sessionId) {
            sessionId = mcpSessionId;
            log(`📝 Session ID: ${sessionId}`, 'cyan');
          }
          
          resolve({ statusCode: res.statusCode, data: response });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
}

/**
 * Initialize MCP session
 */
async function initializeSession() {
  logSection('Initializing MCP Session');
  
  const requestBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-folder-indexing',
        version: '1.0.0'
      }
    }
  };

  try {
    const { statusCode, data } = await makeRequest('POST', '/mcp', requestBody);
    
    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: ${JSON.stringify(data)}`);
    }

    if (data.error) {
      log('\n❌ Initialization failed:', 'red');
      console.log(JSON.stringify(data.error, null, 2));
      return false;
    }

    log('\n✅ Session initialized!', 'green');
    if (data.result && data.result.serverInfo) {
      log(`Server: ${data.result.serverInfo.name} v${data.result.serverInfo.version}`, 'cyan');
      log(`Protocol: ${data.result.protocolVersion}`, 'cyan');
    }
    
    // Small delay to let server mark session as initialized
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send notifications/initialized after successful initialization
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };
    
    // Notifications don't have responses, so don't parse the body
    try {
      await makeRequest('POST', '/mcp', initializedNotification);
    } catch (error) {
      // Ignore parse errors for notifications (they have no response body)
    }
    log('✅ Initialization complete', 'green');
    
    return true;
  } catch (error) {
    log(`\n❌ Initialization failed: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Call MCP tool endpoint
 */
async function callTool(toolName, params, silent = false) {
  if (!silent) {
    logSection(`Calling Tool: ${toolName}`);
    if (Object.keys(params).length > 0) {
      log(`Parameters: ${JSON.stringify(params, null, 2)}`, 'cyan');
    }
  }
  
  const requestBody = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: params
    }
  };

  try {
    const { statusCode, data } = await makeRequest('POST', '/mcp', requestBody);
    
    if (statusCode !== 200) {
      throw new Error(`HTTP ${statusCode}: ${JSON.stringify(data)}`);
    }

    if (data.error) {
      log('\n❌ Error:', 'red');
      console.log(JSON.stringify(data.error, null, 2));
      return null;
    }

    if (!silent) {
      log('\n✅ Tool call successful', 'green');
    }
    
    return data.result;
  } catch (error) {
    log(`\n❌ Request failed: ${error.message}`, 'red');
    throw error;
  }
}

/**
 * Format Neo4j datetime to readable string
 */
function formatDateTime(dt) {
  if (!dt || !dt.year) return 'N/A';
  
  const year = dt.year.low || dt.year;
  const month = String(dt.month.low || dt.month).padStart(2, '0');
  const day = String(dt.day.low || dt.day).padStart(2, '0');
  const hour = String(dt.hour.low || dt.hour).padStart(2, '0');
  const minute = String(dt.minute.low || dt.minute).padStart(2, '0');
  const second = String(dt.second.low || dt.second).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Parse MCP tool result content
 */
function parseToolResult(result) {
  if (!result || !result.content || !Array.isArray(result.content)) {
    return null;
  }
  
  const textContent = result.content.find(c => c.type === 'text');
  if (!textContent || !textContent.text) {
    return null;
  }
  
  try {
    return JSON.parse(textContent.text);
  } catch (error) {
    return null;
  }
}

/**
 * List all watched folders
 */
async function listWatchedFolders() {
  logSection('Listing Watched Folders');
  
  const result = await callTool('list_folders', {});
  const data = parseToolResult(result);
  
  if (data && data.watches) {
    log(`\n📊 Total watched folders: ${data.total}`, 'cyan');
    
    data.watches.forEach((watch, index) => {
      console.log(`\n${colors.bright}${index + 1}. ${watch.folder}${colors.reset}`);
      log(`   📂 Container Path: ${watch.containerPath}`, 'cyan');
      log(`   📄 Files Indexed: ${watch.files_indexed}`, 'green');
      log(`   🕐 Last Update: ${formatDateTime(watch.last_update)}`, 'yellow');
      log(`   ${watch.active ? '✅' : '❌'} Status: ${watch.active ? 'Active' : 'Inactive'}`, watch.active ? 'green' : 'red');
      if (watch.watch_id) {
        log(`   🔑 Watch ID: ${watch.watch_id}`, 'blue');
      }
    });
  } else {
    log('\n📭 No folders are currently being watched', 'yellow');
  }
}

/**
 * Add folder to indexing
 */
async function addFolder(folderPath, withEmbeddings = true) {
  logSection('Adding Folder to Indexing');
  log(`Folder: ${folderPath}`, 'yellow');
  log(`Embeddings: ${withEmbeddings ? 'Enabled' : 'Disabled'}`, 'yellow');
  
  const params = {
    path: folderPath,
    recursive: true,
    debounce_ms: 500,
    generate_embeddings: true
  };

  const result = await callTool('index_folder', params);
  const data = parseToolResult(result);
  
  if (data && data.status === 'success') {
    log('\n✅ Folder added successfully!', 'green');
    log(`📂 Host Path: ${data.path}`, 'cyan');
    log(`📦 Container Path: ${data.containerPath}`, 'cyan');
    log(`💬 ${data.message}`, 'yellow');
    
    if (withEmbeddings) {
      log('\n⏳ Background indexing with embeddings in progress...', 'yellow');
      log('   This may take a while depending on the number of files.', 'yellow');
      log('   Use "npm run index:stats" to check progress.', 'cyan');
    }
  } else if (data && data.status === 'error') {
    log(`\n❌ Error: ${data.message}`, 'red');
  }
}

/**
 * Remove folder from indexing
 */
async function removeFolder(folderPath) {
  logSection('Removing Folder from Indexing');
  log(`Folder: ${folderPath}`, 'yellow');
  
  const params = {
    path: folderPath
  };

  const result = await callTool('remove_folder', params);
  const data = parseToolResult(result);
  
  if (data && data.status === 'success') {
    log('\n✅ Folder removed successfully!', 'green');
    log(`📂 Host Path: ${data.path}`, 'cyan');
    log(`📦 Container Path: ${data.containerPath}`, 'cyan');
    log(`🗑️  Files Removed: ${data.files_removed}`, 'red');
    log(`🗑️  Chunks Removed: ${data.chunks_removed}`, 'red');
  } else if (data && data.status === 'error') {
    log(`\n❌ Error: ${data.message}`, 'red');
  }
}

/**
 * Get embedding statistics
 */
async function getEmbeddingStats() {
  logSection('Embedding Statistics');
  
  const result = await callTool('get_embedding_stats', {});
  const data = parseToolResult(result);
  
  if (data) {
    log(`\n🔢 Total nodes with embeddings: ${data.total_nodes_with_embeddings.toLocaleString()}`, 'cyan');
    
    if (data.breakdown_by_type) {
      log('\n📊 Breakdown by type:', 'yellow');
      
      // Sort by count descending
      const sorted = Object.entries(data.breakdown_by_type)
        .sort(([, a], [, b]) => b - a);
      
      sorted.forEach(([type, count]) => {
        const percentage = ((count / data.total_nodes_with_embeddings) * 100).toFixed(1);
        const bar = '█'.repeat(Math.floor(percentage / 2));
        log(`   ${type.padEnd(15)} ${String(count).padStart(6)} (${percentage.padStart(5)}%) ${bar}`, 'green');
      });
    }
  } else {
    log('\n📭 No embedding statistics available', 'yellow');
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Validate MCP server is running
    log(`🔍 Checking MCP server at ${MCP_HOST}:${MCP_PORT}...`, 'cyan');
    
    try {
      await makeRequest('GET', '/health');
      log('✅ MCP server is running\n', 'green');
    } catch (error) {
      log('❌ Cannot connect to MCP server', 'red');
      log(`Make sure the server is running: docker-compose up -d`, 'yellow');
      process.exit(1);
    }

    // Initialize MCP session
    const initialized = await initializeSession();
    if (!initialized) {
      log('❌ Failed to initialize MCP session', 'red');
      process.exit(1);
    }

    // Handle different modes
    if (listFlag) {
      await listWatchedFolders();
      await getEmbeddingStats();
    } else if (!folderPath) {
      log('❌ Error: Folder path is required', 'red');
      console.log('\nUsage:');
      console.log('  node scripts/test-folder-indexing.js <folder_path>');
      console.log('  node scripts/test-folder-indexing.js <folder_path> --remove');
      console.log('  node scripts/test-folder-indexing.js <folder_path> --embeddings');
      console.log('  node scripts/test-folder-indexing.js --list');
      process.exit(1);
    } else if (removeFlag) {
      await removeFolder(folderPath);
    } else if (addFlag) {
      await addFolder(folderPath, embeddingsFlag);
      
      // Show embedding stats if embeddings were enabled
      if (embeddingsFlag) {
        log('\n⏳ Waiting 5 seconds for background indexing to start...', 'yellow');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await getEmbeddingStats();
      }
    }

    log('\n✨ Done!', 'green');
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();
