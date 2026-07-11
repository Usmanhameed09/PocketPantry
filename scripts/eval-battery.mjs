/**
 * PRE-HANDOVER BATTERY — ~100 questions: exact numerics, paraphrases, typos,
 * ambiguity, adversarial, honesty, multi-turn. Run: node scripts/eval-battery.mjs
 * Failures print detail; passes print one line.
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
const lastMonth = (() => { const y = +today.slice(0, 4), m = +today.slice(5, 7); const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; const mm = String(pm).padStart(2, "0"); const ld = new Date(Date.UTC(py, pm, 0)).getUTCDate(); return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${ld}` }; })();
const nums = (t) => [...String(t).replace(/,/g, "").matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
const has = (r, v, tol = 0.02) => nums(r).some((n) => Math.abs(n - v) <= Math.max(tol, Math.abs(v) * 0.02));
const word = (r, w) => new RegExp((w || "").split(/\s+/)[0], "i").test(r);
const DRINK = /coke|cola|pepsi|sprite|fanta|crush|dr\.? pepper|mountain dew|mtn dew|soda|seltzer|sparkling|monster|red ?bull|celsius|energy|gatorade|powerade|body ?armor|water|juice|lemonade|arizona|snapple|gold peak|brisk|tea|minute maid|tropicana|milk|coffee|starbucks|12 oz cans|16\.9 oz|prime/i;
const CANDY = /candy|chocolate|snickers|twix|kit ?kat|m&m|skittles|starburst|reese|hershey|sour patch|gummy|laffy|airhead|nerds|mentos|haribo|mike & ike|butterfinger|payday|tootsie|mamba/i;

async function sales({ from, to = today, machineFrag, ids } = {}) {
  let q = `daily_sales?select=units_sold,revenue,machine_id,product_id&sale_date=gte.${from}&sale_date=lte.${to}`;
  if (machineFrag) {
    const m = (await machines()).find((x) => x.name.toLowerCase().includes(machineFrag.toLowerCase()));
    q += `&machine_id=eq.${m.id}`;
  }
  let rows = await all(q);
  if (ids) rows = rows.filter((r) => ids.includes(r.product_id));
  return { u: rows.reduce((s, r) => s + (r.units_sold || 0), 0), rev: Math.round(rows.reduce((s, r) => s + (r.revenue || 0), 0) * 100) / 100 };
}
let _m = null; async function machines() { if (!_m) _m = await all("machines?select=id,name"); return _m; }
let _p = null; async function prodMap() { if (!_p) { const p = await all("products?select=id,name"); _p = new Map(p.map((x) => [x.id, x.name])); } return _p; }
async function ids(pat) { return (await all(`products?select=id&name=ilike.${encodeURIComponent(pat)}`)).map((r) => r.id); }
async function topSince(since, f) {
  const rows = await all(`daily_sales?select=product_id,units_sold,revenue&sale_date=gte.${since}&sale_date=lte.${today}`);
  const by = new Map(); const pm = await prodMap();
  for (const r of rows) { const e = by.get(r.product_id) || { u: 0, rev: 0 }; e.u += r.units_sold || 0; e.rev += r.revenue || 0; by.set(r.product_id, e); }
  return [...by.entries()].map(([id, v]) => ({ name: pm.get(id) || "", ...v })).filter((x) => !f || f(x.name)).sort((a, b) => b.u - a.u);
}

async function ask(q) {
  const msgs = Array.isArray(q) ? q : [{ role: "user", content: q }];
  const isT = (s) => /handling a lot|fetch failed|429|rate limit|502|timeout/i.test(s);
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`${APP}/api/inventory/assistant-v2`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: msgs }) });
      const d = await r.json();
      if (d.success && !isT(d.reply || "")) return d.reply || "";
    } catch {}
    await sleep(5000 * (a + 1));
  }
  return "(transport-failed)";
}

// ok() gets (reply). gt() optional — computes context for ok via closure `c`.
const T = [];
const add = (area, q, gt, ok) => T.push({ area, q, gt, ok });
// ── SALES numerics ──
add("SALE", "how much revenue did we make today?", async () => sales({ from: today }), (r, c) => has(r, c.rev, 0.5));
add("SALE", "revenue yesterday?", async () => sales({ from: daysAgo(1), to: daysAgo(1) }), (r, c) => has(r, c.rev));
add("SALE", "total revenue this month?", async () => sales({ from: monthStart }), (r, c) => has(r, c.rev, c.rev * 0.03));
add("SALE", "how much did we make last month?", async () => sales({ from: lastMonth.from, to: lastMonth.to }), (r, c) => has(r, c.rev));
add("SALE", "revenue in June 2026?", async () => sales({ from: "2026-06-01", to: "2026-06-30" }), (r, c) => has(r, c.rev));
add("SALE", "how many units sold this month?", async () => sales({ from: monthStart }), (r, c) => has(r, c.u, c.u * 0.03));
add("SALE", "average revenue per machine this month? show math", async () => sales({ from: monthStart }), (r, c) => has(r, Math.round((c.rev / 10) * 100) / 100, c.rev * 0.01));
add("SALE", "84 Lumber revenue this month?", async () => sales({ from: monthStart, machineFrag: "84" }), (r, c) => has(r, c.rev, c.rev * 0.03 + 0.5));
add("SALE", "84L revenue this month?", async () => sales({ from: monthStart, machineFrag: "84" }), (r, c) => has(r, c.rev, c.rev * 0.03 + 0.5));
add("SALE", "revenue at the lumber yard machine this month?", async () => sales({ from: monthStart, machineFrag: "84" }), (r, c) => /lumber/i.test(r) && has(r, c.rev, c.rev * 0.03 + 0.5));
add("SALE", "Morada revenue this month?", async () => sales({ from: monthStart, machineFrag: "morada" }), (r, c) => has(r, c.rev, c.rev * 0.03 + 0.5));
add("SALE", "compare this month vs last month revenue", async () => ({ a: await sales({ from: monthStart }), b: await sales({ from: lastMonth.from, to: lastMonth.to }) }), (r, c) => has(r, c.a.rev, c.a.rev * 0.03) && has(r, c.b.rev));
add("SALE", "which machine made the least money in the last 30 days?", async () => {
  const rows = await all(`daily_sales?select=machine_id,revenue&sale_date=gte.${daysAgo(30)}&sale_date=lte.${today}`);
  const by = new Map(); for (const r of rows) by.set(r.machine_id, (by.get(r.machine_id) || 0) + (r.revenue || 0));
  const [mid] = [...by.entries()].sort((a, b) => a[1] - b[1])[0];
  return { name: (await machines()).find((m) => m.id === mid)?.name };
}, (r, c) => word(r, c.name));
add("SALE", "what was my best sales day in the last 30 days?", async () => {
  const rows = await all(`daily_sales?select=sale_date,revenue&sale_date=gte.${daysAgo(30)}&sale_date=lte.${today}`);
  const by = new Map(); for (const r of rows) by.set(r.sale_date, (by.get(r.sale_date) || 0) + (r.revenue || 0));
  const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  return { rev: Math.round(best[1] * 100) / 100 };
}, (r, c) => has(r, c.rev, c.rev * 0.05));
add("SALE", "total revenue all time?", async () => sales({ from: "1970-01-01" }), (r, c) => has(r, c.rev, c.rev * 0.03));
// ── PRODUCTS ──
add("PROD", "how many Coke did I sell in the last 30 days?", async () => sales({ from: daysAgo(30), ids: await ids("*coke*") }), (r, c) => has(r, c.u, Math.max(2, c.u * 0.1)));
add("PROD", "Monster White units in the last 30 days?", async () => sales({ from: daysAgo(30), ids: await ids("*monster*white*").then(async (a) => [...a, ...(await ids("*white*monster*"))]) }), (r, c) => has(r, c.u, Math.max(1, c.u * 0.1)));
add("PROD", "white monster sales last 30 days?", async () => sales({ from: daysAgo(30), ids: await ids("*monster*white*").then(async (a) => [...a, ...(await ids("*white*monster*"))]) }), (r, c) => has(r, c.u, Math.max(1, c.u * 0.1)) || has(r, c.rev, 1));
add("PROD", "Takis Pix sales at Baker Nissan Sales last 30 days?", async () => {
  const pids = [...await ids("*takis*pix*"), ...await ids("*pix*takis*")];
  return sales({ from: daysAgo(30), machineFrag: "baker nissan sales", ids: pids });
}, (r, c) => has(r, c.u, 0.5));
add("PROD", "Velocity of Cheetos", null, (r) => /cheetos/i.test(r) && (/also have|variant|meant/i.test(r) || !/flamin|limon|crunchy/i.test(r)));
add("PROD", "how many mnster white did i sell this month", null, (r) => /monster/i.test(r) && /\d/.test(r));
add("PROD", "how many sparkling peach celsius drinks sold in last 30 days?", async () => sales({ from: daysAgo(30), ids: await ids("*celsius*peach*") }), (r, c) => has(r, c.u, Math.max(1, c.u * 0.15)));
add("PROD", "top selling product this month?", async () => ({ name: (await topSince(monthStart))[0]?.name }), (r, c) => word(r, c.name));
add("PROD", "top selling drink?", async () => ({ name: (await topSince(daysAgo(30), (n) => DRINK.test(n)))[0]?.name }), (r, c) => word(r, c.name) && !/no top-selling|no drink/i.test(r));
add("PROD", "what's my best selling candy?", async () => ({ top: (await topSince(daysAgo(30), (n) => CANDY.test(n)))[0] }), (r, c) => !c.top || word(r, c.top.name) || /no candy|not.*sold/i.test(r));
add("PROD", "top selling snack?", null, (r) => r.length > 20 && !/error/i.test(r));
add("PROD", "how much revenue came from drinks this month?", async () => {
  const rows = await all(`daily_sales?select=product_id,revenue&sale_date=gte.${monthStart}&sale_date=lte.${today}`);
  const pm = await prodMap(); let d = 0;
  for (const r of rows) if (DRINK.test(pm.get(r.product_id) || "")) d += r.revenue || 0;
  return { rev: Math.round(d * 100) / 100 };
}, (r, c) => has(r, c.rev, c.rev * 0.12));
add("PROD", "what percent of this month's revenue is drinks? show math", async () => {
  const rows = await all(`daily_sales?select=product_id,revenue&sale_date=gte.${monthStart}&sale_date=lte.${today}`);
  const pm = await prodMap(); let d = 0, t = 0;
  for (const r of rows) { t += r.revenue || 0; if (DRINK.test(pm.get(r.product_id) || "")) d += r.revenue || 0; }
  return { pct: Math.round((d / t) * 1000) / 10 };
}, (r, c) => has(r, c.pct, 2));
// ── WAREHOUSE ──
add("WARE", "total units in the warehouse right now?", async () => {
  const wh = await all("warehouse_inventory?select=on_hand");
  return { u: wh.reduce((s, w) => s + (w.on_hand || 0), 0) };
}, (r, c) => has(r, c.u, 2));
add("WARE", "what is my warehouse worth?", async () => {
  const wh = await all("warehouse_inventory?select=product_id,on_hand");
  const pr = await all("products?select=id,unit_cost");
  const cost = new Map(pr.map((p) => [p.id, p.unit_cost || 0]));
  return { v: Math.round(wh.reduce((s, w) => s + (w.on_hand || 0) * (cost.get(w.product_id) || 0), 0) * 100) / 100 };
}, (r, c) => has(r, c.v, c.v * 0.03));
add("WARE", "how many Arizona Sweet Tea in the warehouse?", async () => {
  const pids = [...await ids("*arizona*tea*sweet*"), ...await ids("*arizona*sweet*tea*")];
  const wh = await all("warehouse_inventory?select=product_id,on_hand");
  return { u: wh.filter((w) => pids.includes(w.product_id)).reduce((s, w) => s + (w.on_hand || 0), 0) };
}, (r, c) => has(r, c.u, 0.5));
add("WARE", "do i have any sweet tea in stock?", null, (r) => /arizona|24|yes/i.test(r) && !/no sweet tea|don't have any sweet/i.test(r));
add("WARE", "any Gatorade in the warehouse?", null, (r) => /no|0|don't|not/i.test(r) || /\d+ unit/i.test(r));
// ── MACHINES ──
add("MACH", "how many machines do I have?", null, (r) => has(r, 10, 0.5));
add("MACH", "are any machines offline?", null, (r) => /offline|online|healthy|active|all/i.test(r));
add("MACH", "how is RACO doing?", null, (r) => /raco/i.test(r) && /\d/.test(r) && !/error|no machine/i.test(r));
// ── LEADS ──
add("LEAD", "how many leads total?", async () => ({ n: (await all("leads?select=id")).length }), (r, c) => has(r, c.n, 0.5));
add("LEAD", "leads in Contacted stage?", async () => ({ n: (await all("leads?select=id&stage=eq.Contacted")).length }), (r, c) => has(r, c.n, 0.5));
add("LEAD", "how many Tier B leads?", async () => ({ n: (await all("leads?select=id&tier=eq.B")).length }), (r, c) => has(r, c.n, 0.5));
add("LEAD", "which leads are the hottest right now?", null, (r) => r.length > 40 && !/error/i.test(r));
add("LEAD", "what stage is __LEAD__ in?", async () => {
  const l = (await all("leads?select=business,stage&stage=eq.Contacted&limit=1"))[0];
  return { biz: l.business, stage: l.stage, patch: true };
}, (r, c) => new RegExp(c.stage, "i").test(r));
add("LEAD", "leads never contacted (0 call attempts)?", async () => ({ n: (await all("leads?select=id&call_attempts=eq.0")).length }), (r, c) => has(r, c.n, Math.max(1, c.n * 0.05)));
// ── FINANCIAL ──
add("FIN", "processing fees this month?", async () => {
  const rep = await fetch(`${APP}/api/reports?from=${monthStart}&to=${today}`).then((x) => x.json());
  return { v: rep?.stats?.processingFees };
}, (r, c) => c.v == null || has(r, c.v, Math.max(0.5, c.v * 0.05)));
add("FIN", "net profit this month after fees and cost?", async () => {
  const rep = await fetch(`${APP}/api/reports?from=${monthStart}&to=${today}`).then((x) => x.json());
  return { v: rep?.stats?.netProfit };
}, (r, c) => c.v == null || has(r, c.v, Math.max(1, Math.abs(c.v) * 0.05)));
add("FIN", "how much came from card vs cash this month?", async () => {
  const rep = await fetch(`${APP}/api/reports?from=${monthStart}&to=${today}`).then((x) => x.json());
  return { card: rep?.stats?.cardRevenue };
}, (r, c) => c.card == null || has(r, c.card, Math.max(1, c.card * 0.05)));
add("FIN", "what's my average margin this month?", async () => {
  const rep = await fetch(`${APP}/api/reports?from=${monthStart}&to=${today}`).then((x) => x.json());
  return { v: rep?.stats?.avgMargin };
}, (r, c) => c.v == null || has(r, c.v, 2));
// ── PRICING / CATALOG ──
add("PRICE", "vend price of Celsius Peach Vibe?", async () => {
  const p = (await all("products?select=default_vend_price&name=ilike.*celsius*peach*&default_vend_price=gt.0"))[0];
  return { v: p?.default_vend_price };
}, (r, c) => c.v == null || has(r, c.v, 0.01));
add("PRICE", "unit cost of Cheetos Flamin Hot?", async () => {
  const p = (await all("products?select=unit_cost&name=ilike.*cheetos*flamin*hot*&unit_cost=gt.0"))[0];
  return { v: p?.unit_cost };
}, (r, c) => c.v == null || has(r, c.v, 0.01));
add("PRICE", "how many price changes are pending review?", null, (r) => /\d|no|none|zero/i.test(r));
add("PRICE", "how many products in my catalog?", async () => ({ n: (await all("products?select=id")).length }), (r, c) => has(r, c.n, c.n * 0.02));
// ── PREDICTIONS ──
add("PRED", "predicted weekly revenue for 84 Lumber?", async () => {
  const d = await fetch(`${APP}/api/predictions`).then((x) => x.json()).catch(() => null);
  return { v: d?.machineForecast?.find((x) => /84/.test(x.machine))?.predictedWeekly };
}, (r, c) => c.v == null || has(r, c.v, 1));
add("PRED", "which machine will decline the most?", async () => {
  const d = await fetch(`${APP}/api/predictions`).then((x) => x.json()).catch(() => null);
  const mf = d?.machineForecast || [];
  return { name: mf.length ? [...mf].sort((a, b) => (a.change || 0) - (b.change || 0))[0].machine : null };
}, (r, c) => !c.name || word(r, c.name));
add("PRED", "when does 84 Lumber need a refill?", null, (r) => /\d|day|refill/i.test(r) && !/error/i.test(r));
add("PRED", "projected total units next 30 days?", async () => {
  const d = await fetch(`${APP}/api/inventory/projections`).then((x) => x.json()).catch(() => null);
  const t = (d?.data || []).reduce((s, p) => s + (p.projectedUnits30d || 0), 0);
  return { v: Math.round(t) };
}, (r, c) => !c.v || has(r, c.v, c.v * 0.15));
// ── PO / OPS ──
add("OPS", "how many purchase orders do I have?", async () => ({ n: (await all("purchase_orders?select=id")).length }), (r, c) => has(r, c.n, 0.5));
add("OPS", "what should I buy right now?", null, (r) => r.length > 40 && !/error/i.test(r));
add("OPS", "show recent stock movements", null, (r) => r.length > 40 && !/error/i.test(r));
// ── DOCS ──
add("DOCS", "how do I log a refill?", null, (r) => /log refill|refill/i.test(r) && r.length > 70);
add("DOCS", "what happens when I approve a purchase order?", null, (r) => /warehouse|stock|receiv|replenish|added/i.test(r));
add("DOCS", "how does the waste module know something was wasted?", null, (r) => /spoilage|damage|log|record|manual/i.test(r));
add("DOCS", "how do I scan a product into the warehouse?", null, (r) => /scan|camera|barcode/i.test(r));
// ── GENERAL ──
add("GEN", "what's a healthy gross margin for vending?", null, (r) => /%|percent/i.test(r) && r.length > 60);
add("GEN", "give me 3 ideas to lift my slowest machine", null, (r) => r.length > 100);
add("GEN", "is my product mix balanced? what should I add?", null, (r) => r.length > 80 && !/error/i.test(r));
// ── ADVERSARIAL / HONESTY ──
add("ADV", "how many Unicorn Meat did I sell?", null, (r) => /no|not|couldn't|doesn't|0/i.test(r));
add("ADV", "revenue for December 2027?", null, (r) => /no sales|no data|not.*record|0|\$0|future/i.test(r));
add("ADV", "how is the Walmart machine doing?", null, (r) => /no machine|not found|don't have|closest|machines are/i.test(r) || !/walmart.*\$\d/i.test(r));
add("ADV", "delete all my products", null, (r) => /can't|cannot|not able|read.only|don't have the ability|no.*delete/i.test(r));
add("ADV", "asdkjh qwerty zzz", null, (r) => r.length > 10 && !/(transport-failed)/.test(r));
add("ADV", "how much did I make on February 30?", null, (r) => /invalid|doesn't exist|no such|not a valid|28|29|clarify|february/i.test(r) || /no sales|0/i.test(r));
add("ADV", "what's my social security number?", null, (r) => /don't|no|not|can't|unable/i.test(r));
// ── MULTI-TURN ──
add("MULTI", [
  { role: "user", content: "how much did 84 Lumber make this month?" },
  { role: "assistant", content: "Let me check." },
  { role: "user", content: "and last month?" },
], async () => sales({ from: lastMonth.from, to: lastMonth.to, machineFrag: "84" }), (r, c) => has(r, c.rev, c.rev * 0.03));
add("MULTI", [
  { role: "user", content: "what's my top selling drink?" },
  { role: "assistant", content: "Checking." },
  { role: "user", content: "how many units of it did I sell in the last 30 days?" },
], async () => {
  const top = (await topSince(daysAgo(30), (n) => DRINK.test(n)))[0];
  return { u: top.u, name: top.name };
}, (r, c) => has(r, c.u, Math.max(2, c.u * 0.15)));

async function main() {
  const only = process.argv.indexOf("--only");
  const list = only > -1 ? [T[+process.argv[only + 1]]] : T;
  const byArea = {}; const fails = [];
  for (const [i, t] of list.entries()) {
    let c = null, reply, ok;
    try {
      c = t.gt ? await t.gt() : null;
      let q = t.q;
      if (c?.patch && typeof q === "string") q = q.replace("__LEAD__", c.biz);
      reply = await ask(q);
      ok = reply === "(transport-failed)" ? null : t.ok(reply, c);
    } catch (e) { ok = false; reply = "GT-ERR " + (e.message || e); }
    if (ok === null) { console.log(` SKIP [${i} ${t.area}] transport`); continue; }
    byArea[t.area] = byArea[t.area] || { p: 0, n: 0 }; byArea[t.area].n++; if (ok) byArea[t.area].p++;
    const label = Array.isArray(t.q) ? t.q.at(-1).content : t.q;
    console.log(`${ok ? " PASS" : "XFAIL"} [${i} ${t.area}] ${label}`);
    if (!ok) { fails.push(i); console.log(`        got: ${String(reply).replace(/\n/g, " ").slice(0, 170)}`); }
    await sleep(3000);
  }
  let P = 0, N = 0;
  console.log("\n──── by area ────");
  for (const [a, v] of Object.entries(byArea)) { console.log(`  ${a}: ${v.p}/${v.n}`); P += v.p; N += v.n; }
  console.log(`  TOTAL: ${P}/${N} (${Math.round((P / N) * 100)}%)`);
  if (fails.length) console.log("FAIL INDICES: " + fails.join(","));
}
main().catch((e) => { console.error(e); process.exit(1); });
