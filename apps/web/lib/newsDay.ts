import {
  validateTrade,
  validateSigning,
  classifyTier,
  violatesStepien,
  teamSalary as engTeamSalary,
  type Contract,
  type TeamTradeSummary,
} from "@apron/cba-engine";
import {
  TRANSACTIONS,
  LEAGUE_RULINGS,
  PICK_RIGHTS,
  DATA_AS_OF,
  firstEncumbranceOf,
  hasAcquiredFirst,
  teamPossessive,
  type Transaction,
  type LeagueRuling,
  type RulingPenalty,
} from "@apron/data";
import {
  BASE_CONTRACTS,
  C,
  YEAR,
  leagueData,
  normName,
  teamMeta,
  teamProjection,
  feedStateOf,
  freeAgentsOf,
  tpeLedger,
  lockedFirstEncumbrance,
  TEAM_IDS,
} from "@/lib/league";
import { rewind, isoDate } from "@/lib/replayRewind";
import { hardCapCause } from "@/lib/format";
import { dayBefore, daysBetween } from "@/lib/feedDate";
import {
  buildDocket,
  buildChecks,
  tradeConsequences,
  tierConsequence,
  type DocketTeam,
  type DocketCheck,
  type MoveConsequence,
} from "@/lib/docket";

// ---------------------------------------------------------------------------
// THE NEWS DAY — the most recent day the feed moved, run back through the
// engine as if someone had staged it themselves.
//
// Everything here is DERIVED. No hand-written blurb about a deal: the verdict
// comes from validateTrade / validateSigning against the sheet as it stood the
// night before, the rule implications come from the same tradeConsequences()
// the trade board uses, and the win numbers come from the same projection the
// team pages show. If the engine changes its mind about a move, the card
// changes with it — which is the only way this can stay true unattended.
//
// The pre-move sheet is rewind()'s job: undo everything the feed did after the
// day before, for the teams involved. That is what makes "Cleveland had
// $28.4M of room" a computed statement rather than a remembered one.
// ---------------------------------------------------------------------------

export interface WinShift {
  team: string;
  beforeWins: number;
  afterWins: number;
  beforeNrtg: number;
  afterNrtg: number;
}

export interface NewsMove {
  /** Stable across rebuilds — the dismissal key and the React key. */
  id: string;
  kind: "trade" | "signing" | "ruling";
  date: string;
  /** "Aug 19" — for the strip. */
  dateLabel: string;
  headline: string;
  /** One line of plain context under the headline. */
  subhead: string;
  teams: string[];
  legal: boolean;
  /** Present on trades: the same docket the board and share card render. */
  docket?: DocketTeam[];
  /** Present on signings. */
  signing?: {
    player: string;
    team: string;
    years: number;
    total: number;
    y1: number;
    mechanism?: string;
  };
  /** Present on league rulings: what the league said, in its own words. The
   * checks on a ruling card are still computed — they read the pick ledger
   * after the penalty — but the penalty itself is quoted, not derived. */
  ruling?: {
    summary: string;
    findings: string[];
    penalties: { kind: RulingPenalty["kind"]; text: string }[];
    sources: { outlet: string; url?: string; note?: string }[];
  };
  checks: DocketCheck[];
  consequences: MoveConsequence[];
  winShifts: WinShift[];
  /** The team the move moved most — where "so what" is answered. */
  focusTeam: string;
}

export interface NewsDay {
  date: string;
  dateLabel: string;
  moves: NewsMove[];
}

/* ----------------------------- feed parsing ------------------------------ */

const TEAM_FIX: Record<string, string> = {
  WSH: "WAS", GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX", LA: "LAC",
};
const std = (code: string) => TEAM_FIX[code.toUpperCase()] ?? code.toUpperCase();
const isTeam = (code: string) => TEAM_IDS.includes(std(code));

export { dayBefore } from "@/lib/feedDate";

function label(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Split a trade clause's asset list without breaking on bracketed notes,
 * which contain their own " and " ("[least favorable of BKN/DAL pick]"). */
export function splitAssets(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (depth === 0) {
      if (s.startsWith(" and ", i)) { parts.push(buf); buf = ""; i += 4; continue; }
      if (ch === "," && s[i + 1] === " ") { parts.push(buf); buf = ""; i += 1; continue; }
    }
    buf += ch;
  }
  parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export interface Leg { from: string; to: string; asset: string; kind: "player" | "pick" | "cash" }

/** Every leg the prose enumerates. Multi-team rows carry the full ledger after
 * "as part of a N-team trade:", each row omitting only its OWN player leg —
 * so the union across a day's rows is the complete deal. */
export function parseLegs(detail: string): Leg[] {
  const tail = detail.split(/as part of a \d+-team trade:/i)[1];
  // A two-team row has no ledger — it says "Traded to X from Y for Z and cash".
  // Skipping it drops the cash, and cash is a row-I trigger that hard-caps the
  // sender at the SECOND apron. The Aug 14 Schröder deal is exactly this shape.
  if (!tail) return parseSimple(detail);
  const out: Leg[] = [];
  for (const clause of tail.split(";")) {
    const m = clause.trim().match(/^(.+?)\s*\(([A-Za-z]{2,4})\)\s*traded\s+(.+?)\s+to\s+(.+?)\s*\(([A-Za-z]{2,4})\)\s*$/);
    if (!m || !isTeam(m[2]!) || !isTeam(m[5]!)) continue;
    for (const raw of splitAssets(m[3]!)) {
      const asset = raw.replace(/^(a|an|the)\s+/i, "").trim();
      out.push({ from: std(m[2]!), to: std(m[5]!), asset, kind: classifyAsset(asset) });
    }
  }
  return out;
}

/** The return side of a two-team row: "Traded to CLE from CHA for X and cash". */
function parseSimple(detail: string): Leg[] {
  const m = detail.match(
    /Traded to\s+(.+?)\s*\(([A-Za-z]{2,4})\)\s*from\s+(.+?)\s*\(([A-Za-z]{2,4})\)(?:\s*(?:for|with)\s+(.+?))?\s*$/,
  );
  if (!m || !isTeam(m[2]!) || !isTeam(m[4]!) || !m[5]) return [];
  const to = std(m[2]!);
  const from = std(m[4]!);
  const out: Leg[] = [];
  for (const raw of splitAssets(m[5]!)) {
    const asset = raw.replace(/^(a|an|the)\s+/i, "").trim();
    const kind = classifyAsset(asset);
    // The return side flows the OTHER way: he came from `from`, so what was
    // paid for him went to `from`. Only cash and picks are taken here —
    // the players on the return side have their own rows.
    if (kind === "player") continue;
    out.push({ from: to, to: from, asset, kind });
  }
  return out;
}

const classifyAsset = (asset: string): Leg["kind"] =>
  /round pick/i.test(asset)
    ? "pick"
    : /^\$?[\d,]+$/.test(asset) || /^cash/i.test(asset)
      ? "cash"
      : "player";

const currentSalaryOf = (c: Contract) =>
  c.years.find((y) => y.leagueYear === YEAR)?.salary ?? 0;

const contractOf = (name: string): Contract | undefined =>
  BASE_CONTRACTS.find((c) => normName(c.playerName) === normName(name) && !c.deadMoney);

/* ------------------------------ projections ------------------------------ */

/**
 * Before and after for THIS move only. Both sheets are explicit, because
 * "after" is not today: measuring the Aug 19 trade against today's roster would
 * hand it credit for the Aug 20 signing as well. Each projection comes from the
 * same league-wide zero-sum apportionment, so the two are comparable.
 */
function winShifts(pre: Contract[], post: Contract[], teams: string[]): WinShift[] {
  return teams
    .map((team) => {
      const a = teamProjection(team, pre);
      const b = teamProjection(team, post);
      if (!a || !b) return null;
      return {
        team,
        beforeWins: a.projWins,
        afterWins: b.projWins,
        beforeNrtg: a.projNrtg,
        afterNrtg: b.projNrtg,
      };
    })
    .filter((x): x is WinShift => x != null)
    .sort((a, b) => b.afterWins - b.beforeWins - (a.afterWins - a.beforeWins));
}

const holdsOf = (pre: Contract[]) => (team: string) =>
  freeAgentsOf(pre)
    .filter((f) => f.priorTeam === team)
    .reduce((s, f) => s + f.hold, 0);

/* -------------------------------- trades --------------------------------- */

function buildTrade(rows: readonly Transaction[], iso: string): NewsMove | null {
  // Each row's own prefix names the player and both ends of his leg; the
  // clause ledger (multi-team rows only) carries the picks and cash.
  // Every row repeats the same ledger, so the union has to be deduped or a
  // five-teamer's picks show up six times each.
  const legs: Leg[] = [];
  const seenLeg = new Set<string>();
  for (const r of rows)
    for (const l of parseLegs(r.detail)) {
      const k = `${l.from}>${l.to}:${l.asset}`;
      if (seenLeg.has(k)) continue;
      seenLeg.add(k);
      legs.push(l);
    }

  const movesByPlayer = new Map<string, { name: string; from: string; to: string }>();
  for (const r of rows) {
    const m = r.detail.match(/Traded to\s+(.+?)\s*\(([A-Za-z]{2,4})\)\s*from\s+(.+?)\s*\(([A-Za-z]{2,4})\)/);
    if (!m || !isTeam(m[2]!) || !isTeam(m[4]!)) continue;
    const k = normName(r.player);
    if (!movesByPlayer.has(k)) movesByPlayer.set(k, { name: r.player, from: std(m[4]!), to: std(m[2]!) });
  }
  // The row PREFIX and the clause ledger can disagree, and the ledger wins.
  // Tre Mann's row reads "Traded to Washington from Cleveland" — the feed
  // stacked two prefixes after Charlotte and Cleveland swapped him five days
  // earlier — while the ledger says plainly "Charlotte traded Tre Mann to
  // Washington." Believing the prefix hands Charlotte an incoming salary
  // against nothing outgoing and reads the whole deal as blocked.
  for (const l of legs) {
    if (l.kind !== "player") continue;
    const k = normName(l.asset);
    const mv = movesByPlayer.get(k);
    if (mv) { mv.from = l.from; mv.to = l.to; }
    else movesByPlayer.set(k, { name: l.asset, from: l.from, to: l.to });
  }

  const players: { playerId: string; from: string; to: string }[] = [];
  for (const mv of movesByPlayer.values()) {
    const c = contractOf(mv.name);
    // Two-ways and draft rights carry no cap salary, so they have no sheet row
    // to move. They belong to the deal but not to the cap ledger the docket is.
    if (!c) continue;
    players.push({ playerId: c.playerId, from: mv.from, to: mv.to });
  }
  if (!players.length) return null;

  const teams = [...new Set(players.flatMap((p) => [p.from, p.to]))].sort();
  let pre = rewind(BASE_CONTRACTS, dayBefore(iso), teams);
  const post = rewind(BASE_CONTRACTS, iso, teams);

  // A sign-and-trade is signed FIRST and traded in the same breath, so the
  // sheet it should be measured against has him already under contract on the
  // signing team. Rewound plainly he is a free agent worth $0, which makes the
  // acquirer look like it took back nothing. Art. VII §8(e) also exempts the
  // initial sign-and-trade from the Dec-15 freeze that otherwise locks a
  // just-signed free agent — without that, every S&T reads as blocked.
  const sntNames = new Set(
    TRANSACTIONS.filter((t) => isoDate(t.date) === iso && /Sign-and-Trade/i.test(t.detail)).map((t) =>
      normName(t.player),
    ),
  );
  if (sntNames.size) {
    pre = pre.map((c) => {
      if (!sntNames.has(normName(c.playerName)) || c.deadMoney) return c;
      const signed = post.find((x) => x.playerId === c.playerId);
      const mv = players.find((x) => x.playerId === c.playerId);
      return signed && mv
        ? { ...signed, teamId: mv.from, restriction: undefined, noAggregate: undefined }
        : c;
    });
  }
  const cash = legs
    .filter((l) => l.kind === "cash")
    .map((l) => ({ from: l.from, to: l.to, amount: Number(l.asset.replace(/[^\d]/g, "")) || 1 }));

  const trade = { teams, players, ...(cash.length ? { cash } : {}) };
  let v = validateTrade(leagueData(pre), trade, C);
  type TpeUse = Record<string, { amount: number; preExisting: boolean; firstApronCap?: boolean; label?: string }>;
  let appliedTpe: TpeUse | undefined;

  // A team that took back salary it plainly cannot match usually absorbed it
  // into a standing traded-player exception — the deal is real, so the
  // mechanism exists whether or not the feed's prose names it. Retry with the
  // team's largest sufficient TPE and say so on the card, the same inference
  // the Jul 19 Risacher replay documents. Only offered when one exception
  // covers the whole unmatched amount; a partial guess would be fiction.
  if (!v.legal) {
    const ledger = tpeLedger([]);
    const tpeUse: TpeUse = {};
    for (const t of v.teams) {
      const short = v.violations.some((x) => x.teamId === t.teamId && /take back at most/i.test(x.reason));
      if (!short) continue;
      const slot = (ledger[t.teamId] ?? []).find((sl) => sl.amount >= t.incomingSalary);
      if (!slot) continue;
      tpeUse[t.teamId] = {
        amount: t.incomingSalary,
        preExisting: slot.preExisting,
        firstApronCap: slot.firstApronCap,
        label: slot.label,
      };

    }
    if (Object.keys(tpeUse).length) {
      const retry = validateTrade(leagueData(pre), { ...trade, tpeUse }, C);
      if (retry.legal) {
        v = retry;
        appliedTpe = tpeUse;
      }
    }
  }
  const nameOf = (id: string) => pre.find((c) => c.playerId === id)?.playerName ?? id;
  const nameAfter = (id: string) => post.find((c) => c.playerId === id)?.playerName ?? nameOf(id);
  const salaryOf = (id: string) =>
    pre.find((c) => c.playerId === id)?.years.find((y) => y.leagueYear === YEAR)?.salary ?? 0;

  const docket = buildDocket(players, {}, v.teams, nameOf, salaryOf, appliedTpe);
  // Picks and cash aren't sheet rows, so buildDocket can't see them — append
  // them to the same ledger from the prose, on both legs.
  for (const l of legs) {
    if (l.kind === "player") continue;
    const text = l.kind === "cash" ? "Cash" : l.asset.replace(/\s*\[.*?\]\s*/g, " ").trim();
    docket.find((d) => d.teamId === l.to)?.gets.push({ label: text, pick: true });
    docket.find((d) => d.teamId === l.from)?.sends.push({ label: text, pick: true });
  }

  const hasFirsts = legs.some((l) => l.kind === "pick" && /1st/i.test(l.asset));
  const checks = buildChecks({
    legal: v.legal,
    tpeUse: appliedTpe,
    involved: v.teams.filter((t) => t.incomingSalary > 0 || t.outgoingSalary > 0) as TeamTradeSummary[],
    violationReasons: v.violations.map((x) => x.reason),
    extraViolations: [],
    hasFirsts,
  });
  const consequences = tradeConsequences(v.teams, appliedTpe, holdsOf(pre), v.checks as never);

  // Headline: the biggest incoming salary is the story, and the team that got
  // him is the subject. "Cleveland lands Peyton Watson" beats a team list.
  // Rank by the salary he carries AFTER the move, not before: a signed-and-
  // traded player is a free agent on the pre sheet and worth $0 there, which
  // would hand the headline to whoever else was biggest.
  const salaryAfter = (id: string) =>
    post.find((c) => c.playerId === id)?.years.find((y) => y.leagueYear === YEAR)?.salary ?? 0;
  const best = [...players].sort((a, b) => salaryAfter(b.playerId) - salaryAfter(a.playerId))[0]!;
  const headline = `${teamMeta(best.to).name} land ${nameAfter(best.playerId)}${
    teams.length > 2 ? ` in a ${teams.length}-team deal` : ` from ${teamMeta(best.from).name}`
  }`;
  const others = players.filter((p) => p.playerId !== best.playerId).length;
  const picks = legs.filter((l) => l.kind === "pick").length;

  return {
    id: `${iso}-trade-${teams.join("")}`,
    kind: "trade",
    date: iso,
    dateLabel: label(iso),
    headline,
    subhead: [
      `${teams.length} teams`,
      `${players.length} player${players.length === 1 ? "" : "s"}`,
      picks ? `${picks} pick${picks === 1 ? "" : "s"}` : null,
      others ? null : null,
    ]
      .filter(Boolean)
      .join(" · "),
    teams,
    legal: v.legal,
    docket,
    checks,
    consequences,
    winShifts: winShifts(pre, post, teams),
    focusTeam: best.to,
  };
}

/* ------------------------------- signings -------------------------------- */

function buildSigning(row: Transaction, iso: string): NewsMove | null {
  const teamM = row.detail.match(/with\s+[A-Za-z .'&-]+\(([A-Za-z]{2,4})\)/);
  const yearsM = row.detail.match(/(\d+)\s*year/);
  const totalM = row.detail.match(/\$\s*([\d.]+)\s*million/);
  if (!teamM || !totalM || !isTeam(teamM[1]!)) return null;
  const team = std(teamM[1]!);
  const c = contractOf(row.player);
  if (!c || c.teamId !== team) return null;

  const y1 = c.years.find((y) => y.leagueYear === YEAR)?.salary ?? 0;
  const pre = rewind(BASE_CONTRACTS, dayBefore(iso), [team]);
  const post = rewind(BASE_CONTRACTS, iso, [team]);
  const before = engTeamSalary(leagueData(pre), team, YEAR);
  const fa = freeAgentsOf(pre).find((f) => f.playerId === c.playerId);
  const isOwn = fa?.priorTeam === team;
  const v = validateSigning(before, y1, C, fa
    ? {
        isOwnFreeAgent: isOwn,
        yearsOfService: fa.yearsOfService,
        priorSalary: fa.lastSalary,
        birdStatus: isOwn ? fa.birdStatus : undefined,
      }
    : {});

  const after = engTeamSalary(leagueData(post), team, YEAR);
  const fs = feedStateOf(team);
  const checks: DocketCheck[] = [];
  const consequences: MoveConsequence[] = [];

  if (v.legal && v.mechanism) {
    checks.push({
      ok: true,
      text: `${team} can pay ${fmt(y1)} in year one — ${v.mechanism.label ?? v.mechanism.id}${
        isOwn && fa?.birdStatus ? ` (own free agent, ${fa.birdStatus.replace("_", "-")} rights)` : ""
      }`,
    });
  } else if (!v.legal) {
    checks.push({ ok: false, text: v.reason ?? "No mechanism on this team's books reaches this salary." });
  }
  checks.push({
    ok: true,
    text: `${team} moves from ${fmt(before)} (${tierLabel(before)}) to ${fmt(after)} (${tierLabel(after)})`,
  });

  // The rule implication that actually bites in August: a hard cap already on
  // the books, and whether this deal clears it.
  if (Number.isFinite(fs.hardCap)) {
    const room = fs.hardCap - after;
    checks.push({
      ok: room >= 0,
      text:
        room >= 0
          ? `Fits under the ${fmt(fs.hardCap)} hard cap${hardCapCause(fs.hardCapSource) ? ` from ${hardCapCause(fs.hardCapSource)}` : ""} with ${fmt(room)} to spare`
          : `${fmt(-room)} OVER the ${fmt(fs.hardCap)} hard cap${hardCapCause(fs.hardCapSource) ? ` from ${hardCapCause(fs.hardCapSource)}` : ""} — the deal is agreed, and something has to clear before it can be filed`,
    });
    if (room < 0) {
      consequences.push({
        team,
        severity: "cap",
        text: `${team} are ${fmt(-room)} over their own hard cap. The deal cannot be filed until they clear the room.`,
      });
      // What clears it, in one line. The sourcing and the arithmetic live in
      // feed-team-state.json where they belong; a reader wants the way out.
      if (fs.pendingRelief?.short)
        consequences.push({ team, severity: "note", text: fs.pendingRelief.short });
    }
  }

  // The verdict is the WHOLE receipt, not just the signing mechanism. Harden's
  // deal is textbook Bird rights and still cannot be filed, because the hard
  // cap his team took on the day before does not have room for it. A card that
  // stamped that "legal" while printing a red x underneath would be arguing
  // with itself.
  const legal = v.legal && checks.every((k) => k.ok);
  // Crossing a line is the story. DeRozan's minimum moved Denver from the first
  // apron to the second, which costs them aggregation, cash, every mid-level
  // and the freeze on a future first — none of which is visible in "$223.3M".
  // Only said when the signing is what crossed it.
  const beforeTier = classifyTier(before, C);
  const afterTier = classifyTier(after, C);
  if (afterTier !== beforeTier) {
    const crossed = tierConsequence(team, afterTier);
    if (crossed) consequences.push(crossed);
  }

  // The other side of a buyout. Klay Thompson's Miami deal is only half the
  // transaction — Dallas is carrying $7.66M of dead money for a player who is
  // now in the Eastern Conference, and the signing card is the only place that
  // pairing shows up.
  const waive = TRANSACTIONS.find(
    (x) =>
      x.type === "Release" &&
      normName(x.player) === normName(row.player) &&
      isoDate(x.date) <= iso &&
      isoDate(x.date) >= dayBefore(dayBefore(dayBefore(iso))),
  );
  if (waive) {
    const dead = BASE_CONTRACTS.find(
      (x) => x.deadMoney && normName(x.playerName) === normName(row.player),
    );
    const fromM = waive.detail.match(/(?:Waived|Released) by [^(]*\(([A-Za-z]{2,4})\)/i);
    const fromTeam = fromM && isTeam(fromM[1]!) ? std(fromM[1]!) : null;
    if (fromTeam && dead)
      consequences.push({
        team: fromTeam,
        severity: "cap",
        text: `${teamMeta(fromTeam).name} still carry ${fmt(currentSalaryOf(dead))} in dead money from the ${/buyout/i.test(waive.detail) ? "buyout" : "waive"}, against both their cap and their apron.`,
      });
  }

  const years = yearsM ? Number(yearsM[1]) : c.years.filter((y) => y.leagueYear >= YEAR).length;
  const total = Number(totalM[1]) * 1e6;
  return {
    id: `${iso}-sign-${normName(row.player).replace(/\s/g, "")}`,
    kind: "signing",
    date: iso,
    dateLabel: label(iso),
    headline: `${row.player} ${isOwn ? "re-signs with" : "signs with"} ${teamMeta(team).name}`,
    subhead: `${years} year${years === 1 ? "" : "s"} · ${fmt(total)} · ${fmt(y1)} in ${YEAR}`,
    teams: [team],
    legal,
    signing: { player: row.player, team, years, total, y1, mechanism: v.mechanism?.id },
    checks,
    consequences,
    winShifts: winShifts(pre, post, [team]),
    focusTeam: team,
  };
}

const fmt = (n: number) =>
  `$${(n / 1e6).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
const tierLabel = (salary: number) => classifyTier(salary, C).replace(/_/g, " ");

/* -------------------------------- rulings -------------------------------- */

const PICK_YEARS_WITH_TAIL = [2027, 2028, 2029, 2030, 2031, 2032, 2033] as const;

/** "2030, 2031, 2032 and 2033" */
const list = (xs: (string | number)[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/**
 * A league ruling, rendered the way a move is: the penalty as the league
 * stated it, and underneath it the one thing this site can add — the pick
 * ledger AFTER the penalty, read from the same data the trade board reads.
 * Which firsts are still there, which years are uncovered, and whether the
 * Stepien rule now stands between the team and its next pick trade are all
 * computed; nothing about the ledger is copied from a press release.
 */
export function buildRulingCard(r: LeagueRuling): NewsMove {
  const team = r.team;
  const name = teamMeta(team).name;
  const forfeits = r.penalties.filter(
    (p): p is Extract<RulingPenalty, { kind: "pick_forfeiture" }> => p.kind === "pick_forfeiture",
  );
  const checks: DocketCheck[] = [];
  const consequences: MoveConsequence[] = [];

  if (forfeits.length) {
    const firsts = forfeits.filter((f) => f.round === 1);
    checks.push({
      ok: true,
      text: `Forfeited: ${list(
        firsts.map((f) => (f.origin === team ? `the ${f.year} first` : `${teamPossessive(teamMeta(f.origin).name)} ${f.year} first`)),
      )}${firsts.some((f) => f.origin !== team) ? " — an acquired pick does not go back to the team that sent it" : ""}.`,
    });

    // The ledger, year by year, from the same encumbrance + holdings data the
    // board's pick chips use.
    const rows = PICK_YEARS_WITH_TAIL.map((y) => {
      const enc = firstEncumbranceOf(team, y);
      const acquired = (PICK_RIGHTS[team]?.holdings ?? [])
        .filter((h) => h.round === 1 && h.year === y && hasAcquiredFirst(team, y) && h.kind === "outright" && !h.forfeited && h.origin && h.origin !== team)
        .map((h) => h.origin!);
      const ownCovers = !enc || enc.status === "swap";
      return { y, enc, acquired, covered: ownCovers || acquired.length > 0 };
    });
    const kept = rows.flatMap((row) => {
      const out: string[] = [];
      if (!row.enc) out.push(`${row.y} own`);
      else if (row.enc.status === "swap") out.push(`${row.y} own (${row.enc.counterparty} holds a swap)`);
      for (const o of row.acquired) out.push(`${teamPossessive(teamMeta(o).name)} ${row.y}`);
      return out;
    });
    const owed = rows
      .filter((row) => row.enc && row.enc.status !== "swap" && row.enc.status !== "forfeited")
      .map((row) => `${row.y} to ${row.enc!.counterparty}`);
    checks.push({
      ok: true,
      text: `Firsts still on the ledger: ${kept.length ? list(kept) : "none"}${owed.length ? `. Already owed away: ${list(owed)}` : ""}.`,
    });

    const uncovered = rows.filter((row) => !row.covered).map((row) => row.y);
    const violates = violatesStepien(uncovered);
    // Which acquired firsts are load-bearing: remove one and Stepien fails.
    const loadBearing = rows
      .filter((row) => row.covered && row.enc && row.enc.status !== "swap" && row.acquired.length === 1)
      .filter((row) => violatesStepien([...uncovered, row.y]))
      .map((row) => `${teamPossessive(teamMeta(row.acquired[0]!).name)} ${row.y}`);
    checks.push({
      ok: true,
      text: violates
        ? `Years without a first: ${list(uncovered)} — consecutive drafts already uncovered, so under the Stepien rule as this site applies it ${name} cannot trade a first until a covered year is restored.`
        : `Years without a first: ${list(uncovered)} — never two in a row, so the Stepien rule still lets ${name} trade a first${
            loadBearing.length ? `. ${list(loadBearing)} ${loadBearing.length === 1 ? "is" : "are"} what keeps it that way: trading ${loadBearing.length === 1 ? "it" : "either"} would leave consecutive drafts uncovered` : ""
          }.`,
    });
    if (!loadBearing.length && !violates && uncovered.length)
      consequences.push({ team, severity: "note", text: `Forfeited years count as uncovered here — the conservative read; the league has not said a forfeited year is exempt from the Stepien test.` });
    else if (loadBearing.length)
      consequences.push({
        team,
        severity: "restrict",
        text: `${list(loadBearing)} ${loadBearing.length === 1 ? "is" : "are"} locked in practice: the board will block any trade that sends ${loadBearing.length === 1 ? "it" : "one"} out. Forfeited years count as uncovered — the conservative read, since the league has not said otherwise.`,
      });
  }
  checks.push({
    ok: true,
    text: `No cap-sheet change for ${name}: a fine is not team salary, and the suspensions sit outside the CBA's cap machinery.`,
  });

  for (const p of r.penalties) {
    if (p.kind === "pick_forfeiture") continue;
    consequences.push({
      team,
      severity: p.kind === "fine" ? "cap" : p.kind === "suspension" ? "restrict" : "note",
      text: p.text,
    });
  }

  const fine = r.penalties.find((p): p is Extract<RulingPenalty, { kind: "fine" }> => p.kind === "fine");
  const suspended = r.penalties.filter((p): p is Extract<RulingPenalty, { kind: "suspension" }> => p.kind === "suspension");
  const years = forfeits.map((f) => f.year).sort((a, b) => a - b);
  const subhead = [
    forfeits.length
      ? `${forfeits.length} first${forfeits.length === 1 ? "" : "s"}${years.length > 1 ? `, ${years[0]}–${years[years.length - 1]}` : years.length ? `, ${years[0]}` : ""}`
      : null,
    fine ? `${fmt(fine.amount)} fine` : null,
    suspended.length ? `${list(suspended.map((s) => s.person.split(" ").slice(-1)[0]!))} suspended` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const others = [...new Set(forfeits.map((f) => f.origin).filter((o) => o !== team))];

  return {
    id: r.id,
    kind: "ruling",
    date: r.date,
    dateLabel: label(r.date),
    headline: r.headline,
    subhead,
    teams: [team, ...others],
    legal: true,
    ruling: {
      summary: r.summary,
      findings: r.findings,
      penalties: r.penalties.map((p) => ({ kind: p.kind, text: p.text })),
      sources: r.sources.map((s) => ({ outlet: s.outlet, url: s.url, note: s.note })),
    },
    checks,
    consequences,
    winShifts: [],
    focusTeam: team,
  };
}

/* -------------------------------- the day -------------------------------- */

/** Rows worth leading with: real trades and contracts with dollar terms. */
function significant(t: Transaction): boolean {
  if (t.type === "Trade") return true;
  if (t.type !== "Signing" && t.type !== "Re-sign") return false;
  if (/Two-Way|Exhibit|as head coach|as an assistant/i.test(t.detail)) return false;
  if (/via Offer Sheet/i.test(t.detail) && /right to match/i.test(t.detail)) return false;
  return /\$\s*[\d.]+\s*million/i.test(t.detail);
}

/**
 * The newest day the feed did something worth reading, with every move on it.
 *
 * Cached at module scope: it is pure over data that only changes on a rebuild,
 * and the trade replay is not free.
 *
 * NEVER THROWS. This runs in the root layout, so an unhandled parse error here
 * would 500 every page on the site — the trade machine, the cap sheets, all of
 * it — because a wire feed changed a word. The news is the least important
 * thing on the page and it does not get to take the rest down: on any failure
 * the strip simply does not render, and the reason goes to the server log where
 * the next data refresh will surface it.
 */
let cached: NewsDay | null | undefined;
export function latestNewsDay(): NewsDay | null {
  if (cached !== undefined) return cached;
  try {
    cached = compute();
  } catch (err) {
    console.error("[newsDay] could not build the news card; hiding it:", err);
    cached = null;
  }
  return cached;
}

function compute(): NewsDay | null {
  const dated = TRANSACTIONS.map((t) => ({ t, iso: isoDate(t.date) })).filter((x) => x.iso && significant(x.t));
  // League rulings are news days too — never stamped ahead of the roster data.
  const rulings = LEAGUE_RULINGS.filter((r) => r.date <= DATA_AS_OF);
  if (!dated.length && !rulings.length) return null;
  const days = [...new Set([...dated.map((x) => x.iso), ...rulings.map((r) => r.date)])].sort().reverse();

  // The newest day the feed moved, plus earlier move-days behind it while the
  // story is still thin, bounded to a week. An offseason breaks in clusters and
  // the pieces explain each other — the Harden signing is only legible next to
  // the sign-and-trade that hard-capped Cleveland the day before — but late
  // August goes quiet for days at a time, and an earlier version of this walk
  // required CONSECUTIVE dates. One empty Monday and the card fell back to a
  // single two-way signing while a Klay Thompson buyout sat two days behind it.
  // Days without moves are skipped; the LOOKBACK is what stops this becoming a
  // rolling digest.
  const LOOKBACK_DAYS = 6;
  const oldest = new Date(`${days[0]!}T12:00:00Z`);
  oldest.setUTCDate(oldest.getUTCDate() - LOOKBACK_DAYS);
  const floor = oldest.toISOString().slice(0, 10);
  const window: string[] = [days[0]!];
  for (let i = 1; i < days.length; i++) {
    if (countMoves(window) >= 3) break;
    if (days[i]! < floor) break;
    window.push(days[i]!);
  }
  const rows = dated.filter((x) => window.includes(x.iso)).map((x) => x.t);
  const iso = window[0]!;

  // Per-move isolation: one deal the prose cannot express must not cost the
  // reader the others that parsed cleanly.
  const moves: NewsMove[] = [];
  for (const r of rulings) {
    if (!window.includes(r.date)) continue;
    const m = attempt(() => buildRulingCard(r), `ruling ${r.id}`);
    if (m) moves.push(m);
  }
  for (const [key, g] of tradeGroups(rows)) {
    const m = attempt(() => buildTrade(g, key.split("|")[0]!), `trade ${key}`);
    if (m) moves.push(m);
  }
  // A sign-and-trade's signing row is already told by the trade card.
  const inTrades = new Set(moves.flatMap((m) => m.docket ?? []).flatMap((d) => [...d.gets, ...d.sends]).map((l) => normName(l.label)));
  // The feed reports a deal twice — "Agreed to…" when it breaks and "Signed a…"
  // when it is filed — and both can land inside the window. That is one piece
  // of news, and the newest row is the one that is true. TRANSACTIONS is
  // newest-first, so the first row per player wins.
  const toldSigning = new Set<string>();
  for (const r of rows) {
    if (r.type === "Trade") continue;
    const k = normName(r.player);
    if (/Sign-and-Trade/i.test(r.detail) || inTrades.has(k) || toldSigning.has(k)) continue;
    toldSigning.add(k);
    const m = attempt(() => buildSigning(r, isoDate(r.date)), `signing ${r.player}`);
    if (m) moves.push(m);
  }
  if (!moves.length) return null;
  // Newest first; on the same day a league ruling leads, then the biggest
  // projection swing — that is what makes one of them the lede.
  const lede = (m: NewsMove) => (m.kind === "ruling" ? 1 : 0);
  moves.sort((a, b) =>
    a.date === b.date ? lede(b) - lede(a) || swing(b) - swing(a) : b.date.localeCompare(a.date),
  );
  return { date: iso, dateLabel: label(iso), moves };
}

/**
 * One deal per date + set of teams: a five-teamer's seven rows are one move,
 * not seven, and two unrelated same-day trades stay separate. Used both to
 * size a candidate window and to build it, so the two can never disagree.
 */
export function tradeGroups(rows: readonly Transaction[]): Map<string, Transaction[]> {
  // Bucket by the SET OF TEAMS in the prose. That is the deal's fingerprint:
  // a five-team set belongs to one transaction, and the two-team CLE/CHA swap
  // that moved Schröder in August is a different set from the five-teamer that
  // moved him again.
  const byTeams = new Map<string, Transaction[]>();
  for (const r of rows) {
    if (r.type !== "Trade") continue;
    const codes = [...r.detail.matchAll(/\(([A-Za-z]{2,4})\)/g)]
      .map((m) => std(m[1]!))
      .filter((c) => TEAM_IDS.includes(c));
    const key = [...new Set(codes)].sort().join("-");
    byTeams.set(key, [...(byTeams.get(key) ?? []), r]);
  }

  // A deal is reported over DAYS, not on one. Spotrac files the five-teamer
  // under Aug 19, then republishes most of its legs under Aug 20 — leaving
  // Whitmore and Strus on the older date and everyone else on the newer one.
  // Keyed on the date, that is two cards for one transaction. So within a team
  // set, rows stay together until there is a real gap between them; the same
  // two clubs trading again weeks later starts a new deal.
  const MAX_GAP_DAYS = 2;
  const out = new Map<string, Transaction[]>();
  for (const [teams, group] of byTeams) {
    const sorted = [...group].sort((a, b) => isoDate(a.date).localeCompare(isoDate(b.date)));
    let deal: Transaction[] = [];
    const flush = () => {
      if (!deal.length) return;
      const newest = deal.reduce((m, r) => (isoDate(r.date) > m ? isoDate(r.date) : m), "");
      out.set(`${newest}|${teams}`, deal);
      deal = [];
    };
    for (const r of sorted) {
      const prev = deal.length ? isoDate(deal[deal.length - 1]!.date) : null;
      if (prev && daysBetween(prev, isoDate(r.date)) > MAX_GAP_DAYS) flush();
      deal.push(r);
    }
    flush();
  }
  return out;
}

/** How many cards a candidate window would yield, without building them. */
function countMoves(window: string[]): number {
  const rows = TRANSACTIONS.filter((t) => window.includes(isoDate(t.date)) && significant(t));
  const signings = new Set(rows.filter((r) => r.type !== "Trade").map((r) => normName(r.player)));
  const rulings = LEAGUE_RULINGS.filter((r) => window.includes(r.date)).length;
  return tradeGroups(rows).size + signings.size + rulings;
}

function attempt<T>(fn: () => T | null, what: string): T | null {
  try {
    return fn();
  } catch (err) {
    console.error(`[newsDay] skipped ${what}:`, err);
    return null;
  }
}

/** What the strip needs, without shipping the rulings twice. */
export function newsSummary(): {
  id: string;
  headline: string;
  dateLabel: string;
  teams: string[];
  more: number;
} | null {
  const day = latestNewsDay();
  if (!day) return null;
  const lead = day.moves[0]!;
  return {
    id: `${day.date}:${day.moves.length}`,
    headline: lead.headline,
    dateLabel: lead.dateLabel,
    teams: lead.teams,
    more: day.moves.length - 1,
  };
}

const swing = (m: NewsMove) =>
  Math.max(0, ...m.winShifts.map((w) => Math.abs(w.afterWins - w.beforeWins)));
