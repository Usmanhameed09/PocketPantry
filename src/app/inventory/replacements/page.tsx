"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ArrowRight, ArrowRightLeft } from "lucide-react";
import { PAGE_BG, CARD, EmptyState, LoadingBox, Badge, pageContainer } from "../ui";

type Plan = {
  id: string; oldProductId: string; oldProductName: string;
  newProductId: string; newProductName: string;
  status: "Active" | "Completed" | "Cancelled";
  startedAt: string; completedAt: string | null; notes: string | null;
};

export default function ReplacementsPage() {
  const isMobile = useIsMobile();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/replacements", { cache: "no-store" });
    const data = await res.json();
    if (data.success) setPlans(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusColor: Record<Plan["status"], "blue" | "green" | "gray"> = {
    Active: "blue", Completed: "green", Cancelled: "gray",
  };

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Replacement Plans" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        {loading ? <div style={CARD}><LoadingBox /></div>
          : plans.length === 0 ? (
            <div style={CARD}>
              <EmptyState icon={<ArrowRightLeft size={40} color="#94a3b8" />}
                title="No active replacement plans"
                message="Use the Underperformers page to start replacing slow-moving products." />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {plans.map((p) => (
                <div key={p.id} style={{ ...CARD, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Phasing out</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8", textDecoration: "line-through" }}>{p.oldProductName}</div>
                      </div>
                      <ArrowRight size={20} color="#94a3b8" />
                      <div>
                        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Replacement</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{p.newProductName}</div>
                      </div>
                    </div>
                    <Badge color={statusColor[p.status]}>{p.status}</Badge>
                  </div>
                  {p.notes && <p style={{ fontSize: 13, color: "#475569", marginTop: 10, marginBottom: 0 }}>{p.notes}</p>}
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                    Started {new Date(p.startedAt).toLocaleDateString()}
                    {p.completedAt && ` · Completed ${new Date(p.completedAt).toLocaleDateString()}`}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
