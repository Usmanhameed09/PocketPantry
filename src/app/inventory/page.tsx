"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import Header from "@/components/Header";
import RefillModal from "./RefillModal";
import InventoryTabs from "./InventoryTabs";
import {
  Search,
  Plus,
  Warehouse,
  AlertTriangle,
  PackageCheck,
  MoreHorizontal,
  ShoppingCart,
  RefreshCw,
  Loader2,
  ClipboardList,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RestockStatus = "OK" | "Low" | "Critical" | "Out" | "NoData";
type Category = "All" | "Drinks" | "Snacks";

interface MachineDetail {
  machineId: string;
  machineName: string;
  estimatedRemaining: number;
  lastLoadedQty: number;
  dailySalesRate: number;
  lastRefillAt: string | null;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  onHand: number;
  inMachines: number;
  dailySales: number;
  daysLeft: number;
  leadTimeDays: number;
  restockStatus: RestockStatus;
  machines: MachineDetail[];
}

interface Stats {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalUnits: number;
}

interface MachineOption {
  id: string;
  name: string;
  nayaxDeviceId: string | null;
  status: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const restockConfig: Record<RestockStatus, { label: string; color: string; bg: string }> = {
  OK: { label: "In Stock", color: "#059669", bg: "#d1fae5" },
  Low: { label: "Low Stock", color: "#d97706", bg: "#fef3c7" },
  Critical: { label: "Order Needed", color: "#dc2626", bg: "#fef2f2" },
  Out: { label: "Out of Stock", color: "#dc2626", bg: "#fef2f2" },
  NoData: { label: "Needs setup", color: "#475569", bg: "#f1f5f9" },
};

function daysRemaining(daysLeft: number): string {
  if (daysLeft >= 999) return "\u2014";
  return `~${daysLeft} days`;
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
  // Most operators have ~1000 SKUs in the catalog but only ~50 are actually
  // stocked at any time. Default hides the "0 / 0 / 0" rows that overwhelm
  // the table; toggle restores them when needed.
  const [showEmpty, setShowEmpty] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [productList, setProductList] = useState<ProductOption[]>([]);
  const [stats, setStats] = useState<Stats>({ totalProducts: 0, lowStockCount: 0, outOfStockCount: 0, totalUnits: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [showRefill, setShowRefill] = useState(false);
  const [error, setError] = useState("");

  const fetchInventory = useCallback(async () => {
    try {
      setError("");
      // Only request the full 1000+ catalog when the operator explicitly
      // ticks "Show empty products" — otherwise the API only ships the
      // ~50 rows that actually have stock or sales (massive payload cut).
      const url = showEmpty ? "/api/inventory?includeEmpty=1" : "/api/inventory";
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to load inventory");
        return;
      }
      setProducts(data.products || []);
      setMachines(data.machines || []);
      setProductList(data.productList || []);
      setStats(data.stats || { totalProducts: 0, lowStockCount: 0, outOfStockCount: 0, totalUnits: 0 });
    } catch (err: any) {
      setError(err.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [showEmpty]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await fetch("/api/inventory/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(
          `Synced ${data.machinesSynced} machines, ${data.productsProcessed} products, ${data.inventoryRows} inventory rows`
        );
        // Refresh inventory data
        await fetchInventory();
      } else {
        setSyncMessage(`Sync failed: ${data.error}`);
      }
    } catch (err: any) {
      setSyncMessage(`Sync error: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(""), 8000);
    }
  };

  const handleRefillDone = async () => {
    setShowRefill(false);
    await fetchInventory();
  };

  const filtered = products.filter((p) => {
    const matchSearch =
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat =
      catFilter === "All" ||
      (catFilter === "Drinks" && p.category.toLowerCase().includes("drink")) ||
      (catFilter === "Snacks" && !p.category.toLowerCase().includes("drink"));
    const matchStatus = statusFilter === "All" || p.restockStatus === statusFilter;
    // Hide products with no warehouse stock, no machine presence, and no
    // sales activity — they aren't actually in the operation. Toggle to
    // reveal the full catalog when needed.
    const isEmpty = p.onHand === 0 && p.inMachines === 0 && p.dailySales === 0;
    const matchEmpty = showEmpty || !isEmpty;
    return matchSearch && matchCat && matchStatus && matchEmpty;
  });

  const totalInMachines = products.reduce((s, p) => s + p.inMachines, 0);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <Header title="Inventory" />
        <InventoryTabs />
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 400 }}>
          <Loader2 size={32} color="#16a34a" style={{ animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Inventory" />
      <InventoryTabs />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: "12px 18px", marginBottom: 16, background: "#fef2f2",
            border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Sync message */}
        {syncMessage && (
          <div style={{
            padding: "12px 18px", marginBottom: 16,
            background: syncMessage.includes("failed") || syncMessage.includes("error") ? "#fef2f2" : "#f0fdf4",
            border: `1px solid ${syncMessage.includes("failed") || syncMessage.includes("error") ? "#fecaca" : "#bbf7d0"}`,
            borderRadius: 10, fontSize: 13,
            color: syncMessage.includes("failed") || syncMessage.includes("error") ? "#dc2626" : "#16a34a",
          }}>
            {syncMessage}
          </div>
        )}

        {/* Empty state */}
        {products.length === 0 && !error && (
          <div style={{
            textAlign: "center", padding: "60px 20px", background: "#fff",
            borderRadius: 14, border: "1px solid #d5d9e2", marginBottom: 24,
          }}>
            <ClipboardList size={48} color="#94a3b8" style={{ marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
              No inventory data yet
            </h3>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
              Sync from Nayax to pull in your machines and products, then log refills to start tracking stock levels.
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 24px", background: "#16a34a", color: "#fff",
                border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: syncing ? "not-allowed" : "pointer", opacity: syncing ? 0.7 : 1,
              }}
            >
              {syncing ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={16} />}
              {syncing ? "Syncing..." : "Sync from Nayax"}
            </button>
          </div>
        )}

        {/* Main content (shown when we have products) */}
        {products.length > 0 && (
          <>
            {/* Stat Cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <StatBox
                icon={<Warehouse size={20} color="#16a34a" />}
                iconBg="#dcfce7"
                label="Total Products"
                value={`${stats.totalProducts}`}
                sub={`${stats.totalUnits} total units tracked`}
              />
              <StatBox
                icon={<AlertTriangle size={20} color="#d97706" />}
                iconBg="#fef3c7"
                label="Low Stock"
                value={`${stats.lowStockCount + stats.outOfStockCount} Products`}
                sub={`${stats.outOfStockCount} out of stock`}
                subColor={stats.outOfStockCount > 0 ? "#dc2626" : undefined}
              />
              <StatBox
                icon={<ShoppingCart size={20} color="#6366f1" />}
                iconBg="#ede9fe"
                label="Last Sync"
                value="Live"
                sub="Nayax sales data"
              />
              <StatBox
                icon={<PackageCheck size={20} color="#059669" />}
                iconBg="#d1fae5"
                label="In Machines"
                value={`${totalInMachines} units`}
                sub="Estimated from refills + sales"
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
                        background: catFilter === cat ? "#16a34a" : "transparent",
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
                  <option value="OK">In Stock</option>
                  <option value="Low">Low Stock</option>
                  <option value="Critical">Order Needed</option>
                  <option value="Out">Out of Stock</option>
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

                {/* Show-empty toggle — hidden by default because a 1000-row
                    catalog dump is unusable. Operator can enable it when
                    setting up new products. */}
                <label style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
                  color: "#475569", cursor: "pointer", userSelect: "none",
                }}>
                  <input
                    type="checkbox"
                    checked={showEmpty}
                    onChange={(e) => setShowEmpty(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  Show empty products
                </label>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
                    background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer",
                    opacity: syncing ? 0.6 : 1,
                  }}
                >
                  {syncing
                    ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    : <RefreshCw size={15} />}
                  {syncing ? "Syncing..." : "Sync Nayax"}
                </button>
                <button
                  onClick={() => setShowRefill(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                    background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Plus size={16} /> Log Refill
                </button>
              </div>
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
                  gridTemplateColumns: "2fr 90px 100px 100px 110px 100px 120px",
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
                </div>

                {/* Rows */}
                {filtered.map((p) => {
                  const rc = restockConfig[p.restockStatus];
                  const machineCount = p.machines?.length || 0;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 90px 100px 100px 110px 100px 120px",
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
                          background: p.category.toLowerCase().includes("drink") ? "#dcfce7" : "#fef3c7",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16,
                        }}>
                          {p.category.toLowerCase().includes("drink") ? "\uD83E\uDD64" : "\uD83C\uDF7F"}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.sku}</div>
                        </div>
                      </div>

                      {/* On Hand */}
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{p.onHand}</span>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>units</div>
                      </div>

                      {/* In Machines */}
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{p.inMachines}</span>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{machineCount} machine{machineCount !== 1 ? "s" : ""}</div>
                      </div>

                      {/* Daily Sales */}
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{p.dailySales.toFixed(1)}</span>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>units/day</div>
                      </div>

                      {/* Days Left */}
                      <div>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: p.daysLeft <= 3 ? "#dc2626" :
                                 p.daysLeft <= 7 ? "#d97706" : "#059669",
                        }}>
                          {daysRemaining(p.daysLeft)}
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
                          {rc.label}
                        </span>
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
              <strong>How this data works:</strong> &quot;On Hand&quot; is updated when you receive stock.
              &quot;In Machines&quot; is estimated by subtracting Nayax sales since last refill from loaded quantities.
              Click &quot;Sync Nayax&quot; to pull the latest sales data. Click &quot;Log Refill&quot; to record
              what you loaded into a machine &mdash; this sets the baseline for stock estimation.
            </div>
          </>
        )}
      </div>

      {/* Refill Modal */}
      {showRefill && (
        <RefillModal
          machines={machines}
          products={productList}
          onClose={() => setShowRefill(false)}
          onDone={handleRefillDone}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
