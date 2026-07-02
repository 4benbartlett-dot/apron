const MODELED = [
  "2026-27 official thresholds: cap, luxury tax, first apron, second apron, MLEs, BAE, minimums",
  "All exception / tier amounts cross-checked against the CBA's own %-of-cap formulas (BAE 3.32%, NT-MLE 9.12%, Room MLE 5.678%, Taxpayer MLE, min-team 90%, max 25/30/35%)",
  "Trade salary matching — expanded bands (200%+$250k / outgoing+$7.5M / 125%+$250k)",
  "Apron teams limited to 100% matching (no 110%)",
  "Below-cap absorption capped at cap+$250k (or standard matching if larger)",
  "Hard-cap triggers: NT-MLE / BAE / sign-and-trade → first apron; Taxpayer MLE → second apron",
  "Second apron: no aggregation (bin-packing combination test), no cash out; exact-boundary tiers use strict 'exceeds'",
  "Exception gating by apron tier: cap room, NT-MLE, Taxpayer MLE, Room MLE, BAE, minimum, Bird",
  "Maximum-salary tiers by years of service (25% / 30% / 35%)",
  "Bird / Early-Bird / Non-Bird re-signing ceilings (175% / 120%-of-prior-or-min, etc.), with each FA's real Bird status + UFA/RFA from Spotrac",
  "Multi-year committed-salary cap sheet (4 seasons per team)",
  "Veteran extension & extend-and-trade first-year ceilings (140% / 120% of prior-or-estimated-average)",
  "Renegotiation ceiling (under-cap teams only, raise limited to cap room) and the stretch provision (2N+1 years, 15%-of-cap guardrail)",
  "Renounce free-agent cap holds to drop below an apron / open cap space; a kept own-FA hold converts to salary on re-sign (no double-count), and renouncing forfeits Bird rights",
  "Contract extensions add future years at the veteran-extension ceiling (140% rule, 8% raises)",
  "Free-agent cap holds by Bird status (Non-Bird 120% / Early-Bird 130% / Bird 150–190%)",
  "Trade eligibility: a free agent signed this offseason is trade-restricted; a just-acquired player can't be aggregated for ~2 months",
  "MLE / exception consumption tracking within an offseason session",
  "Sign-and-trade acquisition: second-apron block + first-apron hard cap on the acquiring team",
  "Base-year compensation: re-sign your own FA to a >20% raise over the cap, then trade — outgoing value = max(50% of new salary, prior salary)",
  "Trade kicker bonus boosts the acquiring team's incoming matching value (applied when kicker data is present)",
  "Sign-and-trade outgoing leg: build a return package to the FA's old team — validates both the acquirer's first-apron hard cap and the old team's salary matching",
  "Pick-ownership ledger: executed trades actually transfer draft picks; boards show real inventory",
  "Ted Stepien rule against full pick inventory — sees picks traded in PRIOR moves, not just the current proposal",
  "Restricted free agents: Gilbert Arenas first-year cap (1-2 YOS → NT-MLE) and a real match flow — the original team can match your offer sheet and keep the player at your terms",
  "Roster limits: 21-player offseason hard cap on signings, 15-by-opening-night warning",
  "Sign-and-trade contracts enforce the 3-year minimum length; extended players are trade-frozen 6 months",
  "Renegotiation Mar–Jun blackout window",
  "Validated against reality: every real July 1, 2026 trade, sign-and-trade, and signing replays as legal through the engine (see lib/realmoves.test.ts)",
];

const APPROXIMATE = [
  "Bird sub-type comes from Spotrac free-agent data for ~half of free agents; the rest default to full Bird",
  "Rookie-scale salaries are scaled estimates until the official 2026 scale posts",
  "Team salary totals include some non-guaranteed / dead-money rows from the source",
  "Years of service covers ~91% of players; the rest default to a mid-career value",
  "Early-Bird / extension average-salary alternative uses an estimated figure until the official one posts",
];

const NOT_MODELED = [
  "Pick protections & swap rights on ledger picks (protections shown in deal text; the ledger tracks unprotected ownership)",
  "The >10%-renegotiation-blocks-a-later-extension rule",
  "Traded-player exceptions as separate expiring objects",
  "Likely vs. unlikely incentives in matching / apron math",
  "Second-round pick exception & two-way contracts as signing mechanisms (reconciled from real data, not user-simulable)",
  "Poison-pill provision (engine function exists; not wired to the trade UI — needs structured extension data)",
  "Designated-player criteria (All-NBA/MVP triggers, 6-year DV extension length)",
];

function Section({
  title,
  color,
  mark,
  items,
  note,
}: {
  title: string;
  color: string;
  mark: string;
  items: string[];
  note: string;
}) {
  return (
    <section className="panel p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg font-bold" style={{ color }}>{mark}</span>
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-[var(--muted)]">({items.length})</span>
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">{note}</p>
      <ul className="space-y-1.5 text-sm">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span style={{ color }}>{mark}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AccuracyPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Rules Coverage &amp; Accuracy</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Exactly what the engine models, what's approximate, and what isn't modeled yet —
          verified by 50 golden tests and a multi-agent CBA stress-test. No hand-waving.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section
          title="Modeled &amp; tested"
          color="var(--tier-below_cap)"
          mark="✓"
          items={MODELED}
          note="Enforced by the rules engine and covered by unit/golden tests."
        />
        <Section
          title="Approximate"
          color="var(--tier-taxpayer)"
          mark="~"
          items={APPROXIMATE}
          note="Directionally correct; limited by available data. Flagged in-app."
        />
        <Section
          title="Not yet modeled"
          color="var(--tier-second_apron)"
          mark="✗"
          items={NOT_MODELED}
          note="Real CBA rules on the roadmap — the honest gap to front-office-complete."
        />
      </div>
    </div>
  );
}
