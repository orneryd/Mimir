#!/bin/bash
# Check Docker resource allocation and Ollama status

set -e

# Detect Docker Compose command (V1 vs V2)
if command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
else
  DOCKER_COMPOSE="docker compose"  # Fallback to V2
fi

echo "🔍 Docker Resource Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running!"
  echo "   Please start Docker Desktop and try again."
  exit 1
fi

# Get Docker memory limit
echo "📊 Docker Configuration:"
DOCKER_MEM=$(docker info 2>/dev/null | grep "Total Memory" | awk '{print $3, $4}')
if [ -z "$DOCKER_MEM" ]; then
  DOCKER_MEM="Unknown (Linux uses host memory)"
fi
echo "   Total Memory: $DOCKER_MEM"
echo ""

# Check Ollama container
echo "🐳 Container Status:"
if docker ps --format "{{.Names}}" | grep -q "ollama_server"; then
  OLLAMA_STATUS="✅ Running"
  OLLAMA_MEM=$(docker stats --no-stream --format "{{.MemUsage}}" ollama_server)
  echo "   Ollama: $OLLAMA_STATUS"
  echo "   Memory: $OLLAMA_MEM"
else
  echo "   Ollama: ❌ Not running"
  echo "   Start with: $DOCKER_COMPOSE up -d ollama"
fi
echo ""

# Check installed models
echo "🤖 Installed Models:"
if docker ps --format "{{.Names}}" | grep -q "ollama_server"; then
  docker exec ollama_server ollama list 2>/dev/null || echo "   ⚠️  Could not list models"
else
  echo "   ⚠️  Ollama container not running"
fi
echo ""

# Memory recommendations
echo "💡 Memory Recommendations:"
echo "   Minimum for qwen3:8b:         10.6 GB"
echo "   Recommended Docker allocation: 16 GB"
echo "   Current allocation:            $DOCKER_MEM"
echo ""

# Parse memory to check if it's enough
MEM_GB=$(echo "$DOCKER_MEM" | grep -oE '[0-9]+' | head -1)
if [ ! -z "$MEM_GB" ]; then
  if [ "$MEM_GB" -lt 12 ]; then
    echo "⚠️  WARNING: Docker memory may be insufficient!"
    echo "   Increase to 16 GB in Docker Desktop → Settings → Resources"
    echo "   See: docs/DOCKER_RESOURCES.md"
  elif [ "$MEM_GB" -ge 16 ]; then
    echo "✅ Docker memory allocation looks good!"
  else
    echo "⚠️  Docker memory is borderline (12-15 GB)"
    echo "   Recommended: Increase to 16 GB for stability"
  fi
fi
echo ""

echo "📖 For configuration help, see: docs/DOCKER_RESOURCES.md"
echo ""
