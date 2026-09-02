import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, readdirSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// THE WRITE PATH, end to end, against a scratch copy of packages/data/src.
// The desk's actions validate, then write atomically, then tell Next to
// re-render; here Next is mocked and the writes land in a temp directory, so
// the assertions are on the files themselves: the row is at the top of
// manual-moves.json, the pick moved in the rights ledger, the exception use
// was booked, and the file's own formatting (trailing newline, \u escapes)
// survived the round trip. The real tree is never touched.
// ---------------------------------------------------------------------------

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const SRC = join(__dirname, "..", "..", "..", "packages", "data", "src");
let dir: string;
type Actions = typeof import("@/app/admin/actions");
let actions: Actions;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "apron-admin-"));
  for (const f of readdirSync(SRC)) if (f.endsWith(".json")) copyFileSync(join(SRC, f), join(dir, f));
  process.env.APRON_DATA_DIR = dir;
  actions = await import("@/app/admin/actions");
});
afterAll(() => {
  delete process.env.APRON_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const raw = (f: string) => readFileSync(join(dir, f), "utf8");

describe("filing from the desk", () => {
  it("a signing lands at the top of manual-moves.json in the feed's shape, and books the exception", async () => {
    const before = read("manual-moves.json").transactions.length;
    const r = await actions.fileSigning({
      date: "2026-09-03",
      player: { name: "Nicolas Batum", pos: "SF" },
      team: "CHA",
      years: 2,
      total: 11_222_000,
      mechanism: "bae",
      why: "integration test",
      consume: { mechanism: "bae", amount: 5_477_000 },
    });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const moves = read("manual-moves.json").transactions;
    expect(moves).toHaveLength(before + 1);
    expect(moves[0]).toMatchObject({ player: "Nicolas Batum", date: "Sep 03, 2026", type: "Signing", why: "integration test" });
    expect(moves[0].detail).toBe("Signed a 2 year $11.222 million contract with Charlotte (CHA) via Bi-Annual Exception");
    const cha = read("feed-team-state.json").teams.CHA;
    expect(cha.consumedBae).toBe(5_477_000);
    expect(cha.inWorldHardCap).toBe("first_apron");
    expect(cha.hardCapSource).toBe("Nicolas Batum BAE");
    expect(cha.rationale).toContain("integration test");
    // The file kept its Python-era escapes and its trailing newline.
    expect(raw("feed-team-state.json")).toMatch(/\\u2014/);
    expect(raw("feed-team-state.json").endsWith("\n")).toBe(true);
  });

  it("a trade with a pick writes the rows and moves the pick in the rights ledger", async () => {
    const r = await actions.fileTrade({
      date: "2026-09-03",
      players: [
        { playerId: "x", name: "Test Forward", pos: "F", from: "BOS", to: "CHA" },
        { playerId: "y", name: "Test Guard", pos: "G", from: "CHA", to: "BOS" },
      ],
      picks: [{ id: "CHA|2031|1", from: "CHA", to: "BOS", protection: "top-8 protected" }],
      cash: [{ from: "BOS", to: "CHA", amount: 2_000_000 }],
      why: "integration test",
    });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    if (!r.ok) return;
    expect(r.value.picksMoved).toBe(1);
    const moves = read("manual-moves.json").transactions;
    expect(moves.slice(0, 2).map((m: { player: string }) => m.player)).toEqual(["Test Forward", "Test Guard"]);
    expect(moves[0].detail).toContain("as part of a 2-team trade:");
    expect(moves[0].detail).toContain("Charlotte (CHA) traded Test Guard and a 2031 1st round pick [top-8 protected] to Boston (BOS)");
    expect(moves[0].detail).toContain("cash ($2,000,000)");
    const pr = read("pick-rights-2026.json").byTeam;
    expect(pr.CHA.ownFirstObligations.find((o: { year: number }) => o.year === 2031)).toMatchObject({ status: "protected", to: "BOS", protection: "top-8 protected" });
    expect(pr.BOS.holdings.find((h: { origin: string; year: number }) => h.origin === "CHA" && h.year === 2031)).toMatchObject({ kind: "outright", round: 1 });
  });

  it("a pick the sender cannot move stops the filing before any row lands", async () => {
    const before = read("manual-moves.json").transactions.length;
    const r = await actions.fileTrade({
      date: "2026-09-03",
      players: [{ playerId: "z", name: "Test Center", pos: "C", from: "LAC", to: "BOS" }],
      picks: [{ id: "LAC|2030|1", from: "LAC", to: "BOS" }], // forfeited to the league
      cash: [],
      why: "integration test",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/forfeited/);
    expect(read("manual-moves.json").transactions).toHaveLength(before);
  });

  it("a raw save that fails the schema writes nothing", async () => {
    const before = raw("retired-2026.json");
    const r = await actions.saveRawFile("retired", JSON.stringify({ players: [1, 2] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues?.some((i) => i.path.startsWith("$.players"))).toBe(true);
    expect(raw("retired-2026.json")).toBe(before);
    const ok = await actions.saveRawFile("retired", JSON.stringify({ note: "n", players: ["Someone Retired"] }));
    expect(ok.ok).toBe(true);
    expect(read("retired-2026.json").players).toEqual(["Someone Retired"]);
    expect(raw("retired-2026.json").endsWith("\n")).toBe(true);
  });

  it("a contract edit on the sheet keeps the file byte-compatible apart from the row", async () => {
    const sheet = read("contracts-2025-26.json");
    const i = sheet.contracts.findIndex((c: { playerName: string }) => c.playerName === "Jayson Tatum");
    const row = { ...sheet.contracts[i], tradeKickerPct: 0.15 };
    const r = await actions.saveContractRow({ id: "contracts", index: i }, row);
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const after = read("contracts-2025-26.json");
    expect(after.contracts[i].tradeKickerPct).toBe(0.15);
    expect(after.contracts.length).toBe(sheet.contracts.length);
    // The sheet never had a trailing newline; the writer did not add one.
    expect(raw("contracts-2025-26.json").endsWith("\n")).toBe(false);
    const bad = await actions.saveContractRow({ id: "contracts", index: i }, { ...row, teamId: "NOPE" });
    expect(bad.ok).toBe(false);
  });
});
