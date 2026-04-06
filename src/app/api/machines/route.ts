import { NextResponse } from "next/server";
import { readEnv } from "@/lib/runtime-env";

const scraperUrl = () => readEnv("SCRAPER_API_URL") || "http://localhost:8000";
const apiKey = () => readEnv("SCRAPER_BACKEND_KEY");

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
