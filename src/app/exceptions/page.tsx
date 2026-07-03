"use client";

/**
 * Exception Queue — single place to fix data quality issues.
 * Groups issues by type, each row has a contextual fix action.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { AlertCircle, AlertTriangle, Check, Info, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";

type ExceptionType =
  | "missing_cost" | "missing_price" | "suspicious_cost"
  | "negative_stock" | "unmapped_product" | "stale_machine";

type Exception = {
  id: string;
  type: ExceptionType;
  severity: "low" | "medium" | "high";
  productId?: string;
  productName?: string;
  machineId?: string;
  machineName?: string;
  message: string;
  fixAction: string;
  currentValue?: number | string | null;
  detectedAt: string;
};

type Response = {
  ok: boolean;
  counts: {
    total: number;
    byType: Record<string, number>;
    bySeverity: { high: number; medium: number; low: number };
  };
  exceptions: Exception[];
};

const TYPE_META: Record<ExceptionType, { label: string; description: string; color: string }> = {
  missing_cost:     { label: "Missing cost",       description: "Products with no unit cost set", color: "#dc2626" },
  missing_price:    { label: "Missing price",      description: "Products with no vending price", color: "#ea580c" },
  suspicious_cost:  { label: "Suspicious cost",    description: "Cost is higher than the selling price — likely a data error", color: "#dc2626" },
  negative_stock:   { label: "Negative stock",     description: "Machine inventory below zero — refill or sale not logged", color: "#d97706" },
  unmapped_product: { label: "Incomplete product", description: "Auto-created products missing vendor / case size / barcode", color: "#0d9488" },
  stale_machine:    { label: "Stale machine",      description: "Machine hasn't synced in 7+ days but isn't marked offline", color: "#7c3aed" },
};

export default function ExceptionsPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/exceptions").then((x) => x.json());
      if (r.ok) setData(r);
      else setError(r.error || "Failed to load exceptions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const g: Partial<Record<ExceptionType, Exception[]>> = {};
    for (const e of data?.exceptions || []) {
      (g[e.type] ||= []).push(e);
    }
    return g;
  }, [data]);

  async function resolveOne(e: Exception) {
    setPendingId(e.id);
    setFlash(null);
    try {
      const body: Record<string, unknown> = { type: e.type };
      if (e.productId) body.productId = e.productId;
      if (e.machineId) body.machineId = e.machineId;
      if (e.type === "negative_stock") {
        // id format is "negative_stock:<machine_inventory.id>"
        body.machineInventoryId = e.id.split(":")[1];
      }
      const needsValue = e.type === "missing_cost" || e.type === "missing_price" || e.type === "suspicious_cost";
      if (needsValue) {
        const v = Number(drafts[e.id]);
        if (!Number.isFinite(v) || v <= 0) {
          setFlash({ id: e.id, text: "Enter a positive number first." });
          setPendingId(null);
          return;
        }
        body.value = v;
      }
      const r = await fetch("/api/exceptions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((x) => x.json());
      if (!r.ok) {
        setFlash({ id: e.id, text: r.error || "Resolve failed" });
        return;
      }
      // If endpoint returned a URL (unmapped_product), navigate; else reload list
      if (r.openUrl) {
        window.location.href = r.openUrl;
        return;
      }
      setFlash({ id: e.id, text: r.message || "Done." });
      // Optimistic remove + reload
      setData((curr) => curr
        ? { ...curr, exceptions: curr.exceptions.filter((x) => x.id !== e.id), counts: {
            ...curr.counts,
            total: curr.counts.total - 1,
            byType: { ...curr.counts.byType, [e.type]: Math.max(0, (curr.counts.byType[e.type] || 1) - 1) },
            bySeverity: { ...curr.counts.bySeverity, [e.severity]: Math.max(0, curr.counts.bySeverity[e.severity] - 1) },
          } }
        : curr);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      <Header title="Exception Queue" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0, maxWidth: 720 }}>
          One inbox for data-quality issues across the app (missing costs, unmapped SKUs, price gaps,
          etc.). Fix each one and it clears from the list. It is <strong>not</strong> the same as the
          Cost Fixer — Cost Fixer (now in Pricing) only proposes corrected unit <em>costs</em>; this
          queue flags <em>all</em> kinds of data problems and links you to where to fix them.
        </p>
        <button
          onClick={() => void load()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8,
            background: "#fff", border: "1px solid #cbd5e1",
            fontSize: 13, fontWeight: 600, color: "#0f172a", cursor: "pointer",
          }}
        >
          <RefreshCw size={14} /> Re-scan
        </button>
      </div>

      {error && (
        <div style={{ ...errorBox }}>{error}</div>
      )}

      {/* Summary tiles */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
          <Tile label="Total"  value={data.counts.total} accent="#0f172a" />
          <Tile label="High"   value={data.counts.bySeverity.high}   accent="#dc2626" />
          <Tile label="Medium" value={data.counts.bySeverity.medium} accent="#d97706" />
          <Tile label="Low"    value={data.counts.bySeverity.low}    accent="#0d9488" />
        </div>
      )}

      {loading && !data && (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Scanning for exceptions…</div>
        </div>
      )}

      {data && data.exceptions.length === 0 && (
        <div style={{
          padding: 40, textAlign: "center",
          background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12,
          color: "#166534",
        }}>
          <Check size={36} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>Inbox zero</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>No data-quality issues detected right now.</div>
        </div>
      )}

      {data && (Object.keys(grouped) as ExceptionType[]).map((type) => {
        const items = grouped[type] || [];
        const meta = TYPE_META[type];
        return (
          <section key={type} style={{
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden",
            marginBottom: 16,
          }}>
            <div style={{
              padding: "12px 16px", background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: meta.color,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                  {meta.label} <span style={{ color: "#64748b", fontWeight: 500 }}>· {items.length}</span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{meta.description}</div>
              </div>
            </div>

            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((e) => {
                const isInputAction =
                  e.type === "missing_cost" || e.type === "missing_price" || e.type === "suspicious_cost";
                const isPending = pendingId === e.id;
                return (
                  <li key={e.id} style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
                  }}>
                    <SeverityIcon severity={e.severity} />
                    <div style={{ flex: "1 1 280px", minWidth: 240 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                        {e.productName && e.machineName
                          ? `${e.productName} · ${e.machineName}`
                          : e.productName || e.machineName || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, lineHeight: 1.5 }}>
                        {e.message}
                      </div>
                      {flash?.id === e.id && (
                        <div style={{
                          marginTop: 6, padding: "4px 8px",
                          fontSize: 11, borderRadius: 6,
                          background: flash.text.toLowerCase().includes("fail") || flash.text.toLowerCase().includes("error")
                            ? "#fef2f2" : "#f0fdf4",
                          color: flash.text.toLowerCase().includes("fail") || flash.text.toLowerCase().includes("error")
                            ? "#991b1b" : "#166534",
                        }}>{flash.text}</div>
                      )}
                    </div>

                    {/* Fix action — varies by type */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isInputAction && (
                        <input
                          type="number"
                          step="0.01" min="0"
                          placeholder={e.fixAction}
                          value={drafts[e.id] ?? ""}
                          onChange={(ev) => setDrafts((d) => ({ ...d, [e.id]: ev.target.value }))}
                          disabled={isPending}
                          style={{
                            width: 130, padding: "7px 10px", fontSize: 13,
                            border: "1px solid #cbd5e1", borderRadius: 6, outline: "none",
                          }}
                        />
                      )}
                      <button
                        onClick={() => void resolveOne(e)}
                        disabled={isPending}
                        style={{
                          padding: "7px 14px", borderRadius: 6,
                          background: "#16a34a", color: "#fff", border: "none",
                          fontSize: 13, fontWeight: 600,
                          cursor: isPending ? "wait" : "pointer",
                          display: "inline-flex", alignItems: "center", gap: 6,
                        }}
                      >
                        {isPending ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
                        {isInputAction ? "Save" : e.fixAction}
                      </button>
                      {/* Quick link to the affected entity for context */}
                      {e.productId && (
                        <Link
                          href={`/inventory/products`}
                          style={{ fontSize: 11, color: "#64748b", textDecoration: "underline" }}
                        >View product</Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
        color: "#64748b", textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1.1, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: "high" | "medium" | "low" }) {
  if (severity === "high") return <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />;
  if (severity === "medium") return <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />;
  return <Info size={18} color="#0d9488" style={{ flexShrink: 0, marginTop: 2 }} />;
}

const errorBox: React.CSSProperties = {
  padding: 12, borderRadius: 8,
  background: "#fef2f2", border: "1px solid #fecaca",
  color: "#991b1b", fontSize: 13, marginBottom: 14,
};
