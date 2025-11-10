# Mimir Open-WebUI Custom Image

This directory contains a custom Dockerfile that extends the official Open-WebUI image with the Neo4j Python driver pre-installed.

## Purpose

The Mimir orchestration pipeline requires the `neo4j` Python package to interact with the Neo4j graph database. By baking this dependency into the image at build time, we avoid having to manually install it after every container restart.

## Dockerfile

```dockerfile
FROM ghcr.io/open-webui/open-webui:main
USER root
RUN pip install --no-cache-dir neo4j
```

This simple Dockerfile:
1. Extends the official Open-WebUI base image
2. Switches to root user for package installation
3. Installs the neo4j driver with no cache to keep image size small

## Building

The image is automatically built via docker-compose:

```bash
# Build just the open-webui service
docker-compose build open-webui

# Or use the npm script
npm run webui:build
```

The image is tagged as:
- `mimir-open-webui:1.0.0` (version from package.json)
- `mimir-open-webui:latest`

## Updating Dependencies

To add more Python packages:

1. Edit the Dockerfile and add additional `pip install` commands
2. Rebuild: `docker-compose build open-webui`
3. Restart: `docker-compose up -d --no-deps open-webui`

Or create a `requirements.txt` file and install from it:

```dockerfile
FROM ghcr.io/open-webui/open-webui:main
USER root
COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt
```

## Verification

After building and starting the container, verify the package is installed:

```bash
docker exec -it mimir-open-webui pip show neo4j
```

You should see:
```
Name: neo4j
Version: 6.0.3
Summary: Neo4j Bolt driver for Python
```
