import type { Metadata } from "next";
import { DATA_AS_OF } from "@apron/data";

export const metadata: Metadata = {
  title: "NBA CBA Rules Coverage & Accuracy | Over the Apron",
  description:
    "Which 2023 CBA rules the trade machine enforces, where the data is approximate, and which edge cases are still outside the live simulator.",
};

const MODELED = [
  "2026-27 thresholds: cap, luxury tax, first apron, second apron, MLEs, BAE, minimum salaries, and max-salary tiers",
  "Exception and tier amounts follow the CBA's percentage-of-cap formulas where the CBA defines them: BAE 3.32%, NT-MLE 9.12%, Room MLE 5.678%, minimum team salary 90%, and max tiers at 25/30/35%",
  "Trade salary matching: the expanded formula from Art. VII §6(j)(1)(iv), including the cap-grown middle band. The 2026-27 middle add-on is $9,095,709, not the original 2023-24 $7.5M figure",
  "One-year veteran minimums (3+ YOS) count at the 2-YOS minimum on the cap, tax, aprons, and trade matching — the league reimburses the team (Art. VII §3(f), Art. IV §6(h))",
  "Minimum-salary scale derives from the CBA's own escalator: prior year's scale × cap growth (Art. I (jj)), telescoped from the CBA's printed Exhibit C",
  "Real-world pick obligations: a first already owed away (or protected-out) is locked from your trade board, and its year counts as uncovered for the Stepien rule",
  "Traded-player exceptions: active TPEs from the data feed plus TPEs created by uneven trades in your session. Pre-existing TPE use is blocked above the first apron and hard-caps the team there; same-offseason TPEs are treated separately",
  "Offseason team state: cap-room teams lose the regular MLEs and BAE for the year; exceptions already spent in the feed stay spent; real hard caps from MLE/BAE and sign-and-trade activity carry into the simulator",
  "Apron teams limited to 100% matching (no 110%)",
  "Below-cap absorption capped at cap+$250k (or standard matching if larger)",
  "Hard-cap triggers: NT-MLE, BAE, sign-and-trade acquisition, expanded matching, pre-existing TPE use, and row-D regular-season waiver signings can create a first-apron cap; taxpayer MLE, row-H aggregation, and row-I cash can create a second-apron cap",
  "Art. VII §2 Apron Team Salary is a real derived layer: signed salary plus excluded performance-bonus addbacks and 0/1-YOS free-agent minimum addbacks, with explicit team-level adjustments for FA amounts, RFA tenders, first-round-pick/tender amounts, deemed-included exceptions, §4(l) exclusions, and incomplete-roster charges when the app/data layer supplies them",
  "Cap holds count against room (signing space and below-cap trade absorption) but never toward apron/tax status — the Art. VII §2 Apron Team Salary split",
  "Second apron: no aggregation or cash-out when the team finishes above the second apron after the trade. A team may aggregate or send cash only if the transaction lands it at or below the second apron, and that accepted move hard-caps it there",
  "Exception gating by apron tier: cap room, NT-MLE, Taxpayer MLE, Room MLE, BAE, minimum, Bird",
  "Maximum-salary tiers by years of service (25% / 30% / 35%)",
  "Bird / Early-Bird / Non-Bird re-signing ceilings (175% / 120%-of-prior-or-min, etc.), using sourced or curated Bird-rights status and UFA/RFA designation where available",
  "Multi-year committed-salary cap sheet (4 seasons per team)",
  "Veteran extension & extend-and-trade first-year ceilings (140% / 120% of prior-or-estimated-average)",
  "Renegotiation ceiling (under-cap teams only, raise limited to cap room) and the stretch provision (2N+1 years, 15%-of-cap guardrail)",
  "Renounce free-agent cap holds to drop below an apron / open cap space; a kept own-FA hold converts to salary on re-sign (no double-count), and renouncing forfeits Bird rights",
  "Contract extensions add future years at the veteran-extension ceiling (140% rule, 8% raises)",
  "Free-agent cap holds by Bird status (Non-Bird 120% / Early-Bird 130% / Bird 150–190%, rookie-scale QVFAs 250/300% per Art. VII §4(d)(1)(ii))",
  "Trade eligibility: a free agent signed this offseason is trade-restricted; a just-acquired player can't be aggregated for ~2 months",
  "MLE / exception consumption tracking within an offseason session",
  "Sign-and-trade acquisition: second-apron block + first-apron hard cap on the acquiring team, plus Art. VII §8(e)(1) contract-structure checks when facts are supplied (Veteran FA / prior-roster / 3-to-4 seasons / no NT-MLE or Room-MLE / first-year protection / pre-regular-season / 5th-Year-Higher-Max 25% cap / room for salary plus unlikely bonuses)",
  "Base-year compensation: re-sign your own FA to a >20% raise over the cap, then trade — outgoing matching value = max(50% of new salary, prior salary), while the sender's actual cap/apron salary removes the full cap hit",
  "Poison-pill rookie-scale extensions: when structured extension salaries are present, the acquiring team uses the Art. VII §8(g) average of current + extension salaries for matching/room value while actual post-trade cap/apron salary stays on the current-year hit",
  "Trade kicker bonus boosts the acquiring team's incoming matching value (applied when kicker data is present)",
  "Traded-player matching edge cases: the $250k allowance disappears if post-trade Apron Team Salary exceeds the first apron; non-guaranteed/deemed trade salary can be supplied separately from cap salary; outside Dec. 15 through the trade deadline, aggregating 3+ outgoing players for fewer replacements may include no more than one minimum traded player",
  "Sign-and-trade outgoing leg: build a return package to the FA's old team — validates both the acquirer's first-apron hard cap and the old team's salary matching",
  "Pick-ownership ledger: executed trades transfer draft picks inside the session, so later proposals see the updated inventory",
  "Ted Stepien rule against full pick inventory — sees picks traded in PRIOR moves, not just the current proposal",
  "Restricted free agents: Gilbert Arenas first-year cap (1-2 YOS → NT-MLE) and a real match flow — the original team can match your offer sheet and keep the player at your terms",
  "Regular-season waiver-market signing row D: if the terminated contract salary exceeded the NT-MLE, the signing is a first-apron transaction; the engine blocks it above the first apron and hard-caps it there when legal",
  "Second-apron draft-pick penalty helper: a second-apron season freezes the team's own first seven drafts out (2024-25 → 2032), and two repeat second-apron seasons in the next four move that pick to the end of the first round",
  "Roster limits: 21-player offseason hard cap on signings, 15-by-opening-night warning",
  "Sign-and-trade contracts enforce the 3–4 season term (§8(e)(1)(ii)) AND the acquirer must have room or match salary with the return package (§8(e)(1)(vii))",
  "Trade freezes per Art. VII §8(d)/(f): rookie signings 30 days; FA signings Dec 15; over-cap Bird re-signs at >120% until Jan 15; extensions beyond extend-and-trade limits 6 months; matched RFA offer sheets one year (§5(j))",
  "Renegotiation Mar–Jun blackout window",
  "Dead money (waived/stretched salary, e.g. Lillard's charge on Milwaukee's books) rides the cap sheet and counts against cap, tax, and apron lines, but is off the roster — never tradeable, extendable, or a phantom free agent",
  "Waive charges follow real guarantees, not listed salary (DeRozan's SAC charge is his $10M guarantee, not $25.7M) — and a stated dead-cap figure survives the player re-signing elsewhere (Isaac's $8M on ORL next to his new minimum)",
  "Mid-season 2025-26 waivers that are missing from the offseason transaction feed are curated so they do not create phantom cap holds",
  "Real signings are assigned to a mechanism, not just a dollar amount. For example, a deal above the BAE ceiling but below the NT-MLE is treated as NT-MLE use when the team context requires it",
  "Legal moves still show their consequences: hard caps, second-apron restrictions, TPE usage, and aggregation freezes can affect the next move in the session",
  "Representative July 2026 trades, sign-and-trades, and signings are checked against pre-move sheets. Remaining mismatches are treated as data reconstruction limits, not hidden verdict changes",
];

const APPROXIMATE = [
  "Bird sub-type (full / Early / Non-Bird) is sourced from public listings for 55% of current free agents; the rest default to full Bird — which can overstate a re-sign ceiling, never a trade verdict",
  "Rookie-scale salaries are scaled estimates until the official 2026 scale posts",
  "Years of service is sourced for 84% of rostered players; the rest default to a mid-career value (affects minimum-salary amounts and max tiers, not trade matching)",
  "Early-Bird / extension average-salary alternative uses an estimated figure until the official one posts",
  "Player value is \u201cApron Value\u201d: a 0-100 on-court scale built from box score and stint-level RAPM. It is benchmarked against BPM on a limited player-movement sample, and each value carries an uncertainty band",
  "Team strength is a current-roster projection, not a full-season forecast. It uses position-aware minutes, age, reported injuries, and a bounded fit adjustment for spacing, playmaking, defense, and two-way balance, then maps projected net rating to wins",
  "Model benchmarks are limited. The player model has not been tested head-to-head against public all-in-one metrics such as EPM, DARKO, LEBRON, RAPTOR, betting markets, or playoff outcomes",
  "Positions are data-driven: a player's primary spot is where he actually logged the most minutes (Basketball-Reference play-by-play position shares), and a genuine SECONDARY position is any spot he played \u226512% of his minutes at \u2014 so versatile players (a combo guard, a switchable forward) can slide in the rotation model. Players the play-by-play table misses fall back to BRef's assigned position, then the transactions feed, then a curated fallback for rostered players with no stat row; deep-bench flexibility falls back to adjacent spots",
  "Draft-pick values project the origin team\u2019s slot from roster strength (mean-reverting for far-out years) onto the same impact scale, risk- and time-discounted \u2014 the fairness meter sums impact per side",
  "Pick-obligation ledger is parsed from RealGM prose across the league; complex multi-team swap chains default to the most restrictive read",
  "TPE v1 approximations: one exception per team per trade, whole players only, minted amounts capped at the largest single outgoing salary; choosing WHICH traded player generates the exception is still simplified",
  "Rookie-scale hold detection uses an RFA-with-≤4-YOS heuristic for the 250/300% tier — the CBA keys it on the contract type, which the feed doesn't carry directly",
  "Where a room team's renounce set is ambiguous, the seed chooses a consistent prefer-largest-holds path and keeps per-team confidence in the data file",
  "The engine can calculate the full Art. VII §2(e) Apron Team Salary when detailed ledgers are supplied; the public dataset still lacks reliable per-player likely/unlikely/excluded-bonus feeds and some team-level tender/exception subtotals, so most live teams currently use zero for those rare adjustment buckets unless curated",
];

const NOT_MODELED = [
  "Swap mechanics & conditional incoming picks (an owed/protected-out own first is locked and Stepien-uncovered, but swaps don't resolve to outcomes, and acquired conditional firsts aren't counted as coverage)",
  "The >10%-renegotiation-blocks-a-later-extension rule",

  "Likely vs. unlikely incentives are typed in the engine, but the public contract feed does not reliably expose bonus buckets, so live-roster bonus math remains mostly zero-filled unless curated",
  "Second-round pick exception & two-way contracts have engine validators, but they are not yet user-simulable signing mechanisms in the offseason drawer",
  "Designated-player Higher Max criteria are engine-callable from All-NBA/DPOY/MVP inputs, but the UI does not yet expose full designated rookie/veteran extension workflows or the designated-player roster-count limits",
  "Second-apron frozen-pick / draft-penalty status is engine-callable from known end-of-season apron history, but the live trade board does not yet project future end-of-season second-apron status or automatically block that far-out pick in user inventory",
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
          What the engine models, what depends on incomplete public data, and what it does not model yet. Rosters and transactions are current to {DATA_AS_OF}.
        </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section
          title="Modeled"
          color="var(--tier-below_cap)"
          mark="✓"
          items={MODELED}
          note="Enforced by the rules engine or by the session state built on top of it."
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
          note="Real rules or data layers that remain outside the live simulator."
        />
      </div>
    </div>
  );
}
