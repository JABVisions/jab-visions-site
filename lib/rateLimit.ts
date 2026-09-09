// Per-IP rate limiting for API routes.
//
// Usage in a route handler:
//
//   const limited = await enforceRateLimit(req, RATE_LIMITS.checkout);
//   if (limited) return limited; // 429 Too Many Requests
//
// Backends:
// - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, counts are
//   shared across all server instances (the right setup for production scale).
// - Otherwise falls back to an in-process counter. On Vercel that means each
//   warm serverless instance counts separately — still effective against
//   bursts, and zero setup. Add the Upstash env vars later to upgrade.

export type RateLimitConfig = {
  /** Unique name for the route being limited (used in the counter key). */
  name: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

// One place to tune every limit.
export const RATE_LIMITS = {
  checkout: { name: "checkout", limit: 10, windowSeconds: 60 },
  connect: { name: "connect", limit: 20, windowSeconds: 60 },
  linkPreview: { name: "link-preview", limit: 30, windowSeconds: 60 },
  activity: { name: "activity", limit: 60, windowSeconds: 60 },
  orbitUsers: { name: "orbit-users", limit: 30, windowSeconds: 60 },
  joinUs: { name: "join-us", limit: 5, windowSeconds: 60 },
  glitchReports: { name: "glitch-reports", limit: 5, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitConfig>;

type Verdict = { allowed: boolean; retryAfterSeconds: number };

// ---- in-memory backend -------------------------------------------------------

const memoryCounters = new Map<string, { count: number; resetAt: number }>();
const MEMORY_MAX_KEYS = 10_000;

function memoryCheck(key: string, config: RateLimitConfig): Verdict {
  const now = Date.now();

  if (memoryCounters.size > MEMORY_MAX_KEYS) {
    for (const [k, v] of memoryCounters) {
      if (v.resetAt <= now) memoryCounters.delete(k);
    }
  }

  const entry = memoryCounters.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryCounters.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count <= config.limit) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

// ---- Upstash Redis backend (shared across instances) ---------------------------

function upstashConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function upstashCheck(key: string, config: RateLimitConfig): Promise<Verdict | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  try {
    // Fixed window: INCR the counter, set its expiry on first hit.
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(config.windowSeconds), "NX"],
        ["TTL", key],
      ]),
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Array<{ result?: number }>;
    const count = Number(data?.[0]?.result ?? 0);
    const ttl = Number(data?.[2]?.result ?? config.windowSeconds);

    if (!count) return null;
    if (count <= config.limit) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, ttl) };
  } catch {
    return null; // Redis hiccup -> caller falls back to the in-memory counter
  }
}

// ---- public API ---------------------------------------------------------------

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Returns a 429 Response when the caller is over the limit, or null when the
 * request is allowed to proceed.
 */
export async function enforceRateLimit(
  req: Request,
  config: RateLimitConfig
): Promise<Response | null> {
  const key = `ratelimit:${config.name}:${clientIp(req)}`;

  let verdict: Verdict | null = null;
  if (upstashConfigured()) {
    verdict = await upstashCheck(key, config);
  }
  if (!verdict) {
    verdict = memoryCheck(key, config);
  }

  if (verdict.allowed) return null;

  return new Response(
    JSON.stringify({
      ok: false,
      error: "Too many requests. Give it a moment and try again.",
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(verdict.retryAfterSeconds),
      },
    }
  );
}
