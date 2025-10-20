# Docker Resource Configuration

## Problem: Out of Memory Errors

If you see errors like:
```
llama runner process no longer running: -1
error loading llama server
```

This means Ollama doesn't have enough memory to load the models.

## Memory Requirements

### Current Model Memory Usage

| Model | Model Size | KV Cache | Total RAM Needed |
|-------|-----------|----------|------------------|
| `qwen3:8b` | 4.9 GB | 5.6 GB | **~10.6 GB** |
| `qwen2.5-coder:1.5b-base` | 986 MB | 1.2 GB | **~2.2 GB** |
| `qwen2.5-coder:7b` | 4.7 GB | 5.2 GB | **~9.9 GB** |

**Recommendation:** Allocate at least **16 GB RAM** to Docker for comfortable multi-model usage.

## How to Increase Docker Memory

### macOS (Docker Desktop)

1. **Open Docker Desktop**
2. Click **Settings** (gear icon)
3. Go to **Resources** → **Advanced**
4. Adjust **Memory** slider to **16 GB** (or higher)
5. Click **Apply & Restart**

**Visual Guide:**
```
Docker Desktop → Settings → Resources
┌─────────────────────────────────────┐
│ CPUs:        [====4====]            │
│ Memory:      [========16 GB========]│ ← Set this to 16GB
│ Swap:        [====1 GB====]         │
│ Disk image:  [====60 GB====]        │
└─────────────────────────────────────┘
```

### Linux (Docker Engine)

Docker on Linux uses host memory directly - no configuration needed. Just ensure your system has enough RAM:

```bash
# Check available memory
free -h

# Recommended: At least 16GB total system RAM
```

### Windows (Docker Desktop)

1. **Open Docker Desktop**
2. Click **Settings** (gear icon)
3. Go to **Resources** → **Advanced**
4. Set **Memory** to **16384 MB** (16 GB)
5. Click **Apply & Restart**

## Verify Configuration

After restarting Docker:

```bash
# Check Docker memory limit
docker info | grep -i memory

# Or check container stats
docker stats --no-stream ollama_server
```

You should see:
```
CONTAINER ID   NAME            MEM USAGE / LIMIT
150ce6c1d669   ollama_server   41.32MiB / 16GiB    ← Should show 16GiB
```

## Alternative: Reduce Context Window

If you can't allocate 16GB, reduce the context window in `.mimir/llm-config.json`:

```json
"qwen3:8b": {
  "name": "qwen3:8b",
  "contextWindow": 40960,  // ← Change to 16384 or 8192
  "config": {
    "numCtx": 40960  // ← Must match contextWindow
  }
}
```

**Memory savings:**
- `numCtx: 40960` → 5.6 GB KV cache
- `numCtx: 16384` → 2.3 GB KV cache (saves 3.3 GB)
- `numCtx: 8192` → 1.2 GB KV cache (saves 4.4 GB)

## Troubleshooting

### Still seeing crashes after increasing memory?

1. **Restart Docker completely:**
   ```bash
   docker compose down
   docker system prune -f
   
   # Rebuild with consistent tag to avoid image clutter
   docker build . -t mimir
   docker compose up -d
   ```

2. **Check actual memory allocation:**
   ```bash
   docker run --rm alpine free -h
   ```

3. **Verify qwen3:8b loads:**
   ```bash
   docker exec ollama_server ollama run qwen3:8b "Hello"
   ```

### Can't allocate 16GB?

Use smaller models or reduced context:
- **Option 1**: Use `qwen2.5-coder:1.5b-base` for all agents (2.2GB total)
- **Option 2**: Reduce `numCtx` to 16384 (cuts memory by 30%)
- **Option 3**: Use external Ollama on a more powerful machine

## Running Ollama Externally

If your local machine is resource-constrained:

```bash
# On powerful machine (Linux server, workstation)
ollama serve

# In Mimir's .env or docker compose.yml
OLLAMA_BASE_URL=http://your-server-ip:11434
```

Then comment out the `ollama` service in `docker compose.yml`.

## System Recommendations

| Use Case | Recommended RAM | Docker Allocation |
|----------|----------------|-------------------|
| Development (single model) | 8 GB | 6 GB |
| Production (multi-model) | 16 GB | 16 GB |
| Heavy workloads | 32 GB | 24 GB |

## 💡 Pro Tip: Consistent Image Tagging

Always tag your Docker builds to avoid creating multiple unnamed images:

```bash
# ✅ Good: Uses consistent tag
docker build . -t mimir
docker compose up -d

# ❌ Bad: Creates unnamed/dangling images
docker build .
```

**Clean up old images:**
```bash
# List all images
docker images

# Remove dangling images
docker image prune -f

# Remove old mimir images (keep only latest)
docker images mimir --format "{{.ID}}" | tail -n +2 | xargs docker rmi
```

---

**After configuring Docker resources, restart the services:**
```bash
# Rebuild and restart
docker build . -t mimir
docker compose restart

# Or
npm run chain "your task here"
```
