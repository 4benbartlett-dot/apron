import type {
  LeagueConstants,
  LeagueData,
  RuleResult,
  TeamTradeSummary,
  Trade,
  TradeVerdict,
} from "./types";
import { classifyTier, findContract, salaryForYear, teamSalary } from "./derive";
import { maxIncomingSalary } from "./matching";

/** Dollar tolerance for floating-point / rounding wobble in comparisons. */
const EPSILON = 1;

function fmt(n: number): string {
  return `$${(n / 1_000_000).toFixed(2)}M`;
}

/**
 * Can each incoming salary be assigned to a single outgoing "bin" (each bin's
 * assigned total ≤ its capacity), with no incoming split across bins? This is
 * the precise test for whether a trade requires AGGREGATING outgoing salaries:
 * aggregation is needed exactly when no such packing exists (some incoming
 * player can only be matched by combining two or more outgoing salaries). One
 * outgoing bin may absorb several smaller incoming players (a legal "split") —
 * that is not aggregation. Exact backtracking; trade sizes are tiny.
 */
function binPackable(incoming: number[], binCaps: number[]): boolean {
  if (binCaps.length === 0) return incoming.length === 0;
  const items = [...incoming].sort((a, b) => b - a);
  const rem = [...binCaps];
  const place = (i: number): boolean => {
    if (i >= items.length) return true;
    const item = items[i]!;
    const tried = new Set<number>();
    for (let b = 0; b < rem.length; b++) {
      if (tried.has(rem[b]!)) continue; // symmetry break: skip equal remainders
      if (item <= rem[b]! + EPSILON) {
        tried.add(rem[b]!);
        rem[b]! -= item;
        if (place(i + 1)) return true;
        rem[b]! += item;
      }
    }
    return false;
  };
  return place(0);
}

const CITE = {
  matching:
    "2023 CBA Art. VII — Traded Player Exception (salary matching). See Hoops Rumors salary-matching guide.",
  apronMatching:
    "2023 CBA — apron teams limited to 100% salary matching (the 110% allowance was a 2023-24 transition-only rule).",
  hardCap:
    "2023 CBA — taking back more than 100% of outgoing salary hard-caps a team at the first apron for the remainder of the league year.",
  secondApronAgg:
    "2023 CBA — a team over the second apron may not aggregate two or more salaries to match in a trade.",
  secondApronCash:
    "2023 CBA — a team over the second apron may not send out cash in a trade.",
  eligibility:
    "2023 CBA — a free agent signed this offseason is trade-restricted (generally until Dec 15). An extension is immediately trade-eligible.",
  noAggregate:
    "2023 CBA — a player acquired via trade may not be aggregated with other salaries for ~2 months after being acquired.",
  unknownPlayer: "Apron engine — referenced player has no contract in the dataset.",
} as const;

interface TeamLegs {
  outgoingPlayerSalaries: number[];
  incomingPlayerSalaries: number[];
}

function legsFor(
  data: LeagueData,
  teamId: string,
  trade: Trade,
  c: LeagueConstants,
  checks: RuleResult[],
): TeamLegs {
  const ly = c.leagueYear;
  const outgoingPlayerSalaries: number[] = [];
  const incomingPlayerSalaries: number[] = [];

  for (const m of trade.players) {
    if (m.from !== teamId && m.to !== teamId) continue;
    const contract = findContract(data, m.playerId);
    if (!contract) {
      checks.push({
        ruleId: "unknown_player",
        ok: false,
        teamId,
        reason: `Player "${m.playerId}" is referenced in the trade but has no contract in the dataset.`,
        citation: CITE.unknownPlayer,
      });
      continue;
    }
    const salary = salaryForYear(contract, ly);
    if (m.from === teamId) {
      // Base-Year Compensation: the sending team's outgoing value is reduced.
      const outValue =
        contract.bycPriorSalary != null
          ? Math.max(salary * 0.5, contract.bycPriorSalary)
          : salary;
      outgoingPlayerSalaries.push(outValue);
    }
    if (m.to === teamId) {
      // Trade kicker: a trade bonus is added to the salary the ACQUIRING team
      // takes on for matching, capped at the player's maximum.
      const incValue = contract.tradeKickerPct
        ? Math.min(c.maxSalary["10+"], salary * (1 + contract.tradeKickerPct))
        : salary;
      incomingPlayerSalaries.push(incValue);
    }
  }

  return { outgoingPlayerSalaries, incomingPlayerSalaries };
}

/**
 * Validate a proposed trade against the 2023 CBA. Returns a structured verdict
 * where every failed check carries a plain-English reason and a citation, so
 * the UI can explain exactly *why* a trade is illegal.
 *
 * Scope: salary matching by apron tier, the expanded-matching hard cap, the
 * second-apron no-aggregation (post-trade basis) and no-cash-out rules, trade
 * eligibility freezes, the 2-month post-acquisition aggregation freeze, BYC,
 * and trade kickers. Cap holds, sign-and-trade legality, and the Stepien
 * pick ledger are enforced by the app layer on top of this verdict; TPEs and
 * poison-pill remain unmodeled (disclosed on /accuracy).
 */
export function validateTrade(
  data: LeagueData,
  trade: Trade,
  c: LeagueConstants,
): TradeVerdict {
  const checks: RuleResult[] = [];
  const teams: TeamTradeSummary[] = [];

  for (const teamId of trade.teams) {
    const { outgoingPlayerSalaries, incomingPlayerSalaries } = legsFor(
      data,
      teamId,
      trade,
      c,
      checks,
    );

    const outgoingSalary = outgoingPlayerSalaries.reduce((a, b) => a + b, 0);
    const incomingSalary = incomingPlayerSalaries.reduce((a, b) => a + b, 0);

    const pre = teamSalary(data, teamId, c.leagueYear);
    const post = pre - outgoingSalary + incomingSalary;
    const preTier = classifyTier(pre, c);
    const postTier = classifyTier(post, c);
    // Kept free-agent holds consume below-cap absorption room (they're Team
    // Salary for room purposes) — but never change apron tier.
    const capRoom = c.salaryCap - pre - (trade.capHolds?.[teamId] ?? 0);

    const match = maxIncomingSalary(outgoingSalary, preTier, capRoom, c);

    teams.push({
      teamId,
      preTradeSalary: pre,
      postTradeSalary: post,
      preTradeTier: preTier,
      postTradeTier: postTier,
      outgoingSalary,
      incomingSalary,
      maxIncomingAllowed: match.maxIncoming,
      matchingRule: match.rule,
    });

    // --- Rule 1: salary matching ---
    const matchOk = incomingSalary <= match.maxIncoming + EPSILON;
    const isApronTeam = preTier === "first_apron" || preTier === "second_apron";
    checks.push({
      ruleId: "salary_matching",
      ok: matchOk,
      teamId,
      reason: matchOk
        ? `${teamId} sends ${fmt(outgoingSalary)} and takes back ${fmt(
            incomingSalary,
          )} — within its ${fmt(match.maxIncoming)} limit (${match.ruleLabel}).`
        : `${teamId} can take back at most ${fmt(match.maxIncoming)} for ${fmt(
            outgoingSalary,
          )} sent out (${match.ruleLabel}), but is acquiring ${fmt(
            incomingSalary,
          )} — over by ${fmt(incomingSalary - match.maxIncoming)}.`,
      citation: isApronTeam ? CITE.apronMatching : CITE.matching,
    });

    // --- Rule 2: expanded matching hard-caps at the first apron ---
    // Taking back more than you send hard-caps you at the first apron, so the
    // resulting salary may not exceed it. Only relevant for sub-apron teams.
    const tookBackMore = incomingSalary > outgoingSalary + EPSILON;
    const subApron =
      preTier === "below_cap" || preTier === "over_cap" || preTier === "taxpayer";
    if (subApron && tookBackMore) {
      const hardCapOk = post <= c.firstApron + EPSILON;
      checks.push({
        ruleId: "hard_cap_first_apron",
        ok: hardCapOk,
        teamId,
        reason: hardCapOk
          ? `${teamId} takes back more than it sends but stays under the first apron (${fmt(
              post,
            )} ≤ ${fmt(c.firstApron)}).`
          : `${teamId} takes back more than it sends, which hard-caps it at the first apron (${fmt(
              c.firstApron,
            )}); this trade would put it at ${fmt(post)} — ${fmt(
              post - c.firstApron,
            )} over the hard cap.`,
        citation: CITE.hardCap,
      });
    }

    // --- Rule 3: second apron cannot aggregate salaries ---
    // A team may not combine 2+ outgoing salaries to acquire a player if its
    // apron team salary IMMEDIATELY FOLLOWING the transaction is above the
    // second apron (Art. VII §2(e)(2)(i)(A)) — so a team that starts above the
    // line may still aggregate in a trade that itself sheds it to or below the
    // line (that choice hard-caps it at the second apron for the year). Each
    // outgoing player is its own matching bin (100% capacity). The deal is
    // non-aggregating iff the incoming salaries can be packed so every incoming
    // fits within a single outgoing bin — one bin may absorb several smaller
    // incoming (a legal split); aggregation is required only when no such
    // packing exists.
    const overSecondApronAfter = classifyTier(post, c) === "second_apron";
    if (overSecondApronAfter && outgoingPlayerSalaries.length >= 2) {
      const aggregating = !binPackable(
        incomingPlayerSalaries,
        outgoingPlayerSalaries,
      );
      checks.push({
        ruleId: "second_apron_no_aggregation",
        ok: !aggregating,
        teamId,
        reason: aggregating
          ? `${teamId} would finish over the second apron and so cannot aggregate salaries: at least one incoming salary can only be matched by combining two or more outgoing players. (Aggregating is only legal if the trade itself drops the team to or below the second apron.)`
          : `${teamId} finishes over the second apron but is not aggregating (each incoming salary matches a single outgoing player).`,
        citation: CITE.secondApronAgg,
      });
    }

    // --- Rule 4: second apron cannot send out cash (same post-trade test) ---
    if (overSecondApronAfter) {
      const sendsCash = (trade.cash ?? []).some(
        (mv) => mv.from === teamId && mv.amount > 0,
      );
      if (sendsCash) {
        checks.push({
          ruleId: "second_apron_no_cash_out",
          ok: false,
          teamId,
          reason: `${teamId} is over the second apron and cannot send cash in a trade.`,
          citation: CITE.secondApronCash,
        });
      }
    }

    // --- Rule 5: trade eligibility (restricted / recently-acquired) ---
    const outgoingMoves = trade.players.filter((p) => p.from === teamId);
    for (const mv of outgoingMoves) {
      const oc = findContract(data, mv.playerId);
      if (oc?.restriction) {
        checks.push({
          ruleId: "trade_eligibility",
          ok: false,
          teamId,
          reason: `${oc.playerName} cannot be traded — ${oc.restriction}`,
          citation: CITE.eligibility,
        });
      }
    }
    // A recently-acquired ("frozen") player may still be traded — alone, matched
    // 1-for-1, or as a salary dump. He may NOT have his salary COMBINED with
    // another outgoing salary to match an incoming player. Model each frozen
    // player as his own matching bin and pool all non-frozen outgoing salaries
    // into one freely-aggregatable bin; if the incoming salaries can't be packed
    // into those bins, some frozen player must be aggregated — illegal.
    if (outgoingMoves.length >= 2) {
      const outSalaries = outgoingMoves.map((mv) => {
        const oc = findContract(data, mv.playerId);
        return {
          salary: oc ? salaryForYear(oc, c.leagueYear) : 0,
          frozen: !!oc?.noAggregate,
          name: oc?.playerName ?? mv.playerId,
        };
      });
      const frozen = outSalaries.filter((o) => o.frozen);
      if (frozen.length > 0) {
        const nonFrozenSum = outSalaries
          .filter((o) => !o.frozen)
          .reduce((a, b) => a + b.salary, 0);
        const bins = [...frozen.map((o) => o.salary), nonFrozenSum];
        const mustAggregate = !binPackable(incomingPlayerSalaries, bins);
        if (mustAggregate) {
          const names = frozen.map((o) => o.name).join(", ");
          checks.push({
            ruleId: "no_aggregate",
            ok: false,
            teamId,
            reason: `${names} ${
              frozen.length > 1 ? "were" : "was"
            } acquired this offseason and can't be aggregated with other salaries for ~2 months — this trade would require combining that salary to match an incoming player.`,
            citation: CITE.noAggregate,
          });
        }
      }
    }
  }

  const violations = checks.filter((c) => !c.ok);
  return {
    legal: violations.length === 0,
    teams,
    violations,
    checks,
  };
}
