"use client";

import { useEffect, useState, type RefObject } from "react";
import { TeamLogo } from "@/components/TeamLogo";

export interface TrayHaul {
  team: string;
  /** Compact labels of the assets headed TO this team ("Morant", "2027 1st"). */
  labels: string[];
}

/** Watches the full verdict panel and reports when it's scrolled out of view —
 * that's when the tray takes over. */
export function useTrayVisible(ref: RefObject<HTMLElement | null>, active: boolean) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px", // the sticky header hides that strip
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, active]);
  return active && !inView;
}

/** The deal, pinned under the header while you scroll rosters: who gets what,
 * the live ruling, and one tap back to the full verdict or the share card. */
export function TradeTray({
  hauls,
  legal,
  visible,
  onReview,
  onShare,
}: {
  hauls: TrayHaul[];
  legal: boolean;
  visible: boolean;
  onReview: () => void;
  onShare: () => void;
}) {
  if (!hauls.length) return null;
  const color = legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)";
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[52px] z-30 flex justify-center px-2 sm:px-4"
      aria-hidden={!visible}
    >
      <div
        className={`flex w-full max-w-3xl items-center gap-2 rounded-b-lg border border-t-0 border-[var(--border-strong)] bg-[var(--bg)]/95 py-1.5 pl-3 pr-1.5 shadow-[0_12px_30px_rgba(33,29,19,0.22)] backdrop-blur transition-all duration-200 ${
          visible ? "pointer-events-auto translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        }`}
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <button
          onClick={onReview}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          title="Jump back to the full verdict"
        >
          <span className="mt-0.5 shrink-0 text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color }}>
            {legal ? "Legal" : "Blocked"}
          </span>
          <span className="min-w-0 flex-1 space-y-0.5 text-[12px] leading-snug">
            {hauls.map((h) => (
              <span key={h.team} className="block">
                <span className="mr-1 inline-block align-[-2px]"><TeamLogo id={h.team} size={14} /></span>
                <span className="font-semibold">{h.team}</span>
                <span className="text-[var(--muted)]"> get </span>
                <span className="font-medium">{h.labels.join(", ") || "—"}</span>
              </span>
            ))}
          </span>
        </button>
        <button
          onClick={onShare}
          className="mt-0.5 shrink-0 self-start rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-2.5 py-1 text-[11.5px] font-semibold hover:border-[var(--text)]"
          title="Open the share card"
        >
          Card
        </button>
      </div>
    </div>
  );
}
