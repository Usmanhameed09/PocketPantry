import { NextResponse } from "next/server";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

export const maxDuration = 30;

const PREDICTION_API = process.env.PREDICTION_API_URL || "http://localhost:5000";

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
