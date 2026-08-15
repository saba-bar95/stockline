import type { Context, Next } from "hono";
import { ERR } from "./errors.ts";

const WINDOW_MS = 60_000;
const SCORE_LIMIT = 120;
const MAX_BUCKETS = 4000;

type Bucket = { score: number; reset: number };
const buckets = new Map<string, Bucket>();

export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * Origins allowed as JWT `azp`. Prefer CLERK_AUTHORIZED_PARTIES; else HTTPS
 * entries from CORS_ORIGIN. Never lock production to localhost-only (common
 * misconfig that rejects every live Vercel session token).
 */
export function clerkAuthorizedParties(): string[] | undefined {
  const fromEnv = (process.env.CLERK_AUTHORIZED_PARTIES || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter((o) => /^https?:\/\//i.test(o));
  if (fromEnv.length) return fromEnv;

  const fromCors = allowedOrigins().filter((o) => /^https?:\/\//i.test(o));
  if (requireClerkAuth()) {
    const httpsOnly = fromCors.filter((o) => /^https:\/\//i.test(o));
    return httpsOnly.length ? httpsOnly : undefined;
  }
  return fromCors.length ? fromCors : undefined;
}

export function isPublicHealthPath(path: string): boolean {
  return path === "/health" || path === "/api/health";
}

/** True when the process must not fall back to the unauthenticated local org. */
export function requireClerkAuth(): boolean {
  if (process.env.VITEST === "true") return false;
  const url = process.env.DATABASE_URL ?? "";
  return (
    process.env.NODE_ENV === "production" ||
    url.startsWith("postgres://") ||
    url.startsWith("postgresql://")
  );
}

export function clientIp(c: Context): string {
  const real = c.req.header("x-real-ip")?.trim();
  if (real && !real.includes(",")) return real.slice(0, 64);
  const cf = c.req.header("cf-connecting-ip")?.trim();
  if (cf && !cf.includes(",")) return cf.slice(0, 64);
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Closest hop is appended by the platform proxy and is not client-spoofable.
    return (parts.at(-1) || "unknown").slice(0, 64);
  }
  return "local";
}

function requestScore(c: Context): number {
  const path = c.req.path;
  if (isPublicHealthPath(path)) return 0;
  if (path.includes("/export")) return 12;
  const method = c.req.method.toUpperCase();
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    return 3;
  }
  return 1;
}

function pruneBuckets(now: number) {
  if (buckets.size <= MAX_BUCKETS) {
    for (const [key, bucket] of buckets) {
      if (now > bucket.reset) buckets.delete(key);
    }
    return;
  }
  for (const [key, bucket] of buckets) {
    if (now > bucket.reset) buckets.delete(key);
  }
  if (buckets.size <= MAX_BUCKETS) return;
  const extra = buckets.size - MAX_BUCKETS;
  let dropped = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    dropped += 1;
    if (dropped >= extra) break;
  }
}

export async function rateLimitMiddleware(c: Context, next: Next) {
  const cost = requestScore(c);
  if (cost === 0) return next();
  const limit =
    process.env.VITEST === "true" ? 10_000 : SCORE_LIMIT;
  const ip = clientIp(c);
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || now > bucket.reset) {
    bucket = { score: 0, reset: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }
  bucket.score += cost;
  if (buckets.size > MAX_BUCKETS || bucket.score === cost) pruneBuckets(now);
  if (bucket.score > limit) {
    c.header("Retry-After", String(Math.max(1, Math.ceil((bucket.reset - now) / 1000))));
    return c.json(ERR.tooManyRequests, 429);
  }
  return next();
}

export async function noStoreMiddleware(c: Context, next: Next) {
  await next();
  if (isPublicHealthPath(c.req.path)) return;
  c.header("Cache-Control", "no-store");
}
