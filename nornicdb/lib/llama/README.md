# llama.cpp Static Libraries

This directory contains static libraries and headers for llama.cpp, used by NornicDB's local embedding provider.

## Directory Structure

```
lib/llama/
├── llama.h                      # Main llama.cpp header
├── ggml.h                       # GGML tensor library header
├── ggml-*.h                     # Additional GGML headers
├── libllama_darwin_arm64.a      # macOS Apple Silicon (with Metal)
├── libllama_darwin_amd64.a      # macOS Intel
├── libllama_linux_amd64.a       # Linux x86_64 (CPU only)
├── libllama_linux_amd64_cuda.a  # Linux x86_64 (with CUDA)
├── libllama_linux_arm64.a       # Linux ARM64
├── libllama_windows_amd64.a     # Windows x86_64 (with CUDA)
├── libllama_windows_amd64.lib   # Windows x86_64 (MSVC format)
├── VERSION                      # llama.cpp version used
└── README.md                    # This file
```

## Building from Source

### Linux/macOS

Run the build script from the nornicdb directory:

```bash
# Build for current platform
./scripts/build-llama.sh

# Build specific version
./scripts/build-llama.sh b4600
```

### Windows with CUDA

Run the PowerShell build script:

```powershell
# Build with CUDA support
.\scripts\build-llama-cuda.ps1

# Build specific version
.\scripts\build-llama-cuda.ps1 -Version b4600

# Clean build
.\scripts\build-llama-cuda.ps1 -Clean
```

### Requirements

**All platforms:**
- CMake 3.14+
- Git

**Linux/macOS:**
- C/C++ compiler (gcc, clang)

**Windows:**
- Visual Studio 2022 with C++ Desktop development
- CUDA Toolkit 12.x (for GPU acceleration)
- Ninja (optional, for faster builds)

### GPU Support

The script auto-detects GPU capabilities:

| Platform | GPU Backend | Detection |
|----------|-------------|-----------|
| macOS Apple Silicon | Metal | Automatic |
| Linux + NVIDIA | CUDA | Requires nvcc in PATH |
| Windows + NVIDIA | CUDA | Requires CUDA Toolkit |
| All platforms | CPU | Always available (AVX2/NEON) |

## Pre-built Libraries

For CI/CD, pre-built libraries can be downloaded from GitHub Releases or built via GitHub Actions.

### GitHub Actions Workflow

The workflow at `.github/workflows/build-llama.yml` builds libraries for all platforms:

```bash
# Trigger build manually
gh workflow run build-llama.yml
```

## Using with NornicDB

1. Place library files in this directory
2. Configure NornicDB:
   ```bash
   NORNICDB_EMBEDDING_PROVIDER=local
   NORNICDB_EMBEDDING_MODEL=bge-m3
   NORNICDB_MODELS_DIR=/data/models
   ```
3. Place your `.gguf` model in the models directory:
   ```bash
   cp bge-m3.Q4_K_M.gguf /data/models/bge-m3.gguf
   ```
4. Build with appropriate tags:
   ```bash
   # Linux/macOS
   go build -tags=localllm ./cmd/nornicdb
   
   # Windows with CUDA
   go build -tags="cuda localllm" ./cmd/nornicdb
   ```

## Placeholder Headers

The `llama.h` and `ggml.h` files in this directory are placeholders for development.
Running the build script will replace them with actual headers from llama.cpp.

## Version Compatibility

- llama.cpp version: See `VERSION` file after building
- Recommended: b4535 or later (for stable embedding API)

## License

- llama.cpp: MIT License
- GGML: MIT License
- This build configuration: MIT License

Model files (`.gguf`) are NOT included and have their own licenses.
Users are responsible for complying with model licenses.
