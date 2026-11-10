# Over the Apron: working notes for agents and contributors

An NBA trade and signing checker built on the 2023 collective bargaining
agreement. Live at overtheapron.com. `README.md` says what it does; this file
says how to change it without breaking it.

## Layout and commands

```
packages/cba-engine   The rules. Pure TypeScript, no I/O, no dependencies.
packages/data         League data as JSON, and the scripts that refresh it.
apps/web              The Next.js app (app router). lib/league.ts is the root
                      of the data graph: feed rows in, BASE_CONTRACTS out.
```

```bash
pnpm -r test                                # engine + app suites; must pass before any commit
pnpm -r typecheck
pnpm --filter @apron/web dev                # http://localhost:3000 (the preview config uses 3100)
pnpm --filter @apron/data refresh           # transactions, scores, stats, injuries, rebaseline, tests
pnpm --filter @apron/data refresh:full      # ...and the Spotrac outside check (~62 Firecrawl calls)
```

The scrapers read `FIRECRAWL_API_KEY` from the environment or `~/.env`.

## State machines

Each of these is one named type with its transitions in one place. If a change
needs a new state, add it to the type; do not add a boolean beside it.

| Machine | Type | Lives in | States | Saved anywhere? |
|---|---|---|---|---|
| League year | `LeaguePhase` | `packages/cba-engine/src/constants/calendar.ts` | offseason → camp → pre_dec15 → dec15_to_deadline → post_deadline → postseason | No. A function of the date. |
| Trade timing | `TradeTiming` | same file, `tradeTimingOn` | offseason, pre_dec15, dec15_to_deadline, post_deadline | No. Derived from a trade's `date`. |
| Session source | `SessionSource` | `apps/web/lib/store.ts` | unhydrated → own or shared; shared → forked; shared or forked → own | The moves are (`MOVES_KEY`, `MOVES_BACKUP_KEY`). |
| Board overlay | `Overlay` | `apps/web/components/OffseasonSim.tsx` | none, shortcuts, share, finder, recap, sign, extend, waive | No. |
| Trade day | `TradeDay` | `apps/web/lib/trade-share.ts` | today, deadline | In a share link (`d` in the `?t=` token). |
| A session move | `Move` (by `kind`) | `apps/web/lib/league.ts` | trade, sign, sign_trade, renounce, extend, waive | Yes: localStorage and `?gm=` links. |
| Home headline | `HomeSeason` | `apps/web/lib/phase.ts` | offseason, trade_season, stretch_run, draft | No. Derived from `LeaguePhase`. |

Rules that follow from them:

- **A league date is written once**, in `CALENDAR_2026_27`
  (`packages/cba-engine/src/constants/2026-27.ts`). Code asks `leaguePhaseOn`,
  `isRegularSeason`, `tradeTimingOn` or reads `CALENDAR.tradeDeadline`; it does
  not compare against a date literal. Next season is a new calendar object.
- **Anything a rule decides by date takes the date.** `validateTrade` reads the
  timing bucket off `trade.date`; pass the date, not just the bucket. An
  undated trade treats every dated freeze as permanent.
- **A freeze has a date.** `restriction` text with no `tradeableFrom` never
  lifts. Session moves stamp both (`freeAgentFreeze` and friends in
  `league.ts`), the same way `stampTradeEligibility` does for the feed.
- **One surface over the board.** Open one with `setOverlay({ kind })`; it
  replaces whatever was open.
- **Storage keys** are in `apps/web/lib/storageKeys.ts`. What is saved in
  people's browsers has to keep loading: adding an optional field to `Move` is
  fine (teach `moveGuard.ts` about it), renaming or removing one is not.
  Old `?t=` and `?gm=` links must keep decoding.

### Still implicit (known, left alone on purpose)

Found in the November 2026 audit and not yet made explicit. Each is a place to
be careful, and a candidate for the same treatment:

- **Which freeze a feed contract carries** is chosen by regular expressions over
  `restriction` text in `stampTradeEligibility`. The curated strings live in
  the data files; an enum would mean migrating them.
- **The verdict pipeline is rebuilt per surface**: board, share card, admin
  desk, news replay and trade finder each assemble `validateTrade` plus
  Stepien plus hard caps plus the exception auto-fit. The non-engine blocks
  travel as strings, and `tradeFix.ts` recovers their kind by matching prose.
- **Hard-cap level has two encodings**, a dollar line and a level, converted
  by equality with the apron constants; and the row-E trigger is derived
  three ways (engine, session replay, docket).
- **The move ledger is validated only when a move is made.** Removing an
  earlier move replays the later ones without re-judging them.
- **The admin desk's filing steps write two or three files in sequence** with
  no transaction; a failure between them leaves a partial filing.
- **Feed-derived player status** (option pending or declined, camp invite,
  two-way, 10-day, released, claimed) is a set of module-level maps built by
  parsing transaction prose in `league.ts`. Highest risk in the repo to touch;
  a dozen suites pin it.

## Data

- A fact enters through the feed (`transactions.json`), a correction file
  beside it (`feed-corrections.json`, `tpe-corrections.json`,
  `manual-moves.json`), or the structured pick ledger
  (`pick-rights-2026.json`). Every correction carries its evidence in a `why`.
- **Outside trackers are leads, not answers.** Adopt a figure when reporting
  or the agreement's arithmetic supports it; otherwise name the disagreement
  in the test that compares the two (`externalCapCheck.test.ts` keeps each one
  with a reason and a ceiling).
- Two pick files exist. `draft-picks.json` is RealGM's ledger as scraped;
  `pick-rights-2026.json` is the structured one the board reads. A re-pull
  rewrites only the first, and `pickLedgerAgreement.test.ts` fails when they
  disagree about who holds an outright pick. Fix the structured ledger, with
  the trade in `source`.
- Scripts stamp the local date (`scripts/today.mjs`), not the UTC one.
- Who finished a season over the second apron is a reported fact
  (`packages/data/src/second-apron.ts`, each with its source). The frozen
  first-round picks are derived from it and laid over the pick ledger.

## The rules index

`apps/web/lib/provisions.ts` lists each provision the board enforces: an
anchor, the citation, a plain-English line, and the agreement's own words. The
`/rules` page prints it, and a blocked verdict shows the entry for the rule
that blocked it (`provisionForCheck` maps an engine check to its entry). When
the engine gains a rule id, give it an entry, or `provisions.test.ts` fails.

- `text` is quoted word for word, "…" for words left out. Check it against
  `CBA.pdf` before it goes in; nothing inside the quotation marks is paraphrase.
- The trades shown beside a rule, on `/rules`, `/about` and the guide, are
  searched for in the current data (`apps/web/lib/examples.ts`), never written
  down: each must be blocked by that rule alone, in the words the board prints.
- `apps/web/lib/caseNotes.ts` holds the About page's "Where the fine print
  mattered" notes. Short, first person, plain; no account of what the code does.

## Writing

Site copy and commit messages are plain statements: what happened, what the
agreement says with the article and section, what changed. No hedging, no
marketing voice. A citation is checked against the text (`CBA.pdf` at the repo
root, not committed) before it goes on a page.

## Tests

Tests are named for the claim they keep true and usually open with the real
case that prompted them. Data-dated assertions are normal here; when a refresh
makes one false, update it with the reason (see the Blake Wesley note in
`tradeEligibility.test.ts`). Prefer an assertion computed from `SIM_DATE` or
the calendar over one that names today's date.
