/**
 * Entity embedding index (RAG Phase 1) — server-side rebuild.
 *
 * Keeps ai_entities in sync with the catalog so the assistant's semantic
 * name resolution (semanticResolve in ai-tools) stays fresh as machines,
 * product groups, and leads change. Called by the refresh cron and reusable
 * from a one-off script.
 *
 * Full rebuild is intentional over incremental change-tracking: the whole set
 * is ~600 entities, embeds in one OpenAI batch (~$0.006), and a full rebuild
 * can never drift from partial-update bugs. The `ai_entities` upsert is keyed
 * on (entity_type, ref_id), so re-runs are idempotent.
 */

import { createServerClient } from "@/lib/supabase";

type Entity = { entity_type: string; ref_id: string; name: string; content: string };
// Loose builder type — just enough surface for the filters we chain
// (.not/.gt/.is), all of which return the builder for further chaining.
type QueryBuilder = {
  range: (a: number, b: number) => QueryBuilder;
  not: (c: string, op: string, v: unknown) => QueryBuilder;
  gt: (c: string, v: unknown) => QueryBuilder;
  is: (c: string, v: unknown) => QueryBuilder;
  then: Promise<{ data: unknown[] | null; error: { message: string } | null }>["then"];
};

async function fetchAllRows<T>(
  supabase: ReturnType<typeof createServerClient>,
  table: string,
  select: string,
  filter?: (q: QueryBuilder) => QueryBuilder,
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 200000; from += PAGE) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1) as unknown as QueryBuilder;
    if (filter) q = filter(q);
    const { data, error } = await (q as unknown as Promise<{ data: T[] | null; error: { message: string } | null }>);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function buildEntities(): Promise<Entity[]> {
  const supabase = createServerClient();
  const entities: Entity[] = [];

  const machines = await fetchAllRows<{ id: string; name: string; nayax_device_id: string | null }>(
    supabase, "machines", "id, name, nayax_device_id");
  for (const m of machines) {
    entities.push({ entity_type: "machine", ref_id: m.id, name: m.name,
      content: `vending machine ${m.name} (device ${m.nayax_device_id || m.id})` });
  }

  const groups = await fetchAllRows<{ id: string; canonical_name: string }>(
    supabase, "product_groups", "id, canonical_name");
  const grouped = await fetchAllRows<{ id: string; name: string; group_id: string }>(
    supabase, "products", "id, name, group_id", (q) => q.not("group_id", "is", null));
  const byGroup = new Map<string, string[]>();
  for (const p of grouped) {
    if (!byGroup.has(p.group_id)) byGroup.set(p.group_id, []);
    byGroup.get(p.group_id)!.push(p.name);
  }
  for (const g of groups) {
    const variants = byGroup.get(g.id) || [];
    entities.push({ entity_type: "product_group", ref_id: g.id, name: g.canonical_name,
      content: `product ${g.canonical_name}. also known as: ${variants.join("; ")}` });
  }

  // Active singleton products only (with stock, machine presence, or sales) —
  // embedding thousands of dormant import rows would just add retrieval noise.
  const [wh, mi, sold] = await Promise.all([
    fetchAllRows<{ product_id: string }>(supabase, "warehouse_inventory", "product_id", (q) => q.gt("on_hand", 0)),
    fetchAllRows<{ product_id: string }>(supabase, "machine_inventory", "product_id"),
    fetchAllRows<{ product_id: string }>(supabase, "daily_sales", "product_id"),
  ]);
  const active = new Set<string>([
    ...wh.map((r) => r.product_id),
    ...mi.map((r) => r.product_id),
    ...sold.map((r) => r.product_id),
  ]);
  const singles = await fetchAllRows<{ id: string; name: string; category: string | null; group_id: string | null }>(
    supabase, "products", "id, name, category, group_id", (q) => q.is("group_id", null));
  for (const p of singles) {
    if (!active.has(p.id)) continue;
    entities.push({ entity_type: "product", ref_id: p.id, name: p.name,
      content: `product ${p.name} (${p.category || "uncategorized"})` });
  }

  const leads = await fetchAllRows<{ id: string; business: string; vertical: string | null }>(
    supabase, "leads", "id, business, vertical");
  for (const l of leads) {
    if (!l.business) continue;
    entities.push({ entity_type: "lead", ref_id: l.id, name: l.business,
      content: `sales lead ${l.business}${l.vertical ? ` (${l.vertical})` : ""}` });
  }

  return entities;
}

async function embed(texts: string[], apiKey: string): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 512) {
    const batch = texts.slice(i, i + 512);
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: batch }),
    });
    if (!r.ok) throw new Error(`embeddings ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    out.push(...(d.data as Array<{ embedding: number[] }>).map((x) => x.embedding));
  }
  return out;
}

export async function rebuildEntityIndex(): Promise<{ embedded: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const supabase = createServerClient();

  const entities = await buildEntities();
  const vectors = await embed(entities.map((e) => e.content), apiKey);

  const now = new Date().toISOString();
  for (let i = 0; i < entities.length; i += 100) {
    const chunk = entities.slice(i, i + 100).map((e, j) => ({
      ...e, embedding: vectors[i + j], updated_at: now,
    }));
    const { error } = await supabase
      .from("ai_entities")
      .upsert(chunk, { onConflict: "entity_type,ref_id" });
    if (error) throw new Error(`upsert: ${error.message}`);
  }
  return { embedded: entities.length };
}
