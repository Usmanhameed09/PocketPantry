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

/**
 * Calendar-month bounds ("YYYY-MM-DD") in the OPERATOR's timezone.
 *
 * Why server-side: a browser computing `new Date(y, m, 1).toISOString()` shifts
 * by the browser's UTC offset — from a UTC+5 browser "July 1 local" serializes
 * as "June 30", which silently pulled June 30's sales into "This month" on the
 * Machines page (tile said $692 while the true July total was $500).
 */
export function thisMonthRangeInOperatorTz(): { from: string; to: string } {
  const today = todayInOperatorTz();           // "YYYY-MM-DD" in operator tz
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function lastMonthRangeInOperatorTz(): { from: string; to: string } {
  const today = todayInOperatorTz();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));         // 1-12, current month
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate(); // day count of prev month
  const mm = String(prevM).padStart(2, "0");
  return { from: `${prevY}-${mm}-01`, to: `${prevY}-${mm}-${String(lastDay).padStart(2, "0")}` };
}
