#!/bin/bash
# Quick start script for Mimir + Open-WebUI integration

set -e

echo "🚀 Starting Mimir Multi-Agent Orchestrator with Open-WebUI"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install Docker Compose."
    exit 1
fi

echo "✅ docker-compose found"
echo ""

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose up -d --build

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check Neo4j
echo "  Checking Neo4j..."
max_attempts=30
attempt=0
while ! docker exec neo4j_db cypher-shell -u neo4j -p password "RETURN 1" > /dev/null 2>&1; do
    attempt=$((attempt+1))
    if [ $attempt -ge $max_attempts ]; then
        echo "  ❌ Neo4j failed to start"
        exit 1
    fi
    sleep 2
    echo "  ⏳ Still waiting for Neo4j... ($attempt/$max_attempts)"
done
echo "  ✅ Neo4j is ready"

# Check MCP Server
echo "  Checking MCP Server..."
max_attempts=15
attempt=0
while ! curl -s http://localhost:9042/health > /dev/null 2>&1; do
    attempt=$((attempt+1))
    if [ $attempt -ge $max_attempts ]; then
        echo "  ❌ MCP Server failed to start"
        docker logs mcp_server
        exit 1
    fi
    sleep 2
    echo "  ⏳ Still waiting for MCP Server... ($attempt/$max_attempts)"
done
echo "  ✅ MCP Server is ready"

# Check Open-WebUI
echo "  Checking Open-WebUI..."
max_attempts=15
attempt=0
while ! curl -s http://localhost:3000 > /dev/null 2>&1; do
    attempt=$((attempt+1))
    if [ $attempt -ge $max_attempts ]; then
        echo "  ❌ Open-WebUI failed to start"
        docker logs mimir-open-webui
        exit 1
    fi
    sleep 2
    echo "  ⏳ Still waiting for Open-WebUI... ($attempt/$max_attempts)"
done
echo "  ✅ Open-WebUI is ready"

echo ""
echo "✨ All services started successfully!"
echo ""
echo "📍 Access Points:"
echo "  • Open-WebUI:  http://localhost:3000"
echo "  • Neo4j Browser: http://localhost:7474"
echo "  • MCP Server:  http://localhost:9042/health"
echo ""
echo "🎯 Next Steps:"
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Create an account (first user is admin)"
echo "  3. Start chatting with Mimir!"
echo ""
echo "📚 Documentation: ./pipelines/README.md"
echo ""
echo "🛑 To stop: docker-compose down"
echo "📊 View logs: docker-compose logs -f"
