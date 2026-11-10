/*
 * The provisions of the 2023 collective bargaining agreement the board
 * enforces, each with a plain-English line and the agreement's own words.
 *
 * Two things read this list. The rules page prints it as an index. And when
 * the board blocks a move, the verdict shows the entry for the rule that
 * blocked it: the citation, the text, and a link to the plain version. (Until
 * this existed the engine attached a citation to every check and the verdict
 * panel printed only the reason, so most blocked trades named no provision.)
 *
 * `text` is quoted from the agreement, word for word; "…" marks words left
 * out, and nothing is paraphrased inside the quotation marks. Check a new
 * entry against the PDF before adding it. `plain` is for someone who has never
 * read a cap rule: one or two sentences, no terms it doesn't explain.
 */

export type ProvisionGroup = "Trades" | "Aprons and hard caps" | "When a player can be traded" | "Signings";

export interface Provision {
  /** Anchor on the rules page. */
  id: string;
  /** Where it is, without the "2023 CBA" prefix. */
  cite: string;
  name: string;
  plain: string;
  /** The agreement's words. Empty for a league rule that is not in the agreement. */
  text: string;
  group: ProvisionGroup;
}

export const PROVISIONS: Provision[] = [
  /* ------------------------------- Trades ------------------------------- */
  {
    id: "salary-matching",
    cite: "Art. VII §6(j)(1)(i)",
    name: "Salary matching",
    group: "Trades",
    plain:
      "A team over the salary cap can't just add a player. It has to send salary out, and what comes back can be no more than what left, plus $250,000.",
    text: "no more than an amount equal to one hundred percent (100%) of the pre-trade Salary of the Traded Player, plus $250,000",
  },
  {
    id: "expanded-matching",
    cite: "Art. VII §6(j)(1)(iv)",
    name: "Taking back more than you send",
    group: "Trades",
    plain:
      "A team that stays under the first apron can take back more than it sends: 125% of the outgoing salary plus $250,000, and more than that on smaller deals. Doing so caps the team's payroll at the first apron for the rest of the season.",
    text: "one hundred twenty-five percent (125%) of the aggregated pre-trade Salaries of the Traded Player(s), plus $250,000",
  },
  {
    id: "cap-room",
    cite: "Art. VII §6(j)(1)(v)",
    name: "Trading into cap room",
    group: "Trades",
    plain: "A team under the salary cap doesn't have to match salaries. It can take on players up to the room it has, plus $250,000.",
    text: "no more than an amount equal to the Team’s room under the Salary Cap plus $250,000",
  },
  {
    id: "apron-allowance",
    cite: "Art. VII §6(j)(3)",
    name: "No cushion over the first apron",
    group: "Trades",
    plain: "The extra $250,000 disappears for a team that would finish the trade over the first apron. Its trades have to match to the dollar.",
    text: "if a Team’s post-assignment Apron Team Salary would exceed the First Apron Level, then the $250,000 allowance referenced in each of Sections 6(j)(1)(i)-(v) above shall be reduced to $0",
  },
  {
    id: "two-month-aggregation",
    cite: "Art. VII §6(j)(4)(i)",
    name: "Two months before a new player can be packaged",
    group: "Trades",
    plain:
      "A player a team just traded for can be traded again right away, but only by himself. For two months his salary can't be combined with a teammate's to match a bigger one.",
    text: "No player whose Player Contract was acquired pursuant to an Exception in the two (2) month period preceding the trade may be among the Traded Players whose Contracts are being aggregated",
  },
  {
    id: "minimum-aggregation",
    cite: "Art. VII §6(j)(4)(ii)",
    name: "One minimum-salary player per package",
    group: "Trades",
    plain:
      "Outside the stretch from December 15 to the trade deadline, a team sending out three or more players for fewer in return can include only one who is paid the league minimum.",
    text: "no more than one (1) of such Traded Players may be a Minimum Traded Player",
  },
  {
    id: "poison-pill",
    cite: "Art. VII §8(g)",
    name: "A rookie extension that hasn't started",
    group: "Trades",
    plain:
      "A young player who has signed an extension that starts next season counts, for a team absorbing him into cap room, at the average of his current and future salaries. A team matching salaries counts what he is paid now.",
    text: "only for purposes of determining whether the acquiring Team has Room for the Contract, the Salary for the last Salary Cap Year of the original term of the Contract shall be deemed to equal the average of the aggregate Salaries for such Salary Cap Year and each Salary Cap Year of the extended term",
  },
  {
    id: "stepien",
    cite: "NBA league rule",
    name: "A first-round pick at least every other year",
    group: "Trades",
    plain:
      "A team can't trade away its first-round picks in back-to-back future drafts. This one is a league rule, named for an owner who traded too many; it is not in the agreement with the players.",
    text: "",
  },

  /* ------------------------- Aprons and hard caps ------------------------- */
  {
    id: "hard-cap",
    cite: "Art. VII §2(e)(2)(i)",
    name: "The hard cap",
    group: "Aprons and hard caps",
    plain:
      "Certain moves are open only to teams under an apron, and making one binds the team: its payroll can't pass that apron for the rest of the season, whatever else it does.",
    text: "may not, for the remainder of such Salary Cap Year, have an Apron Team Salary that exceeds the Applicable Apron Level that corresponds with such transaction in the table",
  },
  {
    id: "second-apron-aggregation",
    cite: "Art. VII §2(e)(4), row H",
    name: "No combining salaries over the second apron",
    group: "Aprons and hard caps",
    plain:
      "A team over the second apron can trade one player for one player. It can't combine two players' salaries to bring back a more expensive one, and a team that does combine them is capped at the second apron for the season.",
    text: "Team acquires a player using an Aggregated Standard Traded Player Exception",
  },
  {
    id: "second-apron-cash",
    cite: "Art. VII §2(e)(4), row I",
    name: "No sending cash over the second apron",
    group: "Aprons and hard caps",
    plain: "A team over the second apron can't include cash in a trade, and a team that does is capped at the second apron for the season.",
    text: "Team pays cash to another Team in connection with a trade",
  },
  {
    id: "old-exception",
    cite: "Art. VII §2(e)(4), row F",
    name: "Last season's trade exception",
    group: "Aprons and hard caps",
    plain:
      "A team that sends out more salary than it takes back keeps a credit, a trade exception, for a year. Once a regular season has ended since the credit was created, only a team under the first apron can use it.",
    text: "Team acquires a player using a Standard Traded Player Exception … after the end of the Regular Season in which such Traded Player Exception arose",
  },
  {
    id: "post-season-trades",
    cite: "Art. VII §2(e)(2)(ii)(B)",
    name: "A trade after the season binds next season too",
    group: "Aprons and hard caps",
    plain:
      "From the day after the regular season ends through June 30, a trade that triggers a hard cap is tested against next season's payroll and caps the team through the end of next season.",
    text: "may not, at any time from immediately following such transaction through the end of the Subsequent Salary Cap Year, have an Apron Team Salary for such Subsequent Salary Cap Year that exceeds the Applicable Apron Level",
  },
  {
    id: "frozen-pick",
    cite: "Art. VII §2(f)(2)(i)",
    name: "A frozen first-round pick",
    group: "Aprons and hard caps",
    plain:
      "A team that finishes a season over the second apron can't trade its first-round pick seven drafts later. Stay over the line in two of the next four seasons and that pick drops to the end of the round.",
    text: "the Team shall be prohibited from trading (either conditionally or unconditionally) its first round draft pick in the first NBA Draft that occurs following the seventh Season that follows the Season occurring within such Salary Cap Year",
  },

  /* --------------------- When a player can be traded --------------------- */
  {
    id: "draft-pick-30-days",
    cite: "Art. VII §8(d)(i)",
    name: "Thirty days after a draft pick signs",
    group: "When a player can be traded",
    plain: "A drafted player can't be traded for 30 days after signing his first contract.",
    text: "No Draft Rookie who signs a Standard NBA Contract or player who signs a Two-Way Contract may be traded before thirty (30) days following the date on which the Contract is signed",
  },
  {
    id: "free-agent-december-15",
    cite: "Art. VII §8(d)(ii)",
    name: "Three months, or December 15",
    group: "When a player can be traded",
    plain: "A free agent who signs can't be traded until three months have passed or December 15 arrives, whichever is later.",
    text: "may be traded before the later of (A) three (3) months following the date on which such Contract was signed or (B) the December 15 of the Salary Cap Year in which such Contract was signed",
  },
  {
    id: "re-sign-january-15",
    cite: "Art. VII §8(d)(iii)",
    name: "January 15 after a big raise",
    group: "When a player can be traded",
    plain:
      "A player who re-signs with his own team for a raise of more than 20%, while the team is over the cap, waits until three months have passed or January 15, whichever is later.",
    text: "may not be traded before the later of (x) three (3) months following the date on which such Contract was signed or (y) the January 15 of the Salary Cap Year in which such Contract was signed",
  },
  {
    id: "extension-six-months",
    cite: "Art. VII §8(f)(i)",
    name: "Six months after a large extension",
    group: "When a player can be traded",
    plain:
      "A player whose extension is longer or richer than a team could give him while trading him can't be traded for six months after signing it.",
    text: "then the player may not be traded before six (6) months following the date on which such Extension or Renegotiation was signed",
  },
  {
    id: "matched-offer-sheet",
    cite: "Art. XI §5(j)",
    name: "A matched offer",
    group: "When a player can be traded",
    plain:
      "When a team keeps its own free agent by matching another team's offer, for a year he can't be traded without his consent, and can't be sent to the team that made the offer at all.",
    text: "the ROFR Team may not trade the Restricted Free Agent for one (1) year, without the player’s consent",
  },

  /* ------------------------------- Signings ------------------------------- */
  {
    id: "sign-and-trade",
    cite: "Art. VII §8(e)(1)",
    name: "Sign-and-trade",
    group: "Signings",
    plain:
      "A team can re-sign its own free agent in order to trade him, but only on a contract of three or four seasons, and only before the regular season starts. The team that gets him is capped at the first apron.",
    text: "the Contract is entered into prior to the first day of the Regular Season",
  },
  {
    id: "in-season-minimum",
    cite: "Art. I §1(kk)(ii)",
    name: "A contract signed mid-season pays by the day",
    group: "Signings",
    plain:
      "A minimum contract signed after opening night pays the minimum salary times the days left in the season over the days in it. Sign with 159 of 174 days left and it is 159/174ths of the full figure.",
    text: "multiplied by a fraction, the numerator of which is the number of days remaining in the NBA Regular Season as of the date such Contract is entered into, and the denominator of which is the total number of days of that NBA Regular Season",
  },
  {
    id: "waived-player-signing",
    cite: "Art. VII §2(e)(4), row D",
    name: "Signing a player another team just released",
    group: "Signings",
    plain:
      "A player released during the season from a contract paying more than the mid-level amount can sign only with a team under the first apron, and signing him caps that team there for the season.",
    text: "Team signs a Contract during the Regular Season with a player who was previously under a Contract that: (i) was terminated during such Regular Season",
  },
  {
    id: "exception-shrink",
    cite: "Art. VII §6(n)(4)",
    name: "An unused exception gets smaller after the deadline",
    group: "Signings",
    plain:
      "From January 10 an unused mid-level or bi-annual exception loses one day's share of its value every day. A team that uses it by the trade deadline still gets the full amount. From the day after the deadline, every day since January 10 comes off.",
    text: "shall be reduced daily throughout the remainder of the Regular Season by the amount of the unused Exception as of January 10 multiplied by a fraction, the numerator of which is one (1) and the denominator of which is the total number of days in such Regular Season",
  },
  {
    id: "extension-window",
    cite: "Art. VII §7(a)(1)",
    name: "When a contract can be extended",
    group: "Signings",
    plain:
      "Once the season starts, only a contract in its last season can be extended. A player with more seasons left than that has to wait for the offseason, which runs from July 1 to the day before opening night.",
    text: "more than one (1) year prior to the July 1 preceding the first Season covered by the extended term, then the Extension may only be negotiated and entered into during the off-season",
  },
  {
    id: "designated-veteran",
    cite: "Art. II §7(c)(ii); Art. VII §7(a)(1)",
    name: "The supermax extension",
    group: "Signings",
    plain:
      "A player with seven or eight seasons behind him, and one or two left on his contract, can extend for up to 35% of the salary cap instead of the usual 30%. He has to have been named All-NBA, Defensive Player of the Year or MVP recently, and still be with the team that drafted him or one that traded for him in his first four seasons. It can be signed only in the offseason, so during the season no extension starts above the ordinary maximum.",
    text: "Designated Veteran Player Extensions may only be negotiated and entered into during the off-season",
  },
];

const BY_ID = new Map(PROVISIONS.map((p) => [p.id, p]));
export const provision = (id: string): Provision | undefined => BY_ID.get(id);

/** The engine's rule ids, each to the provision that explains it. */
const BY_RULE: Record<string, string> = {
  salary_matching: "salary-matching",
  hard_cap_first_apron: "hard-cap",
  hard_cap_second_apron_aggregation: "second-apron-aggregation",
  second_apron_no_aggregation: "second-apron-aggregation",
  hard_cap_second_apron_cash: "second-apron-cash",
  second_apron_no_cash_out: "second-apron-cash",
  tpe_first_apron: "old-exception",
  subsequent_year_first_apron: "post-season-trades",
  subsequent_year_second_apron: "post-season-trades",
  no_aggregate: "two-month-aggregation",
  minimum_traded_player_aggregation: "minimum-aggregation",
  poison_pill_incoming_value: "poison-pill",
};

/** Which freeze a `trade_eligibility` check is, read off its citation. Most
 * specific first: "§8(d)(iii)" contains "§8(d)(i)". */
const FREEZE_BY_CITE: [RegExp, string][] = [
  [/§5\(j\)/, "matched-offer-sheet"],
  [/§8\(d\)\(iii\)/, "re-sign-january-15"],
  [/§8\(d\)\(ii\)/, "free-agent-december-15"],
  [/§8\(d\)\(i\)/, "draft-pick-30-days"],
  [/§8\(f\)/, "extension-six-months"],
];

/** The provision behind an engine check, or undefined when it has none
 * (a player missing from the data, say). */
export function provisionForCheck(check: { ruleId: string; citation?: string }): Provision | undefined {
  if (check.ruleId === "trade_eligibility") {
    // The engine's catch-all citation ("§8(d), §8(f)") names no one rule: a
    // 10-day contract, or a freeze nobody has dated. Say nothing rather than guess.
    if (/§8\(d\), §8\(f\)/.test(check.citation ?? "")) return undefined;
    const hit = FREEZE_BY_CITE.find(([re]) => re.test(check.citation ?? ""));
    return hit ? provision(hit[1]) : undefined;
  }
  if (check.ruleId === "salary_matching" && /§6\(j\)\(1\)\(v\)/.test(check.citation ?? "")) return provision("cap-room");
  const id = BY_RULE[check.ruleId];
  return id ? provision(id) : undefined;
}

export const PROVISION_GROUPS: ProvisionGroup[] = ["Trades", "Aprons and hard caps", "When a player can be traded", "Signings"];
