#!/bin/sh
# NornicDB Docker Entrypoint

set -e

# Check for GPU availability
if [ -f "/usr/bin/nvidia-smi" ] || [ -f "/usr/local/cuda/bin/nvidia-smi" ]; then
    if nvidia-smi >/dev/null 2>&1; then
        echo "✓ CUDA GPU detected"
        export LD_PRELOAD=""
    else
        echo "⚠️  CUDA libraries found but no GPU detected - disabling CUDA"
        # Prevent CUDA library loading by unsetting CUDA variables
        unset CUDA_VISIBLE_DEVICES
        unset NVIDIA_VISIBLE_DEVICES
        # Set flag to disable local embeddings if built with CUDA
        export NORNICDB_EMBEDDING_PROVIDER="${NORNICDB_EMBEDDING_PROVIDER:-openai}"
    fi
else
    echo "ℹ️  No CUDA libraries detected - running in CPU mode"
fi

# Build command line args from environment
ARGS="serve"
ARGS="$ARGS --data-dir=${NORNICDB_DATA_DIR:-/data}"
ARGS="$ARGS --http-port=${NORNICDB_HTTP_PORT:-7474}"
ARGS="$ARGS --bolt-port=${NORNICDB_BOLT_PORT:-7687}"

# IMPORTANT: In Docker, we must bind to 0.0.0.0 to accept external connections
# The default changed to 127.0.0.1 for security (localhost-only outside containers)
ARGS="$ARGS --address=${NORNICDB_ADDRESS:-0.0.0.0}"

[ "${NORNICDB_NO_AUTH:-false}" = "true" ] && ARGS="$ARGS --no-auth"

# Embedding config
[ -n "$NORNICDB_EMBEDDING_URL" ] && ARGS="$ARGS --embedding-url=$NORNICDB_EMBEDDING_URL"
[ -n "$NORNICDB_EMBEDDING_MODEL" ] && ARGS="$ARGS --embedding-model=$NORNICDB_EMBEDDING_MODEL"
[ -n "$NORNICDB_EMBEDDING_DIM" ] && ARGS="$ARGS --embedding-dim=$NORNICDB_EMBEDDING_DIM"

exec /app/nornicdb $ARGS "$@"
