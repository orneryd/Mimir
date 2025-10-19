#!/bin/bash
# Ollama Model Setup Script
# Automatically pulls models configured in .mimir/llm-config.json

set -e

OLLAMA_CONTAINER="ollama_server"

echo "🤖 Setting up Ollama models from config..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if Ollama container is running
if ! docker ps | grep -q $OLLAMA_CONTAINER; then
  echo "❌ Ollama container is not running!"
  echo "   Start it with: docker-compose up -d ollama"
  exit 1
fi

echo "✅ Ollama container is running"
echo ""

# Models to pull based on .mimir/llm-config.json agentDefaults
MODELS=(
  "qwen3:8b"                # PM/QC agent - agentic capabilities, tool calling (5.2GB)
  "qwen2.5-coder:1.5b-base" # Worker agent - fast code generation (986MB)
)

echo "📦 Models to install (from config):"
for model in "${MODELS[@]}"; do
  echo "   - $model"
done
echo ""

# Pull each model
for model in "${MODELS[@]}"; do
  echo "📥 Pulling model: $model"
  docker exec $OLLAMA_CONTAINER ollama pull $model
  echo "✅ Successfully pulled $model"
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ All models installed successfully!"
echo ""
echo "Installed models:"
docker exec $OLLAMA_CONTAINER ollama list
echo ""
echo "💾 Storage location: ./data/ollama/models/"
echo "📊 Check storage usage: ./scripts/check-storage.sh"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 To pull additional models:"
echo ""
echo "   ./scripts/pull-model.sh qwen2.5-coder:7b    # Better quality (4.7GB)"
echo "   ./scripts/pull-model.sh llama3.1:8b         # General purpose (4.9GB)"
echo "   ./scripts/pull-model.sh deepseek-r1:8b      # Reasoning (5.2GB)"
echo ""
echo "🚀 You can now use the agent chain:"
echo "   npm run chain \"implement authentication\""
echo ""
