"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Contract } from "@apron/cba-engine";
import { SEASON_2027 } from "@apron/data";
import { BASE_CONTRACTS, seasonOutlook } from "@/lib/league";
import type { TeamOutlook } from "@/lib/seasonSim";

const SIMS = 2500;

function pct(p: number): string {
  if (p >= 0.995) return ">99%";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

/** One team's 2026-27 so far and the rest of it simulated — the season
 * page's numbers for a single row, with the change a staged move makes. */
export function SeasonOutlook({ team, contracts, moved }: { team: string; contracts: Contract[]; moved: boolean }) {
  const [o, setO] = useState<{ live: TeamOutlook; base?: TeamOutlook } | null>(null);
  useEffect(() => {
    setO(null);
    const h = setTimeout(() => {
      const live = seasonOutlook(contracts, SIMS)[team]!;
      const base = moved ? seasonOutlook(BASE_CONTRACTS, SIMS)[team] : undefined;
      setO({ live, base });
    }, 30);
    return () => clearTimeout(h);
  }, [team, contracts, moved]);

  const r = SEASON_2027.ratings[team];
  const delta = o?.base ? Math.round((o.live.playoffs - o.base.playoffs) * 100) : 0;
  const cell = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div>
      <div className="label !text-[10px]">{label}</div>
      <div className="tabular mt-1 text-lg font-semibold">{value}</div>
      {sub ? <div className="tabular text-[11px] text-[var(--muted)]">{sub}</div> : null}
    </div>
  );

  return (
    <div className="panel mb-4 flex flex-wrap items-start gap-x-8 gap-y-3 p-4">
      {cell(
        "Record",
        r ? `${r.w}-${r.l}` : "—",
        r ? `${r.nrtg >= 0 ? "+" : ""}${r.nrtg.toFixed(1)} net so far` : undefined,
      )}
      {o ? (
        <>
          {cell(`Projected finish`, `${Math.round(o.live.wins)}-${82 - Math.round(o.live.wins)}`, `${o.live.winsLo}–${o.live.winsHi} wins, 80% range`)}
          {cell(
            "Playoffs",
            <span className="flex items-baseline gap-2">
              {pct(o.live.playoffs)}
              {delta !== 0 && (
                <span className="text-xs font-semibold" style={{ color: delta > 0 ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
                  {delta > 0 ? "+" : ""}{delta} pts
                </span>
              )}
            </span>,
            `${pct(o.live.top6)} top six · ${pct(o.live.playIn)} play-in`,
          )}
          {cell("Title", pct(o.live.title), `${pct(o.live.finals)} to reach the Finals`)}
        </>
      ) : (
        <div className="self-center text-xs text-[var(--muted)]">Simulating the rest of the season…</div>
      )}
      <div className="w-full text-[11px] text-[var(--muted)] sm:w-auto sm:flex-1 sm:text-right">
        <Link href="/standings" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text)]">Every team&rsquo;s odds</Link>
        {" "}· the rest of the season played out {SIMS.toLocaleString()} times from this roster and the results so far.
      </div>
    </div>
  );
}
