# EliteEcon — Auth + Stripe Next Steps

## Objective
Prepare paid beta flow (accounts + trial + subscription) without blocking current marking improvements.

## Build order
1. Add Supabase auth (email magic link + password fallback)
2. Add user table + submission ownership (user_id)
3. Add Stripe products:
   - Free trial (5 submissions)
   - Student monthly
   - Student annual
4. Add webhook endpoint for subscription status sync
5. Enforce usage limits by plan tier

## Data additions
- users
- subscriptions
- usage_counters (monthly)

## UX additions
- Sign up / login page
- Billing page
- Plan status indicator on dashboard

## Safety/compliance
- Keep indicative marking disclaimer visible on report page
- Add privacy policy + data retention note before public launch
