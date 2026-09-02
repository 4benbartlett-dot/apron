import { PICK_FORFEITURES, type TeamPickRights, type PickHolding, type OwnFirstObligation, type PickForfeiture } from "@apron/data";

/**
 * Pick ownership lives in pick-rights-2026.json, not in the feed prose: the
 * board's chips, the Stepien check and the team pages all read PICK_RIGHTS. A
 * filed trade that moves a pick therefore has to move it here too, or the
 * transactions page would say one thing and the board another.
 */
export interface PickTransfer {
  /** `ORIGIN|YEAR|ROUND`. */
  id: string;
  from: string;
  to: string;
  protection?: string;
  note: string;
  source: string;
}

export function parsePickId(id: string): { origin: string; year: number; round: 1 | 2 } {
  const [origin, y, r] = id.split("|");
  const year = Number(y);
  const round = r === "1" ? 1 : r === "2" ? 2 : 0;
  if (!origin || !Number.isInteger(year) || !round) throw new Error(`bad pick id ${id}`);
  return { origin, year, round: round as 1 | 2 };
}

const byYear = <T extends { year: number; round?: number }>(a: T, b: T) => a.year - b.year || (a.round ?? 0) - (b.round ?? 0);

/** Apply one transfer to a deep copy of the byTeam map and return it.
 * `forfeitures` is the league's overlay (league-rulings.json): the RAW ledger
 * on disk knows nothing about a pick the league took, so the guard has to
 * be asked separately — a forfeited pick is nobody's to trade. */
export function applyPickTransfer(
  byTeam: Record<string, TeamPickRights>,
  t: PickTransfer,
  forfeitures: readonly PickForfeiture[] = PICK_FORFEITURES,
): Record<string, TeamPickRights> {
  const { origin, year, round } = parsePickId(t.id);
  const taken = forfeitures.find((f) => f.origin === origin && f.year === year && f.round === round);
  if (taken)
    throw new Error(
      `${origin}'s ${year} ${round === 1 ? "first" : "second"} was forfeited to the league by ${taken.team} (${taken.date}) — there is nothing to trade.`,
    );
  const out: Record<string, TeamPickRights> = {};
  for (const [team, r] of Object.entries(byTeam))
    out[team] = { ownFirstObligations: r.ownFirstObligations.map((o) => ({ ...o })), holdings: r.holdings.map((h) => ({ ...h })) };
  const team = (code: string) => (out[code] ??= { ownFirstObligations: [], holdings: [] });

  if (origin === t.from) {
    // The sender's own pick leaves. Only firsts have a structured own-pick
    // slot; a second lives on the receiver's side alone.
    if (round === 1) {
      const existing = team(t.from).ownFirstObligations.find((o) => o.year === year && (o.status === "owed" || o.status === "protected"));
      if (existing) throw new Error(`${t.from}'s ${year} first is already ${existing.status}${existing.to ? ` to ${existing.to}` : ""}.`);
      if (team(t.from).ownFirstObligations.some((o) => o.year === year && o.status === "forfeited"))
        throw new Error(`${t.from}'s ${year} first was forfeited to the league — there is nothing to trade.`);
      const o: OwnFirstObligation = {
        year,
        status: t.protection ? "protected" : "owed",
        to: t.to,
        ...(t.protection ? { protection: t.protection } : {}),
        note: t.note,
        source: t.source,
      };
      team(t.from).ownFirstObligations.push(o);
      team(t.from).ownFirstObligations.sort(byYear);
    }
  } else {
    // An acquired pick re-traded: it leaves the sender's holdings…
    const holdings = team(t.from).holdings;
    const i = holdings.findIndex((h) => h.kind === "outright" && h.origin === origin && h.year === year && h.round === round && !h.forfeited);
    if (i < 0) throw new Error(`${t.from} does not hold ${origin}'s ${year} ${round === 1 ? "first" : "second"} outright.`);
    holdings.splice(i, 1);
    // …and the origin team's obligation now runs to the new holder.
    if (round === 1) {
      const o = out[origin]?.ownFirstObligations.find((x) => x.year === year && x.to === t.from && (x.status === "owed" || x.status === "protected"));
      if (o) o.to = t.to;
    }
  }

  const h: PickHolding = {
    year,
    round,
    kind: "outright",
    origin,
    ...(t.protection ? { protection: t.protection } : {}),
    note: t.note,
    source: t.source,
  };
  team(t.to).holdings.push(h);
  team(t.to).holdings.sort(byYear);
  return out;
}

/** Firsts and seconds a team can put in a trade today, from the ledger alone:
 * its own unencumbered picks plus outright holdings, inside the tradeable window. */
export function tradeablePicks(byTeam: Record<string, TeamPickRights>, team: string, years: readonly number[]): { id: string; label: string }[] {
  const r = byTeam[team] ?? { ownFirstObligations: [], holdings: [] };
  const out: { id: string; label: string }[] = [];
  for (const y of years) {
    const enc = r.ownFirstObligations.find((o) => o.year === y && o.status !== "swap");
    if (!enc) out.push({ id: `${team}|${y}|1`, label: `${y} 1st` });
    out.push({ id: `${team}|${y}|2`, label: `${y} 2nd` });
  }
  for (const h of r.holdings) {
    if (h.kind !== "outright" || h.forfeited || h.overlapsPrior || !h.origin || !/^[A-Z]{3}$/.test(h.origin)) continue;
    if (!years.includes(h.year)) continue;
    out.push({ id: `${h.origin}|${h.year}|${h.round}`, label: `${h.origin} ${h.year} ${h.round === 1 ? "1st" : "2nd"}${h.protection ? ` (${h.protection})` : ""}` });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
