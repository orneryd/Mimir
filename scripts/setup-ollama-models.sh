#!/bin/bash
# Ollama Model Setup Script
# Intelligently pulls models based on configuration:
# - Agent models: Only if Ollama is the defaultProvider in llm-config.json
# - Embedding models: Only if MIMIR_EMBEDDINGS_ENABLED=true in .env

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

echo "🤖 Setting up Ollama models from config..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if Ollama container is running
if ! docker ps | grep -q $OLLAMA_CONTAINER; then
  echo "❌ Ollama container is not running!"
  echo "   Start it with: $DOCKER_COMPOSE up -d ollama"
  exit 1
fi

echo "✅ Ollama container is running"
echo ""

# Load environment variables to get embeddings model
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

# Check if Ollama is the default provider
CONFIG_FILE=".mimir/llm-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  CONFIG_FILE=".mimir/llm-config.example.json"
fi

DEFAULT_PROVIDER="ollama"  # Assume ollama by default
if [ -f "$CONFIG_FILE" ]; then
  # Extract defaultProvider from JSON (using grep/sed for portability)
  DEFAULT_PROVIDER=$(grep -o '"defaultProvider"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | sed 's/.*"defaultProvider"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
fi

MODELS=()

# Only add agent models if Ollama is the default provider
if [ "$DEFAULT_PROVIDER" = "ollama" ]; then
  MODELS+=(
    "qwen3:8b"                # PM/QC agent - agentic capabilities, tool calling (5.2GB)
    "qwen2.5-coder:1.5b-base" # Worker agent - fast code generation (986MB)
  )
  echo "✅ Ollama is the agent provider - will install agent models"
else
  echo "ℹ️  Ollama is not the default provider ($DEFAULT_PROVIDER) - skipping agent models"
fi

# Add embedding model if vector embeddings are enabled (independent of agent provider)
if [ "${MIMIR_FEATURE_VECTOR_EMBEDDINGS}" = "true" ] || [ "${MIMIR_EMBEDDINGS_ENABLED}" = "true" ]; then
  EMBEDDING_MODEL="${MIMIR_EMBEDDINGS_MODEL:-nomic-embed-text}"
  MODELS+=("$EMBEDDING_MODEL")
  echo "🧮 Vector embeddings enabled - will also install: $EMBEDDING_MODEL"
fi

# Exit early if no models to install
if [ ${#MODELS[@]} -eq 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "ℹ️  No Ollama models needed"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Current configuration:"
  echo "   Default provider: $DEFAULT_PROVIDER"
  echo "   Vector embeddings: ${MIMIR_EMBEDDINGS_ENABLED:-false}"
  echo ""
  echo "Ollama is available but not currently configured for:"
  echo "   - Agent execution (using $DEFAULT_PROVIDER instead)"
  echo "   - Vector embeddings (not enabled)"
  echo ""
  echo "To use Ollama, update your configuration:"
  echo "   1. Agent models: Set defaultProvider to 'ollama' in $CONFIG_FILE"
  echo "   2. Embeddings: Set MIMIR_EMBEDDINGS_ENABLED=true in .env"
  echo ""
  exit 0
fi

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

# Show embeddings status
if [ "${MIMIR_FEATURE_VECTOR_EMBEDDINGS}" = "true" ] || [ "${MIMIR_EMBEDDINGS_ENABLED}" = "true" ]; then
  echo "🧮 Vector embeddings configured:"
  echo "   Model: ${MIMIR_EMBEDDINGS_MODEL:-nomic-embed-text}"
  echo "   Dimensions: ${MIMIR_EMBEDDINGS_DIMENSIONS:-768}"
  echo "   Enable file indexing with embeddings: node setup-file-watch.js"
  echo ""
fi

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
