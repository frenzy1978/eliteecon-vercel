type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { ok: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0]?.trim();
  return ip || "unknown";
}
