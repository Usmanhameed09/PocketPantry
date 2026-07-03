"use client";

/**
 * Cost Fixer — relocated from the Inventory module into Pricing per operator
 * request (it fixes unit COSTS, which belong with pricing work). Rendered as a
 * tab inside the Pricing page. Logic is unchanged from the old inventory route;
 * only the page chrome (Header/InventoryTabs) was stripped so it embeds as a
 * panel. It still calls the same /api/inventory/cost-fixer/* endpoints.
 */

import { useState, useCallback } from "react";
import { Loader2, Sparkles, Check, AlertCircle, Wand2 } from "lucide-react";
import { CARD, Th, Td, EmptyState, LoadingBox, BtnPrimary, Badge } from "../inventory/ui";

type Proposal = {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  currentCost: number;
  vendPrice: number | null;
  avgRevPerUnit: number | null;
  caseSize: number;
  suggestedCost: number;
  inferredPackSize: number | null;
  confidence: number;
  method: "case_size_divide" | "title_parse" | "ai" | "ai_low_confidence";
  reasoning: string;
};

const METHOD_LABEL: Record<Proposal["method"], { label: string; color: "green" | "blue" | "amber" | "gray" }> = {
  case_size_divide: { label: "case_size known", color: "green" },
  title_parse:      { label: "title pack hint", color: "blue" },
  ai:               { label: "AI high conf", color: "amber" },
  ai_low_confidence:{ label: "AI low conf — review", color: "gray" },
};

export default function CostFixerPanel() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [scanMeta, setScanMeta] = useState<{ totalSuspicious: number } | null>(null);
  const [resultMsg, setResultMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  const runScan = useCallback(async () => {
    setScanning(true);
    setResultMsg(null);
    try {
      const res = await fetch("/api/inventory/cost-fixer/scan", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Scan failed");
      setProposals(data.proposals || []);
      setScanMeta({ totalSuspicious: data.totalSuspicious || 0 });
      const presel = new Set<string>(
        (data.proposals || []).filter((p: Proposal) => p.confidence >= 0.8).map((p: Proposal) => p.productId)
      );
      setSelected(presel);
      setOverrides({});
    } catch (e) {
      setResultMsg({ text: e instanceof Error ? e.message : "Scan failed", type: "err" });
    } finally {
      setScanning(false);
    }
  }, []);

  function toggleAll(check: boolean) {
    if (check) setSelected(new Set(proposals.map((p) => p.productId)));
    else setSelected(new Set());
  }

  async function applySelected() {
    if (selected.size === 0) return;
    setApplying(true);
    setResultMsg(null);
    try {
      const fixes = proposals
        .filter((p) => selected.has(p.productId))
        .map((p) => {
          const ov = overrides[p.productId];
          const finalCost = ov && Number(ov) > 0 ? Number(ov) : p.suggestedCost;
          return {
            productId: p.productId,
            newUnitCost: Math.round(finalCost * 100) / 100,
            caseSize: p.inferredPackSize ?? null,
          };
        });
      const res = await fetch("/api/inventory/cost-fixer/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Apply failed");
      setResultMsg({
        text: `Applied ${data.applied} fixes${data.errors?.length ? `, ${data.errors.length} errors` : ""}.`,
        type: "ok",
      });
      const appliedIds = new Set(fixes.map((f) => f.productId));
      setProposals((cur) => cur.filter((p) => !appliedIds.has(p.productId)));
      setSelected(new Set());
    } catch (e) {
      setResultMsg({ text: e instanceof Error ? e.message : "Apply failed", type: "err" });
    } finally {
      setApplying(false);
    }
  }

  const allChecked = proposals.length > 0 && selected.size === proposals.length;

  return (
    <div>
      <div style={{
        ...CARD, padding: 18, marginBottom: 16,
        background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
        border: "1px solid #fcd34d",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Wand2 size={20} color="#b45309" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e" }}>
                Cost Fixer — clean up case-prices-stored-as-unit-costs
              </div>
              <div style={{ fontSize: 12, color: "#78350f" }}>
                Scans your catalog for suspicious unit costs and proposes corrections using known case sizes, pack hints in product names, and AI when needed.
              </div>
            </div>
          </div>
          <BtnPrimary onClick={runScan} disabled={scanning}>
            {scanning ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={16} />}
            {scanning ? "Scanning…" : "Run scan"}
          </BtnPrimary>
        </div>
        {scanMeta && (
          <div style={{ fontSize: 12, color: "#78350f", marginTop: 8 }}>
            Found <strong>{scanMeta.totalSuspicious}</strong> suspicious products total. Showing top {proposals.length} with proposals below.
          </div>
        )}
        {resultMsg && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13,
            background: resultMsg.type === "ok" ? "#dcfce7" : "#fef2f2",
            border: `1px solid ${resultMsg.type === "ok" ? "#bbf7d0" : "#fecaca"}`,
            color: resultMsg.type === "ok" ? "#15803d" : "#dc2626",
          }}>
            {resultMsg.text}
          </div>
        )}
      </div>

      {scanning ? (
        <div style={CARD}><LoadingBox /></div>
      ) : proposals.length === 0 ? (
        <div style={CARD}>
          <EmptyState
            icon={<AlertCircle size={40} color="#94a3b8" />}
            title={scanMeta ? "No correctable cost issues found" : "Run a scan to find suspicious costs"}
            message={scanMeta
              ? "Either your catalog is clean OR the suspicious items need manual review."
              : "Click \"Run scan\" above to start. The scan finds products where the stored unit cost looks like a case price."}
          />
        </div>
      ) : (
        <>
          <div style={{ ...CARD, padding: 14, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "#475569", cursor: "pointer" }}>
              <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
              Select all ({proposals.length})
            </label>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {selected.size} selected
            </div>
            <BtnPrimary onClick={applySelected} disabled={selected.size === 0 || applying}>
              {applying ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={16} />}
              Apply selected
            </BtnPrimary>
          </div>

          <div style={{ ...CARD, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <Th width={32}></Th>
                <Th>Product</Th>
                <Th align="right">Current cost</Th>
                <Th align="right">Suggested</Th>
                <Th align="right">Vend price</Th>
                <Th align="right">Pack</Th>
                <Th>Method</Th>
                <Th>Reasoning</Th>
              </tr></thead>
              <tbody>
                {proposals.map((p, idx) => {
                  const meta = METHOD_LABEL[p.method];
                  const isSel = selected.has(p.productId);
                  return (
                    <tr key={p.productId} style={{ borderTop: idx === 0 ? "none" : "1px solid #f1f5f9" }}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={(e) => {
                            setSelected((cur) => {
                              const next = new Set(cur);
                              if (e.target.checked) next.add(p.productId);
                              else next.delete(p.productId);
                              return next;
                            });
                          }}
                        />
                      </Td>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{p.productName}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>
                          {p.sku} · {p.category}
                        </div>
                      </Td>
                      <Td align="right" mono>${p.currentCost.toFixed(2)}</Td>
                      <Td align="right">
                        <input
                          type="number"
                          step="0.01"
                          value={overrides[p.productId] ?? p.suggestedCost.toFixed(2)}
                          onChange={(e) => setOverrides((cur) => ({ ...cur, [p.productId]: e.target.value }))}
                          style={{
                            width: 80, padding: "4px 8px", border: "1px solid #d5d9e2",
                            borderRadius: 6, textAlign: "right", fontFamily: "ui-monospace, monospace",
                            fontSize: 13, fontWeight: 700, color: "#0f172a",
                          }}
                        />
                      </Td>
                      <Td align="right" mono>{p.vendPrice ? `$${p.vendPrice.toFixed(2)}` : "—"}</Td>
                      <Td align="right" mono>{p.inferredPackSize ?? "—"}</Td>
                      <Td><Badge color={meta.color}>{meta.label}</Badge></Td>
                      <Td>
                        <div style={{ fontSize: 12, color: "#64748b", maxWidth: 320 }}>
                          {p.reasoning}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          confidence {(p.confidence * 100).toFixed(0)}%
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
