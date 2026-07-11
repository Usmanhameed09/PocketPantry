"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import {
  DollarSign, TrendingUp, CreditCard, Percent, Download, Calendar,
  Loader2, ChevronDown, Printer,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { useIsMobile } from "@/hooks/useIsMobile";

type ReportTab = "Overview" | "Machines" | "SKUs" | "Payments";

type ReportsData = {
  range: { days: number; fromDate: string; toDate: string; machineId: string | null };
  stats: {
    totalRevenue: number; totalCost: number; netProfit: number;
    processingFees: number; avgMargin: number;
    totalUnits: number; totalTransactions: number; cardRevenue: number;
    cashRevenue?: number;
  };
  revenueByDay: Array<{ date: string; revenue: number; units: number }>;
  topSkus: Array<{ product: string; units: number; revenue: number; cost: number; margin: number }>;
  revenueByMachine: Array<{ machine: string; revenue: number; margin: number }>;
  machineReport: Array<{
    machineId: string; machine: string; transactions: number;
    revenue: number; cost: number; profit: number; margin: number;
    avgSale: number; topProduct: string;
  }>;
  allMachines?: Array<{ machineId: string; machine: string }>;
  paymentSplit: Array<{ name: string; value: number; amount: number; sales: number }> | null;
  inventoryTurns: number | null;
  inventoryNote: string | null;
  dataQuality: {
    flaggedCostProducts: number;
    sampleFlagged: Array<{ product: string; storedCost: number; avgRevenue: number }>;
    paymentSplitWindowNote: string | null;
  };
};

const PIE_COLORS = ["#16a34a", "#059669", "#d97706", "#6366f1", "#dc2626"];

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("Overview");
  const [preset, setPreset] = useState<"7d" | "30d" | "90d" | "thisMonth" | "month" | "custom">("30d");
  const [days, setDays] = useState(30);
  // Two copies: customFrom/customTo are what the operator is typing into
  // the date pickers. appliedFrom/appliedTo are what we actually fetch on
  // — only updated when the operator clicks "Apply". Otherwise every
  // keystroke would refetch and the page reloaded "again and again".
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [appliedFrom, setAppliedFrom] = useState<string>("");
  const [appliedTo, setAppliedTo] = useState<string>("");
  // Multi-select: empty = all machines; otherwise a consolidated report across
  // the chosen machines (e.g. all machines at one location).
  const [machineIds, setMachineIds] = useState<string[]>([]);
  const [machineMenuOpen, setMachineMenuOpen] = useState(false);

  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // "Last month" = previous calendar month (e.g. on May 28 → April 1 to April 30)
  function lastMonthRange(): { from: string; to: string } {
    const today = new Date();
    const firstOfThis = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfPrev = new Date(firstOfThis.getTime() - 86400000);
    const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
    return { from: fmtDate(firstOfPrev), to: fmtDate(lastOfPrev) };
  }
  // "This month" = 1st of the current month → today.
  function thisMonthRange(): { from: string; to: string } {
    const today = new Date();
    const firstOfThis = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmtDate(firstOfThis), to: fmtDate(today) };
  }
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);

  const load = useCallback(async () => {
    // When "Custom range" is selected but not yet applied, DON'T fetch — wait
    // for the operator to pick both dates and click Apply. This prevents the
    // page from reloading (and blanking) the moment Custom is chosen, and keeps
    // the controls interactive. The previous data stays on screen meanwhile.
    if (preset === "custom" && (!appliedFrom || !appliedTo)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      // Preset → translate into the right query params for /api/reports.
      // Note: we read appliedFrom/appliedTo (set on Apply click), NOT
      // customFrom/customTo (typed-in values), so we don't refetch on
      // every date picker keystroke.
      if (preset === "thisMonth") {
        const { from, to } = thisMonthRange();
        qs.set("from", from); qs.set("to", to);
      } else if (preset === "month") {
        const { from, to } = lastMonthRange();
        qs.set("from", from); qs.set("to", to);
      } else if (preset === "custom" && appliedFrom && appliedTo) {
        qs.set("from", appliedFrom); qs.set("to", appliedTo);
      } else {
        qs.set("days", String(days));
      }
      if (machineIds.length) qs.set("machineId", machineIds.join(","));
      const res = await fetch(`/api/reports?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load reports");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [preset, days, appliedFrom, appliedTo, machineIds]);

  useEffect(() => { load(); }, [load]);

  // Show the date controls + tab bar IMMEDIATELY. Don't block the page on
  // the report fetch. Each tab body shows a small loading hint until data
  // arrives. Error state still gets a full-page banner since without
  // data there's nothing useful to render under the controls.
  if (error && !data) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Reports" />
        <div style={{ padding: 40 }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 20, color: "#dc2626" }}>
            Could not load reports: {error}
          </div>
        </div>
      </div>
    );
  }

  // Empty defaults used while data is still loading. The render code below
  // is the same — placeholders show "—" for numbers, charts show a "Loading
  // data…" hint instead of empty axes.
  const stats = data?.stats ?? {
    totalRevenue: 0, totalCost: 0, netProfit: 0,
    processingFees: 0, avgMargin: 0,
    totalUnits: 0, totalTransactions: 0, cardRevenue: 0,
  };
  const revenueByDay = data?.revenueByDay ?? [];
  const topSkus = data?.topSkus ?? [];
  const revenueByMachine = data?.revenueByMachine ?? [];
  const machineReport = data?.machineReport ?? [];
  // Full roster for the selector — falls back to machineReport before the first
  // load returns allMachines, so the control is never empty.
  const machineOptions = (data?.allMachines && data.allMachines.length > 0)
    ? data.allMachines
    : machineReport.map((m) => ({ machineId: m.machineId, machine: m.machine }));
  const machineSelLabel = machineIds.length === 0
    ? "All Machines"
    : machineIds.length === 1
      ? (machineOptions.find((m) => m.machineId === machineIds[0])?.machine || "1 machine")
      : `${machineIds.length} machines`;
  const paymentSplit = data?.paymentSplit ?? null;
  const inventoryTurns = data?.inventoryTurns ?? null;
  const inventoryNote = data?.inventoryNote ?? null;
  const dataQuality = data?.dataQuality ?? {
    flaggedCostProducts: 0,
    sampleFlagged: [] as Array<{ product: string; storedCost: number; avgRevenue: number }>,
    paymentSplitWindowNote: null,
  };
  const totalSkuRevenue = topSkus.reduce((s, x) => s + x.revenue, 0);

  function exportCsv() {
    const lines = [
      "Range," + data!.range.days + " days (" + data!.range.fromDate + " to " + data!.range.toDate + ")",
      "",
      "MACHINE BREAKDOWN",
      "Machine,Transactions,Revenue,Cost,Profit,Margin %,Avg Sale,Top Product",
      ...machineReport.map((m) =>
        [m.machine, m.transactions, m.revenue, m.cost, m.profit, m.margin, m.avgSale, m.topProduct].join(",")
      ),
      "",
      "TOP SKUS",
      "Product,Units,Revenue,Cost,Margin %",
      ...topSkus.map((s) => [s.product, s.units, s.revenue, s.cost, s.margin].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pocketpantry-report-${data!.range.fromDate}-to-${data!.range.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="reports-root" style={{ minHeight: "100vh" }}>
      {/* Printer-friendly: hide app chrome + controls, expand content, and
          avoid breaking cards/tables across pages. Arthur prints these reports
          to pay location commissions. */}
      <style>{`
        @media print {
          aside, .reports-controls { display: none !important; }
          .reports-root { min-height: 0 !important; }
          .reports-root [class*="page-padding"], .reports-root > div { padding: 0 !important; }
          body { background: #fff !important; }
          .report-print-block { break-inside: avoid; page-break-inside: avoid; }
          @page { margin: 12mm; }
        }
      `}</style>
      <Header title="Reports" />

      <div style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Top controls */}
        <div className="reports-controls" style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap",
          gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <select
              value={preset}
              onChange={(e) => {
                const v = e.target.value as typeof preset;
                setPreset(v);
                if (v === "7d") setDays(7);
                else if (v === "30d") setDays(30);
                else if (v === "90d") setDays(90);
              }}
              style={{
                padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#374151",
                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, cursor: "pointer", outline: "none",
              }}
            >
              <option value="thisMonth">This Month</option>
              <option value="month">Last Month</option>
              <option value="90d">Last 90 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="7d">Last 7 Days</option>
              <option value="custom">Custom range…</option>
            </select>
            {preset === "custom" && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{
                    padding: "7px 10px", fontSize: 13, color: "#374151",
                    background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, outline: "none",
                  }}
                />
                <span style={{ fontSize: 12, color: "#64748b" }}>to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{
                    padding: "7px 10px", fontSize: 13, color: "#374151",
                    background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, outline: "none",
                  }}
                />
                <button
                  type="button"
                  disabled={!customFrom || !customTo}
                  onClick={() => {
                    // Explicit trigger — sets the applied range, which fires the
                    // fetch. Always enabled once both dates are chosen so the
                    // operator can re-run / correct a range at any time.
                    setAppliedFrom(customFrom);
                    setAppliedTo(customTo);
                    // If the range is unchanged from last apply, appliedFrom/To
                    // won't change and load() won't re-run — force it.
                    if (customFrom === appliedFrom && customTo === appliedTo) void load();
                  }}
                  style={{
                    padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "#fff",
                    background: (!customFrom || !customTo) ? "#94a3b8" : "#16a34a",
                    border: "none", borderRadius: 8,
                    cursor: (!customFrom || !customTo) ? "not-allowed" : "pointer",
                  }}
                >Apply</button>
              </>
            )}
            {/* Multi-select machine picker. The list is ALWAYS the full roster
                (never collapses to the selection), and multiple machines can be
                checked to get one consolidated report (e.g. a whole location). */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMachineMenuOpen((o) => !o)}
                style={{
                  padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#374151",
                  background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, cursor: "pointer",
                  outline: "none", display: "inline-flex", alignItems: "center", gap: 8, minWidth: 150,
                  justifyContent: "space-between",
                }}
              >
                <span>{machineSelLabel}</span>
                <ChevronDown size={14} />
              </button>
              {machineMenuOpen && (
                <>
                  <div
                    onClick={() => setMachineMenuOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                  />
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 41,
                    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 8, minWidth: 240,
                    maxHeight: 320, overflowY: "auto",
                  }}>
                    <button
                      onClick={() => { setMachineIds([]); }}
                      style={{
                        width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6,
                        border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                        background: machineIds.length === 0 ? "#f0fdf4" : "transparent",
                        color: machineIds.length === 0 ? "#16a34a" : "#374151",
                      }}
                    >
                      All Machines
                    </button>
                    <div style={{ height: 1, background: "#f1f5f9", margin: "6px 0" }} />
                    {machineOptions.map((m) => {
                      const checked = machineIds.includes(m.machineId);
                      return (
                        <label
                          key={m.machineId}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                            borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#374151",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setMachineIds((cur) =>
                                e.target.checked
                                  ? [...cur, m.machineId]
                                  : cur.filter((id) => id !== m.machineId)
                              );
                            }}
                          />
                          {m.machine}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="reports-actions" style={{ display: "flex", gap: 10 }}>
            <button onClick={exportCsv} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}><Download size={14} /> Export CSV</button>
            <button onClick={() => window.print()} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}><Printer size={14} /> Print</button>
          </div>
        </div>

        {/* Data quality banner */}
        {dataQuality.flaggedCostProducts > 0 && (
          <div style={{
            marginBottom: 16, padding: "12px 16px", background: "#fef3c7",
            border: "1px solid #fcd34d", borderRadius: 10, fontSize: 13, color: "#92400e",
          }}>
            ⚠️ <strong>{dataQuality.flaggedCostProducts} product{dataQuality.flaggedCostProducts === 1 ? "" : "s"} have suspicious cost data</strong>
            {" "}(stored unit cost &gt; average sell price — likely scraped from a case price by mistake).
            Margins for these are estimated using 90% of revenue instead of the bad cost so totals stay sensible.
            {dataQuality.sampleFlagged.length > 0 && (
              <span style={{ display: "block", marginTop: 6, fontSize: 12 }}>
                Examples: {dataQuality.sampleFlagged.slice(0, 3).map((f) => `${f.product} ($${f.storedCost} stored vs $${f.avgRevenue} sold)`).join(" · ")}
              </span>
            )}
            <span style={{ display: "block", marginTop: 4, fontSize: 12 }}>
              Fix: open the product on the Inventory → Products page and update its cost.
            </span>
          </div>
        )}

        {/* Stat Cards — render layout immediately, swap "—" placeholders
            for real numbers as soon as the /api/reports fetch resolves. */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <BigStat icon={<DollarSign size={20} color="#16a34a" />} iconBg="#dcfce7"
            label="Total Revenue"
            value={loading ? "—" : `$${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            sub={loading ? "loading…" : `${stats.totalUnits.toLocaleString()} units · ${data?.range?.days ?? "—"}d`} />
          <BigStat icon={<TrendingUp size={20} color="#059669" />} iconBg="#d1fae5"
            label="Net Profit"
            value={loading ? "—" : `$${stats.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            sub={loading ? "loading…" : "After fees & supplier cost"} subColor="#059669" />
          <BigStat icon={<CreditCard size={20} color="#d97706" />} iconBg="#fef3c7"
            label="Processing Fees"
            value={loading ? "—" : `$${stats.processingFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            sub={loading ? "loading…" : `5.95% on $${stats.cardRevenue.toFixed(0)} card`} />
          <BigStat icon={<Percent size={20} color="#6366f1" />} iconBg="#ede9fe"
            label="Avg. Margin"
            value={loading ? "—" : `${stats.avgMargin.toFixed(1)}%`}
            sub={loading ? "loading…" : "Revenue minus supplier cost"} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #d5d9e2", marginBottom: 24, overflowX: "auto" }}>
          {(["Overview", "Machines", "SKUs", "Payments"] as ReportTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 600, border: "none",
              cursor: "pointer", background: "transparent", whiteSpace: "nowrap",
              color: tab === t ? "#16a34a" : "#9ca3af",
              borderBottom: tab === t ? "2px solid #16a34a" : "2px solid transparent",
              marginBottom: -2,
            }}>{t}</button>
          ))}
        </div>

        {/* ────── OVERVIEW ────── */}
        {tab === "Overview" && (
          <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1.5fr 1fr", gap: 20 }}>
            {loading ? (
              <div style={{ gridColumn: "1 / -1", ...cardStyle, padding: 32, textAlign: "center", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                <span>Loading sales data…</span>
              </div>
            ) : revenueByDay.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", ...cardStyle, padding: 32, textAlign: "center", color: "#94a3b8" }}>
                No sales data for this range yet.
              </div>
            ) : (
              <>
                {/* Revenue Trend — horizontally scrollable on mobile so long
                    date ranges don't squash. Width grows with the number of
                    data points; outer div is overflow-x:auto. */}
                <div style={{ ...cardStyle, gridColumn: "1 / -1", padding: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Revenue Trend</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, marginBottom: 16 }}>
                    Daily revenue from Nayax · {data?.range?.fromDate ?? "…"} to {data?.range?.toDate ?? "…"}
                    {isTablet && revenueByDay.length > 8 && <span style={{ marginLeft: 6, color: "#0d9488" }}>· swipe ←→</span>}
                  </div>
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}>
                    <div style={{
                      // On phones/tablets give each day ~48px so the chart is
                      // always wider than the viewport and can be scrolled to see
                      // the whole trend (Arthur couldn't scroll it on mobile).
                      minWidth: isTablet
                        ? `${Math.max(640, revenueByDay.length * 48)}px`
                        : "100%",
                      height: 260,
                    }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={revenueByDay}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#d5d9e2" }} />
                          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #d5d9e2" }}
                            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]} />
                          <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#16a34a" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Top SKUs */}
                <div style={{ ...cardStyle, padding: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Top Performing SKUs</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>By units sold</div>
                  {topSkus.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: 13, padding: 12 }}>No SKU data.</div>
                  ) : topSkus.slice(0, 6).map((sku, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 0", borderBottom: i < 5 ? "1px solid #e2e8f0" : "none",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, flexShrink: 0,
                          background: i === 0 ? "#fef3c7" : i === 1 ? "#e2e8f0" : i === 2 ? "#fff7ed" : "#f1f5f9",
                          color: i === 0 ? "#d97706" : i === 1 ? "#6b7280" : i === 2 ? "#ea580c" : "#9ca3af",
                        }}>{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sku.product}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{sku.units.toLocaleString()} units</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", flexShrink: 0, marginLeft: 8 }}>
                        ${sku.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Revenue by Machine */}
                <div style={{ ...cardStyle, padding: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Revenue by Machine</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>{data?.range?.days ?? "—"}d window</div>
                  {revenueByMachine.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: 13, padding: 12 }}>No machine data.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {revenueByMachine.map((m, i) => {
                        const maxRev = revenueByMachine[0].revenue || 1;
                        return (
                          <div key={i}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{m.machine}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>${m.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{
                                height: "100%", borderRadius: 4,
                                width: `${(m.revenue / maxRev) * 100}%`,
                                background: "linear-gradient(90deg, #16a34a, #22c55e)",
                              }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Inventory Turns */}
                <div style={{ ...cardStyle, padding: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Inventory Turns</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Annualised COGS ÷ inventory value</div>
                  <div style={{ textAlign: "center", padding: "10px 0" }}>
                    <div style={{
                      width: 100, height: 100, borderRadius: "50%",
                      border: "6px solid #059669", display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto",
                    }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: "#059669" }}>
                        {inventoryTurns !== null ? `${inventoryTurns}x` : "—"}
                      </span>
                    </div>
                    {inventoryTurns === null && (
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 12, padding: "0 8px" }}>
                        {inventoryNote || "Needs warehouse stock + COGS data to compute"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cash vs Card mini */}
                <div style={{ ...cardStyle, padding: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Cash vs Card</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>From Nayax payment data</div>
                  {!paymentSplit ? (
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Payment data unavailable</div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      <ResponsiveContainer width={140} height={140}>
                        <PieChart>
                          <Pie data={paymentSplit} cx="50%" cy="50%" innerRadius={40} outerRadius={62}
                            dataKey="value" startAngle={90} endAngle={-270} paddingAngle={2}>
                            {paymentSplit.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        {paymentSplit.map((p, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span style={{ fontSize: 12, color: "#374151" }}>{p.name}</span>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{p.value}%</span>
                              <div style={{ fontSize: 10, color: "#94a3b8" }}>${p.amount.toFixed(0)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ────── MACHINES ────── */}
        {tab === "Machines" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{ ...cardStyle, overflow: "hidden", minWidth: 700 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1.5fr 110px 100px 100px 100px 80px 90px 1fr",
                padding: "14px 22px", borderBottom: "1px solid #d5d9e2", background: "#f1f5f9",
              }}>
                <TH>Machine</TH><TH>Transactions</TH><TH>Revenue</TH><TH>Cost</TH>
                <TH>Profit</TH><TH>Margin</TH><TH>Avg Sale</TH><TH>Top Product</TH>
              </div>
              {machineReport.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
                  No machine sales in this range.
                </div>
              ) : (
                <>
                  {machineReport.map((m, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "1.5fr 110px 100px 100px 100px 80px 90px 1fr",
                      padding: "14px 22px", borderBottom: "1px solid #e2e8f0", alignItems: "center",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{m.machine}</div>
                      <div style={{ fontSize: 13 }}>{m.transactions.toLocaleString()}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>${m.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: 13, color: "#64748b" }}>${m.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>${m.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                      <div>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 10,
                          color: m.margin >= 45 ? "#059669" : "#d97706",
                          background: m.margin >= 45 ? "#d1fae5" : "#fef3c7",
                        }}>{m.margin}%</span>
                      </div>
                      <div style={{ fontSize: 13 }}>${m.avgSale.toFixed(2)}</div>
                      <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.topProduct}</div>
                    </div>
                  ))}
                  {/* Totals row */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1.5fr 110px 100px 100px 100px 80px 90px 1fr",
                    padding: "14px 22px", background: "#f1f5f9", borderTop: "2px solid #d5d9e2", fontWeight: 700,
                  }}>
                    <div style={{ fontSize: 13, color: "#0f172a" }}>Total</div>
                    <div style={{ fontSize: 13, color: "#0f172a" }}>{machineReport.reduce((s, m) => s + m.transactions, 0).toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: "#0f172a" }}>${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div style={{ fontSize: 13, color: "#64748b" }}>${stats.totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div style={{ fontSize: 13, color: "#059669" }}>${(stats.totalRevenue - stats.totalCost).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div style={{ fontSize: 13, color: "#059669" }}>{stats.avgMargin.toFixed(0)}%</div>
                    <div style={{ fontSize: 13 }}>—</div>
                    <div />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ────── SKUs ────── */}
        {tab === "SKUs" && (
          <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, 1fr)", gap: 20 }}>
            <div style={{ ...cardStyle, padding: 20, gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>SKU Revenue Breakdown</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Top 20 products by revenue</div>
              {topSkus.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No SKU data.</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(300, topSkus.length * 22)}>
                  <BarChart data={topSkus.slice(0, 15)} layout="vertical" margin={{ left: 150 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="product" tick={{ fontSize: 11, fill: "#374151" }} tickLine={false} axisLine={false} width={150} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #d5d9e2" }}
                      formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]} />
                    <Bar dataKey="revenue" fill="#16a34a" radius={[0, 6, 6, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ gridColumn: "1 / -1", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div style={{ ...cardStyle, overflow: "hidden", minWidth: 600 }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "2fr 100px 100px 100px 100px",
                  padding: "14px 22px", borderBottom: "1px solid #d5d9e2", background: "#f1f5f9",
                }}>
                  <TH>Product</TH><TH>Units</TH><TH>Revenue</TH><TH>Margin</TH><TH>Rev Share</TH>
                </div>
                {topSkus.map((s, i) => {
                  const share = totalSkuRevenue > 0 ? (s.revenue / totalSkuRevenue) * 100 : 0;
                  return (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "2fr 100px 100px 100px 100px",
                      padding: "12px 22px", borderBottom: "1px solid #e2e8f0", alignItems: "center",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, background: "#e2e8f0", color: "#64748b", flexShrink: 0,
                        }}>{i + 1}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.product}</span>
                      </div>
                      <div style={{ fontSize: 13 }}>{s.units.toLocaleString()}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>${s.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: 13, color: s.margin >= 45 ? "#059669" : "#d97706", fontWeight: 600 }}>{s.margin}%</div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 3, width: `${share}%`, background: "#16a34a" }} />
                          </div>
                          <span style={{ fontSize: 11, color: "#64748b", minWidth: 35 }}>{share.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ────── PAYMENTS ────── */}
        {tab === "Payments" && (
          !paymentSplit ? (
            <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "#94a3b8" }}>
              Payment breakdown unavailable. Check that the scraper-api is reachable.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, 1fr)", gap: 20 }}>
              {/* Method pie */}
              <div style={{ ...cardStyle, padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Payment Method Split</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>
                  Card/cash mix from Nayax, applied to this period&apos;s revenue
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 30, flexWrap: "wrap" }}>
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={paymentSplit} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                        dataKey="value" startAngle={90} endAngle={-270} paddingAngle={3}>
                        {paymentSplit.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {paymentSplit.map((p, i) => (
                      <div key={i}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <div style={{ width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{p.name}</span>
                        </div>
                        <div style={{ paddingLeft: 20 }}>
                          <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{p.value}%</span>
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>
                            ${p.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fees breakdown */}
              <div style={{ ...cardStyle, padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Processing Fees</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>Nayax card processing</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <FeeRow label="Total Revenue" amount={`$${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} bold />
                  <FeeRow label="Card Transactions" amount={`$${stats.cardRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                  <FeeRow label="Cash & other (no card fee)" amount={`$${(stats.cashRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                  <FeeRow label="Processing Rate (card only)" amount="5.95%" />
                  <FeeRow label="Total Fees" amount={`$${stats.processingFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} bold />
                  <div style={{ height: 1, background: "#d5d9e2" }} />
                  <FeeRow label="Revenue After Fees" amount={`$${(stats.totalRevenue - stats.processingFees).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} bold color="#059669" />
                  <FeeRow label="Revenue After Fees & Costs" amount={`$${stats.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} bold color="#059669" />
                </div>
                <div style={{
                  marginTop: 16, padding: "10px 14px", background: "#f0fdf4",
                  border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 12, color: "#166534", lineHeight: 1.6,
                }}>
                  Card + Cash always add up to Total Revenue. Fees are charged on the card
                  portion only (5.95%). Card-only machines (e.g. AHA / Chinese) take no cash,
                  so their card total equals full revenue.
                  {(stats.cashRevenue ?? 0) > 0 && (
                    <> Cash avoids processing fees — <strong>${((stats.cashRevenue ?? 0) * 0.0595).toFixed(2)}</strong> saved this period.</>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {/* Data source note */}
        <div style={{
          marginTop: 20, padding: "14px 18px", background: "#f0f9ff",
          border: "1px solid #bae6fd", borderRadius: 10, fontSize: 12, color: "#0369a1", lineHeight: 1.6,
        }}>
          <strong>Live data:</strong> Revenue and units from <code>daily_sales</code> (synced from Nayax).
          Supplier costs from <code>products.unit_cost</code>. Payment-method split fetched live from Nayax via scraper-api.
          Processing fees calculated at 5.95% of card revenue. Inventory turns annualised from period COGS ÷ current warehouse value.
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
  boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
};

function BigStat({ icon, iconBg, label, value, sub, subColor }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string; subColor?: string;
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
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: subColor || "#9ca3af", marginTop: 2, fontWeight: subColor ? 600 : 400 }}>{sub}</div>
      </div>
    </div>
  );
}

function FeeRow({ label, amount, bold, color }: { label: string; amount: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: bold ? 700 : 500, color: color || "#111827" }}>{amount}</span>
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "#94a3b8",
      textTransform: "uppercase" as const, letterSpacing: 0.5,
    }}>{children}</div>
  );
}
