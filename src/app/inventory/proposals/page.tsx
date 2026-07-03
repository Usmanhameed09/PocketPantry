"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, Plus, Sparkles, Check, X, TrendingUp } from "lucide-react";
import {
  PAGE_BG, CARD, EmptyState, LoadingBox, Modal,
  Field, Select, BtnPrimary, BtnSecondary, Badge, pageContainer,
} from "../ui";

type Proposal = {
  id: string; candidateName: string; category: string | null;
  reason: string | null; status: "Proposed" | "Approved" | "Rejected";
  suggestedInitialQty: number | null; targetLocations: string[];
  suggestedPriceMin: number | null; suggestedPriceMax: number | null;
  reasoningText: string | null; comparableSkuName: string | null;
  proposedBy: string | null; createdAt: string; decidedAt: string | null;
};

export default function ProposalsPage() {
  const isMobile = useIsMobile();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ candidateName: "", category: "Snacks", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);

  async function discoverTrending() {
    setDiscovering(true);
    setDiscoverMsg(null);
    try {
      const res = await fetch("/api/inventory/proposals/discover", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setDiscoverMsg(`Added ${data.added} trending candidate${data.added === 1 ? "" : "s"}.`);
        await load();
      } else {
        setDiscoverMsg(data.error || "Discovery failed");
      }
    } catch (err) {
      setDiscoverMsg(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setDiscovering(false);
      setTimeout(() => setDiscoverMsg(null), 6000);
    }
  }

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

  const statusColor: Record<Proposal["status"], "blue" | "green" | "gray"> = {
    Proposed: "blue", Approved: "green", Rejected: "gray",
  };

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Trending" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{
          ...CARD, padding: 16, marginBottom: 16,
          background: "linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%)",
          border: "1px solid #ddd6fe",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TrendingUp size={20} color="#6366f1" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                  Discover trending products
                </div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  AI scans your full product list, online trends, and category gaps to surface candidates worth adding.
                </div>
              </div>
            </div>
            <BtnPrimary onClick={discoverTrending} disabled={discovering}>
              {discovering ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={16} />}
              Find trending now
            </BtnPrimary>
          </div>
          {discoverMsg && (
            <div style={{ marginTop: 10, fontSize: 13, color: discoverMsg.includes("fail") ? "#dc2626" : "#15803d" }}>
              {discoverMsg}
            </div>
          )}
        </div>

        {/* What "Proposed Product" means + what Approve does (Arthur asked). */}
        <div style={{
          ...CARD, padding: "12px 16px", marginBottom: 16, background: "#f0f9ff",
          border: "1px solid #bae6fd", fontSize: 12.5, color: "#0369a1", lineHeight: 1.6,
        }}>
          <strong>What is a proposed product?</strong> A candidate you (or the AI) suggest adding to your
          catalog — with a starting quantity, target machines, and price range. It stays as a
          &ldquo;Proposed&rdquo; idea until you decide. <strong>Approving</strong> adds it to your
          product catalog (the Products list) as an active product so you can then stock it in the
          warehouse and assign it to machines. <strong>Rejecting</strong> discards the idea. Nothing is
          purchased or charged — Approve only creates the product record.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <BtnPrimary onClick={() => setShowForm(true)}>
            <Plus size={16} /> Propose product
          </BtnPrimary>
        </div>

        {loading ? <div style={CARD}><LoadingBox /></div> : proposals.length === 0 ? (
          <div style={CARD}>
            <EmptyState icon={<Sparkles size={40} color="#94a3b8" />}
              title="No proposals yet"
              message="Propose a new product and GPT-4o will suggest initial qty, target locations, and price range based on comparable SKUs." />
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {proposals.map((p) => (
              <div key={p.id} style={{ ...CARD, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", margin: 0 }}>{p.candidateName}</h3>
                      <Badge color={statusColor[p.status]}>{p.status}</Badge>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>· {p.category}</span>
                    </div>
                    <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>{p.reason}</p>

                    <div style={{
                      display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                      gap: 12, marginTop: 14,
                    }}>
                      <KV label="Initial qty" value={p.suggestedInitialQty ?? "—"} />
                      <KV label="Price range" value={
                        p.suggestedPriceMin && p.suggestedPriceMax
                          ? `$${p.suggestedPriceMin.toFixed(2)}–$${p.suggestedPriceMax.toFixed(2)}`
                          : "—"
                      } />
                      <KV label="Comparable" value={p.comparableSkuName || "—"} />
                      <KV label="Locations" value={p.targetLocations.join(", ") || "—"} small />
                    </div>

                    {p.reasoningText && (
                      <div style={{
                        marginTop: 14, padding: 12, background: "#ede9fe", borderRadius: 10,
                        border: "1px solid #ddd6fe", display: "flex", gap: 10,
                      }}>
                        <Sparkles size={16} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
                        <p style={{ fontSize: 13, color: "#3730a3", margin: 0, lineHeight: 1.5 }}>{p.reasoningText}</p>
                      </div>
                    )}
                  </div>

                  {p.status === "Proposed" && (
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "flex-start" }}>
                      <BtnPrimary onClick={() => decide(p.id, "Approved")}><Check size={16} /> Approve</BtnPrimary>
                      <BtnSecondary onClick={() => decide(p.id, "Rejected")}><X size={16} /> Reject</BtnSecondary>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title="Propose new product">
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Candidate name" type="text" value={form.candidateName}
              onChange={(v) => setForm({ ...form, candidateName: v })} />
            <Select label="Category" value={form.category}
              options={[
                { value: "Snacks", label: "Snacks" },
                { value: "Candy", label: "Candy" },
                { value: "Drinks", label: "Drinks" },
                { value: "Meals", label: "Meals" },
              ]}
              onChange={(v) => setForm({ ...form, category: v })} />
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>Why propose this?</span>
              <textarea rows={3} value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                style={{
                  width: "100%", marginTop: 4, padding: "9px 12px",
                  border: "1px solid #d5d9e2", borderRadius: 8, fontSize: 14,
                  outline: "none", fontFamily: "inherit", resize: "vertical",
                }} />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
            <BtnSecondary onClick={() => setShowForm(false)}>Cancel</BtnSecondary>
            <BtnPrimary onClick={submit} disabled={submitting || !form.candidateName}>
              {submitting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={16} />}
              Generate proposal
            </BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}

function KV({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: small ? 12 : 14, color: "#0f172a", fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
