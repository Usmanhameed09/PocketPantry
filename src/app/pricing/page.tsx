"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Search,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Clock,
  Check,
  X,
  RefreshCw,
  ExternalLink,
  Loader2,
  Settings,
  Save,
  ChevronDown,
  ChevronRight,
  Package,
  Zap,
  Store,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PriceStatus = "Cost Margin" | "Pending Approval" | "Seasonal Price" | "Approved";
type Tab = "Price Adjustments" | "Rules" | "Alerts";
type FilterType = "All" | "Pending Approval" | "Seasonal" | "Cost Change";

interface PricingItem {
  id: string;
  productRefId?: string;
  product: string;
  scrapedProduct?: string | null;
  supplier: string;
  cost: number;
  prevCost: number;
  currentPrice: number;
  suggestedPrice: number;
  margin: number;
  status: PriceStatus;
  trigger: string;
  sourceUrl?: string;
  packPrice?: number | null;
  packSize?: number | null;
  scraped?: boolean;
  allPrices?: {
    supplier: string;
    packPrice: number;
    packSize: number | null;
    unitPrice: number | null;
    name: string;
    url: string;
  }[];
  machineCount?: number;
  unitsSold?: number;
  platform?: string;
  lastSoldAt?: string | null;
  category?: "beverage" | "snack";
  isManualOnly?: boolean;
  error?: string | null;
  lastScrapedAt?: string | null;
  firstFillCost?: number | null;
  firstFillSupplier?: string | null;
  firstFillPackSize?: number | null;
}

type PricingApiResponse = {
  success: boolean;
  data?: PricingItem[];
  meta?: { scraped: number; failed: number };
  error?: string;
};

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const statusStyles: Record<PriceStatus, { color: string; bg: string; border: string; label: string }> = {
  "Cost Margin":      { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", label: "Healthy" },
  "Pending Approval": { color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "Needs Review" },
  "Seasonal Price":   { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", label: "Seasonal" },
  "Approved":         { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", label: "Approved" },
};

const tabConfig: Record<Tab, { label: string; icon: typeof DollarSign }> = {
  "Price Adjustments": { label: "Price Review", icon: DollarSign },
  Rules: { label: "Profit Targets", icon: Settings },
  Alerts: { label: "Updates", icon: Zap },
};

const filterLabels: Record<FilterType, string> = {
  All: "All",
  "Pending Approval": "Needs Review",
  Seasonal: "Seasonal",
  "Cost Change": "Cost Moved",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [activeTab, setActiveTab] = useState<Tab>("Price Adjustments");
  const [filterType, setFilterType] = useState<FilterType>("All");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PricingItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<{ completed: number; total: number } | null>(null);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [lastScraped, setLastScraped] = useState<string | null>(null);
  const [scrapeStats, setScrapeStats] = useState<{ scraped: number; failed: number } | null>(null);
  const [margins, setMargins] = useState<Record<string, number>>({ beverage: 50, snack: 45 });
  const [editMargins, setEditMargins] = useState<Record<string, number>>({ beverage: 50, snack: 45 });
  const [savingMargin, setSavingMargin] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [savingPrices, setSavingPrices] = useState<Record<string, boolean>>({});
  const [savingDecisions, setSavingDecisions] = useState<Record<string, boolean>>({});
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function syncPriceDrafts(nextItems: PricingItem[]) {
    setCostDrafts(
      Object.fromEntries(
        nextItems.map((item) => [item.productRefId || item.id, item.cost.toFixed(2)])
      )
    );
  }

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch("/api/pricing/catalog");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setItems(data.data);
        syncPriceDrafts(data.data);
        setCatalogError(null);
        return;
      }
      setCatalogError(data.error || "Failed to load live machine products");
    } catch {
      setCatalogError("Failed to load live machine products");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/pricing/margins")
      .then((r) => r.json())
      .then((d) => { if (d.margins) { setMargins(d.margins); setEditMargins(d.margins); } })
      .catch(() => {});
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Listen for the PocketPantry browser extension. The extension's content
  // script broadcasts a "ready" message on every page load. If we hear it,
  // we show the "Scrape via Extension" button; otherwise we show install help.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const msg = event.data;
      if (msg && msg.source === "pp-extension" && msg.type === "ready") {
        setExtensionDetected(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function handleMarginSave(category: string) {
    setSavingMargin(true);
    try {
      const pct = editMargins[category];
      await fetch("/api/pricing/margins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, margin: pct / 100 }),
      });
      setMargins((prev) => ({ ...prev, [category]: pct }));
    } catch {}
    setSavingMargin(false);
  }

  async function handleApprove(item: PricingItem) {
    setSavingDecisions((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch("/api/pricing/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: item.id, productId: item.productRefId, decision: "approve",
          currentPrice: item.currentPrice, suggestedPrice: item.suggestedPrice,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems((prev) => prev.map((p) => p.id === item.id
        ? { ...p, status: "Approved" as PriceStatus, currentPrice: p.suggestedPrice, trigger: "Approved price update" } : p
      ));
      setScrapeError(null);
    } catch (error) {
      console.error(error);
      setScrapeError(error instanceof Error ? error.message : "Failed to apply price update");
    } finally {
      setSavingDecisions((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  async function handleReject(item: PricingItem) {
    setSavingDecisions((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch("/api/pricing/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: item.id, productId: item.productRefId, decision: "reject",
          currentPrice: item.currentPrice, suggestedPrice: item.suggestedPrice,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems((prev) => prev.map((p) => p.id === item.id
        ? { ...p, status: "Cost Margin" as PriceStatus, suggestedPrice: p.currentPrice, trigger: "Price change rejected" } : p
      ));
      setScrapeError(null);
    } catch (error) {
      console.error(error);
      setScrapeError(error instanceof Error ? error.message : "Failed to dismiss price recommendation");
    } finally {
      setSavingDecisions((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  function handleDraftCostChange(key: string, value: string) {
    setCostDrafts((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSavePricing(item: PricingItem) {
    const key = item.productRefId || item.id;
    const nextValue = Number(costDrafts[key]);
    if (!Number.isFinite(nextValue) || nextValue < 0 || !item.productRefId) return;
    setSavingPrices((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/pricing/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.productRefId, lastKnownCost: nextValue }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, cost: nextValue, prevCost: nextValue } : row));
    } catch (error) { console.error(error); }
    finally { setSavingPrices((prev) => ({ ...prev, [key]: false })); }
  }

  async function runScrape(endpoint: string) {
    setScraping(true);
    setScrapeStats(null);
    setScrapeError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const json: PricingApiResponse = await res.json();
      if (Array.isArray(json.data)) {
        const mapped: PricingItem[] = json.data.map((r) => ({
          id: r.id, product: r.product, scrapedProduct: r.scrapedProduct ?? null, supplier: r.supplier,
          cost: r.cost, prevCost: r.prevCost, currentPrice: r.currentPrice,
          suggestedPrice: r.suggestedPrice, margin: r.margin,
          status: r.status as PriceStatus, trigger: r.trigger,
          sourceUrl: r.sourceUrl, packPrice: r.packPrice, packSize: r.packSize,
          scraped: r.scraped, allPrices: r.allPrices,
          machineCount: r.machineCount, unitsSold: r.unitsSold,
          platform: r.platform, lastSoldAt: r.lastSoldAt, category: r.category,
          error: r.error ?? null, lastScrapedAt: r.lastScrapedAt ?? null,
          firstFillCost: r.firstFillCost ?? null,
          firstFillSupplier: r.firstFillSupplier ?? null,
          firstFillPackSize: r.firstFillPackSize ?? null,
        }));
        setItems(mapped);
        syncPriceDrafts(mapped);
        setLastScraped(new Date().toLocaleTimeString());
        setScrapeStats({ scraped: json.meta?.scraped ?? 0, failed: json.meta?.failed ?? 0 });
      }
      if (!res.ok || !json.success) { setScrapeError(json.error || "Failed to scrape supplier prices"); return; }
      if (json.error) setScrapeError(json.error);
    } catch { setScrapeError("Failed to scrape supplier prices"); }
    finally { setScraping(false); }
  }

  async function handleScrape() {
    return runScrape("/api/pricing/scrape");
  }

  // ============ Extension-based scrape ============

  async function handleExtensionScrape() {
    if (!extensionDetected) {
      setScrapeError(
        "PocketPantry browser extension not detected. Install it once (Settings → instructions) to enable free scraping from your own session."
      );
      return;
    }

    setScraping(true);
    setScrapeError(null);
    setScrapeStats(null);
    setScrapeProgress({ completed: 0, total: items.length });

    // 1. Build payload from current catalog
    const products = items.map((it) => ({
      id: it.id,
      name: it.product,
      search_term: it.scrapedProduct || it.product,
      vending_price: it.currentPrice,
      last_known_cost: it.cost,
      expected_pack_size: it.packSize ?? null,
      category: it.category || "snack",
    }));

    const requestId = `pp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 2. Listen for progress/completion messages from the extension
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== window) return;
      const msg = event.data;
      if (!msg || msg.source !== "pp-extension") return;
      if (msg.requestId && msg.requestId !== requestId) return;

      if (msg.type === "scrape-progress") {
        setScrapeProgress({ completed: msg.completed || 0, total: msg.total || products.length });
      } else if (msg.type === "scrape-error") {
        cleanup();
        setScrapeError(msg.error || "Extension scrape failed");
        setScraping(false);
      } else if (msg.type === "scrape-complete") {
        cleanup();
        await persistExtensionResults(msg.results || []);
      }
    };

    function cleanup() {
      window.removeEventListener("message", onMessage);
      setScrapeProgress(null);
    }

    window.addEventListener("message", onMessage);

    // 3. Kick off the scrape in the extension
    window.postMessage(
      {
        source: "pp-dashboard",
        type: "scrape-request",
        requestId,
        products,
      },
      "*"
    );
  }

  async function persistExtensionResults(results: unknown[]) {
    try {
      const res = await fetch("/api/pricing/scrape-extension-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
      const json: PricingApiResponse = await res.json();
      if (Array.isArray(json.data)) {
        const mapped: PricingItem[] = json.data.map((r) => ({
          id: r.id, product: r.product, scrapedProduct: r.scrapedProduct ?? null, supplier: r.supplier,
          cost: r.cost, prevCost: r.prevCost, currentPrice: r.currentPrice,
          suggestedPrice: r.suggestedPrice, margin: r.margin,
          status: r.status as PriceStatus, trigger: r.trigger,
          sourceUrl: r.sourceUrl, packPrice: r.packPrice, packSize: r.packSize,
          scraped: r.scraped, allPrices: r.allPrices,
          machineCount: r.machineCount, unitsSold: r.unitsSold,
          platform: r.platform, lastSoldAt: r.lastSoldAt, category: r.category,
          error: r.error ?? null, lastScrapedAt: r.lastScrapedAt ?? null,
          firstFillCost: r.firstFillCost ?? null,
          firstFillSupplier: r.firstFillSupplier ?? null,
          firstFillPackSize: r.firstFillPackSize ?? null,
        }));
        setItems(mapped);
        syncPriceDrafts(mapped);
        setLastScraped(new Date().toLocaleTimeString());
        setScrapeStats({ scraped: json.meta?.scraped ?? 0, failed: json.meta?.failed ?? 0 });
      }
      if (!res.ok || !json.success) {
        setScrapeError(json.error || "Failed to save extension results");
      }
    } catch (e) {
      setScrapeError(e instanceof Error ? e.message : "Failed to save extension results");
    } finally {
      setScraping(false);
    }
  }

  type RowUpdate = {
    id: string;
    product: string;
    scrapedProduct: string | null;
    supplier: string;
    cost: number;
    prevCost: number;
    currentPrice: number;
    suggestedPrice: number;
    margin: number;
    status: PriceStatus;
    trigger: string;
    sourceUrl?: string;
    packPrice?: number | null;
    packSize?: number | null;
    scraped: boolean;
    error?: string | null;
    firstFillCost: number | null;
    firstFillSupplier: string | null;
    firstFillPackSize: number | null;
    allPrices?: PricingItem["allPrices"];
    machineCount: number;
    unitsSold: number;
    platform: string;
    lastSoldAt: string | null;
    category: string;
    isManualOnly: boolean;
  };

  // Selenium scrape uses a polling architecture so the UI gets per-product
  // updates instead of waiting on a single long fetch (which Node aborts
  // at ~5 min headers timeout).
  async function handleSeleniumScrape() {
    setScraping(true);
    setScrapeError(null);
    setScrapeStats(null);
    setScrapeProgress({ completed: 0, total: 0 });

    try {
      const startRes = await fetch("/api/pricing/scrape-selenium/start", { method: "POST" });
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.success || !startJson.job_id) {
        setScrapeError(startJson.error || "Failed to start scrape");
        setScraping(false);
        setScrapeProgress(null);
        return;
      }
      const jobId = startJson.job_id as string;
      setScrapeProgress({ completed: 0, total: startJson.total });

      let since = 0;
      let done = false;
      let scrapedCount = 0;
      let failedCount = 0;

      while (!done) {
        await new Promise((r) => setTimeout(r, 3000));
        const sRes = await fetch(`/api/pricing/scrape-selenium/status?job=${jobId}&since=${since}`);
        const sJson = await sRes.json();
        if (!sRes.ok || !sJson.success) {
          setScrapeError(sJson.error || "Poll failed");
          break;
        }
        since = sJson.next_since ?? since;
        setScrapeProgress({ completed: sJson.completed, total: sJson.total });

        const newRows: RowUpdate[] = sJson.rows || [];
        if (newRows.length > 0) {
          for (const r of newRows) {
            if (r.scraped) scrapedCount++;
            else failedCount++;
          }
          // Patch existing rows in the table by id
          setItems((prev) => {
            const byId = new Map(prev.map((p) => [p.id, p]));
            for (const r of newRows) {
              byId.set(r.id, {
                ...byId.get(r.id),
                ...r,
                status: r.status as PriceStatus,
                error: r.error ?? null,
                lastScrapedAt: new Date().toISOString(),
              } as PricingItem);
            }
            return Array.from(byId.values());
          });
        }

        if (sJson.status === "done" || sJson.status === "error") {
          done = true;
          if (sJson.error) setScrapeError(sJson.error);
          setLastScraped(new Date().toLocaleTimeString());
          setScrapeStats({ scraped: scrapedCount, failed: failedCount });
        }
      }
    } catch (e) {
      setScrapeError(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setScraping(false);
      setScrapeProgress(null);
    }
  }

  const filtered = items.filter((p) => {
    const term = search.toLowerCase();
    const matchSearch = search === "" || p.product.toLowerCase().includes(term) || (p.scrapedProduct || "").toLowerCase().includes(term) || p.supplier.toLowerCase().includes(term);
    const matchFilter = filterType === "All"
      || (filterType === "Pending Approval" && p.status === "Pending Approval")
      || (filterType === "Seasonal" && p.status === "Seasonal Price")
      || (filterType === "Cost Change" && p.prevCost !== p.cost);
    return matchSearch && matchFilter;
  });

  const costChanges = items.filter((p) => p.prevCost !== p.cost).length;
  const avgMargin = items.length ? Math.round(items.reduce((s, p) => s + p.margin, 0) / items.length) : 0;
  const pendingCount = items.filter((p) => p.status === "Pending Approval").length;
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <Header title="Pricing" />

      {showInstallHelp && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20,
          }}
          onClick={() => setShowInstallHelp(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16, maxWidth: 540, width: "100%",
              padding: 28, boxShadow: "0 30px 80px rgba(15,23,42,0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                Install PocketPantry Sam&apos;s Club Scraper
              </h2>
              <button
                onClick={() => setShowInstallHelp(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
              ><X size={20} /></button>
            </div>
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 16, lineHeight: 1.6 }}>
              One-time setup. The extension runs Sam&apos;s Club scraping <strong>in your browser</strong> — uses your real residential IP, bypasses bot detection. Zero ongoing cost.
            </p>
            <ol style={{ fontSize: 13, color: "#334155", lineHeight: 1.7, paddingLeft: 18, marginBottom: 16 }}>
              <li>Download the extension folder (ask your developer for the <code style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>chrome-extension/</code> zip).</li>
              <li>Open <code style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>chrome://extensions</code> in Chrome.</li>
              <li>Toggle <strong>Developer mode</strong> on (top-right).</li>
              <li>Click <strong>Load unpacked</strong> and select the extracted <code style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: 4 }}>chrome-extension/</code> folder.</li>
              <li>Refresh this page. The button should change to <em>&quot;Scrape Sam&apos;s (Extension)&quot;</em>.</li>
            </ol>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              Tip: if you log into your Sam&apos;s Club account in any tab before scraping, the extension will pick up member prices automatically.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setShowInstallHelp(false)}
                style={{
                  padding: "10px 18px", borderRadius: 10, background: "#0f172a", color: "#fff",
                  border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >Got it</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>

        {/* Top bar: Tabs + Action */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
          marginBottom: 28, flexWrap: "wrap", gap: isMobile ? 12 : 16, flexDirection: isMobile ? "column" : "row",
        }}>
          {/* Tabs */}
          <div style={{
            display: "flex", gap: 4, padding: 4,
            background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            {(Object.keys(tabConfig) as Tab[]).map((tab) => {
              const cfg = tabConfig[tab];
              const Icon = cfg.icon;
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "10px 18px", fontSize: 13, fontWeight: 600, border: "none",
                    cursor: "pointer", borderRadius: 10, transition: "all 0.2s",
                    background: active ? "#16a34a" : "transparent",
                    color: active ? "#fff" : "#64748b",
                    boxShadow: active ? "0 2px 8px rgba(22,163,74,0.25)" : "none",
                  }}
                >
                  <Icon size={14} />
                  {cfg.label}
                  {tab === "Price Adjustments" && pendingCount > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: active ? "#16a34a" : "#fff",
                      background: active ? "#fff" : "#d97706", borderRadius: 10,
                      padding: "2px 7px", minWidth: 18, textAlign: "center",
                    }}>
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {scrapeProgress && scraping && (
              <span style={{ fontSize: 12, color: "#2563eb", fontWeight: 600 }}>
                Scraping: {scrapeProgress.completed} / {scrapeProgress.total}
              </span>
            )}
            {lastScraped && !scraping && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                Last checked: {lastScraped}
                {scrapeStats && ` (${scrapeStats.scraped} matched${scrapeStats.failed > 0 ? `, ${scrapeStats.failed} failed` : ""})`}
              </span>
            )}
            {extensionDetected ? (
              <button
                onClick={handleExtensionScrape}
                disabled={scraping}
                title="Free — runs in your browser using the PocketPantry extension. Bypasses Akamai by using your real session."
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
                  background: scraping ? "#eef2ff" : "#fff", color: "#6366f1",
                  border: "1px solid #c7d2fe", borderRadius: 12,
                  fontSize: 13, fontWeight: 700, cursor: scraping ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                {scraping
                  ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Scraping {scrapeProgress?.completed ?? 0}/{scrapeProgress?.total ?? items.length}…</>
                  : <><RefreshCw size={15} /> Scrape Sam&apos;s (Extension)</>}
              </button>
            ) : (
              <button
                onClick={() => setShowInstallHelp(true)}
                title="Install the PocketPantry browser extension to enable free Sam's Club scraping from your own session"
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
                  background: "#fff", color: "#64748b",
                  border: "1px dashed #cbd5e1", borderRadius: 12,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <Package size={15} /> Install Free Scraper Extension
              </button>
            )}
            <button
              onClick={handleScrape}
              disabled={scraping}
              title="Multi-source via SerpAPI — uses your monthly quota"
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 22px",
                background: scraping ? "#f0fdf4" : "#16a34a", color: scraping ? "#16a34a" : "#fff",
                border: scraping ? "1px solid #bbf7d0" : "none", borderRadius: 12,
                fontSize: 13, fontWeight: 700, cursor: scraping ? "not-allowed" : "pointer",
                boxShadow: scraping ? "none" : "0 2px 10px rgba(22,163,74,0.3)",
                transition: "all 0.2s",
              }}
            >
              {scraping
                ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Checking prices...</>
                : <><RefreshCw size={15} /> Check Market (SerpAPI)</>}
            </button>
          </div>
        </div>

        {/* ============ TAB: Price Adjustments ============ */}
        {activeTab === "Price Adjustments" && (
          <>
            {/* Stat Cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
              gap: 14, marginBottom: 24,
            }}>
              <StatCard
                icon={<Package size={18} />}
                iconColor="#3b82f6" iconBg="#eff6ff"
                label="Products Tracked"
                value={String(items.length)}
                sub="Live from machine sales"
              />
              <StatCard
                icon={<TrendingUp size={18} />}
                iconColor={avgMargin >= 45 ? "#059669" : "#d97706"}
                iconBg={avgMargin >= 45 ? "#ecfdf5" : "#fffbeb"}
                label="Avg Margin"
                value={`${avgMargin}%`}
                sub={avgMargin >= 45 ? "On target" : "Below target"}
                subColor={avgMargin >= 45 ? "#059669" : "#d97706"}
              />
              <StatCard
                icon={<AlertCircle size={18} />}
                iconColor="#d97706" iconBg="#fffbeb"
                label="Needs Review"
                value={String(pendingCount)}
                sub={pendingCount > 0 ? "Price changes waiting" : "All clear"}
                subColor={pendingCount > 0 ? "#d97706" : "#059669"}
              />
              <StatCard
                icon={<DollarSign size={18} />}
                iconColor="#dc2626" iconBg="#fef2f2"
                label="Cost Moves"
                value={String(costChanges)}
                sub="Supplier cost changed"
              />
            </div>

            {/* Toolbar */}
            <div style={{
              display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
              marginBottom: 20, flexWrap: "wrap", gap: 12, flexDirection: isMobile ? "column" : "row",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1 }}>
                {/* Filter pills */}
                <div style={{
                  display: "flex", gap: 4, padding: 3,
                  background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
                }}>
                  {(Object.keys(filterLabels) as FilterType[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilterType(f)}
                      style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 600, border: "none",
                        cursor: "pointer", borderRadius: 8, transition: "all 0.15s",
                        background: filterType === f ? "#0f172a" : "transparent",
                        color: filterType === f ? "#fff" : "#64748b",
                      }}
                    >
                      {filterLabels[f]}
                      {f === "Pending Approval" && pendingCount > 0 && (
                        <span style={{
                          marginLeft: 5, fontSize: 10, fontWeight: 700,
                          background: filterType === f ? "#fff" : "#d97706",
                          color: filterType === f ? "#0f172a" : "#fff",
                          borderRadius: 8, padding: "1px 6px",
                        }}>{pendingCount}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div style={{ position: "relative", flex: isMobile ? 1 : undefined, minWidth: 0 }}>
                  <Search size={15} color="#94a3b8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    type="text"
                    placeholder="Search products or suppliers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      paddingLeft: 36, paddingRight: 14, height: 40, fontSize: 13,
                      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
                      width: isMobile ? "100%" : 240, minWidth: 0, outline: "none", color: "#374151",
                    }}
                  />
                </div>
              </div>

              <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>{filtered.length} products</span>
            </div>

            {/* Error */}
            {(scrapeError || catalogError) && (
              <div style={{
                marginBottom: 16, padding: "12px 16px", borderRadius: 12,
                border: "1px solid #fecaca", background: "#fef2f2",
                color: "#b91c1c", fontSize: 13, lineHeight: 1.5,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                {scrapeError || catalogError}
              </div>
            )}

            {/* Loading */}
            {catalogLoading ? (
              <div style={{
                background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
                padding: "80px 0", textAlign: "center",
              }}>
                <Loader2 size={28} color="#16a34a" style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
                <div style={{ fontSize: 14, color: "#64748b", marginTop: 16 }}>Loading products from your machines...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{
                background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
                padding: "60px 20px", textAlign: "center",
              }}>
                <Store size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                  {items.length === 0 ? "No products found" : "No matching products"}
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  {items.length === 0
                    ? "Products appear here automatically once machines process sales."
                    : "Try adjusting your search or filters."}
                </div>
              </div>
            ) : (
              /* Product List */
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.map((p) => {
                  const ss = statusStyles[p.status];
                  const costChanged = p.prevCost !== p.cost;
                  const costDiff = p.cost - p.prevCost;
                  const priceChanged = p.suggestedPrice !== p.currentPrice;
                  const priceKey = p.productRefId || p.id;
                  const costDraftValue = costDrafts[priceKey] ?? p.prevCost.toFixed(2);
                  const parsedCostDraft = Number(costDraftValue);
                  const canSaveCost = p.productRefId && Number.isFinite(parsedCostDraft) && parsedCostDraft >= 0 && parsedCostDraft !== p.prevCost;
                  const isExpanded = expandedRows.has(p.id);
                  const isBeverage = p.category === "beverage";
                  const marginColor = p.margin >= 45 ? "#059669" : p.margin >= 35 ? "#d97706" : "#dc2626";
                  const visibleSupplierPrices = (p.allPrices || []).filter((sp) => sp.unitPrice != null);
                  const firstFillLabel = p.firstFillCost != null
                    ? `$${p.firstFillCost.toFixed(2)}${p.firstFillPackSize ? ` / ${p.firstFillPackSize}pk` : " pack"}`
                    : null;
                  const isDecisionSaving = !!savingDecisions[p.id];

                  return (
                    <div key={p.id} style={{
                      background: "#fff", borderRadius: 16, border: `1px solid ${p.status === "Pending Approval" ? "#fde68a" : "#e2e8f0"}`,
                      boxShadow: p.status === "Pending Approval" ? "0 2px 12px rgba(217,119,6,0.08)" : "0 1px 4px rgba(0,0,0,0.04)",
                      overflow: "hidden", transition: "all 0.15s",
                    }}>
                      {/* Main row */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1.5fr 1fr 1fr 1fr auto" : "2fr 1.2fr 200px 1fr 1fr 100px 160px",
                          padding: isMobile ? 16 : "16px 22px",
                          gap: isMobile ? 14 : 16,
                          alignItems: "center",
                        }}
                      >
                        {/* Product Info */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                            background: isBeverage ? "#eff6ff" : "#fefce8",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 18,
                          }}>
                            {isBeverage ? "\uD83E\uDD64" : "\uD83C\uDF7F"}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>{p.product}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                                background: p.platform === "nayax" ? "#e0f2fe" : "#ede9fe",
                                color: p.platform === "nayax" ? "#0369a1" : "#7c3aed",
                              }}>
                                {p.platform === "nayax" ? "Nayax" : p.platform === "chinese" ? "HAHA" : "Machine"}
                              </span>
                              {p.machineCount != null && (
                                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                                  {p.machineCount} machine{p.machineCount === 1 ? "" : "s"}
                                </span>
                              )}
                              {p.unitsSold != null && p.unitsSold > 0 && (
                                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                                  {p.unitsSold} sold
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Market Match */}
                        {!isMobile && (
                          <div>
                            <div style={{
                              fontSize: 13, fontWeight: 600,
                              color: p.scraped ? "#0f172a" : "#94a3b8",
                              display: "flex", alignItems: "center", gap: 5,
                            }}>
                              {p.scrapedProduct ? (
                                <>
                                  {p.scrapedProduct.length > 30 ? p.scrapedProduct.slice(0, 28) + "..." : p.scrapedProduct}
                                  {p.sourceUrl && (
                                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8", display: "inline-flex" }}>
                                      <ExternalLink size={11} />
                                    </a>
                                  )}
                                </>
                              ) : (
                                <span style={{ fontStyle: "italic" }}>Not matched</span>
                              )}
                            </div>
                            {p.scraped && (
                              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                                via {p.supplier}
                                {p.packPrice != null && (
                                  <span>
                                    {" "}
                                    &middot; ${p.packPrice.toFixed(2)}
                                    {p.packSize ? ` / ${p.packSize}pk` : " pack"}
                                  </span>
                                )}
                              </div>
                            )}
                            {visibleSupplierPrices.length > 1 && (
                              <button onClick={() => toggleRow(p.id)} style={{
                                display: "flex", alignItems: "center", gap: 3,
                                fontSize: 11, color: "#3b82f6", fontWeight: 600,
                                background: "none", border: "none", cursor: "pointer",
                                padding: 0, marginTop: 4,
                              }}>
                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                {visibleSupplierPrices.length} suppliers found
                              </button>
                            )}
                          </div>
                        )}

                        {/* Your Cost */}
                        <div>
                          {!isMobile && (
                            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
                              Your Cost
                            </div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{
                              display: "flex", alignItems: "center", height: 38,
                              borderRadius: 10, overflow: "hidden",
                              border: canSaveCost ? "1.5px solid #16a34a" : "1px solid #d5d9e2",
                              background: "#fff",
                              boxShadow: canSaveCost ? "0 0 0 3px rgba(22,163,74,0.1)" : "none",
                              transition: "all 0.2s",
                            }}>
                              <span style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 30, height: "100%", fontSize: 13, color: "#64748b",
                                background: "#f8fafc", borderRight: "1px solid #e2e8f0", fontWeight: 600,
                              }}>$</span>
                              <input
                                type="number" min="0" step="0.01"
                                value={costDraftValue}
                                onChange={(e) => handleDraftCostChange(priceKey, e.target.value)}
                                style={{
                                  width: 80, height: "100%", padding: "0 10px",
                                  fontSize: 14, fontWeight: 700, background: "#fff",
                                  border: "none", outline: "none", color: "#0f172a",
                                }}
                              />
                            </div>
                            <button
                              onClick={() => handleSavePricing(p)}
                              disabled={!canSaveCost || !!savingPrices[priceKey]}
                              style={{
                                height: 38, width: 38, borderRadius: 10,
                                border: canSaveCost ? "none" : "1px solid #d5d9e2",
                                background: canSaveCost ? "#16a34a" : "#f8fafc",
                                color: canSaveCost ? "#fff" : "#cbd5e1",
                                cursor: !canSaveCost || savingPrices[priceKey] ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "all 0.2s", flexShrink: 0,
                              }}
                            >
                              {savingPrices[priceKey] ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
                            </button>
                          </div>
                          {costChanged && (
                            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: costDiff > 0 ? "#dc2626" : "#059669" }}>
                              {costDiff > 0 ? "\u2191" : "\u2193"} ${Math.abs(costDiff).toFixed(2)} since last save
                            </div>
                          )}
                          {firstFillLabel && (
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                              First fill: <strong style={{ color: "#0f172a" }}>{firstFillLabel}</strong>
                              {p.firstFillSupplier ? ` from ${p.firstFillSupplier}` : ""}
                            </div>
                          )}
                        </div>

                        {/* Prices: Current vs Suggested */}
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 20 : 0, ...(isMobile ? {} : { flexDirection: "column" as const, alignItems: "flex-start" }) }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
                              Selling
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                              ${p.currentPrice.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Suggested */}
                        {!isTablet && (
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
                              Suggested
                            </div>
                            <div style={{
                              fontSize: 18, fontWeight: 800,
                              color: priceChanged ? "#16a34a" : "#374151",
                            }}>
                              ${p.suggestedPrice.toFixed(2)}
                            </div>
                            {priceChanged && (
                              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 }}>
                                {p.suggestedPrice > p.currentPrice ? "+" : ""}${(p.suggestedPrice - p.currentPrice).toFixed(2)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Margin */}
                        {!isTablet && (
                          <div>
                            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                              Margin
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: marginColor }}>
                              {p.margin}%
                            </div>
                            {/* Mini progress bar */}
                            <div style={{ width: 60, height: 4, borderRadius: 2, background: "#e2e8f0", marginTop: 6 }}>
                              <div style={{
                                width: `${Math.min(100, (p.margin / 60) * 100)}%`, height: "100%",
                                borderRadius: 2, background: marginColor, transition: "width 0.3s",
                              }} />
                            </div>
                          </div>
                        )}

                        {/* Status + Actions */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: isMobile ? "flex-start" : "flex-end" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            fontSize: 11, fontWeight: 700, color: ss.color,
                            background: ss.bg, border: `1px solid ${ss.border}`,
                            padding: "5px 12px", borderRadius: 20,
                          }}>
                            {p.status === "Approved" && <Check size={12} />}
                            {p.status === "Pending Approval" && <Clock size={12} />}
                            {ss.label}
                          </span>
                          {p.status === "Pending Approval" && (
                            <div style={{ display: "flex", gap: 6 }}>
                              {priceChanged ? (
                                <button onClick={() => handleApprove(p)} disabled={isDecisionSaving} style={{
                                  display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8,
                                  background: "#16a34a", border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer",
                                  boxShadow: "0 2px 6px rgba(22,163,74,0.25)", transition: "all 0.15s",
                                  opacity: isDecisionSaving ? 0.7 : 1,
                                }}>
                                  {isDecisionSaving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />}
                                  Apply
                                </button>
                              ) : (
                                <span style={{
                                  display: "inline-flex", alignItems: "center",
                                  padding: "7px 12px", borderRadius: 8,
                                  background: "#f8fafc", border: "1px solid #e2e8f0",
                                  fontSize: 12, fontWeight: 700, color: "#64748b",
                                }}>
                                  No price change
                                </span>
                              )}
                              <button onClick={() => handleReject(p)} disabled={isDecisionSaving} style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 34, height: 34, borderRadius: 8,
                                background: "#fff", border: "1px solid #e2e8f0",
                                color: "#94a3b8", cursor: "pointer", transition: "all 0.15s",
                                opacity: isDecisionSaving ? 0.7 : 1,
                              }}>
                                <X size={14} />
                              </button>
                            </div>
                          )}
                          {p.status === "Approved" && (
                            <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Price updated</span>
                          )}
                        </div>
                      </div>

                      {/* Expanded: Supplier comparison */}
                      {isExpanded && visibleSupplierPrices.length > 0 && (
                        <div style={{
                          padding: "0 22px 16px",
                          borderTop: "1px solid #f1f5f9",
                          background: "#fafbfc",
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, padding: "12px 0 8px" }}>
                            Supplier Comparison
                          </div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            {visibleSupplierPrices.map((sp) => {
                              const isBest = sp.supplier === p.supplier;
                              return (
                                <div key={sp.supplier + sp.url} style={{
                                  padding: "10px 16px", borderRadius: 12,
                                  background: isBest ? "#ecfdf5" : "#fff",
                                  border: `1px solid ${isBest ? "#a7f3d0" : "#e2e8f0"}`,
                                  minWidth: 160,
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: isBest ? "#059669" : "#374151" }}>
                                      {sp.supplier}
                                    </span>
                                    {isBest && (
                                      <span style={{
                                        fontSize: 9, fontWeight: 700, color: "#059669",
                                        background: "#d1fae5", padding: "1px 6px", borderRadius: 4,
                                      }}>BEST</span>
                                    )}
                                    {sp.url && (
                                      <a href={sp.url} target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>
                                        <ExternalLink size={10} />
                                      </a>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                                    ${sp.unitPrice!.toFixed(2)}<span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>/ea</span>
                                  </div>
                                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                    {sp.packSize ? `${sp.packSize}pk case` : "Supplier match"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* How it works */}
            <div style={{
              marginTop: 20, padding: "16px 20px", background: "#fff",
              border: "1px solid #e2e8f0", borderRadius: 14, fontSize: 13, color: "#64748b", lineHeight: 1.7,
            }}>
              <strong style={{ color: "#0f172a" }}>How pricing works:</strong> Products appear automatically from machine sales.
              We default the supplier lookup to <strong>Sam&apos;s Club</strong> for cost fills, keep other suppliers for comparison, and only use a per-unit cost when the pack size looks reliable.
              We recommend a selling price using your profit targets (Drinks: {margins.beverage}%, Snacks: {margins.snack}%).
            </div>
          </>
        )}

        {/* ============ TAB: Rules ============ */}
        {activeTab === "Rules" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>Target Profit Margins</h3>
              <p style={{ fontSize: 14, color: "#64748b", margin: 0, lineHeight: 1.6 }}>
                Set the profit goal for each category. Recommended prices use these targets to ensure your machines stay profitable.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 20, maxWidth: 640 }}>
              {Object.entries(margins).map(([category, pct]) => {
                const isChanged = (editMargins[category] ?? pct) !== pct;
                const editPct = editMargins[category] ?? pct;
                return (
                  <div key={category} style={{
                    background: "#fff", borderRadius: 18, border: "1px solid #e2e8f0",
                    padding: "24px 28px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: category === "beverage" ? "#eff6ff" : "#fefce8",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                      }}>
                        {category === "beverage" ? "\uD83E\uDD64" : "\uD83C\uDF7F"}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                          {category === "beverage" ? "Drinks" : "Snacks"}
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>Current target: {pct}%</div>
                      </div>
                    </div>

                    <div style={{ position: "relative", marginBottom: 8 }}>
                      <input
                        type="range" min={10} max={80}
                        value={editPct}
                        onChange={(e) => setEditMargins((prev) => ({ ...prev, [category]: parseInt(e.target.value) }))}
                        style={{ width: "100%", accentColor: "#16a34a", height: 6 }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>10%</span>
                      <span style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{editPct}%</span>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>80%</span>
                    </div>

                    <div style={{
                      padding: "10px 14px", borderRadius: 10, background: "#f8fafc",
                      fontSize: 12, color: "#64748b", marginBottom: isChanged ? 16 : 0,
                    }}>
                      Example: $1.50 cost &rarr; <strong style={{ color: "#0f172a" }}>${(1.50 / (1 - editPct / 100)).toFixed(2)}</strong> recommended price
                    </div>

                    {isChanged && (
                      <button
                        onClick={() => handleMarginSave(category)}
                        disabled={savingMargin}
                        style={{
                          width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 700,
                          background: "#16a34a", color: "#fff", border: "none", borderRadius: 10,
                          cursor: savingMargin ? "not-allowed" : "pointer", opacity: savingMargin ? 0.7 : 1,
                          boxShadow: "0 2px 8px rgba(22,163,74,0.25)",
                        }}
                      >
                        {savingMargin ? "Saving..." : `Save ${category === "beverage" ? "Drinks" : "Snacks"} Target`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ TAB: Alerts ============ */}
        {activeTab === "Alerts" && (
          <div style={{
            background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
            padding: "60px 20px", textAlign: "center",
          }}>
            <Zap size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
              Price Alerts Coming Soon
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 400, margin: "0 auto" }}>
              You&apos;ll see major supplier cost changes and recommended actions here automatically.
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function StatCard({ icon, iconColor, iconBg, label, value, sub, subColor }: {
  icon: React.ReactNode; iconColor: string; iconBg: string;
  label: string; value: string; sub: string; subColor?: string;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
      padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: iconBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: iconColor, flexShrink: 0,
        }}>{icon}</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: subColor || "#94a3b8", marginTop: 4, fontWeight: subColor ? 600 : 400 }}>{sub}</div>
    </div>
  );
}
