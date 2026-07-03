"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Settings, TrendingUp, DollarSign, Package } from "lucide-react";
import {
  PAGE_BG, CARD, StatCard, Th, Td, EmptyState, LoadingBox,
  Modal, Field, BtnPrimary, BtnSecondary, Badge, pageContainer,
} from "../ui";

type Projection = {
  productId: string; productName: string; sku: string; category: string;
  cost: number; velocityPerDay: number; seasonalMultiplier: number;
  projectedUnits30d: number; projectedCogs30d: number;
  override: number | null; explanation: string;
};
type Settings = { windowWeeks: number; safetyStockDays: number; horizonDays: number };

// Color bands for the 30-day projected units (individual items, not cases):
//   < 10  → red    (barely selling — think twice before buying)
//   10–40 → amber  (moderate mover)
//   > 40  → green  (strong seller)
function projColor(units: number): string {
  if (units < 10) return "#dc2626";
  if (units <= 40) return "#d97706";
  return "#16a34a";
}

export default function ProjectionsPage() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<Projection[]>([]);
  const [settings, setSettings] = useState<Settings>({ windowWeeks: 6, safetyStockDays: 5, horizonDays: 7 });
  const [editSettings, setEditSettings] = useState<Settings>({ windowWeeks: 6, safetyStockDays: 5, horizonDays: 7 });
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/projections", { cache: "no-store" });
    const json = await res.json();
    if (json.success) {
      setData(json.data || []);
      setSettings(json.settings);
      setEditSettings(json.settings);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveSettings() {
    await fetch("/api/inventory/projections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "settings", ...editSettings }),
    });
    setShowSettings(false);
    await load();
  }

  const totalCogs = data.reduce((s, r) => s + r.projectedCogs30d, 0);
  const totalUnits = data.reduce((s, r) => s + r.projectedUnits30d, 0);
  const withVelocity = data.filter((r) => r.velocityPerDay > 0).length;

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Projections" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: 16, marginBottom: 24,
        }}>
          <StatCard icon={<Package size={20} />} iconBg="#dcfce7" iconColor="#16a34a"
            label="Total SKUs" value={data.length} sub={`${withVelocity} with sales velocity`} />
          <StatCard icon={<TrendingUp size={20} />} iconBg="#ede9fe" iconColor="#6366f1"
            label="Projected 30d units" value={totalUnits.toFixed(0)} sub="across all SKUs" />
          <StatCard icon={<DollarSign size={20} />} iconBg="#dcfce7" iconColor="#16a34a"
            label="Projected COGS" value={`$${totalCogs.toFixed(2)}`} sub="next 30 days" />
          <StatCard icon={<Settings size={20} />} iconBg="#fef3c7" iconColor="#d97706"
            label="Window" value={`${settings.windowWeeks}w`} sub={`Horizon ${settings.horizonDays}d · Click to edit`}
            onClick={() => setShowSettings(true)} />
        </div>

        <div style={CARD}>
          {loading ? <LoadingBox /> : data.length === 0 ? (
            <EmptyState title="No projection data yet"
              message="Trigger a Nayax sync to populate sales velocity." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              {/* Legend — clarifies the unit (items) and the color bands. */}
              <div style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14,
                padding: "10px 14px", marginBottom: 4, fontSize: 12, color: "#64748b",
              }}>
                <span style={{ fontWeight: 600 }}>Projected 30d = individual items (not cases)</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: "#dc2626" }} /> &lt;10 slow
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: "#d97706" }} /> 10–40 moderate
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: "#16a34a" }} /> &gt;40 strong
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <Th>Product</Th>
                  <Th align="right">Velocity / day</Th>
                  <Th align="right">Seasonal</Th>
                  <Th align="right">Projected 30d (items)</Th>
                  <Th align="right">COGS</Th>
                  <Th>Why</Th>
                </tr></thead>
                <tbody>
                  {data.map((p, idx) => (
                    <tr key={p.productId} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{p.productName}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{p.sku} · {p.category}</div>
                      </Td>
                      <Td align="right" mono>{p.velocityPerDay.toFixed(2)}</Td>
                      <Td align="right">
                        <Badge color={p.seasonalMultiplier !== 1 ? "amber" : "gray"}>
                          ×{p.seasonalMultiplier.toFixed(2)}
                        </Badge>
                      </Td>
                      <Td align="right" mono bold>
                        {/* Color-code the 30-day projection so slow movers stand
                            out at a glance: <10 red (barely selling — maybe skip),
                            10–40 amber (moderate), >40 green (strong seller). */}
                        <span style={{ color: projColor(p.projectedUnits30d) }}>
                          {p.projectedUnits30d}
                        </span>
                      </Td>
                      <Td align="right" mono>${p.projectedCogs30d.toFixed(2)}</Td>
                      <Td><span style={{ fontSize: 12, color: "#64748b" }}>{p.explanation}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} title="Projection settings">
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Velocity window (weeks)" value={editSettings.windowWeeks}
              onChange={(v) => setEditSettings({ ...editSettings, windowWeeks: Number(v) })} />
            <Field label="Safety stock (days)" value={editSettings.safetyStockDays}
              onChange={(v) => setEditSettings({ ...editSettings, safetyStockDays: Number(v) })} />
            <Field label="Buy-list horizon (days)" value={editSettings.horizonDays}
              onChange={(v) => setEditSettings({ ...editSettings, horizonDays: Number(v) })} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
            <BtnSecondary onClick={() => setShowSettings(false)}>Cancel</BtnSecondary>
            <BtnPrimary onClick={saveSettings}>Save</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}
