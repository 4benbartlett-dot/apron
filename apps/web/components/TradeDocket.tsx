"use client";

import type { ApronTier } from "@apron/cba-engine";
import { teamMeta } from "@/lib/league";
import { pickShareLabel } from "@/lib/trade-share";
import { fmtM } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";

export interface DocketLine {
  label: string;
  amount?: number;
  pick?: boolean;
}

export interface DocketTeam {
  teamId: string;
  tier: ApronTier;
  getsTotal: number;
  sendsTotal: number;
  gets: DocketLine[];
  sends: DocketLine[];
}

/** Assemble the docket from the staged trade — shared by both builders. */
export function buildDocket(
  players: { playerId: string; from: string; to: string }[],
  picks: Record<string, { from: string; to: string }>,
  verdictTeams: { teamId: string; incomingSalary: number; outgoingSalary: number; postTradeTier: ApronTier }[],
  nameOf: (id: string) => string,
  salaryOf: (id: string) => number,
): DocketTeam[] {
  const touched = (t: string) =>
    players.some((p) => p.from === t || p.to === t) ||
    Object.values(picks).some((m) => m.from === t || m.to === t);
  return verdictTeams
    .filter((t) => touched(t.teamId))
    .map((t) => {
      const side = (dir: "to" | "from"): DocketLine[] => [
        ...players
          .filter((p) => p[dir] === t.teamId)
          .map((p) => ({ label: nameOf(p.playerId), amount: salaryOf(p.playerId) })),
        ...Object.entries(picks)
          .filter(([, m]) => m[dir] === t.teamId)
          .map(([id]) => ({ label: pickShareLabel(id), pick: true })),
      ];
      return {
        teamId: t.teamId,
        tier: t.postTradeTier,
        getsTotal: t.incomingSalary,
        sendsTotal: t.outgoingSalary,
        gets: side("to"),
        sends: side("from"),
      };
    });
}

/** The share card's deal section, live on the board: per-team GETS/SENDS
 * columns with salaries and picks — what you see is what the card says. */
export function TradeDocket({ teams }: { teams: DocketTeam[] }) {
  if (!teams.length) return null;
  return (
    <div className={`grid grid-cols-1 gap-2 ${teams.length > 1 ? "md:grid-cols-2" : ""}`}>
      {teams.map((t) => (
        <div key={t.teamId} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-2)]/50 px-3 py-1.5">
            <span className="flex items-center gap-2 text-[12.5px] font-semibold">
              <TeamLogo id={t.teamId} size={16} />
              {teamMeta(t.teamId).name}
            </span>
            <TierBadge tier={t.tier} />
          </div>
          <div className="grid grid-cols-2 divide-x divide-[var(--border)] text-xs">
            {(["gets", "sends"] as const).map((dir) => (
              <div key={dir} className="px-3 py-2">
                <div className="label !text-[9px]">
                  {dir === "gets" ? `Gets · ${fmtM(t.getsTotal)}` : `Sends · ${fmtM(t.sendsTotal)}`}
                </div>
                <div className="mt-1 space-y-0.5">
                  {t[dir].map((l) =>
                    l.pick ? (
                      <div key={l.label} className="tabular font-medium text-[var(--accent-ink)]">
                        {l.label}
                      </div>
                    ) : (
                      <div key={l.label} className="flex items-baseline justify-between gap-2">
                        <span className="truncate">{l.label}</span>
                        <span className="tabular shrink-0 text-[var(--muted)]">{fmtM(l.amount ?? 0)}</span>
                      </div>
                    ),
                  )}
                  {t[dir].length === 0 && <span className="text-[var(--muted)]">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
