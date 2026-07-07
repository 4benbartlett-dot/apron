"use client";

import type { Contract } from "@apron/cba-engine";
import { impactScoreOf, positionOf } from "@/lib/league";
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

/** Impact colour ladder on the 100-scale: elite → replacement → net-negative. */
function impactColor(v: number): string {
  if (v >= 60) return "var(--tier-below_cap)";
  if (v >= 35) return "var(--tier-over_cap)";
  if (v >= 15) return "var(--tier-taxpayer)";
  if (v >= 0) return "var(--muted)";
  return "var(--tier-second_apron)";
}

/** Player IMPACT pill (100 = league best, negative = net-negative). */
export function ImpactPill({ c }: { c?: Contract }) {
  if (!c) return null;
  const v = impactScoreOf(c);
  const col = impactColor(v);
  return (
    <Term
      k="trade_value"
      extra={`impact ${v} — 100 is the league's best, 0 is replacement level, negative is a net-negative on-court player.`}
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
