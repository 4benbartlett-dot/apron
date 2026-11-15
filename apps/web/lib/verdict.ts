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
import { ACQUIRED_PICKS, frozenFirstOf } from "@apron/data";
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
  teamMeta,
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
  /** Picks in the trade that the team sending them doesn't have. */
  unheldPicks: { id: string; from: string; text: string }[];
  legal: boolean;
}

/**
 * Why `from` can't send this pick, or null if it can. On the board a team is
 * only ever offered the picks it holds, so this never came up there. A link
 * is different: it can name any pick, and one written by hand, or minted
 * before a real trade moved the pick, was judged as if the sender had it. A
 * Lakers trade with their 2031 and 2032 seconds in it came back LEGAL; those
 * picks are Brooklyn's and Oklahoma City's.
 */
export function whyNotHeld(id: string, from: string): string | null {
  const [origin, yearStr, round] = id.split("|");
  const year = Number(yearStr);
  const name = teamMeta(origin!).name;
  const pick = `${name.endsWith("s") ? `${name}'` : `${name}'s`} ${year} ${round === "1" ? "first" : "second"}`;
  const cant = `${teamMeta(from).name} can't trade it.`;
  const holder = ACQUIRED_PICKS.find((ap) => ap.id === id)?.team ?? origin!;
  if (holder !== from) return `${pick} already belongs to ${teamMeta(holder).name}; ${cant}`;
  if (round === "1" && origin === from) {
    const enc = lockedFirstEncumbrance(from, year);
    if (enc) return `${pick} ${enc.status === "forfeited" ? "was forfeited to the league" : `is already owed to ${enc.counterparty}`}; ${cant}`;
    if (frozenFirstOf(from, year)) return `${pick} is frozen by a season over the second apron (Art. VII §2(f)); ${cant}`;
  }
  return null;
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
      ACQUIRED_PICKS.some((ap) => ap.team === teamId && ap.round === 1 && ap.year === y && !outs.has(ap.id));
    const uncovered: number[] = [];
    for (const y of PICK_YEARS) {
      const ownGone = outs.has(`${teamId}|${y}|1`) || lockedFirstEncumbrance(teamId, y) !== undefined;
      if (ownGone && !ins.has(y) && !coveredByAcquired(y)) uncovered.push(y);
    }
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

  const unheldPicks = picks.flatMap((p) => {
    const text = whyNotHeld(p.id, p.from);
    return text ? [{ id: p.id, from: p.from, text }] : [];
  });

  return {
    trade,
    verdict,
    stepien,
    hardCaps,
    unheldPicks,
    legal: verdict.legal && stepien.length === 0 && hardCaps.length === 0 && unheldPicks.length === 0,
  };
}
