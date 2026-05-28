"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import Header from "@/components/Header";
import {
  Plus,
  Search,
  CheckCircle2,
  WifiOff,
  Eye,
  RefreshCw,
  Wifi,
  Loader2,
  DollarSign,
  ShoppingCart,
  Package,
  X,
  AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MachineStatus = "Healthy" | "Offline";

interface TopProduct {
  name: string;
  qty: number;
}

interface Machine {
  id: string;
  name: string;
  location: string;
  status: MachineStatus;
  totalRevenue: number;
  weeklyRevenue: number;
  orderCount: number;
  paidOrders: number;
  totalItemsSold: number;
  lastOrderTime: string | null;
  lastSync: string;
  topSku: string;
  topSkuQty: number;
  topProducts: TopProduct[];
  leastSku: string;
  type: "chinese" | "nayax";
}

interface PlatformStatus {
  connected: boolean;
  message: string;
}

interface MachineOrder {
  orderNo: string;
  amount: number;
  status: string;
  statusCode: number;
  payTime: string | null;
  createdAt: string | null;
  deviceName: string;
  stickerNum: string;
  items: string;
  totalItems: number;
  isRefund: number;
  refundPrice: string;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const statusConfig: Record<MachineStatus, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  Healthy: { color: "#059669", bg: "#d1fae5", icon: CheckCircle2 },
  Offline: { color: "#dc2626", bg: "#fee2e2", icon: WifiOff },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MachinesPage() {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<"All" | MachineStatus>("All");
  const [search, setSearch] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [platforms, setPlatforms] = useState<Record<string, PlatformStatus>>({});
  const [statusLoading, setStatusLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [machineOrders, setMachineOrders] = useState<MachineOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSource, setOrdersSource] = useState<"live" | "stored" | null>(null);
  const [ordersWarning, setOrdersWarning] = useState<string | null>(null);
  const [ordersSyncedAt, setOrdersSyncedAt] = useState<string | null>(null);

  // Low-stock machine IDs from inventory data
  const [lowStockMachineIds, setLowStockMachineIds] = useState<Set<string>>(new Set());

  const fetchMachines = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/machines");
      const data = await res.json();
      if (data.success && data.machines) {
        setMachines(data.machines);
      }
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchLowStock = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      if (data.success && data.products) {
        const lowIds = new Set<string>();
        for (const product of data.products) {
          if (product.restockStatus === "Low" || product.restockStatus === "Critical" || product.restockStatus === "Out") {
            for (const m of product.machines || []) {
              if (m.estimatedRemaining <= 3 || (m.lastLoadedQty > 0 && m.estimatedRemaining === 0)) {
                lowIds.add(m.machineId);
              }
            }
          }
        }
        setLowStockMachineIds(lowIds);
      }
    } catch {
      // inventory tables may not exist yet — silently skip
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/machines/status");
      const data = await res.json();
      if (data.success && data.platforms) {
        setPlatforms(data.platforms);
      }
    } catch {
      // ignore
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
    fetchStatus();
    fetchLowStock();
  }, [fetchMachines, fetchStatus, fetchLowStock]);

  const viewMachineOrders = useCallback(async (machine: Machine) => {
    setSelectedMachine(machine);
    setOrdersLoading(true);
    setOrdersWarning(null);
    try {
      const res = await fetch(`/api/machines/${encodeURIComponent(machine.id)}/orders?name=${encodeURIComponent(machine.name)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load machine orders.");
      }
      setMachineOrders(Array.isArray(data.orders) ? data.orders : []);
      setOrdersSource(data.source === "stored" ? "stored" : "live");
      setOrdersWarning(data.warning || null);
      setOrdersSyncedAt(data.syncedAt || null);
    } catch (error) {
      setMachineOrders([]);
      setOrdersSource(null);
      setOrdersWarning(error instanceof Error ? error.message : "Failed to load machine orders.");
      setOrdersSyncedAt(null);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const filtered = machines.filter((m) => {
    const matchFilter = filter === "All" || m.status === filter;
    const matchSearch =
      search === "" ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    total: machines.length,
    healthy: machines.filter((m) => m.status === "Healthy").length,
    offline: machines.filter((m) => m.status === "Offline").length,
  };

  // Aggregate stats — sum across the per-machine numbers the scraper returns
  // so the tile updates as new live sales come in from Nayax.
  const totalRevenue = machines.reduce((s, m) => s + m.totalRevenue, 0);
  const weeklyRevenue = machines.reduce((s, m) => s + m.weeklyRevenue, 0);
  const totalOrders = machines.reduce((s, m) => s + m.paidOrders, 0);
  const totalItems = machines.reduce((s, m) => s + m.totalItemsSold, 0);
  const paidMachineOrders = machineOrders.filter((order) => (order.status || "").toLowerCase() === "paid");
  const modalRevenue = paidMachineOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const modalItemsSold = machineOrders.reduce((sum, order) => sum + Number(order.totalItems || 0), 0);
  const latestPaidAt = paidMachineOrders
    .map((order) => order.payTime)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  const chineseConnected = platforms.chinese?.connected === true;
  const nayaxConnected = platforms.nayax?.connected === true;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Machines" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {/* Platform Connection Status */}
        <div style={{
          display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap",
        }}>
          <PlatformBadge
            label="HAHA Machines"
            connected={chineseConnected}
            loading={statusLoading}
          />
          <PlatformBadge
            label="Nayax"
            connected={nayaxConnected}
            loading={statusLoading}
          />
        </div>

        {/* Stat Cards */}
        {machines.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: 14, marginBottom: 22,
          }}>
            <StatCard icon={<DollarSign size={16} color="#059669" />} label="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} sub={`$${weeklyRevenue.toFixed(2)} this week`} />
            <StatCard icon={<ShoppingCart size={16} color="#3b82f6" />} label="Paid Orders" value={String(totalOrders)} sub={`${totalItems} items sold`} />
            <StatCard icon={<Package size={16} color="#8b5cf6" />} label="Machines" value={String(counts.total)} sub={`${counts.healthy} healthy`} />
            <StatCard icon={<CheckCircle2 size={16} color="#f59e0b" />} label="Avg / Machine" value={counts.total ? `$${(totalRevenue / counts.total).toFixed(2)}` : "--"} sub={counts.total ? `${Math.round(totalOrders / counts.total)} orders avg` : ""} />
          </div>
        )}

        {/* Top bar: search + refresh */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between",
          marginBottom: 20, flexWrap: "wrap", gap: isMobile ? 10 : 12,
          flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            <div style={{ position: "relative", flex: isMobile ? 1 : undefined, minWidth: 0 }}>
              <Search size={15} color="#9ca3af"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                placeholder="Search machines..."
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

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => fetchMachines(true)}
              disabled={refreshing}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
                background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: refreshing ? "not-allowed" : "pointer",
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              Refresh
            </button>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
              background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              <Plus size={16} /> Add Machine
            </button>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="summary-pills" style={{
          display: "flex", alignItems: "center", gap: 16, marginBottom: 24,
        }}>
          <SummaryPill
            label="All"
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
            label="Offline"
            count={counts.offline}
            color="#dc2626"
            icon={<WifiOff size={14} color="#dc2626" />}
            active={filter === "Offline"}
            onClick={() => setFilter("Offline")}
          />
        </div>

        {/* Loading State */}
        {loading ? (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            padding: "60px 0", textAlign: "center",
          }}>
            <Loader2 size={24} color="#9ca3af" style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
            <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 12 }}>
              Fetching machines from API...
            </div>
          </div>
        ) : machines.length === 0 ? (
          /* Empty State */
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            padding: "60px 32px", textAlign: "center",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", background: chineseConnected ? "#f0fdf4" : "#fef2f2",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <Wifi size={24} color={chineseConnected ? "#16a34a" : "#dc2626"} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
              {chineseConnected ? "API Connected — No Orders Yet" : "Connect Your Machines"}
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
              {chineseConnected
                ? "Your HAHA machine platform is connected. Machines will appear here once they process their first orders."
                : "Add your API credentials in the backend .env to connect machine platforms."}
            </div>
          </div>
        ) : isMobile ? (
          /* MOBILE: full-width cards, one per machine, easy to tap */
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((m) => {
              const sc = statusConfig[m.status] || statusConfig["Healthy"];
              const StatusIcon = sc.icon;
              return (
                <div
                  key={m.id}
                  onClick={() => viewMachineOrders(m)}
                  style={{
                    background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    padding: "14px 16px", cursor: "pointer",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}
                >
                  {/* Top row: name + status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", lineHeight: 1.25 }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        Last activity: {m.lastSync || "—"}
                      </div>
                    </div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11, fontWeight: 700, color: sc.color,
                      background: sc.bg, padding: "4px 10px", borderRadius: 999,
                      flexShrink: 0,
                    }}>
                      <StatusIcon size={11} />
                      {m.status}
                    </span>
                  </div>

                  {/* Badges row */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: m.type === "chinese" ? "#7c3aed" : "#0369a1",
                      background: m.type === "chinese" ? "#ede9fe" : "#e0f2fe",
                      padding: "3px 8px", borderRadius: 999,
                    }}>
                      {m.type === "chinese" ? "HAHA" : "Nayax"}
                    </span>
                    {lowStockMachineIds.has(m.id) && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        fontSize: 10, fontWeight: 600, color: "#d97706",
                        background: "#fef3c7", padding: "3px 8px", borderRadius: 999,
                      }}>
                        <AlertTriangle size={10} />
                        Low Stock
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
                    background: "#f8fafc", borderRadius: 10, padding: "10px 12px",
                  }}>
                    <MobileMiniStat label="Revenue" value={`$${m.totalRevenue.toFixed(0)}`} />
                    <MobileMiniStat label="Orders" value={String(m.paidOrders)} />
                    <MobileMiniStat label="Items" value={String(m.totalItemsSold)} />
                  </div>

                  {/* Top SKU */}
                  <div style={{ fontSize: 12, color: "#475569", display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}>Top:</span>
                    <span style={{ fontWeight: 500 }}>{m.topSku}</span>
                    {m.topSkuQty > 0 && <span style={{ color: "#94a3b8" }}>({m.topSkuQty})</span>}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                No machines found matching your search.
              </div>
            )}
          </div>
        ) : (
          /* DESKTOP: table view */
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div style={{
              background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
              overflow: "hidden", minWidth: 750,
            }}>
              {/* Table Header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "90px 1.6fr 110px 110px 100px 1fr 70px",
                padding: "14px 22px",
                borderBottom: "1px solid #e5e7eb",
                background: "#f1f5f9",
              }}>
                <TableHead>Status</TableHead>
                <TableHead>Machine</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Top SKU</TableHead>
                <TableHead></TableHead>
              </div>

              {/* Rows */}
              {filtered.map((m) => {
                const sc = statusConfig[m.status] || statusConfig["Healthy"];
                const StatusIcon = sc.icon;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "90px 1.6fr 110px 110px 100px 1fr 70px",
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 12, fontWeight: 600, color: sc.color,
                        background: sc.bg, padding: "4px 10px", borderRadius: 20,
                        width: "fit-content",
                      }}>
                        <StatusIcon size={13} />
                        {m.status}
                      </span>
                      {lowStockMachineIds.has(m.id) && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 11, fontWeight: 600, color: "#d97706",
                          background: "#fef3c7", padding: "3px 8px", borderRadius: 20,
                          width: "fit-content",
                        }}>
                          <AlertTriangle size={11} />
                          Low Stock
                        </span>
                      )}
                    </div>

                    {/* Machine Name + ID */}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                        ID: {m.id}
                      </div>
                      <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                        Last activity: {m.lastSync || "—"}
                      </div>
                    </div>

                    {/* Revenue */}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                        ${m.totalRevenue.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        ${m.weeklyRevenue.toFixed(2)}/wk
                      </div>
                    </div>

                    {/* Orders */}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                        {m.paidOrders}
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {m.totalItemsSold} items
                      </div>
                    </div>

                    {/* Platform */}
                    <div>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: m.type === "chinese" ? "#7c3aed" : "#0369a1",
                        background: m.type === "chinese" ? "#ede9fe" : "#e0f2fe",
                        padding: "3px 8px", borderRadius: 12,
                      }}>
                        {m.type === "chinese" ? "HAHA" : "Nayax"}
                      </span>
                    </div>

                    {/* Top SKU */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
                        {m.topSku}
                      </div>
                      {m.topSkuQty > 0 && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {m.topSkuQty} sold
                        </div>
                      )}
                      {m.leastSku && m.leastSku !== m.topSku && m.leastSku !== "—" && (
                        <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 2 }}>
                          Slow: {m.leastSku}
                        </div>
                      )}
                    </div>

                    {/* View */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewMachineOrders(m);
                        }}
                        style={{
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

              {filtered.length === 0 && (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                  No machines found matching your search.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedMachine && (
        <div
          onClick={() => setSelectedMachine(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.62)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: isMobile ? "stretch" : "flex-start",
            justifyContent: "center",
            padding: isMobile ? 0 : "28px 24px",
            zIndex: 200,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 1120,
              height: isMobile ? "100vh" : "min(86vh, 920px)",
              background: "#fff",
              borderRadius: isMobile ? 0 : 24,
              border: "1px solid rgba(213,217,226,0.8)",
              overflow: "hidden",
              boxShadow: "0 32px 90px rgba(15,23,42,0.28)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{
              padding: isMobile ? "18px 16px 16px" : "22px 26px 18px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, color: "#0f172a", lineHeight: 1.05 }}>{selectedMachine.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Machine ID: {selectedMachine.id} · Platform: {selectedMachine.type === "nayax" ? "Nayax" : "HAHA"}
                </div>
                {ordersSyncedAt && (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    Saved to backend: {new Date(ordersSyncedAt).toLocaleString()}
                    {ordersSource ? ` · Source: ${ordersSource === "live" ? "Live API" : "Stored snapshot"}` : ""}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedMachine(null)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  border: "1px solid #d5d9e2",
                  background: "#ffffffcc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "#64748b",
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {ordersWarning && (
              <div style={{
                margin: "16px 18px 0",
                padding: "12px 14px",
                borderRadius: 14,
                background: "#fef3c7",
                border: "1px solid #fde68a",
                color: "#92400e",
                fontSize: 12,
              }}>
                {ordersWarning}
              </div>
            )}

            <div style={{ padding: isMobile ? 16 : 20, overflow: "auto", background: "#f8fafc" }}>
              {ordersLoading ? (
                <div style={{ padding: "48px 0", textAlign: "center" }}>
                  <Loader2 size={22} color="#9ca3af" style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
                  <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 10 }}>Loading and saving machine orders...</div>
                </div>
              ) : machineOrders.length === 0 ? (
                <div style={{ padding: "36px 0", textAlign: "center", fontSize: 13, color: "#94a3b8" }}>
                  No orders found for this machine.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                    gap: 12,
                  }}>
                    <ModalStatCard
                      label="Orders Loaded"
                      value={String(machineOrders.length)}
                      tone="blue"
                      detail={`${paidMachineOrders.length} paid orders`}
                    />
                    <ModalStatCard
                      label="Paid Revenue"
                      value={`$${modalRevenue.toFixed(2)}`}
                      tone="green"
                      detail="From paid machine sales"
                    />
                    <ModalStatCard
                      label="Items Sold"
                      value={String(modalItemsSold)}
                      tone="amber"
                      detail="Units across loaded orders"
                    />
                    <ModalStatCard
                      label="Latest Paid"
                      value={latestPaidAt ? formatMachineOrderDate(latestPaidAt) : "--"}
                      tone="slate"
                      detail={ordersSource === "stored" ? "Stored snapshot view" : "Live sync view"}
                    />
                  </div>

                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: isMobile ? "0 2px" : "0 4px",
                    flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Recent machine orders</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        Clean snapshot of payment, timestamp, and sold-item details for this {selectedMachine.type === "nayax" ? "Nayax" : "HAHA"} machine.
                      </div>
                    </div>
                    <div style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      background: ordersSource === "stored" ? "#fff7ed" : "#ecfdf5",
                      border: `1px solid ${ordersSource === "stored" ? "#fed7aa" : "#bbf7d0"}`,
                      color: ordersSource === "stored" ? "#c2410c" : "#047857",
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      {ordersSource === "stored" ? "Viewing stored snapshot" : "Viewing live API data"}
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                  <div style={{
                    minWidth: 860,
                    border: "1px solid #dbe4ee",
                    borderRadius: 20,
                    overflow: "hidden",
                    background: "#ffffff",
                    boxShadow: "0 20px 40px rgba(15,23,42,0.08)",
                  }}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "150px 90px 100px 140px 140px 1.7fr 90px",
                      padding: "16px 18px",
                      background: "linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%)",
                      borderBottom: "1px solid #e2e8f0",
                    }}>
                      <TableHead>Order</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Qty</TableHead>
                    </div>
                    {machineOrders.map((order) => (
                      <div
                        key={order.orderNo}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "150px 90px 100px 140px 140px 1.7fr 90px",
                          padding: "16px 18px",
                          borderBottom: "1px solid #eef2f7",
                          alignItems: "start",
                          background: "#ffffff",
                          fontSize: 12,
                          color: "#334155",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{order.orderNo || "--"}</div>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>${Number(order.amount || 0).toFixed(2)}</div>
                        <div>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "5px 10px",
                            borderRadius: 999,
                            background: (order.status || "").toLowerCase() === "paid" ? "#dcfce7" : "#e2e8f0",
                            color: (order.status || "").toLowerCase() === "paid" ? "#15803d" : "#475569",
                            fontWeight: 700,
                            fontSize: 11,
                          }}>
                            {order.status || "--"}
                          </span>
                        </div>
                        <div>{formatMachineOrderDate(order.payTime)}</div>
                        <div>{formatMachineOrderDate(order.createdAt)}</div>
                        <div style={{ color: "#475569", lineHeight: 1.55, fontWeight: 500 }}>{order.items || "--"}</div>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{order.totalItems ?? "--"}</div>
                      </div>
                    ))}
                  </div>
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function PlatformBadge({ label, connected, loading }: {
  label: string; connected: boolean; loading: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 16px", borderRadius: 10,
      background: "#fff", border: "1px solid #e5e7eb",
      fontSize: 13,
    }}>
      {loading ? (
        <Loader2 size={14} color="#9ca3af" style={{ animation: "spin 1s linear infinite" }} />
      ) : (
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#22c55e" : "#d1d5db" }} />
      )}
      <span style={{ fontWeight: 500, color: "#374151" }}>{label}</span>
      <span style={{ fontSize: 11, color: connected ? "#059669" : "#94a3b8" }}>
        {loading ? "Checking..." : connected ? "Connected" : "Not connected"}
      </span>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
}) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

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
    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.9 }}>
      {children}
    </div>
  );
}

function ModalStatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "slate";
}) {
  const tones = {
    blue: { bg: "#eef4ff", border: "#d7e6ff", label: "#3157a6", value: "#0f172a" },
    green: { bg: "#ecfdf5", border: "#bbf7d0", label: "#047857", value: "#064e3b" },
    amber: { bg: "#fff7ed", border: "#fed7aa", label: "#c2410c", value: "#7c2d12" },
    slate: { bg: "#f8fafc", border: "#dbe4ee", label: "#64748b", value: "#0f172a" },
  }[tone];

  return (
    <div style={{
      padding: "15px 16px",
      borderRadius: 18,
      border: `1px solid ${tones.border}`,
      background: tones.bg,
      boxShadow: "0 10px 26px rgba(15,23,42,0.05)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: tones.label, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tones.value, marginTop: 8, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
        {detail}
      </div>
    </div>
  );
}

function formatMachineOrderDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MobileMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
