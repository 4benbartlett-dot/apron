import { DATA_AS_OF } from "@apron/data";
import { CALENDAR_2026_27 as CAL, leaguePhaseOn, shortDate, type LeaguePhase } from "@apron/cba-engine";

/*
 * What the site SAYS about where the league year stands. The phase itself is
 * the engine's (`leaguePhaseOn` over the one calendar); this module only maps
 * a phase to words, so a headline can't disagree with the rule the board is
 * enforcing. It stays a leaf: league.ts is the root of the data graph and
 * imports nothing that imports it back.
 */

/** "2027-02-11" → "Feb. 11". */
const md = (iso: string) => shortDate(iso).replace(/, \d{4}$/, "");
/** "2026-10-20" → "Oct 20", for the camp line. */
const mdPlain = (iso: string) => md(iso).replace(".", "");

const PHASE_LABEL: Record<LeaguePhase, { short: string; detail: string }> = {
  offseason: { short: "Free agency is open", detail: "New league year · free agency open" },
  camp: {
    short: `Training camp · opening night ${mdPlain(CAL.openingNight)}`,
    detail: `Training camp · opening night is ${mdPlain(CAL.openingNight)}`,
  },
  pre_dec15: { short: "The season is on", detail: "Regular season" },
  dec15_to_deadline: { short: "The season is on", detail: "Regular season" },
  post_deadline: { short: "The season is on", detail: "Regular season" },
  postseason: { short: "Playoffs, then the offseason", detail: "Regular season over" },
};

/**
 * Where the 2026-27 league year stands on the day the data was refreshed —
 * read off the snapshot, not written into the copy. "Free agency is open"
 * sat on the landing page into October because it was typed in July.
 */
export function leaguePhase(asOf: string = DATA_AS_OF): { short: string; detail: string } {
  return PHASE_LABEL[leaguePhaseOn(asOf, CAL)];
}

/** The brand line that doesn't go stale: page titles, the share image, the
 * structured data. The homepage headline below changes with the calendar;
 * this doesn't. */
export const TAGLINE = "The NBA salary cap, simplified.";

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 864e5);

/** The four reasons to visit, and the phases each one covers. Camp belongs to
 * trade season: the offseason board's verbs (renounce, extend into room) are
 * done by Oct. 1, and what is left to do is trade. */
export type HomeSeason = "offseason" | "trade_season" | "stretch_run" | "draft";
const HOME_SEASON: Record<LeaguePhase, HomeSeason> = {
  offseason: "offseason",
  camp: "trade_season",
  pre_dec15: "trade_season",
  dec15_to_deadline: "trade_season",
  post_deadline: "stretch_run",
  postseason: "draft",
};
export const homeSeason = (asOf: string = DATA_AS_OF): HomeSeason => HOME_SEASON[leaguePhaseOn(asOf, CAL)];

/**
 * The homepage headline for where the league year stands: "{lead}
 * {emph}." with `emph` underlined, the brand's one constant. The offseason
 * board, the trade deadline, the stretch run and the draft are four different
 * reasons to visit, and the line says which one it is today.
 */
export function homeHeadline(asOf: string = DATA_AS_OF): { lead: string; emph: string; sub: string; intro: string } {
  switch (homeSeason(asOf)) {
    case "offseason":
      return {
        lead: "The NBA offseason,",
        emph: "simplified",
        sub: "",
        intro: "Put teams on the board, then trade, sign, extend, and renounce. Each move builds on the last from the current roster data, with rule citations where they apply.",
      };
    case "trade_season": {
      const days = daysBetween(asOf, CAL.tradeDeadline);
      return {
        lead: "Trade season,",
        emph: "simplified",
        sub:
          days === 0
            ? "The trade deadline is today, at 3 p.m. ET."
            : `${days} day${days === 1 ? "" : "s"} to the ${md(CAL.tradeDeadline)} trade deadline. Switch the board to the deadline to see who's tradeable by then.`,
        intro: "Put teams on the board, then trade, sign, and waive. Each move builds on the last from today's rosters, cites the rule when one blocks it, and reruns the playoff odds.",
      };
    }
    case "stretch_run":
      return {
        lead: "The stretch run,",
        emph: "simplified",
        sub: `The trade deadline has passed. Bought-out players have until ${md(CAL.playoffWaiverDeadline)} to be waived and stay playoff-eligible.`,
        intro: "Put teams on the board to see where they stand: cap sheets, hard caps, and playoff odds that update with every result.",
      };
    case "draft":
      return {
        lead: "The draft,",
        emph: "simplified",
        sub: "Who owns which pick, what protects it, and what next season's cap looks like.",
        intro: "Put teams on the board to see their picks, their cap sheets for next season, and the moves the rules still allow.",
      };
  }
}
