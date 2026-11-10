import pickRightsRaw from "./pick-rights-2026.json";
import { PICK_FORFEITURES, rulingDateLabel } from "./rulings";
import { FROZEN_FIRSTS } from "./second-apron";

/**
 * Structured draft-pick RIGHTS beyond the clean-outright ownership in
 * pick-encumbrances.ts — the real-world conditional swaps, protections, and
 * either-or picks parsed from the RealGM ledger, plus the shapes a user can
 * create in a trade. Swaps are represented as RIGHTS, not resolved to a concrete
 * pick: which side ends up better depends on future standings, which the sim
 * deliberately does not project this far out.
 */
export type Favorable = "more" | "most" | "less" | "least";

/** An encumbrance on a team's OWN future first (owed away, protected, a spot
 * another team can swap for, forfeited to the league outright, or frozen by a
 * season over the second apron: still the team's, but not tradeable). Absent
 * year = the team keeps its own first clean. */
export interface OwnFirstObligation {
  year: number;
  status: "owed" | "protected" | "swap" | "forfeited" | "frozen";
  /** Counterparty team code (none for a forfeiture — the league is not a team). */
  to?: string;
  /** For a swap/either-or, the outcome this team could be reduced to. */
  favorable?: Favorable;
  /** Protection band, e.g. "1-4". */
  protection?: string;
  note: string;
  source?: string;
}

/** An extra pick asset a team receives or a swap right it holds. */
export interface PickHolding {
  year: number;
  round: 1 | 2;
  kind: "outright" | "swap_right" | "conditional";
  /** Origin team for an outright incoming pick. */
  origin?: string;
  /** Teams whose picks are in a swap pool. */
  counterparties?: string[];
  favorable?: Favorable;
  protection?: string;
  /** This entry describes the SAME underlying pick as another holding (kept in
   *  the data for provenance) — the structured team-page chips skip it to avoid
   *  double-counting; valuation and the raw ledger still see it. */
  overlapsPrior?: boolean;
  /** The pick was taken by the league under a ruling (league-rulings.json).
   *  It is no longer this team's asset, and it did not go back to its origin;
   *  kept so the ledger can say so instead of silently dropping a row. */
  forfeited?: boolean;
  note: string;
  source?: string;
}

export interface TeamPickRights {
  ownFirstObligations: OwnFirstObligation[];
  holdings: PickHolding[];
}

const RAW: Record<string, TeamPickRights> = (pickRightsRaw as { byTeam: Record<string, TeamPickRights> }).byTeam;

/**
 * Lay the league's forfeitures over the parsed ledger. A team's OWN forfeited
 * first becomes a "forfeited" obligation (locked, uncovered for Stepien — the
 * conservative read, since the league has not said a forfeited year is exempt).
 * An ACQUIRED pick that was forfeited is flagged on the holding rather than
 * deleted, and the origin team's obligation gains the one fact that matters to
 * it: the pick is gone, not coming home.
 */
function applyForfeitures(byTeam: Record<string, TeamPickRights>): Record<string, TeamPickRights> {
  if (!PICK_FORFEITURES.length) return byTeam;
  const out: Record<string, TeamPickRights> = {};
  for (const [team, r] of Object.entries(byTeam))
    out[team] = { ownFirstObligations: r.ownFirstObligations.map((o) => ({ ...o })), holdings: r.holdings.map((h) => ({ ...h })) };
  for (const f of PICK_FORFEITURES) {
    const team = (out[f.team] ??= { ownFirstObligations: [], holdings: [] });
    const when = rulingDateLabel(f.date);
    if (f.origin === f.team) {
      // Only firsts have a structured own-pick slot; a forfeited own second
      // would live in the raw ledger alone.
      if (f.round !== 1) continue;
      team.ownFirstObligations.push({
        year: f.year,
        status: "forfeited",
        note: `Forfeited to the league under the ${when} ruling. ${f.text}`,
        source: f.source,
      });
      team.ownFirstObligations.sort((a, b) => a.year - b.year);
      continue;
    }
    const note = `Forfeited to the league under the ${when} ruling — it does not return to ${f.origin}. ${f.text}`;
    const i = team.holdings.findIndex(
      (h) => h.kind === "outright" && h.origin === f.origin && h.year === f.year && h.round === f.round,
    );
    if (i >= 0) {
      const h = team.holdings[i]!;
      team.holdings[i] = { ...h, forfeited: true, note: `${h.note} ${note}` };
    } else {
      team.holdings.push({ year: f.year, round: f.round, kind: "outright", origin: f.origin, forfeited: true, note, source: f.source });
      team.holdings.sort((a, b) => a.year - b.year || a.round - b.round);
    }
    const origin = out[f.origin];
    const obligation = origin?.ownFirstObligations.find((o) => o.year === f.year && o.status === "owed" && o.to === f.team);
    if (obligation)
      obligation.note = `${obligation.note}. Forfeited by ${f.team} to the league under the ${when} ruling; it does not return to ${f.origin}.`;
  }
  return out;
}

/**
 * Lay the second-apron freezes over the ledger (second-apron.ts). A frozen
 * first is an own-pick obligation with nobody on the other end: the team keeps
 * the pick and drafts with it, and may not trade it.
 */
function applyFreezes(byTeam: Record<string, TeamPickRights>): Record<string, TeamPickRights> {
  if (!FROZEN_FIRSTS.length) return byTeam;
  const out: Record<string, TeamPickRights> = {};
  for (const [team, r] of Object.entries(byTeam))
    out[team] = { ownFirstObligations: r.ownFirstObligations.map((o) => ({ ...o })), holdings: r.holdings };
  for (const f of FROZEN_FIRSTS) {
    const team = (out[f.team] ??= { ownFirstObligations: [], holdings: [] });
    // A pick already owed or forfeited can't also be frozen in any way that matters.
    if (team.ownFirstObligations.some((o) => o.year === f.year && (o.status === "owed" || o.status === "forfeited"))) continue;
    team.ownFirstObligations.push({
      year: f.year,
      status: "frozen",
      note: `Frozen: the team finished ${f.season} over the second apron, so this pick can't be traded (Art. VII §2(f)).${f.penalty ? " It also moves to the end of the first round." : ""}`,
      source: f.source,
    });
    team.ownFirstObligations.sort((a, b) => a.year - b.year);
  }
  return out;
}

/** team → structured pick rights (real-world, parsed, with league forfeitures
 * and second-apron freezes applied). */
export const PICK_RIGHTS: Record<string, TeamPickRights> = applyFreezes(applyForfeitures(RAW));

/** Swap rights a team holds (it can swap its own pick up toward the counterparties'). */
export function swapRightsOf(team: string): PickHolding[] {
  return (PICK_RIGHTS[team]?.holdings ?? []).filter((h) => h.kind === "swap_right");
}

/** Years where another team can swap FOR this team's own first (it may end worse). */
export function ownFirstSwapsOf(team: string): OwnFirstObligation[] {
  return (PICK_RIGHTS[team]?.ownFirstObligations ?? []).filter((o) => o.status === "swap");
}
