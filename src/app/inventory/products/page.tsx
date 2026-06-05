"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Plus, Edit2, Loader2, Search, Save, X, Package, Upload } from "lucide-react";
import {
  PAGE_BG, CARD, Th, Td, EmptyState, LoadingBox,
  Modal, Field, Select, BtnPrimary, BtnSecondary, Badge, pageContainer,
} from "../ui";
import BulkImportModal from "./BulkImportModal";

type Product = {
  id: string; name: string; sku: string; category: string;
  vendor: string | null; status: "Active" | "Inactive" | "PhaseOut" | "Proposed";
  unit_cost: number; default_vend_price: number | null;
  case_size: number; unit_size: string | null; barcode: string | null;
  lead_time_days: number;
};

const EMPTY_DRAFT: Partial<Product> = {
  name: "", category: "Snacks", vendor: "",
  status: "Active", unit_cost: 0, default_vend_price: 0,
  case_size: 1, lead_time_days: 1,
};

export default function ProductsPage() {
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/products", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setProducts(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products
    .filter((p) => {
      const q = search.toLowerCase();
      return !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.vendor || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // When searching, push products that have actually been scanned
      // (barcode set) or that have real metadata filled in to the top.
      // The bulk-imported scraped products with no barcode/vendor drop
      // below them. Without this, a search for "coca cola" buries the
      // operator's real stocked SKUs under dozens of catalog noise.
      if (!search) return a.name.localeCompare(b.name);
      const score = (p: Product) =>
        (p.barcode ? 4 : 0) +
        (p.vendor && p.vendor !== "—" ? 2 : 0) +
        ((p.default_vend_price ?? 0) > 0 ? 1 : 0);
      const d = score(b) - score(a);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });

  async function save() {
    if (!editing?.name) return;
    setSaving(true);
    const method = editing.id ? "PATCH" : "POST";
    const res = await fetch("/api/inventory/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id, name: editing.name, category: editing.category,
        vendor: editing.vendor, status: editing.status,
        unitCost: editing.unit_cost, defaultVendPrice: editing.default_vend_price,
        caseSize: editing.case_size, unitSize: editing.unit_size,
        barcode: editing.barcode, leadTimeDays: editing.lead_time_days,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setEditing(null);
      load();
    } else {
      alert(data.error || "Save failed");
    }
  }

  const statusColor: Record<Product["status"], "green" | "amber" | "blue" | "gray"> = {
    Active: "green", PhaseOut: "amber", Proposed: "blue", Inactive: "gray",
  };

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Products" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 12, marginBottom: 16, flexWrap: "wrap",
        }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 380, minWidth: 200 }}>
            <Search size={16} style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8",
            }} />
            <input
              type="text" placeholder="Search by name, SKU, or vendor…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px 10px 36px",
                border: "1px solid #d5d9e2", borderRadius: 10, fontSize: 14, outline: "none",
                background: "#fff",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <BtnSecondary onClick={() => setShowImport(true)}>
              <Upload size={16} /> Bulk import
            </BtnSecondary>
            <BtnPrimary onClick={() => setEditing({ ...EMPTY_DRAFT })}>
              <Plus size={16} /> Add product
            </BtnPrimary>
          </div>
        </div>

        <div style={CARD}>
          {loading ? <LoadingBox /> : filtered.length === 0 ? (
            <EmptyState icon={<Package size={40} color="#94a3b8" />}
              title="No products yet" message="Click 'Add product' to create your first SKU." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th>Vendor</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Vend $</Th>
                  <Th>Status</Th>
                  <Th width={48}></Th>
                </tr></thead>
                <tbody>
                  {filtered.map((p, idx) => (
                    <tr key={p.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "ui-monospace, monospace" }}>{p.sku}</div>
                      </Td>
                      <Td>{p.category}</Td>
                      <Td color={p.vendor ? "#0f172a" : "#94a3b8"}>{p.vendor || "—"}</Td>
                      <Td align="right" mono>${(p.unit_cost ?? 0).toFixed(2)}</Td>
                      <Td align="right" mono>{p.default_vend_price ? `$${p.default_vend_price.toFixed(2)}` : "—"}</Td>
                      <Td><Badge color={statusColor[p.status]}>{p.status}</Badge></Td>
                      <Td>
                        <button onClick={() => setEditing({ ...p })} style={{
                          padding: 6, background: "transparent", border: "none", cursor: "pointer",
                          color: "#64748b", borderRadius: 6,
                        }}>
                          <Edit2 size={16} />
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

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? "Edit product" : "Add product"} maxWidth={560}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
              <Field label="Name" type="text" value={editing.name || ""}
                onChange={(v) => setEditing({ ...editing, name: v })} />
            </div>
            <Select label="Category" value={editing.category || "Snacks"}
              options={[
                { value: "Snacks", label: "Snacks" },
                { value: "Candy", label: "Candy" },
                { value: "Drinks", label: "Drinks" },
                { value: "Meals", label: "Meals" },
              ]}
              onChange={(v) => setEditing({ ...editing, category: v })} />
            <Select label="Status" value={editing.status || "Active"}
              options={[
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
                { value: "PhaseOut", label: "PhaseOut" },
                { value: "Proposed", label: "Proposed" },
              ]}
              onChange={(v) => setEditing({ ...editing, status: v as Product["status"] })} />
            <Field label="Vendor" type="text" value={editing.vendor || ""}
              onChange={(v) => setEditing({ ...editing, vendor: v })} />
            <Field label="Barcode" type="text" value={editing.barcode || ""}
              onChange={(v) => setEditing({ ...editing, barcode: v })} />
            <Field label="Unit cost ($)" value={editing.unit_cost ?? 0}
              onChange={(v) => setEditing({ ...editing, unit_cost: Number(v) })} />
            <Field label="Default vend price ($)" value={editing.default_vend_price ?? 0}
              onChange={(v) => setEditing({ ...editing, default_vend_price: Number(v) })} />
            <Field label="Case size" value={editing.case_size ?? 1}
              onChange={(v) => setEditing({ ...editing, case_size: Number(v) })} />
            <Field label="Lead time (days)" value={editing.lead_time_days ?? 1}
              onChange={(v) => setEditing({ ...editing, lead_time_days: Number(v) })} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
            <BtnSecondary onClick={() => setEditing(null)}>Cancel</BtnSecondary>
            <BtnPrimary onClick={save} disabled={saving || !editing.name}>
              {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
              Save product
            </BtnPrimary>
          </div>
        </Modal>
      )}

      {showImport && (
        <BulkImportModal onClose={() => setShowImport(false)} onDone={load} />
      )}
    </div>
  );
}
