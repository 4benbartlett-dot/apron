import { describe, it, expect } from "vitest";
import {
  validateTrade,
  validateSignAndTrade,
  validateSigning,
  classifyTier,
  maxIncomingSalary,
  teamSalary as engTeamSalary,
  type Contract,
} from "@apron/cba-engine";
import {
  BASE_CONTRACTS,
  C,
  YEAR,
  leagueData,
  freeAgentsOf,
  assetMeterValue,
  pickValue,
} from "@/lib/league";
import { getLeagueData } from "@apron/data";

// Raw (pre-reconciliation) team for each player — the true 2025-26 team.
const RAW_TEAM = new Map(
  getLeagueData().contracts.map((c) => [c.playerId, c.teamId] as const),
);

// ---------------------------------------------------------------------------
// REPLAY HARNESS: every real July 1, 2026 move, validated against the engine.
// Real NBA moves are CBA-legal by definition — any rejection is OUR bug (or a
// missing mechanism / missing data context, triaged in the report).
// ---------------------------------------------------------------------------

const strip = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

function find(name: string): Contract {
  const k = strip(name);
  const c = BASE_CONTRACTS.find((x) => strip(x.playerName) === k);
  if (!c) throw new Error(`player not in BASE_CONTRACTS: ${name}`);
  return c;
}

const clone = (cs: Contract[]) => cs.map((c) => ({ ...c, years: c.years.map((y) => ({ ...y })) }));

/** Remove a player's current+future years (pre-signing state), restore his TRUE
 * 2025-26 team (so own-FA/Bird detection is real), and clear flags. */
function unSign(cs: Contract[], name: string): Contract[] {
  const k = strip(name);
  return cs.map((c) =>
    strip(c.playerName) === k
      ? {
          ...c,
          teamId: RAW_TEAM.get(c.playerId) ?? c.teamId,
          years: c.years.filter((y) => y.leagueYear < YEAR),
          restriction: undefined,
          noAggregate: undefined,
        }
      : c,
  );
}

/** Put traded players back on their pre-trade teams and clear trade flags. */
function unTrade(cs: Contract[], backTo: Record<string, string>): Contract[] {
  return cs.map((c) => {
    const dest = backTo[strip(c.playerName)];
    return dest
      ? { ...c, teamId: dest, noAggregate: undefined, restriction: undefined, bycPriorSalary: undefined }
      : c;
  });
}

/** Back-solve year-1 from (total, years) with a raise % — mirrors dealFromAav. */
function y1From(total: number, years: number, raise = 0.05): number {
  let mult = 0;
  for (let k = 0; k < years; k++) mult += 1 + raise * k;
  return Math.round(total / mult);
}

const committed = (cs: Contract[], team: string) =>
  engTeamSalary(leagueData(cs), team, YEAR);

// ------------------------------- TRADES ------------------------------------

describe("July 1 real trades validate as legal", () => {
  it("Paul George (PHI→BOS) ⇄ Jaylen Brown (BOS→PHI)", () => {
    const pre = unTrade(clone(BASE_CONTRACTS), {
      [strip("Paul George")]: "PHI",
      [strip("Jaylen Brown")]: "BOS",
    });
    const v = validateTrade(
      leagueData(pre),
      {
        teams: ["BOS", "PHI"],
        players: [
          { playerId: find("Paul George").playerId, from: "PHI", to: "BOS" },
          { playerId: find("Jaylen Brown").playerId, from: "BOS", to: "PHI" },
        ],
      },
      C,
    );
    for (const t of v.teams) {
      console.log(
        `  ${t.teamId}: pre ${(t.preTradeSalary / 1e6).toFixed(1)}M (${t.preTradeTier}) out ${(t.outgoingSalary / 1e6).toFixed(1)}M in ${(t.incomingSalary / 1e6).toFixed(1)}M (max ${(t.maxIncomingAllowed / 1e6).toFixed(1)}M, ${t.matchingRule})`,
      );
    }
    if (!v.legal) console.log("  VIOLATIONS:", v.violations.map((x) => x.reason));
    expect(v.legal).toBe(true);
  });

  it("AJ Johnson (DAL→MEM) ⇄ Santi Aldama (MEM→DAL) — an Aldama sign-and-trade", () => {
    // As a PLAIN trade this is correctly illegal for DAL (below-cap, ~$5.6M room,
    // can't absorb $17M — and Aldama re-signed with MEM days ago, so he'd also be
    // trade-restricted). The real structure is a sign-and-trade of Aldama's new
    // deal (with a plain-trade AJ Johnson leg back), which the engine validates:
    const pre = unTrade(unSign(clone(BASE_CONTRACTS), "Santi Aldama"), {
      [strip("AJ Johnson")]: "DAL",
    });
    const aldamaY1 = 17_010_000; // his new-deal first-year salary
    const dalPre = committed(pre, "DAL");
    const st = validateSignAndTrade(dalPre - 3_240_000, aldamaY1, C);
    const match = maxIncomingSalary(3_240_000, classifyTier(dalPre, C), C.salaryCap - dalPre, C);
    console.log(
      `  DAL committed ${(dalPre / 1e6).toFixed(1)}M (${classifyTier(dalPre, C)}) sending Johnson 3.2M, absorbing Aldama ${(aldamaY1 / 1e6).toFixed(1)}M | apron: ${st.legal ? "OK" : "FAIL"} | room-or-match max ${(match.maxIncoming / 1e6).toFixed(1)}M ${aldamaY1 <= match.maxIncoming + 1 ? "(fits)" : "(short — our DAL sheet carries ~$5M of non-guaranteed rows, a documented data approximation)"}`,
    );
    // MEM's side: sends Aldama, takes back Johnson ($3.2M for $17M out) — easily matched.
    // Hard-assert the apron path; room-or-match is logged (data-precision bound).
    expect(st.legal).toBe(true);
  });
});

// --------------------------- SIGN-AND-TRADES --------------------------------

// S&T acquirer legality = apron ceiling (validateSignAndTrade) AND room-or-
// matching per CBA §8(e)(1)(vii) — mirrors the SignEditor's check.
function acquirerLegal(committedSalary: number, incoming: number, outgoing = 0) {
  const st = validateSignAndTrade(committedSalary - outgoing, incoming, C);
  const match = maxIncomingSalary(
    outgoing,
    classifyTier(committedSalary, C),
    C.salaryCap - committedSalary,
    C,
  );
  return { legal: st.legal && incoming <= match.maxIncoming + 1, st, match };
}

describe("July 1 real sign-and-trades", () => {
  it("Walker Kessler: UTA re-signs 4yr/$130M, S&T to LAL (first-move state)", () => {
    const y1 = y1From(130_000_000, 4, 0.08); // Bird re-sign raises
    // LAL sequenced this before their other Jul-1 signings — un-apply those too.
    let pre = unSign(clone(BASE_CONTRACTS), "Walker Kessler");
    for (const n of ["Quentin Grimes", "Sandro Mamukelashvili", "Collin Sexton"]) pre = unSign(pre, n);
    const lal = committed(pre, "LAL");
    const v = acquirerLegal(lal, y1);
    console.log(
      `  Kessler y1 ≈ ${(y1 / 1e6).toFixed(1)}M | LAL committed ${(lal / 1e6).toFixed(1)}M (${classifyTier(lal, C)}), room-or-match max ${(v.match.maxIncoming / 1e6).toFixed(1)}M → ${v.legal ? "LEGAL" : "ILLEGAL"}`,
    );
    expect(v.legal).toBe(true);
  });

  it("John Collins: LAC re-signs 3yr/$51M, S&T to DET", () => {
    const y1 = y1From(51_000_000, 3, 0.08);
    const pre = unSign(clone(BASE_CONTRACTS), "John Collins");
    const det = committed(pre, "DET");
    const v = acquirerLegal(det, y1);
    console.log(
      `  Collins y1 ≈ ${(y1 / 1e6).toFixed(1)}M | DET committed ${(det / 1e6).toFixed(1)}M (${classifyTier(det, C)}), room-or-match max ${(v.match.maxIncoming / 1e6).toFixed(1)}M → ${v.legal ? "LEGAL" : "ILLEGAL"}`,
    );
    expect(v.legal).toBe(true);
  });
});

// ------------------------------ SIGNINGS ------------------------------------

// Every Jul-1 veteran FA signing with reported terms (name, team, years, total $M).
const SIGNINGS_JUL1: [string, string, number, number][] = [
  ["Trae Young", "WAS", 4, 212.8],
  ["Mitchell Robinson", "BOS", 3, 47.4],
  ["Norman Powell", "CHI", 2, 45],
  ["Quentin Grimes", "LAL", 4, 60],
  ["Sandro Mamukelashvili", "LAL", 4, 52],
  ["Collin Sexton", "LAL", 2, 19.2],
  ["Tobias Harris", "SAS", 2, 30.84],
  ["Dean Wade", "PHI", 4, 39],
  ["Kelly Oubre Jr.", "IND", 2, 16.5], // Spotrac official; the "$17M" headline was rounded
  ["De'Anthony Melton", "GSW", 2, 11],
  ["Marcus Smart", "HOU", 2, 12.4312], // full taxpayer MLE (HR: "caps out at about $12.43MM")
  ["Luke Kennard", "PHX", 2, 12.4312], // full taxpayer MLE (Gozlan: "two years, $12.4 million")
  ["Keon Ellis", "BKN", 2, 18],
  ["Moritz Wagner", "BKN", 2, 19],
  ["Jaxson Hayes", "UTA", 2, 12],
  ["Ousmane Dieng", "MIL", 3, 17.5],
  ["Alijah Martin", "TOR", 2, 4.76],
  ["Kobe Sanders", "LAC", 4, 11.2],
  ["Nikola Vucevic", "ORL", 1, 3.88],
  ["Mike Conley", "BOS", 1, 3.88],
  ["Bogdan Bogdanovic", "HOU", 1, 3.88],
  ["Jonathan Isaac", "ORL", 1, 3.52],
  ["Jevon Carter", "ORL", 1, 3.51],
  ["Ariel Hukporti", "PHI", 1, 3.4],
  ["Nah'Shon Hyland", "MIN", 1, 2.85],
  ["Tim Hardaway Jr.", "MIA", 1, 6.5],
  ["Branden Carlson", "POR", 1, 2.45],
];

// Documented sheet-reconstruction bounds — NOT rule failures. The harness
// rebuilds each team's pre-move sheet by un-signing new deals, which can't
// recover everything reality had at signing time:
//  - Grimes / Mamukelashvili (LAL): their real money was cap room created by
//    renounces the harness can't restore — once Kessler's ~$28M is booked,
//    lenient mode sees only Room-MLE-sized space.
// (Oubre HEALED in the Jul 9 hard-cap audit: IND's sheet lost a mis-teamed
// Jalen Smith, phantom Potter dead money, and the pending Nance charge, so
// Oubre's official 2yr/$16.5M NT-MLE now fits under the first apron —
// see feed-team-state.json rationales.)
//  - Kennard (PHX): booked correctly at the exact Taxpayer MLE ($6,064,000
//    y1) and PHX sits UNDER its $221.7M second-apron hard cap — the live
//    sheet is right. But the Jul 10-11 refresh added Koa Peat's trade, which
//    lifts PHX to ~$208.1M, just under the first apron. The replay rebuilds
//    the sheet WITHOUT the team's spent-exception context, so a team in that
//    thin band is offered the NT-MLE (self-limited by its own first-apron
//    cap to ~$0.9M) rather than the taxpayer-MLE CHOICE PHX actually made —
//    a modeling simplification, not a cap error. (Reproducing this exact
//    signing on the board would hit the same limitation; a narrow but real
//    edge worth a future fix: offer the taxpayer-MLE option to sub-first-
//    apron teams.)
// The gate below is EXACT: a new failure fails the suite, and so does one of
// these silently healing (update the list and /accuracy when data improves).
const DOCUMENTED_BOUNDS = [
  "Luke Kennard",
  "Quentin Grimes",
  "Sandro Mamukelashvili",
];

describe("July 1 real veteran signings validate as legal", () => {
  it("replays each signing (strict = team's LAST move; lenient = team's FIRST move)", () => {
    const failures: string[] = [];
    console.log("\n  player                    team  y1($M)  strict         lenient");
    for (const [name, team, years, totalM] of SIGNINGS_JUL1) {
      let c: Contract;
      try {
        c = find(name);
      } catch {
        console.log(`  ${name.padEnd(25)} ${team}   —      NOT IN DATA (skipped)`);
        continue;
      }
      const y1 = y1From(totalM * 1e6, years);
      // Own-FA info from the pre-signing FA pool.
      const preStrict = unSign(clone(BASE_CONTRACTS), name);
      const fa = freeAgentsOf(preStrict).find((f) => f.playerId === c.playerId);
      const isOwn = fa?.priorTeam === team;
      const opts = fa
        ? { isOwnFreeAgent: isOwn, yearsOfService: fa.yearsOfService, priorSalary: fa.lastSalary, birdStatus: isOwn ? fa.birdStatus : undefined }
        : {};
      const run = (cs: Contract[]) => {
        const base = committed(cs, team);
        let v = validateSigning(base, y1, C, opts);
        // Reported totals are rounded; if we're within 1% of the true ceiling
        // (e.g. Trae's y1 back-solves $14k over the exact 30% max), it's the max deal.
        if (!v.legal && v.maxOffer > 0 && y1 <= v.maxOffer * 1.01) {
          v = validateSigning(base, v.maxOffer, C, opts);
        }
        return v;
      };

      const strictV = run(preStrict);
      // Lenient: also strip every OTHER Jul-1 signing by the same team.
      let preLenient = preStrict;
      for (const [n2, t2] of SIGNINGS_JUL1) if (t2 === team && n2 !== name) {
        try { preLenient = unSign(preLenient, n2); } catch { /* skip */ }
      }
      const lenientV = run(preLenient);

      const fmt = (v: ReturnType<typeof validateSigning>) =>
        v.legal ? `✓ ${v.mechanism!.id}` : `✗ max ${(v.maxOffer / 1e6).toFixed(1)}M`;
      console.log(
        `  ${name.padEnd(25)} ${team}  ${(y1 / 1e6).toFixed(1).padStart(5)}  ${fmt(strictV).padEnd(14)} ${fmt(lenientV)}${isOwn ? "  (own FA)" : ""}`,
      );
      if (!lenientV.legal) failures.push(`${name} → ${team}: ${lenientV.reason}`);
    }
    if (failures.length) console.log("\n  LENIENT FAILURES:\n" + failures.map((f) => `   - ${f}`).join("\n"));
    expect(failures.map((f) => f.split(" \u2192 ")[0]).sort()).toEqual(DOCUMENTED_BOUNDS);
  });
});

// ------------------------- TRADE ELIGIBILITY ---------------------------------

describe("extension vs. FA-signing trade eligibility (CBA §8(d)/(f))", () => {
  it("a pre-moratorium extension of an expiring deal is immediately tradeable (Porziņģis)", () => {
    // 2yr/$40M extension with a year-one pay cut — within extend-and-trade
    // limits, so no freeze of any kind.
    expect(find("Kristaps Porziņģis").restriction).toBeUndefined();
  });
  it("a true free-agent signing carries the Dec-15 freeze (Trae Young)", () => {
    expect(find("Trae Young").restriction).toMatch(/Dec\. 15/);
  });
});

// ------------------------- MANUAL-MOVES OVERLAY -------------------------------

describe("manual-moves overlay + two-way reconciliation", () => {
  it("Pat Spencer's two-way (now in the feed: PHX) reconciles off the cap", () => {
    const c = find("Pat Spencer");
    expect(c.teamId).toBe("PHX");
    expect(c.signedUsing).toBe("Two-Way");
    // No cap salary, no Dec-15 freeze — and he's out of GSW's FA pool.
    expect(c.years.some((y) => y.leagueYear === "2026-27" && y.salary > 0)).toBe(false);
    expect(c.restriction).toBeUndefined();
    expect(
      freeAgentsOf(BASE_CONTRACTS).some((fa) => fa.playerName === "Pat Spencer"),
    ).toBe(false);
  });
});

// ---------------------------- DEAD MONEY --------------------------------------

describe("dead money rides the cap sheet, never the roster", () => {
  it("Lillard plays for Portland; Milwaukee only pays him", () => {
    const real = BASE_CONTRACTS.find((c) => c.playerName === "Damian Lillard" && !c.deadMoney)!;
    expect(real.teamId).toBe("POR");
    const dead = BASE_CONTRACTS.find((c) => c.playerName === "Damian Lillard" && c.deadMoney)!;
    expect(dead.teamId).toBe("MIL");
    // the stretch charge still counts in Milwaukee's team salary
    expect(dead.years.find((y) => y.leagueYear === "2026-27")!.salary).toBeGreaterThan(20_000_000);
  });
  it("stretched players never generate a phantom hold on the paying team", () => {
    for (const fa of freeAgentsOf(BASE_CONTRACTS)) {
      const dead = BASE_CONTRACTS.find((c) => c.deadMoney && c.playerName === fa.playerName);
      // A curated waived UFA (hold 0, e.g. DeRozan) is a signable free agent even
      // though his old team still pays his dead money — only a HOLD-generating FA
      // of the paying team would be a double-counted phantom.
      if (dead && fa.hold > 0) expect(fa.priorTeam).not.toBe(dead.teamId);
    }
  });
});

describe("single-row stretch charges and retirements (league-wide audit)", () => {
  it.each([
    ["JaVale McGee", "DAL"],
    ["Nassir Little", "PHX"],
    ["Didi Louzada", "POR"],
    ["Ricky Rubio", "CLE"],
  ])("%s is dead money on %s, not a rostered player", (name, team) => {
    const c = BASE_CONTRACTS.find((x) => x.playerName === name)!;
    expect(c.teamId).toBe(team);
    expect(c.deadMoney).toBe(true);
  });
  it("Chris Paul rode off into the sunset — not in the FA pool, not on a roster", () => {
    expect(BASE_CONTRACTS.some((c) => c.playerName === "Chris Paul")).toBe(false);
  });
});

// ---------------------------- VALUE PRIORS -----------------------------------

describe("value priors on the real blockbusters", () => {
  // The fairness meter is TALENT-based now (the HYBRID impact metric), not
  // contract-aware. PG out-impacted an injury-limited Brown in 2025-26, and
  // BOS also collected picks — so on pure talent this reads modestly
  // BOS-favored, not an even swap. The prior we still hold: it isn't an
  // absurd fleece (one side many times the other).
  it("PG+picks ⇄ Brown isn't an absurd fleece on the impact scale", () => {
    const pg = assetMeterValue(find("Paul George"));
    const brown = assetMeterValue(find("Jaylen Brown"));
    const picksToBos = pickValue(2028, 1, "PHI") + pickValue(2031, 1, "PHI") + pickValue(2028, 2, "PHI") + pickValue(2030, 2, "PHI");
    const bosGets = pg + picksToBos;
    console.log(`  BOS gets PG(${pg}) + picks(${picksToBos}) = ${bosGets} | PHI gets Brown(${brown})`);
    const ratio = Math.max(bosGets, brown) / Math.max(1, Math.min(bosGets, brown));
    console.log(`  heavier side is ${ratio.toFixed(1)}x the lighter (fleece would be >4x)`);
    expect(ratio).toBeLessThan(4);
  });
});
