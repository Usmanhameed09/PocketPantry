"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import Header from "@/components/Header";
import {
  Plus,
  Search,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  Filter,
  MapPin,
  Eye,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MachineStatus = "Healthy" | "Low Stock" | "Offline";
type RefillStatus = "Refill in 1-3 Days" | "Refill in 2-3 Days" | "Refill in 4-5 Days" | "Needs Refill Today";

interface Machine {
  id: string;
  name: string;
  location: string;
  status: MachineStatus;
  lastRevenue: number;
  weeklyRevenue: number;
  margin: number;
  refillStatus: RefillStatus;
  topSku: string;
  deadSku: string;
  refillFrequency: string;
  lastSync: string;
}

/* ------------------------------------------------------------------ */
/*  Test Data — mirrors real Nayax-connected machines                  */
/* ------------------------------------------------------------------ */

const machines: Machine[] = [
  {
    id: "M-001",
    name: "Hartman 16300",
    location: "16300 Hartman Rd, Houston",
    status: "Healthy",
    lastRevenue: 124.60,
    weeklyRevenue: 612.40,
    margin: 48,
    refillStatus: "Refill in 4-5 Days",
    topSku: "Celsius Tropical Vibe",
    deadSku: "Rice Krispies Treat",
    refillFrequency: "Every 5 days",
    lastSync: "2 min ago",
  },
  {
    id: "M-002",
    name: "Hartman 1400-1",
    location: "1400 Hartman Ln, Houston",
    status: "Low Stock",
    lastRevenue: 221.35,
    weeklyRevenue: 845.20,
    margin: 42,
    refillStatus: "Refill in 1-3 Days",
    topSku: "Sour Cream Ruffles",
    deadSku: "Trail Mix",
    refillFrequency: "Every 3 days",
    lastSync: "5 min ago",
  },
  {
    id: "M-003",
    name: "Reynolds Nationwide",
    location: "3411 Richmond Ave, Houston",
    status: "Healthy",
    lastRevenue: 236.10,
    weeklyRevenue: 920.00,
    margin: 51,
    refillStatus: "Refill in 4-5 Days",
    topSku: "Celsius Arctic Vibe",
    deadSku: "Oatmeal Cookie",
    refillFrequency: "Every 5 days",
    lastSync: "1 min ago",
  },
  {
    id: "M-004",
    name: "B4 Lumber",
    location: "6815 Airline Dr, Houston",
    status: "Healthy",
    lastRevenue: 318.95,
    weeklyRevenue: 1102.50,
    margin: 45,
    refillStatus: "Refill in 2-3 Days",
    topSku: "Monster Energy",
    deadSku: "Baked Lays",
    refillFrequency: "Every 4 days",
    lastSync: "3 min ago",
  },
  {
    id: "M-005",
    name: "American Fire",
    location: "9200 Westpark Dr, Houston",
    status: "Healthy",
    lastRevenue: 125.95,
    weeklyRevenue: 540.80,
    margin: 50,
    refillStatus: "Refill in 4-5 Days",
    topSku: "CSF Peanut Butter",
    deadSku: "Granola Bar",
    refillFrequency: "Every 5 days",
    lastSync: "8 min ago",
  },
  {
    id: "M-006",
    name: "Hartman 1255",
    location: "1255 Hartman Rd, Houston",
    status: "Healthy",
    lastRevenue: 102.50,
    weeklyRevenue: 480.00,
    margin: 46,
    refillStatus: "Refill in 4-5 Days",
    topSku: "Doritos Nacho",
    deadSku: "Apple Juice",
    refillFrequency: "Every 6 days",
    lastSync: "2 min ago",
  },
  {
    id: "M-007",
    name: "Baker Nissan Sales",
    location: "12090 Katy Fwy, Houston",
    status: "Low Stock",
    lastRevenue: 473.50,
    weeklyRevenue: 1540.00,
    margin: 44,
    refillStatus: "Needs Refill Today",
    topSku: "Red Bull 12 oz",
    deadSku: "Cheese Crackers",
    refillFrequency: "Every 3 days",
    lastSync: "1 min ago",
  },
  {
    id: "M-008",
    name: "Baker Nissan Service",
    location: "12090 Katy Fwy, Houston",
    status: "Offline",
    lastRevenue: 426.20,
    weeklyRevenue: 0,
    margin: 0,
    refillStatus: "Refill in 2-3 Days",
    topSku: "Vitamin Water",
    deadSku: "Fig Bar",
    refillFrequency: "Every 4 days",
    lastSync: "6 hours ago",
  },
];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const statusConfig: Record<MachineStatus, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  Healthy: { color: "#059669", bg: "#d1fae5", icon: CheckCircle2 },
  "Low Stock": { color: "#d97706", bg: "#fef3c7", icon: AlertTriangle },
  Offline: { color: "#dc2626", bg: "#fee2e2", icon: WifiOff },
};

const refillColor: Record<RefillStatus, string> = {
  "Refill in 4-5 Days": "#059669",
  "Refill in 2-3 Days": "#16a34a",
  "Refill in 1-3 Days": "#d97706",
  "Needs Refill Today": "#dc2626",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MachinesPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [filter, setFilter] = useState<"All" | MachineStatus>("All");
  const [search, setSearch] = useState("");

  const filtered = machines.filter((m) => {
    const matchFilter = filter === "All" || m.status === filter;
    const matchSearch =
      search === "" ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.location.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    total: machines.length,
    healthy: machines.filter((m) => m.status === "Healthy").length,
    lowStock: machines.filter((m) => m.status === "Low Stock").length,
    offline: machines.filter((m) => m.status === "Offline").length,
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Machines" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Top bar: filters + search + add */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
          marginBottom: 20, flexWrap: "wrap", gap: isMobile ? 10 : 12,
          flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            {/* Dropdown */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, color: "#374151", cursor: "pointer",
            }}>
              <Filter size={14} color="#9ca3af" />
              All Machines
              <ChevronDown size={14} color="#9ca3af" />
            </div>

            {/* Search */}
            <div style={{ position: "relative", flex: isMobile ? 1 : undefined, minWidth: 0 }}>
              <Search size={15} color="#9ca3af"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="Search machines, locations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  paddingLeft: 34, paddingRight: 14, height: 38, fontSize: 13,
                  background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8,
                  width: isMobile ? "100%" : 260, minWidth: 0, outline: "none", color: "#374151",
                }}
              />
            </div>
          </div>

          <button style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
            background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            <Plus size={16} /> Add Machine
          </button>
        </div>

        {/* Status Summary Cards */}
        <div className="summary-pills" style={{
          display: "flex", alignItems: "center", gap: 16, marginBottom: 24,
        }}>
          <SummaryPill
            label="Total Machines"
            count={counts.total}
            color="#374151"
            active={filter === "All"}
            onClick={() => setFilter("All")}
          />
          <SummaryPill
            label="Healthy"
            count={counts.healthy}
            color="#059669"
            icon={<CheckCircle2 size={14} color="#059669" />}
            active={filter === "Healthy"}
            onClick={() => setFilter("Healthy")}
          />
          <SummaryPill
            label="Low Stock"
            count={counts.lowStock}
            color="#d97706"
            icon={<AlertTriangle size={14} color="#d97706" />}
            active={filter === "Low Stock"}
            onClick={() => setFilter("Low Stock")}
          />
          <SummaryPill
            label="Offline"
            count={counts.offline}
            color="#dc2626"
            icon={<WifiOff size={14} color="#dc2626" />}
            active={filter === "Offline"}
            onClick={() => setFilter("Offline")}
          />
        </div>

        {/* Machine Table */}
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          overflow: "hidden", minWidth: 700,
        }}>
          {/* Table Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "100px 1.5fr 120px 120px 140px 1fr 80px",
            padding: "14px 22px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f1f5f9",
          }}>
            <TableHead>Status</TableHead>
            <TableHead>Machine</TableHead>
            <TableHead>Last Rev.</TableHead>
            <TableHead>Margin</TableHead>
            <TableHead>Refill Status</TableHead>
            <TableHead>Top SKU</TableHead>
            <TableHead></TableHead>
          </div>

          {/* Rows */}
          {filtered.map((m) => {
            const sc = statusConfig[m.status];
            const StatusIcon = sc.icon;
            return (
              <div
                key={m.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1.5fr 120px 120px 140px 1fr 80px",
                  padding: "16px 22px",
                  borderBottom: "1px solid #f3f4f6",
                  alignItems: "center",
                  transition: "background 0.1s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {/* Status */}
                <div>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 12, fontWeight: 600, color: sc.color,
                    background: sc.bg, padding: "4px 10px", borderRadius: 20,
                  }}>
                    <StatusIcon size={13} />
                    {m.status}
                  </span>
                </div>

                {/* Machine Name + Location */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <MapPin size={11} /> {m.location}
                  </div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                    Last sync: {m.lastSync}
                  </div>
                </div>

                {/* Last Revenue */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                    ${m.lastRevenue.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    ${m.weeklyRevenue.toFixed(0)}/wk
                  </div>
                </div>

                {/* Margin */}
                <div>
                  {m.status === "Offline" ? (
                    <span style={{ fontSize: 13, color: "#cbd5e1" }}>—</span>
                  ) : (
                    <div style={{
                      fontSize: 14, fontWeight: 600,
                      color: m.margin >= 45 ? "#059669" : "#d97706",
                    }}>
                      {m.margin}%
                    </div>
                  )}
                </div>

                {/* Refill Status */}
                <div>
                  <span style={{
                    fontSize: 12, fontWeight: 500,
                    color: refillColor[m.refillStatus],
                  }}>
                    {m.refillStatus}
                  </span>
                  <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                    {m.refillFrequency}
                  </div>
                </div>

                {/* Top SKU */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{m.topSku}</div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                    Dead: {m.deadSku}
                  </div>
                </div>

                {/* View */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "6px 12px", borderRadius: 6,
                    background: "#e2e8f0", border: "1px solid #d5d9e2",
                    fontSize: 12, fontWeight: 500, color: "#374151",
                    cursor: "pointer",
                  }}>
                    <Eye size={13} /> View
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              No machines found matching your search.
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function SummaryPill({ label, count, color, icon, active, onClick }: {
  label: string; count: number; color: string;
  icon?: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 18px", borderRadius: 10,
        background: active ? "#fff" : "transparent",
        border: active ? "1px solid #e5e7eb" : "1px solid transparent",
        boxShadow: active ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      {icon}
      <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color }}>{count}</span>
    </button>
  );
}

function TableHead({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: "#4b5563", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
      {children}
    </div>
  );
}
