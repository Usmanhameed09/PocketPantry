"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import InventoryTabs from "../../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, CheckCircle2, ShoppingBag, PackageCheck, Ban, ArrowLeft } from "lucide-react";
import {
  PAGE_BG, CARD, Th, Td, LoadingBox, Badge,
  BtnPrimary, BtnSecondary, BtnDanger, pageContainer,
} from "../../ui";

type Line = {
  id: string; productId: string; productName: string;
  qtyOrdered: number; qtyReceived: number; unitCost: number;
};

type PODetail = {
  id: string; supplier: string; status: string; totalCost: number;
  createdAt: string; approvedAt: string | null; purchasedAt: string | null; receivedAt: string | null;
  notes: string | null; lines: Line[];
};

const STATUS_COLOR: Record<string, "gray" | "blue" | "amber" | "green" | "red"> = {
  Draft: "gray", Approved: "blue", Purchased: "amber", Received: "green", Cancelled: "red",
};

export default function PODetailPage() {
  const isMobile = useIsMobile();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [po, setPo] = useState<PODetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/inventory/purchase-orders/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (data.success) setPo(data.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function transition(status: "Approved" | "Purchased" | "Cancelled") {
    setSubmitting(true);
    await fetch(`/api/inventory/purchase-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSubmitting(false);
    await load();
  }

  async function submitReceipts() {
    if (!po) return;
    const payload = po.lines
      .map((l) => ({ lineId: l.id, qtyReceivedDelta: Number(receipts[l.id] || 0) }))
      .filter((r) => r.qtyReceivedDelta > 0);
    if (payload.length === 0) return;
    setSubmitting(true);
    await fetch(`/api/inventory/purchase-orders/${id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipts: payload }),
    });
    setReceipts({});
    setSubmitting(false);
    await load();
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: PAGE_BG }}>
        <Header title="Purchase Order" />
        <InventoryTabs />
        <div style={pageContainer(isMobile)}><div style={CARD}><LoadingBox /></div></div>
      </div>
    );
  }
  if (!po) return null;

  const canApprove = po.status === "Draft";
  const canPurchase = po.status === "Approved";
  const canReceive = po.status === "Purchased" || po.status === "Approved";
  const hasReceiptInput = Object.values(receipts).some((v) => Number(v) > 0);

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title={`PO ${po.id.slice(0, 8)}`} />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <button onClick={() => router.push("/inventory/purchase-orders")} style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "6px 10px",
          background: "transparent", border: "none", cursor: "pointer", color: "#475569", fontSize: 13,
        }}>
          <ArrowLeft size={14} /> Back to purchase orders
        </button>

        <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>{po.supplier}</h2>
                <Badge color={STATUS_COLOR[po.status] || "gray"}>{po.status}</Badge>
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Created {new Date(po.createdAt).toLocaleString()}
                {po.approvedAt && ` · Approved ${new Date(po.approvedAt).toLocaleDateString()}`}
                {po.purchasedAt && ` · Purchased ${new Date(po.purchasedAt).toLocaleDateString()}`}
                {po.receivedAt && ` · Received ${new Date(po.receivedAt).toLocaleDateString()}`}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 8 }}>${po.totalCost.toFixed(2)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canApprove && <BtnPrimary onClick={() => transition("Approved")} disabled={submitting}><CheckCircle2 size={16} />Approve</BtnPrimary>}
              {canPurchase && <BtnPrimary onClick={() => transition("Purchased")} disabled={submitting}><ShoppingBag size={16} />Mark purchased</BtnPrimary>}
              {po.status !== "Received" && po.status !== "Cancelled" && (
                <BtnDanger onClick={() => transition("Cancelled")}><Ban size={16} />Cancel</BtnDanger>
              )}
            </div>
          </div>
        </div>

        <div style={CARD}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <Th>Product</Th>
                <Th align="right">Ordered</Th>
                <Th align="right">Received</Th>
                <Th align="right">Unit cost</Th>
                {canReceive && <Th align="right">Receive now</Th>}
              </tr></thead>
              <tbody>
                {po.lines.map((l, idx) => {
                  const remaining = l.qtyOrdered - l.qtyReceived;
                  return (
                    <tr key={l.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td><strong>{l.productName}</strong></Td>
                      <Td align="right" mono>{l.qtyOrdered}</Td>
                      <Td align="right" mono>{l.qtyReceived}</Td>
                      <Td align="right" mono>${l.unitCost.toFixed(2)}</Td>
                      {canReceive && (
                        <Td align="right">
                          {remaining > 0 ? (
                            <input type="number" max={remaining} min={0} placeholder={String(remaining)}
                              value={receipts[l.id] || ""}
                              onChange={(e) => setReceipts((p) => ({ ...p, [l.id]: e.target.value }))}
                              style={{
                                width: 76, padding: "6px 10px", border: "1px solid #d5d9e2", borderRadius: 6,
                                fontSize: 13, textAlign: "right", outline: "none",
                              }}
                            />
                          ) : <Badge color="green">Complete</Badge>}
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {canReceive && hasReceiptInput && (
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <BtnPrimary onClick={submitReceipts} disabled={submitting}>
              {submitting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <PackageCheck size={16} />}
              Submit receipt
            </BtnPrimary>
          </div>
        )}
      </div>
    </div>
  );
}
