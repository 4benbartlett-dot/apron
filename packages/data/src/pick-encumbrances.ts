import draftPicksRaw from "./draft-picks.json";

/**
 * Real-world encumbrances on each team's OWN future first-round picks, parsed
 * from the RealGM future-picks ledger (draft-picks.json "outgoing" entries).
 *
 *  - "owed":      the first is traded away outright — not this team's to deal.
 *  - "protected": owed with protection (e.g. "protected for selections 1-20").
 *                 It may or may not convey, so the year can't be counted on.
 *  - "swap":      another team holds swap rights — the team still ends the
 *                 draft with A first that year, just maybe a worse one.
 *
 * Stepien consequence (conservative, matching league-office practice): a year
 * whose own first is owed or protected-out is NOT covered; a swapped year IS.
 * Parsing is headline/detail regex over scraped prose — entries that resist
 * classification default to the most restrictive read.
 */
export type FirstEncumbranceStatus = "owed" | "protected" | "swap";

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

const RANK: Record<FirstEncumbranceStatus, number> = { owed: 3, protected: 2, swap: 1 };

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

const CITY_TO_ID: Record<string, string> = {
  Atlanta: "ATL", Boston: "BOS", Brooklyn: "BKN", Charlotte: "CHA", Chicago: "CHI",
  Cleveland: "CLE", Dallas: "DAL", Denver: "DEN", Detroit: "DET", "Golden State": "GSW",
  Houston: "HOU", Indiana: "IND", "L.A. Clippers": "LAC", "L.A. Lakers": "LAL",
  Memphis: "MEM", Miami: "MIA", Milwaukee: "MIL", Minnesota: "MIN", "New Orleans": "NOP",
  "New York": "NYK", "Oklahoma City": "OKC", Orlando: "ORL", Philadelphia: "PHI",
  Phoenix: "PHX", Portland: "POR", Sacramento: "SAC", "San Antonio": "SAS",
  Toronto: "TOR", Utah: "UTA", Washington: "WAS",
};

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
 * conveys to them outright. Only clean, unconditional acquisitions ("YEAR
 * (first|second) round draft pick from <one team>") within the tradeable
 * window are included; swaps, conditional/either-or picks, and protected picks
 * are left out because there is no single pick to cleanly send on.
 */
export const ACQUIRED_PICKS: AcquiredPick[] = (() => {
  const out: AcquiredPick[] = [];
  const seen = new Set<string>();
  const re = /^(\d{4})\s+(first|second)\s+round draft pick from ([A-Z][A-Za-z.\s'-]+?)(\s*\(|$)/;
  for (const [team, td] of Object.entries(TEAMS_RAW)) {
    for (const p of td.incoming) {
      const h = p.headline;
      if (/\bswap\b/i.test(h) || / or /.test(h) || /outgoing/i.test(h) || /protect/i.test(h)) continue;
      const m = re.exec(h);
      if (!m) continue;
      const year = Number(m[1]);
      if (year < 2027 || year > 2032) continue;
      const round = m[2] === "first" ? 1 : 2;
      const origin = CITY_TO_ID[m[3]!.trim()];
      if (!origin || origin === team) continue;
      const id = `${origin}|${year}|${round}`;
      if (seen.has(id)) continue; // a pick can't be owned twice
      seen.add(id);
      out.push({ team, id, origin, year, round });
    }
  }
  return out;
})();
