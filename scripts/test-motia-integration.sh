#!/bin/bash
# Quick test script for Motia integration

echo "=== Motia Integration Test ==="
echo ""

# Check if server is running
echo "1. Checking if Motia dev server is running..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo "   ✅ Server is running on port 3000"
else
  echo "   ❌ Server is not running. Please start with: npm run dev"
  exit 1
fi

echo ""
echo "2. Testing Agent API endpoint..."
RESPONSE=$(curl -s -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Test task: What is the capital of France?",
    "sessionId": "test-session-'$(date +%s)'"
  }')

echo "   Response:"
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | grep -q "success"; then
  echo ""
  echo "   ✅ API endpoint working correctly"
else
  echo ""
  echo "   ⚠️  Unexpected response format"
fi

echo ""
echo "=== Test Complete ==="
