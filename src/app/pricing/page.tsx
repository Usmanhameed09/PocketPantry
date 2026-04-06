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
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PriceStatus =
  | "Cost Margin"
  | "Pending Approval"
  | "Seasonal Price"
  | "Approved";

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
}

type PricingApiResponse = {
  success: boolean;
  data?: PricingItem[];
  meta?: {
    scraped: number;
    failed: number;
  };
  error?: string;
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const statusStyles: Record<PriceStatus, { color: string; bg: string; label: string }> = {
  "Cost Margin":      { color: "#059669", bg: "#d1fae5", label: "Healthy Margin" },
  "Pending Approval": { color: "#d97706", bg: "#fef3c7", label: "Needs Review" },
  "Seasonal Price":   { color: "#6366f1", bg: "#eef2ff", label: "Seasonal Update" },
  "Approved":         { color: "#16a34a", bg: "#dcfce7", label: "Approved" },
};

const tabLabels: Record<Tab, string> = {
  "Price Adjustments": "Price Review",
  Rules: "Profit Targets",
  Alerts: "Updates",
};

const filterLabels: Record<FilterType, string> = {
  All: "All Products",
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
  const [lastScraped, setLastScraped] = useState<string | null>(null);
  const [scrapeStats, setScrapeStats] = useState<{ scraped: number; failed: number } | null>(null);
  const [margins, setMargins] = useState<Record<string, number>>({ beverage: 50, snack: 45 });
  const [editMargins, setEditMargins] = useState<Record<string, number>>({ beverage: 50, snack: 45 });
  const [savingMargin, setSavingMargin] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [savingPrices, setSavingPrices] = useState<Record<string, boolean>>({});
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});

  function syncPriceDrafts(nextItems: PricingItem[]) {
    setCostDrafts(
      Object.fromEntries(
        nextItems.map((item) => [item.productRefId || item.id, item.prevCost.toFixed(2)])
      )
    );
  }

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
      .then((d) => {
        if (d.margins) {
          setMargins(d.margins);
          setEditMargins(d.margins);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

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

  const filtered = items.filter((p) => {
    const term = search.toLowerCase();
    const matchSearch =
      search === "" ||
      p.product.toLowerCase().includes(term) ||
      (p.scrapedProduct || "").toLowerCase().includes(term) ||
      p.supplier.toLowerCase().includes(term);
    const matchFilter =
      filterType === "All" ||
      (filterType === "Pending Approval" && p.status === "Pending Approval") ||
      (filterType === "Seasonal" && p.status === "Seasonal Price") ||
      (filterType === "Cost Change" && p.prevCost !== p.cost);
    return matchSearch && matchFilter;
  });

  const costChanges = items.filter((p) => p.prevCost !== p.cost).length;
  const avgMargin = items.length
    ? Math.round(items.reduce((s, p) => s + p.margin, 0) / items.length)
    : 0;
  const pendingCount = items.filter((p) => p.status === "Pending Approval").length;

  async function handleApprove(item: PricingItem) {
    try {
      const res = await fetch("/api/pricing/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: item.id,
          productId: item.productRefId,
          decision: "approve",
          currentPrice: item.currentPrice,
          suggestedPrice: item.suggestedPrice,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to approve price");
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                status: "Approved" as PriceStatus,
                currentPrice: p.suggestedPrice,
                trigger: "Approved price update",
              }
            : p
        )
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function handleReject(item: PricingItem) {
    try {
      const res = await fetch("/api/pricing/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId: item.id,
          productId: item.productRefId,
          decision: "reject",
          currentPrice: item.currentPrice,
          suggestedPrice: item.suggestedPrice,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to reject price");
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? {
                ...p,
                status: "Cost Margin" as PriceStatus,
                suggestedPrice: p.currentPrice,
                trigger: "Price change rejected",
              }
            : p
        )
      );
    } catch (error) {
      console.error(error);
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
        body: JSON.stringify({
          productId: item.productRefId,
          lastKnownCost: nextValue,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to save pricing");
      }

      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                cost: nextValue,
                prevCost: nextValue,
              }
            : row
        )
      );
    } catch (error) {
      console.error(error);
    } finally {
      setSavingPrices((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleScrape() {
    setScraping(true);
    setScrapeStats(null);
    setScrapeError(null);
    try {
      const res = await fetch("/api/pricing/scrape", { method: "POST" });
      const json: PricingApiResponse = await res.json();
      if (Array.isArray(json.data)) {
        const mapped: PricingItem[] = json.data.map((r) => ({
          id: r.id, product: r.product, scrapedProduct: r.scrapedProduct ?? null, supplier: r.supplier,
          cost: r.cost, prevCost: r.prevCost, currentPrice: r.currentPrice,
          suggestedPrice: r.suggestedPrice, margin: r.margin,
          status: r.status as PriceStatus, trigger: r.trigger,
          sourceUrl: r.sourceUrl, packPrice: r.packPrice,
          packSize: r.packSize, scraped: r.scraped, allPrices: r.allPrices,
          machineCount: r.machineCount, unitsSold: r.unitsSold,
          platform: r.platform, lastSoldAt: r.lastSoldAt, category: r.category, error: r.error ?? null, lastScrapedAt: r.lastScrapedAt ?? null,
        }));
        setItems(mapped);
        syncPriceDrafts(mapped);
        setLastScraped(new Date().toLocaleTimeString());
        setScrapeStats({ scraped: json.meta?.scraped ?? 0, failed: json.meta?.failed ?? 0 });
      }
      if (!res.ok || !json.success) {
        setScrapeError(json.error || "Failed to scrape supplier prices");
        return;
      }
      if (json.error) {
        setScrapeError(json.error);
      }
    } catch (err) {
      console.error("Scrape failed:", err);
      setScrapeError("Failed to scrape supplier prices");
    } finally {
      setScraping(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Pricing" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Tabs + Scrape Button */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
          marginBottom: 24, flexWrap: "wrap", gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row",
        }}>
          <div className="tab-bar" style={{ display: "flex", gap: 0, borderBottom: "2px solid #d5d9e2" }}>
            {(["Price Adjustments", "Rules", "Alerts"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "10px 20px", fontSize: 14, fontWeight: 600, border: "none",
                  cursor: "pointer", background: "transparent", position: "relative",
                  color: activeTab === tab ? "#16a34a" : "#9ca3af",
                  borderBottom: activeTab === tab ? "2px solid #16a34a" : "2px solid transparent",
                  marginBottom: -2, transition: "all 0.15s",
                }}
              >
                {tabLabels[tab]}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastScraped && (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                Last checked: {lastScraped}
                {scrapeStats && (
                  <span>
                    {" "}({scrapeStats.scraped} matched
                    {scrapeStats.failed > 0 && <span style={{ color: "#dc2626" }}>, {scrapeStats.failed} needs attention</span>})
                  </span>
                )}
              </span>
            )}
            <button
              onClick={handleScrape}
              disabled={scraping}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                background: scraping ? "#86efac" : "#16a34a", color: "#fff", border: "none", borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: scraping ? "not-allowed" : "pointer",
                opacity: scraping ? 0.8 : 1, transition: "all 0.2s",
              }}
            >
              {scraping ? (
                <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Checking market prices...</>
              ) : (
                <><RefreshCw size={14} /> Check Market Prices</>
              )}
            </button>
          </div>
        </div>

        {/* ============ TAB: Price Adjustments ============ */}
        {activeTab === "Price Adjustments" && (
          <>
            {/* Stat Cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <StatBox icon={<AlertCircle size={20} color="#dc2626" />} iconBg="#fee2e2" label="Cost Moves" value={`${costChanges} items`} sub="Supplier cost changed since last save" />
              <StatBox icon={<TrendingUp size={20} color="#059669" />} iconBg="#d1fae5" label="Average Margin" value={`${avgMargin}%`} sub={avgMargin >= 45 ? "Right on target" : "Below target margin"} subColor={avgMargin >= 45 ? "#059669" : "#d97706"} />
              <StatBox icon={<Clock size={20} color="#d97706" />} iconBg="#fef3c7" label="Needs Review" value={`${pendingCount}`} sub="Recommended price changes waiting" subColor="#d97706" />
              <StatBox icon={<DollarSign size={20} color="#16a34a" />} iconBg="#dcfce7" label="Products In Machines" value={`${items.length}`} sub="Live catalog from machine sales" />
            </div>

            {/* Filters */}
            <div style={{
              display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
              marginBottom: 16, flexWrap: "wrap", gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 0, background: "#fff", borderRadius: 8, border: "1px solid #d5d9e2", overflow: "hidden" }}>
                  {(["All", "Pending Approval", "Seasonal", "Cost Change"] as FilterType[]).map((f) => (
                    <button key={f} onClick={() => setFilterType(f)} style={{
                      padding: "8px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", transition: "all 0.15s",
                      background: filterType === f ? "#16a34a" : "transparent", color: filterType === f ? "#fff" : "#6b7280",
                    }}>
                      {filterLabels[f]}
                    </button>
                  ))}
                </div>
                <div style={{ position: "relative", flex: isMobile ? 1 : undefined, minWidth: 0 }}>
                  <Search size={15} color="#9ca3af" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                  <input type="text" placeholder="Search by product or supplier..." value={search} onChange={(e) => setSearch(e.target.value)} style={{
                    paddingLeft: 34, paddingRight: 14, height: 38, fontSize: 13, background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8,
                    width: isMobile ? "100%" : 220, minWidth: 0, outline: "none", color: "#374151",
                  }} />
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>{filtered.length} items</div>
            </div>

            {scrapeError && (
              <div style={{
                marginBottom: 16,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: 12,
                lineHeight: 1.5,
              }}>
                    Price check issue: {scrapeError}
                  </div>
                )}

            {/* Table */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2", boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 980 }}>
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.7fr 180px 120px 130px 90px 140px 130px", padding: "14px 22px", borderBottom: "1px solid #d5d9e2", background: "#f8fafc" }}>
                  <TH>Machine Product</TH><TH>Market Match</TH><TH>Your Cost</TH><TH>Selling Price</TH><TH>Recommended Price</TH><TH>Margin</TH><TH>Review Status</TH><TH>Next Step</TH>
                </div>

                {/* Rows */}
                {filtered.map((p) => {
                  const ss = statusStyles[p.status];
                  const costChanged = p.prevCost !== p.cost;
                  const costDiff = p.cost - p.prevCost;
                  const priceChanged = p.suggestedPrice !== p.currentPrice;
                  const priceKey = p.productRefId || p.id;
                  const costDraftValue = costDrafts[priceKey] ?? p.prevCost.toFixed(2);
                  const parsedCostDraft = Number(costDraftValue);
                  const canSaveCost = p.productRefId && Number.isFinite(parsedCostDraft) && parsedCostDraft >= 0 && parsedCostDraft !== p.prevCost;
                  return (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.7fr 180px 120px 130px 90px 140px 130px", padding: "14px 22px", borderBottom: "1px solid #e2e8f0", alignItems: "center", transition: "background 0.1s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {/* Product */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: 6 }}>
                          {p.product}
                        </div>
                        {(p.machineCount || p.unitsSold || p.platform) && (
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                            {p.platform === "chinese" ? "HAHA machine" : p.platform || "Machine sales"}
                            {p.machineCount ? ` | ${p.machineCount} machine${p.machineCount === 1 ? "" : "s"}` : ""}
                            {p.unitsSold ? ` | ${p.unitsSold} sold` : ""}
                          </div>
                        )}
                      </div>

                      {/* Scraped Product */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: p.scraped ? "#0f172a" : "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
                          {p.scrapedProduct || "No market match yet"}
                          {p.sourceUrl && (
                            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8", display: "inline-flex" }} title={`View on ${p.supplier}`}>
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          Lowest found: <span style={{ color: p.scraped ? "#059669" : "#94a3b8", fontWeight: 600 }}>{p.supplier}</span>
                          {p.packPrice != null && p.packSize != null && (
                            <span> &middot; ${p.packPrice.toFixed(2)} / {p.packSize} pk</span>
                          )}
                        </div>
                        {p.error && (
                          <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 4, lineHeight: 1.4 }}>
                            {p.error}
                          </div>
                        )}
                        {p.allPrices && p.allPrices.length > 1 && (
                          <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {p.allPrices.map((sp) => (
                              <span key={sp.supplier} style={{
                                fontSize: 10, padding: "2px 6px", borderRadius: 4,
                                background: sp.supplier === p.supplier ? "#d1fae5" : "#f1f5f9",
                                color: sp.supplier === p.supplier ? "#059669" : "#64748b",
                                fontWeight: sp.supplier === p.supplier ? 600 : 400,
                              }}>
                                {sp.supplier}: ${sp.unitPrice?.toFixed(2) ?? "?"}/ea
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Cost */}
                      <div>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
                          Your cost
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            height: 42,
                            borderRadius: 12,
                            border: canSaveCost ? "1px solid #86efac" : "1px solid #cbd5e1",
                            background: "#fff",
                            overflow: "hidden",
                            boxShadow: canSaveCost ? "0 0 0 4px rgba(22,163,74,0.08)" : "0 1px 2px rgba(15,23,42,0.04)",
                          }}>
                            <span style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 34,
                              height: "100%",
                              fontSize: 14,
                              color: "#64748b",
                              background: "#f8fafc",
                              borderRight: "1px solid #e2e8f0",
                              fontWeight: 600,
                            }}>
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={costDraftValue}
                              onChange={(e) => handleDraftCostChange(priceKey, e.target.value)}
                              style={{
                                width: 92,
                                height: "100%",
                                padding: "0 12px",
                                fontSize: 15,
                                fontWeight: 600,
                                background: "#fff",
                                border: "none",
                                outline: "none",
                                color: "#0f172a",
                              }}
                            />
                          </div>
                          <button
                            onClick={() => handleSavePricing(p)}
                            disabled={!canSaveCost || !!savingPrices[priceKey]}
                            style={{
                              height: 42,
                              minWidth: 46,
                              padding: "0 12px",
                              borderRadius: 12,
                              border: "1px solid #d5d9e2",
                              background: canSaveCost ? "#16a34a" : "#fff",
                              color: canSaveCost ? "#fff" : "#94a3b8",
                              cursor: !canSaveCost || savingPrices[priceKey] ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "all 0.2s",
                            }}
                            title="Save your cost"
                          >
                            {savingPrices[priceKey] ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
                          </button>
                        </div>
                        {costChanged && (
                          <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: costDiff > 0 ? "#dc2626" : "#059669" }}>
                            {costDiff > 0 ? "↑" : "↓"} ${Math.abs(costDiff).toFixed(2)}
                          </div>
                        )}
                        {!costChanged && (
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>
                            This cost is used in the next price check
                          </div>
                        )}
                      </div>

                      {/* Current Price */}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                          ${p.currentPrice.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>
                          Current machine price
                        </div>
                      </div>

                      {/* Suggested Price */}
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: priceChanged ? "#16a34a" : "#374151" }}>${p.suggestedPrice.toFixed(2)}</span>
                        {priceChanged && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{p.suggestedPrice > p.currentPrice ? "+" : ""}${(p.suggestedPrice - p.currentPrice).toFixed(2)}</div>}
                      </div>

                      {/* Margin */}
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: p.margin >= 45 ? "#059669" : p.margin >= 35 ? "#d97706" : "#dc2626" }}>{p.margin}%</span>
                      </div>

                      {/* Status */}
                      <div>
                          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: ss.color, background: ss.bg, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{ss.label}</span>
                          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{p.trigger}</div>
                      </div>

                      {/* Action */}
                      <div>
                        {p.status === "Pending Approval" ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => handleApprove(p)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, background: "#059669", border: "none", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>
                              <Check size={13} /> Apply
                            </button>
                            <button onClick={() => handleReject(p)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, background: "#fff", border: "1px solid #d5d9e2", fontSize: 12, fontWeight: 500, color: "#64748b", cursor: "pointer" }}>
                              <X size={13} />
                            </button>
                          </div>
                        ) : p.status === "Approved" ? (
                          <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Updated</span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>Nothing to change</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filtered.length === 0 && (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                    {catalogLoading
                      ? "Loading machine products..."
                      : catalogError
                        ? catalogError
                        : "No machine products found yet."}
                  </div>
                )}
              </div>
            </div>

            {/* How it works */}
            <div style={{ marginTop: 16, padding: "14px 18px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, fontSize: 12, color: "#0369a1", lineHeight: 1.6 }}>
              <strong>How this works:</strong> This page shows products that are actually selling in your machines.
              Update <strong>Your cost</strong>, save it, then click <strong>Check Market Prices</strong>.
              We compare your saved cost with current supplier pricing, then suggest a better selling price using your target profit margins
              (Drinks: {margins.beverage}%, Snacks: {margins.snack}%).
            </div>
          </>
        )}

        {/* ============ TAB: Rules (Margin Config) ============ */}
        {activeTab === "Rules" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Target Profit By Category</h3>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                Set the profit goal for each category. Recommended machine prices will use these targets.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16, maxWidth: 600 }}>
              {Object.entries(margins).map(([category, pct]) => (
                <div key={category} style={{
                  background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
                  padding: "20px 24px", boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Settings size={16} color="#6366f1" />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", textTransform: "capitalize" }}>{category === "beverage" ? "Drinks" : "Snacks"}</span>
                  </div>

                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                    Target profit margin: <strong style={{ color: "#0f172a" }}>{pct}%</strong>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      value={editMargins[category] ?? pct}
                      onChange={(e) => setEditMargins((prev) => ({ ...prev, [category]: parseInt(e.target.value) }))}
                      style={{ flex: 1, accentColor: "#16a34a" }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", minWidth: 40, textAlign: "right" }}>
                      {editMargins[category] ?? pct}%
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 4, marginBottom: 12 }}>
                    <span>10%</span><span>80%</span>
                  </div>

                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>
                    Example: a $1.50 cost becomes a ${(1.50 / (1 - (editMargins[category] ?? pct) / 100)).toFixed(2)} recommended selling price
                  </div>

                  {(editMargins[category] ?? pct) !== pct && (
                    <button
                      onClick={() => handleMarginSave(category)}
                      disabled={savingMargin}
                      style={{
                        padding: "8px 16px", fontSize: 12, fontWeight: 600,
                        background: "#16a34a", color: "#fff", border: "none", borderRadius: 6,
                        cursor: savingMargin ? "not-allowed" : "pointer", opacity: savingMargin ? 0.7 : 1,
                      }}
                    >
                      {savingMargin ? "Saving..." : `Save ${category === "beverage" ? "drinks" : "snacks"} target`}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: "14px 18px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, fontSize: 12, color: "#0369a1", lineHeight: 1.6 }}>
              <strong>How pricing is calculated:</strong> We take your saved cost, apply the target profit margin, and round to the nearest $0.25 so the final machine price is practical to use.
            </div>
          </div>
        )}

        {/* ============ TAB: Alerts ============ */}
        {activeTab === "Alerts" && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            Update alerts coming soon. You&apos;ll see major supplier cost changes here.
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function StatBox({ icon, iconBg, label, value, sub, subColor }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string; subColor?: string;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
      padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: subColor || "#9ca3af", marginTop: 2, fontWeight: subColor ? 600 : 400 }}>{sub}</div>
      </div>
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
      {children}
    </div>
  );
}
