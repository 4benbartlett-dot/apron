import { validateTrade, violatesStepien, matchRuleLabel, type ApronTier, type Trade } from "@apron/cba-engine";
import {
  BASE_CONTRACTS,
  leagueData,
  teamMeta,
  C,
  lockedFirstEncumbrance,
  freeAgentsOf,
  holdsByTeam,
  feedStateOf,
  tpeLedger,
  fitTpePlan,
  stepienFindingFor,
  type StepienFinding,
} from "./league";
import { fmtM } from "./format";

interface DecodedMove {
  from: string;
  to: string;
}

export interface DecodedPick {
  id: string; // ORIGIN|YEAR|ROUND
  from: string;
  to: string;
}

/** Human label for a pick id, e.g. "MIL 2028 1st". */
export function pickShareLabel(id: string): string {
  const [origin, year, round] = id.split("|");
  return `${origin} ${year} ${round === "1" ? "1st" : "2nd"}`;
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

/** Decode a shared trade (?t=) into teams + player/pick movements. */
export function decodeTradeParam(t: string): {
  teams: string[];
  players: { playerId: string; from: string; to: string }[];
  picks: DecodedPick[];
} | null {
  try {
    const o = JSON.parse(atob(fromB64Url(t))) as {
      t?: unknown;
      s?: Record<string, DecodedMove>;
      p?: Record<string, DecodedMove>;
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
        return !(round === "1" && mv.from === origin && lockedFirstEncumbrance(origin!, Number(yearStr)));
      })
      .map(([id, mv]) => ({ id, from: mv.from, to: mv.to }));
    return { teams, players, picks };
  } catch {
    return null;
  }
}

/** Encode a staged trade for a shareable URL / OG card. */
export function encodeTradeParam(
  teams: string[],
  players: { playerId: string; from: string; to: string }[],
  picks: DecodedPick[] = [],
): string {
  const s = Object.fromEntries(players.map((p) => [p.playerId, { from: p.from, to: p.to }]));
  const payload: Record<string, unknown> = { t: teams, s };
  if (picks.length) payload.p = Object.fromEntries(picks.map((k) => [k.id, { from: k.from, to: k.to }]));
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

const lastName = (n: string) => n.split(" ").slice(-1)[0] ?? n;

/** Compute a sharable summary of a trade param (server-safe). */
export function summarizeTrade(t: string): TradeSummary | null {
  const d = decodeTradeParam(t);
  if (!d || (!d.players.length && !d.picks.length)) return null;
  const data = leagueData(BASE_CONTRACTS);
  // Base-state holds (server-side; session renounces aren't visible here).
  let trade: Trade = {
    teams: d.teams,
    players: d.players,
    capHolds: holdsByTeam(freeAgentsOf(BASE_CONTRACTS)),
  };
  let v = validateTrade(data, trade, C);
  // Same TPE auto-fit as the live boards (base ledger — session-minted TPEs
  // aren't visible server-side), so share cards agree with what users see.
  if (!v.legal && v.violations.some((x) => x.ruleId === "salary_matching")) {
    const incomingByTeam: Record<string, { playerId: string; salary: number }[]> = {};
    for (const p of d.players) {
      const c = BASE_CONTRACTS.find((x) => x.playerId === p.playerId);
      const salary = c?.years.find((y) => y.leagueYear === "2026-27")?.salary ?? 0;
      (incomingByTeam[p.to] ??= []).push({ playerId: p.playerId, salary });
    }
    const plan = fitTpePlan(v.teams, incomingByTeam, tpeLedger([]));
    if (plan) {
      trade = { ...trade, tpeUse: plan };
      v = validateTrade(data, trade, C);
    }
  }
  // Stepien against the real-world base ledger (session moves aren't visible
  // server-side, but pre-existing obligations are) — so share cards and OG
  // images can't stamp LEGAL on a pick package the board would block.
  let stepienFinding: StepienFinding | null = null;
  for (const teamId of d.teams) {
    const outs = new Set(d.picks.filter((p) => p.from === teamId).map((p) => p.id));
    const ins = new Set(
      d.picks.filter((p) => p.to === teamId && p.id.endsWith("|1")).map((p) => Number(p.id.split("|")[1])),
    );
    const uncovered: number[] = [];
    for (const y of [2027, 2028, 2029, 2030, 2031, 2032]) {
      const ownGone = outs.has(`${teamId}|${y}|1`) || lockedFirstEncumbrance(teamId, y) !== undefined;
      if (ownGone && !ins.has(y)) uncovered.push(y);
    }
    if (lockedFirstEncumbrance(teamId, 2033)) uncovered.push(2033);
    if (!violatesStepien(uncovered)) continue;
    const outYears = d.picks
      .filter((p) => p.from === teamId && p.id.startsWith(`${teamId}|`) && p.id.endsWith("|1"))
      .map((p) => Number(p.id.split("|")[1]));
    stepienFinding = stepienFindingFor(teamId, uncovered, outYears);
    if (stepienFinding) break;
  }
  // A hard cap the team already triggered with its REAL July moves binds
  // here too — share cards must agree with the live board.
  const feedCapped = v.teams.find(
    (ts) => ts.postTradeSalary > feedStateOf(ts.teamId).hardCap + 1,
  );
  const nameOf = (id: string) =>
    BASE_CONTRACTS.find((c) => c.playerId === id)?.playerName ?? id;
  const perTeam = v.teams.map((ts) => {
    const use = trade.tpeUse?.[ts.teamId];
    const rule =
      ts.incomingSalary > 0
        ? ts.tpeAbsorbed
          ? `${use?.label ?? "TPE"} absorbs ${fmtM(ts.tpeAbsorbed)}; rest ${matchRuleLabel(ts.matchingRule, C)}`
          : matchRuleLabel(ts.matchingRule, C)
        : undefined;
    return {
      team: ts.teamId,
      name: teamMeta(ts.teamId).name,
      tier: ts.postTradeTier,
      incoming: [
        ...d.players.filter((p) => p.to === ts.teamId).map((p) => nameOf(p.playerId)),
        ...d.picks.filter((p) => p.to === ts.teamId).map((p) => pickShareLabel(p.id)),
      ],
      outgoing: [
        ...d.players.filter((p) => p.from === ts.teamId).map((p) => nameOf(p.playerId)),
        ...d.picks.filter((p) => p.from === ts.teamId).map((p) => pickShareLabel(p.id)),
      ],
      rule,
    };
  });
  return {
    legal: v.legal && !stepienFinding && !feedCapped,
    reason:
      v.violations[0]?.reason ??
      (stepienFinding
        ? stepienFinding.message
        : feedCapped
          ? `${teamMeta(feedCapped.teamId).name} is hard-capped at ${
              feedStateOf(feedCapped.teamId).hardCap === C.firstApron ? "the first apron" : "the second apron"
            } by its real July moves${feedStateOf(feedCapped.teamId).hardCapSource ? ` (${feedStateOf(feedCapped.teamId).hardCapSource})` : ""} — this trade would exceed it.`
          : undefined),
    perTeam,
  };
}

export { lastName };
