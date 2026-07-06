/**
 * Backfill product_groups — clusters duplicate catalog variants into groups.
 *
 * Run AFTER migration 008 (adds product_groups + products.group_id).
 *
 *   node scripts/backfill-product-groups.mjs           # DRY RUN — prints groups
 *   node scripts/backfill-product-groups.mjs --apply   # writes to the DB
 *
 * Grouping rules (conservative — a wrong merge poisons numbers, so only merge
 * when it's clearly the same physical product):
 *   R1  same digits-only barcode (>= 8 digits)
 *   R2  identical normalized full name
 *   R3  identical NOISE-STRIPPED token sets (>= 2 meaningful tokens).
 *       Noise = brand/packaging filler: "snack", "beverages", "pre priced",
 *       sizes, counts, prices. So "AriZona Beverages AriZona Tea Sweet $.99"
 *       and "Arizona Sweet Tea" both reduce to {arizona,tea,sweet} -> merged,
 *       while "Doritos Nacho Cheese" vs "... Spicy" do NOT merge ("spicy" is
 *       a real token).
 *
 * Canonical name: the variant WITH sales history wins; ties -> shortest name.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const pick = (k) => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
};
const URL_ = pick("NEXT_PUBLIC_SUPABASE_URL");
const KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
if (!URL_ || !KEY) { console.error("Missing Supabase env"); process.exit(1); }
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const APPLY = process.argv.includes("--apply");

async function rest(path, opts = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: HEADERS, ...opts });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

async function fetchAll(table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await rest(`${table}?select=${select}`, {
      headers: { ...HEADERS, Range: `${from}-${from + 999}` },
    });
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// ── normalization ───────────────────────────────────────────────────────────
const NOISE = new Set([
  "snack", "snacks", "beverage", "beverages", "drink", "drinks", "brand",
  "pre", "priced", "price", "pack", "packs", "count", "ct", "oz", "ml", "fl",
  "lb", "g", "gram", "grams", "case", "box", "bag", "bags", "bottle",
  "bottles", "can", "cans", "cup", "cups", "single", "serve", "size",
  "assorted", "variety", "original", "classic", "inc", "llc", "co",
]);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => norm(s).split(" ").filter(Boolean);
const meaningfulKey = (s) => {
  const t = tokens(s).filter((w) => !NOISE.has(w) && !/^[\d.]+$/.test(w) && w.length > 1);
  return t.length >= 2 ? [...new Set(t)].sort().join("|") : null;
};

// Size/packaging guards: "Diet Coke 12 oz Cans" and "Diet Coke 16.9 oz
// Bottle" share a meaningful key but are DIFFERENT sellable SKUs. Two names
// may only merge when their number signatures (12 vs 16.9) and packaging
// words (can vs bottle vs bag vs box) don't contradict each other. An empty
// signature is compatible with anything ("Diet coke 12 oz" + "... 12 oz Cans").
const PACKAGING = new Set(["can", "cans", "bottle", "bottles", "bag", "bags", "box", "cup", "cups", "pouch"]);
const numberSig = (s) =>
  tokens(s).filter((w) => /^[\d.]+$/.test(w) && w !== ".").sort().join(",");
const packSig = (s) =>
  [...new Set(tokens(s).filter((w) => PACKAGING.has(w)).map((w) => w.replace(/s$/, "")))].sort().join(",");
const sigsCompatible = (a, b) => {
  const na = numberSig(a), nb = numberSig(b);
  if (na && nb && na !== nb) return false;
  const pa = packSig(a), pb = packSig(b);
  if (pa && pb && pa !== pb) return false;
  return true;
};
const barcodeKey = (b) => {
  if (!b) return null;
  const d = String(b).replace(/\D/g, "").replace(/^0+/, "");
  return d.length >= 8 ? d : null;
};

// ── union-find ──────────────────────────────────────────────────────────────
const parent = new Map();
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

async function main() {
  const products = await fetchAll("products", "id,name,category,barcode,company_id,group_id");
  console.log(`Loaded ${products.length} products`);
  for (const p of products) parent.set(p.id, p.id);

  // Which products actually sold (canonical-name preference)
  const soldRows = await fetchAll("daily_sales", "product_id,units_sold");
  const sold = new Set(soldRows.filter((r) => (r.units_sold || 0) > 0).map((r) => r.product_id));

  // Cluster by each key type. The token-key pass additionally requires
  // compatible size/packaging signatures pairwise (see sigsCompatible).
  const passes = [
    { keyFn: (p) => barcodeKey(p.barcode) && `bc:${p.company_id}:${barcodeKey(p.barcode)}`, guarded: false },
    { keyFn: (p) => `nm:${p.company_id}:${norm(p.name)}`, guarded: false },
    { keyFn: (p) => { const k = meaningfulKey(p.name); return k && `tk:${p.company_id}:${k}`; }, guarded: true },
  ];
  for (const { keyFn, guarded } of passes) {
    const buckets = new Map();
    for (const p of products) {
      const k = keyFn(p);
      if (!k) continue;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(p);
    }
    for (const members of buckets.values()) {
      if (!guarded) {
        for (let i = 1; i < members.length; i++) union(members[0].id, members[i].id);
        continue;
      }
      // Guarded: union only sig-compatible pairs.
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          if (sigsCompatible(members[i].name, members[j].name)) union(members[i].id, members[j].id);
        }
      }
    }
  }

  // Materialize multi-member groups
  const byRoot = new Map();
  for (const p of products) {
    const r = find(p.id);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(p);
  }
  const groups = [...byRoot.values()].filter((g) => g.length > 1);
  console.log(`\n${groups.length} duplicate groups found:\n`);

  for (const g of groups) {
    const canonical =
      g.filter((p) => sold.has(p.id)).sort((a, b) => a.name.length - b.name.length)[0] ||
      g.slice().sort((a, b) => a.name.length - b.name.length)[0];
    console.log(`■ ${canonical.name}`);
    for (const p of g) console.log(`    - ${p.name}${sold.has(p.id) ? "  [has sales]" : ""}`);

    if (APPLY) {
      const [pg] = await rest("product_groups", {
        method: "POST",
        headers: { ...HEADERS, Prefer: "return=representation" },
        body: JSON.stringify({
          company_id: canonical.company_id,
          canonical_name: canonical.name,
          match_method: "auto-backfill",
        }),
      });
      for (const p of g) {
        await rest(`products?id=eq.${p.id}`, {
          method: "PATCH",
          body: JSON.stringify({ group_id: pg.id }),
        });
      }
    }
  }
  console.log(APPLY ? "\nApplied ✔" : "\nDRY RUN — re-run with --apply to write");
}

main().catch((e) => { console.error(e); process.exit(1); });
