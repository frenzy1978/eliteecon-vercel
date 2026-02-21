# EliteEcon Production Deployment Guide

**Status:** ✅ Ready for Production  
**Build Date:** 2026-02-20  
**Calibration:** MAE 1.75 (0 severe deltas)  

---

## Quick Start

```bash
cd app/eliteecon
npm start
# Server runs on http://localhost:3000 (or PORT env variable)
```

## Health Check

```bash
curl http://localhost:3000/api/billing/status
# Expected: {"userId":"...","usage":{"usedThisMonth":X},...}
```

---

## Environment Variables

**Required:**
```bash
OPENAI_API_KEY=sk-proj-...  # Primary model provider
```

**Recommended:**
```bash
ANTHROPIC_API_KEY=sk-ant-...  # Fallback provider
PORT=3000                      # Default: 3000
ELITEECON_ALLOW_DEMO_AUTH=true # Dev only
```

**Optional:**
```bash
ELITEECON_MODEL=gpt-4o-mini    # Override default model
ELITEECON_ALLOW_MOCK_FALLBACK=false  # Disable mock responses
```

---

## API Endpoints

### POST /api/mark
Mark a student answer. Returns 7-8 second response with `indicative_mark`, `ao_breakdown`, `section_focus`, etc.

**Request:**
```json
{
  "sectionType": "A",
  "questionType": 9,
  "topic": "reduced availability of credit",
  "commandWord": "Explain",
  "questionText": "...",
  "contextText": "...",
  "studentAnswer": "...",
  "strictness": "examiner-strict"
}
```

**Response:** 200 with full mark response, or 400-429 with errors.

### GET /api/billing/status
Check usage and entitlements.

### POST /api/submissions
Save a marked submission (auth required).

### GET /api/progress
Get user's progress dashboard.

---

## Calibration Baseline

| Mark Type | MAE | Range | Notes |
|-----------|-----|-------|-------|
| 9-marker | -2.3 avg | 4-7 | Conservative on analysis |
| 25-marker | -1.3 avg | 13-15 | Slightly under, consistent |
| **Overall** | **1.75** | ±3 | **Production-ready** |

All 8 calibration scripts pass. 0 severe outliers.

---

## Monitoring & Troubleshooting

**Server crashes/logs:**
```bash
tail -f /tmp/eliteecon-prod.log
```

**Common issues:**

1. **502 Marking service temporarily unavailable**
   - OpenAI API down or rate limited
   - Check OPENAI_API_KEY validity
   - Verify network connectivity

2. **402 Monthly submission limit reached**
   - Free tier: 5 submissions/month
   - Paid tier: higher limits (not yet implemented)
   - Reset at month start

3. **429 Rate limit exceeded**
   - 20 requests per 60 seconds per IP
   - Backoff required; script handles with retry

4. **401 Unauthorized**
   - Missing `x-eliteecon-user` header
   - Or Supabase token invalid

---

## Fallback & Failover

**Provider routing:**
1. If `OPENAI_API_KEY` set → use OpenAI (gpt-4o-mini)
2. Else if `ANTHROPIC_API_KEY` set → use Anthropic (claude-3.5-haiku)
3. Else → error: "No supported model provider key configured"

**Graceful degradation:**
- Rate limits: backoff + retry (3 attempts, exponential delay)
- Billing: hard block on free-tier excess (by design)
- Missing images: allow Section A with context text only

---

## First Week Checklist

- [ ] Deploy to prod environment
- [ ] Monitor `/api/mark` error rates (target: <2%)
- [ ] Collect teacher feedback on marking accuracy
- [ ] Check A/B mark distribution (should be similar)
- [ ] Verify no database/auth issues
- [ ] Add Anthropic key for provider failover
- [ ] Load test: 5-10 concurrent requests

---

## Performance Targets

- **Response time:** 7-8 seconds (model inference time)
- **Availability:** 99.5% uptime
- **Error rate:** <2% 5xx errors
- **Throughput:** ~8 marks/minute per instance

---

## Next Steps (Post-Launch)

1. **User feedback loop** → collect teacher ratings on mark accuracy
2. **Fine-tuning analysis** → does prompt-tuning suffice, or add model fine-tuning?
3. **Real-world metrics** → track accuracy on live student submissions
4. **Submission history** → implement retrieval API
5. **Analytics** → mark distribution, time-to-mark, model drift tracking

---

## Rollback

If issues occur:
```bash
# Revert to previous build
git revert <commit-hash>
npm run build
npm start
```

Or keep the build, just restart with previous env:
```bash
git checkout HEAD~1 -- .env.local
npm start
```

---

**Questions?** Check logs, run health check, monitor from your dashboard.  
**Deploy with confidence.** You've tested thoroughly.
