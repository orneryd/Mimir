#!/bin/bash
# Pull additional Ollama models into the Docker container
# Usage: ./scripts/pull-model.sh <model-name>

set -e

# Detect Docker Compose command (V1 vs V2)
if command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
else
  DOCKER_COMPOSE="docker compose"  # Fallback to V2
fi

OLLAMA_CONTAINER="ollama_server"

# Check if model name was provided
if [ -z "$1" ]; then
  echo "❌ Error: No model name provided"
  echo ""
  echo "Usage: ./scripts/pull-model.sh <model-name>"
  echo ""
  echo "Examples:"
  echo "   ./scripts/pull-model.sh qwen2.5-coder:7b"
  echo "   ./scripts/pull-model.sh llama3.1:8b"
  echo "   ./scripts/pull-model.sh deepseek-coder:6.7b"
  echo ""
  echo "Popular models:"
  echo "   qwen2.5-coder:7b   - Better quality worker (4.7GB)"
  echo "   llama3.1:8b        - General purpose (4.9GB)"
  echo "   deepseek-r1:8b     - Reasoning model (5.2GB)"
  echo ""
  exit 1
fi

MODEL="$1"

# Check if Ollama container is running
if ! docker ps | grep -q $OLLAMA_CONTAINER; then
  echo "❌ Ollama container is not running!"
  echo "   Start it with: $DOCKER_COMPOSE up -d ollama"
  exit 1
fi

echo "📥 Pulling model: $MODEL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Pull the model
docker exec $OLLAMA_CONTAINER ollama pull "$MODEL"

echo ""
echo "✅ Successfully pulled $MODEL"
echo ""
echo "📋 All installed models:"
docker exec $OLLAMA_CONTAINER ollama list
echo ""
echo "💾 Storage location: ./data/ollama/models/"
echo "📊 Check storage: ./scripts/check-storage.sh"
echo ""
