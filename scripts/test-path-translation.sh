#!/bin/bash

# Test path translation by calling the MCP server
echo "🧪 Testing path translation..."
echo ""

# Test 1: Index a folder with host path
echo "📍 Test 1: Indexing with host path"
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "index_folder",
      "arguments": {
        "path": "/Users/c815719/src/caremark-notification-service",
        "recursive": true,
        "ignore_patterns": ["node_modules/**", "dist/**", ".git/**"]
      }
    }
  }' | jq '.'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 2: List folders
echo "📍 Test 2: Listing indexed folders"
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_folders",
      "arguments": {}
    }
  }' | jq '.'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check logs for debug output
echo "📋 Checking server logs for path translation debug output:"
docker-compose logs mcp-server | grep -E "(🐳|🏠|📍)" | tail -10
