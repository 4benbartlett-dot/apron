import { UPCOMING_DEADLINES, EXTENSION_ELIGIBLE } from "@apron/data";
import { fmtFull } from "@/lib/format";

export default function DeadlinesPage() {
  const deadlines = UPCOMING_DEADLINES.filter(
    (r) => r.kind && r.kind !== "EXTENSION ELIGIBLE",
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const ext = EXTENSION_ELIGIBLE;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deadlines & Eligibility</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upcoming option/guarantee decisions and extension-eligible players —
          compiled from public reporting. Real-world calendar; your sim moves
          don&rsquo;t change these dates.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Extension-eligible{" "}
          <span className="text-[var(--muted)]">({ext.length})</span>
        </h2>
        <div className="panel grid grid-cols-1 gap-x-6 gap-y-1 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {ext.map((r, i) => (
            <div key={i} className="flex items-center justify-between border-b border-[var(--border)]/30 py-1.5 text-sm">
              <span className="truncate">{r.player}</span>
              <span className="ml-2 shrink-0 text-xs text-[var(--muted)]">
                {r.team} · {r.pos}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Upcoming option & guarantee decisions{" "}
          <span className="text-[var(--muted)]">({deadlines.length})</span>
        </h2>
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[6rem_1fr_3rem_9rem_7rem] gap-2 border-b border-[var(--border)] px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--muted)]">
            <div>Date</div>
            <div>Player</div>
            <div>Tm</div>
            <div>Type</div>
            <div className="text-right">Amount</div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {deadlines.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-[6rem_1fr_3rem_9rem_7rem] items-center gap-2 border-b border-[var(--border)]/30 px-4 py-1.5 text-sm hover:bg-[var(--panel-2)]"
              >
                <div className="text-xs text-[var(--muted)]">{r.date}</div>
                <div className="truncate">
                  {r.player}
                  {r.note && (
                    <span className="ml-1 text-[11px] text-[var(--muted)]">— {r.note}</span>
                  )}
                </div>
                <div className="text-[var(--muted)]">{r.team}</div>
                <div className="text-xs text-[var(--muted)]">{r.kind}</div>
                <div className="tabular text-right">
                  {r.amount > 0 ? fmtFull(r.amount) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
