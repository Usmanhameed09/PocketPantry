import { NextResponse } from "next/server";

const scraperUrl = () => process.env.SCRAPER_API_URL || "http://localhost:8000";
const apiKey = () => process.env.SCRAPER_BACKEND_KEY || "";

export async function GET() {
  try {
    const res = await fetch(`${scraperUrl()}/api/machines`, {
      headers: { ...(apiKey() ? { "x-api-key": apiKey() } : {}) },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { success: false, machines: [], total: 0, error: "Failed to fetch machines" },
      { status: 502 }
    );
  }
}
