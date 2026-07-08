import { spendingPower, classifyTier } from "@apron/cba-engine";
import { TRADE_EXCEPTIONS, DRAFT_PICKS } from "@apron/data";
import {
  BASE_CONTRACTS,
  C,
  TEAM_IDS,
  teamMeta,
  teamNickname,
  currentSalary,
  feedStateOf,
  consumedFor,
  tpeLedger,
  freeAgentsOf,
  holdsByTeam,
} from "@/lib/league";
import { GLOSSARY, type TermKey } from "@/lib/glossary";
import { fmtM, fmtFull } from "@/lib/format";

/* ----------------------------- shared helpers ---------------------------- */

export const SITE = "https://overtheapron.com";

const cappedTeams = () =>
  TEAM_IDS.filter((t) => Number.isFinite(feedStateOf(t).hardCap)).map((t) => ({
    team: t,
    name: teamMeta(t).name,
    source: feedStateOf(t).hardCapSource,
  }));

const biggestTpes = (n: number) =>
  [...TRADE_EXCEPTIONS]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map((x) => ({ team: x.team, player: x.player, amount: x.amount, expires: x.expires }));

/* ------------------------------- /terms data ----------------------------- */

export interface TermSection {
  heading: string;
  /** Plain paragraphs; rows renders as a small data table. */
  body?: string[];
  rows?: { label: string; value: string }[];
}

export interface SeoTerm {
  slug: string;
  key: TermKey;
  /** The search phrasing: "What is the first apron?" */
  question: string;
  metaTitle: string;
  metaDescription: string;
  sections: TermSection[];
  faq: { q: string; a: string }[];
  related: string[];
}

const lines = (): TermSection => ({
  heading: "The 2026-27 lines",
  rows: [
    { label: "Salary cap", value: fmtFull(C.salaryCap) },
    { label: "Luxury tax", value: fmtFull(C.luxuryTaxLine) },
    { label: "First apron", value: fmtFull(C.firstApron) },
    { label: "Second apron", value: fmtFull(C.secondApron) },
  ],
});

const usedItThisJuly = (matcher: (src: string) => boolean, label: string): TermSection => {
  const teams = cappedTeams().filter((t) => t.source && matcher(t.source));
  return {
    heading: `Who used it this July`,
    body: teams.length
      ? [
          `Real 2026 offseason usage, straight from the audited feed: ${teams
            .map((t) => `the ${teamNickname(t.team)} (${t.source})`)
            .join("; ")}. Each of those teams is hard-capped at the first apron of ${fmtM(C.firstApron)} for the rest of the season — the sim enforces that cap on every trade you build.`,
        ]
      : [`No team has used the ${label} yet this offseason.`],
  };
};

export const SEO_TERMS: SeoTerm[] = [
  {
    slug: "first-apron",
    key: "first_apron",
    question: "What is the first apron?",
    metaTitle: `First Apron Explained — ${fmtM(C.firstApron)} in 2026-27 | NBA CBA`,
    metaDescription: `The NBA first apron for 2026-27 is ${fmtFull(C.firstApron)}. What it restricts, which moves hard-cap a team at it, and every team capped there right now.`,
    sections: [
      lines(),
      {
        heading: "Teams hard-capped at the first apron right now",
        body: [
          `As of the real July 2026 moves, ${cappedTeams().length} teams are hard-capped at the first apron: ${cappedTeams()
            .map((t) => `${teamNickname(t.team)}${t.source ? ` (${t.source})` : ""}`)
            .join(", ")}.`,
          "A hard cap isn't a penalty — it's the price of a tool. Use the full mid-level, the bi-annual exception, or acquire a player by sign-and-trade, and the first apron becomes a wall you cannot cross for any reason, all season.",
        ],
      },
    ],
    faq: [
      {
        q: "What can't a team over the first apron do?",
        a: "No sign-and-trade acquisitions, no expanded salary matching in trades (100% + $250k only), no buyout-market signings above the minimum, and no using a pre-existing traded-player exception.",
      },
      {
        q: "What hard-caps a team at the first apron?",
        a: "Using the non-taxpayer mid-level, the bi-annual exception, expanded (200%) salary matching, acquiring a player via sign-and-trade, or absorbing salary into a pre-existing traded-player exception.",
      },
    ],
    related: ["second-apron", "hard-cap", "mid-level-exception", "salary-matching"],
  },
  {
    slug: "second-apron",
    key: "second_apron",
    question: "What is the second apron?",
    metaTitle: `Second Apron Explained — ${fmtM(C.secondApron)} in 2026-27 | NBA CBA`,
    metaDescription: `The NBA second apron for 2026-27 is ${fmtFull(C.secondApron)}. The full restriction list — no aggregation, no cash, frozen picks — in plain English.`,
    sections: [
      lines(),
      {
        heading: "The restriction list",
        body: [
          "Second-apron teams cannot aggregate salaries in a trade (no combining two contracts to match one bigger one), cannot send cash in any trade, cannot use any mid-level exception, cannot sign buyout players above the minimum, and their first-round pick seven drafts out is frozen — repeat offenders see it moved to the end of the round.",
          "This is why star-heavy rosters shed role players: every dollar over the second apron closes another door.",
        ],
      },
    ],
    faq: [
      {
        q: "Can a second-apron team trade at all?",
        a: "Yes — but only one-for-one style deals taking back no more salary than they send out (100% matching), with no aggregation and no cash sweeteners.",
      },
      {
        q: "Which pick gets frozen?",
        a: "The team's own first-round pick seven years out. Stay over the second apron in repeat seasons and the frozen pick drops to the end of the first round.",
      },
    ],
    related: ["first-apron", "salary-matching", "hard-cap", "traded-player-exception"],
  },
  {
    slug: "salary-matching",
    key: "matching",
    question: "How does NBA salary matching work?",
    metaTitle: "NBA Salary Matching Rules 2026-27 — Exact Trade Math | Over the Apron",
    metaDescription: `The exact 2026-27 trade-matching bands: 200% + $250k, outgoing + $9,095,709, or 125% + $250k — and how the aprons shrink them.`,
    sections: [
      {
        heading: "The 2026-27 matching bands",
        rows: [
          { label: "Small salaries (expanded)", value: "200% of outgoing + $250,000" },
          { label: "Mid salaries (expanded)", value: "Outgoing + $9,095,709" },
          { label: "Large salaries (expanded)", value: "125% of outgoing + $250,000" },
          { label: "First or second apron", value: "100% of outgoing — dollar-for-dollar, no expanded bands" },
        ],
      },
      {
        heading: "Why $9,095,709?",
        body: [
          `The CBA wrote the middle band as outgoing + $7.5M in 2023 dollars, escalating with cap growth (Art. VII §6(j)). With the 2026-27 cap at ${fmtFull(C.salaryCap)}, the escalated figure is $9,095,709. Most trade machines still use the flat $7.5M — that's a real class of wrong verdicts.`,
        ],
      },
    ],
    faq: [
      {
        q: "Does using expanded matching have a cost?",
        a: "Yes — taking back more than 125% + $250k of outgoing salary hard-caps the team at the first apron for the rest of the season.",
      },
      {
        q: "What is aggregation?",
        a: "Combining multiple outgoing contracts into one matching calculation. Second-apron teams can't do it at all, and recently-acquired players sometimes can't be aggregated for two months.",
      },
    ],
    related: ["traded-player-exception", "first-apron", "second-apron", "hard-cap"],
  },
  {
    slug: "traded-player-exception",
    key: "tpe",
    question: "What is a traded-player exception (TPE)?",
    metaTitle: "Traded-Player Exceptions (TPE) Explained — Every Active NBA TPE | Over the Apron",
    metaDescription:
      "What a TPE is, how one is created, the first-apron catch on using one — plus the biggest active NBA trade exceptions right now.",
    sections: [
      {
        heading: "The biggest active TPEs",
        rows: biggestTpes(6).map((x) => ({
          label: `${x.team} — ${x.player}`,
          value: `${fmtM(x.amount)} · expires ${x.expires}`,
        })),
      },
      {
        heading: "The first-apron catch",
        body: [
          "A pre-existing TPE (one created in an earlier transaction window) cannot be used if it would leave the team above the first apron — and using one hard-caps the team there for the season. A TPE created earlier in the same offseason is exempt from that particular trap.",
          "The sim carries every real active TPE and auto-fits the right one to your trade, with the apron consequence printed on the receipt.",
        ],
      },
    ],
    faq: [
      {
        q: "How is a TPE created?",
        a: "Trade a player away while taking back less salary than he makes and the difference becomes a credit — usable for up to a year to absorb an incoming player without salary matching.",
      },
      {
        q: "Can TPEs be combined?",
        a: "No. Each exception absorbs players one at a time up to its amount; you can't stack two TPEs on one incoming salary.",
      },
    ],
    related: ["salary-matching", "first-apron", "hard-cap"],
  },
  {
    slug: "stepien-rule",
    key: "picks",
    question: "What is the Stepien rule?",
    metaTitle: "The Stepien Rule Explained — NBA First-Round Pick Trading Limits | Over the Apron",
    metaDescription:
      "Why NBA teams can't trade first-round picks in consecutive future drafts, how protections and swaps count, with real 2026 examples.",
    sections: [
      {
        heading: "How it actually bites",
        body: [
          "The rule: a team may never leave itself without a first-round pick in consecutive future drafts. The subtlety: picks you already owe count against you. If your 2030 first is owed to another team — even protected — trading your 2031 first leaves 2030 and 2031 both uncovered, and the deal is dead. The offending pick is the one you just added, not the one that left years ago.",
          "The sim tracks every real obligation for all 30 teams and names the exact pick that breaks the rule.",
        ],
      },
    ],
    faq: [
      {
        q: "Do protected picks count as covered?",
        a: "No — a protected pick might not convey, so the league treats that year as uncovered for Stepien purposes.",
      },
      {
        q: "Do pick swaps count?",
        a: "A swap still leaves you with a first-round pick that year (just possibly a worse one), so swap years remain covered.",
      },
    ],
    related: ["traded-player-exception", "salary-matching"],
  },
  {
    slug: "mid-level-exception",
    key: "ntmle",
    question: "What is the mid-level exception (MLE)?",
    metaTitle: `Mid-Level Exception 2026-27 — ${fmtM(C.nonTaxpayerMLE)} Non-Taxpayer MLE | NBA CBA`,
    metaDescription: `The 2026-27 non-taxpayer MLE is ${fmtFull(C.nonTaxpayerMLE)}. Who can use it, the first-apron hard cap it triggers, and every team that spent it this July.`,
    sections: [
      {
        heading: "The 2026-27 exception amounts",
        rows: [
          { label: "Non-taxpayer MLE", value: `${fmtFull(C.nonTaxpayerMLE)} · up to 4 years` },
          { label: "Taxpayer MLE", value: `${fmtFull(C.taxpayerMLE)} · up to 2 years` },
          { label: "Room MLE", value: `${fmtFull(C.roomMLE)} · up to 3 years` },
          { label: "Bi-annual exception", value: `${fmtFull(C.biAnnualException)} · up to 2 years` },
        ],
      },
      usedItThisJuly((src) => /NT-MLE/i.test(src), "non-taxpayer MLE"),
    ],
    faq: [
      {
        q: "Does using the MLE hard-cap a team?",
        a: `Using more than the taxpayer-MLE portion of the non-taxpayer MLE hard-caps the team at the first apron (${fmtM(C.firstApron)}) for the rest of the season.`,
      },
      {
        q: "Can a team that used cap room also use the MLE?",
        a: "No — operating as a cap-room team forfeits the non-taxpayer MLE, taxpayer MLE, and bi-annual exception for that year. Room teams get the smaller Room MLE instead.",
      },
    ],
    related: ["room-mid-level-exception", "bi-annual-exception", "first-apron", "cap-space"],
  },
  {
    slug: "room-mid-level-exception",
    key: "room_mle",
    question: "What is the room mid-level exception?",
    metaTitle: `Room MLE 2026-27 — ${fmtM(C.roomMLE)} | NBA CBA`,
    metaDescription: `The 2026-27 room mid-level exception is ${fmtFull(C.roomMLE)}: the tool cap-space teams get after spending their room.`,
    sections: [
      {
        heading: "How it works",
        body: [
          `A team that uses cap room gives up the regular MLEs and bi-annual exception — in exchange it can sign one or more players using the Room MLE (${fmtFull(C.roomMLE)} in 2026-27, up to 3 years) even after its cap space is gone.`,
          "The Lakers ran exactly this playbook in July 2026: room signings first, then Collin Sexton for the full Room MLE.",
        ],
      },
    ],
    faq: [
      {
        q: "Does the Room MLE hard-cap a team?",
        a: "No — the Room MLE is one of the few exceptions with no apron hard cap attached.",
      },
    ],
    related: ["mid-level-exception", "cap-space", "bi-annual-exception"],
  },
  {
    slug: "bi-annual-exception",
    key: "bae",
    question: "What is the bi-annual exception (BAE)?",
    metaTitle: `Bi-Annual Exception 2026-27 — ${fmtM(C.biAnnualException)} | NBA CBA`,
    metaDescription: `The 2026-27 BAE is ${fmtFull(C.biAnnualException)}. Who can use it, the every-other-year limit, and the first-apron hard cap it triggers.`,
    sections: [
      usedItThisJuly((src) => /BAE/i.test(src), "bi-annual exception"),
    ],
    faq: [
      {
        q: "Why 'bi-annual'?",
        a: "A team that uses it can't use it again the following season — it's available at most every other year.",
      },
      {
        q: "Does the BAE hard-cap a team?",
        a: `Yes — any use hard-caps the team at the first apron (${fmtM(C.firstApron)}) for the rest of the season.`,
      },
    ],
    related: ["mid-level-exception", "first-apron", "hard-cap"],
  },
  {
    slug: "bird-rights",
    key: "bird",
    question: "What are Bird rights?",
    metaTitle: "Bird Rights Explained — Full, Early, and Non-Bird | NBA CBA 2026-27",
    metaDescription:
      "How Bird, Early Bird, and Non-Bird rights let NBA teams re-sign their own free agents over the cap — and the raise limits on each.",
    sections: [
      {
        heading: "The three tiers",
        rows: [
          { label: "Full Bird (3 seasons)", value: "Up to the max, 8% raises, 5 years" },
          { label: "Early Bird (2 seasons)", value: "175% of prior salary or 105% of average salary, 4 years min 2" },
          { label: "Non-Bird (1 season)", value: "120% of prior salary, 4 years" },
        ],
      },
      {
        heading: "Where it decides real deals",
        body: [
          "Bird rights are why a capped-out team can hand its own star a max. They're also a trap: when a role player's Non-Bird 120% raise falls short of his market, the team must dip into its mid-level instead — exactly what happened with Jock Landale and the Hawks this July, which is why Atlanta is hard-capped.",
        ],
      },
    ],
    faq: [
      {
        q: "Do Bird rights travel in a trade?",
        a: "Yes — a traded player carries his Bird clock to the new team, which can then re-sign him over the cap.",
      },
      {
        q: "What's a Bird cap hold?",
        a: "Until re-signed or renounced, a free agent's Bird rights occupy cap room as a hold, so teams can't double-spend the same space.",
      },
    ],
    related: ["cap-hold", "cap-space", "minimum-contract"],
  },
  {
    slug: "cap-space",
    key: "cap_room",
    question: "How does NBA cap space work?",
    metaTitle: `NBA Cap Space 2026-27 — ${fmtM(C.salaryCap)} Cap, Holds & Renouncing | Over the Apron`,
    metaDescription: `The 2026-27 cap is ${fmtFull(C.salaryCap)}. How cap holds shrink usable room, what renouncing costs, and what room teams give up.`,
    sections: [
      lines(),
      {
        heading: "The part everyone forgets",
        body: [
          "Cap space isn't cap minus payroll — every unrenounced free agent sits on the books as a cap hold. To spend room you renounce the holds, which surrenders those players' Bird rights. And once a team USES room, it forfeits the regular MLEs and bi-annual exception for the year, keeping only the smaller Room MLE.",
        ],
      },
    ],
    faq: [
      {
        q: "What did room cost the Lakers in July 2026?",
        a: "Operating as a room team meant renouncing LeBron James' hold and losing the non-taxpayer MLE and BAE for the season — the sim arrives with all of that already applied.",
      },
    ],
    related: ["cap-hold", "room-mid-level-exception", "bird-rights"],
  },
  {
    slug: "hard-cap",
    key: "hard_cap",
    question: "What triggers an NBA hard cap?",
    metaTitle: "NBA Hard Caps Explained — Every Trigger and Every Capped 2026 Team | Over the Apron",
    metaDescription:
      "The NBA has no permanent hard cap — teams create their own. Every trigger, both apron lines, and all teams currently hard-capped.",
    sections: [
      {
        heading: "First-apron triggers",
        body: [
          "Using more than the taxpayer portion of the non-taxpayer MLE, using the bi-annual exception, acquiring a player via sign-and-trade, taking back more than 125% + $250k in a trade (expanded matching), or using a pre-existing traded-player exception.",
        ],
      },
      {
        heading: "Second-apron trigger",
        body: ["Using the taxpayer MLE hard-caps a team at the second apron."],
      },
      {
        heading: `Hard-capped teams right now (${cappedTeams().length})`,
        rows: cappedTeams().map((t) => ({
          label: t.name,
          value: t.source ?? "real July move",
        })),
      },
    ],
    faq: [
      {
        q: "Can a hard cap be removed?",
        a: "No. Once triggered it binds for the entire league year — the only relief is shedding salary to fit under it.",
      },
    ],
    related: ["first-apron", "second-apron", "mid-level-exception", "salary-matching"],
  },
  {
    slug: "cap-hold",
    key: "cap_hold",
    question: "What is a cap hold?",
    metaTitle: "Cap Holds Explained — Why Teams Have Less Room Than You Think | NBA CBA",
    metaDescription:
      "Free-agent cap holds, what they're worth, why they exist, and how renouncing them trades Bird rights for room.",
    sections: [
      {
        heading: "Why holds exist",
        body: [
          "Without holds, a team could spend all its cap room on outside free agents and THEN re-sign its own stars with Bird rights — double-spending the same space. The hold reserves a placeholder charge (a multiple of last salary) for every unrenounced free agent until he signs or is renounced.",
          "One subtlety the sim models: holds count against CAP room, but not against APRON calculations — hard caps are tested against signed salary only.",
        ],
      },
    ],
    faq: [
      {
        q: "How big is a cap hold?",
        a: "A multiple of the player's previous salary based on Bird tier and salary size — from 120% up to 300% for cheap deals, capped at the max salary.",
      },
    ],
    related: ["cap-space", "bird-rights", "first-apron"],
  },
  {
    slug: "minimum-contract",
    key: "minimum",
    question: "How much is an NBA minimum contract?",
    metaTitle: "NBA Minimum Salaries 2026-27 — Full Scale by Years of Service | Over the Apron",
    metaDescription:
      "The complete 2026-27 minimum-salary scale, the 2-YOS deemed charge on veteran one-year minimums, and why every team can always sign minimums.",
    sections: [
      {
        heading: "The 2026-27 minimum scale (selected rows)",
        rows: [0, 1, 2, 3, 5, 7, 10]
          .map((y) => ({
            label: `${y === 10 ? "10+" : y} year${y === 1 ? "" : "s"} of service`,
            value: fmtFull(C.minimumSalaries[y] ?? 0),
          })),
      },
      {
        heading: "The deemed-minimum quirk",
        body: [
          `A veteran with 3+ years of service signing a one-year minimum only charges the team the 2-YOS figure (${fmtFull(C.minimumSalaries[2] ?? 0)}) — the league reimburses the rest, so aging vets aren't priced out of jobs. The sim books those contracts at the deemed charge automatically.`,
        ],
      },
    ],
    faq: [
      {
        q: "Can hard-capped teams sign minimums?",
        a: "Yes — the minimum exception is always available, to every team, regardless of cap, tax, or apron status.",
      },
    ],
    related: ["mid-level-exception", "cap-space"],
  },
];

export const termBySlug = (slug: string) => SEO_TERMS.find((t) => t.slug === slug);

export const glossaryFor = (t: SeoTerm) => GLOSSARY[t.key];

/* ------------------------------- /teams data ----------------------------- */

export const teamSlug = (id: string) => teamNickname(id).toLowerCase().replace(/\s+/g, "-");

export const teamIdFromSlug = (slug: string) =>
  TEAM_IDS.find((t) => teamSlug(t) === slug.toLowerCase());

export interface TeamSeo {
  id: string;
  name: string;
  nickname: string;
  committed: number;
  tier: ReturnType<typeof classifyTier>;
  hardCap: number;
  hardCapSource?: string;
  roomTeam: boolean;
  mechanisms: { label: string; maxSalary: number }[];
  tpes: { label: string; amount: number }[];
  topContracts: { name: string; salary: number }[];
  holds: number;
  faCount: number;
  owesFirsts: number;
  extraFirsts: number;
  faq: { q: string; a: string }[];
}

export function teamSeo(id: string): TeamSeo {
  const name = teamMeta(id).name;
  const nickname = teamNickname(id);
  const committed = BASE_CONTRACTS.filter((c) => c.teamId === id).reduce(
    (n, c) => n + currentSalary(c),
    0,
  );
  const feed = feedStateOf(id);
  const fas = freeAgentsOf(BASE_CONTRACTS).filter(
    (f) => f.priorTeam === id && !feed.forcedRenounced.has(f.playerName.toLowerCase()),
  );
  const holds = holdsByTeam(freeAgentsOf(BASE_CONTRACTS))[id] ?? 0;
  const power = spendingPower(committed + holds, C, {
    apronSalary: committed,
    roomTeam: feed.roomTeam,
    consumed: consumedFor([], id),
  });
  const tier = classifyTier(committed, C);
  const tpes = (tpeLedger([])[id] ?? []).map((s) => ({ label: s.label, amount: s.amount }));
  const topContracts = BASE_CONTRACTS.filter((c) => c.teamId === id && !c.deadMoney)
    .map((c) => ({ name: c.playerName, salary: currentSalary(c) }))
    .filter((c) => c.salary > 0)
    .sort((a, b) => b.salary - a.salary)
    .slice(0, 8);
  const picks = DRAFT_PICKS[id] ?? { incoming: [], outgoing: [] };
  const isFirst = (h: string) => /first round|1st round/i.test(h);
  const owesFirsts = picks.outgoing.filter((p) => isFirst(p.headline)).length;
  const extraFirsts = picks.incoming.filter((p) => isFirst(p.headline)).length;

  const mle = power.mechanisms.find((m) => m.id === "ntmle");
  const overFirst = committed > C.firstApron;
  const overSecond = committed > C.secondApron;
  const capped = Number.isFinite(feed.hardCap);

  const faq: { q: string; a: string }[] = [
    {
      q: `Can the ${nickname} use the mid-level exception?`,
      a: feed.roomTeam
        ? `No — the ${nickname} operated as a cap-room team this July, which forfeits the non-taxpayer MLE and bi-annual exception for the season.${power.mechanisms.some((m) => m.id === "room_mle") ? " They keep the smaller Room MLE." : " Their Room MLE is already spent, leaving minimum contracts only."}`
        : mle
          ? `Yes — ${fmtM(mle.maxSalary)} of the non-taxpayer MLE remains${capped ? `, but spending it is what hard-capped them (${feed.hardCapSource})` : ", though using it hard-caps them at the first apron"}.`
          : `Not the full one — at ${fmtM(committed)} in salary they're limited to ${overFirst ? "the taxpayer MLE at most" : "whatever portion survives their apron position"}.`,
    },
    {
      q: `Can the ${nickname} aggregate salaries in a trade?`,
      a: overSecond
        ? `No — they're over the second apron (${fmtM(C.secondApron)}), which bars aggregation entirely.`
        : `Yes — they're below the second apron, so they can combine outgoing contracts to match a bigger incoming salary${overFirst ? ", though being over the first apron limits them to 100% + $250k matching" : ""}.`,
    },
    {
      q: `Are the ${nickname} hard-capped?`,
      a: capped
        ? `Yes — at the ${feed.hardCap === C.firstApron ? "first" : "second"} apron (${fmtM(feed.hardCap)}) for the rest of the season, triggered by ${feed.hardCapSource ?? "their real July moves"}. Every trade in the sim is checked against that line.`
        : `Not yet — but using the full MLE, the BAE, expanded matching, or a sign-and-trade acquisition would freeze the first apron (${fmtM(C.firstApron)}) as their ceiling.`,
    },
    {
      q: `Can the ${nickname} trade a first-round pick?`,
      a:
        owesFirsts > 0
          ? `Carefully — they already owe ${owesFirsts} future first${owesFirsts > 1 ? "s" : ""}, and the Stepien rule bars leaving consecutive future drafts uncovered. The sim tracks every obligation and names the exact pick that would break the rule.`
          : `Yes — they control their own future firsts${extraFirsts ? ` plus ${extraFirsts} incoming` : ""}, subject to the Stepien rule's ban on trading firsts in consecutive future drafts.`,
    },
  ];

  return {
    id,
    name,
    nickname,
    committed,
    tier,
    hardCap: feed.hardCap,
    hardCapSource: feed.hardCapSource,
    roomTeam: feed.roomTeam,
    mechanisms: power.mechanisms.map((m) => ({ label: m.label, maxSalary: m.maxSalary })),
    tpes,
    topContracts,
    holds,
    faCount: fas.length,
    owesFirsts,
    extraFirsts,
    faq,
  };
}
