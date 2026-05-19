"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { Plus, Edit2, Loader2, Search, Save, X } from "lucide-react";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  vendor: string | null;
  status: "Active" | "Inactive" | "PhaseOut" | "Proposed";
  unit_cost: number;
  default_vend_price: number | null;
  case_size: number;
  unit_size: string | null;
  barcode: string | null;
  lead_time_days: number;
};

const EMPTY_DRAFT: Partial<Product> = {
  name: "",
  category: "Snacks",
  vendor: "",
  status: "Active",
  unit_cost: 0,
  default_vend_price: 0,
  case_size: 1,
  lead_time_days: 1,
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/products", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setProducts(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.vendor || "").toLowerCase().includes(q);
  });

  async function save() {
    if (!editing?.name) return;
    setSaving(true);
    const method = editing.id ? "PATCH" : "POST";
    const res = await fetch("/api/inventory/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: editing.name,
        category: editing.category,
        vendor: editing.vendor,
        status: editing.status,
        unitCost: editing.unit_cost,
        defaultVendPrice: editing.default_vend_price,
        caseSize: editing.case_size,
        unitSize: editing.unit_size,
        barcode: editing.barcode,
        leadTimeDays: editing.lead_time_days,
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Products" subtitle="Catalog master — every SKU your operation stocks" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, SKU, or vendor…"
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setEditing({ ...EMPTY_DRAFT })}
            className="ml-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add product
          </button>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">SKU</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Vendor</th>
                <th className="text-right px-4 py-3 font-medium">Cost</th>
                <th className="text-right px-4 py-3 font-medium">Vend $</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-500"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-500">No products. Click "Add product" to start.</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3 text-gray-700">{p.category}</td>
                  <td className="px-4 py-3 text-gray-700">{p.vendor || "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-700">${(p.unit_cost ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{p.default_vend_price ? `$${p.default_vend_price.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                      p.status === "Active" ? "bg-green-100 text-green-700"
                      : p.status === "PhaseOut" ? "bg-amber-100 text-amber-700"
                      : p.status === "Proposed" ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-2 py-3">
                    <button onClick={() => setEditing({ ...p })} className="p-1 text-gray-500 hover:text-indigo-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editing.id ? "Edit product" : "Add product"}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className="text-sm text-gray-600">Name</span>
                <input
                  type="text"
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Category</span>
                <select
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                >
                  <option>Snacks</option>
                  <option>Drinks</option>
                  <option>Meals</option>
                  <option>Health</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Status</span>
                <select
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as Product["status"] })}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                  <option>PhaseOut</option>
                  <option>Proposed</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Vendor</span>
                <input
                  type="text"
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.vendor || ""}
                  onChange={(e) => setEditing({ ...editing, vendor: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Barcode</span>
                <input
                  type="text"
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.barcode || ""}
                  onChange={(e) => setEditing({ ...editing, barcode: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Unit cost</span>
                <input
                  type="number" step="0.01"
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.unit_cost ?? 0}
                  onChange={(e) => setEditing({ ...editing, unit_cost: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Default vend $</span>
                <input
                  type="number" step="0.01"
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.default_vend_price ?? 0}
                  onChange={(e) => setEditing({ ...editing, default_vend_price: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Case size</span>
                <input
                  type="number"
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.case_size ?? 1}
                  onChange={(e) => setEditing({ ...editing, case_size: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Lead time (days)</span>
                <input
                  type="number"
                  className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={editing.lead_time_days ?? 1}
                  onChange={(e) => setEditing({ ...editing, lead_time_days: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !editing.name}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
