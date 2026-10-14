import { TEAM_IDS, type Move } from "@/lib/league";

/**
 * A saved offseason arrives from two places nobody controls: a ?gm= link
 * (pasted, truncated, hand-edited, minted by an older build) and localStorage
 * (written by whatever version of the site the visitor last had open). Both
 * used to be cast straight to Move[], so one `{"kind":"trade"}` without its
 * players threw inside the replay and took the whole board down — and since
 * hydration persists what it loads, the broken list then came back on every
 * reload. Everything that reaches the replay passes through here first: a move
 * whose shape is wrong is dropped, the rest are kept in order.
 */

/** No real offseason is this long; a token that claims to be is not one. */
export const MAX_MOVES = 400;

const TEAMS = new Set(TEAM_IDS);
type Rec = Record<string, unknown>;

const isObj = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 200;
const isTeam = (x: unknown): x is string => typeof x === "string" && TEAMS.has(x);
const isMoney = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 500_000_000;
const isYears = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 6;
const arrOf = (x: unknown, ok: (v: unknown) => boolean) => Array.isArray(x) && x.length <= 60 && x.every(ok);
// An optional field may be absent or null (a builder's `undefined` survives
// JSON as absent, but a hand-edited or older token can carry null).
const none = (x: unknown) => x === undefined || x === null;
const opt = <T,>(x: unknown, ok: (v: unknown) => v is T) => none(x) || ok(x);
const optBool = (x: unknown) => none(x) || typeof x === "boolean";
const optStr = (x: unknown) => none(x) || typeof x === "string";
const optArr = (x: unknown, ok: (v: unknown) => boolean) => none(x) || arrOf(x, ok);

const isLeg = (x: unknown) => isObj(x) && isStr(x.playerId) && isTeam(x.to);
const isPick = (x: unknown) => isObj(x) && isStr(x.id) && isTeam(x.to) && opt(x.from, isTeam);
const isSwap = (x: unknown) =>
  isObj(x) && Number.isInteger(x.year) && (x.round === 1 || x.round === 2) && isTeam(x.favoredTo) && isTeam(x.otherTeam);
const isCash = (x: unknown) => isObj(x) && isTeam(x.from) && isTeam(x.to) && isMoney(x.amount);
const isTpeUse = (x: unknown) =>
  isObj(x) &&
  Object.entries(x).every(
    ([team, u]) => isTeam(team) && isObj(u) && isMoney(u.amount) && typeof u.preExisting === "boolean" && optBool(u.firstApronCap) && optStr(u.label),
  );

function isMove(m: unknown): m is Move {
  if (!isObj(m) || typeof m.label !== "string") return false;
  switch (m.kind) {
    case "trade":
      return (
        arrOf(m.players, isLeg) &&
        optArr(m.picks, isPick) &&
        optArr(m.pickSwaps, isSwap) &&
        (none(m.tpeUse) || isTpeUse(m.tpeUse)) &&
        optArr(m.cash, isCash)
      );
    case "sign":
      return (
        isStr(m.playerId) && isStr(m.playerName) && isTeam(m.teamId) && isMoney(m.salary) &&
        opt(m.years, isYears) && optStr(m.mechanism) && optBool(m.restricted) && optStr(m.restrictionText)
      );
    case "sign_trade":
      return (
        isStr(m.playerId) && isStr(m.playerName) && isTeam(m.toTeam) && isMoney(m.salary) &&
        opt(m.years, isYears) && opt(m.fromTeam, isTeam) &&
        optArr(m.returnPlayers, isStr) &&
        optArr(m.players, isLeg) &&
        optArr(m.picks, isPick) &&
        (none(m.birdStatus) || m.birdStatus === "bird" || m.birdStatus === "early_bird" || m.birdStatus === "non_bird") &&
        opt(m.priorSalary, isMoney) && optBool(m.byc) && optBool(m.senderHardCapped)
      );
    case "renounce":
      return isStr(m.playerId) && isStr(m.playerName) && isTeam(m.team);
    case "extend":
      return isStr(m.playerId) && isStr(m.playerName) && isMoney(m.salary) && isYears(m.years);
    case "waive":
      return isStr(m.playerId) && optBool(m.stretch);
    default:
      return false;
  }
}

/** The well-formed moves in `raw`, in order; anything else is dropped. */
export function sanitizeMoves(raw: unknown): Move[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_MOVES).filter(isMove);
}
