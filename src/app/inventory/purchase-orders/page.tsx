"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { Loader2, ExternalLink } from "lucide-react";

type PO = {
  id: string;
  supplier: string;
  status: string;
  totalCost: number;
  createdAt: string;
  approvedAt: string | null;
  purchasedAt: string | null;
  receivedAt: string | null;
  lineCount: number;
};

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Approved: "bg-blue-100 text-blue-700",
  Purchased: "bg-amber-100 text-amber-700",
  Received: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
};

export default function PurchaseOrdersPage() {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Purchase Orders" subtitle="Draft → Approved → Purchased → Received" />
      <InventoryTabs />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-4">
          {["All", "Draft", "Approved", "Purchased", "Received"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-sm rounded ${filterStatus === s ? "bg-indigo-600 text-white" : "bg-white border text-gray-700"}`}
            >
              {s} {s !== "All" && byStatus[s] ? `(${byStatus[s]})` : ""}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">PO</th>
                <th className="text-left px-4 py-3 font-medium">Supplier</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Lines</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">No purchase orders.</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{p.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.supplier}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLORS[p.status] || "bg-gray-100"}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{p.lineCount}</td>
                  <td className="px-4 py-3 text-right">${p.totalCost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="px-2 py-3">
                    <Link href={`/inventory/purchase-orders/${p.id}`} className="text-indigo-600 hover:text-indigo-700">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
