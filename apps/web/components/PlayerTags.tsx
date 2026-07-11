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
  // Describe THIS SEASON'S read (35% of the blend) with its provenance, then
  // the history read (65%), age and accolades — so the whole tooltip explains
  // the displayed number rather than the lower raw input.
  const seasonProv =
    comp.source === "hybrid"
      ? `box + on-court impact${comp.rapmp != null ? `, 3-yr RAPM ${sign(comp.rapmp)}/100` : ""}${comp.bpm != null ? `, box BPM ${sign(comp.bpm, 0)}` : ""}`
      : comp.source === "box"
        ? `box-based${comp.bpm != null ? ` (BPM ${sign(comp.bpm, 0)})` : ""}, below the minutes cutoff — approximate`
        : "a limited-data projection";
  const blend =
    ` Blend of this season's ${Math.round(comp.seasonAv)} read (${seasonProv}, grades ${comp.seasonTier}) at 35% and a 3-yr BPM history read of ${Math.round(comp.historyAv)} at 65%` +
    `${comp.ageMult < 1 ? `, aged ×${comp.ageMult.toFixed(2)}` : ""}` +
    `${comp.accoladeBonus > 0.05 ? `, +${comp.accoladeBonus.toFixed(1)} for All-NBA/All-Defensive/ring credit` : ""}.`;
  return (
    <Term
      k="trade_value"
      extra={`Apron Value ${v} ± ${Math.round(comp.uncertainty)} · impact ${sign(comp.impactPts)} pts/100 (50 = replacement).${blend}`}
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
