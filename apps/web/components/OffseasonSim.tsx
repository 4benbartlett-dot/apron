"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  validateTrade,
  validateSigning,
  validateSignAndTrade,
  veteranExtensionMax,
  violatesStepien,
  maxIncomingSalary,
  spendingPower,
  classifyTier,
  type Contract,
  type Trade,
  type TeamTradeSummary,
  type MechanismId,
} from "@apron/cba-engine";
import { C, TEAM_IDS, teamMeta, byNickname, currentSalary, deadMoneyOf, deemedMinSalary, experienceOf, assetMeterValue, pickValue, pickSwapValue, isExtensionEligible, computeWaive, feedStateOf, consumedFor, tpeLedger, fitTpePlan, stepienFindingFor, hardCapDetailFor, positionOf, impactScoreOf, ageOf, teamProjection, type FreeAgent, type Move } from "@/lib/league";
import { eggReady, heatCultureEgg, lightTheBeam, moveTouches, strikeEgg, introEgg, rockCrackEgg, subwayEgg, chalkTossEgg, hawkDiveEgg, cigarEgg, swarmEgg, stampedeEgg, summitEgg, assemblyLineEgg, lightYearsEgg, launchEgg, brickyardEgg, theWallEgg, premiereEgg, gritGrindEgg, whiteHotEgg, antlersEgg, northernLightsEgg, beadThrowEgg, bingBongEgg, finaleEgg, bellTollEgg, valleySunriseEgg, dameTimeEgg, theNorthEgg, theRiffEgg, blossomsEgg, perfectionEgg, lotteryEgg, freezeEgg, auditEgg, commissionerEgg, heistEgg } from "@/components/teamEggs";
import { suggestSignings, faImpact, SIGN_POSITIONS } from "@/lib/signingFit";
import { ImpactPill, PosBadge } from "@/components/PlayerTags";
import { Term } from "@/components/Term";
import { findTradePackages, findOffersForPlayer, type TradePackage } from "@/lib/tradeFinder";
import { track } from "@/lib/analytics";
import { explainBlocked } from "@/lib/tradeFix";
import { useLeague, dispatchMove, toggleRenounce, decodeMovesParam } from "@/lib/store";
import { leagueData, YEAR } from "@/lib/league";
import { fmtM, fmtFull } from "@/lib/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Thermometer } from "@/components/Thermometer";
import { leagueToast } from "@/components/SiteEggs";
import { TeamPicker } from "@/components/TeamPicker";
import { ShareCardModal } from "@/components/ShareCardModal";
import { OffseasonRecapModal } from "@/components/OffseasonRecapModal";
import { decodeTradeParam, pickShareLabel, type DecodedPick } from "@/lib/trade-share";
import { shortPlayerName } from "@/lib/names";
import { TradeTray, useTrayVisible, type TrayHaul } from "@/components/TradeTray";
import { TradeDocket, buildDocket, buildChecks, DocketWhy, MoveTriggers, tradeConsequences } from "@/components/TradeDocket";
import { TierBadge } from "@/components/TierBadge";
import { TeamLogo } from "@/components/TeamLogo";

interface Sel {
  from: string;
  to: string;
}
/** A sign-and-trade staged onto the board: the re-sign terms + the facts the
 * execute step needs (rights, prior salary, BYC, the sender's ceiling). */
interface StStage {
  playerId: string;
  playerName: string;
  fromTeam: string;
  salary: number;
  years: number;
  birdStatus?: "bird" | "early_bird" | "non_bird";
  priorSalary: number;
  hold: number;
  byc: boolean;
  ceiling: number;
}
interface PickSwap {
  year: number;
  round: 1 | 2;
  favoredTo: string;
  otherTeam: string;
}
const swapKey = (s: PickSwap) => `${s.year}|${s.round}|${s.favoredTo}|${s.otherTeam}`;
type LG = ReturnType<typeof useLeague>;

// Picks come from the session pick-ownership ledger (lg.picksOf) — executed
// trades actually transfer them.

function mechColor(id: MechanismId | null): string {
  if (id === "bird" || id === "cap_room") return "var(--tier-below_cap)";
  if (id === "minimum") return "var(--tier-over_cap)";
  if (id === null) return "var(--muted)";
  return "var(--tier-taxpayer)";
}

const BIRD_LABEL: Record<string, string> = {
  bird: "BIRD",
  early_bird: "EARLY BIRD",
  non_bird: "NON-BIRD",
};

const MECH_SHORT: Record<MechanismId, string> = {
  bird: "Bird",
  cap_room: "Cap space",
  ntmle: "NT-MLE",
  tpmle: "Tax MLE",
  room_mle: "Room MLE",
  bae: "BAE",
  minimum: "Min",
};

export default function OffseasonSim() {
  const lg = useLeague();
  const [board, setBoard] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // A shared offseason (?gm=) greets the visitor with a recap of every move
  // it staged; closing it drops them onto the live board with those moves.
  const [recap, setRecap] = useState<{ moves: Move[]; teams: string[] } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const router = useRouter();
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [pickSel, setPickSel] = useState<Record<string, Sel>>({});
  // User-created pick swaps: favoredTo takes the more favorable of the two
  // teams' same-year/round firsts. A right, not a concrete transfer.
  const [swapSel, setSwapSel] = useState<PickSwap[]>([]);
  const [signFor, setSignFor] = useState<{ team: string; faId?: string; st?: boolean } | null>(null);
  // A STAGED sign-and-trade: the free agent re-signs on his old team's ledger
  // at the chosen rate (a temp contract every surface can see), and the deal
  // itself is built on the board like any trade. Executing dispatches the
  // real sign_trade move with all the legs.
  const [stStage, setStStage] = useState<StStage | null>(null);
  const [extendFor, setExtendFor] = useState<{ playerId: string; playerName: string; team: string } | null>(null);
  const [waiveFor, setWaiveFor] = useState<{ playerId: string; playerName: string; team: string } | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);

  // Stage a found trade package onto the board (adds both teams + selects moves).
  const loadTradePackage = (acquirer: string, seller: string, targetId: string, playerIds: string[], sweetenerIds: string[] = []) => {
    setBoard((b) => {
      const next = [...b];
      for (const t of [acquirer, seller]) if (!next.includes(t) && next.length < 8) next.push(t);
      return next;
    });
    setSel(() => {
      const s: Record<string, Sel> = { [targetId]: { from: seller, to: acquirer } };
      for (const pid of sweetenerIds) s[pid] = { from: seller, to: acquirer };
      for (const pid of playerIds) s[pid] = { from: acquirer, to: seller };
      return s;
    });
    setFinderOpen(false);
  };

  // Persist the board across reloads and restore a shared ?board= list.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // A shared trade link (?t=) lands HERE, on the full offseason page:
      // stage the deal, open the card, and closing it leaves the visitor on
      // the real board — teams, rosters, signings and all.
      const t = params.get("t");
      if (t) {
        const d = decodeTradeParam(t);
        if (d && (d.players.length || d.picks.length || d.swaps.length)) {
          const saved = JSON.parse(localStorage.getItem("apron_board_v1") || "[]");
          const merged = [...d.teams, ...(Array.isArray(saved) ? saved : [])]
            .filter((id: string, i: number, arr: string[]) => TEAM_IDS.includes(id) && arr.indexOf(id) === i)
            .slice(0, 8);
          setBoard(merged);
          setSel(Object.fromEntries(d.players.map((m) => [m.playerId, { from: m.from, to: m.to }])));
          setPickSel(Object.fromEntries(d.picks.map((m) => [m.id, { from: m.from, to: m.to }])));
          setSwapSel(
            d.swaps.map((s) => ({ year: s.year, round: s.round as 1 | 2, favoredTo: s.favoredTo, otherTeam: s.otherTeam })),
          );
          setShareOpen(true);
          track("trade_link_open");
          setReady(true);
          return;
        }
      }
      // A shared offseason (?gm=) stages a whole session of moves (the store
      // hydrates them from the same param). Greet the visitor with a recap of
      // what they opened; the board is restored from &board= just below.
      const gm = params.get("gm");
      if (gm) {
        const shared = decodeMovesParam(gm);
        if (shared) {
          const boardTeams = (params.get("board") || "")
            .split(",")
            .filter((id) => TEAM_IDS.includes(id));
          setRecap({ moves: shared, teams: boardTeams });
        }
      }
      // Deep links from team pages / SEO landing pages: ?team=<ID> opens the
      // board focused on that team, ?sign=<ID> also pops its signing drawer.
      // A deep link REPLACES whatever was autoselected/restored — you asked to
      // start a move about THIS team, so the board becomes just this team.
      const focus = (params.get("sign") || params.get("team") || "").toUpperCase();
      const wantSign = !!params.get("sign");
      const param = params.get("board");
      const raw = param
        ? param.split(",")
        : JSON.parse(localStorage.getItem("apron_board_v1") || "null");
      const start =
        focus && TEAM_IDS.includes(focus)
          ? [focus]
          : Array.isArray(raw)
            ? raw.filter((t2: string) => TEAM_IDS.includes(t2)).slice(0, 8)
            : [];
      if (start.length) setBoard(start);
      if (wantSign && TEAM_IDS.includes(focus)) setSignFor({ team: focus });
      if (focus && TEAM_IDS.includes(focus)) {
        track(wantSign ? "deeplink_sign" : "deeplink_trade");
        // Tidy the address bar so a refresh doesn't re-trigger the deep link.
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("apron_board_v1", JSON.stringify(board));
    } catch {
      /* ignore */
    }
  }, [board, ready]);

  // Restoring a saved session (localStorage / a shared link) replays the
  // whole move list through the store shortly after mount — the eggs must
  // never mistake that for a fresh move, or every reload re-fires the last
  // move's effect. Anything inside the boot window, or arriving as a
  // multi-move jump, is hydration.
  const eggBoot = useRef(Date.now());
  const freshMove = (prev: number | null, n: number) =>
    prev !== null && n === prev + 1 && Date.now() - eggBoot.current > 2500;

  // A team ARRIVING on the board gets a one-time logo flourish on its new
  // card — the mobile-friendly replacement for ambient autoplay (a restored
  // session inside the boot window stays quiet; scenes play on arrival).
  const prevBoard = useRef<string[] | null>(null);
  const [flourishTeam, setFlourishTeam] = useState<string | null>(null);
  useEffect(() => {
    const prev = prevBoard.current;
    prevBoard.current = board;
    if (!prev || Date.now() - eggBoot.current < 2500) return;
    const added = board.find((t) => !prev.includes(t));
    if (added) setFlourishTeam(added);
  }, [board]);

  // SAC easter egg: any move of yours that IMPROVES the Kings' projection
  // lights the beam off their board card. The baseline resets whenever SAC
  // joins the board, so only real gains fire it — undo never does.
  const sacOnBoard = board.includes("SAC");
  const sacProj = useRef<{ n: number; wins: number; nrtg: number } | null>(null);
  useEffect(() => {
    if (!sacOnBoard) {
      sacProj.current = null;
      return;
    }
    const p = teamProjection("SAC", lg.contracts);
    if (!p) return;
    const prev = sacProj.current;
    sacProj.current = { n: lg.moves.length, wins: p.projWins, nrtg: p.projNrtg };
    const last = lg.moves[lg.moves.length - 1];
    if (!prev || !freshMove(prev.n, lg.moves.length) || !last || !moveTouches(last, "SAC")) return;
    // A full projected win always beams; short of that, a clear net-rating
    // gain does too (small wins-conserving moves can round to +0).
    if (p.projWins > prev.wins || p.projNrtg > prev.nrtg + 0.1) lightTheBeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lg.moves.length, sacOnBoard]);

  // Board showpieces: every team the move set off reacts — each egg self-
  // queues (teamEggs.ts) so co-fires play in sequence, and the cooldown
  // policy keeps a repeated trigger from replaying the same show. League-
  // scale jackpots are mutually exclusive (one takeover per move, rarest
  // first); team reactions fire independently alongside them. Projection and
  // apron-tier baselines are snapshotted on EVERY run so hydration and undo
  // update them silently — only a single fresh move may fire from them.
  const prevMoveCount = useRef<number | null>(null);
  const projPrev = useRef<Record<string, { wins: number; nrtg: number; delta: number }>>({});
  const tierPrev = useRef<Record<string, string>>({});
  const contractsPrev = useRef<Contract[] | null>(null);
  useEffect(() => {
    const n = lg.moves.length;
    const prev = prevMoveCount.current;
    prevMoveCount.current = n;
    const before = contractsPrev.current;
    contractsPrev.current = lg.contracts;
    // Projection baselines for EVERY board team — improvement eggs, Denver's
    // paydirt (#1 overall), and the league jackpots (82-0 / 0 wins) read here.
    const gains: Record<string, { wins: number; nrtg: number; crossed10: boolean; projWins: number; prevWins: number }> = {};
    for (const t of Object.keys(projPrev.current)) if (!board.includes(t)) delete projPrev.current[t];
    for (const t of board) {
      const p = teamProjection(t, lg.contracts);
      if (!p) continue;
      const old = projPrev.current[t];
      projPrev.current[t] = { wins: p.projWins, nrtg: p.projNrtg, delta: p.deltaWins };
      if (old)
        gains[t] = {
          wins: p.projWins - old.wins,
          nrtg: p.projNrtg - old.nrtg,
          crossed10: old.delta < 10 && p.deltaWins >= 10,
          projWins: p.projWins,
          prevWins: old.wins,
        };
    }
    // Apron-tier crossings, both directions: MIN ducking under (aurora),
    // anyone crossing UP into the second apron (the freeze).
    let minDucked = false;
    let frozeOver: string | null = null;
    for (const t of Object.keys(tierPrev.current)) if (!board.includes(t)) delete tierPrev.current[t];
    for (const t of board) {
      const tier = lg.capSheet(t).tier;
      const old = tierPrev.current[t];
      tierPrev.current[t] = tier;
      if (t === "MIN" && old === "second_apron" && tier !== "second_apron") minDucked = true;
      if (old && old !== "second_apron" && tier === "second_apron" && frozeOver === null) frozeOver = t;
    }
    if (!freshMove(prev, n)) return;
    const mv = lg.moves[n - 1]!;
    const impactOf = (pid: string) => {
      const c = lg.contracts.find((x) => x.playerId === pid);
      return c ? impactScoreOf(c) : 0;
    };
    // who just received a star? (CHI intro / LAL premiere share this shape)
    const arrival = (team: string, minImpact: number, minSalary = 0) => {
      if (mv.kind === "trade")
        return mv.players.find(
          (p) => p.to === team && impactOf(p.playerId) >= minImpact && salaryOf(p.playerId) >= minSalary,
        )?.playerId;
      if (minSalary > 0) return undefined; // the premiere is trade-only, per the lore
      if (mv.kind === "sign" && mv.teamId === team && impactOf(mv.playerId) >= minImpact) return mv.playerId;
      if (mv.kind === "sign_trade" && mv.toTeam === team && impactOf(mv.playerId) >= minImpact) return mv.playerId;
      return undefined;
    };
    const touches = (t: string) => board.includes(t) && moveTouches(mv, t);
    const chiStar = board.includes("CHI") ? arrival("CHI", 60) : undefined;
    const lalMax = board.includes("LAL") ? arrival("LAL", 0, 0.28 * C.salaryCap) : undefined;
    const miaMins = lg.moves.filter((m) => m.kind === "sign" && m.teamId === "MIA" && m.mechanism === "minimum").length;
    // The chalk toss is HIS pregame ritual — it fires only if Cleveland
    // brings LeBron James himself home, by any route.
    const LEBRON = "jamesle01";
    const cleLeBron =
      board.includes("CLE") &&
      ((mv.kind === "trade" && mv.players.some((p) => p.playerId === LEBRON && p.to === "CLE")) ||
        (mv.kind === "sign" && mv.teamId === "CLE" && mv.playerId === LEBRON) ||
        (mv.kind === "sign_trade" && mv.toTeam === "CLE" && mv.playerId === LEBRON));
    // ---- ported tranche-4/5 detections ----
    const wasTeamOf = (pid: string) => before?.find((c) => c.playerId === pid)?.teamId;
    const gainOf = (t: string) => !!gains[t] && (gains[t]!.wins > 0 || gains[t]!.nrtg > 0.1);
    // league jackpots
    const perfectTeam = board.find((t) => gains[t] && gains[t]!.projWins >= 82 && touches(t));
    const lotteryTeam = board.find((t) => gains[t] && gains[t]!.projWins <= 8 && touches(t));
    const touchedAll = TEAM_IDS.every((t) => lg.moves.some((m) => moveTouches(m, t)));
    const spendOf = (m: Move) => (m.kind === "sign" || m.kind === "sign_trade" || m.kind === "extend" ? m.salary * (m.years ?? 1) : 0);
    const spentNow = lg.moves.reduce((s2, m) => s2 + spendOf(m), 0);
    // team pieces
    const dalOut = mv.kind === "trade" ? mv.players.filter((p) => wasTeamOf(p.playerId) === "DAL" && p.to !== "DAL").length : 0;
    const chaAssets =
      mv.kind === "trade" ? mv.players.filter((p) => p.to === "CHA").length + (mv.picks ?? []).filter((p) => p.to === "CHA").length : 0;
    const memIn = mv.kind === "trade" ? mv.players.filter((p) => p.to === "MEM").reduce((s2, p) => s2 + salaryOf(p.playerId), 0) : 0;
    const memOut =
      mv.kind === "trade"
        ? mv.players.filter((p) => wasTeamOf(p.playerId) === "MEM" && p.to !== "MEM").reduce((s2, p) => s2 + salaryOf(p.playerId), 0)
        : 0;
    const pickVal = (id: string) => {
      const [o, y, r2] = id.split("|");
      return pickValue(Number(y), r2 === "1" ? 1 : 2, o!);
    };
    const meterOf = (pid: string) => {
      const c = lg.contracts.find((x) => x.playerId === pid);
      return c ? assetMeterValue(c) : 0;
    };
    const indIn =
      mv.kind === "trade"
        ? mv.players.filter((p) => p.to === "IND").reduce((s2, p) => s2 + meterOf(p.playerId), 0) +
          (mv.picks ?? []).filter((p) => p.to === "IND").reduce((s2, p) => s2 + pickVal(p.id), 0)
        : 0;
    const indOut =
      mv.kind === "trade"
        ? mv.players.filter((p) => wasTeamOf(p.playerId) === "IND" && p.to !== "IND").reduce((s2, p) => s2 + meterOf(p.playerId), 0) +
          (mv.picks ?? []).filter((p) => p.from === "IND" && p.to !== "IND").reduce((s2, p) => s2 + pickVal(p.id), 0)
        : 0;
    const torExpiring =
      mv.kind === "trade" &&
      mv.players.some((p) => {
        if (p.to !== "TOR") return false;
        const c = lg.contracts.find((x) => x.playerId === p.playerId);
        return !!c && c.years.filter((y) => y.leagueYear >= YEAR && y.salary > 0).length === 1;
      });
    const utaPicksOf = (m: Move) => (m.kind === "trade" ? (m.picks ?? []).filter((p) => p.to === "UTA").length : 0);
    const utaPicksNow = lg.moves.reduce((s2, m) => s2 + utaPicksOf(m), 0);
    const utaPicksThis = utaPicksOf(mv);
    const denFirst =
      !!gains.DEN &&
      gains.DEN.wins > 0 &&
      touches("DEN") &&
      TEAM_IDS.every((t) => t === "DEN" || (teamProjection(t, lg.contracts)?.projWins ?? 0) < (gains.DEN?.projWins ?? 0));
    const porStar = board.includes("POR") ? arrival("POR", 75) : undefined;
    const porMidnight = new Date().getHours() === 0 && touches("POR");
    // THE HEIST: a trade where one side robs the other on the value meter
    let heistWinner: string | undefined;
    if (mv.kind === "trade") {
      const teamsIn = new Set<string>();
      mv.players.forEach((p) => { teamsIn.add(p.to); const f = wasTeamOf(p.playerId); if (f) teamsIn.add(f); });
      (mv.picks ?? []).forEach((p) => { teamsIn.add(p.to); if (p.from) teamsIn.add(p.from); });
      let bestNet = -Infinity, bestRecv = 0, bestGiven = 0;
      teamsIn.forEach((t) => {
        const recv =
          mv.players.filter((p) => p.to === t).reduce((a, p) => a + meterOf(p.playerId), 0) +
          (mv.picks ?? []).filter((p) => p.to === t).reduce((a, p) => a + pickVal(p.id), 0);
        const given =
          mv.players.filter((p) => wasTeamOf(p.playerId) === t && p.to !== t).reduce((a, p) => a + meterOf(p.playerId), 0) +
          (mv.picks ?? []).filter((p) => p.from === t && p.to !== t).reduce((a, p) => a + pickVal(p.id), 0);
        if (recv - given > bestNet) { bestNet = recv - given; bestRecv = recv; bestGiven = given; heistWinner = t; }
      });
      if (!(heistWinner && bestNet >= 25 && bestRecv >= bestGiven * 2 && board.includes(heistWinner))) heistWinner = undefined;
    }
    // League jackpots — one takeover per move, rarest first, and each rung
    // checks its cooldown so a spent show doesn't swallow the move for the
    // rungs below it. Perfection/Lottery/Commissioner/Audit fire from the
    // STATE (not a crossing): a session restored already at 82-0 still gets
    // its show, and the once-per-session policy is what stops repeats.
    if (perfectTeam && eggReady("perfection")) perfectionEgg(teamMeta(perfectTeam).name);
    else if (lotteryTeam && eggReady("lottery")) lotteryEgg(lotteryTeam);
    else if (touchedAll && eggReady("commish")) commissionerEgg();
    else if (frozeOver && touches(frozeOver) && eggReady(`freeze:${frozeOver}`)) freezeEgg(frozeOver);
    else if (spentNow >= 1_000_000_000 && eggReady("audit")) auditEgg(`${spentNow.toLocaleString("en-US")}`);
    else if (heistWinner && eggReady("heist")) heistEgg(teamMeta(heistWinner).name);

    // Team reactions — independent checks (not else-if): a multi-team deal
    // can trip several, and the queue serializes them. Ordered by billing.
    if (chiStar) introEgg(lg.playerName(chiStar));
    if (cleLeBron) chalkTossEgg("LeBron James");
    if (lalMax && mv.kind === "trade") premiereEgg();
    if (
      board.includes("OKC") &&
      mv.kind === "trade" &&
      (mv.picks ?? []).some((p) => p.to === "OKC" && p.id.endsWith("|1"))
    ) {
      strikeEgg(lg.picksOf("OKC").filter((p) => p.round === 1).length);
    }
    if (board.includes("SAS") && moveTouches(mv, "SAS") && lg.moves.filter((m) => moveTouches(m, "SAS")).length === 5) {
      rockCrackEgg();
    }
    if (
      board.includes("BKN") &&
      mv.kind === "trade" &&
      (mv.players.some((p) => p.to === "BKN") ||
        (mv.picks ?? []).some((p) => p.to === "BKN" || p.from === "BKN") ||
        (mv.pickSwaps ?? []).some((s) => s.favoredTo === "BKN" || s.otherTeam === "BKN"))
    ) {
      subwayEgg();
    }
    if (mv.kind === "extend" && board.includes("MIL") && lg.contracts.find((c) => c.playerId === mv.playerId)?.teamId === "MIL")
      antlersEgg(mv.playerName);
    if (minDucked && touches("MIN")) northernLightsEgg();
    if (mv.kind === "sign" && mv.teamId === "MIA" && mv.mechanism === "minimum" && miaMins === 2 && board.includes("MIA")) whiteHotEgg();
    if (mv.kind === "sign" && mv.teamId === "DET" && board.includes("DET") && gainOf("DET")) assemblyLineEgg();
    if (gains.GSW?.crossed10 && touches("GSW")) lightYearsEgg();
    if ((gains.BOS?.wins ?? 0) >= 3 && touches("BOS")) cigarEgg();
    if ((gains.NYK?.wins ?? 0) >= 1 && touches("NYK")) bingBongEgg();
    if (mv.kind === "trade" && gainOf("NOP") && touches("NOP")) beadThrowEgg();
    if (gainOf("WAS") && touches("WAS")) blossomsEgg();
    if (porStar || porMidnight) dameTimeEgg();
    if (denFirst) summitEgg();
    if (torExpiring && board.includes("TOR")) theNorthEgg();
    if (chaAssets >= 3 && board.includes("CHA")) swarmEgg();
    if (dalOut >= 3 && board.includes("DAL")) stampedeEgg();
    if (mv.kind === "trade" && board.includes("MEM") && memIn > 0 && memIn > memOut) gritGrindEgg();
    if (mv.kind === "trade" && board.includes("IND") && indOut > 0 && indIn >= indOut + 5) brickyardEgg();
    if (utaPicksThis > 0 && utaPicksNow >= 3 && utaPicksNow - utaPicksThis < 3 && board.includes("UTA")) theRiffEgg();
    if ((gains.HOU?.wins ?? 0) >= 2 && touches("HOU")) launchEgg();
    if ((gains.PHI?.wins ?? 0) >= 2 && touches("PHI")) bellTollEgg();
    if (gainOf("ATL") && touches("ATL")) hawkDiveEgg();
    if ((gains.LAC?.wins ?? 0) >= 2 && touches("LAC")) theWallEgg();
    if ((gains.ORL?.wins ?? 0) >= 2 && touches("ORL")) finaleEgg();
    if (gainOf("PHX") && touches("PHX")) valleySunriseEgg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lg.moves.length]);

  // Power-user keys: T finder · S sign · G glossary · ? this card.
  // Escape closes the topmost surface from anywhere (including inputs);
  // open-a-surface keys go inert while any overlay is already up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (shareOpen) return; // the share modal closes itself
        else if (finderOpen) setFinderOpen(false);
        else if (signFor) setSignFor(null);
        else if (extendFor) setExtendFor(null);
        return;
      }
      if (e.key === "?" && shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (shareOpen || signFor || extendFor || finderOpen || shortcutsOpen) return;
      const k = e.key.toLowerCase();
      if (e.key === "?") setShortcutsOpen(true);
      else if (k === "t") setFinderOpen(true);
      else if (k === "g") router.push("/glossary");
      else if (k === "s" && board.length) setSignFor({ team: board[0]! });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, board, shareOpen, signFor, extendFor, finderOpen, shortcutsOpen]);

  // Header wordmark on the home page → back to the team picker.
  useEffect(() => {
    const toPicker = () => {
      setBoard([]);
      setSel({});
      setPickSel({});
      setSwapSel([]);
    };
    window.addEventListener("ota:pick-team", toPicker);
    return () => window.removeEventListener("ota:pick-team", toPicker);
  }, []);

  const addTeam = (id: string) =>
    setBoard((b) => (b.includes(id) || b.length >= 8 ? b : [...b, id]));
  const removeTeam = (id: string) => {
    setBoard((b) => b.filter((t) => t !== id));
    setSel((s) => {
      const n = { ...s };
      for (const [p, mv] of Object.entries(n)) if (mv.from === id || mv.to === id) delete n[p];
      return n;
    });
    setPickSel((s) => {
      const n = { ...s };
      for (const [p, mv] of Object.entries(n)) if (mv.from === id || mv.to === id) delete n[p];
      return n;
    });
    setSwapSel((sw) => sw.filter((s) => s.favoredTo !== id && s.otherTeam !== id));
    if (signFor?.team === id) setSignFor(null);
  };
  const togglePlayer = (pid: string, from: string) =>
    setSel((s) => {
      const n = { ...s };
      if (n[pid]) delete n[pid];
      else n[pid] = { from, to: board.find((t) => t !== from) ?? from };
      return n;
    });
  const setDest = (pid: string, to: string) =>
    setSel((s) => ({ ...s, [pid]: { ...s[pid]!, to } }));
  const setPickDest = (pid: string, to: string) =>
    setPickSel((s) => ({ ...s, [pid]: { ...s[pid]!, to } }));
  const togglePick = (pid: string, from: string) =>
    setPickSel((s) => {
      const n = { ...s };
      if (n[pid]) delete n[pid];
      else n[pid] = { from, to: board.find((t) => t !== from) ?? from };
      return n;
    });
  const addSwap = (s: PickSwap) =>
    setSwapSel((sw) => (sw.some((x) => swapKey(x) === swapKey(s)) ? sw : [...sw, s]));
  const removeSwap = (key: string) =>
    setSwapSel((sw) => sw.filter((s) => swapKey(s) !== key));

  // The staged S&T player's TEMP contract, sitting on his old team's books
  // exactly the way the executed move would write it (raises by rights, BYC
  // tag when it applies) — so validateTrade prices him correctly for free.
  const stContract = useMemo(() => {
    if (!stStage) return null;
    const n = Math.max(3, Math.min(stStage.years, 4));
    const start = Number(YEAR.slice(0, 4));
    const raise = stStage.birdStatus === "non_bird" ? 0.05 : 0.08;
    const yrs = Array.from({ length: n }, (_, k) => ({
      leagueYear: `${start + k}-${String((start + 1 + k) % 100).padStart(2, "0")}`,
      salary: Math.round(stStage.salary * (1 + raise * k)),
      guarantee: "full" as const,
    }));
    const existing = lg.contracts.find((c) => c.playerId === stStage.playerId);
    return {
      playerId: stStage.playerId,
      playerName: stStage.playerName,
      teamId: stStage.fromTeam,
      years: [...(existing?.years.filter((y) => y.leagueYear < YEAR) ?? []), ...yrs],
      bycPriorSalary: stStage.byc ? stStage.priorSalary : undefined,
      signedUsing: "Sign-and-trade",
    } as Contract;
  }, [stStage, lg.contracts]);
  const boardContracts = useMemo(
    () =>
      stContract
        ? [...lg.contracts.filter((c) => c.playerId !== stContract.playerId), stContract]
        : lg.contracts,
    [lg.contracts, stContract],
  );
  const boardData = useMemo(
    () => (stContract ? leagueData(boardContracts) : lg.data),
    [boardContracts, stContract, lg.data],
  );

  const { trade, verdict, byTeam } = useMemo(() => {
    const players = Object.entries(sel)
      .filter(([, mv]) => board.includes(mv.from) && board.includes(mv.to))
      .map(([pid, mv]) => ({ playerId: pid, from: mv.from, to: mv.to }));
    // Kept holds consume below-cap absorption room (not apron status). A
    // staged S&T converts HIS hold into the temp salary, so it drops out.
    const capHolds = Object.fromEntries(
      board.map((t) => [t, Math.max(0, lg.teamHolds(t) - (stStage?.fromTeam === t ? stStage.hold : 0))]),
    );
    let tr: Trade = { teams: board, players, capHolds };
    let v = validateTrade(boardData, tr, C);
    // If matching fails, try absorbing incoming players into standing TPEs
    // (largest exception, whole players) and re-judge.
    if (!v.legal && v.violations.some((x) => x.ruleId === "salary_matching")) {
      const incomingByTeam: Record<string, { playerId: string; salary: number }[]> = {};
      for (const p of players) {
        const c = boardContracts.find((x) => x.playerId === p.playerId);
        (incomingByTeam[p.to] ??= []).push({ playerId: p.playerId, salary: c ? currentSalary(c) : 0 });
      }
      const plan = fitTpePlan(v.teams, incomingByTeam, tpeLedger(lg.moves));
      if (plan) {
        tr = { ...tr, tpeUse: plan };
        v = validateTrade(boardData, tr, C);
      }
    }
    return { trade: tr, verdict: v, byTeam: new Map(v.teams.map((t) => [t.teamId, t])) };
  }, [board, sel, lg, boardData, boardContracts, stStage]);

  const hasTrade = trade.players.length > 0 || Object.keys(pickSel).length > 0 || swapSel.length > 0;

  // Sticky tray: the deal summary follows you while you scroll rosters.
  const verdictRef = useRef<HTMLDivElement>(null);
  const trayVisible = useTrayVisible(verdictRef, hasTrade);
  const salaryOf = (id: string) => {
    const c = boardContracts.find((x) => x.playerId === id);
    return c ? currentSalary(c) : 0;
  };
  const docketTeams = useMemo(
    () =>
      buildDocket(
        trade.players,
        pickSel,
        verdict.teams,
        (id) => (stStage && id === stStage.playerId ? `${lg.playerName(id)} · S&T` : lg.playerName(id)),
        salaryOf,
        trade.tpeUse,
        swapSel,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trade, pickSel, swapSel, verdict, lg],
  );
  const trayHauls = useMemo<TrayHaul[]>(() => {
    const m: Record<string, { labels: string[]; tools: string[] }> = {};
    const row = (team: string) => (m[team] ??= { labels: [], tools: [] });
    for (const p of trade.players) row(p.to).labels.push(shortPlayerName(lg.playerName(p.playerId)));
    for (const [id, mv] of Object.entries(pickSel)) row(mv.to).labels.push(pickShareLabel(id));
    for (const s of swapSel) row(s.favoredTo).labels.push(`’${s.year - 2000} ${s.round === 1 ? "1st" : "2nd"} swap w/ ${s.otherTeam}`);
    for (const [team, use] of Object.entries(trade.tpeUse ?? {})) {
      row(team).tools.push(use.label ?? "TPE");
    }
    return Object.entries(m).map(([team, haul]) => ({ team, ...haul }));
  }, [trade, pickSel, swapSel, lg]);

  // Ted Stepien rule, against the FULL pick-ownership ledger: after this trade
  // (and every prior executed one), no team may lack a first-round pick in
  // consecutive future years.
  const stepienViolations = useMemo(() => {
    const outBy: Record<string, string[]> = {};
    const inBy: Record<string, string[]> = {};
    const touched = new Set<string>();
    for (const [id, mv] of Object.entries(pickSel)) {
      (outBy[mv.from] ??= []).push(id);
      (inBy[mv.to] ??= []).push(id);
      touched.add(mv.from);
      touched.add(mv.to);
    }
    return [...touched]
      .map((t) => {
        const uncovered = lg.yearsWithoutFirst(t, outBy[t] ?? [], inBy[t] ?? []);
        if (!violatesStepien(uncovered)) return null;
        const outYears = (outBy[t] ?? [])
          .filter((id) => id.endsWith("|1"))
          .map((id) => Number(id.split("|")[1]));
        return stepienFindingFor(t, uncovered, outYears)?.message ?? null;
      })
      .filter((x): x is string => !!x);
  }, [pickSel, lg]);

  // Player + pick value flowing in/out per team (for the fair-trade meter).
  const valueByTeam = useMemo(() => {
    const m: Record<string, { in: number; out: number }> = {};
    for (const p of trade.players) {
      const contract = lg.contracts.find((c) => c.playerId === p.playerId);
      const val = contract ? assetMeterValue(contract) : 0;
      (m[p.from] ??= { in: 0, out: 0 }).out += val;
      (m[p.to] ??= { in: 0, out: 0 }).in += val;
    }
    for (const [id, mv] of Object.entries(pickSel)) {
      const [origin, yearStr, round] = id.split("|");
      const val = pickValue(Number(yearStr), round === "1" ? 1 : 2, origin);
      (m[mv.from] ??= { in: 0, out: 0 }).out += val;
      (m[mv.to] ??= { in: 0, out: 0 }).in += val;
    }
    // A swap right: the favored team gains the option value, the grantor loses it.
    for (const s of swapSel) {
      const val = pickSwapValue(s.year, s.round, s.favoredTo, s.otherTeam);
      (m[s.favoredTo] ??= { in: 0, out: 0 }).in += val;
      (m[s.otherTeam] ??= { in: 0, out: 0 }).out += val;
    }
    return m;
  }, [trade, pickSel, swapSel, lg]);

  // A hard cap triggered earlier (MLE/BAE/S&T, sim or real July) binds later
  // trades too — the message says WHICH, because only one is undoable.
  const hardCapTradeViolations = useMemo(() => {
    const out: string[] = [];
    for (const t of verdict.teams) {
      const detail = hardCapDetailFor(t.teamId, lg.hardCapOf(t.teamId));
      if (detail && t.postTradeSalary > detail.line + 1) {
        out.push(
          detail.source === "real"
            ? `${teamMeta(t.teamId).name} is hard-capped at ${fmtM(detail.line)} all season by its real July moves${detail.label ? ` (${detail.label})` : ""} — this trade would put them at ${fmtM(t.postTradeSalary)}.`
            : `${teamMeta(t.teamId).name} is hard-capped at ${fmtM(detail.line)} from a move you made this offseason — this trade would put them at ${fmtM(t.postTradeSalary)}.`,
        );
      }
    }
    return out;
  }, [verdict, lg]);

  // Sign-and-trade rules the board must speak while an S&T is staged.
  const stViolations = useMemo<string[]>(() => {
    if (!stStage) return [];
    const out: string[] = [];
    const mv = sel[stStage.playerId];
    if (!mv || mv.to === mv.from || mv.from !== stStage.fromTeam) {
      out.push(
        `${stStage.playerName}'s sign-and-trade is staged — he has to be dealt away from ${teamMeta(stStage.fromTeam).name} for the re-sign to be legal (Art. VII §8(e)).`,
      );
      return out;
    }
    const dest = mv.to;
    const t = byTeam.get(dest);
    if (lg.capSheet(dest).tier === "second_apron")
      out.push(
        `${teamMeta(dest).name} is over the second apron — a second-apron team may not acquire a player by sign-and-trade (§2(e) row C).`,
      );
    const post = lg.teamSalary(dest) + (t?.incomingSalary ?? stStage.salary) - (t?.outgoingSalary ?? 0);
    if (post > C.firstApron + 1)
      out.push(
        `A sign-and-trade hard-caps ${teamMeta(dest).name} at the first apron — this deal leaves them at ${fmtM(post)}, over ${fmtM(C.firstApron)} (§2(e) row C). Send out more salary.`,
      );
    if (stStage.salary > stStage.ceiling + 1)
      out.push(
        `${teamMeta(stStage.fromTeam).name} can re-sign ${stStage.playerName} for at most ${fmtM(stStage.ceiling)} with his rights — lower the S&T salary.`,
      );
    if (swapSel.length)
      out.push("Pick swaps can't ride a sign-and-trade yet — clear the swap or run it as a separate deal.");
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stStage, sel, byTeam, swapSel, lg]);
  const docketLegal =
    verdict.legal && stepienViolations.length === 0 && hardCapTradeViolations.length === 0 && stViolations.length === 0;
  const docketChecks = useMemo(
    () =>
      buildChecks({
        legal: docketLegal,
        involved: verdict.teams.filter((t) => docketTeams.some((d) => d.teamId === t.teamId)),
        tpeUse: trade.tpeUse,
        violationReasons: verdict.violations.map((v) => v.reason),
        extraViolations: [...stepienViolations, ...hardCapTradeViolations, ...stViolations],
        hasFirsts: Object.keys(pickSel).some((id) => id.endsWith("|1")),
      }),
    [docketLegal, verdict, docketTeams, trade, pickSel, stepienViolations, hardCapTradeViolations, stViolations],
  );
  const docketFix = useMemo(
    () =>
      docketLegal
        ? null
        : explainBlocked(verdict, [...stepienViolations, ...hardCapTradeViolations, ...stViolations], C, lg.teamHolds, (t) => tpeLedger(lg.moves)[t] ?? []).fixes[0] ?? null,
    [docketLegal, verdict, stepienViolations, hardCapTradeViolations, stViolations, lg],
  );

  const executeTrade = () => {
    const names = trade.players.map((p) => shortPlayerName(lg.playerName(p.playerId)));
    const pickMoves = Object.entries(pickSel).map(([id, mv]) => ({ id, from: mv.from, to: mv.to }));
    // A staged sign-and-trade executes as ONE sign_trade move carrying every
    // leg of the deal the board built.
    if (stStage && sel[stStage.playerId] && sel[stStage.playerId]!.to !== stStage.fromTeam) {
      const dest = sel[stStage.playerId]!.to;
      const others = trade.players
        .filter((p) => p.playerId !== stStage.playerId)
        .map((p) => ({ playerId: p.playerId, to: p.to }));
      const returnSalary = others
        .filter((p) => p.to === stStage.fromTeam)
        .reduce((sum, p) => sum + salaryOf(p.playerId), 0);
      const senderOutgoing = stStage.byc
        ? Math.max(stStage.salary * 0.5, Math.min(stStage.salary, stStage.priorSalary))
        : stStage.salary;
      dispatchMove({
        kind: "sign_trade",
        label: `S&T: ${stStage.playerName} → ${dest} (${fmtM(stStage.salary)} × ${stStage.years}y${others.length ? ` +${others.length}` : ""}${pickMoves.length ? ` +${pickMoves.length} pk` : ""})`,
        playerId: stStage.playerId,
        playerName: stStage.playerName,
        toTeam: dest,
        salary: stStage.salary,
        years: stStage.years,
        fromTeam: stStage.fromTeam,
        returnPlayers: others.filter((p) => p.to === stStage.fromTeam).map((p) => p.playerId),
        players: others,
        picks: pickMoves,
        birdStatus: stStage.birdStatus,
        priorSalary: stStage.priorSalary,
        byc: stStage.byc,
        senderHardCapped: returnSalary > senderOutgoing + 1,
      });
      leagueToast(
        "Filed",
        `Sign-and-trade executed — ${stStage.playerName} re-signs and reports to ${teamMeta(dest).name}. Both front offices know what it cost.`,
      );
      setStStage(null);
      setSel({});
      setPickSel({});
      setSwapSel([]);
      return;
    }
    const swaps = swapSel.map((s) => ({ year: s.year, round: s.round, favoredTo: s.favoredTo, otherTeam: s.otherTeam }));
    const extras = [
      pickMoves.length ? `${pickMoves.length} pick${pickMoves.length > 1 ? "s" : ""}` : "",
      swaps.length ? `${swaps.length} swap${swaps.length > 1 ? "s" : ""}` : "",
    ].filter(Boolean);
    const extraTxt = extras.length ? ` +${extras.join(" +")}` : "";
    dispatchMove({
      kind: "trade",
      label: `Trade: ${names.length ? names.join(", ") : "picks"}${extraTxt}`,
      players: trade.players.map((p) => ({ playerId: p.playerId, to: p.to })),
      picks: pickMoves,
      pickSwaps: swaps.length ? swaps : undefined,
      // TPE plan chosen at staging rides along — the ledger and hard-cap
      // replay both read it back.
      tpeUse: trade.tpeUse,
    });
    const teamsInvolved = new Set([
      ...trade.players.flatMap((p) => [p.from, p.to]),
      ...swaps.flatMap((s) => [s.favoredTo, s.otherTeam]),
    ]).size;
    leagueToast(
      "Filed",
      teamsInvolved >= 3
        ? `A ${teamsInvolved}-team special — ${names.join(", ") || "pick swaps and all"}. The fax machines are humming.`
        : `Trade executed — ${names.join(", ") || "picks"}${extras.length ? ` (+${extras.join(", ")})` : ""}. The league office thanks you.`,
    );
    setSel({});
    setPickSel({});
    setSwapSel([]);
  };

  const available = TEAM_IDS.filter((t) => !board.includes(t)).sort(byNickname);
  const sharePicks: DecodedPick[] = Object.entries(pickSel)
    .filter(([, mv]) => board.includes(mv.from) && board.includes(mv.to))
    .map(([id, mv]) => ({ id, from: mv.from, to: mv.to }));

  // First run: no team yet — the landing IS the team picker.
  if (!ready) return <div className="min-h-[50vh]" />;
  if (board.length === 0) {
    return (
      <div className="pb-24 pt-2">
        {/* Picking a front office lands on ITS war room first — cap sheet,
            rotation, draft capital — whose Trade→ / Sign FAs→ CTAs deep-link
            back here with the team staged. Returning sessions skip the picker
            entirely (the board restores), so only fresh starts route away. */}
        <TeamPicker onPick={(id) => router.push(`/team/${id}`)} />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            The NBA offseason, <span className="underline-swipe">simplified</span>.
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Put teams on the board, then trade, sign, extend, and renounce. Each
            move builds on the last from the current roster data, with rule
            citations where they apply.
          </p>
        </div>
        <button
          onClick={() => setFinderOpen(true)}
          className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent)] hover:text-white"
        >
          Trade finder
        </button>
      </div>

      {/* board controls */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {board.map((id) => (
          <span key={id} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] py-1 pl-2 pr-1.5 text-[13px] font-medium">
            <TeamLogo id={id} size={16} />
            {teamMeta(id).name}
            <button onClick={() => removeTeam(id)} aria-label={`Remove ${teamMeta(id).name}`} className="rounded px-0.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--tier-second_apron)]">✕</button>
          </span>
        ))}
        {board.length < 8 && (
          <select value="" onChange={(e) => e.target.value && addTeam(e.target.value)} className="rounded-md border border-dashed border-[var(--border-strong)] bg-transparent px-2 py-1 text-[13px] text-[var(--muted)] hover:border-[var(--text)]">
            <option value="">+ Add team</option>
            {available.map((id) => (
              <option key={id} value={id}>{teamMeta(id).name}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("ota:pick-team"))}
          className="ml-auto rounded-md px-2 py-1 text-[12px] font-medium text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]"
          title="Back to the team picker"
        >
          Switch team
        </button>
      </div>

      {/* trade verdict — on desktop the panel itself pins under the header
          while you scroll rosters; on mobile the TradeTray overlay takes over */}
      {hasTrade && (
        <div ref={verdictRef} className="md:sticky md:top-[56px] md:z-10 md:bg-[var(--bg)] md:pb-2" style={{ scrollMarginTop: 60 }}>
          <TradeVerdict verdict={verdict} extraViolations={[...stepienViolations, ...hardCapTradeViolations, ...stViolations]} valueByTeam={valueByTeam} tpeUse={trade.tpeUse} onExecute={executeTrade} onShare={() => setShareOpen(true)} lg={lg} executeLabel={stStage && trade.players.some((p) => p.playerId === stStage.playerId) ? "Execute sign & trade" : undefined} />
          <div className="mt-2">
            <TradeDocket teams={docketTeams} />
          </div>
          <div className="mt-2">
            <DocketWhy legal={docketLegal} checks={docketChecks} fix={docketFix} />
          </div>
        </div>
      )}
      {hasTrade && (
        <TradeTray
          hauls={trayHauls}
          legal={docketLegal}
          visible={trayVisible}
          onReview={() => verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          onShare={() => setShareOpen(true)}
        />
      )}

      {/* staged sign-and-trade strip */}
      {stStage && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] px-3 py-2 text-xs">
          <span className="rounded-[3px] bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white">S&T staged</span>
          <span className="min-w-0 flex-1">
            <strong>{stStage.playerName}</strong> re-signs with {teamMeta(stStage.fromTeam).name} at{" "}
            <span className="tabular">{fmtM(stStage.salary)} × {stStage.years}y</span> and must be dealt away — build the trade below.
            {stStage.byc ? " Base-year comp applies to his outgoing value." : ""}
          </span>
          <button
            onClick={() => {
              setStStage(null);
              setSel((cur) => {
                const n = { ...cur };
                delete n[stStage.playerId];
                return n;
              });
            }}
            className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 font-semibold text-[var(--muted)] hover:text-[var(--text)]"
          >
            Cancel S&T
          </button>
        </div>
      )}

      {/* board */}
      {/* One card gets a wide centered stage, two split the width — a fixed
          three-track grid made early boards look like abandoned desk space. */}
      <div
        className={`mt-4 grid grid-cols-1 gap-4 ${
          board.length === 1
            ? "mx-auto w-full max-w-2xl"
            : board.length === 2
              ? "mx-auto w-full max-w-6xl md:grid-cols-2"
              : "md:grid-cols-2 xl:grid-cols-3"
        }`}
      >
        {board.map((id, i) => (
          <div key={id} data-egg-team={id} className="fade-up" style={{ animationDelay: `${i * 70}ms` }}>
          <TeamColumn
            teamId={id}
            board={board}
            lg={lg}
            flourish={flourishTeam === id}
            summary={byTeam.get(id)}
            sel={sel}
            onTogglePlayer={togglePlayer}
            onDest={setDest}
            picks={lg.picksOf(id)}
            pickSel={pickSel}
            onTogglePick={togglePick}
            onPickDest={setPickDest}
            onSign={(faId, st) => setSignFor({ team: id, faId, st })}
            onExtend={(playerId, playerName) => setExtendFor({ playerId, playerName, team: id })}
            onWaive={(playerId, playerName) => setWaiveFor({ playerId, playerName, team: id })}
            stagedSt={stContract}
          />
          </div>
        ))}
      </div>

      {board.length >= 2 && (
        <PickSwapBuilder board={board} lg={lg} swaps={swapSel} onAdd={addSwap} onRemove={removeSwap} />
      )}

      {shortcutsOpen && (
        <div className="fixed inset-0 z-[70]" onClick={() => setShortcutsOpen(false)}>
          <div className="infobox fixed left-1/2 top-1/2 w-[300px] -translate-x-1/2 -translate-y-1/2" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="label !text-[10px] !text-[var(--accent-ink)]">Front-office shortcuts</span>
              <button onClick={() => setShortcutsOpen(false)} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">✕</button>
            </div>
            <div className="space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between"><span>Trade finder</span><span className="shortcut-key">T</span></div>
              <div className="flex items-center justify-between"><span>Sign a free agent</span><span className="shortcut-key">S</span></div>
              <div className="flex items-center justify-between"><span>Glossary</span><span className="shortcut-key">G</span></div>
              <div className="flex items-center justify-between"><span>Close anything</span><span className="shortcut-key">Esc</span></div>
              <div className="tear mt-2 flex items-center justify-between pt-2 text-[11px] text-[var(--muted)]">
                <span>Ask the commissioner</span>
                <span className="tabular">↑↑↓↓←→←→BA</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {shareOpen && hasTrade && (
        <ShareCardModal
          trade={trade}
          picks={sharePicks}
          swaps={swapSel}
          verdict={verdict}
          extraViolations={[...stepienViolations, ...hardCapTradeViolations, ...stViolations]}
          holdsOf={lg.teamHolds}
          nameOf={lg.playerName}
          salaryOf={salaryOf}
          onClose={() => setShareOpen(false)}
        />
      )}
      {recap && (
        <OffseasonRecapModal
          moves={recap.moves}
          teams={recap.teams}
          onClose={() => setRecap(null)}
          onShare={() => {
            void navigator.clipboard?.writeText(window.location.href).catch(() => {});
          }}
        />
      )}
      {signFor && (
        <SignDrawer
          team={signFor.team}
          initialId={signFor.faId}
          initialSt={signFor.st}
          lg={lg}
          onClose={() => setSignFor(null)}
          onStageSt={(st) => {
            setStStage(st);
            // his old team must be on the board; preselect him outbound if a
            // destination already exists, otherwise the GM picks one
            setBoard((b) => (b.includes(st.fromTeam) ? b : [...b, st.fromTeam].slice(0, 8)));
            const dest = board.find((t) => t !== st.fromTeam);
            setSel((cur) => ({ ...cur, [st.playerId]: { from: st.fromTeam, to: dest ?? st.fromTeam } }));
            setSignFor(null);
          }}
        />
      )}
      {extendFor && <ExtendDrawer {...extendFor} lg={lg} onClose={() => setExtendFor(null)} />}
      {waiveFor && <WaiveDrawer {...waiveFor} lg={lg} onClose={() => setWaiveFor(null)} />}
      {finderOpen && <TradeFinderDrawer board={board} lg={lg} onClose={() => setFinderOpen(false)} onLoad={loadTradePackage} />}
    </div>
  );
}

const SWAP_SELECT =
  "rounded-[4px] border border-[var(--border)] bg-[var(--panel)] px-1 py-1 text-[11px] font-medium text-[var(--text)]";

/** Builder for user-created pick swaps: pick two board teams, a round and a
 *  year they BOTH still control, and who takes the more favorable pick. A swap
 *  is a right — it doesn't move a pick, so it never breaks Stepien coverage. */
function PickSwapBuilder({
  board,
  lg,
  swaps,
  onAdd,
  onRemove,
}: {
  board: string[];
  lg: LG;
  swaps: PickSwap[];
  onAdd: (s: PickSwap) => void;
  onRemove: (key: string) => void;
}) {
  const [favoredTo, setFavoredTo] = useState(board[0]!);
  const [otherTeam, setOtherTeam] = useState(board.find((t) => t !== board[0]) ?? board[0]!);
  const [round, setRound] = useState<1 | 2>(1);
  const [year, setYear] = useState<number | "">("");

  // Keep the two team selects valid (and distinct) as the board changes.
  useEffect(() => {
    if (!board.includes(favoredTo)) setFavoredTo(board[0]!);
  }, [board, favoredTo]);
  useEffect(() => {
    if (otherTeam === favoredTo || !board.includes(otherTeam))
      setOtherTeam(board.find((t) => t !== favoredTo) ?? favoredTo);
  }, [board, favoredTo, otherTeam]);

  // Years where BOTH teams still control their OWN pick of this round — an owed
  // or already-swapped pick can't be put into a new swap.
  const years = useMemo(() => {
    const own = (team: string) =>
      new Set(
        lg
          .picksOf(team)
          .filter((p) => p.origin === team && p.round === round)
          .map((p) => p.year),
      );
    const a = own(favoredTo);
    const b = own(otherTeam);
    return [...a].filter((y) => b.has(y)).sort((x, y) => x - y);
  }, [favoredTo, otherTeam, round, lg]);
  useEffect(() => {
    if (year === "" || !years.includes(year as number)) setYear(years[0] ?? "");
  }, [years, year]);

  const dupe =
    year !== "" &&
    swaps.some(
      (s) =>
        s.year === year &&
        s.round === round &&
        ((s.favoredTo === favoredTo && s.otherTeam === otherTeam) ||
          (s.favoredTo === otherTeam && s.otherTeam === favoredTo)),
    );
  const canAdd = year !== "" && favoredTo !== otherTeam && !dupe;

  return (
    <details className="panel mt-4 p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Pick swaps{" "}
        <span className="font-normal text-[var(--muted)]">— give a team the right to swap firsts</span>
      </summary>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="label !text-[9px]">Round</span>
          <select value={round} onChange={(e) => setRound(Number(e.target.value) as 1 | 2)} className={SWAP_SELECT}>
            <option value={1}>1st</option>
            <option value={2}>2nd</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="label !text-[9px]">Year</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={!years.length}
            className={SWAP_SELECT}
          >
            {years.length ? (
              years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))
            ) : (
              <option value="">—</option>
            )}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="label !text-[9px]">Favored (takes better)</span>
          <select value={favoredTo} onChange={(e) => setFavoredTo(e.target.value)} className={SWAP_SELECT}>
            {[...board].sort(byNickname).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-1.5 text-[var(--muted)]">⇄</span>
        <label className="flex flex-col gap-0.5">
          <span className="label !text-[9px]">With</span>
          <select value={otherTeam} onChange={(e) => setOtherTeam(e.target.value)} className={SWAP_SELECT}>
            {[...board]
              .filter((t) => t !== favoredTo)
              .sort(byNickname)
              .map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
          </select>
        </label>
        <button
          disabled={!canAdd}
          onClick={() => canAdd && onAdd({ year: year as number, round, favoredTo, otherTeam })}
          className="rounded-[4px] border border-[var(--tier-taxpayer)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tier-taxpayer)] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "color-mix(in srgb, var(--tier-taxpayer) 9%, transparent)" }}
        >
          Add swap
        </button>
      </div>
      {!years.length && (
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          These two teams don’t both still control a {round === 1 ? "first" : "second"} they could
          swap — one has already traded away every year.
        </div>
      )}
      {dupe && <div className="mt-2 text-[11px] text-[var(--muted)]">That swap is already staged.</div>}
      {swaps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {swaps.map((s) => (
            <span
              key={swapKey(s)}
              className="tabular inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                borderColor: "var(--tier-taxpayer)",
                color: "var(--tier-taxpayer)",
                background: "color-mix(in srgb, var(--tier-taxpayer) 9%, transparent)",
              }}
              title={`${s.favoredTo} takes the more favorable of the two ${s.year} ${s.round === 1 ? "firsts" : "seconds"}; ${s.otherTeam} gets the other. Est. swap value ${pickSwapValue(s.year, s.round, s.favoredTo, s.otherTeam)}.`}
            >
              ’{s.year - 2000} {s.round === 1 ? "1st" : "2nd"}: {s.favoredTo} ⇄ {s.otherTeam}
              <button
                onClick={() => onRemove(swapKey(s))}
                className="text-[var(--muted)] hover:text-[var(--text)]"
                aria-label="Remove swap"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </details>
  );
}

function TradeVerdict({
  verdict,
  extraViolations = [],
  valueByTeam = {},
  tpeUse,
  onExecute,
  onShare,
  lg,
  executeLabel,
}: {
  verdict: ReturnType<typeof validateTrade>;
  extraViolations?: string[];
  valueByTeam?: Record<string, { in: number; out: number }>;
  tpeUse?: Trade["tpeUse"];
  onExecute: () => void;
  onShare: () => void;
  lg: LG;
  executeLabel?: string;
}) {
  const legal = verdict.legal && extraViolations.length === 0;
  const firstReason = verdict.violations[0]?.reason ?? extraViolations[0];
  const color = legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)";
  // Count staged trades once per verdict panel, not per roster tweak.
  useEffect(() => {
    track("trade_staged", { result: verdict.legal ? "legal" : "blocked" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The cap-nerd detail: on legal deals, how close did the tightest leg come?
  const margins = verdict.teams
    .filter((t) => t.incomingSalary > 0)
    .map((t) => t.maxIncomingAllowed - (t.incomingSalary - (t.tpeAbsorbed ?? 0)));
  const minMargin = margins.length ? Math.min(...margins) : Infinity;
  const tpeDetails = verdict.teams
    .filter((t) => (t.tpeAbsorbed ?? 0) > 0)
    .map((t) => {
      const use = tpeUse?.[t.teamId];
      return `${t.teamId} uses ${fmtM(t.tpeAbsorbed!)} ${use?.label ?? "TPE"}`;
    });
  const tpeSummary = legal && tpeDetails.length ? tpeDetails.join(" · ") : null;
  const clearedBy =
    legal && !tpeSummary && minMargin < 999_500
      ? minMargin < 1_000
        ? "clears matching to the dollar"
        : `clears matching by $${Math.floor(minMargin / 1_000)}k`
      : null;
  const [showFix, setShowFix] = useState(false);
  const explainer = useMemo(
    () => (legal ? null : explainBlocked(verdict, extraViolations, C, lg.teamHolds, (t) => tpeLedger(lg.moves)[t] ?? [])),
    [legal, verdict, extraViolations, lg],
  );
  const triggers = useMemo(
    () => (legal ? tradeConsequences(verdict.teams, tpeUse, lg.teamHolds, verdict.checks) : []),
    [legal, verdict, tpeUse, lg],
  );
  const hasFix = !!explainer && (explainer.subject.length > 0 || explainer.fixes.length > 0);
  const valTeams = Object.entries(valueByTeam).filter(([, v]) => v.in > 0 || v.out > 0);
  const maxNet = Math.max(1, ...valTeams.map(([, v]) => Math.abs(v.in - v.out)));
  const totalVal = Math.max(1, ...valTeams.map(([, v]) => v.in + v.out));
  const fairness = maxNet / totalVal; // 0 = perfectly even
  const fairLabel = fairness < 0.15 ? "Even value" : fairness < 0.4 ? "Slight edge" : "Lopsided";
  return (
    <div className="panel overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            key={`${legal}-${firstReason ?? ""}`}
            className="stamp stamp-in shrink-0 text-[12px]"
            style={{ color }}
          >
            {legal ? "Legal trade" : "Blocked"}
          </span>
          {!legal && (
            <div className="min-w-0 text-sm leading-snug text-[var(--text)]">{firstReason}</div>
          )}
          {(tpeSummary || clearedBy) && (
            <span
              className="tabular min-w-0 truncate text-[11px] font-semibold text-[var(--tier-taxpayer)]"
              title={tpeSummary ? "Traded-player exception applied to this legal deal" : "Smallest salary-matching margin in the deal"}
            >
              {tpeSummary ?? clearedBy}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasFix && (
            <button
              onClick={() => setShowFix((v) => !v)}
              className="rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-ink)] hover:border-[var(--accent)]"
              aria-expanded={showFix}
            >
              Make it work {showFix ? "▾" : "▸"}
            </button>
          )}
          <button
            onClick={onShare}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-3 py-1.5 text-sm font-semibold text-[var(--text)] hover:border-[var(--text)]"
            title="Share this verdict as a card"
          >
            Share card
          </button>
          {legal && (
            <button
              onClick={onExecute}
              className="rounded-md px-3.5 py-1.5 text-sm font-semibold text-white hover:brightness-95"
              style={{ background: color }}
            >
              {executeLabel ?? "Execute trade"}
            </button>
          )}
        </div>
      </div>
      {triggers.length > 0 && (
        <div className="rule bg-[var(--panel-2)]/30 px-4 py-2.5">
          <MoveTriggers items={triggers} />
        </div>
      )}
      {showFix && explainer && (
        <div className="fade-up rule bg-[var(--panel-2)]/40 px-4 py-3">
          {explainer.subject.map((line, i) => (
            <p key={i} className="mb-2 max-w-3xl text-[12.5px] leading-relaxed text-[var(--text)]">
              {line}
            </p>
          ))}
          {explainer.fixes.length > 0 && (
            <>
              <div className="label mb-1.5 !text-[10px]">Routes to legal</div>
              <ul className="max-w-3xl space-y-1.5">
                {explainer.fixes.map((fix, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
                    <span className="shrink-0 font-bold text-[var(--accent-ink)]">{i + 1}.</span>
                    <span>{fix}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {valTeams.length >= 2 && (
        <div className="rule flex flex-wrap items-center gap-x-5 gap-y-1 bg-[var(--panel-2)]/50 px-4 py-2 text-xs">
          <Term k="trade_value" underline className="label">{fairLabel}</Term>
          {valTeams.map(([t, v]) => {
            const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
            const net = Math.round((v.in - v.out) * 10) / 10;
            const c = net > 0 ? "var(--tier-below_cap)" : net < 0 ? "var(--tier-second_apron)" : "var(--muted)";
            return (
              <span key={t} className="tabular text-[11.5px]">
                <span className="font-semibold">{t}</span>{" "}
                <span style={{ color: c }}>{net > 0 ? "+" : ""}{f1(net)}</span>
                <span className="text-[var(--muted)]"> · in {f1(v.in)} / out {f1(v.out)}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamColumn({
  teamId,
  board,
  lg,
  flourish = false,
  summary,
  sel,
  onTogglePlayer,
  onDest,
  picks,
  pickSel,
  onTogglePick,
  onPickDest,
  onSign,
  onExtend,
  onWaive,
  stagedSt,
}: {
  teamId: string;
  board: string[];
  lg: LG;
  /** Play the logo scene once — set when this team just joined the board. */
  flourish?: boolean;
  summary?: TeamTradeSummary;
  sel: Record<string, Sel>;
  onTogglePlayer: (id: string, from: string) => void;
  onDest: (id: string, to: string) => void;
  picks: { id: string; label: string; origin: string; year: number; round: 1 | 2 }[];
  pickSel: Record<string, Sel>;
  onTogglePick: (id: string, from: string) => void;
  onPickDest: (id: string, to: string) => void;
  onSign: (faId?: string, st?: boolean) => void;
  onExtend: (playerId: string, playerName: string) => void;
  onWaive: (playerId: string, playerName: string) => void;
  /** A staged sign-and-trade contract that belongs on THIS team's ledger. */
  stagedSt?: Contract | null;
}) {
  const meta = teamMeta(teamId);
  const committed = lg.teamSalary(teamId);
  const holds = lg.teamHolds(teamId);
  // Exceptions gate on APRON salary (signed money only); cap room still
  // burns through kept holds. Feed state carries how July actually went:
  // room teams lost their MLEs/BAE, and spent exceptions stay spent.
  const power = spendingPower(committed + holds, C, {
    apronSalary: committed,
    roomTeam: feedStateOf(teamId).roomTeam,
    consumed: consumedFor(lg.moves, teamId),
  });
  const baseRoster = lg.roster(teamId);
  // The staged S&T player sits on his old team's books like anyone else —
  // selectable, priced at the staged rate, wearing the S&T tag below.
  const roster =
    stagedSt && stagedSt.teamId === teamId && !baseRoster.some((c) => c.playerId === stagedSt.playerId)
      ? [...baseRoster, stagedSt]
      : baseRoster;
  const others = board.filter((t) => t !== teamId);
  const pre = summary?.preTradeSalary ?? committed;
  const post = summary?.postTradeSalary ?? pre;
  // Cap charge = actual salary + free-agent holds — the Team Salary basis for
  // cap room. Tier badges and the thermometer's solid bar use holds-excluded
  // salary (Apron Team Salary basis).
  const capCharge = committed + holds;
  const capRoom = C.salaryCap - capCharge;
  const ownFAs = lg
    .freeAgents()
    .filter((f) => f.priorTeam === teamId)
    .sort((a, b) => b.hold - a.hold);
  const deadRows = deadMoneyOf(lg.contracts, teamId);

  // MLE / exception consumption from this offseason's signings.
  const exceptionUsed: Partial<Record<MechanismId, number>> = {};
  for (const mv of lg.moves) {
    if (mv.kind === "sign" && mv.teamId === teamId && mv.mechanism) {
      exceptionUsed[mv.mechanism] = (exceptionUsed[mv.mechanism] ?? 0) + mv.salary;
    }
  }
  // A hard cap the team ALREADY carries (real July moves or session moves)
  // binds every tool — the same clamp the team page and the sign drawer
  // apply, so the chip can't advertise money the drawer would refuse.
  const liveHardCap = lg.hardCapOf(teamId);
  const line = (m: { maxSalary: number; hardCap: "first_apron" | "second_apron" | null }) =>
    Math.min(
      m.maxSalary,
      Number.isFinite(liveHardCap) ? Math.max(0, liveHardCap - committed) : Infinity,
      m.hardCap === "first_apron" ? Math.max(0, C.firstApron - committed) : m.hardCap === "second_apron" ? Math.max(0, C.secondApron - committed) : Infinity,
    );

  return (
    <div className="panel overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamLogo id={teamId} size={30} flourish={flourish} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">
              <Link href={`/team/${teamId}`} className="hover:underline decoration-[var(--border-strong)] underline-offset-2" title={`${meta.name} team page`}>
                {meta.name}
              </Link>
              {post < C.minTeamSalary && (
                <Term k="team_floor" extra={`${meta.name} sit ${fmtM(C.minTeamSalary - post)} below the ${fmtM(C.minTeamSalary)} floor.`}>
                  <span className="ml-1.5 rounded-[3px] px-1 py-px align-middle text-[8.5px] font-bold tracking-[0.05em]" style={{ color: "var(--tier-taxpayer)", background: "color-mix(in srgb, var(--tier-taxpayer) 14%, transparent)" }}>
                    BELOW FLOOR
                  </span>
                </Term>
              )}
            </div>
            <div className="tabular mt-0.5 text-xs text-[var(--muted)]">
              <Term k="committed_salary" extra={`${meta.name} have ${fmtFull(post)} in guaranteed 2026-27 salary.`}>
                <span className="total-rule">{fmtFull(post)}</span>
              </Term>
              {post !== pre && <span> ({post > pre ? "+" : ""}{fmtM(post - pre)})</span>}
              {holds > 0 && (
                <Term k="cap_hold" extra={`${fmtM(holds)} of free-agent holds currently count on this sheet.`}>
                  <span className="term-underline"> · +{fmtM(holds)} holds</span>
                </Term>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {/* Tier badge = APRON status: signed salary only, holds excluded. */}
          <Term k={classifyTier(post, C)}>
            <TierBadge tier={classifyTier(post, C)} />
          </Term>
          <Link
            href={`/team/${teamId}`}
            className="whitespace-nowrap rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
            title={`Open the ${meta.name} team page`}
          >
            Team view →
          </Link>
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* Solid = signed salary (the basis the Tax/1A/2A ticks actually
            judge, per Apron Team Salary §2(e)(1)(iv)); hatch = kept holds
            (cap room only, §4(a)(2)). Ghost marks post-trade salary on the
            same holds-excluded basis. */}
        <Thermometer
          salary={committed}
          holds={holds}
          ghost={summary && summary.postTradeSalary !== committed ? summary.postTradeSalary : undefined}
          c={C}
        />
      </div>

      {/* four-season commitments */}
      <div className="mx-4 mt-2.5 grid grid-cols-4 divide-x divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)]">
        {lg.multiYear(teamId).map((y) => {
          const pct = Math.max(4, Math.min(100, (y.salary / y.cap) * 100));
          const over = y.salary > y.cap;
          return (
            <Term
              key={y.year}
              k="committed_salary"
              extra={`${y.year}: ${fmtFull(y.salary)} committed across ${y.players} players (projected cap ${fmtM(y.cap)}).`}
              className="block bg-[var(--panel-2)]/40 px-1.5 py-1.5 text-center"
            >
              <div className="label !text-[9px]">’{y.year.slice(2)}</div>
              <div className="tabular text-[11px] font-semibold">{fmtM(y.salary)}</div>
              <div className="mx-auto mt-1 h-[3px] w-full overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-full" style={{ width: `${pct}%`, background: over ? "var(--tier-first_apron)" : "var(--border-strong)" }} />
              </div>
            </Term>
          );
        })}
      </div>

      {/* spending tools */}
      <div className="flex flex-wrap gap-1 px-4 pt-2.5">
        {power.mechanisms.map((m) => {
          const used = exceptionUsed[m.id] ?? 0;
          // m.maxSalary is ALREADY net of this session's exception use (spendingPower
          // subtracts `consumed`, which includes these signings). Don't subtract
          // `used` again — that double-counts and understates what's left. `used`
          // is kept only to annotate the tooltip.
          const remaining = Math.max(0, Math.min(m.maxSalary, line(m)));
          // The minimum is NOT a finite pool — any team can sign unlimited
          // minimums (roster spots are the only limit), so the amount shown is
          // just the largest single min contract. Never frame it as depleting.
          const depletes = used > 0 && m.id !== "minimum";
          return (
            <Term
              key={m.id}
              k={m.id}
              extra={depletes ? `${fmtM(used)} already used this offseason; ${fmtM(remaining)} left.` : undefined}
            >
              <span
                className="tabular inline-block rounded-[4px] border bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]"
                style={{ borderColor: depletes ? "var(--tier-taxpayer)" : "var(--border)" }}
              >
                {m.label} <span className="font-semibold text-[var(--text)]">{fmtM(remaining)}</span>
                {depletes ? " left" : ""}
              </span>
            </Term>
          );
        })}
        {(tpeLedger(lg.moves)[teamId] ?? []).slice(0, 2).map((tpe) => (
          <Term
            key={tpe.label + tpe.expires}
            k="tpe"
            extra={`${fmtM(tpe.amount)} absorbable · expires ${tpe.expires}${
              tpe.firstApronCap
                ? " · using it hard-caps at the first apron (row F)"
                : tpe.preExisting
                  ? " · arose this offseason — no first-apron hard cap until next season"
                  : " · minted this offseason"
            }`}
          >
            <span
              className="tabular inline-block rounded-[4px] border border-dashed bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]"
              style={{ borderColor: "var(--border-strong)" }}
            >
              {tpe.label} <span className="font-semibold text-[var(--text)]">{fmtM(tpe.amount)}</span>
            </span>
          </Term>
        ))}
      </div>

      <div className="px-4 pt-3">
        <button onClick={() => onSign()} className="w-full rounded-md border border-[var(--tier-below_cap)] px-2 py-1.5 text-xs font-semibold text-[var(--tier-below_cap)] hover:bg-[color-mix(in_srgb,var(--tier-below_cap)_10%,transparent)]">
          Sign a free agent
        </button>
      </div>

      {summary && (summary.outgoingSalary > 0 || summary.incomingSalary > 0) && (
        <div className="mx-4 mt-3 grid grid-cols-2 divide-x divide-[var(--border)] overflow-hidden rounded-md border border-[var(--border)] text-xs">
          <div className="bg-[var(--panel-2)]/40 px-2.5 py-1.5">
            <div className="label !text-[9px]">Sends out</div>
            <div className="tabular mt-0.5 font-semibold">{fmtM(summary.outgoingSalary)}</div>
          </div>
          <div className="bg-[var(--panel-2)]/40 px-2.5 py-1.5">
            <div className="label !text-[9px]">Takes back · max {fmtM(summary.maxIncomingAllowed)}</div>
            <div className="tabular mt-0.5 font-semibold">{fmtM(summary.incomingSalary)}</div>
          </div>
        </div>
      )}

      {/* roster */}
      <div className="mt-3 max-h-[300px] overflow-y-auto border-t border-[var(--border)]">
        {roster.map((c) => {
          const mv = sel[c.playerId];
          const out = !!mv;
          return (
            <div
              key={c.playerId}
              className="ledger-row flex items-center justify-between gap-2 border-b border-[var(--border)]/60 px-4 py-[7px] text-[13.5px] leading-none transition-colors"
              style={{ background: out ? "color-mix(in srgb, var(--tier-second_apron) 9%, transparent)" : undefined }}
            >
              <button onClick={() => onTogglePlayer(c.playerId, teamId)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[var(--accent-ink)]" disabled={others.length === 0}>
                <ImpactPill c={c} />
                <PosBadge playerId={c.playerId} />
                <span className="truncate">{c.playerName}</span>
                {c.restriction && (
                  <Term k="no_trade" extra={`${c.playerName} ${c.restriction}.`} className="shrink-0">
                    <span className="rounded-[3px] px-1 py-px text-[8.5px] font-bold tracking-[0.05em]" style={{ color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 12%, transparent)" }}>NO-TRADE</span>
                  </Term>
                )}
                {stagedSt && c.playerId === stagedSt.playerId && (
                  <span className="rounded-[3px] px-1 py-px text-[8.5px] font-bold tracking-[0.05em]" style={{ color: "var(--accent-ink)", background: "color-mix(in srgb, var(--accent) 14%, transparent)" }} title="Staged sign-and-trade — re-signs at this rate and must be dealt away">S&T</span>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {out && others.length > 1 ? (
                  <select value={mv.to} onChange={(e) => onDest(c.playerId, e.target.value)} className="rounded border border-[var(--border)] bg-[var(--panel)] px-1 py-0.5 text-[10px]">
                    {[...others].sort(byNickname).map((t) => <option key={t} value={t}>→ {t}</option>)}
                  </select>
                ) : (
                  out && <span className="tabular text-[10px] font-bold text-[var(--tier-second_apron)]">→ {mv.to}</span>
                )}
                {!out && currentSalary(c) > 0 && isExtensionEligible(c.playerName) && (
                  <button onClick={() => onExtend(c.playerId, c.playerName)} title="Extend this contract" className="rounded-[3px] border border-[var(--border)] px-1 py-px text-[8.5px] font-bold tracking-[0.05em] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]">
                    EXT
                  </button>
                )}
                {!out && currentSalary(c) > 0 && !(stagedSt && c.playerId === stagedSt.playerId) && (
                  <button onClick={() => onWaive(c.playerId, c.playerName)} title="Waive this player (creates dead money)" className="rounded-[3px] border border-[var(--border)] px-1 py-px text-[8.5px] font-bold tracking-[0.05em] text-[var(--muted)] hover:border-[var(--tier-second_apron)] hover:text-[var(--tier-second_apron)]">
                    WV
                  </button>
                )}
                <span className="tabular w-14 text-right text-xs text-[var(--muted)]">{currentSalary(c) > 0 ? fmtM(currentSalary(c)) : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {ownFAs.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <Term k="cap_hold" underline className="label">Free agents · holds</Term>
            <span className={`tabular text-[10px] font-semibold ${capRoom > 0 ? "text-[var(--tier-below_cap)]" : "text-[var(--muted)]"}`}>
              {ownFAs.length >= 3 && ownFAs.every((fa) => fa.renounced)
                ? "scorched earth"
                : capRoom > 0
                  ? `room ${fmtM(capRoom)}`
                  : `${fmtM(holds)} in holds`}
            </span>
          </div>
          <div className="max-h-[168px] space-y-px overflow-y-auto">
            {ownFAs.map((fa) => (
              <div key={fa.playerId} className="flex items-center justify-between gap-2 py-[3px] text-xs">
                <PosBadge playerId={fa.playerId} />
                <span className={`min-w-0 flex-1 truncate ${fa.renounced ? "text-[var(--muted)] line-through" : ""}`} title={`${fmtM(fa.lastSalary)} last salary`}>
                  {fa.playerName}
                </span>
                <span className="tabular shrink-0 text-[var(--muted)]">{fa.renounced ? "—" : fmtM(fa.hold)}</span>
                <button
                  onClick={() => onSign(fa.playerId)}
                  title={`Open the signing sheet for ${fa.playerName}`}
                  className="shrink-0 rounded-[4px] border border-[var(--tier-below_cap)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--tier-below_cap)] hover:bg-[color-mix(in_srgb,var(--tier-below_cap)_10%,transparent)]"
                >
                  Sign
                </button>
                {!fa.renounced && !fa.renouncedInWorld && (fa.birdStatus === "bird" || fa.birdStatus === "early_bird" || fa.birdStatus === "non_bird") && (
                  <button
                    onClick={() => onSign(fa.playerId, true)}
                    title={`Sign-and-trade ${fa.playerName} away — pick a destination, take a return package back`}
                    className="shrink-0 rounded-[4px] border border-[var(--accent)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--accent-ink)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                  >
                    S&T
                  </button>
                )}
                {fa.renouncedInWorld ? (
                  // The real July spent this hold — nothing to restore.
                  <Term k="committed_salary">
                    <span className="w-[68px] shrink-0 text-center text-[9px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]" title="Renounced in the real offseason — the team spent this room">
                      renounced
                    </span>
                  </Term>
                ) : (
                  <button
                    onClick={() => toggleRenounce(fa.playerId, fa.playerName, teamId)}
                    className={`w-[68px] shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.05em] ${fa.renounced ? "border-[var(--tier-below_cap)] text-[var(--tier-below_cap)] hover:bg-[color-mix(in_srgb,var(--tier-below_cap)_10%,transparent)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"}`}
                  >
                    {fa.renounced ? "Restore" : "Renounce"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {deadRows.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-2.5">
          <div className="mb-1 flex items-center justify-between">
            <Term k="dead_money" underline className="label">Dead money</Term>
            <span className="tabular text-[10px] font-semibold text-[var(--muted)]">
              {fmtM(deadRows.reduce((sum, c) => sum + currentSalary(c), 0))} on the books
            </span>
          </div>
          {deadRows.map((c) => (
            <div key={c.playerId} className="flex items-center justify-between py-[3px] text-xs text-[var(--muted)]">
              <span className="truncate italic">{c.playerName}</span>
              <span className="tabular shrink-0">{fmtM(currentSalary(c))}</span>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-2.5 pb-3">
          <div className="mb-1.5"><Term k="picks" underline className="label">Draft picks owned</Term></div>
          <div className="flex flex-wrap gap-1">
            {picks.map((p) => {
              const mv = pickSel[p.id];
              const out = !!mv;
              return (
                <span key={p.id} className="inline-flex items-center">
                  <button
                    onClick={() => onTogglePick(p.id, teamId)}
                    title={`est. trade value ${pickValue(p.year, p.round, p.origin)} — origin ${teamMeta(p.origin).name}`}
                    className="tabular rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium"
                    style={out
                      ? { borderColor: "var(--tier-second_apron)", color: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 9%, transparent)" }
                      : { borderColor: "var(--border)", color: p.origin === teamId ? "var(--muted)" : "var(--accent-ink)", background: "var(--panel)" }}
                  >
                    {p.label}{out && others.length <= 1 ? ` → ${mv.to}` : ""}
                  </button>
                  {out && others.length > 1 && (
                    <select
                      value={mv.to}
                      onChange={(e) => onPickDest(p.id, e.target.value)}
                      className="ml-0.5 rounded-[4px] border border-[var(--tier-second_apron)] bg-[var(--panel)] py-0.5 text-[10px] font-semibold text-[var(--tier-second_apron)]"
                      title="Send this pick to…"
                    >
                      {[...others].sort(byNickname).map((t) => <option key={t} value={t}>→ {t}</option>)}
                    </select>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// True if this FA is the team's own free agent whose hold is still counted
// (i.e. not renounced) — the case where Bird rights apply.
const isOwnKept = (fa: FreeAgent, team: string) =>
  fa.priorTeam === team && !fa.renounced;

function SignDrawer({ team, initialId, initialSt, lg, onClose, onStageSt }: { team: string; initialId?: string; initialSt?: boolean; lg: LG; onClose: () => void; onStageSt: (st: StStage) => void }) {
  const committed = lg.teamSalary(team);
  const holds = lg.teamHolds(team);
  const fas = lg.freeAgents();
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"fit" | "impact" | "salary" | "name">("fit");
  const [posFilter, setPosFilter] = useState<string>("");
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [selected, setSelected] = useState<FreeAgent | null>(
    () => (initialId ? fas.find((f) => f.playerId === initialId) ?? null : null),
  );
  // Signing base = committed + kept holds; re-signing your own FA converts HIS
  // hold to salary, so it drops out of the base for that player.
  const signBaseFor = (fa: FreeAgent) =>
    committed + holds - (isOwnKept(fa, team) ? fa.hold : 0);

  const byId = useMemo(() => new Map(lg.contracts.map((c) => [c.playerId, c] as const)), [lg]);
  const rows = useMemo(() => {
    // A hard cap already triggered (this session, or by the team's real July
    // moves) binds EVERY later signing — even a Bird re-sign or a minimum,
    // which carry no hard cap of their own. validateSigning only tests each
    // mechanism's own hard cap, not the team's already-binding one, so fold it
    // in here exactly as the signing panel does — otherwise the list marks
    // signings legal/affordable that the panel then blocks. hardCapOf is
    // Infinity when the team has no cap, so uncapped teams are unaffected.
    const hc = lg.hardCapOf(team);
    return fas.map((fa) => {
      const isOwn = isOwnKept(fa, team);
      const v = validateSigning(signBaseFor(fa), fa.lastSalary, C, { isOwnFreeAgent: isOwn, yearsOfService: fa.yearsOfService, priorSalary: fa.lastSalary, birdStatus: isOwn ? fa.birdStatus : undefined, apronSalary: committed, roomTeam: feedStateOf(team).roomTeam, consumed: consumedFor(lg.moves, team) });
      const legal = v.legal && committed + fa.lastSalary <= hc + 1;
      const maxOffer = Math.min(v.maxOffer, Math.max(0, hc - committed));
      return { fa, v, legal, maxOffer, isOwn, pos: positionOf(fa.playerId), impact: faImpact(fa, byId), age: ageOf(fa.playerId) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fas, team, committed, holds, byId, lg.moves]);
  const rowOf = (id: string) => rows.find((r) => r.fa.playerId === id);
  const suggestions = useMemo(() => {
    const legal = new Map(rows.map((r) => [r.fa.playerId, r.legal] as const));
    return suggestSignings(team, lg.contracts, fas, (fa) => !!legal.get(fa.playerId), 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, team, fas]);

  const visible = rows
    .filter((r) => !q || r.fa.playerName.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => !posFilter || r.pos === posFilter)
    .filter((r) => !affordableOnly || r.legal)
    .sort((a, b) => {
      if (sortBy === "impact") return b.impact - a.impact;
      if (sortBy === "salary") return b.fa.lastSalary - a.fa.lastSalary;
      if (sortBy === "name") return a.fa.playerName.localeCompare(b.fa.playerName);
      return Number(b.legal) - Number(a.legal) || b.impact - a.impact; // fit: signable first, then impact
    });

  const FaRow = (r: (typeof rows)[number], reason?: string) => {
    const { fa, v, legal, maxOffer, isOwn, pos, age } = r;
    const color = mechColor(legal && v.mechanism ? v.mechanism.id : null);
    const label = legal ? v.mechanism!.label : `max ${fmtM(maxOffer)}`;
    return (
      <button key={fa.playerId + (reason ? "-s" : "")} onClick={() => setSelected(fa)} className="mb-1 flex w-full items-center justify-between gap-2 rounded-md bg-[var(--panel-2)] px-2.5 py-2 text-left text-sm hover:brightness-125" title="Set the salary and term">
        <span className="flex min-w-0 items-center gap-1.5">
          <ImpactPill c={byId.get(fa.playerId)} />
          {pos && <PosBadge playerId={fa.playerId} />}
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="truncate">{fa.playerName}</span>
              {isOwn && <Term k={fa.birdStatus === "early_bird" || fa.birdStatus === "non_bird" ? fa.birdStatus : "bird"}><span className="text-[9px] font-bold text-[var(--tier-below_cap)]">OWN·{BIRD_LABEL[fa.birdStatus] ?? "BIRD"}</span></Term>}
              {fa.faType === "RFA" && <Term k="rfa"><span className="text-[9px] font-bold text-[var(--tier-taxpayer)]">RFA</span></Term>}
            </span>
            <span className="tabular text-[10px] text-[var(--muted)]">{age}y · asking {fmtM(fa.lastSalary)}{reason ? ` · ${reason}` : ""}</span>
          </span>
        </span>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color, borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
          {label}
        </span>
      </button>
    );
  };

  const chip = (val: string, txt: string) => (
    <button key={val || "all"} onClick={() => setPosFilter(val)} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${posFilter === val ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"}`}>{txt}</button>
  );

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-[-8px_0_24px_rgba(33,29,19,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          <TeamLogo id={team} size={24} />
          <div className="text-sm font-semibold">Sign a free agent — {teamMeta(team).name}</div>
        </div>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
      </div>

      {selected ? (
        <SignEditor
          initialSt={initialSt}
          onStageSt={onStageSt}
          fa={selected}
          team={team}
          committed={committed}
          holds={holds}
          lg={lg}
          onBack={() => setSelected(null)}
          onDone={onClose}
        />
      ) : (
        <>
          <div className="space-y-2 border-b border-[var(--border)] px-3 py-2.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search free agents…" className="w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm" />
            <div className="flex flex-wrap items-center gap-1.5">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1.5 py-1 text-[11px] font-semibold" title="Sort free agents">
                <option value="fit">Sort: Best fit</option>
                <option value="impact">Sort: Impact</option>
                <option value="salary">Sort: Asking $</option>
                <option value="name">Sort: Name</option>
              </select>
              <span className="flex items-center gap-1">{chip("", "All")}{SIGN_POSITIONS.map((p) => chip(p, p))}</span>
              <label className="ml-auto flex cursor-pointer items-center gap-1 text-[10px] font-semibold text-[var(--muted)]">
                <input type="checkbox" checked={affordableOnly} onChange={(e) => setAffordableOnly(e.target.checked)} className="accent-[var(--accent-ink)]" />
                Can sign
              </label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
            {suggestions.length > 0 && !q && !posFilter && !affordableOnly && (
              <div className="mb-3">
                <div className="label mb-1 !text-[9.5px]">Suggested for {teamMeta(team).name} <span className="font-normal text-[var(--muted)]">· fills a need, signable now</span></div>
                {suggestions.map((s) => { const r = rowOf(s.fa.playerId); return r ? FaRow(r, s.reason) : null; })}
              </div>
            )}
            {(suggestions.length > 0 && !q && !posFilter && !affordableOnly) && <div className="label mb-1 !text-[9.5px]">All free agents</div>}
            {visible.length === 0 && (
              <div className="px-3 py-8 text-center text-xs leading-relaxed text-[var(--muted)]">
                No free agent matches. Try clearing the filters.
              </div>
            )}
            {visible.map((r) => FaRow(r))}
          </div>
        </>
      )}
    </div>
  );
}

const YEAR_STR = C.leagueYear;
const YEAR0 = Number(String(C.leagueYear).slice(0, 4));
const seasonLabel = (k: number) =>
  `${YEAR0 + k}-${String((YEAR0 + 1 + k) % 100).padStart(2, "0")}`;
const round100k = (n: number) => Math.round(n / 100_000) * 100_000;

/** Salary + term editor for one free agent, with live CBA validation. */
function SignEditor({
  fa,
  team,
  committed,
  holds,
  lg,
  onBack,
  onDone,
  onStageSt,
  initialSt,
}: {
  fa: FreeAgent;
  team: string;
  committed: number;
  holds: number;
  lg: LG;
  onBack: () => void;
  onDone: () => void;
  onStageSt: (st: StStage) => void;
  /** Open straight into sign-and-trade mode (the holds-row S&T button). */
  initialSt?: boolean;
}) {
  // Bird rights apply only to your own FA whose hold you've kept. Re-signing him
  // converts HIS hold to salary, so it drops out of the signing base.
  const isOwn = isOwnKept(fa, team);
  const base = committed + holds - (isOwn ? fa.hold : 0);
  // Apron status is signed salary ONLY — kept holds consume cap room but never
  // make a team a tax/apron team (Art. VII §2 excludes Free Agent Amounts).
  const apronBase = committed;
  const opts = {
    isOwnFreeAgent: isOwn,
    yearsOfService: fa.yearsOfService,
    priorSalary: fa.lastSalary,
    birdStatus: isOwn ? fa.birdStatus : undefined,
    apronSalary: apronBase,
    roomTeam: feedStateOf(team).roomTeam,
    consumed: consumedFor(lg.moves, team),
  };
  const ceilingRaw = validateSigning(base, fa.lastSalary, C, opts).maxOffer;
  const minYos = Math.min(Math.max(Math.floor(fa.yearsOfService), 0), 10);
  const floor = C.minimumSalaries[minYos] ?? C.minimumSalaries[10] ?? 1_000_000;
  // Exact bounds — the minimum/max aren't round numbers, so rounding them would
  // push past the true limit and read as illegal. The slider just steps by 100k.
  // A restricted FA with 1-2 years of service is a Gilbert Arenas case: the
  // offer sheet's first year is capped at the Non-Taxpayer MLE.
  const isArenasRfa = fa.faType === "RFA" && !isOwn && fa.yearsOfService <= 2;
  const ceiling = isArenasRfa
    ? Math.min(Math.max(ceilingRaw, floor), Math.max(C.nonTaxpayerMLE, floor))
    : Math.max(ceilingRaw, floor);
  // Only a FULL Bird re-signing can go 5 years; Early-Bird, Non-Bird, and every
  // outside/exception signing max out at 4.
  const maxYears = isOwn && fa.birdStatus === "bird" ? 5 : 4;

  // Preset amounts for each mechanism the team can actually use (cap space,
  // MLEs, BAE, Bird), plus Min and Max — each clamped to what's legal here.
  const apronOf = (hc: "first_apron" | "second_apron" | null) =>
    hc === "first_apron" ? C.firstApron : hc === "second_apron" ? C.secondApron : Infinity;
  const presets = (() => {
    const out: { label: string; amt: number }[] = [{ label: "Min", amt: floor }];
    for (const m of spendingPower(base, C, opts).mechanisms) {
      if (m.id === "minimum") continue;
      const amt = Math.max(floor, Math.min(m.maxSalary, ceiling, apronOf(m.hardCap) - apronBase));
      out.push({ label: MECH_SHORT[m.id] ?? m.label, amt });
    }
    out.push({ label: "Max", amt: ceiling });
    const seen = new Set<number>();
    return out
      .map((p) => ({ ...p, amt: Math.round(p.amt) }))
      .filter((p) => {
        const k = Math.round(p.amt / 100_000);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.amt - b.amt);
  })();

  const initialSalary = Math.max(floor, Math.min(round100k(fa.lastSalary), ceiling));
  const [salary, setSalary] = useState<number>(initialSalary);
  // A vet-minimum signing defaults to a ONE-year term: it's the common veteran-
  // minimum structure AND the only term that earns the 2-YOS cap reimbursement
  // (§3(f)), so the default reflects the discount instead of hiding it behind a
  // multi-year term. Non-minimum signings still default to three years.
  const [years, setYears] = useState<number>(
    deemedMinSalary(fa.playerId, initialSalary, 1) !== initialSalary ? 1 : Math.min(3, maxYears),
  );

  const v = validateSigning(base, salary, C, opts);
  // Each exception caps contract length (Art. VII): the Room MLE at 3, the Taxpayer MLE,
  // the Bi-Annual and the minimum at 2, etc. Don't let the term picker offer
  // more years than the mechanism actually covering this salary allows, and
  // pull the selected term down if a salary change swaps to a shorter-max tool.
  const mechMaxYears = Math.min(maxYears, v.mechanism?.maxSeasons ?? maxYears);
  useEffect(() => {
    setYears((y) => Math.min(y, mechMaxYears));
  }, [mechMaxYears]);
  // 8% raises only for a Bird / Early-Bird own-FA re-sign; Non-Bird and every
  // exception/cap-room signing get 5%.
  const raise = isOwn && (fa.birdStatus === "bird" || fa.birdStatus === "early_bird") ? 0.08 : 0.05;
  const rows = Array.from({ length: years }, (_, k) => Math.round(salary * (1 + raise * k)));
  const total = rows.reduce((a, b) => a + b, 0);
  // A 3+ YOS vet on a ONE-year minimum counts at the 2-YOS minimum (Art. VII
  // §3(f)) — the booked charge diverges from the paycheck.
  const bookedSalary =
    years === 1 ? deemedMinSalary(fa.playerId, salary, 1, v.mechanism?.id ?? "unspecified") : salary;
  const isDeemedMin = bookedSalary !== salary;
  // A 3+ YOS vet minimum that would deem at one year but is signed for MORE than
  // one — the reimbursement doesn't apply, so it counts in full. Flag it so the
  // missing discount isn't a surprise (the common point of confusion).
  const isMultiYearVetMin =
    years > 1 && deemedMinSalary(fa.playerId, salary, 1, v.mechanism?.id ?? "unspecified") !== salary;
  // Post-signing cap charge = base (committed + other kept holds) + new salary.
  const afterCharge = base + bookedSalary;
  // Post-signing APRON salary — the number tiers and hard caps actually test.
  const apronAfter = apronBase + bookedSalary;
  const afterTier = classifyTier(apronAfter, C);
  // A hard cap triggered earlier this session binds every later move — even a
  // Bird re-sign or a minimum. Hard caps test apron salary, holds excluded.
  const hardCap = lg.hardCapOf(team);
  const exceedsHardCap = apronAfter > hardCap + 1;
  // Roster limit: 21 in the offseason (hard), 15 by opening night (warn).
  const rosterCount = lg.roster(team).length;
  const rosterFull = rosterCount >= 21;
  const legalSign = v.legal && !exceedsHardCap && !rosterFull;

  // Sign-and-trade — staged onto the BOARD. The drawer only sets the
  // re-sign terms; the deal itself (destination, return package, picks,
  // extra teams) is built on the board like any trade, judged by the same
  // docket with the S&T rules layered in.
  const [stMode, setStMode] = useState(!!initialSt);
  useEffect(() => {
    if (initialSt) setYears((y) => Math.max(3, y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Any veteran free agent can be signed-and-traded (CBA Art. VII §8(e)) — not
  // only Bird/Early-Bird. A Non-Bird re-sign (up to 120% of prior) is a valid
  // S&T leg; the engine handles the 5% raises and the ceiling already.
  const stEligibleRights =
    fa.birdStatus === "bird" || fa.birdStatus === "early_bird" || fa.birdStatus === "non_bird";
  const canOfferSt = stEligibleRights && (isOwn || !v.legal);
  // The S&T salary is bounded by what the SENDER could re-sign him for with
  // his actual rights — the re-sign leg happens on the old team's books.
  const sendCommitted = lg.teamSalary(fa.priorTeam);
  const sendHolds = Math.max(0, lg.teamHolds(fa.priorTeam) - (isOwnKept(fa, fa.priorTeam) ? fa.hold : 0));
  const stCeiling = Math.max(
    floor,
    validateSigning(sendCommitted + sendHolds, fa.lastSalary, C, {
      isOwnFreeAgent: true,
      yearsOfService: fa.yearsOfService,
      priorSalary: fa.lastSalary,
      birdStatus: fa.birdStatus,
      apronSalary: sendCommitted,
      roomTeam: feedStateOf(fa.priorTeam).roomTeam,
      consumed: consumedFor(lg.moves, fa.priorTeam),
    }).maxOffer,
  );
  // Base-year compensation (Art. VII §8(d)): an over-cap re-sign at a >20%
  // raise makes him a base-year player for the trade leg.
  const stByc =
    (fa.birdStatus === "bird" || fa.birdStatus === "early_bird") &&
    salary > fa.lastSalary * 1.2 &&
    sendCommitted + salary > C.salaryCap;
  const stSalaryOk = salary <= stCeiling + 1;
  const stageSt = () => {
    if (!stSalaryOk) return;
    onStageSt({
      playerId: fa.playerId,
      playerName: fa.playerName,
      fromTeam: fa.priorTeam,
      salary,
      years: Math.max(3, years),
      birdStatus: fa.birdStatus === "none" ? undefined : fa.birdStatus,
      priorSalary: fa.lastSalary,
      hold: fa.hold,
      byc: stByc,
      ceiling: stCeiling,
    });
  };

  const sign = () => {
    dispatchMove({
      kind: "sign",
      label: `Sign: ${fa.playerName} → ${team} (${fmtM(salary)}${years > 1 ? ` × ${years}y` : ""})`,
      playerId: fa.playerId,
      playerName: fa.playerName,
      teamId: team,
      salary,
      years,
      mechanism: v.mechanism?.id,
    });
    heatCultureEgg(team, v.mechanism?.id);
    onDone();
  };
  // Restricted FA: the original team may MATCH the offer sheet — the player
  // stays with them at these exact terms (and is trade-frozen).
  const matchOfferSheet = () => {
    dispatchMove({
      kind: "sign",
      label: `Matched offer sheet: ${fa.playerName} stays ${fa.priorTeam} (${fmtM(salary)}${years > 1 ? ` × ${years}y` : ""})`,
      playerId: fa.playerId,
      playerName: fa.playerName,
      teamId: fa.priorTeam,
      salary,
      years,
      mechanism: "bird", // matching uses the incumbent's rights, regardless of cap
      // Art. XI §5(j): a matched RFA can't be traded for one year (and never
      // to the offering team).
      restrictionText: "matched offer sheet (not trade-eligible for one year)",
    });
    onDone();
  };

  const mColor = mechColor(v.mechanism ? v.mechanism.id : null);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <button onClick={onBack} className="mb-3 self-start text-xs text-[var(--muted)] hover:text-[var(--text)]">← All free agents</button>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{fa.playerName}</span>
        {isOwn && (
          <Term k={fa.birdStatus === "early_bird" || fa.birdStatus === "non_bird" ? fa.birdStatus : "bird"}>
            <span className="rounded bg-[color-mix(in_srgb,var(--tier-below_cap)_20%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--tier-below_cap)]">OWN · {BIRD_LABEL[fa.birdStatus]}</span>
          </Term>
        )}
        {fa.faType === "RFA" && (
          <Term k="rfa">
            <span className="rounded bg-[color-mix(in_srgb,var(--tier-taxpayer)_20%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--tier-taxpayer)]">RFA</span>
          </Term>
        )}
      </div>
      <div className="mb-4 text-xs text-[var(--muted)]">
        <Term k="yos" underline extra={`${fa.playerName}: ${fa.yearsOfService} years of service.`}>{fa.yearsOfService} yrs service</Term>
        {" "}· last salary {fmtM(fa.lastSalary)} · {fa.priorTeam === team ? BIRD_LABEL[fa.birdStatus].toLowerCase() : `from ${teamMeta(fa.priorTeam).name}`}
      </div>

      {/* Salary picker */}
      <label className="mb-1 flex items-baseline justify-between text-xs text-[var(--muted)]">
        <Term k="raises" underline>First-year salary</Term>
        <Term k="max_salary" underline extra={`the largest legal first-year offer here is ${fmtM(ceiling)}.`}>
          <span className="tabular text-[10px]">max {fmtM(ceiling)}</span>
        </Term>
      </label>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[var(--muted)]">$</span>
        <input
          type="number"
          value={Math.round(salary)}
          step={100_000}
          min={floor}
          onChange={(e) => setSalary(Number(e.target.value) || 0)}
          className="tabular w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm"
        />
      </div>
      <input
        type="range"
        min={floor}
        max={Math.max(ceiling, floor + 100_000)}
        step={100_000}
        value={Math.min(Math.max(salary, floor), ceiling)}
        onChange={(e) => setSalary(Number(e.target.value))}
        className="mb-1 w-full accent-[var(--accent)]"
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {presets.map((p) => {
          const active = Math.round(salary / 100_000) === Math.round(p.amt / 100_000);
          return (
            <button
              key={p.label}
              onClick={() => setSalary(p.amt)}
              className={`rounded border px-2 py-0.5 text-[10px] hover:brightness-150 ${active ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
            >
              {p.label} {fmtM(p.amt)}
            </button>
          );
        })}
      </div>

      {/* Term picker */}
      <label className="mb-1 block text-xs text-[var(--muted)]">Contract length</label>
      <div className="mb-4 flex gap-1">
        {Array.from({ length: mechMaxYears }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => setYears(n)}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${years === n ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)] hover:brightness-150"}`}
          >
            {n}yr
          </button>
        ))}
      </div>

      {/* Year-by-year breakdown */}
      <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-2 text-xs">
        {rows.map((s, k) => (
          <div key={k} className="flex justify-between py-0.5">
            <span className="text-[var(--muted)]">{seasonLabel(k)}</span>
            <span className="tabular">{fmtFull(s)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
          <span>Total ({years}yr)</span>
          <span className="tabular">{fmtFull(total)}</span>
        </div>
      </div>

      {/* Live legality readout */}
      <div className="mb-4 rounded-md border p-3 text-xs" style={{ borderColor: v.legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)", background: `color-mix(in srgb, ${v.legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)"} 8%, transparent)` }}>
        <div className="mb-1 flex items-center justify-between">
          {v.legal ? (
            <Term k={v.mechanism!.id} underline>
              <span className="font-semibold" style={{ color: "var(--tier-below_cap)" }}>
                Legal — {v.mechanism!.label}
              </span>
            </Term>
          ) : (
            <span className="font-semibold" style={{ color: "var(--tier-second_apron)" }}>Blocked</span>
          )}
          {v.legal && Math.floor(ceiling) - 50_000 > floor && Math.round(salary) >= Math.floor(ceiling) - 50_000 && (
            <Term k="max_salary" extra={`${fa.playerName}'s ceiling here is ${fmtM(ceiling)}.`}>
              <span className="rounded-full border border-[var(--accent)] px-2 py-0.5 text-[9px] font-bold text-[var(--accent-ink)]">THE MAX</span>
            </Term>
          )}
          {v.legal && v.hardCap && (
            <Term k="hard_cap" extra={`this signing hard-caps ${teamMeta(team).name} at the ${v.hardCap === "first_apron" ? "first" : "second"} apron for the season.`}>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ color: mColor, border: `1px solid ${mColor}` }}>
                hard-caps at {v.hardCap === "first_apron" ? "1st apron" : "2nd apron"}
              </span>
            </Term>
          )}
        </div>
        <div className="text-[var(--muted)]">{v.reason}</div>
        <div className="mt-1 text-[var(--muted)]">
          Team after: <span className="tabular text-[var(--text)]">{fmtM(afterCharge)}</span> ·{" "}
          <Term k={afterTier} underline>{afterTier.replace("_", " ")}</Term>
          {afterCharge !== apronAfter && (
            <>
              {" "}· apron <span className="tabular text-[var(--text)]">{fmtM(apronAfter)}</span>{" "}
              <span className="text-[10px]">(FA holds count on the cap &amp; tax line, not the apron — the tier and any hard cap test the apron number)</span>
            </>
          )}
        </div>
        {v.legal && (() => {
          const id = v.mechanism!.id;
          const text =
            v.hardCap === "first_apron"
              ? `Heads up: signing with the ${v.mechanism!.label} hard-caps ${teamMeta(team).name} at the first apron (${fmtM(C.firstApron)}) for the rest of the season — you won't be able to cross it in any move.`
              : v.hardCap === "second_apron"
                ? `Heads up: using the Taxpayer MLE hard-caps ${teamMeta(team).name} at the second apron (${fmtM(C.secondApron)}) for the rest of the season.`
                : id === "cap_room"
                  ? `Heads up: spending cap room makes ${teamMeta(team).name} a room team — it forfeits the Non-Tax MLE and Bi-Annual Exception for the year (only the Room MLE remains).`
                  : id === "room_mle" || id === "minimum"
                    ? `No apron consequence — the ${v.mechanism!.label} is one of the few tools that triggers no hard cap.`
                    : null;
          return text ? (
            <div
              className="mt-2 rounded-md border px-2.5 py-1.5 text-[11.5px] leading-snug"
              style={{ borderColor: `${v.hardCap ? "var(--tier-second_apron)" : "var(--border-strong)"}`, background: v.hardCap ? "color-mix(in srgb, var(--tier-second_apron) 8%, transparent)" : "var(--panel-2)" }}
            >
              {v.hardCap && <span className="mr-1 font-bold text-[var(--tier-second_apron)]">⚠</span>}
              {text}
            </div>
          ) : null;
        })()}
        {isDeemedMin && (
          <div className="mt-1 text-[var(--tier-below_cap)]">
            One-year vet minimum: he&rsquo;s paid {fmtM(salary)}, but with 3+ years of
            service he counts only <span className="tabular">{fmtM(bookedSalary)}</span> against the cap, tax,
            and aprons — the league reimburses the difference (Art. VII §3(f)).
          </div>
        )}
        {isMultiYearVetMin && (
          <div className="mt-1 text-[var(--muted)]">
            Multi-year minimum — counts in full ({fmtM(salary)}); the 2-YOS reimbursement (Art. VII §3(f))
            applies only to one-year deals. Drop it to a 1-year term to get the reduced cap charge.
          </div>
        )}
        {exceedsHardCap && (
          <div className="mt-1 font-semibold text-[var(--tier-second_apron)]">
            {teamMeta(team).name} is hard-capped at {hardCap === C.firstApron ? "the first apron" : "the second apron"} ({fmtM(hardCap)}) {hardCapDetailFor(team, lg.hardCapOf(team))?.source === "real" ? `all season by its real July moves${hardCapDetailFor(team, lg.hardCapOf(team))?.label ? ` (${hardCapDetailFor(team, lg.hardCapOf(team))!.label})` : ""}` : "from a move you made this offseason"} — this would put their apron salary at {fmtM(apronAfter)}.
          </div>
        )}
        {fa.faType === "RFA" && !isOwn && (
          <div className="mt-1 text-[var(--tier-taxpayer)]">
            Restricted FA — {teamMeta(fa.priorTeam).name} can match this offer sheet
            {isArenasRfa ? "; 1–2 yr Arenas cap applies (year 1 ≤ NT-MLE)" : ""}.
          </div>
        )}
        {feedStateOf(team).roomTeam && (
          <div className="mt-1 text-[var(--muted)]">
            Room team: {teamMeta(team).name} used cap space in July, so its Non-Tax MLE and Bi-Annual are dead for the year (Art. VII §6(n)(1)) — only the Room MLE and minimums remain, even well over the cap.
          </div>
        )}
        {rosterFull && (
          <div className="mt-1 font-semibold text-[var(--tier-second_apron)]">
            Roster is at the 21-player offseason limit.
          </div>
        )}
        {!rosterFull && rosterCount >= 15 && (
          <div className="mt-1 text-[var(--tier-taxpayer)]">
            Roster at {rosterCount} — must be down to 15 (plus two-ways) by opening night.
          </div>
        )}
      </div>

      {/* Sign-and-trade: set the terms here, build the deal on the board */}
      {stMode && (
        <div className="mb-4 rounded-md border border-[var(--accent)] p-3 text-xs">
          <div className="mb-2 font-semibold text-[var(--accent)]">
            Sign &amp; trade {fa.playerName} away
            <span className="ml-2 font-normal text-[var(--muted)]">({Math.max(3, years)}yr — S&amp;T contracts must run 3+ seasons)</span>
          </div>
          {!stSalaryOk && (
            <div className="mb-2 font-semibold text-[var(--tier-second_apron)]">
              {teamMeta(fa.priorTeam).name} can re-sign him for at most {fmtM(stCeiling)} with his {BIRD_LABEL[fa.birdStatus] ?? "Bird"} rights — lower the salary.
            </div>
          )}
          {stByc && (
            <div className="mb-2 text-[var(--tier-taxpayer)]">
              Base-year comp (Art. VII §8(d)): over-cap re-sign at a &gt;20% raise — his outgoing value for {teamMeta(fa.priorTeam).name}&rsquo;s matching will be {fmtM(Math.max(salary * 0.5, Math.min(salary, fa.lastSalary)))}, not {fmtM(salary)}.
            </div>
          )}
          <div className="text-[var(--muted)]">
            Staging puts his new contract on {teamMeta(fa.priorTeam).name}&rsquo;s ledger at this rate and drops him onto the trade board with an S&amp;T tag. Build the deal there — any destination, return players, picks, extra teams — and the docket judges it as a sign-and-trade (acquirer hard-capped at the first apron, second-apron teams barred).
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {stMode ? (
          <>
            <button onClick={() => setStMode(false)} className="rounded-md border border-[var(--border)] px-3 py-2.5 text-sm font-semibold text-[var(--muted)]">
              Cancel
            </button>
            <button
              onClick={stageSt}
              disabled={!stSalaryOk}
              className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Stage on the board →
            </button>
          </>
        ) : (
          <>
            <button
              onClick={sign}
              disabled={!legalSign}
              className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {fa.faType === "RFA" && !isOwn ? "Offer sheet — they decline" : `Sign ${fmtM(salary)}${years > 1 ? ` × ${years}yr` : ""}`}
            </button>
            {fa.faType === "RFA" && !isOwn && (
              <button
                onClick={matchOfferSheet}
                disabled={!legalSign}
                title={`${teamMeta(fa.priorTeam).name} match the offer sheet — ${fa.playerName} stays at these exact terms`}
                className="rounded-md border border-[var(--tier-taxpayer)] px-3 py-2.5 text-sm font-bold text-[var(--tier-taxpayer)] hover:bg-[var(--tier-taxpayer)] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                {fa.priorTeam} match
              </button>
            )}
            {canOfferSt && (
              <button onClick={() => { setStMode(true); setYears((y) => Math.max(3, y)); }} className="rounded-md border border-[var(--accent)] px-3 py-2.5 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--accent)] hover:text-white">
                {isOwn ? "Sign & trade away" : "Sign & Trade"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Extend a rostered player's contract (veteran extension — 140% rule). */
function ExtendDrawer({
  playerId,
  playerName,
  team,
  lg,
  onClose,
}: {
  playerId: string;
  playerName: string;
  team: string;
  lg: LG;
  onClose: () => void;
}) {
  const contract = lg.contracts.find((c) => c.playerId === playerId);
  const current = contract ? currentSalary(contract) : 0;
  const yos = experienceOf(playerId);
  // Existing years from the active season forward, and the FINAL-year salary —
  // the veteran-extension 140% ceiling is computed off the last year of the
  // current deal, not the current year.
  const remainingYearRows = contract
    ? [...contract.years]
        .filter((y) => y.leagueYear >= YEAR_STR)
        .sort((a, b) => a.leagueYear.localeCompare(b.leagueYear))
    : [];
  const remainingYears = remainingYearRows.length;
  const finalYearSalary = remainingYears
    ? remainingYearRows[remainingYears - 1]!.salary
    : current;
  const extMax = veteranExtensionMax(finalYearSalary, yos, C);
  const minYos = Math.min(Math.max(Math.floor(yos), 0), 10);
  const floor = C.minimumSalaries[minYos] ?? 1_000_000;
  const ceiling = Math.max(extMax, floor);
  // Total contract (remaining + extension) can't exceed the CBA's 5-year max.
  const maxExtYears = Math.max(1, Math.min(4, 5 - remainingYears));
  // Extension years start the season after the current contract's last year.
  const lastYear = contract
    ? contract.years.reduce((mx, y) => (y.leagueYear > mx ? y.leagueYear : mx), YEAR_STR)
    : YEAR_STR;
  const startYr = Number(lastYear.slice(0, 4)) + 1;
  const extSeason = (k: number) =>
    `${startYr + k}-${String((startYr + 1 + k) % 100).padStart(2, "0")}`;

  const [salary, setSalary] = useState<number>(
    Math.max(floor, Math.min(round100k(finalYearSalary), ceiling)),
  );
  const [years, setYears] = useState<number>(Math.min(3, maxExtYears));
  const clamped = Math.max(floor, Math.min(salary, ceiling));
  const rows = Array.from({ length: years }, (_, k) => Math.round(clamped * (1 + 0.08 * k)));
  const total = rows.reduce((a, b) => a + b, 0);
  // §8(f)(i): a freshly-extended player is trade-frozen for 6 months only if the
  // extension EXCEEDS extend-and-trade limits — 5+ covered seasons, or a first-
  // year salary above 120% of the final existing year (or of the estimated
  // average). Mirrors the reducer so the drawer warns before you commit.
  const etLimit = Math.max(finalYearSalary * 1.2, C.estimatedAverageSalary * 1.2);
  const extFreezes = remainingYears + years >= 5 || clamped > etLimit + 1;

  const doExtend = () => {
    dispatchMove({
      kind: "extend",
      label: `Extend: ${playerName} (${fmtM(clamped)} × ${years}y)`,
      playerId,
      playerName,
      salary: clamped,
      years,
    });
    onClose();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-[-8px_0_24px_rgba(33,29,19,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          <TeamLogo id={team} size={24} />
          <div className="text-sm font-semibold">Extend contract — {teamMeta(team).name}</div>
        </div>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-1 text-base font-semibold">{playerName}</div>
        <div className="mb-4 text-xs text-[var(--muted)]">
          {yos} yrs service · current {fmtM(current)} · extension max {fmtM(ceiling)} (140% rule)
        </div>

        <label className="mb-1 flex items-baseline justify-between text-xs text-[var(--muted)]">
          <span>New first-year salary</span>
          <span className="tabular text-[10px]">max {fmtM(ceiling)}</span>
        </label>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[var(--muted)]">$</span>
          <input
            type="number"
            value={Math.round(salary)}
            step={100_000}
            min={floor}
            onChange={(e) => setSalary(Number(e.target.value) || 0)}
            className="tabular w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm"
          />
        </div>
        <input
          type="range"
          min={floor}
          max={Math.max(ceiling, floor + 100_000)}
          step={100_000}
          value={clamped}
          onChange={(e) => setSalary(Number(e.target.value))}
          className="mb-4 w-full accent-[var(--accent)]"
        />

        <label className="mb-1 block text-xs text-[var(--muted)]">
          Extension length <span className="text-[var(--muted)]">· {remainingYears}yr left, max +{maxExtYears} (5yr total)</span>
        </label>
        <div className="mb-4 flex gap-1">
          {Array.from({ length: maxExtYears }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setYears(n)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${years === n ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)] hover:brightness-150"}`}
            >
              +{n}yr
            </button>
          ))}
        </div>

        <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-2 text-xs">
          {rows.map((s, k) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-[var(--muted)]">{extSeason(k)}</span>
              <span className="tabular">{fmtFull(s)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
            <span>New money ({years}yr)</span>
            <span className="tabular">{fmtFull(total)}</span>
          </div>
        </div>

        {extFreezes && (
          <div
            className="mb-4 rounded-md border px-2.5 py-1.5 text-[11.5px] leading-snug"
            style={{ borderColor: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 8%, transparent)" }}
          >
            <span className="mr-1 font-bold text-[var(--tier-second_apron)]">⚠</span>
            Heads up: this exceeds extend-and-trade limits (5+ total seasons or a first-year raise above 120%), so {playerName} can&apos;t be traded for 6 months (Art. VII §8(f)).
          </div>
        )}

        <button
          onClick={doExtend}
          className="rounded-md bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          Extend · {fmtM(clamped)} × {years}yr
        </button>
      </div>
    </div>
  );
}

/** Waive a player: convert a guaranteed contract into dead money, with an
 * optional stretch (Art. VII §7) spreading the money over 2×seasons+1 years.
 * A non-guaranteed contract is a clean cut. computeWaive() is the shared source
 * of truth, so this preview is exactly what applyMove books. */
function WaiveDrawer({
  playerId,
  playerName,
  team,
  lg,
  onClose,
}: {
  playerId: string;
  playerName: string;
  team: string;
  lg: LG;
  onClose: () => void;
}) {
  const [stretch, setStretch] = useState(false);
  const contract = lg.contracts.find((c) => c.playerId === playerId);
  const w = contract ? computeWaive(contract) : null;
  if (!contract || !w) return null;

  const current = currentSalary(contract);
  const noDead = w.guaranteedTotal <= 0;
  const schedule = stretch
    ? Array.from({ length: w.stretch.years }, (_, k) => ({
        leagueYear: `${2026 + k}-${String(27 + k).padStart(2, "0")}`,
        salary: Math.round(w.stretch.perYear),
      }))
    : w.straightYears.map((y) => ({ leagueYear: y.leagueYear, salary: y.salary }));
  const thisYear = schedule.find((y) => y.leagueYear === YEAR_STR)?.salary ?? 0;
  const scheduleTotal = schedule.reduce((s, y) => s + y.salary, 0);
  const stretchIllegal = stretch && !w.stretch.legal;

  const doWaive = () => {
    dispatchMove({
      kind: "waive",
      label: noDead
        ? `Waive: ${playerName} — non-guaranteed, no dead money`
        : stretch
          ? `Waive: ${playerName} · stretched — ${fmtM(w.stretch.perYear)}/yr × ${w.stretch.years}y`
          : `Waive: ${playerName} — ${fmtM(w.guaranteedTotal)} dead`,
      playerId,
      stretch,
    });
    onClose();
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-[-8px_0_24px_rgba(33,29,19,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          <TeamLogo id={team} size={24} />
          <div className="text-sm font-semibold">Waive player — {teamMeta(team).name}</div>
        </div>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-1 text-base font-semibold">{playerName}</div>
        <div className="mb-4 text-xs text-[var(--muted)]">
          current {fmtM(current)} · {w.remainingSeasons}yr left · guaranteed {fmtM(w.guaranteedTotal)}
        </div>

        {noDead ? (
          <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-3 text-[12.5px] leading-snug text-[var(--muted)]">
            This contract isn&apos;t guaranteed, so waiving {playerName} is a clean cut — no dead money, and the roster spot and cap room come free.
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-1">
              <button
                onClick={() => setStretch(false)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${!stretch ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)] hover:brightness-150"}`}
              >
                Waive
              </button>
              <button
                onClick={() => setStretch(true)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${stretch ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)] hover:brightness-150"}`}
              >
                Waive &amp; stretch
              </button>
            </div>
            <div className="mb-2 text-[11px] leading-snug text-[var(--muted)]">
              {stretch
                ? `Art. VII §7: the ${fmtM(w.guaranteedTotal)} guaranteed spreads evenly over ${w.stretch.years} years (2 × ${w.remainingSeasons} + 1).`
                : `The ${fmtM(w.guaranteedTotal)} guaranteed stays on the books as it was scheduled.`}
            </div>

            <div className="mb-3 rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-2 text-xs">
              {schedule.map((y) => (
                <div key={y.leagueYear} className="flex justify-between py-0.5">
                  <span className="text-[var(--muted)]">{y.leagueYear}</span>
                  <span className="tabular">{fmtFull(y.salary)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
                <span>Dead money</span>
                <span className="tabular">{fmtFull(scheduleTotal)}</span>
              </div>
            </div>

            <div
              className="mb-4 flex items-baseline justify-between rounded-md border border-[var(--border)] px-2.5 py-2"
              style={{ background: "color-mix(in srgb, var(--tier-second_apron) 7%, transparent)" }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">{YEAR_STR} dead cap</span>
              <span className="tabular text-sm font-bold text-[var(--tier-second_apron)]">{fmtM(thisYear)}</span>
            </div>

            {stretchIllegal && (
              <div
                className="mb-4 rounded-md border px-2.5 py-1.5 text-[11.5px] leading-snug"
                style={{ borderColor: "var(--tier-second_apron)", background: "color-mix(in srgb, var(--tier-second_apron) 8%, transparent)" }}
              >
                <span className="mr-1 font-bold text-[var(--tier-second_apron)]">⚠</span>
                A stretch can&apos;t push more than 15% of the cap ({fmtM(C.salaryCap * 0.15)}) into any one year — {fmtM(w.stretch.perYear)}/yr is over the line, so this stretch isn&apos;t legal.
              </div>
            )}
          </>
        )}

        <button
          onClick={doWaive}
          disabled={stretchIllegal}
          className="rounded-md px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--tier-second_apron)" }}
        >
          {noDead
            ? `Waive ${playerName}`
            : stretch
              ? `Waive & stretch · ${fmtM(thisYear)}/yr`
              : `Waive · ${fmtM(w.guaranteedTotal)} dead`}
        </button>
      </div>
    </div>
  );
}

/** Trade finder: pick a target + acquirer, get ranked legal packages. */
function TradeFinderDrawer({
  board,
  lg,
  onClose,
  onLoad,
}: {
  board: string[];
  lg: LG;
  onClose: () => void;
  onLoad: (acquirer: string, seller: string, targetId: string, playerIds: string[], sweetenerIds?: string[]) => void;
}) {
  // "forward" = pick your team + a target, see what you can send. "reverse" =
  // pick a player, see what the whole league would legally offer for him.
  // Forward is the default: you arrive here from your own board, already
  // holding a team, wanting someone.
  const [mode, setMode] = useState<"reverse" | "forward">("forward");
  const [acquirer, setAcquirer] = useState<string>(board[0] ?? TEAM_IDS[0]!);
  const [q, setQ] = useState("");
  const [posFilter, setPosFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"impact" | "salary">("impact");
  const [targetId, setTargetId] = useState<string | null>(null);

  const capHolds = useMemo(() => Object.fromEntries(TEAM_IDS.map((t) => [t, lg.teamHolds(t)])), [lg]);

  // Target/player search pool — filtered by position, sorted by impact or salary.
  const candidates = useMemo(
    () =>
      lg.contracts
        .filter(
          (c) =>
            currentSalary(c) > 0 &&
            !c.restriction &&
            !c.deadMoney &&
            (mode === "reverse" || c.teamId !== acquirer),
        )
        .filter((c) => !posFilter || positionOf(c.playerId) === posFilter)
        .sort((a, b) =>
          sortBy === "salary" ? currentSalary(b) - currentSalary(a) : impactScoreOf(b) - impactScoreOf(a),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lg.contracts, acquirer, mode, posFilter, sortBy],
  );
  const list = (q ? candidates.filter((c) => c.playerName.toLowerCase().includes(q.toLowerCase())) : candidates).slice(0, 50);

  const target = targetId ? lg.contracts.find((c) => c.playerId === targetId) : null;
  const forwardPackages = useMemo(
    () => (mode === "forward" && targetId ? findTradePackages(lg.data, acquirer, targetId, 3, 10, capHolds) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, lg, acquirer, targetId, capHolds],
  );
  const reverseOffers = useMemo(
    () => (mode === "reverse" && targetId ? findOffersForPlayer(lg.data, targetId, 3, capHolds) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, lg, targetId, capHolds],
  );

  const playerRow = (playerId: string, name: string, salary: number) => (
    <div key={playerId} className="flex items-center justify-between gap-2 text-sm">
      <span className="flex min-w-0 items-center gap-1.5">
        <ImpactPill c={lg.contracts.find((x) => x.playerId === playerId)} />
        <PosBadge playerId={playerId} />
        <span className="truncate">{name}</span>
      </span>
      <span className="tabular text-xs text-[var(--muted)]">{fmtM(salary)}</span>
    </div>
  );

  const packageCard = (pkg: TradePackage & { valueRatio?: number }, i: number, showAcquirer: boolean) => (
    <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] p-2.5">
      {showAcquirer && (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
          <TeamLogo id={pkg.acquirer} size={16} /> {teamMeta(pkg.acquirer).name} offers
          {pkg.valueRatio != null && (
            <span className="ml-auto tabular text-[10px] font-normal text-[var(--muted)]">
              {Math.round(pkg.valueRatio * 100)}%{pkg.valueRatio >= 1.15 ? " · overpay" : pkg.valueRatio <= 0.85 ? " · light" : " · fair"}
            </span>
          )}
        </div>
      )}
      <div className="mb-1.5 space-y-1">
        {pkg.players.map((p) => playerRow(p.playerId, p.playerName, p.salary))}
        {pkg.players.length === 0 && (
          <div className="text-xs text-[var(--muted)]">
            No salary needed — <Term k="cap_room" className="underline decoration-dotted underline-offset-2">absorbed into cap room</Term>
          </div>
        )}
        {pkg.sweeteners.length > 0 && (
          <div className="mt-1 border-t border-dashed border-[var(--border)] pt-1">
            <div className="label !text-[9px]">{teamMeta(pkg.seller).name} also sends</div>
            {pkg.sweeteners.map((p) => playerRow(p.playerId, p.playerName, p.salary))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-1.5 text-[11px] text-[var(--muted)]">
        <span className="tabular">out {fmtM(pkg.outSalary)} · in {fmtM(pkg.inSalary)} · value {pkg.valueGiven}</span>
        <button
          onClick={() => onLoad(pkg.acquirer, pkg.seller, targetId!, pkg.players.map((p) => p.playerId), pkg.sweeteners.map((p) => p.playerId))}
          className="rounded border border-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-ink)] hover:bg-[var(--accent)] hover:text-white"
        >
          Load into board
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-[-8px_0_24px_rgba(33,29,19,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
        <div className="text-sm font-semibold">Trade finder</div>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">✕</button>
      </div>

      <div className="flex gap-1 border-b border-[var(--border)] p-3">
        {([["forward", "Trade for a player"], ["reverse", "Offers for a player"]] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => { setMode(m); setTargetId(null); }}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${mode === m ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)] hover:brightness-150"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "forward" && (
        <div className="border-b border-[var(--border)] p-3">
          <label className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--muted)]">Acquiring team</label>
          <select
            value={acquirer}
            onChange={(e) => { setAcquirer(e.target.value); setTargetId(null); }}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm"
          >
            {[...TEAM_IDS].sort(byNickname).map((t) => (<option key={t} value={t}>{teamMeta(t).name}</option>))}
          </select>
        </div>
      )}

      {target ? (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[var(--border)] p-3">
            <div className="flex items-center gap-2 text-sm">
              <ImpactPill c={target} />
              <PosBadge playerId={target.playerId} />
              <span className="font-semibold">{target.playerName}</span>
              <span className="tabular text-xs text-[var(--muted)]">{fmtM(currentSalary(target))} · {teamMeta(target.teamId).name}</span>
            </div>
            <button onClick={() => setTargetId(null)} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">Change</button>
          </div>
          {mode === "reverse" ? (
            <>
              <div className="p-3 text-xs text-[var(--muted)]">
                {reverseOffers.length
                  ? `${reverseOffers.length} legal offer${reverseOffers.length > 1 ? "s" : ""} for ${target.playerName}, best value first — every one is executable:`
                  : `No legal offer for ${target.playerName} right now (he may be too expensive to match, or restricted).`}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
                {reverseOffers.map((o, i) => packageCard(o, i, true))}
              </div>
            </>
          ) : (
            <>
              <div className="p-3 text-xs text-[var(--muted)]">
                {forwardPackages.length
                  ? `${forwardPackages.length} legal package${forwardPackages.length > 1 ? "s" : ""} from ${teamMeta(acquirer).name} (salary fit, then least value given):`
                  : `No legal ${teamMeta(acquirer).name} package matches ${target.playerName}.`}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
                {forwardPackages.map((pkg, i) => packageCard(pkg, i, false))}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "reverse" ? "Search any player…" : "Search a target player…"} className="flex-1 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "impact" | "salary")} className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-1.5 py-2 text-xs">
              <option value="impact">Impact</option>
              <option value="salary">Salary</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-1 px-3 pt-2">
            {([null, "PG", "SG", "SF", "PF", "C"] as const).map((p) => (
              <button
                key={p ?? "all"}
                onClick={() => setPosFilter(p)}
                className={`rounded-[4px] border px-2 py-0.5 text-[10px] font-medium ${posFilter === p ? "border-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--border)] text-[var(--muted)] hover:brightness-150"}`}
              >
                {p ?? "All"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
            {list.map((c) => (
              <button key={c.playerId} onClick={() => setTargetId(c.playerId)} className="mb-1 flex w-full items-center justify-between gap-2 rounded-md bg-[var(--panel-2)] px-3 py-2 text-left text-sm hover:brightness-125">
                <span className="flex min-w-0 items-center gap-2">
                  <ImpactPill c={c} />
                  <PosBadge playerId={c.playerId} />
                  <span className="truncate">{c.playerName}</span>
                  <span className="text-[10px] text-[var(--muted)]">{c.teamId}</span>
                </span>
                <span className="tabular text-xs text-[var(--muted)]">{fmtM(currentSalary(c))}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
