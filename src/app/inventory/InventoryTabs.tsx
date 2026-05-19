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
} from "lucide-react";

const TABS = [
  { href: "/inventory",                  label: "Overview",       icon: Warehouse },
  { href: "/inventory/products",         label: "Products",       icon: Package },
  { href: "/inventory/projections",      label: "Projections",    icon: TrendingUp },
  { href: "/inventory/buy-list",         label: "Buy List",       icon: ShoppingCart },
  { href: "/inventory/purchase-orders",  label: "Purchase Orders",icon: ClipboardList },
  { href: "/inventory/alerts",           label: "Alerts",         icon: Bell },
  { href: "/inventory/proposals",        label: "Proposals",      icon: Sparkles },
  { href: "/inventory/underperformers",  label: "Underperformers",icon: AlertTriangle },
  { href: "/inventory/replacements",     label: "Replacements",   icon: ArrowRightLeft },
];

export default function InventoryTabs() {
  const pathname = usePathname() || "";
  return (
    <div className="bg-white border-b sticky top-16 z-30">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-1 overflow-x-auto py-2 -mx-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            // exact-match for /inventory so the Overview tab doesn't light up
            // on every sub-page
            const active =
              tab.href === "/inventory"
                ? pathname === "/inventory"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
