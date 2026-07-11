"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, RefreshCw, Shield, AlertCircle } from "lucide-react";
import { PAGE_BG, CARD, Th, Td, EmptyState, LoadingBox, BtnSecondary, Badge, StatCard, pageContainer } from "../ui";

type AuditEvent = {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  actor: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
};

type AuditSummary = {
  totalEvents: number;
  byActionType: Record<string, number>;
  byActor: Array<{ actor: string; count: number }>;
  windowStart: string;
} | null;

const ACTION_BADGE: Record<string, { label: string; color: "red" | "amber" | "green" | "blue" | "gray" | "indigo" }> = {
  cost_change:       { label: "Cost change",   color: "indigo" },
  price_change:      { label: "Price change",  color: "blue" },
  po_status_change:  { label: "PO status",     color: "amber" },
  po_create:         { label: "PO create",     color: "green" },
  po_delete:         { label: "PO delete",     color: "red" },
  po_receive:        { label: "PO receive",    color: "green" },
  product_create:    { label: "Product new",   color: "green" },
  product_edit:      { label: "Product edit",  color: "gray" },
  spoilage:          { label: "Spoilage",      color: "red" },
  damage:            { label: "Damage",        color: "amber" },
  refill:            { label: "Refill",        color: "blue" },
  warehouse_adjust:  { label: "Warehouse adj", color: "gray" },
};

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "cost_change", label: "Cost change" },
  { value: "price_change", label: "Price change" },
  { value: "po_status_change", label: "PO status change" },
  { value: "po_delete", label: "PO delete" },
  { value: "product_create", label: "Product create" },
  { value: "product_edit", label: "Product edit" },
  { value: "spoilage", label: "Spoilage" },
  { value: "damage", label: "Damage" },
  { value: "refill", label: "Refill" },
  { value: "warehouse_adjust", label: "Warehouse adjustment" },
];

function formatValue(v: Record<string, unknown> | null): string {
  if (!v) return "—";
  return Object.entries(v)
    .map(([k, val]) => `${k}: ${val == null ? "null" : typeof val === "string" ? val : JSON.stringify(val)}`)
    .join(" · ");
}

export default function AuditPage() {
  const isMobile = useIsMobile();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState<AuditSummary>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ includeSummary: "1", limit: "200" });
      if (actionFilter) params.set("actionType", actionFilter);
      if (actorFilter) params.set("actor", actorFilter);
      const res = await fetch(`/api/inventory/audit?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setEvents(data.events || []);
        setSummary(data.summary || null);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [actionFilter, actorFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Audit Log" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{
          ...CARD, padding: 16, marginBottom: 16,
          background: "linear-gradient(135deg, #ede9fe 0%, #c7d2fe 100%)",
          border: "1px solid #c4b5fd",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Shield size={20} color="#5b21b6" />
            <div style={{ fontSize: 14, fontWeight: 700, color: "#3730a3" }}>
              Audit Log — who/what/when/old/new for every critical action
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            Tracks inventory, cost, pricing, and PO changes. Run <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 4 }}>migrations/006_audit_log.sql</code> on Supabase if the list is empty.
          </div>
        </div>

        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
            <StatCard icon={<Shield size={20} />} iconBg="#ede9fe" iconColor="#5b21b6"
              label="Events (30d)" value={`${summary.totalEvents}`} sub="across all action types" />
            <StatCard icon={<Shield size={20} />} iconBg="#fee2e2" iconColor="#dc2626"
              label="Cost changes" value={`${summary.byActionType.cost_change || 0}`} sub="unit cost edits" />
            <StatCard icon={<Shield size={20} />} iconBg="#dbeafe" iconColor="#2563eb"
              label="Price changes" value={`${summary.byActionType.price_change || 0}`} sub="vending price edits" />
            <StatCard icon={<Shield size={20} />} iconBg="#fef3c7" iconColor="#d97706"
              label="PO actions" value={`${(summary.byActionType.po_status_change || 0) + (summary.byActionType.po_delete || 0)}`} sub="status changes + deletes" />
          </div>
        )}

        <div style={{ ...CARD, padding: 14, marginBottom: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d5d9e2", borderRadius: 8, fontSize: 13, background: "#fff" }}
          >
            {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            type="text"
            placeholder="Filter by actor (e.g. arber@…)"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d5d9e2", borderRadius: 8, fontSize: 13, minWidth: 240 }}
          />
          <div style={{ flex: 1 }} />
          <BtnSecondary onClick={load} disabled={loading}>
            {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={14} />}
            Refresh
          </BtnSecondary>
        </div>

        {loading ? (
          <div style={CARD}><LoadingBox /></div>
        ) : events.length === 0 ? (
          <div style={CARD}>
            <EmptyState
              icon={<AlertCircle size={40} color="#94a3b8" />}
              title="No audit events found"
              message="Either no critical actions have been recorded in this window, OR the audit_log table doesn't exist yet. If new — run migrations/006_audit_log.sql against Supabase. After that every cost/price/PO change is automatically captured here."
            />
          </div>
        ) : (
          <div style={{ ...CARD, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Actor</Th>
                <Th>Old → New</Th>
                <Th>Notes</Th>
              </tr></thead>
              <tbody>
                {events.map((e, idx) => {
                  const badge = ACTION_BADGE[e.actionType] || { label: e.actionType, color: "gray" as const };
                  return (
                    <tr key={e.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td>
                        <div style={{ fontSize: 12, color: "#0f172a" }}>{new Date(e.createdAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(e.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"}</div>
                      </Td>
                      <Td><Badge color={badge.color}>{badge.label}</Badge></Td>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{e.entityName || e.entityId}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{e.entityType}</div>
                      </Td>
                      <Td color={e.actor ? "#0f172a" : "#94a3b8"}>{e.actor || "system"}</Td>
                      <Td>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
                          old: <span style={{ color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>{formatValue(e.oldValue)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          new: <span style={{ color: "#0f172a", fontFamily: "ui-monospace, monospace" }}>{formatValue(e.newValue)}</span>
                        </div>
                      </Td>
                      <Td color="#64748b"><span style={{ fontSize: 12 }}>{e.notes || "—"}</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
