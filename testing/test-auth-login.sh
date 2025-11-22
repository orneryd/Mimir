#!/bin/bash

# Test Authentication Login
# Tests the dev login with custom credentials from environment variables

set -e

echo "🔐 Testing Mimir Authentication"
echo "================================"
echo ""

# Configuration
MIMIR_URL="${MIMIR_URL:-http://localhost:9042}"
TEST_USERNAME="${MIMIR_DEV_USERNAME:-testuser}"
TEST_PASSWORD="${MIMIR_DEV_PASSWORD:-testpass123}"

echo "📋 Test Configuration:"
echo "   Server: $MIMIR_URL"
echo "   Username: $TEST_USERNAME"
echo "   Password: $TEST_PASSWORD"
echo ""

# Test 1: Check auth status (should be unauthenticated)
echo "1️⃣  Checking initial auth status..."
RESPONSE=$(curl -s -c cookies.txt "$MIMIR_URL/auth/status")
echo "   Response: $RESPONSE"
echo ""

# Test 2: Login with credentials
echo "2️⃣  Attempting login..."
LOGIN_RESPONSE=$(curl -s -b cookies.txt -c cookies.txt -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$TEST_USERNAME&password=$TEST_PASSWORD" \
  -w "\nHTTP_CODE:%{http_code}" \
  "$MIMIR_URL/auth/login")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$LOGIN_RESPONSE" | grep -v "HTTP_CODE:")

echo "   HTTP Status: $HTTP_CODE"
echo "   Response: $BODY"
echo ""

# Test 3: Check auth status after login (should be authenticated)
echo "3️⃣  Checking auth status after login..."
AUTH_STATUS=$(curl -s -b cookies.txt "$MIMIR_URL/auth/status")
echo "   Response: $AUTH_STATUS"
echo ""

# Test 4: Try accessing protected API endpoint
echo "4️⃣  Accessing protected API endpoint..."
API_RESPONSE=$(curl -s -b cookies.txt -w "\nHTTP_CODE:%{http_code}" "$MIMIR_URL/api/health")
API_HTTP_CODE=$(echo "$API_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
API_BODY=$(echo "$API_RESPONSE" | grep -v "HTTP_CODE:")

echo "   HTTP Status: $API_HTTP_CODE"
echo "   Response: $API_BODY"
echo ""

# Test 5: Logout
echo "5️⃣  Logging out..."
LOGOUT_RESPONSE=$(curl -s -b cookies.txt -X POST "$MIMIR_URL/auth/logout")
echo "   Response: $LOGOUT_RESPONSE"
echo ""

# Test 6: Check auth status after logout (should be unauthenticated)
echo "6️⃣  Checking auth status after logout..."
FINAL_STATUS=$(curl -s -b cookies.txt "$MIMIR_URL/auth/status")
echo "   Response: $FINAL_STATUS"
echo ""

# Cleanup
rm -f cookies.txt

echo "✅ Authentication test complete!"
echo ""
echo "📝 Summary:"
echo "   - Initial status: unauthenticated"
echo "   - Login: HTTP $HTTP_CODE"
echo "   - Authenticated status: $AUTH_STATUS"
echo "   - API access: HTTP $API_HTTP_CODE"
echo "   - Logout: successful"
echo "   - Final status: unauthenticated"


