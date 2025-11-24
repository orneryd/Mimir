#!/bin/bash
# Build and tag llama.cpp server for ARM64 with Qwen3-VL models

set -e

# Configuration
MODEL_SIZE="${1:-7b}"  # Default to 7b, can be 2b, 7b, or 72b
IMAGE_NAME="timothyswt/llama-cpp-server-arm64-qwen2.5-vl-${MODEL_SIZE}"
VERSION="${2:-latest}"
DOCKER_USERNAME="${DOCKER_USERNAME:-timothyswt}"

echo "🔨 Building llama.cpp server for ARM64 with Qwen2.5-VL-${MODEL_SIZE}..."
echo "Image: $IMAGE_NAME:${MODEL_SIZE}"
echo ""

# Target directory for model
TARGET_DIR="docker/llama-cpp/models"
TARGET_PATH="$TARGET_DIR/qwen2.5-vl-${MODEL_SIZE}.gguf"

# Create models directory if it doesn't exist
mkdir -p "$TARGET_DIR"

echo "📥 Checking for Qwen2.5-VL-${MODEL_SIZE} GGUF model..."
echo ""

# Check if model already exists
if [ -f "$TARGET_PATH" ]; then
    echo "✅ Model already exists: $TARGET_PATH"
    MODEL_SIZE_ACTUAL=$(du -h "$TARGET_PATH" | cut -f1)
    echo "   Size: $MODEL_SIZE_ACTUAL"
    DOWNLOAD_SUCCESS=true
else
    echo "Model not found, attempting download..."
    echo ""
    
    DOWNLOAD_SUCCESS=false
    
    # Try to download from HuggingFace
    echo "Attempting to download Qwen2.5-VL-${MODEL_SIZE} from HuggingFace..."
    
    case "$MODEL_SIZE" in
        2b)
            HUGGINGFACE_URL="https://huggingface.co/Qwen/Qwen2.5-VL-2B-Instruct-GGUF/resolve/main/qwen2.5-vl-2b-instruct-q4_k_m.gguf"
            ;;
        7b)
            HUGGINGFACE_URL="https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/qwen2.5-vl-7b-instruct-q4_k_m.gguf"
            ;;
        72b)
            HUGGINGFACE_URL="https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct-GGUF/resolve/main/qwen2.5-vl-72b-instruct-q4_k_m.gguf"
            ;;
        *)
            echo "❌ Invalid model size: $MODEL_SIZE"
            echo "   Valid options: 2b, 7b, 72b"
            exit 1
            ;;
    esac
    
    if curl -L -f -# -o "$TARGET_PATH" "$HUGGINGFACE_URL" 2>/dev/null; then
        DOWNLOAD_SUCCESS=true
        echo "✅ Downloaded from HuggingFace"
    else
        echo "⚠️  HuggingFace download failed"
    fi
    
    # If download failed, provide manual instructions
    if [ "$DOWNLOAD_SUCCESS" = false ]; then
        echo ""
        echo "❌ Automatic download failed. Manual download required."
        echo ""
        echo "📋 Please manually download the Qwen2.5-VL-${MODEL_SIZE} GGUF file:"
        echo ""
        echo "Option 1 - Download from HuggingFace:"
        case "$MODEL_SIZE" in
            2b)
                echo "  Visit: https://huggingface.co/Qwen/Qwen2.5-VL-2B-Instruct-GGUF"
                echo "  File: qwen2.5-vl-2b-instruct-q4_k_m.gguf (~1.5 GB)"
                ;;
            7b)
                echo "  Visit: https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct-GGUF"
                echo "  File: qwen2.5-vl-7b-instruct-q4_k_m.gguf (~4.5 GB)"
                ;;
            72b)
                echo "  Visit: https://huggingface.co/Qwen/Qwen2.5-VL-72B-Instruct-GGUF"
                echo "  File: qwen2.5-vl-72b-instruct-q4_k_m.gguf (~45 GB)"
                ;;
        esac
        echo "  Save to: $TARGET_PATH"
        echo ""
        echo "Option 2 - Use curl with direct link:"
        echo "  curl -L -o '$TARGET_PATH' '$HUGGINGFACE_URL'"
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
MODEL_SIZE_ACTUAL=$(du -h "$TARGET_PATH" | cut -f1)
echo "   Size: $MODEL_SIZE_ACTUAL"
echo ""

# Detect context size based on model
case "$MODEL_SIZE" in
    2b)
        CTX_SIZE="32768"  # 32K
        ;;
    7b|72b)
        CTX_SIZE="131072"  # 128K
        ;;
esac

echo "🔍 Model configuration:"
echo "   Model: Qwen2.5-VL-${MODEL_SIZE}"
echo "   Context: ${CTX_SIZE} tokens"
echo ""

# Build the Docker image
echo "🏗️  Building Docker image..."
echo ""

MODEL_FILE="qwen2.5-vl-${MODEL_SIZE}.gguf"
VISION_FILE="qwen2.5-vl-${MODEL_SIZE}-vision.gguf"

docker build \
    --platform linux/arm64 \
    --build-arg MODEL_FILE="$MODEL_FILE" \
    --build-arg VISION_FILE="$VISION_FILE" \
    -t "$IMAGE_NAME:latest" \
    -t "$IMAGE_NAME:$VERSION" \
    -f docker/Dockerfile.qwen-vl \
    .

echo ""
echo "✅ Build complete!"
echo ""
echo "🔍 Image details:"
docker images | grep "llama-cpp-server-arm64-qwen2.5-vl-${MODEL_SIZE}"

echo ""
echo "🧪 Testing the image locally..."
echo "   Starting container on port 8080..."

# Start container for testing
CONTAINER_ID=$(docker run -d -p 8080:8080 "$IMAGE_NAME:latest")

echo "   Container ID: $CONTAINER_ID"
echo "   Waiting for server to start..."

# Wait for health check
sleep 15

# Test health endpoint
if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    echo "   ✅ Health check passed"
    
    # Test chat endpoint with vision
    echo "   Testing vision capabilities..."
    TEST_RESULT=$(curl -s -X POST http://localhost:8080/v1/chat/completions \
        -H "Content-Type: application/json" \
        -d '{"model": "qwen3-vl", "messages": [{"role": "user", "content": "Hello"}]}' || echo "failed")
    
    if [ "$TEST_RESULT" != "failed" ] && [ -n "$TEST_RESULT" ]; then
        echo "   ✅ Chat test passed"
    else
        echo "   ⚠️  Chat test failed (this may be normal during startup)"
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
    docker push "$IMAGE_NAME:latest"
    docker push "$IMAGE_NAME:$VERSION"
    echo "✅ Published to Docker Hub!"
else
    echo "⏭️  Skipped push. To push manually:"
    echo "   docker push $IMAGE_NAME:latest"
    echo "   docker push $IMAGE_NAME:$VERSION"
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
echo "🎉 Done! To use this image in docker-compose.yml:"
echo "   llama-vl-server:"
echo "     image: $IMAGE_NAME:latest"
echo "     # ... rest of config ..."
echo ""
echo "   And update environment variables:"
echo "     - MIMIR_EMBEDDINGS_VL_MODEL=qwen2.5-vl"
echo ""
