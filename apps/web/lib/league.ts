import { getLeagueData, ROOKIES_2026, TRANSACTIONS, EXPERIENCE, FREE_AGENT_INFO, SIGNINGS, RATINGS, EXTENSION_ELIGIBLE, RETIRED_2026, firstEncumbranceOf, FEED_TEAM_STATE, TRADE_EXCEPTIONS } from "@apron/data";
import {
  SEASON_2026_27,
  salaryForYear,
  capHold,
  validateTrade,
  type BirdStatus,
  type Contract,
  type ContractYear,
  type LeagueConstants,
  type LeagueData,
  type MechanismId,
  type Team,
} from "@apron/cba-engine";

/** Normalize a player name for joining across data sources. */
function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sim "today" — anchored to the data snapshot (2026 free agency opened 6/30). */
const SIM_TODAY = new Date(2026, 6, 1); // July 1, 2026
function parseMDY(s: string): Date | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : null;
}
/** Player → the date their extension window OPENS (Spotrac). Extension
 * eligibility is date-gated: a player isn't eligible until that date arrives, so
 * you can't extend a just-drafted rookie, or a vet like Anthony Davis whose
 * window opens weeks from now. */
const EXT_ELIGIBLE_DATE = new Map(
  EXTENSION_ELIGIBLE.map((r) => [normName(r.player), parseMDY(r.date)] as const),
);
export function isExtensionEligible(playerName: string): boolean {
  const d = EXT_ELIGIBLE_DATE.get(normName(playerName));
  return d != null && d.getTime() <= SIM_TODAY.getTime();
}

/**
 * Restricted vs. unrestricted status DERIVED from qualifying-offer transactions:
 * a tendered QO makes a player a Restricted FA; a declined QO makes him an
 * Unrestricted FA. This is the authoritative mechanism — the RFA status exists
 * *because* the team tendered the qualifying offer.
 */
const QO_STATUS: Record<string, "RFA" | "UFA"> = (() => {
  const m: Record<string, "RFA" | "UFA"> = {};
  for (const t of TRANSACTIONS) {
    if (t.type !== "Qualifying Offer") continue;
    const k = normName(t.player);
    if (/tendered/i.test(t.detail)) m[k] = "RFA";
    else if (/declined/i.test(t.detail)) m[k] = "UFA";
  }
  return m;
})();
export function faTypeOf(playerName: string): string | undefined {
  const k = normName(playerName);
  return QO_STATUS[k] ?? FREE_AGENT_INFO[k]?.restriction;
}

/**
 * Players who DECLINED their 2026-27 option (player or team option) — they
 * become free agents, so their 2026-27 salary is stripped from the base data
 * (Basketball-Reference still lists the option year as if it were guaranteed).
 */
/**
 * Players whose reported deal is an EXTENSION (e.g. a pre-moratorium extension
 * of an expiring contract, signed in the old league year). Per CBA Art. VII
 * §8(f), an extension is immediately trade-eligible unless it exceeds
 * extend-and-trade limits — the Dec-15 free-agent freeze does NOT apply.
 */
const EXTENSION_DEALS = new Set(
  TRANSACTIONS.filter(
    (t) => (t.type === "Signing" || t.type === "Re-sign") && /extension/i.test(t.detail),
  ).map((t) => normName(t.player)),
);

/** §8(f)(i) trade restriction for a freshly-extended player: 6 months only if
 * the extension exceeds extend-and-trade limits (first-year salary beyond 120%
 * of the final prior-year salary / estimated average, or a 5+ season deal). */
function extensionRestriction(
  priorFinalSalary: number,
  y1: number,
  years: number,
): string | undefined {
  const limit = Math.max(priorFinalSalary * 1.2, C.estimatedAverageSalary * 1.2);
  return years >= 5 || y1 > limit + 1
    ? "extended beyond extend-and-trade limits (not trade-eligible for 6 months)"
    : undefined;
}

const OPTION_DECLINED = new Set(
  TRANSACTIONS.filter(
    (t) => t.type === "Option" && /declined/i.test(t.detail) && /2026-27/.test(t.detail),
  ).map((t) => normName(t.player)),
);

/** Active league year: the new 2026-27 season (free agency open). */
export const YEAR = "2026-27";
export const C: LeagueConstants = SEASON_2026_27;

const FA_RESTRICTION =
  "signed as a free agent this offseason (not trade-eligible until Dec 15)";

/** Seasons shown in the multi-year cap sheet. */
export const CAP_SHEET_YEARS = ["2026-27", "2027-28", "2028-29", "2029-30"] as const;
/** Rough cap projection past the official years (~7%/yr growth). */
export function projectedCap(year: string): number {
  const n = Number(year.slice(0, 4)) - Number(YEAR.slice(0, 4));
  return Math.round(C.salaryCap * Math.pow(1.07, Math.max(0, n)));
}

const base = getLeagueData();
export const TEAMS: Team[] = base.teams;
const VALID_TEAMS = new Set(TEAMS.map((t) => t.id));
export const TEAM_IDS: string[] = [...TEAMS]
  .map((t) => t.id)
  .sort((a, b) => a.localeCompare(b));

const TWO_WORD_CITIES = ["Los Angeles", "New York", "New Orleans", "Golden State", "San Antonio", "Oklahoma City"];
/** "Portland Trail Blazers" → "Trail Blazers"; "Los Angeles Lakers" → "Lakers". */
export function teamNickname(id: string): string {
  const n = teamMeta(id).name;
  const cut = TWO_WORD_CITIES.some((c) => n.startsWith(c)) ? 2 : 1;
  return n.split(" ").slice(cut).join(" ") || n;
}
/** Sort team ids alphabetically by nickname (Bucks, Bulls, Cavaliers…). */
export const byNickname = (a: string, b: string) => teamNickname(a).localeCompare(teamNickname(b));

const teamById = new Map<string, Team>(TEAMS.map((t) => [t.id, t]));
export function teamMeta(id: string): Team {
  return teamById.get(id) ?? { id, name: id };
}

// Spotrac tricodes that differ from our standard codes.
const SPOTRAC_TO_STD: Record<string, string> = {
  WSH: "WAS",
  NO: "NOP",
  NOH: "NOP",
  NY: "NYK",
  GS: "GSW",
  SA: "SAS",
  UTAH: "UTA",
  PHO: "PHX",
  BRK: "BKN",
  CHO: "CHA",
};
const stdTeam = (code: string) =>
  SPOTRAC_TO_STD[code.toUpperCase()] ?? code.toUpperCase();

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

function preferred(a: Contract, b: Contract): Contract {
  const a27 = salaryForYear(a, "2026-27");
  const b27 = salaryForYear(b, "2026-27");
  if (a27 !== b27) return a27 > b27 ? a : b;
  return salaryForYear(a, "2025-26") >= salaryForYear(b, "2025-26") ? a : b;
}

/** A waived-and-stretched cap charge reads as 3+ seasons of IDENTICAL
 * salary — real contracts have raises. (Lillard's $22.5M×5 on Milwaukee's
 * books vs. his actual Portland deal is the canonical case.) */
function looksStretched(c: Contract): boolean {
  const sals = c.years.filter((y) => y.salary > 0).map((y) => y.salary);
  return sals.length >= 3 && new Set(sals).size === 1;
}

/** Single-row dead money: a flat multi-year charge for a player who did NOT
 * appear in the 2025-26 season (no Basketball-Reference row) — JaVale McGee's
 * $2.2M×3 on Dallas, Rubio's $425k×2 buyout remnant on Cleveland. The
 * no-appearance guard matters because this source also lists some ACTIVE
 * contracts as flat AAV (Quickley's $32.5M×4 is a real deal, and he played). */
function looksDeadSolo(c: Contract): boolean {
  if (RATINGS[c.playerId]) return false; // played in 2025-26 → a real player
  const sals = c.years.filter((y) => y.salary > 0).map((y) => y.salary);
  if (sals.length < 2 || new Set(sals).size !== 1) return false;
  return sals.length >= 3 || sals[0]! < 1_000_000;
}

/** The source cap sheets carry BOTH a stretched player's dead-money charge
 * (on the team that waived him) and his real contract. Keep the real one as
 * the player; keep dead charges on the paying team's books, flagged, under a
 * synthetic id so nothing roster-shaped ever picks them up. */
function dedupe(contracts: Contract[]): Contract[] {
  const groups = new Map<string, Contract[]>();
  for (const c of contracts) {
    const g = groups.get(c.playerId);
    if (g) g.push(c);
    else groups.set(c.playerId, [c]);
  }
  const out: Contract[] = [];
  for (const [pid, rows] of groups) {
    if (rows.length === 1) {
      const only = rows[0]!;
      out.push(looksDeadSolo(only) ? { ...only, deadMoney: true } : only);
      continue;
    }
    const real = rows.filter((r) => !looksStretched(r));
    // Active row: the non-stretch one if exactly identifiable, else the old
    // higher-salary tiebreak among candidates.
    const pool = real.length >= 1 ? real : rows;
    let active = pool[0]!;
    for (const r of pool.slice(1)) active = preferred(active, r);
    out.push(active);
    for (const r of rows) {
      if (r === active) continue;
      out.push({
        ...r,
        playerId: `${pid}::dead-${r.teamId}`,
        deadMoney: true,
      });
    }
  }
  return out;
}

const cloneContract = (c: Contract): Contract => ({ ...c, years: [...c.years] });

/** Apply recent trades (Spotrac feed): move traded players to their new team. */
function applyTrades(contracts: Contract[]): { contracts: Contract[]; moved: string[] } {
  const cloned = contracts.map(cloneContract);
  const byName = new Map<string, Contract>();
  for (const c of cloned) {
    if (c.deadMoney) continue;
    const k = norm(c.playerName);
    if (!byName.has(k)) byName.set(k, c);
  }
  const seen = new Set<string>();
  const moved: string[] = [];
  for (const t of TRANSACTIONS) {
    if (t.type !== "Trade") continue;
    const k = norm(t.player);
    if (seen.has(k)) continue;
    seen.add(k);
    const m = t.detail.match(/Traded to [^(]*\(([A-Za-z]{2,4})\)/);
    if (!m) continue;
    const dest = stdTeam(m[1]);
    if (!VALID_TEAMS.has(dest)) continue;
    const c = byName.get(k);
    if (c && c.teamId !== dest) {
      c.teamId = dest;
      moved.push(`${c.playerName} → ${dest}`);
    }
  }
  return { contracts: cloned, moved };
}

/**
 * Apply free-agent signings (Spotrac feed): give signed players their new
 * 2026-27 deal on the right team. This is what removes them from the free-agent
 * pool (and the cap-hold count) once they've actually re-signed.
 */
function applySignings(contracts: Contract[]): { contracts: Contract[]; signed: string[] } {
  const cloned = contracts.map(cloneContract);
  const byName = new Map<string, Contract>();
  for (const c of cloned) {
    if (c.deadMoney) continue;
    const k = norm(c.playerName);
    if (!byName.has(k)) byName.set(k, c);
  }
  const seen = new Set<string>();
  const signed: string[] = [];
  for (const t of TRANSACTIONS) {
    if (t.type !== "Signing" && t.type !== "Re-sign") continue;
    // Two-way deals carry no cap salary — move the player out of the FA pool
    // (old team keeps no hold) into the new team's two-way slot.
    if (/two-way contract/i.test(t.detail)) {
      const k = norm(t.player);
      const teamM = t.detail.match(/with\s+[A-Za-z .'&-]+\(([A-Za-z]{2,4})\)/);
      const c = byName.get(k);
      if (seen.has(k) || !teamM || !c) continue;
      const team = stdTeam(teamM[1]!);
      if (!VALID_TEAMS.has(team)) continue;
      seen.add(k);
      c.teamId = team;
      c.signedUsing = "Two-Way";
      c.restriction = undefined;
      signed.push(`${c.playerName} → ${team} (two-way)`);
      continue;
    }
    // Must be an actual term/dollar contract (skip qualifying offers, options…).
    if (!/\d+\s*year|\$[\d.]+\s*million/i.test(t.detail)) continue;
    const k = norm(t.player);
    if (seen.has(k)) continue;
    seen.add(k);
    const teamM = t.detail.match(/with\s+[A-Za-z .'&-]+\(([A-Za-z]{2,4})\)/);
    if (!teamM) continue;
    const team = stdTeam(teamM[1]);
    if (!VALID_TEAMS.has(team)) continue;
    const c = byName.get(k);
    if (!c) continue; // unmatched signings skipped to avoid bad duplicates
    // Spotrac labels some re-signings "extension." A true extension of an
    // already-signed player adds FUTURE years — don't overwrite his current
    // year; but an "extension"/re-sign of a FREE AGENT (no current-year salary)
    // is exactly what puts him under contract for 2026-27.
    const hasCurrent = c.years.some((y) => y.leagueYear === YEAR && y.salary > 0);
    if (/extension/i.test(t.detail) && hasCurrent) continue;
    const yearsM = t.detail.match(/(\d+)\s*year/);
    const totalM = t.detail.match(/\$([\d.]+)\s*million/);
    const yrs = yearsM ? Number(yearsM[1]) : 1;
    const total = totalM ? Number(totalM[1]) * 1_000_000 : 0;
    const aav =
      total > 0 ? Math.round(total / yrs) : (C.minimumSalaries[5] ?? 2_800_000);
    c.teamId = team;
    const prior = c.years.find((y) => y.leagueYear === "2025-26")?.salary ?? 0;
    const rows = dealFromAav(aav, yrs);
    if (rows.length === 1)
      rows[0] = { ...rows[0]!, salary: deemedMinSalary(c.playerId, rows[0]!.salary, 1) };
    c.years = [...c.years.filter((y) => y.leagueYear < YEAR), ...rows];
    // An extension of an expiring deal (signed pre-moratorium) is NOT a free-
    // agent signing — no Dec-15 freeze; only the §8(f) extend-and-trade test.
    c.restriction = /extension/i.test(t.detail)
      ? extensionRestriction(prior, rows[0]!.salary, yrs)
      : FA_RESTRICTION;
    // Capture a trade bonus (kicker) if the deal mentions one.
    const kickM = t.detail.match(/([\d.]+)\s*%\s*Trade Bonus/i);
    if (kickM) c.tradeKickerPct = Number(kickM[1]) / 100;
    signed.push(`${c.playerName} → ${team}`);
  }
  return { contracts: cloned, signed };
}

/**
 * Season rows for a new deal from its AAV + term, back-solving the first-year
 * salary from standard 5% raises (so the multi-year cap sheet is real and the
 * year-1 hit isn't overstated by using the flat average).
 */
function dealFromAav(aav: number, term: number): ContractYear[] {
  const n = Math.max(1, Math.min(term || 1, 5));
  const raise = 0.05;
  const y1 = (aav * n) / (n + (raise * n * (n - 1)) / 2);
  const start = Number(YEAR.slice(0, 4));
  return Array.from({ length: n }, (_, k) => ({
    leagueYear: `${start + k}-${String((start + 1 + k) % 100).padStart(2, "0")}`,
    salary: Math.round(y1 * (1 + raise * k)),
    guarantee: "full" as const,
  }));
}

/**
 * Apply the structured signed-free-agent feed (Spotrac's signed page) — the most
 * up-to-date source of the offseason's newest deals. Rebuilds each signed
 * player's contract as a real MULTI-YEAR deal (term + AAV → raised year rows).
 */
function applySignedFA(contracts: Contract[]): { contracts: Contract[]; signed: string[] } {
  const signed: string[] = [];
  const out = contracts.map((c) => {
    if (c.deadMoney) return c;
    const s = SIGNINGS[normName(c.playerName)];
    if (!s || !s.aav || s.aav <= 0) return c;
    const team = stdTeam(s.team);
    if (!VALID_TEAMS.has(team)) return c;
    signed.push(`${c.playerName} → ${team}`);
    const rows = dealFromAav(s.aav, s.years);
    if (rows.length === 1)
      rows[0] = { ...rows[0]!, salary: deemedMinSalary(c.playerId, rows[0]!.salary, 1) };
    const prior = c.years.find((y) => y.leagueYear === "2025-26")?.salary ?? 0;
    return {
      ...cloneContract(c),
      teamId: team,
      // Keep past seasons; the new deal replaces this year forward.
      years: [...c.years.filter((y) => y.leagueYear < YEAR), ...rows],
      // Extensions (pre-moratorium, e.g. Porziņģis) skip the Dec-15 FA freeze.
      restriction: EXTENSION_DEALS.has(normName(c.playerName))
        ? extensionRestriction(prior, rows[0]!.salary, s.years)
        : FA_RESTRICTION,
    };
  });
  return { contracts: out, signed };
}

/**
 * Free agents by option: a player who DECLINED his 2026-27 option (or whose
 * team declined a team option) becomes a free agent — strip the option year so
 * he shows up in the free-agent pool rather than as if under contract.
 */
function applyOptions(contracts: Contract[]): { contracts: Contract[]; freed: string[] } {
  const freed: string[] = [];
  const out = contracts.map((c) => {
    if (c.deadMoney) return c;
    if (!OPTION_DECLINED.has(normName(c.playerName))) return c;
    freed.push(c.playerName);
    return {
      ...cloneContract(c),
      years: c.years.filter((y) => y.leagueYear !== YEAR),
    };
  });
  return { contracts: out, freed };
}

const RETIRED = new Set(RETIRED_2026.map(normName));

// Waived / terminated contracts: the player comes off the roster but any
// guaranteed money stays on the books as dead money. Skip anyone the feed
// later signs or trades — those passes own their current state.
const ACTIVE_LATER = new Set(
  TRANSACTIONS.filter((t) => t.type === "Signing" || t.type === "Re-sign" || t.type === "Trade").map(
    (t) => normName(t.player),
  ),
);
const RELEASED = new Set(
  TRANSACTIONS.filter(
    (t) => (t.type === "Release" || /contract was terminated/i.test(t.detail)) && !ACTIVE_LATER.has(normName(t.player)),
  ).map((t) => normName(t.player)),
);
function applyReleases(contracts: Contract[]): Contract[] {
  return contracts.map((c) =>
    !c.deadMoney && RELEASED.has(normName(c.playerName)) && salaryForYear(c, YEAR) > 0
      ? { ...cloneContract(c), deadMoney: true }
      : c,
  );
}
// Announced retirements leave the league entirely — no roster spot, no hold.
const activeRaw = base.contracts.filter((c) => !RETIRED.has(normName(c.playerName)));
const deduped = dedupe(activeRaw);
// Options first (a declined option makes a player a FA), then trades, then the
// offseason's signings restore/re-sign anyone who agreed to a new deal.
const afterOptions = applyOptions(deduped);
const afterTrades = applyTrades(afterOptions.contracts);
const afterSignings = applySignings(afterTrades.contracts);
// The structured signed-FA feed is authoritative for the newest deals — apply
// it last so it corrects team/salary from the looser transactions-prose pass.
const afterSignedFA = applySignedFA(afterSignings.contracts);
const afterReleases = applyReleases(afterSignedFA.contracts);
const existingIds = new Set(afterReleases.map((c) => c.playerId));
// Real reported rookie-scale terms (e.g. "Signed a 4 year $66.91 million Rookie
// Scale contract") supersede our estimated scale numbers.
const ROOKIE_DEALS = new Map(
  TRANSACTIONS.filter(
    (t) => t.type === "Signing" && /Rookie Scale contract/i.test(t.detail),
  ).map((t) => {
    const yearsM = t.detail.match(/(\d+)\s*year/);
    const totalM = t.detail.match(/\$([\d.]+)\s*million/);
    const yrs = yearsM ? Number(yearsM[1]) : 4;
    const total = totalM ? Number(totalM[1]) * 1_000_000 : 0;
    return [normName(t.player), { yrs, total }] as const;
  }),
);
// CBA Art. VII §8(d)(i): a drafted rookie who signs can't be traded for 30
// days — every 2026 draftee just signed, so the freeze is live in-sim.
const rookieContracts = ROOKIES_2026.filter((r) => !existingIds.has(r.playerId)).map(
  (r) => {
    const deal = ROOKIE_DEALS.get(normName(r.playerName));
    return {
      ...r,
      years:
        deal && deal.total > 0
          ? dealFromAav(Math.round(deal.total / deal.yrs), deal.yrs)
          : r.years,
      restriction: "signed his rookie-scale contract (30-day trade freeze)",
    };
  },
);

/** Base working roster set: trades + signings applied, rookies added. */
export const BASE_CONTRACTS: Contract[] = [
  ...afterReleases,
  ...rookieContracts,
];
export const TRADES_APPLIED = afterTrades.moved;
export const SIGNINGS_APPLIED = [...afterSignings.signed, ...afterSignedFA.signed];

/* ---------------- pure, contracts-parameterized helpers ---------------- */

export function leagueData(contracts: Contract[]): LeagueData {
  return { leagueYear: YEAR, teams: TEAMS, contracts };
}
export function currentSalary(c: Contract): number {
  return salaryForYear(c, YEAR);
}
/** Years of service entering 2026-27 (defaults to a mid-career 8). */
export function experienceOf(playerId: string): number {
  return EXPERIENCE[playerId] ?? 8;
}
/** A REAL pre-existing obligation locking a team's own first for `year` —
 * owed outright or protected-out (it may not convey, so it can't be counted
 * on and it isn't the team's to trade). Swaps return undefined: the team
 * still ends that draft holding A first, just possibly a worse one, so the
 * year stays Stepien-covered and the pick stays formally theirs. */
export function lockedFirstEncumbrance(team: string, year: number) {
  const enc = firstEncumbranceOf(team, year);
  return enc && enc.status !== "swap" ? enc : undefined;
}

/** Art. VII §3(f) + Art. IV §6(h): a veteran with 3+ years of service on a
 * ONE-year contract at his minimum counts against the cap, tax, aprons, and
 * trade matching at the TWO-year minimum — the league reimburses his team the
 * difference. Multi-year minimum deals get no such treatment. Applied at
 * booking time so every consumer (team sums, tiers, matching) sees the deemed
 * number — the same convention as the cap-hit tables the base data uses. */
export function deemedMinSalary(
  playerId: string,
  salary: number,
  years: number,
  /** Sim moves pass their signing mechanism; feed bookings omit it. */
  mechanism?: string,
): number {
  if (years !== 1) return salary;
  if (experienceOf(playerId) < 3) return salary;
  if (mechanism !== undefined) {
    if (mechanism === "minimum") return Math.min(salary, C.minimumSalaries[2]!);
    // §3(f) keys on the CONTRACT, not the signing tool: a one-year deal AT
    // the player's applicable minimum is a minimum contract even via Bird
    // rights or cap room (the own-FA minimum re-sign is the common case).
    // Testing his OWN row keeps near-scale non-minimum deals (e.g. a $3.3M
    // BAE offer sitting near another YOS row) from misbooking.
    const ownMin =
      C.minimumSalaries[Math.min(experienceOf(playerId), 10)] ?? C.minimumSalaries[10]!;
    return salary <= ownMin + 1_000 ? Math.min(salary, C.minimumSalaries[2]!) : salary;
  }
  // Feed path — no mechanism metadata. "At his minimum": the salary sits on
  // the 3+ YOS scale (±$30k tolerates press-release rounding). Matching ANY
  // vet row — not just his own — keeps the rule working when the experience
  // table lacks the player (it defaults to 8 YOS, while a 15-year vet signs
  // at the 10+ figure).
  const onVetScale = Object.entries(C.minimumSalaries).some(
    ([yos, amt]) => Number(yos) >= 3 && Math.abs(salary - amt) <= 30_000,
  );
  if (!onVetScale) return salary;
  return Math.min(salary, C.minimumSalaries[2]!);
}
/** 0-99 OVR-style rating (undefined if the player has no 2025-26 sample). */
export function ratingOf(playerId: string): number | undefined {
  return RATINGS[playerId]?.rating;
}

/**
 * TRADE VALUE (5–99): what a player is worth as an asset — his production
 * (wins from VORP/BPM, dollar-valued) against what his contract pays, with
 * market floors for currently-elite players, a prime-max floor, youth premium,
 * aging discount, and contract-term effects. Calibrated so the ladder matches
 * consensus: young stars on value deals at the top, fair-market stars in the
 * 60s–90s, and the contracts teams attach picks to at the bottom.
 */
export function assetScoreOf(c: Contract): number | undefined {
  const salary = salaryForYear(c, YEAR);
  if (salary <= 0) return undefined;
  const r = RATINGS[c.playerId];
  const yos = EXPERIENCE[c.playerId] ?? 8;
  const yrsRemaining = c.years.filter((y) => y.leagueYear >= YEAR && y.salary > 0).length;

  if (!r) {
    // No NBA sample (rookies): asset value tracks draft slot via scale salary.
    return Math.round(Math.min(92, 32 + (salary / 16_000_000) * 58));
  }

  const WIN$ = 3_300_000;
  // Injury-adjust: a low-minutes season projects from the per-minute rate.
  let vorp = r.vorp;
  if (r.mp < 1600 && r.mp >= 400) {
    vorp = Math.max(vorp, 0.6 * (r.bpm + 2) * 0.514);
  }
  // Star scarcity: wins above ~2.5 VORP don't come apart — they're worth extra.
  let prod = (vorp + Math.max(0, vorp - 2.5) * 0.6) * 2.7 * WIN$;
  // Market floors by current production rate — the trade market never treats a
  // currently-elite player as a strongly negative asset, whatever his salary.
  if (r.bpm >= 7) prod = Math.max(prod, salary * 1.35);
  else if (r.bpm >= 4) prod = Math.max(prod, salary * 1.1);
  else if (r.bpm >= 2) prod = Math.max(prod, salary * 0.85);
  // A prime-age near-max player is worth ≥ ~125% of a binding max.
  if (yos <= 10 && salary >= 0.18 * C.salaryCap) prod = Math.max(prod, salary * 1.4);
  if (yos >= 12) prod *= Math.max(0.78, 1 - 0.03 * (yos - 11));
  if (yos <= 5) prod *= 1 + 0.06 * (6 - yos);

  let surplus = prod - salary;
  // Salary-credibility damper: surplus earned on tiny contracts is partly
  // opportunity, not proven asset value — stars on real money keep 100%.
  if (surplus > 0) surplus *= Math.min(1, 0.55 + salary / 40_000_000);
  const yrs = Math.min(yrsRemaining, 4);
  if (surplus > 0) surplus *= Math.min(1.2, 1 + 0.07 * (yrs - 1));
  // A bad contract's drag caps near half its salary (the picks-to-dump price).
  else surplus = Math.max(surplus * (0.6 + 0.2 * yrs), -0.55 * salary);

  const score =
    surplus >= 0
      ? 40 + 29 * Math.asinh(surplus / 15_000_000)
      : 40 - 20 * Math.asinh(-surplus / 22_000_000);
  return Math.round(Math.max(5, Math.min(99, score)));
}

/** Value units for the fairness meter: throw-ins (score ≤ 35) count ~nothing. */
export function assetMeterValue(c: Contract): number {
  return Math.max(0, (assetScoreOf(c) ?? 0) - 35);
}

/** @deprecated superseded by assetScoreOf/assetMeterValue (kept for compat). */
export function tradeValue(rating: number | undefined): number {
  if (rating == null) return 0;
  return Math.round(Math.pow(Math.max(0, rating - 58), 1.7) / 2.8);
}

/** Where the ORIGIN team's pick is expected to land: rank all 30 rosters by
 * VORP (1 = weakest → best pick), lottery-flattened at the top. */
let strengthRank: Map<string, number> | null = null;
function pickRankOf(team: string): number {
  if (!strengthRank) {
    const vorp = new Map<string, number>();
    for (const c of BASE_CONTRACTS) {
      if (currentSalary(c) <= 0) continue;
      const r = RATINGS[c.playerId];
      if (r) vorp.set(c.teamId, (vorp.get(c.teamId) ?? 0) + Math.max(0, r.vorp));
    }
    const order = [...TEAM_IDS].sort((a, b) => (vorp.get(a) ?? 0) - (vorp.get(b) ?? 0));
    strengthRank = new Map(order.map((t, i) => [t, i + 1]));
  }
  return strengthRank.get(team) ?? 15.5;
}

/** Trade value of a future draft pick, in the same meter units as
 * assetMeterValue. Expected slot comes from the origin team's current roster
 * strength, mean-reverting toward mid-round the further out the draft year
 * (a 2031 pick from anyone is close to a coin flip); slot maps to value on a
 * rookie-contract surplus curve. Unknown origin → league-average slot. */
export function pickValue(year: number, round: 1 | 2, origin?: string): number {
  const dist = Math.max(0, year - (Number(YEAR.slice(0, 4)) + 1));
  const revert = Math.pow(0.72, dist);
  const rank = origin ? pickRankOf(origin) : 15.5;
  // Lottery flattening: the worst team's EXPECTED slot is ~2.5, not 1.
  const now = 2.5 + (rank - 1) * (27.5 / 29);
  const slot = now * revert + 15.5 * (1 - revert);
  const meter =
    round === 1
      ? 50 * Math.exp(-0.075 * (slot - 1))
      : 6.5 * Math.exp(-0.045 * (slot - 1));
  return Math.round(meter * Math.pow(0.97, dist));
}
export function rosterOf(contracts: Contract[], teamId: string): Contract[] {
  return contracts
    .filter((c) => c.teamId === teamId && currentSalary(c) > 0 && !c.deadMoney)
    .sort((a, b) => currentSalary(b) - currentSalary(a));
}

/** Waived/stretched charges on this team's books — on the sheet, off the roster. */
export function deadMoneyOf(contracts: Contract[], teamId: string): Contract[] {
  return contracts
    .filter((c) => c.teamId === teamId && c.deadMoney && currentSalary(c) > 0)
    .sort((a, b) => currentSalary(b) - currentSalary(a));
}

export interface FreeAgent {
  playerId: string;
  playerName: string;
  priorTeam: string;
  lastSalary: number;
  hold: number;
  yearsOfService: number;
  /** Bird sub-type (Spotrac); defaults to full Bird when unknown. */
  birdStatus: BirdStatus;
  /** UFA / RFA / Two-Way (Spotrac). */
  faType?: string;
  /** True if the team has renounced this FA's cap hold (and Bird rights). */
  renounced?: boolean;
  /** Renounced by the REAL July (feed-derived room spending) — permanent;
   * the sim can't restore a hold the team already spent. */
  renouncedInWorld?: boolean;
}
export function freeAgentsOf(contracts: Contract[]): FreeAgent[] {
  return contracts
    .filter(
      (c) =>
        salaryForYear(c, "2025-26") > 0 &&
        salaryForYear(c, "2026-27") === 0 &&
        c.signedUsing !== "Two-Way" &&
        !c.deadMoney,
    )
    .map((c) => {
      const lastSalary = salaryForYear(c, "2025-26");
      const info = FREE_AGENT_INFO[normName(c.playerName)];
      const birdStatus: BirdStatus = info?.birdStatus ?? "bird";
      return {
        playerId: c.playerId,
        playerName: c.playerName,
        priorTeam: c.teamId,
        lastSalary,
        hold: capHold(lastSalary, C, birdStatus),
        yearsOfService: EXPERIENCE[c.playerId] ?? 8,
        birdStatus,
        faType: faTypeOf(c.playerName),
      };
    })
    .sort((a, b) => b.lastSalary - a.lastSalary);
}
export function holdsByTeam(fas: FreeAgent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const fa of fas) out[fa.priorTeam] = (out[fa.priorTeam] ?? 0) + fa.hold;
  return out;
}

/* ----------------------------- GM moves ----------------------------- */

/** Pick ids are `TEAM|YEAR|ROUND` (e.g. "BOS|2028|1") — TEAM is the ORIGINAL
 * owner; current ownership is derived from the move ledger. */
export type Move =
  | {
      kind: "trade";
      label: string;
      players: { playerId: string; to: string }[];
      /** Draft picks changing hands (by original-owner pick id). */
      picks?: { id: string; to: string }[];
      /** TPE absorption chosen when the trade was staged (per team). */
      tpeUse?: Record<string, { amount: number; preExisting: boolean; label?: string }>;
    }
  | {
      kind: "sign";
      label: string;
      playerId: string;
      playerName: string;
      teamId: string;
      salary: number;
      /** Contract length in seasons (defaults to 1). Later years get raises. */
      years?: number;
      /** The exception used (for MLE/BAE consumption tracking). */
      mechanism?: MechanismId;
      /** A new FA signing is trade-restricted; an extension (false) stays eligible. */
      restricted?: boolean;
      /** Override the default Dec-15 restriction text (e.g. matched offer sheets). */
      restrictionText?: string;
    }
  | {
      kind: "sign_trade";
      label: string;
      playerId: string;
      playerName: string;
      toTeam: string;
      salary: number;
      /** Contract length — a sign-and-trade contract must run 3+ seasons. */
      years?: number;
      /** The free agent's old team (receives the return package). */
      fromTeam?: string;
      /** Players the acquirer sends back to fromTeam to match. */
      returnPlayers?: string[];
    }
  | {
      // Give up a free agent's cap hold (and Bird rights) to free up room.
      kind: "renounce";
      label: string;
      playerId: string;
      playerName: string;
      team: string;
    }
  | {
      // Add extension years to a rostered player's contract. The extended
      // player is trade-frozen for 6 months (2023 CBA).
      kind: "extend";
      label: string;
      playerId: string;
      playerName: string;
      salary: number;
      years: number;
    }
  | { kind: "waive"; label: string; playerId: string };


/** Build the season rows for a new deal: first-year `salary` plus standard
 * raises (8% for Bird re-signings, 5% otherwise) for `years` seasons. */
function signingYears(
  salary: number,
  years: number,
  mechanism?: MechanismId,
): ContractYear[] {
  const n = Math.max(1, Math.min(years, 5));
  const raise = mechanism === "bird" ? 0.08 : 0.05;
  const startYear = Number(YEAR.slice(0, 4)); // 2026
  return Array.from({ length: n }, (_, k) => ({
    leagueYear: `${startYear + k}-${String((startYear + 1 + k) % 100).padStart(2, "0")}`,
    salary: Math.round(salary * (1 + raise * k)),
    guarantee: "full" as const,
  }));
}

/** Apply one GM move to a contracts list, returning a new list (immutable). */
export function applyMove(contracts: Contract[], m: Move): Contract[] {
  if (m.kind === "trade") {
    const dest = new Map(m.players.map((p) => [p.playerId, p.to]));
    // Acquired players can't be aggregated for ~2 months. Base-year comp does
    // NOT follow a player to a team that didn't re-sign him, so clear it.
    return contracts.map((c) =>
      dest.has(c.playerId)
        ? {
            ...c,
            teamId: dest.get(c.playerId)!,
            noAggregate: true,
            bycPriorSalary: undefined,
          }
        : c,
    );
  }
  if (m.kind === "sign") {
    let yrs = signingYears(m.salary, m.years ?? 1, m.mechanism);
    if (yrs.length === 1)
      yrs = [{ ...yrs[0]!, salary: deemedMinSalary(m.playerId, yrs[0]!.salary, 1, m.mechanism ?? "unspecified") }];
    const restriction =
      m.restricted === false ? undefined : (m.restrictionText ?? FA_RESTRICTION);
    const idx = contracts.findIndex((c) => c.playerId === m.playerId);
    if (idx >= 0) {
      const c = contracts[idx]!;
      const prior = c.years.find((y) => y.leagueYear === "2025-26")?.salary ?? 0;
      const copy = [...contracts];
      copy[idx] = {
        ...c,
        teamId: m.teamId,
        // Keep only past seasons; the new deal replaces this year forward.
        years: [...c.years.filter((y) => y.leagueYear < YEAR), ...yrs],
        restriction,
        // A re-signed free agent is a brand-new contract — not "recently
        // acquired via trade" and not (yet) a base-year player.
        noAggregate: undefined,
        bycPriorSalary: undefined,
      };
      // Base-year comp arises only when re-signing your OWN free agent to a
      // >20% raise AND the re-signing keeps the team over the salary cap.
      if (c.teamId === m.teamId && prior > 0 && m.salary > prior * 1.2) {
        const teamAfter = copy
          .filter((x) => x.teamId === m.teamId)
          .reduce(
            (s, x) => s + (x.years.find((y) => y.leagueYear === YEAR)?.salary ?? 0),
            0,
          );
        if (teamAfter > C.salaryCap) {
          copy[idx] = {
            ...copy[idx]!,
            bycPriorSalary: prior,
            // CBA Art. VII §8(d)(iii): this exact re-signing (over-cap Bird at
            // >120%) is frozen until Jan 15, not Dec 15.
            restriction:
              m.restricted === false
                ? undefined
                : "re-signed over the cap at a >20% raise (not trade-eligible until Jan 15)",
          };
        }
      }
      return copy;
    }
    return [
      ...contracts,
      {
        playerId: m.playerId,
        playerName: m.playerName,
        teamId: m.teamId,
        years: yrs,
        signedUsing: "GM sign",
        restriction,
      },
    ];
  }
  if (m.kind === "sign_trade") {
    // A sign-and-trade contract must run at least 3 seasons (year 1 guaranteed).
    // The re-sign leg uses Bird rights, so 8% raises.
    const n = Math.max(3, Math.min(m.years ?? 3, 4));
    const start = Number(YEAR.slice(0, 4));
    const yrs: ContractYear[] = Array.from({ length: n }, (_, k) => ({
      leagueYear: `${start + k}-${String((start + 1 + k) % 100).padStart(2, "0")}`,
      salary: Math.round(m.salary * (1 + 0.08 * k)),
      guarantee: "full",
    }));
    const base = {
      teamId: m.toTeam,
      noAggregate: true,
      // A sign-and-trade acquisition is a newly-signed free agent — trade-
      // restricted (can't be re-traded until Dec 15), same as a plain signing.
      restriction: FA_RESTRICTION,
      signedUsing: "Sign-and-trade",
    };
    // Return package: players the acquirer sends back to the FA's old team.
    const ret = new Set(m.returnPlayers ?? []);
    let out = contracts.map((c) =>
      ret.has(c.playerId) && m.fromTeam
        ? { ...c, teamId: m.fromTeam, noAggregate: true, bycPriorSalary: undefined }
        : c,
    );
    const i = out.findIndex((c) => c.playerId === m.playerId);
    if (i >= 0) {
      const c = out[i]!;
      out = [...out];
      out[i] = { ...c, ...base, years: [...c.years.filter((y) => y.leagueYear < YEAR), ...yrs] };
      return out;
    }
    return [
      ...out,
      { playerId: m.playerId, playerName: m.playerName, ...base, years: yrs },
    ];
  }
  // Renouncing changes no contract — its effect (dropping the free agent's cap
  // hold) is derived from the move list in the store.
  if (m.kind === "renounce") return contracts;
  if (m.kind === "extend") {
    const i = contracts.findIndex((c) => c.playerId === m.playerId);
    if (i < 0) return contracts;
    const c = contracts[i]!;
    // Extension years start the season after the current contract's last year.
    const lastYear = c.years.reduce(
      (mx, y) => (y.leagueYear > mx ? y.leagueYear : mx),
      YEAR,
    );
    const startYr = Number(lastYear.slice(0, 4)) + 1;
    const newYears: ContractYear[] = Array.from({ length: m.years }, (_, k) => ({
      leagueYear: `${startYr + k}-${String((startYr + 1 + k) % 100).padStart(2, "0")}`,
      salary: Math.round(m.salary * (1 + 0.08 * k)), // 8% extension raises
      guarantee: "full",
    }));
    // CBA Art. VII §8(f)(i): the 6-month trade freeze applies only when the
    // extension EXCEEDS extend-and-trade limits — covers 5+ seasons, or a
    // first-year salary beyond 120% of the final existing year (or 120% of the
    // estimated average salary). A modest extension stays trade-eligible.
    const finalExisting = [...c.years]
      .filter((y) => y.leagueYear >= YEAR)
      .sort((a, b) => a.leagueYear.localeCompare(b.leagueYear))
      .at(-1)?.salary ?? 0;
    const coveredSeasons =
      c.years.filter((y) => y.leagueYear >= YEAR).length + m.years;
    const etLimit = Math.max(finalExisting * 1.2, C.estimatedAverageSalary * 1.2);
    const freezes = coveredSeasons >= 5 || m.salary > etLimit + 1;
    const copy = [...contracts];
    copy[i] = {
      ...c,
      years: [...c.years, ...newYears],
      restriction: freezes
        ? "extended beyond extend-and-trade limits (not trade-eligible for 6 months)"
        : undefined,
    };
    return copy;
  }
  // waive — drops this year's salary and clears any trade-derived flags, since
  // a waived player's acquisition history no longer governs a future contract.
  const idx = contracts.findIndex((c) => c.playerId === m.playerId);
  if (idx < 0) return contracts;
  const c = contracts[idx]!;
  const copy = [...contracts];
  copy[idx] = {
    ...c,
    years: c.years.filter((y) => y.leagueYear !== YEAR),
    noAggregate: undefined,
    restriction: undefined,
    bycPriorSalary: undefined,
  };
  return copy;
}

/** Hard caps triggered by this session's executed moves, per team — the
 * tightest apron each team froze itself at (a triggered cap binds for the
 * rest of the league year). Sources: NT-MLE/BAE signings and sign-and-trades
 * (first apron), Taxpayer-MLE signings (second apron), and trades where a
 * sub-apron team took back MORE salary than it sent beyond what cap-room
 * absorption covers — the Expanded TPE, restriction-table row E (first
 * apron). Recomputed by replaying the ledger, so saved sessions and shared
 * ?gm= links are repaired retroactively; removing an early move un-triggers
 * caps that no longer apply. Hard caps test APRON salary — holds excluded. */
export function sessionHardCaps(moves: Move[], base: Contract[] = BASE_CONTRACTS): Record<string, number> {
  const line: Record<string, number> = {};
  const capAt = (t: string, v: number) => {
    line[t] = Math.min(line[t] ?? Infinity, v);
  };
  let cs = base;
  const renounced = new Set<string>();
  for (const m of moves) {
    if (m.kind === "renounce") {
      renounced.add(m.playerId);
    } else if (m.kind === "sign") {
      if (m.mechanism === "ntmle" || m.mechanism === "bae") capAt(m.teamId, C.firstApron);
      else if (m.mechanism === "tpmle") capAt(m.teamId, C.secondApron);
    } else if (m.kind === "sign_trade") {
      if (m.toTeam) capAt(m.toTeam, C.firstApron);
    } else if (m.kind === "trade") {
      const teamOf = new Map(cs.filter((c) => !c.deadMoney).map((c) => [c.playerId, c.teamId]));
      const players = m.players
        .map((p) => ({ playerId: p.playerId, from: teamOf.get(p.playerId) ?? "", to: p.to }))
        .filter((p) => p.from && p.from !== p.to);
      if (players.length) {
        const teams = [...new Set(players.flatMap((p) => [p.from, p.to]))];
        const holds = holdsByTeam(freeAgentsOf(cs).filter((f) => !renounced.has(f.playerId)));
        const v = validateTrade(leagueData(cs), { teams, players, capHolds: holds, tpeUse: m.tpeUse }, C);
        // Restriction-table row F: using a PRE-EXISTING TPE hard-caps the
        // team at the first apron for the rest of the year.
        for (const [team, use] of Object.entries(m.tpeUse ?? {})) {
          if (use.preExisting && use.amount > 0) capAt(team, C.firstApron);
        }
        for (const t of v.teams) {
          const sub = t.preTradeTier !== "first_apron" && t.preTradeTier !== "second_apron";
          // TPE-absorbed salary uses no matching at all — row E only cares
          // about what ran through the expanded formula.
          const matchable = t.incomingSalary - (t.tpeAbsorbed ?? 0);
          if (!sub || matchable <= t.outgoingSalary + 1) continue;
          // Absorbing into genuine cap room (§6(j)(1)(v)) triggers no cap; the
          // expanded formula (row E) does. Assume the team takes the cap-free
          // route whenever room covers the whole incoming.
          const absorption =
            Math.max(0, C.salaryCap - t.preTradeSalary - (holds[t.teamId] ?? 0)) +
            t.outgoingSalary +
            250_000;
          if (matchable > absorption + 1) capAt(t.teamId, C.firstApron);
        }
      }
    }
    cs = applyMove(cs, m);
  }
  return line;
}

/* ------------------- Feed-derived offseason team state ------------------- */

export interface TeamFeedState {
  roomTeam: boolean;
  /** Dollars already spent from each exception by REAL July moves. */
  consumed: Partial<Record<MechanismId, number>>;
  /** Hard cap already triggered in-world, as a dollar line (or Infinity). */
  hardCap: number;
  /** Lowercased FA names whose holds the real offseason forced off the books. */
  forcedRenounced: Set<string>;
}

const NO_FEED_STATE: TeamFeedState = {
  roomTeam: false,
  consumed: {},
  hardCap: Infinity,
  forcedRenounced: new Set(),
};

/** How this team's July ACTUALLY happened, per the audited feed state —
 * room usage kills the MLEs/BAE for the year (§6(n)(1), §6(g)(3)), feed
 * signings consume exceptions, S&T/MLE acquisitions freeze hard caps, and
 * demonstrated room spending implies the holds it required were renounced. */
export function feedStateOf(team: string): TeamFeedState {
  const raw = FEED_TEAM_STATE[team];
  if (!raw) return NO_FEED_STATE;
  const consumed: Partial<Record<MechanismId, number>> = {};
  if (raw.roomMleUsed) consumed.room_mle = raw.roomMleUsed;
  if (raw.consumedNtmle) consumed.ntmle = raw.consumedNtmle;
  if (raw.consumedTpmle) consumed.tpmle = raw.consumedTpmle;
  if (raw.consumedBae) consumed.bae = raw.consumedBae;
  return {
    roomTeam: raw.operatedUnderCap ?? false,
    consumed,
    hardCap:
      raw.inWorldHardCap === "first_apron"
        ? C.firstApron
        : raw.inWorldHardCap === "second_apron"
          ? C.secondApron
          : Infinity,
    forcedRenounced: new Set((raw.forcedRenounced ?? []).map((n) => n.toLowerCase())),
  };
}

/** Exception dollars spent by THIS SESSION's sign moves for a team. */
export function sessionExceptionUse(
  moves: Move[],
  team: string,
): Partial<Record<MechanismId, number>> {
  const used: Partial<Record<MechanismId, number>> = {};
  for (const m of moves) {
    if (m.kind === "sign" && m.teamId === team && m.mechanism) {
      used[m.mechanism] = (used[m.mechanism] ?? 0) + m.salary;
    }
  }
  return used;
}

/** Feed + session exception consumption, merged for spendingPower. */
export function consumedFor(
  moves: Move[],
  team: string,
): Partial<Record<MechanismId, number>> {
  const out: Partial<Record<MechanismId, number>> = { ...feedStateOf(team).consumed };
  const session = sessionExceptionUse(moves, team);
  for (const [k, v] of Object.entries(session)) {
    const id = k as MechanismId;
    out[id] = (out[id] ?? 0) + (v ?? 0);
  }
  return out;
}

/* ---------------------- Traded-player exceptions ------------------------- */

export interface TpeSlot {
  team: string;
  /** Dollars still absorbable. */
  amount: number;
  /** "Kennard TPE" style display label (originating player). */
  label: string;
  /** Minted before this offseason (restriction-table row F applies). */
  preExisting: boolean;
  expires: string;
}

/** Each team's usable TPEs right now: the dual-source real ledger (minus
 * expiry, minus §6(n)(2) — a team that used cap room renounced its standing
 * TPEs) plus TPEs minted by this session's own uneven trades, minus what
 * this session's trades have already absorbed. Sorted largest-first. */
export function tpeLedger(moves: Move[]): Record<string, TpeSlot[]> {
  const out: Record<string, TpeSlot[]> = {};
  const add = (slot: TpeSlot) => (out[slot.team] ??= []).push(slot);

  for (const r of TRADE_EXCEPTIONS) {
    if (r.expires < "2026-07-05") continue; // expired before the sim's today
    if (feedStateOf(r.team).roomTeam) continue; // renounced with the room
    add({
      team: r.team,
      amount: r.amount,
      label: `${r.player} TPE`,
      preExisting: true,
      expires: r.expires,
    });
  }

  // Session-minted: a trade leg that sends out more than it takes back can
  // leave a standard TPE behind. v1 approximation: the exception is capped
  // by the largest single outgoing salary (a standard TPE replaces ONE
  // traded player), usable for a year.
  let cs = BASE_CONTRACTS;
  for (const m of moves) {
    if (m.kind === "trade") {
      const salaryOf = new Map(
        cs.filter((c) => !c.deadMoney).map((c) => [c.playerId, { s: salaryForYear(c, YEAR), t: c.teamId, n: c.playerName }]),
      );
      const perTeam: Record<string, { out: number; in: number; largest: number; largestName: string }> = {};
      for (const p of m.players) {
        const row = salaryOf.get(p.playerId);
        if (!row || row.t === p.to) continue;
        const from = (perTeam[row.t] ??= { out: 0, in: 0, largest: 0, largestName: "" });
        from.out += row.s;
        if (row.s > from.largest) {
          from.largest = row.s;
          from.largestName = row.n;
        }
        const to = (perTeam[p.to] ??= { out: 0, in: 0, largest: 0, largestName: "" });
        to.in += row.s;
      }
      for (const [team, agg] of Object.entries(perTeam)) {
        const minted = Math.min(agg.largest, agg.out - agg.in);
        if (minted > 500_000) {
          add({
            team,
            amount: minted,
            label: `${agg.largestName.split(" ").slice(-1)[0]} TPE (this session)`,
            preExisting: false,
            expires: "2027-07-05",
          });
        }
      }
      // Consumption: what this trade absorbed comes off the ledger,
      // largest-usable-first (same order the auto-fit chooses).
      for (const [team, use] of Object.entries(m.tpeUse ?? {})) {
        let left = use.amount;
        for (const slot of (out[team] ?? []).sort((a, b) => b.amount - a.amount)) {
          if (left <= 0) break;
          const bite = Math.min(slot.amount, left);
          slot.amount -= bite;
          left -= bite;
        }
      }
      cs = applyMove(cs, m);
    } else {
      cs = applyMove(cs, m);
    }
  }

  for (const team of Object.keys(out)) {
    out[team] = out[team]!.filter((s) => s.amount > 250_000).sort((a, b) => b.amount - a.amount);
    if (!out[team]!.length) delete out[team];
  }
  return out;
}

/** Pick a TPE plan that legalizes failing legs: for each team whose matching
 * fails, absorb its LARGEST incoming players into its biggest TPE until the
 * remainder fits the matching ceiling. Returns undefined when no TPE helps. */
export function fitTpePlan(
  verdictTeams: { teamId: string; incomingSalary: number; maxIncomingAllowed: number }[],
  incomingByTeam: Record<string, { playerId: string; salary: number }[]>,
  ledger: Record<string, TpeSlot[]>,
): Record<string, { amount: number; preExisting: boolean; label?: string }> | undefined {
  const plan: Record<string, { amount: number; preExisting: boolean; label?: string }> = {};
  for (const t of verdictTeams) {
    if (t.incomingSalary <= t.maxIncomingAllowed + 1) continue;
    const tpe = ledger[t.teamId]?.[0];
    if (!tpe) continue;
    const incoming = [...(incomingByTeam[t.teamId] ?? [])].sort((a, b) => b.salary - a.salary);
    let absorbed = 0;
    for (const p of incoming) {
      if (t.incomingSalary - absorbed <= t.maxIncomingAllowed + 1) break;
      if (absorbed + p.salary > tpe.amount + 250_000) continue; // whole players only
      absorbed += p.salary;
    }
    if (absorbed > 0 && t.incomingSalary - absorbed <= t.maxIncomingAllowed + 1) {
      plan[t.teamId] = { amount: absorbed, preExisting: tpe.preExisting, label: tpe.label };
    }
  }
  return Object.keys(plan).length ? plan : undefined;
}
