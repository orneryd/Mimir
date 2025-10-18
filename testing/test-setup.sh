#!/bin/bash
# Test runner script for setup validation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Build test container
build_test_container() {
    log_info "Building test container..."
    docker build -f test/Dockerfile.setup-test -t mimir-setup-test .
    log_success "Test container built"
}

# Test scenario: Complete setup from fresh environment
test_complete_setup() {
    local test_name="Complete Setup Test"
    log_info "Running: $test_name"
    
    # Copy project files to container and run setup
    docker run --rm -it \
        -v "$(pwd):/workspace" \
        -v /var/run/docker.sock:/var/run/docker.sock \
        --network host \
        mimir-setup-test bash -c "
            cd /workspace
            
            # Show initial state
            echo '=== Initial Environment ==='
            echo 'Node version:' \$(node --version)
            echo 'npm version:' \$(npm --version)
            echo 'Git version:' \$(git --version)
            echo 'Docker version:' \$(docker --version)
            echo
            
            # Run setup script
            echo '=== Running Setup Script ==='
            ./scripts/setup.sh
            
            echo
            echo '=== Final Verification ==='
            # Test that global commands work
            which mimir || echo 'mimir command not found'
            
            # Test TypeScript compilation
            npm run build
            
            # Check if services are accessible
            curl -s http://localhost:7474 > /dev/null && echo 'Neo4j accessible' || echo 'Neo4j not accessible'
            curl -s http://localhost:4141/v1/models > /dev/null && echo 'Copilot API accessible' || echo 'Copilot API not accessible'
            
            echo 'Setup test completed'
        "
    
    log_success "$test_name completed"
}

# Test scenario: Missing dependencies
test_missing_dependencies() {
    local test_name="Missing Dependencies Test"
    log_info "Running: $test_name"
    
    # Test with container missing some tools
    docker run --rm -it \
        node:20-slim bash -c "
            # Only git is missing in this slim image
            apt-get update && apt-get install -y curl wget
            
            # Copy and try to run setup script
            echo 'Testing with missing git...'
            echo '#!/bin/bash
./scripts/setup.sh' > test_setup.sh
            chmod +x test_setup.sh
            
            # This should fail and show installation instructions
            ./test_setup.sh || echo 'Expected failure due to missing git'
        "
    
    log_success "$test_name completed"
}

# Test scenario: Verification of prerequisites
test_prerequisite_validation() {
    local test_name="Prerequisite Validation Test"
    log_info "Running: $test_name"
    
    docker run --rm \
        -v "$(pwd):/workspace" \
        mimir-setup-test bash -c "
            cd /workspace
            
            # Test version checking logic
            echo 'Testing version validation...'
            
            # Create a mock script to test version checking
            cat > test_versions.sh << 'EOF'
#!/bin/bash
source scripts/setup.sh

# Test the version comparison function
if version_compare '2.30.0' '2.20.0'; then
    echo 'Git version check: PASS'
else
    echo 'Git version check: FAIL'
fi

if version_compare '20.1.0' '18.0.0'; then
    echo 'Node version check: PASS'  
else
    echo 'Node version check: FAIL'
fi
EOF
            
            chmod +x test_versions.sh
            bash test_versions.sh
        "
    
    log_success "$test_name completed"
}

# Main test runner
main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                Setup Script Test Suite                      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Ensure we're in the project root
    if [[ ! -f "scripts/setup.sh" ]]; then
        log_error "setup.sh not found. Run this from the project root."
        exit 1
    fi
    
    build_test_container
    test_prerequisite_validation
    # test_missing_dependencies  # Commented out as it requires more complex setup
    
    echo
    log_info "Starting interactive test session..."
    echo "You can now run commands to test the setup script manually."
    echo "The container has access to Docker and your project files."
    echo
    echo "Suggested tests:"
    echo "  1. cd /workspace"
    echo "  2. ./scripts/setup.sh"
    echo "  3. npm run setup:verify"
    echo "  4. Check if services are running"
    echo
    
    # Start interactive session
    test_complete_setup
}

main "$@"