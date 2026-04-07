"use client";

import Header from "@/components/Header";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRouter } from "next/navigation";
import {
  Truck,
  PackageX,
  DollarSign,
  MapPin,
  WifiOff,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  CheckCircle2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Reusable style objects                                             */
/* ------------------------------------------------------------------ */

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #d5d9e2",
  boxShadow: "0 2px 6px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const cardHeader: React.CSSProperties = {
  padding: "20px 22px 12px",
  display: "flex",
  alignItems: "center",
  gap: 14,
};

const cardBody: React.CSSProperties = {
  padding: "0 22px",
  flex: 1,
};

const cardFooter: React.CSSProperties = {
  padding: "16px 22px 20px",
};

const iconBox = (bg: string): React.CSSProperties => ({
  width: 42,
  height: 42,
  borderRadius: 12,
  background: bg,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

const btnBase: React.CSSProperties = {
  width: "100%",
  padding: "11px 0",
  borderRadius: 10,
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  letterSpacing: 0.2,
  transition: "opacity 0.15s",
};

const greenBtn: React.CSSProperties = { ...btnBase, background: "#059669", color: "#fff" };
const blueBtn: React.CSSProperties = { ...btnBase, background: "#16a34a", color: "#fff" };
const redBtn: React.CSSProperties = { ...btnBase, background: "#dc2626", color: "#fff" };

const listRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  background: "#f1f5f9",
  borderRadius: 10,
};

const badge = (bg: string, color: string): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color: color,
  padding: "3px 9px",
  borderRadius: 20,
  whiteSpace: "nowrap",
});

/* ------------------------------------------------------------------ */
/*  Test Data                                                          */
/* ------------------------------------------------------------------ */

const refillStops = [
  { machine: "Baker Nissan Sales", location: "12090 Katy Fwy", items: 8, color: "#dc2626" },
  { machine: "B4 Lumber", location: "6815 Airline Dr", items: 5, color: "#d97706" },
  { machine: "Reynolds Nationwide", location: "3411 Richmond Ave", items: 3, color: "#059669" },
];

const priceChanges = [
  { product: "Celsius Tropical Vibe", from: "$2.50", to: "$2.75", pct: "+10%" },
  { product: "Monster Energy", from: "$3.00", to: "$3.25", pct: "+8%" },
  { product: "Bai Coconut", from: "$2.00", to: "$2.25", pct: "+12%" },
];

const machineAlerts = [
  { machine: "Machine 5", status: "Offline", note: "No Sales in 6 Hours", critical: true },
  { machine: "Machine 2", status: "Connection Issue", note: "Intermittent for 2 Hours", critical: false },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const router = useRouter();
  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Today" subtitle="Tuesday, April 30" />

      {/* ---- Quick Stats ---- */}
      <div style={{ padding: isMobile ? "16px 16px 0" : "24px 32px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16 }}>
          <StatCard icon={<TrendingUp size={20} color="#16a34a" />} iconBg="#dcfce7"
            label="Today's Revenue" value="$145.80"
            tag={<span style={{ color: "#059669", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}><ArrowUpRight size={14} /> 12% vs yesterday</span>} />
          <StatCard icon={<CheckCircle2 size={20} color="#059669" />} iconBg="#dcfce7"
            label="Machines Active" value="6 / 8"
            tag={<span style={{ color: "#d97706", fontSize: 12, fontWeight: 500 }}>2 need attention</span>} />
          <StatCard icon={<AlertTriangle size={20} color="#d97706" />} iconBg="#fef3c7"
            label="Pending Actions" value="7"
            tag={<span style={{ color: "#dc2626", fontSize: 12, fontWeight: 500 }}>3 urgent</span>} />
          <StatCard icon={<Clock size={20} color="#6366f1" />} iconBg="#fef9c3"
            label="Route ETA" value="2h 15m"
            tag={<span style={{ color: "#64748b", fontSize: 12, fontWeight: 500 }}>3 stops planned</span>} />
        </div>
      </div>

      {/* ---- Main Cards Grid ---- */}
      <div style={{ padding: isMobile ? 16 : "24px 32px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 16 : 20 }}>

          {/* --- Card 1: Refill Stops --- */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#16a34a")}><Truck size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Today&apos;s Refill Stops</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  <span style={{ fontWeight: 600, color: "#16a34a" }}>3</span> Machines Need Refill
                </div>
              </div>
            </div>
            <div style={cardBody}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Route Ready · Click to Start</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {refillStops.map((s, i) => (
                  <div key={i} style={listRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{s.machine}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.location}</div>
                      </div>
                    </div>
                    <span style={badge("#fff", "#4b5563")}>{s.items} items</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={cardFooter}><button style={greenBtn} onClick={() => router.push("/machines")}>Start Route</button></div>
          </div>

          {/* --- Card 2: Low Inventory --- */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#d97706")}><PackageX size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Low Inventory Alert</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Low Stock in Warehouse</div>
              </div>
            </div>
            <div style={cardBody}>
              <div style={{
                background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10,
                padding: "14px 16px", marginBottom: 14,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>Order Needed</div>
                <div style={{ fontSize: 12, color: "#b45309", marginTop: 4 }}>Chips, Celsius, Granola Bars</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <InfoRow label="Warehouse Value" value="$2,420.75" />
                <InfoRow label="Items Below Threshold" value="8 products" valueColor="#d97706" />
                <InfoRow label="Estimated Restock Cost" value="$689.00" />
              </div>
            </div>
            <div style={cardFooter}><button style={greenBtn} onClick={() => router.push("/inventory")}>View Order</button></div>
          </div>

          {/* --- Card 3: Price Change --- */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#059669")}><DollarSign size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Price Change Review</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  <span style={{ fontWeight: 600, color: "#16a34a" }}>3</span> Price Updates Suggested
                </div>
              </div>
            </div>
            <div style={cardBody}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>Approve New Pricing Updates</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {priceChanges.map((p, i) => (
                  <div key={i} style={listRow}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{p.product}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.from} → {p.to}</div>
                    </div>
                    <span style={badge("#d1fae5", "#059669")}>{p.pct}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={cardFooter}><button style={blueBtn} onClick={() => router.push("/pricing")}>Review Prices</button></div>
          </div>

          {/* --- Card 4: New Location Reply --- */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#eab308")}><MapPin size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>New Location Reply</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>1 new response</div>
              </div>
            </div>
            <div style={cardBody}>
              <div style={{
                background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10,
                padding: "16px", marginBottom: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", background: "#eab308",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 12, fontWeight: 700,
                  }}>JT</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Johnson Tech</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>Replied today</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#a16207", fontWeight: 600 }}>Interested in a Meeting</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#64748b" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#059669" }} />
                  Pipeline: 3 active prospects
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#64748b" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a" }} />
                  2 follow-ups scheduled this week
                </div>
              </div>
            </div>
            <div style={cardFooter}><button style={greenBtn} onClick={() => router.push("/pipeline")}>View Reply</button></div>
          </div>

          {/* --- Card 5: Machine Alert --- */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#dc2626")}><WifiOff size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Machine Alert</div>
                <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 500, marginTop: 2 }}>2 machines need attention</div>
              </div>
            </div>
            <div style={cardBody}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {machineAlerts.map((a, i) => (
                  <div key={i} style={{
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: a.critical ? "#fee2e2" : "#fef3c7",
                    border: `1px solid ${a.critical ? "#fecaca" : "#fde68a"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: a.critical ? "#dc2626" : "#d97706",
                          animation: "pulse 2s infinite",
                        }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{a.machine}</span>
                      </div>
                      <span style={badge(
                        a.critical ? "#fee2e2" : "#fef3c7",
                        a.critical ? "#dc2626" : "#d97706",
                      )}>{a.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", paddingLeft: 16 }}>{a.note}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={cardFooter}><button style={redBtn} onClick={() => router.push("/machines")}>Check Status</button></div>
          </div>

          {/* --- Card 6: Sales Summary --- */}
          <div style={card}>
            <div style={cardHeader}>
              <div style={iconBox("#059669")}><TrendingUp size={20} color="#fff" /></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Sales Summary</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Today&apos;s performance</div>
              </div>
            </div>
            <div style={cardBody}>
              <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Today&apos;s Revenue</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#0f172a", letterSpacing: -1 }}>$145.80</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 4 }}>
                  <ArrowUpRight size={14} color="#059669" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>Up 12%</span>
                  <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 2 }}>vs. Yesterday</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <MiniStat label="Transactions" value="47" sub="+8" positive />
                <MiniStat label="Avg. Sale" value="$3.10" sub="+$0.15" positive />
                <MiniStat label="Card %" value="78%" sub="+3%" positive />
                <MiniStat label="Cash" value="$32.10" sub="-5%" positive={false} />
              </div>
            </div>
            <div style={cardFooter}><button style={greenBtn} onClick={() => router.push("/reports")}>View Report</button></div>
          </div>

        </div>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function StatCard({ icon, iconBg, label, value, tag }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; tag: React.ReactNode;
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
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>{value}</div>
        <div style={{ marginTop: 2 }}>{tag}</div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor || "#111827" }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, sub, positive }: {
  label: string; value: string; sub: string; positive: boolean;
}) {
  return (
    <div style={{ background: "#f1f5f9", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: positive ? "#059669" : "#dc2626", marginTop: 1 }}>{sub}</div>
    </div>
  );
}
