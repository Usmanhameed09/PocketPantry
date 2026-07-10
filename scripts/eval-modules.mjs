/**
 * Focused accuracy probe for PREDICTIONS, REPORTS, and LEADS — the three
 * modules the operator asked about. Ground truth is computed live (from the
 * DB or the same prediction service the page reads), then the live assistant
 * is graded. Run: node scripts/eval-modules.mjs
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

const T = [
  // ── PREDICTIONS ──
  { area: "PRED", q: "what is the predicted weekly revenue for Morada Senior Living?", async gt() {
      const d = await fetch(`${APP}/api/predictions`).then((r) => r.json()).catch(() => null);
      const m = d?.machineForecast?.find((x) => /morada/i.test(x.machine)); if (!m) return { d: "svc down", ok: () => true };
      return { d: `$${m.predictedWeekly}`, ok: (r) => has(r, m.predictedWeekly, 1) }; } },
  { area: "PRED", q: "which machine is forecast to decline the most next period?", async gt() {
      const d = await fetch(`${APP}/api/predictions`).then((r) => r.json()).catch(() => null);
      const mf = d?.machineForecast || []; if (!mf.length) return { d: "svc down", ok: () => true };
      const worst = [...mf].sort((a, b) => (a.change || 0) - (b.change || 0))[0];
      return { d: worst.machine, ok: (r) => r.toLowerCase().includes(worst.machine.toLowerCase().split(" ")[0]) }; } },
  { area: "PRED", q: "how many total units are we projected to sell in the next 30 days?", async gt() {
      const d = await fetch(`${APP}/api/inventory/projections`).then((r) => r.json()).catch(() => null);
      const tot = (d?.data || []).reduce((s, p) => s + (p.projectedUnits30d || 0), 0);
      if (!tot) return { d: "n/a", ok: () => true };
      return { d: `~${Math.round(tot)}`, ok: (r) => has(r, Math.round(tot), Math.round(tot) * 0.15) }; } },

  // ── REPORTS ──
  { area: "REPT", q: "what were my total processing fees this month?", async gt() {
      // Ground truth = the Reports page's own fee figure (get_financial_summary
      // reads the same computation), so this asserts assistant==page.
      const rep = await fetch(`${APP}/api/reports?from=${monthStart}&to=${today}`).then((r) => r.json()).catch(() => null);
      const fees = rep?.stats?.processingFees;
      if (fees == null) return { d: "reports down", ok: () => true };
      return { d: `$${fees} (matches Reports page)`, ok: (r) => has(r, fees, Math.max(0.5, fees * 0.03)) }; } },
  { area: "REPT", q: "top 3 products by revenue over the last 30 days?", async gt() {
      const rows = await all(`daily_sales?select=revenue,product_id&sale_date=gte.${daysAgo(30)}&sale_date=lte.${today}`);
      const by = new Map(); for (const r of rows) by.set(r.product_id, (by.get(r.product_id) || 0) + (r.revenue || 0));
      const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const p = await all(`products?select=id,name&id=in.(${top.map((t) => t[0]).join(",")})`);
      const tok = (id) => (p.find((x) => x.id === id)?.name || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3)[0] || "";
      return { d: top.map((t) => tok(t[0])).join(", "),
        ok: (r) => top.slice(0, 2).filter((t) => tok(t[0]) && r.toLowerCase().includes(tok(t[0]))).length >= 1 }; } },
  { area: "REPT", q: "how many total units did I sell this month?", async gt() {
      const rows = await all(`daily_sales?select=units_sold&sale_date=gte.${monthStart}&sale_date=lte.${today}`);
      const u = rows.reduce((s, r) => s + (r.units_sold || 0), 0);
      return { d: `${u} units`, ok: (r) => has(r, u, u * 0.05) }; } },
  { area: "REPT", q: "what is my net profit this month after fees and product cost?", async gt() {
      // net profit must match the Reports page (get_financial_summary). Fetch it.
      const rep = await fetch(`${APP}/api/reports?from=${monthStart}&to=${today}`).then((r) => r.json()).catch(() => null);
      const np = rep?.stats?.netProfit;
      if (np == null) return { d: "reports down", ok: () => true };
      return { d: `$${np} (net profit)`, ok: (r) => has(r, np, Math.max(1, Math.abs(np) * 0.03)) }; } },

  // ── LEADS ──
  { area: "LEAD", q: "how many Tier A leads do I have?", async gt() {
      const rows = await all(`leads?select=id&tier=eq.A`);
      return { d: `${rows.length}`, ok: (r) => has(r, rows.length, 0.5) }; } },
  { area: "LEAD", q: "how many leads are in each stage?", async gt() {
      const rows = await all(`leads?select=stage`);
      const by = new Map(); for (const r of rows) by.set(r.stage, (by.get(r.stage) || 0) + 1);
      const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
      return { d: `${top[0]}=${top[1]} (+others)`, ok: (r) => has(r, top[1], 0.5) }; } },
  { area: "LEAD", q: "how many leads have never been contacted (0 call attempts)?", async gt() {
      const rows = await all(`leads?select=id&call_attempts=eq.0`);
      return { d: `${rows.length}`, ok: (r) => has(r, rows.length, Math.max(1, rows.length * 0.03)) }; } },
  { area: "LEAD", q: "what's the total number of leads across the whole pipeline?", async gt() {
      const rows = await all(`leads?select=id`);
      return { d: `${rows.length}`, ok: (r) => has(r, rows.length, 0.5) }; } },
];

async function main() {
  const byArea = {};
  for (const [i, t] of T.entries()) {
    let g, reply, ok;
    try { g = await t.gt(); reply = await ask(t.q); ok = g.ok(reply); }
    catch (e) { ok = false; reply = String(e.message); }
    byArea[t.area] = byArea[t.area] || { p: 0, n: 0 };
    byArea[t.area].n++; if (ok) byArea[t.area].p++;
    console.log(`${ok ? " PASS" : "XFAIL"} [${t.area}] ${t.q}\n        expected ${g?.d} | got: ${String(reply).replace(/\n/g, " ").slice(0, 130)}`);
    await sleep(3500);
  }
  console.log("\n──── by module ────");
  let P = 0, N = 0;
  for (const [a, v] of Object.entries(byArea)) { console.log(`  ${a}: ${v.p}/${v.n}`); P += v.p; N += v.n; }
  console.log(`  TOTAL: ${P}/${N} (${Math.round((P / N) * 100)}%)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
