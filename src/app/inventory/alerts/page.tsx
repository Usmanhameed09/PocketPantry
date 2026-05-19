"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, AlertCircle, AlertTriangle, Info, X, Check, Bell } from "lucide-react";
import { PAGE_BG, CARD, EmptyState, LoadingBox, BtnPrimary, BtnSecondary, Badge, pageContainer, StatCard } from "../ui";

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

const SEV_META = {
  high:   { icon: AlertCircle,   bg: "#fef2f2", border: "#fecaca", color: "#dc2626", badge: "red"    as const },
  medium: { icon: AlertTriangle, bg: "#fffbeb", border: "#fcd34d", color: "#d97706", badge: "amber"  as const },
  low:    { icon: Info,          bg: "#eff6ff", border: "#bfdbfe", color: "#2563eb", badge: "blue"   as const },
};

export default function AlertsPage() {
  const isMobile = useIsMobile();
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

  async function alertAction(id: string, action: "acknowledge" | "dismiss") {
    await fetch("/api/inventory/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await load();
  }

  const open = alerts.filter((a) => a.status === "open");
  const byCount = {
    high: open.filter((a) => a.severity === "high").length,
    medium: open.filter((a) => a.severity === "medium").length,
    low: open.filter((a) => a.severity === "low").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Alerts" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: 16, marginBottom: 24,
        }}>
          <StatCard icon={<Bell size={20} />} iconBg="#ede9fe" iconColor="#6366f1"
            label="Total open" value={open.length} sub="needs attention" />
          <StatCard icon={<AlertCircle size={20} />} iconBg="#fee2e2" iconColor="#dc2626"
            label="High severity" value={byCount.high} sub="critical low stock" />
          <StatCard icon={<AlertTriangle size={20} />} iconBg="#fef3c7" iconColor="#d97706"
            label="Medium" value={byCount.medium} sub="approaching threshold" />
          <StatCard icon={<Info size={20} />} iconBg="#dbeafe" iconColor="#2563eb"
            label="Low" value={byCount.low} sub="warnings" />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} />
            Include resolved alerts
          </label>
          <BtnPrimary onClick={runScan} disabled={scanRunning}>
            {scanRunning ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Bell size={16} />}
            Run scan now
          </BtnPrimary>
        </div>

        {loading ? <div style={CARD}><LoadingBox /></div>
          : alerts.length === 0 ? (
            <div style={CARD}>
              <EmptyState icon={<Bell size={40} color="#94a3b8" />}
                title="No alerts" message="All stock levels are healthy. Click 'Run scan now' to refresh." />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {alerts.map((a) => {
                const meta = SEV_META[a.severity];
                const Icon = meta.icon;
                return (
                  <div key={a.id} style={{
                    background: a.status === "open" ? meta.bg : "#fff",
                    border: `1px solid ${a.status === "open" ? meta.border : "#e2e8f0"}`,
                    borderRadius: 12, padding: 16, display: "flex", alignItems: "flex-start", gap: 12,
                    opacity: a.status === "open" ? 1 : 0.7,
                  }}>
                    <Icon size={20} color={meta.color} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                          {a.productName || a.machineName || a.type}
                        </span>
                        <Badge color={meta.badge}>{a.severity}</Badge>
                        {a.status !== "open" && <Badge color="gray">{a.status}</Badge>}
                      </div>
                      <p style={{ fontSize: 14, color: "#334155", margin: 0 }}>{a.message}</p>
                      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "#94a3b8", flexWrap: "wrap" }}>
                        <span>{new Date(a.createdAt).toLocaleString()}</span>
                        {a.daysRemaining !== null && <span>· {a.daysRemaining}d remaining</span>}
                        {a.recommendedQty !== null && <span>· Buy {a.recommendedQty}</span>}
                      </div>
                    </div>
                    {a.status === "open" && (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button onClick={() => alertAction(a.id, "acknowledge")} title="Acknowledge"
                          style={{ padding: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b" }}>
                          <Check size={16} />
                        </button>
                        <button onClick={() => alertAction(a.id, "dismiss")} title="Dismiss"
                          style={{ padding: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", color: "#64748b" }}>
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
