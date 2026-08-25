import type { Contract, LeagueData } from "@apron/cba-engine";
import raw from "./contracts-2025-26.json";
import rookiesRaw from "./rookies-2026.json";
import transactionsRaw from "./transactions.json";
import manualMovesRaw from "./manual-moves.json";
import retiredRaw from "./retired-2026.json";
import waivedRaw from "./waived-2025-26.json";
import impactRaw from "./impact-2026.json";
import teamStrengthRaw from "./team-strength-2026.json";
import positionsRaw from "./positions-2026.json";
import positionOverridesRaw from "./position-overrides-2026.json";
import rookieProjectionsRaw from "./rookie-projections-2026.json";
import returningFasRaw from "./returning-fas-2026.json";
import playerBioRaw from "./player-bio-2026.json";
import playerStatsRaw from "./player-stats-2026.json";
import playerDimsRaw from "./player-dimensions-2026.json";
import playerInjuriesRaw from "./player-injuries-2026.json";
import playerPedigreeRaw from "./player-pedigree-2026.json";
import playerHistoryRaw from "./player-history.json";
import recentAccoladesRaw from "./player-recent-accolades.json";
import extraContractsRaw from "./extra-contracts.json";
import faOverridesRaw from "./fa-overrides.json";
import metaRaw from "./meta.json";
import upcomingRaw from "./upcoming-deadlines.json";
import extEligibleRaw from "./extension-eligible.json";
import draftPicksRaw from "./draft-picks.json";
import experienceRaw from "./experience.json";
import freeAgentsRaw from "./free-agents.json";
import signingsRaw from "./signings.json";
import ratingsRaw from "./ratings.json";
import rosterCorrectionsRaw from "./roster-corrections-2026.json";

/* --- Returning veterans (recently retired / overseas) as signable minimum free
 * agents. One curated record per player fans out into the maps below. --- */
interface ReturningFa {
  playerId: string; playerName: string; lastNbaTeam: string; notionalSalary: number;
  age: number; yos: number; primary: string; secondary?: string[];
  bpm: number; mpg: number;
  dims: { off: number; def: number; play: number; reb: number; space: number; rim: number; perd: number };
  archetype?: string;
}
const returningFas = (returningFasRaw as { players: ReturningFa[] }).players;
const rvNorm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
/** FA contract stubs: a 2025-26 salary and NO 2026-27 row makes each surface as
 * a free agent — a small non-Bird hold on his last team, signable by anyone. */
export const RETURNING_FA_CONTRACTS = returningFas.map((p) => ({
  playerId: p.playerId, playerName: p.playerName, teamId: p.lastNbaTeam,
  years: [{ leagueYear: "2025-26", salary: p.notionalSalary, guarantee: "full" }],
}));
const rvYos = Object.fromEntries(returningFas.map((p) => [p.playerId, p.yos]));
const rvBios = Object.fromEntries(returningFas.map((p) => [p.playerId, { age: p.age - 1 }]));
const rvPositions = Object.fromEntries(returningFas.map((p) => [p.playerId, p.primary]));
const rvSecondaries = Object.fromEntries(returningFas.filter((p) => p.secondary?.length).map((p) => [p.playerId, p.secondary!]));
const rvFaInfo = Object.fromEntries(returningFas.map((p) => [rvNorm(p.playerName), { name: p.playerName, team: p.lastNbaTeam, restriction: "UFA", birdStatus: "non_bird" as const }]));

/** Player years-of-service entering 2026-27 (Basketball-Reference). */
export const EXPERIENCE = { ...(experienceRaw as Record<string, number>), ...rvYos };

export interface PlayerRating {
  /** 0-99 OVR-style rating derived from Box Plus/Minus. */
  rating: number;
  vorp: number;
  bpm: number;
  mp: number;
}

/** Per-player value ratings (Basketball-Reference advanced, 2025-26). */
export const RATINGS = (ratingsRaw as { byId: Record<string, PlayerRating> }).byId;

export interface FreeAgentInfo {
  name: string;
  team: string;
  /** UFA / RFA / Two-Way. */
  restriction: string;
  /** "bird" | "early_bird" | "non_bird" | undefined. */
  birdStatus?: "bird" | "early_bird" | "non_bird";
}

/** 2026 free-agent Bird status + UFA/RFA, keyed by normalized name (Spotrac);
 * plus curated returning veterans (non-Bird UFAs). */
export const FREE_AGENT_INFO: Record<string, FreeAgentInfo> = {
  ...(freeAgentsRaw as { byName: Record<string, FreeAgentInfo> }).byName,
  ...rvFaInfo,
};

export interface SigningInfo {
  name: string;
  team: string;
  years: number;
  aav: number;
  total: number;
  status: string;
}

/**
 * 2026 signed free agents with structured new-deal terms (Spotrac's signed page)
 * — the authoritative source for the offseason's newest contracts. Keyed by
 * normalized name.
 */
export const SIGNINGS = (
  signingsRaw as { byName: Record<string, SigningInfo> }
).byName;

export interface Transaction {
  player: string;
  pos: string;
  date: string;
  type: string;
  detail: string;
}

/** Recent NBA transactions (Spotrac via Firecrawl). */
/** When the roster/transaction feeds were last pulled. */
export const DATA_AS_OF: string = (metaRaw as { rostersAsOf: string }).rostersAsOf;

/** Announced retirements effective end of 2025-26 (curated). */
export const RETIRED_2026: string[] = (retiredRaw as { players: string[] }).players;
/** Player impact (HYBRID metric) by playerId, plus the BPM→HYBRID fallback fit. */
export interface ImpactEntry {
  /** Apron Value (0-100, 50 = replacement, ~97 = league best). The display number. */
  av: number;
  /** Impact in points per 100 possessions (RAPMp-anchored, 0-centered). */
  pts: number;
  /** ± uncertainty band, in impact points. */
  unc: number;
  /** Prior-season minutes played (for minutes-weighted team projections). */
  mp?: number;
  /** RAPMp component (real on-court impact), when available. */
  rapmp?: number;
  /** Box BPM component, when available. */
  bpm?: number;
  /** MVP / All-NBA / High starter / Starter / Rotation / Depth. */
  tier: string;
  conf: string;
  /** "hybrid" = full box+RAPM; "box" = box-half fallback (approximate). */
  src: string;
}
export const IMPACT_2026: {
  bpmFallback: { slope: number; intercept: number };
  byId: Record<string, ImpactEntry>;
} = impactRaw as never;
export interface TeamStrength {
  /** Team Apron Value (minutes-weighted current roster). */
  av: number;
  /** Projected net rating from roster HYBRID. */
  projNrtg: number;
  /** 2025-26 actual net rating (context). */
  nrtg: number;
  /** 2025-26 actual wins (context). */
  w: number;
}
export const TEAM_STRENGTH_2026: Record<string, TeamStrength> =
  (teamStrengthRaw as { byTeam: Record<string, TeamStrength> }).byTeam;
/** Model-native projection calibration: projNrtg = intercept + rosterCoef·rosterScore
 * + fitCoef·teamFit, fit to actual net ratings (R²=0.75); wins = winsIntercept +
 * winsPerNrtg·projNrtg. */
export interface TeamCalibration {
  /** Weight on the rotation's talent score, in standard deviations. */
  talentZ: number;
  /** Weight on minutes-weighted perimeter defense, in standard deviations. */
  perdZ: number;
  /** Variance match: a conditional-mean fit under-disperses by construction, so
   * predictions are scaled until the league's spread equals the historical
   * spread of REAL team net ratings. Preserves ranking and the calibrated mean. */
  nrtgSpread: number;
  winsIntercept: number;
  winsPerNrtg: number;
  /** Measured out-of-sample error, for /accuracy to quote honestly. */
  cvRmseNrtg?: number;
  /** @deprecated pre-2026-07 shape: intercept + rosterCoef·talent + fitCoef·fit. */
  intercept?: number;
  rosterCoef?: number;
  fitCoef?: number;
}
export const TEAM_CALIBRATION: TeamCalibration =
  (teamStrengthRaw as { calibration: TeamCalibration }).calibration;
const positionOverrides = positionOverridesRaw as {
  byId?: Record<string, string>;
  secondaryById?: Record<string, string[]>;
};
/** Projected value/fit/position for incoming rookies (no NBA sample yet) —
 * from draft slot + college production + scouting consensus. */
export interface RookieProjection {
  bpm: number;
  dims: { off: number; def: number; play: number; reb: number; space: number; rim: number; perd: number };
  secondary?: string[];
  archetype?: string;
  /** Projected rookie-season minutes/game from draft slot + readiness — a rookie
   * has no bio playing-time row, so without this he'd project to zero minutes. */
  mpg?: number;
}
export const ROOKIE_PROJECTIONS_2026: Record<string, RookieProjection> =
  (rookieProjectionsRaw as { byId: Record<string, RookieProjection> }).byId;
/** Value/fit/minutes projections for every player with NO current NBA sample —
 * rookies AND returning veterans — through one lookup the model consumes. */
export const PROJECTED_PLAYERS_2026: Record<string, RookieProjection> = {
  ...ROOKIE_PROJECTIONS_2026,
  ...Object.fromEntries(returningFas.map((p) => [p.playerId, { bpm: p.bpm, dims: p.dims, secondary: p.secondary, mpg: p.mpg, archetype: p.archetype }])),
};
const rookieSecondaries: Record<string, string[]> = Object.fromEntries(
  Object.entries(ROOKIE_PROJECTIONS_2026)
    .filter(([, r]) => r.secondary && r.secondary.length)
    .map(([id, r]) => [id, r.secondary!]),
);
/** Primary position (PG/SG/SF/PF/C) by playerId, near-full coverage —
 * data-driven (most-played spot from play-by-play minute shares) where
 * available, else Basketball-Reference's assigned position. Curated overrides
 * (position-overrides-2026.json) win where present. */
export const POSITIONS_2026: Record<string, string> = {
  ...(positionsRaw as { byId: Record<string, string> }).byId,
  ...(positionOverrides.byId ?? {}),
  ...rvPositions,
};
/** SECONDARY positions a player realistically plays. Base is the play-by-play
 * measure (spots he logged ≥12% of his minutes at); curated overrides fill the
 * ~250 rostered players the play-by-play table never measured and correct
 * role-blind cases (a small-ball five whose second spot is C, not SF). */
export const SECONDARY_POSITIONS_2026: Record<string, string[]> = {
  ...((positionsRaw as { secondaryById?: Record<string, string[]> }).secondaryById ?? {}),
  ...(positionOverrides.secondaryById ?? {}),
  ...rookieSecondaries,
  ...rvSecondaries,
};
/** Raw share of minutes at each position (PG/SG/SF/PF/C), where measured. */
export const POSITION_SHARES_2026: Record<string, Record<string, number>> =
  (positionsRaw as { sharesById?: Record<string, Record<string, number>> }).sharesById ?? {};
/** Per-player bio + availability (Basketball-Reference 2025-26): real age (for
 * the aging curve), games played + started, minutes, minutes/game. 100% of the
 * impact-model players are covered. */
export interface PlayerBio { age?: number; g?: number; gs?: number; mp?: number; mpg?: number; }
export const PLAYER_BIO_2026: Record<string, PlayerBio> = {
  ...(playerBioRaw as { byId: Record<string, PlayerBio> }).byId,
  ...rvBios,
};

/** Per-player 2025-26 statistical profile (Basketball-Reference advanced +
 * per-game rate/box stats) — the raw material behind the dimensional model. */
export const PLAYER_STATS_2026: Record<string, Record<string, number>> =
  (playerStatsRaw as { byId: Record<string, Record<string, number>> }).byId;

/** Dimensional player model, each 0-100: offense, defense, playmaking,
 * rebounding, spacing, rim protection, perimeter defense, plus usage. Derived
 * from the statistical profile and used by the team-fit engine. */
export interface PlayerDims { off: number; def: number; play: number; reb: number; space: number; rim: number; perd: number; usg: number; }
export const PLAYER_DIMENSIONS_2026: Record<string, PlayerDims> =
  (playerDimsRaw as { byId: Record<string, PlayerDims> }).byId;

/** Real, current injury facts (Basketball-Reference injury report): the actual
 * reported injury, its date, and — for the majors that carry into 2026-27 — a
 * standard-recovery estimate of games missed to start the season. Not a
 * probabilistic "injury prone" tag; the real thing. */
export interface PlayerInjury { name: string; team: string; date: string; desc: string; type: string; status: string; gamesOut: number; }
export const PLAYER_INJURIES_2026: Record<string, PlayerInjury> =
  (playerInjuriesRaw as { byId: Record<string, PlayerInjury> }).byId;

/** Star PEDIGREE (82orBust peak rating + accolades) — the signal that an
 * established star stays a star even when his aged or injury-shortened current
 * season understates him. The value model floors current impact at the
 * age-decayed pedigree. */
export interface PlayerPedigree { peakOvr: number; an1: number; an2: number; an3: number; ad: number; as: number; mvp: number; dpoy: number; roy: number; smoy: number; mip: number; ring: number; fame: number; }
export const PLAYER_PEDIGREE_2026: Record<string, PlayerPedigree> =
  (playerPedigreeRaw as { byId: Record<string, PlayerPedigree> }).byId;

/** Prior-season advanced stats (2023-24, 2024-25) by playerId, so a player's
 * value can lean on his recent BODY OF WORK, not one aged/injured season. */
export interface SeasonLine { bpm?: number; vorp?: number; mp?: number; g?: number; per?: number; ws?: number; }
export const PLAYER_HISTORY: Record<string, Record<string, SeasonLine>> =
  (playerHistoryRaw as { byId: Record<string, Record<string, SeasonLine>> }).byId;

/** Last-three-season All-NBA / All-Defensive selections, recency- and
 * team-level-weighted — proof a player is STILL elite, not just was. Weighted
 * above career totals in the value model. */
export interface RecentAccolades { nba: number; def: number; }
export const PLAYER_RECENT_ACCOLADES: Record<string, RecentAccolades> =
  (recentAccoladesRaw as { byId: Record<string, RecentAccolades> }).byId;
/** Sheet stubs for real signings with no scraped 2025-26 row (see file note).
 * `years` is usually empty — the signings feed books the new deal onto the stub
 * — but a stub for a player who was TRADED rather than signed carries his real
 * salary rows, since no signing row will ever supply them. */
export interface ExtraContract {
  playerId: string;
  playerName: string;
  teamId: string;
  years: { leagueYear: string; salary: number; guarantee: string }[];
  why?: string;
}
export const EXTRA_CONTRACTS: ExtraContract[] =
  (extraContractsRaw as { players: ExtraContract[] }).players;
/** Waived DURING 2025-26 (before the transactions window) — no FA hold. */
export const WAIVED_2025_26: string[] = (waivedRaw as { players: { name: string }[] }).players.map((p) => p.name);
/** Audited roster corrections (Jul 2026). Waived players who are unsigned UFAs,
 * dead-money charges that are wrong/stale, and resolved RFA offer sheets. */
export interface WaivedFreeAgent { playerId: string; name: string; priorTeam: string; lastSalary: number; note?: string; }
export const WAIVED_FREE_AGENTS: WaivedFreeAgent[] = (rosterCorrectionsRaw as { waivedFreeAgents: WaivedFreeAgent[] }).waivedFreeAgents;
export const SUPPRESS_DEAD_CAP: string[] = (rosterCorrectionsRaw as { suppressDeadCap: string[] }).suppressDeadCap;
export const RESOLVED_OFFER_SHEETS: string[] = (rosterCorrectionsRaw as { resolvedOfferSheets: string[] }).resolvedOfferSheets;
/** Agreed signings a team can't legally execute yet on the reconciled sheet —
 * held out of the cap books (player keeps his old-team hold) until the feed
 * shows the cap-clearing move or corrected terms. */
export const PENDING_SIGNINGS: string[] = (rosterCorrectionsRaw as { pendingSignings?: string[] }).pendingSignings ?? [];
/** Curated free-agent feed corrections, keyed by normalized name. */
export const FA_OVERRIDES: Record<string, { birdStatus?: string }> = (faOverridesRaw as { byName: Record<string, { birdStatus?: string }> }).byName;

// Feed rows first (newest-first); manually curated breaking moves appended so a
// later feed row for the same player supersedes the manual entry.
export const TRANSACTIONS = [
  ...(transactionsRaw as { transactions: Transaction[] }).transactions,
  ...(manualMovesRaw as { transactions: Transaction[] }).transactions,
];

export interface DeadlineRow {
  date: string;
  player: string;
  team: string;
  pos: string;
  kind: string;
  amount: number;
  note: string;
}

/** Upcoming option/guarantee decision deadlines (Spotrac via Firecrawl). */
export const UPCOMING_DEADLINES = (
  upcomingRaw as { rows: DeadlineRow[] }
).rows;

/** Extension-eligible players (Spotrac via Firecrawl). */
export const EXTENSION_ELIGIBLE = (
  extEligibleRaw as { rows: DeadlineRow[] }
).rows;

export interface DraftPick {
  year: number;
  headline: string;
  detail: string;
}
export interface TeamPicks {
  incoming: DraftPick[];
  outgoing: DraftPick[];
}

import tradeExceptionsRaw from "./trade-exceptions.json";

export interface TradeException {
  team: string;
  player: string;
  amount: number;
  expires: string;
  original?: number;
  singleSource?: boolean;
}

/** Active traded-player exceptions (Spotrac × SalarySwish, cross-checked). */
export const TRADE_EXCEPTIONS = (
  tradeExceptionsRaw as { asOf: string; rows: TradeException[] }
).rows;

import feedTeamStateRaw from "./feed-team-state.json";

export interface FeedTeamState {
  /** Used cap room this July — NT/TP-MLE + BAE are dead for the year. */
  operatedUnderCap?: boolean;
  /** Dollars of each exception the feed already spent. */
  roomMleUsed?: number;
  consumedNtmle?: number;
  consumedTpmle?: number;
  consumedBae?: number;
  /** Hard cap already triggered in-world (NT-MLE/BAE/S&T → 1A, TP-MLE → 2A). */
  inWorldHardCap?: "first_apron" | "second_apron" | "none";
  /** Short human label for what triggered it, e.g. "Walker Kessler sign-and-trade". */
  hardCapSource?: string;
  /** FA names (lowercase) whose holds the team demonstrably renounced. */
  forcedRenounced?: string[];
  /**
   * A cap-clearing move that is REPORTED but not yet in the feed, when the
   * team's own books cannot close without one. This is the only forward-looking
   * field in the file and it is deliberately inert: nothing applies it to a
   * sheet, because an expected waive is not a waive. It exists so a reader
   * looking at an impossible-looking cap sheet is told what everyone covering
   * the team already knows, with the source attached.
   */
  pendingRelief?: {
    /** The ONLY public-facing field: one plain line naming the way out. */
    short: string;
    /** Provenance — the arithmetic and the sourcing. Never rendered. */
    text: string;
    source: string;
    asOf: string;
  };
  confidence?: string;
  rationale?: string;
}

/** Audited per-team offseason state from the feed (room usage, consumed
 * exceptions, in-world hard caps, forced renounces). */
export const FEED_TEAM_STATE = (
  feedTeamStateRaw as { asOf: string; teams: Record<string, FeedTeamState> }
).teams;

export {
  FIRST_ENCUMBRANCES,
  PICK_LEDGER_TEAMS,
  ACQUIRED_PICKS,
  firstEncumbranceOf,
  type FirstEncumbrance,
  type FirstEncumbranceStatus,
  type AcquiredPick,
} from "./pick-encumbrances";

/** Future draft-pick ledger by team (RealGM via Firecrawl). */
export const DRAFT_PICKS = (
  draftPicksRaw as { teams: Record<string, TeamPicks> }
).teams;

export {
  PICK_RIGHTS,
  swapRightsOf,
  ownFirstSwapsOf,
  type TeamPickRights,
  type OwnFirstObligation,
  type PickHolding,
  type Favorable,
} from "./pick-rights";

/**
 * Real NBA contract data, scraped from Basketball-Reference per-team contract
 * pages. Each contract carries multi-year base salaries (2025-26 … 2030-31), so
 * the active league year can be selected by the consumer. Team totals include
 * some non-guaranteed/dead-money rows pending a guarantee pass.
 */
export const LEAGUE_2025_26 = raw as unknown as LeagueData;

/** 2026 draft class as rookie-scale contracts (2026-27, salaries approximate). */
export const ROOKIES_2026 = rookiesRaw as unknown as Contract[];

export function getLeagueData(): LeagueData {
  return LEAGUE_2025_26;
}
