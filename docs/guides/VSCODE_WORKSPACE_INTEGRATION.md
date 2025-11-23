# VSCode Workspace Integration Guide

## Overview

When using Mimir's VSCode extension with a Dockerized Mimir server, tool calls (file operations, shell commands, etc.) need to execute in the **user's VSCode workspace**, not the server's container filesystem. This guide explains how Mimir automatically handles Docker path translation.

---

## How It Works

### 1. The Problem

```
User opens:    /Users/c815719/src/myproject  (Host filesystem)
                     ↓
VSCode sends:  /Users/c815719/src/myproject  (Host path in API request)
                     ↓
Mimir server:  Running in Docker container
                     ↓
Container sees: /workspace/myproject  (Container filesystem)
```

**Without translation**: Tools would try to access `/Users/c815719/src/myproject` inside the container, which doesn't exist! ❌

**With translation**: Mimir automatically converts host paths to container paths using Docker volume mounts. ✅

---

## Docker Volume Configuration

### Current Setup (docker-compose.yml)

```yaml
mimir-server:
  environment:
    - WORKSPACE_ROOT=/workspace              # Container mount point
    - HOST_WORKSPACE_ROOT=${HOST_WORKSPACE_ROOT}  # Host base path
  volumes:
    - ${HOST_WORKSPACE_ROOT:-~/src}:/workspace:ro  # Default: ~/src → /workspace
```

### Default Behavior

| Environment Variable | Default Value | Purpose |
|---------------------|---------------|---------|
| `HOST_WORKSPACE_ROOT` | `~/src` (e.g., `/Users/c815719/src`) | Base directory on host containing projects |
| `WORKSPACE_ROOT` | `/workspace` | Mount point inside container |

---

## Path Translation Rules

### ✅ Supported Workspace Locations

Your VSCode workspace **MUST** be a child or descendant of `HOST_WORKSPACE_ROOT`:

| VSCode Workspace (Host) | Container Path | Status |
|------------------------|----------------|--------|
| `/Users/c815719/src/myproject` | `/workspace/myproject` | ✅ Works |
| `/Users/c815719/src/foo/bar/baz` | `/workspace/foo/bar/baz` | ✅ Works |
| `~/src/client-project` | `/workspace/client-project` | ✅ Works |
| `/Users/c815719/src` | `/workspace` | ✅ Works (root) |

### ❌ Unsupported Workspace Locations

Folders **outside** the mounted path are **NOT accessible** in the container:

| VSCode Workspace (Host) | Container Path | Status |
|------------------------|----------------|--------|
| `/Users/c815719/Documents/project` | ❌ Not mounted | ❌ Won't work |
| `/tmp/test-project` | ❌ Not mounted | ❌ Won't work |
| `/opt/projects/app` | ❌ Not mounted | ❌ Won't work |

**Warning**: If you open a workspace outside `HOST_WORKSPACE_ROOT`, the extension will send the path, but tools will fail because the files aren't accessible in the container.

---

## Customizing the Mount Path

### Option 1: Change via Environment Variable

```bash
# In your shell or .bashrc/.zshrc
export HOST_WORKSPACE_ROOT=/Users/c815719/projects

# Then start Docker
docker-compose up -d
```

This mounts `/Users/c815719/projects` → `/workspace` in the container.

**⚠️ Windows Users - Critical Requirements:**

Windows paths work with either forward slashes or backslashes, **BUT the drive letter MUST be lowercase**:

```bash
# ✅ CORRECT - lowercase drive letter
HOST_WORKSPACE_ROOT=c:\Users\timot\Documents\GitHub
HOST_WORKSPACE_ROOT=c:/Users/timot/Documents/GitHub

# ❌ WRONG - uppercase drive letter (path translation will fail!)
HOST_WORKSPACE_ROOT=C:\Users\timot\Documents\GitHub
HOST_WORKSPACE_ROOT=C:/Users/timot/Documents/GitHub
```

**Why the lowercase requirement:**
- Path translation uses string comparison after normalization
- `path.resolve()` on Windows converts drive letters to lowercase internally
- If you use `C:` it won't match the normalized `c:` and path translation fails
- Symptoms: "ENOENT: no such file or directory" errors when indexing

**Quick fix if you have uppercase:**
```bash
# Change this:
HOST_WORKSPACE_ROOT=C:\Users\timot\Documents\GitHub

# To this:
HOST_WORKSPACE_ROOT=c:\Users\timot\Documents\GitHub
```

### Option 2: Modify docker-compose.yml

Edit the volume mount directly:

```yaml
volumes:
  - /Users/c815719/projects:/workspace:ro
```

### Option 3: Multi-Path Support (Advanced)

If you need to access projects from multiple locations, add additional volume mounts:

```yaml
volumes:
  - ~/src:/workspace/src:ro           # Personal projects
  - ~/work:/workspace/work:ro         # Work projects
  - ~/clients:/workspace/clients:ro   # Client projects
```

**Note**: Update `HOST_WORKSPACE_ROOT` and path translation logic to handle multiple roots.

---

## Path Translation Flow

### Example: Creating a file

**1. User action:**
```
VSCode workspace: /Users/c815719/src/myproject
User: "@mimir create a file called test.py"
```

**2. VSCode extension sends:**
```json
{
  "working_directory": "/Users/c815719/src/myproject",
  "messages": [{"role": "user", "content": "create a file called test.py"}]
}
```

**3. Mimir server receives & translates:**
```typescript
// workspace-context.ts
HOST_WORKSPACE_ROOT = "/Users/c815719/src"
WORKSPACE_ROOT = "/workspace"

translatePathToContainer("/Users/c815719/src/myproject")
  → relativePath = "myproject"
  → containerPath = "/workspace/myproject"
```

**4. Tool executes in container:**
```bash
# Inside container
cd /workspace/myproject
touch test.py
```

**5. File appears on host:**
```
/Users/c815719/src/myproject/test.py ✅
```

---

## Implementation Details

### VSCode Extension (`extension.ts`)

Automatically detects the workspace and sends it with every chat request:

```typescript
const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
const workingDirectory = workspaceFolder?.uri.fsPath;

const requestBody = {
  messages,
  model: selectedModel,
  working_directory: workingDirectory, // e.g., "/Users/c815719/src/myproject"
  // ... other params
};
```

### Chat API (`chat-api.ts`)

Extracts `working_directory` and passes it to the agent:

```typescript
const { working_directory, messages, model } = req.body;

const result = await agent.execute(
  task,
  0,
  max_tool_calls,
  undefined,
  working_directory  // Host path
);
```

### Agent Client (`llm-client.ts`)

Wraps execution in workspace context:

```typescript
if (workingDirectory) {
  return runWithWorkspaceContext(
    { workingDirectory },  // Host path
    executeWithContext
  );
}
```

### Workspace Context (`workspace-context.ts`)

Translates path and propagates to tools via `AsyncLocalStorage`:

```typescript
function translatePathToContainer(hostPath: string): string {
  const hostRoot = process.env.HOST_WORKSPACE_ROOT || "~/src";
  const containerRoot = process.env.WORKSPACE_ROOT || "/workspace";
  
  // /Users/c815719/src/myproject → myproject
  const relativePath = path.relative(hostRoot, hostPath);
  
  // /workspace + myproject → /workspace/myproject
  return path.posix.join(containerRoot, relativePath);
}
```

### Tools (`tools.ts`)

Use translated path from context:

```typescript
const workingDir = getWorkingDirectory();  // Returns /workspace/myproject

await execAsync(command, {
  cwd: workingDir  // Executes in correct directory
});
```

---

## Troubleshooting

### Issue: "File created in wrong location"

**Symptom**: LLM creates files in `/app/` instead of user's workspace.

**Diagnosis**:
```bash
# Check if workspace is mounted
docker exec mimir_server ls -la /workspace
# Should show your project files

# Check environment variables
docker exec mimir_server env | grep WORKSPACE
# Should show WORKSPACE_ROOT and HOST_WORKSPACE_ROOT
```

**Solution**: Ensure workspace is under `HOST_WORKSPACE_ROOT`.

### Issue: "Permission denied" errors

**Symptom**: Cannot write files in workspace.

**Diagnosis**: Check volume mount permissions in `docker-compose.yml`:
```yaml
volumes:
  - ${HOST_WORKSPACE_ROOT:-~/src}:/workspace:ro  # ← "ro" = read-only!
```

**Solution**: Change to read-write:
```yaml
volumes:
  - ${HOST_WORKSPACE_ROOT:-~/src}:/workspace  # Remove ":ro"
```

### Issue: "No such file or directory"

**Symptom**: Tools can't find files that exist in VSCode.

**Diagnosis**: Workspace is outside mounted path.

**Solution**: 
1. Move project to `~/src/` (or configured `HOST_WORKSPACE_ROOT`)
2. OR change `HOST_WORKSPACE_ROOT` to include your project's parent directory

### Issue: Path translation logs not appearing

**Check if running in Docker:**
```typescript
import { isRunningInDocker } from './workspace-context';

if (isRunningInDocker()) {
  console.log('✅ Running in Docker - path translation enabled');
} else {
  console.log('ℹ️  Running locally - no path translation needed');
}
```

---

## Non-Docker Setup (Local Development)

If running Mimir **without Docker** (directly on host):

### No Translation Needed

When `WORKSPACE_ROOT` is not set, paths are used as-is:

```typescript
// Host path from VSCode
working_directory: "/Users/c815719/src/myproject"

// Server running on host
getWorkingDirectory() → "/Users/c815719/src/myproject"  ✅ Direct access
```

### Requirements

- ✅ No path restrictions
- ✅ Can open any folder in VSCode
- ✅ Full filesystem access

---

## Security Considerations

### Read-Only Mount (Recommended for Production)

```yaml
volumes:
  - ${HOST_WORKSPACE_ROOT:-~/src}:/workspace:ro  # Read-only
```

**Pros:**
- ✅ LLM cannot modify files outside approved workspace
- ✅ Protects system files from accidental/malicious writes

**Cons:**
- ❌ Cannot create/edit files (read-only mode only)

**Use case**: When you only want LLM to read files, not modify them.

### Read-Write Mount (Required for File Editing)

```yaml
volumes:
  - ${HOST_WORKSPACE_ROOT:-~/src}:/workspace  # Read-write
```

**Pros:**
- ✅ LLM can create/edit files as requested

**Cons:**
- ⚠️  LLM has write access to entire mounted directory tree

**Use case**: When you want LLM to assist with file creation/editing.

---

## Studio Workflow Integration

### Workflow Execution Context

When executing workflows from the Studio, specify `working_directory` in the workflow JSON:

```json
{
  "tasks": [
    {
      "id": "1",
      "type": "pm",
      "working_directory": "/Users/c815719/src/myproject"
    }
  ]
}
```

The Studio will automatically pass this to the orchestration API, which will apply the same path translation.

---

## Quick Reference

### Checklist Before Using VSCode Extension

- [ ] Mimir server running in Docker
- [ ] `HOST_WORKSPACE_ROOT` configured (default: `~/src`)
- [ ] VSCode workspace is **under** `HOST_WORKSPACE_ROOT`
- [ ] Volume mount is read-write (if editing files)
- [ ] Extension installed and connected to server

### Common Configurations

**Personal Projects Setup:**
```bash
export HOST_WORKSPACE_ROOT=~/src
# Open VSCode in: ~/src/myproject ✅
```

**Work Projects Setup:**
```bash
export HOST_WORKSPACE_ROOT=~/work
# Open VSCode in: ~/work/client-app ✅
```

**Multi-Root Setup (Advanced):**
```yaml
volumes:
  - ~/src:/workspace/src:ro
  - ~/work:/workspace/work:ro
```
```bash
# Then update path translation logic to handle multiple roots
```

---

## Summary

✅ **What Works:**
- VSCode workspaces under `HOST_WORKSPACE_ROOT` (default: `~/src`)
- Automatic path translation from host → container
- All file operations execute in correct directory
- Works with both chat and Studio workflows

❌ **What Doesn't Work:**
- Workspaces outside `HOST_WORKSPACE_ROOT`
- Paths not mounted in Docker volumes
- Absolute paths to system directories

🔧 **To Fix:**
- Move project under `~/src/` (or configured root)
- Update `HOST_WORKSPACE_ROOT` to include your project's parent
- Add additional volume mounts if needed

---

**Next Steps:**
1. Verify your workspace is under `~/src` (or configure `HOST_WORKSPACE_ROOT`)
2. Test with `@mimir list files in current directory`
3. Try creating a file: `@mimir create test.txt with hello world`
4. Check the file appears in your VSCode workspace ✅
