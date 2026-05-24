import { NextResponse } from "next/server";
import { readEnv } from "@/lib/runtime-env";
import { createServerClient } from "@/lib/supabase";
import { ensureDefaultCompany } from "@/lib/inventory-store";

const scraperUrl = () => readEnv("SCRAPER_API_URL") || "http://localhost:8000";
const apiKey = () => readEnv("SCRAPER_BACKEND_KEY");

export const dynamic = "force-dynamic";

/**
 * Lists machines from the scraper-api (Nayax + Chinese) but overlays our
 * DB-side status. We mark machines "Offline" when machine_inventory hasn't
 * received any update for >24h, since neither Nayax nor the Chinese platform
 * gives us a reliable unplugged signal directly.
 */
export async function GET() {
  try {
    const res = await fetch(`${scraperUrl()}/api/machines`, {
      headers: { ...(apiKey() ? { "x-api-key": apiKey() } : {}) },
    });
    const data = await res.json();

    // Build a lookup of DB-side offline machines (by nayax_device_id)
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
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { success: false, machines: [], total: 0, error: "Failed to fetch machines" },
      { status: 502 }
    );
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
