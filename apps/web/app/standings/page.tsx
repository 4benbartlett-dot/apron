"use client";

import Link from "next/link";
import { TEAM_IDS, teamMeta, teamNickname, teamProjection } from "@/lib/league";
import { useLeague } from "@/lib/store";
import { TeamLogo } from "@/components/TeamLogo";

const GAMES = 82;

type Row = { id: string; p: NonNullable<ReturnType<typeof teamProjection>> };

function ConferenceTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <div className="border-b border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em]">
        {title}
      </div>
      <div className="grid grid-cols-[1.5rem_1fr_4.5rem_3.5rem_3rem] items-center gap-2 border-b border-[var(--border)] bg-[var(--panel-2)]/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
        <span>#</span>
        <span>Team</span>
        <span className="text-right">Record</span>
        <span className="text-right">Net</span>
        <span className="text-right">Δ</span>
      </div>
      {rows.map((r, i) => {
        const { projWins, projNrtg, deltaWins } = r.p;
        const dColor = deltaWins > 0 ? "var(--tier-below_cap)" : deltaWins < 0 ? "var(--tier-second_apron)" : "var(--muted)";
        return (
          <Link
            key={r.id}
            href={`/team/${r.id}`}
            className={`grid grid-cols-[1.5rem_1fr_4.5rem_3.5rem_3rem] items-center gap-2 px-3 py-2 text-[13px] hover:bg-[var(--panel-2)] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
            style={i === 6 ? { borderTop: "2px solid var(--border-strong)" } : undefined}
          >
            <span className="tabular text-[var(--muted)]">{i + 1}</span>
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <TeamLogo id={r.id} size={18} />
              <span className="truncate" title={teamMeta(r.id).name}>{teamNickname(r.id)}</span>
            </span>
            <span className="tabular text-right font-semibold">{projWins}-{GAMES - projWins}</span>
            <span className="tabular text-right text-[var(--muted)]">{projNrtg >= 0 ? "+" : ""}{projNrtg.toFixed(1)}</span>
            <span className="tabular text-right font-semibold" style={{ color: dColor }}>
              {deltaWins === 0 ? "—" : `${deltaWins > 0 ? "+" : ""}${deltaWins}`}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export default function StandingsPage() {
  const lg = useLeague();
  const moved = lg.moves.length > 0;

  const all = TEAM_IDS.map((id) => ({ id, p: teamProjection(id, lg.contracts) }))
    .filter((r): r is Row => !!r.p)
    .sort((a, b) => b.p.projWins - a.p.projWins || b.p.projNrtg - a.p.projNrtg);
  const east = all.filter((r) => teamMeta(r.id).conference === "East");
  const west = all.filter((r) => teamMeta(r.id).conference === "West");

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">Projected standings</h1>
        <Link href="/" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline">Back to the board →</Link>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-[var(--muted)]">
        Each team&rsquo;s projected record from its roster&rsquo;s minutes-weighted impact, ranked within its conference.
        {moved
          ? " The Δ column shows how your offseason moves changed each team from its current-roster baseline."
          : " With no moves staged, this is the current-roster baseline. Make trades and signings on the board and the projection updates live."}
        {" "}A current-roster snapshot, not a season forecast — no minutes-allocation or injury model yet.
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        <ConferenceTable title="Eastern Conference" rows={east} />
        <ConferenceTable title="Western Conference" rows={west} />
      </div>

      <p className="mt-3 text-[11px] text-[var(--muted)]">
        The line after #6 marks the play-in cut (top 6 clinch, 7&ndash;10 play in). Wins map from projected net rating (≈ 40 + 2 wins per net-rating point); the roster-value → net-rating fit is R²=0.97 on 2025-26 teams. Record capped to a plausible NBA range.
      </p>
    </div>
  );
}
