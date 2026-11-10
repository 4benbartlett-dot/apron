import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Move } from "@/lib/league";
import { MOVES_KEY, MOVES_BACKUP_KEY } from "@/lib/storageKeys";

// Whose session is on the board. Opening a friend's ?gm= link used to save it
// over the visitor's own offseason, and because the link stayed in the address
// bar, every reload loaded it again and undid whatever they had changed. The
// store runs in a browser; this gives it the three things it touches there.

const renounce = (n: number): Move => ({ kind: "renounce", label: `Renounce ${n}`, playerId: `x-test-${n}`, playerName: `Test ${n}`, team: "UTA" });
const OWN: Move[] = [renounce(1), renounce(2)];
const SHARED: Move[] = [renounce(7), renounce(8), renounce(9)];

function browser(search: string, stored: Record<string, string>) {
  const data = new Map(Object.entries(stored));
  const location = { search, pathname: "/", hash: "", origin: "https://overtheapron.com", href: `https://overtheapron.com/${search}` };
  const win = {
    location,
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
    history: {
      replaceState: (_s: unknown, _t: string, url: string) => {
        const u = new URL(url, location.origin);
        location.search = u.search;
        location.href = u.href;
      },
    },
  };
  vi.stubGlobal("window", win);
  return { data, location };
}

async function freshStore() {
  vi.resetModules();
  return import("@/lib/store");
}

describe("whose session is on the board", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("loads the visitor's own saved session when there is no link", async () => {
    browser("", { [MOVES_KEY]: JSON.stringify(OWN) });
    const store = await freshStore();
    expect(store.sessionSource()).toEqual({ kind: "unhydrated" });
    store.hydrateMoves();
    expect(store.sessionSource()).toEqual({ kind: "own" });
    expect(store.encodeMoves()).toBe(store.encodeMovesToken(OWN));
  });

  it("shows a shared link without touching the visitor's saved session", async () => {
    const store0 = await freshStore();
    const gm = store0.encodeMovesToken(SHARED);
    const { data, location } = browser(`?gm=${gm}&board=UTA,SAC`, { [MOVES_KEY]: JSON.stringify(OWN) });
    const store = await freshStore();
    store.hydrateMoves();
    expect(store.sessionSource()).toEqual({ kind: "shared", ownMoves: 2 });
    expect(store.encodeMoves()).toBe(gm);
    // Their own offseason is exactly as they left it, and the link is still the link.
    expect(JSON.parse(data.get(MOVES_KEY)!)).toEqual(OWN);
    expect(data.has(MOVES_BACKUP_KEY)).toBe(false);
    expect(location.search).toContain("gm=");
  });

  it("changing a shared session makes it theirs: saved, the link gone, their own set aside", async () => {
    const gm = (await freshStore()).encodeMovesToken(SHARED);
    const { data, location } = browser(`?gm=${gm}&board=UTA`, { [MOVES_KEY]: JSON.stringify(OWN) });
    const store = await freshStore();
    store.hydrateMoves();
    store.undoMove();
    expect(store.sessionSource()).toEqual({ kind: "forked", setAside: 2 });
    expect(JSON.parse(data.get(MOVES_KEY)!)).toEqual(SHARED.slice(0, 2));
    expect(JSON.parse(data.get(MOVES_BACKUP_KEY)!)).toEqual(OWN);
    // A reload now restores what is saved, not what the link said.
    expect(location.search).toBe("");
  });

  it("a reset on a shared link survives the reload", async () => {
    const gm = (await freshStore()).encodeMovesToken(SHARED);
    const { data, location } = browser(`?gm=${gm}`, {});
    const store = await freshStore();
    store.hydrateMoves();
    store.resetMoves();
    expect(location.search).toBe("");
    // The reload: same storage, the address bar as the store left it.
    browser(location.search, Object.fromEntries(data));
    const again = await freshStore();
    again.hydrateMoves();
    expect(again.sessionSource()).toEqual({ kind: "own" });
    expect(again.encodeMoves()).toBe(again.encodeMovesToken([]));
  });

  it("the visitor can go back to their own, from a link they only looked at", async () => {
    const gm = (await freshStore()).encodeMovesToken(SHARED);
    const { location } = browser(`?gm=${gm}`, { [MOVES_KEY]: JSON.stringify(OWN) });
    const store = await freshStore();
    store.hydrateMoves();
    expect(store.restoreOwnSession()).toBe(true);
    expect(store.sessionSource()).toEqual({ kind: "own" });
    expect(store.encodeMoves()).toBe(store.encodeMovesToken(OWN));
    expect(location.search).toBe("");
  });

  it("and from one they changed, on a later visit too", async () => {
    const gm = (await freshStore()).encodeMovesToken(SHARED);
    const { data, location } = browser(`?gm=${gm}`, { [MOVES_KEY]: JSON.stringify(OWN) });
    const store = await freshStore();
    store.hydrateMoves();
    store.dispatchMove(renounce(10));
    // A later visit, no link in the address bar.
    browser(location.search, Object.fromEntries(data));
    const later = await freshStore();
    later.hydrateMoves();
    expect(later.sessionSource()).toEqual({ kind: "forked", setAside: 2 });
    expect(later.restoreOwnSession()).toBe(true);
    expect(later.sessionSource()).toEqual({ kind: "own" });
    expect(later.encodeMoves()).toBe(later.encodeMovesToken(OWN));
  });

  it("there is nothing to go back to when the session was theirs all along", async () => {
    browser("", { [MOVES_KEY]: JSON.stringify(OWN) });
    const store = await freshStore();
    store.hydrateMoves();
    expect(store.restoreOwnSession()).toBe(false);
  });
});
