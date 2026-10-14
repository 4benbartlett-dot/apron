import type { LeagueConstants } from "../types";

/** The Salary Cap Year after `leagueYear`: "2026-27" → "2027-28". */
export function nextLeagueYear(leagueYear: string): string {
  const start = Number(leagueYear.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Whether `date` (ISO yyyy-mm-dd) falls in the Art. VII §2(e)(2)(ii) window:
 * from the day after the last day of the Regular Season through the last day
 * of that Salary Cap Year. Returns the Subsequent Salary Cap Year when it does,
 * else null — and null whenever the date or the year's calendar is unknown.
 */
export function postSeasonWindow(
  date: string | undefined,
  c: LeagueConstants,
): { subsequentYear: string } | null {
  if (!date || !c.calendar) return null;
  const { regularSeasonEnd, capYearEnd } = c.calendar;
  // ISO dates compare lexically.
  if (date > regularSeasonEnd && date <= capYearEnd) {
    return { subsequentYear: nextLeagueYear(c.leagueYear) };
  }
  return null;
}
