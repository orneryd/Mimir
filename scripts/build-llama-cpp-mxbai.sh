#!/bin/bash
# Build and publish llama.cpp server for ARM64 with mxbai-embed-large (1024 dimensions)

set -e

# Configuration
IMAGE_NAME="timothyswt/llama-cpp-server-arm64-mxbai"
VERSION="${1:-latest}"
DOCKER_USERNAME="${DOCKER_USERNAME:-timothyswt}"

echo "🔨 Building llama.cpp server for ARM64 with mxbai-embed-large..."
echo "Image: $IMAGE_NAME:$VERSION"
echo "Dimensions: 1024"
echo ""

# Find and copy model from Ollama models directory
OLLAMA_MODELS="$HOME/.ollama/models"
MANIFEST_PATH="$OLLAMA_MODELS/manifests/registry.ollama.ai/library/mxbai-embed-large/latest"
TARGET_DIR="docker/llama-cpp/models"
TARGET_PATH="$TARGET_DIR/mxbai-embed-large.gguf"

echo "🔍 Looking for mxbai-embed-large in Ollama models..."

if [ ! -f "$MANIFEST_PATH" ]; then
    echo "❌ Model not found in Ollama"
    echo ""
    echo "Please pull the model first:"
    echo "  ollama pull mxbai-embed-large"
    echo ""
    exit 1
fi

echo "✅ Found Ollama manifest"

# Extract model blob digest
MODEL_DIGEST=$(jq -r '.layers[] | select(.mediaType == "application/vnd.ollama.image.model") | .digest' "$MANIFEST_PATH" | head -1)

if [ -z "$MODEL_DIGEST" ]; then
    echo "❌ Could not find model digest in manifest"
    exit 1
fi

echo "📦 Model digest: $MODEL_DIGEST"

# Copy model blob to target location (Ollama uses dash instead of colon)
BLOB_FILE=$(echo "$MODEL_DIGEST" | tr ':' '-')
BLOB_PATH="$OLLAMA_MODELS/blobs/$BLOB_FILE"

if [ ! -f "$BLOB_PATH" ]; then
    echo "❌ Model blob not found: $BLOB_PATH"
    exit 1
fi

echo "📋 Copying model to build context..."
mkdir -p "$TARGET_DIR"
cp "$BLOB_PATH" "$TARGET_PATH"

echo "✅ Model copied to: $TARGET_PATH"
MODEL_SIZE=$(du -h "$TARGET_PATH" | cut -f1)
echo "   Size: $MODEL_SIZE"
echo ""

# Build the image
docker build \
    --platform linux/arm64 \
    -t "$IMAGE_NAME:$VERSION" \
    -t "$IMAGE_NAME:latest" \
    -f docker/Dockerfile.mxbai \
    .

echo ""
echo "✅ Build complete!"
echo ""
echo "🔍 Image details:"
docker images | grep llama-cpp-server-arm64-mxbai | head -n 2

echo ""
echo "📦 Pushing to Docker Hub..."
echo "   (Make sure you're logged in: docker login)"
echo ""

# Ask for confirmation
read -p "Push to Docker Hub? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker push "$IMAGE_NAME:$VERSION"
    if [ "$VERSION" != "latest" ]; then
        docker push "$IMAGE_NAME:latest"
    fi
    echo "✅ Published to Docker Hub!"
else
    echo "⏭️  Skipped push. To push manually:"
    echo "   docker push $IMAGE_NAME:$VERSION"
    echo "   docker push $IMAGE_NAME:latest"
fi

# Clean up copied model
echo ""
echo "🧹 Cleaning up..."
rm -f "$TARGET_PATH"
echo "✅ Removed temporary model copy"

echo ""
echo "🎉 Done! To use this image in docker-compose.arm64.yml:"
echo "   llama-server:"
echo "     image: $IMAGE_NAME:$VERSION"
echo "     # ... rest of config ..."
echo ""
echo "   And update environment:"
echo "     - MIMIR_EMBEDDINGS_MODEL=mxbai-embed-large"
echo "     - MIMIR_EMBEDDINGS_DIMENSIONS=1024"
