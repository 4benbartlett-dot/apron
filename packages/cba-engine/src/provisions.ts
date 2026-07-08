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

export interface SimpleVerdict {
  legal: boolean;
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

export interface SecondRoundPickExceptionOffer {
  /** CBA-permitted structures are 2 seasons + team option, or 3 seasons + team option. */
  guaranteedSeasons: 2 | 3;
  hasTeamOption: boolean;
  firstYearSalaryPlusUnlikelyBonuses: number;
  secondYearSalaryPlusUnlikelyBonuses: number;
}

/**
 * Art. VII §6(k): Second Round Pick Exception. This validates the structure and
 * first two salary ceilings that the current-year constants can know without a
 * future minimum-scale table.
 */
export function validateSecondRoundPickException(
  offer: SecondRoundPickExceptionOffer,
  c: LeagueConstants,
): SimpleVerdict & { maxFirstYear: number; maxSecondYear: number } {
  const maxFirstYear =
    offer.guaranteedSeasons === 2 ? c.minimumSalaries[1]! : c.minimumSalaries[2]!;
  const maxSecondYear = c.minimumSalaries[offer.guaranteedSeasons === 2 ? 1 : 2]!;
  if (!offer.hasTeamOption) {
    return {
      legal: false,
      maxFirstYear,
      maxSecondYear,
      reason: "Second Round Pick Exception contracts must include a team option for the final season.",
    };
  }
  if (offer.firstYearSalaryPlusUnlikelyBonuses > maxFirstYear + 1) {
    return {
      legal: false,
      maxFirstYear,
      maxSecondYear,
      reason: `First-year salary plus unlikely bonuses exceeds the SRPE ceiling of ${fmt(maxFirstYear)}.`,
    };
  }
  if (offer.secondYearSalaryPlusUnlikelyBonuses > maxSecondYear + 1) {
    return {
      legal: false,
      maxFirstYear,
      maxSecondYear,
      reason: `Second-year salary plus unlikely bonuses exceeds the SRPE ceiling of ${fmt(maxSecondYear)}.`,
    };
  }
  return {
    legal: true,
    maxFirstYear,
    maxSecondYear,
    reason:
      offer.guaranteedSeasons === 2
        ? "Legal SRPE structure: two seasons plus a third-season team option."
        : "Legal SRPE structure: three seasons plus a fourth-season team option.",
  };
}

export interface TwoWayContractOffer {
  yearsOfService: number;
  seasons: 1 | 2;
  currentTeamTwoWays: number;
  afterMarch4?: boolean;
  includesOption?: boolean;
  includesBonusOrLoan?: boolean;
  daysRemainingInRegularSeason?: number;
  regularSeasonDays?: number;
}

export function twoWaySalary(
  c: LeagueConstants,
  daysRemainingInRegularSeason = 174,
  regularSeasonDays = 174,
): number {
  return Math.round(
    (c.minimumSalaries[0] ?? 0) *
      0.5 *
      Math.max(0, Math.min(daysRemainingInRegularSeason, regularSeasonDays)) /
      regularSeasonDays,
  );
}

/** Art. II §11: two-way contract roster, term, compensation, and eligibility basics. */
export function validateTwoWayContract(
  offer: TwoWayContractOffer,
  c: LeagueConstants,
): SimpleVerdict & { salary: number; maxActiveGames: number } {
  const days = offer.daysRemainingInRegularSeason ?? 174;
  const total = offer.regularSeasonDays ?? 174;
  const salary = twoWaySalary(c, days, total);
  const maxActiveGames = Math.max(1, Math.round(50 * Math.max(0, Math.min(days, total)) / total));
  if (offer.currentTeamTwoWays >= 3) {
    return { legal: false, salary, maxActiveGames, reason: "A team may not carry more than three two-way players." };
  }
  if (offer.afterMarch4) {
    return { legal: false, salary, maxActiveGames, reason: "Teams may not sign or convert a player to a two-way contract after March 4." };
  }
  if (offer.seasons > 2 || offer.includesOption) {
    return { legal: false, salary, maxActiveGames, reason: "A two-way contract may not exceed two seasons and may not include an option year." };
  }
  if (offer.includesBonusOrLoan) {
    return { legal: false, salary, maxActiveGames, reason: "Two-way contracts may not include bonuses, incentive compensation, deferred compensation, or loans." };
  }
  if (offer.yearsOfService >= 4 || (offer.yearsOfService === 3 && offer.seasons === 2)) {
    return { legal: false, salary, maxActiveGames, reason: "Players with or reaching four years of service are not eligible for this two-way term." };
  }
  return { legal: true, salary, maxActiveGames, reason: "Legal two-way contract under the core Article II §11 limits." };
}

export interface HigherMaxCriteriaInput {
  /** Most recent completed season, e.g. 2026 for the 2025-26 season. */
  mostRecentSeason: number;
  allNbaSeasons?: number[];
  dpoySeasons?: number[];
  mvpSeasons?: number[];
}

/** Article II §7 Higher Max Criteria: All-NBA/DPOY in latest or 2 of 3; MVP in latest 3. */
export function meetsHigherMaxCriteria(input: HigherMaxCriteriaInput): boolean {
  const recent = input.mostRecentSeason;
  const last3 = new Set([recent, recent - 1, recent - 2]);
  const allNbaOrDpoy = [...(input.allNbaSeasons ?? []), ...(input.dpoySeasons ?? [])]
    .filter((season) => last3.has(season));
  const latestAllNbaOrDpoy = allNbaOrDpoy.includes(recent);
  const twoOfThreeAllNbaOrDpoy = new Set(allNbaOrDpoy).size >= 2;
  const mvpInWindow = (input.mvpSeasons ?? []).some((season) => last3.has(season));
  return latestAllNbaOrDpoy || twoOfThreeAllNbaOrDpoy || mvpInWindow;
}

export function designatedVeteranMaxPct(opts: {
  yearsOfService: number;
  remainedWithOriginalTeamThroughFirstFourYears: boolean;
  higherMaxCriteriaMet: boolean;
}): 0.3 | 0.35 | null {
  if (
    opts.yearsOfService >= 8 &&
    opts.yearsOfService <= 9 &&
    opts.remainedWithOriginalTeamThroughFirstFourYears &&
    opts.higherMaxCriteriaMet
  ) {
    return 0.35;
  }
  if (opts.yearsOfService >= 7 && opts.yearsOfService < 10) return 0.3;
  return null;
}

export interface RegularSeasonWaiverSigningOffer {
  teamApronSalaryBeforeSigning: number;
  signingSalary: number;
  /** Salary in the salary-cap year before the prior contract was terminated. */
  terminatedContractSalary: number;
  terminatedDuringRegularSeason: boolean;
}

/**
 * Transaction Restrictions Table row D: signing, during the regular season, a
 * player whose prior contract was terminated that same regular season and whose
 * prior salary exceeded the Non-Taxpayer MLE is a first-apron transaction.
 */
export function validateRegularSeasonWaiverSigning(
  offer: RegularSeasonWaiverSigningOffer,
  c: LeagueConstants,
): SimpleVerdict & { hardCap: "first_apron" | null; resultingSalary: number } {
  const resultingSalary = offer.teamApronSalaryBeforeSigning + offer.signingSalary;
  const rowDTriggered =
    offer.terminatedDuringRegularSeason &&
    offer.terminatedContractSalary > c.nonTaxpayerMLE + 1;
  if (!rowDTriggered) {
    return {
      legal: true,
      hardCap: null,
      resultingSalary,
      reason:
        "Row D is not triggered: the prior contract was not a regular-season termination above the Non-Taxpayer MLE.",
    };
  }
  if (resultingSalary > c.firstApron + 1) {
    return {
      legal: false,
      hardCap: "first_apron",
      resultingSalary,
      reason: `Regular-season signing of a waived player whose prior salary exceeded the Non-Taxpayer MLE is a first-apron transaction; ${fmt(resultingSalary)} would exceed ${fmt(c.firstApron)}.`,
    };
  }
  return {
    legal: true,
    hardCap: "first_apron",
    resultingSalary,
    reason:
      "Legal regular-season waiver signing, but row D hard-caps the team at the first apron for the season.",
  };
}

export interface SecondApronDraftPickStatusInput {
  /**
   * Salary cap year start for the trigger season. Example: 2024 for the 2024-25
   * salary cap year, whose frozen pick is the 2032 first.
   */
  triggerSalaryCapYearStart: number;
  /** Salary cap year starts in which the team is known to have been a Second Apron Team. */
  secondApronSalaryCapYearStarts: number[];
  /** Salary cap year starts among the four-year follow-up window whose status is known. */
  knownFollowUpSalaryCapYearStarts?: number[];
}

export interface SecondApronDraftPickStatus {
  frozenDraftYear: number;
  followUpSalaryCapYearStarts: number[];
  repeatSecondApronYears: number[];
  nonSecondApronYearsKnown: number[];
  tradeProhibited: boolean;
  draftPickPenalty: boolean;
  /** The CBA releases the frozen pick after the third known non-2A follow-up regular season. */
  releasableAfterRegularSeasonSalaryCapYearStart: number | null;
}

/**
 * Art. VII §2(f): a Second Apron Team freezes its own first-round pick seven
 * seasons out (2024-25 -> 2032). If it is second-apron again in two or more of
 * the next four salary-cap years, that frozen pick moves to the end of round one.
 */
export function secondApronDraftPickStatus(
  input: SecondApronDraftPickStatusInput,
): SecondApronDraftPickStatus {
  const trigger = input.triggerSalaryCapYearStart;
  const frozenDraftYear = trigger + 8;
  const followUpSalaryCapYearStarts = [trigger + 1, trigger + 2, trigger + 3, trigger + 4];
  const second = new Set(input.secondApronSalaryCapYearStarts);
  const known = new Set(input.knownFollowUpSalaryCapYearStarts ?? followUpSalaryCapYearStarts);
  const repeatSecondApronYears = followUpSalaryCapYearStarts.filter((y) => second.has(y));
  const nonSecondApronYearsKnown = followUpSalaryCapYearStarts.filter(
    (y) => known.has(y) && !second.has(y),
  );
  const draftPickPenalty = repeatSecondApronYears.length >= 2;
  const releasableAfterRegularSeasonSalaryCapYearStart =
    !draftPickPenalty && nonSecondApronYearsKnown.length >= 3
      ? nonSecondApronYearsKnown[2]!
      : null;
  return {
    frozenDraftYear,
    followUpSalaryCapYearStarts,
    repeatSecondApronYears,
    nonSecondApronYearsKnown,
    tradeProhibited: releasableAfterRegularSeasonSalaryCapYearStart == null,
    draftPickPenalty,
    releasableAfterRegularSeasonSalaryCapYearStart,
  };
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
