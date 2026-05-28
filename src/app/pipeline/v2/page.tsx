"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DashboardData = {
  tiers: Record<"A" | "B" | "C", { total: number; won: number; conversionPct: number }>;
  funnel: Record<string, number>;
  owners: Record<string, { total: number; won: number; conversionPct: number }>;
  today: { callReady: number; dueToday: number; noNextAction: number };
  sla: { open: number; sample: Array<{ id: string; title: string; priority: string }> };
  generatedAt: string;
};

type LeadTask = {
  id: string;
  leadId: string;
  taskType: string;
  scheduledFor: string;
  priority: number;
  reason: string | null;
};

type MeetingsResponse = {
  meetings: Array<{ id: string; business: string; contact: string; owner: string; tier: string; date: string; time: string }>;
  totalUpcoming: number;
  openSlots: Array<{ date: string; time: string }>;
};

type Lead = {
  id: string;
  business: string;
  contact: string;
  phone: string;
  apolloMobile?: string;
  email: string;
  tier?: "A" | "B" | "C";
  tierScore?: number;
  owner?: string;
  vertical?: string;
  stage: string;
  nextAction?: string;
  nextActionAt?: string;
  lastTouchAt?: string;
  isCallReady?: boolean;
  notInterestedReason?: string;
};

const STAGE_ORDER = [
  "New Lead", "Prospect", "Contacted", "Qualified", "Interested",
  "Follow-Up", "Site Visit Requested", "Proposal Requested",
  "Meeting Booked", "Won", "Installed", "Not Interested", "Callback",
];

const TIER_COLOR: Record<string, string> = { A: "#16a34a", B: "#eab308", C: "#94a3b8" };

export default function PipelineV2Page() {
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [queue, setQueue] = useState<LeadTask[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meetings, setMeetings] = useState<MeetingsResponse | null>(null);
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notInterestedOpen, setNotInterestedOpen] = useState(false);
  const [notInterestedReason, setNotInterestedReason] = useState("price");
  const [notInterestedNotes, setNotInterestedNotes] = useState("");

  async function load() {
    try {
      const [d, q, l, m] = await Promise.all([
        fetch("/api/leads/dashboard").then((r) => r.json()),
        fetch("/api/leads/tasks?due=1&type=call").then((r) => r.json()),
        fetch("/api/leads").then((r) => r.json()),
        fetch("/api/leads/meetings").then((r) => r.json()),
      ]);
      if (d.ok) setDash(d); else setError(d.error || "Failed to load dashboard");
      if (q.ok) setQueue(q.tasks || []);
      if (Array.isArray(l)) setLeads(l);
      if (m.ok) setMeetings({ meetings: m.meetings || [], totalUpcoming: m.totalUpcoming || 0, openSlots: m.openSlots || [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (filterTier !== "all" && l.tier !== filterTier) return false;
      if (filterOwner !== "all" && (l.owner || "Unassigned") !== filterOwner) return false;
      return true;
    });
  }, [leads, filterTier, filterOwner]);

  const ownerOptions = useMemo(() => {
    const s = new Set<string>(["Unassigned"]);
    leads.forEach((l) => l.owner && s.add(l.owner));
    return Array.from(s);
  }, [leads]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((l) => l.id)));
  }

  async function bulkAssign(owner: string) {
    setBulkBusy(true);
    for (const id of selectedIds) {
      await fetch("/api/leads", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, owner }),
      });
    }
    setSelectedIds(new Set());
    setBulkBusy(false);
    void load();
  }

  async function bulkRescore() {
    setBulkBusy(true);
    await fetch("/api/leads/score", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setBulkBusy(false);
    void load();
  }

  async function bulkMarkNotInterested(reason: string) {
    if (!reason.trim()) return;
    setBulkBusy(true);
    for (const id of selectedIds) {
      await fetch("/api/leads", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage: "Not Interested", notInterestedReason: reason }),
      });
    }
    setSelectedIds(new Set());
    setNotInterestedOpen(false);
    setNotInterestedNotes("");
    setBulkBusy(false);
    setBulkResult(`Marked ${selectedIds.size} leads as Not Interested`);
    void load();
  }

  async function bulkVerifyEmails() {
    setBulkBusy(true); setBulkResult(null);
    const r = await fetch("/api/leads/verify-emails", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    }).then((x) => x.json());
    setBulkBusy(false);
    if (r.ok) {
      setBulkResult(`Verified ${r.total}: ${r.deliverable} deliverable, ${r.risky} risky, ${r.undeliverable} undeliverable, ${r.missing} no email`);
      setSelectedIds(new Set());
    } else {
      setBulkResult(`Verify failed: ${r.error || "unknown"}`);
    }
    void load();
  }

  async function bulkEnrichMissing() {
    setBulkBusy(true); setBulkResult(null);
    const r = await fetch("/api/leads/enrich-batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    }).then((x) => x.json());
    setBulkBusy(false);
    if (r.ok) {
      setBulkResult(`Enriched ${r.enriched} / ${r.processed} (${r.skipped} skipped)`);
      setSelectedIds(new Set());
    } else {
      setBulkResult(`Enrich failed: ${r.error || "unknown"}`);
    }
    void load();
  }

  return (
    <main style={{ padding: 32, maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, color: "#0f172a", margin: 0 }}>
            Pipeline v2 — Dashboard
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Tiered scoring · Call queue · Conversion analytics
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/email-pipeline" style={btn("ghost")}>← Email pipeline</Link>
          <Link href="/pipeline/scoring" style={btn("ghost")}>Scoring config</Link>
          <button onClick={bulkRescore} disabled={bulkBusy} style={btn("primary")}>
            {bulkBusy ? "Re-scoring…" : "Re-score all leads"}
          </button>
        </div>
      </header>

      {error && <div style={errorBox}>{error}</div>}

      {/* Tier breakdown */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
        {(["A", "B", "C"] as const).map((tier) => {
          const t = dash?.tiers[tier];
          return (
            <div key={tier} style={tile()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#64748b", textTransform: "uppercase" }}>Tier</span>
                <span style={{ ...badge(TIER_COLOR[tier]), fontSize: 14, padding: "4px 10px" }}>{tier}</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1.1, marginTop: 6 }}>
                {t?.total ?? 0}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                {t?.won ?? 0} won · {t?.conversionPct ?? 0}% conversion
              </div>
            </div>
          );
        })}
        <div style={tile()}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#64748b", textTransform: "uppercase" }}>Today</span>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a", lineHeight: 1.1, marginTop: 6 }}>
            {dash?.today.dueToday ?? 0}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            {dash?.today.callReady ?? 0} call-ready · {dash?.today.noNextAction ?? 0} unscheduled
          </div>
        </div>
        <div style={tile()}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#dc2626", textTransform: "uppercase" }}>SLA flags</span>
          <div style={{ fontSize: 32, fontWeight: 700, color: dash?.sla.open ? "#dc2626" : "#0f172a", lineHeight: 1.1, marginTop: 6 }}>
            {dash?.sla.open ?? 0}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Leads past SLA needing attention
          </div>
        </div>
      </section>

      {/* Funnel */}
      <section style={{ ...panel, marginBottom: 20 }}>
        <h2 style={panelHeader}>Funnel</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 16px 16px" }}>
          {STAGE_ORDER.filter((s) => dash?.funnel[s]).map((stage) => (
            <div key={stage} style={{
              background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
              padding: "8px 14px", display: "flex", flexDirection: "column", gap: 2, minWidth: 110,
            }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{stage}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{dash?.funnel[stage]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Call queue + owner board + calendar */}
      <section style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={panel}>
          <h2 style={panelHeader}>Today&apos;s call queue ({queue.length})</h2>
          <div style={{ padding: "0 16px 16px" }}>
            {queue.length === 0 && <div style={emptyState}>No calls due right now. Nice.</div>}
            {queue.slice(0, 12).map((t) => {
              const lead = leads.find((l) => l.id === t.leadId);
              return (
                <div key={t.id} style={queueRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead?.business || t.leadId}
                      {lead?.tier && <span style={{ ...badge(TIER_COLOR[lead.tier]), marginLeft: 8 }}>{lead.tier}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {lead?.apolloMobile || lead?.phone || "(no phone)"} · {t.reason || ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>P{t.priority}</div>
                  <Link href={`/email-pipeline?lead=${t.leadId}`} style={btn("ghost-sm")}>Open</Link>
                </div>
              );
            })}
          </div>
        </div>

        <div style={panel}>
          <h2 style={panelHeader}>Owners</h2>
          <div style={{ padding: "0 16px 16px" }}>
            {Object.entries(dash?.owners || {})
              .sort((a, b) => b[1].total - a[1].total)
              .slice(0, 8)
              .map(([owner, stats]) => (
                <div key={owner} style={queueRow}>
                  <div style={{ flex: 1, fontSize: 14, color: "#0f172a", fontWeight: 600 }}>{owner}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {stats.total} leads · {stats.conversionPct}% won
                  </div>
                </div>
              ))}
            {(!dash?.owners || Object.keys(dash.owners).length === 0) && (
              <div style={emptyState}>No owners assigned yet.</div>
            )}
          </div>
        </div>

        {/* Calendar block — next 5 meetings + open slot suggestions. Reads from
            /api/leads/meetings which pulls from leads.visit_date/visit_time. */}
        <div style={panel}>
          <h2 style={panelHeader}>
            Calendar {meetings && meetings.totalUpcoming > 0 ? `(${meetings.totalUpcoming})` : ""}
          </h2>
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>
              Next 5 meetings
            </div>
            {(!meetings || meetings.meetings.length === 0) && (
              <div style={emptyState}>No upcoming meetings.</div>
            )}
            {meetings?.meetings.map((m) => (
              <div key={m.id} style={queueRow}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.business}
                    {m.tier && <span style={{ ...badge(TIER_COLOR[m.tier]), marginLeft: 6, fontSize: 10 }}>{m.tier}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {m.date} {m.time} · {m.owner || "no owner"}
                  </div>
                </div>
                <Link href={`/email-pipeline?lead=${m.id}`} style={btn("ghost-sm")}>Open</Link>
              </div>
            ))}

            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: 0.4, textTransform: "uppercase", marginTop: 14, marginBottom: 6 }}>
              Open slots
            </div>
            {(!meetings || meetings.openSlots.length === 0) && (
              <div style={emptyState}>No suggestions.</div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {meetings?.openSlots.map((s, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: "3px 8px", background: "#f0fdfa", color: "#0d9488",
                  border: "1px solid #99f6e4", borderRadius: 4, fontWeight: 600,
                }}>
                  {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} {s.time}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Lead table with filters + bulk actions */}
      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Leads ({filtered.length})</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} style={selectInput}>
              <option value="all">All tiers</option>
              <option value="A">Tier A</option>
              <option value="B">Tier B</option>
              <option value="C">Tier C</option>
            </select>
            <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} style={selectInput}>
              <option value="all">All owners</option>
              {ownerOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {bulkResult && (
          <div style={{
            padding: "8px 16px", background: "#f0fdf4", borderBottom: "1px solid #86efac",
            fontSize: 12, color: "#166534", display: "flex", justifyContent: "space-between",
          }}>
            <span>{bulkResult}</span>
            <button onClick={() => setBulkResult(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#166534" }}>✕</button>
          </div>
        )}
        {selectedIds.size > 0 && (
          <div style={{
            padding: "10px 16px", background: "#fef3c7", borderBottom: "1px solid #fcd34d",
            display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => {
                const owner = window.prompt("Assign to (owner name):");
                if (owner) void bulkAssign(owner);
              }}
              disabled={bulkBusy}
              style={btn("ghost-sm")}
            >Assign owner</button>
            <button onClick={bulkVerifyEmails} disabled={bulkBusy} style={btn("ghost-sm")}>
              Verify emails
            </button>
            <button onClick={bulkEnrichMissing} disabled={bulkBusy} style={btn("ghost-sm")}>
              Enrich missing
            </button>
            <button
              onClick={() => setNotInterestedOpen((v) => !v)}
              disabled={bulkBusy}
              style={btn("ghost-sm")}
            >Mark not interested</button>
            <button onClick={() => setSelectedIds(new Set())} style={btn("ghost-sm")}>Clear</button>
            {bulkBusy && <span style={{ fontSize: 12, color: "#92400e" }}>Working…</span>}
          </div>
        )}

        {notInterestedOpen && selectedIds.size > 0 && (
          <div style={{
            padding: "12px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca",
            display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#991b1b" }}>Reason:</span>
            <select
              value={notInterestedReason}
              onChange={(e) => setNotInterestedReason(e.target.value)}
              style={selectInput}
            >
              <option value="price">Price</option>
              <option value="space">Space / no room</option>
              <option value="already_vendor">Already have a vendor</option>
              <option value="corporate_policy">Corporate policy / contract</option>
              <option value="not_dm">Not the decision maker</option>
              <option value="bad_timing">Bad timing — try later</option>
              <option value="undeliverable">Undeliverable email</option>
              <option value="other">Other</option>
            </select>
            <input
              type="text"
              placeholder="Notes (optional)"
              value={notInterestedNotes}
              onChange={(e) => setNotInterestedNotes(e.target.value)}
              style={{ ...selectInput, flex: 1, minWidth: 200 }}
            />
            <button
              onClick={() => bulkMarkNotInterested(`${notInterestedReason}${notInterestedNotes ? ` — ${notInterestedNotes}` : ""}`)}
              disabled={bulkBusy}
              style={{ ...btn("ghost-sm"), background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
            >Confirm</button>
            <button onClick={() => setNotInterestedOpen(false)} style={btn("ghost-sm")}>Cancel</button>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={th()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                    onChange={toggleAll}
                  />
                </th>
                <th style={th()}>Business</th>
                <th style={th()}>Tier</th>
                <th style={th()}>Stage</th>
                <th style={th()}>Owner</th>
                <th style={th()}>Next action</th>
                <th style={th()}>Last touch</th>
                <th style={th()}>Phone</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((lead) => (
                <tr key={lead.id} style={{
                  borderBottom: "1px solid #f1f5f9",
                  background: selectedIds.has(lead.id) ? "#fffbeb" : (lead.isCallReady ? "#fff7ed" : "#fff"),
                }}>
                  <td style={td}>
                    <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggle(lead.id)} />
                  </td>
                  <td style={{ ...td, fontWeight: 600, color: "#0f172a" }}>
                    <Link href={`/email-pipeline?lead=${lead.id}`} style={{ color: "#0f172a", textDecoration: "none" }}>
                      {lead.business}
                    </Link>
                    {lead.vertical && (
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>{lead.vertical}</div>
                    )}
                  </td>
                  <td style={td}>
                    {lead.tier ? <span style={badge(TIER_COLOR[lead.tier])}>{lead.tier}</span> : <span style={{ color: "#94a3b8" }}>—</span>}
                    {lead.tierScore !== undefined && (
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{lead.tierScore}pt</div>
                    )}
                  </td>
                  <td style={td}>{lead.stage}</td>
                  <td style={td}>{lead.owner || <span style={{ color: "#94a3b8" }}>Unassigned</span>}</td>
                  <td style={td}>
                    {lead.nextAction ? (
                      <>
                        <div>{lead.nextAction}</div>
                        {lead.nextActionAt && (
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {new Date(lead.nextActionAt).toLocaleString()}
                          </div>
                        )}
                      </>
                    ) : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={td}>
                    {lead.lastTouchAt ? new Date(lead.lastTouchAt).toLocaleDateString() : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={td}>{lead.apolloMobile || lead.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

// ── styles ─────────────────────────────────────────────────────────
const panel: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden",
};
const panelHeader: React.CSSProperties = {
  margin: 0, padding: "14px 16px", fontSize: 14, fontWeight: 700, color: "#0f172a",
  borderBottom: "1px solid #e2e8f0", letterSpacing: -0.2,
};
const tile = (): React.CSSProperties => ({
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16,
});
const errorBox: React.CSSProperties = {
  background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
  padding: 12, color: "#991b1b", fontSize: 13, marginBottom: 16,
};
const queueRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
  borderBottom: "1px solid #f1f5f9",
};
const emptyState: React.CSSProperties = {
  fontSize: 13, color: "#94a3b8", padding: "16px 0", textAlign: "center",
};
const selectInput: React.CSSProperties = {
  padding: "6px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #cbd5e1",
  background: "#fff",
};
const th = (): React.CSSProperties => ({
  padding: "10px 14px", textAlign: "left", fontSize: 11,
  fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "#64748b",
});
const td: React.CSSProperties = { padding: "10px 14px", verticalAlign: "top" };
function badge(color: string): React.CSSProperties {
  return {
    display: "inline-block", padding: "2px 8px", borderRadius: 6,
    fontSize: 11, fontWeight: 700, color: "#fff", background: color, letterSpacing: 0.3,
  };
}
function btn(variant: "primary" | "ghost" | "ghost-sm"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: variant === "ghost-sm" ? "5px 10px" : "8px 14px",
    fontSize: variant === "ghost-sm" ? 12 : 13,
    fontWeight: 600, borderRadius: 8, cursor: "pointer", textDecoration: "none",
    display: "inline-block", border: "1px solid transparent",
  };
  if (variant === "primary") return { ...base, background: "#16a34a", color: "#fff" };
  return { ...base, background: "#fff", color: "#0f172a", border: "1px solid #cbd5e1" };
}
