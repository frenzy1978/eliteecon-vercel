import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/calibration-compare.mjs <benchmark.json>');
  process.exit(1);
}

const absPath = path.resolve(process.cwd(), inputPath);
const raw = fs.readFileSync(absPath, 'utf8');
const data = JSON.parse(raw);

const entries = data.entries || [];
if (!entries.length) {
  console.log('No entries found.');
  process.exit(0);
}

let total = 0;
let absDeltaSum = 0;
let severe = 0;

for (const e of entries) {
  const teacher = e.teacherReference?.indicative_mark;
  const model = e.modelResult?.indicative_mark?.awarded;
  const mode = String(e.modelResult?.mode || '').toLowerCase();

  // Only compare real model outputs. Ignore mock/fallback/dev placeholders.
  const comparable = mode === 'live' || mode === 'real';
  if (!comparable) continue;
  if (typeof teacher !== 'number' || typeof model !== 'number') continue;

  const d = Math.abs(teacher - model);
  total += 1;
  absDeltaSum += d;
  if (d >= 4) severe += 1;
}

if (!total) {
  console.log('No comparable entries yet (need modelResult + teacherReference).');
  process.exit(0);
}

const mae = absDeltaSum / total;
console.log(JSON.stringify({
  compared: total,
  meanAbsoluteError: Number(mae.toFixed(2)),
  severeDeltaCount: severe,
  severeDeltaRate: Number((severe / total).toFixed(2))
}, null, 2));
