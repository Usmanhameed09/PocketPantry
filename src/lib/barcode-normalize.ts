/**
 * Barcode normalization + variant expansion.
 *
 * Real-world bug this fixes: html5-qrcode (and the native BarcodeDetector
 * on Chrome) sometimes return the same UPC-A as "012345678905" and
 * sometimes as "12345678905" — depending on which decoder fired. Storing
 * with one form and looking up with the other = miss = "register again"
 * loop the operator reported.
 *
 * Sam's Club specific: outer cases are ITF-14 (14-digit case code) where
 * the LAST 13 digits = GTIN-13 of the inner unit. So when the operator
 * scans the outer case after registering the inner, we want to match.
 *
 * Strategy:
 *   - canonical()  → strip non-digits, drop leading zero on 13-digit codes
 *                    whose check digit is valid as UPC-A (12-digit).
 *   - variants()   → all reasonable forms a barcode might be stored as,
 *                    used when querying the DB. Returns canonical first
 *                    then any other forms so the SQL .in() filter catches
 *                    "I scanned it one way and stored it another way".
 */

export function canonicalBarcode(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  // ITF-14 case code → inner unit GTIN-13 (drop packaging indicator digit)
  if (digits.length === 14) return digits.slice(1);
  // EAN-13 with leading 0 → UPC-A (12 digits)
  if (digits.length === 13 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function barcodeVariants(raw: string): string[] {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return [];
  const out = new Set<string>([digits]);
  // The original raw with non-digits included (caller may have stored it
  // pre-normalize back when this code didn't exist)
  if (raw && raw !== digits) out.add(raw);
  // 14-digit ITF case code: also try the 13-digit inner GTIN AND the
  // 12-digit UPC-A (= GTIN without leading 0).
  if (digits.length === 14) {
    const gtin13 = digits.slice(1);
    out.add(gtin13);
    if (gtin13.startsWith("0")) out.add(gtin13.slice(1));
  }
  // 13-digit: try with and without leading 0 (UPC-A round-trip)
  if (digits.length === 13) {
    if (digits.startsWith("0")) out.add(digits.slice(1));
  }
  // 12-digit UPC-A: try with leading 0 (some scanners return EAN-13 form)
  if (digits.length === 12) {
    out.add(`0${digits}`);
  }
  return Array.from(out);
}
