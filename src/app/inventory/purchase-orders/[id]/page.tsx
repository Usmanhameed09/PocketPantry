"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import InventoryTabs from "../../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, CheckCircle2, ShoppingBag, PackageCheck, Ban, ArrowLeft, Truck, Trash2 } from "lucide-react";
import {
  PAGE_BG, CARD, Th, Td, LoadingBox, Badge, Modal,
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
  const [showDistribute, setShowDistribute] = useState(false);
  const [machines, setMachines] = useState<Array<{ id: string; name: string }>>([]);
  // Distribution map: `${productId}|${machineId}` → qty string
  const [distQty, setDistQty] = useState<Record<string, string>>({});
  const [distributing, setDistributing] = useState(false);
  const [distResultMsg, setDistResultMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/inventory/purchase-orders/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (data.success) setPo(data.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Load machines once for the distribution modal
  useEffect(() => {
    fetch("/api/machines", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.machines) setMachines(d.machines.map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })));
      })
      .catch(() => {});
  }, []);

  async function submitDistribution() {
    if (!po) return;
    const distributions: Array<{ productId: string; machineId: string; qty: number }> = [];
    for (const line of po.lines) {
      for (const m of machines) {
        const key = `${line.productId}|${m.id}`;
        const qty = Number(distQty[key] || 0);
        if (qty > 0) distributions.push({ productId: line.productId, machineId: m.id, qty });
      }
    }
    if (distributions.length === 0) {
      setDistResultMsg("Enter at least one quantity to distribute.");
      return;
    }
    setDistributing(true);
    const res = await fetch(`/api/inventory/purchase-orders/${id}/distribute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distributions }),
    });
    const data = await res.json();
    setDistributing(false);
    if (data.success) {
      setDistResultMsg(data.message);
      setDistQty({});
      setTimeout(() => { setShowDistribute(false); setDistResultMsg(null); }, 1500);
    } else {
      setDistResultMsg(data.error || "Failed to distribute");
    }
  }

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

  async function deletePO() {
    if (!confirm("Delete this purchase order? This cannot be undone.")) return;
    setSubmitting(true);
    const res = await fetch(`/api/inventory/purchase-orders/${id}`, { method: "DELETE" });
    const data = await res.json();
    setSubmitting(false);
    if (data.success) {
      router.push("/inventory/purchase-orders");
    } else {
      alert(data.error || "Failed to delete PO");
    }
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
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>Purchase Order {po.id.slice(0, 8)}</h2>
                <Badge color={STATUS_COLOR[po.status] || "gray"}>{po.status}</Badge>
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Created {new Date(po.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"}
                {po.approvedAt && ` · Approved ${new Date(po.approvedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`}
                {po.purchasedAt && ` · Purchased ${new Date(po.purchasedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`}
                {po.receivedAt && ` · Received ${new Date(po.receivedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 8 }}>${po.totalCost.toFixed(2)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canApprove && <BtnPrimary onClick={() => transition("Approved")} disabled={submitting}><CheckCircle2 size={16} />Approve</BtnPrimary>}
              {canPurchase && <BtnPrimary onClick={() => transition("Purchased")} disabled={submitting}><ShoppingBag size={16} />Mark purchased</BtnPrimary>}
              {po.status === "Received" && (
                <BtnPrimary onClick={() => setShowDistribute(true)}><Truck size={16} />Distribute to machines</BtnPrimary>
              )}
              {po.status !== "Received" && po.status !== "Cancelled" && (
                <BtnDanger onClick={() => transition("Cancelled")}><Ban size={16} />Cancel</BtnDanger>
              )}
              <BtnDanger onClick={deletePO}><Trash2 size={16} />Delete</BtnDanger>
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

        {po.status === "Received" && (
          <div style={{ ...CARD, marginTop: 16, padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Truck size={18} color="#15803d" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#15803d" }}>PO received into warehouse</div>
                <div style={{ fontSize: 12, color: "#475569" }}>Next: distribute these units to machines to enable stock tracking and predictive alerts.</div>
              </div>
              <BtnPrimary onClick={() => setShowDistribute(true)}><Truck size={14} />Distribute now</BtnPrimary>
            </div>
          </div>
        )}
      </div>

      {showDistribute && po && (
        <Modal onClose={() => setShowDistribute(false)} title="Distribute to machines" maxWidth={720}>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>
            For each product, enter how many units you're loading into each machine. This creates a refill log
            and moves stock out of the warehouse into the machine.
          </p>

          <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f8fafc" }}>
                <Th>Product</Th>
                <Th align="right">Received</Th>
                {machines.map((m) => <Th key={m.id} align="right">{m.name}</Th>)}
                <Th align="right">Distributed</Th>
              </tr></thead>
              <tbody>
                {po.lines.map((line, idx) => {
                  const distributed = machines.reduce((s, m) => s + Number(distQty[`${line.productId}|${m.id}`] || 0), 0);
                  const over = distributed > line.qtyReceived;
                  return (
                    <tr key={line.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td><strong>{line.productName}</strong></Td>
                      <Td align="right" mono>{line.qtyReceived}</Td>
                      {machines.map((m) => {
                        const key = `${line.productId}|${m.id}`;
                        return (
                          <Td key={m.id} align="right">
                            <input type="number" min={0} placeholder="0"
                              value={distQty[key] || ""}
                              onChange={(e) => setDistQty((p) => ({ ...p, [key]: e.target.value }))}
                              style={{
                                width: 56, padding: "4px 8px", border: "1px solid #d5d9e2",
                                borderRadius: 6, fontSize: 12, textAlign: "right", outline: "none",
                              }} />
                          </Td>
                        );
                      })}
                      <Td align="right" mono bold color={over ? "#dc2626" : undefined}>{distributed}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {distResultMsg && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13,
              background: distResultMsg.includes("Failed") || distResultMsg.includes("Enter") ? "#fef2f2" : "#f0fdf4",
              color: distResultMsg.includes("Failed") || distResultMsg.includes("Enter") ? "#dc2626" : "#15803d",
              border: `1px solid ${distResultMsg.includes("Failed") || distResultMsg.includes("Enter") ? "#fecaca" : "#bbf7d0"}`,
            }}>{distResultMsg}</div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <BtnSecondary onClick={() => setShowDistribute(false)}>Close</BtnSecondary>
            <BtnPrimary onClick={submitDistribution} disabled={distributing}>
              {distributing ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Truck size={16} />}
              Distribute
            </BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}
