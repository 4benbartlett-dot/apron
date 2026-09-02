import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The pnpm workspace root — found by walking up from the process cwd (which
 * is apps/web under `pnpm --filter @apron/web dev`) to pnpm-workspace.yaml. */
export function repoRoot(): string {
  let dir = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`pnpm-workspace.yaml not found above ${process.cwd()}`);
}

/** packages/data/src — the flat files every page on the site is built from.
 * APRON_DATA_DIR points the writers somewhere else (the integration tests
 * run the actions against a scratch copy, never the real tree). */
export function dataDir(): string {
  return process.env.APRON_DATA_DIR || join(repoRoot(), "packages", "data", "src");
}

/** A data file's path, refusing anything that would escape the directory. */
export function dataPath(file: string): string {
  if (!/^[A-Za-z0-9._-]+\.json$/.test(file)) throw new Error(`not a data file name: ${file}`);
  return join(dataDir(), file);
}

/** Repo-relative path for display and for git. */
export const dataRel = (file: string) => `packages/data/src/${file}`;
