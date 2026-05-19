"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { Loader2, Plus, Sparkles, Check, X } from "lucide-react";

type Proposal = {
  id: string;
  candidateName: string;
  category: string | null;
  reason: string | null;
  status: "Proposed" | "Approved" | "Rejected";
  suggestedInitialQty: number | null;
  targetLocations: string[];
  suggestedPriceMin: number | null;
  suggestedPriceMax: number | null;
  reasoningText: string | null;
  comparableSkuName: string | null;
  proposedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ candidateName: "", category: "Snacks", reason: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/proposals", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setProposals(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!form.candidateName || !form.reason) return;
    setSubmitting(true);
    await fetch("/api/inventory/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    setShowForm(false);
    setForm({ candidateName: "", category: "Snacks", reason: "" });
    await load();
  }

  async function decide(id: string, decision: "Approved" | "Rejected") {
    await fetch("/api/inventory/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision }),
    });
    await load();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Product Proposals" subtitle="AI-advised new products. You approve before they hit buy lists." />
      <InventoryTabs />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Propose product
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin inline text-gray-400" /></div>
        ) : proposals.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No proposals yet.</div>
        ) : (
          <div className="space-y-3">
            {proposals.map((p) => (
              <div key={p.id} className="bg-white rounded-lg shadow p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{p.candidateName}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        p.status === "Proposed" ? "bg-blue-100 text-blue-700"
                        : p.status === "Approved" ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                      }`}>{p.status}</span>
                      <span className="text-xs text-gray-500">· {p.category}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{p.reason}</p>

                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Initial qty</div>
                        <div className="font-medium">{p.suggestedInitialQty ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Price range</div>
                        <div className="font-medium">
                          {p.suggestedPriceMin && p.suggestedPriceMax
                            ? `$${p.suggestedPriceMin.toFixed(2)}–$${p.suggestedPriceMax.toFixed(2)}`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Comparable</div>
                        <div className="font-medium">{p.comparableSkuName || "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Locations</div>
                        <div className="font-medium text-xs">{p.targetLocations.join(", ") || "—"}</div>
                      </div>
                    </div>

                    {p.reasoningText && (
                      <div className="mt-3 flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded p-3 text-sm text-gray-700">
                        <Sparkles className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                        <p>{p.reasoningText}</p>
                      </div>
                    )}
                  </div>
                  {p.status === "Proposed" && (
                    <div className="flex gap-2 ml-4">
                      <button onClick={() => decide(p.id, "Approved")} className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                        <Check className="w-4 h-4" /> Approve
                      </button>
                      <button onClick={() => decide(p.id, "Rejected")} className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">
                        <X className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Propose new product</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-gray-600">Candidate name</span>
                <input type="text" className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={form.candidateName}
                  onChange={(e) => setForm({ ...form, candidateName: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Category</span>
                <select className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option>Snacks</option><option>Drinks</option><option>Meals</option><option>Health</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Why propose this?</span>
                <textarea rows={3} className="mt-1 w-full px-3 py-2 border rounded text-sm"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={submit} disabled={submitting || !form.candidateName} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate proposal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
