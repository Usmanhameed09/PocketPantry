"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Warehouse,
  Package,
  TrendingUp,
  ShoppingCart,
  ClipboardList,
  Bell,
  Sparkles,
  AlertTriangle,
  ArrowRightLeft,
  ScanLine,
  Bot,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

const TABS = [
  { href: "/inventory",                  label: "Overview",       icon: Package },
  { href: "/inventory/assistant",        label: "Ask AI",         icon: Bot },
  { href: "/inventory/warehouse",        label: "Warehouse",      icon: Warehouse },
  { href: "/inventory/scan",             label: "Scan",           icon: ScanLine },
  { href: "/inventory/products",         label: "Products",       icon: Package },
  { href: "/inventory/projections",      label: "Projections",    icon: TrendingUp },
  { href: "/inventory/buy-list",         label: "Buy List",       icon: ShoppingCart },
  { href: "/inventory/purchase-orders",  label: "Purchase Orders",icon: ClipboardList },
  { href: "/inventory/alerts",           label: "Alerts",         icon: Bell },
  { href: "/inventory/proposals",        label: "Trending",       icon: Sparkles },
  { href: "/inventory/underperformers",  label: "Underperformers",icon: AlertTriangle },
  { href: "/inventory/replacements",     label: "Replacements",   icon: ArrowRightLeft },
];

export default function InventoryTabs() {
  const pathname = usePathname() || "";
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        background: "#fff",
        borderBottom: "1px solid #d5d9e2",
        padding: isMobile ? "12px 16px" : "14px 32px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.href === "/inventory"
              ? pathname === "/inventory"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: isMobile ? "8px 12px" : "9px 16px",
                borderRadius: 10,
                fontSize: isMobile ? 13 : 14,
                fontWeight: active ? 700 : 500,
                color: active ? "#fff" : "#475569",
                background: active ? "#16a34a" : "transparent",
                border: active ? "1px solid #15803d" : "1px solid transparent",
                boxShadow: active ? "0 2px 6px rgba(22,163,74,0.25)" : "none",
                whiteSpace: "nowrap",
                textDecoration: "none",
                transition: "all 0.15s",
                cursor: "pointer",
              }}
              className="pp-tab"
            >
              <Icon size={isMobile ? 15 : 16} />
              {tab.label}
            </Link>
          );
        })}
      </div>
      <style>{`
        .pp-tab:not([style*="background: rgb(22, 163, 74)"]):hover {
          background: #f1f5f9 !important;
          color: #0f172a !important;
        }
      `}</style>
    </div>
  );
}
