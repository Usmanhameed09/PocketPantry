"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box, Eye, EyeOff, UserPlus, AlertCircle, CheckCircle2,
  Monitor, TrendingUp, Brain, BarChart3,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function SignupPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const passwordChecks = [
    { label: "At least 8 characters", met: form.password.length >= 8 },
    { label: "Contains a number", met: /\d/.test(form.password) },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(form.password) },
  ];

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!passwordChecks.every((c) => c.met)) {
      setError("Password does not meet all requirements.");
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));

    localStorage.setItem("pp_user", JSON.stringify({
      email: form.email,
      name: form.name,
      role: "Operator",
      loggedInAt: new Date().toISOString(),
    }));

    router.push("/");
    setLoading(false);
  }

  return (
    <div className="auth-layout" style={{ display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: "100vh" }}>

      {/* ===== LEFT PANEL — Branding ===== */}
      <div className="auth-left-panel" style={{
        width: isMobile ? "100%" : "45%", minHeight: isMobile ? "auto" : "100vh",
        background: "linear-gradient(160deg, #070d15 0%, #0c1a2e 40%, #132f52 70%, #1a3f6f 100%)",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: isMobile ? "32px 24px" : "60px 56px", position: "relative", overflow: "hidden",
      }}>
        {/* Background glow effects */}
        <div style={{
          position: "absolute", top: -120, right: -120, width: 350, height: 350,
          background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: -80, width: 280, height: 280,
          background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 48 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(37,99,235,0.35)",
          }}>
            <Box size={24} color="white" />
          </div>
          <div>
            <div style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>PocketPantry</div>
            <div style={{ color: "#475569", fontSize: 10, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase" as const }}>Vending</div>
          </div>
        </div>

        {/* Headline */}
        <h1 className="auth-headline" style={{
          color: "#f1f5f9", fontSize: 38, fontWeight: 800, lineHeight: 1.15,
          letterSpacing: -1, marginBottom: 16, maxWidth: 380,
        }}>
          Start managing<br />
          <span style={{ color: "#60a5fa" }}>smarter.</span>
        </h1>
        <p className="auth-subtitle" style={{ color: "#64748b", fontSize: 15, lineHeight: 1.7, maxWidth: 360, marginBottom: 40 }}>
          Join PocketPantry and get AI-powered tools to monitor machines, optimize pricing, and maximize your vending revenue.
        </p>

        {/* Feature pills */}
        <div className="auth-features" style={{ display: isMobile ? "none" : "flex", flexDirection: "column", gap: 14 }}>
          {[
            { icon: Monitor, label: "Real-time machine monitoring", color: "#3b82f6" },
            { icon: TrendingUp, label: "Sales analytics & predictions", color: "#10b981" },
            { icon: Brain, label: "AI-powered product optimization", color: "#8b5cf6" },
            { icon: BarChart3, label: "Automated reporting & alerts", color: "#f59e0b" },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "10px 0",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${f.color}18`, border: `1px solid ${f.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Icon size={17} color={f.color} />
                </div>
                <span style={{ color: "#94a3b8", fontSize: 14, fontWeight: 500 }}>{f.label}</span>
              </div>
            );
          })}
        </div>

        {/* Bottom stats */}
        <div className="auth-stats" style={{
          display: isMobile ? "none" : "flex", gap: 32, marginTop: 48, paddingTop: 28,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          {[
            { value: "8", label: "Machines" },
            { value: "24.8K", label: "Transactions" },
            { value: "99.2%", label: "Uptime" },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800 }}>{s.value}</div>
              <div style={{ color: "#475569", fontSize: 12, fontWeight: 500, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== RIGHT PANEL — Signup Form ===== */}
      <div className="auth-right-panel" style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        background: "#f8fafc", padding: isMobile ? "24px" : "40px",
      }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: -0.5, marginBottom: 6 }}>
            Create account
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 32 }}>
            Set up your account to start managing operations
          </p>

          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca",
              borderRadius: 12, marginBottom: 20, fontSize: 13, fontWeight: 500, color: "#dc2626",
            }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSignup}>
            {/* Full Name */}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Full name</label>
              <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)}
                placeholder="Arthur Baker" required style={inputStyle}
                onFocus={focusInput} onBlur={blurInput} />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Email address</label>
              <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
                placeholder="you@company.com" required style={inputStyle}
                onFocus={focusInput} onBlur={blurInput} />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPassword ? "text" : "password"} value={form.password}
                  onChange={(e) => update("password", e.target.value)} placeholder="Create a password"
                  required style={{ ...inputStyle, paddingRight: 48 }}
                  onFocus={focusInput} onBlur={blurInput} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeBtnStyle}>
                  {showPassword ? <EyeOff size={18} color="#94a3b8" /> : <Eye size={18} color="#94a3b8" />}
                </button>
              </div>
            </div>

            {/* Password strength */}
            {form.password.length > 0 && (
              <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 5 }}>
                {passwordChecks.map((c, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 7,
                    fontSize: 12, fontWeight: 500,
                    color: c.met ? "#059669" : "#94a3b8",
                  }}>
                    <CheckCircle2 size={14} color={c.met ? "#059669" : "#d1d5db"} />
                    {c.label}
                  </div>
                ))}
              </div>
            )}

            {/* Confirm Password */}
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>Confirm password</label>
              <div style={{ position: "relative" }}>
                <input type={showConfirm ? "text" : "password"} value={form.confirm}
                  onChange={(e) => update("confirm", e.target.value)} placeholder="Confirm your password"
                  required style={{ ...inputStyle, paddingRight: 48 }}
                  onFocus={focusInput} onBlur={blurInput} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={eyeBtnStyle}>
                  {showConfirm ? <EyeOff size={18} color="#94a3b8" /> : <Eye size={18} color="#94a3b8" />}
                </button>
              </div>
            </div>

            {/* Terms */}
            <label style={{
              display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#475569",
              cursor: "pointer", marginBottom: 24, fontWeight: 500, lineHeight: 1.5,
            }}>
              <input type="checkbox" required style={{
                width: 18, height: 18, accentColor: "#2563eb", borderRadius: 4, cursor: "pointer",
                marginTop: 2, flexShrink: 0,
              }} />
              I agree to the Terms of Service and Privacy Policy
            </label>

            {/* Submit */}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "13px", borderRadius: 12,
              background: loading ? "#93c5fd" : "#2563eb",
              color: "#fff", border: "none", fontSize: 15, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 4px 14px rgba(37,99,235,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
              letterSpacing: -0.2,
            }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff", borderRadius: "50%",
                    display: "inline-block", animation: "spin 0.6s linear infinite",
                  }} />
                  Creating account...
                </span>
              ) : (
                <><UserPlus size={18} /> Create Account</>
              )}
            </button>
          </form>

          {/* Login link */}
          <div style={{ textAlign: "center", marginTop: 28, fontSize: 14, color: "#64748b" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 7,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 16px", fontSize: 14,
  border: "2px solid #e2e8f0", borderRadius: 12,
  outline: "none", color: "#0f172a", fontWeight: 500,
  background: "#fff", boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const eyeBtnStyle: React.CSSProperties = {
  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer", padding: 0,
};

function focusInput(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = "#2563eb";
  e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.08)";
}

function blurInput(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = "#e2e8f0";
  e.target.style.boxShadow = "none";
}
