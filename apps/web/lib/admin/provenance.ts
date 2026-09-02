import { EXTRA_CONTRACTS, ROOKIES_2026, SIGNINGS, TRANSACTIONS, getLeagueData, type SchemaId } from "@apron/data";
import type { Contract } from "@apron/cba-engine";
import { normName, TRADES_APPLIED, SIGNINGS_APPLIED, YEAR } from "@/lib/league";

/**
 * Where a row on the reconciled 2026-27 sheet actually comes from, and which
 * passes of lib/league.ts rewrote it on the way. The sheet a page shows is
 * DERIVED (base contracts, then the feeds) so an edit has to land in the file
 * that governs the field, or it changes nothing: a 2026-27 salary booked from
 * Spotrac's signed page is rebuilt from that page's term and total no matter
 * what the base row says.
 */
export interface Provenance {
  /** The raw file holding this player's row, if any. */
  source: { id: SchemaId; file: string; index: number } | null;
  /** Plain-language notes, in pipeline order. */
  notes: string[];
  /** Which pass owns the 2026-27 cap hit that shows on the site. */
  currentYearGoverned: "base" | "signed-feed" | "transactions-feed" | "stated" | "release" | "rookie" | "derived";
}

const rawSheet = getLeagueData().contracts;

export function provenanceOf(c: Contract): Provenance {
  const k = normName(c.playerName);
  const notes: string[] = [];
  let source: Provenance["source"] = null;

  const i = rawSheet.findIndex((r) => r.playerId === c.playerId || normName(r.playerName) === k);
  if (i >= 0) source = { id: "contracts", file: "contracts-2025-26.json", index: i };
  else {
    const j = EXTRA_CONTRACTS.findIndex((r) => r.playerId === c.playerId || normName(r.playerName) === k);
    if (j >= 0) source = { id: "extraContracts", file: "extra-contracts.json", index: j };
    else {
      const r = ROOKIES_2026.findIndex((x) => x.playerId === c.playerId || normName(x.playerName) === k);
      if (r >= 0) source = { id: "rookies", file: "rookies-2026.json", index: r };
    }
  }
  if (!source) notes.push("No raw row: this line is synthesized by the pipeline (a stated dead-cap charge or a returning-veteran stub).");

  let governed: Provenance["currentYearGoverned"] = source?.id === "rookies" ? "rookie" : source ? "base" : "derived";

  const traded = TRADES_APPLIED.filter((s) => normName(s.split(" → ")[0]!) === k);
  for (const t of traded) notes.push(`Moved by the transactions feed: ${t}.`);

  const signedVia = SIGNINGS_APPLIED.filter((s) => normName(s.split(" → ")[0]!) === k);
  if (signedVia.length) {
    const s = SIGNINGS[k];
    if (s) {
      notes.push(
        `2026-27 deal rebuilt from Spotrac's signed page: ${s.years} yr / $${(s.total / 1e6).toFixed(2)}M (${s.status}). Year one is back-solved from the raise rate, so editing the base row's 2026-27 salary changes nothing on the site.`,
      );
      governed = "signed-feed";
    } else {
      notes.push(`2026-27 deal booked from the transactions feed's prose (${signedVia[0]}).`);
      governed = "transactions-feed";
    }
  }

  const stated = TRANSACTIONS.find(
    (t) => normName(t.player) === k && /fully guaranteed \$[\d.]+\s*(million|k)\b[^.]*for 2026-27/i.test(t.detail),
  );
  if (stated) {
    notes.push(`2026-27 cap hit is STATED by a feed row (${stated.date}: "${stated.detail}"). That figure wins over anything back-solved.`);
    governed = "stated";
  }

  if (c.deadMoney) {
    const flat = c.years.length > 1 && new Set(c.years.map((y) => y.salary)).size === 1;
    notes.push(`Dead money: a waive converted the guaranteed remainder into this charge${flat ? " (stretched)" : ""}.`);
    governed = "release";
  }
  if (c.restriction) notes.push(`Trade-restricted: ${c.restriction}.`);
  if (c.signedUsing === "Two-Way" || c.twoWay) notes.push("Two-way contract: no cap salary.");
  const cur = c.years.find((y) => y.leagueYear === YEAR);
  if (cur && cur.salary > 0 && c.years.filter((y) => y.leagueYear >= YEAR).length === 1)
    notes.push("One-year deal: if it is a veteran minimum, the cap hit is deemed at the two-year minimum (Art. VII §3(f)).");

  return { source, notes, currentYearGoverned: governed };
}
