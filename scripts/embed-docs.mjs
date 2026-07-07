/**
 * Docs RAG (Phase 4) — embed the SOP markdown so the assistant answers
 * "what does Approve do?", "how does waste work?", "how do I log a refill?"
 * from the REAL documentation instead of guessing.
 *
 * Chunks docs/SOPs/*.md by heading, embeds each chunk, upserts to ai_docs.
 * Run whenever the SOPs change:  node scripts/embed-docs.mjs
 *
 * Prereq: `vector` extension enabled (same as embed-entities).
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
const URL_ = pick("NEXT_PUBLIC_SUPABASE_URL");
const KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI = pick("OPENAI_API_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const DOCS_DIR = resolve(__dirname, "../docs/SOPs");

async function exec(sql) {
  const r = await fetch(`${URL_}/rest/v1/rpc/admin_exec_sql`, { method: "POST", headers: H, body: JSON.stringify({ sql }) });
  if (!r.ok) throw new Error(`DDL: ${(await r.text()).slice(0, 200)}`);
}

async function ensureSchema() {
  await exec(`CREATE TABLE IF NOT EXISTS ai_docs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc text NOT NULL,
    section text NOT NULL,
    content text NOT NULL,
    embedding vector(1536),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(doc, section)
  )`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_ai_docs_embedding
    ON ai_docs USING hnsw (embedding vector_cosine_ops)`);
  await exec(`CREATE OR REPLACE FUNCTION match_ai_docs(
      query_embedding vector(1536), match_count int DEFAULT 5)
    RETURNS TABLE(doc text, section text, content text, similarity float)
    LANGUAGE sql STABLE
    SET search_path = public, extensions
    AS $$
      SELECT d.doc, d.section, d.content, 1 - (d.embedding <=> query_embedding) AS similarity
      FROM ai_docs d
      WHERE d.embedding IS NOT NULL
      ORDER BY d.embedding <=> query_embedding
      LIMIT match_count
    $$`);
}

// Chunk a markdown doc by "## " headings. Keep the H1 title as prefix context
// on every chunk so a section like "Waste & Turns" carries which page it's on.
function chunkMarkdown(title, text) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let heading = "Overview";
  let buf = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body.length > 40) chunks.push({ section: heading, content: `${title} — ${heading}\n\n${body}` });
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) { flush(); heading = h[1].replace(/[#*]/g, "").trim(); }
    else buf.push(line);
  }
  flush();
  return chunks;
}

async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 256) {
    const batch = texts.slice(i, i + 256);
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: batch }),
    });
    if (!r.ok) throw new Error(`embeddings ${r.status}: ${(await r.text()).slice(0, 200)}`);
    out.push(...(await r.json()).data.map((x) => x.embedding));
    console.log(`embedded ${Math.min(i + 256, texts.length)}/${texts.length}`);
  }
  return out;
}

async function main() {
  await ensureSchema();
  console.log("schema ok");
  const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
  const rows = [];
  for (const f of files) {
    const text = readFileSync(resolve(DOCS_DIR, f), "utf8");
    const title = (text.match(/^#\s+(.*)/m) || [, f.replace(/\.md$/, "")])[1].trim();
    for (const c of chunkMarkdown(title, text)) {
      rows.push({ doc: f.replace(/\.md$/, ""), section: c.section, content: c.content });
    }
  }
  console.log(`${rows.length} doc chunks from ${files.length} files`);
  const vectors = await embed(rows.map((r) => r.content));
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50).map((r, j) => ({ ...r, embedding: vectors[i + j], updated_at: now }));
    const res = await fetch(`${URL_}/rest/v1/ai_docs?on_conflict=doc,section`, {
      method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`upsert ${res.status}: ${(await res.text()).slice(0, 200)}`);
    console.log(`upserted ${Math.min(i + 50, rows.length)}/${rows.length}`);
  }
  console.log("DONE — ai_docs built.");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
