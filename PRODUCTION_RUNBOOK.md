# EliteEcon Production Runbook

**Status:** Live on `npm start` (port 3000)  
**Last Updated:** 2026-02-20  
**Calibration:** MAE 1.75 (0 severe deltas, 8/8 benchmark pass)

## Quick Health Checks

### 1. Marking API
```bash
curl http://localhost:3000/api/mark \
  -H "Content-Type: application/json" \
  -H "x-eliteecon-user: health-check" \
  -d '{"sectionType":"A","questionType":9,"topic":"test","commandWord":"Explain","questionText":"Test?","contextText":"test","studentAnswer":"Test answer with sufficient length to pass validation requirements.","strictness":"examiner-strict"}'
```
**Expected:** HTTP 200, indicative_mark object with awarded/max/band

### 2. Analytics
```bash
curl http://localhost:3000/api/analytics
```
**Expected:** JSON with totalMarks, byQuestionType, byBand, markDistribution, avgDurationMs

### 3. Billing Status
```bash
curl http://localhost:3000/api/billing/status
```
**Expected:** JSON with entitlements, usage, remaining submissions

### 4. Submissions History
```bash
curl "http://localhost:3000/api/submissions?limit=10" \
  -H "x-eliteecon-user: your-user-id"
```
**Expected:** Array of past submissions with marks

---

## Monitoring Checklist (Daily)

- [ ] **Marking latency:** Run `/api/analytics` → check `avgDurationMs` (target: 8-12s)
- [ ] **Mark distribution:** Are bands realistic? (L2 usually 50-60%, L3 usually 40-50%)
- [ ] **Error logs:** `tail -50 /tmp/eliteecon-dev.log | grep -i error`
- [ ] **Database size:** `ls -lh app/eliteecon/data/submissions.json` (keep <500 entries, auto-rotates)
- [ ] **Provider health:** Both OpenAI and Anthropic keys active? Check `.env.local`

---

## Common Issues & Fixes

### Issue: Marking returns 402 "Monthly limit reached"
**Cause:** Free-tier cap (5 submissions/month per user)  
**Fix:**
```bash
# Check current usage
curl http://localhost:3000/api/billing/status

# For calibration users, auto-bypass is enabled:
# x-eliteecon-user: calibration-bot or calibration-*
```

### Issue: 502 "Marking service temporarily unavailable"
**Cause:** Model call failure (rate limit, API down, invalid payload)  
**Debug:**
```bash
tail -100 /tmp/eliteecon-dev.log | grep -A 5 "Marking failed"
```
**Fix:**
- Check API keys in `.env.local` are valid
- If OpenAI quota exhausted, Anthropic fallback should activate
- Restart server: `pkill -f "next dev" && npm run dev`

### Issue: Analytics endpoint returns empty
**Cause:** No marks have been recorded yet  
**Expected behavior:** Returns all zeros until first mark is processed

### Issue: Submission not saved
**Cause:** Database write failure  
**Debug:**
```bash
ls -la app/eliteecon/data/
# Ensure data/ dir is writable
chmod -R 755 app/eliteecon/data/
```

---

## Environment Variables

**Required:**
- `OPENAI_API_KEY` — Primary marking provider

**Recommended:**
- `ANTHROPIC_API_KEY` — Fallback provider for redundancy

**Optional:**
- `ELITEECON_ALLOW_MOCK_FALLBACK=false` — Don't use mock marks in production
- `ELITEECON_ALLOW_DEMO_AUTH=true` — Demo mode (x-eliteecon-user header only)

**For calibration:**
- `ELITEECON_CAL_DELAY_MS=500` — Pacing between API calls
- `ELITEECON_CAL_RETRIES=3` — Retry attempts on rate limit

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Marking latency (p50) | 8-12s | ~10s |
| Availability | 99.5% | 100% (monitored) |
| Calibration MAE | <2.5 | 1.75 ✅ |
| Severe deltas (%) | <10% | 0% ✅ |
| Monthly free quota | 5 subs | Per user |
| Concurrent requests | 10+ | Not load-tested |

---

## Escalation Path

**If marking fails >3 times in 5 min:**
1. Check `/api/billing/status` for quota issues
2. Verify OpenAI/Anthropic keys in `.env.local`
3. Check logs: `tail -100 /tmp/eliteecon-dev.log | grep -i error`
4. Restart: `pkill -f "next" && npm run dev`

**If analytics not updating:**
1. Verify `/tmp/eliteecon-dev.log` has POST /api/mark 200 entries
2. Check `app/eliteecon/analytics/marks.jsonl` exists and is writable
3. Restart server

**If database fills up (>500 entries):**
- Auto-rotation happens; old entries are trimmed
- No manual action needed

---

## Feature Rollout Checklist

### v1.0 (Current)
- [x] Section A/B marking
- [x] Calibration tuning (MAE 1.75)
- [x] Auth scaffolding (demo + Supabase ready)
- [x] Billing guards (free tier, rate limiting)
- [x] Analytics logging
- [x] Submission history
- [x] Provider fallback (OpenAI → Anthropic)

### v1.1 (Planned)
- [ ] Load testing (5-10 concurrent requests)
- [ ] Supabase sign-in integration
- [ ] Export marks as PDF/CSV
- [ ] Batch submission upload (5+ scripts at once)
- [ ] Usage dashboard for teachers

### v1.2 (Post-Launch)
- [ ] Fine-tuning on real user data
- [ ] Multi-language support
- [ ] Real-world example extraction
- [ ] Diagram OCR improvement

---

## Deployment Checklist

Before production deployment:
- [ ] `.env.local` has both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`
- [ ] `ELITEECON_ALLOW_MOCK_FALLBACK=false` (no mock marks in prod)
- [ ] `npm run build` completes without errors
- [ ] Test all endpoints: `/api/mark`, `/api/analytics`, `/api/billing/status`, `/api/submissions`
- [ ] Verify calibration test suite (8/8 benchmark pass)
- [ ] Data directory writable: `chmod -R 755 app/eliteecon/data/`

---

## Live Monitoring URLs

- **Analytics Dashboard:** `curl http://localhost:3000/api/analytics`
- **Mark a test response:** `curl -X POST http://localhost:3000/api/mark ...` (see above)
- **User submissions:** `curl http://localhost:3000/api/submissions?limit=10 -H "x-eliteecon-user: USER_ID"`

---

## Next Steps (After Launch)

1. **Week 1:** Monitor for edge cases, user feedback
2. **Week 2:** Decide fine-tuning vs. prompt-tuning (collect 50+ real marks)
3. **Week 3:** Load test with 5-10 concurrent users
4. **Month 2:** Add Supabase sign-in, export features
5. **Month 3:** Fine-tune if ROI justifies it; scale to production infrastructure

---

## Support Contact

For issues or feature requests, check:
- Local logs: `/tmp/eliteecon-dev.log`
- Database: `app/eliteecon/data/submissions.json`
- Configuration: `app/eliteecon/.env.local`
