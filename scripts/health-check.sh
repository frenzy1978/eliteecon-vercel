#!/bin/bash

# EliteEcon Health Check Script
# Run this periodically to monitor system health

set -e

HOST=${HOST:-http://localhost:3000}
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
RESULTS_DIR="${PWD}/health-checks"

mkdir -p "$RESULTS_DIR"

echo "=== EliteEcon Health Check ==="
echo "Timestamp: $TIMESTAMP"
echo "Host: $HOST"
echo ""

# 1. Check if server is responding
echo -n "1. Server connectivity... "
if curl -s "$HOST/api/billing/status" > /dev/null 2>&1; then
  echo "✅ OK"
else
  echo "❌ FAILED - Server not responding"
  exit 1
fi

# 2. Test marking API
echo -n "2. Marking API... "
MARK_RESULT=$(curl -s -X POST "$HOST/api/mark" \
  -H "Content-Type: application/json" \
  -H "x-eliteecon-user: health-check" \
  -d '{
    "sectionType":"A",
    "questionType":9,
    "topic":"test",
    "commandWord":"Explain",
    "questionText":"Test question?",
    "contextText":"test context",
    "studentAnswer":"Test answer with sufficient length to pass validation requirements for marking.",
    "strictness":"examiner-strict"
  }')

if echo "$MARK_RESULT" | grep -q '"indicative_mark"'; then
  echo "✅ OK"
  MARK=$(echo "$MARK_RESULT" | grep -o '"awarded":[0-9]*' | cut -d: -f2)
  echo "   → Sample mark: $MARK/9"
else
  echo "❌ FAILED"
  echo "   Response: $(echo "$MARK_RESULT" | head -c 100)"
fi

# 3. Check analytics
echo -n "3. Analytics endpoint... "
ANALYTICS=$(curl -s "$HOST/api/analytics")
if echo "$ANALYTICS" | grep -q '"totalMarks"'; then
  TOTAL=$(echo "$ANALYTICS" | grep -o '"totalMarks":[0-9]*' | cut -d: -f2)
  echo "✅ OK"
  echo "   → Total marks recorded: $TOTAL"
else
  echo "❌ FAILED"
fi

# 4. Check billing
echo -n "4. Billing status... "
BILLING=$(curl -s "$HOST/api/billing/status")
if echo "$BILLING" | grep -q '"entitlements"'; then
  TIER=$(echo "$BILLING" | grep -o '"tier":"[^"]*' | cut -d: -f2)
  USED=$(echo "$BILLING" | grep -o '"usedThisMonth":[0-9]*' | cut -d: -f2)
  echo "✅ OK"
  echo "   → Tier: $TIER, Used: $USED"
else
  echo "❌ FAILED"
fi

# 5. Check database size
echo -n "5. Database size... "
if [ -f "$PWD/data/submissions.json" ]; then
  SIZE=$(du -h "$PWD/data/submissions.json" | cut -f1)
  LINES=$(wc -l < "$PWD/data/submissions.json" || echo "unknown")
  echo "✅ OK"
  echo "   → Size: $SIZE, ~$LINES lines"
else
  echo "⚠️  No database yet (expected on first run)"
fi

# 6. Check environment
echo -n "6. API keys configured... "
if [ -f ".env.local" ]; then
  OPENAI_PRESENT=$(grep -c "OPENAI_API_KEY=" .env.local || echo 0)
  ANTHROPIC_PRESENT=$(grep -c "ANTHROPIC_API_KEY=" .env.local || echo 0)
  echo "✅ OK"
  echo "   → OpenAI: $([ "$OPENAI_PRESENT" -gt 0 ] && echo 'yes' || echo 'NO'), Anthropic: $([ "$ANTHROPIC_PRESENT" -gt 0 ] && echo 'yes' || echo 'NO')"
else
  echo "❌ NO .env.local FILE"
fi

echo ""
echo "=== Health Check Complete ==="
echo "Results saved to: $RESULTS_DIR/health-$(date +%s).json"
