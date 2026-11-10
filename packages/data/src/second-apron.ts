import { secondApronDraftPickStatus } from "@apron/cba-engine";

/**
 * Teams that finished a season over the second apron, and the first-round
 * pick each one can't trade because of it.
 *
 * Art. VII §2(f)(2)(i): a Second Apron Team (over the line as of its last
 * regular-season game) "shall be prohibited from trading (either conditionally
 * or unconditionally) its first round draft pick" in the draft after the
 * seventh following season. 2024-25 freezes the 2032 first; 2025-26 the 2033.
 * The pick is still the team's, so its year is covered for the Stepien rule;
 * it just can't be dealt, or swapped. It comes back after three of the next
 * four seasons under the line, and drops to the end of the round after two
 * over it; the engine's secondApronDraftPickStatus does that arithmetic.
 *
 * Who finished over the line is a reported fact, not something the sheet can
 * derive (it is measured on one day, at a payroll this data doesn't replay),
 * so each season is listed with where it was reported.
 */
export interface SecondApronSeason {
  team: string;
  /** The salary cap year's first calendar year: 2024 for 2024-25. */
  seasonStart: number;
  source: string;
}

export const SECOND_APRON_SEASONS: SecondApronSeason[] = [
  { team: "BOS", seasonStart: 2024, source: "ESPN, “Which franchises belong to the Apron Club?”; RealGM future picks (frozen through 2027-28)" },
  { team: "PHX", seasonStart: 2024, source: "ESPN, “Which franchises belong to the Apron Club?”; RealGM future picks (frozen through 2027-28)" },
  { team: "MIN", seasonStart: 2024, source: "ESPN, “Which franchises belong to the Apron Club?”; RealGM future picks (frozen through 2027-28)" },
  { team: "CLE", seasonStart: 2025, source: "Bleacher Report; RealGM future picks (frozen through 2028-29)" },
];

export interface FrozenFirst {
  team: string;
  /** The draft whose first-round pick is frozen. */
  year: number;
  /** The season that froze it, "2024-25". */
  season: string;
  /** Two more seasons over the line: the pick also moves to the end of the round. */
  penalty: boolean;
  source: string;
}

/** Seasons whose final standing against the second apron is known. A team
 * not listed above for one of these finished it under the line: RealGM's
 * "frozen through 2027-28" for the 2024-25 three is the third season after a
 * clean 2025-26, which is how the count has to run for that date to be right. */
const SEASONS_KNOWN = [2024, 2025];

export const FROZEN_FIRSTS: FrozenFirst[] = SECOND_APRON_SEASONS.flatMap((s) => {
  const over = SECOND_APRON_SEASONS.filter((x) => x.team === s.team).map((x) => x.seasonStart);
  const status = secondApronDraftPickStatus({
    triggerSalaryCapYearStart: s.seasonStart,
    secondApronSalaryCapYearStarts: over,
    knownFollowUpSalaryCapYearStarts: SEASONS_KNOWN.filter((y) => y > s.seasonStart),
  });
  if (!status.tradeProhibited) return [];
  return [
    {
      team: s.team,
      year: status.frozenDraftYear,
      season: `${s.seasonStart}-${String((s.seasonStart + 1) % 100).padStart(2, "0")}`,
      penalty: status.draftPickPenalty,
      source: s.source,
    },
  ];
});

/** The freeze on a team's own first for `year`, if there is one. */
export function frozenFirstOf(team: string, year: number): FrozenFirst | undefined {
  return FROZEN_FIRSTS.find((f) => f.team === team && f.year === year);
}
