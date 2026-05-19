"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, ExternalLink, ClipboardList } from "lucide-react";
import { PAGE_BG, CARD, Th, Td, EmptyState, LoadingBox, Badge, pageContainer } from "../ui";

type PO = {
  id: string; supplier: string; status: string; totalCost: number;
  createdAt: string; approvedAt: string | null; purchasedAt: string | null; receivedAt: string | null;
  lineCount: number;
};

const STATUS_COLOR: Record<string, "gray" | "blue" | "amber" | "green" | "red"> = {
  Draft: "gray", Approved: "blue", Purchased: "amber", Received: "green", Cancelled: "red",
};

export default function PurchaseOrdersPage() {
  const isMobile = useIsMobile();
  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("All");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/purchase-orders", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setPos(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterStatus === "All" ? pos : pos.filter((p) => p.status === filterStatus);
  const byStatus = pos.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {} as Record<string, number>);
  const statuses = ["All", "Draft", "Approved", "Purchased", "Received"];

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Purchase Orders" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {statuses.map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{
                padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: filterStatus === s ? "#16a34a" : "#fff",
                color: filterStatus === s ? "#fff" : "#475569",
                border: `1px solid ${filterStatus === s ? "#15803d" : "#d5d9e2"}`,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              }}>
              {s}
              {s !== "All" && byStatus[s] && (
                <span style={{
                  background: filterStatus === s ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                  color: filterStatus === s ? "#fff" : "#64748b",
                  padding: "1px 8px", borderRadius: 999, fontSize: 11,
                }}>{byStatus[s]}</span>
              )}
            </button>
          ))}
        </div>

        <div style={CARD}>
          {loading ? <LoadingBox /> : filtered.length === 0 ? (
            <EmptyState icon={<ClipboardList size={40} color="#94a3b8" />}
              title="No purchase orders" message="Generate a buy list to create PO drafts." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <Th>PO</Th>
                  <Th>Supplier</Th>
                  <Th>Status</Th>
                  <Th align="right">Lines</Th>
                  <Th align="right">Total</Th>
                  <Th>Created</Th>
                  <Th width={48}></Th>
                </tr></thead>
                <tbody>
                  {filtered.map((p, idx) => (
                    <tr key={p.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#64748b" }}>{p.id.slice(0, 8)}</span></Td>
                      <Td><strong>{p.supplier}</strong></Td>
                      <Td><Badge color={STATUS_COLOR[p.status] || "gray"}>{p.status}</Badge></Td>
                      <Td align="right" mono>{p.lineCount}</Td>
                      <Td align="right" mono bold>${p.totalCost.toFixed(2)}</Td>
                      <Td color="#64748b">{new Date(p.createdAt).toLocaleDateString()}</Td>
                      <Td>
                        <Link href={`/inventory/purchase-orders/${p.id}`} style={{ color: "#16a34a", display: "inline-flex" }}>
                          <ExternalLink size={16} />
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
