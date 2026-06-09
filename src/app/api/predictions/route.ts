import { NextResponse } from "next/server";
import { withCache, CACHE_KEYS, TTL } from "@/lib/cache";

const PREDICTION_API = process.env.PREDICTION_API_URL || "http://localhost:5000";

async function fetchPredictions() {
  const res = await fetch(`${PREDICTION_API}/api/predictions`, { cache: "no-store" });
  if (!res.ok) {
    return { success: false, error: "Prediction API unavailable", status: res.status };
  }
  return await res.json();
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
      { error: "Cannot connect to prediction API. Make sure the Python server is running on port 5000." },
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
