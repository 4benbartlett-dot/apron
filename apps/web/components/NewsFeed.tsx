import { NewsCard } from "@/components/NewsCard";
import { TeamLogo } from "@/components/TeamLogo";
import type { NewsDay, NewsMove } from "@/lib/newsDay";

/**
 * The real moves, collapsed. Each one is a line until you ask for it — a phone
 * opening the board should see the headline and the team picker together, not
 * scroll past a full ruling to reach the thing it came for.
 *
 * Built on <details>, deliberately. It needs no client JavaScript, it renders
 * on the server, it is keyboard-operable and screen-reader-announced for free,
 * and it works before hydration — which for a strip that sits above the fold on
 * every page is worth more than any animation.
 */
export function NewsFeed({ day, headed = false }: { day: NewsDay; headed?: boolean }) {
  return (
    <section>
      {headed && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-bold tracking-tight">What the league actually did</h2>
          <span className="label tabular">{day.dateLabel}</span>
        </div>
      )}
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]">
        {day.moves.map((m) => (
          <NewsRow key={m.id} move={m} />
        ))}
      </div>
    </section>
  );
}

function NewsRow({ move }: { move: NewsMove }) {
  const color = move.legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)";
  const verdict = move.legal ? "Legal" : move.kind === "trade" ? "Blocked" : "Doesn't fit";
  const lead = move.winShifts[0];
  const delta = lead ? lead.afterWins - lead.beforeWins : 0;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--panel-2)]/60 sm:px-4">
        <span className="flex shrink-0 items-center gap-1">
          {move.teams.slice(0, 3).map((t) => (
            <TeamLogo key={t} id={t} size={16} />
          ))}
          {move.teams.length > 3 && (
            <span className="tabular text-[10px] text-[var(--muted)]">+{move.teams.length - 3}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">
            {move.headline}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <span className="tabular">{move.dateLabel}</span>
            <span aria-hidden>·</span>
            <span className="font-semibold" style={{ color }}>
              {verdict}
            </span>
            {lead && delta !== 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular">
                  {lead.team} {delta > 0 ? `+${delta}` : delta} wins
                </span>
              </>
            )}
          </span>
        </span>
        <span className="shrink-0 rounded-md border border-[var(--border-strong)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)] group-open:hidden">
          Ruling
        </span>
        <span className="hidden shrink-0 rounded-md border border-[var(--border-strong)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted)] group-open:block">
          Close
        </span>
      </summary>
      <div className="border-t border-[var(--border)] bg-[var(--bg)] p-2.5 sm:p-3">
        <NewsCard move={move} />
      </div>
    </details>
  );
}
