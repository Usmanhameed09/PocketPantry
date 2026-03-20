"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import Header from "@/components/Header";
import {
  Plus,
  Upload,
  MapPin,
  Phone,
  Mail,
  Building2,
  User,
  Bot,
  TrendingUp,
  Users,
  PhoneCall,
  MailCheck,
  MailX,
  Clock,
  X,
  Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Stage =
  | "New Lead"
  | "Contacted"
  | "Interested"
  | "Not Interested"
  | "Site Visit Requested"
  | "Proposal Requested"
  | "Callback";

type ContactMethod = "Call" | "Email" | "Call + Email";
type LeadSource = "Manual" | "Excel Import" | "Google Maps";

interface CallLog {
  attempt: number;
  date: string;
  duration: string;
  outcome: string;
  summary: string;
}

interface EmailLog {
  date: string;
  status: "Sent" | "Opened" | "Replied" | "Bounced";
  subject: string;
}

interface Lead {
  id: string;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  distance: string;
  businessType: string;
  source: LeadSource;
  stage: Stage;
  contactMethod: ContactMethod;
  callLogs: CallLog[];
  emailLogs: EmailLog[];
  addedDate: string;
  lastActivity: string;
  callAttempts?: number;
  vapiCallId?: string;
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const stageConfig: Record<Stage, { color: string; bg: string; border: string }> = {
  "New Lead":              { color: "#64748b", bg: "#f9fafb", border: "#e5e7eb" },
  "Contacted":             { color: "#7c3aed", bg: "#ede9fe", border: "#ddd6fe" },
  "Interested":            { color: "#059669", bg: "#d1fae5", border: "#a7f3d0" },
  "Not Interested":        { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  "Callback":              { color: "#d97706", bg: "#fef3c7", border: "#fde68a" },
  "Site Visit Requested":  { color: "#16a34a", bg: "#dcfce7", border: "#bfdbfe" },
  "Proposal Requested":    { color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
};

const kanbanStages: Stage[] = [
  "New Lead", "Contacted", "Callback", "Interested", "Site Visit Requested", "Proposal Requested", "Not Interested",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PipelinePage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<{ leadId: string; message: string; type: "success" | "error" } | null>(null);

  // Fetch leads from API
  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads");
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Trigger a VAPI call
  const triggerCall = async (leadId: string) => {
    setCallingLeadId(leadId);
    setCallStatus(null);
    try {
      const res = await fetch("/api/calls/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (res.ok) {
        setCallStatus({ leadId, message: data.message || "Call initiated!", type: "success" });
        fetchLeads(); // Refresh leads to show updated status
      } else {
        setCallStatus({ leadId, message: data.error || "Failed to trigger call", type: "error" });
      }
    } catch {
      setCallStatus({ leadId, message: "Network error — could not trigger call", type: "error" });
    } finally {
      setCallingLeadId(null);
    }
  };

  const totalCalls = leads.reduce((s, l) => s + l.callLogs.length, 0);
  const totalEmails = leads.reduce((s, l) => s + l.emailLogs.length, 0);
  const interested = leads.filter((l) => ["Interested", "Site Visit Requested", "Proposal Requested"].includes(l.stage)).length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Pipeline" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Stat Cards */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatBox icon={<Users size={20} color="#16a34a" />} iconBg="#dcfce7"
            label="Total Leads" value={`${leads.length}`} sub={`${leads.filter(l => l.stage === "New Lead").length} pending first contact`} />
          <StatBox icon={<PhoneCall size={20} color="#7c3aed" />} iconBg="#ede9fe"
            label="AI Calls Made" value={`${totalCalls}`} sub={`${totalEmails} emails sent`} />
          <StatBox icon={<TrendingUp size={20} color="#059669" />} iconBg="#d1fae5"
            label="Interested" value={`${interested}`} sub={`${leads.filter(l => l.stage === "Proposal Requested").length} want proposals`} />
          <StatBox icon={<Phone size={20} color="#d97706" />} iconBg="#fef3c7"
            label="Callbacks Pending" value={`${leads.filter(l => l.stage === "Callback").length}`}
            sub="AI will retry automatically" />
        </div>

        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", marginBottom: 20,
          flexWrap: "wrap", gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", background: "#fff", borderRadius: 8, border: "1px solid #d5d9e2", overflow: "hidden" }}>
              {(["kanban", "list"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
                  background: view === v ? "#16a34a" : "transparent",
                  color: view === v ? "#fff" : "#6b7280",
                  textTransform: "capitalize" as const,
                }}>{v === "kanban" ? "Board" : "List"}</button>
              ))}
            </div>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>
              {leads.length} leads · {kanbanStages.length} stages
            </span>
          </div>

          <div className="pipeline-actions" style={{ display: "flex", gap: 10 }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}><Upload size={14} /> Import Excel</button>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}><MapPin size={14} /> Google Maps</button>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            ><Plus size={16} /> Add Lead</button>
          </div>
        </div>

        {/* Call Status Toast */}
        {callStatus && (
          <div style={{
            marginBottom: 16, padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: callStatus.type === "success" ? "#dcfce7" : "#fef2f2",
            color: callStatus.type === "success" ? "#166534" : "#991b1b",
            border: `1px solid ${callStatus.type === "success" ? "#a7f3d0" : "#fecaca"}`,
          }}>
            <span>{callStatus.message}</span>
            <button onClick={() => setCallStatus(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <X size={14} color={callStatus.type === "success" ? "#166534" : "#991b1b"} />
            </button>
          </div>
        )}

        {/* Empty State */}
        {leads.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 20px", background: "#fff",
            borderRadius: 14, border: "1px solid #d5d9e2",
          }}>
            <Users size={48} color="#d1d5db" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: "#374151", marginBottom: 8 }}>No leads yet</div>
            <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 20 }}>
              Add your first lead manually to get started, then trigger an AI call.
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px",
                background: "#16a34a", color: "#fff", border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            ><Plus size={18} /> Add First Lead</button>
          </div>
        )}

        {/* ========== KANBAN VIEW ========== */}
        {leads.length > 0 && view === "kanban" && (
          <div style={{ overflowX: "auto" }}>
          <div className="kanban-grid" style={{
            display: "grid",
            gridTemplateColumns: `repeat(${kanbanStages.length}, minmax(200px, 1fr))`,
            gap: 10, overflowX: "auto", paddingBottom: 16,
          }}>
            {kanbanStages.map((stage) => {
              const sc = stageConfig[stage];
              const stageLeads = leads.filter((l) => l.stage === stage);
              return (
                <div key={stage} style={{
                  background: sc.bg, borderRadius: 12, border: `1px solid ${sc.border}`,
                  display: "flex", flexDirection: "column", minHeight: 280,
                }}>
                  <div style={{
                    padding: "12px 14px", borderBottom: `2px solid ${sc.border}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.color }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{stage}</span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: sc.color,
                      background: "#fff", padding: "2px 7px", borderRadius: 10,
                      border: `1px solid ${sc.border}`,
                    }}>{stageLeads.length}</span>
                  </div>

                  <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, flex: 1, overflowY: "auto" }}>
                    {stageLeads.map((lead) => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        expanded={expandedLead === lead.id}
                        onToggle={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
                        onTriggerCall={() => triggerCall(lead.id)}
                        isCalling={callingLeadId === lead.id}
                      />
                    ))}
                    {stageLeads.length === 0 && (
                      <div style={{ padding: "20px 0", textAlign: "center", fontSize: 11, color: "#d1d5db" }}>
                        No leads
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* ========== LIST VIEW ========== */}
        {leads.length > 0 && view === "list" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 800,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.8fr 1fr 90px 100px 130px 110px 90px",
              padding: "14px 22px", borderBottom: "1px solid #e5e7eb", background: "#f1f5f9",
            }}>
              <TH>Business</TH>
              <TH>Contact</TH>
              <TH>Source</TH>
              <TH>AI Calls</TH>
              <TH>Stage</TH>
              <TH>Last Activity</TH>
              <TH>Action</TH>
            </div>
            {leads.map((l) => {
              const sc = stageConfig[l.stage];
              return (
                <div key={l.id}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.8fr 1fr 90px 100px 130px 110px 90px",
                      padding: "14px 22px", borderBottom: "1px solid #f3f4f6", alignItems: "center",
                      cursor: "pointer", transition: "background 0.1s",
                      background: expandedLead === l.id ? "#f9fafb" : "transparent",
                    }}
                    onClick={() => setExpandedLead(expandedLead === l.id ? null : l.id)}
                    onMouseEnter={(e) => { if (expandedLead !== l.id) e.currentTarget.style.background = "#fafafa"; }}
                    onMouseLeave={(e) => { if (expandedLead !== l.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{l.business}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <MapPin size={10} /> {l.address} · {l.distance}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: "#374151" }}>{l.contact}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{l.phone}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "#64748b", background: "#e2e8f0", padding: "3px 8px", borderRadius: 10 }}>
                        {l.source === "Google Maps" ? "Maps" : l.source === "Excel Import" ? "Excel" : "Manual"}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                        {l.callLogs.length}/3
                      </span>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {l.emailLogs.length > 0 ? `${l.emailLogs.length} email${l.emailLogs.length > 1 ? "s" : ""}` : "No email"}
                      </div>
                    </div>
                    <div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: sc.color, background: sc.bg,
                        padding: "4px 10px", borderRadius: 10, border: `1px solid ${sc.border}`,
                      }}>{l.stage}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{l.lastActivity}</div>
                    <div>
                      <button
                        onClick={(e) => { e.stopPropagation(); triggerCall(l.id); }}
                        disabled={callingLeadId === l.id || l.callLogs.length >= 3}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
                          background: l.callLogs.length >= 3 ? "#e5e7eb" : "#7c3aed",
                          color: l.callLogs.length >= 3 ? "#94a3b8" : "#fff",
                          border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600,
                          cursor: l.callLogs.length >= 3 ? "not-allowed" : "pointer",
                          opacity: callingLeadId === l.id ? 0.7 : 1,
                        }}
                      >
                        {callingLeadId === l.id ? (
                          <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Calling...</>
                        ) : l.callLogs.length >= 3 ? (
                          "Max Calls"
                        ) : (
                          <><PhoneCall size={12} /> Call</>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedLead === l.id && (l.callLogs.length > 0 || l.emailLogs.length > 0) && (
                    <div style={{
                      padding: "16px 22px 20px", background: "#f1f5f9",
                      borderBottom: "1px solid #e5e7eb",
                    }}>
                      {l.callLogs.length > 0 && (
                        <div style={{ marginBottom: l.emailLogs.length > 0 ? 14 : 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                            <PhoneCall size={13} /> Call History
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {l.callLogs.map((call, i) => (
                              <div key={i} style={{
                                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, padding: "12px 14px",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                                    Call #{call.attempt} · {call.date}
                                  </span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{call.duration}</span>
                                    <span style={{
                                      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                                      color: call.outcome === "interested" || call.outcome === "Interested" || call.outcome === "Site Visit Requested" || call.outcome === "Proposal Requested" ? "#059669" :
                                             call.outcome === "not_interested" || call.outcome === "Not Interested" ? "#dc2626" :
                                             call.outcome === "callback" || call.outcome === "Callback Requested" ? "#d97706" : "#6b7280",
                                      background: call.outcome === "interested" || call.outcome === "Interested" || call.outcome === "Site Visit Requested" || call.outcome === "Proposal Requested" ? "#d1fae5" :
                                                  call.outcome === "not_interested" || call.outcome === "Not Interested" ? "#fef2f2" :
                                                  call.outcome === "callback" || call.outcome === "Callback Requested" ? "#fef3c7" : "#e2e8f0",
                                    }}>{call.outcome}</span>
                                  </div>
                                </div>
                                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, background: "#f1f5f9", padding: "8px 10px", borderRadius: 6 }}>
                                  <Bot size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                                  {call.summary}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {l.emailLogs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                            <Mail size={13} /> Email History
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {l.emailLogs.map((em, i) => (
                              <div key={i} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, padding: "10px 14px",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {em.status === "Replied" ? <MailCheck size={14} color="#059669" /> :
                                   em.status === "Bounced" ? <MailX size={14} color="#dc2626" /> :
                                   <Mail size={14} color="#6b7280" />}
                                  <span style={{ fontSize: 12, color: "#374151" }}>{em.subject}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                                    color: em.status === "Replied" ? "#059669" : em.status === "Opened" ? "#16a34a" : em.status === "Bounced" ? "#dc2626" : "#6b7280",
                                    background: em.status === "Replied" ? "#d1fae5" : em.status === "Opened" ? "#dcfce7" : em.status === "Bounced" ? "#fef2f2" : "#e2e8f0",
                                  }}>{em.status}</span>
                                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{em.date}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* Info */}
        <div style={{
          marginTop: 16, padding: "14px 18px", background: "#ede9fe",
          border: "1px solid #ddd6fe", borderRadius: 10, fontSize: 12, color: "#5b21b6",
          lineHeight: 1.6,
        }}>
          <strong>How it works:</strong> Leads are imported via Excel or Google Maps (25mi radius), or added manually.
          AI agent (Vapi) initiates calls and emails — max 3 call attempts per lead.
          All call details, duration, and AI-generated summaries are logged automatically.
          Leads are classified based on the client&apos;s response during the call:
          Interested, Not Interested, Callback, Site Visit Requested, or Proposal Requested.
          AI does not close deals — it only initiates and classifies.
        </div>
      </div>

      {/* ========== ADD LEAD MODAL ========== */}
      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); fetchLeads(); }}
        />
      )}

      {/* Spinner animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Lead Modal                                                     */
/* ------------------------------------------------------------------ */

function AddLeadModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    business: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    distance: "",
    businessType: "",
    contactMethod: "Call" as ContactMethod,
  });

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.business || !form.contact || !form.phone) {
      setError("Business name, contact name, and phone are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "Manual" }),
      });
      if (res.ok) {
        onAdded();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add lead");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #d5d9e2",
    borderRadius: 8, outline: "none", background: "#fff", color: "#0f172a",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: "#dcfce7",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Plus size={18} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Add New Lead</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Enter lead details to add to pipeline</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="#94a3b8" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
          {error && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", color: "#991b1b", borderRadius: 8, fontSize: 12, border: "1px solid #fecaca" }}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Business Name *</label>
              <input style={inputStyle} placeholder="e.g., ABC Logistics" value={form.business} onChange={(e) => update("business", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Business Type</label>
              <input style={inputStyle} placeholder="e.g., Warehouse, Office" value={form.businessType} onChange={(e) => update("businessType", e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Contact Name *</label>
              <input style={inputStyle} placeholder="e.g., John Smith" value={form.contact} onChange={(e) => update("contact", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Phone Number *</label>
              <input style={inputStyle} placeholder="e.g., (713) 555-0142" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" placeholder="e.g., john@abclogistics.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Address</label>
              <input style={inputStyle} placeholder="e.g., 2100 N Loop W, Houston" value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Distance</label>
              <input style={inputStyle} placeholder="e.g., 8 mi" value={form.distance} onChange={(e) => update("distance", e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Contact Method</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["Call", "Email", "Call + Email"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => update("contactMethod", method)}
                  style={{
                    padding: "8px 16px", fontSize: 12, fontWeight: 500, borderRadius: 8,
                    border: form.contactMethod === method ? "2px solid #16a34a" : "1px solid #d5d9e2",
                    background: form.contactMethod === method ? "#dcfce7" : "#fff",
                    color: form.contactMethod === method ? "#166534" : "#374151",
                    cursor: "pointer",
                  }}
                >{method}</button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px", fontSize: 13, fontWeight: 500,
                background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
                cursor: "pointer",
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 24px", fontSize: 13, fontWeight: 600,
                background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving...</> : <><Plus size={14} /> Add Lead</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kanban Card                                                        */
/* ------------------------------------------------------------------ */

function KanbanCard({ lead, expanded, onToggle, onTriggerCall, isCalling }: {
  lead: Lead; expanded: boolean; onToggle: () => void;
  onTriggerCall: () => void; isCalling: boolean;
}) {
  const lastCall = lead.callLogs[lead.callLogs.length - 1];
  const lastEmail = lead.emailLogs[lead.emailLogs.length - 1];

  return (
    <div
      onClick={onToggle}
      style={{
        background: "#fff", border: "1px solid #d5d9e2", borderRadius: 10,
        padding: "12px", cursor: "pointer",
        boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)"; }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 2 }}>
        {lead.business}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>
        {lead.businessType} · {lead.distance}
      </div>

      {/* Contact */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4 }}>
        <User size={10} /> {lead.contact}
      </div>

      {/* Phone */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4 }}>
        <Phone size={10} /> {lead.phone}
      </div>

      {/* Call info */}
      {lead.callLogs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4 }}>
          <PhoneCall size={10} /> {lead.callLogs.length}/3 calls · {lastCall?.duration}
        </div>
      )}

      {/* Email info */}
      {lead.emailLogs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4 }}>
          <Mail size={10} /> Email: {lastEmail?.status}
        </div>
      )}

      {/* Trigger Call Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onTriggerCall(); }}
        disabled={isCalling || lead.callLogs.length >= 3}
        style={{
          width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 6, padding: "7px 12px",
          background: lead.callLogs.length >= 3 ? "#f1f5f9" : "#7c3aed",
          color: lead.callLogs.length >= 3 ? "#94a3b8" : "#fff",
          border: lead.callLogs.length >= 3 ? "1px solid #e2e8f0" : "none",
          borderRadius: 8, fontSize: 11, fontWeight: 600,
          cursor: lead.callLogs.length >= 3 ? "not-allowed" : "pointer",
          opacity: isCalling ? 0.7 : 1,
        }}
      >
        {isCalling ? (
          <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Calling...</>
        ) : lead.callLogs.length >= 3 ? (
          "Max Attempts Reached"
        ) : (
          <><PhoneCall size={12} /> Trigger AI Call</>
        )}
      </button>

      {/* Last call summary (when expanded) */}
      {expanded && lastCall && (
        <div style={{
          marginTop: 8, fontSize: 11, color: "#64748b", lineHeight: 1.4,
          background: "#f1f5f9", padding: "8px 10px", borderRadius: 6,
        }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <Bot size={10} /> AI Summary — {lastCall.date}
          </div>
          {lastCall.summary}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          {lead.source === "Google Maps" ? "Maps" : lead.source === "Excel Import" ? "Excel" : "Manual"} · {lead.addedDate}
        </span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          {lead.lastActivity}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function StatBox({ icon, iconBg, label, value, sub }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
      padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "#94a3b8",
      textTransform: "uppercase" as const, letterSpacing: 0.5,
    }}>{children}</div>
  );
}
