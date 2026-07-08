import pickRightsRaw from "./pick-rights-2026.json";

/**
 * Structured draft-pick RIGHTS beyond the clean-outright ownership in
 * pick-encumbrances.ts — the real-world conditional swaps, protections, and
 * either-or picks parsed from the RealGM ledger, plus the shapes a user can
 * create in a trade. Swaps are represented as RIGHTS, not resolved to a concrete
 * pick: which side ends up better depends on future standings, which the sim
 * deliberately does not project this far out.
 */
export type Favorable = "more" | "most" | "less" | "least";

/** An encumbrance on a team's OWN future first (owed away, protected, or a spot
 * another team can swap for). Absent year = the team keeps its own first clean. */
export interface OwnFirstObligation {
  year: number;
  status: "owed" | "protected" | "swap";
  /** Counterparty team code. */
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
  note: string;
  source?: string;
}

export interface TeamPickRights {
  ownFirstObligations: OwnFirstObligation[];
  holdings: PickHolding[];
}

/** team → structured pick rights (real-world, parsed). */
export const PICK_RIGHTS: Record<string, TeamPickRights> =
  (pickRightsRaw as { byTeam: Record<string, TeamPickRights> }).byTeam;

/** Swap rights a team holds (it can swap its own pick up toward the counterparties'). */
export function swapRightsOf(team: string): PickHolding[] {
  return (PICK_RIGHTS[team]?.holdings ?? []).filter((h) => h.kind === "swap_right");
}

/** Years where another team can swap FOR this team's own first (it may end worse). */
export function ownFirstSwapsOf(team: string): OwnFirstObligation[] {
  return (PICK_RIGHTS[team]?.ownFirstObligations ?? []).filter((o) => o.status === "swap");
}
