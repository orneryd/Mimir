# Smart Startup Script

The `start.js` script automatically detects your platform (macOS ARM64, macOS x64, Linux ARM64, Linux x64, or Windows) and uses the appropriate docker-compose file.

## Quick Start

```bash
# Start all services
npm run start

# Stop all services  
npm run stop

# Restart services
npm run restart

# View logs
npm run logs

# Check status
npm run status

# Full rebuild (no cache)
npm run rebuild
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run start` | Start all services (default) |
| `npm run stop` | Stop all services |
| `npm run restart` | Restart all services |
| `npm run rebuild` | Full rebuild without cache and restart |
| `npm run logs` | Follow service logs |
| `npm run status` | Show service status |

## Advanced Usage

You can also call the script directly with additional arguments:

```bash
# Start specific services
node ./scripts/start.js up neo4j llama-server

# View logs for specific service
node ./scripts/start.js logs mimir-server

# Clean everything (with confirmation)
node ./scripts/start.js clean
```

## Platform Detection

The script automatically detects:

- **macOS ARM64 (Apple Silicon)** → Uses `docker-compose.arm64.yml`
- **macOS x64 (Intel)** → Uses `docker-compose.yml`
- **Linux ARM64** → Uses `docker-compose.arm64.yml`
- **Linux x64** → Uses `docker-compose.yml`
- **Windows** → Uses `docker-compose.amd64.yml`

## Docker Compose Files

Each platform-specific file is optimized for that architecture:

- **docker-compose.arm64.yml**: Uses ARM64-native images
  - `timothyswt/llama-cpp-server-arm64:latest` (with embedded model)
  - `timothyswt/copilot-api-arm64:latest`

- **docker-compose.amd64.yml**: Uses CUDA-enabled images for Windows
  - `ghcr.io/ggml-org/llama.cpp:server-cuda` (external model volume)
  - `timothyswt/copilot-api:latest`

- **docker-compose.yml**: Default x64 configuration

## Services

After starting, access:

- **Mimir Server**: http://localhost:9042
- **Neo4j Browser**: http://localhost:7474
- **Copilot API**: http://localhost:4141
- **LLM Embeddings**: http://localhost:11434
