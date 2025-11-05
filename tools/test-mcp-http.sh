#!/bin/bash

echo "Testing MCP HTTP Server..."
echo ""

# Initialize and get session ID
echo "1. Initializing session..."
RESPONSE=$(curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}}, "id": 1}' \
  -D - 2>&1)

SESSION_ID=$(echo "$RESPONSE" | grep -i "mcp-session-id:" | awk '{print $2}' | tr -d '\r\n')
echo "Session ID: $SESSION_ID"
echo ""

# List tools
echo "2. Listing tools..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 2}' | jq '.result.tools | length'
echo ""

# Call a tool
echo "3. Creating a test node..."
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "memory_add_node", "arguments": {"type": "todo", "properties": {"description": "Test TODO", "status": "pending", "priority": "high"}}}, "id": 3}' | jq '.'
echo ""

echo "✅ Test complete!"
