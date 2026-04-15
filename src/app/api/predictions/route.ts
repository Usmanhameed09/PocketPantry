import { NextResponse } from "next/server";

const PREDICTION_API = process.env.PREDICTION_API_URL || "http://localhost:5000";

export async function GET() {
  try {
    const res = await fetch(`${PREDICTION_API}/api/predictions`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Prediction API unavailable" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Cannot connect to prediction API. Make sure the Python server is running on port 5000." },
      { status: 503 }
    );
  }
}

export async function POST() {
  try {
    const res = await fetch(`${PREDICTION_API}/api/predictions/retrain`, {
      method: "POST",
      cache: "no-store",
    });

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
