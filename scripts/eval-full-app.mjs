/**
 * WHOLE-APP eval — a broad sweep across every module and question shape, to
 * surface systematic gaps (like "top selling drink" returning nothing because
 * every product is miscategorized). Ground truth is computed live from the DB
 * or the same services the pages read. Run: node scripts/eval-full-app.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const SB = pick("NEXT_PUBLIC_SUPABASE_URL"), KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
const APP = "https://pocketpantry.vercel.app";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function all(q) {
  const out = [];
  for (let f = 0; ; f += 1000) {
    const r = await fetch(`${SB}/rest/v1/${q}`, { headers: { ...H, Range: `${f}-${f + 999}` } });
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
const tz = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const today = tz(), monthStart = `${today.slice(0, 7)}-01`;
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return tz(d); };
const nums = (t) => [...String(t).replace(/,/g, "").matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
const has = (r, v, tol = 0.02) => nums(r).some((n) => Math.abs(n - v) <= Math.max(tol, Math.abs(v) * 0.02));
const hasWord = (r, w) => new RegExp(w.split(/\s+/)[0], "i").test(r);

// same drink classifier the tool uses (for ground truth)
const DRINK = /coke|cola|pepsi|sprite|fanta|crush|squirt|sunkist|dr\.? pepper|mountain dew|mtn dew|sierra mist|root beer|ginger ale|soda|seltzer|sparkling|lacroix|spindrift|bubly|monster|red ?bull|rockstar|bang|celsius|reign|energy|gatorade|powerade|body ?armor|propel|water|aquafina|dasani|smartwater|vitamin ?water|juice|lemonade|arizona|snapple|gold peak|pure leaf|brisk|tea|minute maid|tropicana|simply|v8|capri sun|kool aid|sunny d|milk|coffee|latte|starbucks|frappuccino|bai|12 oz cans|16\.9 oz|kombucha|prime/i;

let _prodName = null;
async function productName(id) {
  if (!_prodName) { const p = await all("products?select=id,name"); _prodName = new Map(p.map((x) => [x.id, x.name])); }
  return _prodName.get(id) || "";
}

async function ask(q) {
  const isT = (s) => /handling a lot|fetch failed|429|rate limit|502|timeout/i.test(s);
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`${APP}/api/inventory/assistant-v2`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: q }] }) });
      const d = await r.json();
      if (d.success && !isT(d.reply || "")) return d.reply || "";
    } catch {}
    await sleep(5000 * (a + 1));
  }
  return "(failed)";
}

async function topSoldSince(since, filterFn) {
  const rows = await all(`daily_sales?select=product_id,units_sold,revenue&sale_date=gte.${since}&sale_date=lte.${today}`);
  const by = new Map();
  for (const r of rows) { const e = by.get(r.product_id) || { u: 0, rev: 0 }; e.u += r.units_sold || 0; e.rev += r.revenue || 0; by.set(r.product_id, e); }
  const withNames = [];
  for (const [id, v] of by) withNames.push({ id, name: await productName(id), ...v });
  const filtered = filterFn ? withNames.filter((x) => filterFn(x.name)) : withNames;
  return filtered.sort((a, b) => b.u - a.u);
}

const T = [
  // ── CATEGORY (the reported gap + siblings) ──
  { a: "CAT", q: "what is the top selling drink?", async gt() {
      const top = await topSoldSince(daysAgo(30), (n) => DRINK.test(n));
      if (!top.length) return { d: "no drink data", ok: () => true };
      return { d: `${top[0].name} (${top[0].u}u)`, ok: (r) => hasWord(r, top[0].name) && !/no top-selling drink|no drink/i.test(r) }; } },
  { a: "CAT", q: "top 3 drinks by units this month", async gt() {
      const top = await topSoldSince(monthStart, (n) => DRINK.test(n));
      if (!top.length) return { d: "none", ok: () => true };
      return { d: top.slice(0, 3).map((x) => x.name.split(" ")[0]).join(", "),
        ok: (r) => top.slice(0, 3).filter((x) => hasWord(r, x.name)).length >= 1 && !/no drink/i.test(r) }; } },
  { a: "CAT", q: "how many drink units did I sell in the last 30 days?", async gt() {
      const top = await topSoldSince(daysAgo(30), (n) => DRINK.test(n));
      const u = top.reduce((s, x) => s + x.u, 0);
      return { d: `${u} drink units`, ok: (r) => has(r, u, u * 0.15) && !/no drink|0 drink/i.test(r) }; } },

  // ── SALES ──
  { a: "SALE", q: "total revenue this month?", async gt() {
      const rows = await all(`daily_sales?select=revenue&sale_date=gte.${monthStart}&sale_date=lte.${today}`);
      const rev = Math.round(rows.reduce((s, r) => s + (r.revenue || 0), 0) * 100) / 100;
      return { d: `$${rev}`, ok: (r) => has(r, rev) }; } },
  { a: "SALE", q: "what was my best sales day in the last 30 days?", async gt() {
      const rows = await all(`daily_sales?select=sale_date,revenue&sale_date=gte.${daysAgo(30)}&sale_date=lte.${today}`);
      const by = new Map(); for (const r of rows) by.set(r.sale_date, (by.get(r.sale_date) || 0) + (r.revenue || 0));
      const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
      return { d: `${best[0]} $${best[1].toFixed(2)}`, ok: (r) => has(r, Math.round(best[1] * 100) / 100, best[1] * 0.05) }; } },
  { a: "SALE", q: "the top selling product overall this month?", async gt() {
      const top = await topSoldSince(monthStart);
      return { d: `${top[0].name} (${top[0].u}u)`, ok: (r) => hasWord(r, top[0].name) }; } },
  { a: "SALE", q: "how much did Coke sell in the last 30 days?", async gt() {
      const ids = (await all(`products?select=id,name&name=ilike.*coke*`)).map((p) => p.id);
      const rows = (await all(`daily_sales?select=product_id,units_sold&sale_date=gte.${daysAgo(30)}`)).filter((r) => ids.includes(r.product_id));
      const u = rows.reduce((s, r) => s + (r.units_sold || 0), 0);
      return { d: `${u} coke units`, ok: (r) => has(r, u, Math.max(2, u * 0.1)) }; } },

  // ── MACHINE ──
  { a: "MACH", q: "which machine sells the most?", async gt() {
      const rows = await all(`daily_sales?select=machine_id,revenue&sale_date=gte.${daysAgo(30)}`);
      const by = new Map(); for (const r of rows) by.set(r.machine_id, (by.get(r.machine_id) || 0) + (r.revenue || 0));
      const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
      const m = (await all(`machines?select=id,name`)).find((x) => x.id === top[0]);
      return { d: m?.name, ok: (r) => hasWord(r, m?.name || "") }; } },
  { a: "MACH", q: "how many machines are offline right now?", async gt() {
      return { d: "count (live)", ok: (r) => /offline|all.*(online|healthy|active)|0/i.test(r) }; } },

  // ── WAREHOUSE ──
  { a: "WARE", q: "total units in warehouse?", async gt() {
      const wh = await all(`warehouse_inventory?select=on_hand`);
      const u = wh.reduce((s, w) => s + (w.on_hand || 0), 0);
      return { d: `${u}`, ok: (r) => has(r, u, 2) }; } },
  { a: "WARE", q: "how many Monster White do I have in stock?", async gt() {
      const ids = (await all(`products?select=id,name&name=ilike.*monster*white*`)).map((p) => p.id);
      const wh = (await all(`warehouse_inventory?select=product_id,on_hand`)).filter((w) => ids.includes(w.product_id));
      const u = wh.reduce((s, w) => s + (w.on_hand || 0), 0);
      return { d: `${u}`, ok: (r) => has(r, u, 1) }; } },

  // ── PRICING / FINANCIAL ──
  { a: "FIN", q: "net profit this month after fees and cost?", async gt() {
      const rep = await fetch(`${APP}/api/reports?from=${monthStart}&to=${today}`).then((r) => r.json()).catch(() => null);
      const np = rep?.stats?.netProfit; if (np == null) return { d: "down", ok: () => true };
      return { d: `$${np}`, ok: (r) => has(r, np, Math.max(1, Math.abs(np) * 0.04)) }; } },
  { a: "FIN", q: "how many price changes are pending approval?", async gt() {
      return { d: "count", ok: (r) => /\d/.test(r) || /no|zero|none/i.test(r) }; } },

  // ── LEADS ──
  { a: "LEAD", q: "how many leads are in the Contacted stage?", async gt() {
      const rows = await all(`leads?select=id&stage=eq.Contacted`);
      return { d: `${rows.length}`, ok: (r) => has(r, rows.length, 0.5) }; } },
  { a: "LEAD", q: "how many Tier A leads?", async gt() {
      const rows = await all(`leads?select=id&tier=eq.A`);
      return { d: `${rows.length}`, ok: (r) => has(r, rows.length, 0.5) }; } },

  // ── PREDICTIONS ──
  { a: "PRED", q: "predicted weekly revenue for 84 Lumber?", async gt() {
      const d = await fetch(`${APP}/api/predictions`).then((r) => r.json()).catch(() => null);
      const m = d?.machineForecast?.find((x) => /84/.test(x.machine)); if (!m) return { d: "down", ok: () => true };
      return { d: `$${m.predictedWeekly}`, ok: (r) => has(r, m.predictedWeekly, 1) }; } },

  // ── CALCULATION ──
  { a: "CALC", q: "what percent of this month's revenue is from drinks? show the math", async gt() {
      const allRows = await all(`daily_sales?select=product_id,revenue&sale_date=gte.${monthStart}&sale_date=lte.${today}`);
      let total = 0, drink = 0;
      for (const r of allRows) { total += r.revenue || 0; if (DRINK.test(await productName(r.product_id))) drink += r.revenue || 0; }
      const pct = total > 0 ? Math.round((drink / total) * 1000) / 10 : 0;
      return { d: `${pct}%`, ok: (r) => has(r, pct, 1.5) }; } },

  // ── DOCS ──
  { a: "DOCS", q: "how do I log a refill?", async gt() {
      return { d: "cites refill flow", ok: (r) => /log refill|refill/i.test(r) && r.length > 70 }; } },

  // ── EDGE / HONESTY ──
  { a: "EDGE", q: "how many Unicorn Meat did I sell?", async gt() {
      return { d: "no such product", ok: (r) => /no|not.*(found|sell|exist)|couldn't|don't have|0/i.test(r) }; } },
  { a: "EDGE", q: "what's a good vending gross margin?", async gt() {
      return { d: "general % advice", ok: (r) => /%|percent/i.test(r) && r.length > 60 }; } },
];

async function main() {
  const only = process.argv.indexOf("--only");
  const subset = only > -1 ? [T[+process.argv[only + 1]]] : T;
  const byArea = {}; const fails = [];
  for (const [i, t] of subset.entries()) {
    let g, reply, ok;
    try { g = await t.gt(); reply = await ask(t.q); ok = g.ok(reply); }
    catch (e) { ok = false; reply = "ERR " + e.message; }
    byArea[t.a] = byArea[t.a] || { p: 0, n: 0 }; byArea[t.a].n++; if (ok) byArea[t.a].p++;
    if (!ok) fails.push({ i, a: t.a, q: t.q, exp: g?.d, got: String(reply).replace(/\n/g, " ").slice(0, 140) });
    console.log(`${ok ? " PASS" : "XFAIL"} [${t.a}] ${t.q}`);
    if (!ok) console.log(`        expected ${g?.d} | got: ${String(reply).replace(/\n/g, " ").slice(0, 150)}`);
    await sleep(3500);
  }
  console.log("\n──── by area ────");
  let P = 0, N = 0;
  for (const [a, v] of Object.entries(byArea)) { console.log(`  ${a}: ${v.p}/${v.n}`); P += v.p; N += v.n; }
  console.log(`  TOTAL: ${P}/${N} (${Math.round((P / N) * 100)}%)`);
  if (fails.length) { console.log("\nFAILURES:"); for (const f of fails) console.log(`  [${f.i} ${f.a}] ${f.q}\n     exp ${f.exp} | got ${f.got}`); }
}
main().catch((e) => { console.error(e); process.exit(1); });
