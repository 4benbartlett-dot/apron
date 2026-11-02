import { DATA_AS_OF } from "@apron/data";

/**
 * Where the 2026-27 league year stands on the day the data was refreshed —
 * read off the snapshot, not written into the copy. "Free agency is open"
 * sat on the landing page into October because it was typed in July.
 * Dates: NBA 2026-27 schedule (opening night Oct 20, final day Apr 11).
 */
export function leaguePhase(asOf: string = DATA_AS_OF): { short: string; detail: string } {
  if (asOf < "2026-10-01") return { short: "Free agency is open", detail: "New league year · free agency open" };
  if (asOf < "2026-10-20") return { short: "Training camp · opening night Oct 20", detail: "Training camp · opening night is Oct 20" };
  if (asOf <= "2027-04-11") return { short: "The season is on", detail: "Regular season" };
  return { short: "Playoffs, then the offseason", detail: "Regular season over" };
}

/** The brand line that doesn't go stale: page titles, the share image, the
 * structured data. The homepage headline below changes with the calendar;
 * this doesn't. */
export const TAGLINE = "The NBA salary cap, simplified.";

const DEADLINE = "2027-02-11"; // league.ts TRADE_DEADLINE; this module stays a leaf
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 864e5);

/**
 * The homepage headline for where the league year stands: "{lead}
 * {emph}." with `emph` underlined, the brand's one constant. The offseason
 * board, the trade deadline, the stretch run and the draft are four different
 * reasons to visit, and the line says which one it is today.
 */
export function homeHeadline(asOf: string = DATA_AS_OF): { lead: string; emph: string; sub: string; intro: string } {
  if (asOf < "2026-10-01")
    return {
      lead: "The NBA offseason,",
      emph: "simplified",
      sub: "",
      intro: "Put teams on the board, then trade, sign, extend, and renounce. Each move builds on the last from the current roster data, with rule citations where they apply.",
    };
  if (asOf <= DEADLINE) {
    const days = daysBetween(asOf, DEADLINE);
    return {
      lead: "Trade season,",
      emph: "simplified",
      sub:
        days === 0
          ? "The trade deadline is today, at 3 p.m. ET."
          : `${days} day${days === 1 ? "" : "s"} to the Feb. 11 trade deadline. Switch the board to the deadline to see who's tradeable by then.`,
      intro: "Put teams on the board, then trade, sign, and waive. Each move builds on the last from today's rosters, cites the rule when one blocks it, and reruns the playoff odds.",
    };
  }
  if (asOf <= "2027-04-11")
    return {
      lead: "The stretch run,",
      emph: "simplified",
      sub: "The trade deadline has passed. Bought-out players have until Mar. 1 to be waived and stay playoff-eligible.",
      intro: "Put teams on the board to see where they stand: cap sheets, hard caps, and playoff odds that update with every result.",
    };
  return {
    lead: "The draft,",
    emph: "simplified",
    sub: "Who owns which pick, what protects it, and what next season's cap looks like.",
    intro: "Put teams on the board to see their picks, their cap sheets for next season, and the moves the rules still allow.",
  };
}
