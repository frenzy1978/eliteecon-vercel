export type PlanTier = "free" | "student_monthly" | "student_annual";

export type Entitlements = {
  tier: PlanTier;
  submissionsPerMonth: number;
};

export function getDefaultEntitlements(): Entitlements {
  return { tier: "free", submissionsPerMonth: 5 };
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function usageGuard(usedThisMonth: number, entitlements: Entitlements) {
  return {
    allowed: usedThisMonth < entitlements.submissionsPerMonth,
    remaining: Math.max(0, entitlements.submissionsPerMonth - usedThisMonth)
  };
}
