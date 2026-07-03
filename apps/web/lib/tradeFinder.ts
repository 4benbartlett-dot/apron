import { validateTrade, type LeagueData } from "@apron/cba-engine";
import { C, currentSalary, rosterOf, assetMeterValue } from "./league";

export interface FinderPlayer {
  playerId: string;
  playerName: string;
  salary: number;
}
export interface TradePackage {
  seller: string;
  players: FinderPlayer[];
  outSalary: number;
  targetSalary: number;
  valueGiven: number;
}

const toFinder = (c: {
  playerId: string;
  playerName: string;
}, salary: number): FinderPlayer => ({
  playerId: c.playerId,
  playerName: c.playerName,
  salary,
});

/** All subsets of `arr` with size 1..k. */
function subsetsUpTo<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length) res.push([...cur]);
    if (cur.length === k) return;
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]!);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return res;
}

/**
 * Find legal trade packages the `acquirer` can send to get `targetId`. Searches
 * subsets (up to `maxPlayers`) of the acquirer's tradeable roster, validates
 * each against the full CBA (both teams' matching, aprons, aggregation), and
 * ranks by salary fit, then least value given up, then fewest players.
 */
export function findTradePackages(
  data: LeagueData,
  acquirer: string,
  targetId: string,
  maxPlayers = 3,
  limit = 10,
): TradePackage[] {
  const target = data.contracts.find((c) => c.playerId === targetId);
  if (!target) return [];
  const seller = target.teamId;
  if (seller === acquirer) return [];
  const targetSalary = currentSalary(target);

  // Tradeable roster: players with a current salary and no trade restriction.
  const roster = rosterOf(data.contracts, acquirer).filter((c) => !c.restriction);
  const combos = subsetsUpTo(roster, maxPlayers);

  const out: TradePackage[] = [];
  for (const pkg of combos) {
    const outSalary = pkg.reduce((s, c) => s + currentSalary(c), 0);
    // Prefilter: only packages roughly in the matching band of the target.
    if (outSalary < targetSalary * 0.55 || outSalary > targetSalary * 2.3) continue;
    const trade = {
      teams: [acquirer, seller],
      players: [
        { playerId: targetId, from: seller, to: acquirer },
        ...pkg.map((c) => ({ playerId: c.playerId, from: acquirer, to: seller })),
      ],
    };
    if (!validateTrade(data, trade, C).legal) continue;
    out.push({
      seller,
      players: pkg.map((c) => toFinder(c, currentSalary(c))),
      outSalary,
      targetSalary,
      valueGiven: pkg.reduce((s, c) => s + assetMeterValue(c), 0),
    });
  }

  return out
    .sort(
      (a, b) =>
        Math.abs(a.outSalary - targetSalary) - Math.abs(b.outSalary - targetSalary) ||
        a.valueGiven - b.valueGiven ||
        a.players.length - b.players.length,
    )
    .slice(0, limit);
}
