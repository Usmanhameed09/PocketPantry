import { NextRequest } from "next/server";
import {
  getGoogleCalendarTokenRecord,
  saveGoogleCalendarTokenRecord,
  type GoogleCalendarTokenRecord,
} from "@/lib/google-calendar-store";

const GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const DEFAULT_CALENDAR_SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
].join(" ");
const DEFAULT_TIMEZONE = "America/New_York";

export type GoogleCalendarBusySlot = {
  start: string;
  end: string;
};

type GoogleFreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: GoogleCalendarBusySlot[];
    }
  >;
};

export type GoogleCalendarEventInsertResponse = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function getGoogleCalendarClientId() {
  return getRequiredEnv("GOOGLE_CLIENT_ID");
}

function getGoogleCalendarClientSecret() {
  return getRequiredEnv("GOOGLE_CLIENT_SECRET");
}

export function getGoogleCalendarScope() {
  return process.env.GOOGLE_CALENDAR_SCOPE || DEFAULT_CALENDAR_SCOPE;
}

export function getGoogleCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

export function getGoogleCalendarTimeZone() {
  return process.env.GOOGLE_CALENDAR_TIMEZONE || DEFAULT_TIMEZONE;
}

export function getGoogleCalendarMeetingDurationMinutes() {
  const value = Number(process.env.GOOGLE_CALENDAR_MEETING_DURATION_MINUTES || "30");
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export function getGoogleCalendarLocation() {
  return process.env.GOOGLE_CALENDAR_LOCATION || "In person";
}

export function buildGoogleCalendarCallbackUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/google-calendar/callback`;
}

export function resolveGoogleCalendarOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export function buildGoogleCalendarAuthUrl(params: {
  origin: string;
  state: string;
}) {
  const url = new URL(GOOGLE_AUTH_BASE_URL);
  url.searchParams.set("client_id", getGoogleCalendarClientId());
  url.searchParams.set("redirect_uri", buildGoogleCalendarCallbackUrl(params.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", getGoogleCalendarScope());
  url.searchParams.set("state", params.state);
  return url.toString();
}

async function googleTokenRequest(body: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google token request failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

export async function exchangeGoogleCalendarCode(params: {
  code: string;
  origin: string;
}) {
  const tokens = await googleTokenRequest(
    new URLSearchParams({
      code: params.code,
      client_id: getGoogleCalendarClientId(),
      client_secret: getGoogleCalendarClientSecret(),
      redirect_uri: buildGoogleCalendarCallbackUrl(params.origin),
      grant_type: "authorization_code",
    })
  );

  const record: GoogleCalendarTokenRecord = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expiry_date: Date.now() + Number(tokens.expires_in || 0) * 1000,
    calendar_id: getGoogleCalendarId(),
    connected_at: new Date().toISOString(),
  };

  await saveGoogleCalendarTokenRecord(record);
  return record;
}

async function refreshGoogleCalendarAccessToken(record: GoogleCalendarTokenRecord) {
  if (!record.refresh_token) {
    throw new Error("Google Calendar refresh token is missing. Reconnect Google Calendar.");
  }

  const tokens = await googleTokenRequest(
    new URLSearchParams({
      refresh_token: record.refresh_token,
      client_id: getGoogleCalendarClientId(),
      client_secret: getGoogleCalendarClientSecret(),
      grant_type: "refresh_token",
    })
  );

  const refreshed: GoogleCalendarTokenRecord = {
    ...record,
    access_token: tokens.access_token,
    token_type: tokens.token_type || record.token_type,
    scope: tokens.scope || record.scope,
    expiry_date: Date.now() + Number(tokens.expires_in || 0) * 1000,
    calendar_id: record.calendar_id || getGoogleCalendarId(),
    connected_at: record.connected_at || new Date().toISOString(),
  };

  await saveGoogleCalendarTokenRecord(refreshed);
  return refreshed;
}

export async function getValidGoogleCalendarTokenRecord() {
  const record = await getGoogleCalendarTokenRecord();
  if (!record?.refresh_token && !record?.access_token) {
    throw new Error("Google Calendar is not connected yet.");
  }

  const expiry = Number(record.expiry_date || 0);
  if (record.access_token && expiry && expiry - Date.now() > 60_000) {
    return record;
  }

  return refreshGoogleCalendarAccessToken(record);
}

async function googleCalendarFetch<T>(pathname: string, init?: RequestInit): Promise<T> {
  const tokenRecord = await getValidGoogleCalendarTokenRecord();
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokenRecord.access_token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Google Calendar request failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export async function getGoogleCalendarStatus() {
  const record = await getGoogleCalendarTokenRecord();
  return {
    connected: Boolean(record?.refresh_token || record?.access_token),
    calendarId: record?.calendar_id || getGoogleCalendarId(),
    connectedAt: record?.connected_at || null,
  };
}

export async function queryGoogleCalendarBusySlots(params: { timeMin: string; timeMax: string }) {
  const calendarId = getGoogleCalendarId();
  const response = await googleCalendarFetch<GoogleFreeBusyResponse>("/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      timeZone: getGoogleCalendarTimeZone(),
      items: [{ id: calendarId }],
    }),
  });

  return response.calendars?.[calendarId]?.busy || [];
}

export async function createGoogleCalendarEvent(params: {
  summary: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  attendeeEmails: string[];
}) {
  const calendarId = encodeURIComponent(getGoogleCalendarId());
  return googleCalendarFetch<GoogleCalendarEventInsertResponse>(
    `/calendars/${calendarId}/events?sendUpdates=all`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: params.summary,
        description: params.description,
        location: params.location || getGoogleCalendarLocation(),
        start: {
          dateTime: params.startTime,
          timeZone: getGoogleCalendarTimeZone(),
        },
        end: {
          dateTime: params.endTime,
          timeZone: getGoogleCalendarTimeZone(),
        },
        attendees: params.attendeeEmails.map((email) => ({ email })),
      }),
    }
  );
}
