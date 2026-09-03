import type { Contract } from "@apron/cba-engine";
import { TRANSACTIONS, getLeagueData } from "@apron/data";
import { YEAR, normName } from "@/lib/league";

// ---------------------------------------------------------------------------
// REWIND — put a team's sheet back the way it looked on a given day.
//
// The replay tests validate real moves against BASE_CONTRACTS, which is always
// TODAY's roster. That is fine for a move whose legality does not depend on
// what came after it, and wrong for every move that does. Two have already
// broken this way on a routine data refresh:
//
//   Jul 28  the Clippers absorbed Johni Broome into CAP ROOM. Beal's Aug 13
//           deal put them $4.6M over the cap, so the replay read illegal for a
//           reason that did not exist on Jul 28.
//   Aug 14  Cleveland sent cash to Charlotte, legal only under the second
//           apron. Watson and Harden pushed them over it five days later.
//
// Both were patched by naming the later players by hand, which lasts exactly
// until the next signing. This walks the feed instead: undo every move dated
// after `iso` that touches one of `teams`, newest first, so a player traded or
// signed twice unwinds in order. It cannot recover the renounces and spent
// exceptions the sheet never recorded — that is what the DOCUMENTED_BOUNDS
// lists are for — but roster and salary go back to where they were.
// ---------------------------------------------------------------------------

export { feedIso as isoDate } from "@/lib/feedDate";
import { feedIso as isoDate } from "@/lib/feedDate";

const stdTeam = (code: string) => (code.toUpperCase() === "LA" ? "LAC" : code.toUpperCase());

/** The team a player landed on, from a Signing/Re-sign row's prose. */
const signedWith = (detail: string) => {
  const m = detail.match(/with\s+[A-Za-z0-9 .'&-]+\(([A-Za-z]{2,4})\)/);
  return m ? stdTeam(m[1]!) : null;
};

/** Both ends of a Trade row: where he went and where he came from. */
const tradeEnds = (detail: string) => {
  const to = detail.match(/Traded to [^(]*\(([A-Za-z]{2,4})\)/);
  const from = detail.match(/from [^(]*\(([A-Za-z]{2,4})\)/);
  return to && from ? { to: stdTeam(to[1]!), from: stdTeam(from[1]!) } : null;
};

/**
 * `contracts` as of the end of `iso`, for the given teams. Anything the feed
 * did later — to those teams — is undone: a signing loses its 2026-27 years and
 * goes back to the player's pre-offseason team, a trade sends him back where he
 * came from. Other teams are left alone, so the rewind stays local to the deal
 * under test rather than rebuilding the whole league.
 */
export function rewind(contracts: Contract[], iso: string, teams: string[]): Contract[] {
  const base = getLeagueData().contracts;
  const priorTeam = new Map(base.map((c) => [normName(c.playerName), c.teamId] as const));
  const baseRow = new Map(base.map((c) => [normName(c.playerName), c] as const));
  const scope = new Set(teams);
  let out = contracts.map((c) => ({ ...c, years: c.years.map((y) => ({ ...y })) }));

  // Waives after `iso` are undone too. applyReleases turns a waived player's
  // row into his dead-money charge on the team that cut him; before the cut
  // that charge did not exist, and he was live on that team at his real
  // salary. Konchar went Utah → Minnesota on Aug 29 and was waived and
  // stretched on Aug 30; a rewind to Aug 25 left his $2,055,000 dead on
  // Minnesota's books while he was still a Jazzman, and read the Kuminga
  // signing as $2.0M over a hard cap that, on our sheet, it cleared. The
  // restored row carries the base sheet's seasons and the dead row's team —
  // the team he was on when cut — so the trade unwind below can walk him back.
  const releasedAfter = new Set<string>();
  for (const t of TRANSACTIONS) {
    if (t.type !== "Release" && !/contract was terminated/i.test(t.detail)) continue;
    const d = isoDate(t.date);
    if (d && d > iso) releasedAfter.add(normName(t.player));
  }
  const liveNames = new Set(out.filter((c) => !c.deadMoney).map((c) => normName(c.playerName)));
  out = out.flatMap((c) => {
    if (!c.deadMoney) return [c];
    const k = normName(c.playerName);
    if (!releasedAfter.has(k) || !scope.has(c.teamId)) return [c];
    // Re-signed elsewhere since (the DeRozan shape): his live row unwinds on
    // its own; the old team's charge simply did not exist yet.
    if (liveNames.has(k)) return [];
    const b = baseRow.get(k);
    if (!b) return [];
    return [{ ...b, years: b.years.map((y) => ({ ...y })), teamId: c.teamId }];
  });

  const byName = new Map<string, Contract>();
  for (const c of out) {
    const k = normName(c.playerName);
    if (!c.deadMoney && !byName.has(k)) byName.set(k, c);
  }

  // TRANSACTIONS is newest-first, which is the order an unwind has to run in:
  // a player who moved twice comes off the later move before the earlier one.
  for (const t of TRANSACTIONS) {
    const d = isoDate(t.date);
    if (!d || d <= iso) continue;
    const k = normName(t.player);
    const c = byName.get(k);
    if (!c) continue;
    if (t.type === "Trade") {
      const ends = tradeEnds(t.detail);
      if (!ends || (!scope.has(ends.to) && !scope.has(ends.from))) continue;
      if (c.teamId === ends.to) c.teamId = ends.from;
    } else if (t.type === "Signing" || t.type === "Re-sign") {
      const team = signedWith(t.detail);
      if (!team || !scope.has(team) || c.teamId !== team) continue;
      c.teamId = priorTeam.get(k) ?? c.teamId;
      c.years = c.years.filter((y) => y.leagueYear < YEAR);
    }
  }
  return out;
}
