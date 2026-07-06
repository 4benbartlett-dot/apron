/**
 * Core domain types for the Apron CBA engine.
 *
 * Design principle: a team's salary, apron tier, and room are NEVER stored —
 * they are always *derived* from the set of contracts via pure functions. This
 * keeps the engine deterministic and replayable: same contracts + same
 * league-year constants => same cap sheet, always.
 */

export type GuaranteeType =
  | "full"
  | "partial"
  | "non_guaranteed"
  | "team_option"
  | "player_option";

export interface ContractYear {
  /** e.g. "2025-26" */
  leagueYear: string;
  /** Base salary / cap hit for this league year, in dollars. */
  salary: number;
  guarantee: GuaranteeType;
}

/** A player's re-signing rights with their current team. */
export type BirdStatus = "bird" | "early_bird" | "non_bird" | "none";

export interface Contract {
  playerId: string;
  playerName: string;
  /** Team that currently holds the contract. */
  teamId: string;
  years: ContractYear[];
  /** Trade kicker as a fraction of remaining base salary, 0..0.15. */
  tradeKickerPct?: number;
  noTradeClause?: boolean;
  birdStatus?: BirdStatus;
  /** The exception/mechanism used to sign the deal (informational for now). */
  signedUsing?: string;
  /** A waived/stretched cap charge: counts toward team salary and aprons,
   * but the player is not on the roster — not tradeable, not extendable,
   * never a free agent of this team. */
  deadMoney?: boolean;
  /**
   * If set, the player currently cannot be traded, with this human reason
   * (e.g. a free agent signed this offseason is trade-restricted until Dec 15).
   * A player extended rather than re-signed via Bird stays trade-eligible.
   */
  restriction?: string;
  /**
   * True if the player was acquired this offseason — they cannot be aggregated
   * with other salaries in a trade for two months after being acquired.
   */
  noAggregate?: boolean;
  /**
   * If set, the player is a Base-Year Compensation player (re-signed via Bird
   * with a >20% raise, then traded the same league year). For the SENDING team's
   * salary matching his outgoing value is max(50% of current salary, this prior
   * salary); the acquiring team still counts his full salary.
   */
  bycPriorSalary?: number;
}

export interface Team {
  /** Tricode, e.g. "BOS". */
  id: string;
  name: string;
  conference?: "East" | "West";
}

/** A snapshot of the league for a single league year. */
export interface LeagueData {
  leagueYear: string;
  teams: Team[];
  contracts: Contract[];
}

/**
 * A team's salary position relative to the four CBA thresholds. Each tier is a
 * superset of the restrictions of the tier below it.
 */
export type ApronTier =
  | "below_cap"
  | "over_cap"
  | "taxpayer"
  | "first_apron"
  | "second_apron";

/** Per-league-year dollar constants. Reset every July; never hard-code inline. */
export interface LeagueConstants {
  leagueYear: string;
  /** False = projection (e.g. 2026-27 before the official cap memo). */
  official: boolean;

  salaryCap: number;
  /** Minimum team salary / cap floor (90% of cap). */
  minTeamSalary: number;
  luxuryTaxLine: number;
  firstApron: number;
  secondApron: number;

  nonTaxpayerMLE: number;
  taxpayerMLE: number;
  roomMLE: number;
  biAnnualException: number;

  /**
   * CBA "estimated average player salary" for the season — used for the Early
   * Bird alternative (105% of this figure). This is a separately published,
   * BRI-derived number (NOT a fixed fraction of the cap); the value here is an
   * approximation until the official figure is confirmed each year.
   */
  estimatedAverageSalary: number;

  /** First-year maximum salary by years-of-service tier. */
  maxSalary: { "0-6": number; "7-9": number; "10+": number };

  /** Expanded traded-player matching (Art. VII §6(j)(1)(iv)):
   * max( min(200%·out + addOn, out + escalatedFlatAddOn), 125%·out + addOn ). */
  tradeMatch: {
    /** Flat $250,000 allowance — NOT indexed to cap growth. */
    addOn: number;
    /** The "$7.5M" middle-band add-on, escalated by capGrowth since 2023-24:
     * $7,500,000 × (current cap ÷ $136,021,000 [2023-24 cap]). */
    escalatedFlatAddOn: number;
  };

  /** Minimum salary by years of service (0..10, where 10 = "10+"). */
  minimumSalaries: Record<number, number>;
}

/* ----------------------------- Trades ----------------------------- */

export interface PlayerMovement {
  playerId: string;
  /** Team tricode the player is leaving. */
  from: string;
  /** Team tricode the player is joining. */
  to: string;
}

export interface CashMovement {
  from: string;
  to: string;
  amount: number;
}

export interface Trade {
  /** All teams party to the trade. */
  teams: string[];
  players: PlayerMovement[];
  cash?: CashMovement[];
  /** Un-renounced free-agent cap holds per team. Holds count toward Team
   * Salary (Art. VII §4(d)), so they consume below-cap absorption room —
   * but NOT apron status, which `teamSalary` (signed salary) already
   * reflects. Omitted = no holds (legacy behavior). */
  capHolds?: Record<string, number>;
  /** Traded-player-exception usage per team: `amount` of incoming salary
   * absorbed into a standing TPE (needs no matching, §6(j)(1)(i)).
   * `preExisting` TPEs (minted before this offseason) are restriction-table
   * row F: unusable if post-trade apron salary would exceed the first apron,
   * and using one hard-caps the team there for the year. Same-offseason
   * TPEs carry no such gate. The app layer owns the TPE ledger (amounts,
   * expiry, §6(n)(2) room-team renunciation); the engine enforces the
   * apron consequences and carves the absorbed salary out of matching. */
  tpeUse?: Record<string, { amount: number; preExisting: boolean; label?: string }>;
}

/* ----------------------------- Verdicts ----------------------------- */

export interface RuleResult {
  ruleId: string;
  ok: boolean;
  teamId?: string;
  /** Plain-English explanation, e.g. "Suns are over the second apron and cannot aggregate salaries." */
  reason: string;
  /** CBA reference / source for the rule. */
  citation: string;
}

export interface TeamTradeSummary {
  teamId: string;
  preTradeSalary: number;
  postTradeSalary: number;
  preTradeTier: ApronTier;
  postTradeTier: ApronTier;
  outgoingSalary: number;
  incomingSalary: number;
  maxIncomingAllowed: number;
  matchingRule: string;
  /** Incoming salary absorbed into a traded-player exception (no matching). */
  tpeAbsorbed?: number;
}

export interface TradeVerdict {
  legal: boolean;
  teams: TeamTradeSummary[];
  /** Only the failed checks. */
  violations: RuleResult[];
  /** Every check run (passed and failed) — useful for an audit/explain panel. */
  checks: RuleResult[];
}
