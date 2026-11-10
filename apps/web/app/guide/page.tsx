import type { Metadata } from "next";
import Link from "next/link";
import { shortDate } from "@apron/cba-engine";
import { C, SIM_DATE, TRADE_DEADLINE } from "@/lib/league";
import { homeSeason } from "@/lib/phase";
import { provision } from "@/lib/provisions";
import { deadlineExample } from "@/lib/examples";
import { Thermometer } from "@/components/Thermometer";
import { Term } from "@/components/Term";
import { TeamLogo } from "@/components/TeamLogo";
import { Reveal } from "@/components/Reveal";
import { PlayWhenSeen } from "@/components/PlayWhenSeen";

export const metadata: Metadata = {
  title: "How to play — Over the Apron",
  description:
    "Run an NBA front office under the 2023 CBA: pick a team, read the cap sheet, make moves that build on each other, see the rule behind every verdict, and watch the playoff odds move.",
};

/** One play: call chip + title on the left, a live demo artifact on the right. */
function Play({
  n,
  title,
  demo,
  children,
}: {
  n: string;
  title: string;
  demo: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Reveal>
      <section className="panel overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,330px)] lg:grid-cols-[1fr_minmax(0,380px)]">
          <div className="p-5 sm:p-7">
            <span className="play-chip">Play {n}</span>
            <h2 className="mt-3 text-[19px] font-bold tracking-tight">{title}</h2>
            <div className="mt-2 space-y-2.5 text-[13.5px] leading-relaxed">{children}</div>
          </div>
          <PlayWhenSeen className="relative flex items-center justify-center border-t border-dashed border-[var(--border)] bg-[var(--panel-2)]/35 p-6 md:border-l md:border-t-0">
            {demo}
          </PlayWhenSeen>
        </div>
      </section>
    </Reveal>
  );
}

const chip =
  "tabular inline-block rounded-[4px] border border-[var(--border)] bg-[var(--panel-2)]/60 px-1.5 py-0.5 text-[11px] font-semibold";

/* ----------------------------- demos ---------------------------------- */

function DemoPicker() {
  return (
    <div className="w-full max-w-[300px]">
      <div className="label mb-2 text-center !text-[9px]">Whose front office?</div>
      <div className="grid grid-cols-4 gap-1.5">
        {["BOS", "NYK", "LAL", "OKC", "SAS", "GSW", "MIA", "DEN"].map((t, i) => (
          <div
            key={t}
            className={`flex items-center justify-center rounded-lg border py-2.5 ${
              i === 2
                ? "border-[var(--accent)] bg-[var(--panel)] shadow-[0_4px_12px_rgba(33,29,19,0.10)]"
                : "border-[var(--border)] bg-[var(--panel)]/60"
            }`}
          >
            <TeamLogo id={t} size={26} />
          </div>
        ))}
      </div>
      <div className="tabular mt-2 text-center text-[10px] text-[var(--muted)]">
        ↑ your problem now
      </div>
    </div>
  );
}

function DemoThermometer() {
  return (
    <div className="w-full max-w-[320px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold">Team salary</span>
        <span className="tabular total-rule text-[11px]">$215,000,000</span>
      </div>
      <div className="mt-2">
        <Thermometer salary={215_000_000} c={C} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10.5px]">
        <Term k="cap" className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-center">
          <span className="font-semibold">Cap</span> · the soft ceiling
        </Term>
        <Term k="tax" className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-center">
          <span className="font-semibold">Tax</span> · where it costs
        </Term>
        <Term k="first_apron" className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-center">
          <span className="font-semibold">1A</span> · lose your tools
        </Term>
        <Term k="second_apron" className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-center">
          <span className="font-semibold">2A</span> · the punishment
        </Term>
      </div>
    </div>
  );
}

function DemoStage() {
  const row = "flex items-center justify-between px-3 py-2 text-[12px]";
  return (
    <div className="w-full max-w-[300px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
      <div className={`${row} border-b border-[var(--border)]/60`}>
        <span>Stephen Curry</span>
        <span className="tabular text-[var(--muted)]">$62.6M</span>
      </div>
      <div className={`demo-stage ${row} border-b border-[var(--border)]/60`}>
        <span className="flex items-center gap-2">
          Moses Moody
          <span className="demo-stage-tag tabular text-[10px] font-bold text-[var(--tier-second_apron)]">→ MIA</span>
        </span>
        <span className="tabular text-[var(--muted)]">$12.5M</span>
      </div>
      <div className={row}>
        <span className="flex items-center gap-2">
          Al Horford
          <span className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-[0.05em]" style={{ color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 12%, transparent)" }}>
            NO-TRADE
          </span>
        </span>
        <span className="tabular text-[var(--muted)]">$6.8M</span>
      </div>
      <div className="border-t border-dashed border-[var(--border)] px-3 py-1.5 text-center text-[10px] text-[var(--muted)]">
        tap a player → he&rsquo;s in the deal
      </div>
    </div>
  );
}

function DemoStamps() {
  const rule = provision("second-apron-aggregation");
  return (
    <div className="flex w-full max-w-[320px] flex-col items-center gap-4 py-2">
      <div className="grid h-14 w-full place-items-center">
        <span className="stamp stamp-loop col-start-1 row-start-1 text-[17px] text-[var(--tier-below_cap)]">
          Legal trade
        </span>
        <span className="stamp stamp-loop-b col-start-1 row-start-1 text-[17px] text-[var(--tier-second_apron)]">
          Blocked
        </span>
      </div>
      <div className="w-full space-y-1.5 text-[11px] leading-snug">
        <div className="flex gap-1.5">
          <span className="font-bold text-[var(--tier-below_cap)]">✓</span>
          <span className="text-[var(--muted)]">legal under expanded matching, 125% + $250k band</span>
        </div>
        <div className="flex gap-1.5">
          <span className="font-bold text-[var(--tier-second_apron)]">✗</span>
          <span className="text-[var(--muted)]">over the second apron — salaries cannot be aggregated</span>
        </div>
      </div>
      {/* The block comes with its address: the citation and the agreement's
          own words, timed to the Blocked stamp. */}
      {rule && (
        <div className="demo-cite w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-[10.5px] leading-snug">
          <div className="tabular font-semibold">2023 CBA {rule.cite}</div>
          <div className="mt-0.5 text-[var(--muted)]">&ldquo;{rule.text}&rdquo;</div>
        </div>
      )}
    </div>
  );
}

/** "2027-02-11" → "Feb. 11". */
const md = (iso: string) => shortDate(iso).replace(/, \d{4}$/, "");

/** The board's day switch: one roster row, judged today and at the deadline.
 * The row is a real player whose freeze lifts in between, when today's data
 * has one; the same found-not-written example the About page opens. */
function DemoDay() {
  const ex = deadlineExample();
  const name = ex?.frozen.name ?? "A summer signing";
  const until = ex ? md(ex.tradeableFrom) : "Dec. 15";
  const tag = "col-start-1 row-start-1 justify-self-end rounded-[3px] px-1.5 py-px text-[8.5px] font-bold uppercase tracking-[0.05em]";
  return (
    <div className="w-full max-w-[310px]">
      <div className="mx-auto flex w-fit overflow-hidden rounded-md border border-[var(--border-strong)] text-[10.5px] font-semibold">
        <span className="demo-day-a tabular px-2.5 py-1.5">Today · {md(SIM_DATE)}</span>
        <span className="demo-day-b tabular border-l border-[var(--border-strong)] px-2.5 py-1.5">Deadline · {md(TRADE_DEADLINE)}</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-[12px]">
          <span className="min-w-0 truncate">{name}</span>
          <span className="grid shrink-0">
            <span className={`demo-day-locked ${tag}`} style={{ color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 12%, transparent)" }}>
              Locked · {until}
            </span>
            <span className={`demo-day-free ${tag}`} style={{ color: "var(--tier-below_cap)", background: "color-mix(in srgb, var(--tier-below_cap) 14%, transparent)" }}>
              Tradeable
            </span>
          </span>
        </div>
      </div>
      <div className="mt-2.5 text-center text-[10px] text-[var(--muted)]">same roster, judged on a different day</div>
    </div>
  );
}

/** Playoff odds rerunning after a move. Illustrative numbers. */
function DemoOdds() {
  return (
    <div className="w-full max-w-[300px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold">Playoff odds</span>
        <span className="tabular grid text-[14px] font-bold">
          <span className="demo-odds-before col-start-1 row-start-1 text-right">41%</span>
          <span className="demo-odds-after col-start-1 row-start-1 text-right text-[var(--tier-below_cap)]">58%</span>
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel-2)]">
        <div className="demo-odds-bar h-full w-full rounded-full bg-[var(--accent)]" />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10.5px] text-[var(--muted)]">
        <span>the rest of the season, played 5,000 times</span>
        <span className="demo-odds-delta tabular font-bold text-[var(--tier-below_cap)]">+17</span>
      </div>
    </div>
  );
}

function DemoTimeline() {
  const card =
    "rounded-md border bg-[var(--panel)] px-2.5 py-1.5 text-[10.5px] font-semibold leading-tight";
  return (
    <div className="w-full max-w-[320px]">
      <div className="relative mb-1 h-4">
        <div className="demo-capline absolute inset-x-0 top-1/2 border-t-2 border-dashed border-[var(--tier-second_apron)]" />
        <span className="tabular absolute right-0 top-full text-[9px] font-bold uppercase tracking-wide text-[var(--tier-second_apron)]">
          hard cap · first apron
        </span>
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        <div className={`${card} border-[var(--tier-taxpayer)]`}>
          Mon
          <div className="font-normal text-[var(--muted)]">Sign with the MLE</div>
        </div>
        <span className="text-[var(--muted)]">→</span>
        <div className={`${card} border-[var(--border)]`}>
          Wed
          <div className="font-normal text-[var(--muted)]">Bird re-sign</div>
        </div>
        <span className="text-[var(--muted)]">→</span>
        <div className={`${card} border-[var(--tier-second_apron)]`}>
          Fri
          <div className="font-normal text-[var(--tier-second_apron)]">Trade BLOCKED</div>
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] text-[var(--muted)]">
        Monday&rsquo;s signing killed Friday&rsquo;s trade. The board remembers.
      </div>
    </div>
  );
}

function DemoCard() {
  return (
    <div className="w-full max-w-[280px] rotate-[-1.2deg] rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 shadow-[0_10px_28px_rgba(33,29,19,0.14)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold">Over the Apron</span>
        <span className="stamp text-[9px] text-[var(--tier-below_cap)]">Legal trade</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {[["BOS", "gets $49.8M"], ["LAL", "gets $58.5M"]].map(([t, s]) => (
          <div key={t} className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold">
              <TeamLogo id={t!} size={14} /> {t}
            </span>
            <span className="tabular text-[9.5px] text-[var(--muted)]">{s}</span>
          </div>
        ))}
      </div>
      <div className="tear mt-2 flex justify-between pt-1.5 text-[8px] uppercase tracking-wider text-[var(--muted)]">
        <span>Filed · 2023 CBA</span>
        <span>overtheapron.com</span>
      </div>
    </div>
  );
}

/* ------------------------------ page ---------------------------------- */

export default function GuidePage() {
  // The board's verbs change with the league year: an offseason is renounced
  // and extended into; a season is traded and waived through.
  const offseason = homeSeason() === "offseason";
  const start = offseason ? "Start your offseason" : "Open the trade board";
  return (
    <div className="pb-12">
      {/* hero */}
      <Reveal>
        <div className="relative mb-8 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] px-6 py-10 sm:px-10">
          <svg viewBox="0 0 64 64" aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-[280px] w-[280px] opacity-[0.06]">
            <line x1="11" y1="41" x2="53" y2="41" stroke="var(--accent)" strokeWidth="4.5" strokeDasharray="7.5 6" strokeLinecap="round" />
            <path d="M13 54 C 20 25, 37 14, 50 22" fill="none" stroke="var(--text)" strokeWidth="5" strokeLinecap="round" />
            <circle cx="50.5" cy="21.5" r="6.5" fill="var(--text)" />
          </svg>
          <div className="relative max-w-2xl">
            <div className="label !text-[11px] text-[var(--accent-ink)]">The playbook · eight plays</div>
            <h1 className="mt-2 text-[clamp(26px,4.5vw,40px)] font-bold leading-[1.05] tracking-tight">
              You run the front office.
              <br />
              The CBA runs you.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              Live rosters, real cap sheets, and the 2023 CBA rules that decide what a team can do. Anything underlined or badge-shaped can be tapped for a plain-English explainer.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {/* active: as well as hover: — Tailwind v4 emits the hover variant
                  inside @media (hover: hover), so on a phone these rules are not
                  merely unreachable, they are never applied, and the global press
                  rule is button:active, which cannot match a Link. Without this
                  the primary CTA acknowledges a tap with nothing at all. */}
              <Link href="/" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-[filter,transform] hover:brightness-95 active:translate-y-px active:brightness-95">
                {start}
              </Link>
              <Link href="/rules" className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold transition-[border-color,transform] hover:border-[var(--text)] active:translate-y-px active:border-[var(--text)]">
                Read the rules
              </Link>
              <Link href="/glossary" className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold transition-[border-color,transform] hover:border-[var(--text)] active:translate-y-px active:border-[var(--text)]">
                Glossary
              </Link>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="space-y-5">
        <Play n="01" title="Take a job" demo={<DemoPicker />}>
          <p>
            Pick a franchise — that&rsquo;s whose cap sheet, roster, free agents,
            and draft picks you inherit from the current data. Bring
            trade partners onto the board with <span className={chip}>+ Add team</span> (up
            to eight), and switch jobs anytime via the logo or{" "}
            <span className={chip}>Switch team</span>.
          </p>
        </Play>

        <Play n="02" title="Read the cap sheet" demo={<DemoThermometer />}>
          <p>
            Each team card is a ledger: the salary meter against the four
            lines that decide everything, four seasons of commitments, your own
            free agents&rsquo;{" "}
            <Term k="cap_hold" underline className="text-[var(--text)]">cap holds</Term>,
            and chips for the signing tools the CBA currently allows this
            team. Tap any number, badge, or line — the fine print pops up where
            you&rsquo;re standing.
          </p>
        </Play>

        <Play n="03" title="Make moves" demo={<DemoStage />}>
          <p>
            <strong>Trade</strong> — tap players and pick chips to stage them.{" "}
            <strong>Sign</strong> — free agents show the best legal
            mechanism and your true max offer. <strong>Extend</strong> — the{" "}
            <span className={chip}>EXT</span> tag opens a sheet capped by the 140% rule.{" "}
            <strong>Waive</strong> — the <span className={chip}>WV</span> tag shows what stays on the books, to the day.{" "}
            <strong>Renounce</strong> — clear a hold to open room, at the cost of{" "}
            <Term k="bird" underline className="text-[var(--text)]">Bird rights</Term>.
            Stuck? The <span className={chip}>Trade finder</span> builds ranked
            legal packages — throw-ins included.
          </p>
        </Play>

        <Play n="04" title="See why a move passes or fails" demo={<DemoStamps />}>
          <p>
            Stage a move and the stamp comes down — not just &ldquo;no,&rdquo;
            but the rule behind the result when one applies: the{" "}
            <Term k="matching" underline className="text-[var(--text)]">matching band</Term>{" "}
            you failed by how many dollars, the aggregation ban, the freeze
            date, the Stepien rule. A block comes with its address: the article
            and section, and the sentence of the agreement that decides it. All
            of them are on <Link href="/rules" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-ink)]">the rules page</Link>,
            in plain English.
          </p>
        </Play>

        <Play n="05" title="Today, or the deadline" demo={<DemoDay />}>
          <p>
            A player who just signed can&rsquo;t be traded yet, and one a team
            just traded for can&rsquo;t be packaged with a teammate. Every one
            of those freezes has a date. Flip the board from{" "}
            <span className={chip}>Today</span> to{" "}
            <span className={chip}>Trade deadline</span> and it judges the same
            deal on {md(TRADE_DEADLINE)}, with every freeze that lifts by then
            lifted. A link you share carries the day with it.
          </p>
        </Play>

        <Play n="06" title="Moves build on each other" demo={<DemoTimeline />}>
          <p>
            Your moves are one continuous timeline. Use the full MLE today and the{" "}
            <Term k="hard_cap" underline className="text-[var(--text)]">hard cap</Term>{" "}
            it triggers will block a perfectly matched trade next week. Each
            verdict is judged against the moves you&rsquo;ve already made — your
            move list lives in the bar at the bottom, undo-able move by move.
          </p>
        </Play>

        <Play n="07" title="Watch the odds move" demo={<DemoOdds />}>
          <p>
            Every team&rsquo;s record is projected from its roster and updated
            with each real result, and the rest of the season is played out
            5,000 times for playoff, play-in and title odds. Make a move and
            the odds rerun with it, so a trade shows what it is worth in wins
            before you file it. The full table is on{" "}
            <Link href="/standings" className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-ink)]">Standings</Link>.
          </p>
        </Play>

        <Play n="08" title="Ship the receipt" demo={<DemoCard />}>
          <p>
            Hit <span className={chip}>Share card</span> on any verdict for a
            screenshot-ready filing: the deal, the stamp, and the rules it
            passes or breaks. Download it, copy the link, or post it — settle
            the group chat with citations.{" "}
            <span className={chip}>Share offseason</span> sends every move you
            have made as one link; opening someone else&rsquo;s never costs you
            your own.
          </p>
        </Play>
      </div>

      <Reveal>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border)] pt-5 text-sm">
          <Link href="/" className="font-semibold text-[var(--accent-ink)] hover:underline">
            {start} →
          </Link>
          <Link href="/glossary" className="text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
            Glossary
          </Link>
          <Link href="/rules" className="text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
            The rules, by article
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
