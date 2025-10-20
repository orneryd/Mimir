# Docker Path Mapping Guide

## Understanding Container Paths

When running the MCP server in Docker, paths work differently than on your host machine.

## Path Mapping

### Host → Container Mapping

| Host Path | Container Path | Description |
|-----------|----------------|-------------|
| `/Users/timothysweet/src` | `/workspace` | Your source code directory |
| `/Users/timothysweet/src/ngx-cmk-translate` | `/workspace/ngx-cmk-translate` | A project in your src directory |
| `/Users/timothysweet/src/GRAPH-RAG-TODO-main/data` | `/app/data` | MCP server data |
| `/Users/timothysweet/src/GRAPH-RAG-TODO-main/logs` | `/app/logs` | MCP server logs |

## Configuration

### Default Setup

By default, the docker compose mounts:
```yaml
volumes:
  - /Users/timothysweet/src:/workspace:ro
```

**Inside container:**
- `WORKSPACE_ROOT=/workspace`

### Custom Workspace Root

To mount a different directory:

```bash
HOST_WORKSPACE_ROOT=/path/to/your/projects docker compose up
```

**Examples:**

```bash
# Mount your entire home directory
HOST_WORKSPACE_ROOT=/Users/timothysweet docker compose up

# Mount a specific projects folder
HOST_WORKSPACE_ROOT=/Users/timothysweet/Documents/projects docker compose up
```

## Using File Indexing Tools

### ❌ WRONG: Using Host Paths

```json
{
  "path": "/Users/timothysweet/src/ngx-cmk-translate"
}
```

**Error:** Path not found (container can't see host paths)

### ✅ CORRECT: Using Container Paths

```json
{
  "path": "/workspace/ngx-cmk-translate"
}
```

**Success:** Container can access mounted directory

## Common Use Cases

### 1. Index a Single Project

**Host path:** `/Users/timothysweet/src/my-project`

**MCP tool call:**
```json
{
  "path": "/workspace/my-project"
}
```

### 2. Index Multiple Projects

**Host paths:**
- `/Users/timothysweet/src/project-a`
- `/Users/timothysweet/src/project-b`

**MCP tool calls:**
```json
{
  "path": "/workspace/project-a"
}
```
```json
{
  "path": "/workspace/project-b"
}
```

### 3. Index Nested Directories

**Host path:** `/Users/timothysweet/src/monorepo/packages/web-app`

**MCP tool call:**
```json
{
  "path": "/workspace/monorepo/packages/web-app"
}
```

## Environment Variables

### In docker compose.yml

```yaml
environment:
  - WORKSPACE_ROOT=/workspace  # Container path (fixed)
  
volumes:
  - ${HOST_WORKSPACE_ROOT:-/Users/timothysweet/src}:/workspace:ro
```

### Override at Runtime

```bash
# Change host mount point
HOST_WORKSPACE_ROOT=/path/to/projects docker compose up

# Container still uses /workspace internally
```

## Verification

### Check Mounted Directories

```bash
# Connect to container
docker exec -it mcp_server sh

# List workspace contents
ls -la /workspace

# Should see your projects
```

### Test Path Access

```bash
# From container
ls -la /workspace/ngx-cmk-translate

# Should show project files
```

## Troubleshooting

### "Path not found" Errors

**Problem:** Using host paths instead of container paths

**Solution:** 
- Host: `/Users/timothysweet/src/project`
- Container: `/workspace/project` ← Use this!

### "Permission denied" Errors

**Problem:** Volume mounted as read-only (`:ro`) prevents writes

**Solution:** For file indexing (read-only), this is correct. Files are indexed but not modified.

### "Directory empty" Errors

**Problem:** Wrong host directory mounted

**Solution:** 
1. Stop containers: `docker compose down`
2. Check `HOST_WORKSPACE_ROOT` points to correct directory
3. Restart: `HOST_WORKSPACE_ROOT=/correct/path docker compose up`

## Quick Reference

### Command Line Usage

```bash
# Start with default workspace (/Users/timothysweet/src)
docker compose up

# Start with custom workspace
HOST_WORKSPACE_ROOT=/Users/timothysweet/Documents/code docker compose up

# Start with entire home directory
HOST_WORKSPACE_ROOT=/Users/timothysweet docker compose up
```

### MCP Tool Calls (Always Use Container Paths)

```javascript
// ❌ WRONG
watch_folder({ path: "/Users/timothysweet/src/project" })

// ✅ CORRECT
watch_folder({ path: "/workspace/project" })

// ❌ WRONG
index_folder({ path: "/Users/timothysweet/src/monorepo" })

// ✅ CORRECT
index_folder({ path: "/workspace/monorepo" })
```

## Advanced: Multiple Workspace Roots

If you need to mount multiple separate directories:

```yaml
volumes:
  - /Users/timothysweet/src:/workspace/src:ro
  - /Users/timothysweet/Documents/projects:/workspace/projects:ro
  - /Users/timothysweet/code:/workspace/code:ro
```

Then use paths like:
- `/workspace/src/ngx-cmk-translate`
- `/workspace/projects/my-app`
- `/workspace/code/another-project`

## See Also

- [DOCKER_DEPLOYMENT_GUIDE.md](./DOCKER_DEPLOYMENT_GUIDE.md) - Full Docker setup
- [FILE_INDEXING_SYSTEM.md](../architecture/FILE_INDEXING_SYSTEM.md) - File indexing details
