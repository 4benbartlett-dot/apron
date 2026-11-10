/*
 * The blocks on a trade that the engine does not raise.
 *
 * `validateTrade` knows the agreement's arithmetic. Three things it is not
 * told: who owns which draft pick (the Stepien rule), which hard caps earlier
 * moves created, and whether a sign-and-trade is staged. Each surface that
 * rules on a trade adds those itself, and they used to travel as bare
 * sentences. The fix-it explainer then had to work out what kind of block a
 * sentence was by matching its wording, so rewording a message could quietly
 * switch its advice off; the admin desk's hard-cap sentence never matched at
 * all. A block now says what it is.
 */

import { validateTrade, violatesStepien, type Trade, type TradeVerdict } from "@apron/cba-engine";
import { ACQUIRED_PICKS, hasAcquiredFirst } from "@apron/data";
import {
  BASE_CONTRACTS,
  C,
  PICK_YEARS,
  currentSalary,
  feedStateOf,
  fitTpePlan,
  freeAgentsOf,
  hardCapDetailFor,
  holdsByTeam,
  leagueData,
  lockedFirstEncumbrance,
  stepienFindingFor,
  tpeLedger,
  type HardCapDetail,
  type StepienFinding,
} from "@/lib/league";

export type ExtraBlock =
  | {
      kind: "stepien";
      text: string;
      team: string;
      /** The year in the uncovered pair that was already gone before this trade. */
      owedYear?: number;
      /** The year this trade's own outgoing first uncovers. */
      offendingYear?: number;
    }
  | {
      kind: "hard_cap";
      text: string;
      team: string;
      /** "real" = a move the team made in the real world, which can't be
       * undone; "session" = one made on the board, which can. */
      source: "real" | "session";
    }
  | { kind: "sign_and_trade"; text: string };

export type ExtraBlockKind = ExtraBlock["kind"];

/** The entry in the rules index behind each kind of block. */
export const EXTRA_BLOCK_PROVISION: Record<ExtraBlockKind, string> = {
  stepien: "stepien",
  hard_cap: "hard-cap",
  sign_and_trade: "sign-and-trade",
};

export const blockTexts = (blocks: readonly ExtraBlock[]): string[] => blocks.map((b) => b.text);

/** A Stepien finding as a block. The year "already gone" is one a real trade
 * took, not one the league took away: a forfeited pick has nothing to swap. */
export function stepienBlock(f: StepienFinding): ExtraBlock {
  const first = f.encumbered[0];
  const owed = first && first.status !== "forfeited" && f.offendingYear !== undefined ? first.year : undefined;
  return { kind: "stepien", text: f.message, team: f.team, owedYear: owed, offendingYear: f.offendingYear };
}

/* ------------------- A trade against the league as it is ------------------- */
//
// The share card, its unfurl image and the admin desk all rule on a trade with
// no session behind it: the league as the feed has it. Each used to assemble
// that ruling itself, and they had drifted. The share card counted cap holds
// the real July had already forced teams to renounce, so it could call a
// trade blocked for want of cap room that the board, which drops those holds,
// cleared. The admin desk kept a traded-player-exception plan only when it
// made the trade legal, so a deal still blocked for another reason was
// described without it. This is the one assembly, in the board's order: the
// engine, then a traded-player exception if matching failed, then the Stepien
// rule against the real pick ledger, then the hard caps real moves created.

/** Kept cap holds with no session: July's free agents, less the holds a team
 * demonstrably gave up to spend the room it spent. */
export function baseHolds(): Record<string, number> {
  return holdsByTeam(
    freeAgentsOf(BASE_CONTRACTS).filter((f) => !feedStateOf(f.priorTeam).forcedRenounced.has(f.playerName.toLowerCase())),
  );
}

export interface BaseRuling {
  /** The trade as judged, with the exception plan if one was fitted. */
  trade: Trade;
  verdict: TradeVerdict;
  /** One finding per team the Stepien rule stops, in the order teams were given. */
  stepien: StepienFinding[];
  /** Teams this trade would carry past a hard cap a real move created. */
  hardCaps: { team: string; detail: HardCapDetail; postTradeSalary: number }[];
  legal: boolean;
}

export function ruleOnBaseTrade(input: {
  teams: string[];
  players: Trade["players"];
  picks: { id: string; from: string; to: string }[];
  cash?: Trade["cash"];
  date: string;
}): BaseRuling {
  const { teams, players, picks } = input;
  const data = leagueData(BASE_CONTRACTS);
  let trade: Trade = { teams, players, capHolds: baseHolds(), date: input.date, ...(input.cash?.length ? { cash: input.cash } : {}) };
  let verdict = validateTrade(data, trade, C);
  // If matching fails, try absorbing incoming players into a standing
  // traded-player exception (whole players), and judge that.
  if (!verdict.legal && verdict.violations.some((x) => x.ruleId === "salary_matching")) {
    const incomingByTeam: Record<string, { playerId: string; salary: number }[]> = {};
    for (const p of players) {
      const c = BASE_CONTRACTS.find((x) => x.playerId === p.playerId);
      (incomingByTeam[p.to] ??= []).push({ playerId: p.playerId, salary: c ? currentSalary(c) : 0 });
    }
    const plan = fitTpePlan(verdict.teams, incomingByTeam, tpeLedger([]));
    if (plan) {
      trade = { ...trade, tpeUse: plan };
      verdict = validateTrade(data, trade, C);
    }
  }

  // Stepien, against the real pick ledger.
  const stepien: StepienFinding[] = [];
  for (const teamId of teams) {
    const outs = new Set(picks.filter((p) => p.from === teamId).map((p) => p.id));
    const ins = new Set(picks.filter((p) => p.to === teamId && p.id.endsWith("|1")).map((p) => Number(p.id.split("|")[1])));
    // A first the team already holds from a real trade covers its year, the
    // way the board's ownership ledger counts it, unless this deal sends it
    // out. (The Clippers' 2030 and 2032 are forfeited; Toronto's 2031 and
    // 2033 firsts are what keep those from pairing into a violation.)
    const coveredByAcquired = (y: number) =>
      ACQUIRED_PICKS.some((ap) => ap.team === teamId && ap.round === 1 && ap.year === y && !outs.has(ap.id)) ||
      (y === 2033 && hasAcquiredFirst(teamId, 2033));
    const uncovered: number[] = [];
    for (const y of PICK_YEARS) {
      const ownGone = outs.has(`${teamId}|${y}|1`) || lockedFirstEncumbrance(teamId, y) !== undefined;
      if (ownGone && !ins.has(y) && !coveredByAcquired(y)) uncovered.push(y);
    }
    // 2033 sits past the tradeable window, but a first already owed or
    // forfeited there still pairs with 2032 unless another team's 2033 first
    // is in hand (see store.ts yearsWithoutFirst).
    if (lockedFirstEncumbrance(teamId, 2033) && !coveredByAcquired(2033)) uncovered.push(2033);
    if (!violatesStepien(uncovered)) continue;
    // Any outgoing first is the offending pick, an acquired one too: sending
    // Toronto's 2031 away is what uncovers 2031.
    const outYears = picks.filter((p) => p.from === teamId && p.id.endsWith("|1")).map((p) => Number(p.id.split("|")[1]));
    const finding = stepienFindingFor(teamId, uncovered, outYears);
    if (finding) stepien.push(finding);
  }

  // A hard cap a real move already set binds this deal too.
  const hardCaps: BaseRuling["hardCaps"] = [];
  for (const t of verdict.teams) {
    const detail = hardCapDetailFor(t.teamId, Infinity);
    if (detail && t.postTradeSalary > detail.line + 1) hardCaps.push({ team: t.teamId, detail, postTradeSalary: t.postTradeSalary });
  }

  return { trade, verdict, stepien, hardCaps, legal: verdict.legal && stepien.length === 0 && hardCaps.length === 0 };
}
