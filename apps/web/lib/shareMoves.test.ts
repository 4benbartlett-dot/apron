import { describe, it, expect } from "vitest";
import { encodeMovesToken, decodeMovesParam } from "@/lib/store";
import type { Move } from "@/lib/league";

// Regression: the shared-offseason token (?gm=) once went through plain btoa,
// which throws on the → and × that live in EVERY signing label — so the token
// came back empty and the link loaded nothing. It must round-trip now.
describe("shared-offseason (?gm=) token", () => {
  const moves: Move[] = [
    { kind: "sign", label: "Sign: Draymond Green → GSW ($3.9M × 3y)", playerId: "greendr01", playerName: "Draymond Green", teamId: "GSW", salary: 3_876_529, years: 3, mechanism: "bird" },
    { kind: "renounce", label: "Renounce Seth Curry", playerId: "curryse01", playerName: "Seth Curry", team: "GSW" },
    { kind: "trade", label: "Trade: Davis, Turner +1 pick", players: [{ playerId: "davisan02", to: "GSW" }] },
  ];

  it("round-trips moves whose labels carry non-Latin1 glyphs (→, ×)", () => {
    const token = encodeMovesToken(moves);
    expect(token.length).toBeGreaterThan(0);
    expect(decodeMovesParam(token)).toEqual(moves);
  });

  it("emits a URL-safe token (no +, /, =, or space to be mangled in a query string)", () => {
    expect(encodeMovesToken(moves)).not.toMatch(/[+/= ]/);
  });

  it("survives a URLSearchParams round trip (the +→space trap)", () => {
    const token = encodeMovesToken(moves);
    const fromQuery = new URLSearchParams(`gm=${token}`).get("gm")!;
    expect(decodeMovesParam(fromQuery)).toEqual(moves);
  });

  it("returns null for an empty or malformed token", () => {
    expect(decodeMovesParam("")).toBeNull();
    expect(decodeMovesParam("not-valid-base64!!")).toBeNull();
  });
});

// A link is input from anywhere: truncated, hand-edited, or minted by an older
// build. `[{"kind":"trade"}]` used to reach the replay and throw on
// `players.map`, which blanked the board and — because hydration persists what
// it loads — kept blanking it on every reload.
describe("a malformed shared offseason costs only its bad moves", () => {
  const good: Move = { kind: "renounce", label: "Renounce Seth Curry", playerId: "curryse01", playerName: "Seth Curry", team: "GSW" };
  const token = (list: unknown[]) => encodeMovesToken(list as Move[]);

  it("drops moves missing the fields the replay reads", () => {
    expect(decodeMovesParam(token([{ kind: "trade" }]))).toBeNull();
    expect(decodeMovesParam(token([{ kind: "trade" }, good]))).toEqual([good]);
  });

  it("drops unknown kinds, non-objects, bad teams and bad money", () => {
    const junk = [
      null, 5, "x", [], { kind: "teleport", label: "" },
      { kind: "sign", label: "", playerId: "greendr01", playerName: "Draymond Green", teamId: "ZZZ", salary: 1 },
      { kind: "sign", label: "", playerId: "greendr01", playerName: "Draymond Green", teamId: "GSW", salary: "lots" },
      { kind: "sign", label: "", playerId: "greendr01", playerName: "Draymond Green", teamId: "GSW", salary: Number.MAX_VALUE },
      { kind: "trade", label: "", players: [{ playerId: "davisan02", to: "Narnia" }] },
    ];
    expect(decodeMovesParam(token([...junk, good]))).toEqual([good]);
  });

  it("caps a token that claims an absurd number of moves", () => {
    const decoded = decodeMovesParam(token(Array.from({ length: 2000 }, () => good)));
    expect(decoded!.length).toBeLessThanOrEqual(400);
  });
});
