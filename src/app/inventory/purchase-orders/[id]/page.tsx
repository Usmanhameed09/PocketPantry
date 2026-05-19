"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Loader2, CheckCircle2, ShoppingBag, PackageCheck, Ban } from "lucide-react";

type Line = {
  id: string;
  productId: string;
  productName: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
};

type PODetail = {
  id: string;
  supplier: string;
  status: string;
  totalCost: number;
  createdAt: string;
  approvedAt: string | null;
  purchasedAt: string | null;
  receivedAt: string | null;
  notes: string | null;
  lines: Line[];
};

export default function PODetailPage() {
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
      <div className="min-h-screen bg-gray-50">
        <Header title="Purchase Order" />
        <div className="max-w-5xl mx-auto px-4 py-6 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!po) return null;

  const canApprove = po.status === "Draft";
  const canPurchase = po.status === "Approved";
  const canReceive = po.status === "Purchased" || po.status === "Approved";

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={`PO ${po.id.slice(0, 8)}`} subtitle={po.supplier} />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Status</div>
              <div className="text-xl font-semibold text-gray-900">{po.status}</div>
              <div className="text-xs text-gray-500 mt-1">Created {new Date(po.createdAt).toLocaleString()}</div>
            </div>
            <div className="flex gap-2">
              {canApprove && (
                <button onClick={() => transition("Approved")} disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </button>
              )}
              {canPurchase && (
                <button onClick={() => transition("Purchased")} disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                  <ShoppingBag className="w-4 h-4" /> Mark Purchased
                </button>
              )}
              {po.status !== "Received" && po.status !== "Cancelled" && (
                <button onClick={() => transition("Cancelled")} disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50">
                  <Ban className="w-4 h-4" /> Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-right px-4 py-3 font-medium">Ordered</th>
                <th className="text-right px-4 py-3 font-medium">Received</th>
                <th className="text-right px-4 py-3 font-medium">Unit cost</th>
                {canReceive && <th className="text-right px-4 py-3 font-medium">Receive now</th>}
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => {
                const remaining = l.qtyOrdered - l.qtyReceived;
                return (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-gray-900">{l.productName}</td>
                    <td className="px-4 py-3 text-right">{l.qtyOrdered}</td>
                    <td className="px-4 py-3 text-right">{l.qtyReceived}</td>
                    <td className="px-4 py-3 text-right">${l.unitCost.toFixed(2)}</td>
                    {canReceive && (
                      <td className="px-4 py-3 text-right">
                        {remaining > 0 ? (
                          <input
                            type="number"
                            max={remaining}
                            min={0}
                            placeholder={String(remaining)}
                            className="w-20 px-2 py-1 text-sm border rounded"
                            value={receipts[l.id] || ""}
                            onChange={(e) => setReceipts((p) => ({ ...p, [l.id]: e.target.value }))}
                          />
                        ) : (
                          <span className="text-green-600 text-xs">Complete</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canReceive && Object.values(receipts).some((v) => Number(v) > 0) && (
          <div className="mt-4 flex justify-end">
            <button onClick={submitReceipts} disabled={submitting} className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
              Submit receipt
            </button>
          </div>
        )}

        <div className="mt-6 text-right text-sm">
          <button onClick={() => router.push("/inventory/purchase-orders")} className="text-indigo-600 hover:text-indigo-700">← All purchase orders</button>
        </div>
      </div>
    </div>
  );
}
