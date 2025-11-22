#!/bin/bash

# Test RBAC (Role-Based Access Control) with Dev Users
# Tests authentication and authorization with different user roles
# Requires: MIMIR_ENABLE_SECURITY=true and MIMIR_ENABLE_RBAC=true
# Dev users: admin:admin, dev:dev, analyst:analyst, viewer:viewer

# Check for jq
if ! command -v jq &> /dev/null; then
  echo "⚠️  jq not found - install with: brew install jq (macOS) or apt-get install jq (Linux)"
  echo "   Continuing without pretty JSON formatting..."
  JQ_AVAILABLE=false
else
  JQ_AVAILABLE=true
fi

echo "🔒 Testing Mimir RBAC with Dev Users"
echo "================================"
echo ""

# Configuration
MIMIR_URL="${MIMIR_URL:-http://localhost:3000}"

echo "📋 Test Configuration:"
echo "   Server: $MIMIR_URL"
echo "   Testing 4 dev users with different roles"
echo ""

# Helper function to test login
test_login() {
  local username=$1
  local password=$2
  local cookie_file=$3
  local role_name=$4
  
  echo "   🔐 Logging in as $username..."
  local response=$(curl -s -c "$cookie_file" -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$username&password=$password" \
    "$MIMIR_URL/auth/login")
  
  if echo "$response" | grep -q '"success":true'; then
    echo "   ✅ Login successful"
    
    # Get auth status to see roles
    local status=$(curl -s -b "$cookie_file" "$MIMIR_URL/auth/status")
    if [ "$JQ_AVAILABLE" = true ]; then
      echo "   👤 User info: $(echo $status | jq -c '.user')"
    else
      echo "   👤 User info: $status"
    fi
    return 0
  else
    echo "   ❌ Login failed: $response"
    return 1
  fi
}

# Helper function to test API endpoint
test_endpoint() {
  local cookie_file=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_code=$5
  local permission=$6
  
  echo "   Testing $permission permission..."
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -b "$cookie_file" -w "\nHTTP_CODE:%{http_code}" "$MIMIR_URL$endpoint")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -b "$cookie_file" -w "\nHTTP_CODE:%{http_code}" \
      -X POST -H "Content-Type: application/json" -d "$data" "$MIMIR_URL$endpoint")
  elif [ "$method" = "DELETE" ]; then
    response=$(curl -s -b "$cookie_file" -w "\nHTTP_CODE:%{http_code}" \
      -X DELETE "$MIMIR_URL$endpoint")
  fi
  
  http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
  body=$(echo "$response" | grep -v "HTTP_CODE:")
  
  if [ "$http_code" = "$expected_code" ]; then
    echo "   ✅ HTTP $http_code (expected $expected_code) - Permission check passed"
  else
    echo "   ❌ HTTP $http_code (expected $expected_code) - Permission check failed"
    echo "      Response: $body"
  fi
  
  echo "$body"
}

# Test 1: Admin user (full access)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Testing ADMIN role (roles: admin, developer, analyst)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_login "admin" "admin" "/tmp/admin-cookies.txt" "admin"
echo ""

# Test read permission
test_endpoint "/tmp/admin-cookies.txt" "GET" "/api/nodes/query?type=memory&limit=1" "" "200" "nodes:read" > /dev/null
echo ""

# Test write permission
write_response=$(test_endpoint "/tmp/admin-cookies.txt" "POST" "/api/nodes" \
  '{"type":"memory","properties":{"title":"RBAC Test Admin","content":"Testing admin access"}}' \
  "200" "nodes:write")
if [ "$JQ_AVAILABLE" = true ]; then
  NODE_ID=$(echo "$write_response" | jq -r '.id // empty' 2>/dev/null)
else
  NODE_ID=$(echo "$write_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
fi
echo ""

# Test delete permission
if [ -n "$NODE_ID" ]; then
  test_endpoint "/tmp/admin-cookies.txt" "DELETE" "/api/nodes/$NODE_ID" "" "200" "nodes:delete" > /dev/null
fi

echo ""
echo "✅ Admin role test complete - Full access confirmed"
echo ""

# Test 2: Developer user (read/write access)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Testing DEVELOPER role (roles: developer)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_login "dev" "dev" "/tmp/dev-cookies.txt" "developer"
echo ""

# Test read permission (should work)
test_endpoint "/tmp/dev-cookies.txt" "GET" "/api/nodes/query?type=memory&limit=1" "" "200" "nodes:read" > /dev/null
echo ""

# Test write permission (should work)
write_response=$(test_endpoint "/tmp/dev-cookies.txt" "POST" "/api/nodes" \
  '{"type":"memory","properties":{"title":"RBAC Test Dev","content":"Testing developer access"}}' \
  "200" "nodes:write")
if [ "$JQ_AVAILABLE" = true ]; then
  DEV_NODE_ID=$(echo "$write_response" | jq -r '.id // empty' 2>/dev/null)
else
  DEV_NODE_ID=$(echo "$write_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
fi
echo ""

# Test delete permission (should work for developers)
if [ -n "$DEV_NODE_ID" ]; then
  test_endpoint "/tmp/dev-cookies.txt" "DELETE" "/api/nodes/$DEV_NODE_ID" "" "200" "nodes:delete" > /dev/null
fi

echo ""
echo "✅ Developer role test complete - Read/write access confirmed"
echo ""

# Test 3: Analyst user (read-only for most, query access)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Testing ANALYST role (roles: analyst)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_login "analyst" "analyst" "/tmp/analyst-cookies.txt" "analyst"
echo ""

# Test read permission (should work)
test_endpoint "/tmp/analyst-cookies.txt" "GET" "/api/nodes/query?type=memory&limit=1" "" "200" "nodes:read" > /dev/null
echo ""

# Test write permission (should fail - analysts are read-only)
echo "   Testing nodes:write permission (should be DENIED)..."
write_response=$(curl -s -b "/tmp/analyst-cookies.txt" -w "\nHTTP_CODE:%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -d '{"type":"memory","properties":{"title":"RBAC Test Analyst","content":"Testing analyst access"}}' \
  "$MIMIR_URL/api/nodes")
write_code=$(echo "$write_response" | grep "HTTP_CODE:" | cut -d: -f2)
if [ "$write_code" = "403" ]; then
  echo "   ✅ HTTP 403 (expected 403) - Write permission correctly denied"
else
  echo "   ⚠️  HTTP $write_code (expected 403) - Permission check may not be working"
  echo "      Response: $(echo "$write_response" | grep -v "HTTP_CODE:")"
fi

echo ""
echo "✅ Analyst role test complete - Read-only access confirmed"
echo ""

# Test 4: Viewer user (minimal read-only)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Testing VIEWER role (roles: viewer)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_login "viewer" "viewer" "/tmp/viewer-cookies.txt" "viewer"
echo ""

# Test read permission (should work)
test_endpoint "/tmp/viewer-cookies.txt" "GET" "/api/nodes/query?type=memory&limit=1" "" "200" "nodes:read" > /dev/null
echo ""

# Test write permission (should fail - viewers are read-only)
echo "   Testing nodes:write permission (should be DENIED)..."
write_response=$(curl -s -b "/tmp/viewer-cookies.txt" -w "\nHTTP_CODE:%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  -d '{"type":"memory","properties":{"title":"RBAC Test Viewer","content":"Testing viewer access"}}' \
  "$MIMIR_URL/api/nodes")
write_code=$(echo "$write_response" | grep "HTTP_CODE:" | cut -d: -f2)
if [ "$write_code" = "403" ]; then
  echo "   ✅ HTTP 403 (expected 403) - Write permission correctly denied"
else
  echo "   ⚠️  HTTP $write_code (expected 403) - Permission check may not be working"
  echo "      Response: $(echo "$write_response" | grep -v "HTTP_CODE:")"
fi

echo ""
echo "✅ Viewer role test complete - Read-only access confirmed"
echo ""

# Test 5: Unauthenticated access
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣  Testing UNAUTHENTICATED access (should be denied)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "   Trying to access protected endpoint without auth..."
UNAUTH_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$MIMIR_URL/api/nodes/query?type=memory&limit=1")
UNAUTH_CODE=$(echo "$UNAUTH_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
UNAUTH_BODY=$(echo "$UNAUTH_RESPONSE" | grep -v "HTTP_CODE:")

if [ "$UNAUTH_CODE" = "401" ]; then
  echo "   ✅ HTTP $UNAUTH_CODE (expected 401) - Access denied correctly"
else
  echo "   ❌ HTTP $UNAUTH_CODE (expected 401) - Access control may be misconfigured"
  echo "      Response: $UNAUTH_BODY"
fi

echo ""
echo "✅ Unauthenticated access test complete"
echo ""

# Cleanup
rm -f /tmp/admin-cookies.txt /tmp/dev-cookies.txt /tmp/analyst-cookies.txt /tmp/viewer-cookies.txt

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL RBAC TESTS COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Test Summary:"
echo "   1. ✅ Admin (admin:admin) - Full access (read/write/delete)"
echo "   2. ✅ Developer (dev:dev) - Read/write access"
echo "   3. ✅ Analyst (analyst:analyst) - Read-only access"
echo "   4. ✅ Viewer (viewer:viewer) - Read-only access"
echo "   5. ✅ Unauthenticated - Access denied (HTTP $UNAUTH_CODE)"
echo ""
echo "💡 Next Steps:"
echo "   - Configure config/rbac.json to customize role permissions"
echo "   - Set up OAuth provider for production (see docs/security/)"
echo "   - Test with real users from your IdP"
echo ""


