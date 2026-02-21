import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/analytics";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // Rate limiting
  const ip = getClientIp(req);
  const rl = checkRateLimit(`analytics:${ip}`, 60, 60_000); // 60 req/min per IP
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  try {
    const summary = await getAnalyticsSummary();
    
    if (!summary) {
      return NextResponse.json({
        error: "Failed to read analytics"
      }, { status: 500 });
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error("[/api/analytics] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
