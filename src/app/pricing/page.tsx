"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Search,
  Filter,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Clock,
  Check,
  X,
  ChevronDown,
  RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PriceStatus =
  | "Cost Margin"      // Current price already meets margin — no action
  | "Pending Approval" // Cost changed, new price suggested — needs operator approval
  | "Seasonal Price"   // Seasonal pricing rule applied
  | "Approved";        // Operator approved the suggested price

type Tab = "Price Adjustments" | "Rules" | "Alerts";
type FilterType = "All" | "Pending Approval" | "Seasonal" | "Cost Change";

interface PricingItem {
  id: string;
  product: string;
  supplier: string;
  /** Current supplier cost — monitored from Costco/Sam's */
  cost: number;
  /** Previous supplier cost (to show deviation) */
  prevCost: number;
  /** Current vending machine price */
  currentPrice: number;
  /** System suggested price based on margin rules + cost */
  suggestedPrice: number;
  /** Margin % = (suggestedPrice - cost) / suggestedPrice × 100 */
  margin: number;
  status: PriceStatus;
  /** What triggered this row: cost change, seasonal rule, or manual */
  trigger: string;
}

/* ------------------------------------------------------------------ */
/*  Test Data                                                          */
/*  - cost & prevCost: from supplier price monitoring (Costco/Sam's)   */
/*  - currentPrice: what's currently set in the vending machine        */
/*  - suggestedPrice: calculated by pricing engine based on:           */
/*      cost + target margin + rounding to .25/.50/.75 increments      */
/*  - margin: (suggestedPrice - cost) / suggestedPrice × 100          */
/*  - status: determined by whether cost changed or seasonal rule hit  */
/* ------------------------------------------------------------------ */

const pricingData: PricingItem[] = [
  {
    id: "PR-001", product: "Bai Coconut", supplier: "Costco",
    cost: 1.00, prevCost: 1.00, currentPrice: 2.00,
    suggestedPrice: 2.25, margin: 50,
    status: "Cost Margin", trigger: "Healthy margin",
  },
  {
    id: "PR-002", product: "Celsius Tropical Vibe", supplier: "Costco",
    cost: 1.20, prevCost: 1.05, currentPrice: 2.50,
    suggestedPrice: 2.75, margin: 52,
    status: "Pending Approval", trigger: "Supplier cost ↑ $0.15",
  },
  {
    id: "PR-003", product: "Oreo 2.4oz", supplier: "Sam's Club",
    cost: 0.80, prevCost: 0.65, currentPrice: 1.50,
    suggestedPrice: 1.75, margin: 47,
    status: "Pending Approval", trigger: "Supplier cost ↑ $0.15",
  },
  {
    id: "PR-004", product: "Monster Energy", supplier: "Costco",
    cost: 1.50, prevCost: 1.35, currentPrice: 3.00,
    suggestedPrice: 3.25, margin: 50,
    status: "Pending Approval", trigger: "Supplier cost ↑ $0.15",
  },
  {
    id: "PR-005", product: "Ruffles Cheddar Sour", supplier: "Sam's Club",
    cost: 0.80, prevCost: 0.80, currentPrice: 1.50,
    suggestedPrice: 1.75, margin: 47,
    status: "Seasonal Price", trigger: "Summer demand +18%",
  },
  {
    id: "PR-006", product: "Snickers", supplier: "Sam's Club",
    cost: 0.70, prevCost: 0.70, currentPrice: 1.75,
    suggestedPrice: 1.75, margin: 47,
    status: "Cost Margin", trigger: "Healthy margin",
  },
  {
    id: "PR-007", product: "Celsius Arctic Vibe", supplier: "Costco",
    cost: 1.20, prevCost: 1.20, currentPrice: 2.50,
    suggestedPrice: 2.50, margin: 47,
    status: "Seasonal Price", trigger: "Summer demand +22%",
  },
  {
    id: "PR-008", product: "Red Bull 12 oz", supplier: "Costco",
    cost: 1.75, prevCost: 1.60, currentPrice: 3.50,
    suggestedPrice: 3.75, margin: 47,
    status: "Pending Approval", trigger: "Supplier cost ↑ $0.15",
  },
];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const statusStyles: Record<PriceStatus, { color: string; bg: string; label: string }> = {
  "Cost Margin":      { color: "#059669", bg: "#d1fae5", label: "Cost Margin" },
  "Pending Approval": { color: "#d97706", bg: "#fef3c7", label: "Pending Approval" },
  "Seasonal Price":   { color: "#6366f1", bg: "#fef9c3", label: "Seasonal Price" },
  "Approved":         { color: "#16a34a", bg: "#dcfce7", label: "Approved" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [activeTab, setActiveTab] = useState<Tab>("Price Adjustments");
  const [filterType, setFilterType] = useState<FilterType>("All");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(pricingData);

  const filtered = items.filter((p) => {
    const matchSearch =
      search === "" || p.product.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filterType === "All" ||
      (filterType === "Pending Approval" && p.status === "Pending Approval") ||
      (filterType === "Seasonal" && p.status === "Seasonal Price") ||
      (filterType === "Cost Change" && p.prevCost !== p.cost);
    return matchSearch && matchFilter;
  });

  // Stats
  const costChanges = items.filter((p) => p.prevCost !== p.cost).length;
  const avgMargin = Math.round(items.reduce((s, p) => s + p.margin, 0) / items.length);
  const pendingCount = items.filter((p) => p.status === "Pending Approval").length;
  const dailyRevenue = 223.50;

  function handleApprove(id: string) {
    setItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "Approved" as PriceStatus, currentPrice: p.suggestedPrice } : p))
    );
  }

  function handleReject(id: string) {
    setItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "Cost Margin" as PriceStatus, suggestedPrice: p.currentPrice } : p))
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Pricing" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Tabs */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
          marginBottom: 24, flexWrap: "wrap", gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row",
        }}>
          <div className="tab-bar" style={{ display: "flex", gap: 0, borderBottom: "2px solid #d5d9e2" }}>
            {(["Price Adjustments", "Rules", "Alerts"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "10px 20px", fontSize: 14, fontWeight: 600, border: "none",
                  cursor: "pointer", background: "transparent", position: "relative",
                  color: activeTab === tab ? "#16a34a" : "#9ca3af",
                  borderBottom: activeTab === tab ? "2px solid #16a34a" : "2px solid transparent",
                  marginBottom: -2, transition: "all 0.15s",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <button style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
            background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            <RefreshCw size={14} /> Batch Update Prices
          </button>
        </div>

        {/* Stat Cards */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatBox
            icon={<AlertCircle size={20} color="#dc2626" />}
            iconBg="#fee2e2"
            label="Cost Changes Detected"
            value={`${costChanges} today`}
            sub="From supplier price monitoring"
          />
          <StatBox
            icon={<TrendingUp size={20} color="#059669" />}
            iconBg="#d1fae5"
            label="Avg Margin"
            value={`${avgMargin}%`}
            sub="+2% from last week"
            subColor="#059669"
          />
          <StatBox
            icon={<Clock size={20} color="#d97706" />}
            iconBg="#fef3c7"
            label="Pending Proposals"
            value={`${pendingCount}`}
            sub="Awaiting your approval"
            subColor="#d97706"
          />
          <StatBox
            icon={<DollarSign size={20} color="#16a34a" />}
            iconBg="#dcfce7"
            label="Daily Revenue"
            value={`$${dailyRevenue.toFixed(2)}`}
            sub="Based on current prices"
          />
        </div>

        {/* Filters */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
          marginBottom: 16, flexWrap: "wrap", gap: isMobile ? 10 : 12,
          flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            {/* Filter pills */}
            <div className="filter-pills" style={{ display: "flex", gap: 0, background: "#fff", borderRadius: 8, border: "1px solid #d5d9e2", overflow: "hidden" }}>
              {(["All", "Pending Approval", "Seasonal", "Cost Change"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  style={{
                    padding: "8px 14px", fontSize: 12, fontWeight: 500, border: "none",
                    cursor: "pointer", transition: "all 0.15s",
                    background: filterType === f ? "#16a34a" : "transparent",
                    color: filterType === f ? "#fff" : "#6b7280",
                  }}
                >
                  {f === "All" ? "All Products" : f}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: "relative", flex: isMobile ? 1 : undefined, minWidth: 0 }}>
              <Search size={15} color="#9ca3af"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  paddingLeft: 34, paddingRight: 14, height: 38, fontSize: 13,
                  background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8,
                  width: isMobile ? "100%" : 220, minWidth: 0, outline: "none", color: "#374151",
                }}
              />
            </div>
          </div>

          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            {filtered.length} products
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 700,
        }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 90px 110px 120px 80px 130px 130px",
            padding: "14px 22px",
            borderBottom: "1px solid #d5d9e2",
            background: "#f1f5f9",
          }}>
            <TH>Product</TH>
            <TH>Cost</TH>
            <TH>Current Price</TH>
            <TH>Suggested Price</TH>
            <TH>Margin</TH>
            <TH>Status</TH>
            <TH>Action</TH>
          </div>

          {/* Rows */}
          {filtered.map((p) => {
            const ss = statusStyles[p.status];
            const costChanged = p.prevCost !== p.cost;
            const costDiff = p.cost - p.prevCost;
            const priceChanged = p.suggestedPrice !== p.currentPrice;

            return (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 90px 110px 120px 80px 130px 130px",
                  padding: "14px 22px",
                  borderBottom: "1px solid #e2e8f0",
                  alignItems: "center",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {/* Product + Supplier */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{p.product}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.supplier}</div>
                </div>

                {/* Cost */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                    ${p.cost.toFixed(2)}
                  </div>
                  {costChanged && (
                    <div style={{
                      fontSize: 11, fontWeight: 600, marginTop: 2,
                      color: costDiff > 0 ? "#dc2626" : "#059669",
                    }}>
                      {costDiff > 0 ? "↑" : "↓"} ${Math.abs(costDiff).toFixed(2)} from ${p.prevCost.toFixed(2)}
                    </div>
                  )}
                </div>

                {/* Current Price */}
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                    ${p.currentPrice.toFixed(2)}
                  </span>
                </div>

                {/* Suggested Price */}
                <div>
                  <span style={{
                    fontSize: 14, fontWeight: 700,
                    color: priceChanged ? "#16a34a" : "#374151",
                  }}>
                    ${p.suggestedPrice.toFixed(2)}
                  </span>
                  {priceChanged && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                      +${(p.suggestedPrice - p.currentPrice).toFixed(2)}
                    </div>
                  )}
                </div>

                {/* Margin */}
                <div>
                  <span style={{
                    fontSize: 14, fontWeight: 700,
                    color: p.margin >= 45 ? "#059669" : p.margin >= 35 ? "#d97706" : "#dc2626",
                  }}>
                    {p.margin}%
                  </span>
                </div>

                {/* Status */}
                <div>
                  <span style={{
                    display: "inline-block", fontSize: 11, fontWeight: 600,
                    color: ss.color, background: ss.bg,
                    padding: "4px 10px", borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}>
                    {ss.label}
                  </span>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>
                    {p.trigger}
                  </div>
                </div>

                {/* Action */}
                <div>
                  {p.status === "Pending Approval" ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleApprove(p.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "6px 12px", borderRadius: 6,
                          background: "#059669", border: "none",
                          fontSize: 12, fontWeight: 600, color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        <Check size={13} /> Approve
                      </button>
                      <button
                        onClick={() => handleReject(p.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "6px 10px", borderRadius: 6,
                          background: "#fff", border: "1px solid #d5d9e2",
                          fontSize: 12, fontWeight: 500, color: "#64748b",
                          cursor: "pointer",
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : p.status === "Approved" ? (
                    <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                      ✓ Price Updated
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>No action needed</span>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              No products found.
            </div>
          )}
        </div>
        </div>

        {/* How it works */}
        <div style={{
          marginTop: 16, padding: "14px 18px", background: "#f0f9ff",
          border: "1px solid #bae6fd", borderRadius: 10, fontSize: 12, color: "#0369a1",
          lineHeight: 1.6,
        }}>
          <strong>How pricing works:</strong> Supplier costs are monitored from Costco/Sam&apos;s Club.
          When a cost change is detected, the system calculates a new suggested price using your margin guardrails
          (min {">"}40%, rounded to $0.25 increments). Seasonal rules can also trigger price proposals based on
          demand velocity from Nayax data. You approve or reject each change — nothing updates automatically.
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
      boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: subColor || "#9ca3af", marginTop: 2, fontWeight: subColor ? 600 : 400 }}>{sub}</div>
      </div>
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "#94a3b8",
      textTransform: "uppercase" as const, letterSpacing: 0.5,
    }}>
      {children}
    </div>
  );
}
