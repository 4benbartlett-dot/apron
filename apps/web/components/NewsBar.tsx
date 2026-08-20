"use client";

import { useEffect, useState } from "react";
import { NewsCard } from "@/components/NewsCard";
import { TeamLogo } from "@/components/TeamLogo";
import { track } from "@/lib/analytics";
import type { NewsDay } from "@/lib/newsDay";

const KEY = "ota:news-dismissed";

/**
 * The strip under the nav: what the league actually did, most recent first.
 *
 * Dismissal is keyed to the NEWS ITSELF, not to a "seen the bar once" flag —
 * closing it hides today's moves and nothing else, so the next real transaction
 * brings it back on its own. A reader who never dismisses it sees a one-line
 * strip; a reader who opens it gets the full filing without leaving the page.
 */
export function NewsBar({ news }: { news: NewsDay | null }) {
  // Server and client must agree on the first paint, so the bar starts hidden
  // and appears once localStorage has been read. Anything else flashes.
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);

  const id = news ? `${news.date}:${news.moves.length}` : "";

  useEffect(() => {
    if (!news) return;
    try {
      setDismissed(localStorage.getItem(KEY) === id);
    } catch {
      setDismissed(false); // private mode — better to show it than to hide it
    }
    setReady(true);
  }, [news, id]);

  if (!news || !ready || dismissed) return null;
  const lead = news.moves[0]!;
  const more = news.moves.length - 1;

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
            It happened
          </span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            {lead.teams.slice(0, 5).map((t) => (
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
          >
            {lead.headline}
            {more > 0 && (
              <span className="text-[var(--muted)]"> · and {more} more</span>
            )}
          </button>
          <button
            onClick={() => {
              setOpen((v) => !v);
              if (!open) track("news_expand");
            }}
            className="shrink-0 rounded-md border border-[var(--border-strong)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--panel)]"
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

        {open && (
          <div className="grid gap-3 pb-4 md:grid-cols-2">
            {news.moves.map((m) => (
              <NewsCard key={m.id} move={m} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
