"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  User,
  Mail,
  Shield,
  Bell,
  Key,
  LogOut,
  Camera,
  Save,
  Clock,
  Monitor,
  MapPin,
  Phone,
  CheckCircle2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UserProfile {
  name: string;
  email: string;
  role: string;
  phone: string;
  company: string;
  location: string;
  loggedInAt: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProfilePage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [tab, setTab] = useState<"profile" | "notifications" | "security">("profile");
  const [saved, setSaved] = useState(false);

  const [profile, setProfile] = useState<UserProfile>({
    name: "Arthur B.",
    email: "arthur@pocketpantry.com",
    role: "Operator",
    phone: "(713) 555-0100",
    company: "PocketPantry Vending",
    location: "Houston, TX",
    loggedInAt: "",
  });

  const [notifications, setNotifications] = useState({
    machineAlerts: true,
    lowInventory: true,
    dailyReport: true,
    priceChanges: true,
    pipelineUpdates: false,
    weeklyDigest: true,
  });

  // Load user from localStorage if available
  useEffect(() => {
    const stored = localStorage.getItem("pp_user");
    if (stored) {
      const user = JSON.parse(stored);
      setProfile((prev) => ({
        ...prev,
        name: user.name || prev.name,
        email: user.email || prev.email,
        role: user.role || prev.role,
        loggedInAt: user.loggedInAt || "",
      }));
    }
  }, []);

  function handleSave() {
    localStorage.setItem("pp_user", JSON.stringify({
      email: profile.email,
      name: profile.name,
      role: profile.role,
      loggedInAt: profile.loggedInAt,
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleLogout() {
    localStorage.removeItem("pp_user");
    router.push("/login");
  }

  const initials = profile.name.split(" ").map((n) => n[0]).join("").toUpperCase();

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Profile" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px", maxWidth: 900, margin: "0 auto" }}>
        {/* Profile Header Card */}
        <div className="profile-header" style={{
          background: "linear-gradient(135deg, #0c1520 0%, #1e3a5f 100%)",
          borderRadius: 16, padding: "28px 32px", marginBottom: 24,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexDirection: isMobile ? "column" : "row",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ position: "relative" }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 24, fontWeight: 800,
                boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
                border: "3px solid rgba(255,255,255,0.2)",
              }}>
                {initials}
              </div>
              <div style={{
                position: "absolute", bottom: 0, right: 0, width: 24, height: 24,
                borderRadius: "50%", background: "#2563eb", border: "2px solid #1e3a5f",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}>
                <Camera size={12} color="#fff" />
              </div>
            </div>
            <div>
              <div style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>{profile.name}</div>
              <div style={{ color: "rgba(148,163,184,0.8)", fontSize: 14, marginTop: 2 }}>{profile.email}</div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                marginTop: 8, padding: "4px 12px", borderRadius: 20,
                background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)",
                color: "#93c5fd", fontSize: 12, fontWeight: 600,
              }}>
                <Shield size={12} /> {profile.role}
              </div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "10px 18px",
            background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)",
            borderRadius: 10, color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>

        {/* Tabs */}
        <div className="tab-bar" style={{ display: "flex", gap: 0, borderBottom: "2px solid #d5d9e2", marginBottom: 24 }}>
          {([
            { key: "profile" as const, label: "Profile Details", icon: User },
            { key: "notifications" as const, label: "Notifications", icon: Bell },
            { key: "security" as const, label: "Security", icon: Key },
          ]).map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 22px", fontSize: 14, fontWeight: 600, border: "none",
                cursor: "pointer", background: "transparent",
                color: tab === t.key ? "#2563eb" : "#94a3b8",
                borderBottom: tab === t.key ? "2px solid #2563eb" : "2px solid transparent",
                marginBottom: -2, transition: "all 0.15s",
              }}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* ========== PROFILE TAB ========== */}
        {tab === "profile" && (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            padding: "28px 32px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Personal Information</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Update your profile details</div>

            <div className="profile-form-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 16 }}>
              <ProfileField icon={<User size={16} color="#64748b" />} label="Full Name" value={profile.name}
                onChange={(v) => setProfile({ ...profile, name: v })} />
              <ProfileField icon={<Mail size={16} color="#64748b" />} label="Email" value={profile.email}
                onChange={(v) => setProfile({ ...profile, email: v })} type="email" />
              <ProfileField icon={<Phone size={16} color="#64748b" />} label="Phone" value={profile.phone}
                onChange={(v) => setProfile({ ...profile, phone: v })} />
              <ProfileField icon={<Shield size={16} color="#64748b" />} label="Role" value={profile.role}
                onChange={() => {}} disabled />
              <ProfileField icon={<Monitor size={16} color="#64748b" />} label="Company" value={profile.company}
                onChange={(v) => setProfile({ ...profile, company: v })} />
              <ProfileField icon={<MapPin size={16} color="#64748b" />} label="Location" value={profile.location}
                onChange={(v) => setProfile({ ...profile, location: v })} />
            </div>

            {/* Operator Stats */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Operator Stats</div>
              <div className="mini-stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 12 }}>
                <MiniStat label="Machines Managed" value="8" />
                <MiniStat label="Total Products" value="10" />
                <MiniStat label="Active Campaigns" value="2" />
                <MiniStat label="Pipeline Leads" value="10" />
              </div>
            </div>

            {/* Save */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24 }}>
              <button onClick={handleSave} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "11px 24px",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: "pointer", boxShadow: "0 3px 10px rgba(37,99,235,0.25)",
              }}>
                <Save size={16} /> Save Changes
              </button>
              {saved && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#059669", fontWeight: 600 }}>
                  <CheckCircle2 size={16} /> Saved successfully
                </span>
              )}
            </div>
          </div>
        )}

        {/* ========== NOTIFICATIONS TAB ========== */}
        {tab === "notifications" && (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            padding: "28px 32px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Notification Preferences</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Choose what alerts you want to receive</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <NotifToggle label="Machine Alerts" desc="Get notified when a machine goes offline or has connection issues"
                checked={notifications.machineAlerts} onChange={(v) => setNotifications({ ...notifications, machineAlerts: v })} />
              <NotifToggle label="Low Inventory Alerts" desc="Notification when warehouse stock drops below threshold"
                checked={notifications.lowInventory} onChange={(v) => setNotifications({ ...notifications, lowInventory: v })} />
              <NotifToggle label="Daily Sales Report" desc="Receive a daily summary of sales across all machines"
                checked={notifications.dailyReport} onChange={(v) => setNotifications({ ...notifications, dailyReport: v })} />
              <NotifToggle label="Price Change Alerts" desc="Get notified when supplier prices change"
                checked={notifications.priceChanges} onChange={(v) => setNotifications({ ...notifications, priceChanges: v })} />
              <NotifToggle label="Pipeline Updates" desc="Notifications for new lead responses and AI call outcomes"
                checked={notifications.pipelineUpdates} onChange={(v) => setNotifications({ ...notifications, pipelineUpdates: v })} />
              <NotifToggle label="Weekly Digest" desc="Weekly summary email with key metrics and recommendations"
                checked={notifications.weeklyDigest} onChange={(v) => setNotifications({ ...notifications, weeklyDigest: v })} />
            </div>
          </div>
        )}

        {/* ========== SECURITY TAB ========== */}
        {tab === "security" && (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            padding: "28px 32px", boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Security Settings</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Manage your password and session</div>

            {/* Change Password */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Change Password</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
                <PasswordField label="Current Password" />
                <PasswordField label="New Password" />
                <PasswordField label="Confirm New Password" />
                <button style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 20px",
                  background: "#2563eb", color: "#fff", border: "none", borderRadius: 10,
                  fontSize: 13, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start",
                  boxShadow: "0 2px 8px rgba(37,99,235,0.2)",
                }}>
                  <Key size={14} /> Update Password
                </button>
              </div>
            </div>

            {/* Session Info */}
            <div style={{ paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>Active Session</div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", background: "#f1f5f9", borderRadius: 10,
                border: "1px solid #e2e8f0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: "#dbeafe",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Monitor size={18} color="#2563eb" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Current Session</div>
                    <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={11} />
                      {profile.loggedInAt
                        ? `Logged in ${new Date(profile.loggedInAt).toLocaleString()}`
                        : "Active session"
                      }
                    </div>
                  </div>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 10, background: "#d1fae5",
                  color: "#059669", fontSize: 11, fontWeight: 700,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#059669" }} />
                  Active
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function ProfileField({ icon, label, value, onChange, type = "text", disabled }: {
  icon: React.ReactNode; label: string; value: string;
  onChange: (v: string) => void; type?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
        {icon} {label}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        style={{
          width: "100%", padding: "10px 14px", fontSize: 14,
          border: "1px solid #d5d9e2", borderRadius: 10,
          outline: "none", color: disabled ? "#94a3b8" : "#0f172a", fontWeight: 500,
          background: disabled ? "#f1f5f9" : "#fff", boxSizing: "border-box",
          cursor: disabled ? "not-allowed" : "text",
        }} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      textAlign: "center", padding: "14px 12px",
      background: "#f1f5f9", borderRadius: 10, border: "1px solid #e2e8f0",
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function NotifToggle({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 0", borderBottom: "1px solid #f1f5f9",
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{label}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{desc}</div>
      </div>
      <label style={{ position: "relative", width: 44, height: 24, cursor: "pointer" }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
        <div style={{
          width: 44, height: 24, borderRadius: 12,
          background: checked ? "#2563eb" : "#cbd5e1",
          transition: "background 0.2s",
          position: "relative",
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            position: "absolute", top: 3,
            left: checked ? 23 : 3,
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }} />
        </div>
      </label>
    </div>
  );
}

function PasswordField({ label }: { label: string }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{label}</label>
      <input type="password" placeholder={label}
        style={{
          width: "100%", padding: "10px 14px", fontSize: 14,
          border: "1px solid #d5d9e2", borderRadius: 10,
          outline: "none", color: "#0f172a", fontWeight: 500,
          background: "#fff", boxSizing: "border-box",
        }} />
    </div>
  );
}
