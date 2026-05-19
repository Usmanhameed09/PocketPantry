"use client";

/**
 * Shared UI primitives for the inventory module pages.
 * Inline-style design language matching the existing /inventory page —
 * rounded cards, green primary actions, subtle borders.
 */

import { Loader2 } from "lucide-react";

export const PAGE_BG = "#f8fafc";

export const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #d5d9e2",
  boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
};

export function StatCard({
  icon, iconBg, iconColor, label, value, sub, onClick,
}: {
  icon: React.ReactNode; iconBg: string; iconColor: string;
  label: string; value: React.ReactNode; sub?: string; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      ...CARD, padding: 18, display: "flex", alignItems: "center", gap: 14,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <span style={{ color: iconColor, display: "flex" }}>{icon}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export function Th({ children, align = "left", width }: {
  children?: React.ReactNode; align?: "left" | "right" | "center"; width?: number | string;
}) {
  return (
    <th style={{
      padding: "12px 14px", textAlign: align, fontWeight: 600,
      fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5,
      width, background: "#f8fafc",
    }}>{children}</th>
  );
}

export function Td({ children, align = "left", mono = false, bold = false, color }: {
  children: React.ReactNode; align?: "left" | "right" | "center";
  mono?: boolean; bold?: boolean; color?: string;
}) {
  return (
    <td style={{
      padding: "12px 14px", textAlign: align,
      color: color || "#0f172a",
      fontFamily: mono ? "'JetBrains Mono', ui-monospace, monospace" : undefined,
      fontSize: 14, fontWeight: bold ? 700 : 400,
    }}>{children}</td>
  );
}

export function EmptyState({ icon, title, message, action }: {
  icon?: React.ReactNode; title: string; message?: string; action?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      {icon && <div style={{ marginBottom: 12, opacity: 0.6 }}>{icon}</div>}
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{title}</h3>
      {message && <p style={{ fontSize: 14, color: "#64748b", maxWidth: 420, margin: "0 auto 16px" }}>{message}</p>}
      {action}
    </div>
  );
}

export function LoadingBox() {
  return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <Loader2 size={32} color="#16a34a" style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function Modal({ children, onClose, title, maxWidth = 440 }: {
  children: React.ReactNode; onClose: () => void; title: string; maxWidth?: number;
}) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100,
      backdropFilter: "blur(4px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 14, padding: 24, maxWidth, width: "100%",
        boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, type = "number", placeholder }: {
  label: string; value: string | number;
  onChange: (v: string) => void; type?: "text" | "number"; placeholder?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>{label}</span>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", marginTop: 4, padding: "9px 12px",
          border: "1px solid #d5d9e2", borderRadius: 8, fontSize: 14,
          outline: "none",
        }}
      />
    </label>
  );
}

export function Select({ label, value, options, onChange }: {
  label: string; value: string; options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        width: "100%", marginTop: 4, padding: "9px 12px",
        border: "1px solid #d5d9e2", borderRadius: 8, fontSize: 14, background: "#fff", outline: "none",
      }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function BtnPrimary({ children, onClick, disabled, fullWidth }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "10px 20px", background: disabled ? "#86efac" : "#16a34a", color: "#fff",
      border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", width: fullWidth ? "100%" : undefined,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      transition: "background 0.15s",
    }}>{children}</button>
  );
}

export function BtnSecondary({ children, onClick, disabled }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "10px 18px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0",
      borderRadius: 10, fontSize: 14, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      display: "inline-flex", alignItems: "center", gap: 8,
    }}>{children}</button>
  );
}

export function BtnDanger({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 18px", background: "#fef2f2", color: "#dc2626",
      border: "1px solid #fecaca", borderRadius: 10, fontSize: 14, fontWeight: 600,
      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
    }}>{children}</button>
  );
}

export function Badge({ children, color = "gray" }: {
  children: React.ReactNode;
  color?: "gray" | "green" | "amber" | "red" | "blue" | "indigo";
}) {
  const colors: Record<string, { bg: string; fg: string }> = {
    gray: { bg: "#f1f5f9", fg: "#475569" },
    green: { bg: "#dcfce7", fg: "#15803d" },
    amber: { bg: "#fef3c7", fg: "#92400e" },
    red: { bg: "#fee2e2", fg: "#b91c1c" },
    blue: { bg: "#dbeafe", fg: "#1d4ed8" },
    indigo: { bg: "#ede9fe", fg: "#5b21b6" },
  };
  const c = colors[color];
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 999,
      background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.4,
    }}>{children}</span>
  );
}

export function pageContainer(isMobile: boolean): React.CSSProperties {
  return { padding: isMobile ? 16 : "24px 32px" };
}
