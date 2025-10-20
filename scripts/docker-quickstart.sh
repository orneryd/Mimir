#!/bin/bash
# Quick start script for Docker + Ollama setup
# This script handles the complete setup process

set -e

# Detect Docker Compose command (V1 vs V2)
if command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
else
  echo "❌ Docker Compose not found!"
  echo "   Please install Docker Desktop or Docker Compose"
  exit 1
fi

echo "🚀 Mimir Docker + Ollama Quick Start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Pre-flight: Create data directories with correct permissions
echo "🔧 Pre-flight: Setting up data directories..."
mkdir -p ./data/ollama ./data/neo4j ./logs
echo "   ✅ Data directories ready"
echo ""

# Step 1: Build and start services
echo "📦 Step 1/4: Starting Docker services..."
$DOCKER_COMPOSE up -d

echo ""
echo "⏳ Waiting for services to be healthy (this may take 60-90 seconds)..."
sleep 5

# Wait for Ollama to be healthy
echo "   Checking Ollama..."
MAX_WAIT=120
ELAPSED=0
until docker exec ollama_server ollama list 2>/dev/null; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ Ollama failed to start. Check logs with: docker logs ollama_server"
    exit 1
  fi
done
echo "   ✅ Ollama is ready"

# Wait for Neo4j to be healthy
echo "   Checking Neo4j..."
ELAPSED=0
until docker exec neo4j_db cypher-shell -u neo4j -p password "RETURN 1" 2>/dev/null; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ Neo4j failed to start. Check logs with: docker logs neo4j_db"
    exit 1
  fi
done
echo "   ✅ Neo4j is ready"

# Wait for MCP server to be healthy
echo "   Checking MCP server..."
ELAPSED=0
until curl -sf http://localhost:3000/health > /dev/null 2>&1; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge 60 ]; then
    echo "❌ MCP server failed to start. Check logs with: docker logs mcp_server"
    exit 1
  fi
done
echo "   ✅ MCP server is ready"

echo ""
echo "✅ All services are healthy!"
echo ""

# Step 2: Pull configured models
echo "📦 Step 2/4: Setting up Ollama models..."
chmod +x scripts/setup-ollama-models.sh
./scripts/setup-ollama-models.sh

echo ""

# Step 3: Verify configuration
echo "📋 Step 3/4: Verifying configuration..."
echo ""
echo "Service Status:"
$DOCKER_COMPOSE ps
echo ""

echo "Ollama Models:"
docker exec ollama_server ollama list
echo ""

echo "MCP Server Health:"
curl -s http://localhost:3000/health
echo ""
echo ""

# Step 4: Display next steps
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Run an agent chain:"
echo "   npm run chain \"implement authentication\""
echo ""
echo "2. Access Neo4j browser:"
echo "   http://localhost:7474"
echo "   Username: neo4j"
echo "   Password: password"
echo ""
echo "3. Check MCP server health:"
echo "   curl http://localhost:3000/health"
echo ""
echo "4. View logs:"
echo "   $DOCKER_COMPOSE logs -f mcp-server"
echo "   $DOCKER_COMPOSE logs -f ollama"
echo ""
echo "5. Stop services:"
echo "   $DOCKER_COMPOSE down"
echo ""
echo "📚 Documentation:"
echo "   docs/DOCKER_OLLAMA_SETUP.md"
echo ""
