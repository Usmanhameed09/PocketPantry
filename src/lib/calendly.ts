const CALENDLY_BASE_URL = "https://api.calendly.com";

export const CALENDLY_SCHEDULING_API_PLAN_ERROR =
  "The Scheduling API is only available on paid Calendly plans.";

type CalendlyUserResponse = {
  resource: {
    uri: string;
    current_organization: string;
    timezone: string;
    scheduling_url: string;
    email: string;
    name: string;
  };
};

type CalendlyEventType = {
  uri: string;
  name: string;
  active: boolean;
  booking_method: string;
  duration: number;
  scheduling_url: string;
  locations: Array<{
    kind: string;
    location?: string;
  }>;
};

function getToken() {
  const token = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Calendly personal access token is not configured.");
  }

  return token;
}

async function calendlyFetch<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CALENDLY_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Calendly request failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export async function getCalendlyCurrentUser() {
  return calendlyFetch<CalendlyUserResponse>("/users/me");
}

export async function listCalendlyEventTypes(userUri: string) {
  const query = new URLSearchParams({
    user: userUri,
    count: "100",
  });

  const response = await calendlyFetch<{ collection: CalendlyEventType[] }>(
    `/event_types?${query.toString()}`
  );

  return response.collection;
}

export async function getDefaultInPersonEventType() {
  const me = await getCalendlyCurrentUser();
  const eventTypes = await listCalendlyEventTypes(me.resource.uri);
  const inPersonEventType =
    eventTypes.find(
      (eventType) =>
        eventType.active &&
        eventType.booking_method === "instant" &&
        eventType.locations.some((location) => location.kind === "physical")
    ) || eventTypes.find((eventType) => eventType.active);

  if (!inPersonEventType) {
    throw new Error("No active Calendly event type found.");
  }

  return {
    user: me.resource,
    eventType: inPersonEventType,
  };
}

export async function listEventTypeAvailableTimes(eventTypeUri: string, startTime: string, endTime: string) {
  const query = new URLSearchParams({
    event_type: eventTypeUri,
    start_time: startTime,
    end_time: endTime,
  });

  const response = await calendlyFetch<{
    collection: Array<{
      start_time: string;
      scheduling_url: string;
      status: string;
      invitees_remaining: number;
    }>;
  }>(`/event_type_available_times?${query.toString()}`);

  return response.collection;
}

export async function createCalendlyInvitee(params: {
  eventTypeUri: string;
  startTime: string;
  locationKind: string;
  locationValue?: string;
  invitee: {
    name?: string;
    email: string;
    timezone: string;
  };
  note?: string;
}) {
  return calendlyFetch<{
    resource: {
      uri: string;
      event: string;
      cancel_url: string | null;
      reschedule_url: string | null;
      name: string | null;
      email: string;
      questions_and_answers?: Array<{
        question: string;
        answer: string;
      }>;
    };
  }>("/invitees", {
    method: "POST",
    body: JSON.stringify({
      event_type: params.eventTypeUri,
      start_time: params.startTime,
      invitee: {
        name: params.invitee.name,
        email: params.invitee.email,
        timezone: params.invitee.timezone,
      },
      location: {
        kind: params.locationKind,
        ...(params.locationValue ? { location: params.locationValue } : {}),
      },
      questions_and_answers: params.note
        ? [
            {
              position: 0,
              question: "Please share anything that will help prepare for our meeting.",
              answer: params.note,
            },
          ]
        : undefined,
    }),
  });
}

export function isCalendlySchedulingPlanError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Calendly request failed (403)") &&
    message.includes(CALENDLY_SCHEDULING_API_PLAN_ERROR)
  );
}

export function buildCalendlySchedulingLink(schedulingUrl: string, invitee?: { name?: string; email?: string }) {
  const url = new URL(schedulingUrl);
  if (invitee?.name) {
    url.searchParams.set("name", invitee.name);
  }
  if (invitee?.email) {
    url.searchParams.set("email", invitee.email);
  }
  return url.toString();
}
