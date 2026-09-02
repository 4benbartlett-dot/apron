import raw from "./league-rulings.json";

/**
 * League discipline — fines, suspensions, forfeited picks — curated in
 * league-rulings.json. The transaction feeds never carry any of it, and a
 * forfeited pick has no counterparty for the RealGM ledger to list, so the
 * ruling is the source and everything else is an overlay derived from it.
 */
export type RulingPenalty =
  | {
      kind: "pick_forfeiture";
      /** The team that loses the pick. */
      team: string;
      year: number;
      round: 1 | 2;
      /** The team whose pick it is — the forfeiting team for its own pick,
       * another team for an acquired one (LAC 2029 is Indiana's). */
      origin: string;
      text: string;
      note?: string;
      source?: string;
    }
  | { kind: "fine"; team: string; amount: number; text: string; source?: string }
  | {
      kind: "suspension";
      team: string;
      person: string;
      role: string;
      length: string;
      unpaid?: boolean;
      text: string;
      source?: string;
    }
  | { kind: "monitoring"; team: string; years: number; text: string; source?: string }
  | { kind: "restitution"; person: string; amount: number; text: string; source?: string };

export interface RulingSource {
  outlet: string;
  url?: string;
  note?: string;
  date?: string;
}

export interface LeagueRuling {
  /** Stable id — the news card's dismissal key. */
  id: string;
  /** ISO date the league announced it. */
  date: string;
  /** The team disciplined. */
  team: string;
  headline: string;
  summary: string;
  /** What the league found, one sentence each. */
  findings: string[];
  penalties: RulingPenalty[];
  sources: RulingSource[];
}

export const LEAGUE_RULINGS: LeagueRuling[] = (raw as { rulings: LeagueRuling[] }).rulings;

/** One forfeited pick, flattened out of its ruling. */
export interface PickForfeiture {
  team: string;
  year: number;
  round: 1 | 2;
  origin: string;
  date: string;
  rulingId: string;
  text: string;
  note?: string;
  source?: string;
}

export const PICK_FORFEITURES: PickForfeiture[] = LEAGUE_RULINGS.flatMap((r) =>
  r.penalties.flatMap((p) =>
    p.kind === "pick_forfeiture"
      ? [{ team: p.team, year: p.year, round: p.round, origin: p.origin, date: r.date, rulingId: r.id, text: p.text, note: p.note, source: p.source }]
      : [],
  ),
);

/** Picks a team has forfeited to the league. */
export function forfeituresOf(team: string): PickForfeiture[] {
  return PICK_FORFEITURES.filter((f) => f.team === team);
}

/** "Indiana Pacers'" / "Miami Heat's" — team names mostly end in s. */
export const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

/** "Sep 2, 2026" from an ISO date, for ledger prose. */
export function rulingDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface LedgerPick {
  year: number;
  headline: string;
  detail: string;
}
interface LedgerTeam {
  incoming: LedgerPick[];
  outgoing: LedgerPick[];
}

/**
 * Overlay the forfeitures onto the scraped RealGM ledger (DRAFT_PICKS): the
 * forfeiting team gains an outgoing row per pick, and where the pick was
 * another team's, that team's own outgoing row says the pick is gone for good
 * rather than merely traded. RealGM will presumably print its own forfeiture
 * rows eventually; until then the scraper cannot know, and re-running it must
 * not lose the ruling.
 */
export function withForfeitures<T extends Record<string, LedgerTeam>>(
  teams: T,
  nameOf: (code: string) => string,
): T {
  if (!PICK_FORFEITURES.length) return teams;
  const out: Record<string, LedgerTeam> = {};
  for (const [code, t] of Object.entries(teams)) out[code] = { incoming: [...t.incoming], outgoing: [...t.outgoing] };
  for (const f of PICK_FORFEITURES) {
    const round = f.round === 1 ? "first" : "second";
    const when = rulingDateLabel(f.date);
    const team = (out[f.team] ??= { incoming: [], outgoing: [] });
    const own = f.origin === f.team;
    team.outgoing.push({
      year: f.year,
      headline: `${f.year} ${round} round draft pick forfeited to the league${own ? "" : ` (${possessive(nameOf(f.origin))} pick)`}`,
      detail: `${f.text} [NBA ruling, ${when}]`,
    });
    team.outgoing.sort((a, b) => a.year - b.year);
    if (own) continue;
    const origin = out[f.origin];
    if (!origin) continue;
    const rows = origin.outgoing.filter((p) => p.year === f.year && new RegExp(`${round} round`, "i").test(p.headline));
    if (rows.length !== 1) continue;
    const row = rows[0]!;
    const i = origin.outgoing.indexOf(row);
    origin.outgoing[i] = {
      ...row,
      detail: `${row.detail} Forfeited by ${nameOf(f.team)} to the league under the ${when} ruling; it does not return to ${nameOf(f.origin)}.`,
    };
  }
  return out as T;
}
