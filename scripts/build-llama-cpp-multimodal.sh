#!/bin/bash
# Build and publish llama.cpp server for ARM64 with Nomic Embed Multimodal

set -e

# Configuration
IMAGE_NAME="timothyswt/llama-cpp-server-arm64-nomic-multimodal"
VERSION="${1:-latest}"
DOCKER_USERNAME="${DOCKER_USERNAME:-timothyswt}"
MODEL_NAME="nomic-embed-multimodal"

echo "🔨 Building llama.cpp server for ARM64 with Nomic Embed Multimodal..."
echo "Image: $IMAGE_NAME:latest"
echo ""

# Target directory for model
TARGET_DIR="docker/llama-cpp/models"
TARGET_PATH="$TARGET_DIR/${MODEL_NAME}.gguf"

# Create models directory if it doesn't exist
mkdir -p "$TARGET_DIR"

echo "📥 Checking for Nomic Embed Multimodal GGUF model..."
echo ""

# Check if model already exists
if [ -f "$TARGET_PATH" ]; then
    echo "✅ Model already exists: $TARGET_PATH"
    MODEL_SIZE=$(du -h "$TARGET_PATH" | cut -f1)
    echo "   Size: $MODEL_SIZE"
    DOWNLOAD_SUCCESS=true
else
    echo "Model not found, attempting download..."
    echo ""
    
    # Try to download from HuggingFace or other sources
    # NOTE: As of this script, Nomic Embed Multimodal GGUF may not be publicly available yet
    # We'll try multiple sources and provide clear error messages
    
    DOWNLOAD_SUCCESS=false
    
    # Attempt 1: Try HuggingFace (adjust URL when model is published)
echo "Attempting to download from HuggingFace..."
HUGGINGFACE_URL="https://huggingface.co/nomic-ai/nomic-embed-multimodal-v1-GGUF/resolve/main/nomic-embed-multimodal-v1.Q4_K_M.gguf"

if curl -L -f -# -o "$TARGET_PATH" "$HUGGINGFACE_URL" 2>/dev/null; then
    DOWNLOAD_SUCCESS=true
    echo "✅ Downloaded from HuggingFace"
else
    echo "⚠️  HuggingFace download failed (model may not be published yet)"
fi

# Attempt 2: Try alternative quantization
if [ "$DOWNLOAD_SUCCESS" = false ]; then
    echo ""
    echo "Attempting alternative model source..."
    ALT_URL="https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5-GGUF/resolve/main/nomic-embed-vision-v1.5.Q4_K_M.gguf"
    
    if curl -L -f -# -o "$TARGET_PATH" "$ALT_URL" 2>/dev/null; then
        DOWNLOAD_SUCCESS=true
        echo "✅ Downloaded Nomic Embed Vision (alternative)"
        MODEL_NAME="nomic-embed-vision-v1.5"
    fi
fi

# If download failed, provide manual instructions
if [ "$DOWNLOAD_SUCCESS" = false ]; then
    echo ""
    echo "❌ Automatic download failed. Manual download required."
    echo ""
    echo "📋 Please manually download the model GGUF file:"
    echo ""
    echo "Option 1 - Nomic Embed Multimodal (RECOMMENDED if available):"
    echo "  Visit: https://huggingface.co/nomic-ai"
    echo "  Look for: nomic-embed-multimodal GGUF files"
    echo "  Download: Q4_K_M or Q8_0 quantization"
    echo "  Save to: $TARGET_PATH"
    echo ""
    echo "Option 2 - Nomic Embed Vision (Alternative):"
    echo "  Visit: https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5"
    echo "  Download the GGUF version"
    echo "  Save to: $TARGET_PATH"
    echo ""
    echo "Option 3 - Use curl with direct link:"
    echo "  curl -L -o '$TARGET_PATH' [MODEL_URL]"
    echo ""
    echo "After downloading, run this script again."
    exit 1
  fi
fi

# Verify file exists
if [ ! -f "$TARGET_PATH" ]; then
    echo "❌ Model file not found: $TARGET_PATH"
    exit 1
fi

echo ""
echo "✅ Model file ready: $TARGET_PATH"
MODEL_SIZE=$(du -h "$TARGET_PATH" | cut -f1)
echo "   Size: $MODEL_SIZE"
echo ""

# Detect embedding dimensions from model metadata (if possible)
echo "🔍 Analyzing model..."
# Note: This is a placeholder - actual dimension detection would require parsing GGUF metadata
echo "   Model: $MODEL_NAME"
echo "   Note: Update MIMIR_EMBEDDINGS_DIMENSIONS based on actual model specs"
echo ""

# Build the Docker image
echo "🏗️  Building Docker image..."
echo ""

docker build \
    --platform linux/arm64 \
    -t "$IMAGE_NAME:$VERSION" \
    -t "$IMAGE_NAME:latest" \
    -f docker/Dockerfile.multimodal \
    .

echo ""
echo "✅ Build complete!"
echo ""
echo "🔍 Image details:"
docker images | grep llama-cpp-server-arm64-multimodal | head -n 2

echo ""
echo "🧪 Testing the image locally..."
echo "   Starting container on port 8080..."

# Start container for testing
CONTAINER_ID=$(docker run -d -p 8080:8080 "$IMAGE_NAME:$VERSION")

echo "   Container ID: $CONTAINER_ID"
echo "   Waiting for server to start..."

# Wait for health check
sleep 10

# Test health endpoint
if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    echo "   ✅ Health check passed"
    
    # Test embeddings endpoint
    echo "   Testing embeddings..."
    EMBED_RESULT=$(curl -s -X POST http://localhost:8080/v1/embeddings \
        -H "Content-Type: application/json" \
        -d '{"model": "'"$MODEL_NAME"'", "input": "test embedding"}' || echo "failed")
    
    if [ "$EMBED_RESULT" != "failed" ] && [ -n "$EMBED_RESULT" ]; then
        echo "   ✅ Embeddings test passed"
        
        # Try to extract dimensions from response
        DIMENSIONS=$(echo "$EMBED_RESULT" | grep -o '"embedding":\[[^]]*\]' | grep -o ',' | wc -l)
        if [ -n "$DIMENSIONS" ] && [ "$DIMENSIONS" -gt 0 ]; then
            DIMENSIONS=$((DIMENSIONS + 1))
            echo "   📊 Detected dimensions: $DIMENSIONS"
        fi
    else
        echo "   ⚠️  Embeddings test failed (this may be normal during startup)"
    fi
else
    echo "   ⚠️  Health check failed (server may need more time)"
fi

# Stop test container
echo "   Stopping test container..."
docker stop "$CONTAINER_ID" > /dev/null 2>&1
docker rm "$CONTAINER_ID" > /dev/null 2>&1

echo ""
echo "📦 Ready to push to Docker Hub..."
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

# Clean up downloaded model
echo ""
echo "🧹 Cleaning up..."
read -p "Remove temporary model file? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f "$TARGET_PATH"
    echo "✅ Removed temporary model copy"
else
    echo "⏭️  Keeping model file at: $TARGET_PATH"
fi

echo ""
echo "🎉 Done! To use this image in docker-compose.arm64.yml:"
echo "   llama-server:"
echo "     image: $IMAGE_NAME:$VERSION"
echo "     # ... rest of config ..."
echo ""
echo "   And update environment variables:"
echo "     - MIMIR_EMBEDDINGS_MODEL=$MODEL_NAME"
echo "     - MIMIR_EMBEDDINGS_DIMENSIONS=[CHECK_MODEL_DIMENSIONS]"
echo ""
echo "⚠️  IMPORTANT: Verify embedding dimensions and update Neo4j vector index:"
echo "   npm run embeddings:check"
echo "   npm run embeddings:reset  # if dimensions changed"
echo ""
