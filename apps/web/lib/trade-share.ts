import { matchRuleLabel, shortDate, type ApronTier } from "@apron/cba-engine";
import { frozenFirstOf } from "@apron/data";
import {
  BASE_CONTRACTS,
  teamMeta,
  C,
  lockedFirstEncumbrance,
  feedStateOf,
  SIM_DATE,
  TRADE_DEADLINE,
  type StepienFinding, hardCapOrdinal,
} from "./league";
import { fmtM } from "./format";
import { ruleOnBaseTrade } from "./verdict";
import { shortPlayerName } from "./names";

interface DecodedMove {
  from: string;
  to: string;
}

export interface DecodedPick {
  id: string; // ORIGIN|YEAR|ROUND
  from: string;
  to: string;
}

export interface DecodedSwap {
  year: number;
  round: number;
  favoredTo: string; // team that takes the more favorable pick
  otherTeam: string; // team whose pick can be swapped away
}

/** Human label for a pick id, e.g. "MIL 2028 1st". */
export function pickShareLabel(id: string): string {
  const [origin, year, round] = id.split("|");
  return `${origin} ${year} ${round === "1" ? "1st" : "2nd"}`;
}

/** Label a pick swap from one team's side, e.g. "’28 1st swap w/ OKC".
 * A swap is a right, so it reads the same on both legs — only the named
 * counterparty flips depending on whose card row it appears in. */
export function swapShareLabel(s: DecodedSwap, viewer?: string): string {
  const other = viewer === s.otherTeam ? s.favoredTo : s.otherTeam;
  return `’${s.year - 2000} ${s.round === 1 ? "1st" : "2nd"} swap w/ ${other}`;
}

/** btoa/atob with a URL-safe alphabet: no +, /, or = to get mangled by
 * crawlers, chat apps, or query-string handling. Decode accepts both the
 * url-safe and classic forms (old shared links keep working), and restores
 * spaces to + in case an intermediary already decoded %2B. */
const toB64Url = (s: string) => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64Url = (s: string) => {
  const restored = s.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
  return restored + "=".repeat((4 - (restored.length % 4)) % 4);
};

/** The day a staged trade is judged on: the data's date, or the deadline with
 * every freeze that lifts by then lifted. */
export type TradeDay = "today" | "deadline";
/** The ISO date a trade day stands for. */
export const tradeDateOf = (day: TradeDay): string => (day === "deadline" ? TRADE_DEADLINE : SIM_DATE);

/**
 * The line a share card signs off with. A trade judged at the deadline says
 * so: the same deal can be blocked today and legal on Feb. 11, and two cards
 * for it that both read "under the 2023 CBA" would contradict each other.
 */
export function verdictLine(legal: boolean, day: TradeDay): string {
  const word = legal ? "Legal" : "Blocked";
  return day === "deadline"
    ? `${word} at the ${shortDate(TRADE_DEADLINE).replace(/, \d{4}$/, "")} trade deadline`
    : `${word} under the 2023 CBA`;
}

/** Decode a shared trade (?t=) into teams + player/pick movements. */
export function decodeTradeParam(t: string): {
  teams: string[];
  players: { playerId: string; from: string; to: string }[];
  picks: DecodedPick[];
  swaps: DecodedSwap[];
  /** The day the sharer judged it on. Links minted before the token carried
   * one read as today, which is what they were. */
  day: TradeDay;
} | null {
  try {
    const o = JSON.parse(atob(fromB64Url(t))) as {
      t?: unknown;
      s?: Record<string, DecodedMove>;
      p?: Record<string, DecodedMove>;
      w?: { y: number; r: number; f: string; o: string }[];
      d?: unknown;
    };
    if (!Array.isArray(o.t) || !o.s || typeof o.s !== "object") return null;
    const teams = o.t as string[];
    const inBoard = (mv: DecodedMove) => teams.includes(mv.from) && teams.includes(mv.to);
    const players = Object.entries(o.s)
      .filter(([, mv]) => inBoard(mv))
      .map(([playerId, mv]) => ({ playerId, from: mv.from, to: mv.to }));
    const picks = Object.entries(o.p ?? {})
      .filter(([, mv]) => inBoard(mv))
      // Stale links (minted before the real-obligation ledger) may carry a
      // first the origin team doesn't actually have — drop it, keep the rest.
      .filter(([id, mv]) => {
        const [origin, yearStr, round] = id.split("|");
        if (round !== "1" || mv.from !== origin) return true;
        return !lockedFirstEncumbrance(origin!, Number(yearStr)) && !frozenFirstOf(origin!, Number(yearStr));
      })
      .map(([id, mv]) => ({ id, from: mv.from, to: mv.to }));
    const swaps = (Array.isArray(o.w) ? o.w : [])
      .filter((w) => teams.includes(w.f) && teams.includes(w.o) && w.f !== w.o)
      .map((w) => ({ year: w.y, round: w.r, favoredTo: w.f, otherTeam: w.o }));
    return { teams, players, picks, swaps, day: o.d === "deadline" ? "deadline" : "today" };
  } catch {
    return null;
  }
}

/** Encode a staged trade for a shareable URL / OG card. */
export function encodeTradeParam(
  teams: string[],
  players: { playerId: string; from: string; to: string }[],
  picks: DecodedPick[] = [],
  swaps: DecodedSwap[] = [],
  /** Omitted for "today", so a today link is byte-for-byte what it always was. */
  day: TradeDay = "today",
): string {
  const s = Object.fromEntries(players.map((p) => [p.playerId, { from: p.from, to: p.to }]));
  const payload: Record<string, unknown> = { t: teams, s };
  // A trade that is legal only at the deadline used to share as BLOCKED: the
  // token had no day in it, so the page title, the unfurl image and the
  // recipient's board all judged it on today's freezes.
  if (day === "deadline") payload.d = "deadline";
  if (picks.length) payload.p = Object.fromEntries(picks.map((k) => [k.id, { from: k.from, to: k.to }]));
  if (swaps.length) payload.w = swaps.map((k) => ({ y: k.year, r: k.round, f: k.favoredTo, o: k.otherTeam }));
  return toB64Url(btoa(JSON.stringify(payload)));
}

/** Deterministic filing number for a share token — every card is a filing. */
export function filingNo(token: string): string {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
  return `NO. 26-${h.toString(36).toUpperCase().padStart(5, "0").slice(-5)}`;
}

export interface TradeSummary {
  legal: boolean;
  /** Outright pick transfers were part of the deal (so Stepien was checked). */
  hasPicks: boolean;
  reason?: string;
  perTeam: {
    team: string;
    name: string;
    tier: ApronTier;
    incoming: string[];
    outgoing: string[];
    /** Human-readable salary-matching rule this team's leg passes under. */
    rule?: string;
  }[];
}

const lastName = shortPlayerName;

/** Compute a sharable summary of a trade param (server-safe). */
export function summarizeTrade(t: string): TradeSummary | null {
  const d = decodeTradeParam(t);
  if (!d || (!d.players.length && !d.picks.length && !d.swaps.length)) return null;
  // The league as the feed has it (a session's moves aren't visible here),
  // ruled on by the same assembly the admin desk uses, in the board's order.
  const ruling = ruleOnBaseTrade({ teams: d.teams, players: d.players, picks: d.picks, date: tradeDateOf(d.day) });
  const { trade, verdict: v } = ruling;
  const stepienFinding: StepienFinding | null = ruling.stepien[0] ?? null;
  const feedCapped = ruling.hardCaps.length ? v.teams.find((ts) => ts.teamId === ruling.hardCaps[0]!.team) : undefined;
  const nameOf = (id: string) =>
    BASE_CONTRACTS.find((c) => c.playerId === id)?.playerName ?? id;
  const perTeam = v.teams.map((ts) => {
    const use = trade.tpeUse?.[ts.teamId];
    // Only claim a matching rule for a leg that actually PASSED matching — a
    // blocked-on-matching team would otherwise carry "legal under …" right
    // next to the BLOCKED verdict.
    const legPassed = !v.violations.some(
      (x) => x.teamId === ts.teamId && x.ruleId === "salary_matching",
    );
    // When the TPE swallows the whole incoming salary there is no "rest" to
    // match — citing a band computed for $0 would be noise.
    const matchableIn = ts.incomingSalary - (ts.tpeAbsorbed ?? 0);
    const rule =
      ts.incomingSalary > 0 && legPassed
        ? ts.tpeAbsorbed
          ? matchableIn > 0
            ? `${use?.label ?? "TPE"} absorbs ${fmtM(ts.tpeAbsorbed)}; rest ${matchRuleLabel(ts.matchingRule, C)}`
            : `${use?.label ?? "TPE"} absorbs the full ${fmtM(ts.tpeAbsorbed)} — no matching needed`
          : matchRuleLabel(ts.matchingRule, C)
        : undefined;
    return {
      team: ts.teamId,
      name: teamMeta(ts.teamId).name,
      tier: ts.postTradeTier,
      incoming: [
        ...d.players.filter((p) => p.to === ts.teamId).map((p) => nameOf(p.playerId)),
        ...d.picks.filter((p) => p.to === ts.teamId).map((p) => pickShareLabel(p.id)),
        ...d.swaps.filter((s) => s.favoredTo === ts.teamId).map((s) => swapShareLabel(s, ts.teamId)),
      ],
      outgoing: [
        ...d.players.filter((p) => p.from === ts.teamId).map((p) => nameOf(p.playerId)),
        ...d.picks.filter((p) => p.from === ts.teamId).map((p) => pickShareLabel(p.id)),
        ...d.swaps.filter((s) => s.otherTeam === ts.teamId).map((s) => swapShareLabel(s, ts.teamId)),
      ],
      rule,
    };
  });
  return {
    legal: v.legal && !stepienFinding && !feedCapped,
    hasPicks: d.picks.length > 0,
    reason:
      v.violations[0]?.reason ??
      (stepienFinding
        ? stepienFinding.message
        : feedCapped
          ? `${teamMeta(feedCapped.teamId).name} is hard-capped at the ${hardCapOrdinal(feedStateOf(feedCapped.teamId).hardCap)} apron by a real move this offseason${feedStateOf(feedCapped.teamId).hardCapSource ? ` (${feedStateOf(feedCapped.teamId).hardCapSource})` : ""} — this trade would exceed it.`
          : undefined),
    perTeam,
  };
}

export { lastName };
