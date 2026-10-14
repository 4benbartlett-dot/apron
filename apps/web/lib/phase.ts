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
