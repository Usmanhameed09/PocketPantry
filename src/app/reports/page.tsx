"use client";

import { useState } from "react";
import Header from "@/components/Header";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Percent,
  Download,
  Calendar,
  ChevronDown,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from "recharts";
import { useIsMobile } from "@/hooks/useIsMobile";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ReportTab = "Overview" | "Machines" | "SKUs" | "Payments";
type DateRange = "Last 7 Days" | "Last 30 Days" | "Last 90 Days";

/* ------------------------------------------------------------------ */
/*  Test Data — all derivable from Nayax + our cost tracking           */
/* ------------------------------------------------------------------ */

// Daily revenue from Nayax transactions (last 30 days)
const revenueByDay = [
  { date: "Feb 14", revenue: 328 }, { date: "Feb 15", revenue: 295 },
  { date: "Feb 16", revenue: 112 }, { date: "Feb 17", revenue: 98 },
  { date: "Feb 18", revenue: 342 }, { date: "Feb 19", revenue: 378 },
  { date: "Feb 20", revenue: 356 }, { date: "Feb 21", revenue: 410 },
  { date: "Feb 22", revenue: 385 }, { date: "Feb 23", revenue: 128 },
  { date: "Feb 24", revenue: 105 }, { date: "Feb 25", revenue: 395 },
  { date: "Feb 26", revenue: 412 }, { date: "Feb 27", revenue: 445 },
  { date: "Feb 28", revenue: 398 }, { date: "Mar 1", revenue: 152 },
  { date: "Mar 2", revenue: 118 }, { date: "Mar 3", revenue: 425 },
  { date: "Mar 4", revenue: 468 }, { date: "Mar 5", revenue: 442 },
  { date: "Mar 6", revenue: 435 }, { date: "Mar 7", revenue: 478 },
  { date: "Mar 8", revenue: 165 }, { date: "Mar 9", revenue: 135 },
  { date: "Mar 10", revenue: 452 }, { date: "Mar 11", revenue: 490 },
  { date: "Mar 12", revenue: 475 }, { date: "Mar 13", revenue: 510 },
  { date: "Mar 14", revenue: 485 }, { date: "Mar 15", revenue: 172 },
];

// Top SKUs — from Nayax (units sold + revenue = units × price)
const topSkus = [
  { product: "Red Bull 12 oz", units: 1247, revenue: 4364.50 },
  { product: "Monster Energy", units: 1082, revenue: 3516.50 },
  { product: "Celsius Tropical Vibe", units: 945, revenue: 2598.75 },
  { product: "Snickers", units: 872, revenue: 1526.00 },
  { product: "Doritos Nacho", units: 756, revenue: 1323.00 },
  { product: "Sour Cream Ruffles", units: 698, revenue: 1221.50 },
  { product: "CSF Peanut Butter", units: 534, revenue: 934.50 },
  { product: "Cheetos Flamin' Hot", units: 489, revenue: 855.75 },
];

// Revenue per machine — from Nayax
const revenueByMachine = [
  { machine: "Baker Nissan Sales", revenue: 3640, margin: 44 },
  { machine: "B4 Lumber", revenue: 2890, margin: 45 },
  { machine: "Reynolds Nationwide", revenue: 1920, margin: 51 },
  { machine: "Hartman 1400-1", revenue: 1680, margin: 42 },
  { machine: "American Fire", revenue: 1050, margin: 50 },
  { machine: "Hartman 16300", revenue: 890, margin: 48 },
  { machine: "Hartman 1255", revenue: 480, margin: 46 },
];

// Payment method split — from Nayax
const paymentSplit = [
  { name: "Card", value: 78, amount: 9711.60 },
  { name: "Cash", value: 18, amount: 2241.00 },
  { name: "Mobile Pay", value: 4, amount: 498.20 },
];
const PIE_COLORS = ["#16a34a", "#059669", "#d97706"];

// Machine-level report — from Nayax + cost data
const machineReport = [
  { machine: "Baker Nissan Sales", transactions: 892, revenue: 3640, cost: 2038, profit: 1602, margin: 44, avgSale: 4.08, topProduct: "Red Bull 12 oz" },
  { machine: "B4 Lumber", transactions: 724, revenue: 2890, cost: 1590, profit: 1300, margin: 45, avgSale: 3.99, topProduct: "Monster Energy" },
  { machine: "Reynolds Nationwide", transactions: 512, revenue: 1920, cost: 941, profit: 979, margin: 51, avgSale: 3.75, topProduct: "Celsius Arctic Vibe" },
  { machine: "Hartman 1400-1", transactions: 458, revenue: 1680, cost: 974, profit: 706, margin: 42, avgSale: 3.67, topProduct: "Sour Cream Ruffles" },
  { machine: "American Fire", transactions: 298, revenue: 1050, cost: 525, profit: 525, margin: 50, avgSale: 3.52, topProduct: "CSF Peanut Butter" },
  { machine: "Hartman 16300", transactions: 248, revenue: 890, cost: 463, profit: 427, margin: 48, avgSale: 3.59, topProduct: "Celsius Tropical Vibe" },
];

// Processing fees — Nayax charges ~3.5% on card transactions
const totalRevenue = 12450.80;
const totalCost = 5982.40; // sum of supplier costs from our pricing data
const processingFees = 742.65; // ~3.5% of card transactions
const netProfit = totalRevenue - totalCost - processingFees;
const avgMargin = ((totalRevenue - totalCost) / totalRevenue * 100);

// Inventory turns = cost of goods sold / avg inventory value
const inventoryTurns = 4.8;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("Overview");
  const [dateRange, setDateRange] = useState<DateRange>("Last 30 Days");
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Reports" />

      <div style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Top controls */}
        <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              style={{
                padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#374151",
                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, cursor: "pointer", outline: "none",
              }}
            >
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>Last 90 Days</option>
            </select>
            <select style={{
              padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#374151",
              background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, cursor: "pointer", outline: "none",
            }}>
              <option>All Locations</option>
              {revenueByMachine.map((m) => (
                <option key={m.machine}>{m.machine}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}><Download size={14} /> Export</button>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
              background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}><Calendar size={14} /> Schedule Report</button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <BigStat icon={<DollarSign size={20} color="#16a34a" />} iconBg="#dcfce7"
            label="Total Revenue" value={`$${totalRevenue.toLocaleString()}`}
            sub="From Nayax transactions" />
          <BigStat icon={<TrendingUp size={20} color="#059669" />} iconBg="#d1fae5"
            label="Net Profit" value={`$${netProfit.toFixed(2)}`}
            sub={`After fees & costs`} subColor="#059669" />
          <BigStat icon={<CreditCard size={20} color="#d97706" />} iconBg="#fef3c7"
            label="Processing Fees" value={`$${processingFees.toFixed(2)}`}
            sub="~3.5% on card payments" />
          <BigStat icon={<Percent size={20} color="#6366f1" />} iconBg="#fef9c3"
            label="Avg. Margin" value={`${avgMargin.toFixed(1)}%`}
            sub="Revenue minus supplier cost" />
        </div>

        {/* Tabs */}
        <div className="tab-bar" style={{ display: "flex", gap: 0, borderBottom: "2px solid #d5d9e2", marginBottom: 24 }}>
          {(["Overview", "Machines", "SKUs", "Payments"] as ReportTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 600, border: "none",
              cursor: "pointer", background: "transparent",
              color: tab === t ? "#16a34a" : "#9ca3af",
              borderBottom: tab === t ? "2px solid #16a34a" : "2px solid transparent",
              marginBottom: -2,
            }}>{t}</button>
          ))}
        </div>

        {/* ========== OVERVIEW TAB ========== */}
        {tab === "Overview" && (
          <div className="overview-grid" style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1.5fr 1fr", gap: 20 }}>
            {/* Revenue Trend Chart */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              gridColumn: "1 / -1",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Revenue Trend</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Daily revenue from Nayax · {dateRange}</div>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                  <span style={{ color: "#94a3b8" }}>Weekends dip is normal (locations closed)</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#d5d9e2" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #d5d9e2", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                    formatter={(value) => [`$${value}`, "Revenue"]}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#16a34a" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Top SKUs */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Top Performing SKUs</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>By units sold · {dateRange}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {topSkus.slice(0, 6).map((sku, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 0", borderBottom: i < 5 ? "1px solid #e2e8f0" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700,
                        background: i === 0 ? "#fef3c7" : i === 1 ? "#e2e8f0" : i === 2 ? "#fff7ed" : "#f1f5f9",
                        color: i === 0 ? "#d97706" : i === 1 ? "#6b7280" : i === 2 ? "#ea580c" : "#9ca3af",
                      }}>{i + 1}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{sku.product}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{sku.units.toLocaleString()} units</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                      ${sku.revenue.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue by Location */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Revenue by Machine</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>From Nayax · {dateRange}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {revenueByMachine.map((m, i) => {
                  const maxRev = revenueByMachine[0].revenue;
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{m.machine}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>${m.revenue.toLocaleString()}</span>
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
            </div>

            {/* Bottom row: Inventory Turns + Cash vs Card */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Inventory Turns</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Cost of goods sold ÷ avg inventory</div>
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <div style={{
                  width: 100, height: 100, borderRadius: "50%",
                  border: "6px solid #059669", display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto",
                }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#059669" }}>{inventoryTurns}x</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
                <MiniMetric label="Fast Movers" value="8" color="#059669" />
                <MiniMetric label="Slow Movers" value="4" color="#d97706" />
                <MiniMetric label="Overstock" value="2" color="#dc2626" />
              </div>
            </div>

            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Cash vs Card</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Payment method split from Nayax</div>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={paymentSplit} cx="50%" cy="50%" innerRadius={40} outerRadius={62}
                      dataKey="value" startAngle={90} endAngle={-270} paddingAngle={2}>
                      {paymentSplit.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  {paymentSplit.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: PIE_COLORS[i] }} />
                        <span style={{ fontSize: 13, color: "#374151" }}>{p.name}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{p.value}%</span>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>${p.amount.toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== MACHINES TAB ========== */}
        {tab === "Machines" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}><div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 700,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 110px 100px 100px 100px 80px 90px 1fr",
              padding: "14px 22px", borderBottom: "1px solid #d5d9e2", background: "#f1f5f9",
            }}>
              <TH>Machine</TH>
              <TH>Transactions</TH>
              <TH>Revenue</TH>
              <TH>Cost</TH>
              <TH>Profit</TH>
              <TH>Margin</TH>
              <TH>Avg Sale</TH>
              <TH>Top Product</TH>
            </div>
            {machineReport.map((m, i) => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 110px 100px 100px 100px 80px 90px 1fr",
                padding: "14px 22px", borderBottom: "1px solid #e2e8f0", alignItems: "center",
                transition: "background 0.1s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{m.machine}</div>
                <div style={{ fontSize: 13, color: "#374151" }}>{m.transactions.toLocaleString()}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>${m.revenue.toLocaleString()}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>${m.cost.toLocaleString()}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>${m.profit.toLocaleString()}</div>
                <div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 10,
                    color: m.margin >= 45 ? "#059669" : "#d97706",
                    background: m.margin >= 45 ? "#d1fae5" : "#fef3c7",
                  }}>{m.margin}%</span>
                </div>
                <div style={{ fontSize: 13, color: "#374151" }}>${m.avgSale.toFixed(2)}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{m.topProduct}</div>
              </div>
            ))}
            {/* Totals row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 110px 100px 100px 100px 80px 90px 1fr",
              padding: "14px 22px", background: "#f1f5f9", borderTop: "2px solid #d5d9e2",
              fontWeight: 700,
            }}>
              <div style={{ fontSize: 13, color: "#0f172a" }}>Total</div>
              <div style={{ fontSize: 13, color: "#0f172a" }}>{machineReport.reduce((s, m) => s + m.transactions, 0).toLocaleString()}</div>
              <div style={{ fontSize: 13, color: "#0f172a" }}>${machineReport.reduce((s, m) => s + m.revenue, 0).toLocaleString()}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>${machineReport.reduce((s, m) => s + m.cost, 0).toLocaleString()}</div>
              <div style={{ fontSize: 13, color: "#059669" }}>${machineReport.reduce((s, m) => s + m.profit, 0).toLocaleString()}</div>
              <div style={{ fontSize: 13, color: "#059669" }}>{avgMargin.toFixed(0)}%</div>
              <div style={{ fontSize: 13, color: "#374151" }}>—</div>
              <div />
            </div>
          </div></div>
        )}

        {/* ========== SKUs TAB ========== */}
        {tab === "SKUs" && (
          <div className="cards-grid-2" style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, 1fr)", gap: 20 }}>
            {/* SKU revenue chart */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              gridColumn: "1 / -1",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>SKU Revenue Breakdown</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Revenue per product from Nayax</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topSkus} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="product" tick={{ fontSize: 12, fill: "#374151" }} tickLine={false} axisLine={false} width={120} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #d5d9e2" }}
                    formatter={(value) => [`$${value}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#16a34a" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Full SKU table */}
            <div style={{
              gridColumn: "1 / -1", overflowX: "auto", WebkitOverflowScrolling: "touch",
            }}><div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 500,
            }}>
              <div style={{
                display: "grid", gridTemplateColumns: "2fr 100px 100px 100px",
                padding: "14px 22px", borderBottom: "1px solid #d5d9e2", background: "#f1f5f9",
              }}>
                <TH>Product</TH>
                <TH>Units Sold</TH>
                <TH>Revenue</TH>
                <TH>Rev Share</TH>
              </div>
              {topSkus.map((s, i) => {
                const share = ((s.revenue / topSkus.reduce((sum, x) => sum + x.revenue, 0)) * 100).toFixed(1);
                return (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "2fr 100px 100px 100px",
                    padding: "12px 22px", borderBottom: "1px solid #e2e8f0", alignItems: "center",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, background: "#e2e8f0", color: "#64748b",
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{s.product}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#374151" }}>{s.units.toLocaleString()}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>${s.revenue.toLocaleString()}</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, width: `${share}%`, background: "#16a34a" }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#64748b", minWidth: 35 }}>{share}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div></div>
          </div>
        )}

        {/* ========== PAYMENTS TAB ========== */}
        {tab === "Payments" && (
          <div className="cards-grid-2" style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, 1fr)", gap: 20 }}>
            {/* Pie chart bigger */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "24px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Payment Method Split</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>From Nayax payment data</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 30 }}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={paymentSplit} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                      dataKey="value" startAngle={90} endAngle={-270} paddingAngle={3}>
                      {paymentSplit.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {paymentSplit.map((p, i) => (
                    <div key={i}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[i] }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{p.name}</span>
                      </div>
                      <div style={{ paddingLeft: 20 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{p.value}%</span>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>${p.amount.toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Processing fees breakdown */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "24px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Processing Fees</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>Nayax card processing charges</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <FeeRow label="Card Transactions" amount="$9,711.60" />
                <FeeRow label="Processing Rate" amount="~3.5%" />
                <FeeRow label="Total Fees" amount={`$${processingFees.toFixed(2)}`} bold />
                <div style={{ height: 1, background: "#d5d9e2" }} />
                <FeeRow label="Revenue After Fees" amount={`$${(totalRevenue - processingFees).toFixed(2)}`} bold color="#059669" />
                <FeeRow label="Revenue After Fees & Costs" amount={`$${netProfit.toFixed(2)}`} bold color="#059669" />
              </div>
              <div style={{
                marginTop: 16, padding: "10px 14px", background: "#fef3c7",
                border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e",
              }}>
                Cash payments ({paymentSplit[1].value}%) avoid processing fees — ${(paymentSplit[1].amount * 0.035).toFixed(2)} saved
              </div>
            </div>
          </div>
        )}

        {/* Data source note */}
        <div style={{
          marginTop: 20, padding: "14px 18px", background: "#f0f9ff",
          border: "1px solid #bae6fd", borderRadius: 10, fontSize: 12, color: "#0369a1",
          lineHeight: 1.6,
        }}>
          <strong>Data sources:</strong> Revenue, transactions, and payment splits come from Nayax API.
          Supplier costs come from the Pricing module. Processing fees are calculated at ~3.5% of card
          transactions (Nayax rate). Margin = (Revenue - Supplier Cost) / Revenue. Inventory turns =
          Cost of Goods Sold / Avg Inventory Value.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

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
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: subColor || "#9ca3af", marginTop: 2, fontWeight: subColor ? 600 : 400 }}>{sub}</div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 8px", background: "#f1f5f9", borderRadius: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{label}</div>
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
