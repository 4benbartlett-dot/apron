"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TeamLogo } from "@/components/TeamLogo";
import { track } from "@/lib/analytics";

const KEY = "ota:news-dismissed";

export interface NewsSummary {
  /** Dismissal key — changes when the news does. */
  id: string;
  headline: string;
  dateLabel: string;
  teams: string[];
  /** How many other moves are behind the lede. */
  more: number;
}

/**
 * The strip under the nav: what the league actually did, most recent first.
 *
 * Dismissal is keyed to the NEWS ITSELF, not to a "seen the bar once" flag —
 * closing it hides today's moves and nothing else, so the next real transaction
 * brings it back on its own.
 *
 * The rulings arrive as server-rendered `children`, so the only thing this
 * client component owns is the open/dismissed state. The cards themselves never
 * enter the client bundle.
 */
export function NewsBar({
  summary,
  children,
}: {
  summary: NewsSummary | null;
  children: React.ReactNode;
}) {
  // The board already leads with the same list, expanded to the same rows —
  // a strip above it would be the news twice on the page most likely to be
  // read on a phone. Everywhere else, the strip is the only way to see it.
  const onBoard = usePathname() === "/";

  // Server and client must agree on the first paint, so the bar starts hidden
  // and appears once localStorage has been read. Anything else flashes.
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);

  const id = summary?.id ?? "";

  useEffect(() => {
    if (!summary) return;
    try {
      setDismissed(localStorage.getItem(KEY) === id);
    } catch {
      setDismissed(false); // private mode — better to show it than to hide it
    }
    setReady(true);
  }, [summary, id]);

  if (!summary || !ready || dismissed || onBoard) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* nothing to remember it with — it will be back next load */
    }
    setDismissed(true);
    track("news_dismiss");
  };

  return (
    <div className="border-b border-[var(--border)] bg-[var(--panel-2)]/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center gap-2.5 py-2">
          <span
            className="shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--bg)]"
            style={{ background: "var(--accent-ink)" }}
          >
            Real moves
          </span>
          <span className="tabular hidden shrink-0 text-[11px] text-[var(--muted)] sm:block">
            {summary.dateLabel}
          </span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            {summary.teams.slice(0, 5).map((t) => (
              <TeamLogo key={t} id={t} size={15} />
            ))}
          </span>
          <button
            onClick={() => {
              setOpen((v) => !v);
              if (!open) track("news_expand");
            }}
            className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium hover:underline"
            aria-expanded={open}
            aria-controls="real-moves-panel"
          >
            {summary.headline}
            {summary.more > 0 && (
              <span className="text-[var(--muted)]"> · and {summary.more} more</span>
            )}
          </button>
          <button
            onClick={() => {
              setOpen((v) => !v);
              if (!open) track("news_expand");
            }}
            className="shrink-0 rounded-md border border-[var(--border-strong)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--panel)]"
            aria-expanded={open}
            aria-controls="real-moves-panel"
          >
            {open ? "Hide" : "See the ruling"}
          </button>
          <button
            onClick={close}
            aria-label="Dismiss until the next move"
            className="shrink-0 rounded px-1 text-[13px] leading-none text-[var(--muted)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </div>

        <div id="real-moves-panel" hidden={!open} className="pb-3">
          {children}
        </div>
      </div>
    </div>
  );
}
