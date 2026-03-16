"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import Header from "@/components/Header";
import {
  Search,
  ChevronDown,
  Filter,
  Plus,
  Warehouse,
  AlertTriangle,
  PackageCheck,
  ArrowUpDown,
  MoreHorizontal,
  ShoppingCart,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RestockStatus = "In Stock" | "Low Stock" | "Order Needed";
type Category = "All" | "Drinks" | "Snacks";

interface Product {
  id: string;
  name: string;
  sku: string;
  category: Category;
  /** Warehouse on-hand qty — tracked by operator on receive & load */
  onHand: number;
  /** Estimated units across all machines — calculated: loaded - Nayax sold */
  inMachines: number;
  /** Avg units sold per day across all machines — from Nayax transactions */
  dailySales: number;
  /** Supplier lead time in days — operator sets per product/supplier */
  leadTimeDays: number;
  /** Restock status — calculated: onHand < dailySales × buffer */
  restockStatus: RestockStatus;
  /** Unit cost from supplier (Costco/Sam's) */
  unitCost: number;
  /** Number of machines carrying this product */
  machineCount: number;
}

/* ------------------------------------------------------------------ */
/*  Test Data                                                          */
/*  - Only includes fields we can realistically track/calculate        */
/*  - onHand: operator logs when receiving from Costco/Sam's           */
/*  - inMachines: (last loaded qty) - (Nayax units sold since refill)  */
/*  - dailySales: avg from Nayax transaction history                   */
/*  - leadTimeDays: set by operator per supplier                       */
/*  - restockStatus: onHand < (dailySales × leadTimeDays + buffer)     */
/* ------------------------------------------------------------------ */

const products: Product[] = [
  {
    id: "P-001", name: "Bai Coconut", sku: "BAI-COCO-18",
    category: "Drinks", onHand: 15, inMachines: 14, dailySales: 0.7,
    leadTimeDays: 1, restockStatus: "In Stock", unitCost: 1.00, machineCount: 4,
  },
  {
    id: "P-002", name: "Celsius Tropical Vibe", sku: "CEL-TROP-12",
    category: "Drinks", onHand: 22, inMachines: 35, dailySales: 1.5,
    leadTimeDays: 2, restockStatus: "In Stock", unitCost: 1.20, machineCount: 6,
  },
  {
    id: "P-003", name: "Sour Cream Ruffles", sku: "RUF-SC-28",
    category: "Snacks", onHand: 18, inMachines: 30, dailySales: 1.1,
    leadTimeDays: 1, restockStatus: "In Stock", unitCost: 0.85, machineCount: 5,
  },
  {
    id: "P-004", name: "Monster Energy", sku: "MON-OG-16",
    category: "Drinks", onHand: 9, inMachines: 18, dailySales: 1.8,
    leadTimeDays: 1, restockStatus: "Low Stock", unitCost: 1.50, machineCount: 6,
  },
  {
    id: "P-005", name: "CSF Peanut Butter", sku: "CSF-PB-6",
    category: "Snacks", onHand: 35, inMachines: 20, dailySales: 0.9,
    leadTimeDays: 2, restockStatus: "In Stock", unitCost: 0.60, machineCount: 4,
  },
  {
    id: "P-006", name: "Red Bull 12 oz", sku: "RB-OG-12",
    category: "Drinks", onHand: 14, inMachines: 21, dailySales: 2.1,
    leadTimeDays: 1, restockStatus: "Low Stock", unitCost: 1.75, machineCount: 7,
  },
  {
    id: "P-007", name: "Snickers", sku: "SNK-REG-52",
    category: "Snacks", onHand: 30, inMachines: 50, dailySales: 2.6,
    leadTimeDays: 1, restockStatus: "In Stock", unitCost: 0.70, machineCount: 8,
  },
  {
    id: "P-008", name: "Cheetos Flamin' Hot", sku: "CHE-FH-8",
    category: "Snacks", onHand: 8, inMachines: 18, dailySales: 1.4,
    leadTimeDays: 2, restockStatus: "Order Needed", unitCost: 0.80, machineCount: 5,
  },
  {
    id: "P-009", name: "Celsius Arctic Vibe", sku: "CEL-ARC-12",
    category: "Drinks", onHand: 6, inMachines: 12, dailySales: 1.2,
    leadTimeDays: 2, restockStatus: "Order Needed", unitCost: 1.20, machineCount: 4,
  },
  {
    id: "P-010", name: "Doritos Nacho", sku: "DOR-NAC-28",
    category: "Snacks", onHand: 24, inMachines: 32, dailySales: 1.0,
    leadTimeDays: 1, restockStatus: "In Stock", unitCost: 0.85, machineCount: 6,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const restockConfig: Record<RestockStatus, { color: string; bg: string }> = {
  "In Stock": { color: "#059669", bg: "#d1fae5" },
  "Low Stock": { color: "#d97706", bg: "#fef3c7" },
  "Order Needed": { color: "#dc2626", bg: "#fef2f2" },
};

/** Days of warehouse stock remaining = onHand / dailySales */
function daysRemaining(p: Product): string {
  if (p.dailySales === 0) return "—";
  const days = Math.round(p.onHand / p.dailySales);
  return `~${days} days`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InventoryPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<Category>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | RestockStatus>("All");

  const filtered = products.filter((p) => {
    const matchSearch =
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "All" || p.category === catFilter;
    const matchStatus = statusFilter === "All" || p.restockStatus === statusFilter;
    return matchSearch && matchCat && matchStatus;
  });

  // Stats
  const warehouseValue = products.reduce((sum, p) => sum + p.onHand * p.unitCost, 0);
  const lowStockCount = products.filter((p) => p.restockStatus === "Low Stock").length;
  const orderNeededCount = products.filter((p) => p.restockStatus === "Order Needed").length;
  const onOrderValue = 689.0; // From pending PO drafts
  const totalProducts = products.length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Inventory" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Stat Cards */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatBox
            icon={<Warehouse size={20} color="#2563eb" />}
            iconBg="#dbeafe"
            label="Warehouse Stock"
            value={`$${warehouseValue.toFixed(2)}`}
            sub={`${totalProducts} products tracked`}
          />
          <StatBox
            icon={<AlertTriangle size={20} color="#d97706" />}
            iconBg="#fef3c7"
            label="Low Stock"
            value={`${lowStockCount + orderNeededCount} Products`}
            sub={`${orderNeededCount} need ordering`}
            subColor="#dc2626"
          />
          <StatBox
            icon={<ShoppingCart size={20} color="#6366f1" />}
            iconBg="#e0e7ff"
            label="On Order"
            value={`$${onOrderValue.toFixed(2)}`}
            sub="1 pending PO draft"
          />
          <StatBox
            icon={<PackageCheck size={20} color="#059669" />}
            iconBg="#d1fae5"
            label="In Machines"
            value={`${products.reduce((s, p) => s + p.inMachines, 0)} units`}
            sub="Estimated from Nayax sales"
          />
        </div>

        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
          marginBottom: 20, flexWrap: "wrap", gap: isMobile ? 10 : 12,
          flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            {/* Category Filter */}
            <div style={{ display: "flex", gap: 0, background: "#fff", borderRadius: 8, border: "1px solid #d5d9e2", overflow: "hidden" }}>
              {(["All", "Drinks", "Snacks"] as Category[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  style={{
                    padding: "8px 16px", fontSize: 13, fontWeight: 500, border: "none",
                    cursor: "pointer", transition: "all 0.15s",
                    background: catFilter === cat ? "#2563eb" : "transparent",
                    color: catFilter === cat ? "#fff" : "#6b7280",
                  }}
                >
                  {cat === "All" ? "All Products" : cat}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "All" | RestockStatus)}
              style={{
                padding: "8px 14px", fontSize: 13, fontWeight: 500, color: "#374151",
                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8,
                cursor: "pointer", outline: "none",
              }}
            >
              <option value="All">All Status</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Order Needed">Order Needed</option>
            </select>

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

          <button style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
            background: "#2563eb", color: "#fff", border: "none", borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            <Plus size={16} /> Create Purchase Order
          </button>
        </div>

        {/* Count */}
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
          {filtered.length} {filtered.length === 1 ? "Product" : "Products"}
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 700,
        }}>
          {/* Table Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 90px 100px 100px 110px 100px 100px 70px",
            padding: "14px 22px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f1f5f9",
          }}>
            <TH>Product</TH>
            <TH>On Hand</TH>
            <TH>In Machines</TH>
            <TH>Daily Sales</TH>
            <TH>Days Left</TH>
            <TH>Lead Time</TH>
            <TH>Restock</TH>
            <TH></TH>
          </div>

          {/* Rows */}
          {filtered.map((p) => {
            const rc = restockConfig[p.restockStatus];
            return (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 90px 100px 100px 110px 100px 100px 70px",
                  padding: "14px 22px",
                  borderBottom: "1px solid #f1f5f9",
                  alignItems: "center",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {/* Product */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 8,
                    background: p.category === "Drinks" ? "#dbeafe" : "#fef3c7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16,
                  }}>
                    {p.category === "Drinks" ? "🥤" : "🍿"}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.sku}</div>
                  </div>
                </div>

                {/* On Hand */}
                <div>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: "#0f172a",
                  }}>{p.onHand}</span>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>units</div>
                </div>

                {/* In Machines */}
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{p.inMachines}</span>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.machineCount} machines</div>
                </div>

                {/* Daily Sales */}
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{p.dailySales.toFixed(1)}</span>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>units/day</div>
                </div>

                {/* Days Left (warehouse stock ÷ daily sales) */}
                <div>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: p.onHand / p.dailySales <= 7 ? "#d97706" :
                           p.onHand / p.dailySales <= 3 ? "#dc2626" : "#059669",
                  }}>
                    {daysRemaining(p)}
                  </span>
                </div>

                {/* Lead Time */}
                <div>
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    {p.leadTimeDays === 1 ? "1 day" : `${p.leadTimeDays} days`}
                  </span>
                </div>

                {/* Restock Status */}
                <div>
                  <span style={{
                    display: "inline-block",
                    fontSize: 11, fontWeight: 600,
                    color: rc.color, background: rc.bg,
                    padding: "4px 10px", borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}>
                    {p.restockStatus}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: "#e2e8f0", border: "1px solid #d5d9e2",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}>
                    <MoreHorizontal size={14} color="#6b7280" />
                  </button>
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

        {/* Explanation note */}
        <div style={{
          marginTop: 16, padding: "14px 18px", background: "#f0f9ff",
          border: "1px solid #bae6fd", borderRadius: 10, fontSize: 12, color: "#0369a1",
          lineHeight: 1.6,
        }}>
          <strong>How this data works:</strong> &quot;On Hand&quot; is updated when you receive stock or load machines.
          &quot;In Machines&quot; is estimated by subtracting Nayax sales since last refill from loaded quantities.
          &quot;Days Left&quot; = On Hand ÷ Daily Sales. &quot;Restock&quot; flags products where warehouse stock
          won&apos;t cover demand through the supplier lead time.
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
