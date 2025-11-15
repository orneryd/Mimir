#!/bin/bash
# Build and publish llama.cpp server for ARM64

set -e

# Configuration
IMAGE_NAME="timothyswt/llama-cpp-server-arm64"
VERSION="${1:-latest}"
DOCKER_USERNAME="${DOCKER_USERNAME:-timothyswt}"

echo "🔨 Building llama.cpp server for ARM64..."
echo "Image: $IMAGE_NAME:$VERSION"
echo ""

# Build the image
docker build \
    --platform linux/arm64 \
    -t "$IMAGE_NAME:$VERSION" \
    -t "$IMAGE_NAME:latest" \
    -f docker/llama-cpp/Dockerfile \
    .

echo ""
echo "✅ Build complete!"
echo ""
echo "🔍 Image details:"
docker images | grep llama-cpp-server-arm64 | head -n 2

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

echo ""
echo "🎉 Done! To use this image:"
echo "   docker run -p 11434:8080 -v ./models:/models $IMAGE_NAME:$VERSION"
