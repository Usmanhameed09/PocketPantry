"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, AlertTriangle, RefreshCw, TrendingDown, DollarSign, Package } from "lucide-react";
import { PAGE_BG, CARD, Th, Td, EmptyState, LoadingBox, BtnSecondary, Badge, StatCard, pageContainer } from "../ui";

type WasteEvent = {
  movementId: string;
  productName: string;
  category: string;
  qty: number;
  reason: "spoilage" | "damage";
  unitCost: number;
  totalCost: number;
  machineName: string | null;
  notes: string | null;
  createdAt: string;
};

type WasteReport = {
  startDate: string;
  endDate: string;
  totalUnitsLost: number;
  totalDollarsLost: number;
  spoilageEvents: number;
  damageEvents: number;
  byCategory: Array<{ category: string; units: number; dollars: number }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    category: string;
    units: number;
    dollars: number;
    eventCount: number;
  }>;
  recentEvents: WasteEvent[];
};

type ProductTurns = {
  productId: string;
  productName: string;
  category: string;
  unitsSold: number;
  avgOnHand: number;
  turns: number;
  daysOfSupply: number | null;
  classification: "fast" | "healthy" | "slow" | "dead" | "no_signal";
};

type TurnsReport = {
  periodDays: number;
  fleetSummary: {
    productCount: number;
    fastMovers: number;
    healthy: number;
    slow: number;
    dead: number;
    noSignal: number;
    medianTurns: number;
    bestTurns: number;
    worstTurns: number;
  };
  products: ProductTurns[];
};

const CLASS_BADGE: Record<ProductTurns["classification"], { label: string; color: "green" | "blue" | "amber" | "red" | "gray" }> = {
  fast: { label: "Fast mover", color: "green" },
  healthy: { label: "Healthy", color: "blue" },
  slow: { label: "Slow", color: "amber" },
  dead: { label: "Dead stock", color: "red" },
  no_signal: { label: "No sales", color: "gray" },
};

const REASON_BADGE: Record<WasteEvent["reason"], { label: string; color: "red" | "amber" }> = {
  spoilage: { label: "Spoilage", color: "red" },
  damage: { label: "Damage", color: "amber" },
};

export default function WastePage() {
  const isMobile = useIsMobile();
  const [waste, setWaste] = useState<WasteReport | null>(null);
  const [turns, setTurns] = useState<TurnsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"waste" | "turns">("waste");
  const [classFilter, setClassFilter] = useState<ProductTurns["classification"] | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/waste", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setWaste(data.waste);
        setTurns(data.turns);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredTurns = turns?.products.filter((p) => classFilter === "all" || p.classification === classFilter) ?? [];

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Waste & Inventory Turns" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {(["waste", "turns"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: tab === t ? "#0f172a" : "#fff",
              color: tab === t ? "#fff" : "#475569",
              border: `1px solid ${tab === t ? "#0f172a" : "#d5d9e2"}`,
              cursor: "pointer",
            }}>
              {t === "waste" ? "Spoilage & Damage" : "Inventory Turns"}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <BtnSecondary onClick={load} disabled={loading}>
            {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
            Refresh
          </BtnSecondary>
        </div>

        {loading ? (
          <div style={CARD}><LoadingBox /></div>
        ) : tab === "waste" ? (
          <WasteTab report={waste} isMobile={isMobile} />
        ) : (
          <TurnsTab
            report={turns}
            filtered={filteredTurns}
            classFilter={classFilter}
            setClassFilter={setClassFilter}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  );
}

function WasteTab({ report, isMobile }: { report: WasteReport | null; isMobile: boolean }) {
  if (!report) return <div style={CARD}><EmptyState icon={<AlertTriangle size={40} color="#94a3b8" />} title="No data" message="Couldn't load waste report." /></div>;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <StatCard icon={<DollarSign size={20} />} iconBg="#fee2e2" iconColor="#dc2626"
          label="Dollars lost" value={`$${report.totalDollarsLost.toFixed(2)}`}
          sub={`${report.startDate} to ${report.endDate}`} />
        <StatCard icon={<Package size={20} />} iconBg="#fef3c7" iconColor="#d97706"
          label="Units lost" value={`${report.totalUnitsLost}`}
          sub={`${report.spoilageEvents + report.damageEvents} events`} />
        <StatCard icon={<AlertTriangle size={20} />} iconBg="#fef2f2" iconColor="#dc2626"
          label="Spoilage" value={`${report.spoilageEvents}`}
          sub="events recorded" />
        <StatCard icon={<TrendingDown size={20} />} iconBg="#fef3c7" iconColor="#d97706"
          label="Damage" value={`${report.damageEvents}`}
          sub="events recorded" />
      </div>

      {report.recentEvents.length === 0 ? (
        <div style={CARD}>
          <EmptyState
            icon={<AlertTriangle size={40} color="#94a3b8" />}
            title="No waste recorded in this window"
            message="Record spoilage or damage via Inventory → Warehouse → Adjust. Pick the product, choose Spoilage or Damage as the reason, and the event will appear here."
          />
        </div>
      ) : (
        <>
          <div style={{ ...CARD, marginBottom: 16, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: "#0f172a" }}>By category</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <Th>Category</Th>
                <Th align="right">Units lost</Th>
                <Th align="right">Dollars lost</Th>
              </tr></thead>
              <tbody>
                {report.byCategory.map((c, idx) => (
                  <tr key={c.category} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                    <Td>{c.category}</Td>
                    <Td align="right" mono>{c.units}</Td>
                    <Td align="right" mono bold>${c.dollars.toFixed(2)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...CARD, marginBottom: 16, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: "#0f172a" }}>Top products by dollars lost</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <Th>Product</Th>
                <Th align="right">Units lost</Th>
                <Th align="right">Events</Th>
                <Th align="right">Dollars lost</Th>
              </tr></thead>
              <tbody>
                {report.byProduct.map((p, idx) => (
                  <tr key={p.productId} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{p.productName}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.category}</div>
                    </Td>
                    <Td align="right" mono>{p.units}</Td>
                    <Td align="right" mono>{p.eventCount}</Td>
                    <Td align="right" mono bold>${p.dollars.toFixed(2)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...CARD, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, color: "#0f172a" }}>Recent events</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <Th>When</Th>
                <Th>Product</Th>
                <Th>Reason</Th>
                <Th>Where</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Cost</Th>
                <Th>Notes</Th>
              </tr></thead>
              <tbody>
                {report.recentEvents.map((e, idx) => (
                  <tr key={e.movementId} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                    <Td color="#64748b">{new Date(e.createdAt).toLocaleDateString()}</Td>
                    <Td><strong>{e.productName}</strong></Td>
                    <Td><Badge color={REASON_BADGE[e.reason].color}>{REASON_BADGE[e.reason].label}</Badge></Td>
                    <Td>{e.machineName || "warehouse"}</Td>
                    <Td align="right" mono>{e.qty}</Td>
                    <Td align="right" mono bold>${e.totalCost.toFixed(2)}</Td>
                    <Td color="#64748b"><span style={{ fontSize: 12 }}>{e.notes || "—"}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function TurnsTab({
  report,
  filtered,
  classFilter,
  setClassFilter,
  isMobile,
}: {
  report: TurnsReport | null;
  filtered: ProductTurns[];
  classFilter: ProductTurns["classification"] | "all";
  setClassFilter: (c: ProductTurns["classification"] | "all") => void;
  isMobile: boolean;
}) {
  if (!report) return <div style={CARD}><EmptyState icon={<AlertTriangle size={40} color="#94a3b8" />} title="No data" message="Couldn't load turns report." /></div>;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 16, marginBottom: 16 }}>
        <StatCard icon={<Package size={20} />} iconBg="#dcfce7" iconColor="#16a34a"
          label="Fast movers" value={`${report.fleetSummary.fastMovers}`}
          sub={`≥${4} turns/period`} />
        <StatCard icon={<Package size={20} />} iconBg="#dbeafe" iconColor="#2563eb"
          label="Healthy" value={`${report.fleetSummary.healthy}`}
          sub="cycling well" />
        <StatCard icon={<Package size={20} />} iconBg="#fef3c7" iconColor="#d97706"
          label="Slow" value={`${report.fleetSummary.slow}`}
          sub="watch for trim" />
        <StatCard icon={<Package size={20} />} iconBg="#fee2e2" iconColor="#dc2626"
          label="Dead stock" value={`${report.fleetSummary.dead}`}
          sub="consider phase-out" />
        <StatCard icon={<Package size={20} />} iconBg="#f1f5f9" iconColor="#64748b"
          label="No sales" value={`${report.fleetSummary.noSignal}`}
          sub={`median turns ${report.fleetSummary.medianTurns}`} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {([
          { value: "all", label: "All" },
          { value: "fast", label: "Fast" },
          { value: "healthy", label: "Healthy" },
          { value: "slow", label: "Slow" },
          { value: "dead", label: "Dead" },
          { value: "no_signal", label: "No sales" },
        ] as const).map((opt) => (
          <button key={opt.value} onClick={() => setClassFilter(opt.value)} style={{
            padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
            background: classFilter === opt.value ? "#0f172a" : "#fff",
            color: classFilter === opt.value ? "#fff" : "#475569",
            border: `1px solid ${classFilter === opt.value ? "#0f172a" : "#d5d9e2"}`,
            cursor: "pointer",
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <Th>Product</Th>
            <Th align="right">Units sold ({report.periodDays}d)</Th>
            <Th align="right">On hand</Th>
            <Th align="right">Turns</Th>
            <Th align="right">Days supply</Th>
            <Th>Status</Th>
          </tr></thead>
          <tbody>
            {filtered.slice(0, 100).map((p, idx) => {
              const meta = CLASS_BADGE[p.classification];
              return (
                <tr key={p.productId} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{p.productName}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.category}</div>
                  </Td>
                  <Td align="right" mono>{p.unitsSold}</Td>
                  <Td align="right" mono>{p.avgOnHand}</Td>
                  <Td align="right" mono bold>{p.turns.toFixed(2)}</Td>
                  <Td align="right" mono>{p.daysOfSupply ?? "—"}</Td>
                  <Td><Badge color={meta.color}>{meta.label}</Badge></Td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>No products match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
