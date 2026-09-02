import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { repoRoot, dataRel } from "./paths";

const run = promisify(execFile);

async function git(args: string[], maxBuffer = 4_000_000): Promise<string> {
  const { stdout } = await run("git", args, { cwd: repoRoot(), maxBuffer });
  return stdout;
}

export interface DirtyFile {
  /** Repo-relative path. */
  path: string;
  /** Porcelain status code, e.g. " M", "??", "A ". */
  status: string;
  insertions?: number;
  deletions?: number;
}

/** Uncommitted changes under packages/data/src, with line counts where git has them. */
export async function dataStatus(): Promise<DirtyFile[]> {
  const porcelain = await git(["status", "--porcelain", "--", "packages/data/src"]);
  const files = porcelain
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2), path: line.slice(3).trim() }))
    // Data only: a TypeScript change under packages/data/src is code, and
    // code is committed by whoever wrote it, with the tests that go with it.
    .filter((f) => f.path.endsWith(".json"));
  if (!files.length) return [];
  const numstat = await git(["diff", "--numstat", "--", "packages/data/src"]);
  const counts = new Map<string, { insertions: number; deletions: number }>();
  for (const line of numstat.split("\n")) {
    const [ins, del, path] = line.split("\t");
    if (path) counts.set(path, { insertions: Number(ins) || 0, deletions: Number(del) || 0 });
  }
  return files.map((f) => ({ ...f, ...(counts.get(f.path) ?? {}) }));
}

/** The unified diff for one data file (untracked files diff against nothing). */
export async function dataDiff(file: string): Promise<string> {
  const rel = dataRel(file);
  const tracked = (await git(["ls-files", "--", rel])).trim().length > 0;
  if (!tracked) return `(new file — ${rel} is not yet tracked by git)`;
  const out = await git(["diff", "--", rel]);
  return out || "(no uncommitted changes)";
}

export interface CommitInfo {
  hash: string;
  subject: string;
  date: string;
}

export async function lastCommit(): Promise<CommitInfo> {
  const out = await git(["log", "-1", "--format=%h%x1f%s%x1f%ci"]);
  const [hash = "", subject = "", date = ""] = out.trim().split("\x1f");
  return { hash, subject, date };
}

export async function currentBranch(): Promise<string> {
  return (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}

/**
 * Stage the given data files and commit them. Only files under
 * packages/data/src are ever staged — the admin edits data, not code, and a
 * commit from here must never sweep up unrelated work in the tree.
 */
export async function commitData(message: string, files: string[]): Promise<CommitInfo> {
  const rels = files.map(dataRel);
  if (!rels.length) throw new Error("Nothing selected to commit.");
  if (!message.trim()) throw new Error("A commit needs a message.");
  await git(["add", "--", ...rels]);
  await git(["commit", "-q", "-m", message.trim(), "--", ...rels]);
  return lastCommit();
}
