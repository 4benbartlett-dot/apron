"use client";

import { TEAM_IDS, teamMeta } from "@/lib/league";
import { TeamLogo } from "@/components/TeamLogo";

/** First-run landing: pick whose front office you're running. */
export function TeamPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="fade-up panel relative overflow-hidden px-5 py-8 sm:px-8">
      {/* watermark: the vault, faint, oversized */}
      <svg
        viewBox="0 0 64 64"
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-[340px] w-[340px] opacity-[0.05]"
      >
        <line x1="11" y1="41" x2="53" y2="41" stroke="var(--accent)" strokeWidth="4.5" strokeDasharray="7.5 6" strokeLinecap="round" />
        <path d="M13 54 C 20 25, 37 14, 50 22" fill="none" stroke="var(--text)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="50.5" cy="21.5" r="6.5" fill="var(--text)" />
      </svg>

      <div className="relative mx-auto max-w-3xl text-center">
        <div className="label !text-[11px] text-[var(--accent-ink)]">
          2026–27 · Free agency is open
        </div>
        <h2 className="mt-2 text-[clamp(24px,4vw,34px)] font-bold leading-tight tracking-tight">
          Whose front office are you running?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          Pick a team to take over their real cap sheet. You can bring trade
          partners onto the board any time.
        </p>
      </div>

      <div className="relative mx-auto mt-7 grid max-w-4xl grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        {TEAM_IDS.map((id, i) => (
          <button
            key={id}
            onClick={() => onPick(id)}
            className="team-pick fade-up flex flex-col items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/50 px-2 pb-2.5 pt-3"
            style={{ animationDelay: `${100 + i * 22}ms` }}
          >
            <TeamLogo id={id} size={38} />
            <span className="text-[11px] font-semibold leading-tight">
              {teamMeta(id).name}
            </span>
          </button>
        ))}
      </div>

      <p className="relative mt-6 text-center text-xs text-[var(--muted)]">
        Live rosters, cap holds, and apron lines — every verdict cites the 2023 CBA.
      </p>
    </div>
  );
}
