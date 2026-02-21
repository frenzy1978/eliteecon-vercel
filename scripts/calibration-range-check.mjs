import fs from 'node:fs';
import path from 'node:path';

function parseRange(str) {
  const m = String(str || '').match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

function inRange(v, r) {
  return typeof v === 'number' && r && v >= r.min && v <= r.max;
}

const benchmarkPathArg = process.argv[2] || 'calibration/benchmark-working.json';
const derivedPathArg = process.argv[3] || 'calibration/derived-10-15-calibration.json';

const benchmarkPath = path.resolve(process.cwd(), benchmarkPathArg);
const derivedPath = path.resolve(process.cwd(), derivedPathArg);

const bench = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
const derived = JSON.parse(fs.readFileSync(derivedPath, 'utf8'));

const entries = bench.entries || [];
const anchors10 = (derived.questionTypes?.['10']?.bands || []).map(b => ({ ...b, range: parseRange(b.markRange) }));
const anchors15 = (derived.questionTypes?.['15']?.bands || []).map(b => ({ ...b, range: parseRange(b.markRange) }));

const out = {
  scanned: 0,
  checked: 0,
  pass: 0,
  fail: 0,
  details: []
};

for (const e of entries) {
  out.scanned += 1;
  if (![10, 15].includes(e.questionType)) continue;

  const ref = e.teacherReference?.indicative_mark;
  const model = e.modelResult?.indicative_mark?.awarded;
  const anchors = e.questionType === 10 ? anchors10 : anchors15;

  if (typeof ref !== 'number' || typeof model !== 'number' || anchors.length === 0) continue;
  out.checked += 1;

  // pick nearest anchor by teacher reference
  let nearest = anchors[0];
  let bestDist = Math.abs(ref - ((nearest.range?.min ?? 0) + (nearest.range?.max ?? 0)) / 2);
  for (const a of anchors.slice(1)) {
    const center = ((a.range?.min ?? 0) + (a.range?.max ?? 0)) / 2;
    const d = Math.abs(ref - center);
    if (d < bestDist) {
      bestDist = d;
      nearest = a;
    }
  }

  const ok = inRange(model, nearest.range);
  if (ok) out.pass += 1;
  else out.fail += 1;

  out.details.push({
    id: e.id,
    questionType: e.questionType,
    teacherMark: ref,
    modelMark: model,
    expectedRange: nearest.markRange,
    anchorBand: nearest.band,
    status: ok ? 'pass' : 'fail'
  });
}

console.log(JSON.stringify(out, null, 2));
