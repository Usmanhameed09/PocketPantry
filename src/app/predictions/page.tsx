"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import Header from "@/components/Header";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Zap,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Truck,
  ThermometerSun,
  Snowflake,
  Sun,
  Leaf,
  Package,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TimeRange = "7 Days" | "30 Days" | "90 Days";
type RecAction = "Add" | "Remove" | "Increase" | "Decrease";
type Season = "Spring" | "Summer" | "Fall" | "Winter";

interface MachineForecast {
  machine: string;
  location: string;
  currentWeekly: number;
  predictedWeekly: number;
  change: number;          // percentage
  confidence: number;      // model confidence %
  topProduct: string;
  weakProduct: string;
  predictedRefillDate: string;
  daysUntilRefill: number;
}

interface ProductPerformance {
  product: string;
  machine: string;
  avgDailySales: number;
  predictedDailySales: number;
  trend: "up" | "down" | "stable";
  trendPct: number;
  revenueShare: number;     // % of machine's total revenue
  recommendation: RecAction | null;
  reason: string;
}

interface SeasonalTrend {
  product: string;
  currentSeason: Season;
  seasonalChange: number;   // % change expected this season vs last
  peakMonth: string;
  lowMonth: string;
  insight: string;
}

interface ProductMixRec {
  machine: string;
  action: RecAction;
  product: string;
  reason: string;
  estimatedImpact: string;  // e.g. "+$12/week"
  confidence: number;
}

/* ------------------------------------------------------------------ */
/*  Test Data                                                          */
/*  Based on 1.5 years of Nayax transaction history                    */
/*  All predictions are what a time-series model would output          */
/* ------------------------------------------------------------------ */

const machineForecast: MachineForecast[] = [
  {
    machine: "Baker Nissan Sales", location: "12090 Katy Fwy",
    currentWeekly: 473.50, predictedWeekly: 512.00, change: 8.1, confidence: 89,
    topProduct: "Red Bull 12 oz", weakProduct: "Cheese Crackers",
    predictedRefillDate: "Mar 17", daysUntilRefill: 2,
  },
  {
    machine: "B4 Lumber", location: "6815 Airline Dr",
    currentWeekly: 318.95, predictedWeekly: 342.00, change: 7.2, confidence: 91,
    topProduct: "Monster Energy", weakProduct: "Baked Lays",
    predictedRefillDate: "Mar 19", daysUntilRefill: 4,
  },
  {
    machine: "Reynolds Nationwide", location: "3411 Richmond Ave",
    currentWeekly: 236.10, predictedWeekly: 228.00, change: -3.4, confidence: 85,
    topProduct: "Celsius Arctic Vibe", weakProduct: "Oatmeal Cookie",
    predictedRefillDate: "Mar 20", daysUntilRefill: 5,
  },
  {
    machine: "Hartman 16300", location: "16300 Hartman Rd",
    currentWeekly: 124.60, predictedWeekly: 118.00, change: -5.3, confidence: 82,
    topProduct: "Celsius Tropical Vibe", weakProduct: "Rice Krispies Treat",
    predictedRefillDate: "Mar 22", daysUntilRefill: 7,
  },
  {
    machine: "Hartman 1400-1", location: "1400 Hartman Ln",
    currentWeekly: 221.35, predictedWeekly: 245.00, change: 10.7, confidence: 88,
    topProduct: "Sour Cream Ruffles", weakProduct: "Trail Mix",
    predictedRefillDate: "Mar 18", daysUntilRefill: 3,
  },
  {
    machine: "American Fire", location: "9200 Westpark Dr",
    currentWeekly: 125.95, predictedWeekly: 130.00, change: 3.2, confidence: 79,
    topProduct: "CSF Peanut Butter", weakProduct: "Granola Bar",
    predictedRefillDate: "Mar 21", daysUntilRefill: 6,
  },
];

const productPerformance: ProductPerformance[] = [
  { product: "Red Bull 12 oz", machine: "Baker Nissan Sales", avgDailySales: 4.2, predictedDailySales: 4.8, trend: "up", trendPct: 14, revenueShare: 28, recommendation: null, reason: "Strong performer" },
  { product: "Monster Energy", machine: "B4 Lumber", avgDailySales: 3.8, predictedDailySales: 4.1, trend: "up", trendPct: 8, revenueShare: 24, recommendation: "Increase", reason: "Consistently high demand — consider adding a 2nd facing" },
  { product: "Celsius Tropical Vibe", machine: "Hartman 16300", avgDailySales: 2.1, predictedDailySales: 2.8, trend: "up", trendPct: 33, revenueShare: 22, recommendation: "Increase", reason: "Rising demand — trending product in this location" },
  { product: "Snickers", machine: "Baker Nissan Sales", avgDailySales: 2.5, predictedDailySales: 2.4, trend: "stable", trendPct: -2, revenueShare: 12, recommendation: null, reason: "Stable baseline performer" },
  { product: "Sour Cream Ruffles", machine: "Hartman 1400-1", avgDailySales: 2.0, predictedDailySales: 2.3, trend: "up", trendPct: 15, revenueShare: 18, recommendation: null, reason: "Trending up at this location" },
  { product: "Oatmeal Cookie", machine: "Reynolds Nationwide", avgDailySales: 0.3, predictedDailySales: 0.2, trend: "down", trendPct: -33, revenueShare: 2, recommendation: "Remove", reason: "Consistently low sales — 0.2 units/day predicted. Replace with a drink." },
  { product: "Rice Krispies Treat", machine: "Hartman 16300", avgDailySales: 0.4, predictedDailySales: 0.3, trend: "down", trendPct: -25, revenueShare: 3, recommendation: "Remove", reason: "Dead stock — only 2 sold last month. Swap for Cheetos Flamin' Hot." },
  { product: "Trail Mix", machine: "Hartman 1400-1", avgDailySales: 0.5, predictedDailySales: 0.3, trend: "down", trendPct: -40, revenueShare: 3, recommendation: "Remove", reason: "Declining steadily for 3 months. Workers prefer salty snacks here." },
  { product: "Baked Lays", machine: "B4 Lumber", avgDailySales: 0.6, predictedDailySales: 0.4, trend: "down", trendPct: -33, revenueShare: 3, recommendation: "Decrease", reason: "Low demand — reduce from 2 facings to 1, add Doritos Nacho instead." },
  { product: "Cheese Crackers", machine: "Baker Nissan Sales", avgDailySales: 0.3, predictedDailySales: 0.2, trend: "down", trendPct: -33, revenueShare: 1, recommendation: "Remove", reason: "Worst performer across all machines. 0 sales some weeks." },
];

const seasonalTrends: SeasonalTrend[] = [
  { product: "Celsius Tropical Vibe", currentSeason: "Spring", seasonalChange: 22, peakMonth: "July", lowMonth: "December", insight: "Energy drinks spike in summer. Stock up by June — predicted +22% demand vs current." },
  { product: "Monster Energy", currentSeason: "Spring", seasonalChange: 18, peakMonth: "August", lowMonth: "January", insight: "Follows summer heat pattern. Peak demand August. Plan extra inventory." },
  { product: "Red Bull 12 oz", currentSeason: "Spring", seasonalChange: 15, peakMonth: "July", lowMonth: "November", insight: "Consistent year-round but +15% summer bump. Top revenue driver across fleet." },
  { product: "Snickers", currentSeason: "Spring", seasonalChange: -8, peakMonth: "October", lowMonth: "July", insight: "Chocolate melting risk in summer reduces sales. Peaks around Halloween." },
  { product: "Doritos Nacho", currentSeason: "Spring", seasonalChange: 5, peakMonth: "February", lowMonth: "June", insight: "Slight Super Bowl / sports season bump. Relatively stable year-round." },
  { product: "Granola Bar", currentSeason: "Spring", seasonalChange: -15, peakMonth: "January", lowMonth: "August", insight: "New Year health trend drives Jan sales. Drops significantly by summer." },
];

const productMixRecs: ProductMixRec[] = [
  { machine: "Hartman 16300", action: "Remove", product: "Rice Krispies Treat", reason: "Only 2 sold in last 30 days. Predicted to sell 0.3/day.", estimatedImpact: "Free up 1 slot", confidence: 92 },
  { machine: "Hartman 16300", action: "Add", product: "Cheetos Flamin' Hot", reason: "Top seller at nearby Hartman 1400-1 (1.4/day). Similar worker demographic.", estimatedImpact: "+$8.40/week", confidence: 78 },
  { machine: "Reynolds Nationwide", action: "Remove", product: "Oatmeal Cookie", reason: "0.2 units/day. Lowest performer across all machines.", estimatedImpact: "Free up 1 slot", confidence: 94 },
  { machine: "Reynolds Nationwide", action: "Add", product: "Celsius Arctic Vibe", reason: "Already top seller here. Add 2nd facing to reduce stockouts.", estimatedImpact: "+$11.20/week", confidence: 85 },
  { machine: "B4 Lumber", action: "Decrease", product: "Baked Lays", reason: "0.4/day from 2 facings. Reduce to 1 facing.", estimatedImpact: "Free up 1 slot", confidence: 88 },
  { machine: "B4 Lumber", action: "Add", product: "Doritos Nacho", reason: "Sells well at 4 other machines (1.0/day avg). Not stocked here yet.", estimatedImpact: "+$6.50/week", confidence: 74 },
  { machine: "Baker Nissan Sales", action: "Remove", product: "Cheese Crackers", reason: "Worst product in fleet. 0 sales some weeks.", estimatedImpact: "Free up 1 slot", confidence: 96 },
  { machine: "Baker Nissan Sales", action: "Add", product: "Celsius Tropical Vibe", reason: "Rising trend across fleet (+33%). Dealership staff skew young.", estimatedImpact: "+$14.00/week", confidence: 81 },
];

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const actionStyle: Record<RecAction, { color: string; bg: string; icon: typeof ArrowUpRight }> = {
  Add:      { color: "#059669", bg: "#d1fae5", icon: ArrowUpRight },
  Remove:   { color: "#dc2626", bg: "#fee2e2", icon: XCircle },
  Increase: { color: "#2563eb", bg: "#dbeafe", icon: TrendingUp },
  Decrease: { color: "#d97706", bg: "#fef3c7", icon: TrendingDown },
};

const seasonIcon: Record<Season, typeof Sun> = {
  Spring: Leaf, Summer: Sun, Fall: Leaf, Winter: Snowflake,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PredictionsPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [tab, setTab] = useState<"overview" | "products" | "seasonal" | "mix">("overview");
  const [timeRange, setTimeRange] = useState<TimeRange>("7 Days");

  const totalPredictedWeekly = machineForecast.reduce((s, m) => s + m.predictedWeekly, 0);
  const totalCurrentWeekly = machineForecast.reduce((s, m) => s + m.currentWeekly, 0);
  const overallChange = ((totalPredictedWeekly - totalCurrentWeekly) / totalCurrentWeekly * 100).toFixed(1);
  const avgConfidence = Math.round(machineForecast.reduce((s, m) => s + m.confidence, 0) / machineForecast.length);
  const recsCount = productMixRecs.length;
  const deadProducts = productPerformance.filter(p => p.recommendation === "Remove").length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Predictions" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Model Info Banner */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
          borderRadius: 14, padding: "18px 24px", marginBottom: 24, color: "#fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Brain size={24} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Sales Prediction Model</div>
              <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
                Trained on 1.5 years of Nayax transaction data · {machineForecast.length} machines · Last trained: Mar 14, 2026
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Accuracy</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{avgConfidence}%</div>
            </div>
            <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.2)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Data Points</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>24.8K</div>
            </div>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
              marginLeft: 8,
            }}>
              <RefreshCw size={14} /> Retrain Model
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatBox icon={<TrendingUp size={20} color="#059669" />} iconBg="#d1fae5"
            label="Predicted Weekly Revenue" value={`$${totalPredictedWeekly.toLocaleString()}`}
            sub={<span style={{ color: Number(overallChange) >= 0 ? "#059669" : "#dc2626", fontWeight: 600, fontSize: 12 }}>
              {Number(overallChange) >= 0 ? "↑" : "↓"} {overallChange}% vs current
            </span>} />
          <StatBox icon={<Target size={20} color="#2563eb" />} iconBg="#dbeafe"
            label="Model Confidence" value={`${avgConfidence}%`}
            sub={<span style={{ fontSize: 12, color: "#94a3b8" }}>Avg across all machines</span>} />
          <StatBox icon={<Zap size={20} color="#d97706" />} iconBg="#fef3c7"
            label="Product Mix Actions" value={`${recsCount}`}
            sub={<span style={{ fontSize: 12, color: "#d97706", fontWeight: 500 }}>{deadProducts} dead products to remove</span>} />
          <StatBox icon={<Truck size={20} color="#6366f1" />} iconBg="#e0e7ff"
            label="Next Refill" value={machineForecast.sort((a, b) => a.daysUntilRefill - b.daysUntilRefill)[0].machine.split(" ")[0]}
            sub={<span style={{ fontSize: 12, color: "#dc2626", fontWeight: 500 }}>
              In {machineForecast.sort((a, b) => a.daysUntilRefill - b.daysUntilRefill)[0].daysUntilRefill} days
            </span>} />
        </div>

        {/* Tabs */}
        <div className="tab-bar" style={{
          display: "flex", gap: 0, borderBottom: "2px solid #e5e7eb", marginBottom: 24,
        }}>
          {([
            { key: "overview", label: "Revenue Forecast" },
            { key: "products", label: "Product Performance" },
            { key: "seasonal", label: "Seasonal Trends" },
            { key: "mix", label: "Product Mix Recommendations" },
          ] as { key: typeof tab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 600, border: "none",
              cursor: "pointer", background: "transparent",
              color: tab === t.key ? "#2563eb" : "#9ca3af",
              borderBottom: tab === t.key ? "2px solid #2563eb" : "2px solid transparent",
              marginBottom: -2, transition: "all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ============ TAB: Revenue Forecast ============ */}
        {tab === "overview" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 700,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 120px 130px 80px 1.8fr 90px 100px",
              padding: "14px 22px", borderBottom: "1px solid #e5e7eb", background: "#f1f5f9",
            }}>
              <TH>Machine</TH>
              <TH>Current / Week</TH>
              <TH>Predicted / Week</TH>
              <TH>Change</TH>
              <TH>Top → Weak Product</TH>
              <TH>Refill In</TH>
              <TH>Confidence</TH>
            </div>
            {machineForecast.map((m) => (
              <div key={m.machine} style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 120px 130px 80px 1.8fr 90px 100px",
                padding: "16px 22px", borderBottom: "1px solid #f3f4f6", alignItems: "center",
                transition: "background 0.1s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{m.machine}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.location}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>${m.currentWeekly.toFixed(0)}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>${m.predictedWeekly.toFixed(0)}</div>
                <div>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    fontSize: 12, fontWeight: 600,
                    color: m.change >= 0 ? "#059669" : "#dc2626",
                  }}>
                    {m.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {m.change >= 0 ? "+" : ""}{m.change}%
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden", minWidth: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#059669", background: "#d1fae5", padding: "2px 8px", borderRadius: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "42%" }}>
                    {m.topProduct}
                  </span>
                  <ArrowRight size={11} color="#d1d5db" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#dc2626", background: "#fee2e2", padding: "2px 8px", borderRadius: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "42%" }}>
                    {m.weakProduct}
                  </span>
                </div>
                <div>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: m.daysUntilRefill <= 2 ? "#dc2626" : m.daysUntilRefill <= 4 ? "#d97706" : "#059669",
                  }}>
                    {m.daysUntilRefill} days
                  </span>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.predictedRefillDate}</div>
                </div>
                <div>
                  <ConfidenceBar value={m.confidence} />
                </div>
              </div>
            ))}
          </div>
          </div>
        )}

        {/* ============ TAB: Product Performance ============ */}
        {tab === "products" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 700,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 1fr 100px 110px 80px 80px 1.5fr",
              padding: "14px 22px", borderBottom: "1px solid #e5e7eb", background: "#f1f5f9",
            }}>
              <TH>Product</TH>
              <TH>Machine</TH>
              <TH>Avg / Day</TH>
              <TH>Predicted / Day</TH>
              <TH>Trend</TH>
              <TH>Rev %</TH>
              <TH>Recommendation</TH>
            </div>
            {productPerformance.map((p, i) => {
              const recStyle = p.recommendation ? actionStyle[p.recommendation] : null;
              return (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr 1fr 100px 110px 80px 80px 1.5fr",
                  padding: "14px 22px", borderBottom: "1px solid #f3f4f6", alignItems: "center",
                  background: p.recommendation === "Remove" ? "#fffbfb" : "transparent",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = p.recommendation === "Remove" ? "#fee2e2" : "#f9fafb"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = p.recommendation === "Remove" ? "#fffbfb" : "transparent"; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{p.product}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{p.machine}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{p.avgDailySales.toFixed(1)}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{p.predictedDailySales.toFixed(1)}</div>
                  <div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 2,
                      fontSize: 12, fontWeight: 600,
                      color: p.trend === "up" ? "#059669" : p.trend === "down" ? "#dc2626" : "#6b7280",
                    }}>
                      {p.trend === "up" ? <ArrowUpRight size={12} /> : p.trend === "down" ? <ArrowDownRight size={12} /> : null}
                      {p.trendPct > 0 ? "+" : ""}{p.trendPct}%
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#374151" }}>{p.revenueShare}%</div>
                  <div>
                    {recStyle ? (
                      <div>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 11, fontWeight: 600, color: recStyle.color, background: recStyle.bg,
                          padding: "3px 10px", borderRadius: 10,
                        }}>
                          {p.recommendation}
                        </span>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, lineHeight: 1.3 }}>{p.reason}</div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{p.reason}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* ============ TAB: Seasonal Trends ============ */}
        {tab === "seasonal" && (
          <div className="cards-grid-2" style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
            {seasonalTrends.map((s, i) => {
              const SeasonIcon = seasonIcon[s.currentSeason];
              return (
                <div key={i} style={{
                  background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
                  padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{s.product}</div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 12, fontWeight: 600,
                      color: s.seasonalChange >= 0 ? "#059669" : "#dc2626",
                      background: s.seasonalChange >= 0 ? "#d1fae5" : "#fee2e2",
                      padding: "4px 10px", borderRadius: 10,
                    }}>
                      {s.seasonalChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {s.seasonalChange >= 0 ? "+" : ""}{s.seasonalChange}% this season
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#059669" }}>
                      <Sun size={13} /> Peak: {s.peakMonth}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#2563eb" }}>
                      <Snowflake size={13} /> Low: {s.lowMonth}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 12, color: "#64748b", lineHeight: 1.5,
                    background: "#f1f5f9", padding: "10px 14px", borderRadius: 8,
                  }}>
                    {s.insight}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ============ TAB: Product Mix Recommendations ============ */}
        {tab === "mix" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 700,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 90px 1fr 1.8fr 110px 90px",
              padding: "14px 22px", borderBottom: "1px solid #e5e7eb", background: "#f1f5f9",
            }}>
              <TH>Machine</TH>
              <TH>Action</TH>
              <TH>Product</TH>
              <TH>Reason</TH>
              <TH>Est. Impact</TH>
              <TH>Confidence</TH>
            </div>
            {productMixRecs.map((r, i) => {
              const as = actionStyle[r.action];
              return (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 90px 1fr 1.8fr 110px 90px",
                  padding: "14px 22px", borderBottom: "1px solid #f3f4f6", alignItems: "center",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{r.machine}</div>
                  <div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, fontWeight: 600, color: as.color, background: as.bg,
                      padding: "4px 10px", borderRadius: 10,
                    }}>{r.action}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{r.product}</div>
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{r.reason}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: r.action === "Remove" || r.action === "Decrease" ? "#6b7280" : "#059669" }}>
                    {r.estimatedImpact}
                  </div>
                  <div><ConfidenceBar value={r.confidence} /></div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* How it works */}
        <div style={{
          marginTop: 20, padding: "14px 18px", background: "#dbeafe",
          border: "1px solid #bfdbfe", borderRadius: 10, fontSize: 12, color: "#1e40af",
          lineHeight: 1.6,
        }}>
          <strong>How predictions work:</strong> The model is trained on 1.5 years of Nayax transaction
          data (24.8K+ transactions across {machineForecast.length} machines). It uses time-series
          forecasting to predict sales velocity per product per machine, identifies seasonal patterns,
          and recommends product mix changes based on cross-machine performance comparisons.
          Confidence scores reflect how much historical data supports each prediction.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", minWidth: 40 }}>
        <div style={{
          height: "100%", borderRadius: 3,
          width: `${value}%`,
          background: value >= 85 ? "#059669" : value >= 70 ? "#d97706" : "#dc2626",
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", minWidth: 30 }}>{value}%</span>
    </div>
  );
}

function StatBox({ icon, iconBg, label, value, sub }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
      padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        <div style={{ marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "#4b5563",
      textTransform: "uppercase" as const, letterSpacing: 0.5,
    }}>{children}</div>
  );
}
