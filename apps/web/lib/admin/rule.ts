import {
  validateTrade,
  validateSigning,
  spendingPower,
  classifyTier,
  violatesStepien,
  teamSalary as engTeamSalary,
  type TeamTradeSummary,
  type MechanismId,
  type ContractYear,
} from "@apron/cba-engine";
import { ACQUIRED_PICKS, hasAcquiredFirst } from "@apron/data";
import {
  BASE_CONTRACTS,
  C,
  YEAR,
  leagueData,
  freeAgentsOf,
  holdsByTeam,
  tpeLedger,
  fitTpePlan,
  feedStateOf,
  consumedFor,
  teamMeta,
  lockedFirstEncumbrance,
  stepienFindingFor,
  hardCapDetailFor,
  currentSalary,
  computeWaive,
  deemedMinSalary,
  dealFromAav,
  raiseFor,
  experienceOf,
} from "@/lib/league";
import { buildDocket, buildChecks, tradeConsequences, tierConsequence, type DocketTeam, type DocketCheck, type MoveConsequence } from "@/lib/docket";
import { fmtM, hardCapCause } from "@/lib/format";

/**
 * The desk's rulings, over the base (feed-reconciled) league — the same
 * engine calls the board, the share cards and the news cards make, assembled
 * into one receipt per kind of move. Pure and client-safe: no I/O, so the
 * verdict updates as the form does and "File it" writes exactly what was
 * ruled on. Session moves are deliberately ignored — the admin files the real
 * world, not an offseason someone is playing in their browser.
 */

const PICK_YEARS = [2027, 2028, 2029, 2030, 2031, 2032] as const;

const baseHolds = () => {
  const fas = freeAgentsOf(BASE_CONTRACTS).filter(
    (f) => !feedStateOf(f.priorTeam).forcedRenounced.has(f.playerName.toLowerCase()),
  );
  return holdsByTeam(fas);
};

export interface TradeInput {
  players: { playerId: string; from: string; to: string }[];
  picks: { id: string; from: string; to: string }[];
  cash: { from: string; to: string; amount: number }[];
}

export interface TradeRuling {
  legal: boolean;
  teams: string[];
  summaries: TeamTradeSummary[];
  docket: DocketTeam[];
  checks: DocketCheck[];
  consequences: MoveConsequence[];
  /** Rule findings outside the engine's verdict: Stepien, standing hard caps. */
  problems: string[];
  tpeUse?: Record<string, { amount: number; preExisting: boolean; firstApronCap?: boolean; label?: string }>;
}

export function ruleTrade(input: TradeInput): TradeRuling | null {
  const players = input.players.filter((p) => p.from !== p.to);
  const picks = input.picks.filter((p) => p.from !== p.to);
  const cash = input.cash.filter((c) => c.from !== c.to && c.amount > 0);
  const teams = [...new Set([...players.flatMap((p) => [p.from, p.to]), ...picks.flatMap((p) => [p.from, p.to]), ...cash.flatMap((c) => [c.from, c.to])])].sort();
  if (!teams.length) return null;
  const data = leagueData(BASE_CONTRACTS);
  const holds = baseHolds();
  let trade = { teams, players, capHolds: holds, ...(cash.length ? { cash } : {}) };
  let v = validateTrade(data, trade, C);
  let tpeUse: TradeRuling["tpeUse"];
  if (!v.legal && v.violations.some((x) => x.ruleId === "salary_matching")) {
    const incomingByTeam: Record<string, { playerId: string; salary: number }[]> = {};
    for (const p of players) {
      const c = BASE_CONTRACTS.find((x) => x.playerId === p.playerId);
      (incomingByTeam[p.to] ??= []).push({ playerId: p.playerId, salary: c ? currentSalary(c) : 0 });
    }
    const plan = fitTpePlan(v.teams, incomingByTeam, tpeLedger([]));
    if (plan) {
      trade = { ...trade, tpeUse: plan } as typeof trade;
      const retry = validateTrade(data, { ...trade, tpeUse: plan }, C);
      if (retry.legal) {
        v = retry;
        tpeUse = plan;
      }
    }
  }

  const problems: string[] = [];
  // Stepien, against the real ledger, the way the share cards read it.
  for (const teamId of teams) {
    const outs = new Set(picks.filter((p) => p.from === teamId).map((p) => p.id));
    const ins = new Set(picks.filter((p) => p.to === teamId && p.id.endsWith("|1")).map((p) => Number(p.id.split("|")[1])));
    const coveredByAcquired = (y: number) =>
      ACQUIRED_PICKS.some((ap) => ap.team === teamId && ap.round === 1 && ap.year === y && !outs.has(ap.id)) ||
      (y === 2033 && hasAcquiredFirst(teamId, 2033));
    const uncovered: number[] = [];
    for (const y of PICK_YEARS) {
      const ownGone = outs.has(`${teamId}|${y}|1`) || lockedFirstEncumbrance(teamId, y) !== undefined;
      if (ownGone && !ins.has(y) && !coveredByAcquired(y)) uncovered.push(y);
    }
    if (lockedFirstEncumbrance(teamId, 2033) && !coveredByAcquired(2033)) uncovered.push(2033);
    if (!violatesStepien(uncovered)) continue;
    const outYears = picks.filter((p) => p.from === teamId && p.id.endsWith("|1")).map((p) => Number(p.id.split("|")[1]));
    const f = stepienFindingFor(teamId, uncovered, outYears);
    if (f) problems.push(f.message);
  }
  // A hard cap the real July already set binds this deal too.
  for (const t of v.teams) {
    const d = hardCapDetailFor(t.teamId, Infinity);
    if (d && t.postTradeSalary > d.line + 1)
      problems.push(
        `${teamMeta(t.teamId).name} is hard-capped at ${fmtM(d.line)} all season${d.label ? ` by ${hardCapCause(d.label)}` : ""}; this trade would put them at ${fmtM(t.postTradeSalary)}.`,
      );
  }

  const nameOf = (id: string) => BASE_CONTRACTS.find((c) => c.playerId === id)?.playerName ?? id;
  const salaryOf = (id: string) => {
    const c = BASE_CONTRACTS.find((x) => x.playerId === id);
    return c ? currentSalary(c) : 0;
  };
  const pickMap = Object.fromEntries(picks.map((p) => [p.id, { from: p.from, to: p.to }]));
  const docket = buildDocket(players, pickMap, v.teams, nameOf, salaryOf, tpeUse);
  for (const c of cash) {
    docket.find((d) => d.teamId === c.to)?.gets.push({ label: `Cash ${fmtM(c.amount)}`, pick: true });
    docket.find((d) => d.teamId === c.from)?.sends.push({ label: `Cash ${fmtM(c.amount)}`, pick: true });
  }
  const legal = v.legal && problems.length === 0;
  const checks = buildChecks({
    legal,
    tpeUse,
    involved: v.teams.filter((t) => t.incomingSalary > 0 || t.outgoingSalary > 0),
    violationReasons: v.violations.map((x) => x.reason),
    extraViolations: problems,
    hasFirsts: picks.some((p) => p.id.endsWith("|1")),
  });
  const consequences = tradeConsequences(v.teams, tpeUse, (t) => holds[t] ?? 0, v.checks as never);
  return { legal, teams, summaries: v.teams, docket, checks, consequences, problems, tpeUse };
}

export interface SigningInput {
  playerId?: string;
  playerName: string;
  team: string;
  /** Year-one salary, in dollars. */
  y1: number;
  years: number;
  mechanism?: MechanismId;
}

export interface SigningRuling {
  legal: boolean;
  checks: DocketCheck[];
  consequences: MoveConsequence[];
  mechanism?: { id: MechanismId; label: string; hardCap: "first_apron" | "second_apron" | null };
  /** Every mechanism the team's books offer right now, for the desk's picker. */
  available: { id: MechanismId; label: string; maxSalary: number; hardCap: "first_apron" | "second_apron" | null; maxSeasons?: number }[];
  /** What the pipeline will BOOK from the feed row: the raise it infers and the
   * resulting season rows, so the filed total lands on the intended year one. */
  booking: { raise: number; years: ContractYear[]; total: number; deemedY1: number };
  before: number;
  after: number;
  isOwn: boolean;
}

export function ruleSigning(input: SigningInput): SigningRuling {
  const { team } = input;
  const data = leagueData(BASE_CONTRACTS);
  const before = engTeamSalary(data, team, YEAR);
  const holds = baseHolds();
  const fa = input.playerId ? freeAgentsOf(BASE_CONTRACTS).find((f) => f.playerId === input.playerId) : undefined;
  const isOwn = fa?.priorTeam === team;
  const feed = feedStateOf(team);
  const opts = {
    isOwnFreeAgent: isOwn,
    yearsOfService: fa?.yearsOfService ?? (input.playerId ? experienceOf(input.playerId) : undefined),
    priorSalary: fa?.lastSalary,
    birdStatus: isOwn ? fa?.birdStatus : undefined,
    apronSalary: before,
    roomTeam: feed.roomTeam,
    consumed: consumedFor([], team),
  };
  const power = spendingPower(before + (holds[team] ?? 0), C, opts);
  const v = validateSigning(before + (holds[team] ?? 0), input.y1, C, opts);
  const chosen = input.mechanism ? power.mechanisms.find((m) => m.id === input.mechanism) : v.mechanism;

  const years = Math.max(1, Math.min(input.years, 5));
  // The feed row carries term + total; applySignings back-solves year one
  // from raiseFor()'s inferred raise. Filing the total that raise implies is
  // what lands the intended year one on the sheet.
  const priorTeam = fa?.priorTeam ?? BASE_CONTRACTS.find((c) => c.playerId === input.playerId)?.teamId ?? team;
  const guessRaise = isOwn ? 0.08 : 0.05;
  const guessTotal = Array.from({ length: years }, (_, k) => input.y1 * (1 + guessRaise * k)).reduce((s, x) => s + x, 0);
  const raise = raiseFor(input.playerName, priorTeam, team, guessTotal / years, years);
  const total = Math.round(Array.from({ length: years }, (_, k) => input.y1 * (1 + raise * k)).reduce((s, x) => s + x, 0));
  let rows = dealFromAav(total / years, years, raise);
  const deemedY1 = years === 1 && input.playerId ? deemedMinSalary(input.playerId, rows[0]!.salary, 1) : rows[0]!.salary;
  if (years === 1) rows = [{ ...rows[0]!, salary: deemedY1 }];
  const after = before + deemedY1;

  const checks: DocketCheck[] = [];
  const consequences: MoveConsequence[] = [];
  if (chosen && input.y1 <= chosen.maxSalary + 1) {
    checks.push({
      ok: true,
      text: `${team} can pay ${fmtM(input.y1)} in year one via ${chosen.label} (up to ${fmtM(chosen.maxSalary)})${isOwn && fa?.birdStatus ? `, own free agent with ${fa.birdStatus.replace("_", "-")} rights` : ""}.`,
    });
  } else if (chosen) {
    checks.push({ ok: false, text: `${chosen.label} reaches ${fmtM(chosen.maxSalary)}, not ${fmtM(input.y1)}.` });
  } else {
    checks.push({ ok: false, text: v.reason ?? `No mechanism on ${team}'s books reaches ${fmtM(input.y1)}.` });
  }
  if (chosen && years > (chosen.maxSeasons ?? 5))
    checks.push({ ok: false, text: `${chosen.label} allows at most ${chosen.maxSeasons} seasons; this deal runs ${years}.` });
  checks.push({
    ok: true,
    text: `${team} moves from ${fmtM(before)} (${classifyTier(before, C).replace(/_/g, " ")}) to ${fmtM(after)} (${classifyTier(after, C).replace(/_/g, " ")}).`,
  });
  const hardLine = Math.min(
    feed.hardCap,
    chosen?.hardCap === "first_apron" ? C.firstApron : chosen?.hardCap === "second_apron" ? C.secondApron : Infinity,
  );
  if (Number.isFinite(hardLine)) {
    const room = hardLine - after;
    const source = feed.hardCap <= hardLine ? hardCapCause(feed.hardCapSource) : `using the ${chosen?.label}`;
    checks.push({
      ok: room >= 0,
      text:
        room >= 0
          ? `Fits under the ${fmtM(hardLine)} hard cap from ${source} with ${fmtM(room)} to spare.`
          : `${fmtM(-room)} over the ${fmtM(hardLine)} hard cap from ${source}.`,
    });
  }
  if (chosen?.hardCap && feed.hardCap > (chosen.hardCap === "first_apron" ? C.firstApron : C.secondApron))
    consequences.push({
      team,
      severity: "cap",
      text: `Using the ${chosen.label} hard-caps ${teamMeta(team).name} at the ${chosen.hardCap === "first_apron" ? "first" : "second"} apron for the season; the desk records it in feed-team-state.json.`,
    });
  const crossed = classifyTier(after, C) !== classifyTier(before, C) ? tierConsequence(team, classifyTier(after, C)) : null;
  if (crossed) consequences.push(crossed);
  if (raise !== guessRaise)
    consequences.push({
      team,
      severity: "note",
      text: `The pipeline infers ${Math.round(raise * 100)}% raises for this deal (raiseFor), so the filed total is built on that rate.`,
    });

  return {
    legal: checks.every((c) => c.ok),
    checks,
    consequences,
    mechanism: chosen ? { id: chosen.id, label: chosen.label, hardCap: chosen.hardCap } : undefined,
    available: power.mechanisms.map((m) => ({ id: m.id, label: m.label, maxSalary: m.maxSalary, hardCap: m.hardCap, maxSeasons: m.maxSeasons })),
    booking: { raise, years: rows, total, deemedY1 },
    before,
    after,
    isOwn,
  };
}

export interface WaiveRuling {
  guaranteedTotal: number;
  straightYears: ContractYear[];
  stretch: { years: number; perYear: number; legal: boolean };
  before: number;
  afterStraight: number;
  afterStretch: number;
}

export function ruleWaive(playerId: string): WaiveRuling | null {
  const c = BASE_CONTRACTS.find((x) => x.playerId === playerId && !x.deadMoney);
  if (!c) return null;
  const w = computeWaive(c);
  const before = engTeamSalary(leagueData(BASE_CONTRACTS), c.teamId, YEAR);
  const now = currentSalary(c);
  const straightNow = w.straightYears.find((y) => y.leagueYear === YEAR)?.salary ?? 0;
  return {
    guaranteedTotal: w.guaranteedTotal,
    straightYears: w.straightYears,
    stretch: w.stretch,
    before,
    afterStraight: before - now + straightNow,
    afterStretch: before - now + (w.guaranteedTotal > 0 ? Math.round(w.stretch.perYear) : 0),
  };
}
