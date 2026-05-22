"use client";

import { useState, useRef } from "react";
import { Loader2, Upload, X, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Modal, BtnPrimary, BtnSecondary } from "../ui";

/**
 * CSV bulk-import modal. Accepts pasted CSV text or a .csv file upload.
 * Expected columns (case-insensitive, common synonyms accepted):
 *   barcode | upc | unit upc
 *   name | description | product
 *   case_size | pack | case
 *   category | class
 *   vendor | manufacturer | brand
 *   unit_cost | cost | unit price
 *   default_vend_price | vend price | price
 */
type ImportRow = {
  barcode?: string;
  name?: string;
  case_size?: number;
  category?: string;
  vendor?: string;
  unit_cost?: number;
  default_vend_price?: number;
};

type ImportSummary = {
  total: number; created: number; updated: number;
  attached: number; skipped: number; failed: number;
};

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  barcode: "barcode", upc: "barcode", "unit upc": "barcode", "unit_upc": "barcode",
  name: "name", description: "name", product: "name", "product name": "name",
  case_size: "case_size", pack: "case_size", case: "case_size", "case size": "case_size", units_per_case: "case_size",
  category: "category", class: "category",
  vendor: "vendor", manufacturer: "vendor", brand: "vendor", supplier: "vendor",
  unit_cost: "unit_cost", cost: "unit_cost", "unit cost": "unit_cost", "unit price": "unit_cost",
  default_vend_price: "default_vend_price", "vend price": "default_vend_price", "selling price": "default_vend_price", price: "default_vend_price",
};

function parseCSV(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  // Robust CSV: handle quoted commas
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuote = !inQuote;
      else if (ch === "," && !inQuote) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());
  const cols: (keyof ImportRow | null)[] = headers.map((h) => HEADER_ALIASES[h] || null);

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;
    const row: ImportRow = {};
    for (let j = 0; j < cols.length; j++) {
      const k = cols[j];
      const v = cells[j];
      if (!k || v === undefined || v === "") continue;
      if (k === "case_size") row.case_size = Math.max(1, Math.round(Number(v.replace(/[^\d.]/g, "")) || 1));
      else if (k === "unit_cost" || k === "default_vend_price") {
        const num = Number(String(v).replace(/[^\d.\-]/g, ""));
        if (Number.isFinite(num)) (row as Record<string, unknown>)[k] = num;
      }
      else if (k === "barcode") row.barcode = String(v).replace(/\D/g, "");
      else row[k] = v;
    }
    if (row.name || row.barcode) rows.push(row);
  }
  return rows;
}

export default function BulkImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleParse(text: string) {
    setCsvText(text);
    setRows(parseCSV(text));
    setSummary(null);
    setErrorMsg(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      handleParse(text);
    };
    reader.readAsText(f);
  }

  async function doImport() {
    if (rows.length === 0) return;
    setImporting(true);
    setErrorMsg(null);
    try {
      // Import in batches of 400 for stability
      const BATCH = 400;
      const totals: ImportSummary = { total: 0, created: 0, updated: 0, attached: 0, skipped: 0, failed: 0 };
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const res = await fetch("/api/inventory/products/bulk-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Import failed");
        const s = data.summary || {};
        for (const k of Object.keys(totals) as (keyof ImportSummary)[]) {
          totals[k] += s[k] || 0;
        }
      }
      setSummary(totals);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const preview = rows.slice(0, 5);
  const recognized = rows.filter((r) => r.barcode || r.name).length;

  return (
    <Modal onClose={onClose} title="Bulk import products" maxWidth={720}>
      <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>
        Paste CSV or upload a .csv file. The first row must be headers — common column names auto-mapped
        (barcode/UPC, name/description, case_size/pack, category, vendor/manufacturer, unit_cost/price).
        Re-running is safe — existing barcodes are updated, new ones created, name matches get the barcode attached.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: "8px 14px", fontSize: 13, fontWeight: 600,
            background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0",
            borderRadius: 8, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
          <Upload size={14} /> Upload .csv file
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
        <span style={{ fontSize: 12, color: "#94a3b8", alignSelf: "center" }}>or paste below ↓</span>
      </div>

      <textarea
        rows={6}
        value={csvText}
        placeholder={'barcode,name,case_size,category,vendor,unit_cost\n00068274360176,Nestle Pure Life Water,6,Drinks,BlueTriton,2.58\n...'}
        onChange={(e) => handleParse(e.target.value)}
        style={{
          width: "100%", padding: "10px 12px", border: "1px solid #d5d9e2", borderRadius: 8,
          fontSize: 12, fontFamily: "ui-monospace, monospace", outline: "none", resize: "vertical",
        }}
      />

      {rows.length > 0 && !summary && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            <FileText size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            {recognized} rows ready · preview (first 5):
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8fafc", textAlign: "left" }}>
                <th style={{ padding: "6px 10px" }}>Barcode</th>
                <th style={{ padding: "6px 10px" }}>Name</th>
                <th style={{ padding: "6px 10px" }}>Case</th>
                <th style={{ padding: "6px 10px" }}>Vendor</th>
                <th style={{ padding: "6px 10px" }}>Cost</th>
              </tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "6px 10px", fontFamily: "ui-monospace, monospace" }}>{r.barcode || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{r.name || "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{r.case_size ?? "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{r.vendor || "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{r.unit_cost != null ? `$${r.unit_cost}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary && (
        <div style={{
          marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "#f0fdf4",
          border: "1px solid #bbf7d0", color: "#15803d",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={16} /> Imported {summary.total} rows
          </div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
            Created: <b>{summary.created}</b> · Updated: <b>{summary.updated}</b> · Attached barcode to existing: <b>{summary.attached}</b>
            {summary.skipped > 0 && <> · Skipped: <b>{summary.skipped}</b></>}
            {summary.failed > 0 && <span style={{ color: "#dc2626" }}> · Failed: <b>{summary.failed}</b></span>}
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{
          marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#fef2f2",
          border: "1px solid #fecaca", color: "#dc2626", fontSize: 13,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <BtnSecondary onClick={summary ? () => { onDone(); onClose(); } : onClose}>
          <X size={14} /> {summary ? "Close" : "Cancel"}
        </BtnSecondary>
        {!summary && (
          <BtnPrimary onClick={doImport} disabled={importing || rows.length === 0}>
            {importing ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={16} />}
            Import {rows.length} rows
          </BtnPrimary>
        )}
      </div>
    </Modal>
  );
}
