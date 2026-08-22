"use client";

/**
 * Receipt Import — upload a store receipt (PDF or photo), the AI parses the
 * line items and auto-matches them to the operator's products, the operator
 * REVIEWS (fix matches, edit units, choose cost updates), then one click adds
 * everything to warehouse stock. Kills the manual per-product stock entry.
 */

import { useState, useRef } from "react";
import { Loader2, FileUp, Check, X, AlertCircle } from "lucide-react";
import { Modal, BtnPrimary, BtnSecondary } from "./ui";

type Candidate = { id: string; name: string; units90: number };
type ParsedLine = {
  rawName: string;
  packQty: number;
  unitsPerPack: number;
  totalUnits: number;
  totalPrice: number;
  unitCost: number;
  suggested: { id: string; name: string } | null;
  candidates: Candidate[];
};
type ReviewLine = ParsedLine & {
  choice: string;          // productId | "__new__" | "__skip__"
  units: number;
  updateCost: boolean;
};

export default function ReceiptImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<"pick" | "parsing" | "review" | "committing" | "done">("pick");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ store: string | null; date: string | null; orderNumber: string | null }>({ store: null, date: null, orderNumber: null });
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [result, setResult] = useState<{ unitsAdded: number; linesImported: number; newProducts: number; costUpdates: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setError(null);
    if (f.size > 8 * 1024 * 1024) { setError("File is too large (max 8 MB)."); return; }
    setPhase("parsing");
    try {
      const buf = await f.arrayBuffer();
      let b64 = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      b64 = btoa(b64);
      const res = await fetch("/api/inventory/receipt-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: b64, mimeType: f.type || "application/pdf", fileName: f.name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Couldn't parse the receipt.");
      setMeta({ store: data.store, date: data.date, orderNumber: data.orderNumber });
      setLines((data.items as ParsedLine[]).map((it) => ({
        ...it,
        choice: it.suggested ? it.suggested.id : "__new__",
        units: it.totalUnits,
        updateCost: Boolean(it.suggested) && it.unitCost > 0,
      })));
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
      setPhase("pick");
    }
  }

  async function commit() {
    setPhase("committing");
    setError(null);
    try {
      const body = {
        receiptRef: meta.orderNumber ? `receipt-${meta.orderNumber}` : `receipt-${Date.now()}`,
        store: meta.store, date: meta.date,
        lines: lines
          .filter((l) => l.choice !== "__skip__" && l.units > 0)
          .map((l) => ({
            productId: l.choice !== "__new__" ? l.choice : undefined,
            newProductName: l.choice === "__new__" ? l.rawName : undefined,
            units: l.units,
            unitCost: l.unitCost,
            caseSize: l.unitsPerPack > 1 ? l.unitsPerPack : undefined,
            updateCost: l.updateCost,
          })),
      };
      const res = await fetch("/api/inventory/receipt-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Import failed.");
      setResult(data);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setPhase("review");
    }
  }

  const importable = lines.filter((l) => l.choice !== "__skip__" && l.units > 0).length;

  return (
    <Modal onClose={phase === "committing" ? () => {} : onClose} title="Import stock from a receipt" maxWidth={760}>
      {phase === "pick" && (
        <div style={{ textAlign: "center", padding: "26px 10px" }}>
          <FileUp size={38} color="#16a34a" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: "#475569", margin: "0 0 6px" }}>
            Upload a store receipt — <strong>PDF or photo</strong> (Sam&apos;s Club, Costco…).
          </p>
          <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 18px" }}>
            The AI reads every line, works out the units (e.g. &quot;Qty 3 × 24 pk = 72 units&quot;), and matches
            them to your products. You review everything before anything is added to stock.
          </p>
          <input
            ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
          <BtnPrimary onClick={() => fileRef.current?.click()}>
            <FileUp size={15} /> Choose receipt file
          </BtnPrimary>
          {error && (
            <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left" }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}
        </div>
      )}

      {phase === "parsing" && (
        <div style={{ textAlign: "center", padding: "40px 10px" }}>
          <Loader2 size={30} color="#16a34a" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: "#475569" }}>Reading the receipt and matching products…</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Usually 10–20 seconds.</div>
        </div>
      )}

      {phase === "review" && (
        <div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
            {meta.store || "Receipt"}{meta.date ? ` · ${meta.date}` : ""}{meta.orderNumber ? ` · Order ${meta.orderNumber}` : ""} —{" "}
            <strong>{lines.length} lines found.</strong> Check the matches, fix any that are wrong, then import.
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            {lines.map((l, idx) => (
              <div key={idx} style={{ padding: "12px 14px", borderTop: idx === 0 ? "none" : "1px solid #f1f5f9", background: l.choice === "__skip__" ? "#fafafa" : "#fff", opacity: l.choice === "__skip__" ? 0.55 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", flex: 1, minWidth: 200 }}>{l.rawName}</div>
                  <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                    {l.packQty} × {l.unitsPerPack} pk · ${l.totalPrice.toFixed(2)} · ${l.unitCost.toFixed(2)}/unit
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={l.choice}
                    onChange={(e) => setLines((cur) => cur.map((x, i) => i === idx ? { ...x, choice: e.target.value } : x))}
                    style={{ flex: 1, minWidth: 220, padding: "7px 10px", fontSize: 13, border: "1px solid #d5d9e2", borderRadius: 8, background: "#fff" }}
                  >
                    {l.candidates.map((c) => (
                      <option key={c.id} value={c.id}>→ {c.name}</option>
                    ))}
                    <option value="__new__">＋ Create as new product: “{l.rawName.slice(0, 40)}”</option>
                    <option value="__skip__">— Skip this line —</option>
                  </select>
                  <label style={{ fontSize: 12, color: "#475569", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    Units
                    <input
                      type="number" min={0} value={l.units}
                      onChange={(e) => setLines((cur) => cur.map((x, i) => i === idx ? { ...x, units: Number(e.target.value) || 0 } : x))}
                      style={{ width: 70, padding: "6px 8px", fontSize: 13, border: "1px solid #d5d9e2", borderRadius: 8 }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: "#475569", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                    <input
                      type="checkbox" checked={l.updateCost}
                      onChange={(e) => setLines((cur) => cur.map((x, i) => i === idx ? { ...x, updateCost: e.target.checked } : x))}
                    />
                    set cost ${l.unitCost.toFixed(2)}
                  </label>
                </div>
              </div>
            ))}
          </div>
          {error && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: 13 }}>{error}</div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <BtnSecondary onClick={onClose}><X size={14} /> Cancel</BtnSecondary>
            <BtnPrimary onClick={commit} disabled={importable === 0}>
              <Check size={15} /> Add {importable} line{importable === 1 ? "" : "s"} to warehouse
            </BtnPrimary>
          </div>
        </div>
      )}

      {phase === "committing" && (
        <div style={{ textAlign: "center", padding: "40px 10px" }}>
          <Loader2 size={30} color="#16a34a" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: "#475569" }}>Adding stock to the warehouse…</div>
        </div>
      )}

      {phase === "done" && result && (
        <div style={{ textAlign: "center", padding: "26px 10px" }}>
          <Check size={36} color="#16a34a" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
            {result.unitsAdded.toLocaleString()} units added to the warehouse
          </div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {result.linesImported} lines imported
            {result.newProducts > 0 ? ` · ${result.newProducts} new product${result.newProducts === 1 ? "" : "s"} created` : ""}
            {result.costUpdates > 0 ? ` · ${result.costUpdates} unit cost${result.costUpdates === 1 ? "" : "s"} corrected from the receipt` : ""}
          </div>
          <div style={{ marginTop: 18 }}>
            <BtnPrimary onClick={onDone}><Check size={15} /> Done</BtnPrimary>
          </div>
        </div>
      )}
    </Modal>
  );
}
