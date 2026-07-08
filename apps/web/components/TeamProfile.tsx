"use client";

import type { Contract } from "@apron/cba-engine";
import { teamDimensions, teamFit, dimensionGrade, injuryOf } from "@/lib/league";

const DIMS: { key: "off" | "def" | "play" | "space" | "reb" | "rim" | "perd"; label: string }[] = [
  { key: "off", label: "Offense" },
  { key: "def", label: "Defense" },
  { key: "space", label: "Spacing" },
  { key: "play", label: "Playmaking" },
  { key: "rim", label: "Rim protection" },
  { key: "perd", label: "Perimeter D" },
  { key: "reb", label: "Rebounding" },
];

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "var(--tier-below_cap)";
  if (grade.startsWith("B")) return "var(--text)";
  if (grade.startsWith("C")) return "var(--muted)";
  return "var(--tier-second_apron)";
}

/**
 * The team's on-court identity: minutes-weighted dimensional grades from the
 * projected rotation, plus the fit read (what the pieces do — or don't do —
 * together). Reactive to trades and signings, so you can watch a move reshape
 * the profile.
 */
export function TeamProfile({ roster }: { roster: Contract[] }) {
  const d = teamDimensions(roster);
  const fit = teamFit(roster);
  const strengths = fit.notes.filter((n) => n.nrtg > 0).sort((a, b) => b.nrtg - a.nrtg);
  const gaps = fit.notes.filter((n) => n.nrtg < 0).sort((a, b) => a.nrtg - b.nrtg);
  const injured = roster
    .map((c) => ({ c, inj: injuryOf(c.playerId) }))
    .filter((x) => x.inj && x.inj.gamesOut >= 5)
    .sort((a, b) => b.inj!.gamesOut - a.inj!.gamesOut);

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {DIMS.map(({ key, label }) => {
          const val = d[key];
          const grade = dimensionGrade(val);
          return (
            <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-center">
              <div className="label !text-[9px] leading-tight">{label}</div>
              <div className="mt-1 text-lg font-bold leading-none" style={{ color: gradeColor(grade) }}>{grade}</div>
              <div className="tabular mt-0.5 text-[9px] text-[var(--muted)]">{Math.round(val)}</div>
            </div>
          );
        })}
      </div>

      {(strengths.length > 0 || gaps.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {strengths.map((n) => (
            <span key={n.label} className="rounded-full px-2 py-0.5 font-semibold" style={{ color: "var(--tier-below_cap)", background: "color-mix(in srgb, var(--tier-below_cap) 12%, transparent)" }}>
              {n.label} +{n.nrtg}
            </span>
          ))}
          {gaps.map((n) => (
            <span key={n.label} className="rounded-full px-2 py-0.5 font-semibold" style={{ color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 12%, transparent)" }}>
              {n.label} {n.nrtg}
            </span>
          ))}
        </div>
      )}

      {injured.length > 0 && (
        <div className="mt-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--tier-second_apron)_7%,transparent)] px-2.5 py-1.5">
          <span className="label !text-[9px] text-[var(--tier-second_apron)]">Injured</span>
          <span className="ml-2 text-[11px] text-[var(--muted)]">
            {injured.map(({ c, inj }, i) => (
              <span key={c.playerId} title={inj!.desc}>
                {i > 0 && " · "}
                <span className="font-semibold text-[var(--text)]">{c.playerName}</span> {inj!.type}
                {inj!.gamesOut >= 70 ? " (out for season)" : ` (~${inj!.gamesOut}g)`}
              </span>
            ))}
          </span>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
        Grades are minutes-weighted from the projected rotation; the chips are the fit read — how much each strength or gap is worth in net rating, on top of raw talent. Dimensions come from each player&rsquo;s real 2025-26 box profile. Injuries are real reported facts, factored into projected minutes.
      </p>
    </div>
  );
}
