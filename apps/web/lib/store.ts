"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  teamSalary as engTeamSalary,
  capSheet as engCapSheet,
  type Contract,
} from "@apron/cba-engine";
import {
  BASE_CONTRACTS,
  YEAR,
  C,
  CAP_SHEET_YEARS,
  projectedCap,
  applyMove,
  leagueData,
  rosterOf,
  freeAgentsOf,
  holdsByTeam,
  type Move,
} from "./league";

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
    const fas = freeAgentsOf(contracts).map((f) =>
      renouncedIds.has(f.playerId) ? { ...f, renounced: true } : f,
    );
    // Renounced free agents no longer occupy cap room.
    const holds = holdsByTeam(fas.filter((f) => !f.renounced));
    const nameOf = (id: string) =>
      contracts.find((c) => c.playerId === id)?.playerName ?? id;
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
      playerName: nameOf,
    };
  }, [contracts, moveList]);
}
