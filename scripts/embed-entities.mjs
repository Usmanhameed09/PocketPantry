/**
 * Phase 1 — entity embedding pipeline.
 *
 * Builds the ai_entities index: one row per machine, product group, active
 * singleton product, and lead — each with an OpenAI text-embedding-3-small
 * vector. The assistant uses match_ai_entities() as a semantic fallback when
 * exact/fuzzy name resolution fails ("sparkling peach celsius" → the right
 * SKU, misspellings, paraphrases).
 *
 * Prereq: the `vector` extension enabled once (Dashboard → Database →
 * Extensions → vector). Everything else (table, index, RPC) is created here
 * idempotently via admin_exec_sql.
 *
 *   node scripts/embed-entities.mjs          # full (re)build
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const URL_ = pick("NEXT_PUBLIC_SUPABASE_URL");
const KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI = pick("OPENAI_API_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function exec(sql) {
  const r = await fetch(`${URL_}/rest/v1/rpc/admin_exec_sql`, { method: "POST", headers: H, body: JSON.stringify({ sql }) });
  if (!r.ok) throw new Error(`DDL failed: ${(await r.text()).slice(0, 200)}\nSQL: ${sql.slice(0, 80)}`);
}
async function fetchAll(pathQ) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${pathQ}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${pathQ} -> ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function ensureSchema() {
  await exec(`CREATE TABLE IF NOT EXISTS ai_entities (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type text NOT NULL,
    ref_id text NOT NULL,
    name text NOT NULL,
    content text,
    embedding vector(1536),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(entity_type, ref_id)
  )`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_ai_entities_embedding
    ON ai_entities USING hnsw (embedding vector_cosine_ops)`);
  await exec(`CREATE OR REPLACE FUNCTION match_ai_entities(
      query_embedding vector(1536), match_count int DEFAULT 8, filter_type text DEFAULT NULL)
    RETURNS TABLE(entity_type text, ref_id text, name text, content text, similarity float)
    LANGUAGE sql STABLE AS $$
      SELECT e.entity_type, e.ref_id, e.name, e.content,
             1 - (e.embedding <=> query_embedding) AS similarity
      FROM ai_entities e
      WHERE e.embedding IS NOT NULL
        AND (filter_type IS NULL OR e.entity_type = filter_type)
      ORDER BY e.embedding <=> query_embedding
      LIMIT match_count
    $$`);
  console.log("schema ok");
}

async function buildEntities() {
  const entities = [];

  // Machines — name + device id (aliases like "84L" resolve via fuzzy already;
  // the vector handles paraphrases like "the lumber yard machine").
  const machines = await fetchAll("machines?select=id,name,nayax_device_id");
  for (const m of machines) {
    entities.push({ entity_type: "machine", ref_id: m.id, name: m.name,
      content: `vending machine ${m.name} (device ${m.nayax_device_id || m.id})` });
  }

  // Product groups — canonical name + every variant spelling in the content so
  // the vector covers all naming forms.
  const groups = await fetchAll("product_groups?select=id,canonical_name");
  const grouped = await fetchAll("products?select=id,name,group_id&group_id=not.is.null");
  const byGroup = new Map();
  for (const p of grouped) {
    if (!byGroup.has(p.group_id)) byGroup.set(p.group_id, []);
    byGroup.get(p.group_id).push(p.name);
  }
  for (const g of groups) {
    const variants = byGroup.get(g.id) || [];
    entities.push({ entity_type: "product_group", ref_id: g.id, name: g.canonical_name,
      content: `product ${g.canonical_name}. also known as: ${variants.join("; ")}` });
  }

  // Singleton products WITH a signal (stock, machine presence, or sales) —
  // embedding all 6,458 dead import rows would just add noise to retrieval.
  const [wh, mi, sold] = await Promise.all([
    fetchAll("warehouse_inventory?select=product_id,on_hand&on_hand=gt.0"),
    fetchAll("machine_inventory?select=product_id"),
    fetchAll("daily_sales?select=product_id"),
  ]);
  const active = new Set([
    ...wh.map((r) => r.product_id),
    ...mi.map((r) => r.product_id),
    ...sold.map((r) => r.product_id),
  ]);
  const singles = await fetchAll("products?select=id,name,category,group_id&group_id=is.null");
  for (const p of singles) {
    if (!active.has(p.id)) continue;
    entities.push({ entity_type: "product", ref_id: p.id, name: p.name,
      content: `product ${p.name} (${p.category || "uncategorized"})` });
  }

  // Leads — business names for "what stage is <business> in?" style lookups.
  const leads = await fetchAll("leads?select=id,business,vertical");
  for (const l of leads) {
    entities.push({ entity_type: "lead", ref_id: l.id, name: l.business,
      content: `sales lead ${l.business}${l.vertical ? ` (${l.vertical})` : ""}` });
  }

  console.log(`entities: ${entities.length} (machines ${machines.length}, groups ${groups.length}, active singles ${entities.filter((e) => e.entity_type === "product").length}, leads ${leads.length})`);
  return entities;
}

async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 512) {
    const batch = texts.slice(i, i + 512);
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: batch }),
    });
    if (!r.ok) throw new Error(`embeddings ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    out.push(...d.data.map((x) => x.embedding));
    console.log(`embedded ${Math.min(i + 512, texts.length)}/${texts.length}`);
  }
  return out;
}

async function main() {
  await ensureSchema();
  const entities = await buildEntities();
  const vectors = await embed(entities.map((e) => e.content));
  // Upsert in chunks of 200 (payloads with vectors are large).
  for (let i = 0; i < entities.length; i += 200) {
    const chunk = entities.slice(i, i + 200).map((e, j) => ({ ...e, embedding: vectors[i + j], updated_at: new Date().toISOString() }));
    const r = await fetch(`${URL_}/rest/v1/ai_entities?on_conflict=entity_type,ref_id`, {
      method: "POST",
      headers: { ...H, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) throw new Error(`upsert ${r.status}: ${(await r.text()).slice(0, 200)}`);
    console.log(`upserted ${Math.min(i + 200, entities.length)}/${entities.length}`);
  }
  console.log("DONE — ai_entities index built.");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
