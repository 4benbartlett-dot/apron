import draftPicksRaw from "./draft-picks.json";
import { PICK_RIGHTS, type PickHolding } from "./pick-rights";
import { PICK_FORFEITURES, rulingDateLabel } from "./rulings";

/**
 * Real-world encumbrances on each team's OWN future first-round picks, parsed
 * from the RealGM future-picks ledger (draft-picks.json "outgoing" entries).
 *
 *  - "owed":      the first is traded away outright — not this team's to deal.
 *  - "protected": owed with protection (e.g. "protected for selections 1-20").
 *                 It may or may not convey, so the year can't be counted on.
 *  - "swap":      another team holds swap rights — the team still ends the
 *                 draft with A first that year, just maybe a worse one.
 *  - "forfeited": taken by the league under a ruling (league-rulings.json).
 *                 Gone outright, with no counterparty to ever send it back.
 *
 * Stepien consequence (conservative, matching league-office practice): a year
 * whose own first is owed, protected-out or forfeited is NOT covered; a swapped
 * year IS. The league has not said whether a forfeited year is exempt from the
 * consecutive-years test; until it does, the year counts as uncovered.
 * Parsing is headline/detail regex over scraped prose — entries that resist
 * classification default to the most restrictive read.
 */
export type FirstEncumbranceStatus = "owed" | "protected" | "swap" | "forfeited";

export interface FirstEncumbrance {
  team: string;
  year: number;
  status: FirstEncumbranceStatus;
  /** Display text for the counterparty, straight from the headline. */
  counterparty: string;
  headline: string;
}

interface RawPick {
  year: number;
  headline: string;
  detail: string;
}

const TEAMS_RAW = (draftPicksRaw as { teams: Record<string, { incoming: RawPick[]; outgoing: RawPick[] }> }).teams;

/** Teams present in the scraped ledger — absent teams are UNKNOWN, not clean. */
export const PICK_LEDGER_TEAMS: string[] = Object.keys(TEAMS_RAW);

const RANK: Record<FirstEncumbranceStatus, number> = { forfeited: 4, owed: 3, protected: 2, swap: 1 };

function classify(p: RawPick): FirstEncumbranceStatus {
  // Swap ONLY on headline markers — "(swap" or "… incoming)" mean THIS team
  // receives a pick back. A bare "right to swap" in the detail prose can
  // belong to a third team in the chain (DAL/PHX 2029: Houston holds the
  // swap right and both firsts convey outright — those must stay locked).
  if (/\bswap\b/i.test(p.headline) || /incoming\)/.test(p.headline)) {
    return "swap";
  }
  const prot = p.detail.match(/protected for selections\s+(\d+)\s*-\s*(\d+)/i);
  if (prot && Number(prot[1]) <= 30) return "protected";
  return "owed";
}

function counterpartyOf(headline: string): string {
  return headline.match(/ to ([^(]+?)(?:\s*\(|$)/)?.[1]?.trim() ?? "another team";
}

function build(): Record<string, Record<number, FirstEncumbrance>> {
  const out: Record<string, Record<number, FirstEncumbrance>> = {};
  for (const [team, picks] of Object.entries(TEAMS_RAW)) {
    for (const p of picks.outgoing ?? []) {
      if (!/first round/i.test(p.headline)) continue;
      const status = classify(p);
      const enc: FirstEncumbrance = {
        team,
        year: p.year,
        status,
        counterparty: counterpartyOf(p.headline),
        headline: p.headline,
      };
      const byYear = (out[team] ??= {});
      const prev = byYear[p.year];
      // Duplicate (team, year) rows describe one obligation chain (e.g. MIN
      // 2029) — keep the most restrictive classification.
      if (!prev || RANK[status] > RANK[prev.status]) byYear[p.year] = enc;
    }
  }
  // The league's own rows. A forfeited own first outranks everything the
  // scrape can say about the year: there is no obligation left to satisfy.
  for (const f of PICK_FORFEITURES) {
    if (f.origin !== f.team || f.round !== 1) continue;
    const byYear = (out[f.team] ??= {});
    byYear[f.year] = {
      team: f.team,
      year: f.year,
      status: "forfeited",
      counterparty: "the league",
      headline: `${f.year} first round draft pick forfeited to the league (NBA ruling, ${rulingDateLabel(f.date)})`,
    };
  }
  return out;
}

/** Hand-curated obligations the scraper misses. PHI's RealGM page resists the
 * scrape entirely, but its 2028 obligation is recited verbatim inside the NYK
 * and MIL entries ("Philadelphia's 2028 1st round pick protected for
 * selections 1-8", conveying toward Brooklyn). */
const CURATED: FirstEncumbrance[] = [
  {
    team: "PHI",
    year: 2028,
    status: "protected",
    counterparty: "Brooklyn",
    headline: "2028 first round draft pick to Brooklyn (curated — PHI page missing from scrape)",
  },
];

function withCurated(built: Record<string, Record<number, FirstEncumbrance>>) {
  for (const enc of CURATED) {
    const byYear = (built[enc.team] ??= {});
    if (!byYear[enc.year]) byYear[enc.year] = enc;
  }
  return built;
}

/** team → year → encumbrance on that team's own first (absent = kept). */
export const FIRST_ENCUMBRANCES: Record<string, Record<number, FirstEncumbrance>> = withCurated(build());

/** Encumbrance on a team's own YEAR first, if any. */
export function firstEncumbranceOf(team: string, year: number): FirstEncumbrance | undefined {
  return FIRST_ENCUMBRANCES[team]?.[year];
}

/* --------------------------- Acquired incoming picks --------------------- */

export interface AcquiredPick {
  /** The team that currently owns this pick (holder). */
  team: string;
  /** Ledger id `ORIGIN|YEAR|ROUND`. */
  id: string;
  origin: string;
  year: number;
  round: 1 | 2;
}

/**
 * Picks a team already owns from REAL trades — another team's future pick that
 * conveys to them outright. Derived from the structured PICK_RIGHTS ledger (the
 * same source the team pages render), so the board and team pages can't drift:
 * only kind:"outright" holdings from a single identified origin team, carrying
 * no protection band or favorability condition, within the tradeable window.
 * Swaps, either-or pools, and protected picks are left out because no single
 * pick is guaranteed to convey — counting one as clean inventory would grant
 * its holder phantom Stepien coverage.
 */
/** A holding that is one identified team's pick, conveying to `team` no matter
 * what — no protection band, no favorability condition, not a duplicate row,
 * and not taken away by the league since. */
function isCleanOutright(h: PickHolding, team: string): boolean {
  if (h.kind !== "outright" || h.protection || h.favorable || h.overlapsPrior || h.forfeited) return false;
  const origin = h.origin;
  // A compound origin ("OKC/HOU/IND/MIA") or a missing one marks a pool
  // pick with no identified team — never clean inventory.
  return !!origin && origin in PICK_RIGHTS && origin !== team;
}

/** Whether `team` holds another team's first for `year` outright — Stepien
 * coverage for a year its own first is gone. Any year, unlike ACQUIRED_PICKS,
 * whose window is the board's tradeable one: the Clippers' 2033 is covered by
 * Toronto's 2033 first even though nothing on the board can trade it. */
export function hasAcquiredFirst(team: string, year: number): boolean {
  return (PICK_RIGHTS[team]?.holdings ?? []).some(
    (h) => h.round === 1 && h.year === year && isCleanOutright(h, team),
  );
}

export const ACQUIRED_PICKS: AcquiredPick[] = (() => {
  const out: AcquiredPick[] = [];
  const seen = new Set<string>();
  for (const [team, rights] of Object.entries(PICK_RIGHTS)) {
    for (const h of rights.holdings) {
      if (!isCleanOutright(h, team)) continue;
      const origin = h.origin!;
      if (h.year < 2027 || h.year > 2032) continue;
      const id = `${origin}|${h.year}|${h.round}`;
      if (seen.has(id)) continue; // a pick can't be owned twice
      seen.add(id);
      out.push({ team, id, origin, year: h.year, round: h.round });
    }
  }
  return out;
})();
