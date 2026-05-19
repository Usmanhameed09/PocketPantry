"use client";

import { useState, useCallback } from "react";
import Header from "@/components/Header";
import { Loader2, Zap, ShoppingCart, ChevronDown, ChevronRight } from "lucide-react";

type BuyListLine = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  vendor: string;
  unitCost: number;
  warehouseOnHand: number;
  reservedInOpenPos: number;
  velocityPerDay: number;
  horizonDemand: number;
  safetyBuffer: number;
  recommendedQty: number;
  estimatedCost: number;
  explanation: string;
};

type VendorGroup = { vendor: string; lines: BuyListLine[]; subtotal: number };

export default function BuyListPage() {
  const [groups, setGroups] = useState<VendorGroup[]>([]);
  const [horizonDays, setHorizonDays] = useState(7);
  const [safetyDays, setSafetyDays] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setGenerating(true);
    setResultMsg(null);
    const res = await fetch("/api/inventory/buy-list", { cache: "no-store" });
    const data = await res.json();
    if (data.success) {
      setGroups(data.data.vendorGroups || []);
      setHorizonDays(data.data.horizonDays);
      setSafetyDays(data.data.safetyStockDays);
      setGeneratedAt(data.data.generatedAt);
      setExpanded(new Set(data.data.vendorGroups.map((g: VendorGroup) => g.vendor)));
    } else {
      setResultMsg(data.error || "Failed");
    }
    setGenerating(false);
  }, []);

  async function convertToPOs() {
    setConverting(true);
    const res = await fetch("/api/inventory/buy-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setConverting(false);
    if (data.success) {
      setResultMsg(`Created ${data.poIds.length} PO drafts.`);
      setGroups([]);
    } else {
      setResultMsg(data.error || "Failed");
    }
  }

  const totalCost = groups.reduce((s, g) => s + g.subtotal, 0);
  const totalUnits = groups.reduce((s, g) => s + g.lines.reduce((s2, l) => s2 + l.recommendedQty, 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Buy List" subtitle="Generate this week's purchase list grouped by vendor" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Generate this week's buy list</h2>
              <p className="text-sm text-gray-600 mt-1">
                Horizon: {horizonDays}d · Safety: {safetyDays}d {generatedAt && `· Last run ${new Date(generatedAt).toLocaleString()}`}
              </p>
            </div>
            <button
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate buy list
            </button>
          </div>
          {resultMsg && <div className="mt-3 text-sm text-green-700 bg-green-50 px-3 py-2 rounded">{resultMsg}</div>}
        </div>

        {groups.length > 0 && (
          <>
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-4">
              <div>
                <div className="text-sm text-gray-600">Total estimated cost</div>
                <div className="text-2xl font-semibold text-gray-900">${totalCost.toFixed(2)}</div>
                <div className="text-xs text-gray-500 mt-1">{totalUnits} units · {groups.length} vendors</div>
              </div>
              <button
                onClick={convertToPOs}
                disabled={converting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                Convert to PO drafts
              </button>
            </div>

            {groups.map((g) => {
              const isOpen = expanded.has(g.vendor);
              return (
                <div key={g.vendor} className="bg-white rounded-lg shadow mb-3">
                  <button
                    onClick={() => setExpanded((p) => {
                      const next = new Set(p);
                      if (next.has(g.vendor)) next.delete(g.vendor); else next.add(g.vendor);
                      return next;
                    })}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-medium text-gray-900">{g.vendor}</span>
                      <span className="text-sm text-gray-500">({g.lines.length} items)</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">${g.subtotal.toFixed(2)}</div>
                  </button>
                  {isOpen && (
                    <table className="w-full text-sm border-t">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Product</th>
                          <th className="text-right px-4 py-2 font-medium">On hand</th>
                          <th className="text-right px-4 py-2 font-medium">Reserved</th>
                          <th className="text-right px-4 py-2 font-medium">Buy qty</th>
                          <th className="text-right px-4 py-2 font-medium">Cost</th>
                          <th className="text-left px-4 py-2 font-medium">Why</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.lines.map((l) => (
                          <tr key={l.productId} className="border-t">
                            <td className="px-4 py-2">
                              <div className="font-medium text-gray-900">{l.productName}</div>
                              <div className="text-xs text-gray-500">{l.sku}</div>
                            </td>
                            <td className="px-4 py-2 text-right">{l.warehouseOnHand}</td>
                            <td className="px-4 py-2 text-right">{l.reservedInOpenPos}</td>
                            <td className="px-4 py-2 text-right font-semibold">{l.recommendedQty}</td>
                            <td className="px-4 py-2 text-right">${l.estimatedCost.toFixed(2)}</td>
                            <td className="px-4 py-2 text-xs text-gray-600">{l.explanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
