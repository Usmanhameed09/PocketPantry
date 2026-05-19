"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { Loader2, AlertCircle, AlertTriangle, Info, X, Check } from "lucide-react";

type Alert = {
  id: string;
  type: "low_stock" | "spike" | "expiry" | "underperformer";
  productId: string | null;
  productName: string | null;
  machineId: string | null;
  machineName: string | null;
  severity: "low" | "medium" | "high";
  message: string;
  daysRemaining: number | null;
  recommendedQty: number | null;
  status: "open" | "acknowledged" | "dismissed" | "resolved";
  createdAt: string;
};

const SEV_ICON: Record<Alert["severity"], React.ReactNode> = {
  high: <AlertCircle className="w-5 h-5 text-red-600" />,
  medium: <AlertTriangle className="w-5 h-5 text-amber-600" />,
  low: <Info className="w-5 h-5 text-blue-600" />,
};

const SEV_BG: Record<Alert["severity"], string> = {
  high: "border-red-200 bg-red-50",
  medium: "border-amber-200 bg-amber-50",
  low: "border-blue-200 bg-blue-50",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/inventory/alerts?includeResolved=${includeResolved ? 1 : 0}`, { cache: "no-store" });
    const data = await res.json();
    if (data.success) setAlerts(data.data || []);
    setLoading(false);
  }, [includeResolved]);

  useEffect(() => { load(); }, [load]);

  async function runScan() {
    setScanRunning(true);
    await fetch("/api/cron/alerts-scan");
    setScanRunning(false);
    await load();
  }

  async function action(id: string, action: "acknowledge" | "dismiss") {
    await fetch("/api/inventory/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await load();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Alerts" subtitle="Predictive low-stock + velocity spikes" />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} />
            Include resolved
          </label>
          <button
            onClick={runScan}
            disabled={scanRunning}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {scanRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Run scan now
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin inline text-gray-400" /></div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No alerts. Click "Run scan now" to check.
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className={`border rounded-lg p-4 flex items-start gap-3 ${SEV_BG[a.severity]}`}>
                <div className="mt-0.5">{SEV_ICON[a.severity]}</div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{a.productName || a.machineName || a.type}</div>
                  <div className="text-sm text-gray-700 mt-1">{a.message}</div>
                  <div className="text-xs text-gray-500 mt-2 flex gap-3">
                    <span>Created {new Date(a.createdAt).toLocaleString()}</span>
                    {a.daysRemaining !== null && <span>· {a.daysRemaining}d remaining</span>}
                    {a.recommendedQty !== null && <span>· Buy {a.recommendedQty}</span>}
                    <span className="capitalize">· {a.status}</span>
                  </div>
                </div>
                {a.status === "open" && (
                  <div className="flex gap-1">
                    <button onClick={() => action(a.id, "acknowledge")} className="p-1.5 text-gray-600 hover:bg-white rounded" title="Acknowledge">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => action(a.id, "dismiss")} className="p-1.5 text-gray-600 hover:bg-white rounded" title="Dismiss">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
