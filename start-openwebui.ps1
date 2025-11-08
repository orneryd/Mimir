# Quick start script for Mimir + Open-WebUI integration (Windows PowerShell)

Write-Host "🚀 Starting Mimir Multi-Agent Orchestrator with Open-WebUI" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check if docker-compose is available
if (!(Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "❌ docker-compose not found. Please install Docker Compose." -ForegroundColor Red
    exit 1
}

Write-Host "✅ docker-compose found" -ForegroundColor Green
Write-Host ""

# Stop existing containers
Write-Host "🛑 Stopping existing containers..." -ForegroundColor Yellow
docker-compose down

# Build and start services
Write-Host "🏗️  Building and starting services..." -ForegroundColor Yellow
docker-compose up -d --build

# Wait for services to be healthy
Write-Host ""
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check Neo4j
Write-Host "  Checking Neo4j..." -ForegroundColor Cyan
$maxAttempts = 30
$attempt = 0
while ($true) {
    try {
        docker exec neo4j_db cypher-shell -u neo4j -p password "RETURN 1" 2>$null | Out-Null
        break
    } catch {
        $attempt++
        if ($attempt -ge $maxAttempts) {
            Write-Host "  ❌ Neo4j failed to start" -ForegroundColor Red
            exit 1
        }
        Start-Sleep -Seconds 2
        Write-Host "  ⏳ Still waiting for Neo4j... ($attempt/$maxAttempts)" -ForegroundColor Yellow
    }
}
Write-Host "  ✅ Neo4j is ready" -ForegroundColor Green

# Check MCP Server
Write-Host "  Checking MCP Server..." -ForegroundColor Cyan
$maxAttempts = 15
$attempt = 0
while ($true) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9042/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        break
    } catch {
        $attempt++
        if ($attempt -ge $maxAttempts) {
            Write-Host "  ❌ MCP Server failed to start" -ForegroundColor Red
            docker logs mcp_server
            exit 1
        }
        Start-Sleep -Seconds 2
        Write-Host "  ⏳ Still waiting for MCP Server... ($attempt/$maxAttempts)" -ForegroundColor Yellow
    }
}
Write-Host "  ✅ MCP Server is ready" -ForegroundColor Green

# Check Open-WebUI
Write-Host "  Checking Open-WebUI..." -ForegroundColor Cyan
$maxAttempts = 15
$attempt = 0
while ($true) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        break
    } catch {
        $attempt++
        if ($attempt -ge $maxAttempts) {
            Write-Host "  ❌ Open-WebUI failed to start" -ForegroundColor Red
            docker logs mimir-open-webui
            exit 1
        }
        Start-Sleep -Seconds 2
        Write-Host "  ⏳ Still waiting for Open-WebUI... ($attempt/$maxAttempts)" -ForegroundColor Yellow
    }
}
Write-Host "  ✅ Open-WebUI is ready" -ForegroundColor Green

Write-Host ""
Write-Host "✨ All services started successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Access Points:" -ForegroundColor Cyan
Write-Host "  • Open-WebUI:    http://localhost:3000"
Write-Host "  • Neo4j Browser: http://localhost:7474"
Write-Host "  • MCP Server:    http://localhost:9042/health"
Write-Host ""
Write-Host "🎯 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Open http://localhost:3000 in your browser"
Write-Host "  2. Create an account (first user is admin)"
Write-Host "  3. Start chatting with Mimir!"
Write-Host ""
Write-Host "📚 Documentation: .\pipelines\README.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "🛑 To stop: docker-compose down" -ForegroundColor Yellow
Write-Host "📊 View logs: docker-compose logs -f" -ForegroundColor Yellow
