# Over the Apron

The NBA offseason, under the real CBA. Live at [overtheapron.com](https://overtheapron.com).

Over the Apron is a trade machine and free-agency simulator built around the
2023 collective bargaining agreement. You build trades, sign free agents, run
extensions and renouncements, and work a whole offseason from current rosters.
Moves carry into the next one, and when a move is blocked the app explains the
rule and cites the relevant CBA provision when one applies.

Salary matching is the easy part, and most trade machines stop there. The rules
that actually decide deals in the apron era are the ones this tries to get right:

- **The apron system.** First- and second-apron tiers, 100% matching once a team
  is over, first-apron restrictions (no sign-and-trade acquisitions, no expanded
  matching, no row-D regular-season waiver signings, no pre-existing TPE use),
  and second-apron restrictions (no aggregating salaries, no cash, no MLE, frozen
  first seven drafts out). Hard caps stick: use the non-taxpayer mid-level and
  later moves that season are measured against the first apron; row-H
  aggregation and row-I cash can freeze the second apron.
- **Trade matching.** The CBA's expanded formula, including below-cap room
  absorption, trade kickers, base-year compensation, and the trade-freeze
  calendar (recent signings can't move until December 15, and so on).
- **Free agency.** Bird, Early-Bird, and Non-Bird ceilings with each player's
  real rights, cap holds by type, renouncing, the mid-level and bi-annual
  exceptions, max-salary tiers, and restricted free agency with a working
  offer-sheet match.
- **Sign-and-trades, both sides.** The Art. VII §8(e)(1) structure checks
  (Veteran FA, prior roster, 3-to-4 seasons, no NT-MLE/Room-MLE, protected first
  year, pre-regular-season timing, 5th-year max cap), the first-apron hard cap,
  the old team's matching on the return, and the new team's room-or-match
  requirement.
- **Draft picks as assets.** A pick-ownership ledger that transfers picks when a
  trade executes, and a Stepien-rule check that counts picks you dealt several
  moves ago, not just the ones in front of you.
- **A trade finder.** Name a target and it searches the other roster for packages
  that clear the modeled rules.

## Accuracy

The rules engine keeps the CBA math separate from the interface: thresholds,
matching bands, exceptions, hard caps, trade restrictions, and pick rules all
live in the shared TypeScript package. App data supplies the roster and
transaction context, and the product publishes its known approximations instead
of hiding them.

What's approximated or not yet modeled is written up in the app at
[`/accuracy`](apps/web/app/accuracy/page.tsx).

## Stack

A pnpm + TypeScript monorepo:

```
packages/cba-engine   The rules engine: validateTrade, validateSigning,
                      sign-and-trades, extensions, provisions. No I/O, no deps.
packages/data         League data (contracts, transactions, free-agent rights,
                      draft picks, player ratings) and the scripts that refresh it.
apps/web              The Next.js app: the offseason board, the drawers, the
                      trade finder, the league cap board, shareable sessions.
```

The engine has no I/O, so it runs the same in the browser and on the server.
Team salary, apron tier, and cap room are always derived from the contracts
rather than stored, which keeps a session deterministic and replayable. The
dollar thresholds for a season live in one file, so the yearly update is a
constants swap and a test run.

```ts
import { validateTrade, SEASON_2026_27 } from "@apron/cba-engine";

const verdict = validateTrade(leagueData, trade, SEASON_2026_27);
if (!verdict.legal) {
  for (const v of verdict.violations) console.log(v.reason, "—", v.citation);
}
```

## Develop

```bash
pnpm install
pnpm --filter @apron/web dev          # http://localhost:3000
pnpm -r test                          # engine + app suites
pnpm --filter @apron/web typecheck
```

To refresh the data, the scripts in `packages/data/scripts/` rebuild the JSON
snapshots from public sources (some need `FIRECRAWL_API_KEY` set for a rendering
proxy), then you commit the updated JSON.

## Deploy

See [DEPLOY.md](DEPLOY.md). It's a standard Next.js app; on Vercel, set the
project root to `apps/web`.

## Status

An active personal project, built during the 2026 offseason. Player names and
salaries are compiled from public sources. Not affiliated with or endorsed by
the NBA or the NBPA.
