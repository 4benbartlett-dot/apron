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
    body: "An exception letting a team exceed the cap to re-sign its own free agent who's been on the roster ~3 seasons, up to his max. This is how expensive rosters keep their stars — and it's the one signing tool even second-apron teams keep. Renouncing a free agent forfeits it.",
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
    body: "Any team, at any payroll, can sign players to the league minimum (scaled by years of service). It's the only signing tool that never hard-caps you — which is why deep-apron contenders live on minimums.",
    cite: "2023 CBA · Art. VII §6(i)",
  },

  // ---- trade rules ---------------------------------------------------------
  matching: {
    title: "Salary matching",
    body: "In a trade, each over-the-cap team's incoming salary is capped by a formula on its outgoing salary — expanded bands (200% + $250k on small salaries, +$7.5M in the middle, 125% + $250k on big ones) for teams below the first apron, and a strict 100% for teams above it. Every leg of a trade is judged under its own team's band.",
    cite: "2023 CBA · Art. VII §6(j)",
  },
  hard_cap: {
    title: "Hard cap",
    body: "Certain moves — using the full MLE or BAE, taking back extra salary under expanded matching, acquiring a player by sign-and-trade — freeze a ceiling (first or second apron) the team may not cross for the rest of the season, for any reason. This sim remembers your hard cap across moves: a signing today can kill a trade next week.",
    cite: "2023 CBA · Art. VII §2(d)",
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
    body: "Teams may trade firsts up to seven drafts out, but the Stepien rule bars leaving yourself without a first-round pick in consecutive future drafts. This sim tracks pick ownership across every move you make, so a pick you dealt two trades ago still counts against you.",
    cite: "NBA rule (Stepien); 2023 CBA · Art. VII",
  },
  trade_value: {
    title: "Trade value (5–99)",
    body: "Our estimate of what an asset is worth in a trade — not a player rating. It dollar-values production (wins produced vs. salary, adjusted for age, term, and role) and prices draft picks off the origin team's projected slot. Directional, calibrated to real 2026 deals; the fairness meter sums it per side.",
    cite: "overtheapron.com/accuracy",
  },
} as const;

export type TermKey = keyof typeof GLOSSARY;
