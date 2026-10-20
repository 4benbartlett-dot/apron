import { apronTeamSalary, classifyTier, type ApronTier } from "@apron/cba-engine";
import { DATA_AS_OF } from "@apron/data";
import {
  BASE_CONTRACTS,
  C,
  TEAM_IDS,
  YEAR,
  byNickname,
  feedStateOf,
  leagueData,
  teamMeta,
  teamNickname,
  tpeLedger,
  type TpeSlot,
} from "@/lib/league";
import type { TermSection } from "@/lib/seo";
import { TIER_LABEL, fmtM, fmtFull } from "@/lib/format";

/* ---------------------------------------------------------------------------
 * /blog — long-form answers to the questions people actually ask about the
 * cap ("which teams are over the second apron?", "does this trade work?").
 *
 * Written for search engines and AI answer engines alike: every post opens
 * with a one-paragraph direct answer, carries its numbers from the same
 * engine constants and league data the board uses (so a data refresh updates
 * the posts too), and ends in an FAQ that's mirrored into FAQPage JSON-LD.
 * ------------------------------------------------------------------------- */

export interface BlogPost {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  /** One-line subtitle under the headline and on the index card. */
  dek: string;
  /** The direct answer, first thing on the page — what an answer engine quotes. */
  answer: string;
  published: string;
  /** Data posts move with every refresh; explainers move when the rules do. */
  updated: string;
  sections: TermSection[];
  faq: { q: string; a: string }[];
  /** Internal links: terms, team pages, the board. */
  related: { href: string; label: string }[];
}

const AUTHOR = "Ben Bartlett";
export const BLOG_AUTHOR = AUTHOR;

/* ------------------------------ data helpers ----------------------------- */

interface TeamLine {
  id: string;
  name: string;
  apron: number;
  tier: ApronTier;
}

const teamLines = (): TeamLine[] => {
  const data = leagueData(BASE_CONTRACTS);
  return TEAM_IDS.map((id) => {
    const apron = apronTeamSalary(data, id, C);
    return { id, name: teamMeta(id).name, apron, tier: classifyTier(apron, C) };
  }).sort((a, b) => b.apron - a.apron);
};

const inTier = (tier: ApronTier) => teamLines().filter((t) => t.tier === tier);

const nicknames = (ts: { id: string }[]) =>
  ts.length ? ts.map((t) => teamNickname(t.id)).join(", ") : "none";

const cappedTeams = () =>
  TEAM_IDS.filter((t) => Number.isFinite(feedStateOf(t).hardCap))
    .sort(byNickname)
    .map((t) => ({ id: t, line: feedStateOf(t).hardCap, source: feedStateOf(t).hardCapSource }));

const roomTeams = () => TEAM_IDS.filter((t) => feedStateOf(t).roomTeam).sort(byNickname);

// The real ledger is dual-source, so one exception can appear twice under two
// spellings ("Lu Dort" / "Luguentz Dort"). Same team, amount, and expiry is
// the same exception; keep the shortest label.
const liveTpes = () => {
  const seen = new Map<string, TpeSlot>();
  for (const s of Object.values(tpeLedger([])).flat()) {
    const k = `${s.team}|${s.amount}|${s.expires}`;
    const prev = seen.get(k);
    if (!prev || s.label.length < prev.label.length) seen.set(k, s);
  }
  return [...seen.values()].sort((a, b) => b.amount - a.amount);
};

const prettyDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const tierRows = (ts: TeamLine[]) =>
  ts.map((t) => ({ label: t.name, value: `${fmtM(t.apron)} · ${TIER_LABEL[t.tier]}` }));

const APRON_BASIS =
  "Apron salary is measured the way the CBA builds it — signed salary plus unlikely bonuses and minimum add-backs — on signed contracts only. Unrenounced cap holds don't move a team up a tier here, so a team holding a free agent's rights can sit one tier lower than reporting that counts the hold. The /accuracy page lists the live cases.";

/* --------------------------------- posts --------------------------------- */

const PUBLISHED = "2026-10-20";

function salaryCapPost(): BlogPost {
  return {
    slug: "nba-salary-cap-2026-27",
    title: `The ${YEAR} NBA salary cap, tax, and aprons: every number that matters`,
    metaTitle: `NBA Salary Cap ${YEAR}: ${fmtM(C.salaryCap)} Cap, Tax Line, Aprons, MLE & Max Contracts`,
    metaDescription: `The ${YEAR} NBA salary cap is ${fmtFull(C.salaryCap)}. The luxury tax line, first and second aprons, mid-level exceptions, max salaries, and minimums — all the official figures in one place.`,
    dek: "The cap, tax line, both aprons, every exception, the max tiers, and the minimum scale, from the official cap memo.",
    answer: `The NBA salary cap for ${YEAR} is ${fmtFull(C.salaryCap)}. The luxury tax line is ${fmtFull(C.luxuryTaxLine)}, the first apron is ${fmtFull(C.firstApron)}, and the second apron is ${fmtFull(C.secondApron)}. The non-taxpayer mid-level exception is ${fmtFull(C.nonTaxpayerMLE)}, and a first-year max contract runs from ${fmtFull(C.maxSalary["0-6"])} to ${fmtFull(C.maxSalary["10+"])} depending on years of service.`,
    published: PUBLISHED,
    updated: PUBLISHED,
    sections: [
      {
        heading: "The four lines",
        body: [
          "Every team-building question in the apron era starts with where a team sits against these four numbers. Under the cap, a team can sign free agents into room. Over it, a team works with exceptions and matched trades. Past the tax line it pays the luxury tax. Past each apron, specific tools switch off.",
        ],
        rows: [
          { label: "Minimum team salary (90% of cap)", value: fmtFull(C.minTeamSalary) },
          { label: "Salary cap", value: fmtFull(C.salaryCap) },
          { label: "Luxury tax line", value: fmtFull(C.luxuryTaxLine) },
          { label: "First apron", value: fmtFull(C.firstApron) },
          { label: "Second apron", value: fmtFull(C.secondApron) },
        ],
      },
      {
        heading: "The exceptions",
        body: [
          "Exceptions are how an over-the-cap team adds salary without cap room. Which one a team can use depends on its apron position, and using some of them hard-caps the team for the rest of the season.",
        ],
        rows: [
          { label: "Non-taxpayer mid-level (hard-caps at the first apron)", value: fmtFull(C.nonTaxpayerMLE) },
          { label: "Taxpayer mid-level (hard-caps at the second apron)", value: fmtFull(C.taxpayerMLE) },
          { label: "Room mid-level (cap-room teams)", value: fmtFull(C.roomMLE) },
          { label: "Bi-annual exception (hard-caps at the first apron)", value: fmtFull(C.biAnnualException) },
        ],
      },
      {
        heading: "Max contracts",
        body: [
          "A max contract is a percentage of the cap set by the player's years of service. These are first-year figures; a contract can rise from there.",
        ],
        rows: [
          { label: "0–6 years of service (25%)", value: fmtFull(C.maxSalary["0-6"]) },
          { label: "7–9 years of service (30%)", value: fmtFull(C.maxSalary["7-9"]) },
          { label: "10+ years of service (35%)", value: fmtFull(C.maxSalary["10+"]) },
        ],
      },
      {
        heading: "Trade matching numbers",
        body: [
          `Teams below the aprons can take back more salary than they send. The middle band of the expanded formula is indexed to the cap: it's ${fmtFull(C.tradeMatch.escalatedFlatAddOn)} for ${YEAR}, not the flat $7.5M from 2023-24 that a lot of calculators still use. The $250,000 allowance is not indexed. Teams at or above either apron match dollar for dollar.`,
        ],
        rows: [
          { label: "Expanded matching add-on (indexed)", value: fmtFull(C.tradeMatch.escalatedFlatAddOn) },
          { label: "Flat allowance", value: fmtFull(C.tradeMatch.addOn) },
          { label: "Estimated average player salary", value: fmtFull(C.estimatedAverageSalary) },
        ],
      },
      {
        heading: "The minimum scale",
        rows: [0, 1, 2, 3, 5, 7, 10].map((y) => ({
          label: `${y === 10 ? "10+" : y} year${y === 1 ? "" : "s"} of service`,
          value: fmtFull(C.minimumSalaries[y] ?? 0),
        })),
      },
    ],
    faq: [
      {
        q: `What is the NBA salary cap for ${YEAR}?`,
        a: `${fmtFull(C.salaryCap)}, set at the start of the league year on June 30, 2026.`,
      },
      {
        q: `How much is the NBA luxury tax line for ${YEAR}?`,
        a: `${fmtFull(C.luxuryTaxLine)}. The first apron sits at ${fmtFull(C.firstApron)} and the second apron at ${fmtFull(C.secondApron)}.`,
      },
      {
        q: `What is the max contract in the NBA for ${YEAR}?`,
        a: `A first-year max is 25% of the cap (${fmtFull(C.maxSalary["0-6"])}) for players with 0–6 years of service, 30% (${fmtFull(C.maxSalary["7-9"])}) for 7–9 years, and 35% (${fmtFull(C.maxSalary["10+"])}) for 10 or more.`,
      },
      {
        q: `How much is the mid-level exception for ${YEAR}?`,
        a: `The non-taxpayer MLE is ${fmtFull(C.nonTaxpayerMLE)}, the taxpayer MLE is ${fmtFull(C.taxpayerMLE)}, and the room MLE is ${fmtFull(C.roomMLE)}.`,
      },
    ],
    related: [
      { href: "/terms/first-apron", label: "First apron" },
      { href: "/terms/second-apron", label: "Second apron" },
      { href: "/terms/mid-level-exception", label: "Mid-level exception" },
      { href: "/terms/minimum-contract", label: "Minimum contract" },
      { href: "/league", label: "League cap board" },
    ],
  };
}

function apronTeamsPost(): BlogPost {
  const second = inTier("second_apron");
  const first = inTier("first_apron");
  const tax = inTier("taxpayer");
  const lines = teamLines();
  return {
    slug: "nba-teams-over-the-apron-2026-27",
    title: `Which NBA teams are over the first and second apron in ${YEAR}?`,
    metaTitle: `NBA Teams Over the Second Apron & First Apron (${YEAR}) — All 30 Payrolls`,
    metaDescription: `Every NBA team's ${YEAR} apron salary, ranked: which teams are over the second apron (${fmtM(C.secondApron)}), the first apron (${fmtM(C.firstApron)}), and the tax line. Updated with current rosters.`,
    dek: "All 30 payrolls against the tax line and both aprons, from current signed contracts.",
    answer: `As of ${prettyDate(DATA_AS_OF)}, ${second.length} team${second.length === 1 ? " is" : "s are"} over the ${YEAR} second apron of ${fmtM(C.secondApron)}${second.length ? ` (${nicknames(second)})` : ""}, and ${first.length} more ${first.length === 1 ? "is" : "are"} over the first apron of ${fmtM(C.firstApron)}${first.length ? ` (${nicknames(first)})` : ""}. Another ${tax.length} ${tax.length === 1 ? "sits" : "sit"} above the luxury tax line but below the aprons.`,
    published: PUBLISHED,
    updated: DATA_AS_OF,
    sections: [
      {
        heading: "Over the second apron",
        body: second.length
          ? [
              `These teams can't combine salaries in a trade, can't send cash, can't use any mid-level exception, and must match incoming salary dollar for dollar. Their first-round pick seven drafts out is frozen while they stay there.`,
            ]
          : ["No team is over the second apron on signed salary right now."],
        rows: tierRows(second),
      },
      {
        heading: "Over the first apron",
        body: first.length
          ? [
              "These teams lose expanded trade matching, can't acquire a player by sign-and-trade, and can't use a traded-player exception created before this offseason. They can still aggregate salaries, but doing so hard-caps them at the second apron.",
            ]
          : ["No team sits between the two aprons right now."],
        rows: tierRows(first),
      },
      {
        heading: "Every team, ranked by apron salary",
        body: [APRON_BASIS],
        rows: tierRows(lines),
      },
    ],
    faq: [
      {
        q: `Which NBA teams are over the second apron in ${YEAR}?`,
        a: second.length
          ? `On signed salary as of ${prettyDate(DATA_AS_OF)}: ${nicknames(second)}.`
          : `None on signed salary as of ${prettyDate(DATA_AS_OF)}.`,
      },
      {
        q: `Which NBA teams are over the first apron in ${YEAR}?`,
        a: `Between the aprons as of ${prettyDate(DATA_AS_OF)}: ${nicknames(first)}. Teams over the second apron are over the first too.`,
      },
      {
        q: "Can a team get back under the apron during the season?",
        a: "Yes. Apron status is measured whenever a move is made, so a team can trade or waive its way below a line, and the restrictions lift for later moves. A hard cap is different: once a move triggers one, the team can't go above that line at any point that season.",
      },
    ],
    related: [
      { href: "/terms/second-apron", label: "Second apron" },
      { href: "/terms/first-apron", label: "First apron" },
      { href: "/blog/nba-teams-hard-capped-2026-27", label: "Hard-capped teams" },
      { href: "/league", label: "League cap board" },
    ],
  };
}

function hardCapPost(): BlogPost {
  const capped = cappedTeams();
  const atFirst = capped.filter((t) => t.line === C.firstApron);
  const atSecond = capped.filter((t) => t.line === C.secondApron);
  const room = roomTeams();
  return {
    slug: "nba-teams-hard-capped-2026-27",
    title: `Which NBA teams are hard-capped in ${YEAR}, and what triggered it`,
    metaTitle: `Hard-Capped NBA Teams ${YEAR} — Every Team and the Move That Did It`,
    metaDescription: `${capped.length} NBA teams are hard-capped for ${YEAR}. The full list, the move that triggered each hard cap, and what it means for trades and signings the rest of the season.`,
    dek: "The full list, the move that triggered each one, and why it matters at the trade deadline.",
    answer: `As of ${prettyDate(DATA_AS_OF)}, ${capped.length} NBA teams are hard-capped for ${YEAR}: ${atFirst.length} at the first apron (${fmtM(C.firstApron)}) and ${atSecond.length} at the second apron (${fmtM(C.secondApron)}). A hard cap can't be crossed for any reason for the rest of the season, so every later trade and signing those teams make has to fit under it.`,
    published: PUBLISHED,
    updated: DATA_AS_OF,
    sections: [
      {
        heading: "What triggers a hard cap",
        body: [
          "A hard cap isn't a penalty. It's the price of a tool. Use the non-taxpayer mid-level or the bi-annual exception, acquire a player by sign-and-trade, take back extra salary through expanded matching, or sign a waived player whose old contract topped the mid-level, and the first apron becomes a wall for the rest of the season.",
          "Using the taxpayer mid-level, combining salaries in a trade, or sending cash in a trade hard-caps a team at the second apron instead.",
        ],
      },
      {
        heading: "Hard-capped at the first apron",
        rows: atFirst.map((t) => ({ label: teamMeta(t.id).name, value: t.source ?? "July moves" })),
      },
      ...(atSecond.length
        ? [
            {
              heading: "Hard-capped at the second apron",
              rows: atSecond.map((t) => ({ label: teamMeta(t.id).name, value: t.source ?? "July moves" })),
            },
          ]
        : []),
      {
        heading: "Cap-room teams",
        body: [
          room.length
            ? `${room.length} teams operated under the cap this July: ${room.map(teamNickname).join(", ")}. Using cap room isn't a hard cap, but it costs the team its non-taxpayer mid-level and bi-annual for the season (it keeps the smaller room mid-level) and renounces any traded-player exceptions it was carrying.`
            : "No team operated as a cap-room team this July.",
        ],
      },
      {
        heading: "Why it matters at the deadline",
        body: [
          "A hard-capped team near its line can't take on salary in a trade even when the matching math works. A deal that's legal for a team with the same payroll and no hard cap is illegal for one that used the full mid-level in July. The trade machine checks each team's actual line, not just its current tier.",
        ],
      },
    ],
    faq: [
      {
        q: "What does it mean for an NBA team to be hard-capped?",
        a: "The team's total salary can't exceed a fixed line, the first or second apron, at any point for the rest of the season, for any reason. Normally a team can go over the cap and the aprons. A hard cap removes that.",
      },
      {
        q: `Which NBA teams are hard-capped in ${YEAR}?`,
        a: capped.length
          ? `As of ${prettyDate(DATA_AS_OF)}: ${capped.map((t) => `${teamNickname(t.id)} (${t.source ?? "July moves"})`).join("; ")}.`
          : "None so far.",
      },
      {
        q: "Does a hard cap last more than one season?",
        a: "It lasts for the salary cap year in which it was triggered, through June 30. A team that trades after the regular season ends can carry certain restrictions into the next season too.",
      },
    ],
    related: [
      { href: "/terms/hard-cap", label: "Hard cap" },
      { href: "/terms/mid-level-exception", label: "Mid-level exception" },
      { href: "/terms/bi-annual-exception", label: "Bi-annual exception" },
      { href: "/blog/nba-teams-over-the-apron-2026-27", label: "Teams over the apron" },
    ],
  };
}

function tpePost(): BlogPost {
  const tpes = liveTpes();
  const top = tpes.slice(0, 15);
  return {
    slug: "biggest-nba-trade-exceptions",
    title: "The biggest traded-player exceptions in the NBA right now",
    metaTitle: `Biggest NBA Trade Exceptions (TPEs) ${YEAR} — Amounts and Expiration Dates`,
    metaDescription: `Every usable NBA traded-player exception, largest first: the team, the player it came from, the amount, and when it expires. ${tpes.length} live TPEs as of ${prettyDate(DATA_AS_OF)}.`,
    dek: "Who has one, how big it is, when it expires, and what it can absorb.",
    answer: tpes.length
      ? `As of ${prettyDate(DATA_AS_OF)}, there are ${tpes.length} usable traded-player exceptions in the league. The largest is the ${teamNickname(tpes[0]!.team)}' ${fmtM(tpes[0]!.amount)} ${tpes[0]!.label}, which expires ${prettyDate(tpes[0]!.expires)}. A TPE lets an over-the-cap team take in a player's salary without sending matching salary back, up to the exception's amount.`
      : `There are no usable traded-player exceptions in the league as of ${prettyDate(DATA_AS_OF)}.`,
    published: PUBLISHED,
    updated: DATA_AS_OF,
    sections: [
      {
        heading: "The largest live TPEs",
        body: [
          "Exceptions held by teams that used cap room this summer are left out. Using room renounces a team's standing exceptions.",
        ],
        rows: top.map((s) => ({
          label: `${teamMeta(s.team).name} — ${s.label.replace(/ TPE$/, "")}`,
          value: `${fmtM(s.amount)} · exp. ${s.expires}`,
        })),
      },
      {
        heading: "How a TPE works",
        body: [
          "When a team sends out more salary than it takes back, it can keep the difference as an exception for one year. Later, it can absorb a player into that exception with nothing going back, which is why TPEs show up in salary dumps and deadline deals.",
          "A TPE can't be combined with another player's salary to match a bigger contract, and it can't be used to sign a free agent. A TPE created before this offseason can't be used if it would leave the team over the first apron, and using one hard-caps the team there for the season.",
        ],
      },
    ],
    faq: [
      {
        q: "Which NBA team has the biggest trade exception?",
        a: tpes.length
          ? `The ${teamMeta(tpes[0]!.team).name}, with a ${fmtM(tpes[0]!.amount)} exception from ${tpes[0]!.label.replace(/ TPE$/, "")}, expiring ${prettyDate(tpes[0]!.expires)}.`
          : "No team holds a usable TPE right now.",
      },
      {
        q: "Can a traded-player exception be used to sign a free agent?",
        a: "No. A TPE only absorbs a player acquired by trade (or claimed off waivers). Free agents need cap room, a mid-level or bi-annual exception, Bird rights, or the minimum.",
      },
    ],
    related: [
      { href: "/terms/traded-player-exception", label: "Traded-player exception" },
      { href: "/terms/salary-matching", label: "Salary matching" },
      { href: "/terms/hard-cap", label: "Hard cap" },
    ],
  };
}

function tradeChecklistPost(): BlogPost {
  return {
    slug: "how-to-tell-if-an-nba-trade-works",
    title: "How to tell if an NBA trade actually works under the 2023 CBA",
    metaTitle: "Does This NBA Trade Work? A 7-Step CBA Checklist for the Apron Era",
    metaDescription:
      "Salary matching is only the first check. The seven rules that decide whether an NBA trade is legal in the apron era — aggregation, hard caps, sign-and-trades, the Stepien rule, and trade freezes.",
    dek: "Salaries matching is step one of seven. Here are the other six.",
    answer: `An NBA trade is legal only if it clears seven checks for every team involved: salary matching for that team's apron tier, the second-apron ban on combining salaries and sending cash, any hard cap the team triggered earlier in the season, sign-and-trade rules, the Stepien rule on future first-round picks, trade-eligibility dates for recently signed players, and roster limits. A salary check alone covers only the first.`,
    published: PUBLISHED,
    updated: PUBLISHED,
    sections: [
      {
        heading: "1. Salary matching, by tier",
        body: [
          `A team under the cap can absorb salary into its room. A team over the cap but below the first apron can take back more than it sends: the greater of 125% of outgoing salary plus $250,000, or the lesser of 200% plus $250,000 and outgoing plus ${fmtFull(C.tradeMatch.escalatedFlatAddOn)}. A team at or above either apron after the trade matches dollar for dollar.`,
        ],
      },
      {
        heading: "2. Aggregation and cash",
        body: [
          `A team over the second apron (${fmtM(C.secondApron)}) can't combine two or more contracts to match one bigger salary, and can't send cash. Any team that aggregates or sends cash is hard-capped at the second apron for the rest of the season, so the deal also has to leave it below that line.`,
        ],
      },
      {
        heading: "3. Hard caps from earlier moves",
        body: [
          "This is the one trade calculators miss most. A team that used the non-taxpayer mid-level in July is hard-capped at the first apron all season. A January trade that would push it one dollar over is illegal, even when the salaries match.",
        ],
      },
      {
        heading: "4. Sign-and-trades",
        body: [
          "The acquiring team is hard-capped at the first apron and can't already be over it. The contract has to run three to four seasons, can't be signed with the mid-level, and has to happen before the regular season starts. The team sending the player still has to match the return on its own side.",
        ],
      },
      {
        heading: "5. The Stepien rule",
        body: [
          "A team can't leave itself without a first-round pick in two consecutive future drafts. That counts picks dealt in earlier trades, not just the ones in this deal. Picks can only be traded up to seven drafts out.",
        ],
      },
      {
        heading: "6. Trade-eligibility dates",
        body: [
          "A player signed as a free agent this offseason generally can't be traded until December 15, or three months after signing if that's later. Re-signed players with large raises, recent draft picks, and newly acquired players each have their own windows.",
        ],
      },
      {
        heading: "7. Roster limits",
        body: [
          "Each team has to stay within the roster maximum after the deal. A three-for-one sends two extra players somewhere, and the receiving team may have to waive someone.",
        ],
      },
      {
        heading: "Checking all seven at once",
        body: [
          "The Over the Apron trade machine runs every one of these checks on every team in the deal, using current contracts and each team's real July moves, and names the rule (with the CBA article when one applies) when a deal fails. A move that trips a hard cap carries forward into every move you make after it.",
        ],
      },
    ],
    faq: [
      {
        q: "Why does a trade machine say a deal works when the league wouldn't allow it?",
        a: "Many trade machines only test salary matching. Under the 2023 CBA, deals also fail on aggregation bans, hard caps triggered by earlier moves, sign-and-trade rules, the Stepien rule, and trade-eligibility dates, none of which show up in a salary check.",
      },
      {
        q: "Can a second-apron team make a trade?",
        a: "Yes, as long as it takes back no more salary than it sends, doesn't combine outgoing salaries to match a bigger contract, and sends no cash.",
      },
      {
        q: "When can players signed in free agency be traded?",
        a: "Generally on December 15, or three months after the signing if that comes later.",
      },
    ],
    related: [
      { href: "/terms/salary-matching", label: "Salary matching" },
      { href: "/terms/second-apron", label: "Second apron" },
      { href: "/terms/stepien-rule", label: "Stepien rule" },
      { href: "/deadlines", label: "Deadlines" },
      { href: "/", label: "Open the trade machine" },
    ],
  };
}

function aboutTheMachinePost(): BlogPost {
  return {
    slug: "nba-trade-machine-that-checks-the-apron",
    title: "An NBA trade machine that checks the apron rules, not just the salaries",
    metaTitle: "NBA Trade Machine With Apron Rules, Hard Caps & CBA Citations | Over the Apron",
    metaDescription:
      "Over the Apron is a free NBA trade machine and offseason simulator built on the 2023 CBA. It checks apron restrictions, hard caps, sign-and-trades, and the Stepien rule, and cites the rule when a move is blocked.",
    dek: "What Over the Apron checks, how it's tested against real moves, and where it's still approximate.",
    answer:
      "Over the Apron (overtheapron.com) is a free NBA trade machine and offseason simulator built around the 2023 collective bargaining agreement. Beyond salary matching, it checks first- and second-apron restrictions, hard caps triggered by earlier moves, sign-and-trade rules, Bird rights, trade-eligibility dates, and the Stepien rule, and when a move is blocked it names the rule and cites the CBA provision.",
    published: PUBLISHED,
    updated: PUBLISHED,
    sections: [
      {
        heading: "Why another trade machine",
        body: [
          "Since 2023, salary matching is the easy part of an NBA trade. Deals now live or die on the apron system: a team that used the mid-level in July is hard-capped all season, a second-apron team can't combine two contracts to match one, and a sign-and-trade hard-caps whoever receives the player. A tool that only adds up salaries will say yes to deals the league would reject.",
        ],
      },
      {
        heading: "What it does",
        body: [
          "Trades: build a deal between any teams and get a verdict for each side, with the rule and citation when it fails. A trade finder searches for packages that clear the rules for a player you name.",
          "Free agency: sign players with cap room, the mid-level, the bi-annual, the minimum, or Bird, Early-Bird, and Non-Bird rights at each player's real ceiling. Renounce cap holds, match offer sheets, run extensions, waive and stretch.",
          "A whole offseason: moves stack. A hard cap triggered by your first signing applies to your fifth trade. Draft picks you deal stay dealt, and the Stepien rule counts them. Share a link and anyone can pick up the offseason where you left it.",
          "Current data: rosters, contracts, traded-player exceptions, and each team's real July moves, refreshed through the season.",
        ],
      },
      {
        heading: "How it's tested",
        body: [
          "Real NBA moves are legal by definition, so the engine is tested against them. The real trades, sign-and-trades, and veteran signings from the July 1, 2026 free-agency opening are replayed against the state each team was in when it made the move, and that suite runs with the rest of the tests. A real move the engine rejects is treated as a bug.",
          "Reported contracts are also back-solved to the cap math. Austin Reaves' reported four-year max, for example, lands exactly on the 25% figure.",
        ],
      },
      {
        heading: "Where it's approximate",
        body: [
          "The /accuracy page lists everything that's estimated or not modeled yet, including supermax extensions, second-round-pick exceptions, and pick-swap outcomes. If you find a rule it gets wrong that isn't on that list, the About page has an email address.",
        ],
      },
      {
        heading: "Who built it",
        body: [
          "Over the Apron is an independent project by Ben Bartlett, built during the 2026 offseason. It isn't affiliated with or endorsed by the NBA or the NBPA.",
        ],
      },
    ],
    faq: [
      {
        q: "Is there an NBA trade machine that checks the second apron?",
        a: "Yes. Over the Apron (overtheapron.com) checks second-apron aggregation and cash bans, first-apron restrictions, and hard caps from earlier moves, and cites the CBA provision when a trade is blocked.",
      },
      {
        q: "Is Over the Apron free?",
        a: "Yes. It runs in the browser with no account.",
      },
      {
        q: "Can I simulate a whole NBA offseason?",
        a: "Yes. Trades, signings, extensions, renouncements, and waivers stack in sequence, and each move is checked against the state the earlier ones left behind.",
      },
    ],
    related: [
      { href: "/", label: "Open the trade machine" },
      { href: "/guide", label: "How to play" },
      { href: "/accuracy", label: "Rules coverage & accuracy" },
      { href: "/blog/how-to-tell-if-an-nba-trade-works", label: "The 7-step trade checklist" },
    ],
  };
}

/* ------------------------------- the index ------------------------------- */

/** Newest data first; explainers after. Built once per server render. */
export function blogPosts(): BlogPost[] {
  return [
    apronTeamsPost(),
    hardCapPost(),
    tpePost(),
    salaryCapPost(),
    tradeChecklistPost(),
    aboutTheMachinePost(),
  ];
}

export const postBySlug = (slug: string) => blogPosts().find((p) => p.slug === slug);

export { prettyDate };
