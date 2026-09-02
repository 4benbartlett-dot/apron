import { readFile, writeFile, rename, stat, unlink } from "node:fs/promises";
import { DATA_SCHEMAS, validateDataFile, type Issue, type SchemaId } from "@apron/data";
import { dataPath, dataRel } from "./paths";

/**
 * The data files the admin knows about, with who owns each. A curated file is
 * the admin's to edit; a scraped file is rewritten wholesale by its script and
 * is shown read-only, because a hand edit there lasts exactly until the next
 * pull (feed-corrections.json exists for precisely that reason).
 */
export interface DataFileMeta {
  id: SchemaId;
  file: string;
  title: string;
  description: string;
  owner: "curated" | "scraped" | "sheet";
  /** How to refresh a scraped file. */
  refresh?: string;
}

export const DATA_FILES: DataFileMeta[] = [
  {
    id: "contracts",
    file: "contracts-2025-26.json",
    title: "Contract sheet",
    description:
      "The base sheet: every contract with its multi-year salaries, scraped from Basketball-Reference. The 2026-27 rosters are derived from this plus the feeds.",
    owner: "sheet",
    refresh: "node packages/data/scripts/scrape-bref.mjs",
  },
  {
    id: "rookies",
    file: "rookies-2026.json",
    title: "2026 draft class",
    description: "Rookie-scale rows for the 2026 draft; a first-rounder is booked on sight, a second-rounder only once he signs.",
    owner: "sheet",
  },
  {
    id: "extraContracts",
    file: "extra-contracts.json",
    title: "Sheet stubs",
    description: "Curated stubs for players who signed real deals but have no row on the scraped sheet.",
    owner: "curated",
  },
  {
    id: "manualMoves",
    file: "manual-moves.json",
    title: "Curated moves",
    description: "Feed-shaped rows for moves the scrape does not carry, including everything filed from the desk.",
    owner: "curated",
  },
  {
    id: "feedCorrections",
    file: "feed-corrections.json",
    title: "Feed corrections",
    description: "Rows Spotrac published wrong, re-applied on every pull.",
    owner: "curated",
  },
  {
    id: "feedTeamState",
    file: "feed-team-state.json",
    title: "Team offseason state",
    description: "How each team's real July happened: exceptions consumed, hard caps triggered, room used, forced renounces.",
    owner: "curated",
  },
  {
    id: "rosterCorrections",
    file: "roster-corrections-2026.json",
    title: "Roster corrections",
    description: "Audited fixes: suppressed dead money, resolved offer sheets, pending signings.",
    owner: "curated",
  },
  {
    id: "pickRights",
    file: "pick-rights-2026.json",
    title: "Pick rights",
    description: "Structured owes, swaps and protections per team, which the board's pick chips are built from.",
    owner: "curated",
  },
  {
    id: "leagueRulings",
    file: "league-rulings.json",
    title: "League rulings",
    description: "Fines, suspensions and forfeited picks, the discipline the feeds never carry.",
    owner: "curated",
  },
  {
    id: "faOverrides",
    file: "fa-overrides.json",
    title: "Free-agent overrides",
    description: "Bird-status corrections to the scraped free-agent list, keyed by normalized name.",
    owner: "curated",
  },
  {
    id: "retired",
    file: "retired-2026.json",
    title: "Retirements",
    description: "Players who left the league: no roster spot, no cap hold.",
    owner: "curated",
  },
  { id: "meta", file: "meta.json", title: "Snapshot date", description: "The rosters-as-of stamp the footer prints.", owner: "curated" },
  {
    id: "transactions",
    file: "transactions.json",
    title: "Transaction feed",
    description: "Spotrac's feed, merged pull over pull. Not hand-edited: a wrong row goes in feed-corrections.json.",
    owner: "scraped",
    refresh: "node packages/data/scripts/scrape-transactions.mjs",
  },
];

export const fileMeta = (id: SchemaId): DataFileMeta => DATA_FILES.find((f) => f.id === id)!;

export interface RawFile {
  file: string;
  text: string;
  json: unknown;
  bytes: number;
  mtime: string;
}

export async function readRaw(file: string): Promise<RawFile> {
  const p = dataPath(file);
  const [text, s] = await Promise.all([readFile(p, "utf8"), stat(p)]);
  return { file, text, json: JSON.parse(text), bytes: s.size, mtime: s.mtime.toISOString() };
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(dataPath(file), "utf8")) as T;
}

/** The valid team codes, from the sheet's own team list. */
export async function teamSet(): Promise<Set<string>> {
  const sheet = await readJson<{ teams: { id: string }[] }>("contracts-2025-26.json");
  return new Set(sheet.teams.map((t) => t.id));
}

/**
 * Serialize the way the file was already written, so a one-field edit is a
 * one-line diff: two-space indent, a trailing newline if there was one, and
 * non-ASCII escaped if the file already escaped it (feed-team-state.json and
 * pick-rights-2026.json came out of Python with \uXXXX escapes).
 */
export function formatJson(value: unknown, original?: string): string {
  let out = JSON.stringify(value, null, 2);
  if (original && /\\u[0-9a-fA-F]{4}/.test(original))
    out = out.replace(/[\u0080-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (original === undefined || original.endsWith("\n")) out += "\n";
  return out;
}

export interface WriteResult {
  file: string;
  issues: Issue[];
  written: boolean;
  bytes: number;
}

/**
 * Validate against the file's schema, then write atomically (temp file +
 * rename, so a crash mid-write cannot leave half a JSON file for the whole
 * site to import). Refuses to write on any schema issue unless forced.
 */
export async function writeJson(id: SchemaId, value: unknown, opts: { force?: boolean } = {}): Promise<WriteResult> {
  const file = DATA_SCHEMAS[id].file;
  const issues = validateDataFile(id, value, { teams: await teamSet() });
  if (issues.length && !opts.force) return { file, issues, written: false, bytes: 0 };
  const p = dataPath(file);
  let original: string | undefined;
  try {
    original = await readFile(p, "utf8");
  } catch {
    original = undefined;
  }
  const text = formatJson(value, original);
  const tmp = `${p}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, text, "utf8");
    await rename(tmp, p);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return { file, issues, written: true, bytes: Buffer.byteLength(text) };
}

export interface FileValidation {
  id: SchemaId;
  file: string;
  title: string;
  issues: Issue[];
}

/** Validate every known file as it sits on disk. */
export async function validateAll(): Promise<FileValidation[]> {
  const teams = await teamSet();
  const out: FileValidation[] = [];
  for (const meta of DATA_FILES) {
    let issues: Issue[];
    try {
      const raw = await readRaw(meta.file);
      issues = validateDataFile(meta.id, raw.json, { teams });
    } catch (err) {
      issues = [{ path: "$", message: `could not read: ${(err as Error).message}` }];
    }
    out.push({ id: meta.id, file: meta.file, title: meta.title, issues });
  }
  return out;
}

export { dataRel };
