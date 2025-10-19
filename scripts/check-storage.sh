#!/bin/bash
# Check storage usage for Mimir and Ollama

echo "📊 Mimir Storage Usage Report"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🐳 Docker Ollama Models (Containerized):"
if [ -d "./data/ollama" ]; then
  du -sh ./data/ollama
  echo "   Location: ./data/ollama/models/"
else
  echo "   Not found (no models pulled yet)"
fi
echo ""

echo "💻 Host Ollama Models (Local):"
if [ -d "$HOME/.ollama" ]; then
  du -sh ~/.ollama
  echo "   Location: ~/.ollama/models/"
else
  echo "   Not found (Ollama not installed locally)"
fi
echo ""

echo "🗄️  Neo4j Database:"
if [ -d "./data/neo4j" ]; then
  du -sh ./data/neo4j
  echo "   Location: ./data/neo4j/"
else
  echo "   Not found"
fi
echo ""

echo "🔨 Build Artifacts:"
if [ -d "./build" ]; then
  du -sh ./build
else
  echo "   Not found"
fi
echo ""

echo "📦 Node Modules:"
if [ -d "./node_modules" ]; then
  du -sh ./node_modules
else
  echo "   Not found"
fi
echo ""

echo "📝 Logs:"
if [ -d "./logs" ]; then
  du -sh ./logs
else
  echo "   Not found"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo ""

if [ -d "./data" ]; then
  echo "Total ./data directory:"
  du -sh ./data
fi

echo ""
echo "🐳 Docker Images:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "REPOSITORY|mcp-server|ollama|neo4j" || echo "   No images found"

echo ""
echo "🐳 Docker System:"
docker system df

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 To clean up storage, see: docs/STORAGE_CLEANUP.md"
echo ""
