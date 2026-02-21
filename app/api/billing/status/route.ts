import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getDefaultEntitlements, isStripeConfigured, usageGuard } from "@/lib/billing";
import { countSubmissionsThisMonth } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // Rate limiting
  const ip = getClientIp(req);
  const rl = checkRateLimit(`billing:${ip}`, 60, 60_000); // 60 req/min per IP
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized. Missing x-eliteecon-user." }, { status: 401 });
  }

  const entitlements = getDefaultEntitlements();
  const usedThisMonth = await countSubmissionsThisMonth(user.id);
  const usage = usageGuard(usedThisMonth, entitlements);

  return NextResponse.json({
    userId: user.id,
    authSource: user.source,
    stripeConfigured: isStripeConfigured(),
    entitlements,
    usage: {
      usedThisMonth,
      remainingThisMonth: usage.remaining,
      allowed: usage.allowed
    }
  });
}
