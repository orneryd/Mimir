#!/bin/bash

# Test Audit Logging
# Tests that audit events are properly logged for various operations

set -e

SERVER_URL="${MIMIR_SERVER_URL:-http://localhost:3000}"
AUDIT_LOG_FILE="/tmp/mimir-audit-test.log"

echo "📝 Testing Mimir Audit Logging"
echo "================================"
echo ""
echo "📋 Test Configuration:"
echo "   Server: $SERVER_URL"
echo "   Audit Log: $AUDIT_LOG_FILE"
echo ""

# Clean up old audit log
rm -f "$AUDIT_LOG_FILE"

# Test 1: Enable audit logging and restart server
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Testing Audit Logging to File"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if audit logging is enabled
if ! grep -q "MIMIR_ENABLE_AUDIT_LOGGING=true" .env 2>/dev/null; then
  echo "⚠️  Audit logging not enabled in .env"
  echo "   To test, add to .env:"
  echo "   MIMIR_ENABLE_AUDIT_LOGGING=true"
  echo "   MIMIR_AUDIT_LOG_DESTINATION=file"
  echo "   MIMIR_AUDIT_LOG_FILE=$AUDIT_LOG_FILE"
  echo ""
  echo "   Then restart the server and run this test again."
  exit 0
fi

# Wait for server to be ready
echo "   Waiting for server..."
sleep 2

# Make some API calls to generate audit events
echo "   Making test API calls..."

# Test authenticated request (should log userId)
curl -s -b /tmp/admin-cookies.txt "$SERVER_URL/api/nodes/types" > /dev/null 2>&1 || true

# Test unauthenticated request (should log null userId)
curl -s "$SERVER_URL/api/nodes/types" > /dev/null 2>&1 || true

# Test write operation
curl -s -b /tmp/admin-cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"type":"memory","properties":{"title":"Audit Test","content":"Testing audit logging"}}' \
  "$SERVER_URL/api/nodes" > /dev/null 2>&1 || true

# Test failed operation (should log failure)
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"invalid":"data"}' \
  "$SERVER_URL/api/nodes" > /dev/null 2>&1 || true

echo "   ✅ API calls complete"
echo ""

# Check if audit log file exists
if [ -f "$AUDIT_LOG_FILE" ]; then
  echo "   ✅ Audit log file created"
  echo ""
  echo "   📄 Sample audit events:"
  echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Show last 5 audit events
  tail -5 "$AUDIT_LOG_FILE" | while IFS= read -r line; do
    echo "   $line"
  done
  
  echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Analyze audit log
  total_events=$(wc -l < "$AUDIT_LOG_FILE" | tr -d ' ')
  success_events=$(grep -c '"outcome":"success"' "$AUDIT_LOG_FILE" || echo "0")
  failure_events=$(grep -c '"outcome":"failure"' "$AUDIT_LOG_FILE" || echo "0")
  
  echo "   📊 Audit Log Statistics:"
  echo "      Total events: $total_events"
  echo "      Successful: $success_events"
  echo "      Failed: $failure_events"
  echo ""
  
  # Check for required fields
  echo "   🔍 Validating audit event structure..."
  
  if grep -q '"timestamp"' "$AUDIT_LOG_FILE" && \
     grep -q '"userId"' "$AUDIT_LOG_FILE" && \
     grep -q '"action"' "$AUDIT_LOG_FILE" && \
     grep -q '"resource"' "$AUDIT_LOG_FILE" && \
     grep -q '"outcome"' "$AUDIT_LOG_FILE" && \
     grep -q '"metadata"' "$AUDIT_LOG_FILE"; then
    echo "   ✅ All required fields present"
  else
    echo "   ❌ Missing required fields"
    exit 1
  fi
  
  echo ""
  echo "✅ Audit logging test complete!"
  echo ""
  echo "💡 Next steps:"
  echo "   - Review full audit log: cat $AUDIT_LOG_FILE | jq ."
  echo "   - Test webhook: Set MIMIR_AUDIT_WEBHOOK_URL in .env"
  echo "   - Test SIEM integration: Forward logs to Splunk/ELK"
  
else
  echo "   ❌ Audit log file not found at $AUDIT_LOG_FILE"
  echo "   Check server logs for errors"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL AUDIT LOGGING TESTS COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

