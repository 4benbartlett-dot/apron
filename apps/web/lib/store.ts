"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  teamSalary as engTeamSalary,
  capSheet as engCapSheet,
  type Contract,
} from "@apron/cba-engine";
import { ACQUIRED_PICKS, hasAcquiredFirst, frozenFirstOf } from "@apron/data";
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
import { sanitizeMoves } from "./moveGuard";
import { MOVES_KEY, MOVES_BACKUP_KEY } from "./storageKeys";
import { lockedFirstEncumbrance, sessionHardCaps, feedStateOf, PICK_YEARS } from "./league";

export { PICK_YEARS };
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
let moves: Move[] = [];
let working: Contract[] = BASE_CONTRACTS;
const listeners = new Set<() => void>();

/**
 * Whose session is on the board. This was a boolean (`hydrated`) and an order
 * of operations: a `?gm=` link was read ahead of storage and then saved over
 * it, so opening a friend's link erased the visitor's own offseason, and
 * because the link stayed in the address bar every reload loaded it again,
 * undoing whatever the visitor had changed (Reset included).
 *
 *   unhydrated  nothing loaded yet (the server render, and the first paint)
 *   own         the visitor's session, from this browser's storage (or empty)
 *   shared      a link's session exactly as shared. Storage is NOT touched:
 *               the visitor's own session is still there, `ownMoves` long
 *   forked      a shared session the visitor has changed. It is theirs now
 *               and is saved; what they had before sits in the backup slot,
 *               `setAside` moves long
 *
 *   unhydrated → own | shared     hydrateMoves()
 *   shared → forked               the first change (any move, undo, reset)
 *   shared → own, forked → own    restoreOwnSession()
 */
export type SessionSource =
  | { kind: "unhydrated" }
  | { kind: "own" }
  | { kind: "shared"; ownMoves: number }
  | { kind: "forked"; setAside: number };
let source: SessionSource = { kind: "unhydrated" };

function recompute() {
  working = moves.reduce((cs, m) => applyMove(cs, m), BASE_CONTRACTS);
}
const readStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const parseStored = (raw: string | null): Move[] => {
  try {
    return replayable(sanitizeMoves(JSON.parse(raw || "[]")));
  } catch {
    return [];
  }
};
function persist() {
  if (typeof window === "undefined") return;
  // A shared session that nobody has changed is the link's, not the visitor's.
  if (source.kind === "shared") return;
  try {
    window.localStorage.setItem(MOVES_KEY, JSON.stringify(moves));
  } catch {
    /* ignore */
  }
}
function emit() {
  recompute();
  persist();
  for (const l of listeners) l();
}
/** Drop the shared-session params from the address bar, so a reload restores
 * what is saved rather than what the link said. */
function clearSharedParams() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("gm")) return;
    url.searchParams.delete("gm");
    url.searchParams.delete("board");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}
/** Called before any change to the move list. Changing a shared session makes
 * it the visitor's: their own is set aside first, never overwritten. */
function beforeChange() {
  if (source.kind !== "shared" || typeof window === "undefined") return;
  const own = readStored(MOVES_KEY);
  const ownCount = parseStored(own).length;
  try {
    if (ownCount) window.localStorage.setItem(MOVES_BACKUP_KEY, own!);
    else window.localStorage.removeItem(MOVES_BACKUP_KEY);
  } catch {
    /* ignore */
  }
  source = { kind: "forked", setAside: ownCount };
  clearSharedParams();
}

/** UTF-8- and URL-safe base64 for the shared-offseason (?gm=) token. Move
 * labels carry →, ×, ·, — (outside Latin1, which plain btoa can't encode and
 * would silently blank the whole token), and +,/,= get mangled in a query
 * string — so encode the bytes, then swap to the url-safe alphabet. Decode
 * also accepts the classic +,/ forms so any pre-existing link still opens. */
function gmEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function gmDecode(token: string): string {
  const restored = token.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(restored + "=".repeat((4 - (restored.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Load the session once, after hydration (called from a mount effect). A
 * shared offseason (?gm=) is shown ahead of the saved one, and beside it, not
 * over it: see {@link SessionSource}. */
export function hydrateMoves() {
  if (source.kind !== "unhydrated" || typeof window === "undefined") return;
  const own = parseStored(readStored(MOVES_KEY));
  let shared: Move[] | null = null;
  try {
    const gm = new URLSearchParams(window.location.search).get("gm");
    shared = gm ? decodeMovesParam(gm) : null;
  } catch {
    shared = null;
  }
  if (shared) {
    source = { kind: "shared", ownMoves: own.length };
    moves = shared;
  } else {
    // A session forked from a link earlier keeps its "bring mine back" until used.
    const setAside = parseStored(readStored(MOVES_BACKUP_KEY)).length;
    source = setAside ? { kind: "forked", setAside } : { kind: "own" };
    moves = own;
  }
  emit();
}

/** Put the visitor's own session back on the board: the saved one if they
 * were only looking at a shared link, the set-aside one if they had changed
 * it. Returns whether there was one to bring back. */
export function restoreOwnSession(): boolean {
  if (typeof window === "undefined") return false;
  if (source.kind === "shared") {
    moves = parseStored(readStored(MOVES_KEY));
    source = { kind: "own" };
    clearSharedParams();
    emit();
    return true;
  }
  if (source.kind === "forked" && source.setAside > 0) {
    moves = parseStored(readStored(MOVES_BACKUP_KEY));
    try {
      window.localStorage.removeItem(MOVES_BACKUP_KEY);
    } catch {
      /* ignore */
    }
    source = { kind: "own" };
    emit();
    return true;
  }
  return false;
}

/** The moves that replay cleanly against today's league, in order. Shape is
 * sanitizeMoves's job; this catches the rest — a link minted before a data
 * refresh can name a player the sheet has since dropped, and one bad move must
 * cost only itself, not the board. */
function replayable(list: Move[]): Move[] {
  const kept: Move[] = [];
  let cs = BASE_CONTRACTS;
  for (const m of list) {
    try {
      const next = applyMove(cs, m);
      sessionHardCaps([...kept, m]);
      cs = next;
      kept.push(m);
    } catch {
      /* dropped */
    }
  }
  return kept;
}

/** Pure encoder for a move list → shareable token (UTF-8- and URL-safe). */
export function encodeMovesToken(list: Move[]): string {
  return gmEncode(JSON.stringify(list));
}

/** Encode the whole offseason (all moves) for a shareable URL. */
export function encodeMoves(): string {
  try {
    return encodeMovesToken(moves);
  } catch {
    return "";
  }
}

/** Decode a shared-offseason (?gm=) token into its move list — used to greet a
 * visitor with a recap of the offseason they opened (null if the token is
 * empty or malformed). Reads independently of store hydration order. */
export function decodeMovesParam(token: string): Move[] | null {
  try {
    const saved = replayable(sanitizeMoves(JSON.parse(gmDecode(token))));
    return saved.length ? saved : null;
  } catch {
    return null;
  }
}

export function dispatchMove(m: Move) {
  beforeChange();
  moves = [...moves, m];
  track("move", { kind: m.kind });
  emit();
}
export function undoMove() {
  if (moves.length) {
    beforeChange();
    moves = moves.slice(0, -1);
    emit();
  }
}
/** Remove a single move by index (later moves re-apply against the new state). */
export function removeMoveAt(i: number) {
  if (i >= 0 && i < moves.length) {
    beforeChange();
    moves = moves.filter((_, idx) => idx !== i);
    emit();
  }
}
export function resetMoves() {
  if (moves.length) {
    beforeChange();
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
  beforeChange();
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
const snapSource = () => source;
const UNHYDRATED: SessionSource = { kind: "unhydrated" };
const serverSource = () => UNHYDRATED;

/** Whose session is on the board (see {@link SessionSource}). */
export function useSessionSource(): SessionSource {
  return useSyncExternalStore(subscribe, snapSource, serverSource);
}
/** The same, outside React. */
export const sessionSource = (): SessionSource => source;

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
      if ((m.kind === "trade" || m.kind === "sign_trade") && m.picks) {
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
          // Nor is one frozen by a season over the second apron (Art. VII
          // §2(f)). It is still the team's pick, so unlike an owed one it
          // keeps its year covered for the Stepien rule below.
          if (round === 1 && origin === owner && frozenFirstOf(origin!, year)) continue;
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
        // 2033 sits past the tradeable window but a first already owed (or
        // forfeited) there still pairs with 2032 for the consecutive-gap test —
        // unless another team's 2033 first is in hand, which covers the year
        // exactly as it would inside the window. The Clippers are the live
        // case: their own 2032 and 2033 are forfeited, and Toronto's 2033
        // first is the only reason that pair isn't a standing violation.
        if (lockedFirstEncumbrance(t, 2033) && !hasAcquiredFirst(t, 2033)) uncovered.push(2033);
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
