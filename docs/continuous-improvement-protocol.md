# EliteEcon Continuous Improvement Protocol

## Purpose
Run daily improvements without waiting for approval for low-risk internal work, while preserving security and product quality.

## Operating Rules
1. **Security first**: no secret leakage, no unsafe dependencies, no public/external actions without CEO approval.
2. **Small safe batches**: each change should be testable and reversible.
3. **Build-gate required**: run build before commit.
4. **Commit discipline**: one clear purpose per commit.
5. **Cost-aware execution**: default to cheaper model path; use heavier models only when required.
6. **Anti-doom-loop rule (two-strike policy):** if the same fix fails twice, stop repeating it and switch strategy (instrument logs, isolate variables, or escalate to deep audit/sub-agent).
## Daily Cadence (Autonomous)
### Block A — Reliability
- Run build and fix regressions.
- Check API route contracts for breaking changes.
- Keep fallback paths working.

### Block B — Learning Quality
- Improve prompt clarity and scoring consistency.
- Improve section-specific feedback quality (A extract use / B real-world examples).
- Reduce hallucination/over-claim language.

### Block C — UX
- Remove friction in student flow.
- Improve mobile photo usability and readability.
- Improve feedback presentation and actionability.

### Block D — Launch Readiness
- Incrementally implement auth + billing foundations.
- Keep legal/disclaimer clarity visible.
- Prepare for controlled beta cohort.

## Security Checklist (before merge)
- [ ] No secrets committed
- [ ] Input validation intact
- [ ] Error handling does not leak internals
- [ ] Upload paths constrained and size-aware
- [ ] Disclaimers preserved in student-facing marking output

## Quality Checklist (before merge)
- [ ] Build passes
- [ ] No obvious UX regressions
- [ ] Prompt changes documented
- [ ] Commit message clear and specific

## Escalate to CEO approval when
- Pricing/paywall changes
- External messaging/public launch actions
- Legal/compliance wording changes that alter claims
- High-risk architecture changes
