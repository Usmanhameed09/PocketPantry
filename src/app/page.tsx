"use client";

import { useState, useEffect, useRef } from "react";
import Header from "@/components/Header";
import { timeET } from "@/lib/format-et";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRouter } from "next/navigation";
import {
  Truck,
  PackageX,
  DollarSign,
  MapPin,
  WifiOff,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Bot,
  RefreshCw,
} from "lucide-react";

/* ────── Types ────── */
type TilesData = {
  sales: {
    todayRevenue: number; todayUnits: number; todayTransactions: number;
    yesterdayRevenue: number; wowPct: number; avgSale: number;
    thisWeekUnits: number; priorWeekUnits: number; weekWoWPct: number;
    lastSaleDate: string | null; lastDayRevenue: number; todayHasData: boolean;
    liveDataAt: string | null;
  };
  machines: { total: number; active: number; offline: number; offlineList: Array<{ name: string; status: string }>; };
  alerts: { total: number; high: number; topAlerts: Array<{ message: string; severity: string; kind: string }>; };
  warehouse: { value: number; itemsBelowThreshold: number };
};
type SectionsData = {
  refillStops: Array<{ machine: string; items: number; color: string }>;
  refillTrackingActive?: boolean;
  restock: { cost: number; buyListItems: number };
  priceChanges: Array<{ product: string; suggestedPrice: number; cost: number }>;
  recentReply: { from: string; summary: string; intent: string; receivedAt: string } | null;
};
// Combined view used by the existing render path. Built from tiles + sections
// as each arrives — render whatever fields we have, leave the rest as
// loading skeletons.
type DashboardData = TilesData & {
  refillStops: SectionsData["refillStops"];
  warehouse: TilesData["warehouse"] & { restockCost: number; buyListItems: number };
  priceChanges: SectionsData["priceChanges"];
  recentReply: SectionsData["recentReply"];
  generatedAt: string;
};

/* ────── Style helpers ────── */
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
  boxShadow: "0 2px 6px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  display: "flex", flexDirection: "column", overflow: "hidden",
};
const cardHeader: React.CSSProperties = { padding: "20px 22px 12px", display: "flex", alignItems: "center", gap: 14 };
const cardBody: React.CSSProperties = { padding: "0 22px", flex: 1 };
const cardFooter: React.CSSProperties = { padding: "16px 22px 20px" };
const iconBox = (bg: string): React.CSSProperties => ({
  width: 42, height: 42, borderRadius: 12, background: bg,
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
});
const btnBase: React.CSSProperties = {
  width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
  fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: 0.2,
};
const greenBtn: React.CSSProperties = { ...btnBase, background: "#059669", color: "#fff" };
const blueBtn: React.CSSProperties = { ...btnBase, background: "#16a34a", color: "#fff" };
const redBtn: React.CSSProperties = { ...btnBase, background: "#dc2626", color: "#fff" };
const listRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", background: "#f1f5f9", borderRadius: 10,
};
const badge = (bg: string, color: string): React.CSSProperties => ({
  fontSize: 11, fontWeight: 600, background: bg, color, padding: "3px 9px",
  borderRadius: 20, whiteSpace: "nowrap",
});

export default function Dashboard() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const router = useRouter();
  // Progressive load: fetch the top tiles and the lower sections in parallel
  // from two separate endpoints. The top tiles return in ~600ms; sections
  // can take 3-5s (buy list compute + pricing analyses). UI renders each
  // half as soon as its fetch resolves.
  const [tiles, setTiles] = useState<TilesData | null>(null);
  const [sections, setSections] = useState<SectionsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  // Flash the revenue when it changes after a sync, so the operator SEES it
  // update live (128 → 168) instead of wondering if the number is stale.
  const [revFlash, setRevFlash] = useState(false);
  const prevRevRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Parse a response as JSON defensively. On a function timeout Vercel
    // returns a plain-text "An error occurred…" page, not JSON — calling
    // res.json() on that throws "Unexpected token 'A'". Read text first and
    // only parse if it actually looks like JSON.
    async function readJson(res: Response): Promise<Record<string, unknown> | null> {
      const text = await res.text();
      const trimmed = text.trimStart();
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
      try { return JSON.parse(text); } catch { return null; }
    }

    // Load tiles with one automatic retry — a transient 504 shouldn't show a
    // scary error if the next attempt succeeds.
    async function loadTiles(attempt = 0): Promise<void> {
      try {
        const res = await fetch("/api/dashboard/today/tiles", { cache: "no-store" });
        const json = await readJson(res);
        if (cancelled) return;
        if (!json || json.success !== true) {
          if (attempt < 1) return loadTiles(attempt + 1);
          setError((json && (json.error as string)) || "The dashboard timed out. Refresh to try again.");
          return;
        }
        setTiles(json as unknown as TilesData);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 1) return loadTiles(attempt + 1);
        setError(err instanceof Error ? err.message : "Failed");
      }
    }
    void loadTiles();

    fetch("/api/dashboard/today/sections", { cache: "no-store" })
      .then((r) => readJson(r))
      .then((json) => {
        if (cancelled || !json || json.success !== true) return; // sections failure is non-fatal
        setSections(json as unknown as SectionsData);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Keep the numbers CURRENT. The sales data only updates when the Nayax+HAHA
  // sync runs, and nothing schedules it — so the dashboard runs it itself when
  // you open the page (throttled to once / 8 min), then re-pulls the tiles so
  // "today" reflects the real running total instead of a stale, low number.
  const reloadData = async () => {
    const readJson = async (res: Response): Promise<Record<string, unknown> | null> => {
      const t = await res.text();
      const x = t.trimStart();
      if (!x.startsWith("{") && !x.startsWith("[")) return null;
      try { return JSON.parse(t); } catch { return null; }
    };
    try {
      const r = await fetch("/api/dashboard/today/tiles?fresh=1", { cache: "no-store" });
      const j = await readJson(r);
      if (j && j.success === true) setTiles(j as unknown as TilesData);
    } catch { /* ignore */ }
    try {
      const r = await fetch("/api/dashboard/today/sections?fresh=1", { cache: "no-store" });
      const j = await readJson(r);
      if (j && j.success === true) setSections(j as unknown as SectionsData);
    } catch { /* ignore */ }
  };

  // mount  = page opened / browser-refreshed → ALWAYS pull latest (operator
  //          expectation: a reload means "give me the newest number now")
  // manual = Refresh button → ALWAYS pull latest + the deeper background sync
  // tick   = 90s background timer → debounced so ticks don't stack
  const triggerSync = async (mode: "mount" | "manual" | "tick") => {
    if (syncing) return;

    let last = 0;
    try { last = Number(localStorage.getItem("dashLastSync") || "0"); } catch { /* ignore */ }
    if (mode === "tick" && Date.now() - last < 20 * 1000) {
      await reloadData(); // still re-read stored numbers on a debounced tick
      return;
    }

    // Start the LIVE sync THE INSTANT the page opens — indicator on and the
    // request in flight before anything else. Two reasons:
    //   1. The operator sees "syncing" immediately, so they know to wait a
    //      moment for live numbers (no silent stale window).
    //   2. keepalive means even if they navigate away a second later, the
    //      request still completes and the DB gets the fresh data — so other
    //      pages show correct numbers too. Nothing is lost by leaving early.
    setSyncing(true);
    const livePull = fetch("/api/inventory/sync?scope=today", { method: "POST", keepalive: true });

    // Load the current stored numbers IN PARALLEL (never delays the sync).
    void reloadData();

    try {
      const res = await livePull;
      const j = await res.json().catch(() => ({} as { changed?: boolean }));
      try { localStorage.setItem("dashLastSync", String(Date.now())); } catch { /* ignore */ }
      if (j && j.changed === false) {
        // Checked the machines — nothing new. Say so explicitly (instead of
        // silently re-showing the same number) and skip the re-read.
        setSyncedAt(`${timeET()} — no new sales`);
      } else {
        setSyncedAt(timeET());
        await reloadData();
      }
    } catch { /* sync best-effort */ } finally {
      setSyncing(false);
    }

    // Deeper pull (refill/machine-inventory + HAHA history) in the background,
    // no spinner. Runs AFTER the live pull (never concurrently — parallel
    // requests contend on the scraper and stretched the live pull to 40-50s).
    let lastDeep = 0;
    try { lastDeep = Number(localStorage.getItem("dashLastDeep") || "0"); } catch { /* ignore */ }
    if (mode === "manual" || Date.now() - lastDeep > 8 * 60 * 1000) {
      try { localStorage.setItem("dashLastDeep", String(Date.now())); } catch { /* ignore */ }
      void fetch("/api/inventory/sync?scope=fast", { method: "POST" })
        .then(() => fetch("/api/inventory/sync?scope=chinese", { method: "POST" }))
        .then(() => reloadData())
        .catch(() => { /* best-effort */ });
    }
  };

  // Auto-refresh: keep today's revenue live while the page is open — a light
  // scope=today pull every 90s (only when the tab is visible). The operator
  // rarely needs to click Refresh; the number updates on its own.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void triggerSync("tick");
      }
    }, 90 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flash the revenue tile whenever the number actually changes after a pull,
  // so a live update (128 → 168) is visibly obvious, not silent.
  useEffect(() => {
    if (!tiles) return;
    const s = tiles.sales;
    const rev = (s.liveDataAt || s.todayHasData) ? s.todayRevenue : s.lastDayRevenue;
    const prev = prevRevRef.current;
    prevRevRef.current = rev;
    if (prev !== null && prev !== rev) {
      setRevFlash(true);
      const t = setTimeout(() => setRevFlash(false), 1600);
      return () => clearTimeout(t);
    }
  }, [tiles]);

  // Auto-sync on every open / browser refresh — always pulls the latest.
  useEffect(() => { void triggerSync("mount"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Progressive render: never block the WHOLE page on data. Use empty
  // placeholder values until each fetch lands; the per-tile/per-section
  // render code already handles "no data yet" gracefully with its
  // existing fallbacks. The layout paints in <100ms; tiles fill in as
  // /tiles arrives (~1s); the lower sections fill in when /sections
  // arrives (~3-12s on cold cache).
  const tilesLoading = tiles === null;
  const sectionsLoading = sections === null;

  const data: DashboardData = {
    generatedAt: new Date().toISOString(),
    sales: tiles?.sales ?? {
      todayRevenue: 0, todayUnits: 0, todayTransactions: 0,
      yesterdayRevenue: 0, wowPct: 0, avgSale: 0,
      thisWeekUnits: 0, priorWeekUnits: 0, weekWoWPct: 0,
      lastSaleDate: null, lastDayRevenue: 0, todayHasData: false, liveDataAt: null,
    },
    machines: tiles?.machines ?? { total: 0, active: 0, offline: 0, offlineList: [] },
    alerts: tiles?.alerts ?? { total: 0, high: 0, topAlerts: [] },
    warehouse: {
      value: tiles?.warehouse.value ?? 0,
      itemsBelowThreshold: tiles?.warehouse.itemsBelowThreshold ?? 0,
      restockCost: sections?.restock.cost ?? 0,
      buyListItems: sections?.restock.buyListItems ?? 0,
    },
    refillStops: sections?.refillStops ?? [],
    priceChanges: sections?.priceChanges ?? [],
    recentReply: sections?.recentReply ?? null,
  };

  if (error && tilesLoading) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Today" />
        <div style={{ padding: 40 }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 20, color: "#dc2626" }}>
            Could not load dashboard data: {error}
          </div>
        </div>
      </div>
    );
  }

  const { sales, machines, alerts, refillStops, warehouse, priceChanges, recentReply } = data;
  // Helper: render placeholder text for a number while tiles is loading.
  const numOrSkel = (val: string) => tilesLoading ? "—" : val;
  // Revenue to display: live today (matches Nayax), else today's synced number,
  // else the most recent synced day's actual revenue (never a misleading $0).
  const displayRevenue = (sales.liveDataAt || sales.todayHasData)
    ? sales.todayRevenue
    : sales.lastDayRevenue;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Today" />

      {/* ─── Freshness bar: shows when sales last refreshed + manual refresh ─── */}
      <div style={{ padding: isMobile ? "12px 16px 0" : "20px 32px 0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
        {syncing ? (
          // Prominent, unmistakable — so a new operator never reads the numbers
          // below as final while a live pull is still in progress.
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontSize: 12.5, fontWeight: 600, color: "#92400e",
            background: "#fef3c7", border: "1px solid #fcd34d",
            padding: "6px 13px", borderRadius: 999,
          }}>
            <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
            Updating live sales from machines… numbers below aren&apos;t final yet
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {syncedAt ? (
              <>
                <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#16a34a", marginRight: 6 }} />
                Live · synced {syncedAt}
              </>
            ) : "Sales as of last sync"}
          </span>
        )}
        <button
          onClick={() => void triggerSync("manual")}
          disabled={syncing}
          title="Pull the latest Nayax + HAHA sales now"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px", fontSize: 12, fontWeight: 600,
            border: "1px solid #cbd5e1", borderRadius: 8,
            background: syncing ? "#f1f5f9" : "#fff", color: syncing ? "#94a3b8" : "#0f172a",
            cursor: syncing ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={13} style={syncing ? { animation: "spin 1s linear infinite" } : undefined} />
          {syncing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {/* ─── Quick Stats (real numbers) ─── */}
      <div style={{ padding: isMobile ? "16px 16px 0" : "24px 32px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16 }}>
          <StatCard
            icon={<TrendingUp size={20} color="#16a34a" />} iconBg="#dcfce7"
            onClick={() => router.push("/reports")}
            label={
              syncing
                ? "Today's Revenue · syncing"
                : sales.liveDataAt
                  ? "Today's Revenue · LIVE"
                  : sales.todayHasData ? "Today's Revenue" : `Last data ${sales.lastSaleDate || "—"}`
            }
            // While a sync is in flight the shown figure is provisional — dim it
            // so it doesn't read as the final number; flash green when it updates.
            valueMuted={syncing}
            flash={revFlash}
            value={numOrSkel(`$${displayRevenue.toFixed(2)}`)}
            tag={tilesLoading
              ? <span style={{ color: "#94a3b8", fontSize: 12 }}>loading…</span>
              : syncing
                ? <span style={{ color: "#b45309", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> pulling latest sales…
                  </span>
                : <span style={{ color: "#64748b", fontSize: 12 }}>Yesterday: ${sales.yesterdayRevenue.toFixed(2)}</span>
            }
          />
          <StatCard
            icon={<CheckCircle2 size={20} color="#059669" />} iconBg="#dcfce7"
            onClick={() => router.push("/machines")}
            label="Machines Active"
            value={numOrSkel(`${machines.active} / ${machines.total}`)}
            tag={tilesLoading
              ? <span style={{ color: "#94a3b8", fontSize: 12 }}>loading…</span>
              : machines.offline > 0
                ? <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>{machines.offline} offline</span>
                : <span style={{ color: "#059669", fontSize: 12, fontWeight: 500 }}>all healthy</span>
            }
          />
          <StatCard
            icon={<AlertTriangle size={20} color="#d97706" />} iconBg="#fef3c7"
            onClick={() => router.push("/inventory/alerts")}
            label="Open Alerts"
            value={numOrSkel(String(alerts.total))}
            tag={tilesLoading
              ? <span style={{ color: "#94a3b8", fontSize: 12 }}>loading…</span>
              : alerts.high > 0
                ? <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>{alerts.high} high severity</span>
                : <span style={{ color: "#64748b", fontSize: 12, fontWeight: 500 }}>nothing critical</span>
            }
          />
          <StatCard
            icon={<DollarSign size={20} color="#6366f1" />} iconBg="#ede9fe"
            onClick={() => router.push("/inventory/warehouse")}
            label="Warehouse Value"
            value={numOrSkel(`$${warehouse.value.toFixed(2)}`)}
            tag={<span style={{ color: "#64748b", fontSize: 12 }}>
              {tilesLoading ? "loading…" : `${warehouse.itemsBelowThreshold} items low`}
            </span>}
          />
        </div>
      </div>

      {/* ─── Main Cards ─── */}
      <div style={{ padding: isMobile ? 16 : "24px 32px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 16 : 20 }}>

          {/* Card 1: Refill Stops */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#16a34a")}><Truck size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Today&apos;s Refill Stops</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  {sectionsLoading ? (
                    <span>loading…</span>
                  ) : sections?.refillTrackingActive === false ? (
                    <span>Refill tracking not set up</span>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600, color: "#16a34a" }}>{refillStops.length}</span> machine{refillStops.length === 1 ? "" : "s"} need refill
                      {refillStops.length > 0 && (
                        <span style={{ marginLeft: 6, color: "#94a3b8" }}>
                          · {refillStops.reduce((s, r) => s + r.items, 0)} low items total
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div style={cardBody}>
              {sectionsLoading ? (
                <EmptyHint message="Loading refill stops…" />
              ) : sections?.refillTrackingActive === false ? (
                <EmptyHint message="Refill tracking isn't set up yet. Log a refill on the Refill page (enter how many of each product you load into a machine) and low-stock alerts will show here based on real remaining stock." />
              ) : refillStops.length === 0 ? (
                <EmptyHint message="All machines stocked — no refills needed yet" />
              ) : (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 8,
                  maxHeight: 280, overflowY: "auto", paddingRight: 4,
                }}>
                  {refillStops.map((s, i) => (
                    <div key={i} style={listRow}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.machine}</div>
                      </div>
                      <span style={badge("#fff", "#4b5563")}>{s.items} low items</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={cardFooter}><button style={greenBtn} onClick={() => router.push("/inventory")}>View Inventory</button></div>
          </div>

          {/* Card 2: Low Inventory Alert */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#d97706")}><PackageX size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Warehouse Restock</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Buy-list summary</div>
              </div>
            </div>
            <div style={cardBody}>
              {sectionsLoading ? (
                <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader2 size={14} color="#64748b" style={{ animation: "spin 1s linear infinite" }} />
                  <div style={{ fontSize: 12, color: "#64748b" }}>Computing buy list…</div>
                </div>
              ) : warehouse.buyListItems > 0 ? (
                <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>Order Recommended</div>
                  <div style={{ fontSize: 12, color: "#b45309", marginTop: 4 }}>
                    {warehouse.buyListItems} products across active vendors
                  </div>
                </div>
              ) : (
                <EmptyHint message="No restock needed — stock is healthy" />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <InfoRow label="Warehouse Value" value={`$${warehouse.value.toFixed(2)}`} />
                <InfoRow label="Items Below Threshold" value={`${warehouse.itemsBelowThreshold} products`} valueColor={warehouse.itemsBelowThreshold > 0 ? "#d97706" : "#059669"} />
                <InfoRow label="Estimated Restock Cost" value={sectionsLoading ? "…" : `$${warehouse.restockCost.toFixed(2)}`} />
              </div>
            </div>
            <div style={cardFooter}><button style={greenBtn} onClick={() => router.push("/inventory/buy-list")}>Open Buy List</button></div>
          </div>

          {/* Card 3: Price Change Review */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#059669")}><DollarSign size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Price Change Review</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  <span style={{ fontWeight: 600, color: "#16a34a" }}>{priceChanges.length}</span> suggested
                </div>
              </div>
            </div>
            <div style={cardBody}>
              {sectionsLoading ? (
                <EmptyHint message="Loading price suggestions…" />
              ) : priceChanges.length === 0 ? (
                <EmptyHint message="No pending price changes — margins are healthy" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {priceChanges.map((p, i) => (
                    <div key={i} style={listRow}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.product}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>cost ${p.cost.toFixed(2)} → suggest ${p.suggestedPrice.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={cardFooter}><button style={blueBtn} onClick={() => router.push("/pricing")}>Review Pricing</button></div>
          </div>

          {/* Card 4: New Reply (recent email) */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#eab308")}><MapPin size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Recent Lead Reply</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  {recentReply ? "1 new response" : "No new replies"}
                </div>
              </div>
            </div>
            <div style={cardBody}>
              {recentReply ? (
                <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#eab308", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                      {(recentReply.from || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recentReply.from}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{new Date(recentReply.receivedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}</div>
                    </div>
                  </div>
                  {recentReply.intent && (
                    <div style={{ fontSize: 13, color: "#a16207", fontWeight: 600, marginBottom: 4 }}>{recentReply.intent}</div>
                  )}
                  {recentReply.summary && (
                    <div style={{ fontSize: 12, color: "#475569" }}>{recentReply.summary.slice(0, 120)}</div>
                  )}
                </div>
              ) : (
                <EmptyHint message="Inbox is quiet — no new lead replies" />
              )}
            </div>
            <div style={cardFooter}><button style={greenBtn} onClick={() => router.push("/pipeline")}>Open Pipeline</button></div>
          </div>

          {/* Card 5: Machine Alerts */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#dc2626")}><WifiOff size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Machine Alerts</div>
                <div style={{ fontSize: 12, color: machines.offline > 0 ? "#dc2626" : "#64748b", fontWeight: 500, marginTop: 2 }}>
                  {machines.offline > 0 ? `${machines.offline} need attention` : "All machines healthy"}
                </div>
              </div>
            </div>
            <div style={cardBody}>
              {machines.offline === 0 ? (
                <EmptyHint message="No offline machines — all sending data" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {machines.offlineList.map((m, i) => (
                    <div key={i} style={{ padding: "14px 16px", borderRadius: 10, background: "#fee2e2", border: "1px solid #fecaca" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", animation: "pulse 2s infinite" }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{m.name}</span>
                        </div>
                        <span style={badge("#fee2e2", "#dc2626")}>{m.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", paddingLeft: 16 }}>No data for &gt;24 hours</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={cardFooter}><button style={machines.offline > 0 ? redBtn : greenBtn} onClick={() => router.push("/machines")}>Check Machines</button></div>
          </div>

          {/* Card 6: Sales Summary */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#059669")}><TrendingUp size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Sales Summary</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Today&apos;s performance</div>
              </div>
            </div>
            <div style={cardBody}>
              <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                  {sales.liveDataAt ? "Today's Revenue · LIVE" : sales.todayHasData ? "Today's Revenue" : `Most recent day with data${sales.lastSaleDate ? ` — ${sales.lastSaleDate}` : ""}`}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#0f172a", letterSpacing: -1 }}>${displayRevenue.toFixed(2)}</div>
                {/* Show yesterday's actual sales (fully synced, accurate) rather
                    than a % delta that's misleading before today syncs. */}
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Yesterday: <span style={{ fontWeight: 600 }}>${sales.yesterdayRevenue.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <MiniStat label="Transactions" value={String(sales.todayTransactions)} />
                <MiniStat label="Avg. Sale" value={`$${sales.avgSale.toFixed(2)}`} />
                <MiniStat label="Units sold today" value={String(sales.todayUnits)} />
                <MiniStat label="Week vs prior" value={`${sales.weekWoWPct >= 0 ? "+" : ""}${sales.weekWoWPct}%`} positive={sales.weekWoWPct >= 0} />
              </div>
            </div>
            <div style={cardFooter}><button style={greenBtn} onClick={() => router.push("/inventory/assistant")}><Bot size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Ask AI for insights</button></div>
          </div>

        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes spin { to { transform: rotate(360deg); } } @keyframes revflash { 0% { background: #bbf7d0; } 100% { background: transparent; } }`}</style>
    </div>
  );
}

/* ────── Small components ────── */

function StatCard({ icon, iconBg, label, value, tag, onClick, valueMuted, flash }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; tag: React.ReactNode;
  onClick?: () => void; valueMuted?: boolean; flash?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
        padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
        boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.1s",
      }}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.borderColor = "#16a34a"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(22,163,74,0.15)"; } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.borderColor = "#d5d9e2"; e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.06)"; } : undefined}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{
          fontSize: 22, fontWeight: 800, lineHeight: 1.1,
          color: flash ? "#16a34a" : valueMuted ? "#94a3b8" : "#0f172a",
          opacity: valueMuted && !flash ? 0.7 : 1,
          transition: "color .25s ease",
          borderRadius: 8,
          animation: flash ? "revflash 1.4s ease-out" : undefined,
          display: "inline-block", padding: flash ? "1px 6px" : undefined, margin: flash ? "-1px -6px" : undefined,
        }}>{value}</div>
        <div style={{ marginTop: 2 }}>{tag}</div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor || "#111827" }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, positive }: {
  label: string; value: string; positive?: boolean;
}) {
  return (
    <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: positive === false ? "#dc2626" : positive === true ? "#059669" : "#0f172a" }}>{value}</div>
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div style={{
      padding: "20px 14px", textAlign: "center", color: "#94a3b8",
      fontSize: 13, background: "#f8fafc", borderRadius: 10, border: "1px dashed #d5d9e2",
    }}>
      {message}
    </div>
  );
}
