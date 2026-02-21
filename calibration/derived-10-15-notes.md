# Derived Calibration Notes for 10/15 Markers

Built from teacher-tagged 9 and 25 marker datasets to bootstrap 10/15 consistency.

## Why this is valid (interim)
- 10 marker sits between 9 and 15 structural demands.
- 15 marker shares many quality dimensions with lower-end 25 marker scripts (especially chain quality, precision, and shallow-vs-developed evaluation).
- Teacher notes showed stable patterns across scripts:
  - secure knowledge
  - diagram present but often underused
  - chain quality and precision as major discriminators
  - judgement/evaluation often underdeveloped at lower bands

## How to use in prompt tuning
- When output appears around high-L2/low-L3 quality, bias 10 marker scores toward 6-9 depending on precision + chain coherence.
- For 15 marker, anchor mid-L2 vs secure-L3 boundary primarily on:
  1. chain depth (not repetition),
  2. contextual application quality,
  3. precision of terms,
  4. judgement relevance (if command requires).

## Next step
Replace these derived anchors with direct 10/15 teacher-tagged script anchors once available.
