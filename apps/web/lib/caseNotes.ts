/*
 * Times a real transaction and this site disagreed, and what settled it.
 *
 * The board is checked against the league the hard way: every real trade and
 * signing is run through the same engine a visitor uses, and when the engine
 * blocks something a team actually did, or books a number no public cap sheet
 * agrees with, one of the two is wrong. These are the cases where it was the
 * site, each with the provision that decided it. They are kept as data so the
 * About page and /llms.txt read the same record; the full account of each is
 * in the commit that fixed it.
 *
 * Add a note when a real move changes a rule in the engine, not for a data
 * correction. Keep each one to what happened, what the agreement says, and
 * what changed, in that order, with the article and section.
 */
export interface CaseNote {
  /** The day of the real transaction, ISO. */
  date: string;
  /** What happened, as a plain headline. */
  title: string;
  /** What the site said, and why that was wrong. */
  facts: string;
  /** The provision that decides it. */
  citation: string;
  /** What the provision says, in one or two sentences. */
  rule: string;
  /** What the engine does now. */
  outcome: string;
}

export const CASE_NOTES: CaseNote[] = [
  {
    date: "2026-06-29",
    title: "Portland's trade for Ja Morant capped the team for a season longer than the site thought",
    facts:
      "Portland took back more salary than it sent out, which is allowed only under the expanded trade exception, and using that exception hard-caps a team at the first apron. The site ended the cap on June 30 with the league year. An outside cap tracker still showed Portland as capped, and the site's notes had written that off as the tracker's mistake.",
    citation: "Art. VII §2(e)(2)(ii)(B)",
    rule: "A trade made between the day after the regular season ends and June 30 that triggers a hard cap binds the team through the end of the following salary cap year, not the one it was made in.",
    outcome:
      "The mistake was the site's. The engine now carries each season's calendar, tests a late-season trade against next season's salary, and keeps the cap for the following year. All 38 trades made in that window in 2026 were then audited one by one.",
  },
  {
    date: "2026-10-14",
    title: "A rookie's extension made him untradeable to teams that could legally trade for him",
    facts:
      "Brandin Podziemski signed an extension that starts in a later season. A player in that position counts in a trade at the average of his current and future salaries (the “poison pill”), and the engine applied that average to every team trading for him. That priced him at $19.28 million instead of the $5.68 million he is paid, and blocked ordinary trades for him.",
    citation: "Art. VII §8(g)",
    rule: "The averaged figure applies “only for purposes of determining whether the acquiring Team has Room for the Contract.” A team already over the cap, matching salaries instead of using room, counts what he is actually paid.",
    outcome:
      "The engine carries both figures and uses the average only when a team is absorbing him into cap room. The verdict says which one applied.",
  },
  {
    date: "2026-11-02",
    title: "A matched offer sheet is a veto, not a freeze",
    facts:
      "When a team matches another team's offer sheet to keep its own restricted free agent, the site treated the player as untradeable for a year. Checking every trade freeze on the sheet against the published lists of players who can't yet be traded showed two such players listed as tradeable in December and January.",
    citation: "Art. XI §5(j)",
    rule: "For one year the player can't be traded without his consent, and can't be traded at all to the team whose offer was matched. With his consent, he can be traded to anyone else on the ordinary date for a newly signed free agent.",
    outcome:
      "The board marks the player as holding a veto, allows the trade, and blocks only the one destination. The same check turned up two more rules: a drafted player signing his first contract waits 30 days rather than until December 15, and a player promoted from a two-way contract is a free-agent signing.",
  },
  {
    date: "2026-11-08",
    title: "Five days on a roster cost Oklahoma City $105,629, not $2.8 million",
    facts:
      "The Thunder signed Dalen Terry on November 4 and waived him on November 8 to make room for a trade. The site had never seen a contract signed during the season, so it charged the Thunder the full value of the last contract it had on file for him, this season and next.",
    citation: "Art. I §1(kk)(ii); Uniform Player Contract ¶16",
    rule: "A minimum contract that covers less than the whole season pays the minimum salary multiplied by the days left in the season over the days in it, 174 this year. His was not guaranteed, so when he was waived he was owed only the part of the season he had been under contract, through the end of the waiver period: seven days.",
    outcome:
      "Seven days at $2,625,627 a year comes to $105,629, which is the figure on public cap sheets to the dollar. In-season contracts are now their own kind of contract in the data, paid by the day.",
  },
];
