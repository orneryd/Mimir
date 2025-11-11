# Mimir Ollama Custom Image

This directory contains a custom Dockerfile that extends the official Ollama image with the embedding model pre-pulled.

## Purpose

The Mimir system uses vector embeddings for semantic search across all node types (todos, memories, files, concepts). By baking the embedding model into the image at build time, we avoid having to manually pull it after every container restart.

## Dockerfile

```dockerfile
FROM ollama/ollama:latest

# Set the embedding model to pull (can be overridden at build time)
ARG EMBEDDING_MODEL=nomic-embed-text

# Start Ollama server in the background and pull the model
RUN ollama serve & \
    sleep 5 && \
    ollama pull ${EMBEDDING_MODEL} && \
    pkill ollama
```

This Dockerfile:
1. Extends the official Ollama base image
2. Accepts a build argument for the embedding model name
3. Starts Ollama temporarily during build to pull the model
4. Stops Ollama after the model is downloaded

## Building

The image is automatically built via docker-compose with the embedding model specified in environment variables:

```bash
# Build just the ollama service
docker-compose build ollama

# Or use the npm script
npm run ollama:build
```

The image is tagged as:
- `mimir-ollama:1.0.0` (version from package.json)
- `mimir-ollama:latest`

## Configuration

The embedding model is specified in `docker-compose.yml` via the `MIMIR_EMBEDDINGS_MODEL` environment variable (default: `nomic-embed-text`). The build process uses this value to determine which model to pre-pull.

To use a different embedding model:

1. Set `MIMIR_EMBEDDINGS_MODEL` environment variable
2. Rebuild: `docker-compose build ollama`
3. Restart: `docker-compose up -d --no-deps ollama`

Example with different model:

```bash
MIMIR_EMBEDDINGS_MODEL=nomic-embed-text docker-compose build ollama
```

## Verification

After building and starting the container, verify the model is available:

```bash
docker exec -it ollama_server ollama list
```

You should see the embedding model listed (e.g., `nomic-embed-text:latest`).

Test the embedding endpoint:

```powershell
# PowerShell
Invoke-RestMethod -Uri http://localhost:11434/api/embeddings -Method Post -Body (@{model='nomic-embed-text';prompt='test'} | ConvertTo-Json) -ContentType 'application/json'
```

```bash
# Linux/Mac
curl http://localhost:11434/api/embeddings -d '{"model": "nomic-embed-text", "prompt": "test"}'
```

## Supported Models

Common embedding models that work with Ollama:
- `nomic-embed-text` (1024 dimensions) - Default, recommended
- `nomic-embed-text` (768 dimensions)
- `all-minilm` (384 dimensions) - Smaller, faster

## Notes

- The model is downloaded during the **build** process, not at runtime
- The model is stored in the `/root/.ollama` directory, which is persisted via the `ollama_models` volume
- Build time increases with model size (typically 30-60 seconds for embedding models)
- Once built, the model is immediately available when the container starts
