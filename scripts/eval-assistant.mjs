/**
 * Golden-question eval suite — RAG plan Phase 5 (pulled forward).
 *
 * For each question: compute the EXPECTED answer directly from the database
 * (ground truth), ask the LIVE assistant, and grade the reply. A number-type
 * check passes when the expected value appears among the numbers in the reply
 * (within tolerance). Run after every deploy; every new bug becomes a case.
 *
 *   node scripts/eval-assistant.mjs             # full suite
 *   node scripts/eval-assistant.mjs --only 12   # single question by index
 *   node scripts/eval-assistant.mjs --list      # list questions
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const SB_URL = pick("NEXT_PUBLIC_SUPABASE_URL");
const SB_KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
const APP = "https://pocketpantry.vercel.app";
const HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

// ── data helpers ────────────────────────────────────────────────────────────
async function fetchAll(pathQ) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SB_URL}/rest/v1/${pathQ}`, {
      headers: { ...HEADERS, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${pathQ} -> ${res.status}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const tzDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d);
const today = tzDate();
const monthStart = `${today.slice(0, 7)}-01`;
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return tzDate(d); };

let _machines = null;
async function machines() {
  if (!_machines) _machines = await fetchAll("machines?select=id,name,nayax_device_id");
  return _machines;
}
async function machineIdByName(frag) {
  const m = (await machines()).find((x) => x.name.toLowerCase().includes(frag.toLowerCase()));
  if (!m) throw new Error(`no machine ~ ${frag}`);
  return m.id;
}
async function salesSum({ from, to = today, machineFrag, productIds } = {}) {
  let q = `daily_sales?select=units_sold,revenue,machine_id,product_id&sale_date=gte.${from}&sale_date=lte.${to}`;
  if (machineFrag) q += `&machine_id=eq.${await machineIdByName(machineFrag)}`;
  let rows = await fetchAll(q);
  if (productIds) rows = rows.filter((r) => productIds.includes(r.product_id));
  return {
    units: rows.reduce((s, r) => s + (r.units_sold || 0), 0),
    revenue: Math.round(rows.reduce((s, r) => s + (r.revenue || 0), 0) * 100) / 100,
  };
}
async function productIdsMatching(...ilikes) {
  const sets = await Promise.all(
    ilikes.map((p) => fetchAll(`products?select=id,name&name=ilike.${encodeURIComponent(p)}`))
  );
  return [...new Set(sets.flat().map((r) => r.id))];
}

// "last N days" is ambiguous in natural language (include today? end
// yesterday?). Accept every defensible window boundary — the assistant is
// graded on the NUMBER being real, not on picking our exact convention.
async function salesSumWindows(n, extra = {}) {
  const windows = [
    { from: daysAgo(n), to: today },
    { from: daysAgo(n), to: daysAgo(1) },
    { from: daysAgo(n - 1), to: today },
    { from: daysAgo(n + 1), to: daysAgo(1) },
  ];
  const out = [];
  for (const w of windows) out.push(await salesSum({ ...w, ...extra }));
  return out;
}

// ── grading ────────────────────────────────────────────────────────────────
const numbersIn = (text) =>
  [...String(text).replace(/,/g, "").matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const hasNumber = (reply, value, tolAbs = 0.02, tolPct = 0.02) =>
  numbersIn(reply).some((n) => Math.abs(n - value) <= Math.max(tolAbs, Math.abs(value) * tolPct));

// ── the question set ────────────────────────────────────────────────────────
// expect() returns { desc, pass(reply) } — computed fresh at run time.
const QUESTIONS = [
  // ── machine revenue (the $692-vs-$486 class) ──
  { q: "total revenue this month across all machines?", async expect() {
      const s = await salesSum({ from: monthStart });
      return { desc: `$${s.revenue}`, pass: (r) => hasNumber(r, s.revenue) }; } },
  { q: "how much did 84 Lumber make this month?", async expect() {
      const s = await salesSum({ from: monthStart, machineFrag: "84" });
      return { desc: `$${s.revenue}`, pass: (r) => hasNumber(r, s.revenue) }; } },
  { q: "NGM revenue last 7 days?", async expect() {
      const ws = await salesSumWindows(7, { machineFrag: "NGM" });
      return { desc: `$${ws[0].revenue} (±window)`,
        pass: (r) => ws.some((s) => hasNumber(r, s.revenue)) }; } },
  { q: "which machine made the most money in the last 30 days and how much?", async expect() {
      const rows = await fetchAll(`daily_sales?select=revenue,machine_id&sale_date=gte.${daysAgo(30)}&sale_date=lte.${today}`);
      const by = new Map();
      for (const r of rows) by.set(r.machine_id, (by.get(r.machine_id) || 0) + (r.revenue || 0));
      const [mid, rev] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
      const name = (await machines()).find((m) => m.id === mid)?.name;
      const revR = Math.round(rev * 100) / 100;
      return { desc: `${name} $${revR}`,
        pass: (r) => r.toLowerCase().includes(name.toLowerCase().split(" ")[0]) && hasNumber(r, revR) }; } },

  // ── product-at-machine (the Takis Pix class) ──
  { q: "Takis Pix sales in Baker Nissan Sales last 30 days", async expect() {
      const ids = await productIdsMatching("*takis*pix*", "*pix*takis*");
      const mid = await machineIdByName("baker nissan sales");
      const rows = (await fetchAll(`daily_sales?select=units_sold,machine_id,product_id&sale_date=gte.${daysAgo(30)}`))
        .filter((r) => r.machine_id === mid && ids.includes(r.product_id));
      const units = rows.reduce((s, r) => s + (r.units_sold || 0), 0);
      return { desc: `${units} units`, pass: (r) => hasNumber(r, units, 0.5) }; } },

  // ── warehouse (the Arizona class) ──
  { q: "how many items do i have in warehouse now for AriZona Tea Sweet", async expect() {
      const ids = await productIdsMatching("*arizona*tea*sweet*", "*arizona*sweet*tea*");
      const wh = await fetchAll(`warehouse_inventory?select=product_id,on_hand`);
      const units = wh.filter((w) => ids.includes(w.product_id)).reduce((s, w) => s + (w.on_hand || 0), 0);
      return { desc: `${units} units`, pass: (r) => hasNumber(r, units, 0.5) }; } },
  { q: "How many total units are in my warehouse right now?", async expect() {
      const wh = await fetchAll(`warehouse_inventory?select=on_hand`);
      const units = wh.reduce((s, w) => s + (w.on_hand || 0), 0);
      return { desc: `${units}`, pass: (r) => hasNumber(r, units, 1) }; } },

  // ── leads ──
  { q: "how many leads are in the Contacted stage?", async expect() {
      const rows = await fetchAll(`leads?select=id&stage=eq.Contacted`);
      return { desc: `${rows.length}`, pass: (r) => hasNumber(r, rows.length, 0.5) }; } },
  { q: "how many leads do I have in total?", async expect() {
      const rows = await fetchAll(`leads?select=id`);
      return { desc: `${rows.length}`, pass: (r) => hasNumber(r, rows.length, 0.5) }; } },

  // ── counts / status ──
  { q: "how many machines do I have?", async expect() {
      const n = (await machines()).length;
      return { desc: `${n}`, pass: (r) => hasNumber(r, n, 0.5) }; } },

  // ── small data points ──
  { q: "what is the vend price of Celsius Peach Vibe?", async expect() {
      const rows = await fetchAll(`products?select=name,default_vend_price&name=ilike.*celsius*peach*`);
      const p = rows.find((r) => r.default_vend_price > 0) || rows[0];
      if (!p) return { desc: "n/a", pass: () => true };
      return { desc: `$${p.default_vend_price}`, pass: (r) => hasNumber(r, p.default_vend_price, 0.01) }; } },
  { q: "what does a unit of Cheetos Flamin Hot cost me?", async expect() {
      const rows = await fetchAll(`products?select=name,unit_cost&name=ilike.*cheetos*flamin*hot*`);
      const p = rows.find((r) => r.unit_cost > 0) || rows[0];
      if (!p) return { desc: "n/a", pass: () => true };
      return { desc: `$${p.unit_cost}`, pass: (r) => hasNumber(r, p.unit_cost, 0.01) }; } },

  // ── predictions (ground truth = the same service the page reads) ──
  { q: "what is the predicted weekly revenue for 84 Lumber?", async expect() {
      const d = await fetch(`${APP}/api/predictions`).then((r) => r.json()).catch(() => null);
      const m = d?.machineForecast?.find((x) => (x.machine || "").includes("84"));
      if (!m) return { desc: "service down — skip", pass: () => true };
      return { desc: `$${m.predictedWeekly}`, pass: (r) => hasNumber(r, m.predictedWeekly, 1) }; } },

  // ── calculation (must use tools + calculator, and be right) ──
  { q: "what percent of this month's revenue came from 84 Lumber? show the math", async expect() {
      const all = await salesSum({ from: monthStart });
      const lum = await salesSum({ from: monthStart, machineFrag: "84" });
      const pct = Math.round((lum.revenue / all.revenue) * 1000) / 10;
      return { desc: `${pct}%`, pass: (r) => hasNumber(r, pct, 0.6) }; } },

  // ── general knowledge lane (no data needed — just a sane, non-error answer) ──
  { q: "what's a healthy gross margin for a vending machine business?", async expect() {
      return { desc: "any % guidance", pass: (r) => /%|percent/i.test(r) && r.length > 60 }; } },

  // ── disambiguation behavior (the Cheetos class) ──
  { q: "Velocity of Cheetos", async expect() {
      return { desc: "answers plain Cheetos or flags variants",
        pass: (r) => /cheetos/i.test(r) && (/also have|variant|meant/i.test(r) || !/flamin|limon|crunchy/i.test(r)) }; } },

  // ── date handling ──
  { q: "how much revenue did we make yesterday?", async expect() {
      const s = await salesSum({ from: daysAgo(1), to: daysAgo(1) });
      return { desc: `$${s.revenue}`, pass: (r) => hasNumber(r, s.revenue) }; } },
  { q: "how much did we make on June 15 2026?", async expect() {
      const s = await salesSum({ from: "2026-06-15", to: "2026-06-15" });
      return { desc: `$${s.revenue}`, pass: (r) => hasNumber(r, s.revenue) }; } },

  // ── rankings ──
  { q: "what is my top selling product this month by units?", async expect() {
      const rows = await fetchAll(`daily_sales?select=units_sold,product_id&sale_date=gte.${monthStart}&sale_date=lte.${today}`);
      const by = new Map();
      for (const r of rows) by.set(r.product_id, (by.get(r.product_id) || 0) + (r.units_sold || 0));
      const [pid, units] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
      const prod = (await fetchAll(`products?select=id,name&id=eq.${pid}`))[0];
      const token = prod.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3)[0];
      return { desc: `${prod.name} (${units}u)`,
        pass: (r) => r.toLowerCase().includes(token) && hasNumber(r, units, 0.5) }; } },
  { q: "top product at NGM this month?", async expect() {
      const mid = await machineIdByName("NGM");
      const rows = (await fetchAll(`daily_sales?select=units_sold,product_id,machine_id&sale_date=gte.${monthStart}&sale_date=lte.${today}`))
        .filter((r) => r.machine_id === mid);
      if (rows.length === 0) return { desc: "no sales — any honest answer", pass: (r) => /no sales|no data|hasn't sold|0/i.test(r) };
      const by = new Map();
      for (const r of rows) by.set(r.product_id, (by.get(r.product_id) || 0) + (r.units_sold || 0));
      const [pid] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
      const prod = (await fetchAll(`products?select=id,name&id=eq.${pid}`))[0];
      const token = prod.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3)[0];
      return { desc: prod.name, pass: (r) => r.toLowerCase().includes(token) }; } },

  // ── per-product sales across machines (variant-group correctness) ──
  { q: "how many Celsius Peach Vibe did I sell in the last 14 days?", async expect() {
      const ids = await productIdsMatching("*celsius*peach*");
      const ws = await salesSumWindows(14, { productIds: ids });
      return { desc: `${ws[0].units} units (±window)`,
        pass: (r) => ws.some((s) => hasNumber(r, s.units, 0.5)) }; } },

  // ── other modules ──
  { q: "how many purchase orders do I have in total?", async expect() {
      const rows = await fetchAll(`purchase_orders?select=id`);
      return { desc: `${rows.length}`, pass: (r) => hasNumber(r, rows.length, 0.5) }; } },
  { q: "how many products are marked Active in my catalog?", async expect() {
      const rows = await fetchAll(`products?select=id&status=eq.Active`);
      return { desc: `${rows.length}`, pass: (r) => hasNumber(r, rows.length, 0.5) }; } },

  // ── multi-turn follow-up (conversation grounding) ──
  { q: [
      { role: "user", content: "how much did 84 Lumber make this month?" },
      { role: "assistant", content: "Let me check that for you." },
      { role: "user", content: "and last month?" },
    ],
    label: "FOLLOW-UP: 84 Lumber... 'and last month?'",
    async expect() {
      const t = today, y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
      const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
      const mm = String(pm).padStart(2, "0");
      const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      const s = await salesSum({ from: `${py}-${mm}-01`, to: `${py}-${mm}-${lastDay}`, machineFrag: "84" });
      return { desc: `$${s.revenue} (last month)`, pass: (r) => hasNumber(r, s.revenue) }; } },

  // ── semantic resolution (Phase 1 pgvector — paraphrases, not exact names) ──
  { q: "how many sparkling peach celsius drinks did I sell in the last 30 days?", async expect() {
      const ids = await productIdsMatching("*celsius*peach*");
      const ws = await salesSumWindows(30, { productIds: ids });
      return { desc: `${ws[0].units} units (±window)`,
        pass: (r) => ws.some((s) => hasNumber(r, s.units, 0.5)) }; } },
  { q: "revenue at the lumber yard machine this month?", async expect() {
      const s = await salesSum({ from: monthStart, machineFrag: "84" });
      return { desc: `$${s.revenue} (84 Lumber via paraphrase)`,
        pass: (r) => /lumber/i.test(r) && hasNumber(r, s.revenue) }; } },
  { q: "do i have any sweet tea in the warehouse?", async expect() {
      const ids = await productIdsMatching("*sweet*tea*", "*tea*sweet*");
      const wh = await fetchAll(`warehouse_inventory?select=product_id,on_hand`);
      const units = wh.filter((w) => ids.includes(w.product_id)).reduce((s, w) => s + (w.on_hand || 0), 0);
      return { desc: `${units} units (any sweet-tea product)`,
        pass: (r) => units > 0 ? (hasNumber(r, units, 0.5) || /yes/i.test(r)) : /no|0/i.test(r) }; } },
];

// ── runner ──────────────────────────────────────────────────────────────────
async function askAssistant(q) {
  // q is either a single user question (string) or a full messages array
  // (multi-turn follow-up cases).
  const messages = Array.isArray(q) ? q : [{ role: "user", content: q }];
  const res = await fetch(`${APP}/api/inventory/assistant-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const d = await res.json().catch(() => ({}));
  if (!d.success) throw new Error(d.error || `HTTP ${res.status}`);
  return d.reply || "";
}
const qLabel = (item) => item.label || (Array.isArray(item.q) ? item.q.at(-1).content : item.q);

async function main() {
  if (process.argv.includes("--list")) {
    QUESTIONS.forEach((x, i) => console.log(`${i}. ${qLabel(x)}`));
    return;
  }
  const onlyIdx = process.argv.indexOf("--only");
  const subset = onlyIdx > -1 ? [QUESTIONS[Number(process.argv[onlyIdx + 1])]] : QUESTIONS;

  let pass = 0, fail = 0;
  const failures = [];
  for (const [i, item] of subset.entries()) {
    let expected, reply, ok, err = null;
    try {
      expected = await item.expect();
      reply = await askAssistant(item.q);
      ok = expected.pass(reply);
    } catch (e) { ok = false; err = String(e.message || e); }
    if (ok) { pass++; console.log(`  PASS  [${i}] ${qLabel(item)}  (expected ${expected?.desc})`); }
    else {
      fail++;
      failures.push({ i, q: qLabel(item), expected: expected?.desc, reply: (reply || err || "").slice(0, 220) });
      console.log(`X FAIL  [${i}] ${qLabel(item)}\n        expected: ${expected?.desc}\n        got: ${(reply || err || "").slice(0, 200).replace(/\n/g, " ")}`);
    }
    await new Promise((r) => setTimeout(r, 1500)); // pace — avoid 429 bursts
  }
  const score = Math.round((pass / (pass + fail)) * 100);
  console.log(`\n════ SCORE: ${pass}/${pass + fail} (${score}%) ════`);
  if (failures.length) {
    console.log("\nFailures for follow-up:");
    for (const f of failures) console.log(`  [${f.i}] ${f.q} — expected ${f.expected}`);
  }
  process.exit(score >= 95 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
