import type { LeagueConstants } from "./types";
import { classifyTier } from "./derive";

export interface SignTradeVerdict {
  legal: boolean;
  reason: string;
  hardCap: "first_apron";
  resultingSalary: number;
}

const fmt = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

/**
 * Validate acquiring a free agent via sign-and-trade (v1: the acquirer absorbs
 * the incoming salary; outgoing-matching not modeled). Under the 2023 CBA a team
 * over the SECOND apron may not acquire via sign-and-trade at all, and any team
 * acquiring via sign-and-trade is HARD-CAPPED at the first apron for the rest of
 * the league year (so it cannot end above the first apron).
 */
export function validateSignAndTrade(
  acquirerSalary: number,
  incomingSalary: number,
  c: LeagueConstants,
): SignTradeVerdict {
  const tier = classifyTier(acquirerSalary, c);
  const post = acquirerSalary + incomingSalary;
  if (tier === "second_apron") {
    return {
      legal: false,
      reason: "A team over the second apron cannot acquire a player via sign-and-trade.",
      hardCap: "first_apron",
      resultingSalary: post,
    };
  }
  if (post > c.firstApron + 1) {
    return {
      legal: false,
      reason: `Acquiring via sign-and-trade hard-caps the team at the first apron (${fmt(
        c.firstApron,
      )}); this would put it at ${fmt(post)} — ${fmt(post - c.firstApron)} over.`,
      hardCap: "first_apron",
      resultingSalary: post,
    };
  }
  return {
    legal: true,
    reason:
      "Acquires via sign-and-trade — hard-capped at the first apron for the rest of the season.",
    hardCap: "first_apron",
    resultingSalary: post,
  };
}
