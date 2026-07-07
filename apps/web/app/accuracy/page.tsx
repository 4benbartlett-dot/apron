import type { Metadata } from "next";
import { DATA_AS_OF } from "@apron/data";

export const metadata: Metadata = {
  title: "NBA CBA Rules Coverage & Accuracy — 216 Tests Against the 2023 CBA | Over the Apron",
  description:
    "Exactly which 2023 CBA rules the trade machine enforces, what's approximate, and what isn't modeled — verified by 216 unit tests and real July 2026 move replays.",
};

const MODELED = [
  "2026-27 official thresholds: cap, luxury tax, first apron, second apron, MLEs, BAE, minimums",
  "All exception / tier amounts cross-checked against the CBA's own %-of-cap formulas (BAE 3.32%, NT-MLE 9.12%, Room MLE 5.678%, Taxpayer MLE, min-team 90%, max 25/30/35%)",
  "Trade salary matching — the CBA's exact expanded formula, greater of ( lesser of (200%+$250k, outgoing+$7.5M×cap-growth), 125%+$250k ) — the \"$7.5M\" escalates to $9,095,709 in 2026-27 (Art. VII §6(j)(1)(iv)); most machines still use the stale 2023-24 figure",
  "One-year veteran minimums (3+ YOS) count at the 2-YOS minimum on the cap, tax, aprons, and trade matching — the league reimburses the team (Art. VII §3(f), Art. IV §6(h))",
  "Minimum-salary scale derives from the CBA's own escalator: prior year's scale × cap growth (Art. I (jj)), telescoped from the CBA's printed Exhibit C",
  "Real-world pick obligations: a first already owed away (or protected-out) is locked from your trade board, and its year counts as uncovered for the Stepien rule",
  "Traded-player exceptions: the real league-wide ledger (65 active TPEs, Spotrac \u00d7 SalarySwish cross-checked) plus TPEs your own uneven trades mint — the sim auto-absorbs incoming salary into your biggest usable exception; pre-existing TPEs are barred above the first apron and hard-cap you there (restriction row F), same-offseason ones aren't; room teams lost theirs with the room (\u00a76(n)(2))",
  "Feed-derived offseason state, all 30 teams audited: cap-room teams lose the MLEs/BAE for the year (\u00a76(n)(1), \u00a76(g)(3)); exceptions the real July spent stay spent (BOS/SAS/PHI's NT-MLE, GSW's BAE, LAL's Room MLE\u2026); S&T and MLE/BAE acquisitions carry their in-world hard caps; demonstrated room spending marks the holds it required as renounced",
  "Apron teams limited to 100% matching (no 110%)",
  "Below-cap absorption capped at cap+$250k (or standard matching if larger)",
  "Hard-cap triggers: NT-MLE / BAE / sign-and-trade / taking back >100% in a trade (Expanded TPE) → first apron; Taxpayer MLE → second apron — persisted across the whole session and tested against APRON salary (holds excluded)",
  "Cap holds count against room (signing space and below-cap trade absorption) but never toward apron/tax status — the Art. VII §2 Apron Team Salary split",
  "Second apron: no aggregation or cash-out, tested on POST-trade apron salary per Art. VII \u00a72(e)(2)(i)(A) \u2014 a team may aggregate down through the line (bin-packing combination test); exact-boundary tiers use strict 'exceeds'",
  "Exception gating by apron tier: cap room, NT-MLE, Taxpayer MLE, Room MLE, BAE, minimum, Bird",
  "Maximum-salary tiers by years of service (25% / 30% / 35%)",
  "Bird / Early-Bird / Non-Bird re-signing ceilings (175% / 120%-of-prior-or-min, etc.), with each FA's real Bird-rights status and UFA/RFA designation",
  "Multi-year committed-salary cap sheet (4 seasons per team)",
  "Veteran extension & extend-and-trade first-year ceilings (140% / 120% of prior-or-estimated-average)",
  "Renegotiation ceiling (under-cap teams only, raise limited to cap room) and the stretch provision (2N+1 years, 15%-of-cap guardrail)",
  "Renounce free-agent cap holds to drop below an apron / open cap space; a kept own-FA hold converts to salary on re-sign (no double-count), and renouncing forfeits Bird rights",
  "Contract extensions add future years at the veteran-extension ceiling (140% rule, 8% raises)",
  "Free-agent cap holds by Bird status (Non-Bird 120% / Early-Bird 130% / Bird 150–190%, rookie-scale QVFAs 250/300% per Art. VII §4(d)(1)(ii))",
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
  "Sign-and-trade contracts enforce the 3–4 season term (§8(e)(1)(ii)) AND the acquirer must have room or match salary with the return package (§8(e)(1)(vii))",
  "Trade freezes per Art. VII §8(d)/(f): rookie signings 30 days; FA signings Dec 15; over-cap Bird re-signs at >120% until Jan 15; extensions beyond extend-and-trade limits 6 months; matched RFA offer sheets one year (§5(j))",
  "Renegotiation Mar–Jun blackout window",
  "Dead money (waived/stretched salary, e.g. Lillard's charge on Milwaukee's books) rides the cap sheet and counts against every line, but is off the roster — never tradeable, extendable, or a phantom free agent",
  "Waive charges follow real guarantees, not listed salary (DeRozan's SAC charge is his $10M guarantee, not $25.7M) — and a stated dead-cap figure survives the player re-signing elsewhere (Isaac's $8M on ORL next to his new minimum)",
  "Mid-season 2025-26 waivers (invisible to the offseason transactions window) are curated so they can't synthesize phantom cap holds — the Saric class, from a community report",
  "Real July signings are audited for the exception they actually used, not just the dollar figure — Sacramento's Achiuwa deal ($5.6M, above the BAE ceiling) is the Non-Tax MLE, so it hard-caps them at the first apron the same July they waived DeRozan to open it (the 14th capped team)",
  "Every move surfaces its durable consequences even when it's legal — a heads-up when a trade or signing hard-caps a team (expanded matching, a pre-existing TPE, the NT-MLE/BAE, a sign-and-trade), turns on the second-apron restrictions, or locks acquired players from aggregation for ~2 months",
    "Validated against reality: the real July 1, 2026 trades and sign-and-trades replay as legal through the engine, and 20 of 24 in-data signings do too — the four that miss (Grimes and Mamukelashvili's renounce-created cap room, Oubre's ~$65k reported-total rounding, Kennard's PHX headroom) are sheet-reconstruction bounds, not rule failures, each pinned by name in lib/realmoves.test.ts",
];

const APPROXIMATE = [
  "Bird sub-type (full / Early / Non-Bird) is sourced from public listings for 55% of current free agents; the rest default to full Bird — which can overstate a re-sign ceiling, never a trade verdict",
  "Rookie-scale salaries are scaled estimates until the official 2026 scale posts",
  "Years of service is sourced for 84% of rostered players; the rest default to a mid-career value (affects minimum-salary amounts and max tiers, not trade matching)",
  "Early-Bird / extension average-salary alternative uses an estimated figure until the official one posts",
  "Player impact = box score blended 50/50 with real stint-level RAPM (5-man lineups reconstructed from play-by-play, possession-weighted ridge), scaled so the league’s best reads 100, replacement ≈ 0, and net-negative players below zero — a talent gauge, not a contract measure. It beats BPM at predicting a player’s impact after he changes teams (the edge is real but modest; the RAPM-overlap sample is small). ~85% of rostered players carry the full metric or its validated box half; the rest are box- or draft-slot-projected and flagged approximate on hover. Minutes-regularized so a small-sample bench spark doesn’t read as a star",
  "Positions (PG/SG/SF/PF/C) are a single primary label from Basketball-Reference; a handful of players who didn\u2019t play in 2025-26 are hand-tagged",
  "Draft-pick values project the origin team\u2019s slot from roster strength (mean-reverting for far-out years) onto the same impact scale, risk- and time-discounted \u2014 the fairness meter sums impact per side",
  "Pick-obligation ledger is parsed from RealGM prose (all 30 teams; classifications are regex over scraped text \u2014 the gnarliest multi-team swap chains default to the most restrictive read)",
  "TPE v1 approximations: one exception per team per trade, whole players only, minted amounts capped at the largest single outgoing salary; aggregated-TPE row H and choosing WHICH traded player generates the exception aren't modeled",
  "Rookie-scale hold detection uses an RFA-with-≤4-YOS heuristic for the 250/300% tier — the CBA keys it on the contract type, which the feed doesn't carry directly",
  "Where a room team's renounce set is ambiguous (which specific holds it shed), the audited seed follows a prefer-largest rule \u2014 per-team confidence and the full per-signing audit trail live in the data file (the one prior low-confidence flag — BKN's room math — resolved on Jul 6: a missed Claxton trade leg was inflating their sheet by $23.1M)",
  "Apron classification uses signed team salary; the CBA's full \u201cApron Team Salary\u201d adds small adjustments we don't model (e.g. 0-1 YOS minimum signings bump UP to the 2-YOS minimum for tax/apron purposes per \u00a72(d)(1)(i)(F), performance-bonus add-backs)",
];

const NOT_MODELED = [
  "Swap mechanics & conditional incoming picks (an owed/protected-out own first is locked and Stepien-uncovered, but swaps don't resolve to outcomes, and acquired conditional firsts aren't counted as coverage)",
  "The >10%-renegotiation-blocks-a-later-extension rule",

  "Likely vs. unlikely incentives in matching / apron math",
  "Second-round pick exception & two-way contracts as signing mechanisms (reconciled from real data, not user-simulable)",
  "Poison-pill provision (engine function exists; not wired to the trade UI — needs structured extension data)",
  "Designated-player criteria (All-NBA/MVP triggers, 6-year DV extension length)",
  "The lingering hard cap a team accepts by aggregating down through the second apron (the verdict is correct; the season-long cap it creates isn't tracked)",
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
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-bold tracking-tight">Rules Coverage &amp; Accuracy</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Exactly what the engine models, what's approximate, and what isn't modeled yet — rosters as of {DATA_AS_OF} —
          verified by 216 unit tests against the CBA's own text, and by replaying real 2026 free-agency moves through the engine. No hand-waving.
        </p>
        </div>
        <span className="stamp stamp-in mt-1 text-[13px] text-[var(--tier-below_cap)]">Audited · 216 tests</span>
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
