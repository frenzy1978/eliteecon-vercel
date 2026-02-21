export type CheckoutPlan = "student_monthly" | "student_annual";

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function getStripePriceId(plan: CheckoutPlan) {
  if (plan === "student_monthly") return process.env.STRIPE_PRICE_STUDENT_MONTHLY || "";
  return process.env.STRIPE_PRICE_STUDENT_ANNUAL || "";
}
