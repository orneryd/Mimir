# File Indexing CLI Scripts

Quick npm scripts for managing file indexing in Mimir.

## Available Commands

### List All Watched Folders

```bash
npm run index:list
```

Shows:
- All folders currently being watched
- Number of files indexed in each folder
- Embedding statistics (total embeddings and breakdown by type)

### Add Folder to Indexing

```bash
npm run index:add -- C:\path\to\folder
```

Adds a folder to the watch list and starts indexing. Files will be automatically indexed and the folder will be monitored for changes.

**With Embeddings:**
```bash
npm run index:add -- C:\path\to\folder --embeddings
```

Enables vector embeddings for semantic search across the folder's contents.

**Examples:**
```bash
# Windows paths
npm run index:add -- C:\Users\timot\Documents\GitHub\MyProject

# Linux/Mac paths  
npm run index:add -- /home/user/projects/my-app

# With embeddings enabled
npm run index:add -- C:\code\important-project --embeddings
```

### Remove Folder from Indexing

```bash
npm run index:remove -- C:\path\to\folder --remove
```

Stops watching the folder and removes all indexed files and embeddings from the database.

**Example:**
```bash
npm run index:remove -- C:\Users\timot\Documents\GitHub\MyProject --remove
```

## How It Works

These scripts use the `test-folder-indexing.js` script which communicates with the Mimir MCP HTTP server (running on `localhost:9042` by default).

The script:
1. Initializes an MCP session
2. Calls the appropriate MCP tool (`index_folder`, `remove_folder`, or `list_folders`)
3. Returns results in a formatted output

## Configuration

The MCP server must be running for these commands to work:

```bash
# Start all services
docker-compose up -d

# Check MCP server is running
docker-compose ps mcp-server
```

Default connection settings:
- Host: `localhost`
- Port: `9042`

Override with environment variables:
```bash
MCP_HOST=192.168.1.100 MCP_PORT=9042 npm run index:list
```

## Path Translation

The system automatically translates host paths to container paths:

- **Host**: `C:\Users\timot\Documents\GitHub\Mimir`
- **Container**: `/workspace/Mimir`

The translation happens automatically based on the `HOST_WORKSPACE_ROOT` environment variable in `docker-compose.yml`.

## Features

### Automatic File Watching

Once a folder is added, Mimir automatically:
- Indexes all files in the folder
- Respects `.gitignore` patterns
- Watches for file changes (add, modify, delete)
- Updates the Neo4j database in real-time

### Vector Embeddings (Optional)

When `--embeddings` is enabled:
- Files are chunked into manageable pieces
- Each chunk gets a vector embedding (1024 dimensions)
- Enables semantic search across all indexed content
- Uses the `nomic-embed-text` model from Ollama

### Statistics

The `index:list` command shows:
- Total folders being watched
- Files indexed per folder
- Total embeddings generated
- Breakdown by node type (file_chunk, preamble, memory, etc.)

## Troubleshooting

**"Cannot connect to MCP server"**
```bash
# Check if server is running
docker-compose ps

# Check logs
docker-compose logs mcp-server

# Restart services
docker-compose restart mcp-server
```

**"Path not found"**
- Ensure the path exists on your system
- Use absolute paths (not relative)
- Windows: Use backslashes `C:\path\to\folder` or forward slashes `C:/path/to/folder`
- Linux/Mac: Use forward slashes `/path/to/folder`

**Embeddings not generating**
```bash
# Check Ollama is running
docker-compose ps ollama

# Verify model is available
docker exec -it ollama_server ollama list

# Should see: nomic-embed-text:latest
```

## Advanced Usage

### Direct Script Usage

You can also call the script directly with more options:

```bash
# Add folder with custom debounce
node scripts/test-folder-indexing.js C:\path\to\folder --debounce-ms 1000

# Add folder with file patterns
node scripts/test-folder-indexing.js C:\path\to\folder --file-patterns "*.ts,*.js"

# Add folder with ignore patterns  
node scripts/test-folder-indexing.js C:\path\to\folder --ignore-patterns "node_modules,dist"
```

See the script source (`scripts/test-folder-indexing.js`) for all available options.
