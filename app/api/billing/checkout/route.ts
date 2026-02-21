import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserFromRequest } from "@/lib/auth";
import { CheckoutPlan, getStripePriceId, isStripeConfigured } from "@/lib/stripe";

const BodySchema = z.object({
  plan: z.enum(["student_monthly", "student_annual"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional()
});

export async function POST(req: Request) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { plan } = parsed.data;
  const priceId = getStripePriceId(plan as CheckoutPlan);

  if (!isStripeConfigured() || !priceId) {
    return NextResponse.json({
      ok: false,
      mode: "scaffold",
      message: "Stripe not configured yet. Set STRIPE keys + price IDs.",
      requiredEnv: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_PRICE_STUDENT_MONTHLY", "STRIPE_PRICE_STUDENT_ANNUAL"]
    }, { status: 501 });
  }

  return NextResponse.json({
    ok: false,
    mode: "todo",
    message: "Stripe configured. Next step: create real checkout session in this route.",
    userId: user.id,
    plan,
    priceId
  }, { status: 501 });
}
