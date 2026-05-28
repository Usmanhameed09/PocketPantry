"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Weights = {
  verticals: Record<string, number>;
  employees: { min_25?: number; min_50?: number; min_100?: number; min_250?: number };
  data: { has_mobile?: number; has_email?: number; has_address?: number; has_dm_title?: number };
};

type Thresholds = { A: number; B: number };

export default function ScoringConfigPage() {
  const [weights, setWeights] = useState<Weights | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [defaults, setDefaults] = useState<{ weights: Weights; thresholds: Thresholds } | null>(null);
  const [saving, setSaving] = useState(false);
  const [rescoreAll, setRescoreAll] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);
  async function load() {
    const r = await fetch("/api/leads/scoring-config").then((x) => x.json());
    if (r.ok) {
      setWeights(r.weights);
      setThresholds(r.thresholds);
      setDefaults(r.defaults);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/leads/scoring-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weights, thresholds, rescoreAll }),
    }).then((x) => x.json());
    setSaving(false);
    if (r.ok) setMsg(`Saved. ${r.rescored ? `Re-scored ${r.rescored} leads.` : ""}`);
    else setMsg(r.error || "Save failed");
  }

  function reset() {
    if (!defaults) return;
    setWeights(JSON.parse(JSON.stringify(defaults.weights)));
    setThresholds(JSON.parse(JSON.stringify(defaults.thresholds)));
  }

  if (!weights || !thresholds) {
    return <main style={{ padding: 32 }}><p>Loading…</p></main>;
  }

  return (
    <main style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#0f172a" }}>Lead scoring config</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Weights and thresholds for A/B/C tier assignment.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/pipeline/v2" style={btn("ghost")}>← Dashboard</Link>
          <button onClick={reset} style={btn("ghost")}>Reset to defaults</button>
          <button onClick={save} disabled={saving} style={btn("primary")}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </header>

      {msg && <div style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#166534", padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      <section style={panel}>
        <h2 style={panelHeader}>Thresholds</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 16px 16px" }}>
          <Field label="Tier A — score ≥" value={thresholds.A} onChange={(n) => setThresholds({ ...thresholds, A: n })} />
          <Field label="Tier B — score ≥" value={thresholds.B} onChange={(n) => setThresholds({ ...thresholds, B: n })} />
        </div>
        <p style={{ padding: "0 16px 16px", margin: 0, fontSize: 12, color: "#64748b" }}>
          Anything below B threshold falls into Tier C.
        </p>
      </section>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={panelHeader}>Verticals (max 1 per lead)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
          {Object.entries(weights.verticals).map(([k, v]) => (
            <Field
              key={k}
              label={k}
              value={v}
              onChange={(n) => setWeights({ ...weights, verticals: { ...weights.verticals, [k]: n } })}
            />
          ))}
        </div>
      </section>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={panelHeader}>Employee count tiers (highest matching wins)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
          {(["min_25", "min_50", "min_100", "min_250"] as const).map((key) => (
            <Field
              key={key}
              label={`${key.replace("min_", "≥ ")} employees`}
              value={weights.employees[key] ?? 0}
              onChange={(n) => setWeights({ ...weights, employees: { ...weights.employees, [key]: n } })}
            />
          ))}
        </div>
      </section>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={panelHeader}>Data completeness (additive)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 16px" }}>
          {(["has_mobile", "has_email", "has_address", "has_dm_title"] as const).map((key) => (
            <Field
              key={key}
              label={key.replace("has_", "Has ").replace("_", " ")}
              value={weights.data[key] ?? 0}
              onChange={(n) => setWeights({ ...weights, data: { ...weights.data, [key]: n } })}
            />
          ))}
        </div>
      </section>

      <section style={{ ...panel, marginTop: 16 }}>
        <h2 style={panelHeader}>On save</h2>
        <label style={{ display: "flex", gap: 10, padding: "0 16px 16px", alignItems: "center", fontSize: 14, color: "#0f172a" }}>
          <input type="checkbox" checked={rescoreAll} onChange={(e) => setRescoreAll(e.target.checked)} />
          Re-score every lead with the new weights
        </label>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ padding: "6px 10px", fontSize: 14, borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff" }}
      />
    </label>
  );
}

const panel: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden",
};
const panelHeader: React.CSSProperties = {
  margin: 0, padding: "14px 16px", fontSize: 14, fontWeight: 700, color: "#0f172a",
  borderBottom: "1px solid #e2e8f0", letterSpacing: -0.2,
};
function btn(variant: "primary" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "inline-block",
    border: "1px solid transparent",
  };
  if (variant === "primary") return { ...base, background: "#16a34a", color: "#fff" };
  return { ...base, background: "#fff", color: "#0f172a", border: "1px solid #cbd5e1" };
}
