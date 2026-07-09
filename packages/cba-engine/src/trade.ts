import type {
  LeagueConstants,
  LeagueData,
  RuleResult,
  TeamTradeSummary,
  Trade,
  TradeVerdict,
} from "./types";
import {
  apronTeamSalary,
  classifyTier,
  findContract,
  salaryForYear,
  teamSalary,
  tradeSalaryForYear,
} from "./derive";
import { maxIncomingSalary } from "./matching";
import { poisonPillValues } from "./provisions";

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
    "2023 CBA Art. VII §6(j)(1)(i)-(iv) — Traded Player Exception salary matching.",
  apronMatching:
    "2023 CBA Art. VII §6(j)(1)(i)-(ii), §6(j)(3), and §2(e) — apron teams are limited to 100% matching after the 2023-24 transition rule.",
  hardCap:
    "2023 CBA Art. VII §2(e), row E — using the Expanded Traded Player Exception hard-caps a team at the first apron for the remainder of the league year.",
  roomAbsorption:
    "2023 CBA Art. VII §6(j)(1)(v) — Room Under Salary Cap Plus $250,000.",
  secondApronAggHardCap:
    "2023 CBA Art. VII §2(e), row H — using an Aggregated Standard Traded Player Exception hard-caps a team at the second apron.",
  secondApronAgg:
    "2023 CBA Art. VII §2(e), row H — a team may not use an Aggregated Standard Traded Player Exception if its post-trade Apron Team Salary exceeds the second apron.",
  secondApronCash:
    "2023 CBA Art. VII §2(e), row I — paying cash in a trade hard-caps a team at the second apron and is barred if post-trade Apron Team Salary would exceed it.",
  poisonPill:
    "2023 CBA Art. VII §8(g) — rookie-scale-extension poison-pill value for the acquiring team is the average of current plus extension salaries.",
  noMinimumAggregate:
    "2023 CBA Art. VII §6(j)(4)(ii) — outside Dec. 15 through the trade deadline, an aggregation of three or more outgoing players for fewer replacements may include no more than one minimum traded player.",
  eligibility:
    "2023 CBA Art. VII §8(d), §8(f) — recently signed players and certain extensions are trade-restricted.",
  noAggregate:
    "2023 CBA Art. VII §6(j)(4)(i) — a player acquired by trade may not be aggregated with other salaries for two months after being acquired.",
  unknownPlayer: "Apron engine — referenced player has no contract in the dataset.",
} as const;

interface TeamLegs {
  outgoingPlayerSalaries: number[];
  incomingPlayerSalaries: number[];
  outgoingCapSalaries: number[];
  incomingCapSalaries: number[];
  outgoingMinimumFlags: boolean[];
  incomingCount: number;
}

function isMinimumTradedPlayer(
  contract: ReturnType<typeof findContract>,
  salary: number,
  c: LeagueConstants,
): boolean {
  const yos = Math.min(contract?.yearsOfService ?? 10, 10);
  const minimumForPlayer = c.minimumSalaries[yos] ?? c.minimumSalaries[0] ?? 0;
  return (
    !!contract?.minimumSalary ||
    /minimum/i.test(contract?.signedUsing ?? "") ||
    (minimumForPlayer > 0 && salary <= minimumForPlayer + EPSILON)
  );
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
  const outgoingCapSalaries: number[] = [];
  const incomingCapSalaries: number[] = [];
  const outgoingMinimumFlags: boolean[] = [];
  let incomingCount = 0;

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
    const capSalary = salaryForYear(contract, ly);
    const tradeSalary = tradeSalaryForYear(contract, ly);
    if (m.from === teamId) {
      // Base-Year Compensation: the sending team's outgoing value is reduced.
      const outValue =
        contract.bycPriorSalary != null
          ? Math.max(tradeSalary * 0.5, contract.bycPriorSalary)
          : tradeSalary;
      outgoingPlayerSalaries.push(outValue);
      outgoingCapSalaries.push(capSalary);
      outgoingMinimumFlags.push(isMinimumTradedPlayer(contract, capSalary, c));
    }
    if (m.to === teamId) {
      // Trade kicker: a trade bonus is added to the salary the ACQUIRING team
      // takes on for matching, capped at the player's maximum.
      const incomingCap = contract.tradeKickerPct
        ? Math.min(c.maxSalary["10+"], capSalary * (1 + contract.tradeKickerPct))
        : capSalary;
      const baseIncomingTrade = contract.tradeKickerPct
        ? Math.min(c.maxSalary["10+"], tradeSalary * (1 + contract.tradeKickerPct))
        : tradeSalary;
      const incValue = contract.poisonPillExtensionSalaries?.length
        ? poisonPillValues(baseIncomingTrade, contract.poisonPillExtensionSalaries).acquiringValue
        : baseIncomingTrade;
      incomingPlayerSalaries.push(incValue);
      incomingCapSalaries.push(incomingCap);
      incomingCount += 1;
      if (contract.poisonPillExtensionSalaries?.length) {
        checks.push({
          ruleId: "poison_pill_incoming_value",
          ok: true,
          teamId,
          reason: `${contract.playerName} is in the poison-pill window, so ${teamId} uses ${fmt(incValue)} as incoming matching/room value instead of his current ${fmt(baseIncomingTrade)} salary.`,
          citation: CITE.poisonPill,
        });
      }
    }
  }

  return {
    outgoingPlayerSalaries,
    incomingPlayerSalaries,
    outgoingCapSalaries,
    incomingCapSalaries,
    outgoingMinimumFlags,
    incomingCount,
  };
}

/**
 * Validate a proposed trade against the 2023 CBA. Returns a structured verdict
 * where every failed check carries a plain-English reason and a citation, so
 * the UI can explain exactly *why* a trade is illegal.
 *
 * Scope: salary matching by apron tier, the expanded-matching hard cap, the
 * second-apron no-aggregation (post-trade basis) and no-cash-out rules, trade
 * eligibility freezes, the 2-month post-acquisition aggregation freeze, BYC,
 * and trade kickers. Cap holds, sign-and-trade legality, TPE ledger selection,
 * and the Stepien pick ledger are enforced by the app layer on top of this
 * verdict.
 */
export function validateTrade(
  data: LeagueData,
  trade: Trade,
  c: LeagueConstants,
): TradeVerdict {
  const checks: RuleResult[] = [];
  const teams: TeamTradeSummary[] = [];

  for (const teamId of trade.teams) {
    const {
      outgoingPlayerSalaries,
      incomingPlayerSalaries,
      outgoingCapSalaries,
      incomingCapSalaries,
      outgoingMinimumFlags,
      incomingCount,
    } = legsFor(
      data,
      teamId,
      trade,
      c,
      checks,
    );

    const outgoingSalary = outgoingPlayerSalaries.reduce((a, b) => a + b, 0);
    const incomingSalary = incomingPlayerSalaries.reduce((a, b) => a + b, 0);
    const outgoingCapSalary = outgoingCapSalaries.reduce((a, b) => a + b, 0);
    const incomingCapSalary = incomingCapSalaries.reduce((a, b) => a + b, 0);

    const signedPre = teamSalary(data, teamId, c.leagueYear);
    const pre = apronTeamSalary(data, teamId, c);
    const post = pre - outgoingCapSalary + incomingCapSalary;
    const preTier = classifyTier(pre, c);
    const postTier = classifyTier(post, c);
    // Kept free-agent holds consume below-cap absorption room (they're Team
    // Salary for room purposes) — but never change apron tier.
    const capRoom = c.salaryCap - signedPre - (trade.capHolds?.[teamId] ?? 0);

    const allowance = post > c.firstApron + EPSILON ? 0 : c.tradeMatch.addOn;
    const match = maxIncomingSalary(outgoingSalary, preTier, capRoom, c, { addOn: allowance });

    // Salary absorbed into a traded-player exception needs no matching —
    // it still counts fully toward post-trade (apron) salary.
    const tpe = trade.tpeUse?.[teamId];
    const tpeAbsorbed = Math.min(tpe?.amount ?? 0, incomingSalary);
    const matchable = incomingSalary - tpeAbsorbed;

    teams.push({
      teamId,
      preTradeSalary: pre,
      postTradeSalary: post,
      preTradeTier: preTier,
      postTradeTier: postTier,
      outgoingSalary,
      incomingSalary,
      outgoingCapSalary,
      incomingCapSalary,
      maxIncomingAllowed: match.maxIncoming,
      matchingRule: match.rule,
      ...(tpeAbsorbed > 0 ? { tpeAbsorbed } : {}),
    });

    if (tpeAbsorbed > 0) {
      checks.push({
        ruleId: "tpe_absorption",
        ok: true,
        teamId,
        reason: `${teamId} absorbs ${fmt(tpeAbsorbed)} of incoming salary into a traded-player exception${
          tpe?.label ? ` (${tpe.label})` : ""
        } — that salary needs no matching.`,
        citation: "2023 CBA · Art. VII §6(j)(1)(i) — Standard Traded Player Exception.",
      });
      // Restriction-table row F: a TPE that arose in a prior Regular Season
      // (or a prior offseason whose following Regular Season has ended) cannot
      // be used if post-trade apron salary would exceed the first apron — and
      // using one hard-caps the team there. A TPE that arose in the CURRENT
      // offseason is exempt until after the following Regular Season, so key
      // off `firstApronCap` (falling back to `preExisting` for legacy callers)
      // rather than `preExisting`, which merely means "standing before now".
      if (tpe && (tpe.firstApronCap ?? tpe.preExisting)) {
        const rowFOk = post <= c.firstApron + EPSILON;
        checks.push({
          ruleId: "tpe_first_apron",
          ok: rowFOk,
          teamId,
          reason: rowFOk
            ? `${teamId} uses a pre-existing traded-player exception and stays under the first apron (${fmt(post)} ≤ ${fmt(c.firstApron)}) — hard-capped there for the year.`
            : `${teamId} cannot use a pre-existing traded-player exception: it would finish at ${fmt(post)}, over the first apron (${fmt(c.firstApron)}) — restriction-table row F.`,
          citation: "2023 CBA · Art. VII §2(e) transaction restrictions, row F.",
        });
      }
    }

    // --- Rule 1: salary matching (on the non-TPE portion) ---
    const matchOk = matchable <= match.maxIncoming + EPSILON;
    const isApronTeam = preTier === "first_apron" || preTier === "second_apron";
    const allowanceNote =
      allowance === 0 ? "; the $250k allowance is removed because post-trade apron salary exceeds the first apron" : "";
    checks.push({
      ruleId: "salary_matching",
      ok: matchOk,
      teamId,
      reason: matchOk
        ? `${teamId} sends ${fmt(outgoingSalary)} and takes back ${fmt(
            matchable,
          )}${tpeAbsorbed > 0 ? " (after TPE absorption)" : ""} — within its ${fmt(match.maxIncoming)} limit (${match.ruleLabel}${allowanceNote}).`
        : `${teamId} can take back at most ${fmt(match.maxIncoming)} for ${fmt(
            outgoingSalary,
          )} sent out (${match.ruleLabel}${allowanceNote}), but is acquiring ${fmt(
            matchable,
          )}${tpeAbsorbed > 0 ? " outside its TPE" : ""} — over by ${fmt(matchable - match.maxIncoming)}.`,
      citation: isApronTeam ? CITE.apronMatching : CITE.matching,
    });

    // --- Rule 2: expanded matching hard-caps at the first apron ---
    // Taking back more than you send hard-caps you at the first apron, so the
    // resulting salary may not exceed it. Only relevant for sub-apron teams.
    // TPE-absorbed salary doesn't use expanded matching (row F above owns the
    // pre-existing-TPE apron consequences), so the test runs on `matchable`.
    const tookBackMore = matchable > outgoingSalary + EPSILON;
    const subApron =
      preTier === "below_cap" || preTier === "over_cap" || preTier === "taxpayer";
    if (subApron && tookBackMore) {
      const hardCapOk = post <= c.firstApron + EPSILON;
      const expandedMatching = match.rule !== "cap_room_absorption";
      checks.push({
        ruleId: "hard_cap_first_apron",
        ok: !expandedMatching || hardCapOk,
        teamId,
        reason: !expandedMatching
          ? `${teamId} absorbs the extra salary with cap room, not the Expanded Traded Player Exception, so row E does not create a first-apron hard cap.`
          : hardCapOk
          ? `${teamId} takes back more than it sends but stays under the first apron (${fmt(
              post,
            )} ≤ ${fmt(c.firstApron)}).`
          : `${teamId} takes back more than it sends, which hard-caps it at the first apron (${fmt(
              c.firstApron,
            )}); this trade would put it at ${fmt(post)} — ${fmt(
              post - c.firstApron,
            )} over the hard cap.`,
        citation: expandedMatching ? CITE.hardCap : CITE.roomAbsorption,
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
    // Each outgoing player is its own Standard TPE, which absorbs incoming up
    // to 100% of that player's salary PLUS the $250k allowance (§6(j)(1)(i)) —
    // so a bin's capacity is salary + allowance, not the raw salary. Without
    // this, a non-aggregated 2-for-2 taking back even a little over a single
    // outgoing was misread as aggregation and needlessly hard-capped at the
    // second apron. `allowance` is already 0 once post-trade salary clears the
    // first apron (§6(j)(3)), so genuine over-apron aggregations still register.
    const aggregating =
      outgoingPlayerSalaries.length >= 2 &&
      !binPackable(
        incomingPlayerSalaries,
        outgoingPlayerSalaries.map((s) => s + allowance),
      );
    if (aggregating) {
      checks.push({
        ruleId: overSecondApronAfter
          ? "second_apron_no_aggregation"
          : "hard_cap_second_apron_aggregation",
        ok: !overSecondApronAfter,
        teamId,
        reason: overSecondApronAfter
          ? `${teamId} would finish over the second apron and so cannot aggregate salaries: at least one incoming salary can only be matched by combining two or more outgoing players. (Aggregating is only legal if the trade itself drops the team to or below the second apron.)`
          : `${teamId} uses aggregated trade matching and finishes at ${fmt(post)}, at or below the second apron (${fmt(c.secondApron)}) — legal, but row H hard-caps it at the second apron for the season.`,
        citation: overSecondApronAfter ? CITE.secondApronAgg : CITE.secondApronAggHardCap,
      });
      const minCount = outgoingMinimumFlags.filter(Boolean).length;
      const timing = trade.timing ?? "offseason";
      if (
        timing !== "dec15_to_deadline" &&
        outgoingPlayerSalaries.length >= 3 &&
        incomingCount < outgoingPlayerSalaries.length &&
        minCount > 1
      ) {
        checks.push({
          ruleId: "minimum_traded_player_aggregation",
          ok: false,
          teamId,
          reason: `${teamId} aggregates ${outgoingPlayerSalaries.length} outgoing players for fewer incoming players outside the Dec. 15-to-deadline window and includes ${minCount} minimum-salary players; the CBA allows no more than one.`,
          citation: CITE.noMinimumAggregate,
        });
      }
    }

    // --- Rule 4: second apron cannot send out cash (same post-trade test) ---
    const sendsCash = (trade.cash ?? []).some(
      (mv) => mv.from === teamId && mv.amount > 0,
    );
    if (sendsCash) {
      checks.push({
        ruleId: overSecondApronAfter
          ? "second_apron_no_cash_out"
          : "hard_cap_second_apron_cash",
        ok: !overSecondApronAfter,
        teamId,
        reason: overSecondApronAfter
          ? `${teamId} pays cash and would finish over the second apron, which row I forbids.`
          : `${teamId} pays cash while staying at or below the second apron (${fmt(post)} ≤ ${fmt(c.secondApron)}) — legal, but row I hard-caps it at the second apron for the season.`,
        citation: CITE.secondApronCash,
      });
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
          salary: oc ? tradeSalaryForYear(oc, c.leagueYear) : 0,
          frozen: !!oc?.noAggregate,
          name: oc?.playerName ?? mv.playerId,
        };
      });
      const frozen = outSalaries.filter((o) => o.frozen);
      if (frozen.length > 0) {
        const nonFrozenSum = outSalaries
          .filter((o) => !o.frozen)
          .reduce((a, b) => a + b.salary, 0);
        // Same Standard-TPE allowance as above: each frozen player is its own
        // exception (salary + $250k), and the non-frozen players form one
        // aggregate exception (sum + $250k). Without it a recently-acquired
        // player's own TPE could be misread as forced aggregation.
        const bins = [
          ...frozen.map((o) => o.salary + allowance),
          nonFrozenSum + allowance,
        ];
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
