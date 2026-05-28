"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AIChatWidget from "@/components/AIChatWidget";
import { useIsMobile } from "@/hooks/useIsMobile";

const AUTH_PAGES = ["/login", "/signup"];
// Don't double-up: hide the floating widget on the dedicated full-page
// assistant since it'd overlap the bottom of the conversation there.
const HIDE_WIDGET_PATHS = ["/inventory/assistant"];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const showWidget = !HIDE_WIDGET_PATHS.includes(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div
        className="main-content"
        style={{
          marginLeft: isMobile ? 0 : 240,
          minHeight: "100vh",
          background: "#f0f2f0",
          transition: "margin-left 0.3s ease",
        }}
      >
        {isMobile && <MobileMenuButton onClick={() => setMobileOpen(true)} />}
        {children}
      </div>
      {showWidget && <AIChatWidget />}
    </>
  );
}

function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        zIndex: 90,
        width: 40,
        height: 40,
        borderRadius: 10,
        background: "#fff",
        border: "1px solid #d5d9e2",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}
