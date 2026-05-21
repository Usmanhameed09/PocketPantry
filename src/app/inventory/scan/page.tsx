"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Header from "@/components/Header";
import InventoryTabs from "../InventoryTabs";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Loader2, ScanLine, Camera, CameraOff, Plus, CheckCircle2, AlertCircle,
  Save, X, Package, History,
} from "lucide-react";
import {
  PAGE_BG, CARD, Modal, Field, Select, BtnPrimary, BtnSecondary, Badge, pageContainer,
} from "../ui";

type Product = {
  id: string; name: string; sku: string; category: string;
  vendor: string | null; unit_cost: number; default_vend_price: number | null;
  case_size: number; barcode: string | null; status: string;
};

type ScanEvent = {
  at: string; barcode: string;
  productName: string; productId: string;
  unitsAdded: number; cases: number;
};

export default function ScanPage() {
  const isMobile = useIsMobile();
  const [scanning, setScanning] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [lastScan, setLastScan] = useState<ScanEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [history, setHistory] = useState<ScanEvent[]>([]);

  // Unknown barcode → register modal
  const [registerFor, setRegisterFor] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "", category: "Snacks", vendor: "",
    unitCost: "", caseSize: "", defaultVendPrice: "",
  });
  const [registering, setRegistering] = useState(false);

  // Existing product → confirm-add modal
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [overrideQty, setOverrideQty] = useState("");

  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScannedAtRef = useRef<{ code: string; at: number } | null>(null);

  // Check support on mount
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setSupported(false);
      return;
    }
    setSupported(true);
  }, []);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;
    setError(null);
    try {
      // Dynamic import — html5-qrcode is a browser-only lib
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const formats = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE,
      ];
      const scanner = new Html5Qrcode("pp-scanner", { formatsToSupport: formats, verbose: false });
      scannerRef.current = {
        stop: () => scanner.stop(),
        clear: () => scanner.clear(),
      };
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 1.7 },
        (decodedText: string) => handleScan(decodedText),
        () => {}
      );
      setScanning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera failed to start. Check permissions.");
      setScanning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  async function handleScan(barcode: string) {
    // Debounce: ignore re-reads of the same barcode within 2 seconds
    const now = Date.now();
    const last = lastScannedAtRef.current;
    if (last && last.code === barcode && now - last.at < 2000) return;
    lastScannedAtRef.current = { code: barcode, at: now };

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/barcode?barcode=${encodeURIComponent(barcode)}`);
      const data = await res.json();
      if (data.success && data.product) {
        // Known product → confirm + add case_size units
        setConfirmProduct(data.product);
      } else {
        // Unknown barcode → open register modal
        setRegisterFor(barcode);
        setDraft({ name: "", category: "Snacks", vendor: "", unitCost: "", caseSize: "", defaultVendPrice: "" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function addStockForProduct(p: Product, qty: number) {
    setBusy(true);
    const res = await fetch("/api/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: p.id,
        location: "warehouse",
        qty,
        reason: "purchase",
        notes: `Barcode scan (${p.barcode || "manual"})`,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      const event: ScanEvent = {
        at: new Date().toISOString(),
        barcode: p.barcode || "—",
        productName: p.name,
        productId: p.id,
        unitsAdded: qty,
        cases: p.case_size > 0 ? Math.round(qty / p.case_size) : 1,
      };
      setLastScan(event);
      setHistory((prev) => [event, ...prev].slice(0, 50));
      setConfirmProduct(null);
      setOverrideQty("");
      // Beep
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQA=");
        audio.play().catch(() => {});
      } catch {}
    } else {
      setError(data.error || "Failed to record stock");
    }
  }

  async function registerNewProduct() {
    if (!registerFor || !draft.name || !draft.caseSize) {
      setError("Name and case size are required");
      return;
    }
    setRegistering(true);
    const res = await fetch("/api/inventory/barcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barcode: registerFor,
        name: draft.name,
        category: draft.category,
        vendor: draft.vendor || null,
        unitCost: Number(draft.unitCost) || 0,
        defaultVendPrice: draft.defaultVendPrice ? Number(draft.defaultVendPrice) : null,
        caseSize: Number(draft.caseSize),
      }),
    });
    const data = await res.json();
    setRegistering(false);
    if (data.success && data.product) {
      // Immediately add 1 case
      const newProduct: Product = {
        id: data.product.id,
        name: data.product.name,
        sku: data.product.sku,
        case_size: data.product.case_size,
        barcode: registerFor,
        category: draft.category,
        vendor: draft.vendor || null,
        unit_cost: Number(draft.unitCost) || 0,
        default_vend_price: draft.defaultVendPrice ? Number(draft.defaultVendPrice) : null,
        status: "Active",
      };
      setRegisterFor(null);
      await addStockForProduct(newProduct, newProduct.case_size);
    } else {
      setError(data.error || "Failed to register");
    }
  }

  function manualLookup() {
    if (manualBarcode.trim()) {
      handleScan(manualBarcode.trim());
      setManualBarcode("");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG }}>
      <Header title="Scan" />
      <InventoryTabs />

      <div style={pageContainer(isMobile)}>
        {/* Last scan flash */}
        {lastScan && (
          <div style={{
            ...CARD, padding: 18, marginBottom: 16, background: "#f0fdf4",
            border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 12,
          }}>
            <CheckCircle2 size={28} color="#15803d" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#15803d" }}>
                +{lastScan.unitsAdded} {lastScan.productName}
              </div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                {lastScan.cases} case{lastScan.cases === 1 ? "" : "s"} · barcode {lastScan.barcode}
              </div>
            </div>
          </div>
        )}

        {/* Scanner box */}
        <div style={{ ...CARD, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>Camera scanner</h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                Point at a barcode — app auto-adds 1 case of that product.
              </p>
            </div>
            {supported === false ? (
              <Badge color="red">Camera not supported</Badge>
            ) : scanning ? (
              <button onClick={stopScanner} style={{
                padding: "10px 18px", background: "#fef2f2", color: "#dc2626",
                border: "1px solid #fecaca", borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
              }}>
                <CameraOff size={16} /> Stop scanner
              </button>
            ) : (
              <BtnPrimary onClick={startScanner}>
                <Camera size={16} /> Start camera
              </BtnPrimary>
            )}
          </div>

          <div ref={containerRef} style={{
            position: "relative", width: "100%", maxWidth: 480, margin: "0 auto",
            borderRadius: 12, overflow: "hidden", background: "#0f172a",
            minHeight: scanning ? 280 : 120,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div id="pp-scanner" style={{ width: "100%" }} />
            {!scanning && (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: 20 }}>
                <ScanLine size={48} style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 14 }}>Tap "Start camera" to begin</div>
              </div>
            )}
            {busy && scanning && (
              <div style={{
                position: "absolute", inset: 0, background: "rgba(15,23,42,0.6)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Loader2 size={36} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
              </div>
            )}
          </div>

          {/* Manual fallback */}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <input
              type="text" placeholder="…or type/paste a barcode here"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") manualLookup(); }}
              style={{
                flex: 1, padding: "10px 14px", border: "1px solid #d5d9e2",
                borderRadius: 10, fontSize: 14, outline: "none",
              }}
            />
            <BtnSecondary onClick={manualLookup}>Look up</BtnSecondary>
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13,
              background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div style={CARD}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
              <History size={16} color="#64748b" />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Today's scans ({history.length})</span>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  padding: "10px 20px", borderTop: i === 0 ? "none" : "1px solid #f8fafc",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{h.productName}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {new Date(h.at).toLocaleTimeString()} · barcode {h.barcode}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#15803d" }}>+{h.unitsAdded}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{h.cases} case{h.cases === 1 ? "" : "s"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Existing product confirmation */}
      {confirmProduct && (
        <Modal onClose={() => { setConfirmProduct(null); setOverrideQty(""); }} title={`Add to warehouse`} maxWidth={420}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Package size={24} color="#15803d" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{confirmProduct.name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {confirmProduct.vendor || "—"} · ${confirmProduct.unit_cost?.toFixed(2)} per unit · case size {confirmProduct.case_size}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <BtnPrimary onClick={() => addStockForProduct(confirmProduct, confirmProduct.case_size)} disabled={busy}>
              {busy ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={16} />}
              Add 1 case ({confirmProduct.case_size} units)
            </BtnPrimary>
            <BtnSecondary onClick={() => addStockForProduct(confirmProduct, confirmProduct.case_size * 2)} disabled={busy}>
              Add 2 cases ({confirmProduct.case_size * 2} units)
            </BtnSecondary>
            <BtnSecondary onClick={() => addStockForProduct(confirmProduct, 1)} disabled={busy}>
              Add 1 single unit
            </BtnSecondary>

            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input
                type="number" min="1" placeholder="Custom qty"
                value={overrideQty} onChange={(e) => setOverrideQty(e.target.value)}
                style={{
                  flex: 1, padding: "10px 14px", border: "1px solid #d5d9e2",
                  borderRadius: 8, fontSize: 14, outline: "none",
                }}
              />
              <BtnPrimary
                onClick={() => addStockForProduct(confirmProduct, Number(overrideQty) || 0)}
                disabled={busy || !overrideQty || Number(overrideQty) <= 0}>
                Add
              </BtnPrimary>
            </div>
          </div>
        </Modal>
      )}

      {/* Unknown barcode register modal */}
      {registerFor && (
        <Modal onClose={() => setRegisterFor(null)} title="New product — register barcode" maxWidth={500}>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>
            Barcode <code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 4 }}>{registerFor}</code> isn't in your catalog yet.
            Add it once — future scans of the same barcode will be instant.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
              <Field label="Product name" type="text" value={draft.name}
                onChange={(v) => setDraft({ ...draft, name: v })} />
            </div>
            <Select label="Category" value={draft.category}
              options={[
                { value: "Snacks", label: "Snacks" },
                { value: "Drinks", label: "Drinks" },
                { value: "Meals", label: "Meals" },
                { value: "Health", label: "Health" },
              ]}
              onChange={(v) => setDraft({ ...draft, category: v })} />
            <Field label="Vendor (optional)" type="text" value={draft.vendor}
              onChange={(v) => setDraft({ ...draft, vendor: v })} />
            <Field label="Case size (units per box)" value={draft.caseSize}
              onChange={(v) => setDraft({ ...draft, caseSize: v })} />
            <Field label="Unit cost ($)" value={draft.unitCost}
              onChange={(v) => setDraft({ ...draft, unitCost: v })} />
            <div style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
              <Field label="Default vend price ($, optional)" value={draft.defaultVendPrice}
                onChange={(v) => setDraft({ ...draft, defaultVendPrice: v })} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <BtnSecondary onClick={() => setRegisterFor(null)}>
              <X size={14} /> Cancel
            </BtnSecondary>
            <BtnPrimary onClick={registerNewProduct} disabled={registering || !draft.name || !draft.caseSize}>
              {registering ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={16} />}
              Register + Add 1 case
            </BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}
