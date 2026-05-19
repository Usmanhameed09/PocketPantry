"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { Loader2, ArrowRight } from "lucide-react";

type Plan = {
  id: string;
  oldProductId: string;
  oldProductName: string;
  newProductId: string;
  newProductName: string;
  status: "Active" | "Completed" | "Cancelled";
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
};

export default function ReplacementsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/replacements", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setPlans(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Replacement Plans" subtitle="Active product phase-outs" />
      <InventoryTabs />
      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin inline text-gray-400" /></div>
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No active replacement plans.</div>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <div key={p.id} className="bg-white rounded-lg shadow p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-xs text-gray-500">Phasing out</div>
                      <div className="font-medium line-through text-gray-500">{p.oldProductName}</div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500">Replacement</div>
                      <div className="font-medium text-gray-900">{p.newProductName}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    p.status === "Active" ? "bg-blue-100 text-blue-700"
                    : p.status === "Completed" ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                  }`}>{p.status}</span>
                </div>
                {p.notes && <p className="text-sm text-gray-600 mt-2">{p.notes}</p>}
                <div className="text-xs text-gray-500 mt-2">Started {new Date(p.startedAt).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
