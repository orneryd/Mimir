# Docker Deployment Guide

**MCP TODO & Knowledge Graph Server - Containerized Deployment**

Version: 3.0.1  
Last Updated: 2025-10-14

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (5-Minute Setup)](#quick-start-5-minute-setup)
3. [Configuration](#configuration)
4. [Volume Management](#volume-management)
5. [HTTP API Usage](#http-api-usage)
6. [Docker Compose Commands Reference](#docker compose-commands-reference)
7. [Troubleshooting](#troubleshooting)
8. [Production Deployment](#production-deployment)

---

## Prerequisites

### Required Software

- **Docker**: Version 20.10 or higher
  - [Install Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - Or install Docker Engine on Linux: `curl -fsSL https://get.docker.com | sh`
  
- **Docker Compose**: Version 2.0 or higher
  - Included with Docker Desktop
  - Linux: `sudo apt-get install docker compose-plugin`

### Verify Installation

```bash
docker --version
# Expected: Docker version 20.10+ or higher

docker compose --version
# Expected: Docker Compose version v2.0+ or higher
```

### System Requirements

- **CPU**: 1 core minimum, 2+ recommended
- **RAM**: 512MB minimum, 1GB+ recommended
- **Disk**: 500MB for image + storage for data
- **Network**: Port 3000 must be available

---

## Quick Start (5-Minute Setup)

### Step 1: Clone and Navigate

```bash
git clone <repository-url>
cd GRAPH-RAG-TODO-main
```

### Step 2: Create Environment File

```bash
cp .env.example .env
```

**Optional**: Edit `.env` to customize settings (defaults work for most cases)

### Step 3: Build and Start

```bash
# Build the Docker image with consistent tag
docker build . -t mimir
docker compose up -d

# Or use docker compose build (also uses 'mimir' tag via compose config)
docker compose build
docker compose up -d
```

**Note**: Always use `-t mimir` when building manually to avoid creating multiple unnamed images.

### Step 4: Verify Health

```bash
curl http://localhost:3000/health
```

**Expected response**:
```json
{"status":"healthy","version":"3.0.1"}
```

### Step 5: Make Your First API Call

```bash
# Initialize session and capture session ID
SESSION=$(curl -s -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' \
  | sed -n "s/^Mcp-Session-Id: //p" | tr -d '\r')

echo "Session ID: $SESSION"

# Create a TODO
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "create_todo",
      "arguments": {
        "title": "My first Docker TODO",
        "description": "Testing the containerized server"
      }
    },
    "id": 2
  }' | jq '.'
```

**🎉 You're up and running!**

---

## Configuration

### Environment Variables

All configuration is done via environment variables in `.env` file:

#### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `production` | Node.js environment mode |

#### Memory Persistence Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_MEMORY_STORE_PATH` | `/app/data/.mcp-memory-store.json` | Path to persistence file inside container |
| `MCP_MEMORY_SAVE_INTERVAL` | `10` | Number of write operations before auto-save |

#### Memory Decay Configuration

Memory decay controls how long different types of data persist:

| Variable | Default | Description | Duration |
|----------|---------|-------------|----------|
| `MCP_MEMORY_TODO_TTL` | `86400000` | Time-to-live for TODO items | 24 hours |
| `MCP_MEMORY_PHASE_TTL` | `604800000` | Time-to-live for Phase nodes | 7 days |
| `MCP_MEMORY_PROJECT_TTL` | `-1` | Time-to-live for Project nodes | Permanent |

**Note**: TTL values are in milliseconds. Use `-1` for permanent retention.

### Example `.env` File

```env
# Server
PORT=3000
NODE_ENV=production

# Persistence
MCP_MEMORY_STORE_PATH=/app/data/.mcp-memory-store.json
MCP_MEMORY_SAVE_INTERVAL=10

# Memory Decay (in milliseconds)
MCP_MEMORY_TODO_TTL=86400000      # 24 hours
MCP_MEMORY_PHASE_TTL=604800000    # 7 days
MCP_MEMORY_PROJECT_TTL=-1         # permanent

# Development/Debugging
# NODE_ENV=development
# MCP_MEMORY_SAVE_INTERVAL=5
```

### Customizing Port

To run on a different port (e.g., 8080):

1. Edit `.env`:
   ```env
   PORT=8080
   ```

2. Edit `docker compose.yml`:
   ```yaml
   ports:
     - "8080:8080"
   ```

3. Restart:
   ```bash
   docker compose down
   docker compose up -d
   ```

---

## Volume Management

### Understanding Volumes

The server uses Docker volumes for persistent storage:

```yaml
volumes:
  - ./data:/app/data        # Memory persistence file
  - ./logs:/app/logs        # Application logs (if enabled)
```

**On your host**: Data persists in `./data/.mcp-memory-store.json`

### Backup Procedures

#### Manual Backup

```bash
# Create timestamped backup
cp data/.mcp-memory-store.json "backups/memory-backup-$(date +%Y%m%d-%H%M%S).json"
```

#### Automated Backup Script

Create `backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
cp data/.mcp-memory-store.json "$BACKUP_DIR/memory-backup-$TIMESTAMP.json"
echo "Backup created: $BACKUP_DIR/memory-backup-$TIMESTAMP.json"

# Keep only last 7 backups
cd "$BACKUP_DIR"
ls -t memory-backup-*.json | tail -n +8 | xargs rm -f
```

Run daily via cron:
```bash
0 2 * * * /path/to/backup.sh
```

### Restore Procedures

#### From Backup

```bash
# Stop server
docker compose down

# Restore backup
cp backups/memory-backup-20251014-020000.json data/.mcp-memory-store.json

# Start server
docker compose up -d
```

#### Handling Corruption

If memory file is corrupted on startup:

1. Server will log: `⚠️ Memory corruption detected`
2. Restore from most recent backup (see above)
3. If no backup exists, delete corrupted file and restart:
   ```bash
   docker compose down
   rm data/.mcp-memory-store.json
   docker compose up -d
   ```

### Data Migration

#### Export All Data

```bash
SESSION=$(curl -s -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"export","version":"1.0.0"}},"id":1}' \
  | sed -n "s/^Mcp-Session-Id: //p" | tr -d '\r')

curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "graph_export",
      "arguments": {}
    },
    "id": 2
  }' | jq '.result.content[0].text' > full-export.json
```

---

## HTTP API Usage

### Authentication & Session Management

The MCP server uses session-based authentication via the `Mcp-Session-Id` header.

#### Step 1: Initialize Session

```bash
SESSION=$(curl -s -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "your-app",
        "version": "1.0.0"
      }
    },
    "id": 1
  }' \
  | sed -n "s/^Mcp-Session-Id: //p" | tr -d '\r')

echo "Session ID: $SESSION"
```

#### Step 2: Call MCP Tools

All tool calls use the `tools/call` JSON-RPC method wrapper:

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "<tool_name>",
      "arguments": {
        "<arg1>": "<value1>",
        "<arg2>": "<value2>"
      }
    },
    "id": 2
  }'
```

### Complete Examples

#### Create TODO

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "create_todo",
      "arguments": {
        "title": "Deploy to production",
        "description": "Test deployment with docker compose",
        "priority": "high"
      }
    },
    "id": 2
  }' | jq '.result.content[0].text'
```

#### List All TODOs

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_todos",
      "arguments": {}
    },
    "id": 3
  }' | jq '.'
```

#### Create Knowledge Graph Node

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "graph_add_node",
      "arguments": {
        "type": "concept",
        "label": "Docker Deployment",
        "properties": {
          "description": "Production containerized deployment",
          "status": "active"
        }
      }
    },
    "id": 4
  }' | jq '.'
```

#### Update Knowledge Graph Node

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "graph_update_node",
      "arguments": {
        "id": "<node-id>",
        "properties": {
          "status": "completed",
          "completed_at": "2025-10-14T12:00:00.000Z"
        }
      }
    },
    "id": 5
  }' | jq '.'
```

#### Get Knowledge Graph Statistics

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "graph_get_stats",
      "arguments": {}
    },
    "id": 6
  }' | jq '.'
```

### Available Tools

See [AGENTS.md](../AGENTS.md) for complete list of 33 available MCP tools.

**Tool Categories**:
- **TODO Management** (7 tools): `create_todo`, `list_todos`, `get_todo`, `update_todo`, `delete_todo`, `add_todo_note`, `update_todo_context`
- **Knowledge Graph** (11 tools): `graph_add_node`, `graph_update_node`, `graph_delete_node`, `graph_add_edge`, `graph_delete_edge`, `graph_get_node`, `graph_query_nodes`, `graph_search_nodes`, `graph_get_neighbors`, `graph_get_stats`, `graph_export`
- **Advanced** (15 tools): Batch operations, ranked queries, subgraph extraction, and more

---

## Docker Compose Commands Reference

### Basic Operations

```bash
# Build image
docker compose build

# Start server (detached)
docker compose up -d

# Start server (with logs)
docker compose up

# Stop server
docker compose down

# Restart server
docker compose restart

# Stop and remove volumes (⚠️ deletes data!)
docker compose down -v
```

### Monitoring & Logs

```bash
# View logs (live tail)
docker compose logs -f

# View last 100 lines
docker compose logs --tail=100

# Check container status
docker compose ps

# View resource usage
docker stats
```

### Maintenance

```bash
# Rebuild from scratch with consistent tag
docker build . -t mimir --no-cache
docker compose up -d

# Or use docker compose
docker compose build --no-cache
docker compose up -d

# Pull latest base images
docker compose pull

# Remove stopped containers
docker compose rm

# Execute command inside container
docker compose exec mcp-server sh
```

### Health Checks

```bash
# Check health status
docker compose ps

# Manual health check
curl http://localhost:3000/health

# View health check logs
docker inspect --format='{{json .State.Health}}' \
  $(docker compose ps -q mcp-server) | jq '.'
```

---

## Troubleshooting

### Container Won't Start

**Symptom**: `docker compose up` fails immediately

**Solutions**:

1. **Port already in use**:
   ```bash
   # Check what's using port 3000
   lsof -i :3000
   
   # Kill process or change port in .env and docker compose.yml
   ```

2. **Permission issues**:
   ```bash
   # Ensure data directory is writable
   chmod 755 data/
   ```

3. **Check logs**:
   ```bash
   docker compose logs mcp-server
   ```

### Memory File Corruption

**Symptom**: Server starts but logs show `⚠️ Memory corruption detected`

**Solutions**:

1. **Restore from backup**:
   ```bash
   docker compose down
   cp backups/memory-backup-<timestamp>.json data/.mcp-memory-store.json
   docker compose up -d
   ```

2. **Start fresh** (⚠️ loses all data):
   ```bash
   docker compose down
   rm data/.mcp-memory-store.json
   docker compose up -d
   ```

### API Returns 400 "Server not initialized"

**Symptom**: Tool calls fail with `"Bad Request: Server not initialized"`

**Cause**: Missing or invalid session initialization

**Solution**: Always call `initialize` method first (see [HTTP API Usage](#http-api-usage))

### Session Expires or Lost

**Symptom**: Previously working session returns errors

**Cause**: Server restart clears sessions

**Solution**: Re-initialize session after server restarts:

```bash
SESSION=$(curl -s -i -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"reconnect","version":"1.0.0"}},"id":1}' \
  | sed -n "s/^Mcp-Session-Id: //p" | tr -d '\r')
```

### High Memory Usage

**Symptom**: Container using excessive RAM

**Solutions**:

1. **Clear old memory** (decay isn't working):
   ```bash
   # Export data first
   # ... (see Volume Management)
   
   # Restart to trigger decay cleanup
   docker compose restart
   ```

2. **Adjust TTL values** in `.env`:
   ```env
   MCP_MEMORY_TODO_TTL=43200000   # 12 hours instead of 24
   MCP_MEMORY_PHASE_TTL=259200000 # 3 days instead of 7
   ```

### Image Build Fails

**Symptom**: `docker compose build` fails with npm errors

**Solutions**:

1. **Authentication issues** (enterprise environments):
   ```bash
   # Use BuildKit secrets with consistent tag
   DOCKER_BUILDKIT=1 docker build --secret id=npmrc,src=$HOME/.npmrc -t mimir .
   ```

2. **Network issues**:
   ```bash
   # Clear Docker build cache
   docker builder prune
   
   # Rebuild with consistent tag
   docker build . -t mimir
   docker compose up -d
   ```
   
   # Rebuild
   docker compose build --no-cache
   ```

### Health Check Failing

**Symptom**: `docker compose ps` shows `unhealthy` status

**Debug**:

```bash
# Test health endpoint manually
curl http://localhost:3000/health

# Check container logs
docker compose logs --tail=50 mcp-server

# Inspect health check details
docker inspect $(docker compose ps -q mcp-server) \
  | jq '.[0].State.Health'
```

---

## Production Deployment

### Security Recommendations

#### 1. Use HTTPS Reverse Proxy

**Never expose the HTTP server directly to the internet.** Use a reverse proxy like Nginx or Caddy:

**Example Nginx config** (`/etc/nginx/sites-available/mcp-server`):

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Preserve session headers
        proxy_set_header Mcp-Session-Id $http_mcp_session_id;
    }
}
```

#### 2. Firewall Configuration

```bash
# Allow only reverse proxy to access MCP server
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp  # Block direct access
sudo ufw enable
```

#### 3. Environment Variable Security

**Never commit `.env` file to version control!**

```bash
# Ensure .env is in .gitignore
echo ".env" >> .gitignore

# Set restrictive permissions
chmod 600 .env
```

#### 4. Run as Non-Root (Already Implemented)

The Dockerfile already runs as non-root user `node`. Verify:

```bash
docker compose exec mcp-server whoami
# Expected: node
```

### Scalability Considerations

#### Resource Limits

Add to `docker compose.yml`:

```yaml
services:
  mcp-server:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

#### Multiple Instances

For load balancing, use Docker Swarm or Kubernetes. **Note**: Current implementation uses in-memory session storage, so sticky sessions are required.

**Nginx sticky sessions**:

```nginx
upstream mcp_backend {
    ip_hash;  # Sticky sessions
    server mcp-server-1:3000;
    server mcp-server-2:3000;
}
```

### Monitoring

#### Health Check Monitoring

Use tools like Uptime Kuma, Prometheus, or Datadog:

```yaml
# docker compose.yml
services:
  mcp-server:
    # ... existing config ...
    labels:
      - "prometheus.scrape=true"
      - "prometheus.port=3000"
      - "prometheus.path=/health"
```

#### Log Aggregation

Send logs to centralized logging:

```yaml
services:
  mcp-server:
    # ... existing config ...
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Backup Strategy

#### Automated Backups

**Systemd timer** (Linux):

Create `/etc/systemd/system/mcp-backup.service`:

```ini
[Unit]
Description=MCP Memory Backup

[Service]
Type=oneshot
ExecStart=/opt/mcp-server/backup.sh
User=your-user
```

Create `/etc/systemd/system/mcp-backup.timer`:

```ini
[Unit]
Description=MCP Backup Timer

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl enable --now mcp-backup.timer
```

#### Off-site Backups

```bash
# Sync to S3
aws s3 sync ./backups/ s3://your-bucket/mcp-backups/

# Or rsync to remote server
rsync -avz ./backups/ user@backup-server:/backups/mcp/
```

### Update Strategy

#### Zero-Downtime Updates

1. **Pull new image**:
   ```bash
   docker compose pull
   ```

2. **Backup data**:
   ```bash
   ./backup.sh
   ```

3. **Restart with new image**:
   ```bash
   docker compose up -d
   ```

   Docker Compose will:
   - Start new container
   - Wait for health check
   - Stop old container

### Disaster Recovery

#### Recovery Checklist

1. ✅ Restore `.env` from secure backup
2. ✅ Restore latest `data/.mcp-memory-store.json` backup
3. ✅ Verify Docker and Docker Compose installed
4. ✅ Run `docker compose up -d`
5. ✅ Test health endpoint
6. ✅ Verify data integrity with sample API calls

#### Recovery Time Objective (RTO)

With proper backups: **< 5 minutes**

```bash
# Disaster recovery script
#!/bin/bash
set -e

# Restore env
cp /secure-backups/.env .env

# Restore data
mkdir -p data
cp /secure-backups/latest-memory-backup.json data/.mcp-memory-store.json

# Start server
docker compose up -d

# Wait for health
until curl -f http://localhost:3000/health; do
    echo "Waiting for server..."
    sleep 2
done

echo "✅ Recovery complete!"
```

---

## Additional Resources

- **Main Documentation**: [README.md](../README.md)
- **Agent Integration**: [AGENTS.md](../AGENTS.md)
- **Architecture**: [docs/architecture/](./architecture/)
- **Testing Guide**: [docs/testing/TESTING_GUIDE.md](./testing/TESTING_GUIDE.md)
- **Configuration**: [docs/configuration/CONFIGURATION.md](./configuration/CONFIGURATION.md)

---

## Support

For issues or questions:
- GitHub Issues: [Repository Issues](https://github.com/your-org/repo/issues)
- Documentation: [docs/](./

)
- Enterprise Support: ai-support@cvshealth.com

---

**Last Updated**: 2025-10-14  
**Version**: 3.0.1  
**Maintainer**: CVS Health Enterprise AI Team

