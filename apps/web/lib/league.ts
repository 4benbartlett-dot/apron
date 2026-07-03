import { getLeagueData, ROOKIES_2026, TRANSACTIONS, EXPERIENCE, FREE_AGENT_INFO, SIGNINGS, RATINGS, EXTENSION_ELIGIBLE } from "@apron/data";
import {
  SEASON_2026_27,
  salaryForYear,
  capHold,
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
function dedupe(contracts: Contract[]): Contract[] {
  const map = new Map<string, Contract>();
  for (const c of contracts) {
    const cur = map.get(c.playerId);
    map.set(c.playerId, cur ? preferred(cur, c) : c);
  }
  return [...map.values()];
}

const cloneContract = (c: Contract): Contract => ({ ...c, years: [...c.years] });

/** Apply recent trades (Spotrac feed): move traded players to their new team. */
function applyTrades(contracts: Contract[]): { contracts: Contract[]; moved: string[] } {
  const cloned = contracts.map(cloneContract);
  const byName = new Map<string, Contract>();
  for (const c of cloned) {
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
    const k = norm(c.playerName);
    if (!byName.has(k)) byName.set(k, c);
  }
  const seen = new Set<string>();
  const signed: string[] = [];
  for (const t of TRANSACTIONS) {
    if (t.type !== "Signing" && t.type !== "Re-sign") continue;
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
    c.years = [...c.years.filter((y) => y.leagueYear < YEAR), ...dealFromAav(aav, yrs)];
    // Signed this offseason → not trade-eligible until Dec 15.
    c.restriction = FA_RESTRICTION;
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
    const s = SIGNINGS[normName(c.playerName)];
    if (!s || !s.aav || s.aav <= 0) return c;
    const team = stdTeam(s.team);
    if (!VALID_TEAMS.has(team)) return c;
    signed.push(`${c.playerName} → ${team}`);
    return {
      ...cloneContract(c),
      teamId: team,
      // Keep past seasons; the new deal replaces this year forward.
      years: [...c.years.filter((y) => y.leagueYear < YEAR), ...dealFromAav(s.aav, s.years)],
      // Signed this offseason → not trade-eligible until Dec 15.
      restriction: FA_RESTRICTION,
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
    if (!OPTION_DECLINED.has(normName(c.playerName))) return c;
    freed.push(c.playerName);
    return {
      ...cloneContract(c),
      years: c.years.filter((y) => y.leagueYear !== YEAR),
    };
  });
  return { contracts: out, freed };
}

const deduped = dedupe(base.contracts);
// Options first (a declined option makes a player a FA), then trades, then the
// offseason's signings restore/re-sign anyone who agreed to a new deal.
const afterOptions = applyOptions(deduped);
const afterTrades = applyTrades(afterOptions.contracts);
const afterSignings = applySignings(afterTrades.contracts);
// The structured signed-FA feed is authoritative for the newest deals — apply
// it last so it corrects team/salary from the looser transactions-prose pass.
const afterSignedFA = applySignedFA(afterSignings.contracts);
const existingIds = new Set(afterSignedFA.contracts.map((c) => c.playerId));
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
  ...afterSignedFA.contracts,
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
  // Star scarcity: wins above ~3 VORP don't come apart — they're worth extra.
  let prod = (vorp + Math.max(0, vorp - 3) * 0.35) * 2.7 * WIN$;
  // Market floors by current production rate — the trade market never treats a
  // currently-elite player as a strongly negative asset, whatever his salary.
  if (r.bpm >= 7) prod = Math.max(prod, salary * 1.2);
  else if (r.bpm >= 4) prod = Math.max(prod, salary * 1.0);
  else if (r.bpm >= 2) prod = Math.max(prod, salary * 0.85);
  // A prime-age near-max player is worth ≥ ~125% of a binding max.
  if (yos <= 10 && salary >= 0.18 * C.salaryCap) prod = Math.max(prod, salary * 1.25);
  if (yos >= 12) prod *= Math.max(0.78, 1 - 0.03 * (yos - 11));
  if (yos <= 5) prod *= 1 + 0.06 * (6 - yos);

  let surplus = prod - salary;
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

/** Rough trade value of a future draft pick (slot unknown → assume a mid/late
 * first, which is what actually gets traded). Nearer picks are worth a touch
 * more; a 1st ≫ a 2nd. */
export function pickValue(year: number, round: 1 | 2): number {
  const dist = Math.max(0, year - (Number(YEAR.slice(0, 4)) + 1));
  const base = round === 1 ? 20 : 4;
  return Math.round(base * Math.pow(0.93, dist));
}
export function rosterOf(contracts: Contract[], teamId: string): Contract[] {
  return contracts
    .filter((c) => c.teamId === teamId && currentSalary(c) > 0)
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
}
export function freeAgentsOf(contracts: Contract[]): FreeAgent[] {
  return contracts
    .filter(
      (c) => salaryForYear(c, "2025-26") > 0 && salaryForYear(c, "2026-27") === 0,
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
    const yrs = signingYears(m.salary, m.years ?? 1, m.mechanism);
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
