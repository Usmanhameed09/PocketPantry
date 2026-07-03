"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ArrowRightLeft, TrendingDown } from "lucide-react";
import {
  PAGE_BG, CARD, Th, Td, EmptyState, LoadingBox,
  Modal, Select, BtnPrimary, BtnSecondary, Badge, pageContainer,
} from "../ui";

type Underperformer = {
  productId: string; productName: string; category: string;
  unitsLast4Weeks: number; averageWeekly: number;
  margin: number | null; reason: string;
};
type Product = { id: string; name: string };

export default function UnderperformersPage() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<Underperformer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaceFor, setReplaceFor] = useState<Underperformer | null>(null);
  const [newProductId, setNewProductId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const [u, p] = await Promise.all([
      fetch("/api/inventory/underperformers", { cache: "no-store" }).then((r) => r.json()),
      // Full catalog (incl. inactive + Excel-imported) so the Replace picker
      // offers every product, not just the ~30 active ones. (Arthur's ask.)
      fetch("/api/inventory/products?includeAll=1", { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (u.success) setRows(u.data || []);
    if (p.success) setProducts(p.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitReplacement() {
    if (!replaceFor || !newProductId) return;
    await fetch("/api/inventory/replacements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldProductId: replaceFor.productId,
        newProductId,
        notes: `Replacing underperformer: ${replaceFor.reason}`,
      }),
    });
    setReplaceFor(null);
    setNewProductId("");
    await load();
  }

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Underperformers" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={CARD}>
          {loading ? <LoadingBox /> : rows.length === 0 ? (
            <EmptyState icon={<TrendingDown size={40} color="#94a3b8" />}
              title="No underperformers" message="Everything is selling and margin-positive." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <Th>Product</Th>
                  <Th align="right">4-wk units</Th>
                  <Th align="right">Weekly avg</Th>
                  <Th align="right">Margin</Th>
                  <Th>Reason</Th>
                  <Th width={130}></Th>
                </tr></thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.productId} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td><strong>{r.productName}</strong>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.category}</div>
                      </Td>
                      <Td align="right" mono>{r.unitsLast4Weeks}</Td>
                      <Td align="right" mono>{r.averageWeekly.toFixed(1)}</Td>
                      <Td align="right" mono>{r.margin !== null ? `${r.margin}%` : "—"}</Td>
                      <Td><span style={{ fontSize: 12, color: "#64748b" }}>{r.reason}</span></Td>
                      <Td>
                        <button onClick={() => setReplaceFor(r)} style={{
                          padding: "6px 10px", background: "#fef3c7", color: "#92400e",
                          border: "1px solid #fcd34d", borderRadius: 8, cursor: "pointer",
                          fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4,
                        }}>
                          <ArrowRightLeft size={12} /> Replace
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {replaceFor && (
        <Modal onClose={() => setReplaceFor(null)} title={`Replace ${replaceFor.productName}`}>
          <p style={{ fontSize: 14, color: "#475569", marginTop: 0 }}>
            The old product moves to <Badge color="amber">PhaseOut</Badge> (still sellable). The new product takes its place in buy lists.
          </p>
          <Select label="Replacement product" value={newProductId}
            options={[
              { value: "", label: "Select…" },
              ...products.filter((p) => p.id !== replaceFor.productId).map((p) => ({ value: p.id, label: p.name })),
            ]}
            onChange={setNewProductId} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
            <BtnSecondary onClick={() => setReplaceFor(null)}>Cancel</BtnSecondary>
            <BtnPrimary onClick={submitReplacement} disabled={!newProductId}>Start replacement</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}
