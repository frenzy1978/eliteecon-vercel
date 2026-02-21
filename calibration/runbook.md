# Calibration Runbook

## Goal
Reduce mark variance between EliteEcon and teacher judgement.

## Weekly cadence
- Add 10 scripts/week (mix 9/10/15/25 markers, section A+B).
- Compare model output with teacher reference.
- Tune prompts and section-focus guidance.

## Steps
1. Copy `benchmark-template.json` to `benchmark-working.json`.
2. Add anonymized scripts + teacherReference fields.
3. Run comparison script:

```bash
node scripts/calibration-compare.mjs calibration/benchmark-working.json
```

Populate model results into benchmark entries:

```bash
ELITEECON_BASE_URL=http://127.0.0.1:3000 \
ELITEECON_CAL_USER=calibration-bot \
ELITEECON_REQUIRE_LIVE=true \
ELITEECON_CAL_DELAY_MS=1200 \
ELITEECON_CAL_RETRIES=3 \
node scripts/calibration-populate-model-results.mjs calibration/benchmark-working.json
```

> `ELITEECON_REQUIRE_LIVE=true` prevents mock/fallback outputs from polluting calibration metrics.
>
> Use delay/retries to reduce 429/temporary 5xx failures during batch calibration.

Optional (for 10/15 entries with model results present):

```bash
node scripts/calibration-range-check.mjs calibration/benchmark-working.json calibration/derived-10-15-calibration.json
```

4. Review output deltas:
- absolute mark delta
- section focus mismatch
- AO mismatch hints
- 10/15 range drift flags (pass/fail)

5. Tuning targets:
- median absolute error <= 2 marks
- no severe section-focus mismatch on >80% entries
- keep 10/15 marker tuning aligned with `derived-10-15-calibration.json` until direct anchors are added

## Notes
- Keep personal data out of benchmark entries.
- Store only anonymized text.
