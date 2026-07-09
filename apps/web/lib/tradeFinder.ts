import { validateTrade, type LeagueData } from "@apron/cba-engine";
import { C, TEAM_IDS, currentSalary, rosterOf, assetMeterValue } from "./league";

export interface FinderPlayer {
  playerId: string;
  playerName: string;
  salary: number;
}
export interface TradePackage {
  /** Team sending the package to acquire the target. */
  acquirer: string;
  seller: string;
  players: FinderPlayer[];
  /** Extra seller players that come back WITH the target (to fix the
   * seller's own salary matching, or as throw-ins that make the math work). */
  sweeteners: FinderPlayer[];
  outSalary: number;
  inSalary: number;
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
  /** Kept free-agent holds per team — consume below-cap absorption room. */
  capHolds: Record<string, number> = {},
): TradePackage[] {
  const target = data.contracts.find((c) => c.playerId === targetId);
  if (!target) return [];
  const seller = target.teamId;
  if (seller === acquirer) return [];
  const targetSalary = currentSalary(target);

  // Tradeable roster: players with a current salary and no trade restriction.
  const roster = rosterOf(data.contracts, acquirer).filter((c) => !c.restriction);
  // Acquirer packages: nothing at all (pure cap-room absorption) up to 3 players.
  const combos: (typeof roster)[] = [[], ...subsetsUpTo(roster, maxPlayers)];
  // Seller sweeteners: cheapest tradeable non-target pieces, tried when the
  // plain package fails (they raise the seller's outgoing so it can take
  // back more — the classic "filler comes back with the star" construction).
  const fillers = rosterOf(data.contracts, seller)
    .filter((c) => !c.restriction && c.playerId !== targetId)
    .sort((a, b) => currentSalary(a) - currentSalary(b))
    .slice(0, 8);
  const fillerSets: (typeof fillers)[] = [[], ...subsetsUpTo(fillers, 2)];

  const tryTrade = (pkg: typeof roster, sweet: typeof fillers): boolean => {
    const trade = {
      teams: [acquirer, seller],
      players: [
        { playerId: targetId, from: seller, to: acquirer },
        ...sweet.map((c) => ({ playerId: c.playerId, from: seller, to: acquirer })),
        ...pkg.map((c) => ({ playerId: c.playerId, from: acquirer, to: seller })),
      ],
      capHolds,
    };
    return validateTrade(data, trade, C).legal;
  };

  const out: TradePackage[] = [];
  for (const pkg of combos) {
    const outSalary = pkg.reduce((s, c) => s + currentSalary(c), 0);
    // Prefilter: only packages roughly in range of the target's salary.
    if (pkg.length > 0 && (outSalary < targetSalary * 0.4 || outSalary > targetSalary * 2.6)) continue;
    for (const sweet of fillerSets) {
      const inSalary = targetSalary + sweet.reduce((s, c) => s + currentSalary(c), 0);
      // Rough band sanity both directions before the full engine pass.
      if (pkg.length > 0 && inSalary > outSalary * 2 + 8_000_000) continue;
      if (!tryTrade(pkg, sweet)) continue;
      out.push({
        acquirer,
        seller,
        players: pkg.map((c) => toFinder(c, currentSalary(c))),
        sweeteners: sweet.map((c) => toFinder(c, currentSalary(c))),
        outSalary,
        inSalary,
        targetSalary,
        valueGiven: Math.round(pkg.reduce((s, c) => s + assetMeterValue(c), 0) * 10) / 10,
      });
      break; // first (smallest) sweetener set that works for this package
    }
  }

  return out
    .sort(
      (a, b) =>
        Math.abs(a.outSalary - a.inSalary) - Math.abs(b.outSalary - b.inSalary) ||
        a.valueGiven - b.valueGiven ||
        (a.players.length + a.sweeteners.length) - (b.players.length + b.sweeteners.length),
    )
    .slice(0, limit);
}

export interface LeagueOffer extends TradePackage {
  /** How the package's value compares to the target's (>1 = an overpay). */
  valueRatio: number;
}

/**
 * REVERSE finder: given a player, gather the best legal offer EACH other team
 * can make to acquire him. For every team we run the forward search, then keep
 * the package whose outgoing value best matches the target's — a fair offer,
 * preferring a modest overpay to a lowball — and rank the field by value
 * offered. Every returned offer has already passed the full CBA (both teams'
 * salary matching, aprons, aggregation), so any of them can be executed.
 */
export function findOffersForPlayer(
  data: LeagueData,
  targetId: string,
  maxPlayers = 3,
  capHolds: Record<string, number> = {},
): LeagueOffer[] {
  const target = data.contracts.find((c) => c.playerId === targetId);
  if (!target) return [];
  const seller = target.teamId;
  const targetValue = assetMeterValue(target);
  const offers: LeagueOffer[] = [];
  for (const acquirer of TEAM_IDS) {
    if (acquirer === seller) continue;
    const pkgs = findTradePackages(data, acquirer, targetId, maxPlayers, 12, capHolds);
    if (!pkgs.length) continue;
    // The fairest package this team can make: value closest to the target's,
    // with ties (and near-ties) broken toward the slight OVERPAY a seller would
    // actually accept, then the tighter salary fit.
    const best = pkgs.reduce((a, b) => {
      const da = Math.abs(a.valueGiven - targetValue);
      const db = Math.abs(b.valueGiven - targetValue);
      if (Math.abs(da - db) > 0.15) return db < da ? b : a;
      if (Math.abs(a.valueGiven - b.valueGiven) > 0.05) return b.valueGiven > a.valueGiven ? b : a;
      return Math.abs(a.outSalary - a.inSalary) <= Math.abs(b.outSalary - b.inSalary) ? a : b;
    });
    offers.push({ ...best, valueRatio: targetValue > 0 ? best.valueGiven / targetValue : 1 });
  }
  return offers.sort((a, b) => b.valueGiven - a.valueGiven);
}
