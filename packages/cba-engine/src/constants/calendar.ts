import type { LeagueCalendar, LeagueConstants, LeaguePhase, SeasonCalendar, TradeTiming } from "../types";

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

/* ------------------------------ league phase ------------------------------ */
//
// The league year is a state machine with one input, the date. It used to be
// five of them: the homepage headline, the header's clock, the deadlines page,
// the trade-timing bucket and the post-season window each kept their own table
// of boundary dates, the trade deadline was typed in three files, and rules
// that depend on the phase (the offseason roster limit, the sign-and-trade
// window) had no phase to ask. `LeagueCalendar` is the one table and
// `leaguePhaseOn` is the one transition function. ISO dates compare lexically,
// so every test here is a string comparison.

/** Every phase, in the order the year passes through them. */
export const LEAGUE_PHASES: readonly LeaguePhase[] = [
  "offseason",
  "camp",
  "pre_dec15",
  "dec15_to_deadline",
  "post_deadline",
  "postseason",
];

/** Whether a calendar carries the full set of dates (2026-27 on). */
export function isLeagueCalendar(cal: SeasonCalendar | undefined): cal is LeagueCalendar {
  return !!cal && "openingNight" in cal && "tradeDeadline" in cal;
}

/** The phase `date` falls in. A date before the league year opens reads as
 * offseason, and one after June 30 as postseason: the calendar describes one
 * year and does not guess at the next. */
export function leaguePhaseOn(date: string, cal: LeagueCalendar): LeaguePhase {
  if (date < cal.campOpens) return "offseason";
  if (date < cal.openingNight) return "camp";
  if (date < cal.dec15) return "pre_dec15";
  if (date <= cal.tradeDeadline) return "dec15_to_deadline";
  if (date <= cal.regularSeasonEnd) return "post_deadline";
  return "postseason";
}

/** The first day of each phase: the transition table, for a page or an agent
 * that wants the whole year rather than one date's answer. */
export function phaseStarts(cal: LeagueCalendar): Record<LeaguePhase, string> {
  return {
    offseason: cal.leagueYearOpens,
    camp: cal.campOpens,
    pre_dec15: cal.openingNight,
    dec15_to_deadline: cal.dec15,
    post_deadline: plusDays(cal.tradeDeadline, 1),
    postseason: plusDays(cal.regularSeasonEnd, 1),
  };
}

/** Opening night through the last day of the season, inclusive. */
export function isRegularSeason(date: string, cal: LeagueCalendar): boolean {
  return date >= cal.openingNight && date <= cal.regularSeasonEnd;
}

/** Whether a trade can be made on `date` at all: any day but the stretch from
 * the day after the deadline through the last day of the Regular Season. */
export function tradeWindowOpen(date: string, cal: LeagueCalendar): boolean {
  return leaguePhaseOn(date, cal) !== "post_deadline";
}

/**
 * The Art. VII §6(j)(4)(ii) bucket for a trade made on `date`. Camp is
 * offseason for this rule, and everything after the deadline is
 * post-deadline. With no date, or a calendar that has only the season's last
 * day, the answer is offseason, where the restriction applies.
 */
export function tradeTimingOn(date: string | undefined, cal: SeasonCalendar | undefined): TradeTiming {
  if (!date || !isLeagueCalendar(cal)) return "offseason";
  const phase = leaguePhaseOn(date, cal);
  if (phase === "camp") return "offseason";
  if (phase === "postseason") return "post_deadline";
  return phase;
}

/** Days in the Regular Season, both ends included: 174 in 2026-27. Minimum
 * contracts signed in season, and 10-days, are paid by this day count. */
export function regularSeasonDays(cal: LeagueCalendar): number {
  return daysApart(cal.openingNight, cal.regularSeasonEnd) + 1;
}

/** Days of the Regular Season left to be paid for on `date`, that day
 * included: 174 on or before opening night, 159 on Nov. 4, 0 once it is over. */
export function seasonDaysLeft(date: string, cal: LeagueCalendar): number {
  if (date > cal.regularSeasonEnd) return 0;
  const from = date < cal.openingNight ? cal.openingNight : date;
  return daysApart(from, cal.regularSeasonEnd) + 1;
}

/** The last day of the most recent Regular Season to have ended by `date`,
 * across the calendars given, or null if none has. A traded-player exception
 * that arose on or before it is one whose first-apron limit has attached. */
export function lastSeasonEndBy(date: string, cals: readonly (SeasonCalendar | undefined)[]): string | null {
  let best: string | null = null;
  for (const cal of cals) {
    if (!cal || cal.regularSeasonEnd >= date) continue;
    if (!best || cal.regularSeasonEnd > best) best = cal.regularSeasonEnd;
  }
  return best;
}

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
const daysApart = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 864e5);
function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
