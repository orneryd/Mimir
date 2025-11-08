#!/bin/bash

# Test Copilot API Connection
echo "🔍 Testing Copilot API Server..."
echo ""

# Test 1: Health check
echo "1️⃣ Testing server availability..."
if curl -s http://localhost:4141/v1/models > /dev/null 2>&1; then
    echo "✅ Copilot API server is running on http://localhost:4141"
else
    echo "❌ Cannot connect to Copilot API server"
    echo "   Make sure copilot-api is running on port 4141"
    exit 1
fi

# Test 2: List models
echo ""
echo "2️⃣ Available models:"
curl -s http://localhost:4141/v1/models | jq -r '.data[] | "   - \(.id)"' 2>/dev/null || \
    curl -s http://localhost:4141/v1/models

# Test 3: Test completion (if models are available)
echo ""
echo "3️⃣ Testing completion endpoint..."
RESPONSE=$(curl -s -X POST http://localhost:4141/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
        "model": "gpt-4",
        "messages": [{"role": "user", "content": "Say hello"}],
        "max_tokens": 10
    }')

if echo "$RESPONSE" | grep -q "choices"; then
    echo "✅ Completion endpoint working"
    echo "   Response: $(echo $RESPONSE | jq -r '.choices[0].message.content' 2>/dev/null || echo $RESPONSE)"
else
    echo "⚠️  Completion endpoint returned unexpected response"
    echo "   Response: $RESPONSE"
fi

echo ""
echo "✅ Copilot API is ready for Open WebUI integration!"
echo ""
echo "Next steps:"
echo "  1. docker-compose up -d open-webui"
echo "  2. Open http://localhost:3000"
echo "  3. Create an account"
echo "  4. Start chatting with Copilot models!"
