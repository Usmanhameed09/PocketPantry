"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, Save, Settings, TrendingUp, DollarSign, Package } from "lucide-react";
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

export default function ProjectionsPage() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<Projection[]>([]);
  const [settings, setSettings] = useState<Settings>({ windowWeeks: 6, safetyStockDays: 5, horizonDays: 7 });
  const [editSettings, setEditSettings] = useState<Settings>({ windowWeeks: 6, safetyStockDays: 5, horizonDays: 7 });
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
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

  async function saveOverride(productId: string) {
    const raw = overrides[productId];
    if (!raw) return;
    setSavingId(productId);
    await fetch("/api/inventory/projections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "override", productId, unitsOverride: Number(raw) }),
    });
    setSavingId(null);
    setOverrides((p) => ({ ...p, [productId]: "" }));
    await load();
  }

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
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <Th>Product</Th>
                  <Th align="right">Velocity / day</Th>
                  <Th align="right">Seasonal</Th>
                  <Th align="right">Projected 30d</Th>
                  <Th align="right">COGS</Th>
                  <Th>Why</Th>
                  <Th>Manual override</Th>
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
                      <Td align="right" mono bold>{p.projectedUnits30d}</Td>
                      <Td align="right" mono>${p.projectedCogs30d.toFixed(2)}</Td>
                      <Td><span style={{ fontSize: 12, color: "#64748b" }}>{p.explanation}</span></Td>
                      <Td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <input
                            type="number"
                            placeholder={p.override !== null ? String(p.override) : "—"}
                            value={overrides[p.productId] ?? ""}
                            onChange={(e) => setOverrides((prev) => ({ ...prev, [p.productId]: e.target.value }))}
                            style={{
                              width: 72, padding: "6px 8px", border: "1px solid #d5d9e2",
                              borderRadius: 6, fontSize: 13, outline: "none",
                            }}
                          />
                          <button
                            disabled={!overrides[p.productId] || savingId === p.productId}
                            onClick={() => saveOverride(p.productId)}
                            style={{
                              padding: "6px 10px", border: "none", borderRadius: 6,
                              background: overrides[p.productId] ? "#16a34a" : "#e2e8f0",
                              color: overrides[p.productId] ? "#fff" : "#94a3b8",
                              cursor: overrides[p.productId] ? "pointer" : "not-allowed",
                              fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center",
                            }}
                          >
                            {savingId === p.productId
                              ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                              : <Save size={12} />}
                          </button>
                        </div>
                      </Td>
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
