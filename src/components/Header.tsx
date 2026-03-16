"use client";

import { Bell, Search } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const isMobile = useIsMobile();
  const today = new Date();
  const dateString = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #d5d9e2",
        padding: isMobile ? "0 16px" : "0 32px",
        paddingLeft: isMobile ? 56 : 32,
        height: isMobile ? 56 : 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14 }}>
          <h1 style={{ fontSize: isMobile ? 17 : 21, fontWeight: 800, color: "#0f172a", letterSpacing: -0.5 }}>{title}</h1>
          {!isMobile && (
            <span
              style={{
                fontSize: 12,
                color: "#475569",
                background: "#e2e8f0",
                padding: "3px 12px",
                borderRadius: 20,
                fontWeight: 600,
              }}
            >
              {dateString}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14 }}>
        {/* Search — hidden on mobile */}
        {!isMobile && (
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              color="#64748b"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              type="text"
              placeholder="Search..."
              style={{
                paddingLeft: 36,
                paddingRight: 14,
                height: 38,
                fontSize: 13,
                background: "#f1f5f9",
                border: "1px solid #d5d9e2",
                borderRadius: 9,
                width: 220,
                outline: "none",
                color: "#1e293b",
                fontWeight: 500,
              }}
            />
          </div>
        )}

        {/* Notification Bell */}
        <div style={{ position: "relative", cursor: "pointer" }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f1f5f9",
              border: "1px solid #d5d9e2",
            }}
          >
            <Bell size={17} color="#475569" />
          </div>
          <div
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 9,
              height: 9,
              background: "#dc2626",
              borderRadius: "50%",
              border: "2px solid white",
            }}
          />
        </div>

        {/* Divider + User — hidden on mobile */}
        {!isMobile && (
          <>
            <div style={{ width: 1, height: 30, background: "#d5d9e2", margin: "0 2px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #1e40af, #6d28d9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 700,
                  boxShadow: "0 2px 6px rgba(109,40,217,0.3)",
                  flexShrink: 0,
                }}
              >
                AB
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
                  Arthur B.
                </div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>Operator</div>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
