"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { Loader2, Save, Settings } from "lucide-react";

type Projection = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  cost: number;
  velocityPerDay: number;
  seasonalMultiplier: number;
  projectedUnits30d: number;
  projectedCogs30d: number;
  override: number | null;
  explanation: string;
};

type Settings = { windowWeeks: number; safetyStockDays: number; horizonDays: number };

export default function ProjectionsPage() {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Projections" subtitle="30-day demand forecasts driven by sales velocity + seasonal multipliers" />
      <InventoryTabs />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            {data.length} SKUs · Projected COGS: <span className="font-semibold text-gray-900">${totalCogs.toFixed(2)}</span> · Window {settings.windowWeeks}w · Horizon {settings.horizonDays}d
          </div>
          <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 border rounded hover:bg-gray-50">
            <Settings className="w-4 h-4" /> Settings
          </button>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-right px-4 py-3 font-medium">Velocity/day</th>
                <th className="text-right px-4 py-3 font-medium">Seasonal</th>
                <th className="text-right px-4 py-3 font-medium">Projected 30d</th>
                <th className="text-right px-4 py-3 font-medium border-l">COGS</th>
                <th className="text-left px-4 py-3 font-medium border-l">Why</th>
                <th className="px-4 py-3 font-medium border-l">Override</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">No data yet. Run the Nayax sync first.</td></tr>
              ) : data.map((p) => (
                <tr key={p.productId} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.productName}</div>
                    <div className="text-xs text-gray-500">{p.sku} · {p.category}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{p.velocityPerDay.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">×{p.seasonalMultiplier.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{p.projectedUnits30d}</td>
                  <td className="px-4 py-3 text-right">${p.projectedCogs30d.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{p.explanation}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        placeholder={p.override !== null ? String(p.override) : "—"}
                        className="w-20 px-2 py-1 text-sm border rounded"
                        value={overrides[p.productId] ?? ""}
                        onChange={(e) => setOverrides((prev) => ({ ...prev, [p.productId]: e.target.value }))}
                      />
                      <button
                        disabled={!overrides[p.productId] || savingId === p.productId}
                        onClick={() => saveOverride(p.productId)}
                        className="p-1 text-indigo-600 disabled:opacity-30"
                      >
                        {savingId === p.productId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Projection settings</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-gray-600">Sales velocity window (weeks)</span>
                <input type="number" className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editSettings.windowWeeks}
                  onChange={(e) => setEditSettings({ ...editSettings, windowWeeks: Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Safety stock (days)</span>
                <input type="number" className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editSettings.safetyStockDays}
                  onChange={(e) => setEditSettings({ ...editSettings, safetyStockDays: Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Buy-list horizon (days)</span>
                <input type="number" className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editSettings.horizonDays}
                  onChange={(e) => setEditSettings({ ...editSettings, horizonDays: Number(e.target.value) })} />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={saveSettings} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
