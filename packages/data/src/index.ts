import type { Contract, LeagueData } from "@apron/cba-engine";
import raw from "./contracts-2025-26.json";
import rookiesRaw from "./rookies-2026.json";
import transactionsRaw from "./transactions.json";
import manualMovesRaw from "./manual-moves.json";
import retiredRaw from "./retired-2026.json";
import waivedRaw from "./waived-2025-26.json";
import impactRaw from "./impact-2026.json";
import positionsRaw from "./positions-2026.json";
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

/** Player years-of-service entering 2026-27 (Basketball-Reference). */
export const EXPERIENCE = experienceRaw as Record<string, number>;

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

/** 2026 free-agent Bird status + UFA/RFA, keyed by normalized name (Spotrac). */
export const FREE_AGENT_INFO = (
  freeAgentsRaw as { byName: Record<string, FreeAgentInfo> }
).byName;

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
  /** Exact HYBRID z (box + RAPM) — present for players above the RAPM minutes cutoff. */
  h?: number;
  /** TWV box-half z — for players below the cutoff (minutes-shrunk downstream). */
  twv?: number;
  mp?: number;
  /** RAPMp (real on-court impact, pts/100) — provenance for the hover. */
  rapmp?: number;
  /** Box BPM — provenance for the hover. */
  bpm?: number;
}
export const IMPACT_2026: {
  maxHybrid: number;
  bpmFallback: { slope: number; intercept: number };
  byId: Record<string, ImpactEntry>;
} = impactRaw as never;
/** Primary position (PG/SG/SF/PF/C) by playerId, near-full coverage. */
export const POSITIONS_2026: Record<string, string> = (positionsRaw as { byId: Record<string, string> }).byId;
/** Sheet stubs for real signings with no scraped 2025-26 row (see file note). */
export const EXTRA_CONTRACTS: { playerId: string; playerName: string; teamId: string; years: never[] }[] =
  (extraContractsRaw as { players: { playerId: string; playerName: string; teamId: string; years: never[] }[] }).players;
/** Waived DURING 2025-26 (before the transactions window) — no FA hold. */
export const WAIVED_2025_26: string[] = (waivedRaw as { players: { name: string }[] }).players.map((p) => p.name);
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
  firstEncumbranceOf,
  type FirstEncumbrance,
  type FirstEncumbranceStatus,
} from "./pick-encumbrances";

/** Future draft-pick ledger by team (RealGM via Firecrawl). */
export const DRAFT_PICKS = (
  draftPicksRaw as { teams: Record<string, TeamPicks> }
).teams;

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
