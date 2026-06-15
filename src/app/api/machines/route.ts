import { NextResponse } from "next/server";
import { readEnv } from "@/lib/runtime-env";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

const scraperUrl = () => readEnv("SCRAPER_API_URL") || "http://localhost:8000";
const apiKey = () => readEnv("SCRAPER_BACKEND_KEY");

export const dynamic = "force-dynamic";

/**
 * Lists machines from the scraper-api (Nayax + Chinese) but overlays our
 * DB-side status. We mark machines "Offline" when machine_inventory hasn't
 * received any update for >24h, since neither Nayax nor the Chinese platform
 * gives us a reliable unplugged signal directly.
 */
export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    const data = bypass
      ? await fetchMachines()
      : await withCache(CACHE_KEYS.machinesList, TTL.machinesList, fetchMachines);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { success: false, machines: [], total: 0, error: "Failed to fetch machines" },
      { status: 502 }
    );
  }
}

async function fetchMachines(): Promise<Record<string, unknown>> {
  const res = await fetch(`${scraperUrl()}/api/machines`, {
    headers: { ...(apiKey() ? { "x-api-key": apiKey() } : {}) },
  });
  const data = await res.json();
  const offlineMap = await getOfflineMachineIds();
  if (data && Array.isArray(data.machines)) {
    data.machines = data.machines.map((m: Record<string, unknown>) => {
      const deviceId = String(m.nayaxDeviceId || m.nayax_device_id || m.id || "");
      const info = offlineMap.get(deviceId);
      if (info) {
        return {
          ...m,
          status: "Offline",
          lastSync: info.lastSeen,
          offlineReason: `No data for ${info.ageHours.toFixed(1)}h`,
        };
      }
      return m;
    });
    // Persist the scraper-derived offline/healthy status back into the DB so
    // machines.status is CORRECT for every other consumer (AI assistant,
    // alerts, exceptions). Without this, those read a stale column — the offline
    // detector measures staleness from the sync timestamp, which refreshes even
    // for a dead machine, so the column can wrongly say "healthy". Best-effort.
    await persistScraperStatus(data.machines as Array<Record<string, unknown>>);
  }
  return data;
}

/**
 * Write each machine's scraper-derived status ("offline" / "healthy") into
 * machines.status when it differs. Runs on the /api/machines cache-miss (~60s).
 */
async function persistScraperStatus(machines: Array<Record<string, unknown>>): Promise<void> {
  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();
    const { data: rows } = await supabase
      .from("machines")
      .select("id, nayax_device_id, status")
      .eq("company_id", companyId);
    if (!rows?.length) return;

    // Key DB rows by BOTH nayax_device_id AND id, since the scraper may put the
    // matching identifier in m.nayaxDeviceId, m.nayax_device_id, or m.id (the
    // overlay above uses the same fallback chain). Keying only by device id —
    // when the scraper actually returns it as m.id — matched nothing, so the
    // persist silently did nothing and the column stayed stale.
    const byKey = new Map<string, { id: string; status: string }>();
    for (const r of rows) {
      const entry = { id: r.id as string, status: ((r.status as string) || "").toLowerCase() };
      if (r.nayax_device_id) byKey.set(String(r.nayax_device_id), entry);
      byKey.set(String(r.id), entry);
    }

    for (const m of machines) {
      const key = String(m.nayaxDeviceId || m.nayax_device_id || m.id || "");
      if (!key) continue;
      const row = byKey.get(key);
      if (!row) continue;
      const desired = String(m.status || "").toLowerCase() === "offline" ? "offline" : "healthy";
      if (row.status !== desired) {
        await supabase.from("machines").update({ status: desired }).eq("id", row.id);
      }
    }
  } catch {
    // best-effort — never fail the machine list because of a status write
  }
}

async function getOfflineMachineIds(): Promise<Map<string, { lastSeen: string | null; ageHours: number }>> {
  try {
    const companyId = await ensureDefaultCompany();
    const supabase = createServerClient();
    const { data } = await supabase
      .from("machines")
      .select("id, nayax_device_id, status, last_sync_at")
      .eq("company_id", companyId)
      .eq("status", "offline");

    const out = new Map<string, { lastSeen: string | null; ageHours: number }>();
    if (!data?.length) return out;

    // Pull latest machine_inventory.updated_at for these machines for an
    // accurate "ageHours" figure.
    const { data: invRows } = await supabase
      .from("machine_inventory")
      .select("machine_id, updated_at")
      .in("machine_id", data.map((m) => m.id as string))
      .order("updated_at", { ascending: false });

    const latestByMachine = new Map<string, string>();
    for (const r of invRows || []) {
      const mid = r.machine_id as string;
      if (!latestByMachine.has(mid)) latestByMachine.set(mid, r.updated_at as string);
    }

    const now = Date.now();
    for (const m of data) {
      const deviceId = (m.nayax_device_id as string | null) || "";
      if (!deviceId) continue;
      const lastSeen = latestByMachine.get(m.id as string) || (m.last_sync_at as string | null);
      const ageHours = lastSeen ? (now - new Date(lastSeen).getTime()) / 3600000 : 999;
      out.set(deviceId, { lastSeen, ageHours });
    }
    return out;
  } catch {
    return new Map();
  }
}
