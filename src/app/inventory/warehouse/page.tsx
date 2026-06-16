"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePagination } from "@/hooks/usePagination";
import Pagination from "@/components/Pagination";
import {
  Loader2, Search, Warehouse, Plus, Minus, Package, AlertTriangle,
  History, Save, X,
} from "lucide-react";
import {
  PAGE_BG, CARD, StatCard, Th, Td, EmptyState, LoadingBox,
  Modal, Select, BtnPrimary, BtnSecondary, Badge, pageContainer,
} from "../ui";

type Product = {
  id: string; name: string; sku: string; category: string;
  vendor: string | null; unit_cost: number;
};
type WarehouseRow = {
  product: Product;
  onHand: number;
};
type Movement = {
  id: string; qty: number; reason: string; location: string;
  machineId: string | null; notes: string | null; createdBy: string | null; createdAt: string;
};

const REASON_LABELS: Record<string, string> = {
  purchase: "Stock received (purchase)",
  refill: "Refill (warehouse → machine)",
  spoilage: "Spoilage",
  damage: "Damage",
  count_correction: "Count correction",
  sale_estimate: "Sale estimate (machine)",
  transfer: "Transfer",
};

const ADJUST_REASONS = [
  { value: "purchase", label: "Stock received (purchase)" },
  { value: "count_correction", label: "Count correction (set the truth)" },
  { value: "spoilage", label: "Spoilage" },
  { value: "damage", label: "Damage" },
  { value: "transfer", label: "Transfer in/out" },
];

export default function WarehousePage() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [historyOf, setHistoryOf] = useState<Product | null>(null);
  const [history, setHistory] = useState<Movement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // Fetch products + warehouse on-hand
    const [pRes, wRes] = await Promise.all([
      fetch("/api/inventory/products", { cache: "no-store" }),
      fetch("/api/inventory/warehouse", { cache: "no-store" }),
    ]);
    const pData = await pRes.json();
    const wData = await wRes.json();
    const onHandByProduct = new Map<string, number>();
    for (const r of wData?.data || []) onHandByProduct.set(r.productId, r.onHand);
    const out: WarehouseRow[] = (pData.data || []).map((p: Product) => ({
      product: p,
      onHand: onHandByProduct.get(p.id) || 0,
    }));
    setRows(out);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openHistory(p: Product) {
    setHistoryOf(p);
    setHistoryLoading(true);
    const r = await fetch(`/api/inventory/movements?productId=${p.id}&limit=100`, { cache: "no-store" });
    const d = await r.json();
    setHistory(d.data || []);
    setHistoryLoading(false);
  }

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return r.product.name.toLowerCase().includes(q) || r.product.sku.toLowerCase().includes(q);
  });

  const totalUnits = filtered.reduce((s, r) => s + r.onHand, 0);
  const totalValue = filtered.reduce((s, r) => s + r.onHand * (r.product.unit_cost || 0), 0);
  const stockedCount = filtered.filter((r) => r.onHand > 0).length;
  const zeroCount = filtered.filter((r) => r.onHand === 0).length;
  const pg = usePagination(filtered, 25);

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Warehouse" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: 16, marginBottom: 20,
        }}>
          <StatCard icon={<Warehouse size={20} />} iconBg="#dcfce7" iconColor="#16a34a"
            label="Total units in warehouse" value={totalUnits} sub={`${stockedCount} SKUs with stock`} />
          <StatCard icon={<Package size={20} />} iconBg="#ede9fe" iconColor="#6366f1"
            label="Warehouse value" value={`$${totalValue.toFixed(2)}`} sub="at unit cost" />
          <StatCard icon={<AlertTriangle size={20} />} iconBg="#fef3c7" iconColor="#d97706"
            label="Zero stock" value={zeroCount} sub="SKUs at 0 units" />
          <StatCard icon={<History size={20} />} iconBg="#fee2e2" iconColor="#dc2626"
            label="Catalog total" value={rows.length} sub="all products tracked" />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 380, minWidth: 200 }}>
            <Search size={16} style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8",
            }} />
            <input
              type="text" placeholder="Search by name or SKU…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px 10px 36px",
                border: "1px solid #d5d9e2", borderRadius: 10, fontSize: 14, outline: "none",
                background: "#fff",
              }}
            />
          </div>
        </div>

        <div style={CARD}>
          {loading ? <LoadingBox /> : filtered.length === 0 ? (
            <EmptyState icon={<Warehouse size={40} color="#94a3b8" />} title="No products found" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <Th>Product</Th>
                  <Th>Vendor</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Unit cost</Th>
                  <Th align="right">Value</Th>
                  <Th width={220}></Th>
                </tr></thead>
                <tbody>
                  {pg.pageItems.map((r, idx) => (
                    <tr key={r.product.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{r.product.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "ui-monospace, monospace" }}>{r.product.sku}</div>
                      </Td>
                      <Td color={r.product.vendor ? "#0f172a" : "#94a3b8"}>{r.product.vendor || "—"}</Td>
                      <Td align="right" mono bold color={r.onHand === 0 ? "#94a3b8" : undefined}>{r.onHand}</Td>
                      <Td align="right" mono>${(r.product.unit_cost || 0).toFixed(2)}</Td>
                      <Td align="right" mono>${(r.onHand * (r.product.unit_cost || 0)).toFixed(2)}</Td>
                      <Td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => setAdjusting(r.product)}
                            style={{
                              padding: "6px 12px", background: "#dcfce7", color: "#15803d",
                              border: "1px solid #bbf7d0", borderRadius: 8,
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                              display: "inline-flex", alignItems: "center", gap: 4,
                            }}>
                            <Plus size={12} /> Adjust
                          </button>
                          <button onClick={() => openHistory(r.product)}
                            title="History"
                            style={{
                              padding: "6px 10px", background: "#f1f5f9", color: "#475569",
                              border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer",
                              display: "inline-flex", alignItems: "center",
                            }}>
                            <History size={14} />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={pg.page}
                totalPages={pg.totalPages}
                onPageChange={pg.setPage}
                from={pg.from}
                to={pg.to}
                total={pg.total}
                label="products"
              />
            </div>
          )}
        </div>
      </div>

      {adjusting && <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />}
      {historyOf && (
        <Modal onClose={() => setHistoryOf(null)} title={`Stock history — ${historyOf.name}`} maxWidth={680}>
          {historyLoading ? <LoadingBox /> : history.length === 0 ? (
            <p style={{ color: "#64748b", textAlign: "center", padding: 20 }}>No movements recorded yet.</p>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8fafc" }}>
                  <Th>When</Th>
                  <Th>Reason</Th>
                  <Th>Where</Th>
                  <Th align="right">Qty</Th>
                  <Th>Notes</Th>
                </tr></thead>
                <tbody>
                  {history.map((m, idx) => (
                    <tr key={m.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td color="#64748b"><span style={{ fontSize: 11 }}>{new Date(m.createdAt).toLocaleString()}</span></Td>
                      <Td><span style={{ fontSize: 12 }}>{REASON_LABELS[m.reason] || m.reason}</span></Td>
                      <Td><span style={{ fontSize: 12, color: "#64748b" }}>{m.location === "warehouse" ? "Warehouse" : `Machine ${(m.machineId || "").slice(0, 6)}`}</span></Td>
                      <Td align="right" mono bold color={m.qty > 0 ? "#15803d" : "#dc2626"}>{m.qty > 0 ? "+" : ""}{m.qty}</Td>
                      <Td><span style={{ fontSize: 11, color: "#94a3b8" }}>{m.notes || "—"}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function AdjustModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("purchase");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      setError("Enter a positive quantity");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        location: "warehouse",
        qty: direction === "add" ? q : -q,
        reason,
        notes: notes || null,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.success) onSaved();
    else setError(data.error || "Failed to record");
  }

  return (
    <Modal onClose={onClose} title={`Adjust warehouse stock — ${product.name}`} maxWidth={500}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setDirection("add"); setReason("purchase"); }}
            style={{
              flex: 1, padding: "12px", borderRadius: 10,
              background: direction === "add" ? "#16a34a" : "#fff",
              color: direction === "add" ? "#fff" : "#475569",
              border: `2px solid ${direction === "add" ? "#15803d" : "#e2e8f0"}`,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            <Plus size={16} /> Add stock
          </button>
          <button onClick={() => { setDirection("remove"); setReason("spoilage"); }}
            style={{
              flex: 1, padding: "12px", borderRadius: 10,
              background: direction === "remove" ? "#dc2626" : "#fff",
              color: direction === "remove" ? "#fff" : "#475569",
              border: `2px solid ${direction === "remove" ? "#b91c1c" : "#e2e8f0"}`,
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            <Minus size={16} /> Remove stock
          </button>
        </div>

        <label style={{ display: "block" }}>
          <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>Quantity (units)</span>
          <input type="number" min="0" value={qty} placeholder="e.g. 50"
            onChange={(e) => setQty(e.target.value)}
            style={{
              width: "100%", marginTop: 4, padding: "10px 14px",
              border: "1px solid #d5d9e2", borderRadius: 8, fontSize: 16, outline: "none",
            }}
            autoFocus />
        </label>

        <Select label="Reason" value={reason}
          options={
            direction === "add"
              ? ADJUST_REASONS.filter((r) => ["purchase", "count_correction", "transfer"].includes(r.value))
              : ADJUST_REASONS.filter((r) => ["spoilage", "damage", "count_correction", "transfer"].includes(r.value))
          }
          onChange={setReason} />

        <label style={{ display: "block" }}>
          <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>Notes (optional)</span>
          <input type="text" value={notes} placeholder="e.g. Costco trip, invoice #1234, opening count"
            onChange={(e) => setNotes(e.target.value)}
            style={{
              width: "100%", marginTop: 4, padding: "9px 12px",
              border: "1px solid #d5d9e2", borderRadius: 8, fontSize: 14, outline: "none",
            }} />
        </label>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, background: "#fef2f2",
            color: "#dc2626", border: "1px solid #fecaca", fontSize: 13,
          }}>{error}</div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <BtnSecondary onClick={onClose}>Cancel</BtnSecondary>
        <BtnPrimary onClick={submit} disabled={submitting || !qty}>
          {submitting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
          {direction === "add" ? "Add to warehouse" : "Remove from warehouse"}
        </BtnPrimary>
      </div>
    </Modal>
  );
}
