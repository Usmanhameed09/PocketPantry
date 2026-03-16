"use client";

import { useState } from "react";
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
  DollarSign,
  TrendingUp,
  Users,
  PhoneCall,
  MailCheck,
  MailX,
  Clock,
  ExternalLink,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Pipeline stages — all determined by AI call/email outcomes:
 * 1. New Lead         — Imported, not yet contacted by AI
 * 2. Contacted        — AI made call or sent email
 * 3. Interested       — Client expressed interest during AI call
 * 4. Not Interested   — Client declined during AI call
 * 5. Site Visit Req.  — Client asked for site visit during AI call
 * 6. Proposal Req.    — Client asked for proposal/pricing during AI call
 * 7. Callback         — Client asked AI to call back later
 */
type Stage =
  | "New Lead"
  | "Contacted"
  | "Interested"
  | "Not Interested"
  | "Site Visit Requested"
  | "Proposal Requested"
  | "Callback";

type ContactMethod = "Call" | "Email" | "Call + Email";
type LeadSource = "Excel Import" | "Google Maps";

interface CallLog {
  attempt: number;
  date: string;
  duration: string;
  outcome: string;
  summary: string;  // AI-generated transcript summary
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
}

/* ------------------------------------------------------------------ */
/*  Test Data — only system-trackable information                      */
/* ------------------------------------------------------------------ */

const leads: Lead[] = [
  {
    id: "L-001", business: "Bruder's Auto Group", contact: "Mike Bruder",
    phone: "(713) 555-0142", email: "mike@brudersauto.com",
    address: "4520 Westheimer Rd", distance: "8 mi", businessType: "Auto Dealership",
    source: "Google Maps", stage: "New Lead", contactMethod: "Call",
    callLogs: [], emailLogs: [],
    addedDate: "Mar 13", lastActivity: "Imported Mar 13",
  },
  {
    id: "L-002", business: "BrightView Landscape", contact: "Sarah Chen",
    phone: "(713) 555-0198", email: "sarah@brightview.com",
    address: "8900 Katy Fwy", distance: "12 mi", businessType: "Landscaping HQ",
    source: "Excel Import", stage: "New Lead", contactMethod: "Call + Email",
    callLogs: [], emailLogs: [],
    addedDate: "Mar 13", lastActivity: "Imported Mar 13",
  },
  {
    id: "L-003", business: "ABC Logistics", contact: "Tom Rivera",
    phone: "(713) 555-0234", email: "tom@abclogistics.com",
    address: "2100 N Loop W", distance: "6 mi", businessType: "Warehouse",
    source: "Google Maps", stage: "Callback", contactMethod: "Call",
    callLogs: [
      { attempt: 1, date: "Mar 14, 9:15 AM", duration: "1m 42s", outcome: "Callback Requested",
        summary: "Receptionist answered. Tom is in a meeting. She said he handles facility decisions. Asked to call back Thursday after 2pm." },
    ],
    emailLogs: [],
    addedDate: "Mar 11", lastActivity: "AI Call — Mar 14",
  },
  {
    id: "L-004", business: "QFC Logistics", contact: "Dan Marsh",
    phone: "(713) 555-0301", email: "dan@qfclogistics.com",
    address: "5500 Airline Dr", distance: "9 mi", businessType: "Distribution Center",
    source: "Excel Import", stage: "Interested", contactMethod: "Call + Email",
    callLogs: [
      { attempt: 1, date: "Mar 12, 10:30 AM", duration: "0m 22s", outcome: "Voicemail",
        summary: "No answer. Left voicemail introducing PocketPantry vending services." },
      { attempt: 2, date: "Mar 13, 2:15 PM", duration: "3m 48s", outcome: "Interested",
        summary: "Dan answered. 80+ employees, no current vending. Interested in snack and drink machines. Said he'd like to know more about pricing and product selection." },
    ],
    emailLogs: [
      { date: "Mar 12", status: "Sent", subject: "Vending Machine Services for QFC Logistics" },
      { date: "Mar 13", status: "Opened", subject: "Vending Machine Services for QFC Logistics" },
    ],
    addedDate: "Mar 10", lastActivity: "AI Call — Mar 13",
  },
  {
    id: "L-005", business: "ABC Manufacturing", contact: "Lisa Wong",
    phone: "(713) 555-0187", email: "lisa@abcmfg.com",
    address: "3200 Navigation Blvd", distance: "4 mi", businessType: "Manufacturing",
    source: "Google Maps", stage: "Not Interested", contactMethod: "Call",
    callLogs: [
      { attempt: 1, date: "Mar 12, 11:00 AM", duration: "1m 15s", outcome: "Not Interested",
        summary: "Lisa answered. Already has vending contract with Aramark, 2 years remaining. Not interested in switching." },
    ],
    emailLogs: [],
    addedDate: "Mar 9", lastActivity: "AI Call — Mar 12",
  },
  {
    id: "L-006", business: "Smith Medical Center", contact: "Admin Desk",
    phone: "(713) 555-0412", email: "admin@smithmedical.com",
    address: "6700 Main St", distance: "3 mi", businessType: "Medical Office",
    source: "Excel Import", stage: "Site Visit Requested", contactMethod: "Call + Email",
    callLogs: [
      { attempt: 1, date: "Mar 10, 9:45 AM", duration: "0m 18s", outcome: "No Answer",
        summary: "No answer after 6 rings." },
      { attempt: 2, date: "Mar 11, 3:30 PM", duration: "4m 12s", outcome: "Site Visit Requested",
        summary: "Office manager answered. 50+ daily visitors in waiting room. Interested in healthy snack options. Asked for someone to come visit and see the space — suggested Tuesday or Thursday afternoon." },
    ],
    emailLogs: [
      { date: "Mar 10", status: "Sent", subject: "Healthy Vending Options for Smith Medical" },
      { date: "Mar 11", status: "Replied", subject: "Re: Healthy Vending Options for Smith Medical" },
    ],
    addedDate: "Mar 7", lastActivity: "AI Call — Mar 11",
  },
  {
    id: "L-007", business: "Brown & White Law", contact: "Jennifer Brown",
    phone: "(713) 555-0523", email: "jbrown@bwlaw.com",
    address: "1200 Smith St", distance: "2 mi", businessType: "Law Firm",
    source: "Google Maps", stage: "Proposal Requested", contactMethod: "Call",
    callLogs: [
      { attempt: 1, date: "Mar 8, 10:00 AM", duration: "5m 30s", outcome: "Proposal Requested",
        summary: "Jennifer answered directly. 3 floors, 120 employees. Very interested. Already visited a building with PocketPantry machines and liked the selection. Wants a proposal with pricing, product list, and machine specs sent to her email." },
    ],
    emailLogs: [],
    addedDate: "Mar 5", lastActivity: "AI Call — Mar 8",
  },
  {
    id: "L-008", business: "SureTech Plastics", contact: "Ray Gutierrez",
    phone: "(713) 555-0289", email: "ray@suretech.com",
    address: "7800 Lawndale St", distance: "11 mi", businessType: "Manufacturing",
    source: "Excel Import", stage: "Interested", contactMethod: "Call + Email",
    callLogs: [
      { attempt: 1, date: "Mar 6, 1:45 PM", duration: "4m 05s", outcome: "Interested",
        summary: "Ray answered. 200+ floor workers, 2 shifts. Current vending machine is broken and vendor hasn't responded in weeks. Very interested in replacement. Wants to know turnaround time for installation." },
    ],
    emailLogs: [
      { date: "Mar 6", status: "Sent", subject: "Vending Solutions for SureTech Plastics" },
      { date: "Mar 7", status: "Opened", subject: "Vending Solutions for SureTech Plastics" },
    ],
    addedDate: "Mar 3", lastActivity: "AI Call — Mar 6",
  },
  {
    id: "L-009", business: "Woodridge Office Park", contact: "Amanda Fields",
    phone: "(713) 555-0634", email: "afields@woodridge.com",
    address: "9400 Woodridge Pkwy", distance: "15 mi", businessType: "Office Complex",
    source: "Google Maps", stage: "Contacted", contactMethod: "Email",
    callLogs: [],
    emailLogs: [
      { date: "Mar 14", status: "Sent", subject: "Vending Services for Woodridge Office Park" },
    ],
    addedDate: "Mar 12", lastActivity: "Email sent — Mar 14",
  },
  {
    id: "L-010", business: "Metro Fire Equipment", contact: "Carlos Reyes",
    phone: "(713) 555-0771", email: "carlos@metrofire.com",
    address: "3100 Polk St", distance: "5 mi", businessType: "Equipment Sales",
    source: "Excel Import", stage: "Contacted", contactMethod: "Call",
    callLogs: [
      { attempt: 1, date: "Mar 14, 11:30 AM", duration: "0m 30s", outcome: "Voicemail",
        summary: "No answer. Left voicemail with callback number and brief intro about vending services." },
    ],
    emailLogs: [],
    addedDate: "Mar 12", lastActivity: "AI Call — Mar 14",
  },
];

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const stageConfig: Record<Stage, { color: string; bg: string; border: string }> = {
  "New Lead":              { color: "#64748b", bg: "#f9fafb", border: "#e5e7eb" },
  "Contacted":             { color: "#7c3aed", bg: "#ede9fe", border: "#ddd6fe" },
  "Interested":            { color: "#059669", bg: "#d1fae5", border: "#a7f3d0" },
  "Not Interested":        { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  "Callback":              { color: "#d97706", bg: "#fef3c7", border: "#fde68a" },
  "Site Visit Requested":  { color: "#2563eb", bg: "#dbeafe", border: "#bfdbfe" },
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

  const totalCalls = leads.reduce((s, l) => s + l.callLogs.length, 0);
  const totalEmails = leads.reduce((s, l) => s + l.emailLogs.length, 0);
  const interested = leads.filter((l) => ["Interested", "Site Visit Requested", "Proposal Requested"].includes(l.stage)).length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Pipeline" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Stat Cards */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatBox icon={<Users size={20} color="#2563eb" />} iconBg="#dbeafe"
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
                  background: view === v ? "#2563eb" : "transparent",
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
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
              background: "#2563eb", color: "#fff", border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}><Plus size={16} /> Add Lead</button>
          </div>
        </div>

        {/* ========== KANBAN VIEW ========== */}
        {view === "kanban" && (
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
        {view === "list" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 700,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.8fr 1fr 90px 100px 130px 110px",
              padding: "14px 22px", borderBottom: "1px solid #e5e7eb", background: "#f1f5f9",
            }}>
              <TH>Business</TH>
              <TH>Contact</TH>
              <TH>Source</TH>
              <TH>AI Calls</TH>
              <TH>Stage</TH>
              <TH>Last Activity</TH>
            </div>
            {leads.map((l) => {
              const sc = stageConfig[l.stage];
              const lastCall = l.callLogs[l.callLogs.length - 1];
              return (
                <div key={l.id}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.8fr 1fr 90px 100px 130px 110px",
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
                        {l.source === "Google Maps" ? "📍 Maps" : "📄 Excel"}
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
                                      color: call.outcome === "Interested" || call.outcome === "Site Visit Requested" || call.outcome === "Proposal Requested" ? "#059669" :
                                             call.outcome === "Not Interested" ? "#dc2626" :
                                             call.outcome === "Callback Requested" ? "#d97706" : "#6b7280",
                                      background: call.outcome === "Interested" || call.outcome === "Site Visit Requested" || call.outcome === "Proposal Requested" ? "#d1fae5" :
                                                  call.outcome === "Not Interested" ? "#fef2f2" :
                                                  call.outcome === "Callback Requested" ? "#fef3c7" : "#e2e8f0",
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
                                    color: em.status === "Replied" ? "#059669" : em.status === "Opened" ? "#2563eb" : em.status === "Bounced" ? "#dc2626" : "#6b7280",
                                    background: em.status === "Replied" ? "#d1fae5" : em.status === "Opened" ? "#dbeafe" : em.status === "Bounced" ? "#fef2f2" : "#e2e8f0",
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
          <strong>How it works:</strong> Leads are imported via Excel or Google Maps (25mi radius).
          AI agent (Vapi) initiates calls and emails — max 3 call attempts per lead.
          All call details, duration, and AI-generated summaries are logged automatically.
          Leads are classified based on the client&apos;s response during the call:
          Interested, Not Interested, Callback, Site Visit Requested, or Proposal Requested.
          AI does not close deals — it only initiates and classifies.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kanban Card                                                        */
/* ------------------------------------------------------------------ */

function KanbanCard({ lead, expanded, onToggle }: { lead: Lead; expanded: boolean; onToggle: () => void }) {
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
          {lead.source === "Google Maps" ? "📍" : "📄"} {lead.addedDate}
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
