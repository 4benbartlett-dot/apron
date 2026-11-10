/*
 * Re-judging the move ledger.
 *
 * A move is checked when it is made, against the league as the moves before
 * it left it. Take one of those earlier moves out and the later ones are
 * replayed onto a league they were never checked against: a trade that
 * matched salaries because of a player acquired two moves ago now sends a
 * different amount, and a signing that fit under a hard cap may not. Until
 * this existed the board replayed them anyway and said nothing.
 *
 * `auditLedger` replays the ledger and reports what no longer holds. It is
 * deliberately one-sided. It says a move is broken only when it can show it:
 * the engine blocks the trade on every day the trade could have been made, a
 * player the move names is on no roster, or the ledger leaves a team over a
 * hard cap or a roster limit that the same team was inside before the moves.
 * (The roster count is also the one thing here a fresh trade can trip: the
 * board lets a two-for-one through and this is what says to waive someone.)
 * A move it can't re-judge with certainty (a sign-and-trade, a signing's
 * choice of exception) it leaves alone.
 */

import { capSheet, validateTrade } from "@apron/cba-engine";
import {
  BASE_CONTRACTS,
  C,
  SIM_DATE,
  TRADE_DEADLINE,
  applyMove,
  currentSalary,
  feedStateOf,
  freeAgentsOf,
  holdsByTeam,
  leagueData,
  rosterLimitOn,
  rosterOf,
  sessionHardCaps,
  teamMeta,
  type Move,
} from "@/lib/league";
import type { Contract } from "@apron/cba-engine";

export interface LedgerIssue {
  /** Which move, by its place in the ledger. Null for something the ledger
   * as a whole does to a team (a hard cap, a roster limit). */
  index: number | null;
  text: string;
}

const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

/** Kept cap holds, the way the store reads them: a renounce in the session
 * or one the real July forced both drop the hold. */
function keptHolds(cs: Contract[], renounced: Set<string>, today: string): Record<string, number> {
  return holdsByTeam(
    freeAgentsOf(cs, today).filter(
      (f) => !renounced.has(f.playerId) && !feedStateOf(f.priorTeam).forcedRenounced.has(f.playerName.toLowerCase()),
    ),
  );
}

export function auditLedger(moves: Move[], base: Contract[] = BASE_CONTRACTS, today: string = SIM_DATE): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  const touched = new Set<string>();
  const renounced = new Set<string>();
  let cs = base;

  moves.forEach((m, index) => {
    const live = new Map(cs.filter((c) => !c.deadMoney && currentSalary(c) > 0).map((c) => [c.playerId, c]));
    if (m.kind === "renounce") {
      renounced.add(m.playerId);
    } else if (m.kind === "sign") {
      touched.add(m.teamId);
    } else if (m.kind === "sign_trade") {
      touched.add(m.toTeam);
      if (m.fromTeam) touched.add(m.fromTeam);
    } else if (m.kind === "waive" || m.kind === "extend") {
      const c = live.get(m.playerId);
      if (!c) issues.push({ index, text: "The player this move names is no longer on a roster at this point in the ledger." });
      else touched.add(c.teamId);
    } else if (m.kind === "trade" && m.players.length) {
      const gone = m.players.filter((p) => !live.has(p.playerId));
      const players = m.players
        .filter((p) => live.has(p.playerId))
        .map((p) => ({ playerId: p.playerId, from: live.get(p.playerId)!.teamId, to: p.to }));
      const still = players.filter((p) => p.from === p.to);
      const moving = players.filter((p) => p.from !== p.to);
      for (const p of moving) {
        touched.add(p.from);
        touched.add(p.to);
      }
      if (gone.length) {
        issues.push({ index, text: "A player in this trade is no longer on a roster at this point in the ledger." });
      } else if (still.length) {
        const who = live.get(still[0]!.playerId)!;
        issues.push({
          index,
          text: `${who.playerName} is already with ${teamMeta(who.teamId).name} at this point, so this trade no longer moves him.`,
        });
      } else {
        const teams = [...new Set(moving.flatMap((p) => [p.from, p.to]))];
        const capHolds = keptHolds(cs, renounced, today);
        // A trade made in deadline mode was judged on deadline day. A ledger
        // saved before trades recorded their day could be either, so it is
        // broken only if it is blocked on both.
        const days = m.day === "deadline" ? [TRADE_DEADLINE] : [today, TRADE_DEADLINE];
        const verdicts = days.map((date) =>
          validateTrade(leagueData(cs), { teams, players: moving, capHolds, tpeUse: m.tpeUse, cash: m.cash, date }, C),
        );
        if (verdicts.every((v) => !v.legal)) {
          issues.push({ index, text: verdicts[0]!.violations[0]?.reason ?? "The engine no longer clears this trade." });
        }
      }
    }
    cs = applyMove(cs, m);
  });

  // What the ledger as a whole leaves behind. A team that was already over a
  // line before any move is the data's business, not the ledger's.
  const caps = sessionHardCaps(moves, base, today);
  const before = leagueData(base);
  const after = leagueData(cs);
  const limit = rosterLimitOn();
  for (const team of [...touched].sort()) {
    const line = Math.min(caps[team] ?? Infinity, feedStateOf(team).hardCap);
    if (Number.isFinite(line)) {
      const was = capSheet(before, team, C).apronSalary;
      const now = capSheet(after, team, C).apronSalary;
      if (now > line + 1 && now > was + 1) {
        issues.push({
          index: null,
          text: `${teamMeta(team).name} is hard-capped at ${fmtM(line)}, and the moves on file leave it at ${fmtM(now)}. Remove a move to bring it back under.`,
        });
      }
    }
    const rosterNow = rosterOf(cs, team).length;
    if (rosterNow > limit && rosterNow > rosterOf(base, team).length) {
      issues.push({
        index: null,
        text: `${teamMeta(team).name} has ${rosterNow} players under contract, and the limit is ${limit}. Waive a player to get back to it.`,
      });
    }
  }
  return issues;
}
