import {
  createGoogleCalendarEvent,
  getGoogleCalendarLocation,
  getGoogleCalendarMeetingDurationMinutes,
  getGoogleCalendarStatus,
  queryGoogleCalendarBusySlots,
} from "@/lib/google-calendar";
import { getLead, logOutreachAction, updateLead } from "@/lib/leads-store";

const EASTERN_TIMEZONE = "America/New_York";
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function getTimeZoneOffsetString(date: Date, timeZone = EASTERN_TIMEZONE) {
  const timeZoneName =
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value || "GMT-4";

  const match = timeZoneName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (!match) {
    return "-04:00";
  }

  const hours = match[1].startsWith("+") || match[1].startsWith("-")
    ? match[1]
    : `+${match[1]}`;
  const paddedHours = `${hours[0]}${hours.slice(1).padStart(2, "0")}`;
  const minutes = match[2] || "00";
  return `${paddedHours}:${minutes}`;
}

function getTimeZoneParts(date: Date, timeZone = EASTERN_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const lookup = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(lookup("year")),
    month: Number(lookup("month")),
    day: Number(lookup("day")),
    weekday: lookup("weekday").toLowerCase(),
    hour: Number(lookup("hour")),
    minute: Number(lookup("minute")),
  };
}

function buildEasternIso(year: number, month: number, day: number, hour: number, minute: number) {
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffsetString(probe, EASTERN_TIMEZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
}

function addDaysToEtDate(year: number, month: number, day: number, daysToAdd: number) {
  const pivot = new Date(Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0));
  return {
    year: pivot.getUTCFullYear(),
    month: pivot.getUTCMonth() + 1,
    day: pivot.getUTCDate(),
  };
}

function parseTimePortion(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized.includes("noon")) return { hour: 12, minute: 0 };
  if (normalized.includes("midnight")) return { hour: 0, minute: 0 };
  if (normalized.includes("morning")) return { hour: 10, minute: 0 };
  if (normalized.includes("afternoon")) return { hour: 14, minute: 0 };
  if (normalized.includes("evening")) return { hour: 17, minute: 0 };

  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const meridiem = match[3];

  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  return { hour, minute };
}

function hasExplicitTimeInValue(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  return (
    /\b\d{1,2}:\d{2}\s*(am|pm)?\b/.test(normalized) ||
    /\b\d{1,2}\s*(am|pm)\b/.test(normalized) ||
    /\b(morning|afternoon|evening|noon|midnight)\b/.test(normalized) ||
    /t\d{2}:\d{2}/i.test(normalized)
  );
}

function parseRelativeRequestedTime(value: string) {
  const normalized = value.trim().toLowerCase().replace(/,/g, " ");
  const currentEt = getTimeZoneParts(new Date(), EASTERN_TIMEZONE);
  const parsedTime = parseTimePortion(normalized);
  if (!parsedTime) {
    return undefined;
  }

  const weekdayMatch = normalized.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const targetWeekday = WEEKDAY_INDEX[weekdayMatch[1]];
    const currentWeekday = WEEKDAY_INDEX[currentEt.weekday];
    let daysAhead = (targetWeekday - currentWeekday + 7) % 7;
    if (
      daysAhead === 0 &&
      (parsedTime.hour < currentEt.hour || (parsedTime.hour === currentEt.hour && parsedTime.minute <= currentEt.minute))
    ) {
      daysAhead = 7;
    }

    const targetDate = addDaysToEtDate(currentEt.year, currentEt.month, currentEt.day, daysAhead);
    return buildEasternIso(targetDate.year, targetDate.month, targetDate.day, parsedTime.hour, parsedTime.minute);
  }

  const monthMatch = normalized.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthMatch) {
    const month = MONTH_INDEX[monthMatch[1]];
    const day = Number(monthMatch[2]);
    let year = currentEt.year;
    const candidateThisYear = new Date(buildEasternIso(year, month, day, parsedTime.hour, parsedTime.minute));
    if (candidateThisYear.getTime() < Date.now()) {
      year += 1;
    }
    return buildEasternIso(year, month, day, parsedTime.hour, parsedTime.minute);
  }

  if (normalized.includes("tomorrow")) {
    const targetDate = addDaysToEtDate(currentEt.year, currentEt.month, currentEt.day, 1);
    return buildEasternIso(targetDate.year, targetDate.month, targetDate.day, parsedTime.hour, parsedTime.minute);
  }

  if (normalized.includes("today")) {
    return buildEasternIso(currentEt.year, currentEt.month, currentEt.day, parsedTime.hour, parsedTime.minute);
  }

  return undefined;
}

export function toIsoString(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return parseRelativeRequestedTime(value);
  }
  return date.toISOString();
}

export function startOfDayIso(value: string) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

export function addDaysIso(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export async function getCalendlyAvailabilityDecision(desiredStartTime: string) {
  const windowStart = startOfDayIso(desiredStartTime);
  const windowEnd = addDaysIso(windowStart, 7);
  const busySlots = await queryGoogleCalendarBusySlots({
    timeMin: windowStart,
    timeMax: windowEnd,
  });
  const desiredMillis = new Date(desiredStartTime).getTime();
  const durationMinutes = getGoogleCalendarMeetingDurationMinutes();
  const durationMs = durationMinutes * 60 * 1000;
  const workdayStartHour = Number(process.env.GOOGLE_CALENDAR_WORKDAY_START_HOUR || "9");
  const workdayEndHour = Number(process.env.GOOGLE_CALENDAR_WORKDAY_END_HOUR || "17");
  const skipWeekends = (process.env.GOOGLE_CALENDAR_SKIP_WEEKENDS || "true").toLowerCase() !== "false";
  const availableTimes: Array<{
    start_time: string;
    scheduling_url: string;
    status: string;
    invitees_remaining: number;
  }> = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const currentDayIso = addDaysIso(windowStart, dayIndex);
    const currentDay = new Date(currentDayIso);
    const currentParts = getTimeZoneParts(currentDay, EASTERN_TIMEZONE);

    if (skipWeekends && (currentParts.weekday === "saturday" || currentParts.weekday === "sunday")) {
      continue;
    }

    for (let hour = workdayStartHour; hour < workdayEndHour; hour += 1) {
      for (const minute of [0, 30]) {
        const slotStart = buildEasternIso(
          currentParts.year,
          currentParts.month,
          currentParts.day,
          hour,
          minute
        );
        const slotEnd = new Date(new Date(slotStart).getTime() + durationMs).toISOString();
        const slotStartMillis = new Date(slotStart).getTime();

        if (slotStartMillis < Date.now()) {
          continue;
        }

        const overlapsBusySlot = busySlots.some((busySlot) => {
          const busyStart = new Date(busySlot.start).getTime();
          const busyEnd = new Date(busySlot.end).getTime();
          return slotStartMillis < busyEnd && new Date(slotEnd).getTime() > busyStart;
        });

        if (!overlapsBusySlot) {
          availableTimes.push({
            start_time: slotStart,
            scheduling_url: "",
            status: "available",
            invitees_remaining: 1,
          });
        }
      }
    }
  }

  const exactSlot = availableTimes.find((slot) => new Date(slot.start_time).getTime() === desiredMillis);
  const nearestSlot =
    exactSlot ||
    [...availableTimes].sort((a, b) => {
      const aDistance = Math.abs(new Date(a.start_time).getTime() - desiredMillis);
      const bDistance = Math.abs(new Date(b.start_time).getTime() - desiredMillis);
      return aDistance - bDistance;
    })[0];

  return {
    eventType: {
      name: "Google Calendar",
      uri: "primary",
      scheduling_url: "",
      locations: [{ kind: "physical", location: getGoogleCalendarLocation() }],
    },
    availableTimes,
    exactSlot,
    nearestSlot,
  };
}

export async function bookLeadInCalendly(params: { leadId: string; startTime?: string }) {
  const lead = await getLead(params.leadId);
  if (!lead) {
    throw new Error("Lead not found");
  }

  const calendarStatus = await getGoogleCalendarStatus();
  if (!calendarStatus.connected) {
    return {
      ok: false as const,
      schedulingRequired: true as const,
      requestedStartTime: params.startTime || lead.visitDate || lead.callbackDate || null,
      availableStartTime: null,
      eventType: {
        name: "Google Calendar",
        uri: calendarStatus.calendarId,
        schedulingUrl: "",
      },
      schedulingUrl: "/api/google-calendar/connect",
      error: "Google Calendar is not connected yet. Connect it once to enable booking and invite sending.",
    };
  }

  const requestedTimeInput = params.startTime || lead.visitDate || lead.callbackDate;
  const desiredStartTime = toIsoString(requestedTimeInput);
  if (!desiredStartTime) {
    throw new Error("Lead does not have a valid ISO appointment time yet.");
  }

  if (!hasExplicitTimeInValue(requestedTimeInput)) {
    return {
      ok: false as const,
      schedulingRequired: true as const,
      requestedStartTime: requestedTimeInput || null,
      availableStartTime: null,
      eventType: {
        name: "Google Calendar",
        uri: calendarStatus.calendarId,
        schedulingUrl: "",
      },
      schedulingUrl: "",
      error: "A specific meeting time still needs to be confirmed before booking. Please confirm both the day and time with the prospect.",
    };
  }

  if (!lead.email) {
    throw new Error("Lead email is required to book a Google Calendar meeting.");
  }

  const { eventType, availableTimes, exactSlot, nearestSlot } = await getCalendlyAvailabilityDecision(desiredStartTime);

  if (!nearestSlot) {
    return {
      ok: false as const,
      unavailable: true as const,
      requestedStartTime: desiredStartTime,
      eventType: {
        name: eventType.name,
        uri: eventType.uri,
        schedulingUrl: "",
      },
      availableSlots: availableTimes.slice(0, 12),
    };
  }

  const bookedStartTime = nearestSlot.start_time;
  const autoAdjusted = !exactSlot;
  const durationMinutes = getGoogleCalendarMeetingDurationMinutes();
  const booking = await createGoogleCalendarEvent({
    summary: `PocketPantry Site Visit - ${lead.business}`,
    description: [
      `Contact: ${lead.contact || "N/A"}`,
      `Phone: ${lead.phone || "N/A"}`,
      `Email: ${lead.email || "N/A"}`,
      lead.address ? `Address: ${lead.address}` : "",
      Array.isArray(lead.painPoints) && lead.painPoints.length > 0
        ? `Notes: ${lead.painPoints.join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    location: lead.address || getGoogleCalendarLocation(),
    startTime: bookedStartTime,
    endTime: new Date(new Date(bookedStartTime).getTime() + durationMinutes * 60 * 1000).toISOString(),
    attendeeEmails: [lead.email],
  });

  await updateLead(params.leadId, {
    visitDate: bookedStartTime,
    visitTime: "",
    lastActivity: `Google Calendar booked${autoAdjusted ? " (nearest slot)" : ""} - ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
  });

  await logOutreachAction(params.leadId, "site_visit_scheduled", {
    visitDate: bookedStartTime,
    requestedStartTime: desiredStartTime,
    autoAdjusted,
    googleCalendarEventId: booking.id,
    googleCalendarEventLink: booking.htmlLink,
    googleCalendarConferenceLink: booking.hangoutLink,
  });

  return {
    ok: true as const,
    booked: true as const,
    autoAdjusted,
    requestedStartTime: desiredStartTime,
    booking: {
      inviteeUri: null,
      eventUri: booking.htmlLink || "",
      cancelUrl: null,
      rescheduleUrl: null,
      startTime: bookedStartTime,
    },
    eventType: {
      name: eventType.name,
      schedulingUrl: "",
    },
  };
}
