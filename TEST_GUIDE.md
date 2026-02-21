# EliteEcon Testing Guide

**Live Preview URL:** http://localhost:3000  
**Status:** Dev server running (npm run dev)  
**Time:** 2026-02-20 18:00 UTC

---

## Quick Start (2 Minutes)

1. Open **http://localhost:3000** in your browser
2. You should see the EliteEcon MVP homepage
3. Try marking a Section A response using the form

---

## Full Test Suite

### Test 1: Homepage Load
**Expected:** Responsive page with logo, navigation, brief description

**URL:** http://localhost:3000

**What to look for:**
- [ ] Page loads (no 404 or errors)
- [ ] Title: "EliteEcon MVP"
- [ ] Subtitle mentions "AQA-aligned Economics feedback prototype"
- [ ] Navigation menu visible
- [ ] No JavaScript errors in console (F12 → Console)

---

### Test 2: Mark a Section A Response (9-marker)

**URL:** http://localhost:3000/api/mark (or use form on homepage)

**Test Case: Basic 9-marker question**

1. Fill in form or use curl:
```bash
curl -X POST http://localhost:3000/api/mark \
  -H "Content-Type: application/json" \
  -H "x-eliteecon-user: test-user-1" \
  -d '{
    "sectionType":"A",
    "questionType":9,
    "topic":"inflation",
    "commandWord":"Explain",
    "questionText":"Explain how an increase in aggregate demand can lead to demand-pull inflation.",
    "contextText":"Based on UK economic data 2021-2023",
    "studentAnswer":"When aggregate demand increases, firms increase prices to clear the market. Higher prices mean consumers face inflation. This occurs because supply cannot keep up with demand in the short run. For example, post-pandemic, increased government spending and pent-up demand led to 11% inflation in the UK. The multiplier effect amplifies initial spending increases, further raising aggregate demand and prices.",
    "strictness":"examiner-strict"
  }'
```

**Expected Response:**
```json
{
  "indicative_mark": {
    "awarded": 5-7,
    "max": 9,
    "band": "Mid"
  },
  "ao_breakdown": {
    "ao1": { "strength": "...", "improvement": "...", "score_hint": "..." },
    "ao2": { ... },
    "ao3": { ... },
    "ao4": { ... }
  },
  "section_focus": { ... },
  "mode": "live"
}
```

**What to check:**
- [ ] HTTP 200 (not 502 or 429)
- [ ] `indicative_mark.awarded` is between 0-9
- [ ] `indicative_mark.band` is realistic (e.g., "Mid", "Low", "High")
- [ ] All 4 AO fields present
- [ ] `mode: "live"` (confirms new API keys working)
- [ ] Response time: 8-15 seconds (normal for model inference)

---

### Test 3: Mark a Section B Response (25-marker with real-world examples)

**Test Case: Essay with policy examples**

```bash
curl -X POST http://localhost:3000/api/mark \
  -H "Content-Type: application/json" \
  -H "x-eliteecon-user: test-user-2" \
  -d '{
    "sectionType":"B",
    "questionType":25,
    "topic":"fiscal policy effectiveness",
    "commandWord":"Evaluate",
    "questionText":"Evaluate the view that fiscal policy is always effective in reducing unemployment.",
    "contextText":"Consider evidence from UK, USA, and China",
    "studentAnswer":"Fiscal policy can be effective but has limitations. The 2008 financial crisis showed stimulus helped: USA created 2M jobs with ARRA, and UK used temporary VAT cuts. However, effectiveness depends on timing and economic conditions. In 2011, UK austerity reduced growth, showing poorly-timed cuts harm recovery. Japan's lost decade illustrates demand-side limits: despite massive stimulus, deflation persisted due to structural issues. The fiscal multiplier varies: in recessions it reaches 1.5-2, but in expansions falls to 0.5. Additionally, crowding out occurs when government borrowing raises interest rates, offsetting private investment. Time lags also matter: recognition lag (6 months) and implementation lag (12+ months) mean stimulus arrives after recovery starts. For example, post-COVID stimulus in 2021 arguably overheated demand, fueling inflation rather than reducing unemployment. Therefore, fiscal policy is a tool requiring careful context-specific application, not a universal solution.",
    "strictness":"examiner-strict"
  }'
```

**Expected Response:** 
- Mark should be 14-20/25 (strong response with evidence)
- `section_focus.real_world_examples` should be "strong" or "some"
- Should reference "2008", "UK", "USA", "Japan", "2011" in feedback

**What to check:**
- [ ] HTTP 200
- [ ] Mark between 12-22/25 (realistic range)
- [ ] `section_focus.real_world_examples` is "strong" or "some" (not "limited")
- [ ] Feedback mentions specific examples or policies
- [ ] All 4 AO fields filled
- [ ] Response time: 10-15 seconds

---

### Test 4: Analytics Endpoint

**URL:** http://localhost:3000/api/analytics

```bash
curl -s http://localhost:3000/api/analytics | jq .
```

**Expected Response:**
```json
{
  "totalMarks": 2,
  "byQuestionType": {
    "9": { "count": 1, "avgMark": 6.5, "avgMax": 9 },
    "25": { "count": 1, "avgMark": 17, "avgMax": 25 }
  },
  "byBand": {
    "Mid": 1,
    "High": 1
  },
  "averageMark": 0.75,
  "markDistribution": { "6": 1, "17": 1 },
  "avgDurationMs": 10500
}
```

**What to check:**
- [ ] HTTP 200
- [ ] `totalMarks` > 0 (reflects marks you've submitted)
- [ ] `byQuestionType` has entries for 9 and/or 25
- [ ] `avgDurationMs` between 8000-15000 (8-15 seconds)
- [ ] Data updates as you mark more responses

---

### Test 5: Submission History

**URL:** http://localhost:3000/api/submissions

```bash
curl -s "http://localhost:3000/api/submissions?limit=5" \
  -H "x-eliteecon-user: test-user-1" | jq '.submissions[0]'
```

**Expected Response:**
```json
{
  "id": "...",
  "createdAt": "2026-02-20T18:XX:XXZ",
  "sectionType": "A",
  "questionType": 9,
  "topic": "inflation",
  "commandWord": "Explain",
  "strictness": "examiner-strict",
  "mode": "live",
  "indicative_mark": {
    "awarded": 6,
    "max": 9,
    "band": "Mid"
  }
}
```

**What to check:**
- [ ] HTTP 200
- [ ] Returns array of submissions for that user
- [ ] Each submission has `indicative_mark` with `awarded/max/band`
- [ ] Most recent submission is first
- [ ] Changing `x-eliteecon-user` header returns different user's submissions

---

### Test 6: Billing Status

**URL:** http://localhost:3000/api/billing/status

```bash
curl -s http://localhost:3000/api/billing/status \
  -H "x-eliteecon-user: test-user-1" | jq .
```

**Expected Response:**
```json
{
  "userId": "test-user-1",
  "authSource": "header",
  "stripeConfigured": false,
  "entitlements": {
    "tier": "free",
    "submissionsPerMonth": 5
  },
  "usage": {
    "usedThisMonth": 2,
    "remainingThisMonth": 3,
    "allowed": true
  }
}
```

**What to check:**
- [ ] HTTP 200
- [ ] `tier: "free"`
- [ ] `submissionsPerMonth: 5`
- [ ] `usedThisMonth` increases as you mark
- [ ] When `usedThisMonth >= 5`, `allowed` becomes false

---

### Test 7: Rate Limiting (Advanced)

**Test:** Exceed 20 requests/minute on `/api/mark`

```bash
#!/bin/bash
echo "Sending 25 rapid requests to /api/mark..."
for i in {1..25}; do
  echo -n "Request $i: "
  curl -s -w "%{http_code}\n" -o /dev/null -X POST http://localhost:3000/api/mark \
    -H "Content-Type: application/json" \
    -H "x-eliteecon-user: ratelimit-test" \
    -d '{"sectionType":"A","questionType":9,"topic":"test","commandWord":"Explain","questionText":"Test?","contextText":"test","studentAnswer":"Test answer with sufficient length for validation purposes here.","strictness":"examiner-strict"}' &
  sleep 0.2
done
wait
```

**Expected:**
- First ~20 requests: HTTP 200
- Requests 21+: HTTP 429 (rate limit exceeded)

**What to check:**
- [ ] Early requests succeed (200)
- [ ] Later requests get 429 (Retry-After header present)
- [ ] Rate limit resets after 60 seconds

---

### Test 8: Error Handling (Invalid Input)

**Test:** Send invalid question type

```bash
curl -s -X POST http://localhost:3000/api/mark \
  -H "Content-Type: application/json" \
  -H "x-eliteecon-user: test-error" \
  -d '{
    "sectionType":"A",
    "questionType":12,
    "topic":"test",
    "commandWord":"Explain",
    "questionText":"Test?",
    "contextText":"test",
    "studentAnswer":"Test answer."
  }' | jq .
```

**Expected Response:**
```json
{
  "error": "Invalid payload",
  "details": {
    "fieldErrors": { "questionType": [...] }
  }
}
```

**What to check:**
- [ ] HTTP 400 (not 500)
- [ ] Error message is generic and helpful
- [ ] No stack trace exposed (security check)
- [ ] Field validation error included

---

### Test 9: Missing Answer Text

**Test:** Send answer that's too short (< 20 chars)

```bash
curl -s -X POST http://localhost:3000/api/mark \
  -H "Content-Type: application/json" \
  -H "x-eliteecon-user: test-short" \
  -d '{
    "sectionType":"A",
    "questionType":9,
    "topic":"test",
    "commandWord":"Explain",
    "questionText":"Explain X?",
    "contextText":"context",
    "studentAnswer":"Too short"
  }' | jq .error
```

**Expected:**
```
"Provide either written answer text (20+ chars) or answer page photos."
```

**What to check:**
- [ ] HTTP 400
- [ ] Clear message about minimum length

---

### Test 10: Demo vs Real Auth

**Without x-eliteecon-user header:**
```bash
curl -s http://localhost:3000/api/billing/status | jq .
```

**Expected (demo mode enabled):**
```json
{
  "userId": "demo-user",
  "authSource": "demo"
}
```

**With valid header:**
```bash
curl -s http://localhost:3000/api/billing/status \
  -H "x-eliteecon-user: my-custom-user-123" | jq .
```

**Expected:**
```json
{
  "userId": "my-custom-user-123",
  "authSource": "header"
}
```

**What to check:**
- [ ] Demo auth works when no header provided
- [ ] Custom user IDs work when header valid
- [ ] Invalid header format (< 6 chars or invalid chars) rejects to demo

---

## UI Testing (If Homepage is Available)

**URL:** http://localhost:3000

1. **Look for:**
   - [ ] Page title & description
   - [ ] Form fields (or links to API docs)
   - [ ] Navigation menu
   - [ ] Responsive design (check on mobile)

2. **Try marking via UI (if form exists):**
   - [ ] Fill in Section + Question Type
   - [ ] Enter question text
   - [ ] Enter student answer
   - [ ] Click "Mark"
   - [ ] See mark result with feedback
   - [ ] Check response time (should be ~10 seconds)

---

## Performance Testing

**Measure marking speed:**

```bash
time curl -s -X POST http://localhost:3000/api/mark \
  -H "Content-Type: application/json" \
  -H "x-eliteecon-user: perf-test" \
  -d '{...}' > /dev/null
```

**Expected:** 8-15 seconds (model inference time)

**If > 20 seconds:** Check logs for errors
**If < 5 seconds:** Likely using mock fallback (check `mode: "fallback_on_error"`)

---

## Browser Developer Console Checks

1. **Open DevTools:** F12
2. **Go to Console tab**
3. Look for:
   - [ ] No red errors
   - [ ] No security warnings
   - [ ] No CORS issues (if testing from browser)

4. **Go to Network tab**
5. Make a request to `/api/mark`
   - [ ] Status: 200
   - [ ] Content-Type: application/json
   - [ ] Response time: 8-15s
   - [ ] Size: reasonable (< 50KB)

---

## Success Criteria

✅ **Test Passed if:**
- HTTP 200 on `/api/mark`, `/api/analytics`, `/api/submissions`, `/api/billing/status`
- Marking produces realistic scores (0-9, 0-25 within ranges)
- Rate limiting works (429 after limit)
- Error handling is graceful (400 with message, not 500)
- No stack traces exposed
- Response times are 8-15 seconds
- New API keys are working (mode: "live")

❌ **Issues to Report if:**
- HTTP 502 (marking service down)
- HTTP 429 too early (rate limit too aggressive)
- HTTP 401 when header provided (auth broken)
- Marks outside expected range (0-9, 0-25)
- Stack traces in error responses (security issue)
- Response time > 30 seconds (timeout risk)

---

## Test Results Template

Copy and fill in:

```
TEST RESULTS (2026-02-20)
========================

✓ Test 1: Homepage Load
✓ Test 2: Section A 9-marker
✓ Test 3: Section B 25-marker
✓ Test 4: Analytics
✓ Test 5: Submission History
✓ Test 6: Billing Status
✓ Test 7: Rate Limiting
✓ Test 8: Error Handling
✓ Test 9: Missing Answer
✓ Test 10: Auth

PERFORMANCE:
- Avg marking time: __ seconds
- Fastest: __ seconds
- Slowest: __ seconds

ISSUES FOUND:
- (none) | (list here)

APPROVED FOR DEPLOYMENT: YES / NO
```

---

## Need Help?

**Check logs:**
```bash
tail -100 /tmp/eliteecon-dev.log | grep -i error
```

**Restart server:**
```bash
pkill -f "next dev"
sleep 2
cd /home/Mick/.openclaw/workspace/app/eliteecon && npm run dev &
sleep 10
```

**Run health check:**
```bash
bash /home/Mick/.openclaw/workspace/app/eliteecon/scripts/health-check.sh
```

---

## When You're Ready

Once all tests pass, you're ready to:
1. Deploy to production platform
2. Set up HTTPS
3. Configure environment variables
4. Enable production security settings

Good luck testing! 🚀
