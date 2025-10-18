#!/bin/bash
# Mimir Developer Setup Script
# Automatically sets up development environment with tool detection and validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MIN_NODE_VERSION="18"
MIN_DOCKER_VERSION="20"
MIN_GIT_VERSION="2.20"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Version comparison function
version_compare() {
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

# Platform detection
detect_platform() {
    case "$OSTYPE" in
        darwin*)  PLATFORM="macos" ;;
        linux*)   PLATFORM="linux" ;;
        msys*|mingw*|cygwin*) PLATFORM="windows" ;;
        *)        PLATFORM="unknown" ;;
    esac
    log_info "Detected platform: $PLATFORM"
}

# Check prerequisite tools
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check Git
    if ! command -v git &> /dev/null; then
        missing_tools+=("git")
    else
        local git_version=$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        if ! version_compare "$git_version" "$MIN_GIT_VERSION"; then
            log_warning "Git version $git_version is older than recommended $MIN_GIT_VERSION"
        else
            log_success "Git $git_version detected"
        fi
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing_tools+=("node")
    else
        local node_version=$(node --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        local node_major=$(echo "$node_version" | cut -d. -f1)
        if [[ $node_major -lt $MIN_NODE_VERSION ]]; then
            log_error "Node.js version $node_version is too old. Minimum required: $MIN_NODE_VERSION"
            missing_tools+=("node")
        else
            log_success "Node.js $node_version detected"
        fi
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    else
        log_success "npm $(npm --version) detected"
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    else
        local docker_version=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        local docker_major=$(echo "$docker_version" | cut -d. -f1)
        if [[ $docker_major -lt $MIN_DOCKER_VERSION ]]; then
            log_error "Docker version $docker_version is too old. Minimum required: $MIN_DOCKER_VERSION"
            missing_tools+=("docker")
        else
            log_success "Docker $docker_version detected"
        fi
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        missing_tools+=("docker-compose")
    else
        log_success "Docker Compose detected"
    fi
    
    # Report missing tools with installation instructions
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        echo
        provide_installation_instructions "${missing_tools[@]}"
        exit 1
    fi
    
    log_success "All prerequisites satisfied"
}

# Provide installation instructions for missing tools
provide_installation_instructions() {
    local tools=("$@")
    
    log_info "Installation instructions for your platform ($PLATFORM):"
    echo
    
    for tool in "${tools[@]}"; do
        case "$tool" in
            git)
                echo -e "${YELLOW}Git installation:${NC}"
                case "$PLATFORM" in
                    macos)
                        echo "  brew install git"
                        echo "  OR download from: https://git-scm.com/download/mac"
                        ;;
                    linux)
                        echo "  # Ubuntu/Debian:"
                        echo "  sudo apt update && sudo apt install git"
                        echo "  # CentOS/RHEL:"
                        echo "  sudo yum install git"
                        echo "  # Fedora:"
                        echo "  sudo dnf install git"
                        ;;
                    windows)
                        echo "  Download from: https://git-scm.com/download/win"
                        ;;
                esac
                echo
                ;;
            node|npm)
                echo -e "${YELLOW}Node.js (includes npm) installation:${NC}"
                case "$PLATFORM" in
                    macos)
                        echo "  brew install node@20"
                        echo "  OR download from: https://nodejs.org/en/download/"
                        ;;
                    linux)
                        echo "  # Using NodeSource repository:"
                        echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
                        echo "  sudo apt-get install -y nodejs"
                        echo "  # OR download from: https://nodejs.org/en/download/"
                        ;;
                    windows)
                        echo "  Download from: https://nodejs.org/en/download/"
                        echo "  OR use chocolatey: choco install nodejs"
                        ;;
                esac
                echo
                ;;
            docker)
                echo -e "${YELLOW}Docker installation:${NC}"
                case "$PLATFORM" in
                    macos)
                        echo "  Download Docker Desktop: https://www.docker.com/products/docker-desktop/"
                        echo "  OR brew install --cask docker"
                        ;;
                    linux)
                        echo "  # Ubuntu/Debian:"
                        echo "  curl -fsSL https://get.docker.com | sh"
                        echo "  sudo usermod -aG docker \$USER"
                        echo "  # Then log out and back in"
                        ;;
                    windows)
                        echo "  Download Docker Desktop: https://www.docker.com/products/docker-desktop/"
                        ;;
                esac
                echo
                ;;
            docker-compose)
                echo -e "${YELLOW}Docker Compose installation:${NC}"
                echo "  Docker Compose is included with Docker Desktop"
                echo "  For Linux without Docker Desktop:"
                echo "  sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose"
                echo "  sudo chmod +x /usr/local/bin/docker-compose"
                echo
                ;;
        esac
    done
    
    echo -e "${BLUE}After installing missing tools, run this script again.${NC}"
}

# Install project dependencies
install_dependencies() {
    log_info "Installing project dependencies..."
    
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. Are you in the Mimir project directory?"
        exit 1
    fi
    
    npm install --include=dev
    log_success "Project dependencies installed"
    
    # Install global TypeScript tools if not present
    if ! command -v tsc &> /dev/null; then
        log_info "Installing global TypeScript tools..."
        npm install -g typescript ts-node
        log_success "Global TypeScript tools installed"
    else
        log_success "TypeScript tools already available"
    fi
}

# Build the project
build_project() {
    log_info "Building project..."
    npm run build
    log_success "Project built successfully"
}

# Setup GitHub CLI and authentication
setup_github_auth() {
    log_info "Setting up GitHub CLI and authentication..."
    
    # Check if GitHub CLI is installed
    if ! command -v gh &> /dev/null; then
        log_info "Installing GitHub CLI..."
        case "$PLATFORM" in
            macos)
                if command -v brew &> /dev/null; then
                    brew install gh
                else
                    log_error "Homebrew not found. Please install GitHub CLI manually:"
                    echo "https://cli.github.com/manual/installation"
                    return 1
                fi
                ;;
            linux)
                curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
                echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
                sudo apt update
                sudo apt install gh
                ;;
            *)
                log_error "Please install GitHub CLI manually for your platform:"
                echo "https://cli.github.com/manual/installation"
                return 1
                ;;
        esac
        log_success "GitHub CLI installed"
    else
        log_success "GitHub CLI already installed"
    fi
    
    # Check authentication status
    if ! gh auth status &> /dev/null; then
        log_info "GitHub CLI not authenticated. Starting authentication process..."
        gh auth login
        log_success "GitHub authentication completed"
    else
        log_success "GitHub CLI already authenticated"
    fi
}

# Setup Copilot API proxy
setup_copilot_api() {
    log_info "Setting up Copilot API proxy..."
    
    # Install copilot-api globally if not present
    if ! npm list -g copilot-api &> /dev/null; then
        log_info "Installing copilot-api..."
        npm install -g copilot-api
        log_success "copilot-api installed"
    else
        log_success "copilot-api already installed"
    fi
    
    # Check if copilot-api is running
    if ! pgrep -f "copilot-api" > /dev/null; then
        log_info "Starting copilot-api server..."
        nohup copilot-api start > /dev/null 2>&1 &
        sleep 3  # Give it time to start
        
        # Verify it's running
        if curl -s http://localhost:4141/v1/models > /dev/null; then
            log_success "Copilot API proxy started and responding"
        else
            log_warning "Copilot API proxy may not be responding. You can start it manually with: copilot-api start"
        fi
    else
        log_success "Copilot API proxy already running"
    fi
}

# Test LLM connection
test_llm_connection() {
    log_info "Testing LLM connection..."
    
    # Test with a simple Node.js command
    if node -e "
        const {ChatOpenAI} = require('@langchain/openai');
        const llm = new ChatOpenAI({
            openAIApiKey: 'dummy-key-not-used',
            configuration: {baseURL: 'http://localhost:4141/v1'}
        });
        llm.invoke('Hello!').then(r => {
            console.log('✅ Copilot Response:', r.content);
            process.exit(0);
        }).catch(e => {
            console.error('❌ Connection failed:', e.message);
            process.exit(1);
        });
    " 2>/dev/null; then
        log_success "LLM connection test passed"
    else
        log_warning "LLM connection test failed. Copilot API may need manual authentication."
        echo "Run 'copilot-api start' manually and follow authentication prompts."
    fi
}

# Start Docker services
start_docker_services() {
    log_info "Starting Docker services..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker daemon is not running. Please start Docker and try again."
        return 1
    fi
    
    # Remove any existing containers to avoid conflicts
    if docker-compose ps -q 2>/dev/null | grep -q .; then
        log_info "Stopping existing containers..."
        docker-compose down 2>/dev/null || true
    fi
    
    # Start services
    docker-compose up -d
    
    # Wait for Neo4j to be ready
    log_info "Waiting for Neo4j to be ready..."
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -s http://localhost:7474 > /dev/null; then
            log_success "Neo4j is ready"
            break
        fi
        ((attempt++))
        sleep 2
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        log_warning "Neo4j may not be ready yet. Check with: curl http://localhost:7474"
    fi
    
    log_success "Docker services started"
}

# Setup global commands
setup_global_commands() {
    log_info "Setting up global commands..."
    
    if npm link; then
        log_success "Global commands (mimir, mimir-chain, mimir-execute) are now available"
    else
        log_warning "Failed to setup global commands. You may need to run 'sudo npm link' or check permissions."
    fi
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    local issues=()
    
    # Check if build artifacts exist
    if [[ ! -d "build" ]]; then
        issues+=("Build directory not found")
    fi
    
    # Check if global commands work
    if ! command -v mimir &> /dev/null; then
        issues+=("Global 'mimir' command not available")
    fi
    
    # Check if Docker services are running
    if ! curl -s http://localhost:7474 > /dev/null; then
        issues+=("Neo4j not responding on port 7474")
    fi
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        log_warning "Some issues detected:"
        for issue in "${issues[@]}"; do
            echo "  - $issue"
        done
        echo
        log_info "You may need to run some setup steps manually."
    else
        log_success "All verification checks passed!"
    fi
}

# Main setup function
main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                   Mimir Developer Setup                     ║"
    echo "║            Graph-RAG TODO with Multi-Agent Orchestra        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo
    
    detect_platform
    check_prerequisites
    
    echo
    log_info "Starting setup process..."
    
    # Setup steps
    install_dependencies
    build_project
    setup_github_auth
    setup_copilot_api
    test_llm_connection
    start_docker_services
    setup_global_commands
    verify_installation
    
    echo
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    Setup Complete! 🎉                       ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║ Next steps:                                                  ║"
    echo "║ 1. Try: mimir --help                                        ║"
    echo "║ 2. Open Neo4j browser: http://localhost:7474                ║"
    echo "║ 3. Check the README for usage examples                      ║"
    echo "║                                                              ║"
    echo "║ Troubleshooting:                                             ║"
    echo "║ - Run 'npm run setup:verify' to check installation          ║"
    echo "║ - Check 'docker-compose logs' for service issues            ║"
    echo "║ - Visit https://github.com/orneryd/GRAPH-RAG-TODO/docs      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Handle interruption gracefully
trap 'echo -e "\n${YELLOW}Setup interrupted. You can run this script again to continue.${NC}"; exit 130' INT

# Run main function
main "$@"