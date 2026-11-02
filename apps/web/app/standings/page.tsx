"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GAME_MODEL, SEASON_2027 } from "@apron/data";
import { BASE_CONTRACTS, PRIOR_WEIGHT_GAMES, TEAM_IDS, seasonOutlook, teamMeta, teamNickname } from "@/lib/league";
import type { TeamOutlook } from "@/lib/seasonSim";
import { useLeague } from "@/lib/store";
import { TeamLogo } from "@/components/TeamLogo";

const SIMS = 5000;
// On a phone: rank, team, record, projection, playoffs, and the Δ only when
// there are moves to show; range, title and top-6 wait for a wider screen.
const cols = (moved: boolean) =>
  `${moved ? "grid-cols-[1.25rem_1fr_2.5rem_3rem_3.5rem_2.25rem]" : "grid-cols-[1.25rem_1fr_2.5rem_3rem_3.5rem]"} sm:grid-cols-[1.5rem_1fr_3.25rem_3.5rem_4.25rem_3.5rem_3.5rem_3rem]`;

/** "97%", "<1%", "—" — odds the way a person reads them. */
function pct(p: number): string {
  if (p >= 0.995) return ">99%";
  if (p > 0 && p < 0.005) return "<1%";
  if (p === 0) return "—";
  return `${Math.round(p * 100)}%`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Row = { id: string; o: TeamOutlook; base?: TeamOutlook };

function ConferenceTable({ title, rows, moved }: { title: string; rows: Row[]; moved: boolean }) {
  const COLS = cols(moved);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <div className="border-b border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em]">
        {title}
      </div>
      <div className={`grid ${COLS} items-center gap-2 border-b border-[var(--border)] bg-[var(--panel-2)]/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]`}>
        <span>#</span>
        <span>Team</span>
        <span className="text-right">Now</span>
        <span className="text-right">Proj</span>
        <span className="hidden text-right sm:block">Range</span>
        <span className="text-right">Playoffs</span>
        <span className="hidden text-right sm:block">Title</span>
        <span className={moved ? "text-right" : "hidden text-right sm:block"}>{moved ? "Δ" : "Top 6"}</span>
      </div>
      {rows.map((r, i) => {
        const { o, base } = r;
        const projW = Math.round(o.wins);
        const d = base ? Math.round((o.playoffs - base.playoffs) * 100) : 0;
        const dColor = d > 0 ? "var(--tier-below_cap)" : d < 0 ? "var(--tier-second_apron)" : "var(--muted)";
        return (
          <Link
            key={r.id}
            data-li-scope
            href={`/team/${r.id}`}
            className={`grid ${COLS} items-center gap-2 px-3 py-2 text-[13px] hover:bg-[var(--panel-2)] ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
            style={i === 6 ? { borderTop: "2px solid var(--border-strong)" } : i === 10 ? { borderTop: "1px dashed var(--border-strong)" } : undefined}
          >
            <span className="tabular text-[var(--muted)]">{i + 1}</span>
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <TeamLogo id={r.id} size={18} />
              <span className="truncate" title={teamMeta(r.id).name}>{teamNickname(r.id)}</span>
            </span>
            <span className="tabular text-right text-[var(--muted)]">{o.w}-{o.l}</span>
            <span className="tabular text-right font-semibold">{projW}-{82 - projW}</span>
            <span className="tabular hidden text-right text-[var(--muted)] sm:block" title="10th to 90th percentile of simulated win totals">
              {o.winsLo}–{o.winsHi}
            </span>
            <span className="tabular text-right font-semibold">{pct(o.playoffs)}</span>
            <span className="tabular hidden text-right text-[var(--muted)] sm:block">{pct(o.title)}</span>
            {moved ? (
              <span className="tabular text-right font-semibold" style={{ color: dColor }} title="Change in playoff odds from your moves">
                {d === 0 ? "—" : `${d > 0 ? "+" : ""}${d}`}
              </span>
            ) : (
              <span className="tabular hidden text-right text-[var(--muted)] sm:block">{pct(o.top6)}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default function StandingsPage() {
  const lg = useLeague();
  const moved = lg.moves.length > 0;
  const [sim, setSim] = useState<{ live: Record<string, TeamOutlook>; base?: Record<string, TeamOutlook> } | null>(null);

  // Ten thousand seasons is a few hundred milliseconds: run them after the
  // first paint, and again whenever the staged roster changes. Same seed both
  // times, so the Δ column is the move and not the dice.
  useEffect(() => {
    setSim(null);
    const h = setTimeout(() => {
      const live = seasonOutlook(lg.contracts, SIMS);
      const base = moved ? seasonOutlook(BASE_CONTRACTS, SIMS) : undefined;
      setSim({ live, base });
    }, 30);
    return () => clearTimeout(h);
  }, [lg.contracts, moved]);

  const rows: Row[] = sim
    ? TEAM_IDS.map((id) => ({ id, o: sim.live[id]!, base: sim.base?.[id] })).sort(
        (a, b) => b.o.wins - a.o.wins || b.o.playoffs - a.o.playoffs,
      )
    : [];
  const east = rows.filter((r) => teamMeta(r.id).conference === "East");
  const west = rows.filter((r) => teamMeta(r.id).conference === "West");
  const played = SEASON_2027.games.filter((g) => g.homePts != null).length;
  const favorite = rows.length ? [...rows].sort((a, b) => b.o.title - a.o.title)[0]! : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">The 2026-27 season, simulated</h1>
        <Link href="/" className="shrink-0 text-xs font-semibold text-[var(--accent-ink)] hover:underline">Back to the board →</Link>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-[var(--muted)]">
        Real records through {shortDate(SEASON_2027.asOf)} ({played} games played), then the remaining {SEASON_2027.games.length - played} played out {SIMS.toLocaleString()} times.
        Each team starts from the board&rsquo;s projection of its roster and is moved by what it has actually done. This early, the projection still
        counts for about {PRIOR_WEIGHT_GAMES} games of evidence, so a 5-0 start moves a team but doesn&rsquo;t remake it.
        {moved
          ? " The Δ column is how much your staged moves change each team's playoff odds, in percentage points."
          : " Stage a trade or signing on the board and the odds rerun with it."}
        {favorite ? (
          <>
            {" "}Title favorite right now: <span className="font-semibold text-[var(--text)]">{teamMeta(favorite.id).name}</span>, {pct(favorite.o.title)}.
          </>
        ) : null}
      </p>

      {sim ? (
        <div className="grid gap-5 md:grid-cols-2">
          <ConferenceTable title="Eastern Conference" rows={east} moved={moved} />
          <ConferenceTable title="Western Conference" rows={west} moved={moved} />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2" aria-busy="true">
          {["Eastern Conference", "Western Conference"].map((t) => (
            <div key={t} className="rounded-lg border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em]">{t}</div>
              <div className="px-3 py-10 text-center text-xs text-[var(--muted)]">Simulating the season…</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
        <p>
          Sorted by projected wins. The solid line after #6 is the play-in cut, and the dashed line after #10 is the end of it. <em>Playoffs</em> counts a top-6 finish or a
          way through the play-in; <em>Range</em> is the 10th to 90th percentile of simulated win totals.
        </p>
        <p>
          How a game is decided: the better-rated team&rsquo;s edge plus {GAME_MODEL.hca.toFixed(1)} points for home court, against a
          single-game spread of {GAME_MODEL.marginSd.toFixed(1)} points, both measured on {GAME_MODEL.season}&rsquo;s {GAME_MODEL.games.toLocaleString()} games.
          Summed over each team&rsquo;s real {GAME_MODEL.season} schedule, that model lands within {GAME_MODEL.winsRmse.toFixed(1)} wins of its actual record (RMSE).
          Each simulated season also redraws every team&rsquo;s true strength from its uncertainty, which is why the ranges are wide in October.
        </p>
        <p>
          Simplified: ties are broken by coin flip rather than the NBA&rsquo;s tiebreaker chain, and the two games each team has left to schedule after NBA Cup
          group play are filled in against conference opponents at a neutral site. More on the method on the{" "}
          <Link href="/accuracy" className="font-semibold text-[var(--accent-ink)] hover:underline">accuracy page</Link>.
        </p>
      </div>
    </div>
  );
}
