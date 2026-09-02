import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { repoRoot } from "./paths";

const run = promisify(execFile);

export interface CheckResult {
  name: string;
  ok: boolean;
  /** Tail of the tool's output — enough to read a failure. */
  output: string;
  ms: number;
}

/**
 * The guards that would fail in CI after a bad edit, runnable from the review
 * page. Data typecheck first (a malformed JSON import fails fastest), then the
 * integrity suites that pin the reconciled sheet: every contract on a real
 * team, no duplicate feed rows, the external Spotrac diff, the feed-derived
 * hard caps, the pick ledger, the news card.
 */
export const CHECKS: { name: string; cmd: string; args: string[] }[] = [
  { name: "Data package typecheck", cmd: "pnpm", args: ["--filter", "@apron/data", "typecheck"] },
  {
    name: "Data integrity + schema",
    cmd: "pnpm",
    args: ["--filter", "@apron/web", "exec", "vitest", "run", "lib/dataIntegrity.test.ts", "lib/dataSchema.test.ts", "lib/rosterIntegrity.test.ts"],
  },
  {
    name: "Feed state, external check, picks, news",
    cmd: "pnpm",
    args: ["--filter", "@apron/web", "exec", "vitest", "run", "lib/feedState.test.ts", "lib/externalCapCheck.test.ts", "lib/pickEncumbrances.test.ts", "lib/newsDay.test.ts"],
  },
];

export async function runCheck(check: (typeof CHECKS)[number]): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const { stdout, stderr } = await run(check.cmd, check.args, {
      cwd: repoRoot(),
      maxBuffer: 8_000_000,
      timeout: 240_000,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
    });
    return { name: check.name, ok: true, output: tail(stdout + stderr), ms: Date.now() - t0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      name: check.name,
      ok: false,
      output: tail((e.stdout ?? "") + (e.stderr ?? "") + (e.message ? `\n${e.message}` : "")),
      ms: Date.now() - t0,
    };
  }
}

const tail = (s: string, lines = 60) => s.split("\n").filter((l) => l.trim()).slice(-lines).join("\n");
