"use client";

import { useState, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Loader2, Zap, ShoppingCart, ChevronDown, ChevronRight, Package, DollarSign, Store } from "lucide-react";
import {
  PAGE_BG, CARD, StatCard, Th, Td, EmptyState, LoadingBox,
  BtnPrimary, BtnSecondary, pageContainer,
} from "../ui";

type BuyListLine = {
  productId: string; productName: string; sku: string; category: string;
  vendor: string; unitCost: number; warehouseOnHand: number;
  reservedInOpenPos: number; velocityPerDay: number; horizonDemand: number;
  safetyBuffer: number; recommendedQty: number; estimatedCost: number; explanation: string;
};
type VendorGroup = { vendor: string; lines: BuyListLine[]; subtotal: number };

export default function BuyListPage() {
  const isMobile = useIsMobile();
  const [groups, setGroups] = useState<VendorGroup[]>([]);
  const [horizonDays, setHorizonDays] = useState(7);
  const [safetyDays, setSafetyDays] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

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
      setResultMsg({ text: data.error || "Failed", type: "err" });
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
      setResultMsg({ text: `Created ${data.poIds.length} purchase order draft${data.poIds.length === 1 ? "" : "s"}.`, type: "ok" });
      setGroups([]);
    } else {
      setResultMsg({ text: data.error || "Failed", type: "err" });
    }
  }

  const totalCost = groups.reduce((s, g) => s + g.subtotal, 0);
  const totalUnits = groups.reduce((s, g) => s + g.lines.reduce((s2, l) => s2 + l.recommendedQty, 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Buy List" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        <div style={{ ...CARD, padding: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>Weekly buy list</h2>
              <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
                Horizon: <strong>{horizonDays}d</strong> · Safety: <strong>{safetyDays}d</strong>
                {generatedAt && ` · Last run ${new Date(generatedAt).toLocaleString()}`}
              </p>
            </div>
            <BtnPrimary onClick={generate} disabled={generating}>
              {generating ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={16} />}
              Generate buy list
            </BtnPrimary>
          </div>
          {resultMsg && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13,
              background: resultMsg.type === "ok" ? "#f0fdf4" : "#fef2f2",
              color: resultMsg.type === "ok" ? "#15803d" : "#dc2626",
              border: `1px solid ${resultMsg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
            }}>{resultMsg.text}</div>
          )}
        </div>

        {groups.length > 0 && (
          <>
            <div style={{
              display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr) auto", gap: 16, marginBottom: 16,
            }}>
              <StatCard icon={<DollarSign size={20} />} iconBg="#dcfce7" iconColor="#16a34a"
                label="Total cost" value={`$${totalCost.toFixed(2)}`} sub="estimated" />
              <StatCard icon={<Package size={20} />} iconBg="#ede9fe" iconColor="#6366f1"
                label="Total units" value={totalUnits} sub="across all vendors" />
              <StatCard icon={<Store size={20} />} iconBg="#fef3c7" iconColor="#d97706"
                label="Vendors" value={groups.length} sub={`${groups.reduce((s, g) => s + g.lines.length, 0)} line items`} />
              <div style={{ ...CARD, padding: 18, display: "flex", alignItems: "center" }}>
                <BtnPrimary onClick={convertToPOs} disabled={converting} fullWidth>
                  {converting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <ShoppingCart size={16} />}
                  Convert to PO drafts
                </BtnPrimary>
              </div>
            </div>

            {groups.map((g) => {
              const isOpen = expanded.has(g.vendor);
              return (
                <div key={g.vendor} style={{ ...CARD, marginBottom: 12 }}>
                  <button
                    onClick={() => setExpanded((p) => {
                      const next = new Set(p);
                      if (next.has(g.vendor)) next.delete(g.vendor); else next.add(g.vendor);
                      return next;
                    })}
                    style={{
                      width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "16px 20px", background: "transparent", border: "none", cursor: "pointer",
                      borderRadius: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {isOpen ? <ChevronDown size={18} color="#64748b" /> : <ChevronRight size={18} color="#64748b" />}
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{g.vendor}</span>
                      <span style={{ fontSize: 13, color: "#64748b" }}>({g.lines.length} items)</span>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>${g.subtotal.toFixed(2)}</span>
                  </button>
                  {isOpen && (
                    <div style={{ borderTop: "1px solid #f1f5f9", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr>
                          <Th>Product</Th>
                          <Th align="right">On hand</Th>
                          <Th align="right">Reserved</Th>
                          <Th align="right">Buy qty</Th>
                          <Th align="right">Cost</Th>
                          <Th>Why</Th>
                        </tr></thead>
                        <tbody>
                          {g.lines.map((l, idx) => (
                            <tr key={l.productId} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                              <Td>
                                <div style={{ fontWeight: 600 }}>{l.productName}</div>
                                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "ui-monospace, monospace" }}>{l.sku}</div>
                              </Td>
                              <Td align="right" mono>{l.warehouseOnHand}</Td>
                              <Td align="right" mono>{l.reservedInOpenPos}</Td>
                              <Td align="right" mono bold>{l.recommendedQty}</Td>
                              <Td align="right" mono>${l.estimatedCost.toFixed(2)}</Td>
                              <Td><span style={{ fontSize: 12, color: "#64748b" }}>{l.explanation}</span></Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {!generating && groups.length === 0 && !resultMsg && (
          <div style={CARD}>
            <EmptyState icon={<ShoppingCart size={40} color="#94a3b8" />}
              title="Click 'Generate buy list' to start"
              message="The buy list is computed from projections + current stock + safety stock buffer." />
          </div>
        )}
      </div>
    </div>
  );
}
