import { NextResponse } from "next/server";
import { listSubmissions } from "@/lib/db";
import { getAuthUserFromRequest } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function toSummary(row: any) {
  const report = row?.report || {};
  return {
    id: row.id,
    createdAt: row.createdAt,
    sectionType: row.sectionType,
    questionType: row.questionType,
    topic: row.topic,
    commandWord: row.commandWord,
    strictness: row.strictness,
    mode: row.mode,
    indicative_mark: report?.indicative_mark || null
  };
}

export async function GET(req: Request) {
  // Rate limiting
  const ip = getClientIp(req);
  const rl = checkRateLimit(`submissions:${ip}`, 30, 60_000); // 30 req/min per IP
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Missing x-eliteecon-user." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "20");
  const data = await listSubmissions(user.id, Number.isFinite(limit) ? limit : 20);
  return NextResponse.json({ submissions: data.map(toSummary) });
}
