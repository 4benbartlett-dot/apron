import { getLeagueData, ROOKIES_2026, TRANSACTIONS, EXPERIENCE, FREE_AGENT_INFO, SIGNINGS, RATINGS, EXTENSION_ELIGIBLE, RETIRED_2026, WAIVED_2025_26, FA_OVERRIDES, EXTRA_CONTRACTS, IMPACT_2026, POSITIONS_2026, SECONDARY_POSITIONS_2026, POSITION_SHARES_2026, PLAYER_BIO_2026, PLAYER_DIMENSIONS_2026, type PlayerDims, PLAYER_INJURIES_2026, type PlayerInjury, PLAYER_PEDIGREE_2026, PLAYER_RECENT_ACCOLADES, PLAYER_HISTORY, PLAYER_STATS_2026, TEAM_STRENGTH_2026, TEAM_CALIBRATION, type TeamStrength, firstEncumbranceOf, FEED_TEAM_STATE, TRADE_EXCEPTIONS, PROJECTED_PLAYERS_2026, RETURNING_FA_CONTRACTS } from "@apron/data";
import { WAIVED_FREE_AGENTS, SUPPRESS_DEAD_CAP, RESOLVED_OFFER_SHEETS } from "@apron/data";
import {
  SEASON_2026_27,
  salaryForYear,
  capHold,
  stretchProvision,
  validateTrade,
  type BirdStatus,
  type Contract,
  type ContractYear,
  type LeagueConstants,
  type LeagueData,
  type MechanismId,
  type Team,
} from "@apron/cba-engine";
import { shortPlayerName } from "./names";

/** Normalize a player name for joining across data sources. */
export function normName(name: string): string {
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

/** Start of the current sim offseason — the day after the 2025-26 Regular
 * Season ended (~Apr 12, 2026). A Standard TPE lives exactly one year, so a
 * ledger row's ARISE date is its expiry minus a year; a row that arose on or
 * after this boundary arose in THIS offseason and is not yet row-F restricted
 * (§6(j)(1)(i): its first-apron hard cap only attaches after the FOLLOWING —
 * 2026-27 — Regular Season). Expressed as a yyyy-mm-dd string for the same
 * lexical date comparison the ledger already uses. The exact day is not load-
 * bearing: every real row arose either by Feb 2026 (Regular Season) or in late
 * June 2026 (offseason), far from this boundary. */
const CURRENT_OFFSEASON_START = "2026-04-13";

/** Whether using this TPE is a restriction-table row-F first-apron transaction:
 * it can't leave the team over the first apron, and using it hard-caps the team
 * there for the year (§2(e) row F, §6(j)(1)(i)). True for Regular-Season-arisen
 * standing TPEs; false for current-offseason-arisen and same-offseason-minted
 * ones. Falls back to `preExisting` for legacy plans that predate the flag. */
export const isRowFCapped = (s: { preExisting: boolean; firstApronCap?: boolean }) =>
  s.firstApronCap ?? s.preExisting;

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
    const m = t.detail.match(/Traded to [^(]*\(([A-Za-z]{2,4})\)/);
    if (!m) continue;
    const dest = stdTeam(m[1]);
    if (!VALID_TEAMS.has(dest)) continue;
    let c = byName.get(k);
    if (!c) {
      // Name-variant fallback (the Nicolas/Nic Claxton class of miss): the
      // trade prose and the contract sheet disagree on the first name. Match
      // by suffix-aware surname + the trade's FROM team, only when unique.
      const fromM = t.detail.match(/from [^(]*\(([A-Za-z]{2,4})\)/);
      const from = fromM ? stdTeam(fromM[1]!) : null;
      if (from && VALID_TEAMS.has(from)) {
        const surname = norm(shortPlayerName(t.player));
        const candidates = cloned.filter(
          (x) => !x.deadMoney && x.teamId === from && norm(shortPlayerName(x.playerName)) === surname,
        );
        if (candidates.length === 1) c = candidates[0];
      }
    }
    // Newest-first feed: the first row that RESOLVES to a player wins — key
    // the seen-set on his contract id so a re-listed older trade under a
    // variant spelling can't move him again (or back).
    const seenKey = c ? c.playerId : k;
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
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
    // A pending RFA offer sheet isn't a signing yet — the incumbent can match
    // (Quinten Post: MEM sheet, GSW right to match). He stays an RFA with his
    // hold until the feed reports a resolution.
    if (/via Offer Sheet/i.test(t.detail) && /right to match/i.test(t.detail)) continue;
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
// RFA offer sheets awaiting the incumbent's match decision: the structured
// signings feed lists them as plain agreed deals, but the player isn't moved
// until the sheet resolves. TRANSACTIONS is newest-first, so the first
// signing row per player is the latest word — pending only if THAT row is
// still the unmatched sheet.
const PENDING_OFFER_SHEET = new Set<string>();
const RESOLVED_OFFERS = new Set(RESOLVED_OFFER_SHEETS.map(normName));
{
  const decided = new Set<string>();
  for (const t of TRANSACTIONS) {
    if (t.type !== "Signing" && t.type !== "Re-sign") continue;
    const k = normName(t.player);
    if (decided.has(k)) continue;
    decided.add(k);
    // A resolved offer sheet (old team declined to match) lets the new deal
    // apply, so the player leaves his old team's cap hold — e.g. Quinten Post.
    if (/via Offer Sheet/i.test(t.detail) && /right to match/i.test(t.detail) && !RESOLVED_OFFERS.has(k)) PENDING_OFFER_SHEET.add(k);
  }
}

function applySignedFA(contracts: Contract[]): { contracts: Contract[]; signed: string[] } {
  const signed: string[] = [];
  const out = contracts.map((c) => {
    if (c.deadMoney) return c;
    const s = SIGNINGS[normName(c.playerName)];
    if (!s || !s.aav || s.aav <= 0) return c;
    if (PENDING_OFFER_SHEET.has(normName(c.playerName))) return c;
    // A vet EXTENSION of a player still under contract adds FUTURE years —
    // replacing YEAR-forward would overwrite his real current salary.
    const hasCurrent = c.years.some((y) => y.leagueYear === YEAR && y.salary > 0);
    if (hasCurrent && EXTENSION_DEALS.has(normName(c.playerName))) return c;
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
const MIDSEASON_WAIVED = new Set(WAIVED_2025_26.map(normName));

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
// Real guarantee terms for waives the feed prose doesn't carry (web-verified;
// salaryForYear is guarantee-blind, so without these a plain waive charges the
// full listed salary — DeRozan's $25.74M when only $10M is guaranteed).
const RELEASE_TERMS: Record<string, { guaranteed: number; stretched?: boolean }> = {
  // ESPN/Bobby Marks: $10M of $25.74M guaranteed; SAC may stretch by late Aug —
  // if they do, flip to { guaranteed: 10_000_000, stretched: true }.
  "demar derozan": { guaranteed: 10_000_000 },
  // Star Tribune: non-guaranteed $2.41M — pre-staged for the expected MIN waive.
  "mouhamadou gueye": { guaranteed: 0 },
  // Jul 8 2026 waive by DEN — the feed states "leaves behind $2 million in dead
  // cap" (of his $10.4M salary), so only $2M is guaranteed and sticks to DEN.
  "jonas valanciunas": { guaranteed: 2_000_000 },
};

function applyReleases(contracts: Contract[]): Contract[] {
  return contracts.map((c) => {
    if (c.deadMoney || !RELEASED.has(normName(c.playerName)) || salaryForYear(c, YEAR) === 0) return c;
    const dead = cloneContract(c);
    dead.deadMoney = true;
    const terms = RELEASE_TERMS[normName(c.playerName)];
    if (terms) {
      if (terms.stretched && terms.guaranteed > 0) {
        const r = stretchProvision(terms.guaranteed, dead.years.filter((y) => y.leagueYear >= YEAR).length || 1, C);
        dead.years = Array.from({ length: r.years }, (_, k) => ({
          leagueYear: `${2026 + k}-${String(27 + k).padStart(2, "0")}`,
          salary: Math.round(r.perYear),
          guarantee: "full" as const,
        }));
      } else {
        dead.years = terms.guaranteed > 0
          ? [{ leagueYear: YEAR, salary: terms.guaranteed, guarantee: "full" as const }]
          : [];
      }
    }
    return dead;
  });
}

// A waive whose prose states the dead cap ("leaves behind $8 million in dead
// cap") for a player who LATER re-signed: ACTIVE_LATER keeps his row alive for
// the new deal, so the old contract's charge needs its own row — the Jonathan
// Isaac case ($8M on ORL next to his new minimum).
const STATED_DEAD_CAP: Contract[] = (() => {
  const out: Contract[] = [];
  const seen = new Set<string>();
  for (const t of TRANSACTIONS) {
    if (t.type !== "Release" && !/contract was terminated/i.test(t.detail)) continue;
    const k = normName(t.player);
    if (seen.has(k) || !ACTIVE_LATER.has(k)) continue;
    const amtM = t.detail.match(/leaves behind \$([\d.]+)\s*million in dead cap/i);
    const teamM = t.detail.match(/(?:Waived|Released) by [^(]*\(([A-Za-z]{2,4})\)/i);
    if (!amtM || !teamM) continue;
    const team = stdTeam(teamM[1]!);
    if (!VALID_TEAMS.has(team)) continue;
    seen.add(k);
    out.push({
      playerId: `${k.replace(/\s+/g, "-")}-deadcap`,
      playerName: t.player,
      teamId: team,
      deadMoney: true,
      years: [{ leagueYear: YEAR, salary: Math.round(Number(amtM[1]) * 1_000_000), guarantee: "full" }],
    } as Contract);
  }
  return out;
})();
// Announced retirements leave the league entirely — no roster spot, no hold.
// Curated stubs join the sheet ONLY while the scrape lacks the player — a
// future sheet row under any id supersedes its stub by name.
const sheetNames = new Set(base.contracts.map((c) => normName(c.playerName)));
const extraStubs = EXTRA_CONTRACTS.filter((x) => !sheetNames.has(normName(x.playerName))) as unknown as Contract[];
// Returning veterans (retired/overseas) are deliberately re-added AFTER the
// retired filter — their expiring stub makes them signable minimum free agents.
const returningStubs = (RETURNING_FA_CONTRACTS as unknown as Contract[]).filter(
  (x) => !sheetNames.has(normName(x.playerName)),
);
const activeRaw = [
  ...[...base.contracts, ...extraStubs].filter((c) => !RETIRED.has(normName(c.playerName))),
  ...returningStubs,
];
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
const existingNames = new Set(afterReleases.filter((c) => !c.deadMoney).map((c) => normName(c.playerName)));
// Guard on BOTH id and name: the two scrapers use divergent fallback-id
// schemes, and an officially-filed rookie deal appearing on the contracts
// sheet under a different id must not create a second active row.
const rookieContracts = ROOKIES_2026.filter(
  (r) => !existingIds.has(r.playerId) && !existingNames.has(normName(r.playerName)),
).map(
  (r) => {
    const deal = ROOKIE_DEALS.get(normName(r.playerName));
    const dealYears =
      deal && deal.total > 0 ? dealFromAav(Math.round(deal.total / deal.yrs), deal.yrs) : r.years;
    // A first-rounder's 2026-27 cap hit is the OFFICIAL rookie scale (what
    // Spotrac/HoopsRumors show), not dealFromAav's uniform-raise split of the
    // reported 4-year total — that back-loads too little and overstates year 1
    // (Dybantsa $15.56M vs the official $14.75M). Pin year 1 to the scale figure
    // carried on rookies-2026.json; keep the reported deal's later years.
    const scaleY1 =
      (r as unknown as { round?: number }).round === 1
        ? r.years.find((y) => y.leagueYear === YEAR)?.salary
        : undefined;
    const years =
      scaleY1 != null ? dealYears.map((y) => (y.leagueYear === YEAR ? { ...y, salary: scaleY1 } : y)) : dealYears;
    return {
      ...r,
      years,
      restriction: "signed his rookie-scale contract (30-day trade freeze)",
    };
  },
);

// Draft-night trades move DRAFT RIGHTS — those players live in ROOKIES_2026,
// not the contracts sheet, so the veteran trade pass never saw them (the
// Cameron Carr report: drafted #24 by NYK, rights to LAL in a four-teamer).
const rookiesAfterTrades = applyTrades(rookieContracts);

// Audited-away dead-money charges: a deceased player wrongly on the books
// (Brandon Clarke), and stale/erroneous stretches that shouldn't count against
// a team in 2026-27 (see roster-corrections-2026.json).
const SUPPRESSED_DEAD = new Set(SUPPRESS_DEAD_CAP.map(normName));

/** Base working roster set: trades + signings applied, rookies added. */
export const BASE_CONTRACTS: Contract[] = [
  ...afterReleases,
  ...rookiesAfterTrades.contracts,
  ...STATED_DEAD_CAP,
].filter((c) => !(c.deadMoney && SUPPRESSED_DEAD.has(normName(c.playerName))));
export const TRADES_APPLIED = [...afterTrades.moved, ...rookiesAfterTrades.moved];
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

/* --------------------------- Player impact & position -------------------- */

const mpConf = (mp: number) => Math.min(1, mp / 1600);

/** The hardened impact record for a player: exact Apron Value where the model
 * has it, else a minutes-shrunk box-half estimate, else a BPM/draft projection
 * — all mapped onto the model's own scale (av = 0-100, 50 = replacement;
 * pts = impact per 100 possessions, 0-centered). */
function impactEntry(c: Contract): {
  av: number; pts: number; unc: number; mp?: number; rapmp?: number; bpm?: number; tier: string; conf: string; src: string;
} {
  const e = IMPACT_2026.byId[c.playerId];
  if (e) return e;
  const r = RATINGS[c.playerId];
  let hyb: number;
  if (r) hyb = (IMPACT_2026.bpmFallback.slope * r.bpm + IMPACT_2026.bpmFallback.intercept) * mpConf(r.mp);
  else {
    const salary = salaryForYear(c, YEAR);
    hyb = 0.12 + Math.min(0.55, (salary / 12_000_000) * 0.55);
  }
  const tier =
    hyb >= 2.5 ? "MVP" : hyb >= 1.5 ? "All-NBA" : hyb >= 0.75 ? "High starter" : hyb >= 0.25 ? "Starter" : hyb >= -0.35 ? "Rotation" : "Depth";
  return {
    av: Math.max(0, Math.min(100, 50 + 12.5 * hyb)),
    pts: 3.35 * hyb,
    unc: 0.9 + 700 / ((r?.mp ?? 0) + 700),
    mp: r?.mp,
    bpm: r?.bpm,
    tier,
    conf: "low",
    src: "projected",
  };
}

export interface ImpactComponents {
  source: string;
  apronValue: number;
  impactPts: number;
  uncertainty: number;
  tier: string;
  confidence: string;
  rapmp?: number;
  bpm?: number;
}

/** Provenance for the Apron Value tooltip — tier, ± band, and the impact/box
 * components behind the number. */
export function impactComponents(c: Contract): ImpactComponents {
  const e = impactEntry(c);
  return {
    source: e.src,
    apronValue: e.av,
    impactPts: e.pts,
    uncertainty: e.unc,
    tier: e.tier,
    confidence: e.conf,
    rapmp: e.rapmp,
    bpm: e.bpm,
  };
}

/** Team strength (current roster, minutes-weighted), or undefined if unknown. */
export function teamStrengthOf(team: string): TeamStrength | undefined {
  return TEAM_STRENGTH_2026[team];
}

export interface TeamProjection {
  baseNrtg: number; baseWins: number;
  projNrtg: number; projWins: number;
  deltaNrtg: number; deltaWins: number;
}

/** A full team's minutes budget for a season: 5 on the floor × 48 min × 82
 * games = 19,680 player-minutes to hand out. This is the scarce resource a
 * trade actually competes for. */
export const TEAM_MINUTES = 240 * 82;
const MAX_PLAYER_MINUTES = 3020; // ~36.8 MPG × 82 — the ceiling even iron-men live under
const HEALTHY_GAMES = 82; // a full season for anyone without a documented carrying injury
const ROTATION_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
const POS_MINUTES = TEAM_MINUTES / 5; // 3,936 minutes at each of the five on-court spots
// Where a player can slide when he has no MEASURED secondary — the spots next to
// his primary. Keeps the position budget from being so rigid that ordinary
// small-/big-lineup flexibility reads as a hole.
const POS_ADJACENT: Record<string, string[]> = {
  PG: ["SG"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF"],
  PF: ["SF", "C"],
  C: ["PF"],
};

/** Real age entering 2026-27 (Basketball-Reference bio; falls back to
 * rookie-age-plus-service when a player has no NBA bio row yet). */
export function ageOf(playerId: string): number {
  const b = PLAYER_BIO_2026[playerId];
  if (b && b.age != null) return b.age + 1; // the 2025-26 table age, one year on
  return 20 + (EXPERIENCE[playerId] ?? 7);
}


/** The real, current injury (torn ACL, out for season, …) for a player, from
 * the Basketball-Reference injury report — or undefined if healthy. */
export function injuryOf(playerId: string): PlayerInjury | undefined {
  return PLAYER_INJURIES_2026[playerId];
}

/**
 * A player's projected 2026-27 rotation minutes, built from his established
 * per-game ROLE, not his depressed season total. A star who rested or missed a
 * stretch last year still projects to his real minutes-per-game — that's why a
 * 31-mpg guard reads like a 31-mpg guard, not a bench player. The one
 * adjustment is factual availability: a real carrying injury (torn ACL,
 * Achilles) costs him the games he'll actually miss to start the season, so a
 * player out for the year projects to zero and a mid-recovery star to a partial
 * one. No probabilistic "injury-prone" haircut — just role × real games.
 */
function projectedMinutes(playerId: string, priorMp: number): number {
  const bio = PLAYER_BIO_2026[playerId];
  // A rookie has no bio playing-time row, so fall back to his projected
  // draft-slot minutes/game — otherwise he'd project to zero and never appear
  // in the rotation. He still competes for those minutes in allocateRotation.
  const rkMpg = PROJECTED_PLAYERS_2026[playerId]?.mpg;
  const mpg = bio && bio.mpg && bio.mpg > 0 ? bio.mpg : rkMpg != null ? rkMpg : priorMp / Math.max(1, bio?.g ?? 60);
  const inj = PLAYER_INJURIES_2026[playerId];
  const games = inj && inj.gamesOut >= 5 ? Math.max(0, 82 - inj.gamesOut) : HEALTHY_GAMES;
  return Math.min(MAX_PLAYER_MINUTES, Math.max(0, mpg * games));
}

/** Measured secondary positions (spots a player logged ≥12% of his minutes at). */
export function secondaryPositionsOf(playerId: string): string[] {
  return SECONDARY_POSITIONS_2026[playerId] ?? [];
}

/** Share of minutes a player spent at each position last season, where measured. */
export function positionSharesOf(playerId: string): Record<string, number> | undefined {
  return POSITION_SHARES_2026[playerId];
}

/** Every spot a player can fill, best-fit first — deliberately generous so the
 * rotation isn't rigid: his primary, every spot he actually logged real time at
 * (measured secondaries, ≥12% of minutes), AND the spots adjacent to his
 * primary. Deduped, primary first. Positionless-era flexibility, within reason
 * (a center still can't slot at the point). Unknown-position players stay fully
 * flexible so they never distort a team's balance. */
export function eligiblePositions(playerId: string): string[] {
  const primary = POSITIONS_2026[playerId];
  if (!primary) return [...ROTATION_POSITIONS];
  const out = [primary];
  for (const p of [...(SECONDARY_POSITIONS_2026[playerId] ?? []), ...(POS_ADJACENT[primary] ?? [])]) {
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export interface RotationSlot {
  playerId: string;
  playerName: string;
  minutes: number;
  pts: number;
  av: number;
  age: number;
  pos: string;
  secondary: boolean;
}
export interface Rotation {
  byPos: Record<string, RotationSlot[]>;
  benched: { playerId: string; playerName: string; av: number }[];
  score: number;
}

/**
 * Position-aware rotation allocation — the team's minutes budget, but split
 * five ways. Each on-court spot has {@link POS_MINUTES} to give; the best
 * players earn them first (each up to his availability-aware projected role) at
 * his primary spot, spilling to a secondary spot only once his primary is full.
 * When a spot is stacked, the surplus benches; when a spot is thin, its minutes
 * go unfilled at replacement level (0). That's why a trade now respects
 * POSITION: acquiring a center for a team that already has an All-NBA center
 * mostly benches one of them, while the same center fills an empty middle for a
 * team that needs one. Each player's projection carries the real-age aging
 * nudge. Returns the full per-spot allocation (for the depth chart) plus the
 * summed score.
 */
export function allocateRotation(roster: Contract[]): Rotation {
  const players = roster
    .filter((c) => currentSalary(c) > 0 && !c.deadMoney)
    .map((c) => {
      const e = impactEntry(c);
      const elig = eligiblePositions(c.playerId);
      // How he actually split his minutes across those spots (play-by-play
      // shares), so a real combo guard plays some 1 and some 2 rather than being
      // pinned to one position. Falls back to all-primary when unmeasured.
      const rawShares = POSITION_SHARES_2026[c.playerId];
      const shares = elig.map((pos, i) => (rawShares?.[pos] ?? (i === 0 ? 100 : 0)));
      const shareSum = shares.reduce((s, x) => s + x, 0) || 1;
      return {
        id: c.playerId,
        name: c.playerName,
        pts: adjustedPts(c),
        av: adjustedAv(c),
        age: ageOf(c.playerId),
        mp: projectedMinutes(c.playerId, e.mp ?? 0),
        elig,
        weights: shares.map((s) => s / shareSum),
      };
    })
    .filter((p) => p.mp > 0)
    .sort((a, b) => b.pts - a.pts); // best players earn scarce minutes first

  const cap: Record<string, number> = {};
  const byPos: Record<string, RotationSlot[]> = {};
  for (const pos of ROTATION_POSITIONS) { cap[pos] = POS_MINUTES; byPos[pos] = []; }
  const benched: { playerId: string; playerName: string; av: number }[] = [];
  let weighted = 0;

  for (const p of players) {
    let remain = p.mp;
    let placed = false;
    const primary = p.elig[0];
    const put = (pos: string, take: number) => {
      if (take <= 0.5) return;
      cap[pos] -= take;
      remain -= take;
      weighted += p.pts * take;
      // A player can land at the same spot twice — a partial Pass-1 placement, then
      // a Pass-2 spillback when his other eligible spot is full. Merge into his
      // existing slot so he isn't listed (or keyed) twice at one position.
      const existing = byPos[pos]!.find((s) => s.playerId === p.id);
      if (existing) existing.minutes += take;
      else byPos[pos]!.push({ playerId: p.id, playerName: p.name, minutes: take, pts: p.pts, av: p.av, age: p.age, pos, secondary: pos !== primary });
      placed = true;
    };
    // Pass 1 — distribute his minutes across his spots the way he ACTUALLY plays
    // them (a 54/44 combo guard gets 54% at the 2, 44% at the 3), capped by each
    // spot's remaining budget.
    p.elig.forEach((pos, i) => {
      if (cap[pos] == null) return;
      put(pos, Math.min(p.mp * p.weights[i]!, cap[pos]!, remain));
    });
    // Pass 2 — whatever couldn't fit (a spot was full, or he's behind a bigger
    // star at his position) spills to his open eligible spots, most room first,
    // so a Curry behind Luka slides to a full start at the 2 instead of scraps.
    while (remain > 0.5) {
      let bestPos: string | null = null;
      let bestTake = 0;
      for (const pos of p.elig) {
        if (cap[pos] == null) continue;
        const take = Math.min(remain, cap[pos]!);
        if (take > bestTake + 1e-6) { bestTake = take; bestPos = pos; }
      }
      if (!bestPos || bestTake <= 0.5) break;
      put(bestPos, bestTake);
    }
    if (!placed) benched.push({ playerId: p.id, playerName: p.name, av: p.av });
  }
  for (const pos of ROTATION_POSITIONS) byPos[pos]!.sort((a, b) => b.minutes - a.minutes);
  // Minutes-weighted average impact/100 over the full team budget; any spot left
  // unfilled counts as replacement-level (0), so positional holes drag the team.
  return { byPos, benched, score: weighted / TEAM_MINUTES };
}

/** The team's rotation "score" in impact points/100 — see {@link allocateRotation}. */
export function rosterScore(roster: Contract[]): number {
  return allocateRotation(roster).score;
}

/* ------------------------- FIT ENGINE (dimensions) ------------------------- */
// The talent spine (rosterScore, above) says how good the players are. The fit
// engine says how well they go TOGETHER — spacing, shot-creation load, a real
// playmaker, two-way balance, and defensive pairings (a rim protector next to a
// switchable stopper is worth more than the sum of the two). It reads eight
// per-player dimensions derived from real box stats and returns a bounded
// net-rating adjustment, so fit refines a projection without ever dominating it.

const fitClamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));
const LEAGUE_DIMS: PlayerDims = { off: 50, def: 50, play: 42, reb: 45, space: 46, rim: 32, perd: 48, usg: 16 };

/** The eight-dimension profile for a player (real where measured, impact-scaled
 * fallback otherwise). */
export function playerDims(c: Contract): PlayerDims {
  const d = PLAYER_DIMENSIONS_2026[c.playerId];
  if (d) return d;
  // Rookies have no measured profile — use the projected archetype dimensions
  // (a rim-running big reads high reb/rim, a shooter high space) with usage
  // estimated from his scoring/playmaking read.
  const rk = PROJECTED_PLAYERS_2026[c.playerId];
  if (rk) {
    const usg = fitClamp(Math.round(15 + (rk.dims.off - 50) * 0.12 + (rk.dims.play - 50) * 0.08), 8, 28);
    return { ...rk.dims, usg };
  }
  const base = 50 + (impactEntry(c).av - 50) * 0.55;
  return { off: base, def: base, play: 40, reb: 45, space: 45, rim: 30, perd: 48, usg: 16 };
}

export interface TeamDimensions {
  off: number; def: number; play: number; reb: number; space: number; rim: number; perd: number;
  spacers: number; nonShooters: number; alphas: number; glue: number;
  defCore: number; hasCreator: boolean; hasPlaymaker: boolean;
}

/** Minutes-weighted team dimensions from the projected rotation, plus the fit
 * signals (spacers, ball-dominant alphas, glue guys, defensive core). */
export function teamDimensions(roster: Contract[]): TeamDimensions {
  const rot = allocateRotation(roster);
  const byId = new Map(roster.map((c) => [c.playerId, c]));
  const perPlayer = new Map<string, number>();
  for (const pos of ROTATION_POSITIONS) for (const s of rot.byPos[pos]!) perPlayer.set(s.playerId, (perPlayer.get(s.playerId) ?? 0) + s.minutes);

  let total = 0;
  const acc = { off: 0, def: 0, play: 0, reb: 0, space: 0, perd: 0 };
  const people: { d: PlayerDims; min: number }[] = [];
  for (const [id, min] of perPlayer) {
    const c = byId.get(id);
    const d = c ? playerDims(c) : LEAGUE_DIMS;
    total += min;
    people.push({ d, min });
    acc.off += min * d.off; acc.def += min * d.def; acc.play += min * d.play;
    acc.reb += min * d.reb; acc.space += min * d.space; acc.perd += min * d.perd;
  }
  total = total || 1;
  // Rim protection is anchored by the best rim protector who plays real minutes,
  // not the roster average — one center protects the paint for everyone.
  const rimmers = people.filter((p) => p.min >= 900).map((p) => p.d.rim).sort((a, b) => b - a);
  const rim = rimmers.length ? fitClamp(rimmers[0]! * 0.85 + (rimmers[1] ?? 0) * 0.15, 0, 100) : 32;

  const key = people.filter((p) => p.min >= 1000);
  const spacers = key.filter((p) => p.d.space >= 68).length;
  const nonShooters = key.filter((p) => p.d.space < 30 && p.d.usg > 20).length;
  const alphas = key.filter((p) => p.d.usg >= 27).length;
  const glue = key.filter((p) => p.d.usg < 19 && (p.d.def >= 60 || p.d.play >= 58 || p.d.reb >= 58)).length;
  // Defensive CORE — the combined above-average defense of a team's two best
  // defenders (interior + perimeter both count). This is the AD-and-Draymond
  // signal: two real defenders together switch, help, and recover.
  const defTop = key
    .map((p) => Math.max(0, p.d.def - 55) + Math.max(0, p.d.rim - 68) * 0.4 + Math.max(0, p.d.perd - 70) * 0.3)
    .sort((a, b) => b - a);
  const defCore = (defTop[0] ?? 0) + (defTop[1] ?? 0);
  const hasCreator = key.some((p) => p.d.usg >= 28 || p.d.off >= 80);
  const hasPlaymaker = key.some((p) => p.d.play >= 66);

  return {
    off: acc.off / total, def: acc.def / total, play: acc.play / total, reb: acc.reb / total,
    space: acc.space / total, perd: acc.perd / total, rim,
    spacers, nonShooters, alphas, glue, defCore, hasCreator, hasPlaymaker,
  };
}

export interface TeamFit { nrtg: number; dims: TeamDimensions; notes: { label: string; nrtg: number }[]; }

/** A BOUNDED net-rating fit adjustment (≈ ±6) layered on top of the talent
 * projection: how well a roster's parts complement each other. */
export function teamFit(roster: Contract[]): TeamFit {
  const D = teamDimensions(roster);
  const notes: { label: string; nrtg: number }[] = [];
  const add = (label: string, v: number) => { if (Math.abs(v) >= 0.15) notes.push({ label, nrtg: Math.round(v * 10) / 10 }); return v; };
  let fit = 0;

  let sp = fitClamp((D.space - 49) / 10, -2, 1.8);
  if (D.nonShooters >= 2) sp -= fitClamp((D.nonShooters - 1) * 0.7, 0, 2);
  if (D.spacers >= 2 && D.hasCreator) sp += 0.7;
  fit += add("Spacing", sp);

  let df = fitClamp((D.def - 50) / 10, -2, 2);
  if (D.rim >= 78) df += 0.8; else if (D.rim < 38) df -= 0.9;
  fit += add("Defense", df);

  fit += add("Defensive core", fitClamp(D.defCore / 16, 0, 2.2));

  if (D.alphas >= 4) fit += add("Ball-dominance overload", -fitClamp((D.alphas - 3) * 0.8, 0, 2.4));
  else if (D.alphas === 0) fit += add("No shot creation", -0.6);

  if (D.play < 45) fit += add("Thin playmaking", -fitClamp((45 - D.play) * 0.08, 0, 1.6));
  else if (D.play > 66) fit += add("Elite hub", 0.6);

  if (D.off >= 56 && D.def >= 56) fit += add("Two-way balance", 1.2);
  else if (D.off >= 52 && D.def >= 52) fit += add("Balanced", 0.5);

  fit += add("Connectors", fitClamp(D.glue * 0.28, 0, 1.1));

  return { nrtg: fitClamp(fit, -6, 6), dims: D, notes };
}

/**
 * How much a candidate player would improve a team's FIT (net-rating points) if
 * added — the teamFit delta from slotting his real dimensions into the rotation,
 * plus the single fit note that improves most (spacing, defensive core, …). For
 * the free-agent "suggested signings" UI: a real complementarity read, not just
 * impact + position. Pass the candidate's contract row (any team — it's moved
 * onto `team` here) and the live league contracts.
 */
export function fitGainOf(candidate: Contract, team: string, contracts: Contract[]): { fitGain: number; topReason?: string } {
  const teamRoster = contracts.filter((c) => c.teamId === team && c.playerId !== candidate.playerId);
  const before = teamFit(teamRoster);
  const after = teamFit([...teamRoster, { ...candidate, teamId: team }]);
  const beforeMap = new Map(before.notes.map((n) => [n.label, n.nrtg]));
  let topReason: string | undefined;
  let topDelta = 0.3;
  for (const n of after.notes) {
    const d = n.nrtg - (beforeMap.get(n.label) ?? 0);
    if (d > topDelta) { topDelta = d; topReason = n.label; }
  }
  return { fitGain: Math.round((after.nrtg - before.nrtg) * 10) / 10, topReason };
}

/** Letter grade for a 0-100 team dimension (a generous curve — minute-weighted
 * team averages dilute toward the middle even for great rosters). */
export function dimensionGrade(x: number): string {
  const t: [number, string][] = [[80, "A+"], [74, "A"], [68, "A-"], [62, "B+"], [57, "B"], [52, "B-"], [47, "C+"], [42, "C"], [37, "C-"], [32, "D+"], [27, "D"], [0, "F"]];
  for (const [lo, g] of t) if (x >= lo) return g;
  return "F";
}

/** The model's own net-rating read on a roster: talent (position-aware rotation
 * of impact + real-age aging + real-injury availability) plus the bounded fit
 * adjustment, calibrated straight to actual net ratings (R²=0.75). */
function modelNrtg(roster: Contract[]): number {
  const cal = TEAM_CALIBRATION;
  return cal.intercept + cal.rosterCoef * rosterScore(roster) + cal.fitCoef * teamFit(roster).nrtg;
}
function modelWins(nrtg: number): number {
  return Math.max(12, Math.min(73, Math.round(TEAM_CALIBRATION.winsIntercept + TEAM_CALIBRATION.winsPerNrtg * nrtg)));
}

// Wins are ZERO-SUM: the league plays a fixed ~1,230 games no matter how talent
// is distributed, so the leaguewide net-rating total is a constant — every point
// one team gains is a point an opponent loses. The per-team model reads each
// roster independently, so without a correction, signing an unsigned free agent
// (LeBron) would manufacture wins from nowhere and a lopsided trade would add or
// shed leaguewide wins. So after moves we re-center every team's net rating by a
// single offset that restores the base leaguewide total — a team that gets
// better pulls the rest of the field down to compensate (a stronger rival is a
// harder schedule for everyone else), and total wins stay ~1,230.
// Lazily computed (not at module load) — modelNrtg's dependency chain uses
// consts declared further down the file, so evaluating it eagerly here would hit
// the temporal dead zone.
let _baseTotalNrtg: number | null = null;
function baseTotalNrtg(): number {
  if (_baseTotalNrtg === null) {
    _baseTotalNrtg = TEAM_IDS.reduce(
      (s, t) => s + modelNrtg(BASE_CONTRACTS.filter((c) => c.teamId === t)),
      0,
    );
  }
  return _baseTotalNrtg;
}
let _centerCache: { ref: Contract[]; offset: number } | null = null;
function leagueCenterOffset(liveContracts: Contract[]): number {
  if (liveContracts === BASE_CONTRACTS) return 0; // no moves → no drift
  if (_centerCache && _centerCache.ref === liveContracts) return _centerCache.offset;
  const liveTotal = TEAM_IDS.reduce(
    (s, t) => s + modelNrtg(liveContracts.filter((c) => c.teamId === t)),
    0,
  );
  const offset = (baseTotalNrtg() - liveTotal) / TEAM_IDS.length;
  _centerCache = { ref: liveContracts, offset };
  return offset;
}

/**
 * Projected net rating + record for a team — the MODEL'S OWN read on the current
 * roster (talent + fit, calibrated to real net ratings), not anchored to any
 * outside consensus. The baseline reflects everything the model knows: real
 * injuries (a torn ACL drops a star's minutes), the position-aware rotation,
 * real-age aging, and team fit. With no moves the live roster equals the base
 * roster, so the delta is exactly zero — no drift. A current-roster projection,
 * NOT a full-season forecast (no coaching or playoff translation).
 */
export function teamProjection(team: string, liveContracts: Contract[]): TeamProjection | undefined {
  if (!TEAM_STRENGTH_2026[team]) return undefined;
  const baseNrtg = modelNrtg(BASE_CONTRACTS.filter((c) => c.teamId === team));
  // Zero-sum re-centering keeps the leaguewide win total at its ~1,230 baseline
  // after moves (see leagueCenterOffset). With no moves the offset is 0, so an
  // untouched league still mirrors the base exactly.
  const projNrtg =
    modelNrtg(liveContracts.filter((c) => c.teamId === team)) + leagueCenterOffset(liveContracts);
  const baseWins = modelWins(baseNrtg);
  const projWins = modelWins(projNrtg);
  return {
    baseNrtg: Math.round(baseNrtg * 10) / 10,
    baseWins,
    projNrtg: Math.round(projNrtg * 10) / 10,
    projWins,
    deltaNrtg: Math.round((projNrtg - baseNrtg) * 10) / 10,
    deltaWins: projWins - baseWins,
  };
}

/**
 * PLAYER IMPACT (≈100 = the league's best, ~0 = replacement level, negative =
 * a net-negative on-court player). Sourced from the HYBRID value-impact metric
 * (a RAPM × true-wins blend), linearly scaled so the league's best reads 100.
 * This is the number shown on every player chip, card, and finder result.
 */
/* --------------------------- VALUE MODEL (multi-year + accolades) --------------------------- */
// A player's value is built from his recent BODY OF WORK, not one aged or
// injury-shortened season: a minutes-and-recency-weighted three-year impact
// (2023-24 → 2025-26), blended with the current RAPM-anchored metric, then
// credited for FACTUAL accolades (All-NBA, All-Defensive, MVP/DPOY, rings) —
// which is how a 20-game Anthony Davis stays a star and a Draymond's defense
// finally registers. A gentle age decline keeps a 42-year-old honest.

const BPM_TO_AV = 3.6; // av ≈ 50 + 3.6·BPM (Jokić ~+13 → ~97, replacement −2 → ~43)

/** A player's three-year weighted BPM — his recent body of work, so a single
 * down or injured season doesn't define him. Recency-weighted and shrunk for
 * low-minute seasons. */
function multiYearBpm(playerId: string): number {
  const cur = PLAYER_STATS_2026[playerId];
  const hist = PLAYER_HISTORY[playerId] ?? {};
  const seasons = [
    { bpm: cur?.bpm, mp: cur?.mp, w: 0.45 },
    { bpm: hist["2025"]?.bpm, mp: hist["2025"]?.mp, w: 0.35 },
    { bpm: hist["2024"]?.bpm, mp: hist["2024"]?.mp, w: 0.2 },
  ];
  let num = 0, den = 0, totalMp = 0;
  for (const s of seasons) {
    if (s.bpm == null || !Number.isFinite(s.bpm)) continue;
    // Confidence is STRICTLY minutes-proportional (no floor), so a garbage-time
    // handful of minutes barely counts — a +44 BPM from a 4-minute cameo used to
    // dominate here. Each season's BPM is also clipped to a sane range so a
    // freak tiny-sample number can't move a player's value.
    const conf = fitClamp((s.mp ?? 0) / 1400, 0, 1);
    const bpm = fitClamp(s.bpm, -12, 15);
    num += bpm * s.w * conf;
    den += s.w * conf;
    totalMp += s.mp ?? 0;
  }
  if (den > 0) {
    // A thin overall body of work (a few hundred career minutes) is regressed
    // toward the league mean (0), not a below-replacement prior — that de-noises
    // a small sample without biasing the league aggregate down.
    const raw = num / den;
    const shrink = totalMp / (totalMp + 350);
    return raw * shrink;
  }
  // No qualifying NBA minutes (a rookie, or a returning vet) — fall back to his
  // projected BPM (draft slot + college + consensus, or the returning-vet read)
  // so a top pick isn't valued as replacement-level and a second-rounder isn't.
  return cur?.bpm ?? PROJECTED_PLAYERS_2026[playerId]?.bpm ?? 0;
}

/** Factual-accolade bonus on the Apron-Value scale. RECENT All-NBA / All-
 * Defensive (last three seasons) are weighted highest — proof a player is STILL
 * elite — with the career résumé (All-NBA, MVP/DPOY, All-Defensive, rings) added
 * as a floor so an aging great with a deep résumé isn't over-punished. Defense
 * is credited heavily (the Draymond signal a box score never sees). */
function accoladeBonus(playerId: string): number {
  const r = PLAYER_RECENT_ACCOLADES[playerId];
  const recent = (r?.nba ?? 0) * 1.5 + (r?.def ?? 0) * 1.7;
  const p = PLAYER_PEDIGREE_2026[playerId];
  const career = p
    ? Math.min(11, p.an1 * 0.9 + p.an2 * 0.55 + p.an3 * 0.35 + p.mvp * 1.4 + p.dpoy * 2.5 + p.ad * 0.9 + p.ring * 0.4 + p.as * 0.25)
    : 0;
  return Math.min(18, recent + career);
}

/** Gentle forward-aging past ~32, so a 40+ great still declines (but the
 * multi-year BPM already carries most of the age signal, so this is light). */
function ageMult(age: number): number {
  return age <= 32 ? 1 : Math.max(0.84, 1 - (age - 32) * 0.017);
}

/** The player's ADJUSTED Apron Value (0-100) — his recent body of work
 * (multi-year BPM, which already shrinks thin seasons and carries aging)
 * leaning over the current RAPM metric, credited for factual accolades, lightly
 * aged. Shown everywhere and the basis for his talent weight in the rotation. */
export function adjustedAv(c: Contract): number {
  const cur = impactEntry(c).av;
  const historyAv = 50 + BPM_TO_AV * multiYearBpm(c.playerId);
  const base = (0.35 * cur + 0.65 * historyAv) * ageMult(ageOf(c.playerId));
  const value = base + accoladeBonus(c.playerId);
  return Math.round(fitClamp(value, 0, 100) * 10) / 10;
}

/** Talent in impact points/100 from the adjusted value (same 50-centered scale
 * as the box metric: av 50 → 0). Drives the rotation weighting. */
function adjustedPts(c: Contract): number {
  return (adjustedAv(c) - 50) * 0.268;
}

/** The player's headline impact number (0-100). */
export function impactScoreOf(c: Contract): number {
  return Math.round(adjustedAv(c));
}
/** Talent above replacement, in impact points/100 (0-centered) — the unit the
 * fairness meter and trade finder sum. A below-replacement throw-in is ~0. */
export function impactMeterOf(c: Contract): number {
  return Math.max(0, adjustedPts(c));
}

/** Primary position (PG/SG/SF/PF/C), or undefined if we have no sample. */
export function positionOf(playerId: string): string | undefined {
  return POSITIONS_2026[playerId];
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

/** Talent units for the fairness meter and trade finder — impact points above
 * replacement, so a net-negative player or throw-in contributes ~nothing. */
export function assetMeterValue(c: Contract): number {
  return impactMeterOf(c);
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
  // Impact-points units (pts/100 above replacement) on the SAME scale as a
  // player's assetMeterValue, so picks and players trade like-for-like: a top
  // first ≈ a low starter (~2.7), a mid first ≈ a rotation piece (~1.4), a late
  // first ≈ a fringe rotation player (~0.8), seconds a fraction of that. Kept to
  // 0.1 precision — NOT rounded to a whole number, which used to collapse a
  // contender's first and every second to 0.
  const meter =
    round === 1
      ? 2.9 * Math.exp(-0.05 * (slot - 1))
      : 0.5 * Math.exp(-0.05 * (slot - 1));
  return Math.round(meter * Math.pow(0.97, dist) * 10) / 10;
}

/** Value of a pick-SWAP right, on the SAME meter units as pickValue. A swap
 * lets the holder take the more favorable of two same-year/round firsts and
 * leaves the counterparty the less favorable — a modest option worth a fraction
 * of an average pick between the two teams. We deliberately do NOT project which
 * team finishes better (records that far out are unknowable, per the sim's
 * design), so the value is symmetric: the holder gains it, the grantor loses it.
 * The share is small because both sides already own a pick that year — a swap
 * only trades the marginal upside, not the pick itself. */
export function pickSwapValue(
  year: number,
  round: 1 | 2,
  teamA?: string,
  teamB?: string,
): number {
  const base = (pickValue(year, round, teamA) + pickValue(year, round, teamB)) / 2;
  return Math.round(base * 0.35 * 10) / 10;
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
  const derived = contracts
    .filter(
      (c) =>
        salaryForYear(c, "2025-26") > 0 &&
        salaryForYear(c, "2026-27") === 0 &&
        c.signedUsing !== "Two-Way" &&
        !c.deadMoney,
    )
    // Waived DURING 2025-26 (before the transactions window opens Jun 8):
    // their expiring rows would otherwise synthesize phantom holds — the
    // Saric class, reported by @Ianberlin23.
    .filter((c) => !MIDSEASON_WAIVED.has(normName(c.playerName)))
    .map((c) => {
      const lastSalary = salaryForYear(c, "2025-26");
      const info = FREE_AGENT_INFO[normName(c.playerName)];
      const override = FA_OVERRIDES[normName(c.playerName)];
      const birdStatus: BirdStatus = (override?.birdStatus as BirdStatus) ?? info?.birdStatus ?? "bird";
      const yos = EXPERIENCE[c.playerId] ?? 8;
      // Approximation (documented on /accuracy): an RFA with ≤4 YOS is coming
      // off a rookie-scale deal — Art. VII §4(d)(1)(ii) 250%/300% holds.
      const offRookieScale = faTypeOf(c.playerName) === "RFA" && yos <= 4;
      return {
        playerId: c.playerId,
        playerName: c.playerName,
        priorTeam: c.teamId,
        lastSalary,
        hold: capHold(lastSalary, C, birdStatus, offRookieScale),
        yearsOfService: yos,
        birdStatus,
        faType: faTypeOf(c.playerName),
      };
    });
  // Waived veterans who are unsigned UFAs (DeRozan, Cole Anthony…). A waiver
  // extinguishes Bird rights and leaves no team hold, so they carry hold 0 and
  // renounced=true — signable by anyone via room, an exception, or a minimum.
  const have = new Set(derived.map((f) => f.playerId));
  const waived: FreeAgent[] = WAIVED_FREE_AGENTS.filter((w) => !have.has(w.playerId)).map((w) => ({
    playerId: w.playerId,
    playerName: w.name,
    priorTeam: w.priorTeam,
    lastSalary: w.lastSalary,
    hold: 0,
    yearsOfService: EXPERIENCE[w.playerId] ?? 8,
    birdStatus: "non_bird" as BirdStatus,
    faType: "UFA",
    renounced: true,
  }));
  return [...derived, ...waived].sort((a, b) => b.lastSalary - a.lastSalary);
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
      /** Draft picks changing hands outright (by original-owner pick id). */
      picks?: { id: string; to: string }[];
      /** Pick-swap RIGHTS created in this trade: `favoredTo` gets the more
       *  favorable of the two teams' same-year/round firsts, `otherTeam` the
       *  less favorable. A right, not a concrete transfer — pick ownership (and
       *  therefore Stepien coverage) is unchanged, so applyMove ignores these. */
      pickSwaps?: { year: number; round: 1 | 2; favoredTo: string; otherTeam: string }[];
      /** TPE absorption chosen when the trade was staged (per team). */
      tpeUse?: Record<
        string,
        { amount: number; preExisting: boolean; firstApronCap?: boolean; label?: string }
      >;
      /** Optional cash sent in the trade; row I creates a second-apron hard cap. */
      cash?: { from: string; to: string; amount: number }[];
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
 * apron) — plus row H aggregated trade matching and row I cash trades (second
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
        const signedPre = new Map(
          teams.map((team) => [
            team,
            cs
              .filter((c) => c.teamId === team)
              .reduce((sum, c) => sum + currentSalary(c), 0),
          ]),
        );
        const v = validateTrade(leagueData(cs), { teams, players, capHolds: holds, tpeUse: m.tpeUse, cash: m.cash }, C);
        // Restriction-table row F: using a Regular-Season-arisen TPE hard-caps
        // the team at the first apron for the rest of the year. A TPE that
        // AROSE in the current offseason is exempt until after the following
        // Regular Season (§6(j)(1)(i)), so gate on the row-F flag, not merely
        // "pre-existing".
        for (const [team, use] of Object.entries(m.tpeUse ?? {})) {
          if (isRowFCapped(use) && use.amount > 0) capAt(team, C.firstApron);
        }
        for (const check of v.checks) {
          if (!check.ok || !check.teamId) continue;
          if (check.ruleId === "hard_cap_second_apron_aggregation" || check.ruleId === "hard_cap_second_apron_cash") {
            capAt(check.teamId, C.secondApron);
          }
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
            Math.max(0, C.salaryCap - (signedPre.get(t.teamId) ?? t.preTradeSalary) - (holds[t.teamId] ?? 0)) +
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
  /** What triggered the in-world cap ("Walker Kessler sign-and-trade"). */
  hardCapSource?: string;
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
    hardCapSource: raw.hardCapSource,
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
  /** Standing before this session — governs §6(n)(2) room renunciation. */
  preExisting: boolean;
  /** Restriction-table row F applies: using it can't leave the team over the
   * first apron and hard-caps it there. True for Regular-Season-arisen TPEs;
   * false for current-offseason-arisen ones (row-F dormant until after the
   * following Regular Season) and session-minted ones. See {@link isRowFCapped}. */
  firstApronCap: boolean;
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
    // Row F(ii): a Standard TPE lives exactly a year, so it arose on its
    // expiry minus a year. If that arise date lands in the CURRENT offseason
    // (on/after CURRENT_OFFSEASON_START), its first-apron hard cap hasn't
    // attached yet — it only does after the following (2026-27) Regular
    // Season. Earlier-arisen TPEs (prior Regular Season, or a prior offseason
    // whose Regular Season already ended) are row-F restricted now.
    const arose = `${Number(r.expires.slice(0, 4)) - 1}${r.expires.slice(4)}`;
    add({
      team: r.team,
      amount: r.amount,
      label: `${r.player} TPE`,
      preExisting: true,
      firstApronCap: arose < CURRENT_OFFSEASON_START,
      expires: r.expires,
    });
  }

  // Session-minted: a trade leg that sends out more than it takes back can
  // leave a standard TPE behind. v1 approximation: the exception is capped
  // by the largest single outgoing salary (a standard TPE replaces ONE
  // traded player), usable for a year.
  let cs = BASE_CONTRACTS;
  for (const m of moves) {
    if (m.kind === "sign" && (m.mechanism === "cap_room" || m.mechanism === "room_mle")) {
      // §6(n)(2): using cap room in the SESSION renounces the team's standing
      // exceptions — pre-existing TPEs die from this point on.
      if (out[m.teamId]) {
        out[m.teamId] = out[m.teamId]!.filter((s) => !s.preExisting);
      }
      cs = applyMove(cs, m);
    } else if (m.kind === "trade") {
      // Consumption FIRST, against the pre-trade ledger — a trade can't spend
      // the TPE it is itself minting. Slots matching the plan's preExisting
      // kind go first (that's what the auto-fit actually chose).
      for (const [team, use] of Object.entries(m.tpeUse ?? {})) {
        let left = use.amount;
        const slots = [...(out[team] ?? [])].sort(
          (a, b) =>
            Number(b.preExisting === use.preExisting) - Number(a.preExisting === use.preExisting) ||
            b.amount - a.amount,
        );
        for (const slot of slots) {
          if (left <= 0) break;
          const bite = Math.min(slot.amount, left);
          slot.amount -= bite;
          left -= bite;
        }
      }
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
            label: `${shortPlayerName(agg.largestName)} TPE (this session)`,
            preExisting: false,
            firstApronCap: false, // arose this offseason — row F dormant
            expires: "2027-07-05",
          });
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
 * fails, absorb its LARGEST incoming players into a usable TPE until the
 * remainder fits the matching ceiling. Row-F aware: when the team would
 * finish above the first apron, row-F-restricted exceptions are off the table
 * (§2(e) row F) and only row-F-dormant TPEs — current-offseason-arisen and
 * same-offseason-minted — are tried. Candidates are attempted largest-first
 * until one covers enough. Returns undefined when no TPE helps. */
export function fitTpePlan(
  verdictTeams: {
    teamId: string;
    incomingSalary: number;
    maxIncomingAllowed: number;
    postTradeSalary: number;
  }[],
  incomingByTeam: Record<string, { playerId: string; salary: number }[]>,
  ledger: Record<string, TpeSlot[]>,
): Record<string, { amount: number; preExisting: boolean; firstApronCap: boolean; label?: string }> | undefined {
  const plan: Record<string, { amount: number; preExisting: boolean; firstApronCap: boolean; label?: string }> = {};
  for (const t of verdictTeams) {
    if (t.incomingSalary <= t.maxIncomingAllowed + 1) continue;
    const overFirstApron = t.postTradeSalary > C.firstApron + 1;
    const candidates = (ledger[t.teamId] ?? []).filter((s) => !overFirstApron || !isRowFCapped(s));
    const incoming = [...(incomingByTeam[t.teamId] ?? [])].sort((a, b) => b.salary - a.salary);
    for (const tpe of candidates) {
      let absorbed = 0;
      for (const p of incoming) {
        if (t.incomingSalary - absorbed <= t.maxIncomingAllowed + 1) break;
        if (absorbed + p.salary > tpe.amount + 250_000) continue; // whole players only
        absorbed += p.salary;
      }
      if (absorbed > 0 && t.incomingSalary - absorbed <= t.maxIncomingAllowed + 1) {
        plan[t.teamId] = {
          amount: absorbed,
          preExisting: tpe.preExisting,
          firstApronCap: tpe.firstApronCap,
          label: tpe.label,
        };
        break;
      }
    }
  }
  return Object.keys(plan).length ? plan : undefined;
}

/* ------------------------ Structured rule findings ----------------------- */

export interface StepienFinding {
  team: string;
  /** The consecutive uncovered years that trip the rule. */
  pair: [number, number];
  /** The year in the pair this trade's own outgoing pick created (if any). */
  offendingYear?: number;
  selectedOutgoingYears: number[];
  /** Real-world encumbrances inside the pair — the "already gone" side. */
  encumbered: { year: number; counterparty: string; status: string }[];
  /** Rendered sentence naming the actual picks, not just the rule. */
  message: string;
}

/** Explain a Stepien violation with the ACTUAL picks involved: which year is
 * already encumbered in the real world, and which outgoing pick in THIS deal
 * creates the consecutive gap. */
export function stepienFindingFor(
  team: string,
  uncoveredYears: number[],
  selectedOutgoingYears: number[] = [],
): StepienFinding | null {
  const sorted = [...uncoveredYears].sort((a, b) => a - b);
  let pair: [number, number] | null = null;
  for (let i = 0; i + 1 < sorted.length; i++) {
    if (sorted[i + 1] === sorted[i]! + 1) {
      pair = [sorted[i]!, sorted[i + 1]!];
      break;
    }
  }
  if (!pair) return null;
  const encumbered = pair
    .map((y) => ({ y, e: lockedFirstEncumbrance(team, y) }))
    .filter((x) => x.e)
    .map((x) => ({ year: x.y, counterparty: x.e!.counterparty, status: x.e!.status }));
  const offendingYear = pair.find((y) => selectedOutgoingYears.includes(y));
  const name = teamMeta(team).name;
  const poss = name.endsWith("s") ? `${name}'` : `${name}'s`;
  let message: string;
  if (encumbered.length && offendingYear !== undefined) {
    const e = encumbered[0]!;
    message = `${poss} ${e.year} first is already owed to ${e.counterparty}${
      e.status === "protected" ? " (protected — it may not convey, so it can't be counted)" : ""
    }; trading the ${offendingYear} first leaves ${pair[0]} and ${pair[1]} both uncovered (Stepien rule).`;
  } else if (offendingYear !== undefined) {
    message = `Trading the ${offendingYear} first leaves ${name} without a first in ${pair[0]} and ${pair[1]} — consecutive future drafts (Stepien rule).`;
  } else {
    message = `${name} would be without a first-round pick in consecutive future drafts (${pair[0]} and ${pair[1]} — Stepien rule).`;
  }
  return { team, pair, offendingYear, selectedOutgoingYears, encumbered, message };
}

export interface HardCapDetail {
  line: number;
  /** "session" = a move made in this sim (undoable); "real" = the team's
   * actual July moves (baked in — undoing sim moves won't help). */
  source: "session" | "real";
  label?: string;
}

/** The binding hard cap for a team with its provenance — session moves vs
 * the real July. When both bind at the same line, the REAL one wins the
 * label: you can't undo reality. */
export function hardCapDetailFor(team: string, sessionLine: number): HardCapDetail | null {
  const feed = feedStateOf(team);
  const line = Math.min(sessionLine, feed.hardCap);
  if (!Number.isFinite(line)) return null;
  if (feed.hardCap <= sessionLine) {
    return { line, source: "real", label: feed.hardCapSource };
  }
  return { line, source: "session" };
}
