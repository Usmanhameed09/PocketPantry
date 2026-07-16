import { NextResponse } from "next/server";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";
import { createServerClient } from "@/lib/supabase";
import { dateNDaysAgoInOperatorTz } from "@/lib/operator-timezone";

export const maxDuration = 30;

const PREDICTION_API = process.env.PREDICTION_API_URL || "http://localhost:5000";

// ── Product-Health guardrail ────────────────────────────────────────────────
// The Python model scores each EXACT product-name variant on static monthly
// CSVs with no recency check — so a renamed/discontinued name string ("Red
// Bull 12oz Blue", data ends 2025-05) gets flagged "Remove" while the product
// family actually sells 60+/month under its current names. Before serving
// recommendations, cross-check each "Remove" against LIVE data and suppress:
//   - families that still sell (>= 10 units in the last 30 days), and
//   - names that aren't stocked in ANY machine (nothing to remove).
const tokensOf = (s: string) =>
  s.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9.]+/g, " ").trim().split(/\s+/)
    .map((w) => {
      let x = w.replace(/^([a-z]+)[\d.]+$/, "$1");
      if (x.length >= 4 && x.endsWith("s") && !x.endsWith("ss")) x = x.slice(0, -1);
      return x;
    })
    .filter((w) => w.length > 2 && !/^[\d.]+$/.test(w));

async function applyProductHealthGuardrail(json: Record<string, unknown>): Promise<void> {
  const perf = json.productPerformance as Array<{ product?: string; recommendation?: string }> | undefined;
  if (!perf?.length || !perf.some((p) => p.recommendation === "Remove")) return;
  try {
    const supabase = createServerClient();
    const since = dateNDaysAgoInOperatorTz(30);
    const PAGE = 1000;
    const products: Array<{ id: string; name: string }> = [];
    for (let f = 0; f < 200000; f += PAGE) {
      const { data } = await supabase.from("products").select("id, name").range(f, f + PAGE - 1);
      if (!data?.length) break;
      products.push(...(data as Array<{ id: string; name: string }>));
      if (data.length < PAGE) break;
    }
    const soldBy = new Map<string, number>();
    for (let f = 0; f < 100000; f += PAGE) {
      const { data } = await supabase.from("daily_sales").select("product_id, units_sold").gte("sale_date", since).range(f, f + PAGE - 1);
      if (!data?.length) break;
      for (const r of data) soldBy.set(r.product_id as string, (soldBy.get(r.product_id as string) || 0) + ((r.units_sold as number) || 0));
      if (data.length < PAGE) break;
    }
    const { data: mi } = await supabase.from("machine_inventory").select("product_id").gt("estimated_remaining", -1).range(0, 9999);
    const inMachine = new Set((mi || []).map((r) => r.product_id as string));

    const prodTokens = products.map((p) => ({ id: p.id, set: new Set(tokensOf(p.name)) }));
    const kept: typeof perf = [];
    let suppressed = 0;
    for (const rec of perf) {
      if (rec.recommendation !== "Remove") { kept.push(rec); continue; }
      const recToks = tokensOf(rec.product || "");
      const family = recToks.length
        ? prodTokens.filter((p) => recToks.every((t) => p.set.has(t)))
        : [];
      const familyUnits30d = family.reduce((s, p) => s + (soldBy.get(p.id) || 0), 0);
      const stocked = family.some((p) => inMachine.has(p.id));
      if (familyUnits30d >= 10 || !stocked) { suppressed++; continue; } // stale-model noise
      kept.push(rec);
    }
    json.productPerformance = kept;
    json.productHealthSuppressed = suppressed;
  } catch { /* guardrail is best-effort — never break the page */ }
}

async function fetchPredictions() {
  // Bounded so a slow/hung VPS can't run us into Vercel's function timeout
  // (which returns non-JSON HTML). 20s is comfortably above the ~2-5s norm.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(`${PREDICTION_API}/api/predictions`, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  // CRITICAL: THROW on a bad upstream response so the caller's catch returns a
  // real HTTP error status. Previously this returned a { success:false } object
  // with HTTP 200 — the page's `res.ok` guard let it through, then destructured
  // undefined fields and crashed on `.reduce` (the "application error" Arthur hit).
  if (!res.ok) {
    throw new Error(`Prediction API returned ${res.status}`);
  }
  const json = await res.json();
  // Also reject a well-formed 200 that lacks the fields the page renders, so we
  // never hand the page a payload it will crash on. The page reads
  // machineForecast (array), summary (object) and dataRange (object) at the top
  // level before any optional chaining, so all three must be present.
  if (
    !json ||
    !Array.isArray(json.machineForecast) ||
    typeof json.summary !== "object" || json.summary === null ||
    typeof json.dataRange !== "object" || json.dataRange === null
  ) {
    throw new Error("Prediction API returned an unexpected payload");
  }
  await applyProductHealthGuardrail(json);
  return json;
}

export async function GET(req: Request) {
  try {
    const bypass = new URL(req.url).searchParams.get("fresh") === "1";
    // Predictions are the most expensive read in the app (round trip to
    // the Python service on the VPS, ~2-5s). 30-min TTL because the
    // model only retrains on operator action.
    const data = bypass
      ? await fetchPredictions()
      : await withCache(CACHE_KEYS.predictions, TTL.predictions, fetchPredictions);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Cannot reach the prediction service. It may be restarting — try again in a moment." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const init: RequestInit = {
      method: "POST",
      cache: "no-store",
    };

    if (contentType.includes("multipart/form-data")) {
      const incomingForm = await request.formData();
      const outgoingForm = new FormData();

      for (const file of incomingForm.getAll("files")) {
        if (file instanceof File) {
          outgoingForm.append("files", file, file.name);
        }
      }

      init.body = outgoingForm;
    }

    const res = await fetch(`${PREDICTION_API}/api/predictions/retrain`, init);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Retrain failed" }));
      return NextResponse.json(err, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Cannot connect to prediction API for retraining." },
      { status: 503 }
    );
  }
}
