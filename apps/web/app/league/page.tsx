"use client";

import Link from "next/link";
import { useState } from "react";
import { capSheet as engCapSheet } from "@apron/cba-engine";
import { useLeague, useMoves } from "@/lib/store";
import { TEAMS, C, teamMeta, BASE_CONTRACTS, leagueData, holdsByTeam, freeAgentsOf, feedStateOf } from "@/lib/league";
import { fmtM, fmtFull } from "@/lib/format";
import { Thermometer } from "@/components/Thermometer";
import { TierBadge } from "@/components/TierBadge";
import { TeamLogo } from "@/components/TeamLogo";

const BASE_DATA = leagueData(BASE_CONTRACTS);
// Holds for the "league as of today" view: real-world only — feed-forced
// renounces are gone in the real world, but session renounces are not.
const BASE_HOLDS = holdsByTeam(
  freeAgentsOf(BASE_CONTRACTS).filter(
    (f) => !feedStateOf(f.priorTeam).forcedRenounced.has(f.playerName.toLowerCase()),
  ),
);

export default function LeaguePage() {
  const lg = useLeague();
  const moves = useMoves();
  const [applyMine, setApplyMine] = useState(true);
  const sheets = TEAMS.map((t) =>
    applyMine ? lg.capSheet(t.id) : engCapSheet(BASE_DATA, t.id, C),
  ).sort((a, b) => b.salary - a.salary);

  const overSecond = sheets.filter((s) => s.isOverSecondApron).length;
  const overFirst = sheets.filter((s) => s.isOverFirstApron && !s.isOverSecondApron).length;
  const taxpayers = sheets.filter((s) => s.isTaxpayer && !s.isOverFirstApron).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">League cap board</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            All 30 teams by 2026-27 committed salary, against the four CBA thresholds.
          </p>
          {moves.length > 0 && (
            <button
              onClick={() => setApplyMine((v) => !v)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-ink)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
              aria-pressed={applyMine}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: applyMine ? "var(--accent)" : "var(--border-strong)" }} />
              {applyMine
                ? `Your ${moves.length} move${moves.length > 1 ? "s" : ""} applied — tap for the league as of today`
                : "League as of today — tap to apply your offseason"}
            </button>
          )}
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            New league year · free agency open. Rosters reflect applied trades &amp;
            signings; each card shows the team’s free-agent cap holds.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Stat label="2nd apron" value={overSecond} color="var(--tier-second_apron)" />
          <Stat label="1st apron" value={overFirst} color="var(--tier-first_apron)" />
          <Stat label="Taxpayers" value={taxpayers} color="var(--tier-taxpayer)" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sheets.map((s) => {
          const meta = teamMeta(s.teamId);
          const holds = applyMine ? lg.teamHolds(s.teamId) : BASE_HOLDS[s.teamId] ?? 0;
          const spaceAfterHolds = C.salaryCap - s.salary - holds;
          const overUnder =
            spaceAfterHolds > 0
              ? `${fmtM(spaceAfterHolds)} cap space (after holds)`
              : s.spaceBelowSecondApron >= 0
                ? `${fmtM(s.spaceBelowSecondApron)} below 2nd apron`
                : `${fmtM(-s.spaceBelowSecondApron)} over 2nd apron`;
          return (
            <Link
              key={s.teamId}
              data-li-scope
              href={`/team/${s.teamId}`}
              className="panel block p-4 transition-colors hover:border-[var(--muted)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <TeamLogo id={s.teamId} size={38} />
                  <div>
                    <div className="text-base font-semibold">{meta.name}</div>
                    <div className="text-xs text-[var(--muted)]">{s.teamId}</div>
                  </div>
                </div>
                <TierBadge tier={s.tier} />
              </div>
              <div className="mt-3 mb-2 flex items-baseline gap-2">
                <span className="tabular text-xl font-bold">{fmtFull(s.salary)}</span>
              </div>
              {/* Cap charge = salary + kept holds — the SAME bar the board and
                  team page draw, so the three surfaces tell one story. The
                  tier badge stays holds-excluded (apron status), as everywhere. */}
              <Thermometer salary={s.salary + holds} c={C} />
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>{overUnder}</span>
                {holds > 0 && <span>+{fmtM(holds)} FA holds</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold tabular" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
    </div>
  );
}
