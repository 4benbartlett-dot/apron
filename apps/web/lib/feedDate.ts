/**
 * The feed dates everything as "Aug 14, 2026". Every consumer needs it sortable,
 * and for a while every consumer grew its own copy of the parser — five of them
 * across the app and its tests, which is four opportunities for one to drift
 * from the rest while the comparisons they feed still look reasonable.
 *
 * This is a leaf module on purpose: league.ts is the root of the data graph and
 * cannot import from anything that imports it back.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 14, 2026" → "2026-08-14"; "" when the feed's date is unparseable. */
export function feedIso(d: string): string {
  const m = d.match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return "";
  const month = MONTHS.indexOf(m[1]!);
  if (month < 0) return "";
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

/** The day before an ISO date, UTC-safe across month and year boundaries. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates, unsigned. */
export const daysBetween = (a: string, b: string) =>
  Math.abs(new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 864e5;
