/**
 * Operator timezone helpers.
 *
 * THE PROBLEM these functions solve: `new Date().toISOString().slice(0, 10)`
 * gives the UTC date, not the operator's local date. At 8pm Eastern that's
 * already the NEXT day in UTC — so "today's sales" queries hit a date with
 * almost no data, while Nayax's live dashboard (which buckets in local time)
 * shows the full day. The numbers diverged by 4-5 hours of activity.
 *
 * Default timezone is America/New_York since:
 *   - The calendar/booking code already uses Eastern Time everywhere
 *   - The operator is on US East Coast (Nayax dashboard is in ET)
 *
 * Override via env var OPERATOR_TIMEZONE if the operator moves or you want
 * to support multi-tenant timezones later.
 */

export function getOperatorTimezone(): string {
  return process.env.OPERATOR_TIMEZONE || "America/New_York";
}

/**
 * Returns "YYYY-MM-DD" for the given date in the operator's timezone.
 * Uses Intl.DateTimeFormat which is reliable and built-in (no library).
 */
export function dateStringInOperatorTz(date: Date = new Date(), tz: string = getOperatorTimezone()): string {
  // en-CA happens to format as YYYY-MM-DD which is what we want for keys.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

/**
 * Today and yesterday's date strings in the operator's TZ.
 * Used by the Today dashboard, AI assistant, and reports.
 */
export function todayInOperatorTz(): string {
  return dateStringInOperatorTz(new Date());
}

export function dateNDaysAgoInOperatorTz(n: number): string {
  const d = new Date();
  // Subtract days at the wall-clock level by going through UTC midnight, then
  // convert. This avoids edge cases at DST transitions where setDate(-1) on a
  // 2-3am instant can land back on the same calendar day.
  d.setUTCDate(d.getUTCDate() - n);
  return dateStringInOperatorTz(d);
}
