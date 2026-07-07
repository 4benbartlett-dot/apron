/** Plain-English explainers for every CBA term the UI surfaces. Opened from
 * clickable chips/badges via <Term>. Keep each body 2–3 sentences, concrete,
 * and cite the CBA article where it helps. */
export interface GlossaryEntry {
  title: string;
  body: string;
  cite?: string;
}

export const GLOSSARY = {
  // ---- cap-sheet tiers -----------------------------------------------------
  below_cap: {
    title: "Under the cap",
    body: "Team salary is below the salary cap, so the team has cap room: it can sign free agents or absorb traded salary directly into that space instead of matching salaries.",
    cite: "2023 CBA · Art. VII",
  },
  over_cap: {
    title: "Over the cap",
    body: "Above the cap but below the luxury-tax line. The team can't use cap room, so signings go through exceptions (MLE, Bird rights, minimums) and trades must satisfy salary matching.",
    cite: "2023 CBA · Art. VII",
  },
  taxpayer: {
    title: "Luxury tax",
    body: "Team salary is above the tax line, so the owner pays an escalating tax on every dollar over. Being a taxpayer also shrinks which exceptions are available (the full MLE gives way to the smaller Taxpayer MLE).",
    cite: "2023 CBA · Art. VII §2",
  },
  first_apron: {
    title: "First apron",
    body: "A hard line a few million above the tax. Teams over it lose tools: no sign-and-trade acquisitions, no expanded matching in trades (100% only), no buyout-market signings above the minimum. Some moves (using the full MLE, acquiring via sign-and-trade) hard-cap a team AT this line for the whole season.",
    cite: "2023 CBA · Art. VII",
  },
  second_apron: {
    title: "Second apron",
    body: "The most restrictive tier, above the first apron. Second-apron teams can't aggregate salaries in a trade (no combining two players to match one), can't send cash, can't use any MLE, and their future first-round pick can be frozen. Designed to make super-team payrolls painful to operate.",
    cite: "2023 CBA · Art. VII",
  },
  cap: {
    title: "Salary cap",
    body: "The league-wide ceiling on team salary, set each July from projected basketball-related income. It's a soft cap: teams routinely exceed it using exceptions like Bird rights and the MLE — the real walls are the aprons above it.",
    cite: "2023 CBA · Art. VII §2",
  },
  tax: {
    title: "Luxury-tax line",
    body: "The threshold above the cap where the owner starts paying tax on overage, at rates that escalate with distance and with repeat-offender status. Many rules key off it: taxpayer exceptions, apron lines, and the mid-level's size.",
    cite: "2023 CBA · Art. VII §2",
  },

  // ---- signing mechanisms --------------------------------------------------
  bird: {
    title: "Bird rights",
    body: "An exception letting a team exceed the cap to re-sign its own free agent who's been on the roster ~3 seasons, up to his max. This is how expensive rosters keep their stars — and it's the one signing tool even second-apron teams keep. Renouncing a free agent forfeits it. (And yes — named after Larry.)",
    cite: "2023 CBA · Art. VII §6(b)",
  },
  early_bird: {
    title: "Early Bird rights",
    body: "The two-season version of Bird rights: a team over the cap can re-sign its own free agent for up to 175% of his prior salary (or the league-average salary, if greater), on a deal of at least two seasons.",
    cite: "2023 CBA · Art. VII §6(c)",
  },
  non_bird: {
    title: "Non-Bird rights",
    body: "The one-season version: an over-the-cap team can re-sign its own free agent, but only up to 120% of his prior salary (or 120% of the minimum). Enough for role players, useless for a star raise.",
    cite: "2023 CBA · Art. VII §6(d)",
  },
  cap_room: {
    title: "Cap space",
    body: "Room below the salary cap. Teams with room sign free agents directly and can absorb incoming trade salary into the space (plus a small $250k cushion) without sending matching salary back.",
    cite: "2023 CBA · Art. VII",
  },
  ntmle: {
    title: "Non-Taxpayer Mid-Level Exception",
    body: "The full MLE (9.12% of the cap, up to 4 years) for over-the-cap teams that stay below the first apron. Using more than the taxpayer portion hard-caps the team at the first apron for the rest of the season — a hard cap this sim carries into every later move.",
    cite: "2023 CBA · Art. VII §6(e)",
  },
  tpmle: {
    title: "Taxpayer Mid-Level Exception",
    body: "The smaller MLE for teams over the first apron (up to 2 years). Using it hard-caps the team at the second apron for the season. Teams over the second apron get no MLE at all.",
    cite: "2023 CBA · Art. VII §6(f)",
  },
  room_mle: {
    title: "Room Mid-Level Exception",
    body: "A small exception (5.678% of the cap, up to 3 years) for teams that used cap room: after spending their space, they still get this to add one more mid-priced player.",
    cite: "2023 CBA · Art. VII §6(g)",
  },
  bae: {
    title: "Bi-Annual Exception",
    body: "A small exception (3.32% of the cap, up to 2 years) usable only every other season, and only by teams below the first apron. Using it hard-caps the team at the first apron.",
    cite: "2023 CBA · Art. VII §6(h)",
  },
  minimum: {
    title: "Minimum exception",
    body: "Any team, at any payroll, can sign players to the league minimum (scaled by years of service). It's the only signing tool that never hard-caps you — which is why deep-apron contenders live on minimums. Bonus fine print: a vet with 3+ years of service on a ONE-year minimum counts on the cap, tax, and aprons only at the 2-year minimum — the league reimburses his team the difference.",
    cite: "2023 CBA · Art. VII §6(i), §3(f)",
  },

  // ---- cap-sheet numbers ---------------------------------------------------
  committed_salary: {
    title: "Committed salary",
    body: "The sum of every guaranteed salary a team has on the books for a season. Your own free agents' cap holds pile on top until re-signed or renounced — holds eat cap ROOM, but apron and tax status are measured on signed salary alone (the CBA excludes Free Agent Amounts from apron math). That's why a team can have no space yet still be under the aprons.",
    cite: "2023 CBA · Art. VII §1, §2, §4(d)",
  },
  max_salary: {
    title: "Maximum salary",
    body: "A player's max is a share of the cap set by experience: 25% with 0–6 years of service, 30% with 7–9, 35% with 10+. A team re-signing its own player can always offer at least 105% of his previous salary, even past those lines.",
    cite: "2023 CBA · Art. II §7",
  },
  yos: {
    title: "Years of service",
    body: "Seasons on an NBA roster. It sets a player's minimum salary, his maximum-salary tier (25/30/35% of cap), Bird-rights eligibility, and which special rules apply — like the Gilbert Arenas cap on offer sheets to 1st/2nd-year restricted free agents.",
    cite: "2023 CBA · Art. II",
  },
  raises: {
    title: "Raises",
    body: "Multi-year deals step up from the first-year salary: 8% annual raises when a team re-signs its own free agent with Bird or Early-Bird rights, 5% for everyone else (outside signings, cap room, exceptions). That first-year number is what all the rules test.",
    cite: "2023 CBA · Art. VII §5",
  },

  team_floor: {
    title: "Minimum team salary",
    body: "Teams must spend at least 90% of the cap each season. Finish below the floor and the shortfall is paid out to the roster anyway — so tanking saves face, not money. The sim flags any sheet sitting under the line.",
    cite: "2023 CBA · Art. VII \u00a72(b)",
  },

  dead_money: {
    title: "Dead money",
    body: "Salary still owed to a player the team waived. It stays on the cap sheet — counting against the cap, tax, and aprons — even though he's gone; the stretch provision can spread it over twice the remaining years plus one. You can't trade a cap charge, and he isn't your free agent.",
    cite: "2023 CBA · Art. VII \u00a77(d) (stretch)",
  },

  // ---- trade rules ---------------------------------------------------------
  matching: {
    title: "Salary matching",
    body: "In a trade, each over-the-cap team's incoming salary is capped by a formula on its outgoing salary — expanded bands (200% + $250k on small salaries, outgoing + ~$9.1M in the middle, 125% + $250k on big ones) for teams below the first apron, and a strict 100% for teams above it. The middle figure is the CBA's \"$7.5M\" grown with the cap since 2023-24 — most trade machines still use the stale $7.5M. Every leg of a trade is judged under its own team's band.",
    cite: "2023 CBA · Art. VII §6(j)(1)(iv)",
  },
  tpe: {
    title: "Traded-player exception",
    body: "When a team trades a player away without taking equal salary back, it can keep a credit — a TPE — good for one year, to absorb an incoming player without salary matching. The catch: a TPE from a past season can't be used if it would leave the team above the first apron, and using one hard-caps the team there (a TPE minted this offseason dodges that until next year). The sim applies your biggest usable TPE automatically when a trade needs it.",
    cite: "2023 CBA · Art. VII §6(j)(1)(i); §2(e) row F",
  },
  hard_cap: {
    title: "Hard cap",
    body: "Certain moves — using the full MLE or BAE, taking back extra salary under expanded matching, acquiring a player by sign-and-trade — freeze a ceiling (first or second apron) the team may not cross for the rest of the season, for any reason. The ceiling is tested against apron salary (signed money — cap holds don't count). This sim remembers your hard cap across moves: a trade today can kill a signing next week, and vice versa.",
    cite: "2023 CBA · Art. VII §2(e)",
  },
  no_trade: {
    title: "Trade restriction",
    body: "The CBA freezes recently signed players: free agents signed this offseason can't be traded until December 15 (later for some Bird re-signings), draft picks for 30 days after signing, and extensions beyond extend-and-trade limits for six months. Extensions within those limits — like a pre-moratorium extension of an expiring deal — carry no freeze at all.",
    cite: "2023 CBA · Art. VII §8(d)–(f)",
  },
  cap_hold: {
    title: "Cap hold",
    body: "A placeholder charge (a multiple of last year's salary, by Bird status) that a team's own free agent occupies on its books until he re-signs, is renounced, or signs elsewhere. Holds keep teams from spending the same dollar twice: you can't use \"his\" room and then re-sign him with Bird rights. Renouncing clears the hold but forfeits the Bird rights.",
    cite: "2023 CBA · Art. VII §4",
  },
  rfa: {
    title: "Restricted free agent",
    body: "A free agent whose team gave a qualifying offer, earning the right to match any offer sheet he signs. Match and you keep him at the rival's terms (but can't trade him without his consent for a year); first-to-second-year players are further capped by the Gilbert Arenas rule.",
    cite: "2023 CBA · Art. XI §5",
  },
  picks: {
    title: "Draft-pick trading",
    body: "Teams may trade firsts up to seven drafts out, but the Stepien rule bars leaving yourself without a first-round pick in consecutive future drafts. This sim tracks pick ownership across every move you make, so a pick you dealt two trades ago still counts against you. A first your team already owes away in the real world never appears here — it isn't yours to trade, and its year counts as uncovered.",
    cite: "NBA rule (Stepien); 2023 CBA · Art. VII",
  },
  trade_value: {
    title: "Impact (100 scale)",
    body: "Each player's on-court value impact from a RAPM × true-wins blend, scaled so the league's best player reads 100, replacement level ≈ 0, and net-negative players go below zero. It's a talent gauge, not a contract measure — salary matching and the aprons handle whether a deal is legal. The fairness meter sums impact per side; picks are priced off the origin team's projected slot on the same scale.",
    cite: "overtheapron.com/accuracy",
  },
} as const;

export type TermKey = keyof typeof GLOSSARY;
