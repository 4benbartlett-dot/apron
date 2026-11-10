/*
 * Rules the site had wrong until a real transaction didn't fit, written for
 * someone who doesn't follow the NBA. Each is a few sentences: what the rule
 * seemed to say, what the agreement says, and the move that showed the
 * difference. They are the About page's "Where the fine print mattered", and
 * /llms.txt reads the same list.
 *
 * Keep them plain and in the first person. No account of what the code does
 * now, no dates as headings, no terms a non-fan would have to look up without
 * the sentence explaining them: the first version of this read like a
 * changelog. Add one when a real move changes a rule in the engine, not for a
 * data correction, and check the citation against the text first.
 */
export interface CaseNote {
  /** The day of the real transaction, ISO. For ordering; not shown. */
  date: string;
  /** The point, as a short plain headline. */
  title: string;
  /** What I assumed, what the agreement says, and the move that showed it. */
  body: string;
  /** Where in the agreement. */
  citation: string;
}

export const CASE_NOTES: CaseNote[] = [
  {
    date: "2026-06-29",
    title: "One more day, or one more season",
    body: "Portland made a trade on June 29, the day before the league's year ends, and took back more salary than it sent out. A trade like that comes with a condition: the team's payroll can't pass a set line for the rest of the year. I read that as one more day. The agreement says that when the trade comes after the regular season has ended, the condition lasts through the end of the next year. Portland has been held under that line all season.",
    citation: "Art. VII §2(e)(2)(ii)",
  },
  {
    date: "2026-10-14",
    title: "Counted at what he's paid, or at what he will be",
    body: "Brandin Podziemski is paid $5.7 million this season and has signed a new contract, starting next year, for far more. When a player in that spot is traded, his new team counts him at the average of the two, and I applied that to every team. The sentence in the agreement says it applies “only for purposes of determining whether the acquiring Team has Room for the Contract,” which means only for a team with unused space under the salary cap. For everyone else he counts at what he is paid. The site had him at $19.3 million.",
    citation: "Art. VII §8(g)",
  },
  {
    date: "2026-11-02",
    title: "Can't be traded, or can't be traded without asking",
    body: "A team can keep its own free agent by matching another team's offer to him. I treated a player kept that way as untradeable for a year. The agreement says he can't be traded for a year without his consent, and can't be sent at all to the team that made the offer. With his consent, he can go anywhere else. Two players were frozen on the site who weren't frozen in the league.",
    citation: "Art. XI §5(j)",
  },
  {
    date: "2026-11-08",
    title: "Five days of work, seven days of pay",
    body: "Oklahoma City signed a player on November 4 and released him on November 8 to make room for a trade. A contract signed during the season pays by the day, and one that isn't guaranteed stops paying when the player clears waivers, two days after he is released. That is seven days, or $105,629. The site had never seen a contract signed mid-season and charged the team his salary for the whole year.",
    citation: "Art. I §1(kk); Uniform Player Contract ¶16",
  },
];
