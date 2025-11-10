#!/bin/bash
# Mimir Pipeline Auto-Enablement Script
# This script runs on Open-WebUI startup to ensure Mimir pipelines are enabled

set -e

echo "🔧 Mimir: Checking pipeline status..."

# Wait for Open-WebUI to be ready
sleep 5

# Check if pipelines are already registered
# Open-WebUI stores pipeline state in its database
# We'll use the API to check and enable pipelines

WEBUI_URL="${WEBUI_URL:-http://localhost:8080}"
API_KEY="${OPENWEBUI_API_KEY:-}"

# Function to check if pipeline exists
check_pipeline() {
    local pipeline_name=$1
    echo "  Checking: $pipeline_name"
    # This would use Open-WebUI's API once authenticated
    # For now, we just ensure files are in place
    if [ -f "/app/backend/data/pipelines/$pipeline_name" ]; then
        echo "    ✅ Found: $pipeline_name"
        return 0
    else
        echo "    ❌ Missing: $pipeline_name"
        return 1
    fi
}

# Check all Mimir pipelines
echo "📦 Mimir Pipelines:"
check_pipeline "mimir_orchestrator.py"
check_pipeline "mimir_rag_auto.py"
check_pipeline "mimir_file_browser.py"
check_pipeline "mimir_tools_wrapper.py"

echo "✅ Mimir: Pipeline files are in place"
echo "💡 Tip: Enable pipelines via Open-WebUI Admin Panel → Pipelines"
echo ""
echo "Available Mimir Pipelines:"
echo "  1. Mimir Multi-Agent Orchestrator (mimir_orchestrator.py)"
echo "  2. Mimir RAG Auto (mimir_rag_auto.py)"
echo "  3. Mimir File Browser (mimir_file_browser.py)"
echo "  4. Mimir Tools Wrapper (mimir_tools_wrapper.py)"
