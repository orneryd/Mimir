# Storage Cleanup Guide

This guide shows where Docker and Ollama store data and how to clean it up.

## 📦 Storage Locations

### 1. Docker Ollama Models (Largest)

**Location (Containerized Ollama):**
```bash
./data/ollama/models/
```

**Size:** 1-10GB per model (can grow to 50-100GB with many models)

**What's stored:**
- Downloaded Ollama models (qwen3, qwen2.5-coder, gpt-oss, etc.)
- Model manifests and blobs

**To check size:**
```bash
du -sh ./data/ollama
```

**To clean up:**
```bash
# Stop services first
docker compose down

# Remove all Ollama data (models + metadata)
rm -rf ./data/ollama

# Or remove specific models (while container is running)
docker exec ollama_server ollama rm qwen3:8b
docker exec ollama_server ollama rm tinyllama
```

---

### 2. Host Ollama Models (If Running Locally)

**Location (macOS/Linux):**
```bash
~/.ollama/models/
```

**Size:** 1-10GB per model

**To check size:**
```bash
du -sh ~/.ollama
```

**To clean up:**
```bash
# Remove specific model
ollama rm qwen3:8b

# Remove all models
rm -rf ~/.ollama/models

# Nuclear option - remove everything including config
rm -rf ~/.ollama
```

---

### 3. Neo4j Database

**Location:**
```bash
./data/neo4j/data/
./data/neo4j/logs/
```

**Size:** Varies (typically 100MB-1GB for development)

**To check size:**
```bash
du -sh ./data/neo4j
```

**To clean up:**
```bash
# Stop services first
docker compose down

# Remove all graph data (⚠️ DELETES ALL YOUR TODOS/KNOWLEDGE GRAPH)
rm -rf ./data/neo4j

# Or remove with docker compose
docker compose down -v  # Removes named volumes too
```

---

### 4. Docker Images

**Location:** Docker's internal storage

**Size:** ~500MB-2GB for Mimir images

**To check:**
```bash
docker images | grep -E "mcp-server|ollama|neo4j"
```

**To clean up:**
```bash
# Remove specific images
docker rmi mcp-server:latest
docker rmi ollama/ollama:latest
docker rmi neo4j:5.15-community

# Remove all unused images
docker image prune -a

# Nuclear option - remove all Docker data
docker system prune -a --volumes
```

---

### 5. Build Artifacts

**Location:**
```bash
./build/          # Compiled TypeScript
./node_modules/   # Dependencies
```

**Size:** ~200-500MB

**To clean up:**
```bash
rm -rf ./build
rm -rf ./node_modules
npm install  # Reinstall if needed
```

---

### 6. Logs

**Location:**
```bash
./logs/neo4j/
./logs/
```

**Size:** Typically <50MB

**To clean up:**
```bash
rm -rf ./logs
```

---

## 🧹 Complete Cleanup Commands

### Minimal Cleanup (Keep Models)

Removes only Neo4j data and logs:

```bash
docker compose down
rm -rf ./data/neo4j
rm -rf ./logs
docker compose up -d
```

### Medium Cleanup (Remove Docker Models Only)

Removes Docker Ollama models but keeps host models:

```bash
docker compose down
rm -rf ./data/ollama
rm -rf ./data/neo4j
rm -rf ./logs
docker compose up -d
```

### Full Cleanup (Everything)

⚠️ **WARNING:** This removes ALL data, models, and images

```bash
# Stop and remove containers
docker compose down -v

# Remove all local data
rm -rf ./data
rm -rf ./logs
rm -rf ./build

# Remove Docker images
docker rmi mcp-server:latest ollama/ollama:latest neo4j:5.15-community

# If you want to remove host Ollama models too
rm -rf ~/.ollama
```

### Nuclear Option (Complete Docker Reset)

⚠️ **DANGER:** This removes ALL Docker data system-wide

```bash
docker system prune -a --volumes
```

---

## 📊 Quick Storage Check

Run this to see what's using space:

```bash
#!/bin/bash
echo "📊 Mimir Storage Usage"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Docker Ollama Models:"
du -sh ./data/ollama 2>/dev/null || echo "  Not found"

echo "Host Ollama Models:"
du -sh ~/.ollama 2>/dev/null || echo "  Not found"

echo "Neo4j Database:"
du -sh ./data/neo4j 2>/dev/null || echo "  Not found"

echo "Build Artifacts:"
du -sh ./build 2>/dev/null || echo "  Not found"

echo "Node Modules:"
du -sh ./node_modules 2>/dev/null || echo "  Not found"

echo "Logs:"
du -sh ./logs 2>/dev/null || echo "  Not found"

echo ""
echo "Docker Images:"
docker images | grep -E "mcp-server|ollama|neo4j" || echo "  No images found"

echo ""
echo "Total ./data directory:"
du -sh ./data 2>/dev/null || echo "  Not found"
```

Save this as `scripts/check-storage.sh` and run:
```bash
chmod +x scripts/check-storage.sh
./scripts/check-storage.sh
```

---

## 🎯 Recommended Cleanup Schedule

### Weekly
- Remove unused Docker images: `docker image prune`
- Clear old logs: `rm -rf ./logs/*`

### Monthly
- Review and remove unused Ollama models
- Check Neo4j database size (if over 1GB, export and reset)

### As Needed
- When disk space is low: Full cleanup
- Before major updates: Medium cleanup
- After testing: Remove test models

---

## 💡 Storage Tips

1. **Use .gitignore**: These directories are already ignored:
   - `./data/`
   - `./logs/`
   - `./build/`
   - `./node_modules/`

2. **Symlink models**: If you have multiple projects using Ollama:
   ```bash
   # Share models between Docker and host
   ln -s ~/.ollama ./data/ollama
   ```

3. **Monitor disk usage**:
   ```bash
   # macOS
   df -h

   # Docker disk usage
   docker system df
   ```

4. **Model recommendations**:
   - Keep only 2-3 models you actively use
   - qwen3:8b (5.2GB) + qwen2.5-coder:1.5b (986MB) = ~6GB minimal setup
   - Avoid keeping 70B+ models unless necessary (40-100GB each)

---

## 🆘 Emergency Space Recovery

If you're completely out of disk space:

```bash
# 1. Stop all services immediately
docker compose down

# 2. Remove Docker Ollama models (largest culprit)
rm -rf ./data/ollama

# 3. Remove Docker system cache
docker system prune -a --volumes

# 4. If still needed, remove host models
rm -rf ~/.ollama

# 5. Restart with minimal setup
docker compose up -d
```

This should recover 10-50GB depending on how many models were installed.
