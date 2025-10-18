#!/bin/bash
# Remote setup script for Mimir
# Usage: curl -fsSL https://raw.githubusercontent.com/orneryd/GRAPH-RAG-TODO/main/install.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if git is available
if ! command -v git &> /dev/null; then
    log_error "Git is required but not installed."
    echo "Please install Git first:"
    echo "  macOS: brew install git"
    echo "  Ubuntu: sudo apt install git"
    echo "  Windows: Download from https://git-scm.com/"
    exit 1
fi

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Mimir Remote Installation                       ║"
echo "║          Graph-RAG TODO with Multi-Agent Orchestra          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get installation directory
INSTALL_DIR="${1:-mimir}"
if [ -d "$INSTALL_DIR" ]; then
    log_error "Directory '$INSTALL_DIR' already exists."
    echo "Choose a different directory or remove the existing one:"
    echo "  rm -rf $INSTALL_DIR"
    exit 1
fi

log_info "Cloning Mimir repository to '$INSTALL_DIR'..."
git clone https://github.com/orneryd/GRAPH-RAG-TODO.git "$INSTALL_DIR"

log_info "Changing to project directory..."
cd "$INSTALL_DIR"

log_info "Running setup script..."
chmod +x scripts/setup.sh
./scripts/setup.sh

echo
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║               Installation Complete! 🎉                      ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║ Mimir is now installed in: $(pwd)"
echo "║                                                              ║"
echo "║ Next steps:                                                  ║"
echo "║   cd $INSTALL_DIR"
echo "║   mimir --help                                               ║"
echo "║   open http://localhost:7474  # Neo4j browser               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"