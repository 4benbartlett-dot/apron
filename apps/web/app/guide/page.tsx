import type { Metadata } from "next";
import Link from "next/link";
import { C } from "@/lib/league";
import { Thermometer } from "@/components/Thermometer";
import { Term } from "@/components/Term";

export const metadata: Metadata = {
  title: "How to play — Over the Apron",
  description:
    "Run an NBA front office under the real 2023 CBA: pick a team, read the cap sheet, make moves that build on each other, and get a rule citation with every verdict.",
};

function Play({
  n,
  title,
  children,
  delay,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <section className="fade-up panel relative overflow-hidden p-5 sm:p-6" style={{ animationDelay: `${delay}ms` }}>
      <div className="tabular pointer-events-none absolute -right-3 -top-6 select-none text-[96px] font-bold leading-none text-[var(--panel-2)]">
        {n}
      </div>
      <div className="relative">
        <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
        <div className="mt-2 max-w-2xl space-y-2.5 text-[13.5px] leading-relaxed">{children}</div>
      </div>
    </section>
  );
}

const chip =
  "tabular inline-block rounded-[4px] border border-[var(--border)] bg-[var(--panel-2)]/60 px-1.5 py-0.5 text-[11px] font-semibold";

export default function GuidePage() {
  return (
    <div className="pb-10">
      <div className="fade-up mb-6">
        <div className="label !text-[11px] text-[var(--accent-ink)]">How to play</div>
        <h1 className="mt-1 text-[clamp(24px,4vw,32px)] font-bold leading-tight tracking-tight">
          You run the front office. The CBA runs you.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          This is the NBA offseason with the real 2023 collective bargaining
          agreement enforced — live rosters, real cap sheets, and a verdict
          with a rule citation for every move you try. Here&rsquo;s the whole game
          in six plays. (Anything underlined or badge-shaped anywhere on the
          site can be tapped for a plain-English explainer.)
        </p>
      </div>

      <div className="space-y-4">
        <Play n={1} title="Take a job" delay={60}>
          <p>
            Pick a franchise — that&rsquo;s whose cap sheet, roster, free agents,
            and draft picks you inherit, exactly as they stand today. Bring
            trade partners onto the board with <span className={chip}>+ Add team</span> (up
            to eight), and switch jobs anytime via the logo or{" "}
            <span className={chip}>Switch team</span>.
          </p>
        </Play>

        <Play n={2} title="Read the cap sheet" delay={140}>
          <p>
            Every team card is a real ledger. The meter shows committed salary
            against the four lines that decide everything — tap any of them to
            learn what crossing it costs:
          </p>
          <div className="max-w-md pt-1">
            <Thermometer salary={215_000_000} c={C} />
          </div>
          <p className="text-[var(--muted)]">
            Below it: four seasons of commitments, the{" "}
            <Term k="cap_hold" underline className="text-[var(--text)]">cap holds</Term>{" "}
            your own free agents occupy, and chips for every signing tool the
            CBA currently allows this team — tap one, like the{" "}
            <Term k="ntmle" underline className="text-[var(--text)]">Non-Tax MLE</Term>, for the fine print.
          </p>
        </Play>

        <Play n={3} title="Make moves" delay={220}>
          <p>
            <strong>Trade</strong> — tap players (and draft-pick chips) to
            stage them; choose destinations when three-plus teams are on the
            board. <strong>Sign</strong> — every free agent shows the best
            legal mechanism and your true max offer. <strong>Extend</strong> —
            the <span className={chip}>EXT</span> tag opens a sheet capped by the 140% rule.{" "}
            <strong>Renounce</strong> — clear a hold to open room, at the cost
            of{" "}
            <Term k="bird" underline className="text-[var(--text)]">Bird rights</Term>.
            Stuck? The <span className={chip}>Trade finder</span> builds ranked legal
            packages for any target — including throw-ins coming back the
            other way.
          </p>
        </Play>

        <Play n={4} title="Every verdict cites the rule" delay={300}>
          <p>
            Stage anything and the stamp comes down:{" "}
            <span className="stamp mx-1 text-[11px] text-[var(--tier-below_cap)]">Legal trade</span>{" "}
            or{" "}
            <span className="stamp mx-1 text-[11px] text-[var(--tier-second_apron)]">Blocked</span>
            {" "}— never just &ldquo;no,&rdquo; always <em>which</em> rule: the{" "}
            <Term k="matching" underline className="text-[var(--text)]">matching band</Term>{" "}
            you failed by how many dollars, the aggregation ban, the freeze
            date, the Stepien rule.
          </p>
        </Play>

        <Play n={5} title="Moves build on each other" delay={380}>
          <p>
            This is the part no trade machine does: your offseason is one
            continuous timeline. Use the full MLE today and the{" "}
            <Term k="hard_cap" underline className="text-[var(--text)]">hard cap</Term>{" "}
            it triggers will block a perfectly-matched trade next week. Renounce
            a hold, trade a pick, match an offer sheet — every verdict is
            judged against everything you&rsquo;ve already done. Your running move
            list lives in the bar at the bottom; undo or remove any of it.
          </p>
        </Play>

        <Play n={6} title="Ship the receipt" delay={460}>
          <p>
            Hit <span className={chip}>Share card</span> on any verdict for a
            screenshot-ready filing: the deal, the stamp, and the exact rules
            it passes or breaks. Download it, copy the link, or post it —
            settle the group-chat argument with citations.
          </p>
        </Play>
      </div>

      <div className="fade-up mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--border)] pt-4 text-sm" style={{ animationDelay: "540ms" }}>
        <Link href="/" className="font-semibold text-[var(--accent-ink)] hover:underline">
          Start your offseason →
        </Link>
        <Link href="/glossary" className="text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
          Glossary: the CBA in plain English
        </Link>
        <Link href="/accuracy" className="text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]">
          Exactly what the engine enforces
        </Link>
      </div>
    </div>
  );
}
