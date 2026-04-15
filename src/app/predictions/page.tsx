"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import Header from "@/components/Header";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Zap,
  Target,
  XCircle,
  Truck,
  Sun,
  Snowflake,
  Leaf,
  Loader2,
  AlertCircle,
  DollarSign,
  Package,
  Clock,
  ChevronRight,
  Star,
  ThumbsDown,
  Plus,
  Minus,
  Trash2,
  BarChart3,
  Info,
  Calendar,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RecAction = "Add" | "Remove" | "Increase" | "Decrease";
type Season = "Spring" | "Summer" | "Fall" | "Winter";

interface MachineForecast {
  machine: string;
  location: string;
  currentWeekly: number;
  predictedWeekly: number;
  change: number;
  confidence: number;
  topProduct: string;
  weakProduct: string;
  predictedRefillDate: string;
  daysUntilRefill: number;
  totalTransactions: number;
  monthsOfData: number;
}

interface ProductPerformance {
  product: string;
  avgDailySales: number;
  predictedDailySales: number;
  trend: "up" | "down" | "stable";
  trendPct: number;
  revenueShare: number;
  recommendation: RecAction | null;
  reason: string;
  totalRevenue: number;
}

interface SeasonalTrend {
  product: string;
  currentSeason: Season;
  seasonalChange: number;
  peakMonth: string;
  lowMonth: string;
  insight: string;
  totalRevenue: number;
}

interface ProductMixRec {
  machine: string;
  action: RecAction;
  product: string;
  reason: string;
  estimatedImpact: string;
  confidence: number;
}

interface PredictionData {
  generatedAt: string;
  dataRange: { start: string; end: string; months: number };
  summary: {
    totalDataPoints: number;
    totalMachines: number;
    totalProducts: number;
    avgConfidence: number;
  };
  machineForecast: MachineForecast[];
  productPerformance: ProductPerformance[];
  seasonalTrends: SeasonalTrend[];
  productMixRecs: ProductMixRec[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const actionConfig: Record<RecAction, { color: string; bg: string; border: string; icon: typeof Plus; label: string }> = {
  Add:      { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", icon: Plus,   label: "Add to Machine" },
  Remove:   { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: Trash2, label: "Remove Product" },
  Increase: { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: ArrowUpRight, label: "Add More Stock" },
  Decrease: { color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: Minus,  label: "Reduce Stock" },
};

function formatCurrency(n: number) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PredictionsPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [tab, setTab] = useState<"overview" | "products" | "seasonal" | "mix">("overview");
  const [data, setData] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPredictions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/predictions");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to load predictions" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load predictions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPredictions(); }, [fetchPredictions]);

  const handleRetrain = async () => {
    try {
      setRetraining(true);
      const res = await fetch("/api/predictions", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Retrain failed" }));
        throw new Error(err.error);
      }
      await fetchPredictions();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Retrain failed");
    } finally {
      setRetraining(false);
    }
  };

  /* Loading */
  if (loading) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Predictions" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 100, gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={28} color="#16a34a" style={{ animation: "spin 1s linear infinite" }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>Crunching your sales data...</div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Analyzing transactions across all machines</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  /* Error */
  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Predictions" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80, gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertCircle size={28} color="#dc2626" />
          </div>
          <div style={{ fontSize: 16, color: "#dc2626", fontWeight: 600 }}>{error || "No prediction data available"}</div>
          <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", maxWidth: 420, lineHeight: 1.6 }}>
            Start the prediction server first:
          </div>
          <code style={{ background: "#f1f5f9", padding: "10px 16px", borderRadius: 8, fontSize: 13, color: "#334155" }}>
            cd prediction-api &amp;&amp; python server.py
          </code>
          <button onClick={fetchPredictions} style={{
            marginTop: 8, padding: "10px 24px", background: "#16a34a", color: "#fff",
            border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>Try Again</button>
        </div>
      </div>
    );
  }

  const { machineForecast, productPerformance, seasonalTrends, productMixRecs, summary } = data;

  const totalPredictedWeekly = machineForecast.reduce((s, m) => s + m.predictedWeekly, 0);
  const totalCurrentWeekly = machineForecast.reduce((s, m) => s + m.currentWeekly, 0);
  const overallChangePct = ((totalPredictedWeekly - totalCurrentWeekly) / totalCurrentWeekly * 100);
  const deadProducts = productPerformance.filter(p => p.recommendation === "Remove").length;
  const generatedDate = new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const maxWeekly = Math.max(...machineForecast.map(m => Math.max(m.currentWeekly, m.predictedWeekly)));

  const tabItems: { key: typeof tab; label: string; icon: typeof BarChart3; count?: number }[] = [
    { key: "overview",  label: "Machine Forecast",  icon: BarChart3 },
    { key: "products",  label: "Product Health",     icon: Package,    count: deadProducts > 0 ? deadProducts : undefined },
    { key: "seasonal",  label: "Seasonal Trends",    icon: Sun },
    { key: "mix",       label: "Smart Actions",      icon: Zap,        count: productMixRecs.length },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <Header title="Predictions" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ padding: isMobile ? 16 : "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ============ MODEL BANNER ============ */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #059669 100%)",
          borderRadius: 16, padding: isMobile ? "20px" : "22px 28px", marginBottom: 24, color: "#fff",
          display: "flex", flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between",
          gap: isMobile ? 16 : 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)",
            }}>
              <Brain size={26} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>AI Sales Predictions</div>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Calendar size={12} /> {data.dataRange.months} months of data
                </span>
                <span style={{ opacity: 0.4 }}>|</span>
                <span>{summary.totalMachines} machines</span>
                <span style={{ opacity: 0.4 }}>|</span>
                <span>{(summary.totalDataPoints / 1000).toFixed(1)}K transactions</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>Confidence</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{summary.avgConfidence}%</div>
            </div>
            <div style={{ width: 1, height: 40, background: "rgba(255,255,255,0.15)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>Updated</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{generatedDate}</div>
            </div>
            <button onClick={handleRetrain} disabled={retraining} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 18px",
              background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: retraining ? "not-allowed" : "pointer",
              opacity: retraining ? 0.5 : 1, transition: "all 0.15s", backdropFilter: "blur(8px)",
            }}>
              {retraining
                ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                : <RefreshCw size={14} />
              }
              {retraining ? "Retraining..." : "Retrain"}
            </button>
          </div>
        </div>

        {/* ============ STAT CARDS ============ */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          gap: 16, marginBottom: 28,
        }}>
          <SummaryCard
            icon={<DollarSign size={20} />} iconColor="#059669" iconBg="#ecfdf5"
            title="Predicted Weekly Revenue"
            value={formatCurrency(totalPredictedWeekly)}
            subtitle={`Currently ${formatCurrency(totalCurrentWeekly)}/week`}
            badge={`${overallChangePct >= 0 ? "+" : ""}${overallChangePct.toFixed(1)}%`}
            badgeColor={overallChangePct >= 0 ? "#059669" : "#dc2626"}
          />
          <SummaryCard
            icon={<Target size={20} />} iconColor="#6366f1" iconBg="#eef2ff"
            title="Model Confidence"
            value={`${summary.avgConfidence}%`}
            subtitle={`Based on ${summary.totalMachines} machines`}
            badge={summary.avgConfidence >= 80 ? "High" : summary.avgConfidence >= 60 ? "Medium" : "Low"}
            badgeColor={summary.avgConfidence >= 80 ? "#059669" : summary.avgConfidence >= 60 ? "#d97706" : "#dc2626"}
          />
          <SummaryCard
            icon={<Zap size={20} />} iconColor="#d97706" iconBg="#fffbeb"
            title="Suggested Actions"
            value={`${productMixRecs.length}`}
            subtitle={`${deadProducts} products to remove`}
            badge={deadProducts > 0 ? `${deadProducts} dead` : "All good"}
            badgeColor={deadProducts > 0 ? "#dc2626" : "#059669"}
          />
          <SummaryCard
            icon={<Truck size={20} />} iconColor="#0ea5e9" iconBg="#f0f9ff"
            title="Soonest Refill Needed"
            value={[...machineForecast].sort((a, b) => a.daysUntilRefill - b.daysUntilRefill)[0]?.machine || "N/A"}
            subtitle={`Estimated ${[...machineForecast].sort((a, b) => a.daysUntilRefill - b.daysUntilRefill)[0]?.predictedRefillDate || ""}`}
            badge={`${[...machineForecast].sort((a, b) => a.daysUntilRefill - b.daysUntilRefill)[0]?.daysUntilRefill || 0} days`}
            badgeColor="#dc2626"
          />
        </div>

        {/* ============ TABS ============ */}
        <div style={{
          display: "flex", gap: 6, marginBottom: 24,
          overflowX: "auto", paddingBottom: 2,
        }}>
          {tabItems.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "10px 18px", fontSize: 13, fontWeight: 600,
                border: active ? "1px solid #059669" : "1px solid #e2e8f0",
                borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap",
                background: active ? "#ecfdf5" : "#fff",
                color: active ? "#059669" : "#64748b",
                transition: "all 0.15s",
              }}>
                <Icon size={15} />
                {t.label}
                {t.count !== undefined && (
                  <span style={{
                    background: active ? "#059669" : "#e2e8f0",
                    color: active ? "#fff" : "#64748b",
                    fontSize: 11, fontWeight: 700, padding: "2px 7px",
                    borderRadius: 6, minWidth: 20, textAlign: "center",
                  }}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ============ TAB: MACHINE FORECAST ============ */}
        {tab === "overview" && (
          <div>
            {/* Explanation */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", background: "#f0f9ff", border: "1px solid #bae6fd",
              borderRadius: 10, marginBottom: 20, fontSize: 13, color: "#0369a1",
            }}>
              <Info size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>How to read this:</strong> &quot;Now&quot; shows the average weekly revenue over the last 2 months.
                &quot;Forecast&quot; is what our model predicts for next month (weekly).
                The bar shows the comparison visually.
              </span>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr" : "repeat(2, 1fr)",
              gap: 16,
            }}>
              {machineForecast.map((m) => {
                const isUp = m.change >= 0;
                const currentPct = (m.currentWeekly / maxWeekly) * 100;
                const predictedPct = (m.predictedWeekly / maxWeekly) * 100;
                return (
                  <div key={m.machine} style={{
                    background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden",
                    transition: "box-shadow 0.15s",
                  }}>
                    {/* Card Header */}
                    <div style={{ padding: "18px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{m.machine}</div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{m.location}</div>
                      </div>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "5px 10px", borderRadius: 8,
                        background: isUp ? "#ecfdf5" : "#fef2f2",
                        color: isUp ? "#059669" : "#dc2626",
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {isUp ? "+" : ""}{m.change}%
                      </div>
                    </div>

                    {/* Revenue Comparison */}
                    <div style={{ padding: "0 20px 16px" }}>
                      {/* Now */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>Now</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#374151" }}>{formatCurrency(m.currentWeekly)}<span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>/wk</span></span>
                        </div>
                        <div style={{ height: 10, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 6, width: `${currentPct}%`,
                            background: "#94a3b8", transition: "width 0.5s ease",
                          }} />
                        </div>
                      </div>
                      {/* Forecast */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: isUp ? "#059669" : "#dc2626", fontWeight: 600 }}>Forecast</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: isUp ? "#059669" : "#dc2626" }}>{formatCurrency(m.predictedWeekly)}<span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>/wk</span></span>
                        </div>
                        <div style={{ height: 10, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 6, width: `${predictedPct}%`,
                            background: isUp
                              ? "linear-gradient(90deg, #059669, #34d399)"
                              : "linear-gradient(90deg, #dc2626, #f87171)",
                            transition: "width 0.5s ease",
                          }} />
                        </div>
                      </div>
                    </div>

                    {/* Footer: Top/Weak + Refill */}
                    <div style={{
                      padding: "14px 20px", borderTop: "1px solid #f1f5f9",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: "#fafbfc",
                    }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 11, fontWeight: 600, color: "#059669", background: "#ecfdf5",
                          padding: "3px 10px", borderRadius: 6, border: "1px solid #a7f3d0",
                        }}>
                          <Star size={10} /> {m.topProduct}
                        </span>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fef2f2",
                          padding: "3px 10px", borderRadius: 6, border: "1px solid #fecaca",
                        }}>
                          <ThumbsDown size={10} /> {m.weakProduct}
                        </span>
                      </div>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontSize: 12, fontWeight: 600,
                        color: m.daysUntilRefill <= 3 ? "#dc2626" : m.daysUntilRefill <= 5 ? "#d97706" : "#059669",
                      }}>
                        <Clock size={13} />
                        Refill in {m.daysUntilRefill}d
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ TAB: PRODUCT HEALTH ============ */}
        {tab === "products" && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca",
              borderRadius: 10, marginBottom: 20, fontSize: 13, color: "#991b1b",
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>{deadProducts} products flagged for removal</strong> &mdash; these are consistently underperforming
                and taking up valuable machine slots.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {productPerformance.map((p, i) => {
                const rec = p.recommendation ? actionConfig[p.recommendation] : null;
                const RecIcon = rec?.icon || Package;
                const maxRev = Math.max(...productPerformance.map(pp => pp.totalRevenue));
                const revBarPct = (p.totalRevenue / maxRev) * 100;
                return (
                  <div key={i} style={{
                    background: "#fff", borderRadius: 12, overflow: "hidden",
                    border: rec ? `1px solid ${rec.border}` : "1px solid #e2e8f0",
                    transition: "all 0.15s",
                  }}>
                    <div style={{
                      padding: "14px 20px",
                      display: "flex", alignItems: "center", gap: 16,
                      background: rec ? rec.bg : "transparent",
                      flexWrap: isMobile ? "wrap" : "nowrap",
                    }}>
                      {/* Product Name + Total Rev */}
                      <div style={{ flex: "1 1 200px", minWidth: 150 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{p.product}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          Lifetime: {formatCurrency(p.totalRevenue)}
                        </div>
                      </div>

                      {/* Revenue Bar */}
                      <div style={{ flex: "1 1 160px", minWidth: 120 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>Daily Revenue</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>${p.avgDailySales.toFixed(1)}/day</span>
                        </div>
                        <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 4,
                            width: `${Math.max(3, revBarPct)}%`,
                            background: p.trend === "up" ? "#34d399" : p.trend === "down" ? "#fca5a5" : "#cbd5e1",
                          }} />
                        </div>
                      </div>

                      {/* Trend */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "5px 12px", borderRadius: 8,
                        background: p.trend === "up" ? "#ecfdf5" : p.trend === "down" ? "#fef2f2" : "#f8fafc",
                        color: p.trend === "up" ? "#059669" : p.trend === "down" ? "#dc2626" : "#64748b",
                        fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                        border: `1px solid ${p.trend === "up" ? "#a7f3d0" : p.trend === "down" ? "#fecaca" : "#e2e8f0"}`,
                      }}>
                        {p.trend === "up" ? <TrendingUp size={13} /> : p.trend === "down" ? <TrendingDown size={13} /> : null}
                        {p.trendPct > 0 ? "+" : ""}{p.trendPct}%
                      </div>

                      {/* Recommendation */}
                      <div style={{ flex: "1 1 220px", minWidth: 160 }}>
                        {rec ? (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 12px", borderRadius: 8,
                            background: "#fff", border: `1px solid ${rec.border}`,
                          }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 7, background: rec.bg,
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            }}>
                              <RecIcon size={14} color={rec.color} />
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: rec.color }}>{rec.label}</div>
                              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.3, marginTop: 1 }}>{p.reason}</div>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{p.reason}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ TAB: SEASONAL TRENDS ============ */}
        {tab === "seasonal" && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: 10, marginBottom: 20, fontSize: 13, color: "#92400e",
            }}>
              <Sun size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>Seasonal patterns</strong> help you stock the right products at the right time.
                Products below show the biggest seasonal swings based on historical data.
              </span>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr" : "repeat(2, 1fr)",
              gap: 16,
            }}>
              {seasonalTrends.map((s, i) => {
                const isUp = s.seasonalChange >= 0;
                const SeasonIcon = s.currentSeason === "Summer" ? Sun : s.currentSeason === "Winter" ? Snowflake : Leaf;
                return (
                  <div key={i} style={{
                    background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
                    overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    {/* Header with season badge */}
                    <div style={{
                      padding: "18px 20px 14px",
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{s.product}</div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                          Lifetime revenue: {formatCurrency(s.totalRevenue)}
                        </div>
                      </div>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", borderRadius: 8,
                        background: isUp ? "#ecfdf5" : "#fef2f2",
                        border: `1px solid ${isUp ? "#a7f3d0" : "#fecaca"}`,
                        color: isUp ? "#059669" : "#dc2626",
                        fontSize: 13, fontWeight: 700,
                      }}>
                        {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {isUp ? "+" : ""}{s.seasonalChange}%
                      </div>
                    </div>

                    {/* Peak / Low visual */}
                    <div style={{ padding: "0 20px 14px", display: "flex", gap: 12 }}>
                      <div style={{
                        flex: 1, padding: "10px 14px", borderRadius: 10,
                        background: "#ecfdf5", border: "1px solid #a7f3d0",
                        textAlign: "center",
                      }}>
                        <div style={{ fontSize: 10, color: "#059669", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>Peak Month</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#059669", marginTop: 4 }}>{s.peakMonth}</div>
                      </div>
                      <div style={{
                        flex: 1, padding: "10px 14px", borderRadius: 10,
                        background: "#f0f9ff", border: "1px solid #bae6fd",
                        textAlign: "center",
                      }}>
                        <div style={{ fontSize: 10, color: "#0369a1", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>Slowest Month</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#0369a1", marginTop: 4 }}>{s.lowMonth}</div>
                      </div>
                    </div>

                    {/* Insight */}
                    <div style={{
                      padding: "12px 20px", borderTop: "1px solid #f1f5f9",
                      background: "#fafbfc", fontSize: 12, color: "#64748b", lineHeight: 1.5,
                    }}>
                      {s.insight}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============ TAB: SMART ACTIONS ============ */}
        {tab === "mix" && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0",
              borderRadius: 10, marginBottom: 20, fontSize: 13, color: "#065f46",
            }}>
              <Zap size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>AI-recommended actions</strong> to optimize your product mix.
                Each suggestion is based on sales trends across all machines.
              </span>
            </div>

            {/* Group by machine */}
            {(() => {
              const grouped: Record<string, ProductMixRec[]> = {};
              productMixRecs.forEach(r => {
                if (!grouped[r.machine]) grouped[r.machine] = [];
                grouped[r.machine].push(r);
              });
              return Object.entries(grouped).map(([machine, recs]) => (
                <div key={machine} style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 10,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <Package size={16} color="#64748b" />
                    {machine}
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: "#64748b", background: "#f1f5f9",
                      padding: "2px 8px", borderRadius: 6,
                    }}>{recs.length} actions</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {recs.map((r, i) => {
                      const ac = actionConfig[r.action];
                      const AcIcon = ac.icon;
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "14px 18px", background: "#fff",
                          borderRadius: 12, border: `1px solid ${ac.border}`,
                          transition: "all 0.15s",
                          flexWrap: isMobile ? "wrap" : "nowrap",
                        }}>
                          {/* Action Icon */}
                          <div style={{
                            width: 38, height: 38, borderRadius: 10, background: ac.bg,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            border: `1px solid ${ac.border}`,
                          }}>
                            <AcIcon size={18} color={ac.color} />
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 150 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: ac.color, background: ac.bg,
                                padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5,
                              }}>{r.action}</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{r.product}</span>
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.4 }}>{r.reason}</div>
                          </div>

                          {/* Impact */}
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{
                              fontSize: 14, fontWeight: 800,
                              color: r.action === "Add" || r.action === "Increase" ? "#059669" : "#64748b",
                            }}>{r.estimatedImpact}</div>
                            <div style={{ marginTop: 4 }}>
                              <ConfidenceBar value={r.confidence} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* Footer Note */}
        <div style={{
          marginTop: 28, padding: "16px 20px", background: "#f8fafc",
          border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12, color: "#94a3b8",
          lineHeight: 1.6, display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Predictions are generated using {data.dataRange.months} months of Nayax transaction data
            ({data.dataRange.start} to {data.dataRange.end}). The model uses linear trend analysis with seasonal
            adjustments. Confidence reflects how consistent the historical pattern is. Click &quot;Retrain&quot; after adding new
            sales data to update predictions.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable Components                                                */
/* ------------------------------------------------------------------ */

function SummaryCard({ icon, iconColor, iconBg, title, value, subtitle, badge, badgeColor }: {
  icon: React.ReactNode; iconColor: string; iconBg: string;
  title: string; value: string; subtitle: string;
  badge: string; badgeColor: string;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
      padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: iconBg,
          display: "flex", alignItems: "center", justifyContent: "center", color: iconColor,
        }}>{icon}</div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: badgeColor,
          background: badgeColor === "#059669" ? "#ecfdf5" : badgeColor === "#dc2626" ? "#fef2f2" : "#fffbeb",
          padding: "3px 10px", borderRadius: 6,
          border: `1px solid ${badgeColor}22`,
        }}>{badge}</span>
      </div>
      <div>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 4, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 50, height: 5, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3,
          width: `${value}%`,
          background: value >= 85 ? "#059669" : value >= 70 ? "#d97706" : "#94a3b8",
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>{value}%</span>
    </div>
  );
}
