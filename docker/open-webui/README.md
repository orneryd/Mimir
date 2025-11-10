# Mimir Open-WebUI Custom Image

This directory contains a custom Dockerfile that extends the official Open-WebUI image with:
1. **Neo4j Python driver** pre-installed
2. **Mimir pipelines** pre-packaged and ready to enable
3. **Required dependencies** (aiohttp, pydantic) pre-installed

## Purpose

The Mimir orchestration pipeline requires the `neo4j` Python package to interact with the Neo4j graph database. By baking this dependency and the pipeline files into the image at build time, we provide a seamless out-of-the-box experience.

## Pre-Packaged Pipelines

The following Mimir pipelines are automatically copied into the container:

1. **mimir_orchestrator.py** - Multi-agent orchestration (Ecko → PM → Workers → QC)
2. **mimir_rag_auto.py** - RAG with semantic search context enrichment
3. **mimir_file_browser.py** - File browsing actions
4. **mimir_tools_wrapper.py** - Command shortcuts (`/list_folders`, `/search`, etc.)

**Location in container**: `/app/backend/data/pipelines/`

**Status**: Pre-installed but disabled by default. Must be manually enabled via Admin Panel.

## Dockerfile

```dockerfile
FROM ghcr.io/open-webui/open-webui:main

USER root

# Install Python dependencies for Mimir pipelines
RUN pip install --no-cache-dir \
    neo4j \
    aiohttp \
    pydantic

# Create pipelines directory
RUN mkdir -p /app/backend/data/pipelines

# Copy Mimir pipelines into the container
COPY pipelines/mimir_orchestrator.py /app/backend/data/pipelines/
COPY pipelines/mimir_rag_auto.py /app/backend/data/pipelines/
COPY pipelines/mimir_file_browser.py /app/backend/data/pipelines/
COPY pipelines/mimir_tools_wrapper.py /app/backend/data/pipelines/

# Copy init script to auto-enable pipelines
COPY docker/open-webui/init-pipelines.sh /app/init-pipelines.sh
RUN chmod +x /app/init-pipelines.sh

# Set ownership
RUN chown -R root:root /app/backend/data/pipelines

USER root
```

This Dockerfile:
1. Extends the official Open-WebUI base image
2. Switches to root user for package installation
3. Installs required Python packages with no cache to keep image size small
4. Creates the pipelines directory
5. Copies all 4 Mimir pipeline files into the container
6. Copies an init script for pipeline verification
7. Sets proper ownership

## Building

The image is automatically built via docker-compose:

```bash
# Build just the open-webui service
docker compose build open-webui

# Or use the npm script
npm run webui:build

# Or rebuild everything
npm run build:docker
```

The image is tagged as:
- `mimir-open-webui:1.0.0` (version from package.json)
- `mimir-open-webui:latest`

## Enabling Pipelines

After building and starting the container, pipelines must be manually enabled:

### Via Admin Panel (Recommended)

1. Access Open-WebUI at http://localhost:3000
2. Click your username (bottom-left) → **"Admin Panel"**
3. Navigate to **"Pipelines"** tab
4. Toggle each Mimir pipeline to enable it:
   - ✅ Mimir Multi-Agent Orchestrator
   - ✅ Mimir RAG Auto
   - ✅ Mimir File Browser
   - ✅ Mimir Tools Wrapper

**See**: [PIPELINE_CONFIGURATION.md](../../docs/guides/PIPELINE_CONFIGURATION.md) for detailed instructions.

## Verification

After building and starting the container, verify the pipelines are copied:

```bash
# List pipeline files
docker exec -it mimir-open-webui ls -la /app/backend/data/pipelines/

# Should show:
# mimir_orchestrator.py
# mimir_rag_auto.py
# mimir_file_browser.py
# mimir_tools_wrapper.py
```

Verify dependencies are installed:

```bash
# Check Neo4j driver
docker exec -it mimir-open-webui pip show neo4j

# Check all dependencies
docker exec -it mimir-open-webui pip list | grep -E "neo4j|aiohttp|pydantic"
```

You should see:
```
Name: neo4j
Version: 6.0.3
Summary: Neo4j Bolt driver for Python

Name: aiohttp
Version: 3.9.1
Summary: Async http client/server framework

Name: pydantic
Version: 2.5.0
Summary: Data validation using Python type hints
```

## Updating Pipelines

To update pipelines after making changes:

```bash
# 1. Edit pipeline files in pipelines/ directory
nano pipelines/mimir_orchestrator.py

# 2. Rebuild the image (no cache to ensure fresh copy)
docker compose build open-webui --no-cache

# 3. Restart the container
docker compose up -d --force-recreate open-webui
```

## Updating Dependencies

To add more Python packages:

1. Edit the Dockerfile and add additional `pip install` commands
2. Rebuild: `docker compose build open-webui`
3. Restart: `docker compose up -d --no-deps open-webui`

Or create a `requirements.txt` file and install from it:

```dockerfile
FROM ghcr.io/open-webui/open-webui:main
USER root
COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt
```

## Troubleshooting

### Pipelines Not Showing Up

```bash
# 1. Verify files are in container
docker exec -it mimir-open-webui ls -la /app/backend/data/pipelines/

# 2. Check Open-WebUI logs
docker compose logs open-webui | grep -i pipeline

# 3. Rebuild with no cache
docker compose build open-webui --no-cache
docker compose up -d --force-recreate open-webui
```

### Pipeline Fails to Enable

```bash
# 1. Check for Python syntax errors
docker exec -it mimir-open-webui python3 -m py_compile \
  /app/backend/data/pipelines/mimir_orchestrator.py

# 2. Check dependencies
docker exec -it mimir-open-webui pip list | grep -E "neo4j|aiohttp|pydantic"

# 3. Check logs for errors
docker compose logs open-webui | tail -50
```

## Related Documentation

- **[PIPELINE_CONFIGURATION.md](../../docs/guides/PIPELINE_CONFIGURATION.md)** - Complete pipeline setup guide
- **[LLM_PROVIDER_GUIDE.md](../../docs/guides/LLM_PROVIDER_GUIDE.md)** - Switching LLM providers
- **[QUICKSTART.md](../../QUICKSTART.md)** - Initial setup
