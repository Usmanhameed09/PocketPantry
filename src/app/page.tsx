"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
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
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Loader2,
  Bot,
} from "lucide-react";

/* ────── Types ────── */
type DashboardData = {
  generatedAt: string;
  sales: {
    todayRevenue: number; todayUnits: number; todayTransactions: number;
    yesterdayRevenue: number; wowPct: number; avgSale: number;
    thisWeekUnits: number; priorWeekUnits: number; weekWoWPct: number;
    lastSaleDate: string | null; todayHasData: boolean;
    liveDataAt: string | null;
  };
  machines: { total: number; active: number; offline: number; offlineList: Array<{ name: string; status: string }>; };
  alerts: { total: number; high: number; topAlerts: Array<{ message: string; severity: string; kind: string }>; };
  refillStops: Array<{ machine: string; items: number; color: string }>;
  warehouse: { value: number; itemsBelowThreshold: number; restockCost: number; buyListItems: number; };
  priceChanges: Array<{ product: string; suggestedPrice: number; cost: number }>;
  recentReply: { from: string; summary: string; intent: string; receivedAt: string } | null;
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
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/today", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.error || "Failed to load");
        setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Today" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400 }}>
          <Loader2 size={32} color="#16a34a" style={{ animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Today" />
        <div style={{ padding: 40 }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 20, color: "#dc2626" }}>
            Could not load dashboard data: {error || "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  const { sales, machines, alerts, refillStops, warehouse, priceChanges, recentReply } = data;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Today" />

      {/* ─── Quick Stats (real numbers) ─── */}
      <div style={{ padding: isMobile ? "16px 16px 0" : "24px 32px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16 }}>
          <StatCard
            icon={<TrendingUp size={20} color="#16a34a" />} iconBg="#dcfce7"
            label={
              sales.liveDataAt
                ? "Today's Revenue · LIVE"
                : sales.todayHasData ? "Today's Revenue" : `Last data ${sales.lastSaleDate || "—"}`
            }
            value={`$${sales.todayRevenue.toFixed(2)}`}
            tag={
              !sales.todayHasData && !sales.liveDataAt
                ? <span style={{ color: "#94a3b8", fontSize: 12 }}>today not synced yet</span>
                : sales.wowPct === 0 ? <span style={{ color: "#64748b", fontSize: 12 }}>vs yesterday</span>
                : sales.wowPct > 0
                  ? <span style={{ color: "#059669", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}><ArrowUpRight size={14} /> {sales.wowPct}% vs yesterday</span>
                  : <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}><ArrowDownRight size={14} /> {Math.abs(sales.wowPct)}% vs yesterday</span>
            }
          />
          <StatCard
            icon={<CheckCircle2 size={20} color="#059669" />} iconBg="#dcfce7"
            label="Machines Active" value={`${machines.active} / ${machines.total}`}
            tag={machines.offline > 0
              ? <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>{machines.offline} offline</span>
              : <span style={{ color: "#059669", fontSize: 12, fontWeight: 500 }}>all healthy</span>
            }
          />
          <StatCard
            icon={<AlertTriangle size={20} color="#d97706" />} iconBg="#fef3c7"
            label="Open Alerts" value={String(alerts.total)}
            tag={alerts.high > 0
              ? <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>{alerts.high} high severity</span>
              : <span style={{ color: "#64748b", fontSize: 12, fontWeight: 500 }}>nothing critical</span>
            }
          />
          <StatCard
            icon={<DollarSign size={20} color="#6366f1" />} iconBg="#ede9fe"
            label="Warehouse Value" value={`$${warehouse.value.toFixed(2)}`}
            tag={<span style={{ color: "#64748b", fontSize: 12 }}>{warehouse.itemsBelowThreshold} items low</span>}
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
                  <span style={{ fontWeight: 600, color: "#16a34a" }}>{refillStops.length}</span> machine{refillStops.length === 1 ? "" : "s"} need refill
                  {refillStops.length > 0 && (
                    <span style={{ marginLeft: 6, color: "#94a3b8" }}>
                      · {refillStops.reduce((s, r) => s + r.items, 0)} low items total
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={cardBody}>
              {refillStops.length === 0 ? (
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
              {warehouse.buyListItems > 0 ? (
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
                <InfoRow label="Estimated Restock Cost" value={`$${warehouse.restockCost.toFixed(2)}`} />
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
              {priceChanges.length === 0 ? (
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
                      <div style={{ fontSize: 11, color: "#64748b" }}>{new Date(recentReply.receivedAt).toLocaleDateString()}</div>
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
                  {sales.todayHasData ? "Today's Revenue" : `Most recent day with data${sales.lastSaleDate ? ` — ${sales.lastSaleDate}` : ""}`}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#0f172a", letterSpacing: -1 }}>${sales.todayRevenue.toFixed(2)}</div>
                {sales.wowPct !== 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 4 }}>
                    {sales.wowPct > 0
                      ? <><ArrowUpRight size={14} color="#059669" /><span style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>Up {sales.wowPct}%</span></>
                      : <><ArrowDownRight size={14} color="#dc2626" /><span style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>Down {Math.abs(sales.wowPct)}%</span></>
                    }
                    <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 2 }}>vs. yesterday</span>
                  </div>
                )}
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

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ────── Small components ────── */

function StatCard({ icon, iconBg, label, value, tag }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; tag: React.ReactNode;
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
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>{value}</div>
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
