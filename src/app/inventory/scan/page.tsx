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
  const [debugMsg, setDebugMsg] = useState<string | null>(null);

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

  // External lookup metadata (when we found product via UPCItemDB)
  const [externalInfo, setExternalInfo] = useState<{ source: string; imageUrl?: string; description?: string } | null>(null);

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
    setDebugMsg(null);
    try {
      // Dynamic import — html5-qrcode is a browser-only lib
      const { Html5Qrcode } = await import("html5-qrcode");

      // No format restriction — let the engine try every common barcode type.
      // Also enable the native BarcodeDetector when the browser supports it
      // (Chrome on Android), which is much faster and more reliable than the
      // ZXing WASM fallback used by older browsers.
      const scanner = new Html5Qrcode("pp-scanner", {
        verbose: false,
        useBarCodeDetectorIfSupported: true,
      } as unknown as undefined);
      scannerRef.current = {
        stop: () => scanner.stop(),
        clear: () => scanner.clear(),
      };

      // Compute a large qrbox sized to ~80% of the camera viewport — barcodes
      // on cases are wide so make the scan box wide too.
      const viewportWidth = containerRef.current?.clientWidth || 480;
      const boxW = Math.min(360, Math.floor(viewportWidth * 0.85));
      const boxH = Math.floor(boxW * 0.55);

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: boxW, height: boxH },
          aspectRatio: 1.5,
          // Request high resolution so even small barcodes are readable
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
        } as unknown as undefined,
        (decodedText: string) => handleScan(decodedText),
        () => {
          // Per-frame failure — silent (fires constantly while searching)
        }
      );
      setScanning(true);
      setDebugMsg("Scanning… hold a barcode 4–8 inches from the camera, well-lit.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      let friendly = "Camera couldn't start.";
      if (/Permission|NotAllowed/i.test(raw)) {
        friendly = "📵 Camera permission denied. In your browser address bar, tap the lock/camera icon and Allow camera, then try again.";
      } else if (/NotFound|requested device/i.test(raw)) {
        friendly = "📱 No camera detected. On a desktop you need a webcam; on a phone make sure no other app is using the camera.";
      } else if (/NotReadable|InUse/i.test(raw)) {
        friendly = "📷 Camera is busy. Close other apps using the camera (Zoom, Teams, another tab) and try again.";
      } else if (/Insecure|secure context|https/i.test(raw)) {
        friendly = "🔒 Camera requires HTTPS — make sure you're on the https:// URL, not http://.";
      } else {
        friendly = `Camera error: ${raw}`;
      }
      setError(friendly);
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
        // Known product in our DB → confirm + add case_size units
        setConfirmProduct(data.product);
      } else if (data.success && data.external) {
        // Found via UPCItemDB — pre-fill register form with title, brand, etc.
        const ext = data.external;
        setRegisterFor(barcode);
        setDraft({
          name: ext.name || "",
          category: ext.category || "Snacks",
          vendor: ext.brand || "",
          unitCost: ext.suggestedCost != null ? String(ext.suggestedCost) : "",
          caseSize: ext.inferredCaseSize != null ? String(ext.inferredCaseSize) : "",
          defaultVendPrice: "",
        });
        setExternalInfo({
          source: "UPCItemDB",
          imageUrl: ext.imageUrl,
          description: ext.description,
        });
      } else {
        // Unknown barcode — open empty register modal
        setRegisterFor(barcode);
        setDraft({ name: "", category: "Snacks", vendor: "", unitCost: "", caseSize: "", defaultVendPrice: "" });
        setExternalInfo(null);
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

  const [registerError, setRegisterError] = useState<string | null>(null);

  async function registerNewProduct() {
    setRegisterError(null);
    if (!registerFor) {
      setRegisterError("No barcode to register");
      return;
    }
    if (!draft.name.trim()) {
      setRegisterError("Product name is required");
      return;
    }
    const caseSizeNum = Number(draft.caseSize);
    if (!Number.isFinite(caseSizeNum) || caseSizeNum < 1) {
      setRegisterError("Case size must be 1 or more");
      return;
    }
    setRegistering(true);
    let res: Response;
    let data: { success: boolean; product?: { id: string; name: string; sku: string; case_size: number }; error?: string; attached?: boolean } = { success: false };
    try {
      res = await fetch("/api/inventory/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: registerFor,
          name: draft.name.trim(),
          category: draft.category,
          vendor: draft.vendor || null,
          unitCost: Number(draft.unitCost) || 0,
          defaultVendPrice: draft.defaultVendPrice ? Number(draft.defaultVendPrice) : null,
          caseSize: caseSizeNum,
        }),
      });
      data = await res.json();
    } catch (err) {
      setRegistering(false);
      setRegisterError(`Network error: ${err instanceof Error ? err.message : "unknown"}`);
      return;
    }
    setRegistering(false);
    if (data.success && data.product) {
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
      setRegisterError(null);
      setExternalInfo(null);
      await addStockForProduct(newProduct, newProduct.case_size);
    } else {
      setRegisterError(data.error || `Server error (${res!.status})`);
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
        {!isMobile && (
          <div style={{
            ...CARD, padding: 14, marginBottom: 16, background: "#eff6ff",
            border: "1px solid #bfdbfe", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 22 }}>📱</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1d4ed8" }}>
                For best results, open this page on your phone
              </div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                Desktop needs a webcam to scan. Type a barcode below as a fallback if you don't have a phone handy.
              </div>
            </div>
          </div>
        )}

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

          {debugMsg && scanning && !error && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13,
              background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <ScanLine size={16} /> {debugMsg}
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13,
              background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
              display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}

          {/* Scanning tips - always visible */}
          <details style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>📋 Scanning tips</summary>
            <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.7 }}>
              <li>Hold barcode <strong>4–8 inches</strong> from the camera (not too close)</li>
              <li>Make sure barcode is <strong>well-lit</strong> — bright room or use flashlight</li>
              <li>Hold steady for 1–2 seconds — don't move while scanning</li>
              <li>Try <strong>portrait orientation</strong> on phone for landscape barcodes</li>
              <li>Clean the camera lens if blurry</li>
              <li>If still no luck → type the barcode manually in the field above</li>
            </ul>
          </details>
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
        <Modal onClose={() => { setRegisterFor(null); setExternalInfo(null); }} title={externalInfo ? "Confirm product from UPC database" : "New product — register barcode"} maxWidth={520}>
          {externalInfo ? (
            <div style={{
              padding: 12, marginBottom: 12, borderRadius: 10,
              background: "#ede9fe", border: "1px solid #ddd6fe",
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              {externalInfo.imageUrl && (
                <img
                  src={externalInfo.imageUrl}
                  alt={draft.name}
                  style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 6, background: "#fff", flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#5b21b6", marginBottom: 4 }}>
                  ✨ Found in {externalInfo.source}
                </div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  Barcode <code style={{ background: "#fff", padding: "1px 6px", borderRadius: 4 }}>{registerFor}</code> —
                  fields pre-filled below. Review case size + cost (we estimated when possible), then save.
                </div>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>
              Barcode <code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 4 }}>{registerFor}</code> isn't in your catalog or the UPC database.
              Fill in the details — future scans will be instant.
            </p>
          )}
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
          {registerError && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13,
              background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
              display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{registerError}</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <BtnSecondary onClick={() => { setRegisterFor(null); setRegisterError(null); setExternalInfo(null); }}>
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
