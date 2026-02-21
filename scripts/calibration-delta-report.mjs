import fs from 'node:fs';
import path from 'node:path';

const fileArg = process.argv[2] || 'calibration/benchmark-working.json';
const abs = path.resolve(process.cwd(), fileArg);
const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
const entries = data.entries || [];

const rows = [];
for (const e of entries) {
  const t = e.teacherReference?.indicative_mark;
  const m = e.modelResult?.indicative_mark?.awarded;
  const mode = String(e.modelResult?.mode || '').toLowerCase();
  if (typeof t !== 'number' || typeof m !== 'number') continue;
  if (!(mode === 'live' || mode === 'real')) continue;

  const delta = m - t;
  rows.push({
    id: e.id,
    q: e.questionType,
    teacher: t,
    model: m,
    delta,
    direction: delta === 0 ? 'match' : delta > 0 ? 'over' : 'under'
  });
}

rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

const summary = rows.reduce(
  (acc, r) => {
    acc.total += 1;
    if (r.direction === 'over') acc.over += 1;
    if (r.direction === 'under') acc.under += 1;
    if (Math.abs(r.delta) >= 4) acc.severe += 1;
    return acc;
  },
  { total: 0, over: 0, under: 0, severe: 0 }
);

console.log(JSON.stringify({ summary, rows }, null, 2));
