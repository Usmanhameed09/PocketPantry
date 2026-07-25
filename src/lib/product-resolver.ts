/**
 * THE product resolver — the assistant's entire product universe.
 *
 * Design principle (operator's insight): the AI must only ever see products
 * that are REAL — sold recently, currently in a machine, or physically in the
 * warehouse. The other ~6,300 dead catalog rows from the bulk UPC import are
 * invisible to it. That single constraint removes the whole class of
 * "answered about a dead row" failures.
 *
 * Plus brand synonyms (Coke = Coca-Cola…), because that's world knowledge a
 * string matcher can't invent: the operator says "coca cola", the best seller
 * is named "Coke 12 oz Cans".
 *
 * Every assistant product lookup resolves through here.
 */

import { createServerClient } from "@/lib/supabase";
import { dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";

export type ActiveProduct = {
  id: string;
  name: string;
  group_id: string | null;
  units90: number;     // units sold in the last 90 days
  onHand: number;      // warehouse stock
  inMachine: boolean;  // machine_inventory row refreshed in the last 7 days
  sku?: string | null;
  category?: string | null;
  vendor?: string | null;
  unit_cost?: number | null;
  default_vend_price?: number | null;
  case_size?: number | null;
  barcode?: string | null;
  status?: string | null;
};

// Brand nicknames — finite, editable. Each set is a group of interchangeable
// phrases; a query containing one is retried with the others.
const SYNONYMS: string[][] = [
  ["coca cola", "coca-cola", "cocacola", "coke"],
  ["mountain dew", "mtn dew"],
  ["dr pepper", "dr. pepper", "drpepper"],
  ["red bull", "redbull"],
  ["m&m", "m&ms", "m and m", "m & m"],
  ["kit kat", "kitkat"],
  ["reese's", "reeses", "reese"],
  ["pop tart", "poptart", "pop-tart", "poptarts"],
  ["7up", "seven up", "7 up"],
  ["cheez it", "cheezit", "cheez-it"],
  ["chex mix", "chexmix"],
  ["rice krispies", "rice krispie"],
  ["monster", "monster energy"],
  ["hershey", "hersheys", "hershey's"],
];

const canonWord = (w: string): string => {
  let x = w.replace(/^([a-z]+)[\d.]+$/, "$1");
  if (x.length >= 4 && x.endsWith("s") && !x.endsWith("ss")) x = x.slice(0, -1);
  return x;
};
const toTokens = (s: string): string[] =>
  s.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9.]+/g, " ").trim().split(/\s+/)
    .filter((w) => w.length > 1 && !/^[\d.]+$/.test(w))
    .map(canonWord);

// ── Active universe, cached per serverless instance for 3 minutes ───────────
let _cache: { at: number; list: ActiveProduct[] } | null = null;

export async function activeProducts(): Promise<ActiveProduct[]> {
  if (_cache && Date.now() - _cache.at < 3 * 60 * 1000) return _cache.list;
  const supabase = createServerClient();
  const PAGE = 1000;

  // Signals of being REAL: sold in 180d / machine row refreshed in 7d / stock.
  const since = dateNDaysAgoInOperatorTz(180);
  const since90 = dateNDaysAgoInOperatorTz(90);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  const soldTotal = new Map<string, number>(); // 180d presence
  const sold90 = new Map<string, number>();
  for (let f = 0; f < 100000; f += PAGE) {
    const { data } = await supabase
      .from("daily_sales").select("product_id, units_sold, sale_date")
      .gte("sale_date", since).range(f, f + PAGE - 1);
    if (!data?.length) break;
    for (const r of data) {
      const id = r.product_id as string;
      const u = (r.units_sold as number) || 0;
      soldTotal.set(id, (soldTotal.get(id) || 0) + u);
      if ((r.sale_date as string) >= since90) sold90.set(id, (sold90.get(id) || 0) + u);
    }
    if (data.length < PAGE) break;
  }
  const [{ data: mi }, { data: wh }] = await Promise.all([
    supabase.from("machine_inventory").select("product_id").gte("updated_at", weekAgo).range(0, 9999),
    supabase.from("warehouse_inventory").select("product_id, on_hand").gt("on_hand", 0).range(0, 9999),
  ]);
  const inMachine = new Set((mi || []).map((r) => r.product_id as string));
  const onHand = new Map((wh || []).map((r) => [r.product_id as string, (r.on_hand as number) || 0]));

  const ids = [...new Set([...soldTotal.keys(), ...inMachine, ...onHand.keys()])];
  const list: ActiveProduct[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase
      .from("products")
      .select("id, name, group_id, sku, category, vendor, unit_cost, default_vend_price, case_size, barcode, status")
      .in("id", ids.slice(i, i + 150));
    for (const p of data || []) {
      list.push({
        ...(p as Omit<ActiveProduct, "units90" | "onHand" | "inMachine">),
        units90: sold90.get(p.id as string) || 0,
        onHand: onHand.get(p.id as string) || 0,
        inMachine: inMachine.has(p.id as string),
      } as ActiveProduct);
    }
  }
  _cache = { at: Date.now(), list };
  return list;
}

// ── Query resolution ────────────────────────────────────────────────────────
// Expand the query through brand synonyms, then match ACTIVE products whose
// name contains every (canonicalized) token of any variant. Sellers first.
export async function resolveProducts(query: string): Promise<ActiveProduct[]> {
  const q = (query || "").toLowerCase().trim();
  if (!q) return [];
  const variants = new Set<string>([q]);
  for (const set of SYNONYMS) {
    for (const phrase of set) {
      if (q.includes(phrase)) {
        for (const alt of set) variants.add(q.replace(phrase, alt));
      }
    }
  }
  const universe = await activeProducts();
  const nameToks = universe.map((p) => ({ p, set: new Set(toTokens(p.name)) }));
  const out = new Map<string, ActiveProduct>();
  for (const v of variants) {
    const toks = toTokens(v);
    if (toks.length === 0) continue;
    for (const { p, set } of nameToks) {
      if (toks.every((t) => set.has(t))) out.set(p.id, p);
    }
  }
  // Sellers first, then stocked, then in-machine.
  return [...out.values()].sort((a, b) =>
    (b.units90 - a.units90) || (b.onHand - a.onHand) || (Number(b.inMachine) - Number(a.inMachine)));
}
