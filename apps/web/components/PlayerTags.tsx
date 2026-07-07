"use client";

import type { Contract } from "@apron/cba-engine";
import { impactScoreOf, positionOf, impactComponents } from "@/lib/league";
import { Term } from "@/components/Term";

/** Position colours — cool→warm across the backcourt-to-frontcourt spectrum. */
const POS_COLOR: Record<string, string> = {
  PG: "var(--tier-below_cap)",
  SG: "var(--tier-over_cap)",
  SF: "var(--tier-taxpayer)",
  PF: "var(--tier-first_apron)",
  C: "var(--tier-second_apron)",
};

export function PosBadge({ playerId, className = "" }: { playerId: string; className?: string }) {
  const pos = positionOf(playerId);
  const col = pos ? POS_COLOR[pos] ?? "var(--muted)" : "var(--muted)";
  return (
    <span
      className={`tabular inline-block shrink-0 rounded-[3px] px-1 text-center text-[9px] font-bold ${className}`}
      style={{ minWidth: 20, color: col, background: `color-mix(in srgb, ${col} 15%, transparent)` }}
      title={pos ? `Position: ${pos}` : "Position unknown"}
    >
      {pos ?? "—"}
    </span>
  );
}

/** Apron Value colour ladder (50-centered: 50 = replacement, ~97 = best). */
function impactColor(v: number): string {
  if (v >= 75) return "var(--tier-below_cap)";
  if (v >= 60) return "var(--tier-over_cap)";
  if (v >= 50) return "var(--tier-taxpayer)";
  if (v >= 42) return "var(--muted)";
  return "var(--tier-second_apron)";
}

const sign = (n: number, d = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}`;

/** Player APRON VALUE pill (0-100, 50 = replacement, ~97 = league best). */
export function ImpactPill({ c }: { c?: Contract }) {
  if (!c) return null;
  const v = impactScoreOf(c);
  const col = impactColor(v);
  const comp = impactComponents(c);
  const prov =
    comp.source === "hybrid"
      ? ` Built from box score + real on-court impact (3-yr RAPM${comp.rapmp != null ? ` ${sign(comp.rapmp)}/100` : ""}${comp.bpm != null ? `, box BPM ${sign(comp.bpm, 0)}` : ""}).`
      : comp.source === "box"
        ? ` Box-based estimate${comp.bpm != null ? ` (BPM ${sign(comp.bpm, 0)})` : ""} — below the minutes cutoff for the on-court-impact half, so read it as approximate.`
        : " Projected from limited data — approximate.";
  return (
    <Term
      k="trade_value"
      extra={`Apron Value ${v} ± ${Math.round(comp.uncertainty * 3.73)} · ${comp.tier} · impact ${sign(comp.impactPts)} pts/100 (50 = replacement).${prov}`}
      className="tabular shrink-0"
    >
      <span
        className="inline-block rounded px-1 text-[9px] font-bold"
        style={{ minWidth: 20, textAlign: "center", color: col, background: `color-mix(in srgb, ${col} 16%, transparent)` }}
      >
        {v}
      </span>
    </Term>
  );
}
