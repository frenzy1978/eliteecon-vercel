import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

function getWritableBaseDir() {
  // Vercel serverless filesystem is read-only except /tmp.
  if (process.env.VERCEL) return process.env.TMPDIR || "/tmp";
  return process.cwd();
}

const ANALYTICS_FILE = path.join(getWritableBaseDir(), "eliteecon-analytics", "marks.jsonl");

interface MarkEvent {
  timestamp: string;
  userId: string;
  sectionType: "A" | "B";
  questionType: 9 | 10 | 15 | 25;
  awarded: number;
  max: number;
  band: string;
  durationMs: number;
}

export async function logMarkEvent(event: MarkEvent) {
  try {
    // Ensure analytics dir exists
    const dir = path.dirname(ANALYTICS_FILE);
    if (!existsSync(dir)) {
      const fs = await import("node:fs/promises");
      await fs.mkdir(dir, { recursive: true });
    }

    const line = JSON.stringify(event);
    await writeFile(ANALYTICS_FILE, line + "\n", { flag: "a" });
  } catch (err) {
    console.error("Failed to log analytics:", err);
    // Don't throw; analytics failure shouldn't break marking
  }
}

export async function getAnalyticsSummary() {
  try {
    if (!existsSync(ANALYTICS_FILE)) {
      return {
        totalMarks: 0,
        byQuestionType: {},
        byBand: {},
        averageMark: 0,
        markDistribution: {},
        avgDurationMs: 0
      };
    }

    const content = await readFile(ANALYTICS_FILE, "utf8");
    const lines = content
      .trim()
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l)) as MarkEvent[];

    const byQuestionType: Record<number, { count: number; avgMark: number; avgMax: number }> = {};
    const byBand: Record<string, number> = {};
    const markDistribution: Record<number, number> = {};
    let totalDurationMs = 0;
    let totalMarks = 0;
    let totalMax = 0;

    for (const event of lines) {
      // By question type
      if (!byQuestionType[event.questionType]) {
        byQuestionType[event.questionType] = { count: 0, avgMark: 0, avgMax: 0 };
      }
      byQuestionType[event.questionType].count++;
      byQuestionType[event.questionType].avgMark += event.awarded;
      byQuestionType[event.questionType].avgMax += event.max;

      // By band
      byBand[event.band] = (byBand[event.band] || 0) + 1;

      // Mark distribution
      markDistribution[event.awarded] = (markDistribution[event.awarded] || 0) + 1;

      totalMarks += event.awarded;
      totalMax += event.max;
      totalDurationMs += event.durationMs;
    }

    // Calculate averages
    for (const qt in byQuestionType) {
      const data = byQuestionType[qt];
      data.avgMark = Math.round((data.avgMark / data.count) * 100) / 100;
      data.avgMax = Math.round((data.avgMax / data.count) * 100) / 100;
    }

    return {
      totalMarks: lines.length,
      byQuestionType,
      byBand,
      averageMark: Math.round((totalMarks / totalMax) * 100) / 100,
      markDistribution,
      avgDurationMs: Math.round(totalDurationMs / lines.length)
    };
  } catch (err) {
    console.error("Failed to read analytics:", err);
    return null;
  }
}
