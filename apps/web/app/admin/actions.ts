"use server";

import { revalidatePath } from "next/cache";
import type { Transaction, TeamPickRights, FeedTeamState, Issue, SchemaId } from "@apron/data";
import type { ContractYear } from "@apron/cba-engine";
import { assertAdmin } from "@/lib/admin/gate";
import { readJson, readRaw, writeJson, type WriteResult } from "@/lib/admin/files";
import { commitData, dataDiff, dataStatus, type CommitInfo, type DirtyFile } from "@/lib/admin/git";
import { CHECKS, runCheck, type CheckResult } from "@/lib/admin/checks";
import { applyPickTransfer, parsePickId } from "@/lib/admin/picks";
import {
  tradeRows,
  signingRow,
  waiveRow,
  optionRow,
  statedSalaryRow,
  extensionRow,
  feedDate,
  MECHANISM_TEXT,
  type TradeFiling,
  type SigningFiling,
  type WaiveFiling,
  type OptionFiling,
  type StatedSalaryFiling,
  type ExtensionFiling,
} from "@/lib/admin/prose";
import { teamMeta, teamNickname } from "@/lib/league";

/* ---------------------------------------------------------------------------
 * Every mutation the admin can make, as a server action. Each one validates
 * against the file's schema before it writes, writes atomically, and then
 * tells Next the admin tree (and the public pages, which read the same files)
 * are stale. The dev server recompiles the changed JSON module on the next
 * request, so derived numbers follow a beat behind the raw file.
 * ------------------------------------------------------------------------- */

export type ActionResult<T = null> =
  | { ok: true; value: T; message: string }
  | { ok: false; error: string; issues?: Issue[] };

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

const fail = (error: string, issues?: Issue[]): ActionResult<never> => ({ ok: false, error, issues });

function afterWrite(r: WriteResult, message: string): ActionResult<WriteResult> {
  if (!r.written) return fail(`${r.file} failed validation — nothing written.`, r.issues);
  refresh();
  return { ok: true, value: r, message };
}

/** The feed prints the city then the code: "Minnesota (MIN)". */
const city = (code: string) => {
  const name = teamMeta(code).name;
  const nick = teamNickname(code);
  return name.endsWith(nick) ? name.slice(0, -nick.length).trim() || name : name;
};

const wrap = async <T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
  try {
    assertAdmin();
    return await fn();
  } catch (err) {
    return fail((err as Error).message);
  }
};

/* ------------------------------- raw files -------------------------------- */

export async function saveRawFile(id: SchemaId, text: string, force = false): Promise<ActionResult<WriteResult>> {
  return wrap(async () => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      return fail(`Not valid JSON: ${(err as Error).message}`);
    }
    return afterWrite(await writeJson(id, json, { force }), `Saved ${id}.`);
  });
}

export async function readRawFile(file: string): Promise<ActionResult<{ text: string; mtime: string }>> {
  return wrap(async () => {
    const raw = await readRaw(file);
    return { ok: true, value: { text: raw.text, mtime: raw.mtime }, message: "" };
  });
}

/* ------------------------------- contracts -------------------------------- */

type ContractSource = { id: "contracts" | "extraContracts" | "rookies"; index: number };

export async function saveContractRow(source: ContractSource, row: Record<string, unknown>): Promise<ActionResult<WriteResult>> {
  return wrap(async () => {
    if (source.id === "contracts") {
      const sheet = await readJson<{ contracts: Record<string, unknown>[] }>("contracts-2025-26.json");
      const cur = sheet.contracts[source.index];
      if (!cur || cur.playerId !== row.playerId) return fail("The row moved under you — reload and try again.");
      sheet.contracts[source.index] = row;
      return afterWrite(await writeJson("contracts", sheet), `Saved ${row.playerName} on the contract sheet.`);
    }
    if (source.id === "extraContracts") {
      const f = await readJson<{ players: Record<string, unknown>[] }>("extra-contracts.json");
      const cur = f.players[source.index];
      if (!cur || cur.playerId !== row.playerId) return fail("The stub moved under you — reload and try again.");
      f.players[source.index] = row;
      return afterWrite(await writeJson("extraContracts", f), `Saved ${row.playerName}'s stub.`);
    }
    const rookies = await readJson<Record<string, unknown>[]>("rookies-2026.json");
    const cur = rookies[source.index];
    if (!cur || cur.playerId !== row.playerId) return fail("The row moved under you — reload and try again.");
    rookies[source.index] = row;
    return afterWrite(await writeJson("rookies", rookies), `Saved ${row.playerName}'s rookie row.`);
  });
}

export async function addContractStub(row: Record<string, unknown>): Promise<ActionResult<WriteResult>> {
  return wrap(async () => {
    const f = await readJson<{ players: Record<string, unknown>[] }>("extra-contracts.json");
    if (f.players.some((p) => p.playerId === row.playerId)) return fail(`A stub for ${row.playerId} already exists.`);
    f.players.push(row);
    return afterWrite(await writeJson("extraContracts", f), `Added a sheet stub for ${row.playerName}.`);
  });
}

/* ----------------------------- curated moves ------------------------------ */

async function appendMoves(rows: Transaction[]): Promise<WriteResult> {
  const f = await readJson<{ note?: string; transactions: Transaction[] }>("manual-moves.json");
  // Newest first, like the feed.
  f.transactions = [...rows, ...f.transactions];
  return writeJson("manualMoves", f);
}

export async function appendManualMoves(rows: Transaction[]): Promise<ActionResult<WriteResult>> {
  return wrap(async () => afterWrite(await appendMoves(rows), `Filed ${rows.length} row${rows.length === 1 ? "" : "s"}.`));
}

export async function updateManualMove(index: number, row: Transaction): Promise<ActionResult<WriteResult>> {
  return wrap(async () => {
    const f = await readJson<{ transactions: Transaction[] }>("manual-moves.json");
    if (!f.transactions[index]) return fail("No such row.");
    f.transactions[index] = row;
    return afterWrite(await writeJson("manualMoves", f), `Updated the ${row.player} row.`);
  });
}

export async function deleteManualMove(index: number): Promise<ActionResult<WriteResult>> {
  return wrap(async () => {
    const f = await readJson<{ transactions: Transaction[] }>("manual-moves.json");
    const [gone] = f.transactions.splice(index, 1);
    if (!gone) return fail("No such row.");
    return afterWrite(await writeJson("manualMoves", f), `Removed the ${gone.player} row.`);
  });
}

export async function addFeedCorrection(row: { date: string; player: string; type: string; detail: string; why: string }): Promise<ActionResult<WriteResult>> {
  return wrap(async () => {
    const f = await readJson<{ corrections: unknown[] }>("feed-corrections.json");
    f.corrections.push(row);
    return afterWrite(await writeJson("feedCorrections", f), `Added a correction for ${row.player}. It applies on the next scrape; the feed row itself is untouched until then.`);
  });
}

/* --------------------------------- desk ----------------------------------- */

export interface FiledTrade extends TradeFiling {
  /** Protection text per pick id, when the sender protects a pick. */
  pickNotes?: Record<string, string>;
}

export async function fileTrade(f: FiledTrade): Promise<ActionResult<{ rows: Transaction[]; picksMoved: number }>> {
  return wrap(async () => {
    const rows = tradeRows(f, city);
    if (!rows.length && !f.picks.length) return fail("Nothing moves in this trade.");
    // Picks first: a transfer the ledger refuses (a first already owed, or one
    // the sender does not hold) should stop the filing before any row lands.
    let picksMoved = 0;
    if (f.picks.length) {
      const pr = await readJson<{ source: string; byTeam: Record<string, TeamPickRights> }>("pick-rights-2026.json");
      let byTeam = pr.byTeam;
      const when = feedDate(f.date);
      for (const p of f.picks) {
        const { origin, year, round } = parsePickId(p.id);
        byTeam = applyPickTransfer(byTeam, {
          id: p.id,
          from: p.from,
          to: p.to,
          protection: p.protection,
          note: `${origin === p.from ? "Own" : `${origin}'s`} ${year} ${round === 1 ? "first" : "second"}${p.protection ? ` (${p.protection})` : ""} to ${p.to}, filed from the desk ${when}. ${f.why}`.trim(),
          source: `${city(p.from)}-${city(p.to)}, ${when} (desk)`,
        });
        picksMoved++;
      }
      const w = await writeJson("pickRights", { ...pr, byTeam });
      if (!w.written) return fail("pick-rights-2026.json failed validation — nothing written.", w.issues);
    }
    if (rows.length) {
      const w = await appendMoves(rows);
      if (!w.written) return fail("manual-moves.json failed validation — the pick ledger was already updated; fix and re-file the rows.", w.issues);
    }
    refresh();
    return {
      ok: true,
      value: { rows, picksMoved },
      message: `Filed: ${rows.length} player row${rows.length === 1 ? "" : "s"}${picksMoved ? `, ${picksMoved} pick${picksMoved === 1 ? "" : "s"} moved in the ledger` : ""}.`,
    };
  });
}

export interface FiledSigning extends SigningFiling {
  /** Record exception use and any hard cap it triggers in feed-team-state. */
  consume?: { mechanism: "ntmle" | "tpmle" | "bae" | "room_mle"; amount: number };
}

export async function fileSigning(f: FiledSigning): Promise<ActionResult<{ row: Transaction }>> {
  return wrap(async () => {
    const row = signingRow(f, city);
    if (f.consume) {
      const fs = await readJson<{ asOf: string; note?: string; teams: Record<string, FeedTeamState> }>("feed-team-state.json");
      const s = (fs.teams[f.team] ??= {});
      const key = ({ ntmle: "consumedNtmle", tpmle: "consumedTpmle", bae: "consumedBae", room_mle: "roomMleUsed" } as const)[f.consume.mechanism];
      s[key] = (s[key] ?? 0) + Math.round(f.consume.amount);
      const line = f.consume.mechanism === "tpmle" ? "second_apron" : f.consume.mechanism === "room_mle" ? undefined : "first_apron";
      if (line && s.inWorldHardCap !== "first_apron") {
        s.inWorldHardCap = line;
        s.hardCapSource = `${f.player.name} ${f.consume.mechanism === "ntmle" ? "NT-MLE" : f.consume.mechanism === "tpmle" ? "Taxpayer MLE" : "BAE"}`;
      }
      const when = feedDate(f.date);
      s.rationale = `${s.rationale ? `${s.rationale} ` : ""}${when} (desk): ${f.player.name} ${f.years}y/$${(f.total / 1e6).toFixed(2)}M via ${MECHANISM_TEXT[f.consume.mechanism]} — ${f.why}`;
      if (fs.asOf < f.date) fs.asOf = f.date;
      const w = await writeJson("feedTeamState", fs);
      if (!w.written) return fail("feed-team-state.json failed validation — nothing written.", w.issues);
    }
    const w = await appendMoves([row]);
    if (!w.written) return fail("manual-moves.json failed validation.", w.issues);
    refresh();
    return { ok: true, value: { row }, message: `Filed ${f.player.name} to ${f.team}${f.consume ? " and booked the exception" : ""}.` };
  });
}

export async function fileWaive(f: WaiveFiling): Promise<ActionResult<{ row: Transaction }>> {
  return wrap(async () => {
    const row = waiveRow(f, city);
    const w = await appendMoves([row]);
    if (!w.written) return fail("manual-moves.json failed validation.", w.issues);
    refresh();
    return { ok: true, value: { row }, message: `Filed the ${f.player.name} waive${f.stretch ? " with the stretch" : ""}.` };
  });
}

export async function fileOption(f: OptionFiling): Promise<ActionResult<{ row: Transaction }>> {
  return wrap(async () => {
    const row = optionRow(f, city);
    const w = await appendMoves([row]);
    if (!w.written) return fail("manual-moves.json failed validation.", w.issues);
    refresh();
    return { ok: true, value: { row }, message: `Filed the ${f.player.name} option decision.` };
  });
}

export async function fileStatedSalary(f: StatedSalaryFiling): Promise<ActionResult<{ row: Transaction }>> {
  return wrap(async () => {
    const row = statedSalaryRow(f, city);
    const w = await appendMoves([row]);
    if (!w.written) return fail("manual-moves.json failed validation.", w.issues);
    refresh();
    return { ok: true, value: { row }, message: `Stated ${f.player.name}'s 2026-27 cap hit at $${f.salary.toLocaleString("en-US")}.` };
  });
}

export interface FiledExtension extends ExtensionFiling {
  source: ContractSource;
  playerId: string;
  newYears: ContractYear[];
}

/** An extension adds seasons to the contract row itself (the feed pipeline
 * never books extension years); the ledger row is the record of it. */
export async function fileExtension(f: FiledExtension): Promise<ActionResult<{ row: Transaction }>> {
  return wrap(async () => {
    const file = f.source.id === "contracts" ? "contracts-2025-26.json" : f.source.id === "extraContracts" ? "extra-contracts.json" : "rookies-2026.json";
    const json = await readJson<unknown>(file);
    const rows: Record<string, unknown>[] =
      f.source.id === "contracts" ? (json as { contracts: Record<string, unknown>[] }).contracts
      : f.source.id === "extraContracts" ? (json as { players: Record<string, unknown>[] }).players
      : (json as Record<string, unknown>[]);
    const cur = rows[f.source.index];
    if (!cur || cur.playerId !== f.playerId) return fail("The contract row moved under you — reload and try again.");
    const years = cur.years as ContractYear[];
    const have = new Set(years.map((y) => y.leagueYear));
    for (const y of f.newYears) if (have.has(y.leagueYear)) return fail(`${y.leagueYear} is already on the contract.`);
    cur.years = [...years, ...f.newYears].sort((a, b) => a.leagueYear.localeCompare(b.leagueYear));
    const w = await writeJson(f.source.id, json);
    if (!w.written) return fail(`${file} failed validation.`, w.issues);
    const row = extensionRow(f, city);
    const w2 = await appendMoves([row]);
    if (!w2.written) return fail("The years were written, but manual-moves.json failed validation.", w2.issues);
    refresh();
    return { ok: true, value: { row }, message: `Extended ${f.player.name} by ${f.newYears.length} season${f.newYears.length === 1 ? "" : "s"}.` };
  });
}

/* ------------------------------ team state -------------------------------- */

export async function saveFeedTeamState(team: string, state: FeedTeamState): Promise<ActionResult<WriteResult>> {
  return wrap(async () => {
    const fs = await readJson<{ asOf: string; note?: string; teams: Record<string, FeedTeamState> }>("feed-team-state.json");
    fs.teams[team] = state;
    return afterWrite(await writeJson("feedTeamState", fs), `Saved ${team}'s offseason state.`);
  });
}

/* --------------------------------- git ------------------------------------ */

export async function gitStatus(): Promise<ActionResult<DirtyFile[]>> {
  return wrap(async () => ({ ok: true, value: await dataStatus(), message: "" }));
}

export async function gitDiff(file: string): Promise<ActionResult<string>> {
  return wrap(async () => ({ ok: true, value: await dataDiff(file), message: "" }));
}

export async function runChecks(): Promise<ActionResult<CheckResult[]>> {
  return wrap(async () => {
    const out: CheckResult[] = [];
    for (const c of CHECKS) out.push(await runCheck(c));
    return { ok: true, value: out, message: out.every((r) => r.ok) ? "Every check passed." : "A check failed — read it before committing." };
  });
}

export async function commitFiles(message: string, files: string[]): Promise<ActionResult<CommitInfo>> {
  return wrap(async () => {
    const info = await commitData(message, files);
    refresh();
    return { ok: true, value: info, message: `Committed ${info.hash}: ${info.subject}` };
  });
}
