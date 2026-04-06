"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Save, X } from "lucide-react";
import type { OutreachTemplateMap, OutreachTemplateStage } from "@/lib/outreach-template-store";

const STAGE_OPTIONS: { key: OutreachTemplateStage; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "follow_up_1", label: "Follow-up 1" },
  { key: "follow_up_2", label: "Follow-up 2" },
];

export default function EmailTemplatesModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeStage, setActiveStage] = useState<OutreachTemplateStage>("primary");
  const [templates, setTemplates] = useState<OutreachTemplateMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      try {
        const res = await fetch("/api/outreach/templates");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load templates.");
        }

        if (!cancelled) {
          setTemplates(data.templates);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load templates.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateTemplateField = (field: "subject" | "body", value: string) => {
    setTemplates((current) => {
      if (!current) return current;
      return {
        ...current,
        [activeStage]: {
          ...current[activeStage],
          [field]: value,
        },
      };
    });
  };

  const saveTemplates = async () => {
    if (!templates) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/outreach/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save templates.");
      }

      setTemplates(data.templates);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save templates.");
    } finally {
      setSaving(false);
    }
  };

  const activeTemplate = templates?.[activeStage];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1300,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(920px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #d5d9e2",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#ede9fe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Mail size={18} color="#7c3aed" />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Email Templates</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                These templates are used when outreach emails are triggered automatically.
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="#94a3b8" />
          </button>
        </div>

        <div style={{ padding: "18px 22px" }}>
          {error && (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 14px",
                background: "#fef2f2",
                color: "#991b1b",
                borderRadius: 8,
                fontSize: 12,
                border: "1px solid #fecaca",
              }}
            >
              {error}
            </div>
          )}

          {loading || !templates ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#64748b", fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
              <div>Loading templates...</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {STAGE_OPTIONS.map((stage) => (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => setActiveStage(stage.key)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: activeStage === stage.key ? "2px solid #16a34a" : "1px solid #d5d9e2",
                      background: activeStage === stage.key ? "#dcfce7" : "#fff",
                      color: activeStage === stage.key ? "#166534" : "#374151",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  marginBottom: 14,
                  padding: "12px 14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#475569",
                  lineHeight: 1.6,
                }}
              >
                Available variables: <code>{"{{contactFirstName}}"}</code>, <code>{"{{contactName}}"}</code>,{" "}
                <code>{"{{businessName}}"}</code>, <code>{"{{senderName}}"}</code>, <code>{"{{contactPhone}}"}</code>,{" "}
                <code>{"{{replyToEmail}}"}</code>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Subject
                </label>
                <input
                  value={activeTemplate?.subject || ""}
                  onChange={(e) => updateTemplateField("subject", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 13,
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Body
                </label>
                <textarea
                  value={activeTemplate?.body || ""}
                  onChange={(e) => updateTemplateField("body", e.target.value)}
                  rows={16}
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: 13,
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    outline: "none",
                    boxSizing: "border-box",
                    resize: "vertical",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    lineHeight: 1.5,
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "10px 18px",
                    background: "#fff",
                    color: "#374151",
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={saveTemplates}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 18px",
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving...</> : <><Save size={14} /> Save Templates</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
