import type { Metadata } from "next";
import { DATA_AS_OF } from "@apron/data";
import { C } from "@/lib/league";
import { fmtFull } from "@/lib/format";

export const metadata: Metadata = {
  title: "NBA CBA Rules Coverage & Accuracy | Over the Apron",
  description:
    "What Over the Apron gets right about the 2023 CBA, where the public data forces an estimate, and which edge cases aren't in the board yet.",
};

// Plain-language, GM-facing summaries. The rule-by-rule specifics live in the
// collapsible "fine print" at the bottom for anyone who wants to check the math.
const COVERED = [
  "Every 2026-27 money line — the cap, luxury tax, both aprons, the mid-level and bi-annual exceptions, minimum salaries, and the max tiers — set from the CBA's own percentage-of-cap formulas, not typed in by hand.",
  `Trade matching with the real expanded math — including the middle band that grows with the cap to ${fmtFull(C.tradeMatch.escalatedFlatAddOn)} for 2026-27, not the flat $7.5M from 2023-24.`,
  "What each apron actually costs you: over the first apron you lose expanded matching and can't bring a player in by sign-and-trade; over the second you also can't combine salaries or send cash.",
  "Every move that hard-caps a team, enforced for the rest of the season. Using the mid-level or bi-annual, taking a player by sign-and-trade, or taking back extra salary caps you at the first apron; the taxpayer mid-level, combining salaries in a trade, or sending cash caps you at the second.",
  "Traded-player exceptions — the real league-wide ledger, plus any your own lopsided trades create — applied for you to absorb an incoming salary.",
  "Sign-and-trades end to end: the acquiring team's hard cap, the contract length and structure limits, base-year compensation when you re-sign then trade a player, and poison-pill rookie extensions.",
  "Re-signing your own free agents at their real Bird, Early-Bird, or Non-Bird ceilings — and the cap holds those rights keep on your books until you re-sign or renounce them.",
  "Extensions, each with their own year limits, raise limits, and the extend-and-trade freeze window.",
  "Draft picks that behave like the real thing: a pick you already owe is off your board, the Stepien rule stops you trading away first-rounders two years running, and every trade updates who owns what for the moves that follow.",
  "Waive a player yourself and the guaranteed money sticks to your books as dead money — counting against the cap, tax, and apron — following the real guarantee, not the listed salary. Choose to stretch it and it spreads evenly over 2N+1 years under the 15%-of-cap guardrail, right alongside the real 2025-26 waives and stretches already on the sheet.",
  "Your actual July 2026 starting point: which teams already spent an exception, who is hard-capped and why, and which cap-room teams gave up their mid-level and bi-annual for the year.",
];

const APPROXIMATE = [
  "Gary Trent Jr.'s four-year deal with Milwaukee is on the board as a done deal while the league reviews it for circumvention, and it could be unwound; it is booked the way every public roster page books it. The Clippers' review is over: the September 2 ruling left Kawhi Leonard's contract intact, so he is a Raptor here for good, and the five forfeited first-round picks sit on the Clippers' ledger as forfeited — locked from the board, and counted as years without a first for the Stepien rule. That last part is the conservative read: the league has not said whether a forfeited year is exempt from the consecutive-years test.",
  "Injury availability is projected from the injury's TYPE and DATE, not from games missed last season. A torn Achilles, ACL, patellar tendon, or a microfracture is assumed to cost twelve months from the day it happened, so one suffered late in a season eats into the next one; everything else is treated as healed by opening night. That is a rule of thumb, not a medical opinion, and it can't know about a setback or an early return.",
  "Apron Value — the 0–100 number on every player — is a rough read on impact from box scores and lineup data. It leans on BPM and carries an uncertainty band; it isn't trying to outdo the big public metrics like EPM or DARKO.",
  "A team's projected record is a read on the roster as it stands today — not a full-season forecast. There's no coaching, chemistry, or playoff translation baked in.",
  "How wrong that projection can be, measured rather than guessed: about 3.5 points of net rating, which is roughly SEVEN WINS either way. The model was tested against 240 team-seasons (2018-19 through 2025-26) by predicting each season using only what the players had done in the two seasons before it, and never training on the year it was grading. It explains a little over half the variation in team net rating. Two teams three or four wins apart in these standings are not meaningfully different, and shouldn't be read as if they are.",
  "The projection is built from two things: the talent in a team's projected rotation, and its perimeter defense, each measured against the league and then scaled so the spread of the standings matches what real net ratings actually do. A team-fit term used to sit alongside them and no longer does — across those 240 team-seasons it made predictions no better than leaving it out, and its own weight swung wildly depending on which season was held back. Fit is still computed and still shown on the board, because it's a real read on how a roster goes together; it just isn't allowed to move a projected record any more.",
  "Four known soft spots in that calibration, none of which change the conclusion: player positions in past seasons are taken from this season's; the historical talent measure is a simpler version of the Apron Value the site shows you; two of the eight seasons are the bubble and the 72-game year; and historical rosters mean everyone who played that season, including midseason arrivals.",
  "A rookie has no NBA minutes yet, so his value, fit, and playing time are projected from draft slot, college production, and scouting consensus — a read on his rookie year, not a ceiling. Most rookies grade out below average, top picks near it.",
  "A handful of recently retired or overseas veterans (Dwight Howard, Serge Ibaka, and the like) are on the free-agent board as minimum-deal flyers, valued for the realistic drop since their last NBA season — a 40-year-old Dwight reads as a deep-bench center, not the DPOY version.",
  "Positions come from where a player actually logged his minutes; a real second position is any spot he played at least ~12% of the time. Players without enough tracked minutes fall back to their listed position.",
  "Draft-pick trade value is projected from each team's strength, discounted for risk and how far out the pick is — the fairness meter just adds it up per side.",
  "Some traded-player-exception details are simplified: one exception per team per trade, whole players only.",
  "Any use of the non-taxpayer mid-level hard-caps the team at the first apron here. The real rule is softer in one narrow case: a use within the taxpayer MLE's size and 2-year length can later be re-characterized as the taxpayer MLE (Art. VII §6(f)(5)), trading the first-apron cap for a second-apron one.",
  "A matched offer sheet freezes the player from trades outright for a year here; the real rule is no trade without the player's consent — and never to the team that made the offer.",
  "A few fine adjustments to a team's apron salary need per-player bonus data that public feeds don't carry. When it isn't public, those small adjustments are left out rather than guessed.",
  "Which apron tier a team sits in is measured on salary actually signed. Cap holds for free agents you haven't re-signed or renounced still count against your room to sign and absorb, but they don't move you up an apron tier here. Denver is the live example: after matching Spencer Jones' offer sheet they read as a first-apron team on signed salary, while reporting places them in the second — the difference is Peyton Watson's unrenounced hold, which they're keeping on purpose while they try to bring him back.",
  "Reported deals are public as a term and a total, so the first-year salary is back-solved from the raise the deal is entitled to — 8% re-signing with your own team on Bird or Early Bird rights, 5% otherwise, including matched offer sheets and anything paid with an exception. That lands the big ones exactly (Austin Reaves' 4-year max back-solves to the 25% figure to the dollar), but a deal with unusual year-to-year structure — flat, declining, or front-loaded — is smoothed into standard raises.",
];

const NOT_INCLUDED = [
  "Pick-swap outcomes and conditional incoming picks. You can trade swap rights on the board, but a swap never resolves to a final pick slot, and a conditional first you'd acquire isn't counted as Stepien coverage.",
  "Incentive bonuses. Public contracts don't reliably say which bonuses count as likely or unlikely, so bonus money stays out of the live totals.",
  "Signing second-round-pick exceptions and two-way contracts — you can't do those from the offseason drawer yet.",
  "Designated “supermax” extensions — you can't build one from the board yet.",
  "Freezing a future first-round pick for a second-apron team at all — the rule is modeled in the rules engine, but the board doesn't apply it to any pick yet, so a frozen first can still be traded here.",
];

// The rule-by-rule specifics, grouped. Collapsed by default — transparency for
// anyone who wants to check a verdict against the CBA, without dumping a coverage
// matrix onto the main page.
const FINE_PRINT: { group: string; items: string[] }[] = [
  {
    group: "Money lines & exceptions",
    items: [
      "Exception and tier amounts follow the CBA's percentage-of-cap formulas: bi-annual 3.32%, non-taxpayer mid-level 9.12%, room mid-level 5.678%, minimum team salary 90% of the cap, max tiers at 25/30/35% by years of service (Art. VII §6, Art. II §7).",
      `Minimum salaries and the first-round rookie scale are the official 2026-27 figures (rookies at the standard 120% of scale, off the ${fmtFull(C.salaryCap)} cap).`,
      "One-year veteran minimums (3+ years of service) count at the two-year minimum on the cap, tax, aprons, and trade matching; the league reimburses the difference (Art. VII §3(f), Art. IV §6(h)).",
      "Exceptions are gated by apron tier: cap room, non-taxpayer mid-level, taxpayer mid-level, room mid-level, bi-annual, minimum, and Bird.",
    ],
  },
  {
    group: "Trades & matching",
    items: [
      `The expanded matching formula, greater of (lesser of (200% + $250k, outgoing + ${fmtFull(C.tradeMatch.escalatedFlatAddOn)}), 125% + $250k), for teams below the aprons; strict 100% at or above either apron.`,
      "The $250k matching allowance disappears once a team's apron salary would clear the first apron after the trade (Art. VII §6(j)(3)).",
      "Base-year compensation: re-sign your own free agent to a raise over 20%, then trade him, and his outgoing matching value drops to the greater of half the new salary or the old one — while your cap sheet still loses the full amount.",
      "Poison-pill rookie extensions use the average of current and extension salaries for the acquiring team's matching, per Art. VII §8(g).",
      "Combining salaries in a trade (aggregation) hard-caps you at the second apron, and is only allowed if the deal leaves you at or below it; sending cash does the same (restriction-table rows H and I).",
      "Outside the Dec. 15-to-deadline window, combining three or more outgoing players for fewer replacements can include no more than one minimum-salary player.",
      "Trade kickers add to the acquiring team's incoming salary when the bonus data is available.",
    ],
  },
  {
    group: "Aprons, hard caps & apron salary",
    items: [
      "“Apron Team Salary” is a separate number — signed salary plus the CBA's add-backs (excluded performance bonuses, 0-and-1-year free-agent minimums) and team-level adjustments — kept separate from the cap-and-tax number that cap holds count against (Art. VII §2(e)).",
      "Hard-cap triggers, first apron: the non-taxpayer mid-level, the bi-annual, a sign-and-trade acquisition, expanded matching, using a pre-existing traded-player exception, and a regular-season waiver signing of a player whose old contract topped the mid-level (restriction-table row D — modeled in the rules engine; the live hard-cap tracker doesn't check it yet).",
      "Hard-cap triggers, second apron: the taxpayer mid-level, combining salaries in a trade, and sending cash.",
      "Every hard cap persists across your whole session and is tested against apron salary, with cap holds excluded.",
    ],
  },
  {
    group: "Signings & re-signings",
    items: [
      "Bird, Early-Bird, and Non-Bird re-signing ceilings (175% / 120%-of-prior-or-minimum), using each free agent's real Bird status and restricted/unrestricted designation where it's sourced.",
      "Cap holds by Bird status (Non-Bird 120%, Early-Bird 130%, Bird 150–190%, rookie-scale restricted 250/300%). Renounce a hold to open space; keep it and it converts to salary on re-sign with no double-count; renouncing forfeits Bird rights.",
      "Veteran extensions at their first-year ceiling (140% of the prior or estimated-average salary) with 8% raises on added years; extend-and-trades at the tighter 120% ceiling with 5% raises.",
      "Renegotiation math — a veteran's raise capped at the team's cap room, in the renegotiation window only — is implemented in the rules engine for reference, but isn't a move you can make on the board yet. (Stretching a waived contract now is — see the Waive action.)",
      "Restricted free agency: the Gilbert Arenas first-year cap for 1–2 year players, and a real match flow where the original team can match your offer sheet and keep the player at your terms.",
    ],
  },
  {
    group: "Sign-and-trades",
    items: [
      "The acquiring team is blocked over the second apron and hard-capped at the first, and the outgoing leg back to the free agent's old team is matched like any trade.",
      "Contract-structure checks when the details are available: three-to-four-year term, first-year protection, no mid-level layered on top, and the acquiring team having room or matching salary in the return (Art. VII §8(e)(1)).",
    ],
  },
  {
    group: "Draft picks",
    items: [
      "A first-rounder you already owe (or that's protected out) is locked from your board, and its year counts as uncovered for the Stepien rule.",
      "Trades move picks as they execute, so later proposals see the real inventory, and Stepien counts picks you moved in earlier deals — not just the current one.",
      "A first the league takes away (the Clippers' 2029–2033 penalty) is off the board and its year is uncovered for Stepien; another team's unprotected first in that year covers it, which is why Toronto's 2031 and 2033 picks are what keep the Clippers able to trade a first at all — and why trading either one is blocked.",
      "A second-apron season is meant to freeze the team's own first seven drafts out (two repeat seasons in the next four drops that pick to the end of the round) — that penalty is modeled in the rules engine but not yet applied to any team's picks on the board, so a frozen first can still be traded here.",
    ],
  },
  {
    group: "Roster, timing & the real 2026 offseason",
    items: [
      "Roster limits: a 21-player offseason cap on signings and a 15-by-opening-night warning.",
      "Trade and re-sign freezes: 30 days for rookie signings, Dec. 15 for free-agent signings, over-cap Bird re-signs above 120% until Jan. 15, matched restricted offer sheets for a year, and a March–June renegotiation blackout.",
      "Real July signings are matched to the exception they actually used, not just the dollar figure — so a deal above the bi-annual ceiling but below the mid-level is treated as mid-level use when the team's situation requires it.",
      "Mid-season 2025-26 waivers missing from the public offseason feed are filled in by hand so they don't invent phantom cap holds.",
      "The real July trades, sign-and-trades, and signings are checked against each team's sheet before the move; a few public-data gaps remain, but they don't change the legal result.",
    ],
  },
];

function Section({ title, color, mark, items, note }: { title: string; color: string; mark: string; items: string[]; note: string }) {
  return (
    <section className="panel p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg font-bold" style={{ color }}>{mark}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">{note}</p>
      <ul className="space-y-2 text-sm">
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
        <h1 className="text-2xl font-bold tracking-tight">Rules coverage &amp; accuracy</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          What Over the Apron gets right about the 2023 CBA, where the public data forces an estimate, and what isn&rsquo;t in the board yet. Rosters and transactions are current to {DATA_AS_OF}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section
          title="What's covered"
          color="var(--tier-below_cap)"
          mark="✓"
          items={COVERED}
          note="Enforced every time you build a trade or a signing."
        />
        <Section
          title="What's approximate"
          color="var(--tier-taxpayer)"
          mark="~"
          items={APPROXIMATE}
          note="Directionally right, but limited by what public data makes available — and flagged where it matters."
        />
        <Section
          title="Not in the board yet"
          color="var(--tier-second_apron)"
          mark="✗"
          items={NOT_INCLUDED}
          note="Real rules or data we haven't wired into the offseason board yet."
        />
      </div>

      <details className="panel mt-4 p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          The fine print — rule by rule
          <span className="ml-2 font-normal text-[var(--muted)]">for checking a verdict against the CBA</span>
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          {FINE_PRINT.map((g) => (
            <div key={g.group}>
              <h3 className="label mb-2 !text-[10px]">{g.group}</h3>
              <ul className="space-y-2 text-[13px] leading-relaxed">
                {g.items.map((t, i) => (
                  <li key={i} className="flex gap-2 text-[var(--muted)]">
                    <span className="text-[var(--tier-below_cap)]">✓</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
