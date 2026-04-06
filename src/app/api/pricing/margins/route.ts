import { NextResponse } from "next/server";

const scraperUrl = () => process.env.SCRAPER_API_URL || "http://localhost:8000";
const apiKey = () => process.env.SCRAPER_BACKEND_KEY || "";

export async function GET() {
  try {
    const res = await fetch(`${scraperUrl()}/api/margins`, {
      headers: { ...(apiKey() ? { "x-api-key": apiKey() } : {}) },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ margins: { beverage: 50, snack: 45 }, default: 50 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${scraperUrl()}/api/margins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey() ? { "x-api-key": apiKey() } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update margins" },
      { status: 500 }
    );
  }
}
