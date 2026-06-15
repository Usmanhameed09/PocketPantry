/**
 * Offline-machine status from the SCRAPER (via /api/machines) — the same source
 * the Today tile and the Machines page use.
 *
 * Why not read machines.status from Supabase? The offline detector marks a
 * machine stale from the SYNC timestamp (machine_inventory.updated_at), which
 * the sync refreshes every run even for a dead device — so the DB column can
 * say "healthy" for a machine that's actually offline. The scraper tracks real
 * last-activity, so it's the correct source. Using this everywhere keeps the
 * AI assistant consistent with the dashboards (which kept saying "no machines
 * offline" while a machine was down).
 */

export async function getOfflineMachines(): Promise<{ total: number; offline: string[] }> {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || "https://pocketpantry.vercel.app";
    const res = await fetch(`${base}/api/machines`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { total: 0, offline: [] };
    const data = await res.json();
    const machines = (data.machines || []) as Array<{ name?: string; status?: string }>;
    const offline = machines
      .filter((m) => (m.status || "").toLowerCase() === "offline")
      .map((m) => m.name || "(unknown)");
    return { total: machines.length, offline };
  } catch {
    return { total: 0, offline: [] };
  }
}
