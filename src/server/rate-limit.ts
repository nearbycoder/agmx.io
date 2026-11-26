import { createHash } from "node:crypto"

/**
 * In-process fixed-window rate limiting for the public HTTP surface (REST API, MCP, agent sign-up).
 *
 * Plan quotas already cap how much mail an account can send; this stops request floods,
 * credential stuffing and sign-up spam before they reach the database. State is per process,
 * which matches a single-replica deployment; behind several replicas each gets its own budget.
 * Disable with RATE_LIMIT=off (e.g. for load tests).
 */
export interface RateRule {
  readonly name: string
  readonly limit: number
  readonly windowMs: number
}

export const RULES = {
  /** Requests with an API key or session, per credential. Long-polls count once per call. */
  authenticated: { name: "api", limit: 600, windowMs: 60_000 },
  /** Requests without credentials, per client IP. */
  anonymous: { name: "anon", limit: 120, windowMs: 60_000 },
  /** Starting an agent sign-up (each one emails a human), per client IP. */
  signup: { name: "signup", limit: 10, windowMs: 60 * 60_000 },
  /** Failed authentication attempts (bad keys), per client IP. */
  badAuth: { name: "badauth", limit: 30, windowMs: 10 * 60_000 }
} as const satisfies Record<string, RateRule>

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 20_000
let lastSweep = Date.now()

const sweep = (now: number) => {
  if (now - lastSweep < 60_000 && buckets.size <= MAX_BUCKETS) return
  lastSweep = now
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS
    let removed = 0
    for (const key of buckets.keys()) {
      buckets.delete(key)
      if (++removed >= excess) break
    }
  }
}

export interface RateResult {
  ok: boolean
  limit: number
  remaining: number
  /** Seconds until the window resets. */
  retryAfter: number
}

/** Count one hit against `rule` for `key`. */
export const hit = (rule: RateRule, key: string, now = Date.now()): RateResult => {
  sweep(now)
  const id = `${rule.name}:${key}`
  let bucket = buckets.get(id)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + rule.windowMs }
    buckets.set(id, bucket)
  }
  bucket.count += 1
  return {
    ok: bucket.count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  }
}

/** Testing helper. */
export const resetRateLimits = () => buckets.clear()

export const rateLimitingEnabled = () => (process.env.RATE_LIMIT ?? "").toLowerCase() !== "off"

/**
 * Internal header populated by `/api/auth/$` with the verified client IP before calling Better Auth.
 * Any incoming value from the network is stripped first so callers cannot spoof it.
 */
export const TRUSTED_INTERNAL_IP_HEADER = "x-agmx-client-ip"

const lastHop = (value: string | null | undefined): string | null => {
  if (!value) return null
  const hops = value.split(",").map((h) => h.trim()).filter(Boolean)
  return hops.length ? hops[hops.length - 1]! : null
}

/**
 * Resolve the client's IP from request headers.
 *
 * When `TRUSTED_IP_HEADER` is configured (e.g. `cf-connecting-ip` behind Cloudflare or `x-real-ip`
 * behind nginx), that header is read first. Otherwise we read the right-most `X-Forwarded-For` hop
 * (appended by reverse proxies like Caddy/Coolify, Traefik and nginx; left-most hops are client-
 * controlled and spoofable), falling back to `X-Real-IP` only when `X-Forwarded-For` is absent.
 */
export const clientIpFromHeaders = (get: (name: string) => string | null | undefined): string => {
  const configured = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase()
  if (configured) {
    const trusted = lastHop(get(configured))
    if (trusted) return trusted
  }
  const forwarded = lastHop(get("x-forwarded-for"))
  if (forwarded) return forwarded
  const real = get("x-real-ip")?.trim()
  if (real) return real
  return "unknown"
}

export const clientIp = (request: Request): string => clientIpFromHeaders((name) => request.headers.get(name))

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24)

/** A stable key for whoever is calling: their API key or session if present, else their IP. */
export const callerKey = (request: Request): { key: string; authenticated: boolean } => {
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || request.headers.get("x-api-key")?.trim()
  if (header) return { key: `k:${digest(header)}`, authenticated: true }
  const session = /(?:^|;\s*)(?:__Secure-)?agmx\.session_token=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1]
  if (session) return { key: `s:${digest(session)}`, authenticated: true }
  return { key: `ip:${clientIp(request)}`, authenticated: false }
}

export const tooManyRequests = (result: RateResult, message: string, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify({ _tag: "RateLimited", message: `${message} Try again in ${result.retryAfter}s.`, retryAfter: result.retryAfter }), {
    status: 429,
    headers: {
      ...extraHeaders,
      "content-type": "application/json",
      "retry-after": String(result.retryAfter),
      "x-ratelimit-limit": String(result.limit),
      "x-ratelimit-remaining": "0"
    }
  })

/**
 * Apply the standard rules to an API/MCP request. Returns a 429 response when over the limit, or null.
 * `signup` adds the stricter per-IP budget for starting an agent sign-up.
 */
export const checkRequest = (request: Request, options: { signup?: boolean; headers?: Record<string, string> } = {}): Response | null => {
  if (!rateLimitingEnabled()) return null
  const ip = clientIp(request)
  if (options.signup) {
    const r = hit(RULES.signup, ip)
    if (!r.ok) return tooManyRequests(r, "Too many sign-up requests from this network.", options.headers)
  }
  const caller = callerKey(request)
  const r = hit(caller.authenticated ? RULES.authenticated : RULES.anonymous, caller.key)
  if (!r.ok) return tooManyRequests(r, "Rate limit exceeded.", options.headers)
  return null
}

/** Whether an IP is currently locked out for failed authentication (doesn't count a hit). */
export const badAuthLockout = (request: Request, headers: Record<string, string> = {}): Response | null => {
  if (!rateLimitingEnabled()) return null
  const bucket = buckets.get(`${RULES.badAuth.name}:${clientIp(request)}`)
  const now = Date.now()
  if (!bucket || bucket.resetAt <= now || bucket.count <= RULES.badAuth.limit) return null
  return tooManyRequests(
    { ok: false, limit: RULES.badAuth.limit, remaining: 0, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) },
    "Too many failed authentication attempts.",
    headers
  )
}

/** Count a failed authentication; returns a 429 response once an IP has failed too often. */
export const recordBadAuth = (request: Request, headers: Record<string, string> = {}): Response | null => {
  if (!rateLimitingEnabled()) return null
  const r = hit(RULES.badAuth, clientIp(request))
  return r.ok ? null : tooManyRequests(r, "Too many failed authentication attempts.", headers)
}

/** Header name Better Auth reads the client IP from (populated in `/api/auth/$` from `clientIp`). */
export const IP_HEADERS = [TRUSTED_INTERNAL_IP_HEADER]
