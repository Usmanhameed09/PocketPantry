"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { Loader2, ArrowRightLeft } from "lucide-react";

type Underperformer = {
  productId: string;
  productName: string;
  category: string;
  unitsLast4Weeks: number;
  averageWeekly: number;
  margin: number | null;
  reason: string;
};

type Product = { id: string; name: string };

export default function UnderperformersPage() {
  const [rows, setRows] = useState<Underperformer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaceFor, setReplaceFor] = useState<Underperformer | null>(null);
  const [newProductId, setNewProductId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const [u, p] = await Promise.all([
      fetch("/api/inventory/underperformers", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/inventory/products", { cache: "no-store" }).then((r) => r.json()),
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
    <div className="min-h-screen bg-gray-50">
      <Header title="Underperformers" subtitle="Products flagged for low volume or low margin" />
      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin inline text-gray-400" /></div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No underperformers — everything is selling and margin-positive.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Product</th>
                  <th className="text-right px-4 py-3 font-medium">4-wk units</th>
                  <th className="text-right px-4 py-3 font-medium">Weekly avg</th>
                  <th className="text-right px-4 py-3 font-medium">Margin</th>
                  <th className="text-left px-4 py-3 font-medium">Reason</th>
                  <th className="w-32"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.productId} className="border-t">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.productName}</td>
                    <td className="px-4 py-3 text-right">{r.unitsLast4Weeks}</td>
                    <td className="px-4 py-3 text-right">{r.averageWeekly.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right">{r.margin !== null ? `${r.margin}%` : "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{r.reason}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setReplaceFor(r)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200">
                        <ArrowRightLeft className="w-3 h-3" /> Replace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {replaceFor && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-2">Replace {replaceFor.productName}</h2>
            <p className="text-sm text-gray-600 mb-4">Old product moves to PhaseOut (still sellable). New product takes its place in buy lists.</p>
            <label className="block">
              <span className="text-sm text-gray-600">Replacement product</span>
              <select className="mt-1 w-full px-3 py-2 border rounded text-sm"
                value={newProductId}
                onChange={(e) => setNewProductId(e.target.value)}>
                <option value="">Select…</option>
                {products.filter((p) => p.id !== replaceFor.productId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setReplaceFor(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={submitReplacement} disabled={!newProductId} className="px-4 py-2 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                Start replacement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
