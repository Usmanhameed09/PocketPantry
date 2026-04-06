"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  FileSpreadsheet,
  Loader2,
  PhoneCall,
  Upload,
  X,
} from "lucide-react";

type LeadSource = "Manual" | "Excel Import" | "Google Maps";

type Lead = {
  id: string;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  distance: string;
  businessType: string;
  source: LeadSource;
};

type ExcelLeadCandidate = {
  rowNumber: number;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  businessType: string;
  source: LeadSource;
  importable: boolean;
  reason?: string;
};

type ImportResponse = {
  ok: boolean;
  importedCount: number;
  skippedCount: number;
  imported: { id: string; business: string }[];
  skipped: { business: string; reason: string }[];
};

const HEADER_SYNONYMS = {
  business: [
    "business",
    "business name",
    "company",
    "company name",
    "organization",
    "organisation",
    "facility",
    "location",
    "site name",
  ],
  contact: [
    "contact",
    "contact name",
    "person",
    "person name",
    "full name",
    "name",
    "decision maker",
    "owner",
    "manager",
  ],
  phone: [
    "phone",
    "phone number",
    "telephone",
    "mobile",
    "cell",
    "business phone",
    "contact number",
    "tel",
  ],
  email: ["email", "email address", "mail", "contact email"],
  address: ["address", "street address", "location address", "full address", "street"],
  businessType: ["business type", "type", "industry", "category", "vertical", "segment"],
} satisfies Record<string, string[]>;

function normalizeText(value?: string) {
  return (value || "").trim().toLowerCase();
}

function normalizePhoneDigits(value?: string) {
  return (value || "").replace(/\D/g, "");
}

function findHeader(headers: string[], aliases: string[]) {
  const normalizedHeaders = headers.map((header) => normalizeText(header));

  for (const alias of aliases) {
    const exactIndex = normalizedHeaders.findIndex((header) => header === normalizeText(alias));
    if (exactIndex >= 0) {
      return headers[exactIndex];
    }
  }

  for (const alias of aliases) {
    const aliasTokens = normalizeText(alias).split(/\s+/).filter(Boolean);
    const partialIndex = normalizedHeaders.findIndex((header) =>
      aliasTokens.every((token) => header.includes(token))
    );
    if (partialIndex >= 0) {
      return headers[partialIndex];
    }
  }

  return undefined;
}

function mapExcelRows(rows: Record<string, unknown>[]) {
  const headers = Array.from(
    new Set(
      rows.flatMap((row) => Object.keys(row || {})).filter(Boolean)
    )
  );

  const mapping = {
    business: findHeader(headers, HEADER_SYNONYMS.business),
    contact: findHeader(headers, HEADER_SYNONYMS.contact),
    phone: findHeader(headers, HEADER_SYNONYMS.phone),
    email: findHeader(headers, HEADER_SYNONYMS.email),
    address: findHeader(headers, HEADER_SYNONYMS.address),
    businessType: findHeader(headers, HEADER_SYNONYMS.businessType),
  };

  const candidates: ExcelLeadCandidate[] = rows.map((row, index) => {
    const business = String((mapping.business && row[mapping.business]) || "").trim();
    const contact = String((mapping.contact && row[mapping.contact]) || "").trim() || "Front Desk";
    const phone = String((mapping.phone && row[mapping.phone]) || "").trim();
    const email = String((mapping.email && row[mapping.email]) || "").trim();
    const address = String((mapping.address && row[mapping.address]) || "").trim();
    const businessType = String((mapping.businessType && row[mapping.businessType]) || "").trim();

    let reason = "";
    if (!business) reason = "Missing business name";
    if (!phone) reason = reason ? `${reason}; missing phone number` : "Missing phone number";

    return {
      rowNumber: index + 2,
      business,
      contact,
      phone,
      email,
      address,
      businessType,
      source: "Excel Import",
      importable: Boolean(business && phone),
      reason: reason || undefined,
    };
  });

  return { headers, mapping, candidates };
}

function candidateMatchesExistingLead(candidate: ExcelLeadCandidate, leads: Lead[]) {
  const candidateBusiness = normalizeText(candidate.business);
  const candidatePhone = normalizePhoneDigits(candidate.phone);
  const candidateAddress = normalizeText(candidate.address);

  return leads.some((lead) => {
    const sameBusiness = normalizeText(lead.business) === candidateBusiness;
    const samePhone = candidatePhone && normalizePhoneDigits(lead.phone) === candidatePhone;
    const sameAddress = candidateAddress && normalizeText(lead.address) === candidateAddress;
    return sameBusiness && (samePhone || sameAddress);
  });
}

export default function ExcelImportModal({
  existingLeads,
  onClose,
  onImported,
  onError,
}: {
  existingLeads: Lead[];
  onClose: () => void;
  onImported: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [extractCount, setExtractCount] = useState("50");
  const [candidates, setCandidates] = useState<ExcelLeadCandidate[]>([]);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [mappingSummary, setMappingSummary] = useState<Record<string, string | undefined> | null>(null);

  const previewCount = Math.min(
    candidates.length,
    Math.max(0, Number.parseInt(extractCount || "0", 10) || 0)
  );

  const previewCandidates = useMemo(() => candidates.slice(0, previewCount), [candidates, previewCount]);

  const eligiblePreviewCandidates = useMemo(
    () =>
      previewCandidates.filter(
        (candidate) => candidate.importable && !candidateMatchesExistingLead(candidate, existingLeads)
      ),
    [existingLeads, previewCandidates]
  );

  const parseFile = async (file: File) => {
    setLoading(true);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      if (rows.length === 0) {
        throw new Error("The selected file has no rows to import.");
      }

      const mapped = mapExcelRows(rows);
      setFileName(file.name);
      setMappingSummary(mapped.mapping);
      setCandidates(mapped.candidates);
      setExtractCount(String(Math.min(50, mapped.candidates.length)));
      setSelectedRows(
        mapped.candidates
          .slice(0, Math.min(50, mapped.candidates.length))
          .filter((candidate) => candidate.importable && !candidateMatchesExistingLead(candidate, existingLeads))
          .map((candidate) => candidate.rowNumber)
      );
    } catch (parseError) {
      setCandidates([]);
      setSelectedRows([]);
      setMappingSummary(null);
      setFileName("");
      setError(parseError instanceof Error ? parseError.message : "Failed to parse file.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (rowNumber: number) => {
    setSelectedRows((current) =>
      current.includes(rowNumber) ? current.filter((row) => row !== rowNumber) : [...current, rowNumber]
    );
  };

  const selectAllPreview = () => {
    setSelectedRows(eligiblePreviewCandidates.map((candidate) => candidate.rowNumber));
  };

  const clearSelection = () => {
    setSelectedRows([]);
  };

  const importCandidates = async (mode: "selected" | "all", triggerCalls: boolean) => {
    const importList =
      mode === "all"
        ? eligiblePreviewCandidates
        : eligiblePreviewCandidates.filter((candidate) => selectedRows.includes(candidate.rowNumber));

    if (importList.length === 0) {
      setError("Select at least one importable row first.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: importList.map((candidate) => ({
            business: candidate.business,
            contact: candidate.contact,
            phone: candidate.phone,
            email: candidate.email,
            address: candidate.address,
            businessType: candidate.businessType,
            source: "Excel Import",
            contactMethod: "Call",
          })),
        }),
      });

      const data = (await res.json()) as ImportResponse | { error?: string };

      if (!res.ok || !("ok" in data)) {
        throw new Error(("error" in data && data.error) || "Failed to import Excel leads.");
      }

      let calledCount = 0;
      if (triggerCalls) {
        for (const lead of data.imported) {
          const callRes = await fetch("/api/calls/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: lead.id }),
          });
          if (callRes.ok) {
            calledCount += 1;
          }
        }
      }

      const summary = triggerCalls
        ? `Imported ${data.importedCount} Excel lead${data.importedCount === 1 ? "" : "s"} and started ${calledCount} call${calledCount === 1 ? "" : "s"}${data.skippedCount ? `, skipped ${data.skippedCount}` : ""}.`
        : `Imported ${data.importedCount} Excel lead${data.importedCount === 1 ? "" : "s"}${data.skippedCount ? `, skipped ${data.skippedCount}` : ""}.`;

      onImported(summary);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Failed to import Excel leads.";
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
        zIndex: 1250,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1100px, 100%)",
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
                background: "#dbeafe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileSpreadsheet size={18} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Excel Lead Import</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Upload a CSV or XLSX file, preview rows, and import only the batch you want.
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1.5fr) minmax(120px, 0.5fr) auto",
              gap: 12,
              alignItems: "end",
              marginBottom: 16,
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Upload file
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  border: "1px solid #d5d9e2",
                  borderRadius: 8,
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#374151",
                }}
              >
                <Upload size={14} />
                <span>{fileName || "Choose CSV or XLSX file"}</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      parseFile(file);
                    }
                  }}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                How many rows
              </label>
              <input
                value={extractCount}
                onChange={(e) => setExtractCount(e.target.value)}
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

            <button
              type="button"
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Reading...</> : <><FileSpreadsheet size={14} /> Preview Import</>}
            </button>
          </div>

          {mappingSummary && (
            <div
              style={{
                marginBottom: 14,
                padding: "12px 14px",
                borderRadius: 8,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: 12,
                color: "#475569",
                lineHeight: 1.6,
              }}
            >
              <strong>Detected fields:</strong>{" "}
              Business: <code>{mappingSummary.business || "Not found"}</code> · Contact: <code>{mappingSummary.contact || "Not found"}</code> ·
              Phone: <code>{mappingSummary.phone || "Not found"}</code> · Email: <code>{mappingSummary.email || "Not found"}</code> ·
              Address: <code>{mappingSummary.address || "Not found"}</code>
            </div>
          )}

          {candidates.length > 0 && (
            <>
              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                  color: "#475569",
                }}
              >
                Total rows: <strong>{candidates.length}</strong> · Previewing: <strong>{previewCandidates.length}</strong> · Ready to import:{" "}
                <strong>{eligiblePreviewCandidates.length}</strong>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={selectAllPreview}
                  style={{
                    padding: "8px 12px",
                    background: "#fff",
                    color: "#374151",
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Select All Importable
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  style={{
                    padding: "8px 12px",
                    background: "#fff",
                    color: "#374151",
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
                <span style={{ fontSize: 12, color: "#64748b", alignSelf: "center" }}>
                  {selectedRows.length} selected
                </span>
              </div>

              <div
                style={{
                  border: "1px solid #d5d9e2",
                  borderRadius: 10,
                  overflow: "hidden",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 1.8fr 1fr 1.4fr 1.6fr 100px",
                    background: "#f8fafc",
                    borderBottom: "1px solid #e5e7eb",
                    padding: "12px 14px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  <div />
                  <div>Business</div>
                  <div>Phone</div>
                  <div>Email</div>
                  <div>Address</div>
                  <div>Status</div>
                </div>

                <div style={{ maxHeight: "44vh", overflowY: "auto" }}>
                  {previewCandidates.map((candidate) => {
                    const alreadyExists = candidateMatchesExistingLead(candidate, existingLeads);
                    const disabled = !candidate.importable || alreadyExists;
                    const checked = selectedRows.includes(candidate.rowNumber);

                    return (
                      <div
                        key={candidate.rowNumber}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "56px 1.8fr 1fr 1.4fr 1.6fr 100px",
                          padding: "12px 14px",
                          borderBottom: "1px solid #f1f5f9",
                          background: checked ? "#f0fdf4" : "#fff",
                          alignItems: "start",
                        }}
                      >
                        <div>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleSelection(candidate.rowNumber)}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{candidate.business || "Missing business"}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                            Row {candidate.rowNumber} · Contact: {candidate.contact}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: candidate.phone ? "#334155" : "#94a3b8" }}>
                          {candidate.phone || "No phone"}
                        </div>
                        <div style={{ fontSize: 12, color: candidate.email ? "#334155" : "#94a3b8" }}>
                          {candidate.email || "No email"}
                        </div>
                        <div style={{ fontSize: 12, color: candidate.address ? "#475569" : "#94a3b8", lineHeight: 1.5 }}>
                          {candidate.address || "No address"}
                        </div>
                        <div>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              color: alreadyExists ? "#92400e" : candidate.importable ? "#166534" : "#991b1b",
                              background: alreadyExists ? "#fef3c7" : candidate.importable ? "#dcfce7" : "#fef2f2",
                              border: `1px solid ${alreadyExists ? "#fde68a" : candidate.importable ? "#a7f3d0" : "#fecaca"}`,
                            }}
                          >
                            {alreadyExists ? "Duplicate" : candidate.importable ? "Ready" : "Missing data"}
                          </span>
                          {candidate.reason && !alreadyExists && (
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>{candidate.reason}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => importCandidates("selected", false)}
                  disabled={saving}
                  style={{
                    padding: "10px 16px",
                    background: "#fff",
                    color: "#374151",
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  Add Selected
                </button>
                <button
                  type="button"
                  onClick={() => importCandidates("all", false)}
                  disabled={saving}
                  style={{
                    padding: "10px 16px",
                    background: "#fff",
                    color: "#374151",
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  Add All Preview Rows
                </button>
                <button
                  type="button"
                  onClick={() => importCandidates("selected", true)}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Importing...</> : <><PhoneCall size={14} /> Add + Call Selected</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
