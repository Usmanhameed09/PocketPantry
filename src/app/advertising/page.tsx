"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Plus,
  Search,
  Megaphone,
  DollarSign,
  Eye,
  QrCode,
  Monitor,
  Calendar,
  TrendingUp,
  FileText,
  ExternalLink,
  BarChart3,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  Download,
  ScanLine,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CampaignStatus = "Active" | "Scheduled" | "Completed" | "Paused";
type Tab = "Campaigns" | "Machines" | "Reports";

interface Campaign {
  id: string;
  client: string;
  contactName: string;
  contactEmail: string;
  /** Which machine(s) the ad runs on */
  machines: string[];
  /** Ad content / creative name */
  adName: string;
  startDate: string;
  endDate: string;
  /** Cost charged to client per day */
  dailyRate: number;
  /** Total days running (calculated or completed) */
  totalDays: number;
  /** Total revenue = dailyRate × totalDays */
  totalRevenue: number;
  status: CampaignStatus;
  /** Estimated impressions based on formula: avg daily transactions × screen views per transaction × days */
  estimatedImpressions: number;
  /** Actual barcode scans tracked via bit.ly */
  barcodeScans: number;
  /** bit.ly link for tracking */
  trackingUrl: string;
  /** Conversion rate = scans / impressions × 100 */
  conversionRate: number;
}

interface MachineAdSlot {
  machine: string;
  location: string;
  /** Whether there's currently an active ad */
  hasActiveAd: boolean;
  /** Current campaign name or null */
  currentCampaign: string | null;
  /** Avg daily transactions (from Nayax) — used for impression calculation */
  avgDailyTransactions: number;
  /** Revenue generated from ads on this machine (all time) */
  adRevenue: number;
  /** Available ad slots (screen rotation slots) */
  totalSlots: number;
  usedSlots: number;
}

/* ------------------------------------------------------------------ */
/*  Test Data                                                          */
/*                                                                     */
/*  Impression formula:                                                */
/*    impressions = avgDailyTransactions × screenViewsPerTx × days     */
/*    screenViewsPerTx = 3 (customer sees screen ~3 times per visit:   */
/*    browsing, selecting, paying)                                     */
/*                                                                     */
/*  Conversions tracked via bit.ly barcode scans on the ad             */
/* ------------------------------------------------------------------ */

const SCREEN_VIEWS_PER_TX = 3;

const campaigns: Campaign[] = [
  {
    id: "AD-001",
    client: "Joe's Pizza",
    contactName: "Joe Martinez",
    contactEmail: "joe@joespizza.com",
    machines: ["Baker Nissan Sales", "B4 Lumber"],
    adName: "Lunch Special - $5.99 Combo",
    startDate: "Feb 15, 2026",
    endDate: "Apr 15, 2026",
    dailyRate: 8.00,
    totalDays: 60,
    totalRevenue: 480.00,
    status: "Active",
    // Baker Nissan ~35 tx/day + B4 Lumber ~25 tx/day = 60 tx/day × 3 views × 30 days so far
    estimatedImpressions: 60 * SCREEN_VIEWS_PER_TX * 30,
    barcodeScans: 142,
    trackingUrl: "bit.ly/joespizza-vend",
    conversionRate: 2.6,
  },
  {
    id: "AD-002",
    client: "FastFit Gym",
    contactName: "Derek Chen",
    contactEmail: "derek@fastfitgym.com",
    machines: ["Reynolds Nationwide"],
    adName: "New Member - First Month Free",
    startDate: "Mar 1, 2026",
    endDate: "May 31, 2026",
    dailyRate: 5.00,
    totalDays: 92,
    totalRevenue: 460.00,
    status: "Active",
    estimatedImpressions: 18 * SCREEN_VIEWS_PER_TX * 15,
    barcodeScans: 38,
    trackingUrl: "bit.ly/fastfit-vend",
    conversionRate: 4.7,
  },
  {
    id: "AD-003",
    client: "AutoZone",
    contactName: "Sarah Williams",
    contactEmail: "sarah.w@autozone.com",
    machines: ["Baker Nissan Sales", "Baker Nissan Service"],
    adName: "Oil Change Special - 20% Off",
    startDate: "Apr 1, 2026",
    endDate: "Apr 30, 2026",
    dailyRate: 12.00,
    totalDays: 30,
    totalRevenue: 360.00,
    status: "Scheduled",
    estimatedImpressions: 0,
    barcodeScans: 0,
    trackingUrl: "bit.ly/autozone-vend",
    conversionRate: 0,
  },
  {
    id: "AD-004",
    client: "Taco Cabana",
    contactName: "Maria Gonzalez",
    contactEmail: "maria@tacocabana.com",
    machines: ["Hartman 1400-1", "Hartman 16300"],
    adName: "Breakfast Taco Deal - $2.99",
    startDate: "Jan 5, 2026",
    endDate: "Feb 28, 2026",
    dailyRate: 6.00,
    totalDays: 55,
    totalRevenue: 330.00,
    status: "Completed",
    estimatedImpressions: 28 * SCREEN_VIEWS_PER_TX * 55,
    barcodeScans: 215,
    trackingUrl: "bit.ly/tacocab-vend",
    conversionRate: 4.6,
  },
  {
    id: "AD-005",
    client: "Kwik Kar",
    contactName: "Tommy Nguyen",
    contactEmail: "tommy@kwikkar.com",
    machines: ["American Fire"],
    adName: "Full Detail - $89.99",
    startDate: "Feb 1, 2026",
    endDate: "Mar 15, 2026",
    dailyRate: 4.00,
    totalDays: 43,
    totalRevenue: 172.00,
    status: "Completed",
    estimatedImpressions: 12 * SCREEN_VIEWS_PER_TX * 43,
    barcodeScans: 67,
    trackingUrl: "bit.ly/kwikkar-vend",
    conversionRate: 4.3,
  },
  {
    id: "AD-006",
    client: "Smoothie King",
    contactName: "Lisa Park",
    contactEmail: "lisa@smoothieking.com",
    machines: ["B4 Lumber"],
    adName: "Post-Work Protein Blend",
    startDate: "Mar 10, 2026",
    endDate: "Jun 10, 2026",
    dailyRate: 5.50,
    totalDays: 93,
    totalRevenue: 511.50,
    status: "Paused",
    estimatedImpressions: 25 * SCREEN_VIEWS_PER_TX * 6,
    barcodeScans: 12,
    trackingUrl: "bit.ly/smking-vend",
    conversionRate: 2.7,
  },
];

const machineAdSlots: MachineAdSlot[] = [
  { machine: "Baker Nissan Sales", location: "12090 Katy Fwy", hasActiveAd: true, currentCampaign: "Joe's Pizza", avgDailyTransactions: 35, adRevenue: 640, totalSlots: 4, usedSlots: 2 },
  { machine: "B4 Lumber", location: "6815 Airline Dr", hasActiveAd: true, currentCampaign: "Joe's Pizza / Smoothie King", avgDailyTransactions: 25, adRevenue: 480, totalSlots: 4, usedSlots: 2 },
  { machine: "Reynolds Nationwide", location: "3411 Richmond Ave", hasActiveAd: true, currentCampaign: "FastFit Gym", avgDailyTransactions: 18, adRevenue: 225, totalSlots: 4, usedSlots: 1 },
  { machine: "Hartman 1400-1", location: "1400 Hartman Ln", hasActiveAd: false, currentCampaign: null, avgDailyTransactions: 22, adRevenue: 165, totalSlots: 4, usedSlots: 0 },
  { machine: "Hartman 16300", location: "16300 Hartman Rd", hasActiveAd: false, currentCampaign: null, avgDailyTransactions: 14, adRevenue: 165, totalSlots: 4, usedSlots: 0 },
  { machine: "American Fire", location: "9200 Westpark Dr", hasActiveAd: false, currentCampaign: null, avgDailyTransactions: 12, adRevenue: 172, totalSlots: 4, usedSlots: 0 },
  { machine: "Hartman 1255", location: "1255 Hartman Rd", hasActiveAd: false, currentCampaign: null, avgDailyTransactions: 10, adRevenue: 0, totalSlots: 4, usedSlots: 0 },
  { machine: "Baker Nissan Service", location: "12090 Katy Fwy", hasActiveAd: false, currentCampaign: null, avgDailyTransactions: 0, adRevenue: 0, totalSlots: 4, usedSlots: 0 },
];

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const statusConfig: Record<CampaignStatus, { color: string; bg: string; border: string }> = {
  Active:    { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  Scheduled: { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  Completed: { color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
  Paused:    { color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdvertisingPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [tab, setTab] = useState<Tab>("Campaigns");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | CampaignStatus>("All");
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  const filteredCampaigns = campaigns.filter((c) => {
    const matchSearch = search === "" ||
      c.client.toLowerCase().includes(search.toLowerCase()) ||
      c.adName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats
  const activeCampaigns = campaigns.filter((c) => c.status === "Active").length;
  const totalAdRevenue = campaigns.reduce((s, c) => s + c.totalRevenue, 0);
  const totalScans = campaigns.reduce((s, c) => s + c.barcodeScans, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.estimatedImpressions, 0);
  const freeSlots = machineAdSlots.reduce((s, m) => s + (m.totalSlots - m.usedSlots), 0);
  const totalSlots = machineAdSlots.reduce((s, m) => s + m.totalSlots, 0);

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Advertising" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Stat Cards */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatBox
            icon={<Megaphone size={20} color="#2563eb" />}
            iconBg="#dbeafe"
            label="Active Campaigns"
            value={`${activeCampaigns}`}
            sub={`${campaigns.length} total campaigns`}
          />
          <StatBox
            icon={<DollarSign size={20} color="#059669" />}
            iconBg="#d1fae5"
            label="Total Ad Revenue"
            value={`$${totalAdRevenue.toLocaleString()}`}
            sub="Across all campaigns"
            subColor="#059669"
          />
          <StatBox
            icon={<ScanLine size={20} color="#7c3aed" />}
            iconBg="#e0e7ff"
            label="Barcode Scans"
            value={`${totalScans}`}
            sub={`${totalImpressions.toLocaleString()} est. impressions`}
          />
          <StatBox
            icon={<Monitor size={20} color="#d97706" />}
            iconBg="#fef3c7"
            label="Available Ad Slots"
            value={`${freeSlots} / ${totalSlots}`}
            sub={`${machineAdSlots.filter(m => !m.hasActiveAd).length} machines fully available`}
          />
        </div>

        {/* Tabs + Toolbar */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", marginBottom: 20,
          flexWrap: "wrap", gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row",
        }}>
          <div className="tab-bar" style={{ display: "flex", gap: 0, borderBottom: "2px solid #d5d9e2" }}>
            {(["Campaigns", "Machines", "Reports"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "10px 22px", fontSize: 14, fontWeight: 600, border: "none",
                cursor: "pointer", background: "transparent",
                color: tab === t ? "#2563eb" : "#94a3b8",
                borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent",
                marginBottom: -2, transition: "all 0.15s",
              }}>{t}</button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
              background: "#2563eb", color: "#fff", border: "none", borderRadius: 9,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 2px 6px rgba(37,99,235,0.25)",
            }}>
              <Plus size={16} /> New Campaign
            </button>
          </div>
        </div>

        {/* ========== CAMPAIGNS TAB ========== */}
        {tab === "Campaigns" && (
          <>
            {/* Filters */}
            <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", gap: 12, marginBottom: 16, flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ display: "flex", gap: 0, background: "#fff", borderRadius: 9, border: "1px solid #d5d9e2", overflow: "hidden", flexWrap: "wrap" }}>
                {(["All", "Active", "Scheduled", "Completed", "Paused"] as ("All" | CampaignStatus)[]).map((f) => (
                  <button key={f} onClick={() => setStatusFilter(f)} style={{
                    padding: "8px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                    background: statusFilter === f ? "#1e293b" : "transparent",
                    color: statusFilter === f ? "#fff" : "#64748b",
                    transition: "all 0.15s",
                  }}>{f}</button>
                ))}
              </div>
              <div style={{ position: "relative", flex: isMobile ? 1 : undefined, minWidth: 0 }}>
                <Search size={15} color="#64748b"
                  style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input type="text" placeholder="Search campaigns..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  style={{
                    paddingLeft: 34, paddingRight: 14, height: 38, fontSize: 13,
                    background: "#fff", border: "1px solid #d5d9e2", borderRadius: 9,
                    width: isMobile ? "100%" : 240, minWidth: 0, outline: "none", color: "#1e293b", fontWeight: 500,
                  }} />
              </div>
            </div>

            {/* Campaign Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredCampaigns.map((c) => {
                const sc = statusConfig[c.status];
                const isExpanded = expandedCampaign === c.id;

                return (
                  <div key={c.id} style={{
                    background: "#fff", borderRadius: 14, border: `1px solid ${sc.border}`,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden",
                    borderLeft: `4px solid ${sc.color}`,
                  }}>
                    {/* Main Row */}
                    <div
                      onClick={() => setExpandedCampaign(isExpanded ? null : c.id)}
                      className="campaign-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.6fr 1.2fr 100px 100px 110px 110px 100px",
                        padding: "16px 22px", alignItems: "center", cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {/* Client + Ad */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{c.client}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                            color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`,
                          }}>{c.status}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{c.adName}</div>
                      </div>

                      {/* Machines */}
                      <div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {c.machines.map((m, i) => (
                            <span key={i} style={{
                              fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                              background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0",
                            }}>{m}</span>
                          ))}
                        </div>
                      </div>

                      {/* Duration */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{c.totalDays}d</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>${c.dailyRate}/day</div>
                      </div>

                      {/* Revenue */}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>${c.totalRevenue.toLocaleString()}</div>
                      </div>

                      {/* Impressions */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                          {c.estimatedImpressions > 0 ? `${(c.estimatedImpressions / 1000).toFixed(1)}K` : "—"}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>est. views</div>
                      </div>

                      {/* Scans */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <QrCode size={13} color="#7c3aed" />
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed" }}>{c.barcodeScans}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>scans</div>
                      </div>

                      {/* Conversion */}
                      <div>
                        {c.conversionRate > 0 ? (
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: c.conversionRate >= 4 ? "#059669" : c.conversionRate >= 2 ? "#d97706" : "#dc2626",
                          }}>
                            {c.conversionRate}%
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div style={{
                        padding: "16px 22px 20px", background: "#f8fafc",
                        borderTop: "1px solid #e2e8f0",
                      }}>
                        <div className="campaign-details-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 20 }}>
                          {/* Client Info */}
                          <div>
                            <SectionLabel>Client Details</SectionLabel>
                            <DetailRow label="Contact" value={c.contactName} />
                            <DetailRow label="Email" value={c.contactEmail} />
                            <DetailRow label="Campaign" value={c.adName} />
                          </div>

                          {/* Schedule */}
                          <div>
                            <SectionLabel>Schedule</SectionLabel>
                            <DetailRow label="Start Date" value={c.startDate} />
                            <DetailRow label="End Date" value={c.endDate} />
                            <DetailRow label="Duration" value={`${c.totalDays} days`} />
                            <DetailRow label="Daily Rate" value={`$${c.dailyRate.toFixed(2)}`} />
                          </div>

                          {/* Performance */}
                          <div>
                            <SectionLabel>Performance</SectionLabel>
                            <DetailRow label="Total Revenue" value={`$${c.totalRevenue.toLocaleString()}`} valueColor="#059669" />
                            <DetailRow label="Est. Impressions" value={c.estimatedImpressions.toLocaleString()} />
                            <DetailRow label="Barcode Scans" value={`${c.barcodeScans}`} valueColor="#7c3aed" />
                            <DetailRow label="Conversion Rate" value={`${c.conversionRate}%`}
                              valueColor={c.conversionRate >= 4 ? "#059669" : "#d97706"} />
                            <div style={{
                              display: "flex", alignItems: "center", gap: 6,
                              marginTop: 6, padding: "6px 10px", background: "#ede9fe",
                              borderRadius: 6, fontSize: 11, color: "#6d28d9", fontWeight: 500,
                            }}>
                              <QrCode size={12} />
                              Tracking: {c.trackingUrl}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{
                          display: "flex", gap: 10, marginTop: 16, paddingTop: 14,
                          borderTop: "1px solid #e2e8f0",
                        }}>
                          <ActionBtn icon={<FileText size={13} />} label="Generate Report" primary />
                          <ActionBtn icon={<Download size={13} />} label="Export Data" />
                          {c.status === "Active" && (
                            <ActionBtn icon={<Clock size={13} />} label="Pause Campaign" />
                          )}
                          {c.status === "Paused" && (
                            <ActionBtn icon={<CheckCircle2 size={13} />} label="Resume Campaign" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredCampaigns.length === 0 && (
                <div style={{
                  padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: 14,
                  background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
                }}>
                  No campaigns found matching your filters.
                </div>
              )}
            </div>
          </>
        )}

        {/* ========== MACHINES TAB ========== */}
        {tab === "Machines" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 700,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 120px 120px 100px 100px 100px",
              padding: "14px 22px", borderBottom: "1px solid #e2e8f0", background: "#f1f5f9",
            }}>
              <TH>Machine</TH>
              <TH>Current Campaign</TH>
              <TH>Avg Tx / Day</TH>
              <TH>Ad Revenue</TH>
              <TH>Slots Used</TH>
              <TH>Availability</TH>
              <TH></TH>
            </div>

            {machineAdSlots.map((m, i) => {
              const slotsAvailable = m.totalSlots - m.usedSlots;
              return (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 1fr 120px 120px 100px 100px 100px",
                  padding: "14px 22px", borderBottom: "1px solid #f1f5f9", alignItems: "center",
                  transition: "background 0.1s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{m.machine}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.location}</div>
                  </div>
                  <div>
                    {m.currentCampaign ? (
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>{m.currentCampaign}</span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#cbd5e1" }}>No active ads</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{m.avgDailyTransactions}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>
                    {m.adRevenue > 0 ? `$${m.adRevenue.toLocaleString()}` : "—"}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {Array.from({ length: m.totalSlots }).map((_, si) => (
                        <div key={si} style={{
                          width: 8, height: 8, borderRadius: 2,
                          background: si < m.usedSlots ? "#2563eb" : "#e2e8f0",
                        }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>
                      {m.usedSlots}/{m.totalSlots} slots
                    </div>
                  </div>
                  <div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10,
                      color: slotsAvailable === m.totalSlots ? "#059669" : slotsAvailable > 0 ? "#d97706" : "#dc2626",
                      background: slotsAvailable === m.totalSlots ? "#ecfdf5" : slotsAvailable > 0 ? "#fffbeb" : "#fef2f2",
                    }}>
                      {slotsAvailable === m.totalSlots ? "Available" : slotsAvailable > 0 ? `${slotsAvailable} free` : "Full"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    {slotsAvailable > 0 && (
                      <button style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "6px 12px", borderRadius: 7,
                        background: "#2563eb", border: "none",
                        fontSize: 11, fontWeight: 600, color: "#fff", cursor: "pointer",
                      }}>
                        <Plus size={12} /> Assign Ad
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* ========== REPORTS TAB ========== */}
        {tab === "Reports" && (
          <div className="cards-grid-2" style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
            {/* Campaign Performance Summary */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", gridColumn: "1 / -1",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Campaign Performance Summary</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Revenue, impressions, and conversion by campaign</div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 100px 120px 100px 100px 80px",
                padding: "12px 16px", background: "#f1f5f9", borderRadius: 8, marginBottom: 4,
              }}>
                <TH>Campaign</TH>
                <TH>Revenue</TH>
                <TH>Impressions</TH>
                <TH>Scans</TH>
                <TH>Conversion</TH>
                <TH>ROI</TH>
              </div>

              {campaigns.filter(c => c.status !== "Scheduled").map((c) => {
                const roi = c.barcodeScans > 0 ? ((c.barcodeScans * 15 - c.totalRevenue) / c.totalRevenue * 100) : 0;
                return (
                  <div key={c.id} style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 100px 120px 100px 100px 80px",
                    padding: "12px 16px", borderBottom: "1px solid #f1f5f9", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{c.client}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.adName}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>${c.totalRevenue.toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: "#475569" }}>{c.estimatedImpressions.toLocaleString()}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <QrCode size={11} color="#7c3aed" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#7c3aed" }}>{c.barcodeScans}</span>
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: c.conversionRate >= 4 ? "#059669" : c.conversionRate >= 2 ? "#d97706" : "#64748b",
                    }}>{c.conversionRate}%</div>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: roi > 0 ? "#059669" : "#dc2626",
                    }}>
                      {roi > 0 ? "+" : ""}{roi.toFixed(0)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Machine Ad Revenue */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Ad Revenue by Machine</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Total ad revenue per machine</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {machineAdSlots
                  .filter((m) => m.adRevenue > 0)
                  .sort((a, b) => b.adRevenue - a.adRevenue)
                  .map((m, i) => {
                    const maxRev = machineAdSlots.reduce((max, x) => Math.max(max, x.adRevenue), 0);
                    return (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{m.machine}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>${m.adRevenue}</span>
                        </div>
                        <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 4,
                            width: `${(m.adRevenue / maxRev) * 100}%`,
                            background: "linear-gradient(90deg, #7c3aed, #a78bfa)",
                          }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Impression Formula Explanation */}
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>How We Track</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Impression estimation and conversion tracking</div>

              <div style={{
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
                padding: "16px", marginBottom: 14,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Impression Formula</div>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: "#2563eb",
                  background: "#eff6ff", padding: "10px 14px", borderRadius: 8, fontFamily: "monospace",
                  textAlign: "center",
                }}>
                  Impressions = Avg Daily Tx × 3 views/tx × Days
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 8, lineHeight: 1.6 }}>
                  Each customer sees the screen approximately 3 times per visit (browsing products, selecting, and payment screen).
                  Daily transaction count comes from Nayax data.
                </div>
              </div>

              <div style={{
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
                padding: "16px",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Conversion Tracking</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: "#ede9fe",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <QrCode size={18} color="#7c3aed" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>Barcode via bit.ly</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>Each ad has a unique bit.ly barcode</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
                  Ads display a unique QR/barcode linked through bit.ly. Scan counts are tracked automatically.
                  Conversion = (Scans ÷ Impressions) × 100. Client reports include scan data, impression estimates, and conversion rates.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info footer */}
        <div style={{
          marginTop: 20, padding: "14px 18px", background: "#ede9fe",
          border: "1px solid #c4b5fd", borderRadius: 10, fontSize: 12, color: "#5b21b6",
          lineHeight: 1.6,
        }}>
          <strong>How advertising works:</strong> Clients pay a daily rate to display ads on vending machine screens.
          Each machine has {machineAdSlots[0]?.totalSlots || 4} ad rotation slots. Impressions are estimated using Nayax
          transaction data × 3 screen views per transaction. Each ad includes a unique bit.ly barcode — scans are tracked
          to measure conversion. Client reports can be generated per campaign showing impressions, scans, and ROI.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function StatBox({ icon, iconBg, label, value, sub, subColor }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string; subColor?: string;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
      padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 21, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: subColor || "#94a3b8", marginTop: 2, fontWeight: subColor ? 600 : 500 }}>{sub}</div>
      </div>
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#64748b",
      textTransform: "uppercase" as const, letterSpacing: 0.5,
    }}>{children}</div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
      {children}
    </div>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: valueColor || "#0f172a" }}>{value}</span>
    </div>
  );
}

function ActionBtn({ icon, label, primary }: { icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button style={{
      display: "flex", alignItems: "center", gap: 5, padding: "7px 14px",
      borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
      background: primary ? "#2563eb" : "#fff",
      color: primary ? "#fff" : "#475569",
      border: primary ? "none" : "1px solid #d5d9e2",
      boxShadow: primary ? "0 2px 6px rgba(37,99,235,0.2)" : "none",
    }}>
      {icon} {label}
    </button>
  );
}
