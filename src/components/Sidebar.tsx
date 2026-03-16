"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  LayoutDashboard,
  Monitor,
  Package,
  DollarSign,
  GitBranch,
  Megaphone,
  BarChart3,
  UserCircle,
  Box,
  Brain,
  X,
} from "lucide-react";

const navItems = [
  { name: "Today", href: "/", icon: LayoutDashboard },
  { name: "Machines", href: "/machines", icon: Monitor },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Pricing", href: "/pricing", icon: DollarSign },
  { name: "Predictions", href: "/predictions", icon: Brain },
  { name: "Pipeline", href: "/pipeline", icon: GitBranch },
  { name: "Advertising", href: "/advertising", icon: Megaphone },
  { name: "Reports", href: "/reports", icon: BarChart3 },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  // On mobile: hidden by default, shown when mobileOpen
  // On desktop: always visible
  const showSidebar = isMobile ? mobileOpen : true;

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
          onClick={onClose}
        />
      )}

      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: 240,
          background: "linear-gradient(180deg, #0c1520 0%, #111d2c 100%)",
          display: "flex",
          flexDirection: "column",
          zIndex: 100,
          overflow: "hidden",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          transform: showSidebar ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s ease",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(37,99,235,0.35)",
              }}
            >
              <Box size={19} color="white" />
            </div>
            <div>
              <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 17, lineHeight: 1.2, letterSpacing: -0.3 }}>
                PocketPantry
              </div>
              <div style={{ color: "rgba(148,163,184,0.7)", fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" as const }}>
                Vending
              </div>
            </div>
          </div>
          {/* Mobile close button */}
          {isMobile && onClose && (
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <X size={18} color="#94a3b8" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "14px 10px", overflowY: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 9,
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "#fff" : "rgba(203,213,225,0.65)",
                    background: isActive
                      ? "linear-gradient(90deg, rgba(37,99,235,0.25), rgba(37,99,235,0.12))"
                      : "transparent",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                    borderLeft: isActive ? "3px solid #3b82f6" : "3px solid transparent",
                    letterSpacing: -0.1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.color = "rgba(226,232,240,0.9)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "rgba(203,213,225,0.65)";
                    }
                  }}
                >
                  <Icon size={18} style={{ opacity: isActive ? 1 : 0.55, flexShrink: 0 }} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Profile */}
        <div style={{ padding: "10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Link
            href="/profile"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 500,
              color: pathname === "/profile" ? "#fff" : "rgba(203,213,225,0.65)",
              background: pathname === "/profile"
                ? "linear-gradient(90deg, rgba(37,99,235,0.25), rgba(37,99,235,0.12))"
                : "transparent",
              textDecoration: "none",
              borderLeft: pathname === "/profile" ? "3px solid #3b82f6" : "3px solid transparent",
            }}
          >
            <UserCircle size={18} style={{ opacity: pathname === "/profile" ? 1 : 0.55 }} />
            Profile
          </Link>
        </div>
      </aside>
    </>
  );
}
