# EliteEcon Security Audit

**Date:** 2026-02-20  
**Status:** ⚠️ CRITICAL ISSUE IDENTIFIED  
**Severity:** HIGH (API keys exposed in git)

---

## Critical Issue: API Keys Exposed in Git

### Problem
- `.env.local` is **NOT** in `.gitignore`
- File contains:
  - `OPENAI_API_KEY=sk-proj-...`
  - `ANTHROPIC_API_KEY=sk-ant-...`
- Both keys are committed to git history and visible in all commits after 2026-02-20

### Immediate Action Required
**Status: IN PROGRESS**

1. ✅ Add `.env.local` to `.gitignore`
2. ⚠️ **ROTATE API KEYS IMMEDIATELY** (existing keys are compromised)
3. Force-push git history to remove exposed keys (or squash in new commit)

### Fix Applied
```bash
# Add to .gitignore
echo ".env.local" >> .gitignore
git add .gitignore
git commit -m "security: add .env.local to gitignore"
```

### Impact
- **Public risk:** HIGH if repo is shared publicly
- **Private risk:** MEDIUM if repo is private/internal
- **Immediate:** Rotate both API keys in provider dashboards

---

## Security Assessment by Category

### 1. Authentication ✅ MOSTLY OK (with caveats)

**Strengths:**
- Supabase integration ready (OAuth/JWT path)
- Header-based auth with validation regex `/^[a-zA-Z0-9_-]{6,64}$/`
- Demo auth can be disabled

**Weaknesses:**
- ⚠️ Demo auth **enabled by default** (`ELITEECON_ALLOW_DEMO_AUTH=true`)
  - Anyone can access with header `x-eliteecon-user: demo-user`
  - **Recommendation:** Set to `false` in production
- Header-based auth has no server-side user database
  - Client can claim any user ID matching regex
  - Suitable for internal/API-only use, not public-facing
- No CSRF tokens (GET endpoints OK; POST endpoints are API-only)

**Fix:**
```env
# In .env.local for production
ELITEECON_ALLOW_DEMO_AUTH=false
ELITEECON_REQUIRE_AUTH=true  # Add new var to enforce Supabase
```

### 2. Rate Limiting ⚠️ PARTIALLY EFFECTIVE

**Strengths:**
- 20 requests/minute per IP (checked on `/api/mark`)
- Also per-user monthly limits (5 submissions/month free tier)

**Weaknesses:**
- In-memory bucket storage (resets on server restart)
  - No persistence across deployments
  - In distributed systems, each instance has separate buckets
- Rate limit key based on IP only
  - Spoofable if behind proxy without proper `x-forwarded-for`
- No rate limiting on `/api/analytics`, `/api/submissions`, `/api/billing/status`
  - Could enumerate user submissions if IDs are predictable

**Recommendation:**
```typescript
// Add rate limiting to all API endpoints, not just /api/mark
const rl = checkRateLimit(`${endpoint}:${ip}`, 30, 60_000); // 30 req/min per endpoint per IP
```

### 3. Input Validation ✅ STRONG

**Strengths:**
- Zod schema validation on all POST endpoints
- Image size limits: 3MB per image, 8 max images
- Text length limits: 12,000 characters per field
- Regular expression validation for image data URLs
- Enum validation for question types (9, 10, 15, 25 only)

**Weaknesses:**
- None identified

### 4. Data Storage ✅ ACCEPTABLE (for MVP)

**Strengths:**
- JSON file-based DB (no SQL injection risk)
- Auto-rotation: keeps only latest 500 submissions
- User-filtered retrieval (`listSubmissions` filters by `ownerId`)

**Weaknesses:**
- No encryption at rest (passwords, API keys in plain text in files)
- File permissions: check that `data/` dir is not world-readable
  - Risk: anyone with file system access can read marks & student data
- No audit logging (who accessed which submissions when?)

**Recommendation:**
```bash
# Set secure permissions
chmod 700 app/eliteecon/data/  # Owner read/write/execute only
```

### 5. API Keys & Secrets ❌ CRITICAL

**Issue:** See "Critical Issue" section above.

**Stored in:**
- `.env.local` (not git-ignored) ❌
- `.env.example` (should be versionless template) ✅

**Current risk:**
- OpenAI key: `sk-proj-...` visible in git
- Anthropic key: `sk-ant-...` visible in git

**Required action:**
1. Revoke both keys in provider dashboards
2. Generate new keys
3. Update `.env.local` (local only, not committed)
4. Add to `.gitignore`
5. Force-push or create new clean history

### 6. Error Handling ✅ SECURE

**Strengths:**
- Stack traces NOT exposed to clients (checked in route.ts)
- Generic error messages: "Marking service temporarily unavailable"
- Detailed errors logged to server logs only

**Example (secure):**
```typescript
catch (err) {
  console.error("[/api/mark] Marking failed:", err); // Server log
  return NextResponse.json({ error: "Marking service temporarily unavailable." }, { status: 502 }); // Client sees generic message
}
```

### 7. Environment Configuration ⚠️ NEEDS HARDENING

**Current:**
- `.env.local` loaded by Next.js (local dev only)
- `.env.example` for template

**Issues:**
- `ELITEECON_ALLOW_DEMO_AUTH=true` by default (should be false)
- `ELITEECON_ALLOW_MOCK_FALLBACK=false` (good, correct setting)
- No startup validation (app doesn't check if required keys exist)

**Recommendation:**
```typescript
// Add to route.ts startup
if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  throw new Error("CRITICAL: No API keys configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
}
```

### 8. HTTPS/TLS ⚠️ OUT OF SCOPE (for MVP)

**Current:** Running on localhost:3000 (HTTP only)

**Recommendation for production:**
- Deploy behind reverse proxy (nginx) with TLS
- Enforce HTTPS redirect
- Set `Secure` flag on any session cookies (if added)
- Set `SameSite=Strict` on cookies

### 9. CORS & CSP ⚠️ NOT CONFIGURED

**Current:** No explicit CORS headers set

**Risk:** 
- API is accessible from any origin
- If frontend is on different domain, CORS permissive

**Recommendation:**
```typescript
// In API route middleware
const allowedOrigins = ["https://eliteecon.example.com", "http://localhost:3000"];
const origin = req.headers.get("origin");
if (allowedOrigins.includes(origin || "")) {
  res.headers.set("Access-Control-Allow-Origin", origin);
}
```

### 10. Dependencies ⚠️ NOT AUDITED

**Need to check:**
```bash
npm audit
npm outdated
```

**Recommendation:** Run before production deployment.

---

## Action Items (Priority Order)

### CRITICAL (Do Today)
- [ ] **Rotate OpenAI and Anthropic API keys** (existing keys are exposed)
- [ ] **Add `.env.local` to `.gitignore`**
- [ ] **Force-push or squash history** to remove exposed keys from git
- [ ] **Set `ELITEECON_ALLOW_DEMO_AUTH=false`** in production

### HIGH (Do This Week)
- [ ] Run `npm audit` and fix any critical vulnerabilities
- [ ] Add environment validation startup check (fail if no API keys)
- [ ] Add rate limiting to all API endpoints, not just `/api/mark`
- [ ] Set secure file permissions: `chmod 700 data/`
- [ ] Document Supabase sign-in integration (ready, not yet deployed)

### MEDIUM (Do Before Scaling)
- [ ] Add audit logging for submission access (who, when, what)
- [ ] Implement CORS policy
- [ ] Add Content-Security-Policy headers
- [ ] Database encryption at rest (if storing sensitive data)
- [ ] Load test with security scanning (OWASP ZAP, Burp)

### LOW (Future)
- [ ] Rate limiting persistence (Redis, if needed for distributed systems)
- [ ] API key rotation strategy (automatic vs. manual)
- [ ] PII data classification and handling policy

---

## Deployment Checklist (Security)

Before going to production, verify:

- [ ] `.env.local` in `.gitignore` ✅
- [ ] API keys rotated ❌ PENDING
- [ ] No secrets in git history ❌ PENDING (need squash/force-push)
- [ ] Demo auth disabled ❌ TODO
- [ ] Rate limiting on all endpoints ❌ TODO
- [ ] File permissions hardened (700) ❌ TODO
- [ ] Error handling does not expose stack traces ✅
- [ ] Input validation complete ✅
- [ ] `npm audit` passes ❌ TODO
- [ ] HTTPS enforced in production ⚠️ (deploy responsibility)
- [ ] Supabase keys configured ⚠️ (optional for MVP, required for public)

---

## Summary

**Current Risk Level:** 🔴 **HIGH** (due to exposed API keys)

**After fixes:** 🟡 **MEDIUM** (acceptable for MVP, needs hardening for production at scale)

**Path to Green:** Rotate keys, fix environment config, add rate limiting, harden CORS, then monitor.

---

## Contact & References

- **Next.js Security:** https://nextjs.org/docs/advanced-features/security-headers
- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **Rate Limiting:** https://cloud.google.com/architecture/rate-limiting-strategies-techniques
- **Environment Security:** https://12factor.net/config
