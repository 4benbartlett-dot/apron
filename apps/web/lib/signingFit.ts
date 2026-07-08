import type { Contract } from "@apron/cba-engine";
import { positionOf, impactScoreOf, currentSalary, fitGainOf, type FreeAgent } from "@/lib/league";

export const SIGN_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

/** Impact (0-100) of a free agent, read through his underlying contract row. */
export function faImpact(fa: FreeAgent, byId: Map<string, Contract>): number {
  const c = byId.get(fa.playerId);
  return c ? impactScoreOf(c) : 50;
}

/** The best impact a team currently has at each position (0 = nothing there).
 * A low number is a thin spot the team could upgrade. */
export function teamBestByPosition(team: string, contracts: Contract[]): Record<string, number> {
  const best: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const c of contracts) {
    if (c.teamId !== team || c.deadMoney || currentSalary(c) <= 0) continue;
    const pos = positionOf(c.playerId);
    if (pos && best[pos] !== undefined) best[pos] = Math.max(best[pos]!, impactScoreOf(c));
  }
  return best;
}

export interface Suggestion {
  fa: FreeAgent;
  fit: number;
  reason: string;
}

// A few fit notes read awkwardly as a "reason to sign him"; phrase them as what
// the player adds.
const REASON_LABEL: Record<string, string> = {
  "Thin playmaking": "Adds playmaking",
  "No shot creation": "Adds shot creation",
  "Ball-dominance overload": "Eases ball-dominance",
  Defense: "Defensive fit",
  Spacing: "Adds spacing",
  Connectors: "Connective fit",
};

/**
 * Rank the free agents a team should actually consider: signable ones, scored on
 * impact, on filling a position the team is thin at, and — via the dimensional
 * fit engine — on real complementarity (`fitGainOf`), so a suggestion reflects
 * how the player fits the roster, not just raw talent. `affordable` filters to
 * FAs the team can legally sign right now.
 */
export function suggestSignings(
  team: string,
  contracts: Contract[],
  fas: FreeAgent[],
  affordable: (fa: FreeAgent) => boolean,
  limit = 4,
): Suggestion[] {
  const byId = new Map(contracts.map((c) => [c.playerId, c] as const));
  const best = teamBestByPosition(team, contracts);
  return fas
    .filter((fa) => !fa.renounced && affordable(fa))
    .map((fa) => {
      const c = byId.get(fa.playerId);
      const av = faImpact(fa, byId);
      const pos = positionOf(fa.playerId);
      const cur = pos && best[pos] !== undefined ? best[pos]! : 55;
      const upgrade = av - cur;
      const { fitGain, topReason } = c ? fitGainOf(c, team, contracts) : { fitGain: 0, topReason: undefined };
      // Talent, plus a position-need bump, plus real complementarity (fitGain is
      // in net-rating points, ~±2 — weighted so it shapes the order without
      // overriding a clear talent gap).
      const fit = av + Math.max(0, upgrade) * 0.6 + (cur < 55 ? 6 : 0) + fitGain * 5;
      const reason =
        fitGain >= 0.6 && topReason
          ? `${REASON_LABEL[topReason] ?? topReason} (+${fitGain.toFixed(1)} net)`
          : pos && upgrade > 6
            ? `Upgrades ${pos}`
            : av >= 70
              ? "High-impact add"
              : pos && cur < 55
                ? `Fills a thin ${pos}`
                : "Rotation depth";
      return { fa, fit, reason };
    })
    .filter((s) => s.fit >= 52)
    .sort((a, b) => b.fit - a.fit)
    .slice(0, limit);
}
