"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  teamSalary as engTeamSalary,
  capSheet as engCapSheet,
  type Contract,
} from "@apron/cba-engine";
import { ACQUIRED_PICKS } from "@apron/data";
import {
  BASE_CONTRACTS,
  YEAR,
  C,
  CAP_SHEET_YEARS,
  TEAM_IDS,
  projectedCap,
  applyMove,
  leagueData,
  rosterOf,
  freeAgentsOf,
  holdsByTeam,
  type Move,
} from "./league";
import { track } from "./analytics";
import { lockedFirstEncumbrance, sessionHardCaps, feedStateOf } from "./league";

export const PICK_YEARS = [2027, 2028, 2029, 2030, 2031, 2032] as const;
export { lockedFirstEncumbrance } from "./league";

export interface OwnedPick {
  /** `ORIGIN|YEAR|ROUND` — origin team never changes; ownership does. */
  id: string;
  origin: string;
  year: number;
  round: 1 | 2;
  label: string;
}

// Session of GM moves layered on the base (feed-applied) league, persisted to
// localStorage so an offseason survives reloads.
const STORAGE_KEY = "apron_gm_moves_v1";
let moves: Move[] = [];
let working: Contract[] = BASE_CONTRACTS;
let hydrated = false;
const listeners = new Set<() => void>();

function recompute() {
  working = moves.reduce((cs, m) => applyMove(cs, m), BASE_CONTRACTS);
}
function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(moves));
  } catch {
    /* ignore */
  }
}
function emit() {
  recompute();
  persist();
  for (const l of listeners) l();
}

/** Load saved moves once, after hydration (called from a mount effect). */
export function hydrateMoves() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    // A shared offseason (?gm=) takes priority over localStorage.
    const gm = new URLSearchParams(window.location.search).get("gm");
    const raw = gm ? atob(gm) : window.localStorage.getItem(STORAGE_KEY) || "[]";
    const saved = JSON.parse(raw);
    if (Array.isArray(saved) && saved.length) {
      moves = saved as Move[];
      emit();
    }
  } catch {
    /* ignore */
  }
}

/** Encode the whole offseason (all moves) for a shareable URL. */
export function encodeMoves(): string {
  try {
    return btoa(JSON.stringify(moves));
  } catch {
    return "";
  }
}

export function dispatchMove(m: Move) {
  moves = [...moves, m];
  track("move", { kind: m.kind });
  emit();
}
export function undoMove() {
  if (moves.length) {
    moves = moves.slice(0, -1);
    emit();
  }
}
/** Remove a single move by index (later moves re-apply against the new state). */
export function removeMoveAt(i: number) {
  if (i >= 0 && i < moves.length) {
    moves = moves.filter((_, idx) => idx !== i);
    emit();
  }
}
export function resetMoves() {
  if (moves.length) {
    moves = [];
    emit();
  }
}
/** Toggle whether a team has renounced a free agent's cap hold. */
export function toggleRenounce(
  playerId: string,
  playerName: string,
  team: string,
) {
  const exists = moves.some(
    (m) => m.kind === "renounce" && m.playerId === playerId,
  );
  if (!exists) track("move", { kind: "renounce" });
  moves = exists
    ? moves.filter((m) => !(m.kind === "renounce" && m.playerId === playerId))
    : [
        ...moves,
        { kind: "renounce", label: `Renounce ${playerName}`, playerId, playerName, team },
      ];
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const snapContracts = () => working;
const snapMoves = () => moves;

export function useWorkingContracts() {
  return useSyncExternalStore(subscribe, snapContracts, snapContracts);
}
export function useMoves() {
  return useSyncExternalStore(subscribe, snapMoves, snapMoves);
}

/** One hook giving the working league state + engine-bound helpers. */
export function useLeague() {
  const contracts = useWorkingContracts();
  const moveList = useMoves();
  return useMemo(() => {
    const data = leagueData(contracts);
    const renouncedIds = new Set(
      moveList.filter((m) => m.kind === "renounce").map((m) => m.playerId),
    );
    // Feed-forced renounces: room a team demonstrably spent in the real July
    // required these holds gone — they arrive pre-renounced (Bird rights too)
    // and, unlike session renounces, can't be restored.
    const fas = freeAgentsOf(contracts).map((f) => {
      const inWorld = feedStateOf(f.priorTeam).forcedRenounced.has(f.playerName.toLowerCase());
      return renouncedIds.has(f.playerId) || inWorld
        ? { ...f, renounced: true, renouncedInWorld: inWorld }
        : f;
    });
    // Renounced free agents no longer occupy cap room.
    const holds = holdsByTeam(fas.filter((f) => !f.renounced));
    const nameOf = (id: string) =>
      contracts.find((c) => c.playerId === id)?.playerName ?? id;
    // Pick-ownership ledger: every team starts with its own 1sts/2nds; executed
    // trades transfer them, so Stepien and the boards see real inventory.
    // Real-world encumbrances (draft-picks ledger) then lock own firsts that
    // are already owed away — see lockedFirstIds/uncoveredFirstYears below.
    const pickOwner = new Map<string, string>();
    for (const t of TEAM_IDS)
      for (const y of PICK_YEARS)
        for (const r of [1, 2] as const) pickOwner.set(`${t}|${y}|${r}`, t);
    // Real trades already moved picks before the sim: a pick another team owes
    // to this one outright conveys here, so it joins the holder's tradeable
    // inventory (and leaves the origin's). Swaps/conditionals are excluded.
    for (const ap of ACQUIRED_PICKS) if (pickOwner.has(ap.id)) pickOwner.set(ap.id, ap.team);
    for (const m of moveList) {
      if (m.kind === "trade" && m.picks) {
        for (const p of m.picks) if (pickOwner.has(p.id)) pickOwner.set(p.id, p.to);
      }
    }
    const hardCaps = sessionHardCaps(moveList);
    return {
      data,
      contracts,
      moves: moveList,
      roster: (t: string) => rosterOf(contracts, t),
      teamSalary: (t: string) => engTeamSalary(data, t, YEAR),
      capSheet: (t: string) => engCapSheet(data, t, C),
      // Committed salary by season for the multi-year cap sheet.
      multiYear: (t: string) =>
        CAP_SHEET_YEARS.map((y) => {
          const salary = engTeamSalary(data, t, y);
          const n = contracts.filter(
            (c) => c.teamId === t && c.years.some((yr) => yr.leagueYear === y && yr.salary > 0),
          ).length;
          return { year: y, salary, players: n, cap: projectedCap(y) };
        }),
      freeAgents: () => fas,
      teamHolds: (t: string) => holds[t] ?? 0,
      /** Picks CURRENTLY owned by a team (own + acquired via session trades). */
      picksOf: (t: string): OwnedPick[] => {
        const out: OwnedPick[] = [];
        for (const [id, owner] of pickOwner) {
          if (owner !== t) continue;
          const [origin, yearStr, roundStr] = id.split("|");
          const year = Number(yearStr);
          const round = Number(roundStr) as 1 | 2;
          // A first already owed away in the real world isn't yours to trade.
          if (round === 1 && origin === owner && lockedFirstEncumbrance(origin!, year)) continue;
          out.push({
            id,
            origin: origin!,
            year,
            round,
            label: `${origin === t ? "" : origin + " "}${year} ${round === 1 ? "1st" : "2nd"}`,
          });
        }
        return out.sort((a, b) => a.year - b.year || a.round - b.round || a.origin.localeCompare(b.origin));
      },
      /** Current owner of a pick id (ledger view). */
      pickOwnerOf: (id: string) => pickOwner.get(id),
      /** Future first-round years where a team owns NO first (for Stepien). */
      yearsWithoutFirst: (t: string, extraOut: string[] = [], extraIn: string[] = []): number[] => {
        const owned = new Set<string>();
        for (const [id, owner] of pickOwner) {
          if (owner === t && id.endsWith("|1")) owned.add(id);
        }
        // Real-world obligations: an own first that's owed (or protected-out)
        // cannot be counted on — conservative Stepien, per league practice.
        for (const id of [...owned]) {
          const [origin, yearStr] = id.split("|");
          if (origin === t && lockedFirstEncumbrance(t, Number(yearStr))) owned.delete(id);
        }
        for (const id of extraOut) owned.delete(id);
        for (const id of extraIn) if (id.endsWith("|1")) owned.add(id);
        const yearsWithFirst = new Set([...owned].map((id) => Number(id.split("|")[1])));
        const uncovered: number[] = PICK_YEARS.filter((y) => !yearsWithFirst.has(y));
        // 2033 sits past the tradeable window but a first already owed there
        // still pairs with 2032 for the consecutive-gap test.
        if (lockedFirstEncumbrance(t, 2033)) uncovered.push(2033);
        return uncovered;
      },
      // The tightest apron a team is HARD-CAPPED at — real July moves from
      // the feed (S&T/MLE acquisitions) plus this session's: NT-MLE/BAE/
      // sign-and-trade → first apron, Taxpayer MLE → second apron, and trades
      // that took back more than they sent under expanded matching
      // (restriction-table row E → first apron). Session part is replayed
      // from the ledger, so it binds every later move AND repairs old saves.
      hardCapOf: (t: string) =>
        Math.min(hardCaps[t] ?? Infinity, feedStateOf(t).hardCap),
      playerName: nameOf,
    };
  }, [contracts, moveList]);
}
