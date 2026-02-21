import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SavedSubmission {
  id: string;
  ownerId: string;
  createdAt: string;
  sectionType?: "A" | "B";
  questionType: 9 | 10 | 15 | 25;
  topic: string;
  commandWord: string;
  questionText: string;
  contextText?: string;
  studentAnswer: string;
  strictness: "student-friendly" | "examiner-strict";
  mode: string;
  report: unknown;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "submissions.json");

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await writeFile(DATA_FILE, "[]", "utf8");
  }
}

export async function saveSubmission(entry: SavedSubmission) {
  await ensureStore();
  const raw = await readFile(DATA_FILE, "utf8");
  const arr = JSON.parse(raw) as SavedSubmission[];
  arr.unshift(entry);
  await writeFile(DATA_FILE, JSON.stringify(arr.slice(0, 500), null, 2), "utf8");
}

export async function listSubmissions(ownerId: string, limit = 20): Promise<SavedSubmission[]> {
  await ensureStore();
  const raw = await readFile(DATA_FILE, "utf8");
  const arr = JSON.parse(raw) as SavedSubmission[];
  return arr.filter((x) => x.ownerId === ownerId).slice(0, limit);
}

export async function countSubmissionsThisMonth(ownerId: string, now = new Date()): Promise<number> {
  await ensureStore();
  const raw = await readFile(DATA_FILE, "utf8");
  const arr = JSON.parse(raw) as SavedSubmission[];
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  return arr.filter((x) => {
    if (x.ownerId !== ownerId) return false;
    const d = new Date(x.createdAt);
    return d.getUTCFullYear() === year && d.getUTCMonth() === month;
  }).length;
}

export async function getSubmissionAnalytics(ownerId: string, limit = 50) {
  await ensureStore();
  const raw = await readFile(DATA_FILE, "utf8");
  const arr = (JSON.parse(raw) as SavedSubmission[])
    .filter((x) => x.ownerId === ownerId)
    .slice(0, limit);

  const recentMarks = arr.map((x) => ({
    createdAt: x.createdAt,
    score: Number((x as any)?.report?.indicative_mark?.awarded || 0),
    max: Number((x as any)?.report?.indicative_mark?.max || x.questionType)
  }));

  const aoTotals: Record<string, number> = { ao1: 0, ao2: 0, ao3: 0, ao4: 0 };
  const aoCounts: Record<string, number> = { ao1: 0, ao2: 0, ao3: 0, ao4: 0 };

  for (const x of arr) {
    const b = (x as any)?.report?.ao_breakdown || {};
    for (const k of ["ao1", "ao2", "ao3", "ao4"]) {
      const hint = String(b?.[k]?.score_hint || "").toLowerCase();
      if (!hint) continue;
      const mapped = hint.includes("high") ? 3 : hint.includes("mid") ? 2 : 1;
      aoTotals[k] += mapped;
      aoCounts[k] += 1;
    }
  }

  const aoAverages = Object.fromEntries(
    Object.keys(aoTotals).map((k) => [k, aoCounts[k] ? Number((aoTotals[k] / aoCounts[k]).toFixed(2)) : 0])
  );

  const topicCounts = new Map<string, number>();
  for (const x of arr) {
    const key = (x.topic || "unknown").trim().toLowerCase();
    topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
  }
  const weakTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, attempts]) => ({ topic, attempts }));

  return { recentMarks, aoAverages, weakTopics, totalAttempts: arr.length };
}
