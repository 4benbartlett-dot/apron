"use client";

import type { Contract } from "@apron/cba-engine";
import { impactScoreOf, positionOf } from "@/lib/league";
import { fmtM } from "@/lib/format";
import { ImpactPill } from "@/components/PlayerTags";

const SLOTS: { pos: string; label: string }[] = [
  { pos: "PG", label: "Point" },
  { pos: "SG", label: "Shooting" },
  { pos: "SF", label: "Small F" },
  { pos: "PF", label: "Power F" },
  { pos: "C", label: "Center" },
];

const salaryOf = (c: Contract) => {
  const y = c.years.find((yr) => yr.leagueYear === "2026-27");
  return y?.salary ?? 0;
};

/** Roster laid out by position, each column deepest-talent first. Players with
 * no logged position fall into an "Unlisted" column so nobody's dropped. */
export function DepthChart({ roster }: { roster: Contract[] }) {
  const byPos: Record<string, Contract[]> = { PG: [], SG: [], SF: [], PF: [], C: [], "—": [] };
  for (const c of roster) {
    const p = positionOf(c.playerId);
    (byPos[p && byPos[p] ? p : "—"] ??= []).push(c);
  }
  for (const k of Object.keys(byPos)) byPos[k]!.sort((a, b) => impactScoreOf(b) - impactScoreOf(a));

  const cols = [...SLOTS, ...(byPos["—"]!.length ? [{ pos: "—", label: "Unlisted" }] : [])];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cols.map(({ pos, label }) => (
        <div key={pos} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2">
          <div className="label mb-1.5 flex items-baseline justify-between !text-[9.5px]">
            <span>{pos}</span>
            <span className="text-[var(--muted)]">{label}</span>
          </div>
          <div className="space-y-1">
            {byPos[pos]!.map((c, i) => (
              <div
                key={c.playerId}
                className="flex items-center gap-1.5 rounded bg-[var(--panel)] px-1.5 py-1 text-[11.5px]"
                style={{ opacity: i === 0 ? 1 : 0.86 }}
              >
                <ImpactPill c={c} />
                <span className="min-w-0 flex-1 truncate" title={c.playerName}>{c.playerName}</span>
                <span className="tabular shrink-0 text-[9.5px] text-[var(--muted)]">{fmtM(salaryOf(c))}</span>
              </div>
            ))}
            {!byPos[pos]!.length && <div className="px-1 py-2 text-center text-[10px] text-[var(--muted)]">—</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
