"use client";

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
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
  Truck,
  Sun,
  Loader2,
  AlertCircle,
  DollarSign,
  Package,
  Clock,
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
  monthlyRevenue?: Record<string, number>;
  monthlyIndex?: Record<string, number>;
}

interface ProductMixRec {
  machine: string;
  action: RecAction;
  product: string;
  reason: string;
  estimatedImpact: string;
  confidence: number;
}

interface TemplateItem {
  product: string;
  status: "Keep" | "Add" | "Watch" | "Remove";
  machineDailyRate: number | null;
  fleetTrend: "up" | "down" | "stable";
  fleetTrendPct: number;
  reason: string;
}

interface TemplateCategory {
  name: string;
  targetCount: number;
  actualCount: number;
  items: TemplateItem[];
}

interface MachineTemplate {
  machine: string;
  tier: "high" | "medium" | "small";
  totalSlots: number;
  filledSlots: number;
  categories: TemplateCategory[];
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
  machineTemplates?: MachineTemplate[];
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<"overview" | "products" | "seasonal" | "plan">("overview");
  const [templateMachine, setTemplateMachine] = useState<string | null>(null);
  const [smartActionMachine, setSmartActionMachine] = useState<string | null>(null);
  const [data, setData] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const invalidFiles = files.filter((file) => !file.name.toLowerCase().endsWith(".zip"));

    if (invalidFiles.length > 0) {
      setSelectedFiles([]);
      event.target.value = "";
      setStatusMessage(null);
      setError("Only monthly .zip archives can be uploaded for retraining.");
      return;
    }

    setError(null);
    setStatusMessage(null);
    setSelectedFiles(files);
  };

  const handleRetrain = async () => {
    try {
      setRetraining(true);
      setError(null);
      setStatusMessage(null);

      const requestInit: RequestInit = { method: "POST" };
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append("files", file, file.name));
        requestInit.body = formData;
      }

      const res = await fetch("/api/predictions", requestInit);
      const result = await res.json().catch(() => ({ error: "Retrain failed" }));
      if (!res.ok) {
        throw new Error(result.error || "Retrain failed");
      }

      const uploadedCount = Array.isArray(result.uploadedFiles) ? result.uploadedFiles.length : 0;
      setStatusMessage(
        uploadedCount > 0
          ? `Uploaded ${uploadedCount} new monthly zip${uploadedCount === 1 ? "" : "s"} and retrained the model.`
          : "Model retrained using the existing sales archives."
      );
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
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
  const machineTemplates = data.machineTemplates || [];

  const totalPredictedWeekly = machineForecast.reduce((s, m) => s + m.predictedWeekly, 0);
  const totalCurrentWeekly = machineForecast.reduce((s, m) => s + m.currentWeekly, 0);
  const overallChangePct = ((totalPredictedWeekly - totalCurrentWeekly) / totalCurrentWeekly * 100);
  const deadProducts = productPerformance.filter(p => p.recommendation === "Remove").length;
  const generatedDate = new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const maxWeekly = Math.max(...machineForecast.map(m => Math.max(m.currentWeekly, m.predictedWeekly)));

  const tabItems: { key: typeof tab; label: string; icon: typeof BarChart3; count?: number }[] = [
    { key: "overview",  label: "Machine Forecast",  icon: BarChart3 },
    { key: "plan",      label: "Machine Plan",       icon: Zap,        count: productMixRecs.length + machineTemplates.length || undefined },
    { key: "products",  label: "Product Health",     icon: Package,    count: deadProducts > 0 ? deadProducts : undefined },
    { key: "seasonal",  label: "Seasonal Trends",    icon: Sun },
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
              {retraining ? "Retraining..." : selectedFiles.length > 0 ? "Upload & Retrain" : "Retrain"}
            </button>
          </div>
        </div>

        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 24,
          padding: isMobile ? 16 : "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Add New Monthly Sales Zip Files</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.5 }}>
              Upload new Nayax monthly `.zip` files here, then retrain so the model extends beyond the current {data.dataRange.months}-month history.
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
              Uploaded files are kept in the prediction training folder and included automatically in future retrains.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "stretch" : "flex-end", gap: 10, minWidth: isMobile ? "100%" : 340 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              multiple
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", gap: 10, width: "100%", flexDirection: isMobile ? "column" : "row" }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "10px 16px", background: "#f8fafc", color: "#0f172a",
                  border: "1px solid #cbd5e1", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  flex: isMobile ? undefined : 1,
                }}
              >
                {selectedFiles.length > 0 ? "Change Files" : "Choose Zip Files"}
              </button>
              <button
                type="button"
                onClick={handleRetrain}
                disabled={retraining}
                style={{
                  padding: "10px 16px", background: "#16a34a", color: "#fff",
                  border: "1px solid #16a34a", borderRadius: 10, fontSize: 13, fontWeight: 700,
                  cursor: retraining ? "not-allowed" : "pointer", opacity: retraining ? 0.5 : 1,
                  flex: isMobile ? undefined : 1,
                }}
              >
                {retraining ? "Processing..." : selectedFiles.length > 0 ? `Upload ${selectedFiles.length} & Retrain` : "Retrain Current Data"}
              </button>
            </div>
            <div style={{ width: "100%", fontSize: 12, color: selectedFiles.length > 0 ? "#0f766e" : "#94a3b8", lineHeight: 1.5 }}>
              {selectedFiles.length > 0
                ? `Ready: ${selectedFiles.map((file) => file.name).join(", ")}`
                : "No new monthly zip files selected yet."}
            </div>
            {statusMessage && (
              <div style={{
                width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 12,
                background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46",
              }}>
                {statusMessage}
              </div>
            )}
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

            <SeasonalCalendar trends={seasonalTrends} isMobile={isMobile} />
          </div>
        )}

        {/* ============ TAB: SMART ACTIONS ============ */}
        {tab === "plan" && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0",
              borderRadius: 10, marginBottom: 20, fontSize: 13, color: "#065f46",
            }}>
              <Zap size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>Machine Plan</strong> â€” pick a machine to see both the immediate <em>Smart Actions</em> (urgent stock changes) and the <em>Full Template</em> (target planogram). One screen, no tab-switching.
              </span>
            </div>

            {(() => {
              const grouped = new Map<string, ProductMixRec[]>();
              for (const r of productMixRecs) {
                if (!grouped.has(r.machine)) grouped.set(r.machine, []);
                grouped.get(r.machine)!.push(r);
              }
              const machineOrder = machineForecast.map(m => m.machine).filter(m => grouped.has(m) || machineTemplates.some(t => t.machine === m));
              for (const m of grouped.keys()) {
                if (!machineOrder.includes(m)) machineOrder.push(m);
              }
              for (const t of machineTemplates) {
                if (!machineOrder.includes(t.machine)) machineOrder.push(t.machine);
              }

              if (machineOrder.length === 0) {
                return (
                  <div style={{
                    padding: 32, textAlign: "center", background: "#fff",
                    border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 13,
                  }}>
                    No plan data yet â€” retrain the model to generate.
                  </div>
                );
              }

              // Default to first machine so both panels populate immediately.
              const selected = smartActionMachine && machineOrder.includes(smartActionMachine)
                ? smartActionMachine
                : machineOrder[0];
              const items = grouped.get(selected) || [];
              const template = machineTemplates.find(t => t.machine === selected) || null;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Machine chip selector â€” horizontal scroll on mobile */}
                  <div style={{
                    display: "flex", gap: 6, overflowX: "auto",
                    WebkitOverflowScrolling: "touch", padding: "2px 0 4px",
                  }}>
                    {machineOrder.map((m) => {
                      const actionCount = (grouped.get(m) || []).length;
                      const tpl = machineTemplates.find(t => t.machine === m);
                      const slotInfo = tpl ? `${tpl.filledSlots}/${tpl.totalSlots} slots` : "";
                      const actionInfo = actionCount > 0 ? `${actionCount} action${actionCount === 1 ? "" : "s"}` : "";
                      const sub = [actionInfo, slotInfo].filter(Boolean).join(" Â· ") || "view plan";
                      return (
                        <MachineChip
                          key={m}
                          label={m}
                          sub={sub}
                          active={selected === m}
                          onClick={() => setSmartActionMachine(m)}
                        />
                      );
                    })}
                  </div>

                  {/* Side-by-side: Smart Actions (left) + Template (right) on desktop, stacked on mobile */}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile || isTablet ? "1fr" : "1fr 1fr", gap: 16 }}>
                    {/* LEFT: Smart Actions */}
                    <div style={{
                      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden",
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "12px 16px", background: "#ecfdf5", borderBottom: "1px solid #a7f3d0",
                      }}>
                        <Zap size={16} color="#059669" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#065f46" }}>Smart Actions</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", background: "#fff", padding: "2px 8px", borderRadius: 6 }}>
                          {items.length} for {selected}
                        </span>
                      </div>
                      {items.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                          No urgent actions for this machine right now.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
                          {(() => {
                            const machine = selected;
                            return null;
                          })()}
                          {(() => null)()}
                          {items.map((r, i) => {
                            const ac = actionConfig[r.action];
                            const AcIcon = ac.icon;
                            return (
                              <div key={i} style={{
                                display: "flex", alignItems: "center", gap: 12,
                                padding: "10px 12px", background: "#fff",
                                borderRadius: 10, border: `1px solid ${ac.border}`,
                                flexWrap: "wrap",
                              }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: 8, background: ac.bg,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  flexShrink: 0, border: `1px solid ${ac.border}`,
                                }}>
                                  <AcIcon size={15} color={ac.color} />
                                </div>
                                <div style={{ flex: 1, minWidth: 120 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, color: ac.color, background: ac.bg,
                                      padding: "2px 7px", borderRadius: 5, textTransform: "uppercase", letterSpacing: 0.4,
                                    }}>{r.action}</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{r.product}</span>
                                  </div>
                                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, lineHeight: 1.4 }}>{r.reason}</div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <div style={{
                                    fontSize: 13, fontWeight: 800,
                                    color: r.action === "Add" || r.action === "Increase" ? "#059669" : "#64748b",
                                  }}>{r.estimatedImpact}</div>
                                  <div style={{ marginTop: 3 }}>
                                    <ConfidenceBar value={r.confidence} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* RIGHT: Full Template */}
                    <div style={{
                      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden",
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "12px 16px", background: "#eef2ff", borderBottom: "1px solid #c7d2fe",
                      }}>
                        <Package size={16} color="#6366f1" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>Full Template</span>
                        {template && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", background: "#fff", padding: "2px 8px", borderRadius: 6 }}>
                            {template.filledSlots}/{template.totalSlots} slots Â· {template.tier} tier
                          </span>
                        )}
                      </div>
                      {!template ? (
                        <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                          No template available for this machine yet.
                        </div>
                      ) : (
                        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                          {template.categories.map((cat) => (
                            <div key={cat.name} style={{
                              border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden",
                            }}>
                              <div style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
                              }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{cat.name}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: "#e2e8f0", color: "#475569" }}>
                                  {cat.actualCount}/{cat.targetCount}
                                </span>
                              </div>
                              <div style={{ padding: 6 }}>
                                {cat.items.map((it, i) => {
                                  const statusColor = it.status === "Keep" ? "#059669"
                                    : it.status === "Add" ? "#3b82f6"
                                    : it.status === "Watch" ? "#d97706"
                                    : "#dc2626";
                                  const statusBg = it.status === "Keep" ? "#ecfdf5"
                                    : it.status === "Add" ? "#eff6ff"
                                    : it.status === "Watch" ? "#fffbeb"
                                    : "#fef2f2";
                                  const trendArrow = it.fleetTrend === "up" ? "â†—" : it.fleetTrend === "down" ? "â†˜" : "â†’";
                                  const trendColor = it.fleetTrend === "up" ? "#059669" : it.fleetTrend === "down" ? "#dc2626" : "#94a3b8";
                                  return (
                                    <div key={i} style={{
                                      display: "flex", alignItems: "center", gap: 8,
                                      padding: "6px 8px", borderRadius: 6,
                                      background: i % 2 === 0 ? "transparent" : "#fafbfc",
                                      flexWrap: "wrap",
                                    }}>
                                      <span style={{
                                        flexShrink: 0, fontSize: 9, fontWeight: 700, padding: "2px 6px",
                                        borderRadius: 4, background: statusBg, color: statusColor,
                                        textTransform: "uppercase", letterSpacing: 0.4,
                                        minWidth: 40, textAlign: "center",
                                      }}>{it.status}</span>
                                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#0f172a", minWidth: 100 }}>{it.product}</span>
                                      <span style={{ fontSize: 10, color: trendColor, fontWeight: 700, minWidth: 44 }}>
                                        {trendArrow} {it.fleetTrendPct > 0 ? "+" : ""}{it.fleetTrendPct}%
                                      </span>
                                      <span style={{ fontSize: 10, color: "#64748b", minWidth: 60, textAlign: "right" }}>
                                        {it.machineDailyRate !== null ? `${it.machineDailyRate.toFixed(1)}/d` : "â€”"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
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

/* ------------------------------------------------------------------ */
/*  Seasonal Calendar Heatmap                                          */
/* ------------------------------------------------------------------ */

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function heatColor(index: number): { bg: string; text: string } {
  // index: 1.0 = average. >1 hot (green), <1 cold (blue), 0 = no data (gray)
  if (!index || index <= 0) return { bg: "#f1f5f9", text: "#94a3b8" };
  if (index >= 1.3) return { bg: "#059669", text: "#ffffff" };   // peak
  if (index >= 1.1) return { bg: "#34d399", text: "#064e3b" };   // hot
  if (index >= 0.95) return { bg: "#ecfdf5", text: "#065f46" };  // avg-hot
  if (index >= 0.8) return { bg: "#eff6ff", text: "#1e40af" };   // avg-cool
  if (index >= 0.6) return { bg: "#bfdbfe", text: "#1e3a8a" };   // cool
  return { bg: "#3b82f6", text: "#ffffff" };                      // cold
}

function SeasonalCalendar({ trends, isMobile }: { trends: SeasonalTrend[]; isMobile: boolean }) {
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Legend */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "10px 14px", background: "#fff", borderRadius: 10,
        border: "1px solid #e2e8f0", fontSize: 11, color: "#64748b",
      }}>
        <span style={{ fontWeight: 600, color: "#374151" }}>Legend:</span>
        <LegendSwatch color="#059669" label="Peak (>30% above avg)" />
        <LegendSwatch color="#34d399" label="Hot (+10â€“30%)" />
        <LegendSwatch color="#ecfdf5" label="Average" textColor="#065f46" />
        <LegendSwatch color="#bfdbfe" label="Cool (-20â€“40%)" textColor="#1e3a8a" />
        <LegendSwatch color="#3b82f6" label="Cold (-40%+)" />
        <LegendSwatch color="#f1f5f9" label="No data" textColor="#94a3b8" />
      </div>

      {/* Calendar grid */}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
        overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        {/* Header row: months */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: isMobile ? 720 : "100%" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 1.4fr) repeat(12, minmax(52px, 1fr))",
              gap: 4,
              padding: "12px 14px 8px",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              position: "sticky", top: 0, zIndex: 1,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8 }}>
                Product
              </div>
              {MONTH_SHORT.map((m, idx) => (
                <div key={m} style={{
                  fontSize: 11, fontWeight: 700,
                  color: idx + 1 === currentMonth ? "#059669" : "#64748b",
                  textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center",
                }}>
                  {m}
                  {idx + 1 === currentMonth && (
                    <div style={{ fontSize: 8, fontWeight: 700, color: "#059669", marginTop: 1 }}>NOW</div>
                  )}
                </div>
              ))}
            </div>

            {/* Product rows */}
            {trends.map((t) => {
              const monthly = t.monthlyIndex || {};
              const revenue = t.monthlyRevenue || {};
              return (
                <div key={t.product} style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1.4fr) repeat(12, minmax(52px, 1fr))",
                  gap: 4,
                  padding: "10px 14px",
                  borderBottom: "1px solid #f1f5f9",
                  alignItems: "center",
                }}>
                  <div style={{ paddingRight: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1.25 }}>
                      {t.product}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                      Peak <strong style={{ color: "#059669" }}>{t.peakMonth}</strong> Â· Low <strong style={{ color: "#1e40af" }}>{t.lowMonth}</strong>
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                      Lifetime: ${Math.round(t.totalRevenue).toLocaleString()} Â· Swing {Math.round(((t as unknown as { swing?: number }).swing) ?? 0)}%
                    </div>
                  </div>
                  {Array.from({ length: 12 }, (_, i) => {
                    const mKey = String(i + 1);
                    const idx = monthly[mKey] ?? 0;
                    const rev = revenue[mKey] ?? 0;
                    const c = heatColor(idx);
                    const isCurrent = i + 1 === currentMonth;
                    return (
                      <div
                        key={mKey}
                        title={`${MONTH_SHORT[i]}: $${rev.toFixed(2)} (index ${idx.toFixed(2)})`}
                        style={{
                          height: 44,
                          borderRadius: 6,
                          background: c.bg,
                          color: c.text,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexDirection: "column",
                          fontSize: 10, fontWeight: 700,
                          border: isCurrent ? "2px solid #0f172a" : "1px solid rgba(15,23,42,0.04)",
                        }}
                      >
                        <div style={{ fontSize: 11, lineHeight: 1 }}>
                          {rev > 0 ? `$${rev >= 1000 ? `${(rev/1000).toFixed(1)}k` : Math.round(rev)}` : "â€”"}
                        </div>
                        {idx > 0 && (
                          <div style={{ fontSize: 9, opacity: 0.75, marginTop: 2 }}>
                            {idx >= 1 ? "+" : ""}{Math.round((idx - 1) * 100)}%
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label, textColor }: { color: string; label: string; textColor?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 14, height: 14, borderRadius: 3, background: color,
        border: "1px solid rgba(15,23,42,0.08)",
      }} />
      <span style={{ color: textColor || "#64748b" }}>{label}</span>
    </span>
  );
}

function MachineChip({ label, sub, active, onClick }: {
  label: string; sub: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
        padding: "8px 14px",
        border: `1px solid ${active ? "#16a34a" : "#e2e8f0"}`,
        background: active ? "#16a34a" : "#fff",
        color: active ? "#fff" : "#0f172a",
        borderRadius: 10, cursor: "pointer", textAlign: "left",
        minWidth: 140, transition: "all 0.15s",
        boxShadow: active ? "0 2px 6px rgba(22,163,74,0.25)" : "none",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
        {label}
      </span>
      <span style={{ fontSize: 10, fontWeight: 600, color: active ? "rgba(255,255,255,0.85)" : "#94a3b8" }}>
        {sub}
      </span>
    </button>
  );
}
