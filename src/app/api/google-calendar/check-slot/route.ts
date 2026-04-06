import { NextRequest, NextResponse } from "next/server";
import { getCalendlyAvailabilityDecision, toIsoString } from "@/lib/calendly-booking";

async function buildResponse(requestedTime: string | undefined) {
  const normalizedRequestedTime = toIsoString(requestedTime);

  if (!normalizedRequestedTime) {
    return NextResponse.json({ error: "requestedTime must be a valid ISO date/time." }, { status: 400 });
  }

  const { eventType, exactSlot, nearestSlot, availableTimes } =
    await getCalendlyAvailabilityDecision(normalizedRequestedTime);
  const nearbySlots = availableTimes.slice(0, 5);
  const exactAvailable = Boolean(exactSlot);
  const suggestedSlot = nearestSlot || null;
  const status = exactAvailable ? "exact_available" : suggestedSlot ? "nearest_available" : "unavailable";
  const message = exactAvailable
    ? "Arthur is free at the requested time."
    : suggestedSlot
      ? `Arthur has another appointment around that time. The nearest available slot is ${suggestedSlot.start_time}.`
      : "Arthur does not have an open slot in the next 7 days on Google Calendar.";

  return NextResponse.json({
    ok: true,
    provider: "google_calendar",
    status,
    message,
    requestedTime: normalizedRequestedTime,
    available: exactAvailable,
    exactSlot: exactSlot || null,
    nearestSlot: suggestedSlot,
    calendar: {
      id: eventType.uri,
      name: eventType.name,
      location: eventType.locations?.[0]?.location || null,
    },
    availableSlots: nearbySlots,
  });
}

export async function GET(request: NextRequest) {
  try {
    const requestedTime = request.nextUrl.searchParams.get("requestedTime") || undefined;
    return await buildResponse(requestedTime);
  } catch (error) {
    console.error("[API /google-calendar/check-slot GET] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to check Google Calendar slot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return await buildResponse(body?.requestedTime);
  } catch (error) {
    console.error("[API /google-calendar/check-slot POST] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to check Google Calendar slot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
