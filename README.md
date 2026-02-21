# EliteEcon MVP Scaffold

Lean Next.js scaffold for the EliteEcon AQA feedback app.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Current scope
- Submission form with Section A/Section B workflow
- Multi-image uploads: question, extract (A), and answer pages
- Client-side image compression to reduce cost while keeping readability
- API endpoint: `POST /api/mark` (auth required)
- Submissions endpoint: `GET /api/submissions` (auth required)
- Billing scaffold endpoints: `GET /api/billing/status`, `POST /api/billing/checkout` (auth required)
- Progress endpoint: `GET /api/progress` (auth required)
- Auth mode: prefers Supabase Bearer token; supports temporary `x-eliteecon-user` scaffold for internal testing
- UI includes Supabase sign-in (email/password, dev) plus optional manual token input for bearer-auth testing
- Usage guard active on mark route (free tier monthly cap scaffold)
- Prompt templates for 9/10/15/25 markers
- Structured JSON response schema
- Local JSON persistence for submissions/reports (`data/submissions.json`)
- Teacher source guide integrated for prompt tuning: `content/teacher-mark-structure-guide.md`

## Next
- Add calibration benchmark runs (`calibration/` + `scripts/calibration-compare.mjs` + `scripts/calibration-populate-model-results.mjs`)
- Improve marking consistency against teacher references
- Continue auth hardening and production readiness
