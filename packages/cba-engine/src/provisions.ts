import type { LeagueConstants } from "./types";
import { maxSalaryTier } from "./maxsalary";

const fmt = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

export interface OfferSheetVerdict {
  legal: boolean;
  /** Max first-year salary this RFA may be offered. */
  maxFirstYear: number;
  /** True if the Gilbert Arenas provision applies (1-2 years of service). */
  isArenas: boolean;
  reason: string;
}

/**
 * Validate an offer sheet to a restricted free agent (2023 CBA Art. XI). A
 * player with only 1-2 Years of Service is a "Gilbert Arenas" RFA whose offer
 * sheet's first year is capped at the Non-Taxpayer MLE; others may be offered up
 * to their years-of-service maximum. The original team may match either way.
 */
export function validateOfferSheet(
  firstYearSalary: number,
  yearsOfService: number,
  c: LeagueConstants,
): OfferSheetVerdict {
  const isArenas = yearsOfService <= 2;
  const maxFirstYear = isArenas ? c.nonTaxpayerMLE : maxSalaryTier(yearsOfService, c);
  const legal = firstYearSalary <= maxFirstYear + 1;
  return {
    legal,
    maxFirstYear,
    isArenas,
    reason: legal
      ? isArenas
        ? `Arenas offer sheet — first year up to the Non-Taxpayer MLE (${fmt(maxFirstYear)}); the original team can match.`
        : `Offer sheet up to ${fmt(maxFirstYear)}; the original team can match.`
      : `First year ${fmt(firstYearSalary)} exceeds the ${
          isArenas ? "Arenas (Non-Taxpayer MLE)" : "maximum"
        } cap of ${fmt(maxFirstYear)}.`,
  };
}

/**
 * A contract renegotiation is barred during the March 1 – June 30 window each
 * year (2023 CBA Art. VII §7(c)). `month` is 1-12.
 */
export function renegotiationAllowed(month: number): boolean {
  return month < 3 || month > 6;
}

/**
 * Poison-pill provision (2023 CBA Art. VII): a player on a rookie-scale
 * extension who is traded between signing the extension and the extension
 * taking effect counts at his current salary for the SENDING team, but at the
 * AVERAGE of his current-year and extension-year salaries for the ACQUIRING
 * team — often making him effectively untradeable.
 */
export function poisonPillValues(
  currentSalary: number,
  extensionYearSalaries: number[],
): { sendingValue: number; acquiringValue: number } {
  const total =
    currentSalary + extensionYearSalaries.reduce((a, b) => a + b, 0);
  return {
    sendingValue: currentSalary,
    acquiringValue: total / (1 + extensionYearSalaries.length),
  };
}

/**
 * Gilbert Arenas provision (2023 CBA Art. XI): an offer sheet to a restricted
 * free agent with only 1-2 Years of Service is capped in its first year at the
 * Non-Taxpayer MLE. (Later years may average higher — the "poison pill" that
 * strains the original team's matching cap.)
 */
export function arenasFirstYearMax(c: LeagueConstants): number {
  return c.nonTaxpayerMLE;
}

/**
 * Ted Stepien rule (2023 CBA Art. VII §7-ish, trade rules): a team may not be
 * without its own first-round pick in two consecutive future drafts. Given the
 * years in which a team would hold NO first-round pick, returns true if any two
 * of those years are consecutive (an illegal trade).
 */
export function violatesStepien(yearsWithoutFirst: number[]): boolean {
  const s = [...new Set(yearsWithoutFirst)].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) {
    if (s[i]! - s[i - 1]! === 1) return true;
  }
  return false;
}
