/**
 * Runtime schemas for the curated data files — the shape the TypeScript types
 * promise, checked against the JSON actually on disk. The types only exist at
 * compile time and every file here is edited by hand, by a scraper, or by the
 * admin; a wrong team code or a salary typed as a string fails silently
 * otherwise (a stray row simply lands on no team, as the 2026 draft board once
 * did). Each validator returns a list of issues with a JSON-pointer-ish path,
 * so a form can point at the field.
 *
 * Pure: no I/O, no imports of the data itself. Callers pass the set of valid
 * team codes.
 */

export interface Issue {
  path: string;
  message: string;
}

export interface SchemaCtx {
  /** Valid team tricodes. */
  teams: ReadonlySet<string>;
}

export const GUARANTEE_TYPES = ["full", "partial", "non_guaranteed", "team_option", "player_option"] as const;
export const BIRD_STATUSES = ["bird", "early_bird", "non_bird", "none"] as const;
export const TRANSACTION_TYPES = [
  "Trade",
  "Signing",
  "Re-sign",
  "Extension",
  "Release",
  "Qualifying Offer",
  "Option",
  "Renounce",
  "Other",
] as const;
export const HARD_CAP_LINES = ["first_apron", "second_apron", "none"] as const;
export const OBLIGATION_STATUSES = ["owed", "protected", "swap", "forfeited"] as const;
export const HOLDING_KINDS = ["outright", "swap_right", "conditional"] as const;
export const FAVORABLES = ["more", "most", "less", "least"] as const;
export const PENALTY_KINDS = ["pick_forfeiture", "fine", "suspension", "monitoring", "restitution"] as const;

export const LEAGUE_YEAR_RE = /^\d{4}-\d{2}$/;
/** The feed's own date shape: "Sep 02, 2026". */
export const FEED_DATE_RE = /^[A-Z][a-z]{2} \d{2}, \d{4}$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------ primitives ------------------------------ */

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";

class Checker {
  readonly issues: Issue[] = [];
  fail(path: string, message: string) {
    this.issues.push({ path, message });
  }
  /** Object with only the listed keys; extra keys are reported. */
  object(x: unknown, path: string, allowed: readonly string[]): x is Rec {
    if (!isRec(x)) {
      this.fail(path, "must be an object");
      return false;
    }
    for (const k of Object.keys(x)) if (!allowed.includes(k)) this.fail(`${path}.${k}`, "unknown field");
    return true;
  }
  array(x: unknown, path: string): x is unknown[] {
    if (!Array.isArray(x)) {
      this.fail(path, "must be an array");
      return false;
    }
    return true;
  }
  str(x: unknown, path: string, opts: { required?: boolean; nonEmpty?: boolean; re?: RegExp; oneOf?: readonly string[] } = {}) {
    if (x === undefined) {
      if (opts.required) this.fail(path, "required");
      return;
    }
    if (!isStr(x)) return this.fail(path, "must be a string");
    if (opts.nonEmpty !== false && opts.required && !x.trim()) this.fail(path, "must not be empty");
    if (opts.re && !opts.re.test(x)) this.fail(path, `must match ${opts.re}`);
    if (opts.oneOf && !opts.oneOf.includes(x)) this.fail(path, `must be one of ${opts.oneOf.join(", ")}`);
  }
  num(x: unknown, path: string, opts: { required?: boolean; int?: boolean; min?: number; max?: number } = {}) {
    if (x === undefined) {
      if (opts.required) this.fail(path, "required");
      return;
    }
    if (!isNum(x)) return this.fail(path, "must be a finite number");
    if (opts.int && !isInt(x)) this.fail(path, "must be a whole number");
    if (opts.min !== undefined && x < opts.min) this.fail(path, `must be ≥ ${opts.min}`);
    if (opts.max !== undefined && x > opts.max) this.fail(path, `must be ≤ ${opts.max}`);
  }
  bool(x: unknown, path: string) {
    if (x !== undefined && typeof x !== "boolean") this.fail(path, "must be true or false");
  }
  team(x: unknown, path: string, ctx: SchemaCtx, required = true) {
    if (x === undefined) {
      if (required) this.fail(path, "required");
      return;
    }
    if (!isStr(x)) return this.fail(path, "must be a team code");
    if (!ctx.teams.has(x)) this.fail(path, `unknown team code "${x}"`);
  }
  strings(x: unknown, path: string) {
    if (x === undefined) return;
    if (!this.array(x, path)) return;
    x.forEach((s, i) => this.str(s, `${path}[${i}]`, { required: true }));
  }
}

/* -------------------------------- contracts ------------------------------- */

const CONTRACT_YEAR_KEYS = ["leagueYear", "salary", "guarantee", "excludedPerformanceBonus", "tradeSalary", "likelyBonus", "unlikelyBonus"];
const CONTRACT_KEYS = [
  "playerId", "playerName", "teamId", "years", "tradeKickerPct", "noTradeClause", "birdStatus", "signedUsing",
  "yearsOfService", "signedAsFreeAgent", "twoWay", "minimumSalary", "deadMoney", "restriction", "noAggregate",
  "bycPriorSalary", "poisonPillExtensionSalaries",
];

/** One contract row, as the engine's `Contract` type describes it. */
export function validateContractRow(x: unknown, path: string, ctx: SchemaCtx, extraKeys: readonly string[] = []): Issue[] {
  const c = new Checker();
  if (!c.object(x, path, [...CONTRACT_KEYS, ...extraKeys])) return c.issues;
  c.str(x.playerId, `${path}.playerId`, { required: true, re: /^[a-z0-9][A-Za-z0-9:_.-]*$/ });
  c.str(x.playerName, `${path}.playerName`, { required: true });
  c.team(x.teamId, `${path}.teamId`, ctx);
  if (c.array(x.years, `${path}.years`)) {
    const seen = new Set<string>();
    x.years.forEach((y, i) => {
      const p = `${path}.years[${i}]`;
      if (!c.object(y, p, CONTRACT_YEAR_KEYS)) return;
      c.str(y.leagueYear, `${p}.leagueYear`, { required: true, re: LEAGUE_YEAR_RE });
      if (isStr(y.leagueYear)) {
        if (seen.has(y.leagueYear)) c.fail(`${p}.leagueYear`, `duplicate season ${y.leagueYear}`);
        seen.add(y.leagueYear);
      }
      c.num(y.salary, `${p}.salary`, { required: true, int: true, min: 0, max: 100_000_000 });
      c.str(y.guarantee, `${p}.guarantee`, { required: true, oneOf: GUARANTEE_TYPES });
      for (const k of ["excludedPerformanceBonus", "tradeSalary", "likelyBonus", "unlikelyBonus"])
        c.num(y[k], `${p}.${k}`, { int: true, min: 0 });
    });
  }
  c.num(x.tradeKickerPct, `${path}.tradeKickerPct`, { min: 0, max: 0.15 });
  c.bool(x.noTradeClause, `${path}.noTradeClause`);
  c.str(x.birdStatus, `${path}.birdStatus`, { oneOf: BIRD_STATUSES });
  c.str(x.signedUsing, `${path}.signedUsing`);
  c.num(x.yearsOfService, `${path}.yearsOfService`, { int: true, min: 0, max: 25 });
  for (const k of ["signedAsFreeAgent", "twoWay", "minimumSalary", "deadMoney", "noAggregate"]) c.bool(x[k], `${path}.${k}`);
  c.str(x.restriction, `${path}.restriction`);
  c.num(x.bycPriorSalary, `${path}.bycPriorSalary`, { int: true, min: 0 });
  if (x.poisonPillExtensionSalaries !== undefined && c.array(x.poisonPillExtensionSalaries, `${path}.poisonPillExtensionSalaries`))
    x.poisonPillExtensionSalaries.forEach((s, i) => c.num(s, `${path}.poisonPillExtensionSalaries[${i}]`, { int: true, min: 0 }));
  return c.issues;
}

/** contracts-2025-26.json — the scraped base sheet. Its own team list is the
 * authority for team codes, so the context's set is ignored here. */
export function validateContractsSheet(x: unknown): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["leagueYear", "teams", "contracts"])) return c.issues;
  c.str(x.leagueYear, "$.leagueYear", { required: true, re: LEAGUE_YEAR_RE });
  const ids = new Set<string>();
  if (c.array(x.teams, "$.teams")) {
    x.teams.forEach((t, i) => {
      const p = `$.teams[${i}]`;
      if (!c.object(t, p, ["id", "name", "conference"])) return;
      c.str(t.id, `${p}.id`, { required: true, re: /^[A-Z]{3}$/ });
      c.str(t.name, `${p}.name`, { required: true });
      c.str(t.conference, `${p}.conference`, { oneOf: ["East", "West"] });
      if (isStr(t.id)) {
        if (ids.has(t.id)) c.fail(`${p}.id`, `duplicate team ${t.id}`);
        ids.add(t.id);
      }
    });
  }
  if (ids.size !== 30) c.fail("$.teams", `expected 30 teams, found ${ids.size}`);
  const ctx = { teams: ids };
  if (c.array(x.contracts, "$.contracts"))
    x.contracts.forEach((row, i) => c.issues.push(...validateContractRow(row, `$.contracts[${i}]`, ctx)));
  return c.issues;
}

/** rookies-2026.json — the draft class as rookie-scale rows (+ pick, round). */
export function validateRookies(x: unknown, ctx: SchemaCtx): Issue[] {
  const c = new Checker();
  if (!c.array(x, "$")) return c.issues;
  x.forEach((row, i) => {
    const p = `$[${i}]`;
    c.issues.push(...validateContractRow(row, p, ctx, ["pick", "round"]));
    if (isRec(row)) {
      c.num(row.pick, `${p}.pick`, { required: true, int: true, min: 1, max: 60 });
      c.num(row.round, `${p}.round`, { required: true, int: true, min: 1, max: 2 });
    }
  });
  return c.issues;
}

/** extra-contracts.json — curated sheet stubs. */
export function validateExtraContracts(x: unknown, ctx: SchemaCtx): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["asOf", "note", "players"])) return c.issues;
  c.str(x.asOf, "$.asOf", { re: ISO_DATE_RE });
  c.str(x.note, "$.note");
  if (c.array(x.players, "$.players"))
    x.players.forEach((row, i) => {
      c.issues.push(...validateContractRow(row, `$.players[${i}]`, ctx, ["why"]));
      if (isRec(row)) c.str(row.why, `$.players[${i}].why`);
    });
  return c.issues;
}

/* ------------------------------ transactions ------------------------------ */

const TRANSACTION_KEYS = ["player", "pos", "date", "type", "detail", "why"];

/** One feed row (transactions.json / manual-moves.json). The scraped feed
 * occasionally carries a row with an empty detail (Spotrac publishes a bare
 * "Signing" now and then); a curated row must say what happened. */
export function validateTransactionRow(x: unknown, path: string, opts: { allowEmptyDetail?: boolean } = {}): Issue[] {
  const c = new Checker();
  if (!c.object(x, path, TRANSACTION_KEYS)) return c.issues;
  c.str(x.player, `${path}.player`, { required: true });
  c.str(x.pos, `${path}.pos`, { required: true, nonEmpty: false });
  c.str(x.date, `${path}.date`, { required: true, re: FEED_DATE_RE });
  c.str(x.type, `${path}.type`, { required: true, oneOf: TRANSACTION_TYPES });
  c.str(x.detail, `${path}.detail`, { required: true, nonEmpty: !opts.allowEmptyDetail });
  c.str(x.why, `${path}.why`);
  return c.issues;
}

export function validateManualMoves(x: unknown): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["note", "transactions"])) return c.issues;
  c.str(x.note, "$.note");
  if (c.array(x.transactions, "$.transactions"))
    x.transactions.forEach((row, i) => {
      c.issues.push(...validateTransactionRow(row, `$.transactions[${i}]`));
      // A curated row is a claim; it carries its evidence.
      if (isRec(row) && !isStr(row.why)) c.fail(`$.transactions[${i}].why`, "a curated move needs a why (the source and the arithmetic)");
    });
  return c.issues;
}

export function validateTransactionsFeed(x: unknown): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["source", "transactions"])) return c.issues;
  c.str(x.source, "$.source");
  if (c.array(x.transactions, "$.transactions"))
    x.transactions.forEach((row, i) => c.issues.push(...validateTransactionRow(row, `$.transactions[${i}]`, { allowEmptyDetail: true })));
  return c.issues;
}

export function validateFeedCorrections(x: unknown): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["note", "corrections"])) return c.issues;
  c.str(x.note, "$.note");
  if (c.array(x.corrections, "$.corrections"))
    x.corrections.forEach((row, i) => {
      const p = `$.corrections[${i}]`;
      if (!c.object(row, p, ["date", "player", "type", "detail", "why"])) return;
      c.str(row.date, `${p}.date`, { required: true, re: FEED_DATE_RE });
      c.str(row.player, `${p}.player`, { required: true });
      c.str(row.type, `${p}.type`, { required: true, oneOf: TRANSACTION_TYPES });
      c.str(row.detail, `${p}.detail`, { required: true });
      c.str(row.why, `${p}.why`, { required: true });
    });
  return c.issues;
}

/* ------------------------------ team state ------------------------------- */

const FEED_STATE_KEYS = [
  "operatedUnderCap", "roomMleUsed", "consumedNtmle", "consumedTpmle", "consumedBae", "inWorldHardCap",
  "hardCapSource", "forcedRenounced", "pendingRelief", "confidence", "rationale",
];

export function validateFeedTeamState(x: unknown, ctx: SchemaCtx): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["asOf", "note", "teams"])) return c.issues;
  c.str(x.asOf, "$.asOf", { required: true, re: ISO_DATE_RE });
  c.str(x.note, "$.note");
  if (!isRec(x.teams)) {
    c.fail("$.teams", "must be an object keyed by team code");
    return c.issues;
  }
  for (const [team, s] of Object.entries(x.teams)) {
    const p = `$.teams.${team}`;
    c.team(team, p, ctx);
    if (!c.object(s, p, FEED_STATE_KEYS)) continue;
    c.bool(s.operatedUnderCap, `${p}.operatedUnderCap`);
    for (const k of ["roomMleUsed", "consumedNtmle", "consumedTpmle", "consumedBae"]) c.num(s[k], `${p}.${k}`, { int: true, min: 0, max: 20_000_000 });
    c.str(s.inWorldHardCap, `${p}.inWorldHardCap`, { oneOf: HARD_CAP_LINES });
    c.str(s.hardCapSource, `${p}.hardCapSource`);
    if (s.inWorldHardCap && s.inWorldHardCap !== "none" && !isStr(s.hardCapSource))
      c.fail(`${p}.hardCapSource`, "a hard cap names the move that triggered it");
    c.strings(s.forcedRenounced, `${p}.forcedRenounced`);
    if (s.pendingRelief !== undefined && c.object(s.pendingRelief, `${p}.pendingRelief`, ["short", "text", "source", "asOf"])) {
      c.str(s.pendingRelief.short, `${p}.pendingRelief.short`, { required: true });
      c.str(s.pendingRelief.text, `${p}.pendingRelief.text`, { required: true });
      c.str(s.pendingRelief.source, `${p}.pendingRelief.source`, { required: true });
      c.str(s.pendingRelief.asOf, `${p}.pendingRelief.asOf`, { required: true, re: ISO_DATE_RE });
    }
    c.str(s.confidence, `${p}.confidence`);
    c.str(s.rationale, `${p}.rationale`);
  }
  return c.issues;
}

export function validateRosterCorrections(x: unknown, ctx: SchemaCtx): Issue[] {
  const c = new Checker();
  const keys = ["note", "asOf", "waivedFreeAgents", "waivedFreeAgentsNote", "suppressDeadCap", "suppressDeadCapNote", "resolvedOfferSheets", "resolvedOfferSheetsNote", "pendingSignings", "pendingSigningsNote"];
  if (!c.object(x, "$", keys)) return c.issues;
  c.str(x.note, "$.note");
  c.str(x.asOf, "$.asOf", { re: ISO_DATE_RE });
  if (c.array(x.waivedFreeAgents, "$.waivedFreeAgents"))
    x.waivedFreeAgents.forEach((w, i) => {
      const p = `$.waivedFreeAgents[${i}]`;
      if (!c.object(w, p, ["playerId", "name", "priorTeam", "lastSalary", "note"])) return;
      c.str(w.playerId, `${p}.playerId`, { required: true });
      c.str(w.name, `${p}.name`, { required: true });
      c.team(w.priorTeam, `${p}.priorTeam`, ctx);
      c.num(w.lastSalary, `${p}.lastSalary`, { required: true, int: true, min: 0 });
      c.str(w.note, `${p}.note`);
    });
  c.str(x.waivedFreeAgentsNote, "$.waivedFreeAgentsNote");
  c.strings(x.suppressDeadCap, "$.suppressDeadCap");
  c.str(x.suppressDeadCapNote, "$.suppressDeadCapNote");
  c.strings(x.resolvedOfferSheets, "$.resolvedOfferSheets");
  c.str(x.resolvedOfferSheetsNote, "$.resolvedOfferSheetsNote");
  c.strings(x.pendingSignings, "$.pendingSignings");
  c.str(x.pendingSigningsNote, "$.pendingSigningsNote");
  return c.issues;
}

/* --------------------------------- picks --------------------------------- */

export function validatePickRights(x: unknown, ctx: SchemaCtx): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["source", "byTeam"])) return c.issues;
  c.str(x.source, "$.source");
  if (!isRec(x.byTeam)) {
    c.fail("$.byTeam", "must be an object keyed by team code");
    return c.issues;
  }
  for (const [team, r] of Object.entries(x.byTeam)) {
    const p = `$.byTeam.${team}`;
    c.team(team, p, ctx);
    if (!c.object(r, p, ["ownFirstObligations", "holdings"])) continue;
    if (c.array(r.ownFirstObligations, `${p}.ownFirstObligations`))
      r.ownFirstObligations.forEach((o, i) => {
        const q = `${p}.ownFirstObligations[${i}]`;
        if (!c.object(o, q, ["year", "status", "to", "favorable", "protection", "note", "source"])) return;
        c.num(o.year, `${q}.year`, { required: true, int: true, min: 2026, max: 2040 });
        c.str(o.status, `${q}.status`, { required: true, oneOf: OBLIGATION_STATUSES });
        c.team(o.to, `${q}.to`, ctx, false);
        c.str(o.favorable, `${q}.favorable`, { oneOf: FAVORABLES });
        c.str(o.protection, `${q}.protection`);
        c.str(o.note, `${q}.note`, { required: true });
        c.str(o.source, `${q}.source`);
      });
    if (c.array(r.holdings, `${p}.holdings`))
      r.holdings.forEach((h, i) => {
        const q = `${p}.holdings[${i}]`;
        if (!c.object(h, q, ["year", "round", "kind", "origin", "counterparties", "favorable", "protection", "overlapsPrior", "forfeited", "note", "source"])) return;
        c.num(h.year, `${q}.year`, { required: true, int: true, min: 2026, max: 2040 });
        c.num(h.round, `${q}.round`, { required: true, int: true, min: 1, max: 2 });
        c.str(h.kind, `${q}.kind`, { required: true, oneOf: HOLDING_KINDS });
        // An origin may be a compound "OKC/HOU" pool label; only a plain code is
        // checked against the team list.
        if (h.origin !== undefined) {
          if (!isStr(h.origin)) c.fail(`${q}.origin`, "must be a string");
          else if (/^[A-Z]{3}$/.test(h.origin) && !ctx.teams.has(h.origin)) c.fail(`${q}.origin`, `unknown team code "${h.origin}"`);
        }
        c.strings(h.counterparties, `${q}.counterparties`);
        c.str(h.favorable, `${q}.favorable`, { oneOf: FAVORABLES });
        c.str(h.protection, `${q}.protection`);
        c.bool(h.overlapsPrior, `${q}.overlapsPrior`);
        c.bool(h.forfeited, `${q}.forfeited`);
        c.str(h.note, `${q}.note`, { required: true });
        c.str(h.source, `${q}.source`);
      });
  }
  return c.issues;
}

/* -------------------------------- rulings -------------------------------- */

export function validateLeagueRulings(x: unknown, ctx: SchemaCtx): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["note", "rulings"])) return c.issues;
  c.str(x.note, "$.note");
  if (!c.array(x.rulings, "$.rulings")) return c.issues;
  const ids = new Set<string>();
  x.rulings.forEach((r, i) => {
    const p = `$.rulings[${i}]`;
    if (!c.object(r, p, ["id", "date", "team", "headline", "summary", "findings", "penalties", "sources"])) return;
    c.str(r.id, `${p}.id`, { required: true, re: /^[a-z0-9-]+$/ });
    if (isStr(r.id)) {
      if (ids.has(r.id)) c.fail(`${p}.id`, `duplicate id ${r.id}`);
      ids.add(r.id);
    }
    c.str(r.date, `${p}.date`, { required: true, re: ISO_DATE_RE });
    c.team(r.team, `${p}.team`, ctx);
    c.str(r.headline, `${p}.headline`, { required: true });
    c.str(r.summary, `${p}.summary`, { required: true });
    c.strings(r.findings, `${p}.findings`);
    if (c.array(r.penalties, `${p}.penalties`))
      r.penalties.forEach((pen, j) => {
        const q = `${p}.penalties[${j}]`;
        if (!isRec(pen)) return c.fail(q, "must be an object");
        c.str(pen.kind, `${q}.kind`, { required: true, oneOf: PENALTY_KINDS });
        c.str(pen.text, `${q}.text`, { required: true });
        c.str(pen.source, `${q}.source`);
        switch (pen.kind) {
          case "pick_forfeiture":
            c.object(pen, q, ["kind", "team", "year", "round", "origin", "text", "note", "source"]);
            c.team(pen.team, `${q}.team`, ctx);
            c.team(pen.origin, `${q}.origin`, ctx);
            c.num(pen.year, `${q}.year`, { required: true, int: true, min: 2026, max: 2040 });
            c.num(pen.round, `${q}.round`, { required: true, int: true, min: 1, max: 2 });
            c.str(pen.note, `${q}.note`);
            break;
          case "fine":
            c.object(pen, q, ["kind", "team", "amount", "text", "source"]);
            c.team(pen.team, `${q}.team`, ctx);
            c.num(pen.amount, `${q}.amount`, { required: true, int: true, min: 0 });
            break;
          case "suspension":
            c.object(pen, q, ["kind", "team", "person", "role", "length", "unpaid", "text", "source"]);
            c.team(pen.team, `${q}.team`, ctx);
            c.str(pen.person, `${q}.person`, { required: true });
            c.str(pen.role, `${q}.role`, { required: true });
            c.str(pen.length, `${q}.length`, { required: true });
            c.bool(pen.unpaid, `${q}.unpaid`);
            break;
          case "monitoring":
            c.object(pen, q, ["kind", "team", "years", "text", "source"]);
            c.team(pen.team, `${q}.team`, ctx);
            c.num(pen.years, `${q}.years`, { required: true, int: true, min: 1 });
            break;
          case "restitution":
            c.object(pen, q, ["kind", "person", "amount", "text", "source"]);
            c.str(pen.person, `${q}.person`, { required: true });
            c.num(pen.amount, `${q}.amount`, { required: true, int: true, min: 0 });
            break;
        }
      });
    if (c.array(r.sources, `${p}.sources`))
      r.sources.forEach((s, j) => {
        const q = `${p}.sources[${j}]`;
        if (!c.object(s, q, ["outlet", "url", "note", "date"])) return;
        c.str(s.outlet, `${q}.outlet`, { required: true });
        c.str(s.url, `${q}.url`, { re: /^https?:\/\// });
        c.str(s.note, `${q}.note`);
        c.str(s.date, `${q}.date`, { re: ISO_DATE_RE });
      });
    if (Array.isArray(r.sources) && r.sources.length === 0) c.fail(`${p}.sources`, "a ruling cites at least one source");
  });
  return c.issues;
}

/* --------------------------------- small --------------------------------- */

export function validateFaOverrides(x: unknown): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["asOf", "note", "byName"])) return c.issues;
  c.str(x.asOf, "$.asOf", { re: ISO_DATE_RE });
  c.str(x.note, "$.note");
  if (!isRec(x.byName)) {
    c.fail("$.byName", "must be an object keyed by normalized name");
    return c.issues;
  }
  for (const [name, o] of Object.entries(x.byName)) {
    const p = `$.byName.${name}`;
    if (!/^[a-z0-9 ]+$/.test(name)) c.fail(p, "keys are normalized names: lowercase, no punctuation");
    if (!c.object(o, p, ["birdStatus", "why"])) continue;
    c.str(o.birdStatus, `${p}.birdStatus`, { oneOf: BIRD_STATUSES });
    c.str(o.why, `${p}.why`);
  }
  return c.issues;
}

export function validateRetired(x: unknown): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["note", "players"])) return c.issues;
  c.str(x.note, "$.note");
  c.strings(x.players, "$.players");
  return c.issues;
}

export function validateMeta(x: unknown): Issue[] {
  const c = new Checker();
  if (!c.object(x, "$", ["rostersAsOf"])) return c.issues;
  c.str(x.rostersAsOf, "$.rostersAsOf", { required: true, re: ISO_DATE_RE });
  return c.issues;
}

/* ------------------------------- registry -------------------------------- */

export type SchemaId =
  | "contracts"
  | "rookies"
  | "extraContracts"
  | "manualMoves"
  | "transactions"
  | "feedCorrections"
  | "feedTeamState"
  | "rosterCorrections"
  | "pickRights"
  | "leagueRulings"
  | "faOverrides"
  | "retired"
  | "meta";

export interface DataSchema {
  id: SchemaId;
  file: string;
  title: string;
  validate: (json: unknown, ctx: SchemaCtx) => Issue[];
}

export const DATA_SCHEMAS: Record<SchemaId, DataSchema> = {
  contracts: { id: "contracts", file: "contracts-2025-26.json", title: "Contract sheet", validate: (x) => validateContractsSheet(x) },
  rookies: { id: "rookies", file: "rookies-2026.json", title: "2026 draft class", validate: validateRookies },
  extraContracts: { id: "extraContracts", file: "extra-contracts.json", title: "Sheet stubs", validate: validateExtraContracts },
  manualMoves: { id: "manualMoves", file: "manual-moves.json", title: "Curated moves", validate: (x) => validateManualMoves(x) },
  transactions: { id: "transactions", file: "transactions.json", title: "Transaction feed", validate: (x) => validateTransactionsFeed(x) },
  feedCorrections: { id: "feedCorrections", file: "feed-corrections.json", title: "Feed corrections", validate: (x) => validateFeedCorrections(x) },
  feedTeamState: { id: "feedTeamState", file: "feed-team-state.json", title: "Team offseason state", validate: validateFeedTeamState },
  rosterCorrections: { id: "rosterCorrections", file: "roster-corrections-2026.json", title: "Roster corrections", validate: validateRosterCorrections },
  pickRights: { id: "pickRights", file: "pick-rights-2026.json", title: "Pick rights", validate: validatePickRights },
  leagueRulings: { id: "leagueRulings", file: "league-rulings.json", title: "League rulings", validate: validateLeagueRulings },
  faOverrides: { id: "faOverrides", file: "fa-overrides.json", title: "Free-agent overrides", validate: (x) => validateFaOverrides(x) },
  retired: { id: "retired", file: "retired-2026.json", title: "Retirements", validate: (x) => validateRetired(x) },
  meta: { id: "meta", file: "meta.json", title: "Snapshot date", validate: (x) => validateMeta(x) },
};

export function validateDataFile(id: SchemaId, json: unknown, ctx: SchemaCtx): Issue[] {
  return DATA_SCHEMAS[id].validate(json, ctx);
}
