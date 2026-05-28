"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import {
  DollarSign, TrendingUp, CreditCard, Percent, Download, Calendar,
  Loader2,
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
  };
  revenueByDay: Array<{ date: string; revenue: number; units: number }>;
  topSkus: Array<{ product: string; units: number; revenue: number; cost: number; margin: number }>;
  revenueByMachine: Array<{ machine: string; revenue: number; margin: number }>;
  machineReport: Array<{
    machineId: string; machine: string; transactions: number;
    revenue: number; cost: number; profit: number; margin: number;
    avgSale: number; topProduct: string;
  }>;
  paymentSplit: Array<{ name: string; value: number; amount: number; sales: number }> | null;
  inventoryTurns: number | null;
};

const PIE_COLORS = ["#16a34a", "#059669", "#d97706", "#6366f1", "#dc2626"];

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("Overview");
  const [days, setDays] = useState(30);
  const [machineId, setMachineId] = useState<string>("");
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ days: String(days) });
      if (machineId) qs.set("machineId", machineId);
      const res = await fetch(`/api/reports?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load reports");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [days, machineId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Reports" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400 }}>
          <Loader2 size={32} color="#16a34a" style={{ animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Reports" />
        <div style={{ padding: 40 }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 20, color: "#dc2626" }}>
            Could not load reports: {error || "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  const { stats, revenueByDay, topSkus, revenueByMachine, machineReport, paymentSplit, inventoryTurns } = data;
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
    <div style={{ minHeight: "100vh" }}>
      <Header title="Reports" />

      <div style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Top controls */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap",
          gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#374151",
                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, cursor: "pointer", outline: "none",
              }}
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              style={{
                padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#374151",
                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, cursor: "pointer", outline: "none",
              }}>
              <option value="">All Machines</option>
              {machineReport.map((m) => (
                <option key={m.machineId} value={m.machineId}>{m.machine}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={exportCsv} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}><Download size={14} /> Export CSV</button>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
              background: "#e2e8f0", color: "#94a3b8", border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: "not-allowed",
            }} title="Coming soon"><Calendar size={14} /> Schedule Report</button>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <BigStat icon={<DollarSign size={20} color="#16a34a" />} iconBg="#dcfce7"
            label="Total Revenue" value={`$${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            sub={`${stats.totalUnits.toLocaleString()} units · ${data.range.days}d`} />
          <BigStat icon={<TrendingUp size={20} color="#059669" />} iconBg="#d1fae5"
            label="Net Profit" value={`$${stats.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            sub="After fees & supplier cost" subColor="#059669" />
          <BigStat icon={<CreditCard size={20} color="#d97706" />} iconBg="#fef3c7"
            label="Processing Fees" value={`$${stats.processingFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            sub={`~3.5% on $${stats.cardRevenue.toFixed(0)} card`} />
          <BigStat icon={<Percent size={20} color="#6366f1" />} iconBg="#ede9fe"
            label="Avg. Margin" value={`${stats.avgMargin.toFixed(1)}%`}
            sub="Revenue minus supplier cost" />
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
            {revenueByDay.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", ...cardStyle, padding: 32, textAlign: "center", color: "#94a3b8" }}>
                No sales data for this range yet.
              </div>
            ) : (
              <>
                {/* Revenue Trend */}
                <div style={{ ...cardStyle, gridColumn: "1 / -1", padding: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Revenue Trend</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, marginBottom: 16 }}>
                    Daily revenue from Nayax · {data.range.fromDate} to {data.range.toDate}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
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
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>{data.range.days}d window</div>
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
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 12 }}>
                        Needs warehouse stock + COGS data to compute
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
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>From Nayax payment data</div>
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
                            ${p.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} · {p.sales} sales
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
                  <FeeRow label="Card Transactions" amount={`$${stats.cardRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                  <FeeRow label="Processing Rate" amount="~3.5%" />
                  <FeeRow label="Total Fees" amount={`$${stats.processingFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} bold />
                  <div style={{ height: 1, background: "#d5d9e2" }} />
                  <FeeRow label="Revenue After Fees" amount={`$${(stats.totalRevenue - stats.processingFees).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} bold color="#059669" />
                  <FeeRow label="Revenue After Fees & Costs" amount={`$${stats.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} bold color="#059669" />
                </div>
                {(() => {
                  const cashEntry = paymentSplit.find((p) => p.name.toLowerCase() === "cash");
                  if (!cashEntry) return null;
                  const cashFeesSaved = cashEntry.amount * 0.035;
                  return (
                    <div style={{
                      marginTop: 16, padding: "10px 14px", background: "#fef3c7",
                      border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e",
                    }}>
                      Cash payments ({cashEntry.value}%) avoid processing fees — ${cashFeesSaved.toFixed(2)} saved this period
                    </div>
                  );
                })()}
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
          Processing fees calculated at ~3.5% of card revenue. Inventory turns annualised from period COGS ÷ current warehouse value.
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
