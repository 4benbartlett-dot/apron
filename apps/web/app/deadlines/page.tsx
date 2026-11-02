import { UPCOMING_DEADLINES, EXTENSION_ELIGIBLE, DATA_AS_OF } from "@apron/data";
import { fmtFull } from "@/lib/format";
import { BASE_CONTRACTS, C } from "@/lib/league";

/** "10/15/2026" → "2026-10-15". */
const iso = (mdy: string) => {
  const [m, d, y] = mdy.split("/");
  return y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : mdy;
};
const daysUntil = (to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${DATA_AS_OF}T00:00:00Z`).getTime()) / 864e5);
const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Players booked with the Dec. 15 free-agent trade freeze: the ones the
 * calendar's first date sets loose. */
const DEC15 = BASE_CONTRACTS.filter((c) => !c.deadMoney && /Dec\. 15/.test(c.restriction ?? "")).length;

/** The 2026-27 dates that move the trade market, each with what it changes. */
const SEASON_DATES: { date: string; title: string; what: string }[] = [
  {
    date: "2026-12-15",
    title: "Offseason signings become tradeable",
    what: `Most players signed as free agents this summer can be traded from today: ${DEC15} on current rosters (Art. VII §8(d)(ii): the later of Dec. 15 and three months after signing).`,
  },
  {
    date: "2027-01-05",
    title: "10-day contracts open",
    what: "Teams can sign 10-day contracts from today (Art. II §9(a)); before it, only a hardship exception allows one.",
  },
  {
    date: "2027-01-10",
    title: "Contracts become fully guaranteed",
    what: "Any player still on a roster at the end of the day has his full-season salary guaranteed, so non-guaranteed deals get waived just before it.",
  },
  {
    date: "2027-02-11",
    title: "Trade deadline, 3 p.m. ET",
    what: "Last day to trade. After it, rosters change only through free agency, waivers and buyouts.",
  },
  {
    date: "2027-03-01",
    title: "Playoff-eligibility waiver deadline",
    what: "A player has to be waived by today to be playoff-eligible with a new team, which is why buyouts cluster right after the trade deadline.",
  },
  {
    date: C.calendar?.regularSeasonEnd ?? "2027-04-11",
    title: "Regular season ends",
    what: "The play-in starts days later, and the cap year runs to June 30.",
  },
];

export default function DeadlinesPage() {
  // Only what is still ahead of the data's date: an October option decision
  // that has already been made is in the transactions, not on a calendar.
  const deadlines = UPCOMING_DEADLINES.filter(
    (r) => r.kind && r.kind !== "EXTENSION ELIGIBLE" && iso(r.date) >= DATA_AS_OF,
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const ahead = SEASON_DATES.filter((d) => d.date >= DATA_AS_OF);
  const ext = EXTENSION_ELIGIBLE;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deadlines & eligibility</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The season&rsquo;s key dates, upcoming option and guarantee decisions, and
          extension-eligible players, compiled from public reporting. Counted from
          the data&rsquo;s date; your sim moves don&rsquo;t change any of them.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">The 2026-27 calendar</h2>
        <div className="panel divide-y divide-[var(--border)]/40">
          {ahead.map((d) => {
            const n = daysUntil(d.date);
            return (
              <div key={d.date} className="grid grid-cols-[5.5rem_1fr] gap-3 px-4 py-2.5 sm:grid-cols-[7rem_1fr_5rem]">
                <div className="text-xs font-semibold">{longDate(d.date)}</div>
                <div>
                  <div className="text-sm font-semibold">{d.title}</div>
                  <div className="text-xs leading-relaxed text-[var(--muted)]">{d.what}</div>
                </div>
                <div className="tabular col-start-2 text-xs text-[var(--muted)] sm:col-start-auto sm:text-right">
                  {n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

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
        {/* The column set is ~26rem of fixed tracks — on a phone the table
            scrolls sideways inside the panel instead of clipping the Amount
            column behind overflow-hidden. */}
        <div className="panel overflow-x-auto">
          <div className="min-w-[27rem]">
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
                className="grid grid-cols-[6rem_1fr_3rem_9rem_7rem] items-center gap-2 border-b border-[var(--border)]/30 px-4 py-1.5 text-sm"
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
        </div>
      </section>
    </div>
  );
}
