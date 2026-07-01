import { validateTrade, type ApronTier, type Trade } from "@apron/cba-engine";
import { BASE_CONTRACTS, leagueData, teamMeta, C } from "./league";

interface DecodedMove {
  from: string;
  to: string;
}

/** Decode a shared trade (?t=) into teams + player movements. */
export function decodeTradeParam(
  t: string,
): { teams: string[]; players: { playerId: string; from: string; to: string }[] } | null {
  try {
    const o = JSON.parse(atob(t)) as { t?: unknown; s?: Record<string, DecodedMove> };
    if (!Array.isArray(o.t) || !o.s || typeof o.s !== "object") return null;
    const teams = o.t as string[];
    const players = Object.entries(o.s)
      .filter(([, mv]) => teams.includes(mv.from) && teams.includes(mv.to))
      .map(([playerId, mv]) => ({ playerId, from: mv.from, to: mv.to }));
    return { teams, players };
  } catch {
    return null;
  }
}

export interface TradeSummary {
  legal: boolean;
  reason?: string;
  perTeam: {
    team: string;
    name: string;
    tier: ApronTier;
    incoming: string[];
    outgoing: string[];
  }[];
}

const lastName = (n: string) => n.split(" ").slice(-1)[0] ?? n;

/** Compute a sharable summary of a trade param (server-safe). */
export function summarizeTrade(t: string): TradeSummary | null {
  const d = decodeTradeParam(t);
  if (!d || !d.players.length) return null;
  const data = leagueData(BASE_CONTRACTS);
  const trade: Trade = { teams: d.teams, players: d.players };
  const v = validateTrade(data, trade, C);
  const nameOf = (id: string) =>
    BASE_CONTRACTS.find((c) => c.playerId === id)?.playerName ?? id;
  const perTeam = v.teams.map((ts) => ({
    team: ts.teamId,
    name: teamMeta(ts.teamId).name,
    tier: ts.postTradeTier,
    incoming: d.players.filter((p) => p.to === ts.teamId).map((p) => nameOf(p.playerId)),
    outgoing: d.players.filter((p) => p.from === ts.teamId).map((p) => nameOf(p.playerId)),
  }));
  return { legal: v.legal, reason: v.violations[0]?.reason, perTeam };
}

export { lastName };
