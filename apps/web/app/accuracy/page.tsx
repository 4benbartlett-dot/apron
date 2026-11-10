import type { Metadata } from "next";
import { DATA_AS_OF } from "@apron/data";
import { C } from "@/lib/league";
import { fmtFull } from "@/lib/format";

export const metadata: Metadata = {
  title: "What the Board Enforces and What It Estimates | Over the Apron",
  description:
    "Which rules of the 2023 CBA Over the Apron enforces, where public data forces an estimate, and the few moves that happen outside the board.",
};

// Plain-language, GM-facing summaries. The rule-by-rule specifics live in the
// collapsible "fine print" at the bottom for anyone who wants to check the math.
const COVERED = [
  "Every 2026-27 money line — the cap, luxury tax, both aprons, the mid-level and bi-annual exceptions, minimum salaries, and the max tiers — set from the CBA's own percentage-of-cap formulas.",
  `Trade matching with the real expanded math, including the middle band that grows with the cap (${fmtFull(C.tradeMatch.escalatedFlatAddOn)} for 2026-27).`,
  "What each apron actually costs you: over the first apron you lose expanded matching and can't bring a player in by sign-and-trade; over the second you also can't combine salaries or send cash.",
  "Every move that hard-caps a team, enforced for the rest of the season. Using the mid-level or bi-annual, taking a player by sign-and-trade, or taking back extra salary caps you at the first apron; the taxpayer mid-level, combining salaries in a trade, or sending cash caps you at the second.",
  "Traded-player exceptions — the real league-wide ledger, plus any your own lopsided trades create — applied for you to absorb an incoming salary.",
  "Sign-and-trades end to end: the acquiring team's hard cap, the contract length and structure limits, base-year compensation when you re-sign then trade a player, and poison-pill rookie extensions.",
  "Re-signing your own free agents at their real Bird, Early-Bird, or Non-Bird ceilings — and the cap holds those rights keep on your books until you re-sign or renounce them.",
  "Extensions, each with their own year limits, raise limits, and the extend-and-trade freeze window.",
  "Draft picks that behave like the real thing: a pick you already owe is off your board, the Stepien rule stops you trading away first-rounders two years running, and every trade updates who owns what for the moves that follow.",
  "Waive a player yourself and the guaranteed money sticks to your books as dead money — counting against the cap, tax, and apron — following the real guarantee. Choose to stretch it and it spreads evenly over 2N+1 years under the 15%-of-cap guardrail.",
  "Your actual July 2026 starting point: which teams already spent an exception, who is hard-capped and why, and which cap-room teams gave up their mid-level and bi-annual for the year.",
];

const APPROXIMATE = [
  "Gary Trent Jr.'s four-year deal with Milwaukee is booked as signed while the league reviews it, and it could be unwound. The Clippers' five forfeited first-round picks are off the board and count as years without a first for the Stepien rule; the league hasn't said whether a forfeited year counts.",
  "Injuries during the season use the report's own timeline (\"6–8 weeks\", \"out for the season\"); where it gives none, a typical recovery for that kind of injury. It's a rule of thumb, not a medical opinion, and it can't know about a setback or an early return.",
  "Apron Value — the 0–100 number on every player — is a rough read on impact from box scores and lineup data, with an uncertainty band. During the season it moves with this season's play, weighted by minutes: a few hundred minutes nudges a player, and about a thousand moves him halfway. That weight was tested on five past seasons.",
  "A team's projected record is a read on the roster as it stands today, with no coaching, chemistry, or playoff translation. On the season page, each team's real results then move that read: a few games nudge it, and by the All-Star break the record does most of the work.",
  "Playoff and title odds come from playing out the rest of the season 5,000 times, game by game, from team ratings plus home court. Ties in the standings are broken by coin flip, and the two games per team the league schedules after NBA Cup group play are filled in against conference opponents.",
  "How wrong the projection can be: about 3.5 points of net rating, or roughly seven wins either way, tested on 240 past team-seasons using only what was known before each one. Teams a few wins apart are effectively tied.",
  "The projection is built from the talent in a team's projected rotation and its perimeter defense. Team fit is shown on the board but doesn't move projected records; in testing it didn't make them better.",
  "A rookie has no NBA minutes yet, so his value, fit, and playing time are projected from draft slot, college production, and scouting consensus — a read on his rookie year, not a ceiling. Most rookies grade out below average, top picks near it.",
  "A handful of recently retired or overseas veterans (Dwight Howard, Serge Ibaka, and the like) are on the free-agent board as minimum-deal flyers, valued for the realistic drop since their last NBA season — a 40-year-old Dwight reads as a deep-bench center, not the DPOY version.",
  "Positions come from where a player actually logged his minutes; a real second position is any spot he played at least ~12% of the time. Players without enough tracked minutes fall back to their listed position.",
  "Draft-pick trade value is projected from each team's strength, discounted for risk and how far out the pick is — the fairness meter just adds it up per side.",
  "Some traded-player-exception details are simplified: one exception per team per trade, whole players only.",
  "Any use of the non-taxpayer mid-level hard-caps the team at the first apron here. The real rule is softer in one narrow case: a use within the taxpayer MLE's size and 2-year length can later be re-characterized as the taxpayer MLE (Art. VII §6(f)(5)), trading the first-apron cap for a second-apron one.",
  "A player who can veto a trade — a no-trade clause, a matched offer sheet, a one-year Bird re-sign — is marked on the board, but the board doesn't stop the trade; in real life it needs his yes. The one hard line: for a year, a matched offer-sheet player can't go to the team that made the offer.",
  "Apron salary is built the way the CBA builds it: signed salary, plus unlikely bonuses, plus the minimum add-back for a 0- or 1-year free agent signed for less than the two-year minimum (which survives a waive). Bonus figures come from public cap tables.",
  "Future seasons come from filings where they exist. A deal reported only as years and a total is laid out at standard raises until a filed figure turns up; this season's and next season's filed salaries replace the assumption, and later seasons are scaled to keep the reported total. Deals written as a share of a future cap — Wembanyama's, Mitchell's, Gilgeous-Alexander's — are estimates on every public sheet, this one included.",
  "Which apron tier a team sits in is measured on salary actually signed. Cap holds for free agents you haven't re-signed or renounced still count against your room to sign and absorb, but they don't move you up an apron tier here.",
  "Reported deals are public as a term and a total, so the first-year salary is back-solved from the raise the deal is entitled to — 8% re-signing with your own team on Bird or Early Bird rights, 5% otherwise, including matched offer sheets and anything paid with an exception. That lands the big ones exactly (Austin Reaves' 4-year max back-solves to the 25% figure to the dollar), but a deal with unusual year-to-year structure — flat, declining, or front-loaded — is smoothed into standard raises.",
];

// Moves that happen somewhere other than the board, each with the reason.
// Not a list of rules the board gets wrong: a rule it enforces is in the fine
// print below, and a number it estimates is in the column before this one.
const OUTSIDE = [
  "Renegotiations. A team with cap room can raise a player's salary once a contract of four or more seasons is three years old (Art. VII §7(c)). Public data doesn't give the day every contract was signed, so the board doesn't offer one.",
  "Two-way contracts and a draft pick's first contract. A two-way counts against neither the cap nor the fifteen-man roster, and a pick signs with the team that drafted him, under the rookie scale or the second-round exception. Both are booked from the transaction feed when they happen; the board signs free agents to standard contracts.",
  "Waiver claims. A released player goes on waivers for two days, and the board adds him to the free-agent list when he clears.",
  "What a pick swap turns into. A swap is traded as a right, and the pick it becomes is settled by that season's standings. A first-round pick that might not convey isn't counted as a team's pick for that year under the Stepien rule, because the rule asks whether a team could be left without one.",
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
      "Poison-pill rookie extensions: a team absorbing the player into cap room counts the average of his current and extension salaries; a team matching salaries counts what he is actually paid. Art. VII §8(g) applies the average only to Room.",
      "Combining salaries in a trade (aggregation) hard-caps you at the second apron, and is only allowed if the deal leaves you at or below it; sending cash does the same (Art. VII §2(e)).",
      "Outside the Dec. 15-to-deadline window, combining three or more outgoing players for fewer replacements can include no more than one minimum-salary player.",
      "Trade kickers add to the acquiring team's incoming salary when the bonus data is available.",
    ],
  },
  {
    group: "Aprons, hard caps & apron salary",
    items: [
      "“Apron Team Salary” is a separate number — signed salary plus the CBA's add-backs (excluded performance bonuses, 0-and-1-year free-agent minimums) and team-level adjustments — kept separate from the cap-and-tax number that cap holds count against (Art. VII §2(e)).",
      "Hard-cap triggers, first apron: the non-taxpayer mid-level, the bi-annual, a sign-and-trade acquisition, expanded matching, and using a pre-existing traded-player exception.",
      "Hard-cap triggers, second apron: the taxpayer mid-level, combining salaries in a trade, and sending cash.",
      "Every hard cap persists across your whole session and is tested against apron salary, with cap holds excluded.",
    ],
  },
  {
    group: "Signings & re-signings",
    items: [
      "Bird, Early-Bird, and Non-Bird re-signing ceilings (175% / 120%-of-prior-or-minimum), using each free agent's real Bird status and restricted/unrestricted designation where it's sourced.",
      "Cap holds by Bird status (Non-Bird 120%, Early-Bird 130%, Bird 150–190%, rookie-scale restricted 250/300%). Renounce a hold to open space; keep it and it converts to salary on re-sign with no double-count; renouncing forfeits Bird rights.",
      "Veteran extensions at their first-year ceiling (140% of the prior or estimated-average salary, capped at the max for the season the extension starts, on a projected cap) with 8% raises on added years; extend-and-trades at the tighter 120% ceiling with 5% raises. A real extension that covers five seasons from signing, or outruns the extend-and-trade limits, is marked untradeable for six months (Art. VII §8(f)(i)) — and a team may extend a player it traded for in the last six months only inside those limits, which is how Toronto could extend Kawhi Leonard eight days after acquiring him. Only first-round picks have rookie-scale extensions; a second-rounder's is a veteran one.",
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
      "A first-round pick frozen by a season over the second apron (Art. VII §2(f)) can't be traded or swapped, but still counts as the team's own for the two-years-running rule: Boston's, Phoenix's and Minnesota's in 2032, and Cleveland's in 2033.",
      "A first the league takes away (the Clippers' 2029–2033 penalty) is off the board and its year is uncovered for Stepien; another team's unprotected first in that year covers it, which is why Toronto's 2031 and 2033 picks are what keep the Clippers able to trade a first at all — and why trading either one is blocked.",
    ],
  },
  {
    group: "Roster, timing & the real 2026 offseason",
    items: [
      "Roster limits follow the calendar: 21 players in the offseason with a 15-by-opening-night warning, and a hard 15 standard contracts once the season starts. Sign-and-trades close on the first day of the regular season (Art. VII §8(e)(1)(v)).",
      "Extensions follow it too. Once the season starts, only a contract in its last season can be extended; one with more seasons left waits for July (Art. VII §7(a)(1)). A designated veteran extension, the 35% “supermax”, can be signed only in the offseason, so no in-season extension starts above the player's ordinary maximum.",
      "A player released during the season joins the free-agent list when he clears waivers, two days later. If the contract he was released from paid more than the mid-level amount, only a team that stays under the first apron can sign him, and signing him caps it there for the season (Art. VII §2(e)(4), row D).",
      "The mid-level and bi-annual exceptions are full size through the trade deadline. From the day after it, each is smaller by every day since January 10, a 174th of its January 10 balance per day (Art. VII §6(n)(4)).",
      "Contracts signed during the season are paid by the day, on the real ledger and on the board: a minimum signed in season is the minimum salary times the days left over the season's 174 (Art. I §1(kk)(ii)), a 10-day is ten of them, and a player waived off a contract that isn't guaranteed leaves only the days he was paid for, through two on waivers. From January 10 a contract still on a roster is guaranteed for the season.",
      "Trade freezes, each with the day it lifts: 30 days for rookie signings, the later of Dec. 15 and three months for free-agent signings, the later of Jan. 15 and three months for over-cap Bird re-signs above 120%, six months for veteran extensions past extend-and-trade limits, and two months before a player acquired by trade can be combined with other salaries (or the day before the deadline, for one acquired by December 16: the proviso in Art. VII §6(j)(4)(i)). The board trades as of today or the trade deadline, and a freeze you create on the board (a signing, an extension, a player you trade for) is dated from today the same way, so it lifts in deadline mode when the rule says it would. Which re-signs fall under the Jan. 15 rule, and who can veto a trade, follow reporting, since public data doesn't show Bird rights.",
      "Real July signings are matched to the exception they actually used, so a deal above the bi-annual ceiling but below the mid-level is treated as mid-level use when the team's situation requires it.",
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
        <h1 className="text-2xl font-bold tracking-tight">What the board enforces, and what it estimates</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Which rules of the 2023 CBA the board enforces, where public data forces an estimate, and the few moves that happen outside it. Rosters and transactions are current to {DATA_AS_OF}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section
          title="What it enforces"
          color="var(--tier-below_cap)"
          mark="✓"
          items={COVERED}
          note="Enforced every time you build a trade or a signing."
        />
        <Section
          title="What it estimates"
          color="var(--tier-taxpayer)"
          mark="~"
          items={APPROXIMATE}
          note="Limited by what public data makes available, and flagged where it matters."
        />
        <Section
          title="Outside the board"
          color="var(--muted)"
          mark="·"
          items={OUTSIDE}
          note="Four things that happen somewhere else, and why."
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
