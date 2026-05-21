"use client";

import { useState, useRef, useEffect } from "react";
import { X, Plus, Trash2, Loader2, ScanLine, Camera, CameraOff } from "lucide-react";

interface MachineOption {
  id: string;
  name: string;
  nayaxDeviceId: string | null;
  status: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  caseSize?: number;
}

interface RefillItem {
  productId: string;
  quantity: number;
}

interface Props {
  machines: MachineOption[];
  products: ProductOption[];
  onClose: () => void;
  onDone: () => void;
}

export default function RefillModal({ machines, products, onClose, onDone }: Props) {
  const [machineId, setMachineId] = useState("");
  const [items, setItems] = useState<RefillItem[]>([{ productId: "", quantity: 0 }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const lastScannedAtRef = useRef<{ code: string; at: number } | null>(null);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => () => { stopScanner(); }, []);

  const startScanner = async () => {
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const formats = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.QR_CODE,
      ];
      const scanner = new Html5Qrcode("pp-refill-scanner", { formatsToSupport: formats, verbose: false });
      scannerRef.current = { stop: () => scanner.stop(), clear: () => scanner.clear() };
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 140 } },
        (text: string) => handleScannedBarcode(text),
        () => {}
      );
      setScanning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera failed");
    }
  };

  const handleScannedBarcode = async (barcode: string) => {
    const now = Date.now();
    const last = lastScannedAtRef.current;
    if (last && last.code === barcode && now - last.at < 2000) return;
    lastScannedAtRef.current = { code: barcode, at: now };

    const res = await fetch(`/api/inventory/barcode?barcode=${encodeURIComponent(barcode)}`);
    const data = await res.json();
    if (!data.success || !data.product) {
      setScanMsg(`Unknown barcode ${barcode} — register it via the Scan page first.`);
      return;
    }
    const p = data.product;
    const caseSize = Math.max(1, p.case_size || 1);
    // Find existing row for this product, else add new
    const existingIdx = items.findIndex((it) => it.productId === p.id);
    if (existingIdx >= 0) {
      const updated = [...items];
      updated[existingIdx].quantity += caseSize;
      setItems(updated);
    } else {
      const empty = items.findIndex((it) => !it.productId && it.quantity === 0);
      if (empty >= 0) {
        const updated = [...items];
        updated[empty] = { productId: p.id, quantity: caseSize };
        setItems(updated);
      } else {
        setItems([...items, { productId: p.id, quantity: caseSize }]);
      }
    }
    setScanMsg(`✓ +${caseSize} ${p.name}`);
    setTimeout(() => setScanMsg(null), 2000);
  };

  const addRow = () => setItems([...items, { productId: "", quantity: 0 }]);

  const removeRow = (i: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== i));
  };

  const updateRow = (i: number, field: keyof RefillItem, value: string | number) => {
    const updated = [...items];
    if (field === "quantity") {
      updated[i].quantity = Math.max(0, Number(value));
    } else {
      updated[i].productId = value as string;
    }
    setItems(updated);
  };

  const handleSubmit = async () => {
    setError("");
    if (!machineId) { setError("Select a machine"); return; }

    const validItems = items.filter((it) => it.productId && it.quantity > 0);
    if (validItems.length === 0) { setError("Add at least one product with quantity > 0"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/refill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineId, items: validItems }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to log refill");
        return;
      }
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to log refill");
    } finally {
      setSubmitting(false);
    }
  };

  // Products already used in other rows
  const usedProductIds = new Set(items.map((it) => it.productId).filter(Boolean));

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)", padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
        maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", borderBottom: "1px solid #e5e7eb",
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Log Machine Refill
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: "#f1f5f9", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} color="#64748b" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>
          {error && (
            <div style={{
              padding: "10px 14px", marginBottom: 16, background: "#fef2f2",
              border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Machine Select */}
          <label style={{ display: "block", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
              Machine
            </span>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              style={{
                width: "100%", padding: "10px 14px", fontSize: 14, color: "#374151",
                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, outline: "none",
              }}
            >
              <option value="">Select a machine...</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>

          {/* Barcode Scanner */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                <ScanLine size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                Scan barcode (auto-adds 1 case)
              </span>
              {scanning ? (
                <button onClick={stopScanner} style={{
                  padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#dc2626",
                  background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  <CameraOff size={12} /> Stop
                </button>
              ) : (
                <button onClick={startScanner} style={{
                  padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#15803d",
                  background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 6, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}>
                  <Camera size={12} /> Start camera
                </button>
              )}
            </div>
            <div id="pp-refill-scanner" style={{
              width: "100%", borderRadius: 8, overflow: "hidden",
              background: scanning ? "#0f172a" : "transparent",
              minHeight: scanning ? 200 : 0,
            }} />
            {scanMsg && (
              <div style={{
                marginTop: 8, padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: scanMsg.startsWith("✓") ? "#dcfce7" : "#fef3c7",
                color: scanMsg.startsWith("✓") ? "#15803d" : "#92400e",
              }}>{scanMsg}</div>
            )}
          </div>

          {/* Product Rows */}
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>
              Products Loaded
            </span>

            {items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                <select
                  value={item.productId}
                  onChange={(e) => updateRow(i, "productId", e.target.value)}
                  style={{
                    flex: 1, padding: "10px 12px", fontSize: 13, color: "#374151",
                    background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, outline: "none",
                  }}
                >
                  <option value="">Select product...</option>
                  {products
                    .filter((p) => p.id === item.productId || !usedProductIds.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>

                <input
                  type="number"
                  min={0}
                  value={item.quantity || ""}
                  placeholder="Qty"
                  onChange={(e) => updateRow(i, "quantity", e.target.value)}
                  style={{
                    width: 80, padding: "10px 12px", fontSize: 13, color: "#374151",
                    background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8,
                    outline: "none", textAlign: "center",
                  }}
                />

                <button
                  onClick={() => removeRow(i)}
                  disabled={items.length <= 1}
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: "1px solid #d5d9e2",
                    background: items.length <= 1 ? "#f1f5f9" : "#fff", cursor: items.length <= 1 ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: items.length <= 1 ? 0.4 : 1,
                  }}
                >
                  <Trash2 size={14} color="#dc2626" />
                </button>
              </div>
            ))}

            <button
              onClick={addRow}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", fontSize: 13, fontWeight: 500,
                color: "#16a34a", background: "transparent", border: "1px dashed #bbf7d0",
                borderRadius: 8, cursor: "pointer", width: "100%", justifyContent: "center",
              }}
            >
              <Plus size={14} /> Add Product
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 10, justifyContent: "flex-end",
          padding: "16px 24px", borderTop: "1px solid #e5e7eb",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 600,
              color: "#374151", background: "#f1f5f9", border: "1px solid #d5d9e2",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 20px", fontSize: 13, fontWeight: 600,
              color: "#fff", background: "#16a34a", border: "none",
              borderRadius: 8, cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
            {submitting ? "Saving..." : "Log Refill"}
          </button>
        </div>
      </div>
    </div>
  );
}
