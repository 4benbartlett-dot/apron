import type { Transaction } from "@apron/data";

/**
 * The desk files a move the way the feed would have reported it — as a row of
 * Spotrac-shaped prose — because that is the one input the whole pipeline
 * already understands. applyTrades moves a player on "Traded to X (X) from Y
 * (Y)"; applySignings books "Signed a N year $T million contract with X (X)";
 * applyReleases and the stated-dead-cap pass read "Waived by X (X) … leaves
 * behind $G million in dead cap"; the news card's parseLegs reads the clause
 * ledger after "as part of an N-team trade:". Every builder here is round-trip
 * tested against those parsers, so a filed move cannot drift from a scraped
 * one. Pure: no I/O.
 */

export interface TeamNamer {
  /** "Minnesota" for MIN — the feed prints the city, then the code. */
  (code: string): string;
}

export interface FiledPlayer {
  playerId: string;
  name: string;
  pos: string;
  from: string;
  to: string;
}

export interface FiledPick {
  /** `ORIGIN|YEAR|ROUND`. */
  id: string;
  from: string;
  to: string;
  /** e.g. "top-4 protected" — printed in brackets, as the feed does. */
  protection?: string;
}

export interface FiledCash {
  from: string;
  to: string;
  amount: number;
}

export interface TradeFiling {
  date: string;
  players: FiledPlayer[];
  picks: FiledPick[];
  cash: FiledCash[];
  why: string;
}

/** "Sep 02, 2026" from an ISO date — the feed's own shape. */
export function feedDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(m ?? 1) - 1];
  return `${mon} ${String(d ?? 1).padStart(2, "0")}, ${y}`;
}

/** "$16.5 million" → "16.5"; whole dollars print without a decimal tail. */
export function millions(n: number): string {
  const m = n / 1e6;
  return Number.isInteger(m) ? String(m) : m.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function pickAssetText(p: FiledPick): string {
  const [, year, round] = p.id.split("|");
  return `a ${year} ${round === "1" ? "1st" : "2nd"} round pick [${p.protection ?? "unprotected"}]`;
}

/** Every "A traded … to B" clause the ledger needs, one per ordered pair that
 * actually moves something. */
export function tradeClauses(f: TradeFiling, nameOf: TeamNamer): string[] {
  const legs = new Map<string, string[]>();
  const add = (from: string, to: string, asset: string) => {
    const k = `${from}>${to}`;
    legs.set(k, [...(legs.get(k) ?? []), asset]);
  };
  for (const p of f.players) add(p.from, p.to, p.name);
  for (const p of f.picks) add(p.from, p.to, pickAssetText(p));
  for (const c of f.cash) add(c.from, c.to, `cash ($${Math.round(c.amount).toLocaleString("en-US")})`);
  return [...legs.entries()].map(([k, assets]) => {
    const [from, to] = k.split(">") as [string, string];
    const list = assets.length <= 1 ? assets.join("") : `${assets.slice(0, -1).join(", ")} and ${assets[assets.length - 1]}`;
    return `${nameOf(from)} (${from}) traded ${list} to ${nameOf(to)} (${to})`;
  });
}

export function tradeTeams(f: TradeFiling): string[] {
  return [...new Set([...f.players.flatMap((p) => [p.from, p.to]), ...f.picks.flatMap((p) => [p.from, p.to]), ...f.cash.flatMap((c) => [c.from, c.to])])].sort();
}

/** One feed row per player moving, each carrying the whole clause ledger. */
export function tradeRows(f: TradeFiling, nameOf: TeamNamer): Transaction[] {
  const teams = tradeTeams(f);
  const ledger = tradeClauses(f, nameOf).join("; ");
  const date = feedDate(f.date);
  return f.players.map((p) => ({
    player: p.name,
    pos: p.pos,
    date,
    type: "Trade",
    detail: `Traded to ${nameOf(p.to)} (${p.to}) from ${nameOf(p.from)} (${p.from}) as part of a ${teams.length}-team trade: ${ledger}`,
    why: f.why,
  }));
}

export type SigningMechanism = "bird" | "cap_room" | "ntmle" | "tpmle" | "room_mle" | "bae" | "minimum";

export const MECHANISM_TEXT: Record<SigningMechanism, string> = {
  bird: "Bird Rights",
  cap_room: "Cap Space",
  ntmle: "Non-Taxpayer Mid-Level Exception",
  tpmle: "Taxpayer Mid-Level Exception",
  room_mle: "Room Mid-Level Exception",
  bae: "Bi-Annual Exception",
  minimum: "Minimum Salary Exception",
};

export interface SigningFiling {
  date: string;
  player: { name: string; pos: string };
  team: string;
  years: number;
  /** Total over the term, in dollars — what the feed prints. */
  total: number;
  mechanism?: SigningMechanism;
  /** True for a re-signing ("Re-Signed" in the feed). */
  reSign?: boolean;
  /** e.g. "2027-28 Player Option". */
  option?: string;
  why: string;
}

export function signingRow(f: SigningFiling, nameOf: TeamNamer): Transaction {
  const verb = f.reSign ? "Re-Signed to" : "Signed";
  const tail = [
    f.mechanism ? ` via ${MECHANISM_TEXT[f.mechanism]}` : "",
    f.option ? ` - includes ${f.option}` : "",
  ].join("");
  return {
    player: f.player.name,
    pos: f.player.pos,
    date: feedDate(f.date),
    type: f.reSign ? "Re-sign" : "Signing",
    detail: `${verb} a ${f.years} year $${millions(f.total)} million contract with ${nameOf(f.team)} (${f.team})${tail}`,
    why: f.why,
  };
}

export interface WaiveFiling {
  date: string;
  player: { name: string; pos: string };
  team: string;
  /** Guaranteed remainder that becomes dead money, in dollars (0 for a clean cut). */
  guaranteed: number;
  stretch?: boolean;
  why: string;
}

export function waiveRow(f: WaiveFiling, nameOf: TeamNamer): Transaction {
  return {
    player: f.player.name,
    pos: f.player.pos,
    date: feedDate(f.date),
    type: "Release",
    detail: `Waived by ${nameOf(f.team)} (${f.team})${f.stretch ? " via Stretch Provision" : ""} - leaves behind $${millions(f.guaranteed)} million in dead cap`,
    why: f.why,
  };
}

export interface OptionFiling {
  date: string;
  player: { name: string; pos: string };
  team: string;
  season: string;
  kind: "player" | "team";
  decision: "exercised" | "declined";
  why: string;
}

/** "declined … 2026-27" is what OPTION_DECLINED keys on. */
export function optionRow(f: OptionFiling, nameOf: TeamNamer): Transaction {
  const who = f.kind === "player" ? f.player.name : `${nameOf(f.team)} (${f.team})`;
  return {
    player: f.player.name,
    pos: f.player.pos,
    date: feedDate(f.date),
    type: "Option",
    detail: `${who} ${f.decision} ${f.kind === "player" ? "his" : "the"} ${f.season} ${f.kind === "player" ? "Player" : "Team"} Option${f.kind === "player" ? ` with ${nameOf(f.team)} (${f.team})` : ""}`,
    why: f.why,
  };
}

export interface StatedSalaryFiling {
  date: string;
  player: { name: string; pos: string };
  team: string;
  /** The exact 2026-27 cap hit, in dollars. */
  salary: number;
  why: string;
}

/** "fully guaranteed $X million salary for 2026-27" — the STATED_SALARY pass
 * takes this figure over anything back-solved from a term and total. */
export function statedSalaryRow(f: StatedSalaryFiling, nameOf: TeamNamer): Transaction {
  return {
    player: f.player.name,
    pos: f.player.pos,
    date: feedDate(f.date),
    type: "Other",
    detail: `${nameOf(f.team)} (${f.team}) fully guaranteed $${millions(f.salary)} million salary for 2026-27`,
    why: f.why,
  };
}

export interface ExtensionFiling {
  date: string;
  player: { name: string; pos: string };
  team: string;
  years: number;
  total: number;
  why: string;
}

/** Informational: the years themselves are written onto the contract row. */
export function extensionRow(f: ExtensionFiling, nameOf: TeamNamer): Transaction {
  return {
    player: f.player.name,
    pos: f.player.pos,
    date: feedDate(f.date),
    type: "Extension",
    detail: `Signed a ${f.years} year $${millions(f.total)} million extension with ${nameOf(f.team)} (${f.team})`,
    why: f.why,
  };
}
