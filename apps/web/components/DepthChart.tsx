"use client";

import type { Contract } from "@apron/cba-engine";
import { allocateRotation, secondaryPositionsOf } from "@/lib/league";
import { ImpactPill } from "@/components/PlayerTags";

const SLOTS: { pos: string; label: string }[] = [
  { pos: "PG", label: "Point" },
  { pos: "SG", label: "Shooting" },
  { pos: "SF", label: "Small F" },
  { pos: "PF", label: "Power F" },
  { pos: "C", label: "Center" },
];

const mpg = (minutes: number) => Math.round(minutes / 82);

/**
 * Projected rotation, laid out by position. Each of the five on-court spots has
 * a fixed minutes budget; the position-aware model hands them to the best
 * players first (spilling a versatile player to a secondary spot), so this is
 * the minutes each player is projected to actually play — not just who's on the
 * roster. Players squeezed out of the 240-minute-a-night rotation drop to
 * "Out of rotation."
 */
export function DepthChart({ roster }: { roster: Contract[] }) {
  const rot = allocateRotation(roster);
  const byId = new Map(roster.map((c) => [c.playerId, c]));

  // Anyone on the roster the model never gives a minute (no projected role, or
  // squeezed out) is surfaced so nobody silently disappears.
  const shown = new Set<string>();
  for (const pos of SLOTS) for (const s of rot.byPos[pos.pos] ?? []) shown.add(s.playerId);
  const out = [
    ...rot.benched,
    ...roster
      .filter((c) => {
        const y = c.years.find((yr) => yr.leagueYear === "2026-27");
        return (y?.salary ?? 0) > 0 && !c.deadMoney && !shown.has(c.playerId) && !rot.benched.some((b) => b.playerId === c.playerId);
      })
      .map((c) => ({ playerId: c.playerId, playerName: c.playerName, av: 0 })),
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {SLOTS.map(({ pos, label }) => {
          const slots = rot.byPos[pos] ?? [];
          return (
            <div key={pos} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2">
              <div className="label mb-1.5 flex items-baseline justify-between !text-[9.5px]">
                <span>{pos}</span>
                <span className="text-[var(--muted)]">{label}</span>
              </div>
              <div className="space-y-1">
                {slots.map((s, i) => {
                  const c = byId.get(s.playerId);
                  const sec = secondaryPositionsOf(s.playerId);
                  return (
                    <div
                      key={s.playerId + pos}
                      className="flex items-center gap-1 rounded bg-[var(--panel)] px-1.5 py-1 text-[11.5px]"
                      style={{ opacity: s.secondary ? 0.72 : i === 0 ? 1 : 0.9 }}
                      title={`${s.playerName} · ${s.age} yrs · ~${mpg(s.minutes)} mpg at ${pos}${sec.length ? ` (also ${sec.join("/")})` : ""}`}
                    >
                      <ImpactPill c={c} />
                      <span className="min-w-0 flex-1 truncate">{s.playerName}</span>
                      {i === 0 && !s.secondary && <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-[var(--tier-below_cap)]">ST</span>}
                      <span className="tabular shrink-0 text-[9px] text-[var(--muted)]">{s.age}y</span>
                      <span className="tabular shrink-0 font-semibold">
                        {mpg(s.minutes)}<span className="text-[8px] font-normal text-[var(--muted)]">m</span>
                      </span>
                    </div>
                  );
                })}
                {!slots.length && <div className="px-1 py-2 text-center text-[10px] text-[var(--muted)]">—</div>}
              </div>
            </div>
          );
        })}
      </div>

      {out.length > 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-[var(--border)] p-2">
          <div className="label mb-1 !text-[9.5px]">Out of rotation <span className="text-[var(--muted)]">· no projected minutes in the 240-a-night budget</span></div>
          <div className="flex flex-wrap gap-1">
            {out.map((b) => (
              <span key={b.playerId} className="inline-flex items-center gap-1 rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-[11px] text-[var(--muted)]" title={b.playerName}>
                <ImpactPill c={byId.get(b.playerId)} />
                <span className="max-w-[9rem] truncate">{b.playerName}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        Projected minutes from the position-aware rotation model: five on-court spots share a fixed 240-minute-a-night budget, best players first, with versatile players (their secondary spot shown on hover) sliding to a second position. ST = projected starter. Not a coach&rsquo;s actual rotation.
      </p>
    </div>
  );
}
