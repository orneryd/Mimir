# Mimir File Browser for Open WebUI

## 📋 Overview

Since Open WebUI doesn't have a built-in way to display custom file lists in the workspace sidebar, I've created a **Tool Function** that displays watched folders in the chat window.

## 🎯 What It Does

The **Mimir File Browser** is an Action (tool) that provides two functions:

1. **`list_watched_folders()`** - Shows all folders currently being watched by Mimir
2. **`get_folder_stats(folder_path)`** - Shows detailed statistics for a specific folder

**Note:** This uses the `Action` class (not `Tools`) as required by Open WebUI.

## 📁 File Location

```
/Users/c815719/src/playground/mimir/pipelines/mimir_file_browser.py
```

## 🚀 How to Upload

### Upload to Open WebUI:

1. **Open Open WebUI**: http://localhost:3000
2. **Go to Admin Panel**: Profile icon → Settings → Admin Panel
3. **Navigate to Functions**: Click "Functions" in sidebar
4. **Import Function**: Click "+" button
5. **Upload**: Select `mimir_file_browser.py`
6. **Enable**: Toggle switch to ON
7. **Refresh**: Refresh browser

**Note:** Even though it's an "Action" class, you upload it under "Functions" in Open WebUI. Open WebUI will automatically detect it as an Action/Tool.

## 🧪 How to Use

Once uploaded, the AI can automatically call these tools when you ask about files:

### Example 1: List Watched Folders

**You ask:**
```
Show me what folders are being watched
```

**AI calls:**
```python
list_watched_folders()
```

**Output:**
```markdown
## 📂 Watched Folders (2 active)

### ✅ /Users/username/src/project1
- **Watch ID:** `watch-123`
- **Files Indexed:** 45
- **Recursive:** 🔄 Yes
- **Last Update:** 2025-11-06T10:30:00Z
- **Status:** Active

### ✅ /Users/username/src/project2
- **Watch ID:** `watch-456`
- **Files Indexed:** 23
- **Recursive:** 📁 No
- **Last Update:** 2025-11-06T09:15:00Z
- **Status:** Active

---

**Available Actions:**
- Use `index_folder` to add a new folder
- Use `remove_folder` to stop watching a folder
- Use `vector_search_nodes` to search indexed files
```

### Example 2: Get Folder Stats

**You ask:**
```
Show me stats for /Users/username/src/project1
```

**AI calls:**
```python
get_folder_stats("/Users/username/src/project1")
```

**Output:**
```markdown
## 📊 Folder Stats: /Users/username/src/project1

**Total Files:** 45

**File Types:**
- `typescript`: 20 files
- `javascript`: 15 files
- `markdown`: 8 files
- `json`: 2 files

**Total Size:** 2.34 MB
```

## 🎨 Alternative: Manual Tool Calls

You can also explicitly ask the AI to call the tools:

```
Call list_watched_folders()
```

or

```
Call get_folder_stats("/path/to/folder")
```

## ⚙️ Configuration

Default configuration (can be changed in Admin Panel → Tools → Mimir File Browser → Settings):

- **MCP_SERVER_URL**: `http://mcp-server:3000` (default)

## 🔧 How It Works

```
User asks about files
         ↓
Open WebUI recognizes intent
         ↓
Calls list_watched_folders() tool
         ↓
Tool calls Mimir MCP server HTTP endpoint
         ↓
MCP server queries Neo4j for watch configs
         ↓
Tool formats response as markdown
         ↓
Displayed in chat window
```

## 📊 Why Not in Sidebar?

Based on my research of Open WebUI documentation and GitHub:

1. **No Built-in API**: Open WebUI doesn't provide an API for tools/functions to add custom sidebar elements
2. **Workspace is Fixed**: The workspace sidebar is designed for built-in features (Models, Knowledge, Prompts)
3. **Tools Display in Chat**: Tools are designed to return content that displays in the chat window

## 🎯 Workaround Options

### Option 1: Chat-Based Display (Implemented)
✅ Upload `mimir_file_browser.py` as a Tool
✅ Ask "Show me watched folders"
✅ Get formatted list in chat

### Option 2: Knowledge Base Integration
- Add watched folders to Open WebUI's Knowledge base
- They'll appear in Workspace → Knowledge
- Requires manual sync

### Option 3: Custom Extension (Advanced)
- Fork Open WebUI
- Add custom sidebar component
- Requires React/Svelte development

## 🐛 Troubleshooting

**Action not showing up?**
- Check: Admin Panel → Functions (Actions are uploaded as Functions)
- Verify: Toggle is ON
- Try: Hard refresh (Cmd+Shift+R)
- Check: Browser console (F12) for errors

**Error connecting to MCP server?**
- Check: `docker ps` shows `mimir-mcp-server` running
- Check: MCP_SERVER_URL in tool settings
- Try: `curl http://localhost:3000/health`

**No folders listed?**
- You need to index folders first using the MCP tool
- Example: Use `index_folder` to start watching a directory

## ✅ Success Checklist

- [ ] Action uploaded to Open WebUI (Admin Panel → Functions)
- [ ] Action enabled (toggle ON)
- [ ] MCP server running (`docker ps` shows mimir-mcp-server)
- [ ] Test: Ask "Show me watched folders"
- [ ] See formatted list in chat

## 🔑 Key Points

1. **Class Name**: Must be `Action` (not `Tools` or `Function`)
2. **Upload Location**: Admin Panel → Functions (not Tools)
3. **Detection**: Open WebUI auto-detects it as an Action/Tool
4. **Usage**: AI can call these functions automatically when you ask about files

---

**Ready to use!** Upload `mimir_file_browser.py` and ask about your watched folders! 📂
