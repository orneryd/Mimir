#!/bin/sh
# CUDA Fallback Wrapper
# Detects GPU availability and handles libcuda.so.1 missing gracefully

# Create a stub libcuda.so.1 if GPU is not available
if ! nvidia-smi >/dev/null 2>&1; then
    echo "⚠️  No GPU detected - creating CUDA stub library for graceful fallback"
    
    # Create minimal stub library directory
    mkdir -p /tmp/cuda-stub
    
    # Create a minimal stub that won't crash on dlopen
    cat > /tmp/cuda-stub/stub.c << 'EOF'
void cuInit() {}
void cuDeviceGetCount() {}
void cuDeviceGet() {}
void cuCtxCreate() {}
void cuMemAlloc() {}
void cuMemFree() {}
void cuLaunchKernel() {}
EOF
    
    gcc -shared -fPIC -o /tmp/cuda-stub/libcuda.so.1 /tmp/cuda-stub/stub.c 2>/dev/null || {
        echo "⚠️  Could not create CUDA stub - local embeddings will be disabled"
        export NORNICDB_EMBEDDING_PROVIDER=openai
    }
    
    # Add stub to library path
    export LD_LIBRARY_PATH="/tmp/cuda-stub:$LD_LIBRARY_PATH"
    
    # Disable GPU in environment
    export NORNICDB_EMBEDDING_GPU_LAYERS=0
    export NORNICDB_GPU_ENABLED=false
fi

# Execute the real entrypoint
exec /app/entrypoint-real.sh "$@"
