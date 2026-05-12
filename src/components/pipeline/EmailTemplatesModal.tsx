"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Plus, Save, Trash2, X } from "lucide-react";
import {
  createFollowUpTemplate,
  type OutreachTemplateMap,
  type OutreachTemplateStage,
} from "@/lib/outreach-template-model";

export default function EmailTemplatesModal({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
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
          setTemplates(data.templates as OutreachTemplateMap);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load templates.";
        if (!cancelled) {
          setError(message);
          onError(message);
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
  }, [onError]);

  const activeTemplate = useMemo(
    () => templates?.stages.find((stage) => stage.id === activeStage) || null,
    [activeStage, templates]
  );

  const updateStageField = (field: "subject" | "body" | "delayDays", value: string) => {
    setTemplates((current) => {
      if (!current) return current;
      return {
        ...current,
        stages: current.stages.map((stage) =>
          stage.id === activeStage
            ? {
                ...stage,
                [field]: field === "delayDays" ? Math.max(1, Number(value) || 1) : value,
              }
            : stage
        ),
      };
    });
  };

  const updateSignatureField = (
    field: keyof OutreachTemplateMap["signature"],
    value: string | boolean
  ) => {
    setTemplates((current) => {
      if (!current) return current;
      return {
        ...current,
        signature: {
          ...current.signature,
          [field]: value,
        },
      };
    });
  };

  const addFollowUp = () => {
    setTemplates((current) => {
      if (!current) return current;
      const next = createFollowUpTemplate(current);
      const newest = next.stages[next.stages.length - 1];
      setActiveStage(newest.id);
      return next;
    });
  };

  const removeActiveStage = () => {
    setTemplates((current) => {
      if (!current || activeStage === "primary") return current;
      const remaining = current.stages.filter((stage) => stage.id !== activeStage);
      setActiveStage(remaining[0]?.id || "primary");
      return {
        ...current,
        stages: remaining,
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

      setTemplates(data.templates as OutreachTemplateMap);
      onSaved("Email templates updated. New triggered emails will use the latest workflow and signature.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Failed to save templates.";
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

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
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(1040px, 100%)",
          maxHeight: "92vh",
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
                background: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Mail size={18} color="#166534" />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Email Templates</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Edit the outreach workflow, add or remove follow-ups, and attach a personalized signature block to every email.
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
                {templates.stages.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setActiveStage(stage.id)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: activeStage === stage.id ? "1px solid #16a34a" : "1px solid #d5d9e2",
                      background: activeStage === stage.id ? "#dcfce7" : "#fff",
                      color: activeStage === stage.id ? "#166534" : "#475569",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {stage.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addFollowUp}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: "1px dashed #16a34a",
                    background: "#f0fdf4",
                    color: "#166534",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={14} />
                  Add Follow-up
                </button>
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
                <code>{"{{replyToEmail}}"}</code>, <code>{"{{signatureBlock}}"}</code>
              </div>

              {activeTemplate && (
                <div
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 18,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{activeTemplate.label}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                        {activeTemplate.id === "primary"
                          ? "This is the first outreach email."
                          : `This follow-up sends ${activeTemplate.delayDays || 0} day(s) after the previous email in the workflow.`}
                      </div>
                    </div>
                    {activeTemplate.id !== "primary" && (
                      <button
                        type="button"
                        onClick={removeActiveStage}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 12px",
                          background: "#fff",
                          color: "#b91c1c",
                          border: "1px solid #fecaca",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    )}
                  </div>

                  {activeTemplate.id !== "primary" && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                        Delay After Previous Email
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={activeTemplate.delayDays || 1}
                        onChange={(event) => updateStageField("delayDays", event.target.value)}
                        style={{
                          width: 140,
                          padding: "10px 12px",
                          fontSize: 13,
                          border: "1px solid #d5d9e2",
                          borderRadius: 8,
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                      Subject
                    </label>
                    <input
                      value={activeTemplate.subject}
                      onChange={(event) => updateStageField("subject", event.target.value)}
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
                      value={activeTemplate.body}
                      onChange={(event) => updateStageField("body", event.target.value)}
                      rows={14}
                      style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: 13,
                        border: "1px solid #d5d9e2",
                        borderRadius: 8,
                        outline: "none",
                        boxSizing: "border-box",
                        resize: "vertical",
                        lineHeight: 1.6,
                      }}
                    />
                  </div>
                </div>
              )}

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                  padding: 16,
                  background: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Personalized Signature</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      This signature block appears wherever <code>{"{{signatureBlock}}"}</code> is used in the email body.
                    </div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#374151", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={templates.signature.enabled}
                      onChange={(event) => updateSignatureField("enabled", event.target.checked)}
                    />
                    Enable signature block
                  </label>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                    Signature Mode
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { key: "custom_html", label: "WiseStamp / HTML" },
                      { key: "structured", label: "Simple Fields" },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => updateSignatureField("mode", option.key as "structured" | "custom_html")}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 999,
                          border: templates.signature.mode === option.key ? "1px solid #16a34a" : "1px solid #d5d9e2",
                          background: templates.signature.mode === option.key ? "#dcfce7" : "#fff",
                          color: templates.signature.mode === option.key ? "#166534" : "#475569",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {templates.signature.mode === "custom_html" ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                        Signature HTML
                      </label>
                      <textarea
                        value={templates.signature.customHtml}
                        onChange={(event) => updateSignatureField("customHtml", event.target.value)}
                        rows={8}
                        placeholder="<table>... your WiseStamp signature HTML ...</table>"
                        style={{
                          width: "100%",
                          padding: "12px",
                          fontSize: 13,
                          border: "1px solid #d5d9e2",
                          borderRadius: 8,
                          outline: "none",
                          boxSizing: "border-box",
                          resize: "vertical",
                          lineHeight: 1.5,
                          background: "#fff",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      />
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                        Paste the WiseStamp HTML snippet here. Template variables like <code>{"{{senderName}}"}</code> still work inside it.
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                        Plain Text Fallback
                      </label>
                      <textarea
                        value={templates.signature.textFallback}
                        onChange={(event) => updateSignatureField("textFallback", event.target.value)}
                        rows={4}
                        style={{
                          width: "100%",
                          padding: "12px",
                          fontSize: 13,
                          border: "1px solid #d5d9e2",
                          borderRadius: 8,
                          outline: "none",
                          boxSizing: "border-box",
                          resize: "vertical",
                          lineHeight: 1.5,
                          background: "#fff",
                        }}
                      />
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                        Used for plain-text email clients when HTML signatures are not rendered.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                    {[
                      { key: "fullName", label: "Full Name" },
                      { key: "title", label: "Title" },
                      { key: "company", label: "Company" },
                      { key: "phone", label: "Phone" },
                      { key: "email", label: "Email" },
                      { key: "photoUrl", label: "Photo URL" },
                    ].map((field) => (
                      <div key={field.key}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                          {field.label}
                        </label>
                        <input
                          value={templates.signature[field.key as keyof typeof templates.signature] as string}
                          onChange={(event) => updateSignatureField(field.key as keyof typeof templates.signature, event.target.value)}
                          placeholder={field.key === "photoUrl" ? "https://..." : ""}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            fontSize: 13,
                            border: "1px solid #d5d9e2",
                            borderRadius: 8,
                            outline: "none",
                            boxSizing: "border-box",
                            background: "#fff",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
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
