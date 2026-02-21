import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getSubmissionAnalytics } from "@/lib/db";

export async function GET(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || "50");
  const data = await getSubmissionAnalytics(user.id, Number.isFinite(limit) ? limit : 50);
  return NextResponse.json(data);
}
