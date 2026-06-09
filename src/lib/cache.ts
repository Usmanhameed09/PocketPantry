/**
 * Thin server-side cache wrapper around Upstash Redis (REST API).
 *
 * Pattern: TTL caching with mutation-triggered invalidation.
 *   - withCache(key, ttl, fetcher) returns cached value if hot, else
 *     calls fetcher and caches the result.
 *   - invalidateKeys([...]) is called by mutation endpoints (refill,
 *     PO transitions, cost change, etc.) to wipe stale entries so the
 *     next read picks up fresh data.
 *
 * Graceful degradation: if UPSTASH_REDIS_REST_URL / _TOKEN aren't set,
 * every call passes through to the fetcher directly. The app keeps
 * working without Redis — just slower.
 *
 * Keys use a `module:resource:scope` convention so invalidation can
 * target specific scopes. Examples:
 *   today:summary
 *   inventory:overview
 *   inventory:buy-list
 *   inventory:waste
 *   leads:dashboard:counts
 *   predictions:snapshot
 *   ai:mini-snapshot
 */

import "server-only";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

function isEnabled() {
  return REDIS_URL.length > 0 && REDIS_TOKEN.length > 0;
}

// Upstash REST returns { result: T | null } on success. Most ops give
// strings; we JSON-encode/decode our payloads to keep types flexible.

type UpstashResponse<T> = { result: T };

async function redisRaw<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!isEnabled()) return null;
  try {
    const res = await fetch(`${REDIS_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        ...(init?.headers || {}),
      },
      // Don't let Next.js cache the REST response itself — we manage TTL.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as UpstashResponse<T>;
    return data.result;
  } catch {
    // Don't propagate cache errors. The caller's fetcher will still run.
    return null;
  }
}

async function redisGet(key: string): Promise<string | null> {
  return redisRaw<string | null>(`/get/${encodeURIComponent(key)}`);
}

async function redisSetEx(key: string, value: string, ttlSeconds: number): Promise<void> {
  // POST body for values that may contain slashes / arbitrary characters.
  await redisRaw<string>(`/set/${encodeURIComponent(key)}?EX=${ttlSeconds}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: value,
  });
}

async function redisDel(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // Upstash supports /del/k1/k2/k3 — chain them.
  const path = "/del/" + keys.map((k) => encodeURIComponent(k)).join("/");
  await redisRaw<number>(path);
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (!isEnabled()) return fetcher();

  const cached = await redisGet(key);
  if (cached !== null && cached !== undefined) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Corrupted entry — fall through and refresh.
    }
  }
  const fresh = await fetcher();
  // Don't cache obvious failure shapes — operator should see a fresh
  // attempt next time, not a cached 'success: false'.
  if (fresh != null && typeof fresh === "object" && (fresh as { success?: boolean }).success === false) {
    return fresh;
  }
  try {
    await redisSetEx(key, JSON.stringify(fresh), ttlSeconds);
  } catch {
    // Best-effort write — already have the fresh value.
  }
  return fresh;
}

export async function invalidateKeys(keys: string[]): Promise<void> {
  if (!isEnabled() || keys.length === 0) return;
  await redisDel(keys);
}

// Convenience invalidators grouped by mutation type — call from the
// mutation endpoint right after the DB write succeeds. Add new ones as
// you wrap more endpoints in withCache.

export const CACHE_KEYS = {
  today: "today:summary",
  inventoryOverview: "inventory:overview",
  buyList: "inventory:buy-list",
  waste: "inventory:waste",
  audit: "inventory:audit:recent",
  pricingAnalyses: "pricing:analyses",
  leadsDashboard: "leads:dashboard",
  predictions: "predictions:snapshot",
  aiMiniSnapshot: "ai:mini-snapshot",
  // Second wave
  reports: "reports:summary",            // dynamic per-range — see prefix below
  machinesList: "machines:list",
  machinesTotals: "machines:totals",
  exceptions: "inventory:exceptions",
  underperformers: "inventory:underperformers",
  posList: "inventory:pos:list",
  proposals: "inventory:proposals",
  warehouse: "inventory:warehouse",
} as const;

// Reports caches per date range — build a deterministic key from the
// URL params so different ranges don't collide in the cache.
export function reportsCacheKey(range: string, machine?: string) {
  return `reports:${range}:${machine || "all"}`;
}

export async function invalidateOnInventoryWrite(): Promise<void> {
  await invalidateKeys([
    CACHE_KEYS.today,
    CACHE_KEYS.inventoryOverview,
    CACHE_KEYS.buyList,
    CACHE_KEYS.waste,
    CACHE_KEYS.audit,
    CACHE_KEYS.aiMiniSnapshot,
    CACHE_KEYS.exceptions,
    CACHE_KEYS.underperformers,
    CACHE_KEYS.warehouse,
  ]);
}

export async function invalidateOnPriceWrite(): Promise<void> {
  await invalidateKeys([
    CACHE_KEYS.pricingAnalyses,
    CACHE_KEYS.inventoryOverview,
    CACHE_KEYS.buyList,
    CACHE_KEYS.audit,
    CACHE_KEYS.exceptions,
  ]);
}

export async function invalidateOnPOWrite(): Promise<void> {
  await invalidateKeys([
    CACHE_KEYS.today,
    CACHE_KEYS.buyList,
    CACHE_KEYS.inventoryOverview,
    CACHE_KEYS.audit,
    CACHE_KEYS.aiMiniSnapshot,
    CACHE_KEYS.posList,
    CACHE_KEYS.warehouse,
  ]);
}

export async function invalidateOnLeadWrite(): Promise<void> {
  await invalidateKeys([
    CACHE_KEYS.leadsDashboard,
    CACHE_KEYS.today,
  ]);
}

export async function invalidateOnMachineWrite(): Promise<void> {
  await invalidateKeys([
    CACHE_KEYS.today,
    CACHE_KEYS.machinesList,
    CACHE_KEYS.machinesTotals,
    CACHE_KEYS.inventoryOverview,
  ]);
}

// TTLs in seconds — see SOP/architecture notes for rationale.
export const TTL = {
  today: 60,                // Today tiles: 1 min
  inventoryOverview: 120,   // Product table: 2 min
  buyList: 300,             // Buy list computation: 5 min
  waste: 300,               // Waste/turns: 5 min
  audit: 60,                // Audit log: 1 min (read-heavy in admin context)
  pricingAnalyses: 300,     // Pricing: 5 min
  leadsDashboard: 60,       // Pipeline counts: 1 min
  predictions: 1800,        // Python service: 30 min
  aiMiniSnapshot: 30,       // AI snapshot: 30s
  // Second wave
  reports: 300,             // Historical date ranges: 5 min
  machinesList: 60,         // Machine list with status: 1 min
  machinesTotals: 60,       // Cumulative totals tile: 1 min
  exceptions: 120,          // Exception queue: 2 min
  underperformers: 600,     // Slow-moving SKUs: 10 min (changes slowly)
  posList: 60,              // PO list: 1 min
  proposals: 300,           // Product proposals: 5 min
  warehouse: 120,           // Warehouse view: 2 min
} as const;
