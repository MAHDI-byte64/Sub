import "server-only";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * محدودکننده ساده در حافظه (برای جلوگیری از حمله brute-force روی ورود).
 * برای استقرار چند-نمونه‌ای باید با Redis جایگزین شود.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

export function resetLimit(key: string): void {
  buckets.delete(key);
}

// پاک‌سازی دوره‌ای تا حافظه رشد نکند
if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);
  }, 60_000);
  if (typeof timer.unref === "function") timer.unref();
}
