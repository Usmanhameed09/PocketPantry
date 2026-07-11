/**
 * Eastern-Time formatters — ALL user-facing clock times in the app display in
 * ET (America/New_York, the operator's business timezone), never the browser's
 * local timezone. Nayax buckets days in ET and the operator reconciles against
 * it, so a browser in another timezone must still show ET.
 */

const ET = "America/New_York";

/** "3:04 PM ET" */
export function timeET(d: Date | string | number = new Date()): string {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: ET,
  }) + " ET";
}

/** "Jul 11, 3:04 PM ET" */
export function dateTimeET(d: Date | string | number): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: ET,
  }) + " ET";
}

/** "Friday, July 11" (ET calendar date) */
export function dateET(d: Date | string | number = new Date()): string {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: ET,
  });
}
