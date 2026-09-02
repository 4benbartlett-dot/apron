import { notFound } from "next/navigation";

/**
 * The admin is an INTERNAL surface: it writes to the repository's data files
 * and shells out to git, which only means anything on a checkout with a
 * working tree. It is on by default in development and off in production
 * unless APRON_ADMIN=1 is set — a deployed site has a read-only filesystem and
 * no git, so there is nothing for it to do there anyway.
 */
export function adminEnabled(): boolean {
  if (process.env.APRON_ADMIN === "1") return true;
  if (process.env.APRON_ADMIN === "0") return false;
  return process.env.NODE_ENV !== "production";
}

/** Route guard: the whole /admin tree 404s when the admin is off. */
export function requireAdmin(): void {
  if (!adminEnabled()) notFound();
}

/** Action guard: a server action can be posted to directly, so it checks too. */
export function assertAdmin(): void {
  if (!adminEnabled()) throw new Error("The admin is disabled on this deployment.");
}
