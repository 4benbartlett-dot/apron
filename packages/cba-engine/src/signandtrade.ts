import type { LeagueConstants } from "./types";
import { classifyTier } from "./derive";

export type SignTradeSignedUsing =
  | "bird"
  | "early_bird"
  | "non_bird"
  | "minimum"
  | "cap_room"
  | "taxpayer_mle"
  | "bi_annual"
  | "non_taxpayer_mle"
  | "room_mle"
  | "unknown";

export interface SignTradeOptions {
  /** Total seasons in the new S&T contract, including any option years. */
  seasons?: number;
  /** Seasons in `seasons` that are option years; option years do not satisfy the 3-season floor. */
  optionYears?: number;
  /** The CBA requires year one to be fully protected for lack of skill. */
  firstSeasonFullyProtected?: boolean;
  /** S&T contracts must be entered into before the first day of the regular season. */
  beforeRegularSeason?: boolean;
  /** The veteran free agent must have finished the prior season on his prior team's roster. */
  finishedPriorSeasonWithPriorTeam?: boolean;
  /** Only Veteran Free Agents can be signed-and-traded under Art. VII §8(e)(1). */
  veteranFreeAgent?: boolean;
  /** NT-MLE and Room-MLE contracts cannot be signed-and-traded. */
  signedUsing?: SignTradeSignedUsing;
  /** 5th Year Eligible players who meet Higher Max Criteria are capped at 25% of the cap in an S&T. */
  fifthYearEligibleHigherMax?: boolean;
  /** First-season unlikely bonuses; included in the 5th-year and room tests. */
  firstYearUnlikelyBonuses?: number;
  /** If supplied, enforce Art. VII §8(e)(1)(vii)'s Room test directly. */
  roomAvailable?: number;
}

export interface SignTradeCheck {
  ruleId: string;
  ok: boolean;
  reason: string;
  citation: string;
}

export interface SignTradeVerdict {
  legal: boolean;
  reason: string;
  hardCap: "first_apron";
  resultingSalary: number;
  checks: SignTradeCheck[];
}

const fmt = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;
const SNT_CITE = "2023 CBA Art. VII §8(e)(1)";
const APRON_CITE = "2023 CBA Art. VII §2(e), Transaction Restrictions Table row C";

const check = (
  ruleId: string,
  ok: boolean,
  reason: string,
  citation = SNT_CITE,
): SignTradeCheck => ({ ruleId, ok, reason, citation });

/**
 * Validate acquiring a free agent via sign-and-trade. This covers both the
 * apron consequence (row C: first-apron hard cap) and the S&T contract structure
 * rules in Art. VII §8(e)(1) when the caller supplies the relevant facts. App
 * layers that model a return package may still do their own room-or-matching
 * check; pass `roomAvailable` when strict §8(e)(1)(vii) Room enforcement is
 * desired directly in this helper.
 */
export function validateSignAndTrade(
  acquirerSalary: number,
  incomingSalary: number,
  c: LeagueConstants,
  opts: SignTradeOptions = {},
): SignTradeVerdict {
  const tier = classifyTier(acquirerSalary, c);
  const post = acquirerSalary + incomingSalary;
  const seasons = opts.seasons;
  const optionYears = opts.optionYears ?? 0;
  const nonOptionSeasons =
    seasons == null ? undefined : Math.max(0, seasons - optionYears);
  const salaryPlusUnlikely = incomingSalary + (opts.firstYearUnlikelyBonuses ?? 0);
  const checks: SignTradeCheck[] = [
    check(
      "snt_veteran_free_agent",
      opts.veteranFreeAgent !== false,
      opts.veteranFreeAgent === false
        ? "Only a Veteran Free Agent may be signed-and-traded under this subsection."
        : "Veteran Free Agent requirement satisfied or not contradicted by supplied data.",
    ),
    check(
      "snt_finished_prior_roster",
      opts.finishedPriorSeasonWithPriorTeam !== false,
      opts.finishedPriorSeasonWithPriorTeam === false
        ? "The player did not finish the prior season on his prior team's roster."
        : "Prior-team roster requirement satisfied or not contradicted by supplied data.",
    ),
    check(
      "snt_contract_length",
      seasons == null || (nonOptionSeasons! >= 3 && seasons >= 3 && seasons <= 4),
      seasons == null
        ? "S&T contract length not supplied; apron legality is still checked."
        : `S&T contract has ${seasons} season${seasons === 1 ? "" : "s"} (${nonOptionSeasons} non-option), where Art. VII §8(e)(1)(ii) requires at least 3 non-option seasons and no more than 4 seasons total.`,
    ),
    check(
      "snt_exception_ban",
      opts.signedUsing == null ||
        (opts.signedUsing !== "non_taxpayer_mle" && opts.signedUsing !== "room_mle"),
      opts.signedUsing === "non_taxpayer_mle" || opts.signedUsing === "room_mle"
        ? "A contract signed with the Non-Taxpayer MLE or Room MLE cannot be signed-and-traded."
        : "No barred S&T signing exception supplied.",
    ),
    check(
      "snt_first_year_protected",
      opts.firstSeasonFullyProtected !== false,
      opts.firstSeasonFullyProtected === false
        ? "The first season of a sign-and-trade contract must be fully protected for lack of skill."
        : "First-season protection requirement satisfied or not contradicted by supplied data.",
    ),
    check(
      "snt_before_regular_season",
      opts.beforeRegularSeason !== false,
      opts.beforeRegularSeason === false
        ? "A sign-and-trade contract must be entered into before the first day of the regular season."
        : "Pre-regular-season timing requirement satisfied or not contradicted by supplied data.",
    ),
    check(
      "snt_fifth_year_higher_max_25pct",
      !opts.fifthYearEligibleHigherMax || salaryPlusUnlikely <= c.salaryCap * 0.25 + 1,
      opts.fifthYearEligibleHigherMax
        ? `5th Year Eligible/Higher Max S&T salary plus unlikely bonuses is ${fmt(salaryPlusUnlikely)}; the S&T ceiling is 25% of the cap (${fmt(c.salaryCap * 0.25)}).`
        : "5th Year Eligible/Higher Max S&T cap not triggered by supplied data.",
    ),
    check(
      "snt_room_for_salary_plus_unlikely",
      opts.roomAvailable == null || salaryPlusUnlikely <= opts.roomAvailable + 1,
      opts.roomAvailable == null
        ? "Strict Room test not supplied here; callers may validate room or matching separately."
        : `Acquiring team room is ${fmt(opts.roomAvailable)} against ${fmt(salaryPlusUnlikely)} in first-year salary plus unlikely bonuses.`,
    ),
  ];
  if (tier === "second_apron") {
    checks.push(
      check(
        "snt_second_apron_bar",
        false,
        "A team over the second apron cannot acquire a player via sign-and-trade.",
        APRON_CITE,
      ),
    );
    return {
      legal: false,
      reason: "A team over the second apron cannot acquire a player via sign-and-trade.",
      hardCap: "first_apron",
      resultingSalary: post,
      checks,
    };
  }
  if (post > c.firstApron + 1) {
    checks.push(
      check(
        "snt_first_apron_hard_cap",
        false,
        `Acquiring via sign-and-trade hard-caps the team at the first apron (${fmt(c.firstApron)}); this would put it at ${fmt(post)} — ${fmt(post - c.firstApron)} over.`,
        APRON_CITE,
      ),
    );
    return {
      legal: false,
      reason: `Acquiring via sign-and-trade hard-caps the team at the first apron (${fmt(
        c.firstApron,
      )}); this would put it at ${fmt(post)} — ${fmt(post - c.firstApron)} over.`,
      hardCap: "first_apron",
      resultingSalary: post,
      checks,
    };
  }
  checks.push(
    check(
      "snt_first_apron_hard_cap",
      true,
      `Post-S&T apron salary ${fmt(post)} stays at or below the first apron ${fmt(c.firstApron)}.`,
      APRON_CITE,
    ),
  );
  const failed = checks.find((x) => !x.ok);
  if (failed) {
    return {
      legal: false,
      reason: failed.reason,
      hardCap: "first_apron",
      resultingSalary: post,
      checks,
    };
  }
  return {
    legal: true,
    reason:
      "Acquires via sign-and-trade — hard-capped at the first apron for the rest of the season.",
    hardCap: "first_apron",
    resultingSalary: post,
    checks,
  };
}
